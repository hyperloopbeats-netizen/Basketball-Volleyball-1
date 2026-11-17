import * as THREE from 'three';

export interface SentientBioFrameInput {
  atpFlux: number;
  tissueMass: number;
  tension: number;
  biolume: number;
  rippleKinetic: number;
  hasImpact: boolean;
  impactPos: THREE.Vector3;
  bassAmp?: number;
  trebleAmp?: number;
  turbulence?: number;
  fractalFold?: number;
  huntMode?: boolean;
  cellularEnabled?: boolean;
}

/**
 * SentientGameMatrix
 * Flat, non-clipping PS6 sub-surface floor wave shader & outer-perimeter stadium aura:
 *  - Zero vertex Z-displacement so inlaid court lines, ball shadows & player shoes never clip.
 *  - Subtle sub-surface kinetic ball impact rings & gentle caustic flow sitting cleanly
 *    at y = 0.003 (renderOrder = 1), strictly underneath court lines (y = 0.010, renderOrder = 2).
 *  - Outer-perimeter refraction halo placed cleanly outside the 15m x 25m free-zone apron
 *    (radius 15.35m..15.75m) so it never slices diagonally across apron corners.
 */
export class SentientGameMatrix {
  public readonly courtMembraneMat: THREE.ShaderMaterial;
  public readonly arenaHaloMat: THREE.ShaderMaterial;
  public readonly stadiumBeamsGroup: THREE.Group;
  private readonly courtWidth: number;
  private readonly courtLength: number;
  private lastImpactTime = -10.0;

  constructor(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    _camera: THREE.PerspectiveCamera,
    courtWidth = 9.0,
    courtLength = 18.0
  ) {
    this.courtWidth = courtWidth;
    this.courtLength = courtLength;

    // 1. Flat Sub-Surface Kinetic Ripple & Tactical Caustic Layer (NO vertex displacement -> zero clipping)
    this.courtMembraneMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTouchPos: { value: new THREE.Vector2(0.5, 0.5) },
        uTouchTime: { value: -10.0 },
        uMitosis: { value: 1.0 },
        uBiolume: { value: 1.0 },
        uAtpFlux: { value: 0.98 },
        uTension: { value: 0.45 },
        uBassAmp: { value: 0.0 },
        uRippleStrength: { value: 0.0 },
        uMatrixEnabled: { value: 1.0 },
        uOpacity: { value: 0.14 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vViewPos;

        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uTouchPos;
        uniform float uTouchTime;
        uniform float uMitosis;
        uniform float uTension;
        uniform float uBiolume;
        uniform float uAtpFlux;
        uniform float uBassAmp;
        uniform float uRippleStrength;
        uniform float uMatrixEnabled;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vViewPos;

        void main() {
          vec3 bioCyan = vec3(0.04, 0.88, 0.96);
          vec3 bioTeal = vec3(0.04, 0.65, 0.72);
          vec3 bioPink = vec3(0.95, 0.25, 0.55);

          // Grazing Fresnel edge highlight
          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(1.0 - max(0.0, abs(viewDir.z)), 2.8);

          // Smooth sub-surface kinetic wave (pure fragment shader, zero Z-fighting)
          float wave = 0.5 + 0.5 * sin(vUv.x * 12.0 + uTime * 1.4) * cos(vUv.y * 18.0 - uTime * 1.1);
          float diagFlow = smoothstep(0.75, 0.98, sin((vUv.x * 6.0 + vUv.y * 12.0) - uTime * 1.8));

          // Soft perimeter border & 3m attack-zone shimmer accent instead of harsh white square grid
          vec2 edgeDist = min(vUv, 1.0 - vUv);
          float borderGlow = smoothstep(0.045, 0.0, min(edgeDist.x, edgeDist.y)) * uMatrixEnabled;
          float atkBand = smoothstep(0.022, 0.0, abs(abs(vUv.y - 0.5) - 0.16667)) * uMatrixEnabled;

          // Expanding kinetic impact wave on ball contact/bounce
          float distToTouch = distance(vec2(vUv.x * 0.5, vUv.y), vec2(uTouchPos.x * 0.5, uTouchPos.y));
          float age = max(0.0, uTime - uTouchTime);
          float ring = 0.0;
          if (age < 1.55) {
            float radius = age * 0.34;
            ring = smoothstep(0.036, 0.0, abs(distToTouch - radius)) * exp(-age * 2.1);
          }

          vec3 baseCol = mix(bioTeal, bioCyan, wave * 0.6 + diagFlow * 0.4);
          vec3 sideTint = mix(bioCyan, bioPink, step(0.5, vUv.y));
          vec3 finalColor = mix(baseCol * 0.35, sideTint * 0.85, clamp(borderGlow * 0.7 + atkBand * 0.45, 0.0, 1.0));
          finalColor += bioCyan * ring * (1.1 + uRippleStrength * 0.65 + uBassAmp * 0.45);
          finalColor += bioTeal * fresnel * 0.14 * uAtpFlux;

          float alpha = clamp(
            uOpacity * (0.18 + diagFlow * 0.14 + borderGlow * 0.45 + atkBand * 0.3) * uMatrixEnabled
            + ring * 0.42
            + fresnel * 0.04,
            0.0,
            0.34
          );
          gl_FragColor = vec4(finalColor * clamp(uBiolume * 0.85, 0.7, 1.25), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const membraneGeo = new THREE.PlaneGeometry(courtWidth, courtLength, 1, 1);
    const membraneMesh = new THREE.Mesh(membraneGeo, this.courtMembraneMat);
    membraneMesh.rotation.x = -Math.PI / 2;
    membraneMesh.position.y = 0.006;
    membraneMesh.renderOrder = 1;
    scene.add(membraneMesh);

    // 2. Grounded Outer-Perimeter Odonata-Net Refraction Halo (outside 15m x 25m apron corners r > 14.6m)
    this.arenaHaloMat = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_touch: { value: new THREE.Vector2(0.5, 0.5) },
        u_bassAmp: { value: 0.0 },
        u_trebleAmp: { value: 0.0 },
        u_turbulence: { value: 0.618 },
        u_fractalFold: { value: 3.0 },
        u_qualityScale: { value: 1.0 },
        u_huntMode: { value: 1.0 },
        u_opacity: { value: 0.16 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float u_time;
        uniform vec2 u_touch;
        uniform float u_bassAmp;
        uniform float u_trebleAmp;
        uniform float u_turbulence;
        uniform float u_fractalFold;
        uniform float u_qualityScale;
        uniform float u_huntMode;
        uniform float u_opacity;

        void main() {
          vec2 st = (vUv - 0.5) * 2.0;
          float r = length(st);
          float theta = atan(st.y, st.x);
          float pulse = 0.5 + 0.5 * sin(theta * 12.0 - u_time * 2.2 + r * 6.0);
          float spark = smoothstep(0.85, 1.0, abs(sin(theta * 24.0 + u_time * 6.0))) * (0.15 + u_trebleAmp);

          vec3 cinematicTeal = vec3(0.02, 0.55, 0.90);
          vec3 cinematicCoral = vec3(0.96, 0.25, 0.52);

          vec3 color = mix(cinematicTeal, cinematicCoral, pulse);
          color += vec3(0.15, 0.85, 0.95) * spark;

          float alpha = clamp(u_opacity * (0.45 + pulse * 0.55) + u_bassAmp * 0.14, 0.05, 0.36);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const halo = new THREE.Mesh(new THREE.RingGeometry(15.45, 15.85, 64), this.arenaHaloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, -0.008, 0);
    halo.renderOrder = 1;
    scene.add(halo);

    // 3. PS6 Subtle Outer-Perimeter Volumetric Floodlights (high & wide outside all camera sightlines)
    this.stadiumBeamsGroup = new THREE.Group();
    const beamGeo = new THREE.ConeGeometry(2.6, 17, 16, 1, true);
    const beamCoords: [number, number, number][] = [
      [-9.4, -13.2, 0x00f0ff],
      [9.4, -13.2, 0xff3d7f],
      [-9.4, 13.2, 0xff3d7f],
      [9.4, 13.2, 0x00f0ff],
    ];
    for (const [bx, bz, colHex] of beamCoords) {
      const beamMat = new THREE.MeshBasicMaterial({
        color: colHex,
        transparent: true,
        opacity: 0.022,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(bx * 1.45, 16.0, bz * 1.35);
      beam.lookAt(bx * 0.72, 0, bz * 0.72);
      beam.rotateX(Math.PI / 2);
      this.stadiumBeamsGroup.add(beam);
    }
    scene.add(this.stadiumBeamsGroup);
  }

  public injectCourtImpact(worldX: number, worldZ: number, timeSec: number) {
    const u = THREE.MathUtils.clamp(worldX / this.courtWidth + 0.5, 0, 1);
    const v = THREE.MathUtils.clamp(worldZ / this.courtLength + 0.5, 0, 1);
    this.courtMembraneMat.uniforms.uTouchPos.value.set(u, v);
    this.courtMembraneMat.uniforms.uTouchTime.value = timeSec;
    this.lastImpactTime = timeSec;
  }

  public update(_delta: number, timeSec: number, input: SentientBioFrameInput) {
    if (input.hasImpact && timeSec - this.lastImpactTime > 0.05) {
      this.injectCourtImpact(input.impactPos.x, input.impactPos.z, timeSec);
    }

    const bass = input.bassAmp ?? 0;
    const treble = input.trebleAmp ?? 0;

    this.courtMembraneMat.uniforms.uTime.value = timeSec;
    this.courtMembraneMat.uniforms.uAtpFlux.value = input.atpFlux;
    this.courtMembraneMat.uniforms.uMitosis.value = input.tissueMass;
    this.courtMembraneMat.uniforms.uTension.value = input.tension;
    this.courtMembraneMat.uniforms.uBiolume.value = THREE.MathUtils.clamp(input.biolume / 88.2, 0.75, 1.35);
    this.courtMembraneMat.uniforms.uBassAmp.value = bass;
    this.courtMembraneMat.uniforms.uRippleStrength.value = input.rippleKinetic;
    if (typeof input.cellularEnabled === 'boolean') {
      this.courtMembraneMat.uniforms.uMatrixEnabled.value = input.cellularEnabled ? 1.0 : 0.0;
    }

    this.arenaHaloMat.uniforms.u_time.value = timeSec;
    this.arenaHaloMat.uniforms.u_bassAmp.value = bass;
    this.arenaHaloMat.uniforms.u_trebleAmp.value = treble;
    this.arenaHaloMat.uniforms.u_turbulence.value = input.turbulence ?? 0.618;
    this.arenaHaloMat.uniforms.u_fractalFold.value = input.fractalFold ?? 3.0;
    this.arenaHaloMat.uniforms.u_huntMode.value = input.huntMode === false ? 0.0 : 1.0;

    for (const child of this.stadiumBeamsGroup.children) {
      const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.clamp(0.016 + bass * 0.036, 0.014, 0.054);
    }
  }
}
