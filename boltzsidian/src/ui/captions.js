// Caption renderer for the observer chorus.
//
// Captions emerge from the avatar's mouth as amorphous talk-bubbles —
// the observer "speaks them" rather than the bodies labelling
// themselves. Each frame we reconcile a small DOM pool with the
// chorus's current set of active observers, position each slot in a
// vertical stack rising from the face's mouth, and use observer
// lifetime to drive the fade ramps.
//
// Falls back to body-anchored placement if the avatar is hidden (so
// the chorus still works in face-off setups).

import * as THREE from "three";

const POOL_SIZE = 4;
// Slow fades — the avatar speaks deliberately. Bubbles waft in and out
// rather than popping.
const FADE_IN_MS = 1200;
const FADE_OUT_MS = 1400;
const OFFSET_Y_PX = -28;

// Vertical spacing between stacked bubbles emerging from the mouth.
const STACK_GAP_PX = 6;
// Mouth offset within the face mount's bounding box. The SVG mouth
// sits around y=15 in viewBox(-50..50) → ~65% down the box. Tilt
// rotates this in screen space; we approximate with a fixed offset
// rather than following the rotation precisely.
const MOUTH_X_FRAC = 0.5;
const MOUTH_Y_FRAC = 0.62;
// How far past the face's outer edge the bubble anchors itself, in
// pixels. Keeps the bubble fully off the face's silhouette so the
// scribbles are never blocked.
const SIDE_GAP_PX = 28;

const TMP = new THREE.Vector3();

export function createCaptions({ getChorus, getBodies, camera, getSettings }) {
  const host = document.createElement("div");
  host.id = "chorus";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);

  const slots = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const el = document.createElement("div");
    el.className = "caption caption-bubble";
    el.setAttribute("role", "status");
    // Body span carries the caption text so the close button can sit
    // alongside without being read by screen readers as part of the
    // observation.
    const text = document.createElement("span");
    text.className = "caption-text";
    el.appendChild(text);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "caption-close";
    close.setAttribute("aria-label", "Dismiss");
    close.title = "Dismiss";
    close.textContent = "×";
    el.appendChild(close);
    const slot = {
      el,
      text,
      close,
      observerId: null,
      lingerUntil: 0,
      bornAtScreen: 0,
    };
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = slot.observerId;
      if (!id) return;
      const chorus = getChorus && getChorus();
      if (chorus && typeof chorus.dismiss === "function") chorus.dismiss(id);
      // Optimistic local hide — the next update tick will see the
      // observer gone and fade officially. This makes the click feel
      // instant.
      slot.el.classList.remove("show");
      slot.el.dataset.stage = "leaving";
    });
    host.appendChild(el);
    slots.push(slot);
  }

  // Cache the avatar mount lookup; it's static after boot.
  const faceMount = document.getElementById("model-face");

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

    // Anchor captions to the avatar — emerging from the mouth area
    // but offset OUTWARD so the bubble sits BESIDE the face rather
    // than blocking the eyes. Compute the face rect once per update,
    // pick the side with more open viewport, and shift the bubble
    // anchor to that edge plus a small gap. If the avatar is hidden
    // (or the rect is empty), fall back to body-anchored placement.
    const faceVisible = faceMount && faceMount.offsetWidth > 0;
    let bubbleX = 0;
    let bubbleY = 0;
    let bubbleSide = "right"; // which side of the anchor the bubbles extend to
    if (faceVisible) {
      const r = faceMount.getBoundingClientRect();
      const mouthY = r.top + r.height * MOUTH_Y_FRAC;
      // Pick the side with more open viewport space. The face can
      // bleed off-screen, so faceCenter alone isn't enough — use the
      // distance from face center to each viewport edge.
      const faceCenterX = r.left + r.width / 2;
      const spaceLeft = faceCenterX;
      const spaceRight = w - faceCenterX;
      // Bubble anchor sits just past the face's outer silhouette on
      // the chosen side. The face's amorphous cloud only fills ~84%
      // of the bounding box (inset 4% 8% per index.html), so anchor
      // to ~92% from the opposite edge plus a small gap.
      if (spaceRight >= spaceLeft) {
        bubbleX = r.left + r.width * 0.92 + SIDE_GAP_PX;
        bubbleSide = "right";
      } else {
        bubbleX = r.left + r.width * 0.08 - SIDE_GAP_PX;
        bubbleSide = "left";
      }
      bubbleY = mouthY;
      // Keep the anchor on-screen.
      const margin = 16;
      bubbleX = Math.max(margin, Math.min(w - margin, bubbleX));
    }

    // Pull the cloud color off the mount so the bubble retints with the
    // backend. Falls back to the accent if no inline var is set yet.
    if (faceVisible) {
      const cloudColor =
        getComputedStyle(faceMount).getPropertyValue("--mface-cloud-color") ||
        "#8ab4ff";
      host.style.setProperty("--bubble-color", cloudColor.trim());
    }

    // Stack live observers vertically as they emerge from the mouth —
    // newest at the bottom (near the mouth), older drift up and fade.
    // Sort live by bornAt ascending so we can stack predictably.
    const liveSorted = [...live].sort((a, b) => a.bornAt - b.bornAt);
    let stackOffset = 0;

    for (const obs of liveSorted) {
      let slot = slots.find((s) => s.observerId === obs.id);
      if (!slot) {
        slot = slots.find((s) => s.observerId == null);
        if (!slot) continue;
        slot.observerId = obs.id;
        slot.text.textContent = obs.text;
        slot.el.dataset.stage = "entering";
        slot.bornAtScreen = now;
      }

      // Opacity stages driven by observer lifetime.
      const ageMs = now - obs.bornAt;
      const leftMs = obs.lifetime - ageMs;
      let alpha = 1.0;
      if (ageMs < FADE_IN_MS) alpha = ageMs / FADE_IN_MS;
      else if (leftMs < FADE_OUT_MS) alpha = Math.max(0, leftMs / FADE_OUT_MS);

      let sx;
      let sy;
      if (faceVisible) {
        // Captions float UP from the side-anchor, oldest highest.
        // Each drifts further outward over its lifetime so the stream
        // feels like exhaled smoke trailing away from the face.
        const drift = Math.min(60, ageMs * 0.006);
        // Outward x-drift — small and slow. Direction picked by which
        // side of the face we anchored to.
        const xDrift =
          (bubbleSide === "right" ? 1 : -1) * Math.min(28, ageMs * 0.002);
        sx = bubbleX + xDrift;
        sy = bubbleY - stackOffset - drift;
        // Anchor each bubble to the SIDE next to the face (the inner
        // edge points back toward the mouth). For right-side bubbles,
        // the anchor is the bubble's left edge; for left-side, the
        // right edge. The vertical anchor stays bottom so bubbles
        // grow upward.
        const ax = bubbleSide === "right" ? "0%" : "-100%";
        slot.el.style.transform = `translate(${sx}px, ${sy}px) translate(${ax}, -100%)`;
        slot.el.style.opacity = alpha.toFixed(3);
        slot.el.classList.add("show", "from-mouth");
        slot.el.dataset.bubbleSide = bubbleSide;
        slot.el.dataset.stage = "visible";
        const measured = slot.el.offsetHeight || fontSize * 2;
        stackOffset += measured + STACK_GAP_PX;
      } else {
        // Fall-back: legacy body-anchored placement.
        const pos = bodies.positionOf(obs.noteId);
        if (!pos) {
          slot.el.classList.remove("show", "from-mouth");
          continue;
        }
        TMP.set(pos[0], pos[1], pos[2]).project(camera);
        if (TMP.z >= 1) {
          slot.el.classList.remove("show", "from-mouth");
          continue;
        }
        sx = (TMP.x * 0.5 + 0.5) * w;
        sy = (1 - (TMP.y * 0.5 + 0.5)) * h;
        slot.el.style.transform = `translate(${sx}px, ${sy + OFFSET_Y_PX}px) translate(-50%, -100%)`;
        slot.el.style.opacity = alpha.toFixed(3);
        slot.el.classList.remove("from-mouth");
        slot.el.classList.add("show");
        slot.el.dataset.stage = "visible";
      }
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
