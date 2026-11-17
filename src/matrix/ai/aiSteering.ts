import * as THREE from 'three';
import { DefensiveStrategy, TacticalPlay, Unit } from '../../types';

export interface RoleAssignmentResult {
  expectedSetter: Unit;
  expectedReceiver: Unit;
  expectedSpiker: Unit;
}

/**
 * AIBehaviorSteering
 * Autonomous steering, FIVB role assignment, Smart Setter blocker-read routing,
 * 3-step hitter approach timing, and frame-rate-independent anti-overlap locomotion.
 */
export class AIBehaviorSteering {
  private readonly _v1 = new THREE.Vector3();
  private readonly _m1 = new THREE.Matrix4();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);

  public assignTeamRolesOnCross(
    units: Unit[],
    currentSide: 'A' | 'B',
    rawLandingSpot: THREE.Vector3,
    tactic: TacticalPlay
  ): RoleAssignmentResult {
    const active = units.filter((u) => u.team === currentSide);
    const defending = units.filter((u) => u.team !== currentSide);
    const zSign = currentSide === 'A' ? 1 : -1;

    // 1. Designated Setter runs to Zone 2/3 setting pocket near net
    const expectedSetter = active.find((u) => u.role === 'Setter') || active[0];
    expectedSetter.assignedPlayRole = 'SETTER';
    expectedSetter.targetPos.set(1.2 * zSign, 0, 1.55 * zSign);

    // 2. Best Receiver based on intercept distance (Libero gets 0.65x priority weight)
    let bestRec: Unit | null = null;
    let bestScore = Infinity;
    for (const u of active) {
      if (u === expectedSetter) continue;
      const w = u.isLibero ? 0.65 : u.rotationZone === 5 || u.rotationZone === 1 || u.rotationZone === 6 ? 0.82 : 1.15;
      const d = u.mesh.position.distanceTo(rawLandingSpot) * w;
      if (d < bestScore) {
        bestScore = d;
        bestRec = u;
      }
    }
    const expectedReceiver = bestRec || active[0];
    expectedReceiver.assignedPlayRole = 'RECEIVER';
    expectedReceiver.targetPos.set(
      THREE.MathUtils.clamp(rawLandingSpot.x, -4.1, 4.1),
      0,
      THREE.MathUtils.clamp(rawLandingSpot.z, zSign > 0 ? 0.8 : -8.5, zSign > 0 ? 8.5 : -0.8)
    );

    // 3. Smart Setter Decoy & Tactical Hitter Selection
    const hitters = active.filter((u) => u !== expectedSetter && u !== expectedReceiver && !u.isLibero);
    let expectedSpiker: Unit;
    if (tactic === 'FAST_QUICK') {
      expectedSpiker = hitters.find((u) => u.role === 'Middle') || hitters[0] || active[0];
    } else if (tactic === 'PIPE_HEAVY') {
      expectedSpiker = hitters.find((u) => u.role === 'Opposite' || u.role === 'LeftBack') || hitters[0] || active[0];
    } else if (tactic === 'HIGH_OUTSIDE') {
      expectedSpiker = hitters.find((u) => u.role === 'Outside') || hitters[0] || active[0];
    } else {
      const oppBlockers = defending.filter((u) => u.rotationZone === 2 || u.rotationZone === 3 || u.rotationZone === 4);
      const avgBlockX = oppBlockers.reduce((acc, b) => acc + b.mesh.position.x, 0) / Math.max(1, oppBlockers.length);
      let bestHitter = hitters[0] || active[0];
      let bestLaneGap = -1;
      for (const h of hitters) {
        const laneX = h.role === 'Outside' ? -2.9 * zSign : h.role === 'Middle' ? 0.0 : 2.8 * zSign;
        const gap = Math.abs(laneX - avgBlockX);
        if (gap > bestLaneGap) {
          bestLaneGap = gap;
          bestHitter = h;
        }
      }
      expectedSpiker = bestHitter;
    }
    expectedSpiker.assignedPlayRole = 'SPIKER';

    active.forEach((u) => {
      if (u !== expectedSetter && u !== expectedReceiver && u !== expectedSpiker) {
        u.assignedPlayRole = 'COVER';
      }
    });

    defending.forEach((u) => {
      const frontRow = u.rotationZone === 2 || u.rotationZone === 3 || u.rotationZone === 4;
      u.assignedPlayRole = frontRow ? 'BLOCKER' : 'COVER';
    });

    return { expectedSetter, expectedReceiver, expectedSpiker };
  }

  public steerUnit(
    u: Unit,
    units: Unit[],
    tx: number,
    tz: number,
    huntMode: boolean,
    turbulence: number,
    lookX: number,
    lookZ: number,
    dt: number,
    floorFlow?: { vx: number; vz: number; energy: number }
  ): number {
    const dx = tx - u.mesh.position.x;
    const dz = tz - u.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const huntBoost = huntMode ? 1.12 * (0.95 + turbulence * 0.1) : 1.0;
    const desiredSpeed = Math.min(dist * 6.8, u.speed * huntBoost);
    const smoothAlpha = 1 - Math.exp(-15 * dt);

    // Sample ambient self-propagating floor flow for fluid lateral stagger
    const flowGain = floorFlow ? THREE.MathUtils.clamp(floorFlow.energy * 0.14, 0, 0.14) : 0;

    if (dist > 0.04) {
      const vx = (dx / dist) * desiredSpeed + (floorFlow ? floorFlow.vx * flowGain : 0);
      const vz = (dz / dist) * desiredSpeed + (floorFlow ? floorFlow.vz * flowGain : 0);
      u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, vx, smoothAlpha);
      u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, vz, smoothAlpha);
      u.mesh.position.x += u.velocity.x * dt;
      u.mesh.position.z += u.velocity.z * dt;
      u.actualSpeed = Math.hypot(u.velocity.x, u.velocity.z);
      u.stepCycle += ((u.actualSpeed * dt) / 1.15) * Math.PI * 2;
    } else {
      u.velocity.multiplyScalar(Math.exp(-12 * dt));
      u.actualSpeed = Math.hypot(u.velocity.x, u.velocity.z);
    }

    // Fluid inertial banking roll/pitch smoothly driven by ground velocity
    const leanAlpha = 1 - Math.exp(-10 * dt);
    const targetPitch = THREE.MathUtils.clamp(u.actualSpeed * 0.032, 0, 0.22);
    const targetRoll = THREE.MathUtils.clamp(-u.velocity.x * 0.028, -0.14, 0.14);
    u.currentLeanPitch = THREE.MathUtils.lerp(u.currentLeanPitch, targetPitch, leanAlpha);
    u.currentLeanRoll = THREE.MathUtils.lerp(u.currentLeanRoll, targetRoll, leanAlpha);

    // Personal Voronoi Anti-Overlap Spacing Repulsion
    for (const other of units) {
      if (other === u || other.team !== u.team) continue;
      const ox = u.mesh.position.x - other.mesh.position.x;
      const oz = u.mesh.position.z - other.mesh.position.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.36 && od > 0.001) {
        const push = (1.36 - od) * 0.5;
        u.mesh.position.x += (ox / od) * push;
        u.mesh.position.z += (oz / od) * push;
      }
    }

    this._v1.set(lookX, u.mesh.position.y, lookZ);
    if (this._v1.distanceToSquared(u.mesh.position) > 0.02) {
      this._m1.lookAt(this._v1, u.mesh.position, this._up);
      this._q1.setFromRotationMatrix(this._m1);
      u.mesh.quaternion.slerp(this._q1, Math.min(1, dt * 10));
    }

    return dist;
  }

  public computeDefensiveTarget(
    u: Unit,
    defStrat: DefensiveStrategy,
    ballX: number,
    oppSpikerX: number,
    basePos: THREE.Vector3
  ) {
    const zSign = u.team === 'A' ? 1 : -1;
    if (u.assignedPlayRole === 'BLOCKER') {
      let blockAnchor = ballX;
      let latOffset = u.rotationZone === 4 ? -1.05 : u.rotationZone === 2 ? 1.05 : 0;
      if (defStrat === 'COMMIT_BLOCK') {
        blockAnchor = oppSpikerX;
        latOffset *= 0.65;
      } else if (defStrat === 'WING_PINCH') {
        latOffset = u.rotationZone === 4 ? -1.45 : u.rotationZone === 2 ? 1.45 : 0;
      }
      u.targetPos.set(THREE.MathUtils.clamp(blockAnchor + latOffset, -3.85, 3.85), 0, 0.85 * zSign);
    } else {
      const depthBoost =
        defStrat === 'ROTATIONAL_DEEP' ? 0.95 * zSign : defStrat === 'WING_PINCH' ? -0.45 * zSign : 0;
      const shadeX = defStrat === 'WING_PINCH' ? -oppSpikerX * 0.22 : ballX * 0.2;
      u.targetPos.set(
        THREE.MathUtils.clamp(basePos.x + shadeX, -4.1, 4.1),
        0,
        THREE.MathUtils.clamp(basePos.z + depthBoost, u.team === 'A' ? 2.8 : -8.5, u.team === 'A' ? 8.5 : -2.8)
      );
    }
  }
}
