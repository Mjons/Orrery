// Weed drawer — list view of prune candidates. Per-row Keep / Archive /
// Delete; bulk "Keep all" and "Archive all" at the head. Bulk delete is
// deliberately absent — STATES.md §3 / BUILD_PLAN D6.6.3.
//
// Styled deliberately plain (no glass, no animation) so it doesn't try to
// be the ideas or tend drawer. It's the boring file-manager view of notes
// the system suspects are orphans.

export function createWeedDrawer({
  onKeep, // async (candidate) => void
  onArchive, // async (candidate) => void
  onDelete, // async (candidate) => void — confirmation already taken
  onOpenNote, // (noteId) => void
  onBulkKeep, // async () => void  — applies to current list
  onBulkArchive, // async () => void
}) {
  const drawer = document.getElementById("weed-drawer");
  if (!drawer) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      setCandidates: () => {},
      clear: () => {},
      count: () => 0,
    };
  }

  const closeBtn = drawer.querySelector(".drawer-close");
  const listEl = drawer.querySelector(".weed-list");
  const emptyEl = drawer.querySelector(".drawer-empty");
  const bulkKeepBtn = drawer.querySelector('[data-bulk="keep"]');
  const bulkArchiveBtn = drawer.querySelector('[data-bulk="archive"]');

  closeBtn?.addEventListener("click", close);

  let candidates = [];

  bulkKeepBtn?.addEventListener("click", async () => {
    if (!onBulkKeep || candidates.length === 0) return;
    bulkKeepBtn.disabled = true;
    try {
      await onBulkKeep(candidates.slice());
    } finally {
      bulkKeepBtn.disabled = false;
    }
  });
  bulkArchiveBtn?.addEventListener("click", async () => {
    if (!onBulkArchive || candidates.length === 0) return;
    bulkArchiveBtn.disabled = true;
    try {
      await onBulkArchive(candidates.slice());
    } finally {
      bulkArchiveBtn.disabled = false;
    }
  });

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
  function count() {
    return candidates.length;
  }

  function setCandidates(next) {
    candidates = Array.isArray(next) ? next.slice() : [];
    render();
  }
  function clear() {
    candidates = [];
    render();
  }

  function removeCandidate(c) {
    const i = candidates.findIndex((x) => x.id === c.id);
    if (i === -1) return;
    candidates.splice(i, 1);
    render();
  }

  function render() {
    const has = candidates.length > 0;
    drawer.classList.toggle("has-items", has);
    if (bulkKeepBtn) bulkKeepBtn.disabled = !has;
    if (bulkArchiveBtn) bulkArchiveBtn.disabled = !has;
    if (emptyEl) emptyEl.style.display = has ? "none" : "";
    listEl.innerHTML = "";
    if (!has) return;
    for (const c of candidates) listEl.appendChild(renderRow(c));
  }

  function renderRow(c) {
    const row = document.createElement("div");
    row.className = "weed-row";
    row.dataset.candidateId = c.id;

    const title = document.createElement("a");
    title.className = "weed-title";
    title.href = "#";
    title.textContent = c.title || "(untitled)";
    title.addEventListener("click", (e) => {
      e.preventDefault();
      onOpenNote?.(c.id);
    });

    const path = document.createElement("div");
    path.className = "weed-path";
    path.textContent = c.path || "";

    const meta = document.createElement("div");
    meta.className = "weed-meta";
    meta.textContent = [c.reason, humanMtime(c.mtime)]
      .filter(Boolean)
      .join(" · ");

    const actions = document.createElement("div");
    actions.className = "weed-actions";
    const keepBtn = actionBtn("Keep", "weed-btn-keep", () =>
      handleKeep(c, row),
    );
    const archiveBtn = actionBtn("Archive", "", () => handleArchive(c, row));
    const deleteBtn = actionBtn("Delete", "weed-btn-delete", () =>
      handleDelete(c, row),
    );
    actions.append(keepBtn, archiveBtn, deleteBtn);

    row.append(title, path, meta, actions);
    return row;
  }

  function actionBtn(label, extra, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `weed-btn ${extra}`.trim();
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  async function handleKeep(c, row) {
    row.dataset.state = "applying";
    try {
      if (onKeep) await onKeep(c);
      removeCandidate(c);
    } catch (err) {
      console.error("[bz] weed keep failed", err);
      row.dataset.state = "error";
    }
  }

  async function handleArchive(c, row) {
    row.dataset.state = "applying";
    try {
      if (onArchive) await onArchive(c);
      removeCandidate(c);
    } catch (err) {
      console.error("[bz] weed archive failed", err);
      row.dataset.state = "error";
    }
  }

  async function handleDelete(c, row) {
    // Per-file confirmation is a hard requirement (D6.6.2). The spec
    // explicitly frames delete as "uncomfortable by design" so use
    // window.confirm — a native modal reads more serious than a toast.
    const ok = window.confirm(
      `Delete "${c.title || c.path}" permanently?\n\nThis removes the file from disk. No undo.`,
    );
    if (!ok) return;
    row.dataset.state = "applying";
    try {
      if (onDelete) await onDelete(c);
      removeCandidate(c);
    } catch (err) {
      console.error("[bz] weed delete failed", err);
      row.dataset.state = "error";
    }
  }

  return {
    open,
    close,
    toggle,
    isOpen,
    setCandidates,
    clear,
    count,
  };
}

function humanMtime(mtime) {
  if (!mtime) return "";
  const d = new Date(mtime);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
