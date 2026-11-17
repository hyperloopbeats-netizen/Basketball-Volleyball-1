import * as THREE from 'three';

export interface AudioBusTarget {
  ctx: AudioContext;
  destination: AudioNode;
  reverbSend?: AudioNode;
}

/**
 * BasketballAudioEngine
 * Procedural hardwood/leather dribble thuds, nylon net swish noise sweeps,
 * metallic breakaway rim clanks, tempered-glass backboard thumps,
 * studio-filtered sneaker squeaks, chest pass snaps, and twin-reed shot-clock horns.
 */
export class BasketballAudioEngine {
  private noiseBuffer: AudioBuffer | null = null;
  private noiseSampleRate = 0;

  private lastBounceTimeMs = 0;
  private lastSqueakTimeMs = 0;
  private lastRimTimeMs = 0;
  private lastBackboardTimeMs = 0;

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseSampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    this.noiseSampleRate = ctx.sampleRate;
    return buf;
  }

  /**
   * Authentic pressurized leather basketball bounce calibrated to court surface & wetness.
   */
  public playDribbleBounce(
    bus: AudioBusTarget | null,
    impactSpeed = 5.5,
    surface: boolean | 'HARDWOOD' | 'OLYMPIC_BLUE' | 'SAND' | 'CYBER' = true,
    wetness = 0
  ) {
    if (!bus) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBounceTimeMs < 72) return;
    this.lastBounceTimeMs = nowMs;

    const surf =
      typeof surface === 'boolean' ? (surface ? 'HARDWOOD' : 'OLYMPIC_BLUE') : surface;

    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const pwr = THREE.MathUtils.clamp(impactSpeed / 9.0, 0.22, 1.15);
      const wetFactor = THREE.MathUtils.clamp(wetness, 0, 1);

      const startHz =
        surf === 'SAND'
          ? 105
          : surf === 'CYBER'
          ? 185
          : surf === 'HARDWOOD'
          ? 148
          : 138;
      const endHz = surf === 'SAND' ? 36 : surf === 'CYBER' ? 62 : 46;
      const lpCutoff =
        (surf === 'SAND' ? 210 : surf === 'CYBER' ? 520 : surf === 'HARDWOOD' ? 370 : 300) *
        (1 - wetFactor * 0.3);

      // 1. Chesty basketball hollow air-cavity thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(lpCutoff, now);
      lp.Q.setValueAtTime(surf === 'CYBER' ? 2.2 : 1.1, now);

      osc.type = surf === 'CYBER' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(startHz + pwr * 28, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + (surf === 'SAND' ? 0.065 : 0.095));

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime((surf === 'SAND' ? 0.16 : 0.24) * pwr, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + (surf === 'SAND' ? 0.09 : 0.125));

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(destination);
      if (reverbSend && pwr > 0.55) gain.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.14);

      // 2. Surface texture transient (maple crack / sand crunch / wet splash)
      const noise = ctx.createBufferSource();
      noise.buffer = this.ensureNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(
        surf === 'SAND' ? 920 : wetFactor > 0.25 ? 1150 : surf === 'HARDWOOD' ? 540 : 440,
        now
      );
      bp.Q.setValueAtTime(surf === 'SAND' ? 0.9 : 1.4, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(
        (surf === 'SAND' ? 0.11 : 0.075 + wetFactor * 0.05) * pwr,
        now + 0.003
      );
      nGain.gain.exponentialRampToValueAtTime(0.0008, now + (surf === 'SAND' ? 0.075 : 0.045));

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.085);
    } catch {
      // Ignore WebAudio autoplay guard
    }
  }

  /**
   * Crisp chest-pass release / catch thump.
   */
  public playPassSnap(bus: AudioBusTarget | null, isCatch = false) {
    if (!bus) return;
    try {
      const { ctx, destination } = bus;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isCatch ? 165 : 225, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.075);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(isCatch ? 0.13 : 0.1, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.085);

      osc.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } catch {
      // Ignore
    }
  }

  /**
   * Authentic nylon net swish! Sweeping bandpass noise + light top-chord air burst.
   */
  public playNetSwish(bus: AudioBusTarget | null, wasDunk = false) {
    if (!bus) return;
    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;

      const noise = ctx.createBufferSource();
      noise.buffer = this.ensureNoiseBuffer(ctx);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(wasDunk ? 2200 : 1850, now);
      bp.frequency.exponentialRampToValueAtTime(580, now + 0.19);
      bp.Q.setValueAtTime(1.5, now);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2800, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(wasDunk ? 0.22 : 0.18, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);

      noise.connect(bp);
      bp.connect(lp);
      lp.connect(gain);
      gain.connect(destination);
      if (reverbSend) gain.connect(reverbSend);
      noise.start(now);
      noise.stop(now + 0.26);

      if (wasDunk) {
        const slam = ctx.createOscillator();
        const sGain = ctx.createGain();
        slam.type = 'triangle';
        slam.frequency.setValueAtTime(175, now);
        slam.frequency.exponentialRampToValueAtTime(42, now + 0.22);
        sGain.gain.setValueAtTime(0.0001, now);
        sGain.gain.linearRampToValueAtTime(0.32, now + 0.005);
        sGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);
        slam.connect(sGain);
        sGain.connect(destination);
        if (reverbSend) sGain.connect(reverbSend);
        slam.start(now);
        slam.stop(now + 0.28);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Metallic breakaway rim iron clank with inharmonic steel ring.
   */
  public playRimClank(bus: AudioBusTarget | null, impactSpeed = 6.0) {
    if (!bus) return;
    const nowMs = performance.now();
    if (nowMs - this.lastRimTimeMs < 65) return;
    this.lastRimTimeMs = nowMs;

    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const pwr = THREE.MathUtils.clamp(impactSpeed / 8.5, 0.28, 1.1);

      const partials = [268, 412, 685];
      partials.forEach((hz, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(hz, now);
        osc.frequency.exponentialRampToValueAtTime(hz * 0.94, now + 0.18);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime((0.12 / (idx + 1)) * pwr, now + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0008, now + (0.16 - idx * 0.03));

        osc.connect(g);
        g.connect(destination);
        if (reverbSend) g.connect(reverbSend);
        osc.start(now);
        osc.stop(now + 0.2);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Tempered-glass backboard low resonant thump.
   */
  public playBackboardThud(bus: AudioBusTarget | null, impactSpeed = 6.0) {
    if (!bus) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBackboardTimeMs < 75) return;
    this.lastBackboardTimeMs = nowMs;

    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const pwr = THREE.MathUtils.clamp(impactSpeed / 9.0, 0.25, 1.1);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(118, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.14);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.18 * pwr, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);

      osc.connect(gain);
      gain.connect(destination);
      if (reverbSend) gain.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  /**
   * Studio-filtered short hardwood sneaker chirp (gentle, never shrill).
   */
  public playSneakerSqueak(bus: AudioBusTarget | null) {
    if (!bus) return;
    const nowMs = performance.now();
    if (nowMs - this.lastSqueakTimeMs < 180) return;
    this.lastSqueakTimeMs = nowMs;

    try {
      const { ctx, destination } = bus;
      const now = ctx.currentTime;
      const baseHz = 1480 + Math.random() * 260;

      const osc = ctx.createOscillator();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(baseHz, now);
      bp.Q.setValueAtTime(2.6, now);

      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseHz, now);
      osc.frequency.linearRampToValueAtTime(baseHz + 240, now + 0.038);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.042, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.055);

      osc.connect(bp);
      bp.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch {
      // Ignore
    }
  }

  /**
   * Optical torso/screen collision padded thump.
   */
  public playBodyScreenThump(bus: AudioBusTarget | null, force = 0.7) {
    if (!bus) return;
    try {
      const { ctx, destination } = bus;
      const now = ctx.currentTime;
      const pwr = THREE.MathUtils.clamp(force, 0.25, 1.1);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(98, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.14 * pwr, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore
    }
  }

  /**
   * Intro Billboard-to-Court Swoosh.
   */
  public playIntroBallSwoosh(bus: AudioBusTarget | null) {
    if (!bus) return;
    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(380, now);
      lp.Q.setValueAtTime(1.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.92);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(destination);
      if (reverbSend) gain.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.96);
    } catch {
      // Ignore
    }
  }

  /**
   * Soccer Penalty Kick Boot Thump & Goalie Glove Parry Snap.
   */
  public playSoccerKick(bus: AudioBusTarget | null) {
    if (!bus) return;
    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(44, now + 0.11);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.26, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.13);
      osc.connect(gain);
      gain.connect(destination);
      if (reverbSend) gain.connect(reverbSend);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore
    }
  }

  public playGoalieParry(bus: AudioBusTarget | null, saved: boolean) {
    if (!bus) return;
    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = this.ensureNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(saved ? 760 : 1240, now);
      bp.Q.setValueAtTime(1.4, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
      noise.connect(bp);
      bp.connect(g);
      g.connect(destination);
      if (reverbSend) g.connect(reverbSend);
      noise.start(now);
      noise.stop(now + 0.18);
    } catch {
      // Ignore
    }
  }

  /**
   * Dual-reed arena buzzer / shot-clock horn or referee whistle.
   */
  public playArenaHorn(bus: AudioBusTarget | null, kind: 'BUZZER' | 'WHISTLE' | 'BLOCK') {
    if (!bus) return;
    try {
      const { ctx, destination, reverbSend } = bus;
      const now = ctx.currentTime;

      if (kind === 'BLOCK') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.19);
        osc.connect(gain);
        gain.connect(destination);
        if (reverbSend) gain.connect(reverbSend);
        osc.start(now);
        osc.stop(now + 0.21);
        return;
      }

      if (kind === 'WHISTLE') {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, now);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.linearRampToValueAtTime(680, now + 0.12);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.09, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
        osc.connect(lp);
        lp.connect(g);
        g.connect(destination);
        if (reverbSend) g.connect(reverbSend);
        osc.start(now);
        osc.stop(now + 0.24);
        return;
      }

      [148, 222].forEach((hz) => {
        const osc = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(520, now);
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(hz, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.11, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);
        osc.connect(lp);
        lp.connect(g);
        g.connect(destination);
        if (reverbSend) g.connect(reverbSend);
        osc.start(now);
        osc.stop(now + 0.48);
      });
    } catch {
      // Ignore
    }
  }
}
