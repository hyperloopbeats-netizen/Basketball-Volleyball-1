import * as THREE from 'three';
import { Unit } from '../../types';

export type HandContactZone =
  | 'FOREARM_PLATFORM'
  | 'PANCAKE_HAND'
  | 'OVERHEAD_CUPS'
  | 'STRIKE_PALM'
  | 'BLOCK_WALL'
  | 'LONG_JUMP_REACH'
  | 'TORSO_SAVE';

export interface HandHitboxResult {
  hit: boolean;
  zone: HandContactZone;
  contactPoint: THREE.Vector3;
  handNormal: THREE.Vector3;
  qualityFactor: number; // 0..1 (1 = dead-center palm/platform sweet spot)
}

interface LocalOBB {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  zone: HandContactZone;
}

/**
 * HandHitboxSystem
 * Computes world-space anatomical 3D Oriented Bounding Boxes (OBBs) for each athlete's
 * forearm platform, outstretched pancake dive hand, long-jump reach arm, cupped setter fingers,
 * spiker palm arc, torso scramble fallback, and two-hand roof block wall — performing
 * 8-step continuous swept ball-segment intersection so fast spikes never tunnel or miss hands.
 */
export class HandHitboxSystem {
  private readonly _obb: LocalOBB = {
    offsetX: 0,
    offsetY: 1.0,
    offsetZ: 0.4,
    halfX: 0.55,
    halfY: 0.5,
    halfZ: 0.55,
    zone: 'FOREARM_PLATFORM',
  };

  private readonly _contactWorld = new THREE.Vector3();
  private readonly _handNormal = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();

  private computeLocalOBBForUnit(
    u: Unit,
    touchIndex: number,
    isBlocker: boolean,
    activeManualBoost: boolean
  ): LocalOBB {
    const obb = this._obb;
    const crouch = u.currentCrouch || 0;
    const boost = activeManualBoost ? 1.2 : 1.0;

    if (isBlocker) {
      obb.zone = 'BLOCK_WALL';
      obb.offsetX = 0;
      obb.offsetY = 2.26;
      obb.offsetZ = 0.36;
      obb.halfX = 0.86;
      obb.halfY = 0.7;
      obb.halfZ = 0.5;
      return obb;
    }

    if (u.animState === 'LONG_JUMP_LEAP' || u.isLongJump) {
      obb.zone = 'LONG_JUMP_REACH';
      obb.offsetX = 0;
      obb.offsetY = 1.62;
      obb.offsetZ = 0.92;
      obb.halfX = 0.94 * boost;
      obb.halfY = 0.92 * boost;
      obb.halfZ = 1.08 * boost;
      return obb;
    }

    if (u.animState === 'DIVE_PANCAKE') {
      obb.zone = 'PANCAKE_HAND';
      obb.offsetX = 0;
      obb.offsetY = 0.32;
      obb.offsetZ = 1.08;
      obb.halfX = 0.94 * boost;
      obb.halfY = 0.48 * boost;
      obb.halfZ = 1.08 * boost;
      return obb;
    }

    if (
      u.isJumping ||
      u.animState === 'SPIKE_WINDUP' ||
      u.animState === 'SPIKE_SWING' ||
      u.animState === 'SERVE_JUMP'
    ) {
      obb.zone = 'STRIKE_PALM';
      obb.offsetX = 0.14;
      obb.offsetY = 2.18;
      obb.offsetZ = 0.46;
      obb.halfX = 0.78 * boost;
      obb.halfY = 0.82 * boost;
      obb.halfZ = 0.82 * boost;
      return obb;
    }

    if (
      touchIndex === 1 ||
      u.animState === 'PASS_OVERHEAD' ||
      u.animState === 'SET_HIGH_ARC' ||
      u.animState === 'SET_QUICK' ||
      u.animState === 'SET_BACK'
    ) {
      obb.zone = 'OVERHEAD_CUPS';
      obb.offsetX = 0;
      obb.offsetY = 1.84 - crouch * 0.35;
      obb.offsetZ = 0.3;
      obb.halfX = 0.7 * boost;
      obb.halfY = 0.66 * boost;
      obb.halfZ = 0.7 * boost;
      return obb;
    }

    // Default: Forearm Dig Platform (Touch 0 receive / scramble)
    obb.zone = 'FOREARM_PLATFORM';
    obb.offsetX = 0;
    obb.offsetY = 0.98 - crouch * 0.4;
    obb.offsetZ = 0.5;
    obb.halfX = 0.78 * boost;
    obb.halfY = 0.72 * boost;
    obb.halfZ = 0.8 * boost;
    return obb;
  }

  private testSweptLocalBox(
    u: Unit,
    ballPrev: THREE.Vector3,
    ballCurr: THREE.Vector3,
    ballRadius: number,
    obb: LocalOBB
  ): { hit: boolean; bestT: number; normSq: number } {
    const yaw = u.mesh.rotation.y;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    this._fwd.set(sinY, 0, cosY);
    this._right.set(cosY, 0, -sinY);

    const cx = u.mesh.position.x + this._right.x * obb.offsetX + this._fwd.x * obb.offsetZ;
    const cy = u.mesh.position.y + obb.offsetY;
    const cz = u.mesh.position.z + this._right.z * obb.offsetX + this._fwd.z * obb.offsetZ;

    const p0dx = ballPrev.x - cx;
    const p0dy = ballPrev.y - cy;
    const p0dz = ballPrev.z - cz;
    const x0 = p0dx * this._right.x + p0dz * this._right.z;
    const y0 = p0dy;
    const z0 = p0dx * this._fwd.x + p0dz * this._fwd.z;

    const p1dx = ballCurr.x - cx;
    const p1dy = ballCurr.y - cy;
    const p1dz = ballCurr.z - cz;
    const x1 = p1dx * this._right.x + p1dz * this._right.z;
    const y1 = p1dy;
    const z1 = p1dx * this._fwd.x + p1dz * this._fwd.z;

    const hx = obb.halfX + ballRadius;
    const hy = obb.halfY + ballRadius;
    const hz = obb.halfZ + ballRadius;

    // 8 analytical swept segment samples for crisp high-speed spike & long-jump detection
    let bestNormDistSq = Infinity;
    let bestT = 1;
    for (let s = 0; s <= 7; s++) {
      const t = s / 7;
      const sx = x0 + (x1 - x0) * t;
      const sy = y0 + (y1 - y0) * t;
      const sz = z0 + (z1 - z0) * t;

      const ox = Math.max(0, Math.abs(sx) - obb.halfX);
      const oy = Math.max(0, Math.abs(sy) - obb.halfY);
      const oz = Math.max(0, Math.abs(sz) - obb.halfZ);
      const outSq = ox * ox + oy * oy + oz * oz;

      if (outSq <= ballRadius * ballRadius * 1.15) {
        const normSq = (sx / hx) * (sx / hx) + (sy / hy) * (sy / hy) + (sz / hz) * (sz / hz);
        if (normSq < bestNormDistSq) {
          bestNormDistSq = normSq;
          bestT = t;
        }
      }
    }

    return {
      hit: bestNormDistSq < Infinity,
      bestT,
      normSq: bestNormDistSq,
    };
  }

  /**
   * Tests swept ball trajectory [ballPrev -> ballCurr] against the unit's current hand/arm OBB,
   * with a torso scramble fallback box on touch 0 when defending hot spikes.
   */
  public testSweptHandHitbox(
    u: Unit,
    ballPrev: THREE.Vector3,
    ballCurr: THREE.Vector3,
    ballRadius: number,
    touchIndex: number,
    isBlocker: boolean,
    activeManualBoost: boolean,
    out: HandHitboxResult
  ): boolean {
    const obb = this.computeLocalOBBForUnit(u, touchIndex, isBlocker, activeManualBoost);
    let res = this.testSweptLocalBox(u, ballPrev, ballCurr, ballRadius, obb);
    let hitZone: HandContactZone = obb.zone;

    if (!res.hit && !isBlocker && touchIndex === 0 && !u.isJumping) {
      // Torso Scramble Save chest/shoulder OBB fallback
      const torsoOBB: LocalOBB = {
        offsetX: 0,
        offsetY: 1.12,
        offsetZ: 0.1,
        halfX: 0.44,
        halfY: 0.48,
        halfZ: 0.36,
        zone: 'TORSO_SAVE',
      };
      const torsoRes = this.testSweptLocalBox(u, ballPrev, ballCurr, ballRadius, torsoOBB);
      if (torsoRes.hit) {
        res = torsoRes;
        hitZone = 'TORSO_SAVE';
      }
    }

    if (!res.hit) {
      out.hit = false;
      return false;
    }

    const lx = THREE.MathUtils.lerp(ballPrev.x, ballCurr.x, res.bestT);
    const ly = THREE.MathUtils.lerp(ballPrev.y, ballCurr.y, res.bestT);
    const lz = THREE.MathUtils.lerp(ballPrev.z, ballCurr.z, res.bestT);
    this._contactWorld.set(lx, ly, lz);

    if (hitZone === 'PANCAKE_HAND') {
      this._handNormal.set(this._fwd.x * 0.24, 0.95, this._fwd.z * 0.24).normalize();
    } else if (hitZone === 'LONG_JUMP_REACH') {
      this._handNormal.set(this._fwd.x * 0.72, -0.35, this._fwd.z * 0.72).normalize();
    } else if (hitZone === 'FOREARM_PLATFORM') {
      this._handNormal.set(this._fwd.x * 0.5, 0.86, this._fwd.z * 0.5).normalize();
    } else if (hitZone === 'STRIKE_PALM') {
      this._handNormal.set(this._fwd.x * 0.88, -0.45, this._fwd.z * 0.88).normalize();
    } else if (hitZone === 'BLOCK_WALL') {
      this._handNormal.set(this._fwd.x * 0.78, -0.62, this._fwd.z * 0.78).normalize();
    } else if (hitZone === 'TORSO_SAVE') {
      this._handNormal.set(this._fwd.x * 0.35, 0.88, this._fwd.z * 0.35).normalize();
    } else {
      this._handNormal.set(this._fwd.x * 0.35, 0.92, this._fwd.z * 0.35).normalize();
    }

    out.hit = true;
    out.zone = hitZone;
    out.contactPoint.copy(this._contactWorld);
    out.handNormal.copy(this._handNormal);
    out.qualityFactor =
      hitZone === 'TORSO_SAVE'
        ? THREE.MathUtils.clamp(0.62 - Math.sqrt(res.normSq) * 0.2, 0.4, 0.65)
        : THREE.MathUtils.clamp(1 - Math.sqrt(res.normSq) * 0.42, 0.38, 1.0);
    return true;
  }

  /**
   * Computes world-space anatomical hand/palm anchor point for a unit (used for trail origin,
   * sweat droplets, and comic close-up camera focal framing).
   */
  public getUnitHandWorldAnchor(u: Unit, out: THREE.Vector3): THREE.Vector3 {
    const yaw = u.mesh.rotation.y;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    if (u.animState === 'DIVE_PANCAKE') {
      out.set(u.mesh.position.x + sinY * 1.18, 0.22, u.mesh.position.z + cosY * 1.18);
    } else if (u.animState === 'LONG_JUMP_LEAP') {
      out.set(u.mesh.position.x + sinY * 0.92, u.mesh.position.y + 1.85, u.mesh.position.z + cosY * 0.92);
    } else if (u.isJumping || u.animState === 'SPIKE_SWING' || u.animState === 'BLOCK_ROOF') {
      out.set(u.mesh.position.x + sinY * 0.38, u.mesh.position.y + 2.28, u.mesh.position.z + cosY * 0.38);
    } else {
      out.set(u.mesh.position.x + sinY * 0.45, u.mesh.position.y + 1.05, u.mesh.position.z + cosY * 0.45);
    }
    return out;
  }
}
