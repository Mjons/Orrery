// Boltzsidian Phase 0 renderer.
// Minimal three.js scene + procedural twinkling starfield ported from the sim.
// No bodies yet — Phase 1 adds them.

import * as THREE from "three";

const STAR_COUNT = 2400;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    5000,
  );
  camera.position.set(0, 0, 420);
  camera.lookAt(0, 0, 0);

  scene.add(makeStarfield());

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  let rafId = 0;
  function tick() {
    const t = clock.getElapsedTime();
    // slow camera drift — aesthetic idle
    camera.position.x = Math.sin(t * 0.04) * 22;
    camera.position.y = Math.cos(t * 0.028) * 14;
    camera.lookAt(0, 0, 0);
    scene.userData.starMat.uniforms.uTime.value = t;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  return {
    renderer,
    scene,
    camera,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}

function makeStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  const sizes = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    // spherical shell, log-biased radius so depth reads
    const r = 800 + Math.pow(Math.random(), 0.6) * 1800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.6 + Math.random() * 2.4;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAccent: { value: new THREE.Color(0x8ab4ff) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.6 + 0.4 * sin(uTime * 1.8 + aPhase * 2.3);
        vTwinkle = twinkle;
        gl_PointSize = aSize * twinkle * (300.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      varying float vTwinkle;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.15, r) * 0.4;
        vec3 warm = vec3(1.0, 0.96, 0.9);
        vec3 cool = uAccent;
        vec3 col = mix(warm, cool, 0.15 + vTwinkle * 0.2);
        gl_FragColor = vec4(col, (core + halo) * vTwinkle);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  group.userData = {};

  // stash material on scene via the group userData pipe
  const wrapper = new THREE.Group();
  wrapper.add(group);
  wrapper.userData = {};
  // Expose uniform handle for main loop
  Object.defineProperty(wrapper.userData, "starMat", { value: mat });
  // Also expose at parent level so scene.userData.starMat works
  return Object.assign(wrapper, { userData: { starMat: mat } });
}
