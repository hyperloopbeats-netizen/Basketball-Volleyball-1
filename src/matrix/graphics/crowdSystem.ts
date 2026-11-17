import * as THREE from 'three';
import { CrowdMoodState, GameState } from '../../types';

interface CrowdSeat {
  baseX: number;
  baseY: number;
  baseZ: number;
  rotY: number;
  scale: number;
  phase: number;
  waveAngle: number;
  teamBias: 'A' | 'B' | 'N';
  hasTowel: boolean;
}

/**
 * CrowdSystem
 * Dynamic stadium crowd that reacts directly to match development:
 *  - Builds excitement from rally length, fast spike velocity, momentum, & late-set tension
 *  - Executes sweeping stadium waves, rhythmic cheering jumps & waving towels/light batons
 *  - Synthesizes warm, low-pass-filtered crowd roar swells (strictly <= 520 Hz, zero high-pitch hiss)
 */
export class CrowdSystem {
  private readonly parentGroup: THREE.Group;
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly towelMesh: THREE.InstancedMesh;
  private readonly seats: CrowdSeat[] = [];
  private readonly towelIndices: number[] = [];

  private excitement = 0.24;
  private targetExcitement = 0.24;
  private cheerBurstTimer = 0;
  private cheerTeam: 'A' | 'B' | 'N' = 'N';
  private wavePhase = 0;
  private lastAudioSwellTime = 0;
  private cheerLabel = 'ARENA WARMUP';

  // Pre-allocated zero-GC scratch math helpers
  private readonly _dummy = new THREE.Object3D();
  private readonly _col = new THREE.Color();

  constructor(parentGroup: THREE.Group) {
    this.parentGroup = parentGroup;

    const palette = [0x0f766e, 0x0284c7, 0xbe123c, 0xff3d7f, 0x334155, 0x1e293b, 0xd97706];

    // Generate 4 stadium tiers across West (-X), East (+X), North (-Z), and South (+Z) stands
    let seatIdx = 0;
    const addStand = (side: 'WEST' | 'EAST' | 'NORTH' | 'SOUTH', rows: number, cols: number) => {
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const jitter = ((seatIdx * 73) % 100) / 100 - 0.5;
          let bx = 0;
          let by = 1.28 + r * 1.15;
          let bz = 0;
          let rotY = 0;
          let teamBias: 'A' | 'B' | 'N' = 'N';

          if (side === 'WEST') {
            bx = -12.25 - r * 1.38;
            bz = -13.2 + (k / Math.max(1, cols - 1)) * 26.4 + jitter * 0.28;
            rotY = Math.PI / 2;
            teamBias = bz > 0 ? 'A' : 'B';
          } else if (side === 'EAST') {
            bx = 12.25 + r * 1.38;
            bz = -13.2 + (k / Math.max(1, cols - 1)) * 26.4 + jitter * 0.28;
            rotY = -Math.PI / 2;
            teamBias = bz > 0 ? 'A' : 'B';
          } else if (side === 'NORTH') {
            bx = -11.8 + (k / Math.max(1, cols - 1)) * 23.6 + jitter * 0.28;
            bz = -16.6 - r * 1.38;
            rotY = 0;
            teamBias = bx < 0 ? 'A' : 'B';
          } else {
            bx = -11.8 + (k / Math.max(1, cols - 1)) * 23.6 + jitter * 0.28;
            bz = 16.6 + r * 1.38;
            rotY = Math.PI;
            teamBias = bx < 0 ? 'A' : 'B';
          }

          this.seats.push({
            baseX: bx,
            baseY: by,
            baseZ: bz,
            rotY,
            scale: 0.9 + ((seatIdx * 29) % 10) * 0.02,
            phase: (seatIdx * 0.6180339) % (Math.PI * 2),
            waveAngle: Math.atan2(bz, bx),
            teamBias,
            hasTowel: seatIdx % 4 === 0,
          });

          if (seatIdx % 4 === 0) {
            this.towelIndices.push(seatIdx);
          }
          seatIdx++;
        }
      }
    };

    addStand('WEST', 4, 24);
    addStand('EAST', 4, 24);
    addStand('NORTH', 4, 22);
    addStand('SOUTH', 4, 22);

    const specGeo = new THREE.CapsuleGeometry(0.17, 0.36, 4, 8);
    const specMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.06,
    });
    this.bodyMesh = new THREE.InstancedMesh(specGeo, specMat, this.seats.length);
    this.bodyMesh.frustumCulled = false;

    const towelGeo = new THREE.BoxGeometry(0.24, 0.32, 0.04);
    const towelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.25,
    });
    this.towelMesh = new THREE.InstancedMesh(towelGeo, towelMat, Math.max(1, this.towelIndices.length));
    this.towelMesh.frustumCulled = false;

    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      this._dummy.position.set(s.baseX, s.baseY, s.baseZ);
      this._dummy.rotation.set(0, s.rotY, 0);
      this._dummy.scale.setScalar(s.scale);
      this._dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);
      const colHex =
        s.teamBias === 'A' && i % 3 === 0
          ? 0x0891b2
          : s.teamBias === 'B' && i % 3 === 0
          ? 0xe11d48
          : palette[i % palette.length];
      this.bodyMesh.setColorAt(i, this._col.setHex(colHex));
    }

    for (let t = 0; t < this.towelIndices.length; t++) {
      const s = this.seats[this.towelIndices[t]];
      this._dummy.position.set(s.baseX, s.baseY + 0.56, s.baseZ);
      this._dummy.rotation.set(0, s.rotY, 0);
      this._dummy.scale.setScalar(s.scale);
      this._dummy.updateMatrix();
      this.towelMesh.setMatrixAt(t, this._dummy.matrix);
      this.towelMesh.setColorAt(
        t,
        this._col.setHex(s.teamBias === 'A' ? 0x00f0ff : s.teamBias === 'B' ? 0xff3d7f : 0xffb347)
      );
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    this.bodyMesh.computeBoundingSphere();

    this.towelMesh.instanceMatrix.needsUpdate = true;
    if (this.towelMesh.instanceColor) this.towelMesh.instanceColor.needsUpdate = true;
    this.towelMesh.computeBoundingSphere();

    this.parentGroup.add(this.bodyMesh);
    this.parentGroup.add(this.towelMesh);
  }

  public triggerCheer(team: 'A' | 'B' | 'N', intensity: number, label: string) {
    this.cheerTeam = team;
    this.cheerBurstTimer = Math.max(this.cheerBurstTimer, 1.4 + intensity * 1.3);
    this.excitement = Math.max(this.excitement, THREE.MathUtils.clamp(0.55 + intensity * 0.45, 0, 1));
    this.cheerLabel = label;
  }

  /**
   * Warm stadium crowd cheer/applause synthesized strictly with low-pass-filtered pink/brown noise (<= 520 Hz)
   * so there is ZERO high-pitch hiss or harsh squeal.
   */
  public playWarmCrowdSwell(
    audioCtx: AudioContext,
    destination: AudioNode,
    volume: number,
    intensity: number
  ) {
    const nowMs = performance.now();
    if (nowMs - this.lastAudioSwellTime < 850 || volume <= 0.02) return;
    this.lastAudioSwellTime = nowMs;

    try {
      const dur = 1.05 + intensity * 0.55;
      const sampleRate = audioCtx.sampleRate;
      const len = Math.floor(sampleRate * dur);
      const buffer = audioCtx.createBuffer(1, len, sampleRate);
      const data = buffer.getChannelData(0);

      // Brown/warm pink noise generator (heavily weighted toward warm low-mid crowd rumble)
      let lastOut = 0.0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.035 * white) / 1.035;
        data[i] = lastOut * 2.8;
      }

      const src = audioCtx.createBufferSource();
      src.buffer = buffer;

      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(210, audioCtx.currentTime);
      bandpass.Q.setValueAtTime(0.65, audioCtx.currentTime);

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(500, audioCtx.currentTime);

      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      const peak = Math.min(0.14, (0.045 + intensity * 0.08) * volume);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      src.connect(bandpass);
      bandpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(destination);

      src.start(now);
      src.stop(now + dur + 0.05);
    } catch {
      // Autoplay guard
    }
  }

  public update(dt: number, elapsedSec: number, state: GameState) {
    // Derive excitement organically from live match progression + uploaded MP3 music
    const maxScore = Math.max(state.scoreA, state.scoreB);
    const closeness = 1 - Math.min(1, Math.abs(state.scoreA - state.scoreB) / 8);
    const lateSetTension = maxScore >= 20 ? 0.28 : maxScore >= 14 ? 0.14 : 0.02;
    const rallyEnergy = THREE.MathUtils.clamp(state.rallyCount * 0.045, 0, 0.34);
    const spikeEnergy = state.ballSpeedKmh >= 75 ? 0.24 : state.ballSpeedKmh >= 55 ? 0.1 : 0;
    const momentumPeak = Math.max(state.momentumA, state.momentumB) / 100;

    const eq = state.audioEQ;
    const musicPlaying = Boolean(eq?.isPlaying);
    const bass = musicPlaying ? THREE.MathUtils.clamp(eq?.bassLevel ?? 0, 0, 1) : 0;
    const mid = musicPlaying ? THREE.MathUtils.clamp(eq?.midLevel ?? 0, 0, 1) : 0;
    const high = musicPlaying ? THREE.MathUtils.clamp(eq?.highLevel ?? 0, 0, 1) : 0;
    const isCeremony = state.ceremonyPhase === 'OPENING_CEREMONY' || state.ceremonyPhase === 'INTERMISSION';
    const musicBoost = musicPlaying ? (isCeremony ? 0.45 : 0.22) + bass * 0.32 + mid * 0.14 : 0;

    this.targetExcitement = THREE.MathUtils.clamp(
      0.16 +
        lateSetTension * (0.5 + closeness * 0.5) +
        rallyEnergy +
        spikeEnergy +
        momentumPeak * 0.22 +
        (state.hyperDriveActive ? 0.18 : 0) +
        musicBoost +
        (isCeremony ? 0.18 : 0),
      0.15,
      1.0
    );

    if (this.cheerBurstTimer > 0) {
      this.cheerBurstTimer = Math.max(0, this.cheerBurstTimer - dt);
      this.wavePhase += dt * (4.4 + bass * 2.6);
      this.excitement = THREE.MathUtils.lerp(this.excitement, Math.max(0.75, this.targetExcitement), Math.min(1, dt * 6));
    } else {
      this.wavePhase += dt * (1.2 + this.excitement * 1.8 + mid * 2.8);
      this.excitement = THREE.MathUtils.lerp(this.excitement, this.targetExcitement, Math.min(1, dt * 2.4));
      if (state.ceremonyPhase === 'OPENING_CEREMONY') {
        this.cheerLabel = musicPlaying ? 'OPENING CEREMONY BEAT WAVE' : 'OPENING CEREMONY SHOWCASE';
      } else if (state.ceremonyPhase === 'INTERMISSION') {
        this.cheerLabel = musicPlaying ? 'INTERMISSION MUSIC GROOVE' : 'SET BREAK STADIUM SHOW';
      } else if (musicPlaying && bass > 0.36) {
        this.cheerLabel = 'MUSIC-SYNCED ARENA BOUNCE';
      } else if (state.rallyCount >= 6) {
        this.cheerLabel = 'LONG RALLY ELECTRICITY';
      } else if (maxScore >= 22) {
        this.cheerLabel = 'CRUNCH TIME STADIUM ROAR';
      } else if (state.hyperDriveActive) {
        this.cheerLabel = 'HYPER-DRIVE STANDING OVATION';
      } else if (this.excitement > 0.55) {
        this.cheerLabel = 'CROWD SURGE RISING';
      } else {
        this.cheerLabel = 'VICE COAST CROWD BUZZ';
      }
    }

    const ceremonyAmp = isCeremony ? 1.28 : 1.0;
    const waveAmp = (this.cheerBurstTimer > 0 ? 0.36 : this.excitement * 0.14 + mid * 0.18) * ceremonyAmp;
    const hopFreq = 5.5 + this.excitement * 4.8 + bass * 3.8;

    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const teamBonus =
        this.cheerBurstTimer > 0 && s.teamBias === this.cheerTeam ? 1.45 : 1.0;

      // Stadium wave sweeping cleanly around the arena perimeter
      const waveVal = Math.max(0, Math.sin(s.waveAngle * 2.0 - this.wavePhase));
      const beatLift = musicPlaying ? bass * 0.22 * (0.65 + 0.35 * Math.sin(elapsedSec * 7.2 + s.phase)) : 0;
      const bounce =
        (Math.abs(Math.sin(elapsedSec * hopFreq + s.phase)) *
          (0.04 + this.excitement * 0.24) +
          beatLift) *
        teamBonus *
        ceremonyAmp;
      const yLift = bounce + waveVal * waveAmp * teamBonus;
      const swayZ = Math.sin(elapsedSec * (2.4 + mid * 3.2) + s.phase) * (0.04 + this.excitement * 0.08 + mid * 0.08);

      this._dummy.position.set(s.baseX, s.baseY + yLift, s.baseZ);
      this._dummy.rotation.set(swayZ, s.rotY, swayZ * 0.6);
      this._dummy.scale.set(
        s.scale,
        s.scale * (1.0 + yLift * 0.28),
        s.scale
      );
      this._dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;

    for (let t = 0; t < this.towelIndices.length; t++) {
      const idx = this.towelIndices[t];
      const s = this.seats[idx];
      const teamBonus =
        this.cheerBurstTimer > 0 && s.teamBias === this.cheerTeam ? 1.5 : 1.0;
      const waveVal = Math.max(0, Math.sin(s.waveAngle * 2.0 - this.wavePhase));
      const twirl = Math.sin(elapsedSec * (6.5 + this.excitement * 6.0 + high * 6.0) + s.phase);
      const yLift =
        (0.05 + this.excitement * 0.28 + bass * 0.22 + waveVal * waveAmp) * teamBonus * ceremonyAmp;

      this._dummy.position.set(
        s.baseX + twirl * (0.08 + mid * 0.08),
        s.baseY + 0.56 + yLift,
        s.baseZ
      );
      this._dummy.rotation.set(twirl * (0.45 + high * 0.4), s.rotY, twirl * 0.65);
      const towelScale = s.scale * (0.65 + this.excitement * 0.65 + high * 0.28);
      this._dummy.scale.setScalar(towelScale);
      this._dummy.updateMatrix();
      this.towelMesh.setMatrixAt(t, this._dummy.matrix);
    }
    this.towelMesh.instanceMatrix.needsUpdate = true;
  }

  public getMoodState(): CrowdMoodState {
    return {
      excitement: Number(this.excitement.toFixed(2)),
      waveActive: this.cheerBurstTimer > 0 || this.excitement > 0.72,
      cheerLabel: this.cheerLabel,
      decibelLevel: Math.round(68 + this.excitement * 46),
    };
  }

  public dispose() {
    this.bodyMesh.geometry.dispose();
    (this.bodyMesh.material as THREE.Material).dispose();
    this.towelMesh.geometry.dispose();
    (this.towelMesh.material as THREE.Material).dispose();
  }
}
