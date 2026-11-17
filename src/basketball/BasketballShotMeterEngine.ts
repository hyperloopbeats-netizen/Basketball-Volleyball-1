import * as THREE from 'three';
import { TimingGrade } from '../types';
import {
  BASKET_AIR_DRAG,
  BASKET_GRAVITY,
  BASKET_MAGNUS_COEFF,
  BasketShotPreview,
  BasketUnit,
  SlideShotMeterEngineState,
} from './basketballTypes';

const BASE_BACKSPIN_RAD = 15.8;

export interface ShotTrajectorySolution {
  releaseOrigin: THREE.Vector3;
  targetPoint: THREE.Vector3;
  initialVelocity: THREE.Vector3;
  initialSpin: THREE.Vector3;
  flightTime: number;
  releaseAngleDeg: number;
  entryAngleDeg: number;
  flightApexM: number;
  makeProbPct: number;
  predictedShotLabel: string;
  previewType: BasketShotPreview;
  distanceFt: number;
  contestPct: number;
  sweetSpotStart: number;
  sweetSpotEnd: number;
  sweetCenter: number;
}

export interface ReleasedJumpShotResult {
  chargeLevel: number;
  grade: TimingGrade;
  gradeMultiplier: number;
  solution: ShotTrajectorySolution;
  willSwish: boolean;
}

/**
 * BasketballShotMeterEngine
 * Biomechanical & fluid-spring engine driving the Slide Pop-Up Liquid Glass Shooting Meter:
 * - Immediate release at ANY slider speed / power level (0.04..1.0) and accuracy level upon button release
 * - 2-pass exact 3D aerodynamic ballistic solver (Unified Gravity + 3D Quadratic Air Drag + 3D Magnus ω × v)
 * - Continuous speed/power & accuracy dispersion instead of canned coin-flip miss offsets
 */
export class BasketballShotMeterEngine {
  private state: SlideShotMeterEngineState = {
    isExpanded: false,
    stage: 'IDLE',
    sliderValue: 0.08,
    liquidLevel: 0.08,
    liquidVelocity: 0,
    wavePhase: 0,
    sweetSpotStart: 0.64,
    sweetSpotEnd: 0.84,
    releaseAngleDeg: 47,
    entryAngleDeg: 44,
    distanceFt: 18,
    contestPct: 0,
    makeProbPct: 72,
    predictedShotLabel: 'MID PULL-UP',
    gradeFlashTimer: 0,
  };

  private manualDragActive = false;
  private apexHoldTimer = 0;

  // Pooled 3D arc preview points (24 samples, zero-GC in loop)
  public readonly previewPoints: THREE.Vector3[] = Array.from({ length: 24 }, () => new THREE.Vector3());

  // Scratch vectors (zero-GC)
  private readonly _origin = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _vel = new THREE.Vector3();
  private readonly _spin = new THREE.Vector3();
  private readonly _simPos = new THREE.Vector3();
  private readonly _simVel = new THREE.Vector3();
  private readonly _simSpin = new THREE.Vector3();
  private readonly _magnus = new THREE.Vector3();
  private readonly _missErr = new THREE.Vector3();

  private lastSolution: ShotTrajectorySolution = {
    releaseOrigin: new THREE.Vector3(),
    targetPoint: new THREE.Vector3(),
    initialVelocity: new THREE.Vector3(),
    initialSpin: new THREE.Vector3(),
    flightTime: 0.78,
    releaseAngleDeg: 47,
    entryAngleDeg: 44,
    flightApexM: 4.1,
    makeProbPct: 72,
    predictedShotLabel: 'MID PULL-UP',
    previewType: 'MID_1PT',
    distanceFt: 18,
    contestPct: 0,
    sweetSpotStart: 0.64,
    sweetSpotEnd: 0.84,
    sweetCenter: 0.74,
  };

  public isActive(): boolean {
    return this.state.isExpanded && this.state.stage !== 'IDLE' && this.state.stage !== 'RELEASED';
  }

  public getState(): SlideShotMeterEngineState {
    return this.state;
  }

  public getLastSolution(): ShotTrajectorySolution {
    return this.lastSolution;
  }

  public beginGather(initialSlide = 0.14) {
    this.manualDragActive = false;
    this.apexHoldTimer = 0;
    this.state.isExpanded = true;
    this.state.stage = 'GATHERING';
    this.state.sliderValue = THREE.MathUtils.clamp(initialSlide, 0.04, 0.98);
    this.state.liquidLevel = this.state.sliderValue * 0.88;
    this.state.liquidVelocity = 1.6;
    this.state.gradeFlashTimer = 0;
  }

  public setManualSlideLevel(normalized01: number) {
    if (!this.isActive()) return;
    this.manualDragActive = true;
    this.apexHoldTimer = 0;
    this.state.stage = 'SLIDING';
    const clamped = THREE.MathUtils.clamp(normalized01, 0.04, 1.0);
    const prev = this.state.sliderValue;
    this.state.sliderValue = clamped;
    this.state.liquidVelocity += (clamped - prev) * 14.0;
    if (clamped >= 0.94) {
      this.state.stage = 'APEX_HOLD';
    }
  }

  public cancel() {
    this.manualDragActive = false;
    this.apexHoldTimer = 0;
    this.state.isExpanded = false;
    this.state.stage = 'IDLE';
    this.state.sliderValue = 0.08;
    this.state.liquidLevel = 0.08;
    this.state.liquidVelocity = 0;
  }

  public update(
    dt: number,
    shooter: BasketUnit | null,
    defenders: BasketUnit[],
    hoopPos: THREE.Vector3,
    outsideArc: boolean,
    flowMeter: number,
    onAutoTopRelease?: () => void
  ) {
    if (this.state.gradeFlashTimer > 0) {
      this.state.gradeFlashTimer = Math.max(0, this.state.gradeFlashTimer - dt);
    }

    if (!this.isActive() || !shooter) {
      if (this.state.isExpanded && this.state.stage === 'IDLE') {
        this.state.isExpanded = false;
      }
      return;
    }

    // 1. Auto-sweep smoothly when holding Space/Button without manual slide drag
    if (!this.manualDragActive) {
      if (this.state.stage === 'GATHERING' && this.state.sliderValue > 0.2) {
        this.state.stage = 'SLIDING';
      }
      const sweepRate = 1.06 + (shooter.stats.accuracy - 0.85) * 0.14;
      this.state.sliderValue = THREE.MathUtils.clamp(this.state.sliderValue + dt * sweepRate, 0.04, 1.0);
      if (this.state.sliderValue >= 0.992) {
        this.state.stage = 'APEX_HOLD';
        this.apexHoldTimer += dt;
        // Allow generous apex hold before auto-releasing when holding Spacebar at max
        if (this.apexHoldTimer >= 0.36 && onAutoTopRelease) {
          onAutoTopRelease();
          return;
        }
      }
    }

    // 2. Second-order spring kinematics for Liquid Glass meniscus
    const stiffness = 140;
    const damping = 16;
    const springF = -stiffness * (this.state.liquidLevel - this.state.sliderValue);
    const dampF = -damping * this.state.liquidVelocity;
    this.state.liquidVelocity += (springF + dampF) * dt;
    this.state.liquidLevel = THREE.MathUtils.clamp(
      this.state.liquidLevel + this.state.liquidVelocity * dt,
      0.02,
      1.0
    );
    this.state.wavePhase += dt * (7.5 + Math.abs(this.state.liquidVelocity) * 6.5);

    // 3. Solve live aerodynamic trajectory envelope + 3D preview curve points
    this.solveTrajectoryEnvelope(shooter, defenders, hoopPos, outsideArc, flowMeter, this.state.sliderValue);
  }

  /**
   * Shared exact 3D aerodynamic step matching BasketballBounceSystem.stepAirborneBallPhysics:
   * Gravity + 3D Quadratic Air Drag + 3D Magnus cross product (ω × v) + Spin decay.
   */
  private simulateAerodynamicStep(pos: THREE.Vector3, vel: THREE.Vector3, spin: THREE.Vector3, dt: number) {
    const spd = vel.length();
    if (spd > 0.05) {
      const dragFactor = BASKET_AIR_DRAG * spd * dt;
      vel.x -= vel.x * dragFactor;
      vel.y -= vel.y * dragFactor;
      vel.z -= vel.z * dragFactor;
    }

    // 3D Magnus force: C_M * (ω × v)
    this._magnus.crossVectors(spin, vel);
    vel.x += this._magnus.x * BASKET_MAGNUS_COEFF * dt;
    vel.y += (BASKET_GRAVITY + this._magnus.y * BASKET_MAGNUS_COEFF) * dt;
    vel.z += this._magnus.z * BASKET_MAGNUS_COEFF * dt;

    pos.addScaledVector(vel, dt);
    spin.multiplyScalar(Math.max(0, 1 - 0.14 * dt));
  }

  public solveTrajectoryEnvelope(
    shooter: BasketUnit,
    defenders: BasketUnit[],
    hoopPos: THREE.Vector3,
    outsideArc: boolean,
    flowMeter: number,
    charge01: number
  ): ShotTrajectorySolution {
    const horizDistM = Math.hypot(shooter.mesh.position.x - hoopPos.x, shooter.mesh.position.z - hoopPos.z);
    const distanceFt = Number((horizDistM * 3.28084).toFixed(1));

    let nearestDefDist = 9.0;
    for (let i = 0; i < defenders.length; i++) {
      const d = defenders[i].mesh.position.distanceTo(shooter.mesh.position);
      if (d < nearestDefDist) nearestDefDist = d;
    }

    const contestPct = Math.round(
      THREE.MathUtils.clamp((1 - (nearestDefDist - 0.72) / 2.35) * 94, 0, 95)
    );

    // Dynamic Sweet Spot Calibration from range, Flow heat, and closeout contest
    const flowBonus = THREE.MathUtils.clamp(flowMeter / 100, 0, 1) * 0.055;
    const rangeShrink = THREE.MathUtils.clamp((horizDistM - 4.0) * 0.008, 0, 0.055);
    const contestShrink = (contestPct / 100) * 0.055;
    const windowHalf = THREE.MathUtils.clamp(0.115 + flowBonus - rangeShrink - contestShrink, 0.055, 0.165);
    const sweetCenter = THREE.MathUtils.clamp(0.74 + (horizDistM - 6.0) * 0.011, 0.67, 0.83);
    const sweetSpotStart = Number((sweetCenter - windowHalf).toFixed(3));
    const sweetSpotEnd = Number((sweetCenter + windowHalf).toFixed(3));

    let previewType: BasketShotPreview = 'MID_1PT';
    let predictedShotLabel = 'MID PULL-UP';
    if (horizDistM < 3.45 && shooter.mesh.position.z < 0.25 && charge01 >= 0.38) {
      previewType = 'POSTER_DUNK';
      predictedShotLabel = 'POSTER DUNK';
    } else if (horizDistM < 4.55) {
      previewType = 'LAYUP';
      predictedShotLabel =
        charge01 < 0.34
          ? 'QUICK FLOATER'
          : contestPct > 45
          ? 'CONTESTED FINGER ROLL'
          : 'EURO LAYUP';
    } else if (outsideArc) {
      previewType = 'ARC_2PT';
      predictedShotLabel =
        horizDistM > 8.6 ? 'LOGO DEEP +2' : contestPct > 42 ? 'STEPBACK 2PT' : 'PURE ARC +2';
    } else {
      previewType = 'MID_1PT';
      predictedShotLabel = contestPct > 42 ? 'FADEAWAY J' : 'SILK PULL-UP';
    }

    // Release pocket lifts naturally with release charge
    shooter.parts.handR.getWorldPosition(this._origin);
    const gatherLift = THREE.MathUtils.lerp(1.88, 2.38, THREE.MathUtils.clamp(charge01, 0, 1));
    this._origin.set(
      THREE.MathUtils.lerp(shooter.mesh.position.x, this._origin.x, 0.52),
      Math.max(gatherLift, this._origin.y + 0.24),
      THREE.MathUtils.lerp(shooter.mesh.position.z, this._origin.z, 0.52)
    );
    this._target.copy(hoopPos);

    // 1. Solve EXACT baseline velocity passing cleanly through rim center under full 3D drag + 3D Magnus
    const dx = this._target.x - this._origin.x;
    const dz = this._target.z - this._origin.z;
    const dy = this._target.y - this._origin.y;
    const hLen = Math.max(0.05, Math.hypot(dx, dz));
    const dirX = dx / hLen;
    const dirZ = dz / hLen;

    const idealFlightTime = THREE.MathUtils.clamp(0.56 + horizDistM * 0.072, 0.54, 1.32);
    // True right-handed backspin vector orthogonal to travel direction: ω_back = (-dirZ, 0, dirX) * ω_mag
    const backspinMag = BASE_BACKSPIN_RAD * THREE.MathUtils.lerp(0.68, 1.16, charge01);
    this._spin.set(-dirZ * backspinMag, 0, dirX * backspinMag);

    // Initial vacuum ballistic guess
    this._vel.set(
      dx / idealFlightTime,
      (dy - 0.5 * BASKET_GRAVITY * idealFlightTime * idealFlightTime) / idealFlightTime,
      dz / idealFlightTime
    );

    // 3 quick zero-GC shooting-method correction passes so sweet-center flight hits rim center accurately
    const subSteps = 23;
    const baseSubDt = idealFlightTime / subSteps;
    for (let iter = 0; iter < 3; iter++) {
      this._simPos.copy(this._origin);
      this._simVel.copy(this._vel);
      this._simSpin.copy(this._spin);
      for (let s = 0; s < subSteps; s++) {
        this.simulateAerodynamicStep(this._simPos, this._simVel, this._simSpin, baseSubDt);
      }
      this._missErr.subVectors(this._target, this._simPos);
      this._vel.x += (this._missErr.x / idealFlightTime) * 0.94;
      this._vel.y += (this._missErr.y / idealFlightTime) * 0.94;
      this._vel.z += (this._missErr.z / idealFlightTime) * 0.94;
    }

    // 2. Continuously scale release speed & loft angle by actual slider/release charge!
    // No frozen/static destination: low charge drops short onto front rim/floor; high charge rides long/glass!
    const distFromSweet = charge01 - sweetCenter;
    let speedScale = 1.0;
    let pitchDeltaRad = 0;
    if (distFromSweet < 0) {
      const earlyNorm = THREE.MathUtils.clamp(-distFromSweet / Math.max(0.15, sweetCenter), 0, 1);
      // Smooth continuous falloff: within sweet spot (<0.12) stays tight; quick taps (~0.08..0.3) drop physically short
      speedScale = 1.0 - Math.pow(earlyNorm, 1.15) * 0.24;
      pitchDeltaRad = -earlyNorm * 0.085;
    } else {
      const lateNorm = THREE.MathUtils.clamp(distFromSweet / Math.max(0.12, 1.0 - sweetCenter), 0, 1);
      speedScale = 1.0 + Math.pow(lateNorm, 1.1) * 0.145;
      pitchDeltaRad = lateNorm * 0.062;
    }

    // Apply continuous pitch tilt & speed scale around the horizontal travel axis
    const baseHoriz = Math.hypot(this._vel.x, this._vel.z);
    const basePitch = Math.atan2(this._vel.y, Math.max(0.05, baseHoriz));
    const baseSpeed = this._vel.length();
    const newPitch = THREE.MathUtils.clamp(basePitch + pitchDeltaRad, 0.24, 1.12);
    const newSpeed = baseSpeed * speedScale;
    const newHoriz = Math.cos(newPitch) * newSpeed;
    this._vel.set(dirX * newHoriz, Math.sin(newPitch) * newSpeed, dirZ * newHoriz);

    const flightTime = THREE.MathUtils.clamp(idealFlightTime + distFromSweet * 0.14, 0.48, 1.38);
    const releaseAngleDeg = Math.round(THREE.MathUtils.radToDeg(newPitch));

    // 3. Trace live 24-point trajectory preview using exact continuous aerodynamics
    this._simPos.copy(this._origin);
    this._simVel.copy(this._vel);
    this._simSpin.copy(this._spin);
    let maxApex = this._origin.y;
    const simStepDt = flightTime / 23;
    this.previewPoints[0].copy(this._simPos);
    for (let s = 1; s < 24; s++) {
      this.simulateAerodynamicStep(this._simPos, this._simVel, this._simSpin, simStepDt);
      if (this._simPos.y > maxApex) maxApex = this._simPos.y;
      this.previewPoints[s].copy(this._simPos);
    }

    // Track projected target impact point from preview for HUD reticle / ring
    this._target.copy(this.previewPoints[23]);

    const entryHoriz = Math.max(0.1, Math.hypot(this._simVel.x, this._simVel.z));
    const entryAngleDeg = Math.round(
      THREE.MathUtils.radToDeg(Math.atan2(Math.max(0.2, -this._simVel.y), entryHoriz))
    );

    // Calibrated probability HUD readout
    const inSweet = charge01 >= sweetSpotStart && charge01 <= sweetSpotEnd;
    const inGreat = charge01 >= sweetSpotStart - 0.13 && charge01 <= sweetSpotEnd + 0.11;
    const timingBonus = inSweet ? 0.36 : inGreat ? 0.14 : -Math.min(0.45, Math.abs(distFromSweet) * 0.72);
    const baseAcc = (shooter.stats.accuracy - 0.85) * 0.5 + 0.6;
    const flowAccBonus = THREE.MathUtils.clamp(flowMeter / 100, 0, 1) * 0.08;
    const contestPen = (contestPct / 100) * 0.28;
    const makeProb = THREE.MathUtils.clamp(baseAcc + timingBonus + flowAccBonus - contestPen, 0.08, 0.98);

    this.state.sweetSpotStart = sweetSpotStart;
    this.state.sweetSpotEnd = sweetSpotEnd;
    this.state.releaseAngleDeg = releaseAngleDeg;
    this.state.entryAngleDeg = entryAngleDeg;
    this.state.distanceFt = distanceFt;
    this.state.contestPct = contestPct;
    this.state.makeProbPct = Math.round(makeProb * 100);
    this.state.predictedShotLabel = predictedShotLabel;

    this.lastSolution.releaseOrigin.copy(this._origin);
    this.lastSolution.targetPoint.copy(this._target);
    this.lastSolution.initialVelocity.copy(this._vel);
    this.lastSolution.initialSpin.copy(this._spin);
    this.lastSolution.flightTime = flightTime;
    this.lastSolution.releaseAngleDeg = releaseAngleDeg;
    this.lastSolution.entryAngleDeg = entryAngleDeg;
    this.lastSolution.flightApexM = Number(maxApex.toFixed(2));
    this.lastSolution.makeProbPct = this.state.makeProbPct;
    this.lastSolution.predictedShotLabel = predictedShotLabel;
    this.lastSolution.previewType = previewType;
    this.lastSolution.distanceFt = distanceFt;
    this.lastSolution.contestPct = contestPct;
    this.lastSolution.sweetSpotStart = sweetSpotStart;
    this.lastSolution.sweetSpotEnd = sweetSpotEnd;
    this.lastSolution.sweetCenter = sweetCenter;

    return this.lastSolution;
  }

  /**
   * Executes shot release immediately at ANY release speed/power (0.04..1.0) and accuracy level.
   * Physical angular scatter & speed dispersion scale smoothly from shooter accuracy, fatigue, contest %, and timing.
   */
  public release(
    shooter: BasketUnit,
    defenders: BasketUnit[],
    hoopPos: THREE.Vector3,
    outsideArc: boolean,
    flowMeter: number,
    overrideCharge?: number
  ): ReleasedJumpShotResult {
    const rawCharge =
      typeof overrideCharge === 'number'
        ? THREE.MathUtils.clamp(overrideCharge, 0.04, 1.0)
        : THREE.MathUtils.clamp(this.state.sliderValue, 0.04, 1.0);

    const sol = this.solveTrajectoryEnvelope(shooter, defenders, hoopPos, outsideArc, flowMeter, rawCharge);

    const inSweet = rawCharge >= sol.sweetSpotStart && rawCharge <= sol.sweetSpotEnd;
    const inGreat = rawCharge >= sol.sweetSpotStart - 0.13 && rawCharge <= sol.sweetSpotEnd + 0.11;
    const grade: TimingGrade = inSweet
      ? 'PERFECT'
      : inGreat
      ? 'GREAT'
      : rawCharge < sol.sweetSpotStart
      ? 'EARLY'
      : 'LATE';

    const gradeMultiplier = grade === 'PERFECT' ? 1.15 : grade === 'GREAT' ? 1.0 : 0.85;

    // Continuous physical dispersion (yaw / pitch / speed perturbation) from shooter accuracy, contest & fatigue
    const accInaccuracy = Math.max(0.015, 1.0 - THREE.MathUtils.clamp(shooter.stats.accuracy, 0.45, 0.99));
    const contestFactor = (sol.contestPct / 100) * 0.042;
    const fatigueFactor = THREE.MathUtils.clamp((100 - shooter.stamina) / 100, 0, 1) * 0.018;
    const timingScatter = inSweet ? 0.18 : inGreat ? 0.55 : 0.92;
    const yawSigma = (accInaccuracy * 0.095 + contestFactor + fatigueFactor) * timingScatter;
    const speedSigma = (accInaccuracy * 0.055 + contestFactor * 0.65) * timingScatter;

    // Gaussian-like centered random (-1..1) from sum of two uniforms
    const randCentered = () => Math.random() - Math.random();
    const yawJitter = randCentered() * yawSigma;
    const pitchJitter = randCentered() * yawSigma * 0.55;
    const speedJitter = 1.0 + randCentered() * speedSigma;

    const v = sol.initialVelocity;
    const horizSpd = Math.max(0.05, Math.hypot(v.x, v.z));
    const baseYaw = Math.atan2(v.x, v.z);
    const basePitch = Math.atan2(v.y, horizSpd);
    const spd = v.length() * speedJitter;
    const finalPitch = THREE.MathUtils.clamp(basePitch + pitchJitter, 0.18, 1.15);
    const finalYaw = baseYaw + yawJitter;
    const finalHoriz = Math.cos(finalPitch) * spd;

    v.set(Math.sin(finalYaw) * finalHoriz, Math.sin(finalPitch) * spd, Math.cos(finalYaw) * finalHoriz);

    // Subtle organic wrist-release spin imperfection
    sol.initialSpin.y += randCentered() * (1.2 + contestFactor * 35);
    sol.initialSpin.z += randCentered() * 0.8;

    const willSwish = inSweet && sol.contestPct < 45 && Math.abs(yawJitter) < 0.014;

    this.manualDragActive = false;
    this.apexHoldTimer = 0;
    this.state.isExpanded = false;
    this.state.stage = 'IDLE';
    this.state.gradeFlashTimer = 1.4;
    this.state.liquidVelocity = 0;

    return {
      chargeLevel: rawCharge,
      grade,
      gradeMultiplier,
      solution: sol,
      willSwish,
    };
  }
}
