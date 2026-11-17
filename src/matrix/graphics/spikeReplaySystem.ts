import * as THREE from 'three';
import {
  ReplayAngleMode,
  ReplayFrame,
  ReplayPlaybackState,
  ReplayUnitFrame,
  SpikeReplayClip,
  Unit,
} from '../../types';

const RING_CAPACITY = 175;
const MAX_STORED_CLIPS = 8;

export const REPLAY_ANGLES: ReplayAngleMode[] = [
  'NET_TAPE_SWEEP',
  'SPIKER_SHOULDER',
  'FLOOR_IMPACT_LOW',
  'ORBIT_DRONE',
];

export interface ReplayStepCallbacks {
  onStrikeMoment?: (ballPos: THREE.Vector3, spikerPos: THREE.Vector3) => void;
  onImpactMoment?: (ballPos: THREE.Vector3) => void;
}

/**
 * SpikeReplaySystem
 * Captures rolling full-world volleyball telemetry frames and preserves top spikes
 * for repeated multi-angle slow-motion broadcast playback across 4 cinematic rigs.
 */
export class SpikeReplaySystem {
  private readonly ring: ReplayFrame[] = [];
  private sampleAccum = 0;
  private clips: SpikeReplayClip[] = [];

  private active = false;
  private showcaseLoop = false;
  private autoShowcaseEnabled = true;
  private clipIndex = 0;
  private angleIndex = 0;
  private frameCursor = 0;
  private playbackSpeed = 0.28;
  private anglePassCount = 0;
  private firedStrikeThisPass = false;
  private firedImpactThisPass = false;

  private readonly _camPos = new THREE.Vector3();
  private readonly _camTarget = new THREE.Vector3();
  private readonly _ballPos = new THREE.Vector3();
  private readonly _spikerPos = new THREE.Vector3();

  public loadClips(savedClips: SpikeReplayClip[]) {
    if (!Array.isArray(savedClips)) return;
    this.clips = savedClips.slice(0, MAX_STORED_CLIPS);
  }

  public getClips(): SpikeReplayClip[] {
    return this.clips;
  }

  public getBestSpikeKmh(): number {
    let max = 0;
    for (const c of this.clips) {
      if (c.speedKmh > max) max = c.speedKmh;
    }
    return max;
  }

  public recordLiveFrame(
    dt: number,
    ball: THREE.Group,
    ballSpeedKmh: number,
    strikeEvent: boolean,
    impactEvent: boolean,
    spikerId: number | null,
    units: Unit[]
  ) {
    this.sampleAccum += dt;
    // Sample at ~45Hz or immediately on critical strike/impact moments
    if (!strikeEvent && !impactEvent && this.sampleAccum < 0.022) return;
    this.sampleAccum = 0;

    const unitFrames: ReplayUnitFrame[] = units.map((u) => ({
      id: u.id,
      x: u.mesh.position.x,
      y: u.mesh.position.y,
      z: u.mesh.position.z,
      rotY: u.mesh.rotation.y,
      animState: u.animState,
      animTimer: u.animTimer,
      stepCycle: u.stepCycle,
      leanPitch: u.currentLeanPitch,
      leanRoll: u.currentLeanRoll,
      crouch: u.currentCrouch,
      sweatLevel: u.sweatLevel,
    }));

    const frame: ReplayFrame = {
      t: performance.now(),
      ballX: ball.position.x,
      ballY: ball.position.y,
      ballZ: ball.position.z,
      ballRotX: ball.rotation.x,
      ballRotY: ball.rotation.y,
      ballSpeedKmh,
      strikeEvent,
      impactEvent,
      spikerId,
      units: unitFrames,
    };

    this.ring.push(frame);
    if (this.ring.length > RING_CAPACITY) {
      this.ring.shift();
    }
  }

  public captureBestSpikeClip(params: {
    spiker: Unit;
    speedKmh: number;
    jumpHeight: number;
    shotType: string;
    impactPos: THREE.Vector3;
    scoreA: number;
    scoreB: number;
    currentSet: number;
  }): SpikeReplayClip | null {
    if (this.ring.length < 24) return null;

    // Take trailing ~115 frames (~2.5s window capturing windup, hit, and smash)
    const sliceStart = Math.max(0, this.ring.length - 115);
    const frames = this.ring.slice(sliceStart).map((f) => ({
      ...f,
      units: f.units.map((u) => ({ ...u })),
    }));

    const ratingScore = Math.round(
      params.speedKmh * 1.15 + params.jumpHeight * 12 + (params.shotType.includes('BLOCK') ? 18 : 10)
    );

    const clip: SpikeReplayClip = {
      id: `spike-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      recordedAt: Date.now(),
      spikerId: params.spiker.id,
      spikerName: params.spiker.name,
      spikerJersey: params.spiker.jerseyNumber,
      team: params.spiker.team,
      speedKmh: params.speedKmh,
      jumpHeight: Number(params.jumpHeight.toFixed(2)),
      shotType: params.shotType,
      impactPos: {
        x: Number(params.impactPos.x.toFixed(2)),
        y: Number(params.impactPos.y.toFixed(2)),
        z: Number(params.impactPos.z.toFixed(2)),
      },
      spikerPos: {
        x: Number(params.spiker.mesh.position.x.toFixed(2)),
        y: Number(params.spiker.mesh.position.y.toFixed(2)),
        z: Number(params.spiker.mesh.position.z.toFixed(2)),
      },
      scoreA: params.scoreA,
      scoreB: params.scoreB,
      setNumber: params.currentSet,
      ratingScore,
      frames,
    };

    this.clips.unshift(clip);
    // Keep top rated / most recent up to MAX_STORED_CLIPS
    if (this.clips.length > MAX_STORED_CLIPS) {
      this.clips.sort((a, b) => b.ratingScore - a.ratingScore);
      this.clips.length = MAX_STORED_CLIPS;
    }
    return clip;
  }

  public triggerLatestMultiAngleReplay(showcaseLoop = false): boolean {
    if (this.clips.length === 0) return false;
    this.active = true;
    this.showcaseLoop = showcaseLoop;
    this.clipIndex = 0;
    this.angleIndex = 0;
    this.frameCursor = 0;
    this.anglePassCount = 0;
    this.firedStrikeThisPass = false;
    this.firedImpactThisPass = false;
    return true;
  }

  public playClipAt(index: number, showcaseLoop = true): boolean {
    if (index < 0 || index >= this.clips.length) return false;
    this.active = true;
    this.showcaseLoop = showcaseLoop;
    this.clipIndex = index;
    this.angleIndex = 0;
    this.frameCursor = 0;
    this.anglePassCount = 0;
    this.firedStrikeThisPass = false;
    this.firedImpactThisPass = false;
    return true;
  }

  public startContinuousShowcase(): boolean {
    if (this.clips.length === 0) return false;
    this.clips.sort((a, b) => b.ratingScore - a.ratingScore);
    return this.playClipAt(0, true);
  }

  public stopReplay() {
    this.active = false;
    this.showcaseLoop = false;
    this.frameCursor = 0;
  }

  public nextAngle() {
    this.angleIndex = (this.angleIndex + 1) % REPLAY_ANGLES.length;
    this.frameCursor = 0;
    this.firedStrikeThisPass = false;
    this.firedImpactThisPass = false;
  }

  public setAngle(angle: ReplayAngleMode) {
    const idx = REPLAY_ANGLES.indexOf(angle);
    if (idx >= 0) {
      this.angleIndex = idx;
    }
  }

  public nextClip() {
    if (this.clips.length === 0) return;
    this.clipIndex = (this.clipIndex + 1) % this.clips.length;
    this.angleIndex = 0;
    this.frameCursor = 0;
    this.anglePassCount = 0;
    this.firedStrikeThisPass = false;
    this.firedImpactThisPass = false;
  }

  public setPlaybackSpeed(speed: number) {
    this.playbackSpeed = THREE.MathUtils.clamp(speed, 0.12, 1.0);
  }

  public setAutoShowcase(enabled: boolean) {
    this.autoShowcaseEnabled = enabled;
  }

  public isAutoShowcaseEnabled(): boolean {
    return this.autoShowcaseEnabled;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getPlaybackState(): ReplayPlaybackState {
    const clip = this.clips[this.clipIndex] || null;
    const totalFrames = clip ? Math.max(1, clip.frames.length - 1) : 1;
    let currentClipMeta: Omit<SpikeReplayClip, 'frames'> | null = null;
    if (clip) {
      const { frames: _ignored, ...rest } = clip;
      currentClipMeta = rest;
    }
    return {
      active: this.active,
      showcaseLoop: this.showcaseLoop,
      autoShowcaseEnabled: this.autoShowcaseEnabled,
      clipIndex: this.clipIndex,
      totalClips: this.clips.length,
      currentClip: currentClipMeta,
      currentAngle: REPLAY_ANGLES[this.angleIndex],
      angleIndex: this.angleIndex,
      totalAngles: REPLAY_ANGLES.length,
      progress: clip ? THREE.MathUtils.clamp(this.frameCursor / totalFrames, 0, 1) : 0,
      playbackSpeed: this.playbackSpeed,
    };
  }

  /**
   * Advances slow-motion replay playback, updates ball & all 12 unit poses,
   * and positions camera across the 4 cinematic angles. Returns false when replay finishes.
   */
  public stepReplay(
    rawDt: number,
    ball: THREE.Group,
    ballShadow: THREE.Mesh,
    units: Unit[],
    camera: THREE.PerspectiveCamera,
    controlsTarget: THREE.Vector3,
    applyUnitRig: (u: Unit, dt: number) => void,
    callbacks?: ReplayStepCallbacks
  ): boolean {
    if (!this.active) return false;
    const clip = this.clips[this.clipIndex];
    if (!clip || clip.frames.length < 2) {
      this.stopReplay();
      return false;
    }

    // Advance frame cursor at ~45Hz * slow-motion speed
    const advanceFrames = rawDt * 45 * this.playbackSpeed;
    this.frameCursor += advanceFrames;

    if (this.frameCursor >= clip.frames.length - 1) {
      this.anglePassCount++;
      this.firedStrikeThisPass = false;
      this.firedImpactThisPass = false;

      if (this.showcaseLoop) {
        // Cycle through all 4 angles for each spike, then advance to next top spike
        this.angleIndex = (this.angleIndex + 1) % REPLAY_ANGLES.length;
        if (this.angleIndex === 0 && this.clips.length > 1) {
          this.clipIndex = (this.clipIndex + 1) % this.clips.length;
        }
        this.frameCursor = 0;
      } else {
        // Auto-show 2 distinct angles after a monster spike, then cleanly return to match
        if (this.anglePassCount < 2) {
          this.angleIndex = (this.angleIndex + 1) % REPLAY_ANGLES.length;
          this.frameCursor = 0;
        } else {
          this.stopReplay();
          return false;
        }
      }
    }

    const activeClip = this.clips[this.clipIndex];
    const maxIdx = activeClip.frames.length - 1;
    const idx0 = Math.min(maxIdx, Math.floor(this.frameCursor));
    const idx1 = Math.min(maxIdx, idx0 + 1);
    const alpha = this.frameCursor - idx0;

    const f0 = activeClip.frames[idx0];
    const f1 = activeClip.frames[idx1];

    // Interpolate ball position & spin
    this._ballPos.set(
      THREE.MathUtils.lerp(f0.ballX, f1.ballX, alpha),
      THREE.MathUtils.lerp(f0.ballY, f1.ballY, alpha),
      THREE.MathUtils.lerp(f0.ballZ, f1.ballZ, alpha)
    );
    ball.position.copy(this._ballPos);
    ball.rotation.x = THREE.MathUtils.lerp(f0.ballRotX, f1.ballRotX, alpha);
    ball.rotation.y = THREE.MathUtils.lerp(f0.ballRotY, f1.ballRotY, alpha);

    ballShadow.position.set(this._ballPos.x, 0.015, this._ballPos.z);
    const heightScale = THREE.MathUtils.clamp(1.15 - this._ballPos.y * 0.12, 0.35, 1.1);
    ballShadow.scale.setScalar(heightScale);

    // Interpolate all 12 athletes cleanly
    let spikerFound = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const u0 = f0.units[i];
      const u1 = f1.units[i];
      if (!u0 || !u1) continue;

      u.mesh.position.set(
        THREE.MathUtils.lerp(u0.x, u1.x, alpha),
        THREE.MathUtils.lerp(u0.y, u1.y, alpha),
        THREE.MathUtils.lerp(u0.z, u1.z, alpha)
      );
      u.mesh.rotation.y = THREE.MathUtils.lerp(u0.rotY, u1.rotY, alpha);
      u.animState = u1.animState;
      u.animTimer = THREE.MathUtils.lerp(u0.animTimer, u1.animTimer, alpha);
      u.stepCycle = THREE.MathUtils.lerp(u0.stepCycle, u1.stepCycle, alpha);
      u.currentLeanPitch = THREE.MathUtils.lerp(u0.leanPitch, u1.leanPitch, alpha);
      u.currentLeanRoll = THREE.MathUtils.lerp(u0.leanRoll, u1.leanRoll, alpha);
      u.currentCrouch = THREE.MathUtils.lerp(u0.crouch, u1.crouch, alpha);
      applyUnitRig(u, rawDt * this.playbackSpeed);

      if (u.id === activeClip.spikerId) {
        this._spikerPos.copy(u.mesh.position);
        spikerFound = true;
      }
    }

    if (!spikerFound) {
      this._spikerPos.set(activeClip.spikerPos.x, activeClip.spikerPos.y, activeClip.spikerPos.z);
    }

    if (f1.strikeEvent && !this.firedStrikeThisPass) {
      this.firedStrikeThisPass = true;
      callbacks?.onStrikeMoment?.(this._ballPos, this._spikerPos);
    }
    if (f1.impactEvent && !this.firedImpactThisPass) {
      this.firedImpactThisPass = true;
      callbacks?.onImpactMoment?.(this._ballPos);
    }

    // Position camera along the active cinematic replay angle
    const progress = this.frameCursor / Math.max(1, maxIdx);
    const angle = REPLAY_ANGLES[this.angleIndex];
    const zSign = activeClip.team === 'A' ? 1 : -1;

    switch (angle) {
      case 'NET_TAPE_SWEEP': {
        const sweepX = THREE.MathUtils.lerp(activeClip.spikerPos.x - 3.6, activeClip.impactPos.x + 3.2, progress);
        this._camPos.set(THREE.MathUtils.clamp(sweepX, -6.2, 6.2), 2.85 + Math.sin(progress * Math.PI) * 0.7, -2.4 * zSign);
        this._camTarget.copy(this._ballPos).lerp(this._spikerPos, 0.28);
        camera.fov = 38;
        break;
      }
      case 'SPIKER_SHOULDER': {
        const side = activeClip.spikerPos.x >= 0 ? -1.45 : 1.45;
        this._camPos.set(
          this._spikerPos.x + side,
          Math.max(2.35, this._spikerPos.y + 2.1),
          this._spikerPos.z + 3.4 * zSign
        );
        this._camTarget.copy(this._ballPos).lerp(
          new THREE.Vector3(activeClip.impactPos.x, 0.8, activeClip.impactPos.z),
          0.35
        );
        camera.fov = 42;
        break;
      }
      case 'FLOOR_IMPACT_LOW': {
        const sideX = activeClip.impactPos.x >= 0 ? -3.4 : 3.4;
        this._camPos.set(
          THREE.MathUtils.clamp(activeClip.impactPos.x + sideX, -5.8, 5.8),
          0.72,
          THREE.MathUtils.clamp(activeClip.impactPos.z - 2.6 * zSign, -9.8, 9.8)
        );
        this._camTarget.copy(this._ballPos);
        this._camTarget.y = Math.max(0.45, this._ballPos.y * 0.85);
        camera.fov = 35;
        break;
      }
      case 'ORBIT_DRONE':
      default: {
        const orbitTheta = progress * Math.PI * 1.4 + (this.clipIndex % 2 === 0 ? 0.4 : -0.4);
        const radius = 6.8 - Math.sin(progress * Math.PI) * 1.4;
        this._camPos.set(
          this._ballPos.x * 0.4 + Math.cos(orbitTheta) * radius,
          3.4 + Math.sin(progress * Math.PI) * 1.4,
          this._ballPos.z * 0.4 + Math.sin(orbitTheta) * radius
        );
        this._camTarget.copy(this._ballPos).lerp(this._spikerPos, 0.3);
        camera.fov = 40;
        break;
      }
    }

    const lerpAmt = 1 - Math.exp(-12 * rawDt);
    camera.position.lerp(this._camPos, lerpAmt);
    controlsTarget.lerp(this._camTarget, lerpAmt);
    camera.updateProjectionMatrix();

    return true;
  }
}
