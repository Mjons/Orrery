// Ideas drawer — the left-side panel that surfaces candidate ideas from
// the salience layer. Shows every surfaced-but-not-yet-promoted-or-
// discarded candidate. Per item: seed text, parent titles (clickable),
// three actions.
//
// Keyboard: `I` toggles the drawer. Esc closes. Shortcut handling is
// wired in main.js so the drawer doesn't intercept keys it shouldn't.
//
// Re-renders whenever the salience layer fires onChange. Cheap —
// typical surfaced list is small (<10).

export function createIdeasDrawer({
  getSurfaced, // () => [candidate, …]
  onPromote, // (candidate) => Promise
  onDiscard, // (candidate) => void
  onIgnore, // (candidate) => void
  onOpenParent, // (noteId) => void
  getDreamState, // () => { phase, poolSize } — Phase-aware drawer copy
  // (DREAM_ENGINE.md §11.7). When phase is warming/generating/playing,
  // the drawer shows a live "dreaming · N forming" indicator instead
  // of its empty state. Populates with survivors when phase ends.
}) {
  const drawer = document.getElementById("ideas-drawer");
  if (!drawer) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      refresh: () => {},
      isOpen: () => false,
    };
  }

  const closeBtn = drawer.querySelector(".drawer-close");
  const list = drawer.querySelector(".drawer-list");

  closeBtn?.addEventListener("click", close);

  // Event delegation for per-idea buttons + parent links.
  list.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".idea-item");
    if (!item) return;
    const id = item.dataset.candidateId;
    if (!id) return;
    const candidate = getSurfaced().find((c) => c.id === id);
    if (!candidate) return;

    const action = target.dataset.action;
    if (action === "promote") {
      onPromote?.(candidate);
    } else if (action === "discard") {
      onDiscard?.(candidate);
      refresh();
    } else if (action === "ignore") {
      onIgnore?.(candidate);
      markRead(item);
    } else if (target.dataset.parentId) {
      onOpenParent?.(target.dataset.parentId);
    }
  });

  function open() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    refresh();
    // Mark every item as read after a brief delay so the unread-dot
    // visually registers before disappearing.
    setTimeout(() => {
      const items = list.querySelectorAll(".idea-item[data-unread='true']");
      for (const el of items) markRead(el);
    }, 1200);
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

  function refresh() {
    const surfaced = getSurfaced();
    const dream = getDreamState ? getDreamState() : null;
    const dreaming =
      dream && dream.phase && dream.phase !== "discerning" ? dream : null;

    drawer.classList.toggle("has-items", surfaced.length > 0);
    drawer.classList.toggle("is-dreaming", !!dreaming);
    list.innerHTML = "";
    if (dreaming) {
      list.appendChild(renderDreamingStatus(dreaming));
    }
    for (const c of surfaced) list.appendChild(render(c));
  }

  // Live banner shown while a dream cycle is running. Replaces the
  // drawer's regular empty state with a visible sign-of-life so the
  // user knows the cycle is in progress, and a count of pool
  // candidates so it doesn't feel like a spinner.
  function renderDreamingStatus(dream) {
    const li = document.createElement("li");
    li.className = "idea-dream-status";
    const phaseLabel = dream.phase
      ? dream.phase[0].toUpperCase() + dream.phase.slice(1)
      : "Dreaming";
    const formed = Math.max(0, Number(dream.poolSize) || 0);
    const queued = Math.max(0, Number(dream.queueSize) || 0);
    // Two counts — "queued" is physics-level pairs waiting for the
    // model, "formed" is candidates the model has finished processing
    // and admitted to the pool. Together they show both the physics
    // throughput and the model throughput at a glance.
    const countsLine =
      queued > 0 ? `${queued} queued · ${formed} formed` : `${formed} formed`;
    li.innerHTML = `
      <p class="idea-dream-phase">${phaseLabel}</p>
      <p class="idea-dream-sub">
        ${countsLine} · survivors appear when the cycle ends
      </p>
    `;
    return li;
  }

  function render(c) {
    const li = document.createElement("li");
    li.className = "idea-item";
    li.dataset.candidateId = c.id;
    li.dataset.unread = c.readAt ? "false" : "true";
    li.style.position = "relative";

    const text = document.createElement("p");
    text.className = "idea-text";
    text.textContent = c.seedText;

    const parents = document.createElement("p");
    parents.className = "idea-parents";
    if (c.parentA) {
      parents.appendChild(parentLink(c.parentA));
    }
    if (c.parentA && c.parentB) {
      parents.appendChild(document.createTextNode(" · "));
    }
    if (c.parentB) {
      parents.appendChild(parentLink(c.parentB));
    }

    const score = document.createElement("p");
    score.className = "idea-score";
    score.textContent = scoreLabel(c);

    const actions = document.createElement("div");
    actions.className = "idea-actions";
    actions.appendChild(actionButton("Promote", "promote", "idea-btn-primary"));
    actions.appendChild(actionButton("Ignore", "ignore"));
    actions.appendChild(actionButton("Discard", "discard"));

    li.append(text, parents, score, actions);
    return li;
  }

  function parentLink(parent) {
    const a = document.createElement("a");
    a.textContent = parent.title;
    a.dataset.parentId = parent.id;
    a.href = "#";
    a.addEventListener("click", (e) => e.preventDefault(), { once: false });
    return a;
  }

  function actionButton(label, action, extra = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `idea-btn ${extra}`.trim();
    btn.dataset.action = action;
    btn.textContent = label;
    return btn;
  }

  function scoreLabel(c) {
    const parts = [];
    if (Number.isFinite(c.salience))
      parts.push(`salience ${c.salience.toFixed(2)}`);
    if (Number.isFinite(c.novelty))
      parts.push(`novelty ${c.novelty.toFixed(2)}`);
    if (Number.isFinite(c.reach)) parts.push(`reach ${c.reach.toFixed(2)}`);
    return parts.join(" · ");
  }

  function markRead(item) {
    item.dataset.unread = "false";
    const id = item.dataset.candidateId;
    const c = getSurfaced().find((c) => c.id === id);
    if (c && !c.readAt) c.readAt = Date.now();
  }

  return { open, close, toggle, refresh, isOpen };
}
