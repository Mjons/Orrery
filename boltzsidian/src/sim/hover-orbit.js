// Small orbiting-planet ring around the currently label-hovered body.
//
// Each "planet" is a single GL point. Count = backlinks + forward links
// of the hovered note, capped at MAX_PLANETS — the depth of the note's
// connective tissue. Orbits gently, fades in/out with the hover state.
//
// The whole apparatus is one THREE.Points; positions live in the shader
// (vertex per-phase angle + uRadius + uTime → orbital sample), so
// per-frame cost is a single uniform push and a few dozen vertices.

import * as THREE from "three";

const MAX_PLANETS = 12;

export function createHoverOrbit({ scene, bodies, vault, renderer }) {
  const positions = new Float32Array(MAX_PLANETS * 3); // body-center anchor
  const phases = new Float32Array(MAX_PLANETS);
  const active = new Float32Array(MAX_PLANETS); // 0/1 — drawn or not
  for (let i = 0; i < MAX_PLANETS; i++) {
    phases[i] = (i / MAX_PLANETS) * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geom.setAttribute(
    "aActive",
    new THREE.BufferAttribute(active, 1).setUsage(THREE.DynamicDrawUsage),
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOrange: { value: new THREE.Color(1.0, 0.52, 0.18) },
      uOpacity: { value: 0 },
      uRadius: { value: 24 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aActive;
      uniform float uTime;
      uniform float uRadius;
      uniform float uPixelRatio;
      varying float vActive;
      void main() {
        // Orbit around the body position on a slightly-inclined ring.
        float ang = aPhase + uTime * 0.9;
        vec3 offset = vec3(
          cos(ang) * uRadius,
          sin(ang * 0.55) * uRadius * 0.28,
          sin(ang) * uRadius
        );
        vec4 mv = modelViewMatrix * vec4(position + offset, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 7.0 * aActive * (420.0 / -mv.z) * uPixelRatio * 0.5;
        vActive = aActive;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uOrange;
      uniform float uOpacity;
      varying float vActive;
      void main() {
        if (vActive < 0.5) discard;
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.15, r) * 0.5;
        gl_FragColor = vec4(uOrange, (core + halo) * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  scene.add(points);

  let currentId = null;
  let targetOpacity = 0;
  let depth = 0;

  function setTarget(noteId) {
    currentId = noteId;
    if (!noteId) {
      targetOpacity = 0;
      return;
    }
    const bl = vault.backward?.get(noteId)?.size || 0;
    const fw = vault.forward?.get(noteId)?.size || 0;
    depth = Math.min(MAX_PLANETS, bl + fw);
    targetOpacity = depth > 0 ? 1 : 0.35; // still show a couple for link-less notes

    // Toggle per-slot activity based on depth so inactive slots are discarded.
    // If a note has zero links, show two planets at reduced opacity so the
    // motif still conveys "this is the one" without flattening everything.
    const minPlanets = depth > 0 ? depth : 2;
    for (let i = 0; i < MAX_PLANETS; i++) active[i] = i < minPlanets ? 1 : 0;
    geom.getAttribute("aActive").needsUpdate = true;
  }

  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    const cur = mat.uniforms.uOpacity.value;
    const next = cur + (targetOpacity - cur) * Math.min(1, dt * 7);
    mat.uniforms.uOpacity.value = next;

    if (!currentId) return;
    const p = bodies.positionOf?.(currentId);
    if (!p) return;
    for (let i = 0; i < MAX_PLANETS; i++) {
      positions[i * 3 + 0] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }
    geom.getAttribute("position").needsUpdate = true;

    // Scale radius with mass so bigger stars get bigger rings.
    const m = bodies.massOf ? bodies.massOf(currentId) : 1;
    mat.uniforms.uRadius.value = 14 + Math.sqrt(Math.max(1, m)) * 6;
  }

  function dispose() {
    scene.remove(points);
    geom.dispose();
    mat.dispose();
  }

  return { setTarget, update, dispose };
}
