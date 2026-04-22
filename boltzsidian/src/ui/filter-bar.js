// VISIBILITY_FILTER.md — compact pill at the top of the HUD that
// dims non-matching notes based on typed tags and keywords.
//
// Tokens:
//   #tag   → requires that tag (frontmatter or inline). AND-composed
//            across multiple #tags.
//   text   → requires that substring in the note body or title.
//            AND-composed across multiple keywords.
//
// Hooks into the existing formations pipeline (ui/formations.js) —
// this module calls `formations.set("tag", {...})` and
// `formations.set("keyword", {...})` whenever the parsed tokens
// change. The formations intersection logic then dims non-matching
// bodies via bodies.setGlowFilter — same path the rail uses.

const DEBOUNCE_MS = 120;

export function createFilterBar({
  formations,
  getVault,
  mountId = "filter-bar",
} = {}) {
  const host = document.getElementById(mountId);
  if (!host) {
    return {
      focus: () => {},
      clear: () => {},
      isFocused: () => false,
      refresh: () => {},
      dispose: () => {},
    };
  }

  host.innerHTML = `
    <input
      class="filter-bar-input"
      type="text"
      placeholder="filter — type #tag or keyword"
      spellcheck="false"
      autocomplete="off"
    />
    <span class="filter-bar-count" aria-live="polite"></span>
    <button class="filter-bar-clear" type="button" aria-label="Clear filter" title="Clear filter">×</button>
  `;
  const input = host.querySelector(".filter-bar-input");
  const count = host.querySelector(".filter-bar-count");
  const clearBtn = host.querySelector(".filter-bar-clear");

  let debounceHandle = 0;

  input.addEventListener("input", () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(apply, DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (input.value === "") {
        input.blur();
      } else {
        input.value = "";
        apply();
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      apply(); // flush debounce
      input.blur();
    }
    // Don't let the global keybinds (N, E, I, T, …) fire while the
    // user is typing letters into the filter bar.
    e.stopPropagation();
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    apply();
    input.focus();
  });

  function parse(raw) {
    const tags = [];
    const phrases = [];
    const tokens = String(raw || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const t of tokens) {
      if (t.startsWith("#")) {
        const stripped = t.replace(/^#+/, "").toLowerCase();
        if (stripped) tags.push(stripped);
      } else {
        phrases.push(t.toLowerCase());
      }
    }
    return { tags, phrases };
  }

  function apply() {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = 0;
    }
    const { tags, phrases } = parse(input.value);
    if (!formations) return;
    if (tags.length > 0) formations.set("tag", { tags });
    else formations.remove("tag");
    if (phrases.length > 0) formations.set("keyword", { phrases });
    else formations.remove("keyword");
    renderState(tags, phrases);
  }

  function renderState(tags, phrases) {
    const active = tags.length + phrases.length > 0;
    host.classList.toggle("active", active);
    if (!active) {
      count.textContent = "";
      return;
    }
    const vault = getVault?.();
    const total = vault?.notes?.length || 0;
    // Compute live match count by re-running the same matchers the
    // formations pipeline uses. Cheap — O(n) per filter.
    let matched = 0;
    if (vault) {
      for (const n of vault.notes) {
        if (tags.length > 0) {
          const all = new Set();
          const fm = n.frontmatter?.tags;
          if (Array.isArray(fm)) {
            for (const t of fm) all.add(String(t).toLowerCase());
          }
          for (const t of n.tags || []) all.add(String(t).toLowerCase());
          if (!tags.every((t) => all.has(t))) continue;
        }
        if (phrases.length > 0) {
          const hay = ((n.body || "") + "\n" + (n.title || "")).toLowerCase();
          if (!phrases.every((p) => hay.includes(p))) continue;
        }
        matched++;
      }
    }
    count.textContent = `${matched} / ${total}`;
  }

  function focus() {
    input.focus();
    input.select();
  }
  function clear() {
    if (input.value === "") return;
    input.value = "";
    apply();
  }
  function isFocused() {
    return document.activeElement === input;
  }
  function refresh() {
    // Vault reloaded — re-apply the current filter so matches stay
    // in sync with the new note set.
    apply();
  }
  function dispose() {
    host.innerHTML = "";
  }

  return { focus, clear, isFocused, refresh, dispose };
}
