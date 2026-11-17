import * as THREE from 'three';
import {
  AIDirectorState,
  CutsceneCameraShot,
  CutsceneEmotion,
  Unit,
} from '../../types';

export interface ProgrammedShotPlan {
  label: string;
  rule: string;
  anchorBase: THREE.Vector3;
  lookBase: THREE.Vector3;
  radius: number;
  azimuthStart: number;
  azimuthSpeed: number;
  elevation: number;
  fov: number;
  dutchTiltDeg: number;
  fitnessScore: number;
}

export interface ComicOrbitSolution {
  cameraPos: THREE.Vector3;
  lookTarget: THREE.Vector3;
  fov: number;
  dutchTiltDeg: number;
  azimuthDeg: number;
  fitnessScore: number;
}

/**
 * AICameraSelfProgrammer
 * Autonomous 3D Cinematography Solver that self-programs camera positions, close-up angles,
 * orbital sweeps, focal lengths, and Dutch tilts by scoring candidate poses in real time
 * against net-occlusion, stadium-bowl clearance, skyline framing, and shot diversity.
 */
export class AICameraSelfProgrammer {
  private autoDirectorEnabled = true;
  private selfProgrammedShotsCount = 0;
  private readonly recentAzimuths: number[] = [];

  private activeCutscenePlan: ProgrammedShotPlan = {
    label: 'HERO LOW-ANGLE ORBIT',
    rule: 'MAX(CLEAR_SIGHT + SKYLINE_DEPTH + ANGLE_NOVELTY)',
    anchorBase: new THREE.Vector3(0, 1.4, 0),
    lookBase: new THREE.Vector3(0, 1.4, 0),
    radius: 3.2,
    azimuthStart: 0.45,
    azimuthSpeed: 0.34,
    elevation: 1.85,
    fov: 32,
    dutchTiltDeg: 3.5,
    fitnessScore: 94,
  };

  private strikeOrigin = new THREE.Vector3();
  private strikeLanding = new THREE.Vector3();
  private strikeAzimuthStart = 0.6;
  private strikeAzimuthSweep = 1.65;
  private strikeRadius = 2.95;
  private strikeSideSign = 1;
  private strikeBaseTiltDeg = 6.5;
  private strikeFitness = 96;

  private readonly state: AIDirectorState = {
    autoDirectorEnabled: true,
    currentProgramLabel: 'BROADCAST AI TRACKER',
    programRule: 'LIVE_COURT_BALANCE',
    azimuthDeg: 0,
    elevationDeg: 18,
    fovDeg: 42,
    dutchTiltDeg: 0,
    fitnessScore: 95,
    selfProgrammedShotsCount: 0,
  };

  private readonly _candPos = new THREE.Vector3();
  private readonly _bestPos = new THREE.Vector3();
  private readonly _candLook = new THREE.Vector3();

  public setAutoDirectorEnabled(enabled: boolean) {
    this.autoDirectorEnabled = enabled;
    this.state.autoDirectorEnabled = enabled;
  }

  public isEnabled(): boolean {
    return this.autoDirectorEnabled;
  }

  public getState(): AIDirectorState {
    return this.state;
  }

  /**
   * Evaluates whether a segment crosses the volleyball net mesh (z = 0, y in [1.35..2.52]).
   */
  private isNetOccluding(camPos: THREE.Vector3, lookPos: THREE.Vector3): boolean {
    if (Math.sign(camPos.z) === Math.sign(lookPos.z)) return false;
    const denom = Math.abs(camPos.z - lookPos.z);
    if (denom < 0.05) return false;
    const frac = Math.abs(camPos.z) / denom;
    const yCross = THREE.MathUtils.lerp(camPos.y, lookPos.y, frac);
    const xCross = THREE.MathUtils.lerp(camPos.x, lookPos.x, frac);
    return Math.abs(xCross) < 4.9 && yCross >= 1.25 && yCross <= 2.55;
  }

  private scoreCameraCandidate(
    camPos: THREE.Vector3,
    lookPos: THREE.Vector3,
    azimuth: number,
    allowNetCross: boolean
  ): number {
    let score = 70;

    // 1. Stadium Bowl Safety Margin (never clip stands or floor)
    if (Math.abs(camPos.x) > 11.1 || Math.abs(camPos.z) > 14.5 || camPos.y < 0.85) {
      score -= 48;
    } else {
      score += 12;
    }

    // 2. Net Line-of-Sight Clearance
    if (!allowNetCross && this.isNetOccluding(camPos, lookPos)) {
      score -= 42;
    } else {
      score += 14;
    }

    // 3. Skyline / North Arena Vista Framing (shooting from +Z looking toward -Z frames skyline & VIP)
    if (camPos.z > lookPos.z) {
      score += 14;
    }

    // 4. Cinematic Diagonal Perspective Bonus (avoid flat cardinal 0 or 90 deg locks)
    const diag = Math.abs(Math.sin(azimuth * 2));
    score += diag * 10;

    // 5. Anti-Repetition Variety Memory
    let minAngDiff = Math.PI;
    for (const prev of this.recentAzimuths) {
      const diff = Math.abs(Math.atan2(Math.sin(azimuth - prev), Math.cos(azimuth - prev)));
      if (diff < minAngDiff) minAngDiff = diff;
    }
    score += THREE.MathUtils.clamp(minAngDiff / Math.PI, 0, 1) * 14;

    return THREE.MathUtils.clamp(Math.round(score), 10, 99);
  }

  private pushAzimuthMemory(az: number) {
    this.recentAzimuths.push(az);
    if (this.recentAzimuths.length > 3) {
      this.recentAzimuths.shift();
    }
  }

  /**
   * Self-programs an optimal dynamic cutscene shot whenever a narrative dialogue line,
   * close-up trigger, or dramatic scene change fires.
   */
  public programCutsceneShot(params: {
    shotHint: CutsceneCameraShot;
    emotion: CutsceneEmotion;
    focusUnit: Unit | null;
    allUnits: Unit[];
    intensity: number;
  }): ProgrammedShotPlan {
    const { shotHint, emotion, focusUnit, intensity } = params;

    let focusAnchor = new THREE.Vector3(0, 1.38, 0);
    let baseRadius = 3.15;
    let baseElev = 1.75;
    let baseFov = 32;
    let allowNetCross = false;
    let label = 'AI CLOSE-UP ORBIT';

    if (shotHint === 'PLAYER_CLOSEUP_A' || shotHint === 'PLAYER_CLOSEUP_B') {
      if (focusUnit) {
        focusAnchor.set(focusUnit.mesh.position.x, 1.36, focusUnit.mesh.position.z);
      }
      baseRadius = emotion === 'DETERMINED' || emotion === 'FOCUSED' ? 2.65 : 3.1;
      baseElev = emotion === 'VICTORY_ROAR' ? 1.45 : 1.85;
      baseFov = emotion === 'RIVAL_SMIRK' ? 28 : 31;
      label = focusUnit ? `CLOSE-UP · #${focusUnit.jerseyNumber} ${focusUnit.name}` : 'AI HERO CLOSE-UP';
    } else if (shotHint === 'NET_FACEOFF') {
      focusAnchor.set(0, 1.75, 0);
      baseRadius = 6.2;
      baseElev = 2.45;
      baseFov = 33;
      allowNetCross = true;
      label = 'NET FACEOFF SYNTHESIS';
    } else if (shotHint === 'SKYLINE_SWEEP') {
      focusAnchor.set(0, 3.0, -14.0);
      baseRadius = 11.4;
      baseElev = 7.4;
      baseFov = 41;
      label = 'VANCOUVER SKYLINE PAN';
    } else if (shotHint === 'VIP_BOX_LOOK') {
      focusAnchor.set(0, 3.6, 15.5);
      baseRadius = 9.8;
      baseElev = 5.1;
      baseFov = 39;
      label = 'VIP DECK REACTION SHOT';
    } else if (shotHint === 'TEAM_HUDDLE_PAN') {
      const fz = focusUnit?.team === 'B' ? -3.2 : 3.2;
      focusAnchor.set(0, 1.25, fz);
      baseRadius = 5.4;
      baseElev = 3.1;
      baseFov = 35;
      label = 'SQUAD HUDDLE DOLLY';
    } else if (shotHint === 'COURT_FLYBY') {
      focusAnchor.set(0, 1.8, 0);
      baseRadius = 10.6;
      baseElev = 4.4;
      baseFov = 42;
      allowNetCross = true;
      label = 'AERIAL COURT FLYBY';
    } else if (shotHint === 'HERO_LOW_ANGLE') {
      if (focusUnit) {
        focusAnchor.set(focusUnit.mesh.position.x, 1.48, focusUnit.mesh.position.z);
      } else {
        focusAnchor.set(0, 1.48, 3.2);
      }
      baseRadius = 2.45;
      baseElev = 1.18;
      baseFov = 29;
      label = focusUnit
        ? `LOW HERO TRACK · #${focusUnit.jerseyNumber} ${focusUnit.name}`
        : 'LOW HERO TRACK';
    } else if (shotHint === 'BENCH_HUDDLE') {
      const bz = focusUnit?.team === 'B' ? -6.8 : 6.8;
      focusAnchor.set(-2.6, 1.32, bz);
      baseRadius = 4.8;
      baseElev = 2.15;
      baseFov = 34;
      label = 'SIDELINE BENCH STRATEGY';
    } else {
      focusAnchor.set(0, 1.4, 0);
      baseRadius = 11.5;
      baseElev = 6.6;
      baseFov = 43;
      label = 'STADIUM ESTABLISHING SWEEP';
    }

    // Autonomous Candidate Search: synthesize 8 azimuth/elevation options and pick winner
    let bestScore = -999;
    let bestAz = 0.45;
    let bestElev = baseElev;
    let bestRad = baseRadius;
    const teamSideSign = focusUnit?.team === 'B' ? -1 : 1;

    for (let i = 0; i < 8; i++) {
      const candAz = (i / 8) * Math.PI * 2 + (teamSideSign < 0 ? Math.PI : 0) + 0.28;
      const candRad = baseRadius * (i % 2 === 0 ? 0.94 : 1.08);
      const candElev = Math.max(1.15, baseElev + (i % 3 - 1) * 0.35);

      this._candPos.set(
        focusAnchor.x + Math.sin(candAz) * candRad,
        candElev,
        focusAnchor.z + Math.cos(candAz) * candRad
      );

      // Prefer staying on the actor's side of the net during close-ups
      let score = this.scoreCameraCandidate(this._candPos, focusAnchor, candAz, allowNetCross);
      if (
        focusUnit &&
        (shotHint === 'PLAYER_CLOSEUP_A' || shotHint === 'PLAYER_CLOSEUP_B') &&
        Math.sign(this._candPos.z) === Math.sign(focusAnchor.z || teamSideSign)
      ) {
        score += 18;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAz = candAz;
        bestElev = candElev;
        bestRad = candRad;
        this._bestPos.copy(this._candPos);
      }
    }

    this.pushAzimuthMemory(bestAz);
    this.selfProgrammedShotsCount++;

    const tiltDir = Math.sin(bestAz) >= 0 ? 1 : -1;
    const dutchTiltDeg =
      emotion === 'SHOCKED' || emotion === 'RIVAL_SMIRK'
        ? tiltDir * (4.5 + intensity * 3.0)
        : emotion === 'VICTORY_ROAR'
        ? tiltDir * 3.8
        : tiltDir * 1.8;

    this.activeCutscenePlan = {
      label,
      rule: `AI-SOLVED AZ ${Math.round(THREE.MathUtils.radToDeg(bestAz))}° · SCORE ${bestScore}`,
      anchorBase: this._bestPos.clone(),
      lookBase: focusAnchor.clone(),
      radius: bestRad,
      azimuthStart: bestAz,
      azimuthSpeed: (iOrDir => iOrDir * (0.24 + intensity * 0.16))(tiltDir),
      elevation: bestElev,
      fov: baseFov,
      dutchTiltDeg: Number(dutchTiltDeg.toFixed(1)),
      fitnessScore: bestScore,
    };

    this.state.currentProgramLabel = this.activeCutscenePlan.label;
    this.state.programRule = this.activeCutscenePlan.rule;
    this.state.azimuthDeg = Math.round(THREE.MathUtils.radToDeg(bestAz));
    this.state.elevationDeg = Math.round(THREE.MathUtils.radToDeg(Math.atan2(bestElev, bestRad)));
    this.state.fovDeg = baseFov;
    this.state.dutchTiltDeg = this.activeCutscenePlan.dutchTiltDeg;
    this.state.fitnessScore = bestScore;
    this.state.selfProgrammedShotsCount = this.selfProgrammedShotsCount;

    return this.activeCutscenePlan;
  }

  public evaluateCutsceneFrame(
    shotTimeSec: number,
    outCamPos: THREE.Vector3,
    outLookTarget: THREE.Vector3
  ): { fov: number; dutchTiltDeg: number } {
    const p = this.activeCutscenePlan;
    const az = p.azimuthStart + shotTimeSec * p.azimuthSpeed;
    outCamPos.set(
      THREE.MathUtils.clamp(p.lookBase.x + Math.sin(az) * p.radius, -11.2, 11.2),
      THREE.MathUtils.clamp(p.elevation + Math.sin(shotTimeSec * 0.8) * 0.18, 1.15, 11.5),
      THREE.MathUtils.clamp(p.lookBase.z + Math.cos(az) * p.radius, -14.5, 14.8)
    );
    outLookTarget.copy(p.lookBase);
    this.state.azimuthDeg = Math.round(((THREE.MathUtils.radToDeg(az) % 360) + 360) % 360);
    return { fov: p.fov, dutchTiltDeg: p.dutchTiltDeg };
  }

  /**
   * Self-programs the Comic Strike Close-Up Rotating Camera arc right as a spike/block occurs.
   * Picks the highest-scoring orbital start angle + sweep direction avoiding net/bleacher occlusion.
   */
  public programComicStrikeOrbit(
    strikePos: THREE.Vector3,
    landingPos: THREE.Vector3,
    spikerTeam: 'A' | 'B',
    speedKmh: number
  ) {
    this.strikeOrigin.copy(strikePos);
    this.strikeLanding.copy(landingPos);

    const teamZ = spikerTeam === 'A' ? 1 : -1;
    let bestScore = -999;
    let bestAz = strikePos.x >= 0 ? -0.65 : 0.65;
    let bestSweep = strikePos.x >= 0 ? -1.45 : 1.45;
    const rad = THREE.MathUtils.clamp(3.35 - (speedKmh - 65) * 0.015, 2.55, 3.4);

    // Search 6 candidate orbital arcs around the ball flight & landing zone
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const baseAz = (i < 2 ? 0.42 : i < 4 ? 0.92 : 1.38) * side + (teamZ < 0 ? Math.PI : 0);
      this._candPos.set(
        strikePos.x + Math.sin(baseAz) * rad,
        THREE.MathUtils.clamp(strikePos.y + 0.55, 1.65, 5.0),
        strikePos.z + Math.cos(baseAz) * rad
      );
      this._candLook.copy(strikePos).lerp(landingPos, 0.35);
      const s = this.scoreCameraCandidate(this._candPos, this._candLook, baseAz, false);
      if (s > bestScore) {
        bestScore = s;
        bestAz = baseAz;
        bestSweep = -side * THREE.MathUtils.clamp(1.25 + (speedKmh - 60) * 0.01, 1.25, 1.85);
      }
    }

    this.pushAzimuthMemory(bestAz);
    this.selfProgrammedShotsCount++;
    this.strikeAzimuthStart = bestAz;
    this.strikeAzimuthSweep = bestSweep;
    this.strikeRadius = rad;
    this.strikeSideSign = bestSweep >= 0 ? 1 : -1;
    this.strikeBaseTiltDeg = this.strikeSideSign * 6.8;
    this.strikeFitness = bestScore;

    this.state.currentProgramLabel = 'COMIC STRIKE CLOSE-UP ORBIT';
    this.state.programRule = `ORBIT ${Math.round(THREE.MathUtils.radToDeg(Math.abs(bestSweep)))}° · SCORE ${bestScore}`;
    this.state.selfProgrammedShotsCount = this.selfProgrammedShotsCount;
    this.state.fitnessScore = bestScore;
  }

  /**
   * Evaluates the close-up rotating camera around the ball & landing impact throughout the comic strike.
   */
  public evaluateComicOrbitFrame(
    progress01: number,
    liveBallPos: THREE.Vector3,
    out: ComicOrbitSolution
  ) {
    const p = THREE.MathUtils.clamp(progress01, 0, 1);
    const eased = 1 - Math.pow(1 - p, 2.2);

    // Focus glides smoothly from contact hand/ball down toward the court landing spot as ball descends
    out.lookTarget.copy(liveBallPos).lerp(this.strikeLanding, eased * 0.45);
    out.lookTarget.y = Math.max(0.42, out.lookTarget.y);

    const az = this.strikeAzimuthStart + eased * this.strikeAzimuthSweep;
    // Close-up starts tight (2.4m) around the strike, then widens slightly to reveal court landing
    const radius = THREE.MathUtils.lerp(this.strikeRadius * 0.86, this.strikeRadius * 1.28, eased);
    const elev = THREE.MathUtils.lerp(Math.max(1.85, this.strikeOrigin.y + 0.45), 1.48, eased);

    out.cameraPos.set(
      THREE.MathUtils.clamp(out.lookTarget.x + Math.sin(az) * radius, -11.0, 11.0),
      THREE.MathUtils.clamp(elev, 1.15, 6.2),
      THREE.MathUtils.clamp(out.lookTarget.z + Math.cos(az) * radius, -14.2, 14.5)
    );

    // Tight comic punch FOV (27°) transitioning cleanly toward 34° as it unfolds
    out.fov = THREE.MathUtils.lerp(27, 34, eased);
    out.dutchTiltDeg = this.strikeBaseTiltDeg * (1 - p * 0.65);
    out.azimuthDeg = Math.round(((THREE.MathUtils.radToDeg(az) % 360) + 360) % 360);
    out.fitnessScore = this.strikeFitness;

    this.state.azimuthDeg = out.azimuthDeg;
    this.state.fovDeg = Math.round(out.fov);
    this.state.dutchTiltDeg = Number(out.dutchTiltDeg.toFixed(1));
  }
}
