import * as THREE from 'three';
import {
  CelebrationStyle,
  IndividualBehaviorPattern,
  KinematicState,
  LegsToFloorTelemetry,
  OrchestratorSnapshot,
  PassingQuality,
  SpriteMatrixUnitSlot,
  SpriteSpecEntry,
  SpriteSpecId,
  Unit,
  UnitOrchestratorRecord,
} from '../../types';
import { HandContactZone } from '../physics/handHitboxSystem';
import { MovementEngine, MovementStepInput } from './movementEngine';
import {
  assignIndividualBehaviorPattern,
  MOVEMENT_REACTION_SPRITE_SPECS,
  solveLegsToFloor,
  SPRITE_SPEC_LIST,
} from './spriteSpecSheet';

interface PassStatsMem {
  passesCompleted: number;
  perfectPasses: number;
  qualitySum: number;
}

export interface PassMatrixEvaluation {
  quality: PassingQuality;
  qualityScore: number; // 0..100
  ratingText: string;
  useOverheadAnim: boolean;
  spreadScale: number;
  flightTimeMult: number;
}

/**
 * MovementOrchestrator
 * Central data-management authority coordinating:
 *  - Movement Matrix & 4x4 Sprite Spec Sheet (16 Movement / Passing / Reaction / Celebration specs)
 *  - Individual Behavior Patterns per Athlete (Movement + Passing + Celebration + Defeat styles)
 *  - Passing Matrix Evaluation & Per-Athlete Pass Telemetry
 *  - Celebration Matrix Choreography & Formation Assignment
 *  - Analytical Legs-to-Floor Grounding Solver & Floor-Contact Telemetry
 */
export class MovementOrchestrator {
  public readonly movementEngine: MovementEngine;

  private readonly behaviorMap = new Map<number, IndividualBehaviorPattern>();
  private readonly passStatsMap = new Map<number, PassStatsMem>();
  private readonly legsTelemetryMap = new Map<number, LegsToFloorTelemetry>();
  private readonly recordsPool: UnitOrchestratorRecord[] = [];
  private readonly snapshot: OrchestratorSnapshot = {
    totalSpecsCount: SPRITE_SPEC_LIST.length,
    activePatternsCount: 0,
    teamAvgPassQualityA: 94,
    teamAvgPassQualityB: 92,
    floorContactAccuracyPct: 100,
    lastCelebrationFormation: 'STAGGERED HUDDLE',
    records: this.recordsPool,
  };

  constructor(scene: THREE.Scene, maxAnisotropy = 4) {
    this.movementEngine = new MovementEngine(scene, maxAnisotropy);
  }

  public getSpecSheet(): SpriteSpecEntry[] {
    return SPRITE_SPEC_LIST;
  }

  public getSpec(id: SpriteSpecId): SpriteSpecEntry {
    return MOVEMENT_REACTION_SPRITE_SPECS[id];
  }

  public registerUnits(units: Unit[]) {
    for (const u of units) {
      this.refreshUnitPattern(u);
      if (!this.passStatsMap.has(u.id)) {
        this.passStatsMap.set(u.id, { passesCompleted: 0, perfectPasses: 0, qualitySum: 0 });
      }
      if (!this.legsTelemetryMap.has(u.id)) {
        this.legsTelemetryMap.set(u.id, {
          hipHeightM: 0.844,
          leftFootFloorGapM: 0,
          rightFootFloorGapM: 0,
          kneeFlexLeftDeg: 18,
          kneeFlexRightDeg: 18,
          plantedFoot: 'BOTH',
          groundClampApplied: false,
        });
      }
    }
    this.snapshot.activePatternsCount = this.behaviorMap.size;
  }

  public refreshUnitPattern(u: Unit): IndividualBehaviorPattern {
    const pattern = assignIndividualBehaviorPattern(u);
    this.behaviorMap.set(u.id, pattern);
    return pattern;
  }

  public getBehaviorPattern(u: Unit): IndividualBehaviorPattern {
    let p = this.behaviorMap.get(u.id);
    if (!p) {
      p = this.refreshUnitPattern(u);
    }
    return p;
  }

  public getLegsTelemetry(unitId: number): LegsToFloorTelemetry | undefined {
    return this.legsTelemetryMap.get(unitId);
  }

  public stepUnit(input: Omit<MovementStepInput, 'behavior'>): {
    dist: number;
    kinematicState: KinematicState;
    activeSpriteId: SpriteSpecId;
  } {
    const behavior = this.getBehaviorPattern(input.unit);
    return this.movementEngine.stepUnitMovement({
      ...input,
      behavior,
    });
  }

  /**
   * Executes the exact trigonometric Legs-to-Floor Formula for an athlete's current pose
   * and stores live floor contact telemetry for the orchestrator data manager.
   */
  public applyLegsToFloor(u: Unit): number {
    let tel = this.legsTelemetryMap.get(u.id);
    if (!tel) {
      tel = {
        hipHeightM: 0.844,
        leftFootFloorGapM: 0,
        rightFootFloorGapM: 0,
        kneeFlexLeftDeg: 18,
        kneeFlexRightDeg: 18,
        plantedFoot: 'BOTH',
        groundClampApplied: false,
      };
      this.legsTelemetryMap.set(u.id, tel);
    }
    return solveLegsToFloor(
      u.parts,
      u.animState,
      u.isJumping,
      u.profile.heightScale || 1.0,
      u.celebrationStyle,
      tel
    );
  }

  /**
   * Passing Matrix: Evaluates Stage 1 pass or Stage 2 set tempo using the athlete's
   * individual PassingPatternId, platform stability, and overhead bias.
   */
  public evaluatePassAttempt(
    unit: Unit,
    hitZone: HandContactZone,
    contactQuality: number,
    timingBonus: number,
    ballHeightY: number
  ): PassMatrixEvaluation {
    const pattern = this.getBehaviorPattern(unit);
    const stabilityBonus = pattern.platformStability * 0.28;
    const rawScore = THREE.MathUtils.clamp(
      (contactQuality * 0.62 + stabilityBonus + timingBonus * 0.35 + (unit.isLibero ? 0.12 : 0)) * 100,
      48,
      100
    );
    const score = Math.round(rawScore);

    let quality: PassingQuality = 'POSITIVE_2';
    if (hitZone === 'PANCAKE_HAND' || score >= 82) {
      quality = 'PERFECT_3';
    } else if (score < 58) {
      quality = 'SCRAMBLE_1';
    }

    let stats = this.passStatsMap.get(unit.id);
    if (!stats) {
      stats = { passesCompleted: 0, perfectPasses: 0, qualitySum: 0 };
      this.passStatsMap.set(unit.id, stats);
    }
    stats.passesCompleted += 1;
    if (quality === 'PERFECT_3') stats.perfectPasses += 1;
    stats.qualitySum += score;

    const useOverheadAnim =
      hitZone === 'OVERHEAD_CUPS' ||
      (ballHeightY > 1.48 && pattern.overheadBias >= 0.45);

    const ratingText =
      hitZone === 'PANCAKE_HAND'
        ? `MIRACLE PANCAKE · ${pattern.passingPattern.replace(/_/g, ' ')}`
        : quality === 'PERFECT_3'
        ? `3-PT ${pattern.passingPattern.replace(/_/g, ' ')} (${score}%)`
        : quality === 'POSITIVE_2'
        ? `2-PT IN-SYSTEM PASS (${score}%)`
        : `1-PT SCRAMBLE SAVE (${score}%)`;

    return {
      quality,
      qualityScore: score,
      ratingText,
      useOverheadAnim,
      spreadScale: pattern.passSpreadScale,
      flightTimeMult: pattern.setTempoMult,
    };
  }

  /**
   * Celebration Matrix: Assigns individual celebration behavior patterns & choreographed
   * formation positioning when a team scores a point, plus individual defeat recovery styles.
   */
  public orchestrateCelebration(
    units: Unit[],
    winnerTeam: 'A' | 'B',
    scoreA: number,
    scoreB: number,
    scorerUnit?: Unit | null
  ): string {
    const huddleZ = winnerTeam === 'A' ? 3.2 : -3.2;
    const rallyParity = (scoreA + scoreB) % 3;
    const formationLabel =
      rallyParity === 0
        ? 'ARC HUDDLE SALUTE'
        : rallyParity === 1
        ? 'HERO SPOTLIGHT V-WEDGE'
        : 'SYNC LINEUP ROAR';

    this.snapshot.lastCelebrationFormation = formationLabel;

    let winIdx = 0;
    for (const u of units) {
      const pattern = this.getBehaviorPattern(u);
      u.reactiveCharge = 0;

      if (u.team === winnerTeam) {
        const isScorer = scorerUnit && scorerUnit.id === u.id;
        u.defeatSlump = false;
        u.animState = 'CELEBRATION';
        u.animTimer = -(winIdx * 0.055);
        // Individual behavior pattern drives primary vs secondary celebration choice
        const style: CelebrationStyle =
          isScorer || rallyParity !== 2
            ? pattern.primaryCelebration
            : pattern.secondaryCelebration;
        u.celebrationStyle = style;
        u.celebrationPhase = winIdx * 0.68 * pattern.celebrationTempoMult;

        if (!u.isJumping && style !== 'KNEE_SLIDE_ROAR') {
          u.isJumping = true;
          u.yVel = 2.45 + pattern.jumpImpulseBoost + (winIdx % 2) * 0.35;
        }

        const arcAngle =
          rallyParity === 1
            ? -Math.PI * 0.65 + (winIdx / 5) * (Math.PI * 1.3)
            : -Math.PI * 0.8 + (winIdx / 5) * (Math.PI * 1.6);
        const radius =
          (isScorer ? 1.1 : winIdx % 2 === 0 ? 1.48 : 1.98) + pattern.huddleRadiusBias;
        u.targetPos.set(
          Math.sin(arcAngle) * radius,
          0,
          huddleZ + Math.cos(arcAngle) * 1.15
        );
        winIdx++;
      } else {
        u.defeatSlump = true;
        u.animState = 'READY_STANCE';
        u.animTimer = 0;
      }
    }

    return formationLabel;
  }

  public notifyOpponentContact(receivingTeam: 'A' | 'B') {
    this.movementEngine.notifyOpponentContact(receivingTeam);
  }

  public triggerManualDive(u: Unit, dirX: number, dirZ: number) {
    this.movementEngine.triggerManualDive(u, dirX, dirZ);
  }

  public triggerLongJump(u: Unit, dirX: number, dirZ: number, charge = 0.7) {
    this.movementEngine.triggerLongJump(u, dirX, dirZ, charge);
  }

  public setSpritesVisible(visible: boolean) {
    this.movementEngine.setSpritesVisible(visible);
  }

  public isSpritesVisible(): boolean {
    return this.movementEngine.isSpritesVisible();
  }

  public getMatrixSnapshot(units: Unit[]): SpriteMatrixUnitSlot[] {
    const slots = this.movementEngine.getMatrixSnapshot(units);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const u = units[i];
      if (u) {
        const pat = this.getBehaviorPattern(u);
        slot.movementPattern = pat.movementPattern;
        slot.passingPattern = pat.passingPattern;
      }
    }
    return slots;
  }

  public getOrchestratorSnapshot(units: Unit[]): OrchestratorSnapshot {
    this.recordsPool.length = 0;
    let sumA = 0;
    let cntA = 0;
    let sumB = 0;
    let cntB = 0;
    let flushGroundCount = 0;
    let groundedTotal = 0;

    for (const u of units) {
      const pattern = this.getBehaviorPattern(u);
      const spriteInfo = this.movementEngine.getUnitSpriteCell(u.id);
      const spec = MOVEMENT_REACTION_SPRITE_SPECS[spriteInfo.activeSpriteId];
      const passMem = this.passStatsMap.get(u.id) || {
        passesCompleted: 0,
        perfectPasses: 0,
        qualitySum: 0,
      };
      const avgPass =
        passMem.passesCompleted > 0
          ? Math.round(passMem.qualitySum / passMem.passesCompleted)
          : Math.round(pattern.platformStability * 100);

      if (u.team === 'A') {
        sumA += avgPass;
        cntA++;
      } else {
        sumB += avgPass;
        cntB++;
      }

      const legs = this.legsTelemetryMap.get(u.id) || {
        hipHeightM: 0.844,
        leftFootFloorGapM: 0,
        rightFootFloorGapM: 0,
        kneeFlexLeftDeg: 18,
        kneeFlexRightDeg: 18,
        plantedFoot: 'BOTH' as const,
        groundClampApplied: false,
      };

      if (!u.isJumping && legs.plantedFoot !== 'AIR') {
        groundedTotal++;
        const minGap = Math.min(legs.leftFootFloorGapM, legs.rightFootFloorGapM);
        if (minGap <= 0.015 || legs.groundClampApplied) {
          flushGroundCount++;
        }
      }

      this.recordsPool.push({
        unitId: u.id,
        playerName: u.name,
        jerseyNumber: u.jerseyNumber,
        team: u.team,
        role: u.role,
        movementPattern: pattern.movementPattern,
        passingPattern: pattern.passingPattern,
        celebrationStyle: u.celebrationStyle || pattern.primaryCelebration,
        activeSpriteId: spec.id,
        spriteSpecLabel: spec.label,
        spriteCol: spec.atlasCol,
        spriteRow: spec.atlasRow,
        passesCompleted: passMem.passesCompleted,
        perfectPasses: passMem.perfectPasses,
        passingAvgQuality: avgPass,
        legsToFloor: legs,
      });
    }

    this.snapshot.activePatternsCount = this.behaviorMap.size;
    this.snapshot.teamAvgPassQualityA = cntA > 0 ? Math.round(sumA / cntA) : 94;
    this.snapshot.teamAvgPassQualityB = cntB > 0 ? Math.round(sumB / cntB) : 92;
    this.snapshot.floorContactAccuracyPct =
      groundedTotal > 0 ? Math.round((flushGroundCount / groundedTotal) * 100) : 100;

    return this.snapshot;
  }

  public dispose() {
    this.movementEngine.dispose();
  }
}
