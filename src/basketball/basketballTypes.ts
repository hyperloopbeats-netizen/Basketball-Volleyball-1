import * as THREE from 'three';
import {
  AudioEQState,
  CameraFilterMode,
  CameraLensPreset,
  CameraPreset,
  ComicStrikeState,
  ControlMode,
  CourtSurface,
  CrowdMoodState,
  DifficultyLevel,
  EnvironmentTheme,
  GraphicsQualityPreset,
  IntroCutscenePhase,
  IntroMusicPresetId,
  MatchEvolutionState,
  PlayerParts,
  PlayerProfileMeta,
  ReplayAngleMode,
  TimingGrade,
  UnitStats,
} from '../types';

export const BASKET_BALL_RADIUS = 0.122;
export const BASKET_GRAVITY = -14.2;
export const BASKET_AIR_DRAG = 0.0145;
export const BASKET_MAGNUS_COEFF = 0.0044;

export type BasketMatchFormat = 'QUICK_21' | 'PRO_STREET' | 'PRACTICE' | 'AI_SHOWCASE';

export type BasketCameraPreset = CameraPreset | 'BASELINE_LOW' | 'PLAYER_CAM';

export type BasketScreenMode = 'MAIN_MENU' | 'PLAYING' | 'PAUSED' | 'MATCH_OVER';

export type BasketMatchState =
  | 'CHECK_BALL'
  | 'LIVE_PLAY'
  | 'SHOT_FLIGHT'
  | 'DUNK_FLIGHT'
  | 'SCORE_CELEBRATION'
  | 'MATCH_OVER';

export type BasketPlayCall =
  | 'PICK_AND_ROLL'
  | 'FIVE_OUT_3PT'
  | 'ISO_SLASH'
  | 'GIVE_AND_GO'
  | 'FAST_BREAK';

export type BasketDefenseScheme =
  | 'MAN_TO_MAN'
  | 'SWITCH_EVERYTHING'
  | 'PAINT_PROTECT'
  | 'FULL_PRESS';

export type BasketRole = 'PG' | 'WING' | 'BIG';

export type BasketShotPreview = 'POSTER_DUNK' | 'LAYUP' | 'MID_1PT' | 'ARC_2PT' | 'BLOCK';

export type BasketAnimState =
  | 'READY_STANCE'
  | 'TRIPLE_THREAT'
  | 'RUN'
  | 'DRIBBLE_RUN'
  | 'CROSSOVER'
  | 'ANKLE_BREAKER'
  | 'STEPBACK'
  | 'PASS_RELEASE'
  | 'PASS_CATCH'
  | 'JUMPER_RISE'
  | 'DUNK_LAUNCH'
  | 'BLOCK_LEAP'
  | 'STEAL_LUNGE'
  | 'SCREEN_SET'
  | 'BOX_OUT'
  | 'LANDING_ABSORB'
  | 'CELEBRATION'
  | 'CELEBRATE_ICE'
  | 'CELEBRATE_ROCK'
  | 'CELEBRATE_GUITAR'
  | 'CELEBRATE_BUMP'
  | 'CELEBRATE_SHUSH'
  | 'SLUMP';

export type OpticalHitboxZone =
  | 'HAND_L'
  | 'HAND_R'
  | 'TORSO'
  | 'HEAD'
  | 'STANCE'
  | 'GOALIE_GLOVE_L'
  | 'GOALIE_GLOVE_R'
  | 'GOALIE_TORSO';

export interface OpticalContactEvent {
  id: number;
  kind:
    | 'STEAL_STRIP'
    | 'SHOT_BLOCK'
    | 'PASS_DEFLECT'
    | 'SCREEN_PICK'
    | 'BOX_OUT'
    | 'BODY_BUMP'
    | 'INTERACT_LOCK'
    | 'GOALIE_PARRY';
  actorLabel: string;
  targetLabel: string;
  zone: OpticalHitboxZone;
  impactForce: number;
  point: [number, number, number];
  timestampSec: number;
}

export interface OpticalContactTelemetry {
  overlayEnabled: boolean;
  activeHitboxCount: number;
  hoveredTargetLabel: string | null;
  hoveredZone: OpticalHitboxZone | null;
  selectedTargetId: number | null;
  lastContactLabel: string;
  totalContacts: number;
  proximityAlerts: number;
  closestMatchupMeters: number;
  recentEvents: OpticalContactEvent[];
}

export interface AnkleBreakerTelemetry {
  active: boolean;
  reactionDelayMs: number;
  frozenDefenderName: string | null;
  cooldownSec: number;
}

export type BallPhysicsEventKind =
  | 'HAND_GATHER'
  | 'RELEASE_LAUNCH'
  | 'APEX_PEAK'
  | 'OPTICAL_DEFLECT'
  | 'GLASS_BANK'
  | 'RIM_CAROM'
  | 'NET_SWISH'
  | 'FLOOR_BOUNCE'
  | 'LOOSE_ROLL'
  | 'PASS_CATCH'
  | 'REBOUND_SECURED'
  | 'DUNK_FLUSH';

export interface BallPhysicsEventNode {
  id: number;
  kind: BallPhysicsEventKind;
  label: string;
  speedKmh: number;
  restitutionE: number;
  spinRpm: number;
  timestampSec: number;
  point: [number, number, number];
}

export interface BouncePhysicsTelemetry {
  activeFormFrames: number;
  ballSpinRpm: number;
  lastBounceSurface: CourtSurface;
  lastRestitution: number;
  lastNormalE: number;
  lastTangentialE: number;
  entryAngleDeg: number;
  flightApexM: number;
  lastSpinKickKmh: number;
  bounceCount: number;
  continuousChainSummary: string;
  eventChain: BallPhysicsEventNode[];
}

export type SlideMeterStage = 'IDLE' | 'GATHERING' | 'SLIDING' | 'APEX_HOLD' | 'RELEASED';

export interface SlideShotMeterEngineState {
  isExpanded: boolean;
  stage: SlideMeterStage;
  sliderValue: number;
  liquidLevel: number;
  liquidVelocity: number;
  wavePhase: number;
  sweetSpotStart: number;
  sweetSpotEnd: number;
  releaseAngleDeg: number;
  entryAngleDeg: number;
  distanceFt: number;
  contestPct: number;
  makeProbPct: number;
  predictedShotLabel: string;
  gradeFlashTimer: number;
}

export type CourtFlowState =
  | 'HALFCOURT_SET'
  | 'TRANSITION_PUSH'
  | 'ISOLATION_LOCK'
  | 'ON_FIRE_ZONE'
  | 'CLUTCH_TIME';

export type OrganicPassStyle = 'CHEST_LASER' | 'BOUNCE_THREAD' | 'TOUCH_LOB' | 'NO_LOOK_WHIP';

export type StealOutcomeKind = 'NONE' | 'CLEAN_RIP' | 'POKE_LOOSE' | 'SHOOTING_STRIP' | 'REACH_MISS';

export interface StealTelemetry {
  activeLunge: boolean;
  lastOutcome: StealOutcomeKind;
  lastStealerName: string | null;
  stealCountA: number;
  stealCountB: number;
  pursuitTargetId: number | null;
  windowLabel: string;
}

export type CelebrationCutsceneType =
  | 'NONE'
  | 'ICE_IN_VEINS'
  | 'ROCK_THE_BABY'
  | 'AIR_GUITAR_ROCK'
  | 'CHEST_BUMP_SQUAD'
  | 'CROWD_SILENCER';

export interface CelebrationCutsceneState {
  active: boolean;
  type: CelebrationCutsceneType;
  title: string;
  scorerName: string;
  scorerJersey: number;
  team: 'A' | 'B';
  durationSec: number;
  elapsedSec: number;
  canSkip: boolean;
}

export interface BasketFlowTelemetry {
  flowState: CourtFlowState;
  flowMeter: number;
  hotTeam: 'A' | 'B' | 'NEUTRAL';
  tempoLabel: string;
  onFirePlayerName: string | null;
}

export interface SoccerGoalieTelemetry {
  stance: 'READY' | 'TRACKING' | 'DIVE_LEFT' | 'DIVE_RIGHT' | 'HIGH_TIP' | 'CELEBRATE';
  saves: number;
  goalsConceded: number;
  shotsFaced: number;
  lastOutcome: string;
  shotInFlight: boolean;
}

export interface BasketIntroCutsceneState {
  phase: IntroCutscenePhase;
  phaseElapsed: number;
  selectedPreset: IntroMusicPresetId | 'CUSTOM_MP3';
  pendingFormat: BasketMatchFormat;
  subBannerText: string;
  musicSelected: boolean;
}

export interface BasketUnit {
  id: number;
  name: string;
  team: 'A' | 'B';
  role: BasketRole;
  jerseyNumber: number;
  parts: PlayerParts;
  mesh: THREE.Group;
  speed: number;
  actualSpeed: number;
  targetPos: THREE.Vector3;
  velocity: THREE.Vector3;
  yVel: number;
  isJumping: boolean;
  animState: BasketAnimState;
  animTimer: number;
  stepCycle: number;
  hasBall: boolean;
  stunTimer: number;
  stats: UnitStats;
  profile: PlayerProfileMeta;
  sweatLevel: number;
  stamina: number;
  guardingId: number | null;
  // Enhanced Volleyball-grade movement & inertia state
  currentLeanPitch: number;
  currentLeanRoll: number;
  landingCompression: number;
  splitStepTimer: number;
  scuffCooldown: number;
  wasInAir: boolean;
  screenActiveTimer: number;
  floorRingMesh?: THREE.Mesh;
  floorSpriteMesh?: THREE.Mesh;
}

export interface BasketReplayFrame {
  dt: number;
  ballPos: [number, number, number];
  ballSpeedKmh: number;
  players: { id: number; pos: [number, number, number]; rotY: number }[];
}

export interface BasketReplayClip {
  id: string;
  title: string;
  scorerName: string;
  scorerJersey: number;
  scorerTeam: 'A' | 'B';
  pointsValue: number;
  shotType: string;
  speedKmh: number;
  frames: BasketReplayFrame[];
}

export interface BasketReplayState {
  active: boolean;
  clipIndex: number;
  totalClips: number;
  currentClip: BasketReplayClip | null;
  currentAngle: ReplayAngleMode;
  angleIndex: number;
  progress: number;
  playbackSpeed: number;
}

export interface BasketShotMeterState {
  isCharging: boolean;
  chargeLevel: number;
  sweetSpotStart: number;
  sweetSpotEnd: number;
  previewType: BasketShotPreview;
  lastTimingGrade: TimingGrade;
  lastActionLabel: string;
  comboStreak: number;
}

export interface BasketGameState {
  screenMode: BasketScreenMode;
  introCutscene: BasketIntroCutsceneState;
  matchFormat: BasketMatchFormat;
  matchState: BasketMatchState;
  controlMode: ControlMode;
  scoreA: number;
  scoreB: number;
  targetScore: number;
  possessionTeam: 'A' | 'B';
  arcCleared: boolean;
  shotClock: number;
  checkTimer: number;
  ballHandlerId: number | null;
  activeCyanId: number;
  activePlayerName: string;
  activePlayerJersey: number;
  activePlayCall: BasketPlayCall;
  defenseSchemeB: BasketDefenseScheme;
  defenseSchemeA: BasketDefenseScheme;
  cameraAngle: BasketCameraPreset;
  cameraFilter: CameraFilterMode;
  cameraLens: CameraLensPreset;
  graphicsQuality: GraphicsQualityPreset;
  weather: EnvironmentTheme;
  courtSurface: CourtSurface;
  difficulty: DifficultyLevel;
  ballSpeedKmh: number;
  lastShotSummary: string;
  liveCommentaryLine: string;
  studioCoachCallout: string;
  actionLog: string[];
  shotMeter: BasketShotMeterState;
  slideMeter: SlideShotMeterEngineState;
  flowTelemetry: BasketFlowTelemetry;
  comicStrike: ComicStrikeState;
  matchEvolution: MatchEvolutionState;
  crowdMood: CrowdMoodState;
  introBillboardEQ: AudioEQState;
  introSelectedPreset: IntroMusicPresetId | 'CUSTOM_MP3';
  replayState: BasketReplayState;
  savedHighlightsCount: number;
  postFXEnabled: boolean;
  particlesEnabled: boolean;
  voiceAnnouncerEnabled: boolean;
  spikeCamEnabled: boolean;
  aiCameraEnabled: boolean;
  oneTapControlEnabled: boolean;
  ankleBreaker: AnkleBreakerTelemetry;
  fps: number;
  streakA: number;
  streakB: number;
  opticalContact: OpticalContactTelemetry;
  bouncePhysics: BouncePhysicsTelemetry;
  soccerGoalie: SoccerGoalieTelemetry;
  stealTelemetry: StealTelemetry;
  celebrationCutscene: CelebrationCutsceneState;
  lastPassStyle: OrganicPassStyle;
}
