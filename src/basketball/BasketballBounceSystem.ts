import * as THREE from 'three';
import { CourtSurface } from '../types';
import {
  BASKET_AIR_DRAG,
  BASKET_BALL_RADIUS,
  BASKET_GRAVITY,
  BASKET_MAGNUS_COEFF,
  BallPhysicsEventKind,
  BallPhysicsEventNode,
  BouncePhysicsTelemetry,
} from './basketballTypes';

export type BallFlightStyle = 'IDLE' | 'DRIBBLE' | 'PASS' | 'SHOT' | 'DUNK' | 'LOOSE';

export interface ArenaCollisionResult {
  hitBackboard: boolean;
  hitRim: boolean;
  hitStructure: boolean;
  hitBarrier: boolean;
  maxImpactSpeed: number;
  lastNormalE: number;
}

interface TransitionalFormSlot {
  group: THREE.Group;
  shellMesh: THREE.Mesh;
  seamMesh: THREE.LineSegments;
  shellMat: THREE.MeshBasicMaterial;
  seamMat: THREE.LineBasicMaterial;
}

interface BounceRingSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

interface HistorySample {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  vel: THREE.Vector3;
  style: BallFlightStyle;
}

const SURFACE_PROFILES: Record<
  CourtSurface,
  { restitution: number; grip: number; spinTransfer: number; rollDrag: number; scatter: number; color: number }
> = {
  HARDWOOD: { restitution: 0.79, grip: 0.24, spinTransfer: 0.25, rollDrag: 0.966, scatter: 0.02, color: 0xffb347 },
  OLYMPIC_BLUE: { restitution: 0.76, grip: 0.28, spinTransfer: 0.3, rollDrag: 0.96, scatter: 0.03, color: 0x00f0ff },
  SAND: { restitution: 0.44, grip: 0.46, spinTransfer: 0.12, rollDrag: 0.89, scatter: 0.28, color: 0xf59e0b },
  CYBER: { restitution: 0.83, grip: 0.18, spinTransfer: 0.34, rollDrag: 0.974, scatter: 0.01, color: 0xff3d7f },
};

/**
 * BasketballBounceSystem
 * 1. Transitional Ball Form Frames & Velocity Squash/Stretch
 * 2. Exact 3D Aerodynamic Trajectory Integration (Unified Gravity + 3D Quadratic Drag + 3D Magnus ω × v)
 * 3. Velocity-Calibrated Oblique `e` Restitution & Spin Transfer (`resolveImpactWithE`)
 * 4. Full Arena Element Collider Solver (Floor, Tempered Glass & Pad, 3D Torus Rim + Hinge, Shot Clock, Mast/Boom/Base, LED Barriers)
 */
export class BasketballBounceSystem {
  public readonly root = new THREE.Group();
  private readonly formSlots: TransitionalFormSlot[] = [];
  private readonly bounceRings: BounceRingSlot[] = [];
  private readonly history: HistorySample[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private sampleAccum = 0;
  private activeFormCount = 0;
  private lastRestitution = 0.79;
  private lastNormalE = 0.79;
  private lastTangentialE = 0.74;
  private lastEntryAngleDeg = 46;
  private flightApexM = 0;
  private apexLoggedThisFlight = false;
  private lastSpinKickKmh = 0;
  private bounceCount = 0;
  private releaseBlendTimer = 0;
  private squashTimer = 0;
  private squashAmp = 0;

  private eventSeq = 1;
  private eventChain: BallPhysicsEventNode[] = [];

  // Zero-GC scratch vectors/quaternions
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _dir = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _targetScale = new THREE.Vector3(1, 1, 1);
  private readonly _tangent = new THREE.Vector3();
  private readonly _spinSurfaceVel = new THREE.Vector3();
  private readonly _magnus = new THREE.Vector3();
  private readonly _arenaResult: ArenaCollisionResult = {
    hitBackboard: false,
    hitRim: false,
    hitStructure: false,
    hitBarrier: false,
    maxImpactSpeed: 0,
    lastNormalE: 0.79,
  };

  constructor(private scene: THREE.Scene) {
    this.root.name = 'BasketballBounceAndFormSystem';

    const ghostSphereGeo = new THREE.SphereGeometry(BASKET_BALL_RADIUS, 16, 14);
    const ringGeo = new THREE.RingGeometry(0.14, 0.25, 24);
    this.disposables.push(ghostSphereGeo, ringGeo);

    // 9 Pooled Transitional Ball Form Frames
    for (let i = 0; i < 9; i++) {
      const grp = new THREE.Group();
      const shellMat = new THREE.MeshBasicMaterial({
        color: 0xff9f43,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const seamMat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
      });
      const shellMesh = new THREE.Mesh(ghostSphereGeo, shellMat);
      const seamMesh = new THREE.LineSegments(ghostSphereGeo, seamMat);
      seamMesh.visible = false;
      grp.add(shellMesh);
      grp.visible = false;
      grp.renderOrder = 5;
      this.root.add(grp);
      this.disposables.push(shellMat, seamMat);
      this.formSlots.push({ group: grp, shellMesh, seamMesh, shellMat, seamMat });
    }

    for (let i = 0; i < 24; i++) {
      this.history.push({
        pos: new THREE.Vector3(),
        rot: new THREE.Euler(),
        vel: new THREE.Vector3(),
        style: 'IDLE',
      });
    }

    // 8 Floor Bounce Shockwave Rings
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.025;
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.root.add(mesh);
      this.disposables.push(mat);
      this.bounceRings.push({ mesh, mat, age: 0, life: 0.48, active: false });
    }

    this.scene.add(this.root);
  }

  public startNewChain(
    kind: BallPhysicsEventKind,
    label: string,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    spin: THREE.Vector3,
    elapsedSec: number
  ) {
    this.eventChain.length = 0;
    this.flightApexM = pos.y;
    this.apexLoggedThisFlight = false;
    this.recordPhysicsEvent(kind, label, pos, vel, spin, this.lastNormalE, elapsedSec);
  }

  public recordPhysicsEvent(
    kind: BallPhysicsEventKind,
    label: string,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    spin: THREE.Vector3,
    restitutionE: number,
    elapsedSec: number
  ) {
    const node: BallPhysicsEventNode = {
      id: this.eventSeq++,
      kind,
      label,
      speedKmh: Math.round(vel.length() * 3.6),
      restitutionE: Number(restitutionE.toFixed(2)),
      spinRpm: Math.round((spin.length() * 60) / (Math.PI * 2)),
      timestampSec: Number(elapsedSec.toFixed(2)),
      point: [Number(pos.x.toFixed(2)), Number(pos.y.toFixed(2)), Number(pos.z.toFixed(2))],
    };
    this.eventChain.push(node);
    if (this.eventChain.length > 7) {
      this.eventChain.shift();
    }
  }

  public getContinuousChainSummary(): string {
    if (this.eventChain.length === 0) return 'READY';
    return this.eventChain
      .slice(-4)
      .map((n) => n.label)
      .join(' → ');
  }

  public notifyRelease(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    style: BallFlightStyle,
    spin?: THREE.Vector3,
    elapsedSec = 0
  ) {
    this.releaseBlendTimer = 0.14;
    this.flightApexM = origin.y;
    this.apexLoggedThisFlight = false;
    for (let i = 0; i < this.history.length; i++) {
      this.history[i].pos.copy(origin);
      this.history[i].vel.copy(vel);
      this.history[i].style = style;
    }
    if (spin && (style === 'SHOT' || style === 'PASS' || style === 'DUNK')) {
      const lbl = style === 'DUNK' ? 'DUNK' : style === 'PASS' ? 'PASS' : 'LAUNCH';
      this.recordPhysicsEvent('RELEASE_LAUNCH', lbl, origin, vel, spin, this.lastNormalE, elapsedSec);
    }
  }

  public clearFormFrames() {
    this.activeFormCount = 0;
    for (const s of this.formSlots) {
      s.group.visible = false;
    }
  }

  /**
   * Integrates exact 3D aerodynamic trajectory:
   * Unified Gravity + 3D Quadratic Air Drag + True 3D Magnus Force (ω × v) + Spin decay.
   */
  public stepAirborneBallPhysics(
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    ballSpin: THREE.Vector3,
    ballRot: THREE.Euler,
    subDt: number,
    elapsedSec: number
  ) {
    const prevVy = ballVel.y;
    const spd = ballVel.length();

    // 1. 3D Quadratic aerodynamic air drag (-k |v| v)
    if (spd > 0.05) {
      const dragFactor = BASKET_AIR_DRAG * spd * subDt;
      ballVel.x -= ballVel.x * dragFactor;
      ballVel.y -= ballVel.y * dragFactor;
      ballVel.z -= ballVel.z * dragFactor;
    }

    // 2. True 3D Magnus cross-product lift & lateral curve: C_M * (ω × v)
    this._magnus.crossVectors(ballSpin, ballVel);
    ballVel.x += this._magnus.x * BASKET_MAGNUS_COEFF * subDt;
    ballVel.y += (BASKET_GRAVITY + this._magnus.y * BASKET_MAGNUS_COEFF) * subDt;
    ballVel.z += this._magnus.z * BASKET_MAGNUS_COEFF * subDt;

    // 3. Linear displacement & angular spin integration
    ballPos.addScaledVector(ballVel, subDt);
    ballRot.x += ballSpin.x * subDt;
    ballRot.y += ballSpin.y * subDt * 0.55;
    ballRot.z += ballSpin.z * subDt;
    ballSpin.multiplyScalar(Math.max(0, 1 - 0.14 * subDt));

    if (ballPos.y > this.flightApexM) {
      this.flightApexM = ballPos.y;
    }

    if (!this.apexLoggedThisFlight && prevVy > 0.25 && ballVel.y <= 0 && ballPos.y > 2.35) {
      this.apexLoggedThisFlight = true;
      this.recordPhysicsEvent(
        'APEX_PEAK',
        `APEX ${this.flightApexM.toFixed(1)}m`,
        ballPos,
        ballVel,
        ballSpin,
        this.lastNormalE,
        elapsedSec
      );
    }

    const horizSpd = Math.hypot(ballVel.x, ballVel.z);
    if (ballVel.y < -0.5 && horizSpd > 0.1) {
      this.lastEntryAngleDeg = Math.round(
        THREE.MathUtils.radToDeg(Math.atan2(-ballVel.y, horizSpd))
      );
    }
  }

  /**
   * Calibrated Oblique `e` (Coefficient of Restitution + Tangential Grip Friction) Collision Solver.
   * Updates rebound velocity, tangential slip, spin impulse Δω, and telemetry.
   */
  public resolveImpactWithE(
    ballVel: THREE.Vector3,
    ballSpin: THREE.Vector3,
    nx: number,
    ny: number,
    nz: number,
    baseNormalE: number,
    tangentialGrip: number,
    wetness = 0
  ): { impactSpeed: number; normalE: number; tangentialE: number } {
    const vn = ballVel.x * nx + ballVel.y * ny + ballVel.z * nz;
    if (vn >= 0) {
      return { impactSpeed: 0, normalE: this.lastNormalE, tangentialE: this.lastTangentialE };
    }

    const impactSpeed = Math.abs(vn);
    const wet = THREE.MathUtils.clamp(wetness, 0, 1);

    // High-impact compression mildly reduces bladder restitution
    const speedLoss = 0.042 * Math.log(1 + impactSpeed * 0.35);
    const effNormalE = THREE.MathUtils.clamp(baseNormalE - speedLoss - wet * 0.07, 0.3, 0.89);
    const effTangentialE = THREE.MathUtils.clamp(1 - tangentialGrip * (1 - wet * 0.45), 0.48, 0.96);

    // Normal restitution: v_n' = -e_n * v_n
    const normalDelta = (1 + effNormalE) * vn;
    ballVel.x -= normalDelta * nx;
    ballVel.y -= normalDelta * ny;
    ballVel.z -= normalDelta * nz;

    // Tangential relative contact-patch velocity: v_patch = v_t + ω × (-R * n)
    const newVn = ballVel.x * nx + ballVel.y * ny + ballVel.z * nz;
    this._tangent.set(
      ballVel.x - newVn * nx,
      ballVel.y - newVn * ny,
      ballVel.z - newVn * nz
    );
    this._spinSurfaceVel.set(
      (ballSpin.y * -nz - ballSpin.z * -ny) * BASKET_BALL_RADIUS,
      (ballSpin.z * -nx - ballSpin.x * -nz) * BASKET_BALL_RADIUS,
      (ballSpin.x * -ny - ballSpin.y * -nx) * BASKET_BALL_RADIUS
    );

    const slipFactor = (1 - effTangentialE) * 0.64;
    // Friction opposes contact-patch slip: Δv = -v_patch * slipFactor
    const dvx = -(this._tangent.x + this._spinSurfaceVel.x) * slipFactor;
    const dvy = -(this._tangent.y + this._spinSurfaceVel.y) * slipFactor;
    const dvz = -(this._tangent.z + this._spinSurfaceVel.z) * slipFactor;

    ballVel.x += dvx;
    ballVel.y += dvy;
    ballVel.z += dvz;

    // Torque impulse Δω = (r × Δv) * (m R / I) = ((dv × n) * 1.45 / R)
    const invR = 1.45 / BASKET_BALL_RADIUS;
    ballSpin.x += (dvy * nz - dvz * ny) * invR;
    ballSpin.y += (dvz * nx - dvx * nz) * invR;
    ballSpin.z += (dvx * ny - dvy * nx) * invR;

    this.lastRestitution = Number(effNormalE.toFixed(2));
    this.lastNormalE = this.lastRestitution;
    this.lastTangentialE = Number(effTangentialE.toFixed(2));
    this.lastSpinKickKmh = Math.round(Math.hypot(dvx, dvy, dvz) * 3.6);

    return {
      impactSpeed,
      normalE: this.lastNormalE,
      tangentialE: this.lastTangentialE,
    };
  }

  /**
   * Zero-GC Sphere vs AABB physics collision helper with differentiated material e_n and grip.
   */
  private collideSphereAABB(
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    ballSpin: THREE.Vector3,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    baseNormalE: number,
    grip: number,
    wetness: number
  ): number {
    const cx = THREE.MathUtils.clamp(ballPos.x, minX, maxX);
    const cy = THREE.MathUtils.clamp(ballPos.y, minY, maxY);
    const cz = THREE.MathUtils.clamp(ballPos.z, minZ, maxZ);

    const dx = ballPos.x - cx;
    const dy = ballPos.y - cy;
    const dz = ballPos.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq >= BASKET_BALL_RADIUS * BASKET_BALL_RADIUS) return 0;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let pen = 0;

    if (distSq > 1e-7) {
      const dist = Math.sqrt(distSq);
      nx = dx / dist;
      ny = dy / dist;
      nz = dz / dist;
      pen = BASKET_BALL_RADIUS - dist;
    } else {
      // Sphere center inside box — push out along shallowest axis
      const dLeft = Math.abs(ballPos.x - minX);
      const dRight = Math.abs(maxX - ballPos.x);
      const dBot = Math.abs(ballPos.y - minY);
      const dTop = Math.abs(maxY - ballPos.y);
      const dBack = Math.abs(ballPos.z - minZ);
      const dFront = Math.abs(maxZ - ballPos.z);
      const minD = Math.min(dLeft, dRight, dBot, dTop, dBack, dFront);
      if (minD === dFront) nz = 1;
      else if (minD === dBack) nz = -1;
      else if (minD === dTop) ny = 1;
      else if (minD === dBot) ny = -1;
      else if (minD === dRight) nx = 1;
      else nx = -1;
      pen = BASKET_BALL_RADIUS + minD;
    }

    ballPos.x += nx * (pen + 0.002);
    ballPos.y += ny * (pen + 0.002);
    ballPos.z += nz * (pen + 0.002);

    const res = this.resolveImpactWithE(ballVel, ballSpin, nx, ny, nz, baseNormalE, grip, wetness);
    return res.impactSpeed;
  }

  /**
   * Full Multi-Element Arena Collider Pass:
   * - Tempered-Glass Backboard (front/back/sides + bottom safety pad bumper)
   * - 3D Breakaway Rim Torus + Rim Hinge/Neck Plate
   * - Shot Clock Housing, Overhead Boom, Stanchion Mast & Hydraulic Base Box
   * - Court Apron Perimeter LED Sponsor Barriers
   */
  public resolveArenaAndHoopCollisions(
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    ballSpin: THREE.Vector3,
    hoopPos: THREE.Vector3,
    backboardZ: number,
    rimRadius: number,
    rimTubeRadius: number,
    wetness: number,
    elapsedSec: number
  ): ArenaCollisionResult {
    const out = this._arenaResult;
    out.hitBackboard = false;
    out.hitRim = false;
    out.hitStructure = false;
    out.hitBarrier = false;
    out.maxImpactSpeed = 0;
    out.lastNormalE = this.lastNormalE;

    // 1. Tempered Glass Backboard Panel (x: ±0.91, y: 2.91..3.99, z: backboardZ ± 0.023)
    if (
      ballPos.z < backboardZ + 0.35 &&
      ballPos.z > backboardZ - 0.35 &&
      Math.abs(ballPos.x) < 1.12 &&
      ballPos.y > 2.7 &&
      ballPos.y < 4.2
    ) {
      const glassImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.91,
        0.91,
        2.93,
        3.99,
        backboardZ - 0.024,
        backboardZ + 0.024,
        0.78,
        0.24,
        wetness
      );
      if (glassImpact > 0.12) {
        out.hitBackboard = true;
        out.maxImpactSpeed = Math.max(out.maxImpactSpeed, glassImpact);
        out.lastNormalE = this.lastNormalE;
        this.triggerSquash(THREE.MathUtils.clamp(glassImpact / 9.0, 0.3, 0.92));
        this.recordPhysicsEvent(
          'GLASS_BANK',
          `GLASS e=${this.lastNormalE.toFixed(2)}`,
          ballPos,
          ballVel,
          ballSpin,
          this.lastNormalE,
          elapsedSec
        );
      }

      // Bottom safety U-bumper pad (soft high-grip rubber)
      const padImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.94,
        0.94,
        2.85,
        2.93,
        backboardZ - 0.045,
        backboardZ + 0.045,
        0.52,
        0.44,
        wetness
      );
      if (padImpact > 0.12) {
        out.hitBackboard = true;
        out.maxImpactSpeed = Math.max(out.maxImpactSpeed, padImpact);
        out.lastNormalE = this.lastNormalE;
      }
    }

    // 2. 3D Breakaway Rim Torus + Hinge/Neck
    const rimRadiusSum = rimTubeRadius + BASKET_BALL_RADIUS;
    const dx = ballPos.x - hoopPos.x;
    const dy = ballPos.y - hoopPos.y;
    const dz = ballPos.z - hoopPos.z;
    const horizErr = Math.hypot(dx, dz);

    if (Math.abs(dy) < 0.24 && horizErr < rimRadius + rimRadiusSum + 0.06) {
      const invH = horizErr > 0.0001 ? 1 / horizErr : 1;
      const ringX = hoopPos.x + (horizErr > 0.0001 ? dx * invH * rimRadius : rimRadius);
      const ringZ = hoopPos.z + (horizErr > 0.0001 ? dz * invH * rimRadius : 0);
      const rx = ballPos.x - ringX;
      const ry = ballPos.y - hoopPos.y;
      const rz = ballPos.z - ringZ;
      const dTube = Math.hypot(rx, ry, rz);

      if (dTube < rimRadiusSum && dTube > 0.0001) {
        const nx = rx / dTube;
        const ny = ry / dTube;
        const nz = rz / dTube;
        const push = rimRadiusSum - dTube + 0.003;
        ballPos.x += nx * push;
        ballPos.y += ny * push;
        ballPos.z += nz * push;

        const rimRes = this.resolveImpactWithE(ballVel, ballSpin, nx, ny, nz, 0.65, 0.34, wetness);
        if (rimRes.impactSpeed > 0.12) {
          out.hitRim = true;
          out.maxImpactSpeed = Math.max(out.maxImpactSpeed, rimRes.impactSpeed);
          out.lastNormalE = rimRes.normalE;
          this.triggerSquash(THREE.MathUtils.clamp(rimRes.impactSpeed / 8.5, 0.32, 0.88));
          this.recordPhysicsEvent(
            'RIM_CAROM',
            `RIM e=${rimRes.normalE.toFixed(2)}`,
            ballPos,
            ballVel,
            ballSpin,
            rimRes.normalE,
            elapsedSec
          );
        }
      }
    }

    // Rim steel neck & spring hinge plate connecting backboard to back of rim
    const neckImpact = this.collideSphereAABB(
      ballPos,
      ballVel,
      ballSpin,
      -0.08,
      0.08,
      hoopPos.y - 0.06,
      hoopPos.y + 0.035,
      backboardZ + 0.02,
      hoopPos.z - rimRadius + 0.02,
      0.58,
      0.34,
      wetness
    );
    if (neckImpact > 0.12) {
      out.hitRim = true;
      out.maxImpactSpeed = Math.max(out.maxImpactSpeed, neckImpact);
      out.lastNormalE = this.lastNormalE;
    }

    // 3. Overhead Shot Clock, Cantilever Boom, Mast Pad & Hydraulic Base Box
    if (ballPos.z < -4.2 && Math.abs(ballPos.x) < 1.1) {
      const clockImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.59,
        0.59,
        4.14,
        4.7,
        backboardZ - 0.16,
        backboardZ + 0.06,
        0.54,
        0.34,
        wetness
      );
      const boomImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.14,
        0.14,
        3.32,
        3.58,
        -5.94,
        backboardZ,
        0.58,
        0.32,
        wetness
      );
      const mastImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.22,
        0.22,
        0,
        3.7,
        -5.99,
        -5.53,
        0.48,
        0.42,
        wetness
      );
      const baseImpact = this.collideSphereAABB(
        ballPos,
        ballVel,
        ballSpin,
        -0.75,
        0.75,
        0,
        0.9,
        -7.31,
        -5.45,
        0.46,
        0.44,
        wetness
      );
      const structMax = Math.max(clockImpact, boomImpact, mastImpact, baseImpact);
      if (structMax > 0.15) {
        out.hitStructure = true;
        out.maxImpactSpeed = Math.max(out.maxImpactSpeed, structMax);
        out.lastNormalE = this.lastNormalE;
      }
    }

    // 4. Court Apron LED Sponsor Perimeter Barriers (±10.08 X, ±8.08 Z, height 0..0.78m)
    const perimInnerX = 10.08 - BASKET_BALL_RADIUS;
    const perimInnerZ = 8.08 - BASKET_BALL_RADIUS;
    if (ballPos.y <= 0.84) {
      if (ballPos.x < -perimInnerX) {
        ballPos.x = -perimInnerX;
        const r = this.resolveImpactWithE(ballVel, ballSpin, 1, 0, 0, 0.66, 0.28, wetness);
        if (r.impactSpeed > 0.35) {
          out.hitBarrier = true;
          out.maxImpactSpeed = Math.max(out.maxImpactSpeed, r.impactSpeed);
        }
      } else if (ballPos.x > perimInnerX) {
        ballPos.x = perimInnerX;
        const r = this.resolveImpactWithE(ballVel, ballSpin, -1, 0, 0, 0.66, 0.28, wetness);
        if (r.impactSpeed > 0.35) {
          out.hitBarrier = true;
          out.maxImpactSpeed = Math.max(out.maxImpactSpeed, r.impactSpeed);
        }
      }
      if (ballPos.z < -perimInnerZ) {
        ballPos.z = -perimInnerZ;
        const r = this.resolveImpactWithE(ballVel, ballSpin, 0, 0, 1, 0.66, 0.28, wetness);
        if (r.impactSpeed > 0.35) {
          out.hitBarrier = true;
          out.maxImpactSpeed = Math.max(out.maxImpactSpeed, r.impactSpeed);
        }
      } else if (ballPos.z > perimInnerZ) {
        ballPos.z = perimInnerZ;
        const r = this.resolveImpactWithE(ballVel, ballSpin, 0, 0, -1, 0.66, 0.28, wetness);
        if (r.impactSpeed > 0.35) {
          out.hitBarrier = true;
          out.maxImpactSpeed = Math.max(out.maxImpactSpeed, r.impactSpeed);
        }
      }
    }

    return out;
  }

  /**
   * Updates transitional ball form frames + directional velocity squash/stretch on live ballMesh.
   */
  public updateFormFrames(
    dt: number,
    ballGroup: THREE.Group,
    ballMesh: THREE.Mesh,
    ballVel: THREE.Vector3,
    style: BallFlightStyle
  ) {
    ballMesh.quaternion.identity();
    if (this.squashTimer > 0) {
      this.squashTimer = Math.max(0, this.squashTimer - dt);
      const sq = this.squashAmp * (this.squashTimer / 0.11);
      this._targetScale.set(1 + sq * 0.22, Math.max(0.76, 1 - sq * 0.25), 1 + sq * 0.22);
      ballMesh.scale.lerp(this._targetScale, Math.min(1, dt * 32));
    } else if (style === 'PASS' || style === 'SHOT' || style === 'DUNK') {
      const spd = ballVel.length();
      const pulse = THREE.MathUtils.clamp((spd - 6.0) * 0.008, 0, 0.07);
      this._targetScale.set(1 + pulse, 1 + pulse, 1 + pulse);
      ballMesh.scale.lerp(this._targetScale, Math.min(1, dt * 16));
    } else {
      this._targetScale.set(1, 1, 1);
      ballMesh.scale.lerp(this._targetScale, Math.min(1, dt * 18));
    }

    if (this.releaseBlendTimer > 0) {
      this.releaseBlendTimer = Math.max(0, this.releaseBlendTimer - dt);
    }

    const showForms =
      style === 'PASS' ||
      style === 'SHOT' ||
      style === 'DUNK' ||
      (style === 'LOOSE' && ballVel.length() > 3.6);

    this.sampleAccum += dt;
    if (this.sampleAccum >= 0.016) {
      this.sampleAccum = 0;
      for (let i = this.history.length - 1; i > 0; i--) {
        this.history[i].pos.copy(this.history[i - 1].pos);
        this.history[i].rot.copy(this.history[i - 1].rot);
        this.history[i].vel.copy(this.history[i - 1].vel);
        this.history[i].style = this.history[i - 1].style;
      }
      this.history[0].pos.copy(ballGroup.position);
      this.history[0].rot.copy(ballGroup.rotation);
      this.history[0].vel.copy(ballVel);
      this.history[0].style = style;
    }

    if (!showForms) {
      if (this.activeFormCount > 0) {
        this.clearFormFrames();
      }
    } else {
      const tintHex =
        style === 'PASS'
          ? 0x00f0ff
          : style === 'DUNK'
          ? 0xff3d7f
          : style === 'SHOT'
          ? 0xffb347
          : 0xf97316;
      const seamHex = style === 'PASS' ? 0xffffff : 0x00f0ff;

      let shown = 0;
      for (let i = 0; i < this.formSlots.length; i++) {
        const histIdx = Math.min(this.history.length - 1, (i + 1) * 2);
        const h = this.history[histIdx];
        const distFromBall = h.pos.distanceTo(ballGroup.position);
        const slot = this.formSlots[i];
        if (distFromBall < 0.07) {
          slot.group.visible = false;
          continue;
        }
        shown++;
        const fade = 1 - i / this.formSlots.length;
        slot.group.visible = true;
        slot.group.position.copy(h.pos);
        slot.group.rotation.copy(h.rot);

        const spd = h.vel.length();
        const stretch = THREE.MathUtils.clamp((spd - 3.5) * 0.025, 0, 0.34);
        if (spd > 1.2) {
          this._dir.copy(h.vel).normalize();
          this._q.setFromUnitVectors(this._up, this._dir);
          slot.shellMesh.quaternion.copy(this._q);
        } else {
          slot.shellMesh.quaternion.identity();
        }
        const radiusTaper = 0.94 - i * 0.055;
        slot.shellMesh.scale.set(
          radiusTaper * (1 - stretch * 0.35),
          radiusTaper * (1 + stretch),
          radiusTaper * (1 - stretch * 0.35)
        );
        slot.seamMesh.scale.setScalar(radiusTaper * 1.06);

        slot.shellMat.color.setHex(tintHex);
        slot.shellMat.opacity = 0.28 * fade * fade;
        slot.seamMat.color.setHex(seamHex);
        slot.seamMat.opacity = 0.46 * fade;
      }
      this.activeFormCount = shown;
    }

    for (const r of this.bounceRings) {
      if (!r.active) continue;
      r.age += dt;
      const p = r.age / r.life;
      if (p >= 1) {
        r.active = false;
        r.mesh.visible = false;
      } else {
        r.mesh.scale.setScalar(1 + p * 3.8);
        r.mat.opacity = (1 - p) * 0.72;
      }
    }
  }

  /**
   * Physics-shaped asymmetric dribble bounce envelope.
   */
  public computeDribbleBounce(
    phaseRad: number,
    handlerSpeed: number,
    surface: CourtSurface,
    wetness: number
  ): { y: number; palmCushion: number } {
    const prof = SURFACE_PROFILES[surface];
    const u = (((phaseRad % Math.PI) + Math.PI) % Math.PI) / Math.PI;
    const reboundSkew = Math.pow(Math.sin(Math.pow(u, 0.82) * Math.PI), 0.78);
    const speedCompression = THREE.MathUtils.clamp(handlerSpeed * 0.032, 0, 0.18);
    const apexHeight =
      (0.82 - speedCompression) * THREE.MathUtils.lerp(0.76, 1.04, prof.restitution) * (1 - wetness * 0.08);
    const y = BASKET_BALL_RADIUS + reboundSkew * apexHeight;
    const palmCushion = THREE.MathUtils.clamp((reboundSkew - 0.72) / 0.28, 0, 1);
    return { y, palmCushion };
  }

  /**
   * Spin-coupled surface-aware basketball floor bounce physics with dynamic `e` calculation,
   * authentic topspin/backspin English kick, micro-hops down to 0.26 m/s, and Coulomb rolling spin.
   */
  public resolveFloorBounce(
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    ballSpin: THREE.Vector3,
    ballRot: THREE.Euler,
    surface: CourtSurface,
    wetness: number,
    dt: number,
    elapsedSec = 0
  ): { bounced: boolean; impactSpeed: number; normalE: number } {
    const prof = SURFACE_PROFILES[surface];
    const wet = THREE.MathUtils.clamp(wetness, 0, 1);

    if (ballPos.y > BASKET_BALL_RADIUS) {
      return { bounced: false, impactSpeed: 0, normalE: this.lastNormalE };
    }

    ballPos.y = BASKET_BALL_RADIUS;

    if (ballVel.y < -0.26) {
      const microBoost = Math.abs(ballVel.y) < 1.1 ? 0.05 : 0;
      const res = this.resolveImpactWithE(
        ballVel,
        ballSpin,
        0,
        1,
        0,
        Math.min(0.88, prof.restitution + microBoost),
        prof.grip,
        wet
      );
      this.bounceCount += 1;

      const horizSpd = Math.hypot(ballVel.x, ballVel.z);
      if (horizSpd > 0.2) {
        const kick = prof.spinTransfer * (1 - wet * 0.4) * 0.075;
        ballVel.x += -ballSpin.z * kick;
        ballVel.z += ballSpin.x * kick;
      }

      if (prof.scatter > 0.05) {
        ballVel.x += (Math.random() - 0.5) * res.impactSpeed * prof.scatter;
        ballVel.z += (Math.random() - 0.5) * res.impactSpeed * prof.scatter;
      }

      if (res.impactSpeed > 0.75) {
        this.triggerSquash(THREE.MathUtils.clamp(res.impactSpeed / 8.5, 0.28, 1.05));
        this.spawnBounceRing(ballPos.x, ballPos.z, prof.color, res.impactSpeed);
      }
      if (res.impactSpeed > 1.85) {
        this.recordPhysicsEvent(
          'FLOOR_BOUNCE',
          `BOUNCE e=${res.normalE.toFixed(2)}`,
          ballPos,
          ballVel,
          ballSpin,
          res.normalE,
          elapsedSec
        );
      }

      return { bounced: res.impactSpeed > 0.65, impactSpeed: res.impactSpeed, normalE: res.normalE };
    }

    // Pure rolling contact: ω = (n × v) / R = (v_z / R, spin_y, -v_x / R)
    ballVel.y = 0;
    const rollDecay = Math.pow(prof.rollDrag + wet * 0.018, dt * 60);
    ballVel.x *= rollDecay;
    ballVel.z *= rollDecay;
    ballSpin.set(
      ballVel.z / BASKET_BALL_RADIUS,
      ballSpin.y * Math.pow(0.95, dt * 60),
      -ballVel.x / BASKET_BALL_RADIUS
    );
    ballRot.x += ballSpin.x * dt;
    ballRot.z += ballSpin.z * dt;
    return { bounced: false, impactSpeed: 0, normalE: this.lastNormalE };
  }

  public triggerSquash(amp: number) {
    this.squashTimer = 0.11;
    this.squashAmp = THREE.MathUtils.clamp(amp, 0.2, 1.1);
  }

  private spawnBounceRing(x: number, z: number, colorHex: number, impactSpeed: number) {
    if (impactSpeed < 1.6) return;
    const slot = this.bounceRings.find((r) => !r.active) || this.bounceRings[0];
    slot.active = true;
    slot.age = 0;
    slot.mesh.position.set(x, 0.025, z);
    slot.mesh.scale.setScalar(1);
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.72;
    slot.mesh.visible = true;
  }

  public getTelemetry(surface: CourtSurface, ballSpin: THREE.Vector3): BouncePhysicsTelemetry {
    const radPerSec = ballSpin.length();
    return {
      activeFormFrames: this.activeFormCount,
      ballSpinRpm: Math.round((radPerSec * 60) / (Math.PI * 2)),
      lastBounceSurface: surface,
      lastRestitution: this.lastRestitution,
      lastNormalE: this.lastNormalE,
      lastTangentialE: this.lastTangentialE,
      entryAngleDeg: this.lastEntryAngleDeg,
      flightApexM: Number(this.flightApexM.toFixed(2)),
      lastSpinKickKmh: this.lastSpinKickKmh,
      bounceCount: this.bounceCount,
      continuousChainSummary: this.getContinuousChainSummary(),
      eventChain: [...this.eventChain],
    };
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.scene.remove(this.root);
  }
}
