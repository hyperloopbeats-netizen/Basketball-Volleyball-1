import * as THREE from 'three';
import {
  DefensiveStrategy,
  PossibilityNode,
  SpatialNotification,
  TacticalPlay,
  Unit,
  VectorPhase,
} from '../../types';

export interface SpatialAssessment {
  minTeammateDist: number;
  avgVoronoiSpread: number;
  overlapCount: number;
  selfPropagatingEnergy: number;
  possibilities: PossibilityNode[];
  recommendedAimXZ: { x: number; z: number };
}

interface FloorGridCell {
  vx: number;
  vz: number;
  energy: number;
  phase: VectorPhase;
}

/**
 * SpatialAwarenessMatrix
 * 1) Maintains a 12x24 Self-Propagating Floor Spatial Grid (9m x 18m court, 0.75m resolution)
 *    that diffuses walk, stand, jump, approach, and dive momentum across neighboring court cells.
 * 2) Assigns complex Floor Spatial Notifications anchored to exact grid coordinates (gridX, gridZ) & FIVB zones.
 * 3) Evaluates the 6-branch Sentient Possibility Grid simultaneously against blocker & coverage seams.
 */
export class SpatialAwarenessMatrix {
  private readonly minSafeSpacing = 1.38;
  private readonly cols = 12;
  private readonly rows = 24;
  private readonly courtWidth = 9.0;
  private readonly courtLength = 18.0;

  private grid: FloorGridCell[];
  private scratchGrid: FloorGridCell[];
  private lastPhaseByUnit = new Map<number, VectorPhase>();
  private lastNotifTimeByUnit = new Map<number, number>();
  private notifications: SpatialNotification[] = [];
  private totalGridEnergy = 0.25;

  constructor() {
    const count = this.cols * this.rows;
    this.grid = Array.from({ length: count }, () => ({
      vx: 0,
      vz: 0,
      energy: 0,
      phase: 'STAND' as VectorPhase,
    }));
    this.scratchGrid = Array.from({ length: count }, () => ({
      vx: 0,
      vz: 0,
      energy: 0,
      phase: 'STAND' as VectorPhase,
    }));
  }

  public worldToGrid(x: number, z: number): { gx: number; gz: number; idx: number } {
    const nx = THREE.MathUtils.clamp((x + this.courtWidth * 0.5) / this.courtWidth, 0, 0.999);
    const nz = THREE.MathUtils.clamp((z + this.courtLength * 0.5) / this.courtLength, 0, 0.999);
    const gx = Math.floor(nx * this.cols);
    const gz = Math.floor(nz * this.rows);
    return { gx, gz, idx: gz * this.cols + gx };
  }

  public deriveVectorPhase(u: Unit): VectorPhase {
    if (u.animState === 'DIVE_PANCAKE') return 'DIG';
    if (u.animState === 'BLOCK_ROOF') return 'BLOCK';
    if (u.animState === 'SPIKE_SWING' || u.animState === 'SERVE_JUMP') return 'STRIKE';
    if (u.isJumping || u.animState === 'SPIKE_WINDUP' || u.animState === 'LANDING_ABSORB') return 'JUMP';
    if (u.animState === 'APPROACH_3STEP') return 'APPROACH';
    if (u.actualSpeed >= 2.2) return 'RUN';
    if (u.actualSpeed >= 0.25) return 'WALK';
    return 'STAND';
  }

  /**
   * Self-propagating internal matrix step:
   * Injects each athlete's walk / stand / jump / strike vector into their floor cell,
   * diffuses 36% of directional vectors to 4-connected neighbors, and fires spatial grid notifications.
   */
  public stepSelfPropagatingGrid(units: Unit[], dt: number) {
    const now = performance.now();

    for (const u of units) {
      const { gx, gz, idx } = this.worldToGrid(u.mesh.position.x, u.mesh.position.z);
      const phase = this.deriveVectorPhase(u);
      const cell = this.grid[idx];

      const impulseGain =
        phase === 'JUMP' || phase === 'STRIKE' || phase === 'BLOCK'
          ? 1.0
          : phase === 'APPROACH' || phase === 'RUN'
          ? 0.72
          : phase === 'WALK'
          ? 0.42
          : 0.16;

      cell.vx = THREE.MathUtils.lerp(cell.vx, u.velocity.x, 0.45);
      cell.vz = THREE.MathUtils.lerp(cell.vz, u.velocity.z, 0.45);
      cell.energy = Math.min(1.0, Math.max(cell.energy, impulseGain));
      cell.phase = phase;

      // Trigger rich Floor-Grid Spatial Notification on meaningful kinematic phase changes
      const prevPhase = this.lastPhaseByUnit.get(u.id);
      const lastTime = this.lastNotifTimeByUnit.get(u.id) || 0;
      const isHighEvent = phase === 'JUMP' || phase === 'STRIKE' || phase === 'BLOCK' || phase === 'DIG' || phase === 'APPROACH';
      const isLocomotionShift = phase !== prevPhase && (phase === 'WALK' || phase === 'STAND' || isHighEvent);

      if (isLocomotionShift && (isHighEvent ? now - lastTime > 520 : now - lastTime > 1500)) {
        this.lastPhaseByUnit.set(u.id, phase);
        this.lastNotifTimeByUnit.set(u.id, now);
        this.pushSpatialNotification(u, gx, gz, phase, cell.energy);
      } else {
        this.lastPhaseByUnit.set(u.id, phase);
      }
    }

    // 4-Neighbor Self-Propagation Diffusion Pass
    const decay = Math.exp(-2.8 * Math.min(dt, 0.05));
    const diffuse = 0.36;
    let energySum = 0;

    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const idx = z * this.cols + x;
        const c = this.grid[idx];
        let sumVx = c.vx * (1 - diffuse);
        let sumVz = c.vz * (1 - diffuse);
        let sumE = c.energy * (1 - diffuse);

        let nCount = 0;
        let nVx = 0;
        let nVz = 0;
        let nE = 0;

        if (x > 0) {
          const nb = this.grid[idx - 1];
          nVx += nb.vx; nVz += nb.vz; nE += nb.energy; nCount++;
        }
        if (x < this.cols - 1) {
          const nb = this.grid[idx + 1];
          nVx += nb.vx; nVz += nb.vz; nE += nb.energy; nCount++;
        }
        if (z > 0) {
          const nb = this.grid[idx - this.cols];
          nVx += nb.vx; nVz += nb.vz; nE += nb.energy; nCount++;
        }
        if (z < this.rows - 1) {
          const nb = this.grid[idx + this.cols];
          nVx += nb.vx; nVz += nb.vz; nE += nb.energy; nCount++;
        }

        if (nCount > 0) {
          sumVx += (nVx / nCount) * diffuse;
          sumVz += (nVz / nCount) * diffuse;
          sumE += (nE / nCount) * diffuse;
        }

        const dst = this.scratchGrid[idx];
        dst.vx = sumVx * decay;
        dst.vz = sumVz * decay;
        dst.energy = Math.min(1.0, sumE * decay);
        dst.phase = c.phase;
        energySum += dst.energy;
      }
    }

    // Swap ping-pong buffers without allocating memory
    const tmp = this.grid;
    this.grid = this.scratchGrid;
    this.scratchGrid = tmp;
    this.totalGridEnergy = Number(Math.min(1, energySum / 32).toFixed(2));
  }

  public sampleFlowAt(x: number, z: number): { vx: number; vz: number; energy: number; phase: VectorPhase } {
    const { idx } = this.worldToGrid(x, z);
    const cell = this.grid[idx];
    return {
      vx: cell.vx,
      vz: cell.vz,
      energy: cell.energy,
      phase: cell.phase,
    };
  }

  private pushSpatialNotification(
    u: Unit,
    gx: number,
    gz: number,
    phase: VectorPhase,
    flowEnergy: number
  ) {
    const velMag = Number(u.actualSpeed.toFixed(1));
    const phaseLabel =
      phase === 'JUMP'
        ? 'VERTICAL LAUNCH'
        : phase === 'STRIKE'
        ? 'APEX STRIKE VECTOR'
        : phase === 'BLOCK'
        ? 'NET ROOF SEAL'
        : phase === 'DIG'
        ? 'PLATFORM INTERCEPT'
        : phase === 'APPROACH'
        ? '3-STEP RUNWAY'
        : phase === 'RUN'
        ? 'SPRINT PURSUIT'
        : phase === 'WALK'
        ? 'FLUID GLIDE WALK'
        : 'BALANCED STAND';

    const detail = `Z${u.rotationZone} Grid(${gx},${gz}) · ${velMag} m/s · Matrix ${(flowEnergy * 100).toFixed(0)}%`;

    this.notifications.unshift({
      id: `${u.id}-${Date.now()}`,
      unitId: u.id,
      playerName: u.name,
      jerseyNumber: u.jerseyNumber,
      team: u.team,
      zone: u.rotationZone,
      vectorPhase: phase,
      gridX: gx,
      gridZ: gz,
      velMag,
      flowEnergy: Number(flowEnergy.toFixed(2)),
      label: `${u.name} #${u.jerseyNumber} · ${phaseLabel}`,
      detail,
      timestamp: Date.now(),
    });

    if (this.notifications.length > 10) {
      this.notifications.length = 10;
    }
  }

  public getRecentNotifications(): SpatialNotification[] {
    return this.notifications;
  }

  public evaluateGrid(
    units: Unit[],
    attackingTeam: 'A' | 'B',
    tactic: TacticalPlay,
    oppDefense: DefensiveStrategy,
    ballPos: THREE.Vector3,
    _landingSpot: THREE.Vector3
  ): SpatialAssessment {
    const attackers = units.filter((u) => u.team === attackingTeam);
    const defenders = units.filter((u) => u.team !== attackingTeam);

    let minPairDist = 9.0;
    let totalPairDist = 0;
    let pairCount = 0;
    let overlapCount = 0;

    for (const team of ['A', 'B'] as const) {
      const roster = units.filter((u) => u.team === team);
      for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) {
          const dx = roster[i].mesh.position.x - roster[j].mesh.position.x;
          const dz = roster[i].mesh.position.z - roster[j].mesh.position.z;
          const d = Math.hypot(dx, dz);
          totalPairDist += d;
          pairCount++;
          if (d < minPairDist) minPairDist = d;
          if (d < this.minSafeSpacing * 0.72) overlapCount++;
        }
      }
    }

    const avgVoronoiSpread = pairCount > 0 ? totalPairDist / pairCount : 4.2;
    const blockers = defenders.filter((u) => u.assignedPlayRole === 'BLOCKER');
    const avgBlockX =
      blockers.length > 0
        ? blockers.reduce((s, b) => s + b.mesh.position.x, 0) / blockers.length
        : 0;
    const backDefenders = defenders.filter((u) => u.assignedPlayRole !== 'BLOCKER');
    const avgDefZAbs =
      backDefenders.length > 0
        ? backDefenders.reduce((s, d) => s + Math.abs(d.mesh.position.z), 0) / backDefenders.length
        : 6.0;

    const readinessAvg =
      attackers.reduce((s, a) => s + a.digitalSkin.interceptReadiness, 0) / Math.max(1, attackers.length);

    const openLeftWeight = avgBlockX > 0.5 ? 92 : 76;
    const openRightWeight = avgBlockX < -0.5 ? 92 : 76;
    const deepVoidBonus = avgDefZAbs < 5.6 ? 12 : 0;
    const shortTipBonus = avgDefZAbs > 6.6 ? 15 : 0;

    const candidates: PossibilityNode[] = [
      {
        id: 'CROSS_COURT_SPIKE',
        label: 'Cross-Court Seam',
        score: Math.min(99, Math.round((openLeftWeight + readinessAvg * 0.25) * (tactic === 'HIGH_OUTSIDE' ? 1.06 : 0.94))),
        risk: oppDefense === 'WING_PINCH' ? 32 : 18,
        selected: false,
      },
      {
        id: 'LINE_SHOT',
        label: 'Power Line Shot',
        score: Math.min(99, Math.round(openRightWeight + deepVoidBonus * 0.6)),
        risk: 24,
        selected: false,
      },
      {
        id: 'QUICK_1_TEMPO',
        label: '1-Tempo Middle Quick',
        score: Math.min(
          99,
          Math.round((tactic === 'FAST_QUICK' ? 95 : 81) - (oppDefense === 'COMMIT_BLOCK' ? 14 : 0))
        ),
        risk: oppDefense === 'COMMIT_BLOCK' ? 36 : 16,
        selected: false,
      },
      {
        id: 'PIPE_BACKROW',
        label: 'Back-Row Pipe Attack',
        score: Math.min(
          99,
          Math.round((tactic === 'PIPE_HEAVY' ? 94 : 79) + deepVoidBonus * 0.5)
        ),
        risk: 21,
        selected: false,
      },
      {
        id: 'SETTER_DUMP',
        label: 'Setter Second-Ball Tip',
        score: Math.min(99, Math.round(68 + shortTipBonus + (ballPos.y > 2.4 ? 10 : 0))),
        risk: 28,
        selected: false,
      },
      {
        id: 'TOOL_HIGH_HANDS',
        label: 'High-Hands Block Wipe',
        score: Math.min(99, Math.round(oppDefense === 'COMMIT_BLOCK' ? 88 : 72)),
        risk: 22,
        selected: false,
      },
    ];

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]) candidates[0].selected = true;

    const top = candidates[0];
    const targetZSign = attackingTeam === 'A' ? -1 : 1;
    let aimX = avgBlockX > 0 ? -3.1 : 3.1;
    let aimZ = 5.4 * targetZSign;

    if (top?.id === 'QUICK_1_TEMPO') {
      aimX = avgBlockX > 0 ? -1.4 : 1.4;
      aimZ = 4.2 * targetZSign;
    } else if (top?.id === 'PIPE_BACKROW') {
      aimX = 0.0;
      aimZ = 6.9 * targetZSign;
    } else if (top?.id === 'SETTER_DUMP') {
      aimX = -1.6;
      aimZ = 2.1 * targetZSign;
    }

    return {
      minTeammateDist: Number(minPairDist.toFixed(2)),
      avgVoronoiSpread: Number(avgVoronoiSpread.toFixed(2)),
      overlapCount,
      selfPropagatingEnergy: this.totalGridEnergy,
      possibilities: candidates,
      recommendedAimXZ: { x: aimX, z: aimZ },
    };
  }
}
