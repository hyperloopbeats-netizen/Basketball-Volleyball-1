import * as THREE from 'three';
import { CourtSurface, MatchEvolutionState, Unit } from '../../types';

const MAX_PARTICLES = 2400;
const MAX_RAIN_SPLASHES = 18;

interface SplashSlot {
  mesh: THREE.Mesh;
  active: boolean;
  life: number;
  maxLife: number;
}

/**
 * AtmosphericParticleSystem (Graphics System 1)
 * GPU Shader-driven particle engine uniting 4 match-aligned physical effects:
 *  - Kind 0: Arena & Footwork Dust motes / diving court plumes
 *  - Kind 1: Ballistic Sand sprays & coastal squall grains
 *  - Kind 2: Velocity-stretched Stadium Rain streaks + floor splash rings
 *  - Kind 3: Athlete Exertion Sweat droplets flung from jumps, dives & spikes
 * Zero-GC per frame via pre-allocated typed arrays and object pools.
 */
export class AtmosphericParticleSystem {
  private readonly scene: THREE.Scene;
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly lives = new Float32Array(MAX_PARTICLES);
  private readonly maxLives = new Float32Array(MAX_PARTICLES);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly kinds = new Float32Array(MAX_PARTICLES); // 0=Dust, 1=Sand, 2=Rain, 3=Sweat
  private readonly seeds = new Float32Array(MAX_PARTICLES);

  private readonly posAttr: THREE.BufferAttribute;
  private readonly velAttr: THREE.BufferAttribute;
  private readonly lifeAttr: THREE.BufferAttribute;
  private readonly maxLifeAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly kindAttr: THREE.BufferAttribute;
  private readonly seedAttr: THREE.BufferAttribute;

  private cursor = 0;
  private enabled = true;
  private ambientDustAccum = 0;
  private ambientSandAccum = 0;
  private ambientRainAccum = 0;
  private sweatDripAccum = 0;

  private readonly splashes: SplashSlot[] = [];
  private readonly splashGeo: THREE.RingGeometry;
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _tmpVel = new THREE.Vector3();

  constructor(scene: THREE.Scene, pixelRatio = 1) {
    this.scene = scene;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.lives[i] = 0;
      this.maxLives[i] = 1;
      this.seeds[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.velAttr = new THREE.BufferAttribute(this.velocities, 3);
    this.velAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr = new THREE.BufferAttribute(this.lives, 1);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.maxLifeAttr = new THREE.BufferAttribute(this.maxLives, 1);
    this.maxLifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.kindAttr = new THREE.BufferAttribute(this.kinds, 1);
    this.kindAttr.setUsage(THREE.DynamicDrawUsage);
    this.seedAttr = new THREE.BufferAttribute(this.seeds, 1);

    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aVelocity', this.velAttr);
    this.geometry.setAttribute('aLife', this.lifeAttr);
    this.geometry.setAttribute('aMaxLife', this.maxLifeAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aKind', this.kindAttr);
    this.geometry.setAttribute('aSeed', this.seedAttr);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aVelocity;
        attribute float aLife;
        attribute float aMaxLife;
        attribute float aSize;
        attribute float aKind;
        attribute float aSeed;

        uniform float uTime;
        uniform float uPixelRatio;

        varying float vKind;
        varying float vAlpha;
        varying float vSeed;
        varying vec2 vVelScreen;

        void main() {
          vKind = aKind;
          vSeed = aSeed;

          if (aLife <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            vVelScreen = vec2(0.0, 1.0);
            return;
          }

          float lifeRatio = clamp(aLife / max(0.001, aMaxLife), 0.0, 1.0);
          // Fade in quickly and fade out smoothly
          float fadeIn = smoothstep(1.0, 0.86, lifeRatio);
          float fadeOut = smoothstep(0.0, 0.35, lifeRatio);
          vAlpha = fadeIn * fadeOut;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Estimate screen-space streak angle for rain & sweat
          vec4 mvNext = modelViewMatrix * vec4(position + aVelocity * 0.04, 1.0);
          vec4 clipNext = projectionMatrix * mvNext;
          vec2 p0 = gl_Position.xy / max(0.001, gl_Position.w);
          vec2 p1 = clipNext.xy / max(0.001, clipNext.w);
          vec2 delta = p1 - p0;
          float dLen = length(delta);
          vVelScreen = dLen > 0.0001 ? delta / dLen : vec2(0.0, -1.0);

          float dist = max(1.0, -mvPosition.z);
          float rainStretch = aKind > 1.5 && aKind < 2.5 ? 2.4 : 1.0;
          gl_PointSize = clamp((aSize * rainStretch * uPixelRatio * 260.0) / dist, 1.5, 42.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vKind;
        varying float vAlpha;
        varying float vSeed;
        varying vec2 vVelScreen;

        void main() {
          if (vAlpha <= 0.01) discard;
          vec2 uv = gl_PointCoord - vec2(0.5);

          // Rotate UV along velocity for rain (kind ~ 2) and fast sweat (kind ~ 3)
          vec2 dir = normalize(vec2(vVelScreen.x, -vVelScreen.y));
          vec2 perp = vec2(-dir.y, dir.x);
          float along = dot(uv, dir);
          float across = dot(uv, perp);

          vec3 col = vec3(1.0);
          float shape = 0.0;

          if (vKind < 0.5) {
            // Kind 0: Soft glowing stadium dust mote
            float d = length(uv);
            shape = smoothstep(0.5, 0.06, d) * 0.62;
            col = mix(vec3(0.84, 0.78, 0.68), vec3(0.95, 0.88, 0.72), vSeed);
          } else if (vKind < 1.5) {
            // Kind 1: Gritty beach/squall sand grain
            float d = length(vec2(across * 1.35, along * 0.95));
            shape = smoothstep(0.45, 0.08, d) * 0.85;
            col = mix(vec3(0.88, 0.72, 0.45), vec3(0.96, 0.84, 0.58), vSeed);
          } else if (vKind < 2.5) {
            // Kind 2: Elongated silver-cyan rain streak
            float streak = smoothstep(0.075, 0.01, abs(across)) * smoothstep(0.5, 0.08, abs(along));
            shape = streak * 0.78;
            col = mix(vec3(0.58, 0.86, 1.0), vec3(0.92, 0.98, 1.0), 0.5 + 0.5 * vSeed);
          } else {
            // Kind 3: Specular gleaming athlete sweat droplet
            float drop = length(vec2(across * 1.45, along * 0.88));
            float core = smoothstep(0.42, 0.06, drop);
            float glint = smoothstep(0.18, 0.02, length(uv - vec2(-0.08, -0.09)));
            shape = core * 0.88;
            col = mix(vec3(0.75, 0.94, 1.0), vec3(1.0, 1.0, 1.0), glint);
          }

          float alpha = shape * vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.scene.add(this.points);

    // Pre-allocated ground rain splash ring pool
    this.splashGeo = new THREE.RingGeometry(0.05, 0.09, 16);
    for (let i = 0; i < MAX_RAIN_SPLASHES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xbbe6ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.splashGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.019;
      mesh.visible = false;
      this.scene.add(mesh);
      this.splashes.push({ mesh, active: false, life: 0, maxLife: 0.28 });
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.points.visible = enabled;
    if (!enabled) {
      for (const s of this.splashes) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }

  public setPixelRatio(pr: number) {
    this.material.uniforms.uPixelRatio.value = pr;
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: 0 | 1 | 2 | 3
  ) {
    if (!this.enabled) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;

    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;

    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;

    this.lives[i] = life;
    this.maxLives[i] = life;
    this.sizes[i] = size;
    this.kinds[i] = kind;
    this.seeds[i] = Math.random();
  }

  public emitDustBurst(pos: THREE.Vector3, count: number, spread = 1.15) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.55 + Math.random() * 1.45) * spread;
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.45,
        Math.max(0.06, pos.y + Math.random() * 0.22),
        pos.z + (Math.random() - 0.5) * 0.45,
        Math.cos(ang) * spd,
        0.55 + Math.random() * 1.35,
        Math.sin(ang) * spd,
        0.75 + Math.random() * 0.85,
        0.16 + Math.random() * 0.22,
        0
      );
    }
  }

  public emitSandSpray(pos: THREE.Vector3, dirX: number, dirZ: number, count: number) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const jitter = (Math.random() - 0.5) * 2.4;
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.35,
        Math.max(0.04, pos.y + Math.random() * 0.14),
        pos.z + (Math.random() - 0.5) * 0.35,
        dirX * 1.4 + jitter,
        1.1 + Math.random() * 2.1,
        dirZ * 1.4 + (Math.random() - 0.5) * 2.4,
        0.52 + Math.random() * 0.45,
        0.11 + Math.random() * 0.11,
        1
      );
    }
  }

  public emitSweatSpray(pos: THREE.Vector3, vel: THREE.Vector3, count: number, sweatLevel: number) {
    if (!this.enabled || sweatLevel < 0.08) return;
    const n = Math.max(1, Math.round(count * (0.35 + sweatLevel * 0.85)));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const radial = 0.8 + Math.random() * 1.85;
      this.spawn(
        pos.x + (Math.random() - 0.5) * 0.32,
        pos.y + (Math.random() - 0.3) * 0.4,
        pos.z + (Math.random() - 0.5) * 0.32,
        vel.x * 0.45 + Math.cos(ang) * radial,
        0.8 + Math.random() * 1.9,
        vel.z * 0.45 + Math.sin(ang) * radial,
        0.48 + Math.random() * 0.36,
        0.09 + Math.random() * 0.08,
        3
      );
    }
  }

  private spawnRainSplash(x: number, z: number) {
    for (let i = 0; i < this.splashes.length; i++) {
      const s = this.splashes[i];
      if (!s.active) {
        s.active = true;
        s.life = 0;
        s.maxLife = 0.24 + Math.random() * 0.14;
        s.mesh.position.set(x, 0.019, z);
        s.mesh.scale.setScalar(0.6);
        s.mesh.visible = true;
        return;
      }
    }
  }

  public update(
    dt: number,
    timeSec: number,
    evolution: MatchEvolutionState,
    units: Unit[],
    courtSurface: CourtSurface
  ) {
    this.material.uniforms.uTime.value = timeSec;
    if (!this.enabled || dt <= 0) return;

    // 1. Ambient Stadium Dust Motes (escalates with match evolution)
    const dustRate = 6 + evolution.dustLevel * 48;
    this.ambientDustAccum += dustRate * dt;
    while (this.ambientDustAccum >= 1) {
      this.ambientDustAccum -= 1;
      this.spawn(
        (Math.random() - 0.5) * 18,
        0.2 + Math.random() * 5.8,
        (Math.random() - 0.5) * 26,
        evolution.windX * 0.35 + (Math.random() - 0.5) * 0.45,
        0.12 + Math.random() * 0.28,
        evolution.windZ * 0.35 + (Math.random() - 0.5) * 0.45,
        2.2 + Math.random() * 1.8,
        0.13 + Math.random() * 0.16,
        0
      );
    }

    // 2. Coastal Wind-Driven Sand Squall
    const surfaceSandBoost = courtSurface === 'SAND' ? 1.45 : 0.7;
    const sandRate = evolution.sandLevel * 75 * surfaceSandBoost;
    this.ambientSandAccum += sandRate * dt;
    while (this.ambientSandAccum >= 1) {
      this.ambientSandAccum -= 1;
      this.spawn(
        -9 + Math.random() * 18,
        0.08 + Math.random() * 1.9,
        -12 + Math.random() * 24,
        evolution.windX * 1.8 + (Math.random() - 0.5) * 1.1,
        0.25 + Math.random() * 0.65,
        evolution.windZ * 1.8 + (Math.random() - 0.5) * 1.1,
        0.95 + Math.random() * 0.75,
        0.09 + Math.random() * 0.08,
        1
      );
    }

    // 3. Stadium Rain Monsoon Streaks + Floor Splashes
    const rainRate = evolution.rainLevel * 290;
    this.ambientRainAccum += rainRate * dt;
    while (this.ambientRainAccum >= 1) {
      this.ambientRainAccum -= 1;
      this.spawn(
        (Math.random() - 0.5) * 22,
        9.5 + Math.random() * 5.0,
        (Math.random() - 0.5) * 28,
        evolution.windX * 0.9 + (Math.random() - 0.5) * 0.4,
        -(15.5 + Math.random() * 4.5),
        evolution.windZ * 0.9 + (Math.random() - 0.5) * 0.4,
        0.65 + Math.random() * 0.3,
        0.18 + Math.random() * 0.09,
        2
      );
    }

    if (evolution.rainLevel > 0.18 && Math.random() < evolution.rainLevel * 0.65) {
      this.spawnRainSplash((Math.random() - 0.5) * 11.5, (Math.random() - 0.5) * 19.5);
    }

    // 4. Ongoing Athlete Exertion Sweat Drips when units are heated & moving
    this.sweatDripAccum += dt;
    if (this.sweatDripAccum >= 0.12) {
      this.sweatDripAccum = 0;
      for (const u of units) {
        if (u.sweatLevel > 0.25 && (u.actualSpeed > 2.4 || u.isJumping)) {
          if (Math.random() < u.sweatLevel * 0.6) {
            this._tmpPos.set(u.mesh.position.x, u.mesh.position.y + 1.45, u.mesh.position.z);
            this._tmpVel.set(u.velocity.x, 0.4, u.velocity.z);
            this.emitSweatSpray(this._tmpPos, this._tmpVel, 2, u.sweatLevel);
          }
        }
      }
    }

    // 5. Integrate all active GPU particles in-place (zero allocation)
    const gravityDust = -0.18;
    const gravityHeavy = -9.4;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const life = this.lives[i];
      if (life <= 0) continue;

      const nextLife = life - dt;
      this.lives[i] = nextLife;
      if (nextLife <= 0) continue;

      const kind = this.kinds[i];
      const i3 = i * 3;

      if (kind < 0.5) {
        // Dust drifts softly with wind swirl
        this.velocities[i3] += (evolution.windX * 0.25 - this.velocities[i3] * 0.5) * dt;
        this.velocities[i3 + 1] += gravityDust * dt;
        this.velocities[i3 + 2] += (evolution.windZ * 0.25 - this.velocities[i3 + 2] * 0.5) * dt;
      } else if (kind < 1.5 || kind > 2.5) {
        // Sand & Sweat follow ballistic gravity
        this.velocities[i3 + 1] += gravityHeavy * dt;
      }

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // Floor hit handling
      if (this.positions[i3 + 1] <= 0.02) {
        if (kind > 1.5 && kind < 2.5) {
          // Rain hit floor -> trigger splash and recycle
          if (Math.random() < 0.16) {
            this.spawnRainSplash(this.positions[i3], this.positions[i3 + 2]);
          }
          this.lives[i] = 0;
        } else {
          this.positions[i3 + 1] = 0.02;
          this.velocities[i3 + 1] = 0;
          this.velocities[i3] *= 0.65;
          this.velocities[i3 + 2] *= 0.65;
        }
      }
    }

    this.posAttr.needsUpdate = true;
    this.velAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
    this.maxLifeAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.kindAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;

    // 6. Update rain splash ripples
    for (const s of this.splashes) {
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        s.mesh.visible = false;
      } else {
        const p = s.life / s.maxLife;
        s.mesh.scale.setScalar(0.6 + p * 2.8);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45 * evolution.rainLevel;
      }
    }
  }

  public dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.splashGeo.dispose();
    for (const s of this.splashes) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
  }
}
