import * as THREE from 'three';
import { AudioEQState, IntroMusicPresetId, OrganicPixelBlockState, SwarmModuleSpec } from './types';

/**
 * 120 FPS FrameRateGovernor with rolling 30-frame window & adaptive quality scaling [0.5 .. 1.0].
 */
export class FrameRateGovernor {
  public readonly targetFPS: number;
  public readonly targetFrameTime: number;
  private frameTimes: number[] = [];
  private readonly sampleWindow = 30;
  public adaptiveQualityScale = 1.0;
  public currentFps = 120;
  private lastBeginTime = performance.now();

  constructor(targetFPS = 120) {
    this.targetFPS = targetFPS;
    this.targetFrameTime = 1000 / targetFPS;
  }

  public beginFrame(currentTime: number) {
    this.lastBeginTime = currentTime;
  }

  public endFrame(currentTime: number): { scale: number; fps: number; throttled: boolean } {
    const dt = Math.max(1.0, currentTime - this.lastBeginTime);
    this.frameTimes.push(dt);
    if (this.frameTimes.length > this.sampleWindow) {
      this.frameTimes.shift();
    }

    const avgFrameTime =
      this.frameTimes.reduce((acc, v) => acc + v, 0) / this.frameTimes.length;
    this.currentFps = Math.min(this.targetFPS, Math.max(15, Math.round(1000 / avgFrameTime)));

    if (avgFrameTime > this.targetFrameTime * 1.45) {
      this.adaptiveQualityScale = Math.max(0.55, this.adaptiveQualityScale - 0.03);
    } else if (avgFrameTime < this.targetFrameTime * 1.1) {
      this.adaptiveQualityScale = Math.min(1.0, this.adaptiveQualityScale + 0.01);
    }

    return {
      scale: this.adaptiveQualityScale,
      fps: this.currentFps,
      throttled: this.adaptiveQualityScale < 0.8,
    };
  }
}

/**
 * Off-thread Blob Web Worker running harmonic turbulence (PI + 1.0, 0.618)
 * and adaptive Fractal Fold computation without stalling the main render thread.
 */
export class AGISwarmWorkerBridge {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private fallbackTimer: number | null = null;
  public workerTurbulence = 0.618;
  public fractalFoldN = 3.0;

  constructor() {
    const PI_PLUS_ONE = Math.PI + 1.0;
    const intervalMs = Math.floor(1000 * (PI_PLUS_ONE / 4));

    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const script = `
          const PI_PLUS_ONE = Math.PI + 1.0;
          let tickCount = 0;
          setInterval(() => {
            tickCount++;
            const tf = tickCount * 0.05;
            const growth_turbulence = 0.618 + 0.25 * Math.sin(tf * PI_PLUS_ONE);
            const fractal_fold_n = 3.0 + 0.22 * Math.cos(tf * 1.618);
            postMessage({ type: 'AI_STATE_UPDATE', config: { growth_turbulence, fractal_fold_n } });
          }, ${intervalMs});
        `;
        const blob = new Blob([script], { type: 'application/javascript' });
        this.workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = (e: MessageEvent) => {
          if (e.data?.type === 'AI_STATE_UPDATE' && e.data.config) {
            this.workerTurbulence = e.data.config.growth_turbulence;
            this.fractalFoldN = e.data.config.fractal_fold_n;
          }
        };
        return;
      } catch {
        // Fallback below if CSP blocks blob workers
      }
    }

    let tickCount = 0;
    this.fallbackTimer = window.setInterval(() => {
      tickCount++;
      const tf = tickCount * 0.05;
      this.workerTurbulence = 0.618 + 0.25 * Math.sin(tf * PI_PLUS_ONE);
      this.fractalFoldN = 3.0 + 0.22 * Math.cos(tf * 1.618);
    }, intervalMs);
  }

  public dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    if (this.fallbackTimer !== null) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}

/**
 * Unified Web Audio DSP Engine (`AnalyserNode` fftSize=256 + Harmonic Oscillators).
 * Routes match impacts, whistles, and optional harmonic drone through a single bus.
 */
export class OdonataDSPEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private stadiumDelay: DelayNode | null = null;
  private stadiumDelayGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOscillators: OscillatorNode[] = [];
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  // User MP3 / Music Player routed directly into the live AnalyserNode for Billboard EQ
  private mp3AudioEl: HTMLAudioElement | null = null;
  private mp3SourceNode: MediaElementAudioSourceNode | null = null;
  private mp3Gain: GainNode | null = null;
  private mp3ObjectUrl: string | null = null;
  public mp3TrackName: string | null = null;
  public mp3Playing = false;
  public mp3Volume = 0.85;

  // Built-in Stadium Anthem Beat Sequencer
  private presetTimerId: number | null = null;
  private activePresetId: IntroMusicPresetId = 'SILENT';
  private presetStep = 0;
  private presetStartedAt = 0;
  private clapNoiseBuffer: AudioBuffer | null = null;

  public isDroneRunning = false;
  public bassAmp = 0.0;
  public midAmp = 0.0;
  public trebleAmp = 0.0;

  private ensureContext(): { ctx: AudioContext; destination: AudioNode; reverbSend?: AudioNode } | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.74;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.95, this.audioCtx.currentTime);

      this.masterCompressor = this.audioCtx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-14, this.audioCtx.currentTime);
      this.masterCompressor.knee.setValueAtTime(18, this.audioCtx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(4, this.audioCtx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.004, this.audioCtx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.18, this.audioCtx.currentTime);

      // Warm Arena Hall Delay Send
      this.stadiumDelay = this.audioCtx.createDelay(0.6);
      this.stadiumDelay.delayTime.setValueAtTime(0.23, this.audioCtx.currentTime);
      const delayFeedback = this.audioCtx.createGain();
      delayFeedback.gain.setValueAtTime(0.24, this.audioCtx.currentTime);
      const delayFilter = this.audioCtx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(1450, this.audioCtx.currentTime);
      this.stadiumDelayGain = this.audioCtx.createGain();
      this.stadiumDelayGain.gain.setValueAtTime(0.28, this.audioCtx.currentTime);

      this.stadiumDelay.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(this.stadiumDelay);
      delayFilter.connect(this.stadiumDelayGain);
      this.stadiumDelayGain.connect(this.masterCompressor);

      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      // Pre-build short noise buffer for studio snare/clap/hats
      const nLen = Math.floor(this.audioCtx.sampleRate * 0.25);
      this.clapNoiseBuffer = this.audioCtx.createBuffer(1, nLen, this.audioCtx.sampleRate);
      const nData = this.clapNoiseBuffer.getChannelData(0);
      for (let i = 0; i < nLen; i++) {
        nData[i] = Math.random() * 2 - 1;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return {
      ctx: this.audioCtx,
      destination: this.masterGain ?? this.audioCtx.destination,
      reverbSend: this.stadiumDelay ?? undefined,
    };
  }

  public getDestination(): { ctx: AudioContext; destination: AudioNode; reverbSend?: AudioNode } | null {
    return this.ensureContext();
  }

  public async loadMp3File(file: File): Promise<{ trackName: string; duration: number }> {
    const audio = this.ensureContext();
    if (!audio) {
      throw new Error('Web Audio context unavailable');
    }
    this.stopPresetSequencer();
    this.activePresetId = 'SILENT';
    const { ctx, destination } = audio;

    if (this.mp3ObjectUrl) {
      URL.revokeObjectURL(this.mp3ObjectUrl);
      this.mp3ObjectUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.mp3ObjectUrl = url;
    this.mp3TrackName = file.name.replace(/\.[^.]+$/, '').slice(0, 40);

    if (!this.mp3AudioEl) {
      this.mp3AudioEl = new Audio();
      this.mp3AudioEl.loop = true;
      this.mp3AudioEl.crossOrigin = 'anonymous';
      this.mp3AudioEl.addEventListener('play', () => {
        this.mp3Playing = true;
      });
      this.mp3AudioEl.addEventListener('pause', () => {
        this.mp3Playing = false;
      });
      this.mp3AudioEl.addEventListener('ended', () => {
        this.mp3Playing = false;
      });

      this.mp3SourceNode = ctx.createMediaElementSource(this.mp3AudioEl);
      this.mp3Gain = ctx.createGain();
      this.mp3Gain.gain.setValueAtTime(this.mp3Volume, ctx.currentTime);
      this.mp3SourceNode.connect(this.mp3Gain);
      this.mp3Gain.connect(destination);
    }

    this.mp3AudioEl.src = url;
    this.mp3AudioEl.load();
    await this.mp3AudioEl.play().catch(() => {});
    this.mp3Playing = !this.mp3AudioEl.paused;

    return {
      trackName: this.mp3TrackName,
      duration: Number.isFinite(this.mp3AudioEl.duration) ? this.mp3AudioEl.duration : 0,
    };
  }

  public async toggleMp3Playback(): Promise<boolean> {
    if (this.mp3AudioEl && this.mp3ObjectUrl) {
      this.ensureContext();
      if (this.mp3AudioEl.paused) {
        this.stopPresetSequencer();
        await this.mp3AudioEl.play().catch(() => {});
        this.mp3Playing = !this.mp3AudioEl.paused;
      } else {
        this.mp3AudioEl.pause();
        this.mp3Playing = false;
      }
      return this.mp3Playing;
    }
    if (this.activePresetId !== 'SILENT') {
      if (this.mp3Playing) {
        this.stopPresetSequencer();
        this.mp3Playing = false;
      } else {
        this.playPresetTrack(this.activePresetId);
      }
      return this.mp3Playing;
    }
    return false;
  }

  public setMp3Volume(vol: number) {
    this.mp3Volume = Math.max(0, Math.min(1, vol));
    if (this.mp3Gain && this.audioCtx) {
      this.mp3Gain.gain.setTargetAtTime(this.mp3Volume, this.audioCtx.currentTime, 0.04);
    }
  }

  private stopPresetSequencer() {
    if (this.presetTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.presetTimerId);
      this.presetTimerId = null;
    }
  }

  public stopAllMusic() {
    this.stopPresetSequencer();
    this.activePresetId = 'SILENT';
    if (this.mp3AudioEl && !this.mp3AudioEl.paused) {
      this.mp3AudioEl.pause();
    }
    this.mp3Playing = false;
    this.mp3TrackName = null;
  }

  /**
   * Unconditionally activates or resumes arena music on PLAY click so audio + EQ + skyline pulse immediately.
   */
  public resumeOrAutoStartMusic(preferred: IntroMusicPresetId | 'CUSTOM_MP3' = 'HARBOUR_PULSE'): {
    playing: boolean;
    preset: IntroMusicPresetId | 'CUSTOM_MP3';
  } {
    this.ensureContext();
    if (this.mp3AudioEl && this.mp3ObjectUrl) {
      this.stopPresetSequencer();
      if (this.mp3AudioEl.paused) {
        this.mp3AudioEl.play().catch(() => {});
      }
      this.mp3Playing = true;
      return { playing: true, preset: 'CUSTOM_MP3' };
    }
    const track: IntroMusicPresetId =
      preferred === 'SILENT' || preferred === 'CUSTOM_MP3' ? 'HARBOUR_PULSE' : preferred;
    if (!this.mp3Playing || this.activePresetId !== track) {
      this.playPresetTrack(track);
    }
    return { playing: true, preset: track };
  }

  public playPresetTrack(presetId: IntroMusicPresetId) {
    if (presetId === 'SILENT') {
      this.stopAllMusic();
      return;
    }
    if (this.mp3AudioEl && !this.mp3AudioEl.paused) {
      this.mp3AudioEl.pause();
    }
    this.stopPresetSequencer();
    const audio = this.ensureContext();
    if (!audio) return;

    this.activePresetId = presetId;
    this.presetStep = 0;
    this.presetStartedAt = performance.now() * 0.001;
    this.mp3Playing = true;
    this.mp3TrackName =
      presetId === 'HARBOUR_PULSE'
        ? 'SUNO STUDIO · HARBOUR PULSE ANTHEM'
        : presetId === 'PACIFIC_THUNDER'
        ? 'SUNO STUDIO · PACIFIC THUNDER'
        : 'SUNO STUDIO · VICE NEON GROOVE';

    const bpm = presetId === 'PACIFIC_THUNDER' ? 128 : presetId === 'HARBOUR_PULSE' ? 118 : 106;
    const stepMs = Math.round((60 / bpm / 4) * 1000); // Crisp 16th-note Suno groove engine

    // 4-Bar Chord Progression (Root multipliers: I -> VI -> IV -> V)
    const progMults =
      presetId === 'PACIFIC_THUNDER'
        ? [1.0, 0.891, 0.794, 1.122]
        : presetId === 'HARBOUR_PULSE'
        ? [1.0, 1.189, 0.891, 1.122]
        : [1.0, 0.841, 0.749, 0.944];

    const rootHz = presetId === 'PACIFIC_THUNDER' ? 55.0 : presetId === 'HARBOUR_PULSE' ? 65.41 : 58.27;

    const bassPattern =
      presetId === 'PACIFIC_THUNDER'
        ? [1, 0, 1.5, 0, 1, 0, 1, 1.33, 1, 0, 1.5, 0, 1.33, 1, 1.5, 0]
        : presetId === 'HARBOUR_PULSE'
        ? [1, 0, 0, 1.5, 1, 0, 1.25, 0, 1, 0, 1.5, 0, 1.33, 0, 1.5, 1.25]
        : [1, 0, 1.5, 0, 0, 1.33, 1, 0, 1.5, 0, 1, 0, 1.25, 1.5, 0, 1.33];

    const leadArp =
      presetId === 'PACIFIC_THUNDER'
        ? [4, 0, 6, 4, 8, 0, 6, 5, 4, 6, 0, 8, 6, 0, 5, 6]
        : presetId === 'HARBOUR_PULSE'
        ? [4, 5, 6, 0, 8, 6, 5, 0, 4, 6, 8, 0, 6, 5, 4, 3]
        : [4, 0, 5, 6, 0, 8, 6, 5, 4, 0, 6, 5, 3, 0, 5, 4];

    const triggerStep = () => {
      const bus = this.ensureContext();
      if (!bus || !this.mp3Playing) return;
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const stepInBar = this.presetStep % 16;
      const barIdx = Math.floor(this.presetStep / 16) % 4;
      const chordMult = progMults[barIdx];
      this.presetStep++;

      const masterVol = Math.max(0.08, this.mp3Volume * 0.48);

      // 1. Punchy 808 Sub-Kick on beats & syncopated ghost hits
      const kickHit =
        stepInBar === 0 ||
        stepInBar === 8 ||
        (presetId === 'PACIFIC_THUNDER' && (stepInBar === 3 || stepInBar === 10)) ||
        (presetId !== 'PACIFIC_THUNDER' && (stepInBar === 6 || stepInBar === 14));
      if (kickHit) {
        const isMain = stepInBar === 0 || stepInBar === 8;
        const kick = ctx.createOscillator();
        const kGain = ctx.createGain();
        const kLp = ctx.createBiquadFilter();
        kLp.type = 'lowpass';
        kLp.frequency.setValueAtTime(240, now);
        kick.type = 'sine';
        kick.frequency.setValueAtTime(isMain ? 128 : 96, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.14);
        kGain.gain.setValueAtTime(masterVol * (isMain ? 0.78 : 0.45), now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
        kick.connect(kLp);
        kLp.connect(kGain);
        kGain.connect(destination);
        kick.start(now);
        kick.stop(now + 0.25);
      }

      // 2. Arena Clap / Rimshot Snare on Beats 2 & 4 (step 4 & 12)
      if ((stepInBar === 4 || stepInBar === 12) && this.clapNoiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.clapNoiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1150, now);
        bp.Q.setValueAtTime(1.4, now);
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.001, now);
        cGain.gain.linearRampToValueAtTime(masterVol * 0.24, now + 0.006);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        noise.connect(bp);
        bp.connect(cGain);
        cGain.connect(destination);
        if (reverbSend) cGain.connect(reverbSend);
        noise.start(now);
        noise.stop(now + 0.14);
      }

      // 3. Soft Filtered Studio Hi-Hat Groove (warm upper shimmer <= 3.6kHz, zero harsh sizzle)
      if (stepInBar % 2 === 1 && this.clapNoiseBuffer) {
        const hat = ctx.createBufferSource();
        hat.buffer = this.clapNoiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(3200, now);
        bp.Q.setValueAtTime(2.0, now);
        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(0.001, now);
        hGain.gain.linearRampToValueAtTime(masterVol * 0.065, now + 0.003);
        hGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);
        hat.connect(bp);
        bp.connect(hGain);
        hGain.connect(destination);
        hat.start(now);
        hat.stop(now + 0.05);
      }

      // 4. Driving Harmonic Bassline
      const bRatio = bassPattern[stepInBar];
      if (bRatio > 0) {
        const bass = ctx.createOscillator();
        const bGain = ctx.createGain();
        const bLp = ctx.createBiquadFilter();
        bLp.type = 'lowpass';
        bLp.frequency.setValueAtTime(390, now);
        bLp.Q.setValueAtTime(1.6, now);
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(rootHz * chordMult * bRatio, now);
        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(masterVol * 0.28, now + 0.008);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 1.4);
        bass.connect(bLp);
        bLp.connect(bGain);
        bGain.connect(destination);
        bass.start(now);
        bass.stop(now + (stepMs / 1000) * 1.5);
      }

      // 5. Lush Stadium Brass/Pad Chord Swell on Beat 1 & 3 (steps 0 & 8)
      if (stepInBar === 0 || stepInBar === 8) {
        const chordIntervals = [2.0, 2.5, 3.0, 4.0];
        chordIntervals.forEach((ratio) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(stepInBar === 0 ? 780 : 540, now);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(rootHz * chordMult * ratio, now);
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(masterVol * 0.085, now + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
          osc.connect(lp);
          lp.connect(g);
          g.connect(destination);
          if (reverbSend) g.connect(reverbSend);
          osc.start(now);
          osc.stop(now + 0.6);
        });
      }

      // 6. Melodic Suno Synth Hook Lead (echoed through stadium delay)
      const leadRatio = leadArp[stepInBar];
      if (leadRatio > 0 && (barIdx % 2 === 1 || stepInBar % 4 === 0)) {
        const lead = ctx.createOscillator();
        const lGain = ctx.createGain();
        const lLp = ctx.createBiquadFilter();
        lLp.type = 'lowpass';
        lLp.frequency.setValueAtTime(1150, now);
        lead.type = 'triangle';
        lead.frequency.setValueAtTime(rootHz * chordMult * leadRatio, now);
        lGain.gain.setValueAtTime(0.001, now);
        lGain.gain.linearRampToValueAtTime(masterVol * 0.14, now + 0.01);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        lead.connect(lLp);
        lLp.connect(lGain);
        lGain.connect(destination);
        if (reverbSend) lGain.connect(reverbSend);
        lead.start(now);
        lead.stop(now + 0.21);
      }
    };

    triggerStep();
    if (typeof window !== 'undefined') {
      this.presetTimerId = window.setInterval(triggerStep, stepMs);
    }
  }

  public toggleHarmonicDrone(): boolean {
    const audio = this.ensureContext();
    if (!audio) return false;

    const { ctx, destination } = audio;
    const now = ctx.currentTime;

    if (!this.isDroneRunning) {
      if (!this.droneGain) {
        this.droneGain = ctx.createGain();
        this.droneGain.gain.setValueAtTime(0.0001, now);
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(300, now);
        lowpass.Q.setValueAtTime(0.7, now);
        this.droneGain.connect(lowpass);
        lowpass.connect(destination);
      }

      if (this.droneOscillators.length === 0) {
        // Warm sub-bass & chest resonance chord (zero high-pitch frequencies)
        const freqs = [65.41, 98.0, 130.81, 196.0];
        freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const oscGain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          oscGain.gain.setValueAtTime(0.032, now);
          osc.connect(oscGain);
          oscGain.connect(this.droneGain!);
          osc.start();
          this.droneOscillators.push(osc);
        });
      }

      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setTargetAtTime(1.0, now, 0.08);
      this.isDroneRunning = true;
    } else {
      if (this.droneGain) {
        this.droneGain.gain.cancelScheduledValues(now);
        this.droneGain.gain.setTargetAtTime(0.0001, now, 0.08);
      }
      this.isDroneRunning = false;
    }

    return this.isDroneRunning;
  }

  public sampleFFT(): { bassAmp: number; trebleAmp: number } {
    if (!this.analyser || !this.freqData) {
      this.bassAmp = Math.max(0, this.bassAmp * 0.9);
      this.midAmp = Math.max(0, this.midAmp * 0.9);
      this.trebleAmp = Math.max(0, this.trebleAmp * 0.9);
      return { bassAmp: this.bassAmp, trebleAmp: this.trebleAmp };
    }

    this.analyser.getByteFrequencyData(this.freqData);

    let bassSum = 0;
    for (let i = 0; i < 14; i++) bassSum += this.freqData[i];
    this.bassAmp = bassSum / 14 / 255.0;

    let midSum = 0;
    for (let i = 14; i < 56; i++) midSum += this.freqData[i];
    this.midAmp = midSum / 42 / 255.0;

    let trebleSum = 0;
    const startTreble = 56;
    const count = Math.max(1, this.freqData.length - startTreble);
    for (let i = startTreble; i < this.freqData.length; i++) trebleSum += this.freqData[i];
    this.trebleAmp = trebleSum / count / 255.0;

    return { bassAmp: this.bassAmp, trebleAmp: this.trebleAmp };
  }

  public getSpectrumBins(bucketCount = 32): number[] {
    const out = new Array<number>(bucketCount).fill(0);
    if (!this.freqData) return out;
    const usableBins = Math.min(this.freqData.length, 96);
    const step = Math.max(1, Math.floor(usableBins / bucketCount));
    for (let b = 0; b < bucketCount; b++) {
      let sum = 0;
      for (let i = 0; i < step; i++) {
        sum += this.freqData[b * step + i] || 0;
      }
      out[b] = sum / step / 255.0;
    }
    return out;
  }

  public getAudioEQState(): AudioEQState {
    const isMp3Loaded = Boolean(this.mp3AudioEl && this.mp3ObjectUrl);
    const presetTime = this.activePresetId !== 'SILENT' && this.mp3Playing
      ? Math.max(0, performance.now() * 0.001 - this.presetStartedAt) % 120
      : 0;
    return {
      trackName: this.mp3TrackName,
      isPlaying: this.mp3Playing,
      currentTime: isMp3Loaded ? this.mp3AudioEl?.currentTime || 0 : presetTime,
      duration:
        isMp3Loaded && this.mp3AudioEl && Number.isFinite(this.mp3AudioEl.duration)
          ? this.mp3AudioEl.duration
          : this.activePresetId !== 'SILENT'
          ? 120
          : 0,
      volume: this.mp3Volume,
      bassLevel: Number(this.bassAmp.toFixed(2)),
      midLevel: Number(this.midAmp.toFixed(2)),
      highLevel: Number(this.trebleAmp.toFixed(2)),
      bins: this.getSpectrumBins(16),
    };
  }

  public dispose() {
    this.stopPresetSequencer();
    if (this.mp3AudioEl) {
      this.mp3AudioEl.pause();
      this.mp3AudioEl.src = '';
    }
    if (this.mp3ObjectUrl) {
      URL.revokeObjectURL(this.mp3ObjectUrl);
      this.mp3ObjectUrl = null;
    }
    this.droneOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore stopped oscillators
      }
    });
    this.droneOscillators = [];
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.analyser = null;
  }
}

/**
 * Quantum Organic Screen OS v10.5 - Living Cellular Membrane Surface Shader
 * Ported directly from `Paste_November_12__2026_-_10_29PM_aa016d56` to drive the 3D court's
 * reactive bio-membrane floor waves, ball-impact kinetic ripples, and cellular matrix grid.
 */
export function createOrganicCourtMembraneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTouchPos: { value: new THREE.Vector2(0.5, 0.5) },
      uTouchTime: { value: -10.0 },
      uMitosis: { value: 1.0 },
      uBiolume: { value: 1.0 },
      uBassAmp: { value: 0.0 },
      uRippleStrength: { value: 0.0 },
      uMatrixEnabled: { value: 1.0 },
      uOpacity: { value: 0.24 },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uTouchPos;
      uniform float uTouchTime;
      uniform float uMitosis;
      varying vec2 vUv;
      varying float vElevation;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Organic biological wave displacement constrained smoothly to court surface millimeter scale
        float wave1 = sin(pos.x * 0.9 + uTime * 1.8) * cos(pos.y * 0.7 + uTime * 1.5);
        float wave2 = sin(length(pos.xy) * 1.1 - uTime * 2.2);
        float elevation = (wave1 * 0.008 + wave2 * 0.006) * uMitosis;

        // Touch / Ball Impact radial ripple deformation
        float distToTouch = distance(uv, uTouchPos);
        float age = max(0.0, uTime - uTouchTime);
        if (age < 2.2) {
          float ripple = sin(distToTouch * 28.0 - age * 10.0) * exp(-distToTouch * 4.5) * exp(-age * 1.6);
          elevation += ripple * 0.032;
        }

        pos.z += elevation;
        vElevation = elevation;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uTouchPos;
      uniform float uTouchTime;
      uniform float uBiolume;
      uniform float uBassAmp;
      uniform float uRippleStrength;
      uniform float uMatrixEnabled;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vElevation;

      void main() {
        vec3 bioCyan = vec3(0.06, 0.95, 0.75);
        vec3 bioEmerald = vec3(0.05, 0.65, 0.42);
        vec3 bioDark = vec3(0.01, 0.05, 0.10);

        float mixFactor = smoothstep(-0.02, 0.025, vElevation);
        vec3 tissueColor = mix(bioDark, bioEmerald, mixFactor);
        tissueColor = mix(tissueColor, bioCyan, clamp(vElevation * 16.0 + 0.25, 0.0, 1.0));

        // Subtle cellular membrane lattice overlay
        vec2 cellUv = fract(vUv * vec2(18.0, 36.0)) - 0.5;
        float borderDist = max(abs(cellUv.x), abs(cellUv.y));
        float membraneCell = smoothstep(0.45, 0.495, borderDist) * uMatrixEnabled;

        // Expanding radial bioluminescent shockwave ring at ball/touch point
        float distToTouch = distance(vUv, uTouchPos);
        float age = max(0.0, uTime - uTouchTime);
        float ring = 0.0;
        if (age < 1.8) {
          float radius = age * 0.34;
          ring = smoothstep(0.045, 0.0, abs(distToTouch - radius)) * exp(-age * 1.8);
        }

        vec3 finalColor = mix(tissueColor, bioCyan * 1.45, membraneCell * 0.42);
        finalColor += bioCyan * ring * (1.2 + uRippleStrength * 0.8 + uBassAmp * 0.5);

        float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.x * 6.0);
        float alpha = clamp(uOpacity * (0.4 + membraneCell * 0.6) + ring * 0.55, 0.0, 0.75);
        gl_FragColor = vec4(finalColor * pulse * uBiolume, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Custom Odonata-Net Toroidal / Hexagonal Halo Shader for distant overhead arena frame.
 */
export function createOdonataSwarmMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0 },
      u_touch: { value: new THREE.Vector2(0.5, 0.5) },
      u_touchActive: { value: 1.0 },
      u_bassAmp: { value: 0.0 },
      u_trebleAmp: { value: 0.0 },
      u_turbulence: { value: 0.618 },
      u_fractalFold: { value: 3.0 },
      u_qualityScale: { value: 1.0 },
      u_huntMode: { value: 1.0 },
      u_opacity: { value: 0.52 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float u_time;
      uniform vec2 u_touch;
      uniform float u_touchActive;
      uniform float u_bassAmp;
      uniform float u_trebleAmp;
      uniform float u_turbulence;
      uniform float u_fractalFold;
      uniform float u_qualityScale;
      uniform float u_huntMode;
      uniform float u_opacity;

      void main() {
        vec2 st = (vUv - 0.5) * 2.0;
        vec2 touchNorm = (u_touch - 0.5) * 2.0;
        float dist = length(st - touchNorm);

        float zoom = 1.0 + u_huntMode * 0.3 + (u_bassAmp * 0.22);
        vec2 scaledSt = st * zoom;

        float r = length(scaledSt);
        float theta = atan(scaledSt.y, scaledSt.x);
        float warpZ = cos(r * 8.0 - u_time * 1.5) * sin(theta * 3.0 + u_time) * (0.15 + u_turbulence * 0.1);
        vec2 warpedSt = scaledSt + vec2(cos(warpZ), sin(warpZ)) * 0.08;

        vec2 z = warpedSt;
        float n = clamp(u_fractalFold, 2.2, 4.0);
        float m = 0.0;
        for (int i = 0; i < 4; i++) {
          float r2 = dot(z, z);
          if (r2 > 4.0) break;
          float thetaIt = atan(z.y, z.x) * n;
          float zr = pow(max(r2, 0.0001), n * 0.5);
          z = zr * vec2(cos(thetaIt), sin(thetaIt)) + warpedSt;
          m += sin(z.x * z.y + u_time);
        }

        vec2 hexCoord = warpedSt * (14.0 * max(0.5, u_qualityScale));
        vec2 fHex = fract(hexCoord) - 0.5;
        float compoundEyeMask = smoothstep(0.40, 0.48, length(fHex));

        float voltageSpark = smoothstep(0.92, 1.0, abs(sin(warpedSt.x * 36.0 + u_time * 16.0))) * (0.12 + u_trebleAmp);
        float huntReticle = smoothstep(0.03, 0.0, abs(dist - (0.22 + sin(u_time * 4.0) * 0.03))) * u_huntMode;

        vec3 deepAbyss = vec3(0.01, 0.03, 0.09);
        vec3 cinematicTeal = vec3(0.02, 0.45, 0.80);
        vec3 cinematicOrange = vec3(0.96, 0.45, 0.12);

        vec3 color = mix(deepAbyss, cinematicTeal, clamp(m * 0.25 + 0.5, 0.0, 1.0));
        color = mix(color, cinematicOrange, clamp(voltageSpark * 0.9, 0.0, 1.0));
        color *= mix(0.75, 1.15, compoundEyeMask);
        color += vec3(0.1, 0.92, 0.55) * huntReticle * 1.1;

        float alpha = clamp(u_opacity + u_bassAmp * 0.22, 0.12, 0.85);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export interface ScreenSensorOverlayInput {
  smoothX: number;
  smoothY: number;
  velMag: number;
  microZoom: number;
  active: boolean;
}

/**
 * Screen-Space Bioluminescent Membrane Ripple Matrix & Screen Sensor Canvas Renderer
 * Kept crisp and unobtrusive along the court viewport while responding to continuous pointer/touch velocity
 * with smooth radial micro-zoom distortion and ripple waves.
 */
export function renderMembraneRippleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number,
  block: OrganicPixelBlockState,
  sensor?: ScreenSensorOverlayInput
) {
  ctx.clearRect(0, 0, width, height);
  if (!block.cellularMatrixEnabled || width <= 0 || height <= 0) return;

  const cols = width < 640 ? 9 : 14;
  const rows = width < 640 ? 14 : 10;
  const cellW = width / cols;
  const cellH = height / rows;

  const touchPxX = block.lastTouchUV.x * width;
  const touchPxY = block.lastTouchUV.y * height;
  const touchAge = timeSec - block.lastRippleTimeSec;

  const sX = (sensor ? sensor.smoothX : block.lastTouchUV.x) * width;
  const sY = (sensor ? sensor.smoothY : block.lastTouchUV.y) * height;
  const sensorVel = sensor ? sensor.velMag : 0;
  const zoomPull = sensor ? sensor.microZoom : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = c * cellW + cellW * 0.5;
      const baseY = r * cellH + cellH * 0.5;

      const sdx = baseX - sX;
      const sdy = baseY - sY;
      const sDist = Math.hypot(sdx, sdy);
      const sensorField = Math.max(0, 1.0 - sDist / 230);
      const warpMag = sensorField * (6.5 + sensorVel * 18.0 + zoomPull * 9.0);
      const midX = sDist > 1 ? baseX + (sdx / sDist) * warpMag : baseX;
      const midY = sDist > 1 ? baseY + (sdy / sDist) * warpMag : baseY;

      const dist = Math.hypot(midX - touchPxX, midY - touchPxY);
      const waveIntensity =
        touchAge >= 0 && touchAge < 2.2
          ? Math.max(0, 1.0 - dist / 240) * Math.sin(touchAge * 10 - dist * 0.05) * Math.exp(-touchAge * 0.9)
          : 0;

      const organicPulse = 0.18 + 0.14 * Math.sin(timeSec * 2.4 + c * 0.45 + r * 0.45);
      const sensorGlow = sensor?.active ? sensorField * (0.24 + sensorVel * 0.35) : 0;
      const alpha = Math.min(0.46, Math.abs(waveIntensity) * 0.62 + organicPulse * 0.16 + sensorGlow);

      ctx.fillStyle =
        waveIntensity > 0.08
          ? `rgba(52, 211, 153, ${alpha})`
          : sensorGlow > 0.14
          ? `rgba(0, 240, 255, ${alpha})`
          : `rgba(16, 185, 129, ${alpha * 0.42})`;
      ctx.beginPath();
      ctx.arc(midX, midY, 1.45 + Math.abs(waveIntensity) * 2.6 + sensorField * 1.4, 0, Math.PI * 2);
      ctx.fill();

      if ((waveIntensity > 0.12 || sensorGlow > 0.18) && c < cols - 1) {
        ctx.strokeStyle =
          sensorGlow > 0.18
            ? `rgba(0, 240, 255, ${alpha * 0.28})`
            : `rgba(16, 185, 129, ${alpha * 0.32})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX + cellW, midY);
        ctx.stroke();
      }
    }
  }

  // Subtle corner-bracket Screen Sensor focal reticle when active pointer/touch is sensing viewport
  if (sensor && (sensor.active || sensorVel > 0.03)) {
    const rad = 16 + sensorVel * 14 + zoomPull * 10;
    const reticleAlpha = Math.min(0.45, 0.14 + sensorVel * 0.55 + zoomPull * 0.25);
    ctx.strokeStyle = `rgba(0, 240, 255, ${reticleAlpha})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(sX, sY, rad, -0.35, 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sX, sY, rad, Math.PI - 0.35, Math.PI + 0.35);
    ctx.stroke();
  }
}

export function createInitialSwarmModules(): SwarmModuleSpec[] {
  return [
    {
      id: 'pixelblock-organic-tissue',
      name: 'PixelBlock_0x01 Organic Membrane',
      category: 'TISSUE',
      status: 'ACTIVE',
      latencyMs: 0.09,
      isolated: false,
      codePreview: {
        ts: `struct OrganicPixelBlock {\n  atpFlux: number;       // [0..1] Team stamina & rally surge\n  tissueMass: number;    // [1.0..1.65] Mitosis tempo scalar\n  rippleKinetic: number; // [0..1] Ball impact membrane impulse\n  lumenGlow: number;     // [0.8..1.4] Photon emission luminance\n};`,
        glsl: `float ripple = sin(distToTouch * 28.0 - age * 10.0) * exp(-distToTouch * 4.5);\npos.z += (wave1 * 0.008 + ripple * 0.032) * uMitosis;`,
        fsm: `ON_TOUCH | ON_BOUNCE -> inject(uTouchPos, uTouchTime) -> emit biolume ring`,
      },
    },
    {
      id: 'ballistic-raycaster',
      name: 'BallisticTrajectoryRaycaster',
      category: 'PERCEPTION',
      status: 'ACTIVE',
      latencyMs: 0.11,
      isolated: false,
      codePreview: {
        ts: `calculateBallIntercept(pos, vel, targetY): InterceptResult {\n  const a = 0.5 * this.GRAVITY, b = vel.y, c = pos.y - targetY;\n  const t = Math.max((-b - Math.sqrt(b*b - 4*a*c)) / (2*a), 0.04);\n  return { point: projectXZ(pos, vel, t), timeToIntercept: t };\n}`,
        glsl: `float ring = smoothstep(0.045, 0.0, abs(distToTouch - age * 0.34));`,
        fsm: `STATE[PLAY] -> intercept(y=1.05m) -> project floor target ring (zero trajectory lines)`,
      },
    },
    {
      id: 'fivb-rulebook-fsm',
      name: 'FIVBStateMachine3HitRulebook',
      category: 'RULEBOOK',
      status: 'ACTIVE',
      latencyMs: 0.07,
      isolated: false,
      codePreview: {
        ts: `if (sideTouches >= 3) triggerViolation('FOUR_HITS_FIVB_9_1');\nif (lastContact === unit) triggerViolation('DOUBLE_CONTACT_9_3_4');\nfunction rotateClockwise(team) { zone = zone === 1 ? 6 : zone - 1; }`,
        glsl: `vec3 tissueColor = mix(bioDark, bioEmerald, smoothstep(-0.02, 0.025, vElevation));`,
        fsm: `SERVE_FORMATION -> TOUCH_1_PASS -> TOUCH_2_SET -> TOUCH_3_ATTACK -> SIDE_OUT_ROTATE`,
      },
    },
    {
      id: 'odonata-hunt-tracker',
      name: 'OdonataHuntPreyVectorLock',
      category: 'KINEMATICS',
      status: 'ACTIVE',
      latencyMs: 0.16,
      isolated: true,
      codePreview: {
        ts: `const boost = huntMode ? 1.14 * (1 + workerTurbulence * 0.08) : 1.0;\nconst reqSpeed = distToIntercept / Math.max(0.14, timeToContact - 0.08);\nunit.velocity.lerp(targetVel * boost, dt * 16.0);`,
        glsl: `float huntReticle = smoothstep(0.03, 0.0, abs(dist - (0.22 + sin(u_time*4.0)*0.03))) * u_huntMode;`,
        fsm: `HUNT_MODE[LOCKED] -> hierarchical skeleton [hips -> torso -> neck -> head] zero detachment`,
      },
    },
    {
      id: 'odonata-dsp-analyser',
      name: 'OdonataWebAudioDSP',
      category: 'ACOUSTICS',
      status: 'ACTIVE',
      latencyMs: 0.14,
      isolated: false,
      codePreview: {
        ts: `analyser.getByteFrequencyData(freqData);\nbassAmp = avg(freqData[0..15]) / 255.0;\ntrebleAmp = avg(freqData[80..127]) / 255.0;`,
        glsl: `finalColor += bioCyan * ring * (1.2 + uRippleStrength * 0.8 + uBassAmp * 0.5);`,
        fsm: `ROUTE: [SpikeImpact, Whistle, Block, HarmonicOscs] -> Analyser(fft=256)`,
      },
    },
    {
      id: 'gemini-tactical-sync',
      name: 'GeminiBrainTacticalBridge',
      category: 'BRAIN',
      status: 'ACTIVE',
      latencyMs: 0.22,
      isolated: false,
      codePreview: {
        ts: `POST /api/gemini-brain/sync { unitsTelemetry, interceptXZ, turbulence }\n-> updates playerPositioningMatrix offsets & real-time voice commentary`,
        glsl: `float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.x * 6.0);`,
        fsm: `WRITE /gemini-brain-state.json -> compute unit offsets -> sync team strategy`,
      },
    },
  ];
}
