// Tend proposals drawer — left-side panel for housekeeping suggestions.
//
// Structurally mirrors ideas-drawer.js but with:
//   - amber/janitorial accent
//   - proposals grouped by pass (five sections max)
//   - bulk "Accept all" per group, enabled only after the user has
//     individually reviewed at least one item in that group (the
//     "prove you looked at the list first" guard from STATES.md §7.2)
//
// The module holds the current proposals list in memory. Each action
// (Accept, Reject, Skip) removes the row. Accept is async — it runs the
// proposal through tend-apply.js which uses the Phase 2 saver.

import { PASSES } from "../layers/tend.js";

// Human labels for each pass, in display order.
const PASS_META = [
  { id: PASSES.TAG_INFER, label: "Tag inference" },
  { id: PASSES.OBVIOUS_LINK, label: "Obvious links" },
  { id: PASSES.TITLE_COLLISION, label: "Duplicate titles" },
  { id: PASSES.FM_NORMALISE, label: "Frontmatter" },
  { id: PASSES.STUB, label: "Stubs" },
];

// Minimum individual reviews per group before the "Accept all" button
// unlocks. STATES.md §7.2: require a user to have eyeballed at least
// one item so the bulk action isn't a one-click footgun.
const BULK_UNLOCK_MIN = 1;

export function createTendDrawer({
  onAccept, // async (proposal) => void — apply the proposal
  onReject, // async (proposal) => void — stamp rejected
  onOpenNote, // (noteId) => void — drawer links open the note
}) {
  const drawer = document.getElementById("tend-drawer");
  if (!drawer) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      setProposals: () => {},
      clear: () => {},
      count: () => 0,
    };
  }

  const closeBtn = drawer.querySelector(".drawer-close");
  const groupsEl = drawer.querySelector(".tend-groups");
  closeBtn?.addEventListener("click", close);

  // In-memory state. Reset on every setProposals call.
  let proposals = [];
  // Per-group count of items the user has individually reviewed.
  const reviewedByPass = new Map();

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

  // Replace the proposals list. Typically called once per Tend run.
  function setProposals(next) {
    proposals = Array.isArray(next) ? next.slice() : [];
    reviewedByPass.clear();
    render();
  }

  function clear() {
    proposals = [];
    reviewedByPass.clear();
    render();
  }

  function count() {
    return proposals.length;
  }

  // Re-render without resetting review state. Used by the enrichment
  // pipeline when a proposal's reason has been polished by the model
  // mid-review — we want the drawer to show the new text without
  // re-locking the bulk-accept button behind another round of
  // individual reviews.
  function refresh() {
    render();
  }

  function render() {
    drawer.classList.toggle("has-items", proposals.length > 0);
    groupsEl.innerHTML = "";
    if (proposals.length === 0) return;

    // Bucket by pass; preserve incoming order within each.
    const buckets = new Map();
    for (const p of proposals) {
      if (!buckets.has(p.pass)) buckets.set(p.pass, []);
      buckets.get(p.pass).push(p);
    }

    // Render sections in the canonical PASS_META order so it looks the
    // same every run.
    for (const { id, label } of PASS_META) {
      const items = buckets.get(id);
      if (!items || items.length === 0) continue;
      groupsEl.appendChild(renderGroup(id, label, items));
    }
  }

  function renderGroup(passId, label, items) {
    const wrap = document.createElement("div");
    wrap.className = "tend-group";
    wrap.dataset.pass = passId;

    const head = document.createElement("div");
    head.className = "tend-group-head";
    const nameSpan = document.createElement("span");
    nameSpan.innerHTML = `${escapeHtml(label)} <span class="tend-group-count">${items.length}</span>`;
    const bulk = document.createElement("button");
    bulk.type = "button";
    bulk.className = "tend-bulk-btn";
    bulk.textContent = "Accept all";
    const reviewed = reviewedByPass.get(passId) || 0;
    bulk.disabled = reviewed < BULK_UNLOCK_MIN;
    bulk.title = bulk.disabled
      ? `Review at least ${BULK_UNLOCK_MIN} item${BULK_UNLOCK_MIN === 1 ? "" : "s"} individually first.`
      : "Accept every remaining suggestion in this group.";
    bulk.addEventListener("click", async () => {
      bulk.disabled = true;
      for (const p of items.slice()) {
        await doAccept(p);
      }
    });
    head.append(nameSpan, bulk);
    wrap.appendChild(head);

    for (const p of items) wrap.appendChild(renderItem(p));
    return wrap;
  }

  function renderItem(proposal) {
    const li = document.createElement("div");
    li.className = "tend-item";
    li.dataset.proposalId = proposal.id;

    const diff = document.createElement("div");
    diff.className = "tend-item-diff";
    diff.textContent = diffLabel(proposal);

    const target = document.createElement("p");
    target.className = "tend-item-target";
    if (proposal.noteId) {
      const a = document.createElement("a");
      a.textContent = proposal.noteTitle || proposal.notePath || "(untitled)";
      a.href = "#";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        onOpenNote?.(proposal.noteId);
      });
      target.appendChild(a);
      if (proposal.notePath) {
        const path = document.createElement("span");
        path.style.color = "var(--text-faint)";
        path.style.marginLeft = "6px";
        path.style.fontSize = "11px";
        path.textContent = proposal.notePath;
        target.appendChild(path);
      }
    }

    const reason = document.createElement("p");
    reason.className = "tend-item-reason";
    // Data attribute drives the optional "polished" tint — CSS adds a
    // soft accent border-left so the user can see which reasons the
    // model has rephrased and which are still rule-derived. The fact
    // content is unchanged either way; the marker is trust UI per
    // MODEL_SURFACES.md §1.2.
    if (proposal.reasonBackend && proposal.reasonBackend !== "template") {
      reason.dataset.polished = proposal.reasonBackend;
    }
    reason.textContent = proposal.reason || "";

    const actions = document.createElement("div");
    actions.className = "tend-item-actions";
    const acceptBtn = actionBtn("Accept", "tend-btn-primary", () =>
      doAccept(proposal),
    );
    const rejectBtn = actionBtn("Reject", "", () => doReject(proposal));
    const skipBtn = actionBtn("Skip", "", () => doSkip(proposal));
    actions.append(acceptBtn, rejectBtn, skipBtn);

    li.append(diff, target, reason, actions);
    return li;
  }

  function actionBtn(label, extra, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tend-btn ${extra}`.trim();
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  async function doAccept(proposal) {
    const row = rowFor(proposal);
    if (row) row.dataset.state = "applying";
    markReviewed(proposal.pass);
    try {
      if (onAccept) await onAccept(proposal);
      removeProposal(proposal);
    } catch (err) {
      console.error("[bz] tend accept failed", err);
      if (row) row.dataset.state = "error";
    }
  }

  async function doReject(proposal) {
    markReviewed(proposal.pass);
    try {
      if (onReject) await onReject(proposal);
    } catch (err) {
      console.warn("[bz] tend reject stamp failed", err);
    }
    removeProposal(proposal);
  }

  function doSkip(proposal) {
    // Skip = remove from the current-session list without stamping. The
    // next Tend run will re-surface it.
    markReviewed(proposal.pass);
    removeProposal(proposal);
  }

  function removeProposal(p) {
    const i = proposals.findIndex((x) => x.id === p.id);
    if (i === -1) return;
    proposals.splice(i, 1);
    render();
  }

  function markReviewed(passId) {
    reviewedByPass.set(passId, (reviewedByPass.get(passId) || 0) + 1);
  }

  function rowFor(proposal) {
    return drawer.querySelector(
      `.tend-item[data-proposal-id="${cssEscape(proposal.id)}"]`,
    );
  }

  return {
    open,
    close,
    toggle,
    isOpen,
    setProposals,
    refresh,
    clear,
    count,
  };
}

// One-line diff-style summary for each proposal, shown in the monospace
// slot above the reason. Concrete about what *will happen* if Accept.
function diffLabel(p) {
  switch (p.pass) {
    case PASSES.TAG_INFER:
      return `+ ${(p.tags || []).map((t) => `#${t}`).join(" ")}`;
    case PASSES.OBVIOUS_LINK:
      return `+ [[${p.linkTargetTitle || "…"}]]`;
    case PASSES.TITLE_COLLISION:
      return `⚠ duplicate of "${p.duplicateOfTitle || "…"}"`;
    case PASSES.FM_NORMALISE:
      return `~ ${(p.missingFields || []).join(", ")}`;
    case PASSES.STUB:
      return `⚠ stub (${p.bodyWords ?? "?"} words)`;
    default:
      return "—";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
