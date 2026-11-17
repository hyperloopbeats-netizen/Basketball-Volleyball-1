import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CameraFilterMode, GraphicsQualityPreset } from '../../types';

export interface PostFXRenderParams {
  velocityPulse: number;
  slowMoFactor: number;
  rainIntensity: number;
  impactFlash: number;
  impactUV: THREE.Vector2;
  filterMode?: CameraFilterMode;
  lensVignette?: number;
  lensDistortion?: number;
  bloomStrength?: number;
  comicFactor?: number;
  comicBurstUV?: THREE.Vector2;
}

const FILTER_MODE_TO_INT: Record<CameraFilterMode, number> = {
  BROADCAST_STD: 0,
  VICE_NEON: 1,
  CINEMA_NOIR: 2,
  GOLDEN_HOUR: 3,
  VINTAGE_VHS: 4,
  CRISP_HDR: 5,
};

export function getCssFilterForMode(mode: CameraFilterMode): string {
  switch (mode) {
    case 'VICE_NEON':
      return 'saturate(1.36) contrast(1.16) brightness(1.01) hue-rotate(-5deg)';
    case 'CINEMA_NOIR':
      return 'grayscale(0.9) contrast(1.36) brightness(0.95)';
    case 'GOLDEN_HOUR':
      return 'sepia(0.24) saturate(1.28) contrast(1.12) brightness(1.02)';
    case 'VINTAGE_VHS':
      return 'sepia(0.18) contrast(1.08) saturate(0.88) brightness(0.97)';
    case 'CRISP_HDR':
      return 'contrast(1.22) saturate(1.22) brightness(1.02)';
    case 'BROADCAST_STD':
    default:
      return 'contrast(1.06) saturate(1.08)';
  }
}

const PS6CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uVelocityPulse: { value: 0 },
    uSlowMoFactor: { value: 0 },
    uRainIntensity: { value: 0 },
    uImpactFlash: { value: 0 },
    uImpactUV: { value: new THREE.Vector2(0.5, 0.5) },
    uFilterMode: { value: 0 },
    uLensVignette: { value: 0.14 },
    uLensDistortion: { value: 0.0 },
    uComicFactor: { value: 0.0 },
    uComicBurstUV: { value: new THREE.Vector2(0.5, 0.5) },
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
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVelocityPulse;
    uniform float uSlowMoFactor;
    uniform float uRainIntensity;
    uniform float uImpactFlash;
    uniform vec2 uImpactUV;
    uniform float uFilterMode;
    uniform float uLensVignette;
    uniform float uLensDistortion;
    uniform float uComicFactor;
    uniform vec2 uComicBurstUV;

    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec3 applyFilmicSCurve(vec3 c, float contrast, float lift) {
      vec3 x = clamp(c, 0.0, 1.4);
      // Soft shoulder rolloff + deeper rich blacks
      vec3 curved = x * x * (3.0 - 2.0 * clamp(x, 0.0, 1.0));
      return clamp(mix(x, curved, contrast) + lift, 0.0, 1.35);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centerVec = uv - vec2(0.5);
      float r2 = dot(centerVec, centerVec);

      // Optical Lens Geometry: subtle 24mm barrel curvature vs 135mm telephoto compression
      if (abs(uLensDistortion) > 0.001) {
        uv = vec2(0.5) + centerVec * (1.0 + uLensDistortion * r2);
      }

      // 1. Screen-space animated Rain Lens Condensation Droplets (when rain intensifies)
      if (uRainIntensity > 0.05) {
        vec2 aspectUv = vec2(uv.x * (uResolution.x / max(1.0, uResolution.y)), uv.y);
        vec2 grid = aspectUv * vec2(14.0, 9.0);
        grid.y += uTime * 0.45 * uRainIntensity;
        vec2 id = floor(grid);
        vec2 gv = fract(grid) - 0.5;
        float rnd = hash21(id);
        if (rnd > mix(0.95, 0.55, uRainIntensity)) {
          vec2 dropPos = vec2((rnd - 0.5) * 0.45, sin(uTime * 1.4 + rnd * 12.0) * 0.2);
          float d = length(gv - dropPos);
          float dropMask = smoothstep(0.18, 0.04, d);
          uv += (gv - dropPos) * dropMask * 0.022 * uRainIntensity;
        }
      }

      centerVec = uv - vec2(0.5);
      float distCenter = length(centerVec);

      // 2. Spike Velocity Radial Speed Blur, Chromatic Edge Split & Subtle Clarity Sharpen
      float vhsSplit = (uFilterMode > 3.5 && uFilterMode < 4.5) ? 0.0022 : 0.0;
      float radialAmt = uVelocityPulse * 0.011 * smoothstep(0.15, 0.72, distCenter);
      vec2 dir = distCenter > 0.0001 ? centerVec / distCenter : vec2(0.0);
      vec2 sampleOffset = dir * radialAmt * 1.35 + vec2(vhsSplit, 0.0);

      vec2 texel = 1.0 / max(vec2(64.0), uResolution);
      float r = texture2D(tDiffuse, uv + sampleOffset).r;
      vec3 centerTap = texture2D(tDiffuse, uv).rgb;
      float g = centerTap.g;
      float b = texture2D(tDiffuse, uv - sampleOffset).b;
      vec3 color = vec3(r, g, b);

      // Gentle unsharp clarity boost (sharpens jersey numbers, net mesh, & court lines)
      vec3 blurAvg = (
        texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb +
        texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb
      ) * 0.25;
      float clarityStrength = (uFilterMode > 4.5) ? 0.34 : 0.16;
      color = clamp(color + (centerTap - blurAvg) * clarityStrength, 0.0, 1.4);

      // 3. Impact Shockwave Flash around Strike Coordinate
      if (uImpactFlash > 0.01) {
        float impDist = length(uv - uImpactUV);
        float ring = smoothstep(0.28, 0.0, abs(impDist - (1.0 - uImpactFlash) * 0.48));
        color += vec3(0.0, 0.85, 1.0) * ring * uImpactFlash * 0.32;
        color += vec3(1.0, 0.72, 0.35) * smoothstep(0.30, 0.0, impDist) * uImpactFlash * 0.18;
      }

      // 4. Upgraded Filmic Split-Tone LUT Color Filter Grading (6 modes)
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      if (uFilterMode < 0.5) {
        // 0: BROADCAST_STD (rich television contrast with clean deep shadows)
        color = applyFilmicSCurve(mix(vec3(luma), color, 1.08), 0.18, -0.01);
      } else if (uFilterMode > 0.5 && uFilterMode < 1.5) {
        // 1: VICE_NEON (electric cyan shadows + warm coral/magenta highlights + halation glow)
        vec3 sat = mix(vec3(luma), color, 1.32);
        vec3 neonSplit = mix(vec3(0.86, 0.96, 1.15), vec3(1.16, 0.90, 1.08), smoothstep(0.22, 0.82, luma));
        vec3 halation = max(vec3(0.0), blurAvg - vec3(0.72)) * vec3(1.0, 0.35, 0.72) * 0.25;
        color = applyFilmicSCurve(sat * neonSplit + halation, 0.24, -0.015);
      } else if (uFilterMode > 1.5 && uFilterMode < 2.5) {
        // 2: CINEMA_NOIR (high-contrast silver monochrome + restrained cyan/coral selective accent)
        float bw = smoothstep(0.04, 0.92, luma);
        float accent = max(0.0, max(color.r, color.b) - color.g * 1.12);
        vec3 noirBase = mix(vec3(bw * 1.02), color * vec3(1.18, 0.88, 1.24), clamp(accent * 1.45, 0.0, 0.48));
        color = applyFilmicSCurve(noirBase, 0.28, -0.02);
      } else if (uFilterMode > 2.5 && uFilterMode < 3.5) {
        // 3: GOLDEN_HOUR (Pacific sunset amber highlights + cool deep teal shadows)
        vec3 warmHi = color * vec3(1.15, 1.02, 0.84);
        vec3 coolSh = color * vec3(0.84, 0.96, 1.10);
        vec3 split = mix(coolSh, warmHi, smoothstep(0.18, 0.74, luma));
        color = applyFilmicSCurve(mix(vec3(luma), split, 1.18), 0.20, 0.0);
      } else if (uFilterMode > 3.5 && uFilterMode < 4.5) {
        // 4: VINTAGE_VHS (broadcast tape scanlines, halation bloom, & analog grain)
        float scan = 0.955 + 0.045 * sin(vUv.y * max(240.0, uResolution.y * 0.55) + uTime * 8.0);
        float grain = (hash21(vUv * 400.0 + fract(uTime) * 37.0) - 0.5) * 0.04;
        color = mix(vec3(luma), color, 0.90) * vec3(1.04, 0.99, 0.92) * scan + grain;
      } else {
        // 5: CRISP_HDR (stadium flagship S-curve clarity & crisp dynamic highlights)
        vec3 vivid = mix(vec3(luma), color, 1.24);
        color = applyFilmicSCurve(vivid, 0.34, -0.015);
      }

      // Optical lens edge vignette (scales with selected focal length)
      float lensVig = smoothstep(0.98, 0.30, distCenter);
      color *= mix(1.0, (1.0 - uLensVignette) + uLensVignette * lensVig, 0.85);

      // 5. PS6 Slow-Motion Broadcast Cinema Grading + Subtle Letterbox
      if (uSlowMoFactor > 0.01) {
        float sloLuma = dot(color, vec3(0.299, 0.587, 0.114));
        vec3 graded = mix(vec3(sloLuma), color, 1.16);
        graded = mix(graded, graded * vec3(0.96, 1.01, 1.06), 0.35 * uSlowMoFactor);
        float vig = smoothstep(0.92, 0.32, distCenter);
        graded *= mix(1.0, 0.82 + 0.18 * vig, uSlowMoFactor);
        color = mix(color, graded, uSlowMoFactor);

        float barHeight = 0.055 * uSlowMoFactor;
        float topBar = step(1.0 - barHeight, vUv.y);
        float botBar = step(vUv.y, barHeight);
        color = mix(color, vec3(0.02, 0.015, 0.05), clamp(topBar + botBar, 0.0, 1.0));
      }

      // 6. PS6 Comic-Book Strike Effect: Ink Contours, Halftone Dots & Radial Speed Lines
      if (uComicFactor > 0.01) {
        // Ink edge contour boost from neighbor luminance delta
        vec3 nL = texture2D(tDiffuse, uv + vec2(texel.x * 1.6, 0.0)).rgb;
        vec3 nU = texture2D(tDiffuse, uv + vec2(0.0, texel.y * 1.6)).rgb;
        float edge = length(centerTap - nL) + length(centerTap - nU);
        float inkMask = smoothstep(0.14, 0.42, edge) * uComicFactor;

        // Quantized cel-pop contrast + halftone dot screen in mid-dark tones
        float cLuma = dot(color, vec3(0.299, 0.587, 0.114));
        vec3 celCol = floor(color * 5.5 + 0.5) / 5.5;
        vec3 comicColor = mix(color, celCol, 0.42 * uComicFactor);

        vec2 htGrid = fract((uv * uResolution) / 5.5) - 0.5;
        float htDot = smoothstep(0.42, 0.16, length(htGrid));
        float midShade = (1.0 - smoothstep(0.25, 0.72, cLuma)) * 0.28 * uComicFactor;
        comicColor *= 1.0 - htDot * midShade;
        comicColor = mix(comicColor, vec3(0.03, 0.02, 0.06), inkMask * 0.72);

        // Radial Manga/Comic Action Speed Lines emanating from uComicBurstUV
        vec2 burstDelta = uv - uComicBurstUV;
        float burstDist = length(burstDelta);
        float burstAngle = atan(burstDelta.y, burstDelta.x);
        float streak = pow(max(0.0, sin(burstAngle * 42.0 + uTime * 22.0) * sin(burstAngle * 17.0 - uTime * 11.0)), 6.0);
        float radialZone = smoothstep(0.18, 0.68, burstDist);
        comicColor += vec3(0.95, 0.98, 1.0) * streak * radialZone * uComicFactor * 0.48;

        // Crisp dark comic frame border
        float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float panelInk = smoothstep(0.018, 0.008, edgeDist) * uComicFactor;
        color = mix(comicColor, vec3(0.04, 0.02, 0.08), panelInk * 0.85);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * PS6PostFXPipeline (Graphics System 2)
 * Multi-pass EffectComposer post-processing pipeline combining:
 *  - RenderPass (full 3D scene)
 *  - UnrealBloomPass (neon Vice Coast highlights & rim bioluminescence)
 *  - PS6CinematicShader Pass (spike chromatic radial blur, raindrop lens refraction,
 *    shockwave impact pulse, user camera color filters, lens vignette, & slow-mo letterbox)
 *  - OutputPass (ACES Filmic tone mapping + sRGB conversion)
 * Automatically bypasses to direct renderer.render() on software WebGL or when toggled off.
 */
export class PS6PostFXPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private cinematicPass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;

  private enabled = true;
  private qualityBloomMultiplier = 1.0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    isSoftwareGl: boolean
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.isSoftwareGl = isSoftwareGl;

    if (!isSoftwareGl) {
      this.initComposer();
    }
  }

  private initComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const w = Math.max(1, size.x);
    const h = Math.max(1, size.y);

    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(w, h);

    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.42, 0.91);
    const cinematicPass = new ShaderPass(PS6CinematicShader);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(cinematicPass);
    composer.addPass(outputPass);

    this.composer = composer;
    this.renderPass = renderPass;
    this.bloomPass = bloomPass;
    this.cinematicPass = cinematicPass;
    this.outputPass = outputPass;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled && !this.isSoftwareGl && this.composer !== null;
  }

  public setQualityPreset(quality: GraphicsQualityPreset) {
    if (quality === 'LOW') {
      this.qualityBloomMultiplier = 0.0;
    } else if (quality === 'MEDIUM') {
      this.qualityBloomMultiplier = 0.68;
    } else if (quality === 'HIGH') {
      this.qualityBloomMultiplier = 1.0;
    } else {
      this.qualityBloomMultiplier = 1.24;
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = quality !== 'LOW';
    }
  }

  public setSize(width: number, height: number, pixelRatio: number) {
    if (!this.composer) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloomPass?.resolution.set(w, h);
    if (this.cinematicPass) {
      this.cinematicPass.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio);
    }
  }

  public render(dt: number, timeSec: number, params: PostFXRenderParams) {
    if (!this.isEnabled() || !this.composer || !this.cinematicPass || !this.bloomPass) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const u = this.cinematicPass.uniforms;
    u.uTime.value = timeSec;
    u.uVelocityPulse.value = THREE.MathUtils.clamp(params.velocityPulse, 0, 1);
    u.uSlowMoFactor.value = THREE.MathUtils.clamp(params.slowMoFactor, 0, 1);
    u.uRainIntensity.value = THREE.MathUtils.clamp(params.rainIntensity, 0, 1);
    u.uImpactFlash.value = THREE.MathUtils.clamp(params.impactFlash, 0, 1);
    u.uImpactUV.value.copy(params.impactUV);
    u.uFilterMode.value = FILTER_MODE_TO_INT[params.filterMode ?? 'BROADCAST_STD'] ?? 0;
    u.uLensVignette.value = THREE.MathUtils.clamp(params.lensVignette ?? 0.14, 0.0, 0.48);
    u.uLensDistortion.value = THREE.MathUtils.clamp(params.lensDistortion ?? 0.0, -0.14, 0.14);
    u.uComicFactor.value = THREE.MathUtils.clamp(params.comicFactor ?? 0.0, 0.0, 1.0);
    if (params.comicBurstUV) {
      u.uComicBurstUV.value.copy(params.comicBurstUV);
    }

    const baseBloom = params.bloomStrength ?? (0.18 + params.slowMoFactor * 0.12 + params.impactFlash * 0.14);
    this.bloomPass.strength = baseBloom * this.qualityBloomMultiplier;
    this.composer.render(dt);
  }

  public dispose() {
    this.bloomPass?.dispose();
    this.cinematicPass?.dispose();
    this.outputPass?.dispose();
    this.composer?.dispose();
    this.renderPass = null;
    this.bloomPass = null;
    this.cinematicPass = null;
    this.outputPass = null;
    this.composer = null;
  }
}
