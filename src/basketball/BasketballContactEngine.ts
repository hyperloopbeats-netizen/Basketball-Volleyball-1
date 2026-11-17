import * as THREE from 'three';
import {
  BasketUnit,
  OpticalContactEvent,
  OpticalContactTelemetry,
  OpticalHitboxZone,
} from './basketballTypes';

interface AnatomicalOBB {
  unitId: number;
  label: string;
  team: 'A' | 'B';
  zone: OpticalHitboxZone;
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  quaternion: THREE.Quaternion;
  radius: number;
  wireMesh: THREE.LineSegments;
  wireMat: THREE.LineBasicMaterial;
  hitFlashTimer: number;
  proximityScore: number; // 0..1 when opposing OBB enters sensor shell
  isHovered: boolean;
  isSelected: boolean;
  isStunned: boolean;
}

interface OpticalPulseRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

export interface BallHandHitResult {
  hit: boolean;
  defender: BasketUnit;
  zone: 'HAND_L' | 'HAND_R' | 'TORSO' | 'HEAD';
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  impactForce: number;
}

export interface BodyContactSummary {
  screenCount: number;
  maxImpulse: number;
  proximityAlerts: number;
  closestMatchupMeters: number;
}

/**
 * BasketballContactEngine
 * Real-Time Optical Contact & Proximity Engine tracking 30 anatomical 3D OBBs
 * (HAND_L, HAND_R, TORSO, HEAD, STANCE per player):
 *  - Continuous swept segment-vs-OBB checks across Hands, Torso & Head
 *  - Live 3D Proximity Sensor Boxes highlighting defenders within closeout / ankle-break range
 *  - Multi-zone OBB-to-OBB body screens, box-outs, reach-in hand checks & footwork tangles
 *  - True local-space Ray-vs-OBB slab intersection for accurate pointer probing & interaction
 */
export class BasketballContactEngine {
  public readonly root = new THREE.Group();
  private readonly boxes: AnatomicalOBB[] = [];
  private readonly boxMap = new Map<string, AnatomicalOBB>();
  private readonly pulseRings: OpticalPulseRing[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private overlayEnabled = false;
  private hoveredTargetLabel: string | null = null;
  private hoveredZone: OpticalHitboxZone | null = null;
  private hoveredUnitId: number | null = null;
  private selectedTargetId: number | null = null;
  private lastContactLabel = 'OPTICAL PROXIMITY RIG ONLINE · 30 HITBOXES';
  private totalContacts = 0;
  private proximityAlerts = 0;
  private closestMatchupMeters = 9.9;
  private eventSeq = 1;
  private recentEvents: OpticalContactEvent[] = [];
  private contactCooldown = new Map<string, number>();

  // Pre-allocated zero-GC scratch helpers
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _v4 = new THREE.Vector3();
  private readonly _localA = new THREE.Vector3();
  private readonly _localB = new THREE.Vector3();
  private readonly _localOrigin = new THREE.Vector3();
  private readonly _localDir = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _invQ = new THREE.Quaternion();
  private readonly _unitBoxGeo: THREE.EdgesGeometry;

  constructor(private scene: THREE.Scene) {
    this.root.name = 'BasketballOpticalContactEngine';
    this._unitBoxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    this.disposables.push(this._unitBoxGeo);

    // Pre-allocate 12 optical contact shock rings
    const ringGeo = new THREE.RingGeometry(0.14, 0.25, 24);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.root.add(mesh);
      this.disposables.push(mat);
      this.pulseRings.push({ mesh, mat, age: 0, life: 0.44, active: false });
    }

    this.scene.add(this.root);
  }

  public registerUnits(units: BasketUnit[]) {
    for (const box of this.boxes) {
      this.root.remove(box.wireMesh);
      box.wireMat.dispose();
    }
    this.boxes.length = 0;
    this.boxMap.clear();

    const zoneDefs: Array<{ zone: OpticalHitboxZone; half: [number, number, number] }> = [
      { zone: 'HAND_L', half: [0.14, 0.14, 0.14] },
      { zone: 'HAND_R', half: [0.14, 0.14, 0.14] },
      { zone: 'TORSO', half: [0.25, 0.31, 0.19] },
      { zone: 'HEAD', half: [0.14, 0.15, 0.14] },
      { zone: 'STANCE', half: [0.36, 0.13, 0.36] },
    ];

    for (const u of units) {
      for (const zd of zoneDefs) {
        const baseHex = u.team === 'A' ? 0x00f0ff : 0xff3d7f;
        const wireMat = new THREE.LineBasicMaterial({
          color: baseHex,
          transparent: true,
          opacity: 0.45,
        });
        const wireMesh = new THREE.LineSegments(this._unitBoxGeo, wireMat);
        wireMesh.visible = this.overlayEnabled;
        wireMesh.renderOrder = 7;
        this.root.add(wireMesh);
        this.disposables.push(wireMat);

        const rec: AnatomicalOBB = {
          unitId: u.id,
          label: `#${u.jerseyNumber} ${u.name}`,
          team: u.team,
          zone: zd.zone,
          center: new THREE.Vector3(),
          halfExtents: new THREE.Vector3(zd.half[0], zd.half[1], zd.half[2]),
          quaternion: new THREE.Quaternion(),
          radius: Math.hypot(zd.half[0], zd.half[1], zd.half[2]),
          wireMesh,
          wireMat,
          hitFlashTimer: 0,
          proximityScore: 0,
          isHovered: false,
          isSelected: false,
          isStunned: false,
        };
        this.boxes.push(rec);
        this.boxMap.set(`${u.id}:${zd.zone}`, rec);
      }
    }
  }

  public setOverlayEnabled(enabled: boolean) {
    this.overlayEnabled = enabled;
    for (const b of this.boxes) {
      b.wireMesh.visible = enabled;
    }
  }

  public isOverlayEnabled(): boolean {
    return this.overlayEnabled;
  }

  public syncHitboxes(units: BasketUnit[], dt: number, elapsedSec: number) {
    for (const [key, exp] of this.contactCooldown.entries()) {
      if (elapsedSec > exp) this.contactCooldown.delete(key);
    }

    // 1. Update world centers & orientations for all 30 boxes
    for (const u of units) {
      u.mesh.updateMatrixWorld(true);
      const scale = u.profile.heightScale || 1;
      const bodyQuat = u.mesh.getWorldQuaternion(this._q1);

      const syncBox = (zone: OpticalHitboxZone, obj: THREE.Object3D) => {
        const b = this.boxMap.get(`${u.id}:${zone}`);
        if (!b) return;
        obj.getWorldPosition(b.center);
        if (zone === 'STANCE') {
          b.center.set(u.mesh.position.x, u.mesh.position.y + 0.14, u.mesh.position.z);
          b.quaternion.copy(bodyQuat);
        } else if (zone === 'TORSO') {
          b.center.y += 0.25 * scale;
          obj.getWorldQuaternion(b.quaternion);
        } else {
          obj.getWorldQuaternion(b.quaternion);
        }

        b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt);
        b.isSelected = this.selectedTargetId === u.id;
        b.isHovered = this.hoveredUnitId === u.id && (this.hoveredZone === zone || this.overlayEnabled);
        b.isStunned = u.stunTimer > 0;
        b.proximityScore = Math.max(0, b.proximityScore - dt * 2.5);
      };

      syncBox('HAND_L', u.parts.handL);
      syncBox('HAND_R', u.parts.handR);
      syncBox('TORSO', u.parts.torso);
      syncBox('HEAD', u.parts.head);
      syncBox('STANCE', u.mesh);
    }

    // 2. Compute live OBB Proximity Sensors across opposing units
    let alerts = 0;
    let minMatchup = 9.9;
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      const torsoA = this.boxMap.get(`${a.id}:TORSO`);
      const stanceA = this.boxMap.get(`${a.id}:STANCE`);
      if (!torsoA || !stanceA) continue;

      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (a.team === b.team) continue;
        const torsoB = this.boxMap.get(`${b.id}:TORSO`);
        const stanceB = this.boxMap.get(`${b.id}:STANCE`);
        if (!torsoB || !stanceB) continue;

        const d = torsoA.center.distanceTo(torsoB.center);
        if (d < minMatchup) minMatchup = d;

        if (d < 1.85) {
          const p = THREE.MathUtils.clamp(1 - (d - 0.72) / 1.13, 0.1, 1.0);
          if (p > 0.35) alerts++;
          torsoA.proximityScore = Math.max(torsoA.proximityScore, p);
          torsoB.proximityScore = Math.max(torsoB.proximityScore, p);
          stanceA.proximityScore = Math.max(stanceA.proximityScore, p * 0.9);
          stanceB.proximityScore = Math.max(stanceB.proximityScore, p * 0.9);
        }
      }
    }
    this.proximityAlerts = alerts;
    this.closestMatchupMeters = Number(minMatchup.toFixed(2));

    // 3. Apply color & visibility states to all wireframe boxes
    for (const b of this.boxes) {
      const proxExpand = b.proximityScore > 0.25 ? 1 + b.proximityScore * 0.08 : 1;
      b.wireMesh.position.copy(b.center);
      b.wireMesh.quaternion.copy(b.quaternion);
      b.wireMesh.scale.copy(b.halfExtents).multiplyScalar(proxExpand);

      // Keep all 3D structure/hitbox wireframes strictly hidden unless debug overlay is explicitly enabled
      b.wireMesh.visible = this.overlayEnabled;

      if (b.hitFlashTimer > 0) {
        b.wireMat.color.setHex(0xffb347);
        b.wireMat.opacity = 0.98;
      } else if (b.isStunned) {
        b.wireMat.color.setHex(0xd946ef);
        b.wireMat.opacity = 0.92;
      } else if (b.isHovered) {
        b.wireMat.color.setHex(0x34d399);
        b.wireMat.opacity = 0.95;
      } else if (b.isSelected) {
        b.wireMat.color.setHex(0xfacc15);
        b.wireMat.opacity = 0.88;
      } else if (b.proximityScore > 0.55) {
        b.wireMat.color.setHex(0xf59e0b);
        b.wireMat.opacity = 0.35 + b.proximityScore * 0.55;
      } else {
        b.wireMat.color.setHex(b.team === 'A' ? 0x00f0ff : 0xff3d7f);
        b.wireMat.opacity = b.zone === 'HAND_L' || b.zone === 'HAND_R' ? 0.65 : 0.36;
      }
    }

    // 4. Animate optical contact shock rings
    for (const r of this.pulseRings) {
      if (!r.active) continue;
      r.age += dt;
      const p = r.age / r.life;
      if (p >= 1) {
        r.active = false;
        r.mesh.visible = false;
      } else {
        const s = 1 + p * 3.5;
        r.mesh.scale.setScalar(s);
        r.mat.opacity = (1 - p) * 0.86;
      }
    }
  }

  /**
   * Checks whether a defending player's TORSO/HAND OBBs sit across a direct chest-pass lane.
   * Used by BasketballEngine pass physics to choose Bounce Pass vs Chest Pass dynamically.
   */
  public isPassLaneOccluded(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    offenseTeam: 'A' | 'B',
    units: BasketUnit[]
  ): boolean {
    const defTeam = offenseTeam === 'A' ? 'B' : 'A';
    for (const u of units) {
      if (u.team !== defTeam || u.stunTimer > 0) continue;
      const torso = this.boxMap.get(`${u.id}:TORSO`);
      if (!torso) continue;

      this._invQ.copy(torso.quaternion).invert();
      this._localA.copy(fromPos).sub(torso.center).applyQuaternion(this._invQ);
      this._localB.copy(toPos).sub(torso.center).applyQuaternion(this._invQ);
      const closest = this.closestPointOnSegment(this._localA, this._localB, this._v1);
      const padX = torso.halfExtents.x + 0.32;
      const padY = torso.halfExtents.y + 0.38;
      const padZ = torso.halfExtents.z + 0.32;
      if (
        Math.abs(closest.x) <= padX &&
        Math.abs(closest.y) <= padY &&
        Math.abs(closest.z) <= padZ
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Continuous swept segment-vs-OBB check against defender Hands, Torso & Head during shot/pass/dunk.
   */
  public checkBallVsDefenderHands(
    prevPos: THREE.Vector3,
    currPos: THREE.Vector3,
    ballRadius: number,
    offenseTeam: 'A' | 'B',
    units: BasketUnit[],
    elapsedSec: number
  ): BallHandHitResult | null {
    const defTeam = offenseTeam === 'A' ? 'B' : 'A';
    const zones: Array<'HAND_L' | 'HAND_R' | 'TORSO' | 'HEAD'> = [
      'HAND_L',
      'HAND_R',
      'TORSO',
      'HEAD',
    ];

    for (const u of units) {
      if (u.team !== defTeam || u.stunTimer > 0) continue;
      for (const zone of zones) {
        const key = `ball:${u.id}:${zone}`;
        if ((this.contactCooldown.get(key) ?? 0) > elapsedSec) continue;

        const obb = this.boxMap.get(`${u.id}:${zone}`);
        if (!obb) continue;

        this._invQ.copy(obb.quaternion).invert();
        this._localA.copy(prevPos).sub(obb.center).applyQuaternion(this._invQ);
        this._localB.copy(currPos).sub(obb.center).applyQuaternion(this._invQ);

        const jumpReach = u.isJumping && (zone === 'HAND_L' || zone === 'HAND_R') ? 0.1 : 0.03;
        const padX = obb.halfExtents.x + ballRadius + jumpReach;
        const padY = obb.halfExtents.y + ballRadius + jumpReach;
        const padZ = obb.halfExtents.z + ballRadius + jumpReach;

        const closest = this.closestPointOnSegment(this._localA, this._localB, this._v1);
        const clampedX = THREE.MathUtils.clamp(closest.x, -padX, padX);
        const clampedY = THREE.MathUtils.clamp(closest.y, -padY, padY);
        const clampedZ = THREE.MathUtils.clamp(closest.z, -padZ, padZ);

        const dx = closest.x - clampedX;
        const dy = closest.y - clampedY;
        const dz = closest.z - clampedZ;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 <= 0.004) {
          this.contactCooldown.set(key, elapsedSec + 0.36);
          obb.hitFlashTimer = 0.48;
          const contactPoint = obb.center.clone();
          const contactNormal = this._v2.copy(currPos).sub(obb.center).normalize();
          if (contactNormal.lengthSq() < 0.01) contactNormal.set(0, 1, 0);

          this.spawnPulseRing(contactPoint, contactNormal, 0xffb347);
          return {
            hit: true,
            defender: u,
            zone,
            contactPoint,
            contactNormal: contactNormal.clone(),
            impactForce: u.isJumping ? 1.1 : zone === 'TORSO' ? 0.62 : 0.78,
          };
        }
      }
    }
    return null;
  }

  /**
   * Real-time anatomical OBB contact resolution across TORSO, STANCE & reaching HANDS:
   * resolves screens, box-outs, reach-in hand checks & footwork tangles.
   */
  public resolvePlayerBodyContacts(
    units: BasketUnit[],
    possessionTeam: 'A' | 'B',
    elapsedSec: number
  ): BodyContactSummary {
    let screenCount = 0;
    let maxImpulse = 0;

    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      const torsoA = this.boxMap.get(`${a.id}:TORSO`);
      const stanceA = this.boxMap.get(`${a.id}:STANCE`);
      if (!torsoA || !stanceA) continue;

      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (Math.abs(a.mesh.position.y - b.mesh.position.y) > 1.25) continue;
        const torsoB = this.boxMap.get(`${b.id}:TORSO`);
        const stanceB = this.boxMap.get(`${b.id}:STANCE`);
        if (!torsoB || !stanceB) continue;

        // Combine torso core radius + stance width into accurate physical separation distance
        const dx = torsoB.center.x - torsoA.center.x;
        const dz = torsoB.center.z - torsoA.center.z;
        const dist = Math.hypot(dx, dz);
        const minDist = 0.76;
        if (dist >= minDist || dist < 0.001) continue;

        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        // Screeners & ankle-breakers hold strong physical leverage
        const aAnchor =
          a.animState === 'SCREEN_SET' || a.animState === 'BOX_OUT' || a.animState === 'ANKLE_BREAKER'
            ? 0.22
            : a.stunTimer > 0
            ? 0.78
            : 0.5;
        const bAnchor =
          b.animState === 'SCREEN_SET' || b.animState === 'BOX_OUT' || b.animState === 'ANKLE_BREAKER'
            ? 0.22
            : b.stunTimer > 0
            ? 0.78
            : 0.5;
        const sumW = aAnchor + bAnchor;

        a.mesh.position.x -= nx * overlap * (aAnchor / sumW);
        a.mesh.position.z -= nz * overlap * (aAnchor / sumW);
        b.mesh.position.x += nx * overlap * (bAnchor / sumW);
        b.mesh.position.z += nz * overlap * (bAnchor / sumW);

        if (a.team !== b.team) {
          const pairKey = `body:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
          if ((this.contactCooldown.get(pairKey) ?? 0) <= elapsedSec && overlap > 0.045) {
            this.contactCooldown.set(pairKey, elapsedSec + 0.78);
            torsoA.hitFlashTimer = 0.32;
            torsoB.hitFlashTimer = 0.32;
            stanceA.hitFlashTimer = 0.24;
            stanceB.hitFlashTimer = 0.24;

            const midPt = this._v3.set(
              (torsoA.center.x + torsoB.center.x) * 0.5,
              1.18,
              (torsoA.center.z + torsoB.center.z) * 0.5
            );
            this._v4.set(nx, 0.22, nz).normalize();
            this.spawnPulseRing(midPt, this._v4, 0x00f0ff);

            const isScreen =
              (a.team === possessionTeam && !a.hasBall && a.actualSpeed < 1.9) ||
              (b.team === possessionTeam && !b.hasBall && b.actualSpeed < 1.9);
            const isBoxOut =
              !a.hasBall && !b.hasBall && Math.min(a.mesh.position.z, b.mesh.position.z) < -1.4;

            if (isScreen) screenCount++;
            const force = Number(THREE.MathUtils.clamp(overlap * 8.5, 0.38, 1.0).toFixed(2));
            maxImpulse = Math.max(maxImpulse, force);

            this.recordEvent(
              isScreen ? 'SCREEN_PICK' : isBoxOut ? 'BOX_OUT' : 'BODY_BUMP',
              `#${a.jerseyNumber} ${a.name}`,
              `#${b.jerseyNumber} ${b.name}`,
              isBoxOut ? 'STANCE' : 'TORSO',
              force,
              midPt,
              elapsedSec
            );
          }
        }
      }
    }

    return {
      screenCount,
      maxImpulse,
      proximityAlerts: this.proximityAlerts,
      closestMatchupMeters: this.closestMatchupMeters,
    };
  }

  /**
   * True local-space Ray-vs-OBB slab intersection for probing exact anatomical hitboxes.
   */
  public raycastPointer(
    ray: THREE.Ray
  ): { unitId: number; label: string; team: 'A' | 'B'; zone: OpticalHitboxZone; point: THREE.Vector3 } | null {
    let bestDist = Infinity;
    let bestHit: {
      unitId: number;
      label: string;
      team: 'A' | 'B';
      zone: OpticalHitboxZone;
      point: THREE.Vector3;
    } | null = null;

    for (const obb of this.boxes) {
      // Transform ray into OBB local frame
      this._invQ.copy(obb.quaternion).invert();
      this._localOrigin.copy(ray.origin).sub(obb.center).applyQuaternion(this._invQ);
      this._localDir.copy(ray.direction).applyQuaternion(this._invQ);

      // Slight ergonomic padding (+22%) so moving fingers/hands are easy to probe
      const hx = obb.halfExtents.x * 1.24;
      const hy = obb.halfExtents.y * 1.24;
      const hz = obb.halfExtents.z * 1.24;

      const tHit = this.intersectLocalRayAABB(this._localOrigin, this._localDir, hx, hy, hz);
      if (tHit !== null && tHit >= 0 && tHit < bestDist) {
        bestDist = tHit;
        const worldPt = ray.origin.clone().addScaledVector(ray.direction, tHit);
        bestHit = {
          unitId: obb.unitId,
          label: obb.label,
          team: obb.team,
          zone: obb.zone,
          point: worldPt,
        };
      }
    }

    if (bestHit) {
      this.hoveredUnitId = bestHit.unitId;
      this.hoveredTargetLabel = bestHit.label;
      this.hoveredZone = bestHit.zone;
    } else {
      this.hoveredUnitId = null;
      this.hoveredTargetLabel = null;
      this.hoveredZone = null;
    }

    return bestHit;
  }

  private intersectLocalRayAABB(
    orig: THREE.Vector3,
    dir: THREE.Vector3,
    hx: number,
    hy: number,
    hz: number
  ): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;

    const axes: [number, number, number][] = [
      [orig.x, dir.x, hx],
      [orig.y, dir.y, hy],
      [orig.z, dir.z, hz],
    ];
    for (const [o, d, h] of axes) {
      if (Math.abs(d) < 1e-6) {
        if (o < -h || o > h) return null;
      } else {
        const inv = 1 / d;
        let t1 = (-h - o) * inv;
        let t2 = (h - o) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
  }

  public setSelectedTarget(unitId: number | null, point?: THREE.Vector3, label?: string, elapsedSec = 0) {
    this.selectedTargetId = unitId;
    if (point) {
      this.spawnPulseRing(point, this._v1.set(0, 1, 0), 0xfacc15);
    }
    if (unitId !== null && label) {
      this.recordEvent('INTERACT_LOCK', 'USER RAY', label, 'TORSO', 0.9, point || this._v1.set(0, 1, 0), elapsedSec);
    }
  }

  public recordExternalContact(
    kind: OpticalContactEvent['kind'],
    actorLabel: string,
    targetLabel: string,
    zone: OpticalHitboxZone,
    impactForce: number,
    point: THREE.Vector3,
    elapsedSec: number,
    colorHex = 0xff3d7f
  ) {
    this.spawnPulseRing(point, this._v1.set(0, 1, 0), colorHex);
    this.recordEvent(kind, actorLabel, targetLabel, zone, impactForce, point, elapsedSec);
    // Flash affected unit zone boxes
    for (const b of this.boxes) {
      if ((b.label === targetLabel || b.label === actorLabel) && b.zone === zone) {
        b.hitFlashTimer = 0.45;
      }
    }
  }

  public getSelectedTargetId(): number | null {
    return this.selectedTargetId;
  }

  public getTelemetry(): OpticalContactTelemetry {
    return {
      overlayEnabled: this.overlayEnabled,
      activeHitboxCount: this.boxes.length,
      hoveredTargetLabel: this.hoveredTargetLabel,
      hoveredZone: this.hoveredZone,
      selectedTargetId: this.selectedTargetId,
      lastContactLabel: this.lastContactLabel,
      totalContacts: this.totalContacts,
      proximityAlerts: this.proximityAlerts,
      closestMatchupMeters: this.closestMatchupMeters,
      recentEvents: this.recentEvents.slice(0, 4),
    };
  }

  private recordEvent(
    kind: OpticalContactEvent['kind'],
    actorLabel: string,
    targetLabel: string,
    zone: OpticalHitboxZone,
    impactForce: number,
    point: THREE.Vector3,
    elapsedSec: number
  ) {
    this.totalContacts += 1;
    const summary = `${kind.replace('_', ' ')} · ${actorLabel} ↔ ${targetLabel} [${zone}]`;
    this.lastContactLabel = summary;
    const evt: OpticalContactEvent = {
      id: this.eventSeq++,
      kind,
      actorLabel,
      targetLabel,
      zone,
      impactForce,
      point: [Number(point.x.toFixed(2)), Number(point.y.toFixed(2)), Number(point.z.toFixed(2))],
      timestampSec: Number(elapsedSec.toFixed(2)),
    };
    this.recentEvents = [evt, ...this.recentEvents].slice(0, 6);
  }

  private spawnPulseRing(point: THREE.Vector3, normal: THREE.Vector3, colorHex: number) {
    const slot = this.pulseRings.find((r) => !r.active) || this.pulseRings[0];
    slot.active = true;
    slot.age = 0;
    slot.mesh.position.copy(point);
    this._v1.set(0, 0, 1);
    this._dir.copy(normal).normalize();
    if (this._dir.lengthSq() < 0.01) this._dir.set(0, 1, 0);
    slot.mesh.quaternion.setFromUnitVectors(this._v1, this._dir);
    slot.mesh.scale.setScalar(1);
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = 0.92;
    slot.mesh.visible = true;
  }

  private closestPointOnSegment(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const ab = this._v4.copy(b).sub(a);
    const lenSq = ab.lengthSq();
    if (lenSq < 0.00001) return out.copy(a);
    const t = THREE.MathUtils.clamp(-a.dot(ab) / lenSq, 0, 1);
    return out.copy(a).addScaledVector(ab, t);
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.boxes.length = 0;
    this.boxMap.clear();
    this.scene.remove(this.root);
  }
}
