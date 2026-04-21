// Body rendering: one GL point per note, click raycasting, mass-driven sizing.
// Phase 1 treats all notes as one kind (palette-wise); kind assignment comes
// when tag → kind maps are introduced in Phase 2.

import * as THREE from "three";

const TMP_V = new THREE.Vector3();

export function createBodies({ scene, camera, vault, positions, renderer }) {
  const n = vault.notes.length;
  if (n === 0) return null;

  const pos = new Float32Array(n * 3);
  const mass = new Float32Array(n);
  const phase = new Float32Array(n);
  const noteIds = new Array(n);

  for (let i = 0; i < n; i++) {
    const note = vault.notes[i];
    const p = positions[note.id] || [0, 0, 0];
    pos[i * 3 + 0] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
    const backlinks = vault.backward.get(note.id)?.size || 0;
    const words = Math.max(1, note.words || 0);
    mass[i] = 1 + backlinks * 0.8 + Math.log(1 + words) * 0.55;
    phase[i] = Math.random() * Math.PI * 2;
    noteIds[i] = note.id;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("aMass", new THREE.BufferAttribute(mass, 1));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));

  // Per-body dim/bright amplitude, writable for search and hover highlighting.
  const glow = new Float32Array(n).fill(1.0);
  geom.setAttribute(
    "aGlow",
    new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage),
  );

  // Per-body selected flag (0/1), writable for click highlight.
  const selected = new Float32Array(n);
  geom.setAttribute(
    "aSelected",
    new THREE.BufferAttribute(selected, 1).setUsage(THREE.DynamicDrawUsage),
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAccent: { value: new THREE.Color(getAccent()) },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aMass;
      attribute float aPhase;
      attribute float aGlow;
      attribute float aSelected;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vGlow;
      varying float vSelected;
      varying float vPulse;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float baseSize = 4.0 + sqrt(aMass) * 5.0;
        float pulse = 0.9 + 0.1 * sin(uTime * 0.8 + aPhase * 2.3);
        float selBoost = 1.0 + aSelected * 0.75;
        gl_PointSize = baseSize * pulse * selBoost * (420.0 / -mv.z) * uPixelRatio * 0.5;
        vGlow = aGlow;
        vSelected = aSelected;
        vPulse = pulse;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      varying float vGlow;
      varying float vSelected;
      varying float vPulse;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.12, r) * 0.55;
        float ring = vSelected * smoothstep(0.5, 0.36, r) * (1.0 - smoothstep(0.36, 0.22, r)) * 1.4;
        vec3 warm = vec3(1.0, 0.97, 0.92);
        vec3 cool = uAccent;
        vec3 col = mix(warm, cool, 0.25 + vSelected * 0.4);
        float alpha = (core + halo + ring) * vGlow * vPulse;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  scene.add(points);

  // Raycast — Points.threshold is world-space. Tune to feel in Phase 1.
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 10 };

  // Cache screen-space positions each frame so click resolution is cheap and
  // accounts for variable point size. We pick the body with the smallest
  // (screen-space-distance / effective-radius) under a cap.
  const screen = new Float32Array(n * 2);
  const visible = new Uint8Array(n);
  function updateScreen() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < n; i++) {
      TMP_V.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      TMP_V.project(camera);
      const behind = TMP_V.z >= 1;
      visible[i] = behind ? 0 : 1;
      screen[i * 2] = (TMP_V.x * 0.5 + 0.5) * w;
      screen[i * 2 + 1] = (1 - (TMP_V.y * 0.5 + 0.5)) * h;
    }
  }

  function pickAt(clientX, clientY) {
    updateScreen();
    let bestId = null;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visible[i]) continue;
      const dx = screen[i * 2] - clientX;
      const dy = screen[i * 2 + 1] - clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      // approx effective pixel radius ~= body size / 2
      const radius = 6 + Math.sqrt(mass[i]) * 4;
      if (d > radius + 10) continue;
      const score = d / radius;
      if (score < bestScore) {
        bestScore = score;
        bestId = noteIds[i];
      }
    }
    return bestId;
  }

  const indexOf = new Map();
  for (let i = 0; i < n; i++) indexOf.set(noteIds[i], i);

  function setSelected(noteId) {
    selected.fill(0);
    if (noteId != null && indexOf.has(noteId))
      selected[indexOf.get(noteId)] = 1;
    geom.getAttribute("aSelected").needsUpdate = true;
  }

  function setGlowFilter(matchIds) {
    if (!matchIds) {
      glow.fill(1.0);
    } else {
      const set = matchIds instanceof Set ? matchIds : new Set(matchIds);
      for (let i = 0; i < n; i++) glow[i] = set.has(noteIds[i]) ? 1.3 : 0.2;
    }
    geom.getAttribute("aGlow").needsUpdate = true;
  }

  function positionOf(noteId) {
    const i = indexOf.get(noteId);
    if (i == null) return null;
    return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  }

  return {
    mesh: points,
    material: mat,
    pickAt,
    setSelected,
    setGlowFilter,
    positionOf,
    count: n,
    updateAccent(hex) {
      mat.uniforms.uAccent.value.set(hex);
    },
  };
}

function getAccent() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  return v || "#8ab4ff";
}
