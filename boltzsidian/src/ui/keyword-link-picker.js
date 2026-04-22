// KEYWORD_LINK.md Phase C — modal picker for the keyword-linker.
//
// Two inputs:
//   - Keyword / phrase (free text)
//   - Target (autocomplete over vault.notes)
//
// Debounced rescan on any change rebuilds the preview list below.
// Each match has a checkbox; the user reviews, unchecks anything
// that looks wrong, and clicks Apply. Apply hands off to the
// caller's onApply with just the checked selection — this module
// never writes.
//
// Reuses the matching + scanning logic from layers/keyword-link.js.
// No knowledge of physics / tethers / saver — pure selector UI.

import { scanVaultForKeyword } from "../layers/keyword-link.js";

const SCAN_DEBOUNCE_MS = 180;
const MAX_AUTOCOMPLETE = 8;
// Safety thresholds per KEYWORD_LINK.md §4.4.
const WARN_THRESHOLD = 100;
const CONFIRM_THRESHOLD = 500;
const REFUSE_THRESHOLD = 10000;

export function createKeywordLinkPicker({ getVault, onApply } = {}) {
  if (!getVault) return stubApi();

  const overlay = document.createElement("div");
  overlay.id = "keyword-link-picker";
  overlay.className = "keyword-link-picker";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "8vh",
    zIndex: "60",
    background: "rgba(0, 0, 0, 0.4)",
    backdropFilter: "blur(4px)",
    pointerEvents: "auto",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(620px, 94vw)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    background: "rgba(20, 22, 30, 0.96)",
    border: "1px solid rgba(138, 180, 255, 0.2)",
    borderRadius: "10px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
    overflow: "hidden",
  });
  card.addEventListener("click", (e) => e.stopPropagation());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // ── Header with the two inputs ──────────────────────────
  const head = document.createElement("div");
  Object.assign(head.style, {
    padding: "18px 22px 14px",
    borderBottom: "1px solid var(--glass-border)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  });

  const title = document.createElement("p");
  title.textContent = "Link every mention of a keyword";
  Object.assign(title.style, {
    margin: "0",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(215, 219, 228, 0.55)",
  });

  const keywordRow = buildInputRow("Keyword", "e.g., pipeline, the API");
  const targetRow = buildInputRow("Link to", "pick a note…");

  const scopeRow = document.createElement("div");
  Object.assign(scopeRow.style, {
    display: "flex",
    gap: "14px",
    fontSize: "11px",
    color: "rgba(215, 219, 228, 0.55)",
    letterSpacing: "0.04em",
  });
  const caseLabel = buildCheckbox("Case sensitive");
  const linkedLabel = buildCheckbox("Include already-linked");
  scopeRow.append(caseLabel.label, linkedLabel.label);

  head.append(title, keywordRow.wrap, targetRow.wrap, scopeRow);

  // ── Target autocomplete dropdown ────────────────────────
  const autocomplete = document.createElement("div");
  autocomplete.className = "kwlink-autocomplete";
  Object.assign(autocomplete.style, {
    position: "absolute",
    display: "none",
    flexDirection: "column",
    background: "rgba(20, 22, 30, 0.98)",
    border: "1px solid rgba(138, 180, 255, 0.2)",
    borderRadius: "6px",
    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.55)",
    zIndex: "1",
    maxHeight: "260px",
    overflowY: "auto",
    minWidth: "280px",
    fontSize: "13px",
  });
  card.appendChild(autocomplete);

  // ── Summary bar ─────────────────────────────────────────
  const summary = document.createElement("div");
  Object.assign(summary.style, {
    padding: "10px 22px",
    fontSize: "11px",
    letterSpacing: "0.03em",
    color: "rgba(215, 219, 228, 0.6)",
    borderBottom: "1px solid var(--glass-border)",
  });
  summary.textContent = "Type a keyword and pick a target to preview matches.";

  // ── Preview list ────────────────────────────────────────
  const list = document.createElement("div");
  Object.assign(list.style, {
    flex: "1 1 auto",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: "8px 0",
  });

  // ── Footer ──────────────────────────────────────────────
  const footer = document.createElement("div");
  Object.assign(footer.style, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    padding: "12px 22px",
    borderTop: "1px solid var(--glass-border)",
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", close);
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "primary";
  applyBtn.textContent = "Apply";
  applyBtn.disabled = true;
  applyBtn.addEventListener("click", commit);
  footer.append(cancelBtn, applyBtn);

  card.append(head, summary, list, footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Prevent pointerdown inside the modal from waking a running
  // dream via the window-level listener in main.js (same trick
  // tend-drawer uses).
  overlay.addEventListener("pointerdown", (e) => e.stopPropagation(), true);

  // ── State ───────────────────────────────────────────────
  let target = null;
  let scanResult = null;
  let skipSet = new Set(); // `noteId:charOffset` of matches the user unchecked
  let debounceHandle = 0;
  let autocompleteCursor = 0;
  let autocompleteMatches = [];

  keywordRow.input.addEventListener("input", scheduleScan);
  caseLabel.input.addEventListener("change", scheduleScan);
  linkedLabel.input.addEventListener("change", scheduleScan);

  targetRow.input.addEventListener("input", () => {
    renderAutocomplete(targetRow.input.value);
  });
  targetRow.input.addEventListener("focus", () => {
    renderAutocomplete(targetRow.input.value);
  });
  targetRow.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cursorAutocomplete(+1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cursorAutocomplete(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (autocompleteMatches[autocompleteCursor])
        pickTarget(autocompleteMatches[autocompleteCursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      autocomplete.style.display = "none";
    } else {
      e.stopPropagation();
    }
  });
  document.addEventListener("click", (e) => {
    if (
      !targetRow.input.contains(e.target) &&
      !autocomplete.contains(e.target)
    ) {
      autocomplete.style.display = "none";
    }
  });
  keywordRow.input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else {
      e.stopPropagation();
    }
  });

  // ── Public API ──────────────────────────────────────────
  function open({ keyword = "", target: preTarget = null } = {}) {
    overlay.style.display = "flex";
    keywordRow.input.value = keyword;
    targetRow.input.value = preTarget?.title || "";
    target = preTarget;
    skipSet.clear();
    renderAutocomplete("");
    scheduleScan();
    requestAnimationFrame(() => keywordRow.input.focus());
  }

  function close() {
    overlay.style.display = "none";
    target = null;
    scanResult = null;
    list.innerHTML = "";
    keywordRow.input.value = "";
    targetRow.input.value = "";
    autocomplete.style.display = "none";
    caseLabel.input.checked = false;
    linkedLabel.input.checked = false;
  }

  function isOpen() {
    return overlay.style.display === "flex";
  }

  function dispose() {
    overlay.remove();
  }

  return { open, close, isOpen, dispose };

  // ── Internals ───────────────────────────────────────────

  function scheduleScan() {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => {
      debounceHandle = 0;
      runScan();
    }, SCAN_DEBOUNCE_MS);
  }

  function runScan() {
    const keyword = keywordRow.input.value.trim();
    const vault = getVault();
    if (!keyword || !target || !vault) {
      scanResult = null;
      list.innerHTML = "";
      applyBtn.disabled = true;
      summary.textContent = keyword
        ? "Pick a target note to preview matches."
        : target
          ? "Type a keyword to preview matches."
          : "Type a keyword and pick a target to preview matches.";
      return;
    }
    scanResult = scanVaultForKeyword(vault, {
      keyword,
      target,
      caseSensitive: caseLabel.input.checked,
      scope: {
        includeAlreadyLinked: linkedLabel.input.checked,
      },
    });
    renderPreview();
  }

  function renderPreview() {
    list.innerHTML = "";
    if (!scanResult) return;
    const { matches, skipped, totalMatches, totalNotes } = scanResult;

    const checkedCount = countChecked();
    summary.innerHTML = "";
    const bits = [];
    bits.push(
      `<b>${checkedCount}</b> of ${totalMatches} match${totalMatches === 1 ? "" : "es"} across ${totalNotes} note${totalNotes === 1 ? "" : "s"}`,
    );
    if (skipped.alreadyLinked.length)
      bits.push(
        `${skipped.alreadyLinked.length} already-linked note${skipped.alreadyLinked.length === 1 ? "" : "s"} skipped`,
      );
    if (skipped.readOnly.length)
      bits.push(`${skipped.readOnly.length} read-only skipped`);
    if (skipped.self) bits.push("1 self-reference skipped");
    summary.innerHTML = bits.join(" · ");
    if (totalMatches > WARN_THRESHOLD) {
      summary.innerHTML += ` <span style="color:var(--accent);">· review carefully before applying</span>`;
    }

    applyBtn.disabled = checkedCount === 0;

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No matches in the vault for that keyword.";
      Object.assign(empty.style, {
        padding: "16px 22px",
        color: "rgba(215, 219, 228, 0.4)",
        fontSize: "12px",
      });
      list.appendChild(empty);
      return;
    }

    for (const group of matches) {
      list.appendChild(renderGroup(group));
    }
  }

  function renderGroup(group) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      padding: "8px 22px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
    });
    const head = document.createElement("div");
    Object.assign(head.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      color: "var(--text-dim)",
      fontSize: "12px",
      marginBottom: "4px",
    });
    const name = document.createElement("span");
    name.textContent = group.note.path || group.note.title;
    const count = document.createElement("span");
    count.textContent = `${group.occurrences.length} match${group.occurrences.length === 1 ? "" : "es"}`;
    Object.assign(count.style, {
      fontSize: "10px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "rgba(215, 219, 228, 0.4)",
    });
    head.append(name, count);
    wrap.appendChild(head);

    for (const occ of group.occurrences) {
      wrap.appendChild(renderOccurrence(group.note, occ));
    }
    return wrap;
  }

  function renderOccurrence(note, occ) {
    const key = `${note.id}:${occ.charOffset}`;
    const row = document.createElement("label");
    Object.assign(row.style, {
      display: "flex",
      gap: "8px",
      alignItems: "flex-start",
      padding: "4px 0 4px 6px",
      fontSize: "12px",
      color: "var(--text)",
      cursor: "pointer",
    });
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !skipSet.has(key);
    check.addEventListener("change", () => {
      if (check.checked) skipSet.delete(key);
      else skipSet.add(key);
      const n = countChecked();
      applyBtn.disabled = n === 0;
      // Update summary count without rebuilding the list.
      const first = summary.querySelector("b");
      if (first) first.textContent = String(n);
    });
    const snippet = document.createElement("span");
    snippet.style.flex = "1 1 auto";
    snippet.style.lineHeight = "1.5";
    snippet.append(
      textNode(truncateBefore(occ.before)),
      highlight(occ.matchedText),
      textNode(truncateAfter(occ.after)),
    );
    row.append(check, snippet);
    return row;
  }

  function countChecked() {
    if (!scanResult) return 0;
    let n = 0;
    for (const g of scanResult.matches) {
      for (const o of g.occurrences) {
        const key = `${g.note.id}:${o.charOffset}`;
        if (!skipSet.has(key)) n++;
      }
    }
    return n;
  }

  function renderAutocomplete(q) {
    const vault = getVault();
    if (!vault) {
      autocomplete.style.display = "none";
      return;
    }
    const query = (q || "").trim().toLowerCase();
    const scored = [];
    for (const n of vault.notes) {
      const t = (n.title || "").toLowerCase();
      if (!t) continue;
      let score = 0;
      if (!query) score = 1;
      else if (t.startsWith(query)) score = 100;
      else if (t.includes(` ${query}`)) score = 80;
      else if (t.includes(query)) score = 60;
      else continue;
      scored.push({ note: n, score });
    }
    scored.sort(
      (a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title),
    );
    autocompleteMatches = scored.slice(0, MAX_AUTOCOMPLETE).map((s) => s.note);
    autocompleteCursor = 0;
    if (autocompleteMatches.length === 0) {
      autocomplete.style.display = "none";
      return;
    }
    autocomplete.innerHTML = "";
    for (let i = 0; i < autocompleteMatches.length; i++) {
      const n = autocompleteMatches[i];
      const row = document.createElement("div");
      row.dataset.idx = String(i);
      Object.assign(row.style, {
        padding: "6px 12px",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        gap: "8px",
      });
      const t = document.createElement("span");
      t.textContent = n.title || "(untitled)";
      t.style.overflow = "hidden";
      t.style.textOverflow = "ellipsis";
      t.style.whiteSpace = "nowrap";
      const r = document.createElement("span");
      r.textContent = n.rootId || "";
      r.style.fontSize = "10px";
      r.style.letterSpacing = "0.06em";
      r.style.color = "rgba(215, 219, 228, 0.35)";
      r.style.textTransform = "uppercase";
      row.append(t, r);
      row.addEventListener("mouseenter", () => {
        // Update styles only — re-rendering here would destroy the
        // row mid-click (browser detaches the node between mouseenter
        // and click), which is why clicking wasn't registering.
        if (autocompleteCursor !== i) {
          autocompleteCursor = i;
          paintAutocompleteCursor();
        }
      });
      // Use mousedown so the pick fires before any blur/focus shuffle
      // can detach the node. Belt-and-braces with click as well.
      const pick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        pickTarget(n);
      };
      row.addEventListener("mousedown", pick);
      row.addEventListener("click", pick);
      autocomplete.appendChild(row);
    }
    paintAutocompleteCursor();
    positionAutocompleteBelow(targetRow.input);
    autocomplete.style.display = "flex";
    // Auto-pick the top result as a tentative target so Apply can
    // light up immediately. The user can still click / arrow to a
    // different row — pickTarget will overwrite. Skip if the user
    // has already explicitly picked a target whose title matches
    // the current input (don't clobber an explicit choice).
    if (
      autocompleteMatches[0] &&
      (!target || target.title !== targetRow.input.value)
    ) {
      target = autocompleteMatches[0];
      scheduleScan();
    }
  }

  function paintAutocompleteCursor() {
    for (const row of autocomplete.children) {
      const i = Number(row.dataset.idx);
      const active = i === autocompleteCursor;
      row.style.color = active ? "#fff" : "rgba(215, 219, 228, 0.75)";
      row.style.background = active
        ? "rgba(138, 180, 255, 0.12)"
        : "transparent";
    }
  }

  function cursorAutocomplete(delta) {
    if (autocompleteMatches.length === 0) return;
    autocompleteCursor =
      (autocompleteCursor + delta + autocompleteMatches.length) %
      autocompleteMatches.length;
    paintAutocompleteCursor();
  }

  function pickTarget(note) {
    target = note;
    targetRow.input.value = note.title || "";
    autocomplete.style.display = "none";
    scheduleScan();
  }

  function positionAutocompleteBelow(el) {
    const r = el.getBoundingClientRect();
    const cardR = card.getBoundingClientRect();
    autocomplete.style.left = `${r.left - cardR.left}px`;
    autocomplete.style.top = `${r.bottom - cardR.top + 4}px`;
    autocomplete.style.width = `${r.width}px`;
  }

  function commit() {
    if (!scanResult || !target) return;
    const selection = [];
    let checkedCount = 0;
    for (const g of scanResult.matches) {
      const kept = [];
      for (const o of g.occurrences) {
        const key = `${g.note.id}:${o.charOffset}`;
        if (!skipSet.has(key)) {
          kept.push(o);
          checkedCount++;
        }
      }
      if (kept.length > 0) selection.push({ note: g.note, occurrences: kept });
    }
    if (checkedCount === 0) return;
    if (checkedCount >= REFUSE_THRESHOLD) {
      window.alert(
        `${checkedCount} matches is too broad for this tool. Narrow the phrase and try again.`,
      );
      return;
    }
    if (checkedCount >= CONFIRM_THRESHOLD) {
      if (
        !window.confirm(
          `Apply ${checkedCount} wikilinks? This writes to ${selection.length} notes.`,
        )
      )
        return;
    }
    close();
    if (onApply) onApply({ target, selection });
  }
}

// ── DOM helpers ────────────────────────────────────────

function buildInputRow(label, placeholder) {
  const wrap = document.createElement("label");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    position: "relative",
  });
  const lbl = document.createElement("span");
  lbl.textContent = label;
  Object.assign(lbl.style, {
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(215, 219, 228, 0.5)",
    flex: "0 0 72px",
  });
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.autocomplete = "off";
  Object.assign(input.style, {
    flex: "1 1 auto",
    background: "transparent",
    border: "0",
    borderBottom: "1px solid rgba(138, 180, 255, 0.25)",
    color: "#e8eaf0",
    fontSize: "15px",
    padding: "4px 0",
    outline: "none",
    caretColor: "#8ab4ff",
    fontFamily: "inherit",
  });
  wrap.append(lbl, input);
  return { wrap, input };
}

function buildCheckbox(label) {
  const lbl = document.createElement("label");
  Object.assign(lbl.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
  });
  const input = document.createElement("input");
  input.type = "checkbox";
  const span = document.createElement("span");
  span.textContent = label;
  lbl.append(input, span);
  return { label: lbl, input };
}

function textNode(s) {
  return document.createTextNode(s);
}

function highlight(matched) {
  const el = document.createElement("strong");
  el.textContent = matched;
  el.style.color = "var(--accent)";
  el.style.fontWeight = "500";
  return el;
}

function truncateBefore(s) {
  if (s.length <= 40) return s;
  return "…" + s.slice(-38);
}
function truncateAfter(s) {
  if (s.length <= 40) return s;
  return s.slice(0, 38) + "…";
}

function stubApi() {
  return {
    open: () => {},
    close: () => {},
    isOpen: () => false,
    dispose: () => {},
  };
}
