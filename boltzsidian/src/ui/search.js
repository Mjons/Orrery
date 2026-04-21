// Cmd+K search. Minisearch index built on first open; bodies dim to non-matches
// and the top hit draws the camera. ↑↓ walks the ranked list. Enter opens it.

import MiniSearch from "minisearch";

export function createSearch({ getVault, getBodies, onArc, onOpen }) {
  const strip = document.getElementById("search-strip");
  const input = strip.querySelector("input");

  let index = null;
  let indexedCount = 0;
  let matches = [];
  let cursor = 0;

  function buildIndexIfNeeded() {
    const vault = getVault();
    if (!vault) return false;
    if (index && indexedCount === vault.notes.length) return true;
    index = new MiniSearch({
      fields: ["title", "tags", "body"],
      storeFields: ["id", "title"],
      idField: "id",
      searchOptions: {
        boost: { title: 3, tags: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
    const docs = vault.notes.map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tags.join(" "),
      body: n.body,
    }));
    index.addAll(docs);
    indexedCount = vault.notes.length;
    return true;
  }

  function open() {
    if (!buildIndexIfNeeded()) return;
    strip.classList.add("open");
    strip.setAttribute("aria-hidden", "false");
    input.value = "";
    matches = [];
    cursor = 0;
    runSearch("");
    // defer focus until after the transition begins so the caret lands
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    strip.classList.remove("open");
    strip.setAttribute("aria-hidden", "true");
    getBodies()?.setGlowFilter(null);
    input.blur();
  }

  function isOpen() {
    return strip.classList.contains("open");
  }

  function invalidate() {
    index = null;
    indexedCount = 0;
  }

  function runSearch(q) {
    const trimmed = q.trim();
    if (!trimmed) {
      matches = [];
      getBodies()?.setGlowFilter(null);
      return;
    }
    if (!index) return;
    const results = index.search(trimmed, { prefix: true, fuzzy: 0.2 });
    matches = results.slice(0, 12);
    const bodies = getBodies();
    if (matches.length === 0) {
      bodies?.setGlowFilter(new Set());
      return;
    }
    bodies?.setGlowFilter(new Set(matches.map((r) => r.id)));
    cursor = 0;
    arcToMatch(0);
  }

  function arcToMatch(i) {
    const m = matches[i];
    if (!m) return;
    const pos = getBodies()?.positionOf(m.id);
    if (pos) onArc(pos);
  }

  input.addEventListener("input", () => runSearch(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (matches.length === 0) return;
      cursor = (cursor + 1) % matches.length;
      arcToMatch(cursor);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      cursor = (cursor - 1 + matches.length) % matches.length;
      arcToMatch(cursor);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[cursor];
      if (!m) return;
      close();
      onOpen(m.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (isOpen()) close();
      else open();
    }
  });

  return { open, close, isOpen, invalidate };
}
