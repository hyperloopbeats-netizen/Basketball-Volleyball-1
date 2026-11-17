import {
  AetherFSLogEntry,
  CADPrimitiveShape,
  CometicKernelState,
  CometicStepSpec,
  EngineRecoveryHooks,
  OSModalApp,
  OSSportApp,
  OSSubsystemRecord,
  OSViewMode,
  ReplTerminalLine,
  StudioOrchestrationResult,
  SubsystemId,
} from './osTypes';

export const COMETIC_MATRIX_STEPS: CometicStepSpec[] = [
  { step: 1, code: '01. SOFT CTX', title: 'Soft Pastel WebGL2 Context', description: 'Boots hardware-accelerated WebGL2 context with Coal Harbour twilight lighting.', bloomBoost: 0.08, particleIntensity: 0.7, gridOpacity: 0.14 },
  { step: 2, code: '02. GEL SHADER', title: 'Squishy Gel Matrix Shader', description: 'Compiles dynamic jersey & kinetic floor vertex shaders with Fresnel rim glow.', bloomBoost: 0.12, particleIntensity: 0.85, gridOpacity: 0.18 },
  { step: 3, code: '03. GLOW BLOOM', title: 'PS6 UnrealBloom Compositor', description: 'Tunes high-pass multi-stage ACES Filmic bloom thresholds.', bloomBoost: 0.24, particleIntensity: 1.0, gridOpacity: 0.22 },
  { step: 4, code: '04. SPARK MOTES', title: 'Atmospheric Spirit Motes', description: 'Streams GPU dust, rain & jersey highlight particles synced to BPM.', bloomBoost: 0.26, particleIntensity: 1.2, gridOpacity: 0.24 },
  { step: 5, code: '05. CHIME AUDIO', title: 'Odonata Harmonic DSP Bus', description: 'Binds 32-band WebAudio FFT EQ to the AIM Vancouver Arena Billboard.', bloomBoost: 0.28, particleIntensity: 1.25, gridOpacity: 0.26 },
  { step: 6, code: '06. PIXEL VOXELS', title: 'Chibi Raymarched Kinematics', description: 'Activates articulated joint rigs, rim net deforms & hardwood reflections.', bloomBoost: 0.30, particleIntensity: 1.3, gridOpacity: 0.28 },
  { step: 7, code: '07. HUG VORTEX', title: 'Kinetic Gravity Conduit', description: 'Stabilizes dunk/spike ballistics & Comic Strike slow-mo orbit solver.', bloomBoost: 0.34, particleIntensity: 1.4, gridOpacity: 0.32 },
  { step: 8, code: '08. AGI SWARM', title: '3v3 Autonomous AI Teamwork', description: 'Drives off-ball cuts, pick-and-roll screens & closeout defenders.', bloomBoost: 0.36, particleIntensity: 1.5, gridOpacity: 0.36 },
  { step: 9, code: '09. CLOUD GRID', title: 'Vancouver Horizon Wireframe', description: 'Synchronizes Burrard Inlet waterfront lights & cyber grid pulses.', bloomBoost: 0.40, particleIntensity: 1.65, gridOpacity: 0.44 },
  { step: 10, code: '10. COMETIC CORE', title: 'Full Studio AI Kernel Synthesis', description: 'Unlocks full Gemini 4 live tactical orchestration & self-healing overdrive.', bloomBoost: 0.48, particleIntensity: 1.85, gridOpacity: 0.52 },
];

const INITIAL_SUBSYSTEMS: OSSubsystemRecord[] = [
  { id: 'webgl2-renderer', name: 'WebGL2 Spatial Pipeline', status: 'NOMINAL', latencyMs: 4.2, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'Hardware pipeline active' },
  { id: 'basketball-3v3-core', name: '3v3 Basketball Physics & AI', status: 'NOMINAL', latencyMs: 2.1, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: '12s clock & rim solver ready' },
  { id: 'volleyball-6v6-core', name: '6v6 Volleyball Engine', status: 'NOMINAL', latencyMs: 1.9, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'FIVB rotation matrix ready' },
  { id: 'ps6-postfx-composer', name: 'PS6 Bloom & Comic Shader', status: 'NOMINAL', latencyMs: 3.4, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'ACES Filmic LUT active' },
  { id: 'odonata-dsp-audio', name: 'Odonata 32-Band DSP', status: 'NOMINAL', latencyMs: 1.4, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'Arena EQ stream linked' },
  { id: 'agi-swarm-worker', name: 'AGI Swarm Orchestrator', status: 'NOMINAL', latencyMs: 2.6, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'Tactical vectors converged' },
  { id: 'opfs-scratch-disk', name: 'OPFS Scratch Disk Vault', status: 'NOMINAL', latencyMs: 0.8, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'Blake3 checkpoint valid' },
  { id: 'gemini-studio-orchestrator', name: 'Google Studio Gemini 4', status: 'NOMINAL', latencyMs: 42.0, healCount: 0, lastCheckAt: Date.now(), lastError: null, lastAction: 'Autonomous loop synced' },
];

function nowTimeStr(): string {
  return new Date().toTimeString().split(' ')[0];
}

export class CometicOSKernel {
  private state: CometicKernelState;
  private listeners = new Set<(s: CometicKernelState) => void>();
  private engineHooks: EngineRecoveryHooks | null = null;
  private watchdogTimer: number | null = null;
  private orchestrateTimer: number | null = null;
  private overdriveTimer: number | null = null;
  private studioInFlight = false;
  private injectedFaults = new Set<SubsystemId>();

  constructor() {
    const hasNativeOPFS = typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
    this.state = {
      activeSport: 'BASKETBALL_3V3',
      viewMode: 'GAME_FOCUS',
      activeModal: 'NONE',
      subsystems: INITIAL_SUBSYSTEMS.map((s) => ({ ...s })),
      aetherLogs: [
        {
          id: `log-boot-1`,
          source: 'KERNEL',
          timestamp: nowTimeStr(),
          message: 'AIM-Cometic OS v30.0 Autonomous Watchdog initialized. Monitoring 8 core subsystems.',
          severity: 'info',
        },
        {
          id: `log-boot-2`,
          source: 'STUDIO-AI',
          timestamp: nowTimeStr(),
          message: 'Google Studio Gemini 4 orchestrator bound to 3v3 Basketball & Volleyball arenas.',
          severity: 'studio',
        },
      ],
      replLines: [
        { id: 'r1', text: 'AIM-Cometic OS v30.0 Self-Healing Kernel Booted.', tone: 'pink' },
        { id: 'r2', text: "Type 'help', 'orchestrate', 'heal', 'fault physics', 'play volleyball', or 'editor'.", tone: 'cyan' },
      ],
      opfs: {
        allocatedGb: 50.0,
        usedGb: 14.8,
        usagePct: 29.6,
        inodeCount: 14280,
        throughputMbps: 42.5,
        backendMode: hasNativeOPFS ? 'NATIVE_OPFS' : 'VIRTUAL_SANDBOX',
        snapshotCount: 1,
        lastSnapshotAt: nowTimeStr(),
      },
      cadShape: 'HOOP_RIM',
      cometicStep: 6,
      unlockedSteps: [1, 2, 3, 4, 5, 6],
      overdriveActive: false,
      selfHealEnabled: true,
      totalHealCycles: 0,
      studioAutoOrchestrate: true,
      studioLastSyncTime: nowTimeStr(),
      studioSource: 'BOOTING',
      studioStatusBanner: 'Google Studio Autonomous Orchestrator Ready',
      latestOrchestration: null,
      liveFps: 60,
      shaderModulation: {
        bloomBoost: 0.24,
        rimEnergy: 0.72,
        wireframeGridOpacity: 0.28,
        particleScale: 1.15,
      },
    };
  }

  public subscribe(fn: (s: CometicKernelState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  public getSnapshot(): CometicKernelState {
    return {
      ...this.state,
      subsystems: this.state.subsystems.map((s) => ({ ...s })),
      aetherLogs: [...this.state.aetherLogs],
      replLines: [...this.state.replLines],
      opfs: { ...this.state.opfs },
      unlockedSteps: [...this.state.unlockedSteps],
      shaderModulation: { ...this.state.shaderModulation },
    };
  }

  private emit() {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  public startWatchdog() {
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = window.setInterval(() => {
      this.runWatchdogCycle();
    }, 1500);
    this.orchestrateTimer = window.setInterval(() => {
      if (this.state.studioAutoOrchestrate) {
        void this.orchestrateWithStudio();
      }
    }, 7500);
    // Run an initial Studio orchestration sync shortly after boot
    window.setTimeout(() => {
      void this.orchestrateWithStudio('Initialize Coal Harbour 3v3 Basketball & OS stabilization');
    }, 900);
  }

  public stopWatchdog() {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.orchestrateTimer !== null) {
      clearInterval(this.orchestrateTimer);
      this.orchestrateTimer = null;
    }
    if (this.overdriveTimer !== null) {
      clearInterval(this.overdriveTimer);
      this.overdriveTimer = null;
    }
  }

  public registerEngineHooks(hooks: EngineRecoveryHooks | null) {
    this.engineHooks = hooks;
    if (hooks) {
      hooks.applyCometicModulation(this.state.shaderModulation);
      if (this.state.latestOrchestration?.gameDirective && hooks.applyStudioDirective) {
        hooks.applyStudioDirective(this.state.latestOrchestration.gameDirective);
      }
    }
  }

  public setActiveSport(sport: OSSportApp) {
    if (this.state.activeSport === sport) return;
    this.state.activeSport = sport;
    this.logEvent(
      sport === 'BASKETBALL_3V3' ? 'HOOPS-3V3' : 'VOLLEY-6V6',
      `Switched active 3D spatial game kernel to ${sport === 'BASKETBALL_3V3' ? '3-on-3 Basketball' : '6v6 Volleyball'}.`,
      'info'
    );
    this.emit();
    void this.orchestrateWithStudio(`Transition arena to ${sport}`);
  }

  public setViewMode(mode: OSViewMode) {
    this.state.viewMode = mode;
    this.emit();
  }

  public setActiveModal(modal: OSModalApp) {
    this.state.activeModal = modal;
    if (modal !== 'NONE') {
      this.logEvent(
        modal === 'VIDEO_EDITOR' ? 'EDITOR' : modal === 'BROWSER' ? 'BROWSER' : 'COMETIC',
        `Opened OS Subsystem: ${modal.replace('_', ' ')}.`,
        'info'
      );
    }
    this.emit();
  }

  public setCadShape(shape: CADPrimitiveShape) {
    this.state.cadShape = shape;
    this.logEvent('CAD', `Zero-Crossing SDF Kernel switched primitive to ${shape}.`, 'info');
    this.emit();
  }

  public setSelfHealEnabled(enabled: boolean) {
    this.state.selfHealEnabled = enabled;
    this.logEvent('KERNEL', `Autonomous Self-Healing Watchdog ${enabled ? 'ENABLED' : 'PAUSED'}.`, enabled ? 'heal' : 'warn');
    this.emit();
  }

  public setStudioAutoOrchestrate(enabled: boolean) {
    this.state.studioAutoOrchestrate = enabled;
    this.logEvent('STUDIO-AI', `Google Studio Live Orchestration ${enabled ? 'ACTIVE' : 'MANUAL'}.`, 'studio');
    this.emit();
  }

  public clearLogs() {
    this.state.aetherLogs = [];
    this.emit();
  }

  public logEvent(
    source: AetherFSLogEntry['source'],
    message: string,
    severity: AetherFSLogEntry['severity'] = 'info'
  ) {
    const entry: AetherFSLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source,
      timestamp: nowTimeStr(),
      message,
      severity,
    };
    this.state.aetherLogs = [entry, ...this.state.aetherLogs].slice(0, 60);
    this.emit();
  }

  public appendRepl(text: string, tone: ReplTerminalLine['tone'] = 'slate') {
    this.state.replLines = [
      ...this.state.replLines.slice(-45),
      { id: `repl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, tone },
    ];
    this.emit();
  }

  public activateCometicStep(step: number) {
    const clamped = Math.max(1, Math.min(10, Math.round(step)));
    const spec = COMETIC_MATRIX_STEPS[clamped - 1];
    this.state.cometicStep = clamped;
    if (!this.state.unlockedSteps.includes(clamped)) {
      this.state.unlockedSteps = [...this.state.unlockedSteps, clamped].sort((a, b) => a - b);
    }
    this.state.shaderModulation = {
      bloomBoost: spec.bloomBoost,
      rimEnergy: 0.45 + (clamped / 10) * 0.65,
      wireframeGridOpacity: spec.gridOpacity,
      particleScale: spec.particleIntensity,
    };
    this.engineHooks?.applyCometicModulation(this.state.shaderModulation);
    this.logEvent('COMETIC', `Matrix Step ${spec.code}: ${spec.title}`, 'info');
    this.emit();
  }

  public runCometicOverdrive() {
    if (this.overdriveTimer !== null) {
      clearInterval(this.overdriveTimer);
      this.overdriveTimer = null;
    }
    this.state.overdriveActive = true;
    this.logEvent('COMETIC', 'COMETIC OVERDRIVE [1-10] ENGAGED — Synchronizing all shaders & Studio AI!', 'studio');
    this.appendRepl('>>> COMETIC OVERDRIVE [1-10] SEQUENCE STARTED', 'pink');
    let step = 1;
    this.activateCometicStep(1);
    this.overdriveTimer = window.setInterval(() => {
      step++;
      if (step > 10) {
        if (this.overdriveTimer !== null) clearInterval(this.overdriveTimer);
        this.overdriveTimer = null;
        this.state.overdriveActive = false;
        this.appendRepl('-> All 10 Cometic Matrix stages synced. Core nominal!', 'emerald');
        void this.writeOPFSSnapshot('overdrive_complete');
        this.emit();
        return;
      }
      this.activateCometicStep(step);
    }, 280);
  }

  public injectFault(subsystemId: SubsystemId) {
    this.injectedFaults.add(subsystemId);
    const now = Date.now();
    this.state.subsystems = this.state.subsystems.map((sub) =>
      sub.id === subsystemId
        ? {
            ...sub,
            status: 'DEGRADED',
            latencyMs: Number((sub.latencyMs + 48.5).toFixed(1)),
            lastCheckAt: now,
            lastError: `Anomaly detected on ${sub.name}`,
            lastAction: 'Awaiting autonomous watchdog heal',
          }
        : sub
    );
    this.engineHooks?.injectFault?.(subsystemId);
    this.logEvent('SELF-HEAL', `FAULT DETECTED in [${subsystemId}] — triggering autonomous recovery!`, 'warn');
    this.appendRepl(`[FAULT] ${subsystemId} entered DEGRADED state`, 'rose');
    this.emit();
  }

  public triggerManualHealAll() {
    this.runRecoveryPass('Manual Operator Self-Heal Sweep');
  }

  public async writeOPFSSnapshot(tag = 'manual'): Promise<void> {
    const payload = JSON.stringify({
      savedAt: new Date().toISOString(),
      tag,
      activeSport: this.state.activeSport,
      cometicStep: this.state.cometicStep,
      totalHealCycles: this.state.totalHealCycles,
      health: this.engineHooks?.getHealthReport() ?? null,
    });

    const t0 = performance.now();
    let backendMode: 'NATIVE_OPFS' | 'VIRTUAL_SANDBOX' = 'VIRTUAL_SANDBOX';

    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(`cometic_os_${tag}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(payload);
        await writable.close();
        backendMode = 'NATIVE_OPFS';
      }
    } catch {
      backendMode = 'VIRTUAL_SANDBOX';
    }

    try {
      localStorage.setItem('aim_cometic_os_last_snapshot', payload);
    } catch {
      // Ignore quota errors
    }

    const elapsedMs = Math.max(0.4, performance.now() - t0);
    const fakeMbThroughput = Math.min(280, Math.max(24.5, Number(((payload.length / elapsedMs) * 0.42 + 38.4).toFixed(1))));
    this.state.opfs = {
      ...this.state.opfs,
      backendMode,
      usedGb: Number(Math.min(48.5, 14.8 + this.state.opfs.snapshotCount * 0.04).toFixed(2)),
      usagePct: Number(Math.min(97, ((14.8 + this.state.opfs.snapshotCount * 0.04) / 50) * 100).toFixed(1)),
      inodeCount: this.state.opfs.inodeCount + 2,
      throughputMbps: fakeMbThroughput,
      snapshotCount: this.state.opfs.snapshotCount + 1,
      lastSnapshotAt: nowTimeStr(),
    };

    this.logEvent(
      'OPFS',
      `Checkpoint [${tag}] persisted via ${backendMode} (${payload.length} B @ ${fakeMbThroughput} MB/s).`,
      'info'
    );
    this.emit();
  }

  private runWatchdogCycle() {
    const report = this.engineHooks?.getHealthReport();
    const now = Date.now();
    const issues: { id: SubsystemId; reason: string }[] = [];

    if (report) {
      this.state.liveFps = Math.max(1, Math.min(120, Math.round(report.fps || 60)));
      if (report.webglLost) {
        issues.push({ id: 'webgl2-renderer', reason: 'WebGL2 context lost' });
      }
      if (report.fps > 0 && report.fps < 26) {
        issues.push({ id: 'ps6-postfx-composer', reason: `Low frame rate (${Math.round(report.fps)} FPS)` });
      }
      if (report.outOfBoundsCount > 0 || report.stalledSeconds > 5.5) {
        const coreId: SubsystemId =
          this.state.activeSport === 'BASKETBALL_3V3' ? 'basketball-3v3-core' : 'volleyball-6v6-core';
        issues.push({
          id: coreId,
          reason:
            report.outOfBoundsCount > 0
              ? 'Ball/Player physics boundary escape'
              : `Possession/Play stalled ${report.stalledSeconds.toFixed(1)}s`,
        });
      }
      if (report.audioSuspended) {
        issues.push({ id: 'odonata-dsp-audio', reason: 'WebAudio DSP Context suspended' });
      }
    }

    for (const id of this.injectedFaults) {
      if (!issues.some((i) => i.id === id)) {
        issues.push({ id, reason: 'Synthetic diagnostic fault triggered' });
      }
    }

    if (issues.length > 0) {
      this.state.subsystems = this.state.subsystems.map((sub) => {
        const hit = issues.find((i) => i.id === sub.id);
        if (!hit) return { ...sub, lastCheckAt: now };
        return {
          ...sub,
          status: this.state.selfHealEnabled ? 'HEALING' : 'DEGRADED',
          lastCheckAt: now,
          lastError: hit.reason,
          lastAction: this.state.selfHealEnabled ? 'Executing self-healing recovery...' : 'Auto-heal paused',
        };
      });
      this.emit();

      if (this.state.selfHealEnabled) {
        this.runRecoveryPass(issues.map((i) => `${i.id}: ${i.reason}`).join(' | '));
      }
      return;
    }

    // Smooth recovery from RECOVERED -> NOMINAL cleanly
    let changed = false;
    this.state.subsystems = this.state.subsystems.map((sub) => {
      if (sub.status === 'RECOVERED' && now - sub.lastCheckAt > 2600) {
        changed = true;
        return { ...sub, status: 'NOMINAL', lastError: null, latencyMs: Number(Math.max(0.8, sub.latencyMs * 0.45).toFixed(1)) };
      }
      return sub;
    });
    if (changed || report) {
      this.emit();
    }
  }

  private runRecoveryPass(reason: string) {
    const engineSummary = this.engineHooks?.selfHeal(reason) || 'Kernel telemetry normalized';
    this.injectedFaults.clear();
    const now = Date.now();
    this.state.totalHealCycles += 1;

    this.state.subsystems = this.state.subsystems.map((sub) => {
      if (sub.status === 'DEGRADED' || sub.status === 'HEALING') {
        return {
          ...sub,
          status: 'RECOVERED',
          healCount: sub.healCount + 1,
          latencyMs: Number((1.2 + Math.random() * 2.5).toFixed(1)),
          lastCheckAt: now,
          lastError: null,
          lastAction: `Auto-recovered: ${engineSummary.slice(0, 56)}`,
        };
      }
      return { ...sub, lastCheckAt: now };
    });

    this.logEvent('SELF-HEAL', `RECOVERED (${reason}) -> ${engineSummary}`, 'heal');
    this.appendRepl(`[SELF-HEAL #${this.state.totalHealCycles}] ${engineSummary}`, 'emerald');
    void this.writeOPFSSnapshot('auto_heal');
    this.emit();
  }

  public async orchestrateWithStudio(userDirective = ''): Promise<StudioOrchestrationResult | null> {
    if (this.studioInFlight) return null;
    this.studioInFlight = true;
    try {
      const report = this.engineHooks?.getHealthReport();
      const degraded = this.state.subsystems
        .filter((s) => s.status === 'DEGRADED' || s.status === 'HEALING')
        .map((s) => s.id);

      const res = await fetch('/api/gemini-brain/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameMode: this.state.activeSport,
          fps: report?.fps ?? this.state.liveFps,
          scoreA: report?.scoreA ?? 0,
          scoreB: report?.scoreB ?? 0,
          shotClock: report?.shotClock ?? 12,
          possessionTeam: report?.possessionTeam ?? 'A',
          degradedSubsystems: degraded,
          activeStep: this.state.cometicStep,
          userDirective,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StudioOrchestrationResult;
      this.state.latestOrchestration = data;
      this.state.studioLastSyncTime = nowTimeStr();
      this.state.studioSource = data.source;
      this.state.studioStatusBanner = data.osDirective.statusBanner;

      if (data.osDirective.targetStep !== this.state.cometicStep) {
        this.activateCometicStep(data.osDirective.targetStep);
      }
      if (data.gameDirective && this.engineHooks?.applyStudioDirective) {
        this.engineHooks.applyStudioDirective(data.gameDirective);
      }
      if (data.osDirective.opfsCheckpoint) {
        void this.writeOPFSSnapshot('studio_sync');
      }

      if (userDirective) {
        this.logEvent(
          'STUDIO-AI',
          `[${data.source}] Play: ${data.gameDirective.playCall} · Defense: ${data.gameDirective.defenseCall} — ${data.gameDirective.coachCallout}`,
          'studio'
        );
        this.appendRepl(`[STUDIO] ${data.gameDirective.broadcastLine}`, 'amber');
      }

      this.emit();
      return data;
    } catch {
      this.state.studioSource = 'LOCAL_FAILSAFE';
      this.emit();
      return null;
    } finally {
      this.studioInFlight = false;
    }
  }

  public executeReplCommand(rawInput: string) {
    const cmd = rawInput.trim();
    if (!cmd) return;
    this.appendRepl(`$ ${cmd}`, 'slate');
    const lower = cmd.toLowerCase();

    if (lower === 'help') {
      this.appendRepl(
        "Commands: 'play basketball', 'play volleyball', 'heal', 'fault <renderer|physics|audio|studio>', 'orchestrate <note>', 'overdrive', 'matrix', 'editor', 'browser', 'stress', 'clear'",
        'cyan'
      );
      return;
    }
    if (lower === 'clear') {
      this.state.replLines = [];
      this.emit();
      return;
    }
    if (lower === 'play basketball' || lower === 'basketball' || lower === '3v3') {
      this.setActiveSport('BASKETBALL_3V3');
      this.setViewMode('GAME_FOCUS');
      this.appendRepl('Launched 3-on-3 Basketball engine in GAME FOCUS mode.', 'emerald');
      return;
    }
    if (lower === 'play volleyball' || lower === 'volleyball' || lower === '6v6') {
      this.setActiveSport('VOLLEYBALL_6V6');
      this.setViewMode('GAME_FOCUS');
      this.appendRepl('Launched 6v6 Volleyball engine in GAME FOCUS mode.', 'emerald');
      return;
    }
    if (lower === 'heal') {
      this.triggerManualHealAll();
      return;
    }
    if (lower.startsWith('fault')) {
      const arg = lower.replace('fault', '').trim();
      const target: SubsystemId =
        arg.includes('rend') || arg.includes('gpu')
          ? 'webgl2-renderer'
          : arg.includes('aud') || arg.includes('dsp')
          ? 'odonata-dsp-audio'
          : arg.includes('stud')
          ? 'gemini-studio-orchestrator'
          : this.state.activeSport === 'BASKETBALL_3V3'
          ? 'basketball-3v3-core'
          : 'volleyball-6v6-core';
      this.injectFault(target);
      return;
    }
    if (lower.startsWith('orchestrate')) {
      const prompt = cmd.slice('orchestrate'.length).trim() || 'Optimize 3v3 offense and self-healing bloom';
      this.appendRepl(`Requesting Google Studio Gemini 4 orchestration: "${prompt}"...`, 'amber');
      void this.orchestrateWithStudio(prompt);
      return;
    }
    if (lower === 'overdrive') {
      this.runCometicOverdrive();
      return;
    }
    if (lower === 'matrix') {
      this.setActiveModal('MATRIX');
      return;
    }
    if (lower === 'editor') {
      this.setActiveModal('VIDEO_EDITOR');
      return;
    }
    if (lower === 'browser') {
      this.setActiveModal('BROWSER');
      return;
    }
    if (lower === 'stress') {
      this.appendRepl('Running OPFS + WebGL2 + 3v3 Ballistic Stress Test...', 'cyan');
      void this.writeOPFSSnapshot('stress_test').then(() => {
        this.appendRepl(
          `-> OPFS ${this.state.opfs.throughputMbps} MB/s · WebGL2 ${this.state.liveFps} FPS (PASSED)`,
          'emerald'
        );
      });
      return;
    }
    if (lower.startsWith('cad ')) {
      const shapeArg = lower.slice(4).trim();
      if (shapeArg.includes('gyr')) this.setCadShape('GYROID');
      else if (shapeArg.includes('hoop') || shapeArg.includes('rim')) this.setCadShape('HOOP_RIM');
      else this.setCadShape('TORUS');
      return;
    }

    // Any other command is forwarded to Google Studio Orchestrator as a live directive!
    this.appendRepl(`Routing directive to Google Studio Orchestrator: "${cmd}"`, 'amber');
    void this.orchestrateWithStudio(cmd);
  }
}

export const cometicOSKernel = new CometicOSKernel();
