// Batch-link picker — small floating modal for choosing a target
// note to link an entire cluster against. BATCH_LINK.md §3.
//
// Invoked by right-clicking a constellation. The picker shows a
// single input; typing filters vault notes by title prefix/substring.
// ↑ ↓ navigate the result list, Enter commits, Esc cancels.
//
// Returns a selected Note via the onChoose callback; the caller is
// responsible for the actual write loop (main.js applyBatchLink).

const MAX_RESULTS = 8;

export function createBatchLinkPicker({ getVault, onChoose }) {
  const overlay = document.createElement("div");
  overlay.id = "batch-link-picker";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "60", // above constellations (5), labels (6), panel (40)
    background: "rgba(0, 0, 0, 0.35)",
    backdropFilter: "blur(4px)",
    pointerEvents: "auto",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(520px, 92vw)",
    background: "rgba(20, 22, 30, 0.92)",
    border: "1px solid rgba(138, 180, 255, 0.2)",
    borderRadius: "10px",
    padding: "18px 20px 14px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });

  const heading = document.createElement("p");
  heading.className = "batch-link-heading";
  Object.assign(heading.style, {
    margin: "0",
    fontSize: "11px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(215, 219, 228, 0.55)",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Link to…";
  input.spellcheck = false;
  input.autocomplete = "off";
  Object.assign(input.style, {
    background: "transparent",
    border: "0",
    borderBottom: "1px solid rgba(138, 180, 255, 0.3)",
    color: "#e8eaf0",
    fontSize: "16px",
    outline: "none",
    padding: "6px 0",
    caretColor: "#8ab4ff",
  });

  const list = document.createElement("div");
  list.className = "batch-link-list";
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    maxHeight: "260px",
    overflowY: "auto",
    fontSize: "13px",
  });

  const footer = document.createElement("p");
  footer.className = "batch-link-hint";
  Object.assign(footer.style, {
    margin: "0",
    fontSize: "10px",
    letterSpacing: "0.06em",
    color: "rgba(215, 219, 228, 0.4)",
    textTransform: "uppercase",
  });
  footer.innerHTML =
    "<b>↑ ↓</b> navigate · <b>enter</b> link · <b>esc</b> cancel";

  card.append(heading, input, list, footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Click on backdrop (not card) closes without committing.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  // Stop mouse events on the card from reaching the canvas behind.
  card.addEventListener("click", (e) => e.stopPropagation());

  let currentCluster = null;
  let matches = [];
  let cursor = 0;

  function open(cluster, { title = "Link all members to" } = {}) {
    currentCluster = cluster;
    heading.textContent = `${title} · ${cluster?.noteIds?.length ?? 0} note${(cluster?.noteIds?.length ?? 0) === 1 ? "" : "s"}`;
    overlay.style.display = "flex";
    input.value = "";
    matches = [];
    cursor = 0;
    renderList();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    overlay.style.display = "none";
    currentCluster = null;
    matches = [];
    input.value = "";
    input.blur();
  }

  function isOpen() {
    return overlay.style.display === "flex";
  }

  function filterNotes(q) {
    const vault = getVault();
    if (!vault) return [];
    const query = q.trim().toLowerCase();
    if (!query) {
      // Seed the list with a handful of same-root notes so the user
      // sees what's available before typing. Prefer the cluster's
      // dominant root.
      const rootId = dominantRootOf(currentCluster, vault);
      const pool = vault.notes.filter((n) => !rootId || n.rootId === rootId);
      return pool.slice(0, MAX_RESULTS);
    }
    const scored = [];
    for (const n of vault.notes) {
      const t = (n.title || "").toLowerCase();
      if (!t) continue;
      let score = 0;
      if (t.startsWith(query)) score = 100;
      else if (t.includes(` ${query}`)) score = 80;
      else if (t.includes(query)) score = 60;
      else continue;
      scored.push({ note: n, score });
    }
    scored.sort(
      (a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title),
    );
    return scored.slice(0, MAX_RESULTS).map((s) => s.note);
  }

  function renderList() {
    list.innerHTML = "";
    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "batch-link-empty";
      Object.assign(empty.style, {
        padding: "8px 0",
        color: "rgba(215, 219, 228, 0.4)",
        fontSize: "12px",
      });
      empty.textContent = input.value.trim()
        ? `No note titled "${input.value.trim()}". Create it, then try again.`
        : "Start typing a note title.";
      list.appendChild(empty);
      return;
    }
    for (let i = 0; i < matches.length; i++) {
      const n = matches[i];
      const row = document.createElement("div");
      row.className = "batch-link-row";
      row.dataset.idx = String(i);
      Object.assign(row.style, {
        padding: "6px 8px",
        borderRadius: "4px",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        gap: "10px",
        color: i === cursor ? "#ffffff" : "rgba(215, 219, 228, 0.75)",
        background: i === cursor ? "rgba(138, 180, 255, 0.12)" : "transparent",
      });
      const title = document.createElement("span");
      title.textContent = n.title || "(untitled)";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      title.style.whiteSpace = "nowrap";
      const meta = document.createElement("span");
      meta.style.fontSize = "10px";
      meta.style.letterSpacing = "0.06em";
      meta.style.color = "rgba(215, 219, 228, 0.4)";
      meta.style.textTransform = "uppercase";
      meta.textContent = n.rootId ? n.rootId : "";
      row.append(title, meta);
      row.addEventListener("mouseenter", () => {
        cursor = i;
        renderList();
      });
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        commit(n);
      });
      list.appendChild(row);
    }
  }

  function commit(note) {
    if (!currentCluster || !note) return close();
    const cluster = currentCluster;
    close();
    if (onChoose) onChoose(cluster, note);
  }

  input.addEventListener("input", () => {
    matches = filterNotes(input.value);
    cursor = 0;
    renderList();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!matches.length) return;
      cursor = (cursor + 1) % matches.length;
      renderList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!matches.length) return;
      cursor = (cursor - 1 + matches.length) % matches.length;
      renderList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const pick = matches[cursor];
      if (pick) commit(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else {
      e.stopPropagation(); // keep typing from triggering global hotkeys
    }
  });

  function dispose() {
    overlay.remove();
  }

  return { open, close, isOpen, dispose };
}

function dominantRootOf(cluster, vault) {
  if (!cluster?.noteIds || cluster.noteIds.length === 0) return null;
  const counts = new Map();
  for (const id of cluster.noteIds) {
    const n = vault.byId?.get(id);
    if (!n?.rootId) continue;
    counts.set(n.rootId, (counts.get(n.rootId) || 0) + 1);
  }
  let top = null;
  let topCount = 0;
  for (const [rid, c] of counts) {
    if (c > topCount) {
      top = rid;
      topCount = c;
    }
  }
  return top;
}
