// DOM label projection + cursor lens.
//
// Every visible note gets a DOM title that tracks its projected screen
// position. The 3D universe produces far more notes than you can read at
// once, so the module does three kinds of quieting:
//
//   1. A cursor "lens" — labels within ~240 px of the pointer always show,
//      at a slightly bigger size. The user's gaze becomes a spotlight.
//   2. Overlap suppression outside the lens — labels are sorted by priority
//      (close + heavy) and greedily placed; any candidate whose AABB
//      collides with a higher-priority already-placed label is skipped.
//   3. Distance-scaled font — far labels are smaller regardless of mass,
//      so the field doesn't read as one uniformly-loud tangle.
//
// The cursor lens fades out after ~1.5 s of no mouse movement so the sky
// settles into its ambient "only the important ones" pattern when you
// stop pointing.

import * as THREE from "three";

const MAX_LABELS = 80;
const UPDATE_EVERY_N_FRAMES = 3;
const FADE_START = 350;
const FADE_END = 1600;
const LENS_RADIUS = 240;
const LENS_RADIUS2 = LENS_RADIUS * LENS_RADIUS;
const LENS_IDLE_MS = 1500;
const LENS_FADE_MS = 500;
const MAX_IN_LENS = 25;
const MAX_AMBIENT = 30;

const TMP = new THREE.Vector3();

export function createLabels({
  vault,
  bodies,
  camera,
  onLabelHover,
  onLabelClick,
  getMode, // () => 'always' | 'hover' | 'never'
  getHoveredId, // () => noteId | null (pointer-hovered body)
}) {
  const container = document.createElement("div");
  container.id = "labels";
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "6",
  });
  document.body.appendChild(container);

  // Modifier pass-through: when Alt or Shift is held, labels stop
  // intercepting pointer events so modifier-driven gestures (link-drag,
  // tether context) reach the canvas cleanly. The update() loop reads
  // this flag when deciding per-slot pointer-events.
  let modifierHeld = false;
  window.addEventListener("keydown", (e) => {
    if (e.altKey || e.shiftKey) modifierHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (!e.altKey && !e.shiftKey) modifierHeld = false;
  });
  window.addEventListener("blur", () => {
    modifierHeld = false;
  });

  const pool = [];
  const noteIdBySlot = new Array(MAX_LABELS).fill(null);
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
      transition: "opacity 180ms ease, color 140ms ease, font-size 140ms ease",
      willChange: "transform, opacity",
      cursor: "pointer",
      pointerEvents: "auto",
      padding: "2px 6px",
      borderRadius: "4px",
    });
    el.addEventListener("mouseenter", () => {
      const id = noteIdBySlot[i];
      if (!id) return;
      el.style.color = "rgba(255, 186, 122, 0.95)";
      if (onLabelHover) onLabelHover(id);
    });
    el.addEventListener("mouseleave", () => {
      el.style.color = "rgba(215, 219, 228, 0.65)";
      if (onLabelHover) onLabelHover(null);
    });
    el.addEventListener("click", (e) => {
      const id = noteIdBySlot[i];
      if (!id) return;
      // Swallow the event so the canvas click-to-open doesn't also fire
      // from the bubble phase and re-target whatever body sits behind the
      // label text.
      e.stopPropagation();
      if (onLabelClick) onLabelClick(id);
    });
    container.appendChild(el);
    pool.push(el);
  }

  // Cursor tracking. Separate from the app's other hover controller so this
  // module stays standalone.
  let cursorX = -1e6;
  let cursorY = -1e6;
  let lastMoveAt = 0;
  window.addEventListener("pointermove", (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    lastMoveAt = performance.now();
  });
  window.addEventListener("pointerleave", () => {
    lastMoveAt = 0;
  });

  let frame = 0;
  const candidates = [];
  // Tracks which note the hover-mode proximity pass is currently treating
  // as hovered. Fires onLabelHover only on change — avoids spamming the
  // downstream orange-flare + orbit systems every frame.
  let proximityHoverId = null;
  function setProximityHover(id) {
    if (id === proximityHoverId) return;
    proximityHoverId = id;
    if (onLabelHover) onLabelHover(id);
  }

  function update() {
    frame++;
    if (frame % UPDATE_EVERY_N_FRAMES !== 0) return;

    const mode = (getMode && getMode()) || "always";

    // Never mode — kill everything and bail. Cheap short-circuit.
    if (mode === "never") {
      for (let i = 0; i < MAX_LABELS; i++) {
        const el = pool[i];
        if (el.style.opacity !== "0") el.style.opacity = "0";
        el.style.pointerEvents = "none";
        noteIdBySlot[i] = null;
      }
      setProximityHover(null);
      return;
    }

    // Hover mode — reveal the nearest star's title when the cursor is in
    // range of it. Radius is generous (scaled by the body's own visual
    // size) so approaching a small star triggers the reveal without
    // pixel-hunting. Preference order per body:
    //   1. exact pointer-hover pick (orange flare already fires on this)
    //   2. nearest body within a proximity radius of the cursor
    if (mode === "hover") {
      const w0 = window.innerWidth;
      const h0 = window.innerHeight;
      // Hide every slot except slot 0 up front.
      for (let i = 1; i < MAX_LABELS; i++) {
        const el = pool[i];
        if (el.style.opacity !== "0") el.style.opacity = "0";
        el.style.pointerEvents = "none";
        noteIdBySlot[i] = null;
      }
      const el0 = pool[0];

      const exactId = getHoveredId && getHoveredId();
      let targetId = exactId || null;

      // Fall back to bodies.pickAt with a generous tolerance. This uses
      // the same distance/body-radius scoring the hover system does, so a
      // tiny star the cursor is directly on beats a larger star a few
      // pixels closer. Cursor inside any sprite → that star wins
      // unambiguously; cursor near a sprite → still wins if no other
      // sprite is closer-relative-to-its-size.
      if (!targetId && cursorX > -1e5 && bodies.pickAt) {
        targetId = bodies.pickAt(cursorX, cursorY, { tolerance: 48 }) || null;
      }

      if (!targetId) {
        if (el0.style.opacity !== "0") el0.style.opacity = "0";
        el0.style.pointerEvents = "none";
        noteIdBySlot[0] = null;
        setProximityHover(null);
        return;
      }
      const note = vault.byId && vault.byId.get(targetId);
      const p = note && bodies.positionOf(targetId);
      if (!note || !p) {
        if (el0.style.opacity !== "0") el0.style.opacity = "0";
        el0.style.pointerEvents = "none";
        noteIdBySlot[0] = null;
        setProximityHover(null);
        return;
      }
      TMP.set(p[0], p[1], p[2]);
      TMP.project(camera);
      if (TMP.z >= 1) {
        el0.style.opacity = "0";
        el0.style.pointerEvents = "none";
        setProximityHover(null);
        return;
      }
      if (el0.textContent !== note.title) el0.textContent = note.title;
      el0.style.left = `${(TMP.x * 0.5 + 0.5) * w0}px`;
      el0.style.top = `${(1 - (TMP.y * 0.5 + 0.5)) * h0}px`;
      el0.style.fontSize = "13px";
      el0.style.fontWeight = "500";
      el0.style.opacity = "1";
      el0.style.pointerEvents = modifierHeld ? "none" : "auto";
      noteIdBySlot[0] = targetId;
      // Fire the full hover experience (orange flare + orbit ring) the
      // moment proximity locks onto a star — not only when the cursor
      // lands on the label DOM itself.
      setProximityHover(targetId);
      return;
    }

    // Always mode — clear any hover-mode proximity state so the orange
    // flare doesn't stick when toggling L.
    if (proximityHoverId !== null) setProximityHover(null);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const now = performance.now();

    // Lens strength: 1 at rest, fades to 0 after LENS_IDLE_MS of no motion.
    const sinceMove = lastMoveAt ? now - lastMoveAt : Infinity;
    let lensStrength = 0;
    if (sinceMove < LENS_IDLE_MS) lensStrength = 1;
    else if (sinceMove < LENS_IDLE_MS + LENS_FADE_MS)
      lensStrength = 1 - (sinceMove - LENS_IDLE_MS) / LENS_FADE_MS;

    candidates.length = 0;
    const massOf = bodies.massOf ? (id) => bodies.massOf(id) : () => 1;
    for (const note of vault.notes) {
      const p = bodies.positionOf(note.id);
      if (!p) continue;
      TMP.set(p[0], p[1], p[2]);
      const worldDist = TMP.distanceTo(camera.position);
      TMP.project(camera);
      if (TMP.z >= 1) continue;
      if (TMP.x < -1.05 || TMP.x > 1.05 || TMP.y < -1.05 || TMP.y > 1.05)
        continue;
      const sx = (TMP.x * 0.5 + 0.5) * w;
      const sy = (1 - (TMP.y * 0.5 + 0.5)) * h;
      const m = massOf(note.id);
      // Cursor proximity — weighted by lensStrength so the spotlight softens
      // to nothing when the user isn't actively pointing.
      const dx = sx - cursorX;
      const dy = sy - cursorY;
      const d2 = dx * dx + dy * dy;
      const inLens = lensStrength > 0.01 && d2 < LENS_RADIUS2;
      const lensScore = inLens ? 1 - Math.sqrt(d2) / LENS_RADIUS : 0;
      // Priority: mass + proximity-to-camera + lens bonus.
      const priority =
        m * 0.6 +
        (1 / (1 + worldDist / 400)) * 1.0 +
        lensScore * 2.5 * lensStrength;
      candidates.push({
        note,
        x: sx,
        y: sy,
        d: worldDist,
        m,
        inLens,
        lensScore,
        priority,
      });
    }
    candidates.sort((a, b) => b.priority - a.priority);

    // Two-pass selection: lens first (always show, skip overlap check),
    // then ambient (overlap-suppressed).
    const placed = []; // {rect} for overlap testing
    const chosen = []; // indices into candidates

    // Pass 1 — lens candidates.
    let lensCount = 0;
    for (let i = 0; i < candidates.length && lensCount < MAX_IN_LENS; i++) {
      if (!candidates[i].inLens) continue;
      const rect = rectFor(candidates[i], sizeFor(candidates[i], lensStrength));
      placed.push(rect);
      chosen.push(i);
      lensCount++;
    }

    // Pass 2 — ambient candidates with overlap suppression.
    let ambientCount = 0;
    for (let i = 0; i < candidates.length && ambientCount < MAX_AMBIENT; i++) {
      if (candidates[i].inLens) continue; // already handled above
      const rect = rectFor(candidates[i], sizeFor(candidates[i], lensStrength));
      let clash = false;
      for (let j = 0; j < placed.length; j++) {
        if (overlaps(rect, placed[j])) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      placed.push(rect);
      chosen.push(i);
      ambientCount++;
    }

    // Limit total to pool size.
    const limit = Math.min(chosen.length, MAX_LABELS);

    // Render — slot i gets chosen[i], else hide.
    for (let i = 0; i < MAX_LABELS; i++) {
      const el = pool[i];
      if (i >= limit) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        noteIdBySlot[i] = null;
        continue;
      }
      const c = candidates[chosen[i]];
      el.style.pointerEvents = modifierHeld ? "none" : "auto";
      if (el.textContent !== c.note.title) el.textContent = c.note.title;
      noteIdBySlot[i] = c.note.id;
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;

      const fontSize = sizeFor(c, lensStrength);
      el.style.fontSize = `${fontSize.toFixed(1)}px`;
      el.style.fontWeight = c.m > 4 || c.inLens ? "500" : "400";

      // Opacity — in-lens always solid, ambient tapered by distance + rank.
      let fade = c.inLens ? 1 : 0.78;
      if (c.d > FADE_START) {
        const far = Math.max(
          0,
          1 - (c.d - FADE_START) / (FADE_END - FADE_START),
        );
        fade *= far;
      }
      el.style.opacity = fade.toFixed(2);
    }
  }

  // Font size as a function of mass, distance, and lens membership.
  function sizeFor(c, lensStrength) {
    const base = 11;
    const massBoost = Math.min(1.9, 0.9 + Math.log(1 + c.m) * 0.32);
    // Near → up to 1.2× base; far → down to ~0.7× base.
    const nearness = 1 / (1 + c.d / 800);
    const distanceScale = 0.72 + 0.5 * nearness;
    const lensBoost = c.inLens ? 1 + 0.28 * c.lensScore * lensStrength : 1;
    return Math.max(8, base * massBoost * distanceScale * lensBoost);
  }

  function rectFor(c, fontSize) {
    // Rough AABB — width scales with title length and font size, plus a
    // small padding so near-touching labels still count as overlapping.
    const halfW = Math.max(24, c.note.title.length * fontSize * 0.32);
    const hH = fontSize * 1.1;
    const PAD = 4;
    return {
      l: c.x - halfW - PAD,
      r: c.x + halfW + PAD,
      t: c.y - 22 - hH - PAD,
      b: c.y - 22 + PAD,
    };
  }

  function overlaps(a, b) {
    return !(a.r < b.l || a.l > b.r || a.b < b.t || a.t > b.b);
  }

  function dispose() {
    container.remove();
  }

  return { update, dispose };
}
