// Caption renderer for the observer chorus.
//
// Each frame we reconcile a small DOM pool with the chorus's current set of
// active observers: any observer still live gets or keeps a DOM element and
// is re-projected to screen; any DOM element whose observer is gone fades
// out and is recycled. CSS handles the actual transitions.
//
// Fade timing is driven by the observer's own lifetime (fade-in ramp on
// birth, fade-out ramp in its last 700 ms, or an instant fade-out if the
// observer vanishes from the active list — the acceptance criterion for
// "turn off → captions fade within 2 s").

import * as THREE from "three";

const POOL_SIZE = 4;
const FADE_IN_MS = 600;
const FADE_OUT_MS = 700;
const OFFSET_Y_PX = -28;

const TMP = new THREE.Vector3();

export function createCaptions({ getChorus, getBodies, camera, getSettings }) {
  const host = document.createElement("div");
  host.id = "chorus";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);

  const slots = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const el = document.createElement("div");
    el.className = "caption";
    el.setAttribute("role", "status");
    host.appendChild(el);
    slots.push({ el, observerId: null, lingerUntil: 0 });
  }

  function update(dt, t) {
    const chorus = getChorus && getChorus();
    if (!chorus) return hideAll();

    const settings = getSettings ? getSettings() : {};
    const bodies = getBodies();
    if (!bodies) return hideAll();

    const live = chorus.getActive();
    const now = Date.now();

    // Build a set of live observer ids for quick lookup.
    const liveIds = new Set(live.map((o) => o.id));

    // Step 1: release slots whose observer is no longer live.
    for (const s of slots) {
      if (s.observerId == null) continue;
      if (!liveIds.has(s.observerId)) {
        // Start a fade-out if not already scheduled.
        if (!s.lingerUntil) s.lingerUntil = now + FADE_OUT_MS;
        if (now >= s.lingerUntil) {
          s.el.classList.remove("show");
          s.observerId = null;
          s.lingerUntil = 0;
          s.el.dataset.stage = "idle";
        } else {
          s.el.classList.remove("show");
          s.el.dataset.stage = "leaving";
        }
      }
    }

    // Step 2: place each live observer into an available slot.
    const fontSize = clamp(Number(settings.chorus_font_size) || 12, 9, 18);
    host.style.setProperty("--chorus-font", `${fontSize}px`);

    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const obs of live) {
      let slot = slots.find((s) => s.observerId === obs.id);
      if (!slot) {
        slot = slots.find((s) => s.observerId == null);
        if (!slot) continue; // pool exhausted (capped at POOL_SIZE)
        slot.observerId = obs.id;
        slot.el.textContent = obs.text;
        slot.el.dataset.stage = "entering";
      }

      // Opacity stages driven by observer lifetime.
      const ageMs = now - obs.bornAt;
      const leftMs = obs.lifetime - ageMs;
      let alpha = 1.0;
      if (ageMs < FADE_IN_MS) alpha = ageMs / FADE_IN_MS;
      else if (leftMs < FADE_OUT_MS) alpha = Math.max(0, leftMs / FADE_OUT_MS);

      const pos = bodies.positionOf(obs.noteId);
      if (!pos) {
        slot.el.classList.remove("show");
        continue;
      }
      TMP.set(pos[0], pos[1], pos[2]).project(camera);
      if (TMP.z >= 1) {
        // behind camera
        slot.el.classList.remove("show");
        continue;
      }
      const sx = (TMP.x * 0.5 + 0.5) * w;
      const sy = (1 - (TMP.y * 0.5 + 0.5)) * h;
      slot.el.style.transform = `translate(${sx}px, ${sy + OFFSET_Y_PX}px) translate(-50%, -100%)`;
      slot.el.style.opacity = alpha.toFixed(3);
      slot.el.classList.add("show");
      slot.el.dataset.stage = "visible";
    }
  }

  function hideAll() {
    for (const s of slots) {
      s.el.classList.remove("show");
      s.observerId = null;
      s.lingerUntil = 0;
    }
  }

  function dispose() {
    host.remove();
  }

  return { update, hideAll, dispose };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
