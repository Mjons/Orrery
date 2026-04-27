// Cmd+K search. Minisearch index built on first open; bodies dim to non-matches
// and the top hit draws the camera. ↑↓ walks the ranked list. Enter opens it.
//
// Plan mode (CONNECT_QUERY.md v1) — when the input starts with a verb
// like `connect …` / `link …` / `weave …`, the strip switches to a
// preview pane with per-note checkboxes and an Apply button. The
// caller (main.js) owns the actual write loop via `onConnectQuery`.

import MiniSearch from "minisearch";
import {
  parse as parsePlan,
  resolve as resolvePlan,
  cliqueEdgeCount,
  CLIQUE_CAP,
} from "../layers/connect-query.js";

export function createSearch({
  getVault,
  getBodies,
  onArc,
  onOpen,
  onConnectQuery,
  modelFace,
  // SLASH_COMMANDS.md v1 — typing `/` flips the strip into command mode.
  // Each command: { name, args, description, run(rest) }. Returning
  // `false` from run keeps the strip open after execution.
  commands = [],
}) {
  const strip = document.getElementById("search-strip");
  const input = strip.querySelector("input");
  const summaryEl = strip.querySelector(".search-summary");
  const commandsEl = strip.querySelector(".search-commands");
  const hintEl = strip.querySelector(".search-hint");
  const helpBtn = strip.querySelector(".search-help");
  const helpPopover = strip.querySelector(".search-help-popover");
  const ORIGINAL_PLACEHOLDER = input.getAttribute("placeholder") || "";
  const ORIGINAL_HINT_HTML = hintEl ? hintEl.innerHTML : "";
  const COMMAND_HINT_HTML =
    "<b>↑ ↓</b> pick · <b>enter</b> run · <b>esc</b> close";
  const COMMAND_PLACEHOLDER = "command, e.g. /dream";

  // Builtin: /help. Defined here because it needs to drive the popover
  // and clear the input (both are local to this module).
  const builtinCommands = [
    {
      name: "help",
      args: "",
      description: "Show all commands and search tips.",
      run: () => {
        input.value = "";
        runSearch("");
        openHelp();
        return false;
      },
    },
  ];
  const allCommands = [...builtinCommands, ...(commands || [])];
  let commandMatches = [];
  let commandRest = "";
  let commandCursor = 0;

  let index = null;
  let indexedCount = 0;
  let matches = [];
  let totalHits = 0;
  let currentQuery = "";
  let cursor = 0;
  let lastEmptyReact = 0;
  let longQueryActive = false;

  // Plan-mode state.
  let planEl = null;
  let planSummaryEl = null;
  let planListEl = null;
  let planEdgesEl = null;
  let planApplyBtn = null;
  let planCancelBtn = null;
  let currentPlan = null;
  let currentPlanNotes = []; // ordered notes resolved from the plan
  let planChecked = new Set(); // ids the user has kept checked

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
    // Skip hushed notes — they live on disk but stay out of the field
    // by design, and surfacing them in search would defeat the point.
    // See docs/HUSH.md.
    const docs = vault.notes
      .filter((n) => !(n.frontmatter && n.frontmatter.hushed))
      .map((n) => ({
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
    strip.classList.remove("plan-mode");
    strip.setAttribute("aria-hidden", "true");
    getBodies()?.setGlowFilter(null);
    if (summaryEl) summaryEl.innerHTML = "";
    closeHelp();
    clearPlanState();
    exitCommandMode();
    input.blur();
    if (longQueryActive) {
      longQueryActive = false;
      modelFace?.react("search-end");
    }
  }

  function openHelp() {
    if (!helpPopover) return;
    helpPopover.classList.add("open");
    helpBtn?.setAttribute("aria-expanded", "true");
  }
  function closeHelp() {
    if (!helpPopover) return;
    helpPopover.classList.remove("open");
    helpBtn?.setAttribute("aria-expanded", "false");
  }
  function toggleHelp() {
    if (!helpPopover) return;
    helpPopover.classList.contains("open") ? closeHelp() : openHelp();
  }
  helpBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleHelp();
  });

  function isOpen() {
    return strip.classList.contains("open");
  }

  function invalidate() {
    index = null;
    indexedCount = 0;
  }

  // Lazy-create the plan pane DOM on first plan-mode entry. Sits as a
  // sibling of .search-summary inside the existing strip; CSS in
  // index.html toggles visibility via the strip's .plan-mode class.
  function ensurePlanEl() {
    if (planEl) return planEl;
    planEl = document.createElement("div");
    planEl.className = "search-plan";
    planEl.innerHTML = `
      <div class="search-plan-summary"></div>
      <div class="search-plan-list"></div>
      <div class="search-plan-actions">
        <span class="search-plan-edges"></span>
        <span class="search-plan-btn-row">
          <button type="button" class="search-plan-btn search-plan-cancel">Cancel</button>
          <button type="button" class="search-plan-btn search-plan-btn-primary search-plan-apply">Apply</button>
        </span>
      </div>
    `;
    // Insert after the summary line so the strip reads:
    // input → summary → plan → hint.
    const anchor = summaryEl || input;
    anchor.parentNode.insertBefore(planEl, anchor.nextSibling);
    planSummaryEl = planEl.querySelector(".search-plan-summary");
    planListEl = planEl.querySelector(".search-plan-list");
    planEdgesEl = planEl.querySelector(".search-plan-edges");
    planApplyBtn = planEl.querySelector(".search-plan-apply");
    planCancelBtn = planEl.querySelector(".search-plan-cancel");

    planCancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Cancel = leave plan mode but keep the strip open so the user
      // can refine. Clearing the input is the cleanest reset.
      input.value = "";
      runSearch("");
      requestAnimationFrame(() => input.focus());
    });
    planApplyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      commitPlan();
    });

    return planEl;
  }

  // ── Command mode ───────────────────────────────────────────
  // Parse `/<name> <rest…>`. Whitespace separates name from arg; the
  // rest is one freeform string with no escaping or quoting.
  function parseCommand(raw) {
    const after = raw.slice(1); // drop leading slash
    const space = after.search(/\s/);
    if (space === -1) return { name: after.toLowerCase(), rest: "" };
    return {
      name: after.slice(0, space).toLowerCase(),
      rest: after.slice(space + 1).trim(),
    };
  }
  function matchCommands(name) {
    if (!name) return allCommands.slice();
    const exact = [];
    const prefix = [];
    const contains = [];
    for (const c of allCommands) {
      if (c.name === name) exact.push(c);
      else if (c.name.startsWith(name)) prefix.push(c);
      else if (c.name.includes(name)) contains.push(c);
    }
    prefix.sort((a, b) => a.name.length - b.name.length);
    return [...exact, ...prefix, ...contains];
  }
  function enterCommandMode(raw) {
    if (!strip.classList.contains("command-mode")) {
      strip.classList.add("command-mode");
      input.placeholder = COMMAND_PLACEHOLDER;
      if (hintEl) hintEl.innerHTML = COMMAND_HINT_HTML;
      // Drop any previous glow filter — command mode shouldn't dim notes.
      getBodies()?.setGlowFilter(null);
      if (summaryEl) summaryEl.innerHTML = "";
    }
    const { name, rest } = parseCommand(raw);
    commandRest = rest;
    commandMatches = matchCommands(name);
    commandCursor = 0;
    renderCommandList();
  }
  function exitCommandMode() {
    if (!strip.classList.contains("command-mode")) return;
    strip.classList.remove("command-mode");
    input.placeholder = ORIGINAL_PLACEHOLDER;
    if (hintEl) hintEl.innerHTML = ORIGINAL_HINT_HTML;
    if (commandsEl) commandsEl.innerHTML = "";
    commandMatches = [];
    commandRest = "";
    commandCursor = 0;
  }
  function renderCommandList() {
    if (!commandsEl) return;
    if (commandMatches.length === 0) {
      commandsEl.innerHTML = `<div class="search-commands-empty">no command matches</div>`;
      return;
    }
    const html = commandMatches
      .map((c, i) => {
        const args = c.args
          ? ` <span class="cmd-args">${escapeHtml(c.args)}</span>`
          : "";
        const active = i === commandCursor ? " active" : "";
        return `<div class="search-command-row${active}" data-index="${i}"><span class="cmd-name">/${escapeHtml(c.name)}</span>${args}<span class="cmd-desc">${escapeHtml(c.description)}</span></div>`;
      })
      .join("");
    commandsEl.innerHTML = html;
    // Click a row → execute that command. Cheap event delegation since
    // the list re-renders on every keystroke.
    commandsEl.querySelectorAll(".search-command-row").forEach((row) => {
      row.addEventListener("click", () => {
        commandCursor = Number(row.dataset.index) || 0;
        renderCommandList();
        runActiveCommand();
      });
    });
  }
  function runActiveCommand() {
    const c = commandMatches[commandCursor];
    if (!c) return;
    let result;
    try {
      result = c.run(commandRest);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[bz] /command run failed", c.name, err);
      result = undefined;
    }
    if (result !== false) close();
  }

  function clearPlanState() {
    currentPlan = null;
    currentPlanNotes = [];
    planChecked = new Set();
    if (planListEl) planListEl.innerHTML = "";
    if (planSummaryEl) planSummaryEl.innerHTML = "";
    if (planEdgesEl) planEdgesEl.textContent = "";
  }

  function runSearch(q) {
    const raw = q;
    const trimmed = q.trim();
    currentQuery = trimmed;

    // Command mode — `/` as the FIRST character (preserve trailing
    // whitespace from the raw input so `/new ` reads as "new" + empty
    // arg, not "/new" with the space stripped).
    if (raw.startsWith("/")) {
      enterCommandMode(raw);
      return;
    }
    if (strip.classList.contains("command-mode")) exitCommandMode();

    // Plan-mode: verb-prefixed input. Detected even on partial input
    // so the user gets live feedback as they type the term list.
    const parsed = parsePlan(trimmed);
    if (parsed.kind === "plan") {
      enterPlanMode(parsed.plan);
      // Reuse the long-query squint for plan input too.
      const wantLong = trimmed.length > 20;
      if (wantLong && !longQueryActive) {
        longQueryActive = true;
        modelFace?.react("search-long-query");
      } else if (!wantLong && longQueryActive) {
        longQueryActive = false;
        modelFace?.react("search-end");
      }
      return;
    }
    // Regular search path: leaving plan mode if we were in it.
    if (strip.classList.contains("plan-mode")) {
      strip.classList.remove("plan-mode");
      clearPlanState();
    }

    // Long-query squint — held while > 20 chars; released on shorter
    // queries or when the strip closes.
    const wantLong = trimmed.length > 20;
    if (wantLong && !longQueryActive) {
      longQueryActive = true;
      modelFace?.react("search-long-query");
    } else if (!wantLong && longQueryActive) {
      longQueryActive = false;
      modelFace?.react("search-end");
    }
    if (!trimmed) {
      matches = [];
      totalHits = 0;
      getBodies()?.setGlowFilter(null);
      renderSummary();
      return;
    }
    if (!index) return;
    const results = index.search(trimmed, { prefix: true, fuzzy: 0.2 });
    totalHits = results.length;
    matches = results.slice(0, 12);
    const bodies = getBodies();
    if (matches.length === 0) {
      bodies?.setGlowFilter(new Set());
      renderSummary();
      // Throttle the sympathy reaction so it doesn't fire on every
      // keystroke past a 0-result threshold.
      const now = performance.now();
      if (now - lastEmptyReact > 1500) {
        lastEmptyReact = now;
        modelFace?.react("search-empty");
      }
      return;
    }
    bodies?.setGlowFilter(new Set(matches.map((r) => r.id)));
    cursor = 0;
    arcToMatch(0);
    renderSummary();
  }

  function enterPlanMode(plan) {
    ensurePlanEl();
    strip.classList.add("plan-mode");
    currentPlan = plan;

    // Term-level search wraps MiniSearch — same fuzzy/prefix policy
    // as the main search path, so the matcher's notion of "mention"
    // matches what the user sees when searching plainly.
    const vault = getVault();
    const search = (term) => {
      if (!index) return [];
      return index.search(term, { prefix: true, fuzzy: 0.2 });
    };
    const resolveNote = vault ? (id) => vault.byId.get(id) : null;
    const { notes = [], perTerm } = resolvePlan(plan, {
      search,
      resolve: resolveNote,
    });
    currentPlanNotes = notes;
    planChecked = new Set(notes.map((n) => n.id));

    // Glow the matched set in the universe so the user can see what
    // the gesture is about to touch.
    const bodies = getBodies();
    if (bodies) {
      bodies.setGlowFilter(new Set(notes.map((n) => n.id)));
    }

    renderPlan(perTerm);
  }

  function renderPlan(perTerm) {
    if (!planEl || !currentPlan) return;
    const plan = currentPlan;

    // Summary line — terms + count.
    const termsHtml = plan.terms
      .map((t) => `<span class="term">${escapeHtml(t)}</span>`)
      .join("· ");
    if (plan.reject) {
      planSummaryEl.innerHTML = `${escapeHtml(plan.reject)}`;
    } else if (plan.terms.length === 0) {
      planSummaryEl.innerHTML = `type one or more terms after <b>${escapeHtml(plan.verb)}</b>`;
    } else {
      const noun = currentPlanNotes.length === 1 ? "note" : "notes";
      planSummaryEl.innerHTML = `<b>${currentPlanNotes.length}</b> ${noun} match all of ${termsHtml}`;
    }

    // Note list with per-row checkboxes.
    planListEl.innerHTML = "";
    if (currentPlanNotes.length === 0 && plan.terms.length > 0) {
      const empty = document.createElement("div");
      empty.className = "search-plan-empty";
      const perTermLine = plan.terms
        .map((t) => `${t} (${perTerm?.[t] ?? 0})`)
        .join(" · ");
      empty.textContent = `no notes match all of these terms — per term: ${perTermLine}`;
      planListEl.appendChild(empty);
    }
    for (const note of currentPlanNotes) {
      const row = document.createElement("label");
      row.className = "search-plan-row";
      row.dataset.id = note.id;
      const checked = planChecked.has(note.id);
      if (!checked) row.classList.add("unchecked");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.addEventListener("change", () => {
        if (cb.checked) planChecked.add(note.id);
        else planChecked.delete(note.id);
        row.classList.toggle("unchecked", !cb.checked);
        renderPlanFooter();
      });
      const titleEl = document.createElement("span");
      titleEl.className = "plan-title";
      titleEl.textContent = note.title || "(untitled)";
      const metaEl = document.createElement("span");
      metaEl.className = "plan-meta";
      metaEl.textContent = note.rootId || "";
      row.append(cb, titleEl, metaEl);
      planListEl.appendChild(row);
    }

    renderPlanFooter();
  }

  function renderPlanFooter() {
    if (!planEdgesEl || !planApplyBtn) return;
    const n = planChecked.size;
    const edges = cliqueEdgeCount(n);
    const overCap = n > CLIQUE_CAP;

    // Footer edges line — also surfaces the cap warning when over.
    planEdgesEl.innerHTML = "";
    if (overCap) {
      const warn = document.createElement("span");
      warn.className = "search-plan-warn";
      warn.textContent = `${n} > ${CLIQUE_CAP} clique cap — uncheck some, or shrink the term list.`;
      planEdgesEl.appendChild(warn);
    } else if (n >= 2) {
      planEdgesEl.textContent = `${n} notes → ${edges} wikilinks`;
    } else if (n === 1) {
      planEdgesEl.textContent = `1 note — pick at least 2 to clique`;
    } else {
      planEdgesEl.textContent = ``;
    }

    planApplyBtn.disabled = !(n >= 2 && !overCap);
  }

  function commitPlan() {
    if (!currentPlan || !onConnectQuery) return;
    const ids = [...planChecked];
    if (ids.length < 2) return;
    if (ids.length > CLIQUE_CAP) return;
    const vault = getVault();
    const notes = ids.map((id) => vault?.byId.get(id)).filter(Boolean);
    const planSnapshot = {
      ...currentPlan,
      ids,
      notes,
    };
    close();
    Promise.resolve(onConnectQuery(planSnapshot)).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[bz] connect-query apply failed", err);
    });
  }

  // Always shows a hit count for the current query. When the vault has
  // more than one root and the matches span multiple roots, the per-root
  // breakdown is appended after the count. Empty query → empty summary.
  function renderSummary() {
    if (!summaryEl) return;
    if (!currentQuery) {
      summaryEl.innerHTML = "";
      return;
    }
    if (totalHits === 0) {
      summaryEl.innerHTML = `no matches for <b>${escapeHtml(currentQuery)}</b>`;
      return;
    }
    const noun = totalHits === 1 ? "hit" : "hits";
    let html = `${totalHits} ${noun} for <b>${escapeHtml(currentQuery)}</b>`;
    const vault = getVault();
    if (vault && matches.length && vault.roots?.length > 1) {
      const byRoot = new Map();
      for (const m of matches) {
        const note = vault.byId.get(m.id);
        const root = note?.rootId || "unknown";
        byRoot.set(root, (byRoot.get(root) || 0) + 1);
      }
      if (byRoot.size > 1) {
        const tags = [...byRoot.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([root, n]) =>
              `<span class="root-tag">${escapeHtml(root)} ${n}</span>`,
          )
          .join("");
        html += ` · ${tags}`;
      }
    }
    summaryEl.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function arcToMatch(i) {
    const m = matches[i];
    if (!m) return;
    const pos = getBodies()?.positionOf(m.id);
    if (pos) onArc(pos);
  }

  input.addEventListener("input", () => {
    // Per-keystroke micro-hesitation — cycles through 6 small
    // asymmetric beats so rapid typing reads as the avatar following
    // each letter. Fires on real text changes (typing, paste,
    // backspace) but not on Arrow / Enter / Escape — those don't
    // dispatch input events.
    modelFace?.react("hmm");
    runSearch(input.value);
  });
  input.addEventListener("keydown", (e) => {
    const inPlan = strip.classList.contains("plan-mode");
    const inCommand = strip.classList.contains("command-mode");
    if (e.key === "ArrowDown") {
      if (inPlan) return;
      e.preventDefault();
      if (inCommand) {
        if (commandMatches.length === 0) return;
        commandCursor = (commandCursor + 1) % commandMatches.length;
        renderCommandList();
        return;
      }
      if (matches.length === 0) return;
      cursor = (cursor + 1) % matches.length;
      arcToMatch(cursor);
    } else if (e.key === "ArrowUp") {
      if (inPlan) return;
      e.preventDefault();
      if (inCommand) {
        if (commandMatches.length === 0) return;
        commandCursor =
          (commandCursor - 1 + commandMatches.length) % commandMatches.length;
        renderCommandList();
        return;
      }
      if (matches.length === 0) return;
      cursor = (cursor - 1 + matches.length) % matches.length;
      arcToMatch(cursor);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (inPlan) {
        // Apply the plan if it's actionable; otherwise no-op.
        if (planApplyBtn && !planApplyBtn.disabled) commitPlan();
        return;
      }
      if (inCommand) {
        runActiveCommand();
        return;
      }
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
