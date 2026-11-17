import * as THREE from 'three';
import { CourtSurface } from '../types';
import {
  BASKET_AIR_DRAG,
  BASKET_BALL_RADIUS,
  BASKET_GRAVITY,
  BasketUnit,
  OrganicPassStyle,
} from './basketballTypes';
import { BasketballContactEngine } from './BasketballContactEngine';

const SURFACE_BOUNCE_E: Record<CourtSurface, number> = {
  HARDWOOD: 0.79,
  OLYMPIC_BLUE: 0.76,
  SAND: 0.44,
  CYBER: 0.83,
};

export interface OrganicPassPlan {
  style: OrganicPassStyle;
  target: BasketUnit;
  startPos: THREE.Vector3;
  leadTargetPos: THREE.Vector3;
  initialVelocity: THREE.Vector3;
  initialSpin: THREE.Vector3;
  flightDuration: number;
  summaryLabel: string;
}

/**
 * BasketballPassingEngine
 * Organic, context-aware basketball passing engine:
 *  - Evaluates teammate lane openness, 2PT arc clearing, cut velocity, and rim angle
 *  - Chooses dynamically among 4 natural pass styles:
 *      1. CHEST_LASER    - crisp chest-to-chest dart with aerodynamic backspin cushion
 *      2. BOUNCE_THREAD  - floor-calibrated e_n bounce pass threaded around reaching torso OBBs
 *      3. TOUCH_LOB      - high-arcing feathery lob over fronting paint defenders
 *      4. NO_LOOK_WHIP   - curved lateral whip pass using Magnus sidespin around closeouts
 */
export class BasketballPassingEngine {
  private readonly _handPos = new THREE.Vector3();
  private readonly _fromProbe = new THREE.Vector3();
  private readonly _toProbe = new THREE.Vector3();
  private readonly _toTarget = new THREE.Vector3();

  public selectBestTeammate(
    handler: BasketUnit,
    teammates: BasketUnit[],
    defenders: BasketUnit[],
    contactEngine: BasketballContactEngine,
    hoopPos: THREE.Vector3,
    arcCleared: boolean,
    isOutsideArcFn: (pos: THREE.Vector3) => boolean
  ): BasketUnit | null {
    if (teammates.length === 0) return null;
    let best = teammates[0];
    let bestScore = -999;

    for (const mate of teammates) {
      let nearestDef = 9.0;
      for (const d of defenders) {
        const dist = d.mesh.position.distanceTo(mate.mesh.position);
        if (dist < nearestDef) nearestDef = dist;
      }

      const occluded = contactEngine.isPassLaneOccluded(
        this._fromProbe.set(handler.mesh.position.x, 1.2, handler.mesh.position.z),
        this._toProbe.set(mate.mesh.position.x, 1.2, mate.mesh.position.z),
        handler.team,
        [...teammates, ...defenders, handler]
      );

      const distToHoop = mate.mesh.position.distanceTo(hoopPos);
      const cutTowardsHoop =
        (hoopPos.x - mate.mesh.position.x) * mate.velocity.x +
        (hoopPos.z - mate.mesh.position.z) * mate.velocity.z >
        1.2;

      const arcBonus = !arcCleared && isOutsideArcFn(mate.mesh.position) ? 6.5 : 0;
      const openBonus = nearestDef * 1.45;
      const lanePenalty = occluded ? -2.2 : 1.4;
      const cutBonus = cutTowardsHoop && distToHoop < 6.5 ? 2.6 : 0;
      const paintBonus = distToHoop < 4.2 && nearestDef > 1.7 ? 2.1 : 0;

      const score = openBonus + arcBonus + lanePenalty + cutBonus + paintBonus;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }

    return best;
  }

  public planOrganicPass(
    from: BasketUnit,
    to: BasketUnit,
    allUnits: BasketUnit[],
    contactEngine: BasketballContactEngine,
    hoopPos: THREE.Vector3,
    surface: CourtSurface,
    courtW: number,
    courtD: number
  ): OrganicPassPlan {
    from.mesh.updateMatrixWorld(true);
    const sideDot =
      Math.cos(from.mesh.rotation.y) * (to.mesh.position.x - from.mesh.position.x) -
      Math.sin(from.mesh.rotation.y) * (to.mesh.position.z - from.mesh.position.z);
    const throwingHand = sideDot >= 0 ? from.parts.handR : from.parts.handL;
    throwingHand.getWorldPosition(this._handPos);

    const startPos = new THREE.Vector3(
      THREE.MathUtils.lerp(from.mesh.position.x, this._handPos.x, 0.7),
      Math.max(1.02, this._handPos.y + 0.08),
      THREE.MathUtils.lerp(from.mesh.position.z, this._handPos.z, 0.7)
    );

    const rawDist = Math.hypot(to.mesh.position.x - startPos.x, to.mesh.position.z - startPos.z);
    const speedFactor = THREE.MathUtils.clamp(from.stats.accuracy * 14.2, 12.2, 15.6);
    const estTime = THREE.MathUtils.clamp(rawDist / speedFactor, 0.24, 0.62);

    const leadX = THREE.MathUtils.clamp(
      to.mesh.position.x + to.velocity.x * Math.min(0.32, estTime * 0.68),
      -courtW / 2 + 0.45,
      courtW / 2 - 0.45
    );
    const leadZ = THREE.MathUtils.clamp(
      to.mesh.position.z + to.velocity.z * Math.min(0.32, estTime * 0.68),
      -courtD / 2 + 0.45,
      courtD / 2 - 0.45
    );
    const leadTargetPos = new THREE.Vector3(leadX, 1.22, leadZ);
    const passDist = Math.hypot(leadX - startPos.x, leadZ - startPos.z);

    const occluded = contactEngine.isPassLaneOccluded(
      this._fromProbe.set(startPos.x, 1.18, startPos.z),
      this._toProbe.set(leadX, 1.18, leadZ),
      from.team,
      allUnits
    );

    const defenders = allUnits.filter((u) => u.team !== from.team);
    let nearestLineDefDist = 9.0;
    let nearestDefLateralSign = 1;
    const passDirX = (leadX - startPos.x) / Math.max(0.01, passDist);
    const passDirZ = (leadZ - startPos.z) / Math.max(0.01, passDist);
    // Right-handed backspin axis perpendicular to pass travel: (-passDirZ, 0, passDirX)
    const backAxisX = -passDirZ;
    const backAxisZ = passDirX;

    for (const d of defenders) {
      const toDefX = d.mesh.position.x - startPos.x;
      const toDefZ = d.mesh.position.z - startPos.z;
      const proj = THREE.MathUtils.clamp(toDefX * passDirX + toDefZ * passDirZ, 0, passDist);
      const perpX = startPos.x + passDirX * proj - d.mesh.position.x;
      const perpZ = startPos.z + passDirZ * proj - d.mesh.position.z;
      const perpDist = Math.hypot(perpX, perpZ);
      if (perpDist < nearestLineDefDist) {
        nearestLineDefDist = perpDist;
        nearestDefLateralSign = toDefX * -passDirZ + toDefZ * passDirX >= 0 ? 1 : -1;
      }
    }

    const receiverNearRim = to.mesh.position.distanceTo(hoopPos) < 4.3;
    const isMovingQuickly = to.actualSpeed > 3.2;

    let style: OrganicPassStyle = 'CHEST_LASER';
    if (occluded && receiverNearRim && passDist > 3.0) {
      style = 'TOUCH_LOB';
    } else if (occluded && passDist > 2.2) {
      style = 'BOUNCE_THREAD';
    } else if (!occluded && nearestLineDefDist < 1.9 && passDist > 2.8 && isMovingQuickly) {
      style = 'NO_LOOK_WHIP';
    }

    const initialVelocity = new THREE.Vector3();
    const initialSpin = new THREE.Vector3();
    let flightDuration = THREE.MathUtils.clamp(passDist / speedFactor, 0.24, 0.62);
    let summaryLabel = `LASER CHEST PASS → #${to.jerseyNumber} ${to.name}`;

    if (style === 'BOUNCE_THREAD') {
      const e = SURFACE_BOUNCE_E[surface] || 0.76;
      const tHit = flightDuration * 0.54;
      const tPost = flightDuration - tHit;
      const vx = ((leadX - startPos.x) / flightDuration) * 1.03;
      const vz = ((leadZ - startPos.z) / flightDuration) * 1.03;
      const vyNeeded = (BASKET_BALL_RADIUS - startPos.y - 0.5 * BASKET_GRAVITY * tHit * tHit) / tHit;
      const targetReachY = THREE.MathUtils.clamp(
        Math.abs(vyNeeded) * e * tPost + 0.5 * BASKET_GRAVITY * tPost * tPost,
        0.85,
        1.38
      );
      leadTargetPos.y = targetReachY;

      initialVelocity.set(vx, vyNeeded, vz);
      // Forward topspin around orthogonal axis (-backAxis) so bounce skips crisp into hands
      initialSpin.set(-backAxisX * 15.8, (Math.random() - 0.5) * 1.6, -backAxisZ * 15.8);
      summaryLabel = `THREAD BOUNCE PASS → #${to.jerseyNumber} ${to.name}`;
    } else if (style === 'TOUCH_LOB') {
      flightDuration = THREE.MathUtils.clamp(passDist / 9.2 + 0.16, 0.48, 0.88);
      leadTargetPos.y = 1.68;
      const dragComp = 1 + BASKET_AIR_DRAG * flightDuration * 4.2;
      const vx = ((leadX - startPos.x) / flightDuration) * dragComp;
      const vz = ((leadZ - startPos.z) / flightDuration) * dragComp;
      const vy = (leadTargetPos.y - startPos.y - 0.5 * BASKET_GRAVITY * flightDuration * flightDuration) / flightDuration;
      initialVelocity.set(vx, vy, vz);
      initialSpin.set(backAxisX * 13.5, 0, backAxisZ * 13.5);
      summaryLabel = `FEATHER TOUCH LOB → #${to.jerseyNumber} ${to.name}`;
    } else if (style === 'NO_LOOK_WHIP') {
      flightDuration = THREE.MathUtils.clamp(passDist / (speedFactor * 1.06), 0.25, 0.56);
      const curveDir = -nearestDefLateralSign;
      const lateralLeadOffset = curveDir * 0.28;
      const vx = (leadX - startPos.x) / flightDuration + -passDirZ * lateralLeadOffset;
      const vz = (leadZ - startPos.z) / flightDuration + passDirX * lateralLeadOffset;
      const vy = (1.2 - startPos.y - 0.5 * BASKET_GRAVITY * flightDuration * flightDuration) / flightDuration;
      initialVelocity.set(vx, vy, vz);
      initialSpin.set(backAxisX * 9.5, curveDir * 15.0, backAxisZ * 9.5);
      summaryLabel = `NO-LOOK WHIP CURVE → #${to.jerseyNumber} ${to.name}`;
    } else {
      const dragComp = 1 + BASKET_AIR_DRAG * flightDuration * 4.5;
      const vx = ((leadX - startPos.x) / flightDuration) * dragComp;
      const vz = ((leadZ - startPos.z) / flightDuration) * dragComp;
      const vy = (1.24 - startPos.y - 0.5 * BASKET_GRAVITY * flightDuration * flightDuration) / flightDuration;
      initialVelocity.set(vx, vy, vz);
      initialSpin.set(backAxisX * 11.2, (Math.random() - 0.5) * 1.2, backAxisZ * 11.2);
      summaryLabel = `LASER CHEST PASS → #${to.jerseyNumber} ${to.name}`;
    }

    this._toTarget.set(leadX - startPos.x, 0, leadZ - startPos.z);

    return {
      style,
      target: to,
      startPos,
      leadTargetPos,
      initialVelocity,
      initialSpin,
      flightDuration,
      summaryLabel,
    };
  }
}
