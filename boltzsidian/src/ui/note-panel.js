// Read-only note panel. Phase 1: renders the markdown body with `marked`,
// wires [[wikilinks]] to the note model, handles Esc + click-close.
// Phase 2 swaps the rendered view for a CodeMirror editor.

import { marked } from "marked";

export function createNotePanel({ getVault, onClose, onNavigate }) {
  const panel = document.getElementById("note-panel");
  const titleEl = panel.querySelector(".panel-title");
  const bodyEl = panel.querySelector(".panel-body");
  const metaEl = panel.querySelector(".panel-meta");
  const closeBtn = panel.querySelector(".panel-close");

  let current = null;

  const renderer = new marked.Renderer();
  marked.use({ renderer, gfm: true, breaks: false });

  closeBtn.addEventListener("click", () => close());

  bodyEl.addEventListener("click", (e) => {
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
    const lower = raw.trim().toLowerCase();
    if (vault.byId.has(raw)) return vault.byId.get(raw);
    if (vault.byTitle.has(lower)) return vault.byTitle.get(lower);
    return null;
  }

  function renderBody(note) {
    // Preprocess [[wikilinks]] into clickable spans before handing to marked.
    const preprocessed = note.body.replace(
      /\[\[([^\]\|\n]+?)(?:\|([^\]\n]+))?\]\]/g,
      (_, target, alias) => {
        const t = target.trim();
        const resolved = resolveTarget(t);
        const label = (alias || t).trim();
        const cls = resolved ? "wikilink" : "wikilink broken";
        const dataTarget = resolved ? resolved.id : t;
        return `<span class="${cls}" data-target="${escapeAttr(dataTarget)}">${escapeHtml(label)}</span>`;
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

  function open(note) {
    current = note;
    titleEl.textContent = note.title;
    bodyEl.innerHTML = renderBody(note);
    bodyEl.scrollTop = 0;
    metaEl.innerHTML = buildMeta(note);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }

  function close() {
    if (!current) return;
    const closed = current;
    current = null;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    if (onClose) onClose(closed);
  }

  function isOpen() {
    return current != null;
  }

  function getCurrent() {
    return current;
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      // don't steal from search / settings — check those first
      if (document.getElementById("settings")?.classList.contains("open"))
        return;
      e.preventDefault();
      close();
    }
  });

  return { open, close, isOpen, getCurrent };
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
