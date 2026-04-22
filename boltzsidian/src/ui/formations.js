// Formations — named filter modes for reading the universe.
//
// Each formation is a pure function (vault, bodies, params) → Set<id>. When
// any formation is active, we set the bodies' glow filter to the *intersection*
// of all active formations' matches, so multiple formations compose into a
// tighter lens rather than fighting each other.
//
// The module exposes a small state machine that the rail UI pushes events
// into. It doesn't render anything itself.

import { topLevelFolder, listTopLevelFolders } from "../vault/folders.js";

const PROTOSTAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Stable ordering — the rail pill list follows this order so keyboard
// shortcuts align with visual position.
export const FORMATIONS = [
  { id: "all", key: "1", label: "All", tooltip: "Clear every formation." },
  {
    id: "halo",
    key: "2",
    label: "Halo",
    tooltip: "Notes with no incoming or outgoing links — forgotten stars.",
  },
  {
    id: "protostars",
    key: "3",
    label: "Protostars",
    tooltip: "Notes touched in the last 14 days.",
  },
  {
    id: "solo-folder",
    key: "4",
    label: "Solo folder",
    tooltip: "Isolate one top-level folder.",
    needsParam: true,
  },
  {
    id: "galactic-core",
    key: "5",
    label: "Galactic core",
    tooltip: "Your most-connected hub and its direct neighbours.",
  },
];

const FORMATIONS_BY_ID = Object.fromEntries(FORMATIONS.map((f) => [f.id, f]));

export function createFormations({ getVault, getBodies, onChange }) {
  // active: Map<formationId, params>
  const active = new Map();

  function set(id, params = null) {
    if (id === "all") {
      active.clear();
    } else {
      active.set(id, params);
    }
    emit();
  }

  function toggle(id, params = null) {
    if (id === "all") {
      active.clear();
      emit();
      return;
    }
    if (
      active.has(id) &&
      (params == null || sameParams(active.get(id), params))
    ) {
      active.delete(id);
    } else {
      active.set(id, params);
    }
    emit();
  }

  function remove(id) {
    if (active.delete(id)) emit();
  }

  function clear() {
    if (active.size === 0) return;
    active.clear();
    emit();
  }

  function isActive(id) {
    return active.has(id);
  }

  function getParams(id) {
    return active.get(id);
  }

  function activeIds() {
    return [...active.keys()];
  }

  function emit() {
    // Compute intersection set and push to bodies.
    const ids = computeActiveSet();
    const bodies = getBodies();
    if (bodies) bodies.setGlowFilter(ids);
    if (onChange) onChange({ active: activeIds() });
  }

  function computeActiveSet() {
    if (active.size === 0) return null; // all bodies at full glow
    const vault = getVault();
    const bodies = getBodies();
    if (!vault) return null;

    let result = null;
    for (const [id, params] of active) {
      const matcher = MATCHERS[id];
      if (!matcher) continue;
      const set = matcher(vault, bodies, params);
      if (!set) continue;
      if (result === null) {
        result = new Set(set);
      } else {
        // intersection
        const next = new Set();
        for (const x of set) if (result.has(x)) next.add(x);
        result = next;
      }
      if (result.size === 0) break;
    }
    return result || null;
  }

  function refresh() {
    emit();
  }

  return {
    FORMATIONS,
    set,
    toggle,
    remove,
    clear,
    isActive,
    getParams,
    activeIds,
    refresh,
  };
}

function sameParams(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Matchers ───────────────────────────────────────────────
const MATCHERS = {
  halo(vault) {
    const out = new Set();
    for (const n of vault.notes) {
      const fwd = vault.forward.get(n.id)?.size || 0;
      const bwd = vault.backward.get(n.id)?.size || 0;
      if (fwd === 0 && bwd === 0) out.add(n.id);
    }
    return out;
  },
  protostars(vault) {
    const cutoff = Date.now() - PROTOSTAR_WINDOW_MS;
    const out = new Set();
    for (const n of vault.notes) {
      if ((n.mtime || 0) >= cutoff) out.add(n.id);
    }
    return out;
  },
  "solo-folder"(vault, _bodies, params) {
    const target = params?.folder;
    if (!target) return new Set(); // no folder picked → empty match
    const out = new Set();
    for (const n of vault.notes) {
      if (topLevelFolder(n) === target) out.add(n.id);
    }
    return out;
  },
  "galactic-core"(vault) {
    // Pick the note with the highest total degree; include it and its
    // one-hop neighbourhood. Simple, cheap, surprisingly honest.
    if (vault.notes.length === 0) return new Set();
    let bestId = null;
    let bestDeg = -1;
    for (const n of vault.notes) {
      const d =
        (vault.forward.get(n.id)?.size || 0) +
        (vault.backward.get(n.id)?.size || 0);
      if (d > bestDeg) {
        bestDeg = d;
        bestId = n.id;
      }
    }
    const out = new Set();
    if (!bestId) return out;
    out.add(bestId);
    for (const x of vault.forward.get(bestId) || []) out.add(x);
    for (const x of vault.backward.get(bestId) || []) out.add(x);
    return out;
  },
  // VISIBILITY_FILTER.md — user-typed tag filter. Params.tags is an
  // array of tag strings (no leading '#'). A note matches if it has
  // ALL requested tags (frontmatter or inline). Empty → null so the
  // formations loop treats this filter as inactive.
  tag(vault, _bodies, params) {
    const wanted = (params?.tags || []).map((t) => String(t).toLowerCase());
    if (wanted.length === 0) return null;
    const out = new Set();
    for (const n of vault.notes) {
      const all = new Set();
      const fm = n.frontmatter?.tags;
      if (Array.isArray(fm)) {
        for (const t of fm) all.add(String(t).toLowerCase());
      }
      for (const t of n.tags || []) all.add(String(t).toLowerCase());
      if (wanted.every((t) => all.has(t))) out.add(n.id);
    }
    return out;
  },
  // VISIBILITY_FILTER.md — user-typed keyword filter. Params.phrases
  // is an array of lowercase substrings. A note matches if its body
  // OR title contains ALL phrases (AND). Case-insensitive.
  keyword(vault, _bodies, params) {
    const phrases = (params?.phrases || []).map((p) => String(p).toLowerCase());
    if (phrases.length === 0) return null;
    const out = new Set();
    for (const n of vault.notes) {
      const hay = ((n.body || "") + "\n" + (n.title || "")).toLowerCase();
      if (phrases.every((p) => hay.includes(p))) out.add(n.id);
    }
    return out;
  },
};

// Helper for the rail UI to populate the Solo-folder picker.
export function availableFolders(vault) {
  if (!vault) return [];
  return listTopLevelFolders(vault);
}

export function formationMeta(id) {
  return FORMATIONS_BY_ID[id];
}
