// Hushed drawer — list view of notes the user has hushed (HUSH.md).
// Per-row Restore brings the body back into the field. Title click
// opens the note panel (the body stays gone until Restore is hit).
//
// Pulls live from the vault every time it renders so it always
// reflects the current hushed-set without needing change events.

export function createHushedDrawer({
  getVault,
  onRestore, // async (note) => void  — flips frontmatter + respawns
  onOpenNote, // (noteId) => void
}) {
  const drawer = document.getElementById("hushed-drawer");
  if (!drawer) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      refresh: () => {},
      count: () => 0,
    };
  }

  const closeBtn = drawer.querySelector(".drawer-close");
  const listEl = drawer.querySelector(".hushed-list");
  const emptyEl = drawer.querySelector(".drawer-empty");

  closeBtn?.addEventListener("click", close);

  function open() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    render();
  }
  function close() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  function toggle() {
    if (isOpen()) close();
    else open();
  }
  function isOpen() {
    return drawer.classList.contains("open");
  }

  function getHushedNotes() {
    const vault = getVault?.();
    if (!vault) return [];
    return vault.notes
      .filter((n) => n.frontmatter && n.frontmatter.hushed)
      .sort((a, b) => {
        const ta = Date.parse(a.frontmatter.hushed_at || "") || 0;
        const tb = Date.parse(b.frontmatter.hushed_at || "") || 0;
        return tb - ta;
      });
  }

  function count() {
    return getHushedNotes().length;
  }

  function refresh() {
    if (!isOpen()) return;
    render();
  }

  function render() {
    const notes = getHushedNotes();
    const has = notes.length > 0;
    drawer.classList.toggle("has-items", has);
    if (emptyEl) emptyEl.style.display = has ? "none" : "";
    listEl.innerHTML = "";
    if (!has) return;
    for (const n of notes) listEl.appendChild(renderRow(n));
  }

  function renderRow(note) {
    const row = document.createElement("div");
    row.className = "hushed-row";
    row.dataset.noteId = note.id;

    const title = document.createElement("a");
    title.className = "hushed-title";
    title.href = "#";
    title.textContent = note.title || "(untitled)";
    title.addEventListener("click", (e) => {
      e.preventDefault();
      onOpenNote?.(note.id);
    });

    const path = document.createElement("div");
    path.className = "hushed-path";
    path.textContent = note.path || "";

    const meta = document.createElement("div");
    meta.className = "hushed-meta";
    const when = humanWhen(note.frontmatter?.hushed_at);
    const reason = note.frontmatter?.hushed_reason;
    meta.textContent = [when, reason].filter(Boolean).join(" · ");

    const actions = document.createElement("div");
    actions.className = "hushed-actions";
    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "hushed-btn";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", async () => {
      if (!onRestore) return;
      row.dataset.state = "applying";
      try {
        await onRestore(note);
        // refresh() will be called by the caller via the hush handler;
        // belt-and-suspenders re-render in case it isn't.
        render();
      } catch (err) {
        console.error("[bz] hushed restore failed", err);
        row.dataset.state = "error";
      }
    });
    actions.append(restoreBtn);

    row.append(title, path, meta, actions);
    return row;
  }

  return {
    open,
    close,
    toggle,
    isOpen,
    refresh,
    count,
  };
}

// "2 weeks ago" / "yesterday" / "just now" — coarse, never precise.
function humanWhen(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const delta = Date.now() - t;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (delta < 5 * min) return "just now";
  if (delta < hour) return `${Math.round(delta / min)} min ago`;
  if (delta < day) return `${Math.round(delta / hour)} h ago`;
  if (delta < 2 * day) return "yesterday";
  if (delta < 14 * day) return `${Math.round(delta / day)} days ago`;
  if (delta < 60 * day) return `${Math.round(delta / (7 * day))} weeks ago`;
  return `${Math.round(delta / (30 * day))} months ago`;
}
