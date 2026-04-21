// Brief — the "show me where I am" panel.
//
// Runs once on workspace open when settings.brief_on_open !== false.
// Never modal: sits over the canvas as a small glass card, dismissable
// on Esc or any navigation key. The canvas stays live behind it.
//
// Content is derived (not generated). Four blocks, each naming a
// specific note with an observable reason (BUILD_PLAN §Phase 6.7 exit
// gate — "every bullet should name a _specific_ note with an
// observable reason"):
//
//   1. 3 heaviest notes — `massOf` from bodies, falls back to backlink
//      count + word-count heuristic when bodies aren't ready.
//   2. 3 protostars — most-recent mtime. "what you've been writing."
//   3. 1 halo note — long-quiet, zero-link. Picked deterministically
//      by calendar date so same-day reloads surface the same orphan.
//   4. 1 obvious-bridge — top output of tend's obvious-link detector.
//      Skipped cleanly when the detector has no material.
//
// STATES.md §4: "no chorus, no physics softening, no disk writes."

import { detectObviousLinks } from "../layers/tend.js";

const HEAVIEST_N = 3;
const PROTOSTAR_N = 3;
const HALO_MIN_IDLE_DAYS = 14;

export function createBrief({
  getVault,
  getBodies,
  onOpenNote,
  onDismissEarly,
}) {
  const panel = document.getElementById("brief-panel");
  if (!panel) {
    return { show: () => {}, hide: () => {}, isOpen: () => false };
  }

  const bodyEl = panel.querySelector(".brief-body");
  const closeBtn = panel.querySelector(".brief-close");
  closeBtn?.addEventListener("click", hide);

  function isOpen() {
    return panel.classList.contains("show");
  }

  function show() {
    const vault = getVault && getVault();
    if (!vault || vault.notes.length === 0) return;
    const picks = computePicks(vault, getBodies && getBodies());
    if (!picksHaveAnything(picks)) return;
    renderInto(bodyEl, picks, (id) => {
      onOpenNote?.(id);
      hide();
    });
    panel.classList.add("show");
    panel.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKey, true);
  }

  function hide() {
    if (!isOpen()) return;
    panel.classList.remove("show");
    panel.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey, true);
    onDismissEarly?.();
  }

  // Dismissable on Esc or any navigation-ish key. Deliberately broad
  // because Brief shouldn't feel sticky — the universe is what the
  // user came to see. We don't swallow the key, just let it close and
  // then fire through to whatever handler owns it next tick.
  function onKey(e) {
    if (!isOpen()) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.target instanceof HTMLTextAreaElement) return;
    if (e.target?.closest?.(".cm-editor")) return;
    const dismissKeys = new Set([
      "Escape",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Enter",
      "/",
      "\\",
      "i",
      "I",
      "t",
      "T",
      "w",
      "W",
      "n",
      "N",
      "d",
      "D",
    ]);
    if (dismissKeys.has(e.key)) {
      hide();
    }
  }

  return { show, hide, isOpen };
}

// ── Pick computation ─────────────────────────────────────
export function computePicks(vault, bodies) {
  return {
    heaviest: pickHeaviest(vault, bodies, HEAVIEST_N),
    protostars: pickProtostars(vault, PROTOSTAR_N),
    halo: pickHalo(vault),
    bridge: pickBridge(vault),
  };
}

function picksHaveAnything(picks) {
  return (
    picks.heaviest.length > 0 ||
    picks.protostars.length > 0 ||
    picks.halo != null ||
    picks.bridge != null
  );
}

function pickHeaviest(vault, bodies, n) {
  const scored = [];
  for (const note of vault.notes) {
    if (note._isPhantom) continue;
    const mass =
      bodies?.massOf?.(note.id) ??
      fallbackMass(note, vault.backward.get(note.id)?.size || 0);
    scored.push({ note, mass });
  }
  scored.sort((a, b) => b.mass - a.mass);
  return scored.slice(0, n).map(({ note, mass }) => ({
    note,
    reason: heaviestReason(note, vault, mass),
  }));
}

function fallbackMass(note, backlinks) {
  const words = Math.max(1, note.words || 0);
  return 1 + backlinks * 0.8 + Math.log(1 + words) * 0.55;
}

function heaviestReason(note, vault, mass) {
  const back = vault.backward.get(note.id)?.size || 0;
  const words = note.words || 0;
  const parts = [];
  if (back > 0) parts.push(`${back} backlink${back === 1 ? "" : "s"}`);
  if (words > 0) parts.push(`${words} word${words === 1 ? "" : "s"}`);
  if (parts.length === 0) return `mass ${mass.toFixed(1)}`;
  return parts.join(" · ");
}

function pickProtostars(vault, n) {
  const scored = [];
  for (const note of vault.notes) {
    if (note._isPhantom) continue;
    if (!note.mtime) continue;
    scored.push(note);
  }
  scored.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  return scored.slice(0, n).map((note) => ({
    note,
    reason: `edited ${humanRelative(note.mtime)}`,
  }));
}

// Halo: long-quiet, zero-link. Picked deterministically from today's
// date so same-day reloads show the same one. Same rule as Phase 5's
// prune detector for "quiet" — no incoming or outgoing links, mtime
// at least HALO_MIN_IDLE_DAYS old.
function pickHalo(vault) {
  const now = Date.now();
  const cutoff = now - HALO_MIN_IDLE_DAYS * 24 * 60 * 60 * 1000;
  const candidates = [];
  for (const note of vault.notes) {
    if (note._isPhantom) continue;
    const outDeg = vault.forward.get(note.id)?.size || 0;
    const inDeg = vault.backward.get(note.id)?.size || 0;
    if (outDeg > 0 || inDeg > 0) continue;
    if (!note.mtime || note.mtime > cutoff) continue;
    candidates.push(note);
  }
  if (candidates.length === 0) return null;
  // Stable sort for determinism — mtime ascending so the quietest come
  // first — then pick by date-hash so the same day always returns the
  // same note even as the list shifts.
  candidates.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
  const today = new Date().toISOString().slice(0, 10);
  const idx = fnv1aHash(today) % candidates.length;
  const pick = candidates[idx];
  return {
    note: pick,
    reason: `no links, untouched for ${humanDays(now - pick.mtime)}`,
  };
}

// Bridge: top of tend's obvious-link detector. One pair, presented as
// a gentle nudge. Skipped cleanly when there's no material.
function pickBridge(vault) {
  try {
    const proposals = detectObviousLinks(vault);
    if (!proposals || proposals.length === 0) return null;
    // Highest-confidence first; among ties, the first the detector
    // emitted — which is stable across runs since detectObviousLinks
    // iterates vault.notes in insertion order.
    proposals.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const top = proposals[0];
    const source = vault.byId.get(top.noteId);
    const target = vault.byId.get(top.linkTargetId);
    if (!source || !target) return null;
    return {
      source,
      target,
      reason: `"${source.title}" mentions "${target.title}" in its body but doesn't link to it`,
    };
  } catch (err) {
    console.warn("[bz] brief: bridge pick failed", err);
    return null;
  }
}

// ── Render ──────────────────────────────────────────────
function renderInto(rootEl, picks, openNote) {
  rootEl.innerHTML = "";
  if (picks.heaviest.length > 0) {
    rootEl.appendChild(
      renderSection("Your anchors", "heaviest notes", picks.heaviest, openNote),
    );
  }
  if (picks.protostars.length > 0) {
    rootEl.appendChild(
      renderSection(
        "What you've been writing",
        "most recent",
        picks.protostars,
        openNote,
      ),
    );
  }
  if (picks.halo) {
    rootEl.appendChild(
      renderSection(
        "What you might have forgotten",
        "long-quiet, no links",
        [picks.halo],
        openNote,
      ),
    );
  }
  if (picks.bridge) {
    rootEl.appendChild(renderBridge(picks.bridge, openNote));
  }
}

function renderSection(title, subtitle, items, openNote) {
  const wrap = document.createElement("section");
  wrap.className = "brief-section";

  const h = document.createElement("h3");
  h.textContent = title;
  const sub = document.createElement("p");
  sub.className = "brief-section-sub";
  sub.textContent = subtitle;
  wrap.append(h, sub);

  const list = document.createElement("ul");
  list.className = "brief-list";
  for (const item of items) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#";
    link.className = "brief-note-title";
    link.textContent = item.note.title || "(untitled)";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openNote(item.note.id);
    });
    const reason = document.createElement("span");
    reason.className = "brief-reason";
    reason.textContent = ` — ${item.reason}`;
    li.append(link, reason);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderBridge(bridge, openNote) {
  const wrap = document.createElement("section");
  wrap.className = "brief-section";

  const h = document.createElement("h3");
  h.textContent = "Two notes that probably should know each other";
  const sub = document.createElement("p");
  sub.className = "brief-section-sub";
  sub.textContent = "obvious-link pass";
  wrap.append(h, sub);

  const p = document.createElement("p");
  p.className = "brief-bridge";
  const a = bridgeLink(bridge.source.title, bridge.source.id, openNote);
  const b = bridgeLink(bridge.target.title, bridge.target.id, openNote);
  const sep = document.createElement("span");
  sep.textContent = " ↔ ";
  sep.style.color = "var(--text-faint)";
  p.append(a, sep, b);
  wrap.appendChild(p);

  const reason = document.createElement("p");
  reason.className = "brief-bridge-reason";
  reason.textContent = bridge.reason;
  wrap.appendChild(reason);
  return wrap;
}

function bridgeLink(title, noteId, openNote) {
  const a = document.createElement("a");
  a.href = "#";
  a.className = "brief-note-title";
  a.textContent = title;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openNote(noteId);
  });
  return a;
}

// ── Helpers ─────────────────────────────────────────────
function humanRelative(mtime) {
  if (!mtime) return "—";
  const ms = Date.now() - mtime;
  const m = Math.floor(ms / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.round(d / 7)} week${d < 14 ? "" : "s"} ago`;
  return `${Math.round(d / 30)} month${d < 60 ? "" : "s"} ago`;
}

function humanDays(ms) {
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (d < 30) return `${d} days`;
  if (d < 90) return `${Math.round(d / 7)} weeks`;
  if (d < 365) return `${Math.round(d / 30)} months`;
  return `${Math.round(d / 365)} years`;
}

// Tiny FNV-1a 32-bit hash for date-indexed deterministic picks. Same
// rationale as affinity.js's use — stable mapping from a short string
// to an integer without pulling in crypto.
function fnv1aHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
