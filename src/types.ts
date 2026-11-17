import * as THREE from 'three';

export type EnvironmentTheme = 'NIGHT' | 'SUNNY' | 'SUNSET' | 'BEACH' | 'CYBER';
export type CourtSurface = 'HARDWOOD' | 'OLYMPIC_BLUE' | 'SAND' | 'CYBER';
export type TacticalPlay = 'BALANCED' | 'FAST_QUICK' | 'HIGH_OUTSIDE' | 'PIPE_HEAVY' | 'ALL_OUT_SPIKE';
export type DefensiveStrategy = 'ZONAL_PERIMETER' | 'COMMIT_BLOCK' | 'WING_PINCH' | 'ROTATIONAL_DEEP';
export type PassingQuality = 'PERFECT_3' | 'POSITIVE_2' | 'SCRAMBLE_1' | 'SHANK_0';
export type DifficultyLevel = 'ROOKIE' | 'INTERMEDIATE' | 'PRO' | 'LEGEND';
export type ControlMode = 'PLAYER' | 'AUTO';
export type CameraPreset =
  | 'COURT_BEHIND'
  | 'BROADCAST'
  | 'CINEMATIC_FLOW'
  | 'ACTION'
  | 'SKY_CAM'
  | 'ISOMETRIC';

export type CameraLensPreset = '24MM_WIDE' | '35MM_CINE' | '50MM_STD' | '85MM_TELE' | '135MM_SNIPER';

export type CameraFilterMode =
  | 'BROADCAST_STD'
  | 'VICE_NEON'
  | 'CINEMA_NOIR'
  | 'GOLDEN_HOUR'
  | 'VINTAGE_VHS'
  | 'CRISP_HDR';

export type GraphicsQualityPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA_PS6';

export type BallTransitionState =
  | 'HELD_READY'
  | 'SERVE_TOSS'
  | 'SERVE_FLIGHT'
  | 'PASS_ARC'
  | 'SET_TEMPO'
  | 'ATTACK_STRIKE'
  | 'BLOCK_DEFLECT'
  | 'DEAD_ROLL';

export type CeremonyPhase = 'LIVE_MATCH' | 'OPENING_CEREMONY' | 'INTERMISSION';

export type IntroCutscenePhase =
  | 'ORBIT_STADIUM'
  | 'HERO_LOOK_UP'
  | 'BILLBOARD_FULLSCREEN'
  | 'BALL_SWOOSH_TO_FEET';

export type IntroMusicPresetId =
  | 'HARBOUR_PULSE'
  | 'PACIFIC_THUNDER'
  | 'NEON_GROOVE'
  | 'SILENT';

export interface IntroCutsceneState {
  phase: IntroCutscenePhase;
  phaseElapsed: number;
  musicSelected: boolean;
  selectedPreset: IntroMusicPresetId | 'CUSTOM_MP3';
  pendingFormat: MatchFormat;
  subBannerText: string;
}

export type GameScreenMode =
  | 'MAIN_MENU'
  | 'STORY_HUB'
  | 'STORY_CUTSCENE'
  | 'ROSTER'
  | 'SAVES'
  | 'REPLAY_VAULT'
  | 'SETTINGS'
  | 'PLAYING'
  | 'PAUSED'
  | 'MATCH_OVER';

export type MatchFormat = 'QUICK_SET' | 'BEST_OF_3' | 'PRACTICE' | 'AI_SHOWCASE' | 'STORY_MATCH';

export type MatchEvolutionStage =
  | 'OPENING_BREEZE'
  | 'RISING_HEAT'
  | 'DUST_SQUALL'
  | 'MONSOON_CLIMAX';

export type EnvDynamicsMode =
  | 'AUTO_EVOLVE'
  | 'CLEAR'
  | 'DUST_STORM'
  | 'SAND_SQUALL'
  | 'RAIN_STORM';

export type ReplayAngleMode =
  | 'NET_TAPE_SWEEP'
  | 'SPIKER_SHOULDER'
  | 'FLOOR_IMPACT_LOW'
  | 'ORBIT_DRONE';

export type PlayerAccessory =
  | 'HEADBAND'
  | 'VISOR'
  | 'ARM_SLEEVE'
  | 'CAPTAIN_BAND'
  | 'BASEBALL_CAP'
  | 'NONE';
export type PlayerHairStyle = 'SPIKY' | 'SWEPT' | 'BUN' | 'CROP';

export type ActionPromptType = 'NONE' | 'SERVE' | 'DIG' | 'SET' | 'SPIKE' | 'BLOCK';

export type TeamFSMState =
  | 'SERVE_FORMATION'
  | 'RECEIVE_FORMATION'
  | 'TRANSITION_TO_BALL'
  | 'TOUCH_1_PASS'
  | 'TOUCH_2_SET'
  | 'TOUCH_3_ATTACK'
  | 'BLOCK_AND_COVER'
  | 'POINT_CONCLUDED';

export type DefensiveZone =
  | 'ZONE_1_RIGHT_BACK'
  | 'ZONE_2_RIGHT_FRONT'
  | 'ZONE_3_MIDDLE_FRONT'
  | 'ZONE_4_LEFT_FRONT'
  | 'ZONE_5_LEFT_BACK'
  | 'ZONE_6_MIDDLE_BACK';

export type Role = 'Setter' | 'Outside' | 'Middle' | 'Opposite' | 'LeftBack' | 'Libero';

export type AnimState =
  | 'READY_STANCE'
  | 'WALK'
  | 'RUN'
  | 'APPROACH_3STEP'
  | 'PASS_BUMP'
  | 'PASS_OVERHEAD'
  | 'DIVE_PANCAKE'
  | 'SET_HIGH_ARC'
  | 'SET_QUICK'
  | 'SET_BACK'
  | 'SPIKE_WINDUP'
  | 'SPIKE_SWING'
  | 'BLOCK_ROOF'
  | 'SERVE_FLOAT'
  | 'SERVE_JUMP'
  | 'LONG_JUMP_LEAP'
  | 'LANDING_ABSORB'
  | 'FALLEN_FLOOR'
  | 'GETTING_UP'
  | 'CELEBRATION';

export type SensoryReactionState =
  | 'SENSORY_STANDBY'
  | 'TRACKING_INTERCEPT'
  | 'LOCK_POSITION'
  | 'STRIKE_EXECUTION'
  | 'ENERGY_DISCHARGE';

export interface DigitalSkinData {
  reactionState: SensoryReactionState;
  proximityValue: number;
  interceptReadiness: number;
  skinEnergy: number;
  pulsePhase: number;
}

export interface UnitStats {
  awareness: number;
  power: number;
  accuracy: number;
  vertical: number;
}

export interface UnitSkill {
  id: string;
  name: string;
  description: string;
  cooldownMax: number;
  currentCooldown: number;
  isActive: boolean;
}

export interface PlayerProfileMeta {
  archetype: string;
  bio: string;
  accessory: PlayerAccessory;
  hairStyle: PlayerHairStyle;
  skinToneHex: number;
  heightScale: number;
}

export interface PlayerParts {
  group: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  armUpperL: THREE.Group;
  armLowerL: THREE.Group;
  handL: THREE.Mesh;
  armUpperR: THREE.Group;
  armLowerR: THREE.Group;
  handR: THREE.Mesh;
  legUpperL: THREE.Group;
  legLowerL: THREE.Group;
  shoesL: THREE.Group;
  legUpperR: THREE.Group;
  legLowerR: THREE.Group;
  shoesR: THREE.Group;
  auraMesh: THREE.Mesh;
  vectorArrow?: THREE.Mesh;
  skinMat: THREE.MeshStandardMaterial;
}

export type CelebrationStyle =
  | 'TEAM_HUDDLE_JUMP'
  | 'FIST_PUMP_ROAR'
  | 'SPIKE_FLEX_BOW'
  | 'AEROPLANE_GLIDE'
  | 'HIGH_FIVE_BOUNCE'
  | 'CHEST_BUMP_SYNC'
  | 'KNEE_SLIDE_ROAR'
  | 'TEAM_WAVE_SALUTE';

export type ServeVariant = 'FLOAT' | 'TOPSPIN' | 'JUMP' | 'LONG_SERVE';

export type PlayerMoveAction =
  | 'LEFT'
  | 'MID'
  | 'RIGHT'
  | 'FEINT_TIP'
  | 'DIVE_SAVE'
  | 'LONG_JUMP'
  | 'QUICK_SET'
  | 'PASS_DIG'
  | 'STRIKE_SET'
  | 'JUMP_SPIKE';

export type TimingGrade = 'PERFECT' | 'GREAT' | 'EARLY' | 'LATE' | 'NONE';

export type RallyChainStage = 'READY' | 'PASS_STAGE' | 'STRIKE_STAGE' | 'SPIKE_STAGE';

export interface ComicStrikeState {
  active: boolean;
  phase: 'IMPACT_FREEZE' | 'ORBIT_FOLLOW' | 'REALTIME_RETURN' | 'IDLE';
  calloutText: string;
  subText: string;
  speedKmh: number;
  chainStage: RallyChainStage;
  screenX: number;
  screenY: number;
  intensity: number;
  timeScale: number;
  dutchTiltDeg: number;
}

export interface AIDirectorState {
  autoDirectorEnabled: boolean;
  currentProgramLabel: string;
  programRule: string;
  azimuthDeg: number;
  elevationDeg: number;
  fovDeg: number;
  dutchTiltDeg: number;
  fitnessScore: number;
  selfProgrammedShotsCount: number;
}

export interface ReactiveInputSnapshot {
  isCharging: boolean;
  chargeLevel: number; // 0..1
  chargingAction: PlayerMoveAction | 'SERVE' | null;
  lastTimingGrade: TimingGrade;
  lastTimingMs: number;
  lastActionLabel: string;
  comboStreak: number;
  bufferedAction: PlayerMoveAction | null;
  adaptiveBoostPct: number;
  manualSwitchCount: number;
}

export type CutsceneEmotion =
  | 'DETERMINED'
  | 'CONFIDENT'
  | 'RIVAL_SMIRK'
  | 'SHOCKED'
  | 'VICTORY_ROAR'
  | 'FOCUSED';

export type CutsceneCameraShot =
  | 'STADIUM_ESTABLISH'
  | 'SKYLINE_SWEEP'
  | 'PLAYER_CLOSEUP_A'
  | 'PLAYER_CLOSEUP_B'
  | 'NET_FACEOFF'
  | 'VIP_BOX_LOOK'
  | 'TEAM_HUDDLE_PAN'
  | 'COURT_FLYBY'
  | 'HERO_LOW_ANGLE'
  | 'BENCH_HUDDLE';

export interface StoryDialogueLine {
  id: string;
  speaker: string;
  roleTitle: string;
  team: 'A' | 'B' | 'NARRATOR';
  jerseyNumber?: number;
  emotion: CutsceneEmotion;
  line: string;
  cameraShot: CutsceneCameraShot;
  focusUnitTeam?: 'A' | 'B';
  focusUnitJersey?: number;
  targetAnim?: AnimState;
}

export interface StoryChapterSpec {
  id: string;
  chapterNumber: number;
  title: string;
  subtitle: string;
  locationLabel: string;
  opponentClub: string;
  opponentAccent: string;
  difficulty: DifficultyLevel;
  weather: EnvironmentTheme;
  courtSurface: CourtSurface;
  envMode: EnvDynamicsMode;
  targetScore: number;
  setsToWin: number;
  objectiveSummary: string;
  preMatchCutscene: StoryDialogueLine[];
  midMatchTriggerScore: number;
  midMatchCutscene: StoryDialogueLine[];
  postWinCutscene: StoryDialogueLine[];
  postLossCutscene: StoryDialogueLine[];
}

export interface StoryCampaignProgress {
  unlockedChapter: number;
  completedChapters: number[];
  chapterStars: Record<number, number>;
}

export interface StoryRuntimeState {
  activeChapterId: string | null;
  chapterNumber: number;
  chapterTitle: string;
  opponentClub: string;
  objectiveSummary: string;
  targetScore: number;
  cutscenePhase: 'PRE' | 'MID' | 'POST_WIN' | 'POST_LOSS' | null;
  dialogueIndex: number;
  totalLines: number;
  currentLine: StoryDialogueLine | null;
  midMatchTriggered: boolean;
}

export type ShotVariant =
  | 'POWER_CROSS'
  | 'DOWN_THE_LINE'
  | 'CUT_SHOT_SHARP'
  | 'BACK_ROW_PIPE'
  | 'QUICK_TEMPO_1'
  | 'JUMP_FLOAT_TIP'
  | 'TOOL_BLOCK_WIPE';

export interface ScreenSensorState {
  smoothX: number;
  smoothY: number;
  velMag: number;
  microZoom: number;
  active: boolean;
}

export interface Unit {
  id: number;
  name: string;
  team: 'A' | 'B';
  role: Role;
  jerseyNumber: number;
  isLibero: boolean;
  rotationZone: number; // FIVB Zone 1..6
  defensiveZone: DefensiveZone;
  assignedPlayRole: 'RECEIVER' | 'SETTER' | 'SPIKER' | 'BLOCKER' | 'COVER' | 'SERVER' | 'NONE';
  parts: PlayerParts;
  mesh: THREE.Group;
  speed: number;
  actualSpeed: number;
  targetPos: THREE.Vector3;
  homePos: THREE.Vector3;
  lastPos: THREE.Vector3;
  velocity: THREE.Vector3;
  yVel: number;
  isJumping: boolean;
  animState: AnimState;
  animTimer: number;
  stepCycle: number;
  cooldown: number;
  isServer: boolean;
  hasBall: boolean;
  stats: UnitStats;
  skills: UnitSkill[];
  currentMoveName: string;
  currentLeanPitch: number;
  currentLeanRoll: number;
  currentCrouch: number;
  digitalSkin: DigitalSkinData;
  tacticalOffset?: { x: number; z: number };
  sweatLevel: number; // 0..1 accumulated exertion sweat
  stamina: number; // 0..100
  profile: PlayerProfileMeta;
  celebrationStyle?: CelebrationStyle;
  celebrationPhase?: number;
  defeatSlump?: boolean;
  reactiveCharge?: number;
  fallRecoveryTimer?: number;
  isDowned?: boolean;
  isLongJump?: boolean;
}

export interface RuleViolation {
  type: string;
  ruleNumber: string;
  jerseyNumber: number;
  playerName: string;
  team: 'A' | 'B';
  description: string;
}

export interface SkillNotification {
  unitName: string;
  skillName: string;
  description: string;
  team: 'A' | 'B';
  time: number;
}

export interface SwarmModuleSpec {
  id: string;
  name: string;
  category: 'KINEMATICS' | 'PERCEPTION' | 'RULEBOOK' | 'ACOUSTICS' | 'BRAIN' | 'TISSUE';
  status: 'ACTIVE' | 'ISOLATED' | 'THROTTLED';
  latencyMs: number;
  isolated: boolean;
  codePreview: {
    ts: string;
    glsl: string;
    fsm: string;
  };
}

export interface OrganicPixelBlockState {
  atpLevel: number; // 0..100 (R: ATP_FLUX)
  mitosisRate: number; // 1.0 | 1.65 (G: TISSUE_MASS)
  membraneTension: number; // 0.45..0.95 kPa (B: RIPPLE_KINETIC)
  bioluminescence: number; // 88.2..135 lumens (A: LUMEN_GLOW)
  heartRate: number; // BPM
  tissueScale: 256 | 512 | 1024 | 4096;
  cellularMatrixEnabled: boolean;
  lastTouchUV: { x: number; y: number };
  lastRippleTimeSec: number;
}

export interface AGISwarmState {
  fps: number;
  adaptiveQualityScale: number;
  throttled: boolean;
  workerTurbulence: number;
  fractalFoldN: number;
  preyLockCount: number;
  huntModeActive: boolean;
  dspAudioEnabled: boolean;
  bassAmp: number;
  trebleAmp: number;
  isolatedModules: SwarmModuleSpec[];
}

export interface MatchEvolutionState {
  stage: MatchEvolutionStage;
  mode: EnvDynamicsMode;
  intensity: number; // 0..1
  dustLevel: number; // 0..1
  sandLevel: number; // 0..1
  rainLevel: number; // 0..1
  wetnessLevel: number; // 0..1
  avgSweatLevel: number; // 0..1
  windX: number;
  windZ: number;
  elapsedSeconds: number;
}

export interface ReplayUnitFrame {
  id: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  animState: AnimState;
  animTimer: number;
  stepCycle: number;
  leanPitch: number;
  leanRoll: number;
  crouch: number;
  sweatLevel: number;
}

export interface ReplayFrame {
  t: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  ballRotX: number;
  ballRotY: number;
  ballSpeedKmh: number;
  strikeEvent: boolean;
  impactEvent: boolean;
  spikerId: number | null;
  units: ReplayUnitFrame[];
}

export interface SpikeReplayClip {
  id: string;
  recordedAt: number;
  spikerId: number;
  spikerName: string;
  spikerJersey: number;
  team: 'A' | 'B';
  speedKmh: number;
  jumpHeight: number;
  shotType: string;
  impactPos: { x: number; y: number; z: number };
  spikerPos: { x: number; y: number; z: number };
  scoreA: number;
  scoreB: number;
  setNumber: number;
  ratingScore: number;
  frames: ReplayFrame[];
}

export interface ReplayPlaybackState {
  active: boolean;
  showcaseLoop: boolean;
  autoShowcaseEnabled: boolean;
  clipIndex: number;
  totalClips: number;
  currentClip: Omit<SpikeReplayClip, 'frames'> | null;
  currentAngle: ReplayAngleMode;
  angleIndex: number;
  totalAngles: number;
  progress: number;
  playbackSpeed: number;
}

export interface SavedMatchSlot {
  id: string;
  name: string;
  savedAt: string;
  matchFormat: MatchFormat;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  currentSet: number;
  servingTeam: 'A' | 'B';
  weather: EnvironmentTheme;
  courtSurface: CourtSurface;
  difficulty: DifficultyLevel;
  tacticalPlayA: TacticalPlay;
  defensiveStrategyA: DefensiveStrategy;
  envDynamicsMode: EnvDynamicsMode;
  evolutionIntensity: number;
  elapsedSeconds: number;
  bestSpikeKmh: number;
  rotationA: number[];
  rotationB: number[];
  playerSweat: Record<number, number>;
  topSpikes: SpikeReplayClip[];
}

export interface CareerStats {
  matchesPlayed: number;
  matchesWon: number;
  totalSpikes: number;
  fastestSpikeKmh: number;
  bestSpikeOwner: string;
  totalBlocks: number;
  totalPointsScored: number;
}

export interface GameState {
  screenMode: GameScreenMode;
  matchFormat: MatchFormat;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  currentSet: number;
  rallyCount: number;
  servingTeam: 'A' | 'B';
  matchState: 'WARMUP' | 'SERVE' | 'PLAY' | 'POINT_SCORED' | 'SET_OVER' | 'MATCH_OVER';
  controlMode: ControlMode;
  activePrompt: ActionPromptType;
  promptTiming: number;
  activePlayerName: string;
  activePlayerJersey: number;
  teamFSMStateA: TeamFSMState;
  teamFSMStateB: TeamFSMState;
  touchesA: number;
  touchesB: number;
  netViolation: RuleViolation | null;
  cameraAngle: CameraPreset;
  actionLog: string[];
  weather: EnvironmentTheme;
  courtSurface: CourtSurface;
  fogDensity: number;
  lightingIntensity: number;
  ballSpeedKmh: number;
  lastShotType: string;
  lastJumpHeight: number;
  momentumA: number;
  momentumB: number;
  hyperDriveActive: boolean;
  tacticalPlayA: TacticalPlay;
  tacticalPlayB: TacticalPlay;
  defensiveStrategyA: DefensiveStrategy;
  defensiveStrategyB: DefensiveStrategy;
  lastPassQuality: PassingQuality | null;
  lastPassRatingText: string;
  activeSkillNotification: SkillNotification | null;
  gameSpeed: number;
  difficulty: DifficultyLevel;
  agiSwarm?: AGISwarmState;
  organicBlock?: OrganicPixelBlockState;
  spikeCamEnabled?: boolean;
  spikeCamActive?: boolean;
  liveCommentaryLine?: string;
  commentaryHistory?: string[];
  geminiBrainStatus?: {
    isSyncing: boolean;
    lastSyncTime: number;
    tacticName: string;
    coachInstruction: string;
    lastVoiceCommentary: string;
    readinessAverage: number;
    recommendedTargetZone: number;
  };
  voiceAnnouncerEnabled?: boolean;
  voiceAnnouncerVolume?: number;
  hyperAssessment?: HyperAssessmentReport;
  spatialNotifications?: SpatialNotification[];
  audioEQ?: AudioEQState;
  selfPropagatingEnergy?: number;
  matchEvolution: MatchEvolutionState;
  replayState: ReplayPlaybackState;
  savedSpikesCount: number;
  postFXEnabled: boolean;
  particlesEnabled: boolean;
  crowdMood: CrowdMoodState;
  spriteMatrixSlots: SpriteMatrixUnitSlot[];
  spriteMatrixVisible: boolean;
  screenSensor?: ScreenSensorState;
  cameraLens: CameraLensPreset;
  cameraFilter: CameraFilterMode;
  graphicsQuality: GraphicsQualityPreset;
  ballPhase: BallTransitionState;
  ceremonyPhase: CeremonyPhase;
  ceremonyTimer: number;
  refereeCallText: string;
  reactiveControl: ReactiveInputSnapshot;
  storyState?: StoryRuntimeState;
  rallyChainStage: RallyChainStage;
  comicStrike: ComicStrikeState;
  aiDirector: AIDirectorState;
  introCutscene: IntroCutsceneState;
  syntheticStoryline: SyntheticStorylineState;
  orchestrator?: OrchestratorSnapshot;
  manualUnitLocked?: boolean;
}

export type MovementPatternId =
  | 'EXPLOSIVE_CUTTER'
  | 'GLIDE_LIBERO'
  | 'TEMPO_ARCHITECT'
  | 'POWER_PENDULUM'
  | 'SHADOW_GUARD'
  | 'ACE_COUNTER';

export type PassingPatternId =
  | 'LASER_PLATFORM'
  | 'PANCAKE_SWEEPER'
  | 'QUICK_HANDS_SETTER'
  | 'HIGH_ARC_ANCHOR'
  | 'TACTICAL_DEFLECTOR';

export type DefeatRecoveryStyle = 'HANDS_ON_KNEES' | 'HANDS_ON_HIPS' | 'TOWEL_BREATH';

export type SpriteSpecId =
  | 'READY_COIL'
  | 'LATERAL_SHUFFLE'
  | 'SPRINT_PURSUIT'
  | 'RUNWAY_3STEP_APPROACH'
  | 'AERIAL_APEX_FLOAT'
  | 'PASS_PANCAKE_DIVE'
  | 'SPLIT_STEP_REACT'
  | 'DECEL_BRAKE_PLANT'
  | 'PASS_FOREARM_PLATFORM'
  | 'SET_TEMPO_RELEASE'
  | 'STRIKE_THUNDER_SPIKE'
  | 'BLOCK_NET_WALL'
  | 'GETUP_RECOVER'
  | 'CELEB_ROAR_JUMP'
  | 'CELEB_SLIDE_GLIDE'
  | 'DEFEAT_RECOVERY_BREATH';

export type SpriteSpecCategory = 'MOVEMENT' | 'PASSING' | 'REACTION' | 'CELEBRATION';

export interface SpriteSpecEntry {
  id: SpriteSpecId;
  category: SpriteSpecCategory;
  label: string;
  atlasCol: number;
  atlasRow: number;
  colorHex: number;
  baseScale: number;
  baseOpacity: number;
  strideCadenceMult: number;
  kneeFlexTargetDeg: number;
  hipDropRatio: number;
  footprintScuffRate: number;
}

export interface IndividualBehaviorPattern {
  movementPattern: MovementPatternId;
  passingPattern: PassingPatternId;
  primaryCelebration: CelebrationStyle;
  secondaryCelebration: CelebrationStyle;
  defeatStyle: DefeatRecoveryStyle;
  accelMult: number;
  sprintBankMult: number;
  splitStepHeight: number;
  strideLengthMult: number;
  voronoiCushionM: number;
  platformStability: number;
  diveCommitRadius: number;
  diveMinBallY: number;
  setTempoMult: number;
  overheadBias: number;
  passSpreadScale: number;
  celebrationTempoMult: number;
  huddleRadiusBias: number;
  jumpImpulseBoost: number;
}

export interface LegsToFloorTelemetry {
  hipHeightM: number;
  leftFootFloorGapM: number;
  rightFootFloorGapM: number;
  kneeFlexLeftDeg: number;
  kneeFlexRightDeg: number;
  plantedFoot: 'L' | 'R' | 'BOTH' | 'AIR';
  groundClampApplied: boolean;
}

export interface UnitOrchestratorRecord {
  unitId: number;
  playerName: string;
  jerseyNumber: number;
  team: 'A' | 'B';
  role: Role;
  movementPattern: MovementPatternId;
  passingPattern: PassingPatternId;
  celebrationStyle: CelebrationStyle;
  activeSpriteId: SpriteSpecId;
  spriteSpecLabel: string;
  spriteCol: number;
  spriteRow: number;
  passesCompleted: number;
  perfectPasses: number;
  passingAvgQuality: number;
  legsToFloor: LegsToFloorTelemetry;
}

export interface OrchestratorSnapshot {
  totalSpecsCount: number;
  activePatternsCount: number;
  teamAvgPassQualityA: number;
  teamAvgPassQualityB: number;
  floorContactAccuracyPct: number;
  lastCelebrationFormation: string;
  records: UnitOrchestratorRecord[];
}

export interface SyntheticStorylineBeat {
  id: string;
  actNumber: 1 | 2 | 3 | 4;
  headline: string;
  narrative: string;
  timestamp: string;
  triggerTag: string;
}

export interface SyntheticStorylineState {
  heroName: string;
  heroJersey: number;
  heroGearLabel: string;
  actNumber: 1 | 2 | 3 | 4;
  actTitle: string;
  evolutionXp: number;
  nextActXp: number;
  auraLevel: number;
  heroMood: 'FOCUSED' | 'FIRED_UP' | 'LOCKED_IN' | 'UNSTOPPABLE';
  activeLine: string;
  currentBeatHeadline: string;
  milestonesUnlocked: string[];
  recentBeats: SyntheticStorylineBeat[];
}

export type KinematicState =
  | 'READY'
  | 'SPLIT_STEP'
  | 'ACCELERATE'
  | 'SPRINT'
  | 'DECEL_PLANT'
  | 'APPROACH_3STEP'
  | 'AIRBORNE'
  | 'DIVE_SLIDE'
  | 'RECOVER';

export interface SpriteMatrixUnitSlot {
  unitId: number;
  playerName: string;
  jerseyNumber: number;
  team: 'A' | 'B';
  kinematicState: KinematicState;
  activeSpriteId?: SpriteSpecId;
  movementPattern?: MovementPatternId;
  passingPattern?: PassingPatternId;
  matrixCol: number;
  matrixRow: number;
  spriteCellX: number;
  spriteCellY: number;
  stridePhase: number;
  coordinationScore: number;
}

export interface CrowdMoodState {
  excitement: number;
  waveActive: boolean;
  cheerLabel: string;
  decibelLevel: number;
}

export type VectorPhase =
  | 'STAND'
  | 'WALK'
  | 'RUN'
  | 'JUMP'
  | 'APPROACH'
  | 'STRIKE'
  | 'BLOCK'
  | 'DIG';

export interface SpatialNotification {
  id: string;
  unitId: number;
  playerName: string;
  jerseyNumber: number;
  team: 'A' | 'B';
  zone: number;
  vectorPhase: VectorPhase;
  gridX: number;
  gridZ: number;
  velMag: number;
  flowEnergy: number;
  label: string;
  detail: string;
  timestamp: number;
}

export interface AudioEQState {
  trackName: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  bassLevel: number;
  midLevel: number;
  highLevel: number;
  bins: number[];
}

export interface PossibilityNode {
  id: string;
  label: string;
  score: number;
  risk: number;
  selected: boolean;
}

export interface HyperAssessmentAxis {
  id: string;
  label: string;
  score: number;
  status: 'VERIFIED' | 'WARNING' | 'CRITICAL';
  detail: string;
}

export interface HyperAssessmentReport {
  overallScore: number;
  verifiedAxes: number;
  totalAxes: number;
  voronoiSpreadMeters: number;
  minTeammateDist: number;
  overlapCount: number;
  trajectoryConfidence: number;
  recordedFrames: number;
  axes: HyperAssessmentAxis[];
  possibilities: PossibilityNode[];
}
