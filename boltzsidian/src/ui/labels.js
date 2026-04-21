// DOM label projection. Each frame (throttled) project body world-positions
// to screen and show floating titles for the N nearest to camera.
// Labels fade with distance so far-away bodies don't clutter the view.

import * as THREE from "three";

const MAX_LABELS = 150;
const UPDATE_EVERY_N_FRAMES = 3;
const FADE_START = 350;
const FADE_END = 1600;

const TMP = new THREE.Vector3();

export function createLabels({ vault, bodies, camera }) {
  const container = document.createElement("div");
  container.id = "labels";
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "6",
  });
  document.body.appendChild(container);

  const pool = [];
  for (let i = 0; i < MAX_LABELS; i++) {
    const el = document.createElement("div");
    el.className = "label";
    Object.assign(el.style, {
      position: "absolute",
      fontSize: "11px",
      fontWeight: "400",
      color: "rgba(215, 219, 228, 0.65)",
      letterSpacing: "0.015em",
      whiteSpace: "nowrap",
      textShadow: "0 0 8px rgba(0, 0, 0, 0.8)",
      transform: "translate(-50%, -22px)",
      opacity: "0",
      transition: "opacity 180ms ease",
      willChange: "transform, opacity",
    });
    container.appendChild(el);
    pool.push(el);
  }

  let frame = 0;
  const candidates = [];

  function update() {
    frame++;
    if (frame % UPDATE_EVERY_N_FRAMES !== 0) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    candidates.length = 0;
    for (const note of vault.notes) {
      const p = bodies.positionOf(note.id);
      if (!p) continue;
      TMP.set(p[0], p[1], p[2]);
      const worldDist = TMP.distanceTo(camera.position);
      TMP.project(camera);
      if (TMP.z >= 1) continue; // behind camera
      if (TMP.x < -1.05 || TMP.x > 1.05 || TMP.y < -1.05 || TMP.y > 1.05)
        continue;
      candidates.push({
        note,
        x: (TMP.x * 0.5 + 0.5) * w,
        y: (1 - (TMP.y * 0.5 + 0.5)) * h,
        d: worldDist,
      });
    }
    candidates.sort((a, b) => a.d - b.d);

    const limit = Math.min(candidates.length, MAX_LABELS);
    for (let i = 0; i < MAX_LABELS; i++) {
      const el = pool[i];
      if (i >= limit) {
        el.style.opacity = "0";
        continue;
      }
      const c = candidates[i];
      if (el.textContent !== c.note.title) el.textContent = c.note.title;
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
      let fade = 1;
      if (c.d > FADE_START) {
        fade = Math.max(0, 1 - (c.d - FADE_START) / (FADE_END - FADE_START));
      }
      el.style.opacity = fade.toFixed(2);
    }
  }

  function dispose() {
    container.remove();
  }

  return { update, dispose };
}
