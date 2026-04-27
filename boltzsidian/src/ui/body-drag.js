// Bare-left-drag a body to a new position in the field.
// PLACEMENT_BUILD.md Phase 0.5 — the missing primitive that the
// rest of the placement work depends on.
//
// Gesture:
//   1. Bare-left pointerdown on a body (NO modifier) → arm a
//      pending drag. We don't claim the gesture yet — the user
//      might still be clicking to open the panel.
//   2. pointermove ≥ DRAG_THRESHOLD pixels → promote to an active
//      drag. Disable OrbitControls, setPointerCapture so the rest
//      of the gesture lands on canvas. From here every move
//      updates the body's position, projecting the cursor to a
//      constant-depth plane (the body's depth at drag start) so
//      the body slides parallel to the camera plane rather than
//      along the cursor ray.
//   3. pointerup → re-enable OrbitControls, fire onRelease so the
//      caller can mark stateDirty + apply the soft hold (Phase 1).
//
// Coexistence:
//   - Modifier-held pointerdown is left alone (link-drag and
//     anchor-drag claim those).
//   - Pointerdown on empty space falls through to OrbitControls
//     (camera rotate).
//   - Movement under the threshold leaves the click semantics
//     intact: the existing click-to-open handler still fires
//     because we never call stopImmediatePropagation in the
//     pre-claim window.
//
// Capture-phase listener on window so we run before OrbitControls'
// canvas pointerdown handler — same reasoning as link-drag.js.

import * as THREE from "three";

const PICK_TOLERANCE = 18;
const DRAG_THRESHOLD = 5; // pixels of movement before we claim the drag

const TMP_PROJ = new THREE.Vector3();
const TMP_UNPROJ = new THREE.Vector3();

export function createBodyDrag({
  canvas,
  camera,
  controls,
  bodies,
  onRelease, // (noteId, finalPos) => void — fires only when an
  // active drag actually moved the body. Click-without-drag does
  // not fire onRelease.
}) {
  // pending: pointerdown landed on a body but we haven't moved past
  //   the threshold yet.
  // active: drag is claimed; OrbitControls is disabled, body is
  //   being repositioned.
  let pending = null;
  let active = null;

  function onPointerDown(e) {
    // Modifier-held → leave for link-drag / anchor-drag.
    if (e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return;
    if (e.button !== 0) return;
    if (e.target !== canvas) return;

    const hit = bodies.pickAt(e.clientX, e.clientY, {
      tolerance: PICK_TOLERANCE,
    });
    if (!hit) return;

    pending = {
      noteId: hit,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      // Capture the body's NDC depth at drag start so unprojection
      // during pointermove lands on the same camera-facing plane.
      depth: ndcDepthOf(hit),
    };
    if (pending.depth == null) {
      // Off-screen / picker mismatch — abort cleanly.
      pending = null;
    }
    // Don't claim yet. The click handler still needs to fire if
    // the user lifts without moving.
  }

  function onPointerMove(e) {
    if (active) {
      const next = unprojectToDepth(e.clientX, e.clientY, active.depth);
      if (next) bodies.moveBody(active.noteId, next);
      return;
    }
    if (!pending) return;
    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    // Threshold crossed — promote to active drag.
    active = pending;
    pending = null;
    controls.enabled = false;
    canvas.setPointerCapture?.(active.pointerId);
    // Apply the first move immediately so the body snaps under the
    // cursor rather than waiting for the next pointermove.
    const next = unprojectToDepth(e.clientX, e.clientY, active.depth);
    if (next) bodies.moveBody(active.noteId, next);
    // From here on, swallow the events so OrbitControls + click
    // handler don't react.
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onPointerUp(e) {
    if (active) {
      const droppedId = active.noteId;
      const finalPos = bodies.positionOf(droppedId);
      canvas.releasePointerCapture?.(active.pointerId);
      active = null;
      controls.enabled = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (onRelease && finalPos) onRelease(droppedId, finalPos);
      return;
    }
    // Clean up pending without firing — click handler will pick this
    // up as an open-note action because we never moved past threshold.
    pending = null;
  }

  // Project a body's world position to NDC and return its z.
  // Returns null if positionOf fails.
  function ndcDepthOf(noteId) {
    const p = bodies.positionOf(noteId);
    if (!p) return null;
    TMP_PROJ.set(p[0], p[1], p[2]).project(camera);
    return TMP_PROJ.z;
  }

  // Unproject a screen coord at a fixed NDC z back to world space.
  function unprojectToDepth(clientX, clientY, ndcZ) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    TMP_UNPROJ.set(
      (clientX / w) * 2 - 1,
      -((clientY / h) * 2 - 1),
      ndcZ,
    ).unproject(camera);
    return [TMP_UNPROJ.x, TMP_UNPROJ.y, TMP_UNPROJ.z];
  }

  // Window capture so we run before OrbitControls' canvas handler.
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("pointercancel", onPointerUp, { capture: true });

  return {
    get isActive() {
      return active != null;
    },
    dispose() {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerUp, {
        capture: true,
      });
    },
  };
}
