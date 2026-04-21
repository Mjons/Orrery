// Salience debug palette — `Shift+S`.
//
// Intentionally ugly. Renders every candidate the salience layer has
// produced this session, with the four-axis breakdown, the final score,
// whether it surfaced, and a row of knobs for live-tuning the weights
// and thresholds. Tuning the knobs mutates the params object in place,
// so the next scoring pass uses the new values.
//
// Ships because confidence theatre is more expensive than a debug
// surface. SALIENCE.md §8.5.

// Each param is an object so we can carry a `help` tooltip alongside the
// slider bounds. Tooltips are deliberately plain-language — "raise this
// and X will happen" — so someone tuning for the first time understands
// the dial rather than the maths.
const NUMBER_PARAMS = [
  {
    key: "w_novelty",
    min: 0,
    max: 3,
    step: 0.05,
    label: "novelty weight",
    help: "How much 'unlike anything already surfaced' counts toward the final score. Raise this if the drawer is showing the same shape of idea over and over. Lower it if genuinely surprising ideas are getting over-rewarded.",
  },
  {
    key: "w_coherence",
    min: 0,
    max: 3,
    step: 0.05,
    label: "coherence weight",
    help: "How much 'sits on the line between its two parents' counts. High coherence = clean bridges. Low coherence = wilder drift. Raise this if ideas feel untethered from their parents. Lower it if everything feels like an obvious derivative.",
  },
  {
    key: "w_reach",
    min: 0,
    max: 3,
    step: 0.05,
    label: "reach weight",
    help: "How much 'spans different kinds of notes' counts. Raise this to reward ideas that link across domains (e.g. a #person and a #concept). Lower it if cross-domain ideas are noisy and same-kind clusters feel more useful.",
  },
  {
    key: "w_age",
    min: 0,
    max: 3,
    step: 0.05,
    label: "age weight",
    help: "How much 'recently reinforced' counts. Raise this to aggressively fade out ideas that no dream has touched again. Lower it to let older candidates linger and have another chance.",
  },
  {
    key: "theta_spawn",
    min: 0,
    max: 2,
    step: 0.01,
    label: "θ spawn",
    help: "The resonance cutoff before a pair is even considered a candidate. Lower = more candidates (noisier, the palette fills up fast). Higher = only strongly-affinitised pairs qualify, so the system produces fewer but cleaner children.",
  },
  {
    key: "theta_surface",
    min: 0,
    max: 1,
    step: 0.01,
    label: "θ surface",
    help: "The final salience score a candidate must clear to surface in the drawer. Lower = more ideas reach you (you'll see a busier drawer). Higher = only the strongest candidates make it up — the drawer stays quiet most mornings.",
  },
  {
    key: "novelty_radius",
    min: 0.05,
    max: 2,
    step: 0.05,
    label: "novelty radius",
    help: "How 'close' counts as 'similar' in affinity space. Smaller radius = easier for a new idea to look novel. Larger = the system punishes near-duplicates of existing surfaced ideas more aggressively.",
  },
  {
    key: "age_halflife_ms",
    min: 60_000,
    max: 604_800_000,
    step: 60_000,
    label: "age half-life",
    help: "How long before an un-reinforced idea loses half of its freshness bonus. Shorter = ideas decay quickly if no dream or user action touches them again. Defaults to one day (86,400,000 ms).",
  },
];

export function createSalienceDebug({ getLayer, getParams }) {
  const host = document.createElement("div");
  host.id = "salience-debug";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <header class="sdbg-head">
      <span>Salience debug</span>
      <button class="sdbg-close" type="button" aria-label="Close">×</button>
    </header>
    <section class="sdbg-params"></section>
    <section class="sdbg-list"></section>
    <footer class="sdbg-foot">
      Shift+S to toggle · mutations take effect on next tick · reload resets.
    </footer>
  `;
  document.body.appendChild(host);

  const paramsEl = host.querySelector(".sdbg-params");
  const listEl = host.querySelector(".sdbg-list");
  const closeBtn = host.querySelector(".sdbg-close");

  closeBtn.addEventListener("click", close);

  let open = false;
  let refreshInterval = 0;

  function buildParams() {
    const p = getParams();
    paramsEl.innerHTML = "";
    for (const { key, min, max, step, label, help } of NUMBER_PARAMS) {
      const row = document.createElement("label");
      row.className = "sdbg-param-row";
      // Row no longer carries a native `title` — the `?` opens a proper
      // styled tooltip instantly on hover (see `.sdbg-help-wrap` CSS).
      // Native `title` waited ~500 ms and looked like an OS tooltip,
      // which read as broken.

      const nameWrap = document.createElement("span");
      nameWrap.className = "sdbg-param-name";
      const name = document.createElement("span");
      name.textContent = label;
      nameWrap.appendChild(name);

      if (help) {
        // Wrapper lets CSS :hover / :focus-within drive the animation;
        // JS only corrects placement when the default would overflow
        // the viewport.
        const wrap = document.createElement("span");
        wrap.className = "sdbg-help-wrap";

        const info = document.createElement("span");
        info.className = "sdbg-param-help";
        info.textContent = "?";
        info.tabIndex = 0;
        info.setAttribute("aria-label", help);
        info.setAttribute("role", "button");

        const tip = document.createElement("span");
        tip.className = "sdbg-tip";
        tip.textContent = help;

        // On hover/focus, measure where the tip would land and flip
        // above / clamp horizontally if it would go off-screen.
        const reposition = () => fitTipToViewport(tip, wrap);
        wrap.addEventListener("mouseenter", reposition);
        wrap.addEventListener("focusin", reposition);

        wrap.append(info, tip);
        nameWrap.appendChild(wrap);
      }

      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(p[key]);
      input.addEventListener("input", () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) p[key] = v;
      });
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "·";
      reset.title = "reset to default";
      reset.addEventListener("click", () => {
        // Re-read the module default — cheap, just import at mutate time.
        import("../layers/salience.js").then(({ DEFAULT_PARAMS }) => {
          const def = DEFAULT_PARAMS[key];
          if (Number.isFinite(def)) {
            p[key] = def;
            input.value = String(def);
          }
        });
      });
      row.append(nameWrap, input, reset);
      paramsEl.appendChild(row);
    }
  }

  function refresh() {
    const layer = getLayer();
    if (!layer) return;
    const all = layer.getAllCandidates();
    listEl.innerHTML = "";
    if (all.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sdbg-empty";
      empty.textContent = "No candidates yet. Trigger a dream (Shift+D).";
      listEl.appendChild(empty);
      return;
    }
    const table = document.createElement("table");
    table.className = "sdbg-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>seed</th>
        <th>parents</th>
        <th>nov</th>
        <th>coh</th>
        <th>rch</th>
        <th>age</th>
        <th>S</th>
        <th>state</th>
      </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    // Newest first.
    const sorted = all.slice().sort((a, b) => b.spawnedAt - a.spawnedAt);
    for (const c of sorted.slice(0, 120)) {
      const tr = document.createElement("tr");
      if (c.promoted) tr.classList.add("sdbg-promoted");
      else if (c.surfaced) tr.classList.add("sdbg-surfaced");
      tr.innerHTML = `
        <td class="sdbg-text">${escapeHtml(c.seedText || "—")}</td>
        <td class="sdbg-parents">${escapeHtml(c.parentA?.title || "?")} · ${escapeHtml(c.parentB?.title || "?")}</td>
        <td>${fmt(c.novelty)}</td>
        <td>${fmt(c.coherence)}</td>
        <td>${fmt(c.reach)}</td>
        <td>${fmt(1 - (c.age_penalty ?? 0))}</td>
        <td class="sdbg-s">${fmt(c.salience)}</td>
        <td>${c.promoted ? "promoted" : c.surfaced ? "surfaced" : "sub-θ"}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.appendChild(table);
  }

  function show() {
    if (open) return;
    open = true;
    host.classList.add("show");
    host.setAttribute("aria-hidden", "false");
    buildParams();
    refresh();
    refreshInterval = window.setInterval(refresh, 1000);
  }

  function close() {
    if (!open) return;
    open = false;
    host.classList.remove("show");
    host.setAttribute("aria-hidden", "true");
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = 0;
    }
  }

  function toggle() {
    if (open) close();
    else show();
  }

  return { show, close, toggle, isOpen: () => open };
}

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

// Nudge the tooltip into the viewport. Default placement is below + centered
// on the anchor. If that would clip the right/left edge, shift horizontally
// via the --tip-x-offset custom property; if it would clip the bottom edge,
// flip above via the .tip-above class. Called just before CSS :hover fades
// the tip in so the user never sees the unadjusted position.
const TIP_MARGIN = 8;
function fitTipToViewport(tip, wrap) {
  // Reset prior adjustments, then measure the would-be position.
  tip.style.setProperty("--tip-x-offset", "0px");
  wrap.classList.remove("tip-above");
  // Force layout.
  void tip.offsetWidth;

  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let dx = 0;
  if (rect.right > vw - TIP_MARGIN) dx = vw - TIP_MARGIN - rect.right;
  else if (rect.left < TIP_MARGIN) dx = TIP_MARGIN - rect.left;
  if (dx !== 0) tip.style.setProperty("--tip-x-offset", `${dx}px`);

  if (rect.bottom > vh - TIP_MARGIN) {
    wrap.classList.add("tip-above");
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
