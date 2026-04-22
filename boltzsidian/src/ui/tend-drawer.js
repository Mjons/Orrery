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

// TEND_BULK_CRASH.md §5D + TEND_STAMP_MISMATCH.md §7.5 — yield
// between accepts so rAF-gated rebuilds fire, layout can update,
// and GC has time to reclaim. Chill tempo matches LLM cadence;
// fast is the legacy sprint for small batches on beefy machines.
const BATCH_CHUNK = 1;
const PACE_PAUSE_MS = {
  fast: 12, // ~80 items/s, old default, risky on 1000+
  chill: 250, // ~4 items/s, matches polish turnaround, safe at any scale
  manual: 0, // not used — Accept-all hidden; items done one at a time
};
function pauseForPace(pace) {
  return PACE_PAUSE_MS[pace] ?? PACE_PAUSE_MS.chill;
}

// TEND_BULK_CRASH.md §5E — only render this many proposals as DOM
// at any given time. On a 1000+ proposal batch, keeping the full
// list in the DOM means every paint / layout / scroll is linear
// against 1000+ items. Cap at 100 visible, refill when the visible
// set drops below REFILL_THRESHOLD. Overflow shown as a "+N more"
// hint so the user knows more is pending.
const RENDER_CAP = 100;
const REFILL_THRESHOLD = 40;

export function createTendDrawer({
  onAccept, // async (proposal) => void — apply the proposal
  onReject, // async (proposal) => void — stamp rejected
  onOpenNote, // (noteId) => void — drawer links open the note
  // Fire at the start / end of a bulk-accept loop. Lets main.js
  // suspend background work (polish pipeline, salience scanner)
  // that would otherwise compete for the main thread during a
  // long batch.
  onBulkStart,
  onBulkEnd,
  // TEND_STAMP_MISMATCH.md §7.5 — "fast" | "chill" | "manual".
  // Drives the per-accept pause in the bulk loop. `manual` hides
  // the Accept-all button entirely so the user clicks each item.
  // Returns the live setting so a mid-session change takes effect
  // on the next bulk click without a restart.
  getBulkPace = () => "chill",
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
  const clearBtn = drawer.querySelector(".drawer-clear");
  const groupsEl = drawer.querySelector(".tend-groups");
  closeBtn?.addEventListener("click", close);
  clearBtn?.addEventListener("click", () => {
    // Dump every pending proposal and reset review counters so the
    // user can hit T again for a fresh scan. Cheap — proposals[] is
    // in-memory; clear() re-renders to the empty state.
    if (proposals.length === 0) return;
    if (proposals.length > 50) {
      if (
        !confirm(
          `Clear ${proposals.length} pending proposals? They'll come back the next time you press T.`,
        )
      )
        return;
    }
    clear();
  });

  // Keep pointer events inside the drawer from reaching the window-
  // level dream.noteInput() listener. A running dream cycle would
  // otherwise wake on the first Accept click — and if the user hit
  // "Accept all," the 2 s wake ramp fires a Morning Report modal
  // mid-batch, which feels like the entire experience resetting.
  // Button clicks still fire normally; `click` is a separate event
  // from `pointerdown` so we're only blocking the wake trigger.
  drawer.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
    },
    true,
  );

  // In-memory state. Reset on every setProposals call.
  let proposals = [];
  // Per-group count of items the user has individually reviewed.
  const reviewedByPass = new Map();
  // TEND_BULK_CRASH.md §5E — which proposal ids are currently in the
  // DOM. proposals[] contains ALL pending; renderedIds is the visible
  // subset (≤ RENDER_CAP). Topped up by topUp() when the visible
  // count drops below REFILL_THRESHOLD.
  const renderedIds = new Set();
  // TEND_BULK_CONCURRENCY.md — single-flight bulk lifecycle. Every
  // bulk-accept click mints a fresh `bulkRunId` and records it as
  // `activeBulkId`. The loop checks `activeBulkId !== myId` on every
  // iteration and aborts if something else invalidated the list
  // (Clear / setProposals) or started a newer bulk. Null = no bulk
  // in progress; a number = this bulk owns the loop.
  let bulkRunId = 0;
  let activeBulkId = null;

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
    // TEND_BULK_CONCURRENCY.md — invalidate any in-flight bulk loop
    // so it doesn't keep stamping the old list while the new one
    // renders. Next iteration's abort check returns to the loop's
    // `finally` block and everything cleans up.
    activeBulkId = null;
    proposals = Array.isArray(next) ? next.slice() : [];
    reviewedByPass.clear();
    render();
  }

  function clear() {
    activeBulkId = null;
    proposals = [];
    reviewedByPass.clear();
    render();
  }

  function count() {
    return proposals.length;
  }

  // TEND_BULK_CONCURRENCY.md §3.3 — drawer-wide bulk lock. While a
  // bulk is running, no OTHER group's Accept-all should be live
  // either. On end, restore each button's disabled state to reflect
  // its group's review count (same logic as initial render).
  function disableAllBulkButtons() {
    for (const b of drawer.querySelectorAll(".tend-bulk-btn")) {
      b.disabled = true;
    }
  }
  function restoreBulkButtons() {
    for (const b of drawer.querySelectorAll(".tend-bulk-btn")) {
      const passId = b.closest(".tend-group")?.dataset.pass;
      if (!passId) continue;
      const reviewed = reviewedByPass.get(passId) || 0;
      b.disabled = reviewed < BULK_UNLOCK_MIN;
    }
  }

  // Re-render without resetting review state. Used by the enrichment
  // pipeline when a proposal's reason has been polished by the model
  // mid-review — we want the drawer to show the new text without
  // re-locking the bulk-accept button behind another round of
  // individual reviews.
  //
  // TEND_BULK_CRASH.md §polish-refresh — when called with a specific
  // proposal, update ONLY that proposal's reason cell in place. Full
  // re-render is catastrophically expensive on large batches (polish
  // runs for minutes on a 1000+ proposal pass and fires onUpdate
  // after every model call). Fallback to full render only when the
  // caller didn't pass a proposal.
  function refresh(proposal) {
    if (!proposal) {
      render();
      return;
    }
    const row = rowFor(proposal);
    if (!row) return; // removed already, nothing to update
    const reasonEl = row.querySelector(".tend-item-reason");
    if (!reasonEl) return;
    if (reasonEl.textContent !== proposal.reason) {
      reasonEl.textContent = proposal.reason || "";
    }
    if (proposal.reasonBackend && proposal.reasonBackend !== "template") {
      reasonEl.dataset.polished = proposal.reasonBackend;
    } else {
      delete reasonEl.dataset.polished;
    }
  }

  function render() {
    drawer.classList.toggle("has-items", proposals.length > 0);
    groupsEl.innerHTML = "";
    renderedIds.clear();
    if (proposals.length === 0) return;

    // TEND_BULK_CRASH.md §5E — only the first RENDER_CAP proposals
    // land in the DOM; the rest stay in the proposals[] array and
    // get rendered later via topUp() as accepts drain the visible
    // pool.
    const visible = proposals.slice(0, RENDER_CAP);

    // Bucket by pass; preserve incoming order within each.
    const buckets = new Map();
    for (const p of visible) {
      if (!buckets.has(p.pass)) buckets.set(p.pass, []);
      buckets.get(p.pass).push(p);
      renderedIds.add(p.id);
    }

    // Render sections in the canonical PASS_META order so it looks the
    // same every run.
    for (const { id, label } of PASS_META) {
      const items = buckets.get(id);
      if (!items || items.length === 0) continue;
      groupsEl.appendChild(renderGroup(id, label, items));
    }

    renderPendingHint();
  }

  // TEND_BULK_CRASH.md §5E — "N more pending" footer shown below all
  // groups when proposals[] has items that aren't in the DOM.
  function renderPendingHint() {
    let hint = groupsEl.querySelector(".tend-pending-hint");
    const pending = proposals.length - renderedIds.size;
    if (pending <= 0) {
      if (hint) hint.remove();
      return;
    }
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "tend-pending-hint";
      groupsEl.appendChild(hint);
    } else if (hint.parentNode !== groupsEl || hint.nextSibling) {
      // Keep it at the bottom if the DOM shifted.
      groupsEl.appendChild(hint);
    }
    hint.textContent = `+${pending} more pending — accept some of these to reveal the rest.`;
  }

  // TEND_BULK_CRASH.md §5E — refill the visible pool when the user
  // has drained it below REFILL_THRESHOLD. Appends new items into
  // their respective groups (creating groups as needed) without
  // touching already-rendered items. O(refill count) DOM work.
  function topUp() {
    if (renderedIds.size >= REFILL_THRESHOLD) return;
    if (renderedIds.size >= proposals.length) return; // nothing left

    const slots = RENDER_CAP - renderedIds.size;
    const toAdd = [];
    for (const p of proposals) {
      if (toAdd.length >= slots) break;
      if (!renderedIds.has(p.id)) toAdd.push(p);
    }
    if (toAdd.length === 0) return;

    // Group the incoming batch by pass; render once per pass.
    const byPass = new Map();
    for (const p of toAdd) {
      if (!byPass.has(p.pass)) byPass.set(p.pass, []);
      byPass.get(p.pass).push(p);
    }

    // Walk PASS_META order so a newly-created group lands in the
    // canonical slot. Append to existing groups if they still exist.
    for (const { id, label } of PASS_META) {
      const items = byPass.get(id);
      if (!items || items.length === 0) continue;
      let wrap = drawer.querySelector(
        `.tend-group[data-pass="${cssEscape(id)}"]`,
      );
      if (!wrap) {
        wrap = renderGroup(id, label, items);
        // Insert before the pending hint so the hint stays at the bottom.
        const hint = groupsEl.querySelector(".tend-pending-hint");
        if (hint) groupsEl.insertBefore(wrap, hint);
        else groupsEl.appendChild(wrap);
      } else {
        for (const p of items) {
          wrap.appendChild(renderItem(p));
        }
      }
      for (const p of items) renderedIds.add(p.id);
      const countEl = wrap.querySelector(".tend-group-count");
      if (countEl) {
        const live = wrap.querySelectorAll(".tend-item").length;
        countEl.textContent = String(live);
      }
    }

    renderPendingHint();
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
    // TEND_STAMP_MISMATCH.md §7.5 — Manual pace hides the button
    // outright. The user opted into clicking each Accept individually.
    if (getBulkPace() === "manual") {
      bulk.style.display = "none";
    }
    bulk.addEventListener("click", async () => {
      // TEND_BULK_CONCURRENCY.md §3.1 — single-flight lock. A second
      // bulk (same group OR different group) while one is running
      // would otherwise spawn a parallel loop; both would mutate the
      // shared proposals array and the user would see the count
      // tick down multiple times per accept. Gate at entry.
      if (activeBulkId != null) return;
      const myId = ++bulkRunId;
      activeBulkId = myId;
      disableAllBulkButtons();
      try {
        if (onBulkStart) onBulkStart();
      } catch (err) {
        console.warn("[bz] onBulkStart threw", err);
      }
      try {
        // Read pending set from live proposals[] at click time, not
        // from `items` captured at render. With a rendered cap,
        // `items` is only the visible slice; the user expects
        // Accept-all to process EVERY proposal of this pass in the
        // batch, including pending ones that topUp hasn't shown yet.
        const snapshot = proposals.filter((p) => p.pass === passId);
        // Read pace ONCE at click time — mid-batch pace changes
        // would surprise the user. Chill is the default (250 ms);
        // fast is the old sprint.
        const pauseMs = pauseForPace(getBulkPace());
        for (let i = 0; i < snapshot.length; i++) {
          // Abort check: Clear / setProposals / a newer bulk-click
          // all bump activeBulkId. If that happened, stop cleanly
          // so the finally block restores button state.
          if (activeBulkId !== myId) break;
          await doAccept(snapshot[i]);
          if ((i + 1) % BATCH_CHUNK === 0) {
            // Double yield: rAF guarantees a paint frame, setTimeout
            // after rAF gives GC + idle tasks (polish, salience) a
            // turn before we kick off the next accept.
            await new Promise((resolve) => {
              requestAnimationFrame(() => setTimeout(resolve, pauseMs));
            });
          }
        }
      } finally {
        if (activeBulkId === myId) activeBulkId = null;
        restoreBulkButtons();
        try {
          if (onBulkEnd) onBulkEnd();
        } catch (err) {
          console.warn("[bz] onBulkEnd threw", err);
        }
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
    // TEND_BULK_CONCURRENCY.md §3.4 — guard against stale items
    // from an aborted bulk loop. If the proposal isn't in the
    // current list, a Clear or setProposals happened between the
    // loop's abort-check and this call; skip cleanly.
    if (!proposals.includes(proposal)) return;
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

  // TEND_BULK_CRASH.md §5A — incremental DOM removal instead of a
  // full re-render. At 1280 pending proposals, re-rendering on every
  // accept thrashes the DOM (~7500 nodes destroyed+created per
  // accept, 2+ million over a batch). Removing just the accepted
  // row is O(1) work and handles the same 1280-item batch in a few
  // thousand DOM ops instead of millions.
  function removeProposal(p) {
    const i = proposals.findIndex((x) => x.id === p.id);
    if (i === -1) return;
    proposals.splice(i, 1);
    renderedIds.delete(p.id);

    const row = rowFor(p);
    const groupWrap = row?.closest(".tend-group") || null;
    if (row) row.remove();

    // Decrement the group's count span, and drop the whole group
    // if it's now empty. The group's dataset.pass identifies which
    // pass it belongs to so we don't need to re-bucket.
    if (groupWrap) {
      const remaining = groupWrap.querySelectorAll(".tend-item").length;
      const countEl = groupWrap.querySelector(".tend-group-count");
      if (countEl) countEl.textContent = String(remaining);
      if (remaining === 0) groupWrap.remove();
    }

    // Top up the visible pool from pending proposals once it drains
    // below the refill threshold.
    topUp();
    renderPendingHint();

    // Toggle `has-items` off once the whole list drained.
    if (proposals.length === 0) {
      drawer.classList.remove("has-items");
    }
  }

  function markReviewed(passId) {
    const before = reviewedByPass.get(passId) || 0;
    reviewedByPass.set(passId, before + 1);
    // TEND_BULK_CRASH.md §5A broke the Accept-all unlock: removing
    // the per-accept full re-render meant the bulk button's
    // `disabled` state never recomputed. Update it in place when the
    // reviewed count crosses the threshold.
    if (before + 1 >= BULK_UNLOCK_MIN) {
      const wrap = drawer.querySelector(
        `.tend-group[data-pass="${cssEscape(passId)}"]`,
      );
      const btn = wrap?.querySelector(".tend-bulk-btn");
      if (btn && btn.disabled) {
        btn.disabled = false;
        btn.title = "Accept every remaining suggestion in this group.";
      }
    }
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
