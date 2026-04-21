// Modifier-drag between bodies to create a link.
//
// Accepts EITHER Alt+drag OR Shift+drag. Alt is the documented shortcut;
// Shift is the fallback when a browser extension, OS accessibility feature,
// or PowerPoint-era muscle memory has trained the user to reach for Shift.
//
// Gesture:
//   1. modifier+pointerdown on a body → start drag (disable OrbitControls).
//   2. pointermove renders a preview tether.
//   3. pointerup raycasts the cursor → commit the link if it landed on a
//      different body.
//   4. Re-enable OrbitControls.
//
// Whenever a modifier is held on pointerdown over the canvas, we swallow
// the event (stopImmediatePropagation + preventDefault) even if no body
// was hit. Otherwise OrbitControls' rotate gesture fires for the same
// click and the user sees the camera spin with no indication of whether
// they missed the body or pressed the wrong key.
//
// Ordering note: the pointerdown is registered on `window` with
// `{capture: true}` so it runs during the real capture phase, before the
// event reaches the canvas target. On the canvas itself, listeners fire
// in registration order regardless of their capture flag — and three.js
// OrbitControls registered first (in createRenderer), so a capture-flag
// listener on the canvas would still fire second. Catching at the window
// capture phase is what actually preempts OrbitControls.

const MODIFIER_PICK_TOLERANCE = 28; // generous click target when modifier held

import * as THREE from "three";

const TMP = new THREE.Vector3();

export function createLinkDrag({
  canvas,
  camera,
  controls,
  bodies,
  scene,
  getAccent,
  onCreate,
  onCancel,
}) {
  // Preview line is a single 2-vertex segment drawn with a ShaderMaterial so
  // it can match the tether look.
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(6);
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAccent: { value: new THREE.Color(getAccent ? getAccent() : "#8ab4ff") },
      uOk: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vT;
      void main() {
        vT = float(gl_VertexID);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      uniform float uOk;
      varying float vT;
      void main() {
        // Fade toward the cursor end so the anchor feels solid.
        float a = mix(0.85, 0.55, vT);
        vec3 col = uAccent + vec3(uOk * 0.05);
        gl_FragColor = vec4(col, a * (0.35 + uOk * 0.35));
      }
    `,
  });
  const line = new THREE.LineSegments(geom, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);

  let active = null; // { sourceId, sourceIdx, startDepth }

  function onPointerDown(e) {
    const modifier = e.altKey || e.shiftKey;
    if (!modifier) return;
    if (e.button !== 0) return;
    // Only claim canvas clicks — leave the rest of the DOM (panel, settings,
    // tag prompt, etc.) alone.
    if (e.target !== canvas) return;

    // Swallow any modifier-click on canvas, even a miss, so OrbitControls
    // never rotates under the user's intent. Without this, a 3-pixel miss
    // on a body reads as "Alt doesn't work, the camera spun again" and the
    // whole gesture feels broken.
    e.preventDefault();
    e.stopImmediatePropagation();

    const hit = bodies.pickAt(e.clientX, e.clientY, {
      tolerance: MODIFIER_PICK_TOLERANCE,
    });
    if (!hit) return;
    const i = bodies.indexOfId(hit);
    if (i < 0) return;

    active = {
      sourceId: hit,
      sourceIdx: i,
    };
    controls.enabled = false;
    canvas.setPointerCapture?.(e.pointerId);
    line.visible = true;
    mat.uniforms.uOk.value = 0;
    updatePreview(e.clientX, e.clientY, hit);
  }

  function onPointerMove(e) {
    if (!active) return;
    const target = bodies.pickAt(e.clientX, e.clientY, {
      tolerance: MODIFIER_PICK_TOLERANCE,
    });
    const ok = target && target !== active.sourceId ? 1.0 : 0.0;
    mat.uniforms.uOk.value = ok;
    updatePreview(
      e.clientX,
      e.clientY,
      target && target !== active.sourceId ? target : null,
    );
  }

  function onPointerUp(e) {
    if (!active) return;
    const src = active.sourceId;
    const hit = bodies.pickAt(e.clientX, e.clientY, {
      tolerance: MODIFIER_PICK_TOLERANCE,
    });
    line.visible = false;
    canvas.releasePointerCapture?.(e.pointerId);
    active = null;
    controls.enabled = true;
    if (hit && hit !== src) {
      if (onCreate) onCreate(src, hit);
    } else if (onCancel) {
      onCancel();
    }
  }

  function updatePreview(clientX, clientY, snapTargetId) {
    const sourcePos = bodies.positionOf(active.sourceId);
    if (!sourcePos) return;
    // Source anchor.
    positions[0] = sourcePos[0];
    positions[1] = sourcePos[1];
    positions[2] = sourcePos[2];

    let tx, ty, tz;
    if (snapTargetId) {
      const tp = bodies.positionOf(snapTargetId);
      tx = tp[0];
      ty = tp[1];
      tz = tp[2];
    } else {
      // Unproject cursor at the source body's depth so the preview stays
      // on its orbit plane rather than collapsing to the near plane.
      TMP.set(sourcePos[0], sourcePos[1], sourcePos[2]).project(camera);
      const ndcZ = TMP.z;
      const w = window.innerWidth;
      const h = window.innerHeight;
      TMP.set((clientX / w) * 2 - 1, -((clientY / h) * 2 - 1), ndcZ).unproject(
        camera,
      );
      tx = TMP.x;
      ty = TMP.y;
      tz = TMP.z;
    }
    positions[3] = tx;
    positions[4] = ty;
    positions[5] = tz;
    geom.getAttribute("position").needsUpdate = true;
  }

  function updateAccent(hex) {
    mat.uniforms.uAccent.value.set(hex);
  }

  // Window capture so we run before OrbitControls' canvas handler.
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  // move/up stay on canvas — setPointerCapture routes the rest of the
  // gesture's events to the canvas target.
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  return {
    updateAccent,
    get isActive() {
      return active != null;
    },
    dispose() {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      scene.remove(line);
      geom.dispose();
      mat.dispose();
    },
  };
}
