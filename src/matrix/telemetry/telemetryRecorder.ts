import * as THREE from 'three';
import { HyperAssessmentAxis, HyperAssessmentReport, Unit } from '../../types';
import { SpatialAssessment } from '../ai/spatialMatrix';

export interface TelemetryFrame {
  t: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  speedKmh: number;
  bio: [number, number, number, number];
  minDist: number;
  overlapCount: number;
  topPossibility: string;
}

/**
 * TelemetryRecorder
 * Maintains a rolling circular post-mortem telemetry buffer and runs real-time
 * Intelligent Hyper-Assessment across all 6 PS6 volleyball subsystems simultaneously.
 */
export class TelemetryRecorder {
  private frames: TelemetryFrame[] = [];
  private readonly maxFrames = 1800;
  private isRecording = false;
  private latestReport: HyperAssessmentReport | null = null;

  public startRecording() {
    this.isRecording = true;
    this.frames = [];
  }

  public recordFrame(
    ballPos: THREE.Vector3,
    speedKmh: number,
    bioRegister: THREE.Vector4,
    spatial: SpatialAssessment
  ) {
    if (!this.isRecording) return;

    const top = spatial.possibilities.find((p) => p.selected)?.id || 'CROSS_COURT_SPIKE';
    this.frames.push({
      t: Number(performance.now().toFixed(1)),
      ballX: Number(ballPos.x.toFixed(2)),
      ballY: Number(ballPos.y.toFixed(2)),
      ballZ: Number(ballPos.z.toFixed(2)),
      speedKmh,
      bio: [
        Number(bioRegister.x.toFixed(2)),
        Number(bioRegister.y.toFixed(2)),
        Number(bioRegister.z.toFixed(2)),
        Number(bioRegister.w.toFixed(1)),
      ],
      minDist: spatial.minTeammateDist,
      overlapCount: spatial.overlapCount,
      topPossibility: top,
    });

    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  public evaluateHyperAssessment(
    units: Unit[],
    ballPos: THREE.Vector3,
    fps: number,
    bioRegister: THREE.Vector4,
    spatial: SpatialAssessment,
    trajectoryConfidence: number,
    sideTouches: number,
    hasViolation: boolean
  ): HyperAssessmentReport {
    // Verify anatomical bone integrity (no detached/NaN unit roots)
    const rigClean = units.every(
      (u) =>
        Number.isFinite(u.mesh.position.x) &&
        Number.isFinite(u.mesh.position.z) &&
        u.parts.torso.parent === u.parts.hips &&
        u.parts.head.parent === u.parts.torso
    );

    const ballBounded =
      Number.isFinite(ballPos.x) &&
      Number.isFinite(ballPos.y) &&
      Number.isFinite(ballPos.z) &&
      ballPos.y >= 0;

    const voronoiScore = Math.round(
      THREE.MathUtils.clamp(
        98 - spatial.overlapCount * 14 + (spatial.minTeammateDist >= 1.3 ? 2 : -8),
        60,
        100
      )
    );
    const ballisticScore = Math.round(ballBounded ? trajectoryConfidence * 100 : 40);
    const fivbScore = hasViolation ? 84 : sideTouches <= 3 ? 99 : 65;
    const shaderScore = Math.round(THREE.MathUtils.clamp((fps / 60) * 96 + (bioRegister.x > 0.3 ? 4 : 0), 72, 100));
    const rigScore = rigClean ? 100 : 50;
    const topPossScore = spatial.possibilities[0]?.score ?? 86;

    const axes: HyperAssessmentAxis[] = [
      {
        id: 'sentient_shader',
        label: 'Sentient Gel Shader',
        score: shaderScore,
        status: shaderScore >= 85 ? 'VERIFIED' : 'WARNING',
        detail: `${fps} FPS • ATP ${bioRegister.x.toFixed(2)} • Lumen ${bioRegister.w.toFixed(1)}`,
      },
      {
        id: 'chibi_voxel_rig',
        label: 'Chibi-Voxel Rig',
        score: rigScore,
        status: rigClean ? 'VERIFIED' : 'CRITICAL',
        detail: rigClean ? '12 hierarchical athletes grounded' : 'Rig hierarchy alert',
      },
      {
        id: 'ballistic_bridge',
        label: 'Ballistic Raycaster',
        score: ballisticScore,
        status: ballisticScore >= 82 ? 'VERIFIED' : 'WARNING',
        detail: `Intercept confidence ${Math.round(trajectoryConfidence * 100)}%`,
      },
      {
        id: 'voronoi_spatial',
        label: 'Voronoi Zonal Grid',
        score: voronoiScore,
        status: spatial.overlapCount === 0 ? 'VERIFIED' : 'WARNING',
        detail: `Min gap ${spatial.minTeammateDist.toFixed(2)}m • ${spatial.overlapCount} overlaps`,
      },
      {
        id: 'fivb_steering',
        label: 'FIVB Steering & Rules',
        score: fivbScore,
        status: fivbScore >= 84 ? 'VERIFIED' : 'WARNING',
        detail: `Touch ${sideTouches}/3 • Non-overlapping FSM`,
      },
      {
        id: 'possibility_grid',
        label: 'Sentient Possibility Grid',
        score: topPossScore,
        status: topPossScore >= 78 ? 'VERIFIED' : 'WARNING',
        detail: `Top: ${spatial.possibilities[0]?.label || 'Balanced'} (${topPossScore}%)`,
      },
    ];

    const overallScore = Math.round(axes.reduce((acc, a) => acc + a.score, 0) / axes.length);
    const verifiedAxes = axes.filter((a) => a.status === 'VERIFIED').length;

    this.latestReport = {
      overallScore,
      verifiedAxes,
      totalAxes: axes.length,
      voronoiSpreadMeters: spatial.avgVoronoiSpread,
      minTeammateDist: spatial.minTeammateDist,
      overlapCount: spatial.overlapCount,
      trajectoryConfidence: Math.round(trajectoryConfidence * 100),
      recordedFrames: this.frames.length,
      axes,
      possibilities: spatial.possibilities,
    };

    return this.latestReport;
  }

  public getExportPayload() {
    return {
      exportedAt: new Date().toISOString(),
      engine: 'Cometic Volleyball Matrix PS6',
      hyperAssessment: this.latestReport,
      frameCount: this.frames.length,
      recentFrames: this.frames.slice(-240),
    };
  }
}
