// Post-processing: EffectComposer + UnrealBloomPass + a single vignette/
// temperature/grain ShaderPass.  The bloom pass gives tight clusters a
// collective glow for free — see AMBIENCE.md §2.1. The vignette/grain/
// temperature pass cheaply differentiates named ambience presets without
// a fleet of extra render targets.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const LookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uTemperature: { value: 0.0 },
    uGrain: { value: 0.0 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uTemperature;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // Vignette: darken corners more than centre.
      vec2 c = vUv - 0.5;
      float d2 = dot(c, c);
      float vig = 1.0 - uVignette * smoothstep(0.08, 0.85, d2 * 2.0);
      col.rgb *= vig;
      // Temperature: +warm / -cool. Small amount; big numbers look tacky.
      // Strength dialed by the user's "Ambience intensity" (pre-applied
      // to uTemperature / uVignette / uGrain in post.apply()).
      col.r += uTemperature * 0.04;
      col.g += uTemperature * 0.008;
      col.b -= uTemperature * 0.045;
      // Grain: additive monochrome film noise.
      if (uGrain > 0.001) {
        float g = (hash(vUv * 1200.0 + uTime) - 0.5) * uGrain * 0.08;
        col.rgb += g;
      }
      gl_FragColor = col;
    }
  `,
};

export function createPost({ renderer, scene, camera }) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.95, // strength
    0.8, // radius
    0.32, // threshold
  );
  composer.addPass(bloomPass);

  const lookPass = new ShaderPass(LookShader);
  composer.addPass(lookPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // RENDER_QUALITY.md Phase A — quality tier multiplies the
  // ambience-authored values. We cache the last-applied ambience +
  // intensity so `setQuality` can re-apply with the new scales
  // without the caller having to know what was active.
  let currentAmbience = null;
  let currentIntensity = 1;
  let qualityScales = {
    bloomStrengthScale: 1,
    bloomRadiusScale: 1,
    vignetteScale: 1,
    grainScale: 1,
    temperatureScale: 1,
  };

  function setSize(w, h) {
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  }

  // Applies a mixed ambience. See ambience.js. The `intensity` scalar
  // (default 1) is a user dial that pre-multiplies the look-pass effects
  // (temperature, vignette, grain) so users can make preset differences
  // more or less pronounced without editing presets. Bloom is unaffected
  // — bloom character is part of the preset's identity.
  function apply(ambience, intensity = 1) {
    if (!ambience) return;
    currentAmbience = ambience;
    currentIntensity = intensity;
    const k = Math.max(0, intensity);
    const q = qualityScales;
    bloomPass.strength = ambience.bloomStrength * q.bloomStrengthScale;
    bloomPass.radius = ambience.bloomRadius * q.bloomRadiusScale;
    bloomPass.threshold = ambience.bloomThreshold;
    lookPass.uniforms.uVignette.value = ambience.vignette * k * q.vignetteScale;
    lookPass.uniforms.uTemperature.value =
      ambience.temperature * k * q.temperatureScale;
    lookPass.uniforms.uGrain.value = ambience.grain * k * q.grainScale;
  }

  function tickTime(t) {
    lookPass.uniforms.uTime.value = t;
  }

  // RENDER_QUALITY.md Phase A — accept a tier record and re-apply
  // the current ambience with the tier's scales. Also reconciles
  // composer pixel ratio after `renderer.setPixelRatio`.
  function setQuality(tier) {
    qualityScales = {
      bloomStrengthScale: tier.bloomStrengthScale ?? 1,
      bloomRadiusScale: tier.bloomRadiusScale ?? 1,
      vignetteScale: tier.vignetteScale ?? 1,
      grainScale: tier.grainScale ?? 1,
      temperatureScale: tier.temperatureScale ?? 1,
    };
    // Re-align render-target dimensions with the renderer's (possibly
    // freshly-changed) pixel ratio. Without setPixelRatio + setSize,
    // bloom renders into a mismatched buffer and the output looks
    // blurry or scaled wrong after a tier transition.
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
    if (currentAmbience) apply(currentAmbience, currentIntensity);
  }

  return {
    composer,
    bloomPass,
    lookPass,
    setSize,
    apply,
    tickTime,
    setQuality,
  };
}
