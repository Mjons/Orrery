// Morning report modal.
//
// Accepts an optional `dreamArtifacts` bundle from the dream layer. If
// present, the report is a record of that dream (peak depth, captions
// sampled in-cycle, computed prune candidates, actions to open the full
// dream log). Without it, the modal falls back to a canned-template
// preview sourced from the current vault + chorus buffer — the same thing
// the Phase 3.5 Cmd+D preview showed.
//
// Tone rules inherited from DREAM.md §7: flat, not mystical. Candidates,
// not insights. "Highest-scoring," never "most important."

export function showMorningReport({
  vault,
  bodies,
  settings,
  chorus,
  salienceLayer = null, // surfaced candidates take precedence over chorus
  dreamArtifacts = null,
  onLoadDream = null,
  onDiscard = null,
  onOpenIdeas = null,
  utterance = null, // Phase 7 router — fires morning-synthesis when
  // present. Output appears as a single sentence above the Weather
  // bullets. Graceful fallback: if router is absent, if the generate
  // call throws, or if it returns template text, the synthesis block
  // simply isn't rendered — the rest of the modal reads fine alone.
}) {
  const snapshot = buildSnapshot(
    vault,
    bodies,
    settings,
    chorus,
    dreamArtifacts,
    salienceLayer,
  );
  const modal = document.createElement("div");
  modal.className = "morning-report-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "mr-title");
  modal.innerHTML = template(snapshot);

  function close() {
    modal.classList.remove("show");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => modal.remove(), 220);
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }
  modal.addEventListener("click", (e) => {
    if (
      e.target === modal ||
      (e.target instanceof HTMLElement && e.target.closest(".mr-close"))
    ) {
      close();
      return;
    }
    if (!(e.target instanceof HTMLElement)) return;
    const action = e.target.dataset.action;
    if (action === "dismiss" || action === "discard") {
      if (action === "discard" && onDiscard) onDiscard();
      close();
    } else if (action === "load-dream") {
      close();
      if (onLoadDream) onLoadDream(snapshot.dreamLogPath);
    }
  });
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));

  // Phase 7 morning-synthesis — kick off the async call only if we
  // have a real dream AND a router. The synthesis is a nice-to-have,
  // not load-bearing; the modal reads fine without it.
  if (utterance && dreamArtifacts && snapshot.isReal) {
    fireSynthesis(modal, utterance, snapshot, dreamArtifacts);
  }

  return { close };
}

// Render the synthesis section: shows a subtle "listening…" placeholder
// immediately, then swaps in the model output when it lands. If the
// call fails or falls back to template, the section hides itself so
// there's no broken-looking empty block.
async function fireSynthesis(modal, utterance, snapshot, dreamArtifacts) {
  const host = modal.querySelector(".mr-synthesis");
  if (!host) return;
  const textEl = host.querySelector(".mr-synthesis-text");
  if (!textEl) return;
  host.classList.add("mr-synthesis-pending");
  try {
    const promptSnap = buildSynthesisSnapshot(snapshot, dreamArtifacts);
    const result = await utterance.generate("morning-synthesis", promptSnap);
    host.classList.remove("mr-synthesis-pending");
    if (!result || !result.text || result.backend === "template") {
      // Graceful disappearance — no empty block, no "failed" error.
      host.remove();
      return;
    }
    textEl.textContent = result.text;
    host.dataset.backend = result.backend;
  } catch (err) {
    host.classList.remove("mr-synthesis-pending");
    console.warn("[bz] morning-synthesis failed", err);
    host.remove();
  }
}

function buildSynthesisSnapshot(snapshot, dream) {
  const survivors = (snapshot.things || []).map((t) => ({
    text: t.text,
    pair: t.candidate
      ? [t.candidate.parentA?.title, t.candidate.parentB?.title]
          .filter(Boolean)
          .join(" · ")
      : t.note?.title || "",
  }));
  const prunings = (snapshot.prunings || []).map((p) => ({
    title: p.title,
    path: p.path,
  }));
  return {
    survivors,
    prunings,
    judgeReasoning: dream.judgeReasoning || "",
    peakDepth: dream.peakDepth || 0,
    captionCount: dream.captions?.length || 0,
    pruneCount: dream.pruneCandidates?.length || 0,
    noteCount: snapshot.weather?.notes || 0,
  };
}

// ── Snapshot ────────────────────────────────────────────────
function buildSnapshot(vault, bodies, settings, chorus, dream, salienceLayer) {
  const now = new Date();
  const notes = vault.notes;

  const linkCount = vault.stats?.links ?? countLinks(vault);
  const tagCount = vault.stats?.tags ?? 0;

  const isReal = !!dream;

  // Three things:
  //  - real dream: top-3 distinct captions from the cycle (newest-first).
  //  - chorus buffer fallback: top-3 distinct recent captions.
  //  - canned fallback: template sentences from heaviest + freshest notes.
  const things = pickThings(
    vault,
    bodies,
    settings,
    chorus,
    dream,
    salienceLayer,
  );

  // Weather:
  //  - real dream: notes-in, captions produced, prunings suggested, peak depth.
  //  - canned: totals only.
  const weather = dream
    ? {
        notes: notes.length,
        captions: dream.captions.length,
        prunings: dream.pruneCandidates.length,
        peakDepth: dream.peakDepth,
      }
    : {
        notes: notes.length,
        links: linkCount,
        tags: tagCount,
      };

  const prunings = dream
    ? dream.pruneCandidates.slice(0, 3)
    : pickCannedOrphans(vault);

  const dateLine = dream
    ? `${fmtClock(dream.startedAt)} → ${fmtClock(dream.endedAt)} · depth ${dream.peakDepth.toFixed(2)}`
    : now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

  return {
    isReal,
    date: dateLine,
    weather,
    things,
    prunings,
    dreamLogPath: dream ? dreamLogPathFromEnd(dream.endedAt) : null,
  };
}

function pickThings(vault, bodies, settings, chorus, dream, salienceLayer) {
  // Source pool, highest-priority first:
  //   1. Surfaced salience candidates — the dream actually produced something
  //   2. Dream chorus captions — the dream noticed something
  //   3. Live chorus buffer — wake-time ambient voice still has stuff
  //   4. Canned templates — fallback when we have no real material
  const surfaced = salienceLayer?.getSurfaced?.() || [];
  if (surfaced.length > 0) {
    const seen = new Set();
    const out = [];
    // Highest-salience first; cap at 3 per the Phase 5 promise.
    const sorted = surfaced
      .slice()
      .sort((a, b) => (b.salience || 0) - (a.salience || 0));
    for (const c of sorted) {
      if (out.length >= 3) break;
      if (!c.seedText || seen.has(c.seedText)) continue;
      seen.add(c.seedText);
      out.push({
        text: c.seedText,
        note: c.parentA || null,
        candidate: c,
      });
    }
    if (out.length) return out;
  }
  if (dream && dream.captions.length) {
    const seen = new Set();
    const out = [];
    for (let i = dream.captions.length - 1; i >= 0 && out.length < 3; i--) {
      const c = dream.captions[i];
      if (seen.has(c.text)) continue;
      seen.add(c.text);
      out.push({ text: c.text, note: vault.byId.get(c.noteId) || null });
    }
    if (out.length) return out;
  }
  const buf = chorus?.getBuffer ? chorus.getBuffer() : [];
  if (buf.length > 0) {
    const seen = new Set();
    const out = [];
    for (let i = buf.length - 1; i >= 0 && out.length < 3; i--) {
      const e = buf[i];
      if (seen.has(e.text)) continue;
      seen.add(e.text);
      out.push({ text: e.text, note: vault.byId.get(e.noteId) || null });
    }
    if (out.length) return out;
  }
  return pickCannedThings(vault, bodies, settings);
}

function pickCannedThings(vault, bodies, settings) {
  const notes = vault.notes;
  const byHeft = notes
    .map((n) => ({ n, w: weightOf(n, vault, bodies) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((x) => x.n);
  const fresh = notes
    .slice()
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    .slice(0, 3);

  const seed = seedFromDate(new Date());
  const rng = mulberry32(seed);

  const out = [];
  const used = new Set();
  const pool = [...byHeft, ...fresh];
  while (out.length < 3 && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    const note = pool.splice(idx, 1)[0];
    if (used.has(note.id)) continue;
    used.add(note.id);
    const tmpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    const partner =
      byHeft.find((h) => h.id !== note.id) ||
      fresh.find((f) => f.id !== note.id) ||
      null;
    out.push({ text: tmpl(note, { partner, settings }), note });
  }
  return out;
}

function pickCannedOrphans(vault) {
  const orphans = [];
  const monthAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
  for (const n of vault.notes) {
    const inDeg = vault.backward.get(n.id)?.size || 0;
    const outDeg = vault.forward.get(n.id)?.size || 0;
    if (inDeg === 0 && outDeg === 0 && (n.mtime || 0) < monthAgo) {
      orphans.push({
        id: n.id,
        title: n.title,
        path: n.path,
        reason: "no links in or out · quiet a while",
      });
      if (orphans.length >= 3) break;
    }
  }
  return orphans;
}

function weightOf(note, vault, bodies) {
  if (bodies?.massOf) {
    const m = bodies.massOf(note.id);
    if (m > 0) return m;
  }
  const inDeg = vault.backward.get(note.id)?.size || 0;
  const words = Math.max(1, note.words || 0);
  return 1 + inDeg * 0.8 + Math.log(1 + words) * 0.55;
}

function countLinks(vault) {
  let n = 0;
  for (const set of vault.forward.values()) n += set.size;
  return n;
}

function dreamLogPathFromEnd(endedAt) {
  const d = new Date(endedAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `.universe/dreams/${yyyy}-${mm}-${dd}.md`;
}

function fmtClock(ms) {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// ── Canned templates (fallback only) ──────────────────────
const TEMPLATES = [
  (n) => `${n.title} is still at the center of the neighborhood.`,
  (n) => `A quiet orbit around ${n.title} — nothing new, but it pulled.`,
  (n) => `${n.title} gathered a few stars on its way past.`,
  (n, ctx) =>
    ctx.partner
      ? `${n.title} and ${ctx.partner.title} are closer than they were a week ago.`
      : `${n.title} drifted further out.`,
  (n) => `An idea returned to ${n.title}.`,
  (n) =>
    `${n.title} hasn't been touched in a while — it's heavier than it looks.`,
];

function seedFromDate(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Template ──────────────────────────────────────────────
function template(s) {
  const weatherLine = s.isReal
    ? `${s.weather.notes} notes · ${s.weather.captions} captions · ${s.weather.prunings} prune candidate${s.weather.prunings === 1 ? "" : "s"}`
    : `${s.weather.notes} notes · ${s.weather.links} links · ${s.weather.tags} tags`;

  const subLabel = s.isReal ? "dream" : "preview";

  const prunings = (s.prunings || [])
    .map(
      (p) =>
        `<li><code>${escapeHtml(p.path || p.title)}</code>${p.reason ? ` <span class="mr-hint-inline">— ${escapeHtml(p.reason)}</span>` : ""}</li>`,
    )
    .join("");

  const actions = s.isReal
    ? `
      <button type="button" class="ghost" data-action="discard">Discard</button>
      <button type="button" class="ghost" data-action="load-dream">Load full dream</button>
      <button type="button" class="primary" data-action="dismiss">Close</button>
    `
    : `<button type="button" class="primary" data-action="dismiss">Close</button>`;

  const footNote = s.isReal
    ? "Dream artifacts — candidates, not insights. Nothing was deleted."
    : "Canned template — the real dream loop lands in Phase 5.";

  return `
    <div class="mr-card">
      <header class="mr-head">
        <div>
          <h2 id="mr-title">Morning report</h2>
          <p class="mr-sub">${escapeHtml(s.date)} · ${subLabel}</p>
        </div>
        <button class="mr-close" type="button" aria-label="Close">×</button>
      </header>

      ${
        s.isReal
          ? `<section class="mr-synthesis" data-backend="">
               <p class="mr-synthesis-text"><span class="mr-synthesis-dot"></span><span class="mr-synthesis-dot"></span><span class="mr-synthesis-dot"></span></p>
             </section>`
          : ""
      }

      <section class="mr-section">
        <h3>Weather</h3>
        <p class="mr-weather">${weatherLine}</p>
      </section>

      <section class="mr-section">
        <h3>Three things</h3>
        <ol class="mr-things">
          ${s.things
            .map(
              (t) =>
                `<li><span class="mr-bullet">·</span><span>${escapeHtml(t.text)}</span></li>`,
            )
            .join("")}
        </ol>
      </section>

      ${
        prunings
          ? `<section class="mr-section mr-orphans">
              <h3>Prunings worth noticing</h3>
              <p class="mr-hint">Suggestions only — nothing in your vault is ever auto-deleted.</p>
              <ul>${prunings}</ul>
            </section>`
          : ""
      }

      <footer class="mr-foot">
        <span class="mr-note">${footNote}</span>
        <div class="mr-actions">${actions}</div>
      </footer>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
