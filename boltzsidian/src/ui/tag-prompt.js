// Tag → kind discovery prompt.
//
// After a vault loads, measure how many notes are touched by at least one
// tag the app already knows how to colour. If that coverage is under the
// threshold, surface a modal showing the most-common unmapped tags with a
// kind dropdown per row. Applying the mapping patches settings.tag_to_kind
// via the caller's onApply callback.
//
// Called once per session — the modal never fires after the first time
// the user has seen it, unless they explicitly re-trigger via settings.

import { NUM_KINDS } from "../vault/kind.js";

const COVERAGE_THRESHOLD = 0.8;

export function computeTagCoverage(vault, settings) {
  const mapping = settings.tag_to_kind || {};
  const mapped = new Set(Object.keys(mapping));
  let covered = 0;
  for (const n of vault.notes) {
    if (!n.tags.length) continue;
    if (n.tags.some((t) => mapped.has(t))) covered++;
  }
  const taggedNotes = vault.notes.filter((n) => n.tags.length > 0).length;
  const denom = Math.max(1, taggedNotes);
  return {
    covered,
    total: taggedNotes,
    fraction: covered / denom,
  };
}

export function pickTopUnmappedTags(vault, settings, limit = 6) {
  const mapping = settings.tag_to_kind || {};
  const mapped = new Set(Object.keys(mapping));
  const counts = vault.tagCounts || new Map();
  return [...counts.entries()]
    .filter(([t]) => !mapped.has(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

// Build and inject the modal. Returns an object with a `close()` hook.
export function showTagPrompt({ vault, settings, onApply, onDismiss }) {
  const unmapped = pickTopUnmappedTags(vault, settings, 6);
  if (unmapped.length === 0) {
    if (onDismiss) onDismiss();
    return null;
  }

  const modal = document.createElement("div");
  modal.className = "tag-prompt-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "tag-prompt-title");
  modal.innerHTML = `
    <div class="tp-card">
      <h2 id="tag-prompt-title">A few tags we don't know yet</h2>
      <p class="tp-sub">
        These tags show up in your vault but aren't colour-coded. Pick a
        kind for each — or skip, and set them up later in Settings.
      </p>
      <div class="tp-rows"></div>
      <div class="tp-actions">
        <button type="button" class="ghost" data-action="skip">Skip</button>
        <button type="button" class="primary" data-action="apply">Apply</button>
      </div>
    </div>
  `;
  const rows = modal.querySelector(".tp-rows");

  const rowState = new Map();
  for (const [tag, count] of unmapped) {
    const row = document.createElement("div");
    row.className = "tp-row";
    row.innerHTML = `
      <span class="tp-tag">#${escapeHtml(tag)}</span>
      <span class="tp-count">${count}</span>
      <select class="tp-kind"></select>
    `;
    const sel = row.querySelector(".tp-kind");
    sel.appendChild(new Option("(skip)", ""));
    for (let k = 0; k < NUM_KINDS; k++) {
      const label =
        settings.kind_labels?.[k] ??
        settings.kind_labels?.[String(k)] ??
        `Kind ${k}`;
      sel.appendChild(new Option(`${k} · ${label}`, String(k)));
    }
    sel.value = suggestKind(tag, settings);
    rowState.set(tag, sel);
    rows.appendChild(row);
  }

  function apply() {
    const patch = { ...(settings.tag_to_kind || {}) };
    let added = 0;
    for (const [tag, sel] of rowState) {
      if (sel.value === "") continue;
      patch[tag] = Number(sel.value);
      added++;
    }
    close();
    if (onApply) onApply(patch, added);
  }

  function skip() {
    close();
    if (onDismiss) onDismiss();
  }

  function close() {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 220);
  }

  modal.addEventListener("click", (e) => {
    const action = e.target?.dataset?.action;
    if (action === "apply") apply();
    else if (action === "skip") skip();
    else if (e.target === modal) skip(); // click outside card
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") skip();
    if (e.key === "Enter" && e.target.tagName !== "SELECT") apply();
  });

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));
  // Focus the first dropdown for quick keyboard flow.
  setTimeout(() => rows.querySelector("select")?.focus(), 120);

  return { close };
}

// Simple heuristic: suggest a kind based on tag name resemblance to the
// current kind labels. Doesn't auto-apply — just pre-selects the dropdown
// so the user can tab through quickly.
function suggestKind(tag, settings) {
  const low = tag.toLowerCase();
  const labels = settings.kind_labels || {};
  for (let k = 0; k < NUM_KINDS; k++) {
    const name = String(labels[k] ?? labels[String(k)] ?? "").toLowerCase();
    if (!name) continue;
    if (low === name || low.startsWith(name) || name.startsWith(low))
      return String(k);
  }
  return "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
