export type OSSportApp = 'BASKETBALL_3V3' | 'VOLLEYBALL_6V6';

export type OSViewMode = 'GAME_FOCUS' | 'OS_WORKSTATION';

export type OSModalApp = 'NONE' | 'VIDEO_EDITOR' | 'BROWSER' | 'MATRIX';

export type SubsystemId =
  | 'webgl2-renderer'
  | 'basketball-3v3-core'
  | 'volleyball-6v6-core'
  | 'ps6-postfx-composer'
  | 'odonata-dsp-audio'
  | 'agi-swarm-worker'
  | 'opfs-scratch-disk'
  | 'gemini-studio-orchestrator';

export type SubsystemHealthStatus = 'NOMINAL' | 'DEGRADED' | 'HEALING' | 'RECOVERED';

export interface OSSubsystemRecord {
  id: SubsystemId;
  name: string;
  status: SubsystemHealthStatus;
  latencyMs: number;
  healCount: number;
  lastCheckAt: number;
  lastError: string | null;
  lastAction: string;
}

export interface AetherFSLogEntry {
  id: string;
  source: 'KERNEL' | 'SELF-HEAL' | 'STUDIO-AI' | 'OPFS' | 'HOOPS-3V3' | 'VOLLEY-6V6' | 'CAD' | 'EDITOR' | 'BROWSER' | 'COMETIC';
  timestamp: string;
  message: string;
  severity: 'info' | 'warn' | 'heal' | 'studio';
}

export interface ReplTerminalLine {
  id: string;
  text: string;
  tone: 'slate' | 'cyan' | 'emerald' | 'amber' | 'pink' | 'rose';
}

export interface CometicStepSpec {
  step: number;
  code: string;
  title: string;
  description: string;
  bloomBoost: number;
  particleIntensity: number;
  gridOpacity: number;
}

export interface StudioOrchestrationResult {
  source: 'GEMINI_4_STUDIO' | 'DETERMINISTIC_KERNEL' | string;
  timestamp: number;
  osDirective: {
    healActions: string[];
    targetStep: number;
    bloomBoost: number;
    adaptiveQualityHint: 'KEEP' | 'STEP_DOWN' | 'STEP_UP';
    opfsCheckpoint: boolean;
    statusBanner: string;
  };
  gameDirective: {
    playCall: 'PICK_AND_ROLL' | 'FIVE_OUT_3PT' | 'ISO_SLASH' | 'GIVE_AND_GO' | 'FAST_BREAK';
    defenseCall: 'MAN_TO_MAN' | 'SWITCH_EVERYTHING' | 'PAINT_PROTECT' | 'FULL_PRESS';
    focusJersey: number;
    intensityBoost: number;
    coachCallout: string;
    broadcastLine: string;
  };
}

export interface OPFSMetrics {
  allocatedGb: number;
  usedGb: number;
  usagePct: number;
  inodeCount: number;
  throughputMbps: number;
  backendMode: 'NATIVE_OPFS' | 'VIRTUAL_SANDBOX';
  snapshotCount: number;
  lastSnapshotAt: string | null;
}

export type CADPrimitiveShape = 'TORUS' | 'GYROID' | 'HOOP_RIM';

export interface CometicKernelState {
  activeSport: OSSportApp;
  viewMode: OSViewMode;
  activeModal: OSModalApp;
  subsystems: OSSubsystemRecord[];
  aetherLogs: AetherFSLogEntry[];
  replLines: ReplTerminalLine[];
  opfs: OPFSMetrics;
  cadShape: CADPrimitiveShape;
  cometicStep: number;
  unlockedSteps: number[];
  overdriveActive: boolean;
  selfHealEnabled: boolean;
  totalHealCycles: number;
  studioAutoOrchestrate: boolean;
  studioLastSyncTime: string;
  studioSource: string;
  studioStatusBanner: string;
  latestOrchestration: StudioOrchestrationResult | null;
  liveFps: number;
  shaderModulation: {
    bloomBoost: number;
    rimEnergy: number;
    wireframeGridOpacity: number;
    particleScale: number;
  };
}

export interface EngineHealthReport {
  fps: number;
  webglLost: boolean;
  stalledSeconds: number;
  outOfBoundsCount: number;
  audioSuspended: boolean;
  scoreA: number;
  scoreB: number;
  shotClock?: number;
  possessionTeam?: 'A' | 'B';
}

export interface EngineRecoveryHooks {
  getHealthReport: () => EngineHealthReport;
  selfHeal: (reason: string) => string;
  applyCometicModulation: (mod: CometicKernelState['shaderModulation']) => void;
  applyStudioDirective?: (directive: StudioOrchestrationResult['gameDirective']) => void;
  injectFault?: (subsystem: SubsystemId) => void;
}
