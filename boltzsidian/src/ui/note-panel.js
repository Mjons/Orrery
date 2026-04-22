// Note panel with a read / edit toggle. Read mode renders markdown via
// marked; edit mode mounts a CodeMirror 6 view. Autosave fires 300ms after
// the last keystroke and on close.

import { marked } from "marked";
import { createEditor } from "../editor/editor.js";
import { computeSuggestions } from "./suggestions.js";

const H1_RE = /^#\s+(.+)$/m;
const AUTOSAVE_MS = 300;

export function createNotePanel({
  getVault,
  onClose,
  onNavigate,
  onSave,
  onDirtyChange,
  onTogglePin,
  onDelete, // async (note) => void — delete the note from disk + vault.
  // Caller is responsible for the native confirm() and for closing
  // the panel; we just call this when the user clicks the button.
}) {
  const panel = document.getElementById("note-panel");
  const titleEl = panel.querySelector(".panel-title");
  const bodyEl = panel.querySelector(".panel-body");
  const metaEl = panel.querySelector(".panel-meta");
  const closeBtn = panel.querySelector(".panel-close");
  const modeBtn = panel.querySelector(".panel-mode");
  const pinBtn = panel.querySelector(".panel-pin");
  const deleteBtn = panel.querySelector(".panel-delete");
  const statusEl = panel.querySelector(".panel-status");
  const resizeHandle = panel.querySelector(".panel-resize-handle");
  const suggestionsPanel = panel.querySelector(".panel-suggestions");

  let current = null;
  let mode = "read";
  let editor = null;
  let editorHost = null;
  let saveTimer = 0;
  let dirty = false;
  let lastSavedText = "";
  // Suggestion row — heuristic tag/link candidates rendered in the
  // panel's dedicated `.panel-suggestions` slot (sibling of panel-body,
  // not inside the editor), so it can't eat the editor's vertical
  // space. Dismissed set is per-note and resets when the panel closes.
  let suggestionsTimer = 0;
  let dismissedSuggestions = new Set();
  const SUGGESTIONS_DEBOUNCE_MS = 500;

  marked.use({ gfm: true, breaks: false });

  // ── Resize ────────────────────────────────────────────────
  // Drag the handle on the panel's left edge to widen/narrow it. The
  // resulting width is written to a CSS variable on #note-panel so the
  // layout follows immediately, and persisted in localStorage so the next
  // session opens at the same width.
  const RESIZE_KEY = "boltzsidian.panel_width.v1";
  const MIN_W = 320;
  const MAX_W = Math.max(MIN_W, Math.round(window.innerWidth * 0.92));

  function clampWidth(w) {
    const max = Math.max(MIN_W, Math.round(window.innerWidth * 0.92));
    return Math.max(MIN_W, Math.min(max, Math.round(w)));
  }
  function applyWidth(w) {
    panel.style.setProperty("--panel-width", `${clampWidth(w)}px`);
  }
  function loadWidth() {
    const raw = Number(localStorage.getItem(RESIZE_KEY));
    if (Number.isFinite(raw) && raw >= MIN_W) applyWidth(raw);
  }
  loadWidth();

  if (resizeHandle) {
    let dragging = false;
    let startX = 0;
    let startW = 480;
    resizeHandle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startW = panel.getBoundingClientRect().width;
      resizeHandle.setPointerCapture?.(e.pointerId);
      panel.classList.add("resizing");
      e.preventDefault();
      e.stopPropagation();
    });
    resizeHandle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // Panel is anchored to the right, so a drag to the left grows it.
      const dx = startX - e.clientX;
      applyWidth(startW + dx);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      resizeHandle.releasePointerCapture?.(e.pointerId);
      panel.classList.remove("resizing");
      const w = Math.round(panel.getBoundingClientRect().width);
      try {
        localStorage.setItem(RESIZE_KEY, String(w));
      } catch {
        // ignore quota errors
      }
    };
    resizeHandle.addEventListener("pointerup", endDrag);
    resizeHandle.addEventListener("pointercancel", endDrag);
    // Keyboard resize for accessibility — focus the handle and use arrow keys.
    resizeHandle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.shiftKey ? 40 : 16;
      const cur = panel.getBoundingClientRect().width;
      const next = e.key === "ArrowLeft" ? cur + step : cur - step;
      applyWidth(next);
      try {
        localStorage.setItem(
          RESIZE_KEY,
          String(Math.round(panel.getBoundingClientRect().width)),
        );
      } catch {}
    });
    // Double-click resets to default 480.
    resizeHandle.addEventListener("dblclick", () => {
      applyWidth(480);
      localStorage.removeItem(RESIZE_KEY);
    });
  }
  // Re-clamp on window resize so the panel never exceeds 92vw.
  window.addEventListener("resize", () => {
    const cur = Number(localStorage.getItem(RESIZE_KEY));
    if (Number.isFinite(cur) && cur >= MIN_W) applyWidth(cur);
  });

  closeBtn.addEventListener("click", () => close());
  modeBtn.addEventListener("click", () => toggleMode());
  if (pinBtn) {
    pinBtn.addEventListener("click", () => {
      if (!current || !onTogglePin) return;
      const next = !(current.frontmatter && current.frontmatter.pinned);
      onTogglePin(current, next);
      reflectPin(next);
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!current || !onDelete) return;
      // Native confirm — same irreversibility framing as Weed's
      // Delete. Notes don't have undo on FS Access removeEntry so
      // this is the only safety gate.
      const label = current.title || current.path || "this note";
      const ok = window.confirm(
        `Delete "${label}" permanently?\n\nThis removes the file from disk. No undo.`,
      );
      if (!ok) return;
      try {
        await onDelete(current);
      } catch (err) {
        console.error("[bz] note-panel delete failed", err);
      }
    });
  }

  function reflectPin(pinned) {
    panel.dataset.pinned = pinned ? "true" : "false";
    if (pinBtn) {
      pinBtn.textContent = pinned ? "●" : "◯";
      const label = pinned ? "Unpin note" : "Pin note";
      pinBtn.setAttribute("aria-label", label);
      pinBtn.title = label;
    }
  }

  bodyEl.addEventListener("click", (e) => {
    if (mode !== "read") return;
    const link = e.target.closest(".wikilink");
    if (link && link.dataset.target) {
      e.preventDefault();
      const target = resolveTarget(link.dataset.target);
      if (target && onNavigate) onNavigate(target.id);
    }
  });

  function resolveTarget(raw) {
    const vault = getVault();
    if (!vault) return null;
    // Phase 2: defer to vault.resolveTitle so prefer-same-root kicks
    // in when the title collides across roots. `current` is the
    // note the user is reading — its root wins the tie-break.
    if (vault.resolveTitle) {
      return vault.resolveTitle(raw, current);
    }
    // Fallback for pre-Phase-2 vaults (safety net).
    const lower = raw.trim().toLowerCase();
    if (vault.byId.has(raw)) return vault.byId.get(raw);
    const bucket = vault.byTitle?.get(lower);
    return bucket && bucket.length > 0 ? bucket[0] : null;
  }

  function renderBody(note) {
    const vault = getVault();
    const multiRoot = vault?.roots && vault.roots.length > 1;
    const preprocessed = note.body.replace(
      /\[\[([^\]\|\n]+?)(?:\|([^\]\n]+))?\]\]/g,
      (_, target, alias) => {
        const t = target.trim();
        const resolved = resolveTarget(t);
        const label = (alias || t).trim();
        const cls = resolved ? "wikilink" : "wikilink broken";
        const dataTarget = resolved ? resolved.id : t;
        // Cross-root marker — only meaningful in multi-root workspaces.
        // A bullet with the target's root id as a tooltip; surfaces the
        // fact that following this link will navigate across projects.
        let crossMarker = "";
        if (
          multiRoot &&
          resolved &&
          note.rootId &&
          resolved.rootId &&
          resolved.rootId !== note.rootId
        ) {
          const rootLabel = escapeAttr(resolved.rootId);
          crossMarker = `<sup class="wikilink-cross" title="links to ${rootLabel}">·${escapeHtml(resolved.rootId)}</sup>`;
        }
        return `<span class="${cls}" data-target="${escapeAttr(dataTarget)}">${escapeHtml(label)}</span>${crossMarker}`;
      },
    );
    return marked.parse(preprocessed);
  }

  function buildMeta(note) {
    const vault = getVault();
    const parts = [];
    if (note.tags.length) {
      parts.push(
        note.tags
          .map((t) => `<span class="tag">#${escapeHtml(t)}</span>`)
          .join(""),
      );
    }
    parts.push(`${note.words} words`);
    if (vault) {
      const backlinks = vault.backward.get(note.id)?.size || 0;
      const forwards = vault.forward.get(note.id)?.size || 0;
      parts.push(`${backlinks} in · ${forwards} out`);
    }
    return parts.join(" · ");
  }

  function paintTitle(note, title) {
    const vault = getVault();
    const multiRoot = vault?.roots && vault.roots.length > 1;
    if (multiRoot && note.rootId) {
      titleEl.innerHTML = `${escapeHtml(title)} <span class="panel-root-pill" title="root: ${escapeAttr(note.rootId)}">${escapeHtml(note.rootId)}</span>`;
    } else {
      titleEl.textContent = title;
    }
  }

  function refreshHeader(note) {
    paintTitle(note, note.title || "Untitled");
    metaEl.innerHTML = buildMeta(note);
    reflectPin(!!(note.frontmatter && note.frontmatter.pinned));
  }

  function open(note, { mode: openMode = "read" } = {}) {
    // If switching between notes while one was dirty, flush that one first.
    if (current && current !== note && dirty) flushSave();
    if (current && current !== note) destroyEditor();

    current = note;
    dirty = false;
    lastSavedText = note.rawText || "";
    refreshHeader(note);
    reflectPin(!!(note.frontmatter && note.frontmatter.pinned));
    setMode(openMode);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    setStatus("");
  }

  function close() {
    if (!current) return;
    if (dirty) flushSave();
    const closed = current;
    destroyEditor();
    current = null;
    mode = "read";
    bodyEl.innerHTML = "";
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    if (onClose) onClose(closed);
  }

  function destroyEditor() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    if (suggestionsTimer) {
      clearTimeout(suggestionsTimer);
      suggestionsTimer = 0;
    }
    if (editor) {
      editor.destroy();
      editor = null;
    }
    if (editorHost) {
      editorHost.remove();
      editorHost = null;
    }
    if (suggestionsPanel) suggestionsPanel.innerHTML = "";
    dismissedSuggestions = new Set();
  }

  // ── Suggestions row ──────────────────────────────────────
  function scheduleSuggestionsRefresh() {
    if (suggestionsTimer) clearTimeout(suggestionsTimer);
    suggestionsTimer = window.setTimeout(
      refreshSuggestions,
      SUGGESTIONS_DEBOUNCE_MS,
    );
  }

  function refreshSuggestions() {
    suggestionsTimer = 0;
    if (!suggestionsPanel || !editor || !current) return;
    const vault = getVault && getVault();
    if (!vault) {
      suggestionsPanel.innerHTML = "";
      return;
    }
    const text = editor.getValue();
    const body = extractBody(text);
    const { currentTags, currentLinks } = scanNoteUsage(text, vault);
    const { tags, links } = computeSuggestions({
      vault,
      note: current,
      body,
      currentTags,
      currentLinks,
      dismissed: dismissedSuggestions,
    });
    renderSuggestionChips({ tags, links });
  }

  function renderSuggestionChips({ tags, links }) {
    if (!suggestionsPanel) return;
    suggestionsPanel.innerHTML = "";
    if (tags.length === 0 && links.length === 0) return;

    if (tags.length > 0) {
      const section = document.createElement("div");
      section.className = "sug-section sug-section-tags";
      const label = document.createElement("span");
      label.className = "sug-label";
      label.textContent = "tags";
      section.appendChild(label);
      const row = document.createElement("div");
      row.className = "sug-row sug-row-tags";
      for (const tag of tags) row.appendChild(buildTagChip(tag));
      section.appendChild(row);
      suggestionsPanel.appendChild(section);
    }
    if (links.length > 0) {
      const section = document.createElement("div");
      section.className = "sug-section sug-section-links";
      const label = document.createElement("span");
      label.className = "sug-label";
      label.textContent = "links";
      section.appendChild(label);
      const row = document.createElement("div");
      row.className = "sug-row sug-row-links";
      for (const l of links) row.appendChild(buildLinkChip(l));
      section.appendChild(row);
      suggestionsPanel.appendChild(section);
    }
  }

  function buildTagChip(tag) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sug-chip sug-chip-tag";
    chip.title = "Insert tag";
    const text = document.createElement("span");
    text.className = "sug-chip-text";
    text.textContent = `#${tag}`;
    const x = document.createElement("span");
    x.className = "sug-chip-x";
    x.textContent = "×";
    x.title = "Dismiss";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissedSuggestions.add(`tag:${tag.toLowerCase()}`);
      refreshSuggestions();
    });
    chip.append(text, x);
    chip.addEventListener("click", () => {
      // Tags don't interrupt prose mid-paragraph — drop them at the end
      // of the note on their own line (or append to an existing trailing
      // tag-only line), cursor position preserved.
      appendTagToNote(tag);
      dismissedSuggestions.add(`tag:${tag.toLowerCase()}`);
      refreshSuggestions();
    });
    return chip;
  }

  function buildLinkChip({ id, title }) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sug-chip sug-chip-link";
    // Full title in the tooltip so long names that get ellipsised
    // are still discoverable on hover.
    chip.title = `Insert [[${title}]]`;
    const text = document.createElement("span");
    text.className = "sug-chip-text";
    text.textContent = title;
    const x = document.createElement("span");
    x.className = "sug-chip-x";
    x.textContent = "×";
    x.title = "Dismiss";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissedSuggestions.add(`link:${id}`);
      refreshSuggestions();
    });
    chip.append(text, x);
    chip.addEventListener("click", () => {
      insertAtCursor(`[[${title}]]`);
      dismissedSuggestions.add(`link:${id}`);
      refreshSuggestions();
    });
    return chip;
  }

  function insertAtCursor(text) {
    if (!editor || !editor.view) return;
    const view = editor.view;
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: head, to: head, insert: text },
      selection: { anchor: head + text.length },
    });
    view.focus();
  }

  // Tags are metadata, not prose — inserting mid-paragraph shifts the
  // sentence the user was writing. Instead: append to the final
  // trailing tag-only line if one exists (e.g. "#music #grief" at the
  // bottom), or start a new such line at the end of the document.
  // Cursor / selection is preserved so the user can keep typing.
  function appendTagToNote(tag) {
    if (!editor || !editor.view) return;
    const view = editor.view;
    const doc = view.state.doc;
    const full = doc.toString();

    // Find the last non-blank line. If it's already a tag-only line
    // (nothing but `#xxx` tokens separated by whitespace), append there.
    // Otherwise, insert a blank line + new tag-only line at EOF.
    const lines = full.split("\n");
    let lastNonBlank = lines.length - 1;
    while (lastNonBlank >= 0 && lines[lastNonBlank].trim() === "")
      lastNonBlank--;
    const TAG_LINE = /^\s*(#[\w/-]+(\s+|$))+$/;
    const savedHead = view.state.selection.main.head;
    const savedAnchor = view.state.selection.main.anchor;

    let insertFrom;
    let insertText;
    if (lastNonBlank >= 0 && TAG_LINE.test(lines[lastNonBlank])) {
      // Append to that line after its last character.
      const lineStart = lines
        .slice(0, lastNonBlank)
        .reduce((n, l) => n + l.length + 1, 0);
      const lineEnd = lineStart + lines[lastNonBlank].length;
      insertFrom = lineEnd;
      insertText = ` #${tag}`;
    } else {
      // Append at end of document on a new line, prefixed by a blank
      // line if the body doesn't already end with two newlines.
      const endsCleanly = full.endsWith("\n\n");
      insertFrom = full.length;
      insertText = endsCleanly
        ? `#${tag}\n`
        : full.endsWith("\n")
          ? `\n#${tag}\n`
          : `\n\n#${tag}\n`;
    }

    view.dispatch({
      changes: { from: insertFrom, to: insertFrom, insert: insertText },
      // Preserve cursor position — but if the cursor was AFTER insertFrom
      // (unlikely but possible), shift it by the inserted length.
      selection: {
        anchor:
          savedAnchor >= insertFrom
            ? savedAnchor + insertText.length
            : savedAnchor,
        head:
          savedHead >= insertFrom ? savedHead + insertText.length : savedHead,
      },
    });
    view.focus();
  }

  function setMode(next) {
    if (next !== "read" && next !== "edit") return;
    if (!current) return;
    mode = next;
    panel.dataset.mode = next;
    modeBtn.textContent = next === "edit" ? "Read" : "Edit";
    if (next === "read") {
      destroyEditor();
      bodyEl.innerHTML = renderBody(current);
      bodyEl.scrollTop = 0;
    } else {
      mountEditor(current);
    }
  }

  function toggleMode() {
    setMode(mode === "edit" ? "read" : "edit");
  }

  function mountEditor(note) {
    bodyEl.innerHTML = "";
    const host = document.createElement("div");
    host.className = "panel-editor";
    editorHost = host;
    bodyEl.appendChild(host);
    editor = createEditor({
      initialValue: note.rawText || "",
      getVault,
      onChange: handleChange,
      onSaveCommit: flushSave,
    });
    host.appendChild(editor.dom);

    // The suggestions slot lives outside the editor host (it's a sibling
    // of panel-body) — clear it when the editor mounts and schedule a
    // fresh compute. Dismissed set is per-note, resets on remount.
    dismissedSuggestions = new Set();
    if (suggestionsPanel) suggestionsPanel.innerHTML = "";
    scheduleSuggestionsRefresh();
    editor.focus();
  }

  function handleChange(text) {
    if (!current) return;
    const changed = text !== lastSavedText;
    if (changed !== dirty) {
      dirty = changed;
      if (onDirtyChange) onDirtyChange(dirty);
    }
    if (current.body !== extractBody(text)) refreshTitleFromText(text);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, AUTOSAVE_MS);
    setStatus(dirty ? "editing…" : "saved");
    scheduleSuggestionsRefresh();
  }

  function refreshTitleFromText(text) {
    // Cheap update — show user the pending title before the full reparse.
    const m = text.match(/^---[\s\S]*?\n---\s*/);
    const body = m ? text.slice(m[0].length) : text;
    const h1 = body.match(H1_RE);
    const nextTitle = (h1 && h1[1].trim()) || current.title;
    paintTitle(current, nextTitle);
  }

  function extractBody(text) {
    const m = text.match(/^---[\s\S]*?\n---\s*/);
    return m ? text.slice(m[0].length) : text;
  }

  // Parse current tags + links from the live editor text so suggestions
  // don't re-propose things already present. Cheap — string regexes, not
  // a full markdown parse.
  function scanNoteUsage(text, vault) {
    const body = extractBody(text);
    const tags = [];
    const seenTags = new Set();
    const TAG_RE = /(?:^|[\s(\-])#([\w/-]+)/g;
    let m;
    while ((m = TAG_RE.exec(body))) {
      const t = m[1].toLowerCase();
      if (!seenTags.has(t)) {
        seenTags.add(t);
        tags.push(t);
      }
    }
    const linkIds = [];
    const LINK_RE = /\[\[([^\]\n]+?)(?:\|[^\]\n]+)?\]\]/g;
    while ((m = LINK_RE.exec(body))) {
      const target = m[1].trim();
      const byId = vault.byId?.get(target);
      if (byId) {
        linkIds.push(byId.id);
        continue;
      }
      // Phase 2: prefer-same-root policy applied through vault helper.
      const resolved = vault.resolveTitle
        ? vault.resolveTitle(target, current)
        : null;
      if (resolved) linkIds.push(resolved.id);
    }
    return { currentTags: tags, currentLinks: linkIds };
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    if (!current || !editor || !onSave) return;
    const text = editor.getValue();
    if (text === lastSavedText) {
      dirty = false;
      setStatus("saved");
      return;
    }
    const note = current;
    try {
      setStatus("saving…");
      const result = await onSave(note, text);
      // If the save canonicalized the text (e.g. injected frontmatter) AND
      // the user hasn't typed again in the meantime, push the canonical text
      // back. If they have typed, leave the editor alone — the next save
      // will pick up their newer edits.
      if (result && result.rawText != null) {
        lastSavedText = result.rawText;
        if (editor && editor.getValue() === text && result.rawText !== text)
          editor.setValue(result.rawText);
      } else {
        lastSavedText = text;
      }
      if (editor && editor.getValue() !== lastSavedText) {
        // User kept typing — still dirty.
        dirty = true;
        setStatus("editing…");
      } else {
        dirty = false;
        if (onDirtyChange) onDirtyChange(false);
        setStatus("saved");
      }
      if (note === current) refreshHeader(note);
    } catch (err) {
      console.error("[bz] save failed", err);
      setStatus("save failed");
    }
  }

  function isOpen() {
    return current != null;
  }
  function getCurrent() {
    return current;
  }
  function isDirty() {
    return dirty;
  }

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
  }

  // Expose a helper for the main module to push a re-parsed note back into
  // the panel (title / meta / kind changed externally — e.g. by tag-mapping
  // change).
  function refreshIfOpen(note) {
    if (!current || current !== note) return;
    refreshHeader(note);
    reflectPin(!!(note.frontmatter && note.frontmatter.pinned));
    if (mode === "read") bodyEl.innerHTML = renderBody(note);
  }

  window.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    // Don't swallow keys from settings pane.
    if (document.getElementById("settings")?.classList.contains("open")) return;

    if (e.key === "Escape") {
      // If editor is focused, let CM handle autocomplete first; otherwise close.
      const inCm = e.target.closest && e.target.closest(".cm-editor");
      if (inCm) {
        // Let CM consume it (autocomplete close). Second Esc closes the panel.
        return;
      }
      e.preventDefault();
      close();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      flushSave();
      close();
    }
  });

  return {
    open,
    close,
    isOpen,
    getCurrent,
    setMode,
    toggleMode,
    flushSave,
    isDirty,
    refreshIfOpen,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
