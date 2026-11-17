import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ActionPromptType,
  AIDirectorState,
  AnimState,
  BallTransitionState,
  CameraFilterMode,
  CameraLensPreset,
  CameraPreset,
  CelebrationStyle,
  CeremonyPhase,
  ComicStrikeState,
  ControlMode,
  CourtSurface,
  CutsceneCameraShot,
  DefensiveStrategy,
  DefensiveZone,
  DifficultyLevel,
  EnvDynamicsMode,
  EnvironmentTheme,
  GameScreenMode,
  GameState,
  GraphicsQualityPreset,
  IntroCutsceneState,
  IntroMusicPresetId,
  MatchEvolutionStage,
  MatchEvolutionState,
  MatchFormat,
  OrganicPixelBlockState,
  PassingQuality,
  PlayerAccessory,
  PlayerHairStyle,
  PlayerMoveAction,
  PlayerParts,
  PlayerProfileMeta,
  RallyChainStage,
  ReactiveInputSnapshot,
  ReplayAngleMode,
  Role,
  SavedMatchSlot,
  ScreenSensorState,
  ServeVariant,
  ShotVariant,
  SpikeReplayClip,
  StoryChapterSpec,
  StoryDialogueLine,
  StoryRuntimeState,
  SwarmModuleSpec,
  TacticalPlay,
  TimingGrade,
  Unit,
  UnitSkill,
  UnitStats,
} from './types';
import {
  AGISwarmWorkerBridge,
  FrameRateGovernor,
  OdonataDSPEngine,
  createInitialSwarmModules,
  renderMembraneRippleOverlay,
} from './agiSwarm';
import { SentientGameMatrix } from './matrix/shaders/sentientShader';
import { CharacterShaderRig } from './matrix/shaders/characterShader';
import { BallisticRaycasterBridge } from './matrix/physics/ballisticBridge';
import { HandContactZone, HandHitboxResult, HandHitboxSystem } from './matrix/physics/handHitboxSystem';
import { SpatialAssessment, SpatialAwarenessMatrix } from './matrix/ai/spatialMatrix';
import { AIBehaviorSteering } from './matrix/ai/aiSteering';
import { AICameraSelfProgrammer, ComicOrbitSolution } from './matrix/ai/aiCameraDirector';
import { MovementOrchestrator } from './matrix/ai/movementOrchestrator';
import { TelemetryRecorder } from './matrix/telemetry/telemetryRecorder';
import { AtmosphericParticleSystem } from './matrix/graphics/atmosphericParticles';
import { CourtFloorMatrixSystem } from './matrix/graphics/courtFloorSystem';
import { CrowdSystem } from './matrix/graphics/crowdSystem';
import { PS6PostFXPipeline, getCssFilterForMode } from './matrix/graphics/ps6PostFX';
import { SpikeReplaySystem } from './matrix/graphics/spikeReplaySystem';
import { StadiumPersonnelSystem } from './matrix/graphics/stadiumPersonnel';
import { VancouverCityDistrict } from './matrix/graphics/vancouverCityDistrict';
import { VancouverSkyline } from './matrix/graphics/vancouverSkyline';
import { VIPSuitesSystem } from './matrix/graphics/vipSuitesSystem';
import { STORY_CHAPTERS, getStoryChapterById } from './story/storyCampaign';
import { SyntheticStorylineEngine } from './story/syntheticStoryline';
import {
  compileAthleteFromPrompt,
  getDefaultPlayerProfile,
  loadReplayVaultClips,
  loadRosterOverrides,
  loadStoryProgress,
  recordStoryChapterVictory,
  saveMatchSlot,
  saveReplayVaultClips,
  saveRosterOverride,
  updateCareerStats,
} from './saveManager';

const ROSTER_A = [
  { name: 'TAKAHASHI', role: 'Outside' as Role, num: 12 },
  { name: 'SEKITA', role: 'Setter' as Role, num: 8 },
  { name: 'NISHIDA', role: 'Opposite' as Role, num: 1 },
  { name: 'ISHIKAWA', role: 'LeftBack' as Role, num: 14 },
  { name: 'YAMAMOTO', role: 'Libero' as Role, num: 20 },
  { name: 'ONODERA', role: 'Middle' as Role, num: 2 },
];

const ROSTER_B = [
  { name: 'LAVIA', role: 'Outside' as Role, num: 15 },
  { name: 'GIANNELLI', role: 'Setter' as Role, num: 6 },
  { name: 'ROMANO', role: 'Opposite' as Role, num: 16 },
  { name: 'MICHIELETTO', role: 'LeftBack' as Role, num: 5 },
  { name: 'BALASO', role: 'Libero' as Role, num: 7 },
  { name: 'RUSSO', role: 'Middle' as Role, num: 19 },
];

const ZONE_MAP: Record<number, DefensiveZone> = {
  1: 'ZONE_1_RIGHT_BACK',
  2: 'ZONE_2_RIGHT_FRONT',
  3: 'ZONE_3_MIDDLE_FRONT',
  4: 'ZONE_4_LEFT_FRONT',
  5: 'ZONE_5_LEFT_BACK',
  6: 'ZONE_6_MIDDLE_BACK',
};

export class VolleyballEngine {
  private container: HTMLElement;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private pmremGenerator?: THREE.PMREMGenerator;
  private envRenderTarget?: THREE.WebGLRenderTarget;
  private resizeObserver?: ResizeObserver;
  private isSoftwareGl = false;

  // AGI Swarm + Quantum Organic Screen OS v10.5 + PS6 Cometic Volleyball Matrix Subsystems
  private fpsGovernor = new FrameRateGovernor(120);
  private swarmWorker = new AGISwarmWorkerBridge();
  private dspEngine = new OdonataDSPEngine();
  private swarmModules: SwarmModuleSpec[] = createInitialSwarmModules();
  private bioRegister = new THREE.Vector4(0.98, 1.0, 0.45, 88.2);
  private matrixPipeline!: SentientGameMatrix;
  private characterShaderRig = new CharacterShaderRig();
  private ballisticBridge!: BallisticRaycasterBridge;
  private handHitboxSystem = new HandHitboxSystem();
  private aiCameraDirector = new AICameraSelfProgrammer();
  private spatialMatrix = new SpatialAwarenessMatrix();
  private aiSteering = new AIBehaviorSteering();
  private movementOrchestrator!: MovementOrchestrator;
  private telemetryRecorder = new TelemetryRecorder();
  private particleSystem!: AtmosphericParticleSystem;
  private courtFloorSystem!: CourtFloorMatrixSystem;
  private crowdSystem!: CrowdSystem;
  private vipSuites!: VIPSuitesSystem;
  private stadiumPersonnel!: StadiumPersonnelSystem;
  private vancouverSkyline?: VancouverSkyline;
  private vancouverCity?: VancouverCityDistrict;
  private syntheticStory = new SyntheticStorylineEngine();
  private trimTealMat!: THREE.MeshBasicMaterial;
  private trimCoralMat!: THREE.MeshBasicMaterial;
  private billboardTopNeonMat!: THREE.MeshBasicMaterial;
  private billboardBotNeonMat!: THREE.MeshBasicMaterial;
  private reactiveLightPillars: THREE.Mesh[] = [];
  private introLookStoryTriggered = false;
  private sponsorTextures: THREE.CanvasTexture[] = [];
  private postFX!: PS6PostFXPipeline;
  private replaySystem = new SpikeReplaySystem();
  private lastSpatialAssessment: SpatialAssessment | null = null;
  private lastTrajectoryConfidence = 0.96;
  private hasPendingImpact = false;
  private pendingImpactPos = new THREE.Vector3();
  private lastFloorAudioTime = 0;
  private userOrbitPauseTimer = 0;
  private isUserOrbiting = false;
  private cameraLens: CameraLensPreset = '85MM_TELE';
  private cameraFilter: CameraFilterMode = 'BROADCAST_STD';
  private graphicsQuality: GraphicsQualityPreset = 'HIGH';
  private ballPhase: BallTransitionState = 'HELD_READY';
  private ceremonyPhase: CeremonyPhase = 'LIVE_MATCH';
  private ceremonyTimer = 0;
  private refereeCallText = 'PLAY READY';
  private serveTossTimer = 0;
  private pendingServeSpec: {
    server: Unit;
    power: number;
    targetX: number;
    targetZ: number;
    type: ServeVariant;
  } | null = null;

  // Match Evolution (Dust, Sand, Rain, Sweat) + Post-FX Impulse State
  private matchEvolution: MatchEvolutionState = {
    stage: 'OPENING_BREEZE',
    mode: 'AUTO_EVOLVE',
    intensity: 0.14,
    dustLevel: 0.22,
    sandLevel: 0.08,
    rainLevel: 0.0,
    wetnessLevel: 0.0,
    avgSweatLevel: 0.0,
    windX: 0.6,
    windZ: 0.25,
    elapsedSeconds: 0,
  };
  private baseCourtRoughness = 0.52;
  private postFXEnabled = true;
  private particlesEnabled = true;
  private postFXVelocityPulse = 0;
  private postFXImpactFlash = 0;
  private readonly postFXImpactUV = new THREE.Vector2(0.5, 0.5);
  private readonly _projVec = new THREE.Vector3();
  private readonly _sweatEmitPos = new THREE.Vector3();

  // Pass -> Strike -> Spike Chain + Comic Close-Up Slow-Mo Orbit Camera + AI Self-Programmer
  private rallyChainStage: RallyChainStage = 'READY';
  private comicStrikeTimer = 0;
  private readonly comicStrikeDuration = 1.48;
  private comicStrikeStartBallPos = new THREE.Vector3();
  private comicStrike: ComicStrikeState = {
    active: false,
    phase: 'IDLE',
    calloutText: '',
    subText: '',
    speedKmh: 0,
    chainStage: 'READY',
    screenX: 0.5,
    screenY: 0.45,
    intensity: 0,
    timeScale: 1.0,
    dutchTiltDeg: 0,
  };
  private readonly comicBurstUV = new THREE.Vector2(0.5, 0.5);
  private readonly _hitResult: HandHitboxResult = {
    hit: false,
    zone: 'FOREARM_PLATFORM',
    contactPoint: new THREE.Vector3(),
    handNormal: new THREE.Vector3(0, 1, 0),
    qualityFactor: 1,
  };
  private readonly _comicOrbitSol: ComicOrbitSolution = {
    cameraPos: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    fov: 32,
    dutchTiltDeg: 0,
    azimuthDeg: 0,
    fitnessScore: 95,
  };
  private cutsceneShotTimer = 0;
  private activeCameraDutchTiltDeg = 0;

  // PS6 Opening Cutscene & AIM Vancouver Billboard EQ Choreography
  private introState: IntroCutsceneState = {
    phase: 'ORBIT_STADIUM',
    phaseElapsed: 0,
    musicSelected: false,
    selectedPreset: 'HARBOUR_PULSE',
    pendingFormat: 'BEST_OF_3',
    subBannerText: 'COAL HARBOUR ARENA · VANCOUVER, BC',
  };
  private introHeroBounceTriggered = false;
  private introBillboardSpeakerRings: THREE.Mesh[] = [];
  private readonly introBillboardPos = new THREE.Vector3(0, 10.6, -22.5);

  // Pending spike metadata for Replay Capture on floor smash / point conclusion
  private pendingSpikeMeta: {
    spiker: Unit;
    speedKmh: number;
    jumpHeight: number;
    shotType: string;
  } | null = null;
  private bestSpikeKmhThisMatch = 0;
  private frameStrikeEvent = false;
  private frameImpactEvent = false;
  private frameSpikerId: number | null = null;
  private softGlTimeoutId: number | null = null;
  private disposed = false;

  private organicBlock: OrganicPixelBlockState = {
    atpLevel: 98,
    mitosisRate: 1.0,
    membraneTension: 0.45,
    bioluminescence: 88.2,
    heartRate: 72,
    tissueScale: 1024,
    cellularMatrixEnabled: true,
    lastTouchUV: { x: 0.5, y: 0.5 },
    lastRippleTimeSec: -10,
  };

  private huntModeActive = true;
  private hudTelemetryTimer = 0;
  private lastAppliedPixelRatio = 1.0;
  private pointDelay = 0;
  private autoServeTimer = 0;
  private bannerClearTimer = 0;
  private geminiSyncTimer = 0;
  private isGeminiSyncing = false;
  private lastAnnouncedVoiceTime = 0;
  private lastAnnouncedGeminiQuote = '';

  // Regulation FIVB Dimensions (Right-hand Y-up; Team A Cyan on +Z, Team B Orange on -Z)
  private readonly COURT_WIDTH = 9.0;
  private readonly COURT_LENGTH = 18.0;
  private readonly NET_HEIGHT = 2.43;
  private readonly BALL_RADIUS = 0.145;
  private readonly GRAVITY = -11.4;
  private readonly PLAYER_GRAVITY = -21.8;

  // Pre-allocated zero-GC scratch math helpers
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _lowDiveIntercept = new THREE.Vector3();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _m1 = new THREE.Matrix4();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _courtPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Core 3D Scene Objects
  private ball!: THREE.Group;
  private ballShadow!: THREE.Mesh;
  private landingRing!: THREE.Mesh;
  private timingRing!: THREE.Mesh;
  private aimMarker!: THREE.Mesh;
  private ballPosPrev = new THREE.Vector3();
  private ballVel = new THREE.Vector3();
  private ballSpin = new THREE.Vector3();
  private ballApex = 0;
  private ballSquishTimer = 0;

  private units: Unit[] = [];
  private netMesh!: THREE.Mesh;
  private netOrigPos!: Float32Array;
  private netImpacts: { pos: THREE.Vector3; force: number; time: number }[] = [];

  private courtMat!: THREE.MeshStandardMaterial;
  private surroundMat!: THREE.MeshStandardMaterial;
  private courtTextures!: Record<CourtSurface, THREE.CanvasTexture>;
  private surroundTextures!: Record<CourtSurface, THREE.CanvasTexture>;
  private ambientLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLightA!: THREE.DirectionalLight;
  private rimLightB!: THREE.DirectionalLight;
  private oceanMesh!: THREE.Mesh;
  private stadiumGroup = new THREE.Group();
  private palmTreesGroup = new THREE.Group();
  private roofTrussesGroup = new THREE.Group();
  private jumbotronCanvas!: HTMLCanvasElement;
  private jumbotronCtx!: CanvasRenderingContext2D;
  private jumbotronTex!: THREE.CanvasTexture;
  private impactRings: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];

  // Rally & FSM Control
  private currentSide: 'A' | 'B' = 'A';
  private sideTouches = 0;
  private lastContactPlayer: Unit | null = null;
  private expectedReceiver: Unit | null = null;
  private expectedSetter: Unit | null = null;
  private expectedSpiker: Unit | null = null;
  private rawLandingSpot = new THREE.Vector3();
  private timeToBallContact = 1.0;
  private playerAimXZ = new THREE.Vector2(0, -4.5);
  private playerSteerTarget: THREE.Vector2 | null = null;
  private playerActionQueued = false;
  private desiredSetType: 'QUICK' | 'HIGH' | 'BACK' = 'HIGH';
  private desiredAttackOverride: PlayerMoveAction | null = null;
  private reactiveChargeTimer = 0;
  private reactiveBufferTimer = 0;
  private reactiveLastTimingGrade: TimingGrade = 'NONE';
  private reactiveGradeClearTimer = 0;
  private reactiveAdaptivePower = 0;
  private hitStopTimer = 0;
  private manualMoveX = 0;
  private manualMoveZ = 0;
  private manualActiveUnitId: number | null = null;
  private manualUnitLocked = false;
  private reactiveState: ReactiveInputSnapshot = {
    isCharging: false,
    chargeLevel: 0,
    chargingAction: null,
    lastTimingGrade: 'NONE',
    lastTimingMs: 0,
    lastActionLabel: 'READY',
    comboStreak: 0,
    bufferedAction: null,
    adaptiveBoostPct: 0,
    manualSwitchCount: 0,
  };
  private activeStoryChapter: StoryChapterSpec | null = null;
  private pendingMidCutscene = false;
  private storyState: StoryRuntimeState = {
    activeChapterId: null,
    chapterNumber: 1,
    chapterTitle: '',
    opponentClub: 'Vice Coral',
    objectiveSummary: '',
    targetScore: 25,
    cutscenePhase: null,
    dialogueIndex: 0,
    totalLines: 0,
    currentLine: null,
    midMatchTriggered: false,
  };
  private cameraShake = 0;
  private lastTime = performance.now();
  private animationFrameId = 0;
  private eqPeakHold = new Array<number>(32).fill(0);

  // PS6 Spike Follow-Through Action Camera, Smooth Micro-Zoom & Screen Sensor
  private spikeCamEnabled = true;
  private spikeCamActive = false;
  private spikeCamTimer = 0;
  private readonly spikeCamDuration = 1.65;
  private baseCamPos = new THREE.Vector3(0, 8.2, 19.8);
  private baseCamTarget = new THREE.Vector3(0, 1.25, -1.2);
  private baseCamFov = 48;
  private currentCamFov = 26;
  private camTransitionTimer = 0;
  private spikeCamAnchor = new THREE.Vector3();
  private spikeCamStrikeTarget = new THREE.Vector3();
  private celebrationWinnerTeam: 'A' | 'B' | null = null;

  private rawSensorUV = new THREE.Vector2(0.5, 0.5);
  private smoothSensorUV = new THREE.Vector2(0.5, 0.5);
  private prevSensorUV = new THREE.Vector2(0.5, 0.5);
  private sensorVelMag = 0;
  private sensorMicroZoom = 0;
  private sensorActive = false;
  private screenSensorState: ScreenSensorState = {
    smoothX: 0.5,
    smoothY: 0.5,
    velMag: 0,
    microZoom: 0,
    active: false,
  };

  private onStateUpdate: (state: GameState) => void;
  public state: GameState;

  constructor(
    container: HTMLElement,
    overlayCanvas: HTMLCanvasElement | null,
    onStateUpdate: (state: GameState) => void
  ) {
    this.container = container;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
    this.onStateUpdate = onStateUpdate;

    const isMobileViewport = (container.clientWidth || window.innerWidth) < 768;
    this.replaySystem.loadClips(loadReplayVaultClips());

    this.state = {
      screenMode: 'MAIN_MENU',
      matchFormat: 'BEST_OF_3',
      scoreA: 0,
      scoreB: 0,
      setsA: 0,
      setsB: 0,
      currentSet: 1,
      rallyCount: 0,
      servingTeam: 'A',
      matchState: 'SERVE',
      controlMode: 'PLAYER',
      activePrompt: 'SERVE',
      promptTiming: 0,
      activePlayerName: 'ISHIKAWA',
      activePlayerJersey: 14,
      manualUnitLocked: false,
      teamFSMStateA: 'SERVE_FORMATION',
      teamFSMStateB: 'RECEIVE_FORMATION',
      touchesA: 0,
      touchesB: 0,
      netViolation: null,
      cameraAngle: 'BROADCAST',
      actionLog: ['AIM V PS6 Vice Coast ready. Choose a mode or quick-launch into court play.'],
      weather: 'SUNSET',
      courtSurface: 'OLYMPIC_BLUE',
      fogDensity: 0.004,
      lightingIntensity: 1.0,
      ballSpeedKmh: 0,
      lastShotType: 'READY TO SERVE',
      lastJumpHeight: 0,
      momentumA: 25,
      momentumB: 25,
      hyperDriveActive: false,
      tacticalPlayA: 'BALANCED',
      tacticalPlayB: 'BALANCED',
      defensiveStrategyA: 'ZONAL_PERIMETER',
      defensiveStrategyB: 'ZONAL_PERIMETER',
      lastPassQuality: null,
      lastPassRatingText: '',
      activeSkillNotification: null,
      gameSpeed: 1.0,
      difficulty: 'PRO',
      organicBlock: { ...this.organicBlock },
      spikeCamEnabled: true,
      spikeCamActive: false,
      liveCommentaryLine: 'AIM V PS6 EDITION • VICE COAST STADIUM LIVE — PRESS PLAY TO ENTER COURT',
      commentaryHistory: ['AIM V PS6 Vice Coast edition initialized.'],
      voiceAnnouncerEnabled: false,
      voiceAnnouncerVolume: 0.75,
      spatialNotifications: [],
      selfPropagatingEnergy: 0.25,
      audioEQ: this.dspEngine.getAudioEQState(),
      matchEvolution: { ...this.matchEvolution },
      replayState: this.replaySystem.getPlaybackState(),
      savedSpikesCount: this.replaySystem.getClips().length,
      postFXEnabled: this.postFXEnabled,
      particlesEnabled: this.particlesEnabled,
      crowdMood: {
        excitement: 0.24,
        waveActive: false,
        cheerLabel: 'ARENA WARMUP',
        decibelLevel: 79,
      },
      spriteMatrixSlots: [],
      spriteMatrixVisible: true,
      screenSensor: { ...this.screenSensorState },
      cameraLens: this.cameraLens,
      cameraFilter: this.cameraFilter,
      graphicsQuality: this.graphicsQuality,
      ballPhase: this.ballPhase,
      ceremonyPhase: this.ceremonyPhase,
      ceremonyTimer: this.ceremonyTimer,
      refereeCallText: this.refereeCallText,
      reactiveControl: { ...this.reactiveState },
      storyState: { ...this.storyState },
      rallyChainStage: this.rallyChainStage,
      comicStrike: { ...this.comicStrike },
      aiDirector: { ...this.aiCameraDirector.getState() },
      introCutscene: { ...this.introState },
      syntheticStoryline: this.syntheticStory.getState(),
    };

    this.scene = new THREE.Scene();
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(container.clientWidth || rect.width || window.innerWidth));
    const height = Math.max(1, Math.floor(container.clientHeight || rect.height || window.innerHeight));

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.4, 520);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'default',
      alpha: false,
    });

    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      this.isSoftwareGl = false;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.lastAppliedPixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.lastAppliedPixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerInteract);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);

    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.envRenderTarget = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = this.envRenderTarget.texture;
      this.scene.environmentIntensity = 0.32;
    } catch {
      // Fallback to crisp Hemisphere + Directional lights if PMREM is unavailable
      this.scene.environment = null;
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 52;
    // Let single-finger drags steer/aim on court when in PLAYER mode; two-finger orbit/zoom works naturally
    this.controls.enablePan = false;
    this.controls.addEventListener('start', () => {
      this.isUserOrbiting = true;
      this.userOrbitPauseTimer = 3.0;
    });
    this.controls.addEventListener('end', () => {
      this.isUserOrbiting = false;
      this.userOrbitPauseTimer = 2.6;
    });

    this.matrixPipeline = new SentientGameMatrix(
      this.renderer,
      this.scene,
      this.camera,
      this.COURT_WIDTH,
      this.COURT_LENGTH
    );
    this.ballisticBridge = new BallisticRaycasterBridge(
      this.scene,
      this.BALL_RADIUS,
      this.GRAVITY,
      this.NET_HEIGHT,
      6
    );
    this.movementOrchestrator = new MovementOrchestrator(
      this.scene,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    this.particleSystem = new AtmosphericParticleSystem(this.scene, this.lastAppliedPixelRatio);
    this.postFX = new PS6PostFXPipeline(this.renderer, this.scene, this.camera, this.isSoftwareGl);
    this.telemetryRecorder.startRecording();

    this.setupLighting();
    this.buildArenaAndCourt();
    this.buildNetAndClearSideline();
    this.buildBallAndIndicators();
    this.initTeams();

    this.setWeather('SUNSET');
    this.setCourtSurface('OLYMPIC_BLUE');
    this.setGraphicsQuality(this.graphicsQuality);
    this.setCameraAngle(this.state.cameraAngle, true);
    this.resetPoint('A');

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
    requestAnimationFrame(() => this.resize());
    window.addEventListener('resize', this.resize);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.animationFrameId);
  };

  private handleContextRestored = () => {
    this.lastTime = performance.now();
    this.animate();
  };

  private setupLighting() {
    this.ambientLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.68);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff6e9, 2.22);
    this.sunLight.position.set(16, 26, 12);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -14;
    this.sunLight.shadow.camera.right = 14;
    this.sunLight.shadow.camera.top = 14;
    this.sunLight.shadow.camera.bottom = -14;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLightA = new THREE.DirectionalLight(0x00f0ff, 0.72);
    this.rimLightA.position.set(-14, 12, -16);
    this.scene.add(this.rimLightA);

    this.rimLightB = new THREE.DirectionalLight(0xff3d7f, 0.66);
    this.rimLightB.position.set(14, 12, 16);
    this.scene.add(this.rimLightB);
  }

  private buildArenaAndCourt() {
    this.courtFloorSystem = new CourtFloorMatrixSystem(
      this.scene,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.COURT_WIDTH,
      this.COURT_LENGTH
    );
    this.courtMat = this.courtFloorSystem.courtMat;
    this.surroundMat = this.courtFloorSystem.surroundMat;
    this.courtTextures = this.courtFloorSystem.courtTextures;
    this.surroundTextures = this.courtFloorSystem.surroundTextures;

    // AIM Vancouver Perimeter LED Sponsor Boards (1024x128 crisp branding along inner barrier walls)
    const buildSponsorLedTex = (primary: string, secondary: string, accentHex: string) => {
      const sc = document.createElement('canvas');
      sc.width = 1024;
      sc.height = 128;
      const sctx = sc.getContext('2d')!;
      const grad = sctx.createLinearGradient(0, 0, 1024, 0);
      grad.addColorStop(0, '#070b18');
      grad.addColorStop(0.5, '#121833');
      grad.addColorStop(1, '#070b18');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 1024, 128);

      sctx.fillStyle = accentHex;
      sctx.fillRect(0, 0, 1024, 6);
      sctx.fillRect(0, 122, 1024, 6);

      // Stylized North Shore Twin Peak Emblem
      for (const cx of [110, 914]) {
        sctx.fillStyle = accentHex;
        sctx.beginPath();
        sctx.moveTo(cx - 42, 92);
        sctx.lineTo(cx - 12, 34);
        sctx.lineTo(cx + 8, 68);
        sctx.lineTo(cx + 22, 42);
        sctx.lineTo(cx + 46, 92);
        sctx.closePath();
        sctx.fill();
      }

      sctx.fillStyle = '#ffffff';
      sctx.font = 'bold 46px sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(primary, 512, 50);

      sctx.fillStyle = accentHex;
      sctx.font = 'bold 22px monospace';
      sctx.fillText(secondary, 512, 96);

      const tex = new THREE.CanvasTexture(sc);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.sponsorTextures.push(tex);
      return tex;
    };

    const aimVanTexA = buildSponsorLedTex('AIM VANCOUVER', 'COAL HARBOUR ARENA · B.C. VOLLEYBALL', '#00f0ff');
    const aimVanTexB = buildSponsorLedTex('AIM VANCOUVER • BCCC', 'PACIFIC NORTHWEST PRO SERIES · VANCOUVER', '#ff3d7f');

    const padMat = new THREE.MeshStandardMaterial({ color: 0x090612, roughness: 0.45, metalness: 0.25 });
    this.trimTealMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.trimCoralMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    const ledFaceMatA = new THREE.MeshBasicMaterial({ map: aimVanTexA });
    const ledFaceMatB = new THREE.MeshBasicMaterial({ map: aimVanTexB });
    const perimX = 7.6;
    const perimZ = 12.6;
    const buildBarrier = (
      w: number,
      d: number,
      x: number,
      z: number,
      useCoral: boolean,
      innerFaceDir: 'X+' | 'X-' | 'Z+' | 'Z-'
    ) => {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.72, d), padMat);
      box.position.y = 0.36;
      grp.add(box);
      const topStrip = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.055, d + 0.01),
        useCoral ? this.trimCoralMat : this.trimTealMat
      );
      topStrip.position.y = 0.73;
      grp.add(topStrip);

      // Crisp illuminated inner LED sponsor fascia facing the court
      const panelLen = Math.max(w, d) - 0.6;
      const ledPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(panelLen, 0.62),
        useCoral ? ledFaceMatB : ledFaceMatA
      );
      if (innerFaceDir === 'X+') {
        ledPlane.rotation.y = Math.PI / 2;
        ledPlane.position.set(w * 0.5 + 0.012, 0.36, 0);
      } else if (innerFaceDir === 'X-') {
        ledPlane.rotation.y = -Math.PI / 2;
        ledPlane.position.set(-w * 0.5 - 0.012, 0.36, 0);
      } else if (innerFaceDir === 'Z+') {
        ledPlane.position.set(0, 0.36, d * 0.5 + 0.012);
      } else {
        ledPlane.rotation.y = Math.PI;
        ledPlane.position.set(0, 0.36, -d * 0.5 - 0.012);
      }
      grp.add(ledPlane);

      grp.position.set(x, 0, z);
      this.scene.add(grp);
    };
    buildBarrier(0.24, perimZ * 2, -perimX, 0, false, 'X+');
    buildBarrier(0.24, perimZ * 2, perimX, 0, true, 'X-');
    buildBarrier(perimX * 2, 0.24, 0, -perimZ, false, 'Z+');
    buildBarrier(perimX * 2, 0.24, 0, perimZ, true, 'Z-');

    // Architectural 4-Sided Stadium Tiers + Crowd + VIP Hospitality Skyboxes & Service Suites
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78 });
    const tierPositions = [
      { x: -14.4, z: 0, w: 6.4, d: 34 },
      { x: 14.4, z: 0, w: 6.4, d: 34 },
      { x: 0, z: -18.6, w: 28, d: 6.4 },
      { x: 0, z: 18.6, w: 28, d: 6.4 },
    ];
    tierPositions.forEach((tp) => {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(tp.w, 1.1, tp.d), tierMat);
        const inset = s * 1.4;
        step.position.set(
          tp.x === 0 ? 0 : tp.x + Math.sign(tp.x) * inset,
          0.55 + s * 1.15,
          tp.z === 0 ? 0 : tp.z + Math.sign(tp.z) * inset
        );
        this.stadiumGroup.add(step);
      }
    });

    // Upper Concourse Parapet Backing Walls behind East, West & North bleachers so distant traffic never clips behind stands
    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.72, metalness: 0.25 });
    const parapetConfigs = [
      { w: 0.9, h: 1.5, d: 35.6, x: -21.2, y: 4.85, z: 0 },
      { w: 0.9, h: 1.5, d: 35.6, x: 21.2, y: 4.85, z: 0 },
      { w: 29.5, h: 1.5, d: 0.9, x: 0, y: 4.85, z: -25.4 },
    ];
    for (const pc of parapetConfigs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(pc.w, pc.h, pc.d), parapetMat);
      wall.position.set(pc.x, pc.y, pc.z);
      this.stadiumGroup.add(wall);
    }

    this.crowdSystem = new CrowdSystem(this.stadiumGroup);
    this.vipSuites = new VIPSuitesSystem(this.stadiumGroup, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.stadiumGroup);

    // Huge Architectural PS6 Arena Billboard: AIM VANCOUVER + Live 32-Band Music EQ (z = -22.5, y = 10.6)
    this.jumbotronCanvas = document.createElement('canvas');
    this.jumbotronCanvas.width = 1024;
    this.jumbotronCanvas.height = 384;
    this.jumbotronCtx = this.jumbotronCanvas.getContext('2d')!;
    this.jumbotronTex = new THREE.CanvasTexture(this.jumbotronCanvas);
    this.jumbotronTex.colorSpace = THREE.SRGBColorSpace;
    this.jumbotronTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const billboardGroup = new THREE.Group();
    billboardGroup.position.copy(this.introBillboardPos);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.72, roughness: 0.28 });
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(16.4, 6.45, 0.55), frameMat);
    bezel.position.set(0, 0, -0.32);
    billboardGroup.add(bezel);

    this.billboardTopNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const topNeonBar = new THREE.Mesh(
      new THREE.BoxGeometry(16.6, 0.22, 0.65),
      this.billboardTopNeonMat
    );
    topNeonBar.position.set(0, 3.28, -0.15);
    billboardGroup.add(topNeonBar);

    this.billboardBotNeonMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    const botNeonBar = new THREE.Mesh(
      new THREE.BoxGeometry(16.6, 0.2, 0.65),
      this.billboardBotNeonMat
    );
    botNeonBar.position.set(0, -3.28, -0.15);
    billboardGroup.add(botNeonBar);

    const jBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(15.6, 5.85),
      new THREE.MeshBasicMaterial({ map: this.jumbotronTex })
    );
    billboardGroup.add(jBoard);

    // Twin Steel Support Pylons + Flanking Subwoofer EQ Speaker Columns
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 11.2, 0.65), pylonMat);
      pylon.position.set(side * 6.8, -5.6, -0.55);
      billboardGroup.add(pylon);

      const spkTower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.8, 0.8), frameMat);
      spkTower.position.set(side * 9.0, 0, -0.18);
      billboardGroup.add(spkTower);

      for (const wy of [-1.75, 0, 1.75]) {
        const cone = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.48, 24),
          new THREE.MeshBasicMaterial({
            color: side < 0 ? 0x00f0ff : 0xff3d7f,
            side: THREE.DoubleSide,
          })
        );
        cone.position.set(side * 9.0, wy, 0.24);
        billboardGroup.add(cone);
        this.introBillboardSpeakerRings.push(cone);
      }
    }

    this.scene.add(billboardGroup);

    // Low-Profile Corner LED Beacons flush with perimeter rail height (keeps overhead broadcast sightlines clean)
    const pylonCorners = [
      [-8.3, -13.2, 0x00f0ff],
      [8.3, -13.2, 0xff6b1a],
      [-8.3, 13.2, 0xff6b1a],
      [8.3, 13.2, 0xff3d7f],
    ] as const;
    for (const [px, pz, colHex] of pylonCorners) {
      const basePylon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, 0.42), pylonMat);
      basePylon.position.set(px, 0.41, pz);
      this.stadiumGroup.add(basePylon);

      const glowBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.72, 0.24),
        new THREE.MeshBasicMaterial({ color: colHex })
      );
      glowBar.position.set(px - Math.sign(px) * 0.14, 0.44, pz - Math.sign(pz) * 0.14);
      this.stadiumGroup.add(glowBar);
      this.reactiveLightPillars.push(glowBar);
    }

    // Real 3D Vancouver Skyline, Coal Harbour & North Shore Mountains backdrop
    this.vancouverSkyline = new VancouverSkyline(
      this.scene,
      this.renderer.capabilities.getMaxAnisotropy()
    );

    // Expanded Outer City: Multi-Street Grid, Stadium Parking Lots, Traffic, Pedestrians, SkyTrain & Landmarks
    this.vancouverCity = new VancouverCityDistrict(
      this.scene,
      this.renderer.capabilities.getMaxAnisotropy()
    );

    // Burrard Inlet Ocean Horizon Plane
    this.oceanMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({ color: 0x061d34, roughness: 0.22, metalness: 0.45 })
    );
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.y = -0.35;
    this.scene.add(this.oceanMesh);

    // Coastal Beach Trees (visible in BEACH mode)
    for (const [px, pz] of [[-12.5, -16], [12.5, -16], [-12.5, 16], [12.5, 16]]) {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.26, 7.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x4b2e2b, roughness: 0.85 })
      );
      trunk.position.y = 3.6;
      grp.add(trunk);
      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(
          new THREE.ConeGeometry(0.88, 2.8, 5),
          new THREE.MeshStandardMaterial({ color: 0x0f766e, emissive: 0x042f2e, roughness: 0.68 })
        );
        frond.position.set(0, 7.1, 0);
        frond.rotation.z = 1.08;
        frond.rotation.y = (f / 6) * Math.PI * 2;
        grp.add(frond);
      }
      grp.position.set(px, 0, pz);
      this.palmTreesGroup.add(grp);
    }
    this.palmTreesGroup.visible = false;
    this.scene.add(this.palmTreesGroup);
  }

  private buildNetAndClearSideline() {
    // Pro Tournament Net Assembly: Steel Stanchions + Padded Sleeves + Winches + Floor Plates
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.72, roughness: 0.26 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.5 });

    for (const side of [-1, 1]) {
      const postX = side * (this.COURT_WIDTH / 2 + 0.68);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 2.7, 14), steelMat);
      post.position.set(postX, 1.35, 0);
      post.castShadow = !this.isSoftwareGl;
      this.scene.add(post);

      // Protective Team-Colored Foam Pad around lower 2.0m of post
      const padMat = new THREE.MeshStandardMaterial({
        color: side < 0 ? 0x0891b2 : 0xe11d48,
        roughness: 0.45,
        metalness: 0.1,
      });
      const postPad = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 2.05, 14), padMat);
      postPad.position.set(postX, 1.04, 0);
      postPad.castShadow = !this.isSoftwareGl;
      this.scene.add(postPad);

      // Base anchor collar & tension winch crank
      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), baseMat);
      basePlate.position.set(postX, 0.02, 0);
      this.scene.add(basePlate);

      const winch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), steelMat);
      winch.position.set(postX + side * 0.08, 1.25, 0);
      this.scene.add(winch);
    }

    // High-Resolution Braided Square Mesh Texture
    const netCanvas = document.createElement('canvas');
    netCanvas.width = 128;
    netCanvas.height = 128;
    const nCtx = netCanvas.getContext('2d')!;
    nCtx.clearRect(0, 0, 128, 128);
    nCtx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
    nCtx.lineWidth = 10;
    nCtx.strokeRect(5, 5, 118, 118);
    nCtx.strokeStyle = 'rgba(226, 232, 240, 0.68)';
    nCtx.lineWidth = 5;
    nCtx.strokeRect(5, 5, 118, 118);
    const netTex = new THREE.CanvasTexture(netCanvas);
    netTex.colorSpace = THREE.SRGBColorSpace;
    netTex.wrapS = THREE.RepeatWrapping;
    netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(92, 10);
    netTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const netDepth = 1.0;
    const netGeo = new THREE.PlaneGeometry(this.COURT_WIDTH + 0.96, netDepth, 40, 8);
    this.netMesh = new THREE.Mesh(
      netGeo,
      new THREE.MeshStandardMaterial({
        map: netTex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.netMesh.position.set(0, this.NET_HEIGHT - netDepth / 2, 0);
    this.scene.add(this.netMesh);
    this.netOrigPos = new Float32Array(this.netMesh.geometry.attributes.position.array);

    // Sculpted 3D Top & Bottom Canvas Headbands + Tension Cables
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.34, metalness: 0.05 });
    const topTape = new THREE.Mesh(new THREE.BoxGeometry(this.COURT_WIDTH + 0.98, 0.075, 0.024), tapeMat);
    topTape.position.set(0, this.NET_HEIGHT, 0);
    topTape.castShadow = !this.isSoftwareGl;
    this.scene.add(topTape);

    // Subtle Center Net Tape Badge Accent
    const badgeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const centerBadge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.062, 0.028), badgeMat);
    centerBadge.position.set(0, this.NET_HEIGHT, 0);
    this.scene.add(centerBadge);

    const bottomTape = new THREE.Mesh(new THREE.BoxGeometry(this.COURT_WIDTH + 0.98, 0.048, 0.02), tapeMat);
    bottomTape.position.set(0, this.NET_HEIGHT - netDepth, 0);
    this.scene.add(bottomTape);

    // Steel Tension Guy-Wires extending from net corners to stanchion collars
    for (const yCable of [this.NET_HEIGHT, this.NET_HEIGHT - netDepth]) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, this.COURT_WIDTH + 1.36, 8),
        steelMat
      );
      cable.rotation.z = Math.PI / 2;
      cable.position.set(0, yCable, 0);
      this.scene.add(cable);
    }

    // White Side Boundary Bands directly above sidelines (x = ±4.5m) + Fiberglass Antennas
    const antCanvas = document.createElement('canvas');
    antCanvas.width = 16;
    antCanvas.height = 64;
    const aCtx = antCanvas.getContext('2d')!;
    aCtx.fillStyle = '#ffffff';
    aCtx.fillRect(0, 0, 16, 64);
    aCtx.fillStyle = '#ef4444';
    for (let i = 0; i < 64; i += 16) aCtx.fillRect(0, i, 16, 8);
    const antTex = new THREE.CanvasTexture(antCanvas);
    antTex.colorSpace = THREE.SRGBColorSpace;
    antTex.wrapT = THREE.RepeatWrapping;
    antTex.repeat.set(1, 3);
    const antMat = new THREE.MeshStandardMaterial({ map: antTex, roughness: 0.4 });

    for (const side of [-1, 1]) {
      const sideX = side * (this.COURT_WIDTH / 2);
      const sideBand = new THREE.Mesh(new THREE.BoxGeometry(0.052, netDepth, 0.026), tapeMat);
      sideBand.position.set(sideX, this.NET_HEIGHT - netDepth / 2, 0);
      this.scene.add(sideBand);

      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 8), antMat);
      ant.position.set(sideX, this.NET_HEIGHT + 0.4, 0);
      this.scene.add(ant);
    }

    // Off-Court Working Personnel (1st/2nd Referees, 4 Line Judges, 2 Camera Ops, 4 Ball/Mop Crew, 4 Cheerleaders)
    this.stadiumPersonnel = new StadiumPersonnelSystem(this.scene);
  }

  private buildBallAndIndicators() {
    // Authentic Olympic 3-Color Swirl Volleyball Texture
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#003893';
    ctx.fillRect(0, 0, 512, 78);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 178, 512, 78);
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 48, 256);
      ctx.stroke();
    }
    const ballTex = new THREE.CanvasTexture(c);
    ballTex.colorSpace = THREE.SRGBColorSpace;
    ballTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.ball = new THREE.Group();
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.BALL_RADIUS, 28, 28),
      new THREE.MeshStandardMaterial({
        map: ballTex,
        roughness: 0.34,
        metalness: 0.08,
      })
    );
    ballMesh.castShadow = !this.isSoftwareGl;
    this.ball.add(ballMesh);
    this.scene.add(this.ball);

    // High-Velocity Spike Motion Wake Buffer managed by BallisticRaycasterBridge

    // Grounded Drop Shadow Disk directly beneath the ball (renderOrder 4 cleanly above floor & lines)
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.034;
    this.ballShadow.renderOrder = 4;
    this.scene.add(this.ballShadow);

    // Ball Floor Landing Target Ring
    this.landingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.38, 32),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.landingRing.rotation.x = -Math.PI / 2;
    this.landingRing.position.y = 0.036;
    this.landingRing.renderOrder = 4;
    this.landingRing.visible = false;
    this.scene.add(this.landingRing);

    // Dynamic Shrinking Timing Ring around Landing Zone during active Player action window
    this.timingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.64, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.timingRing.rotation.x = -Math.PI / 2;
    this.timingRing.position.y = 0.04;
    this.timingRing.renderOrder = 4;
    this.timingRing.visible = false;
    this.scene.add(this.timingRing);

    // Player Target Aim Marker (visible on opponent court when aiming serve/spike)
    this.aimMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.34, 24),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.aimMarker.position.set(this.playerAimXZ.x, 0.038, this.playerAimXZ.y);
    this.aimMarker.renderOrder = 4;
    this.scene.add(this.aimMarker);
  }

  /**
   * Builds a high-craft GTA6 Vice Coast Hierarchical Articulated Athlete Rig:
   * - Seamless neck/waist/shoulder/hip overlap (ZERO floating heads or disconnected limbs)
   * - Athletic V-taper jersey, V-neck collar, breathable side stripe, Vice wristband & headband
   * - Grounded floor Vector Chevron indicating directional flow inside the 12x24 spatial matrix
   */
  private buildPlayerMesh(
    team: 'A' | 'B',
    name: string,
    num: number,
    isLibero: boolean,
    profile: PlayerProfileMeta
  ): PlayerParts {
    const group = new THREE.Group();
    const isMainHero = team === 'A' && num === 14 && !isLibero;
    const teamColor = isMainHero ? 0xff6b1a : team === 'A' ? 0x00f0ff : 0xff3d7f;
    const secondaryColor = isMainHero ? 0x0d0f14 : team === 'A' ? 0x090612 : 0x1e0814;
    const accentColor = isLibero ? 0xffb347 : teamColor;

    // Vice Coast / Hero Orange & Black AIM Vest Canvas Texture with Crisp Front & Back Numbering
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    if (isMainHero) {
      // Carbon-Black Tactical Athletic Vest + Blaze-Orange Straps, Side Panels & Chest/Back AIM Branding
      const vestGrad = ctx.createLinearGradient(0, 0, 0, 256);
      vestGrad.addColorStop(0, '#14171f');
      vestGrad.addColorStop(0.55, '#0b0d12');
      vestGrad.addColorStop(1, '#1a120b');
      ctx.fillStyle = vestGrad;
      ctx.fillRect(0, 0, 256, 256);

      // Blaze-orange shoulder harness & vest side trim
      ctx.fillStyle = '#ff6b1a';
      ctx.fillRect(0, 0, 256, 26);
      ctx.fillRect(0, 224, 256, 32);
      ctx.fillRect(46, 26, 20, 198);
      ctx.fillRect(190, 26, 20, 198);

      // Orange vest chevron piping
      ctx.fillStyle = '#ff8533';
      ctx.fillRect(66, 98, 124, 8);

      // Back Panel (x = 128 -> -Z facing main camera behind Team A)
      ctx.fillStyle = '#ff6b1a';
      ctx.fillRect(88, 38, 80, 32);
      ctx.fillStyle = '#0b0d12';
      ctx.textAlign = 'center';
      ctx.font = '900 24px sans-serif';
      ctx.fillText('AIM', 128, 63);
      ctx.fillStyle = '#ff6b1a';
      ctx.font = 'bold 92px sans-serif';
      ctx.fillText(String(num), 128, 192);

      // Front Chest Panel (wrapping seamlessly across seam x = 0 / x = 256 -> +Z)
      for (const fx of [0, 256]) {
        ctx.fillStyle = '#ff6b1a';
        ctx.fillRect(fx - 40, 38, 80, 32);
        ctx.fillStyle = '#0b0d12';
        ctx.font = '900 24px sans-serif';
        ctx.fillText('AIM', fx, 63);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 84px sans-serif';
        ctx.fillText(String(num), fx, 188);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      if (isLibero) {
        grad.addColorStop(0, '#ffb347');
        grad.addColorStop(1, '#f97316');
      } else if (team === 'A') {
        grad.addColorStop(0, '#00c8e8');
        grad.addColorStop(1, '#0369a1');
      } else {
        grad.addColorStop(0, '#ff3d7f');
        grad.addColorStop(1, '#be123c');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      // Side & shoulder trim stripes
      ctx.fillStyle = '#090612';
      ctx.fillRect(0, 0, 256, 24);
      ctx.fillRect(0, 230, 256, 26);
      ctx.fillStyle = team === 'A' ? '#ffb347' : '#00f0ff';
      ctx.fillRect(0, 24, 18, 206);
      ctx.fillRect(238, 24, 18, 206);

      ctx.fillStyle = isLibero ? '#090612' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(name.slice(0, 9), 128, 70);
      ctx.font = 'bold 104px sans-serif';
      ctx.fillText(String(num), 128, 176);
    }

    const jerseyTex = new THREE.CanvasTexture(c);
    jerseyTex.colorSpace = THREE.SRGBColorSpace;
    jerseyTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const skinMat = new THREE.MeshStandardMaterial({
      color: profile.skinToneHex,
      roughness: 0.48,
      metalness: 0.04,
    });
    const jerseyMat = this.characterShaderRig.enhanceJerseyMaterial(
      new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.48, metalness: 0.12 }),
      num + (team === 'A' ? 0 : 100),
      accentColor
    );
    const shortsMat = new THREE.MeshStandardMaterial({
      color: secondaryColor,
      roughness: 0.62,
      metalness: 0.14,
    });
    const trimAccentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: isMainHero ? 0.36 : 0.22,
      roughness: 0.35,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: num % 3 === 0 ? 0x161214 : num % 3 === 1 ? 0x3b2314 : 0x261d1c,
      roughness: 0.82,
    });

    // 1. Hips Root Pivot (y = 0.88 above floor)
    const hips = new THREE.Group();
    hips.position.y = 0.88;
    group.add(hips);

    const shortsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.175, 0.25, 16), shortsMat);
    shortsMesh.position.y = 0.03;
    shortsMesh.castShadow = !this.isSoftwareGl;
    hips.add(shortsMesh);

    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.045, 16), trimAccentMat);
    waistband.position.y = 0.135;
    hips.add(waistband);

    // 2. Torso Hierarchy (pivots cleanly at waist y = +0.10 above hips)
    const torso = new THREE.Group();
    torso.position.y = 0.10;
    hips.add(torso);

    // Sculpted V-taper athletic chest overlapping waistband seamlessly
    const chestMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.152, 0.46, 18), jerseyMat);
    chestMesh.position.y = 0.25;
    chestMesh.castShadow = !this.isSoftwareGl;
    torso.add(chestMesh);

    const shoulderYoke = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.145, 0.18, 8, 14),
      jerseyMat
    );
    shoulderYoke.rotation.z = Math.PI / 2;
    shoulderYoke.position.y = 0.45;
    torso.add(shoulderYoke);

    const collarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.018, 8, 18),
      trimAccentMat
    );
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = 0.51;
    torso.add(collarRing);

    // Muscular neck solidly anchored deep inside shoulder yoke & skull base
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.16, 12), skinMat);
    neckMesh.position.y = 0.55;
    torso.add(neckMesh);

    // 3. Head Group (parented cleanly to torso at y = +0.635, no air gap!)
    const head = new THREE.Group();
    head.position.y = 0.635;
    torso.add(head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.122, 20, 20), skinMat);
    headMesh.scale.set(0.95, 1.07, 0.98);
    headMesh.castShadow = !this.isSoftwareGl;
    head.add(headMesh);

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairMesh.scale.set(0.96, 1.05, 1.02);
    hairMesh.position.y = 0.02;
    hairMesh.rotation.x = -0.2;
    head.add(hairMesh);

    // Distinct Player Hair Style Silhouettes (suppressed above crown when wearing BASEBALL_CAP)
    if (profile.accessory !== 'BASEBALL_CAP') {
      if (profile.hairStyle === 'SPIKY') {
        for (let s = -1; s <= 1; s++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 6), hairMat);
          spike.position.set(s * 0.038, 0.145, 0.015);
          spike.rotation.x = 0.25;
          head.add(spike);
        }
      } else if (profile.hairStyle === 'BUN') {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 10), hairMat);
        bun.position.set(0, 0.11, -0.095);
        head.add(bun);
      } else if (profile.hairStyle === 'SWEPT') {
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.15), hairMat);
        crest.position.set(0, 0.11, 0.02);
        crest.rotation.x = -0.18;
        head.add(crest);
      }
    }

    // Player Accessories (Orange & Black Baseball Cap / Headband / Cyber Visor / Arm Sleeve / Captain Band)
    if (profile.accessory === 'BASEBALL_CAP') {
      const capOrangeMat = new THREE.MeshStandardMaterial({
        color: 0xff6b1a,
        roughness: 0.42,
        metalness: 0.08,
      });
      const capBlackMat = new THREE.MeshStandardMaterial({
        color: 0x0b0d12,
        roughness: 0.5,
        metalness: 0.16,
      });
      // Orange dome crown
      const capCrown = new THREE.Mesh(
        new THREE.SphereGeometry(0.132, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capOrangeMat
      );
      capCrown.scale.set(0.98, 1.04, 1.02);
      capCrown.position.y = 0.036;
      capCrown.rotation.x = -0.12;
      head.add(capCrown);

      // Black base headband trim + top button
      const capBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.133, 0.133, 0.024, 18, 1, true),
        capBlackMat
      );
      capBand.position.y = 0.042;
      capBand.rotation.x = -0.12;
      head.add(capBand);

      const capButton = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), capBlackMat);
      capButton.position.set(0, 0.172, -0.012);
      head.add(capButton);

      // Front black patch with glowing orange AIM emblem bar
      const emblemBg = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.044, 0.018), capBlackMat);
      emblemBg.position.set(0, 0.072, 0.124);
      emblemBg.rotation.x = -0.18;
      head.add(emblemBg);

      const emblemStripe = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.014, 0.02), capOrangeMat);
      emblemStripe.position.set(0, 0.072, 0.127);
      emblemStripe.rotation.x = -0.18;
      head.add(emblemStripe);

      // Curved carbon-black forward visor brim along +Z
      const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.172, 0.014, 0.115), capBlackMat);
      capVisor.position.set(0, 0.036, 0.155);
      capVisor.rotation.x = 0.14;
      head.add(capVisor);
    } else if (profile.accessory === 'HEADBAND') {
      const headband = new THREE.Mesh(
        new THREE.CylinderGeometry(0.126, 0.126, 0.032, 18, 1, true),
        trimAccentMat
      );
      headband.position.y = 0.042;
      headband.rotation.x = -0.14;
      head.add(headband);
    } else if (profile.accessory === 'VISOR') {
      const visorMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.75,
        roughness: 0.15,
        metalness: 0.7,
      });
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.036, 0.065), visorMat);
      visor.position.set(0, 0.014, 0.105);
      head.add(visor);
    }

    // Facial features facing local +Z
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x090612 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), eyeMat);
      eye.position.set(s * 0.04, 0.012, 0.112);
      head.add(eye);
    }

    // 4. Arms Parented Tightly to Torso Shoulders (x = ±0.215, y = +0.445)
    const buildArm = (isRight: boolean) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(isRight ? -0.215 : 0.215, 0.445, 0);
      torso.add(shoulder);

      const armUpper = new THREE.Group();
      shoulder.add(armUpper);

      const upperGeo = new THREE.CapsuleGeometry(0.046, 0.21, 8, 12);
      upperGeo.translate(0, -0.11, 0);
      const upperMesh = new THREE.Mesh(upperGeo, skinMat);
      upperMesh.castShadow = !this.isSoftwareGl;
      armUpper.add(upperMesh);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(isMainHero ? 0.056 : 0.068, 12, 12),
        isMainHero
          ? skinMat
          : new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.48, metalness: 0.12 })
      );
      armUpper.add(cap);

      if (!isRight && profile.accessory === 'CAPTAIN_BAND') {
        const capBand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.052, 0.052, 0.045, 12),
          new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.45 })
        );
        capBand.position.y = -0.11;
        armUpper.add(capBand);
      }

      const armLower = new THREE.Group();
      armLower.position.set(0, -0.23, 0);
      armUpper.add(armLower);

      const lowerGeo = new THREE.CapsuleGeometry(0.041, 0.21, 8, 12);
      lowerGeo.translate(0, -0.105, 0);
      const lowerMesh = new THREE.Mesh(lowerGeo, skinMat);
      lowerMesh.castShadow = !this.isSoftwareGl;
      armLower.add(lowerMesh);

      if (isRight || profile.accessory === 'ARM_SLEEVE') {
        const sleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.042, 0.18, 12),
          shortsMat
        );
        sleeve.position.y = -0.105;
        armLower.add(sleeve);

        const wristband = new THREE.Mesh(
          new THREE.CylinderGeometry(0.046, 0.046, 0.04, 12),
          trimAccentMat
        );
        wristband.position.y = -0.195;
        armLower.add(wristband);
      }

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.078, 0.032), skinMat);
      hand.position.set(0, -0.235, 0.008);
      armLower.add(hand);

      return { shoulder, armUpper, armLower, hand };
    };

    const leftArm = buildArm(false);
    const rightArm = buildArm(true);

    // 5. Legs Parented to Hips (y = 0 -> shoe bottom touches y = 0 cleanly)
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0x090612, roughness: 0.75 });
    const kneepadMat = new THREE.MeshStandardMaterial({ color: 0x090612, roughness: 0.65 });

    const buildLeg = (side: -1 | 1) => {
      const legUpper = new THREE.Group();
      legUpper.position.set(side * 0.102, -0.02, 0);
      hips.add(legUpper);

      const thighGeo = new THREE.CapsuleGeometry(0.068, 0.27, 8, 12);
      thighGeo.translate(0, -0.16, 0);
      const thigh = new THREE.Mesh(thighGeo, skinMat);
      thigh.castShadow = !this.isSoftwareGl;
      legUpper.add(thigh);

      const shortHem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.11, 12), shortsMat);
      shortHem.position.y = -0.06;
      legUpper.add(shortHem);

      const legLower = new THREE.Group();
      legLower.position.set(0, -0.38, 0);
      legUpper.add(legLower);

      const shinGeo = new THREE.CapsuleGeometry(0.054, 0.27, 8, 12);
      shinGeo.translate(0, -0.165, 0);
      const shin = new THREE.Mesh(shinGeo, skinMat);
      shin.castShadow = !this.isSoftwareGl;
      legLower.add(shin);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.063, 0.115, 12), kneepadMat);
      pad.position.set(0, -0.015, 0.012);
      legLower.add(pad);

      const shoes = new THREE.Group();
      shoes.position.set(0, -0.39, 0.036);
      legLower.add(shoes);

      const upperShoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.078, 0.23), shoeMat);
      shoes.add(upperShoe);
      const heelAccent = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.042, 0.07), trimAccentMat);
      heelAccent.position.set(0, 0.008, -0.082);
      shoes.add(heelAccent);
      const gum = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.024, 0.238), soleMat);
      gum.position.y = -0.042;
      shoes.add(gum);

      return { legUpper, legLower, shoes };
    };

    const leftLeg = buildLeg(1);
    const rightLeg = buildLeg(-1);

    // Apply individual athletic height scale cleanly from ground pivot
    group.scale.setScalar(profile.heightScale || 1.0);

    // Subtle ground aura halo for active player highlight
    const auraMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 24),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.03;
    auraMesh.renderOrder = 3;
    group.add(auraMesh);

    // Grounded Floor Spatial Vector Chevron (shows live propagated motion heading in world space)
    const arrowGeo = new THREE.ConeGeometry(0.13, 0.34, 3);
    arrowGeo.rotateX(Math.PI / 2);
    const vectorArrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    vectorArrow.scale.set(1.0, 0.08, 1.0);
    vectorArrow.position.set(0, 0.032, 0.48);
    vectorArrow.renderOrder = 3;
    group.add(vectorArrow);

    return {
      group,
      hips,
      torso,
      head,
      shoulderL: leftArm.shoulder,
      shoulderR: rightArm.shoulder,
      armUpperL: leftArm.armUpper,
      armLowerL: leftArm.armLower,
      handL: leftArm.hand,
      armUpperR: rightArm.armUpper,
      armLowerR: rightArm.armLower,
      handR: rightArm.hand,
      legUpperL: leftLeg.legUpper,
      legLowerL: leftLeg.legLower,
      shoesL: leftLeg.shoes,
      legUpperR: rightLeg.legUpper,
      legLowerR: rightLeg.legLower,
      shoesR: rightLeg.shoes,
      auraMesh,
      vectorArrow,
      skinMat,
    };
  }

  private initTeams() {
    const overrides = loadRosterOverrides();
    const createTeam = (team: 'A' | 'B', roster: typeof ROSTER_A) => {
      // Initial FIVB zone assignment: indices 0..5 -> Zones 4, 3, 2, 5, 6, 1
      const initZones = [4, 3, 2, 5, 6, 1];
      roster.forEach((info, i) => {
        const unitId = this.units.length + 1;
        const ov = overrides[unitId];
        const unitName = ov?.name || info.name;
        const zone = initZones[i];
        const isLibero = info.role === 'Libero';
        const defaultProfile = getDefaultPlayerProfile(unitName, info.role, info.num, team);
        const profile: PlayerProfileMeta = { ...defaultProfile, ...ov?.profile };
        if (team === 'A' && info.num === 14 && profile.accessory === 'CAPTAIN_BAND') {
          profile.accessory = 'BASEBALL_CAP';
        }
        const parts = this.buildPlayerMesh(team, unitName, info.num, isLibero, profile);
        const defZone = ZONE_MAP[zone];
        const basePos = this.getZoneBasePos(team, zone);
        parts.group.position.copy(basePos);
        parts.group.rotation.y = team === 'A' ? Math.PI : 0; // +Z faces net (B at -Z faces +Z, A at +Z faces -Z)
        this.scene.add(parts.group);

        const stats: UnitStats = {
          awareness: ov?.stats?.awareness ?? (isLibero ? 1.15 : info.role === 'Setter' ? 1.08 : 0.95),
          power: ov?.stats?.power ?? (info.role === 'Outside' || info.role === 'Opposite' ? 1.35 : 1.05),
          accuracy: ov?.stats?.accuracy ?? (isLibero || info.role === 'Setter' ? 1.15 : 0.95),
          vertical: ov?.stats?.vertical ?? (info.role === 'Middle' || info.role === 'Outside' || info.role === 'Opposite' ? 5.9 : 4.6),
        };

        const skills: UnitSkill[] = [
          {
            id: `${info.role.toUpperCase()}_SKILL`,
            name: isLibero ? 'Miracle Pancake' : info.role === 'Setter' ? 'Deceptive Dump' : info.role === 'Middle' ? 'Roof Block' : 'Power Laser',
            description: 'Role signature volleyball technique',
            cooldownMax: 4.5,
            currentCooldown: 0,
            isActive: true,
          },
        ];

        this.units.push({
          id: unitId,
          name: unitName,
          team,
          role: info.role,
          jerseyNumber: info.num,
          isLibero,
          rotationZone: zone,
          defensiveZone: defZone,
          assignedPlayRole: 'NONE',
          parts,
          mesh: parts.group,
          speed: isLibero ? 7.6 : 6.9,
          actualSpeed: 0,
          targetPos: basePos.clone(),
          homePos: basePos.clone(),
          lastPos: basePos.clone(),
          velocity: new THREE.Vector3(),
          yVel: 0,
          isJumping: false,
          animState: 'READY_STANCE',
          animTimer: 0,
          stepCycle: 0,
          cooldown: 0,
          isServer: false,
          hasBall: false,
          stats,
          skills,
          currentMoveName: 'Ready',
          currentLeanPitch: 0,
          currentLeanRoll: 0,
          currentCrouch: 0,
          digitalSkin: {
            reactionState: 'SENSORY_STANDBY',
            proximityValue: 0,
            interceptReadiness: 90,
            skinEnergy: 0.2,
            pulsePhase: Math.random() * Math.PI * 2,
          },
          tacticalOffset: { x: 0, z: 0 },
          sweatLevel: 0.05,
          stamina: 100,
          profile,
          isDowned: false,
          fallRecoveryTimer: 0,
        });
      });
    };

    createTeam('A', ROSTER_A);
    createTeam('B', ROSTER_B);
    this.movementOrchestrator.registerUnits(this.units);
  }

  private getZoneBasePos(team: 'A' | 'B', zone: number): THREE.Vector3 {
    const zSign = team === 'A' ? 1 : -1;
    // Note: facing team A (+Z -> -Z), Zone 4 is Left (-X), Zone 2 is Right (+X).
    // Mirror X cleanly so each team faces the net properly!
    const xMirror = team === 'A' ? 1 : -1;
    switch (zone) {
      case 1:
        return new THREE.Vector3(2.85 * xMirror, 0, 6.4 * zSign);
      case 2:
        return new THREE.Vector3(2.75 * xMirror, 0, 2.0 * zSign);
      case 3:
        return new THREE.Vector3(0.0, 0, 1.45 * zSign);
      case 4:
        return new THREE.Vector3(-2.75 * xMirror, 0, 2.0 * zSign);
      case 5:
        return new THREE.Vector3(-2.85 * xMirror, 0, 6.4 * zSign);
      case 6:
      default:
        return new THREE.Vector3(0.0, 0, 7.2 * zSign);
    }
  }

  /**
   * Authentic FIVB Clockwise Rotation (1->6->5->4->3->2->1) executed on side-outs
   */
  private rotateTeamClockwise(team: 'A' | 'B') {
    this.units.forEach((u) => {
      if (u.team !== team) return;
      u.rotationZone = u.rotationZone === 1 ? 6 : u.rotationZone - 1;
      u.defensiveZone = ZONE_MAP[u.rotationZone];
    });
    this.log(`Team ${team === 'A' ? 'CYAN' : 'ORANGE'} rotated clockwise (FIVB).`);
  }

  private resetPoint(servingTeam: 'A' | 'B') {
    this.state.servingTeam = servingTeam;
    this.state.matchState = 'SERVE';
    this.state.rallyCount = 0;
    this.sideTouches = 0;
    this.currentSide = servingTeam;
    this.lastContactPlayer = null;
    this.expectedReceiver = null;
    this.expectedSetter = null;
    this.expectedSpiker = null;
    this.playerSteerTarget = null;
    this.playerActionQueued = false;
    this.state.touchesA = 0;
    this.state.touchesB = 0;
    this.state.netViolation = null;
    this.state.lastPassRatingText = '';
    this.state.activeSkillNotification = null;
    this.state.teamFSMStateA = servingTeam === 'A' ? 'SERVE_FORMATION' : 'RECEIVE_FORMATION';
    this.state.teamFSMStateB = servingTeam === 'B' ? 'SERVE_FORMATION' : 'RECEIVE_FORMATION';
    this.reactiveState.isCharging = false;
    this.reactiveState.chargingAction = null;
    this.reactiveState.chargeLevel = 0;
    this.reactiveState.bufferedAction = null;
    this.reactiveChargeTimer = 0;
    this.reactiveBufferTimer = 0;
    this.desiredAttackOverride = null;
    this.rallyChainStage = 'READY';
    this.cancelComicStrikeCamera();

    const zSign = servingTeam === 'A' ? 1 : -1;
    let serverUnit: Unit | null = null;

    this.units.forEach((u) => {
      u.isServer = false;
      u.hasBall = false;
      u.isJumping = false;
      u.yVel = 0;
      u.cooldown = 0;
      u.assignedPlayRole = 'NONE';
      u.animState = 'READY_STANCE';
      u.animTimer = 0;
      u.defeatSlump = false;
      u.reactiveCharge = 0;
      u.isDowned = false;
      u.fallRecoveryTimer = 0;
      const base = this.getZoneBasePos(u.team, u.rotationZone);
      u.homePos.copy(base);
      u.targetPos.copy(base);
      u.mesh.position.copy(base);
      u.velocity.set(0, 0, 0);
      u.mesh.lookAt(base.x, 0, 0);

      if (u.team === servingTeam && u.rotationZone === 1) {
        serverUnit = u;
      }
    });

    if (!serverUnit) {
      serverUnit = this.units.find((u) => u.team === servingTeam)!;
    }

    serverUnit.isServer = true;
    serverUnit.hasBall = true;
    serverUnit.assignedPlayRole = 'SERVER';
    const serveX = servingTeam === 'A' ? 2.6 : -2.6;
    const serveZ = (this.COURT_LENGTH / 2 + 1.15) * zSign;
    serverUnit.targetPos.set(serveX, 0, serveZ);
    serverUnit.mesh.position.set(serveX, 0, serveZ);
    serverUnit.mesh.lookAt(0, 0, 0);

    this.ball.position.set(serveX, 1.32, serveZ - 0.35 * zSign);
    this.ballPosPrev.copy(this.ball.position);
    this.ballVel.set(0, 0, 0);
    this.ballSpin.set(0, 0, 0);
    this.ballPhase = 'HELD_READY';
    this.pendingServeSpec = null;
    this.serveTossTimer = 0;
    this.refereeCallText = 'READY FOR SERVE';
    this.landingRing.visible = false;
    this.timingRing.visible = false;
    this.cancelSpikeActionCam();

    this.state.activePlayerName = serverUnit.name;
    this.state.activePlayerJersey = serverUnit.jerseyNumber;
    this.state.activePrompt = servingTeam === 'A' ? 'SERVE' : 'NONE';
    this.state.promptTiming = 1.0;

    if (servingTeam === 'B') {
      this.autoServeTimer = 0.72;
    } else if (this.state.controlMode === 'AUTO') {
      this.autoServeTimer = 0.62;
    } else {
      this.autoServeTimer = 0;
    }

    this.notifyState();
  }

  // =========================================================================
  // TOUCH / POINTER INTERACTION & CONTINUOUS SCREEN SENSOR TRACKING
  // =========================================================================
  private updateScreenSensorUV(clientX: number, clientY: number): { u: number; v: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const u = THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = THREE.MathUtils.clamp((clientY - rect.top) / rect.height, 0, 1);
    this.rawSensorUV.set(u, v);
    this.sensorActive = true;
    this.organicBlock.lastTouchUV = { x: u, y: v };
    return { u, v };
  }

  private updateCourtRaycast(clientX: number, clientY: number): THREE.Vector3 | null {
    const coords = this.updateScreenSensorUV(clientX, clientY);
    if (!coords) return null;

    this.organicBlock.lastRippleTimeSec = performance.now() * 0.001;
    this.organicBlock.membraneTension = 0.85;

    this._ndc.set(coords.u * 2 - 1, -(coords.v * 2 - 1));
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._v3;
    if (this._raycaster.ray.intersectPlane(this._courtPlane, hit)) {
      this.matrixPipeline.injectCourtImpact(hit.x, hit.z, performance.now() * 0.001);
      return hit.clone();
    }
    return null;
  }

  private handlePointerInteract = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.sensorMicroZoom = Math.min(1, this.sensorMicroZoom + 0.45);
    const hit = this.updateCourtRaycast(e.clientX, e.clientY);
    if (!hit) return;

    if (this.state.controlMode === 'PLAYER') {
      if (hit.z < -0.4) {
        this.playerAimXZ.set(
          THREE.MathUtils.clamp(hit.x, -4.0, 4.0),
          THREE.MathUtils.clamp(hit.z, -8.5, -1.2)
        );
        this.aimMarker.position.set(this.playerAimXZ.x, 0.038, this.playerAimXZ.y);
      } else if (hit.z > 0.4 && this.state.matchState === 'PLAY') {
        this.playerSteerTarget = new THREE.Vector2(
          THREE.MathUtils.clamp(hit.x, -4.2, 4.2),
          THREE.MathUtils.clamp(hit.z, 0.65, 8.6)
        );
      }
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    // Always feed Screen Sensor smoothly even on mouse hover without dragging
    this.updateScreenSensorUV(e.clientX, e.clientY);

    if (e.buttons !== 1 && e.pointerType === 'mouse') return;
    const hit = this.updateCourtRaycast(e.clientX, e.clientY);
    if (!hit || this.state.controlMode !== 'PLAYER') return;
    if (hit.z < -0.4) {
      this.playerAimXZ.set(
        THREE.MathUtils.clamp(hit.x, -4.0, 4.0),
        THREE.MathUtils.clamp(hit.z, -8.5, -1.2)
      );
      this.aimMarker.position.set(this.playerAimXZ.x, 0.038, this.playerAimXZ.y);
    } else if (hit.z > 0.4 && this.state.matchState === 'PLAY') {
      this.playerSteerTarget = new THREE.Vector2(
        THREE.MathUtils.clamp(hit.x, -4.2, 4.2),
        THREE.MathUtils.clamp(hit.z, 0.65, 8.6)
      );
    }
  };

  private handlePointerUp = () => {
    // Gentle inertia settle handled cleanly by sensor damping
  };

  private handlePointerLeave = () => {
    this.sensorActive = false;
  };

  // =========================================================================
  // REACTIVE CONTROL & TIMING ENGINE + INTERACTIVE VOLLEYBALL ACTIONS
  // =========================================================================
  public setKeyboardMoveAxis(x: number, z: number) {
    this.manualMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.manualMoveZ = THREE.MathUtils.clamp(z, -1, 1);
    if (Math.abs(x) > 0.05 || Math.abs(z) > 0.05) {
      this.playerSteerTarget = null;
    }
  }

  public selectControlledUnit(unitId: number) {
    const u = this.units.find((unit) => unit.id === unitId && unit.team === 'A');
    if (!u) return;
    this.manualActiveUnitId = u.id;
    this.manualUnitLocked = true;
    this.state.manualUnitLocked = true;
    this.reactiveState.manualSwitchCount++;
    this.state.activePlayerName = u.name;
    this.state.activePlayerJersey = u.jerseyNumber;
    this.log(`Manual control locked onto #${u.jerseyNumber} ${u.name} (${u.role}).`);
    this.notifyState();
  }

  public clearManualUnitLock() {
    this.manualActiveUnitId = null;
    this.manualUnitLocked = false;
    this.state.manualUnitLocked = false;
    const active = this.getActiveCyanControlUnit();
    if (active) {
      this.state.activePlayerName = active.name;
      this.state.activePlayerJersey = active.jerseyNumber;
    }
    this.log('Auto-Switch restored to smart receiver/setter/spiker flow.');
    this.notifyState();
  }

  public cycleActiveCyanPlayer() {
    const cyanUnits = this.units.filter((u) => u.team === 'A');
    if (cyanUnits.length === 0) return;
    const current = this.getActiveCyanControlUnit();
    const curIdx = current ? cyanUnits.findIndex((u) => u.id === current.id) : 0;
    const next = cyanUnits[(curIdx + 1) % cyanUnits.length];
    this.manualActiveUnitId = next.id;
    this.manualUnitLocked = true;
    this.state.manualUnitLocked = true;
    this.reactiveState.manualSwitchCount++;
    this.state.activePlayerName = next.name;
    this.state.activePlayerJersey = next.jerseyNumber;
    this.log(`Switched manual focus to #${next.jerseyNumber} ${next.name} (${next.role}).`);
    this.notifyState();
  }

  public beginReactiveAction(action: PlayerMoveAction | 'SERVE') {
    if (this.state.screenMode !== 'PLAYING' || this.state.controlMode !== 'PLAYER') return;
    if (this.reactiveState.isCharging && this.reactiveState.chargingAction === action) return;

    this.reactiveState.isCharging = true;
    this.reactiveState.chargingAction = action;
    this.reactiveState.chargeLevel = 0.08;
    this.reactiveChargeTimer = 0;

    if (action === 'LEFT') {
      this.playerAimXZ.set(-3.35, -5.85);
      this.desiredSetType = 'HIGH';
    } else if (action === 'RIGHT') {
      this.playerAimXZ.set(3.35, -5.85);
      this.desiredSetType = 'BACK';
    } else if (action === 'MID' || action === 'QUICK_SET' || action === 'STRIKE_SET') {
      this.playerAimXZ.set(0.0, -5.2);
      this.desiredSetType = action === 'QUICK_SET' ? 'QUICK' : 'HIGH';
    } else if (action === 'FEINT_TIP') {
      this.playerAimXZ.set(0.4, -2.35);
      this.desiredSetType = 'HIGH';
    }
    this.aimMarker.position.set(this.playerAimXZ.x, 0.038, this.playerAimXZ.y);

    // Solve true low-ball dig/dive intercept at hand-floor height (y = 0.28m)
    const lowInt = this.calculateBallIntercept(this.ball.position, this.ballVel, 0.28);
    this._lowDiveIntercept.set(
      THREE.MathUtils.clamp(lowInt.point.x, -4.35, 4.35),
      0.28,
      THREE.MathUtils.clamp(lowInt.point.z, 0.65, 8.75)
    );

    // For DIG / DIVE actions, auto-select the closest Cyan defender only when not manually locked
    let actor = this.getActiveCyanControlUnit();
    if (
      (action === 'DIVE_SAVE' || action === 'PASS_DIG') &&
      !this.manualUnitLocked &&
      this.state.matchState === 'PLAY' &&
      this.currentSide === 'A'
    ) {
      const cyanUnits = this.units.filter((u) => u.team === 'A' && !u.isDowned);
      let bestDefender: Unit | null = actor;
      let bestDist = actor
        ? Math.hypot(
            actor.mesh.position.x - this._lowDiveIntercept.x,
            actor.mesh.position.z - this._lowDiveIntercept.z
          )
        : Infinity;
      for (const cu of cyanUnits) {
        const d = Math.hypot(
          cu.mesh.position.x - this._lowDiveIntercept.x,
          cu.mesh.position.z - this._lowDiveIntercept.z
        );
        if (d < bestDist - 0.35) {
          bestDist = d;
          bestDefender = cu;
        }
      }
      if (bestDefender && bestDefender !== actor) {
        actor = bestDefender;
        this.expectedReceiver = bestDefender;
        this.manualActiveUnitId = bestDefender.id;
        this.state.activePlayerName = bestDefender.name;
        this.state.activePlayerJersey = bestDefender.jerseyNumber;
      }
    }

    // Immediate kinetic anticipation reaction when button goes down
    if (actor) {
      actor.reactiveCharge = 0.15;
      const distXZ = Math.hypot(
        this.ball.position.x - actor.mesh.position.x,
        this.ball.position.z - actor.mesh.position.z
      );

      if (action === 'LONG_JUMP' && this.state.matchState === 'PLAY' && !actor.isDowned) {
        this.reactiveState.lastActionLabel = 'COILING LONG JUMP';
        this.playerActionQueued = true;
      } else if ((action === 'DIVE_SAVE' || action === 'PASS_DIG') && this.state.matchState === 'PLAY' && !actor.isDowned) {
        const useTargetX = this._lowDiveIntercept.x;
        const useTargetZ = this._lowDiveIntercept.z;
        const dx = useTargetX - actor.mesh.position.x;
        const dz = useTargetZ - actor.mesh.position.z;

        // Ground-clamped dive or quick pass lunge facing directly into the ball path
        if (action === 'DIVE_SAVE' || this.ball.position.y < 0.92 || distXZ > 1.75) {
          actor.isJumping = false;
          actor.isLongJump = false;
          actor.yVel = 0;
          actor.mesh.position.y = 0;
          actor.targetPos.set(useTargetX, 0, useTargetZ);
          this.movementOrchestrator.triggerManualDive(actor, dx, dz);
          this.particleSystem.emitDustBurst(actor.mesh.position, 12, 1.1);
          this.reactiveState.lastActionLabel = 'PANCAKE DIVE';
        } else {
          actor.animState = 'PASS_BUMP';
          actor.animTimer = 0;
          actor.targetPos.set(useTargetX, 0, useTargetZ);
          this.reactiveState.lastActionLabel = 'PASS PLATFORM';
        }
        if (Math.hypot(dx, dz) > 0.08) {
          actor.mesh.rotation.y = Math.atan2(dx, dz);
        }
        this.playerActionQueued = true;
      } else if (this.state.matchState === 'PLAY' && distXZ < 3.6 && !actor.isDowned) {
        if (this.state.activePrompt === 'BLOCK' && !actor.isJumping) {
          actor.isJumping = true;
          actor.yVel = actor.stats.vertical * 0.92;
          actor.animState = 'BLOCK_ROOF';
          actor.animTimer = 0;
        } else if (
          (this.state.activePrompt === 'SPIKE' || action === 'JUMP_SPIKE') &&
          !actor.isJumping &&
          this.ball.position.y > 1.65
        ) {
          actor.isJumping = true;
          actor.yVel = actor.stats.vertical * 0.96;
          actor.animState = 'SPIKE_WINDUP';
          actor.animTimer = 0;
        } else if (action === 'STRIKE_SET' && this.sideTouches <= 1) {
          actor.animState = 'SET_HIGH_ARC';
          actor.animTimer = 0;
        }
      }
    }
    this.notifyState();
  }

  public releaseReactiveAction(
    action?: PlayerMoveAction | 'SERVE',
    serveType: ServeVariant = 'JUMP'
  ) {
    if (this.state.screenMode !== 'PLAYING' || this.state.controlMode !== 'PLAYER') return;
    const act = action || this.reactiveState.chargingAction || 'MID';
    const charge = THREE.MathUtils.clamp(this.reactiveState.chargeLevel, 0, 1);

    this.reactiveState.isCharging = false;
    this.reactiveState.chargingAction = null;

    if (this.state.matchState === 'SERVE' && this.state.servingTeam === 'A') {
      const power = Math.round(74 + charge * 26);
      const grade: TimingGrade = charge >= 0.72 && charge <= 0.94 ? 'PERFECT' : charge >= 0.45 ? 'GREAT' : 'EARLY';
      this.reactiveState.lastTimingGrade = grade;
      this.reactiveState.lastTimingMs = Math.round((charge - 0.82) * 280);
      this.reactiveState.lastActionLabel =
        serveType === 'LONG_SERVE'
          ? 'LONG RUNWAY SERVE'
          : grade === 'PERFECT'
          ? 'HYPER SERVE'
          : `${serveType} SERVE`;
      this.reactiveState.adaptiveBoostPct = Math.round(charge * 28);
      if (grade === 'PERFECT') this.reactiveState.comboStreak++;
      this.reactiveGradeClearTimer = 1.45;
      this.triggerServe(power, 0, serveType);
      this.reactiveState.chargeLevel = 0;
      const srvActor = this.getActiveCyanControlUnit();
      if (srvActor) srvActor.reactiveCharge = 0;
      this.notifyState();
      return;
    }

    if (this.state.matchState !== 'PLAY') {
      this.reactiveState.chargeLevel = 0;
      this.notifyState();
      return;
    }

    // Evaluate real-time contact timing relative to ball intercept arrival
    const timing = this.state.promptTiming;
    const signedDeltaMs = Math.round((this.timeToBallContact - 0.22) * 1000);
    let grade: TimingGrade = 'GREAT';
    if (timing >= 0.76) {
      grade = 'PERFECT';
      this.reactiveState.comboStreak++;
      this.reactiveAdaptivePower = 0.24 + charge * 0.14;
    } else if (timing >= 0.5) {
      grade = 'GREAT';
      this.reactiveAdaptivePower = 0.12 + charge * 0.1;
    } else if (this.timeToBallContact > 0.35) {
      grade = 'EARLY';
      this.reactiveAdaptivePower = 0.08 + charge * 0.08;
      this.reactiveState.bufferedAction = act === 'SERVE' ? 'MID' : act;
      this.reactiveBufferTimer = 0.78;
    } else {
      grade = 'LATE';
      this.reactiveState.comboStreak = 0;
      this.reactiveAdaptivePower = 0.02;
    }

    this.reactiveLastTimingGrade = grade;
    this.reactiveState.lastTimingGrade = grade;
    this.reactiveState.lastTimingMs = signedDeltaMs;
    this.reactiveState.adaptiveBoostPct = Math.round(this.reactiveAdaptivePower * 100);
    this.reactiveGradeClearTimer = 1.35;
    this.desiredAttackOverride = act === 'SERVE' ? 'MID' : act;
    this.playerActionQueued = true;

    const actor = this.getActiveCyanControlUnit();
    if (actor && !actor.isDowned) {
      actor.reactiveCharge = 0;
      const distXZ = Math.hypot(
        this.ball.position.x - actor.mesh.position.x,
        this.ball.position.z - actor.mesh.position.z
      );

      if (act === 'LONG_JUMP' && !actor.isJumping) {
        const hasMoveKey = Math.hypot(this.manualMoveX, this.manualMoveZ) > 0.12;
        const dirX = hasMoveKey
          ? this.manualMoveX
          : this.rawLandingSpot.x - actor.mesh.position.x;
        const dirZ = hasMoveKey
          ? this.manualMoveZ
          : this.rawLandingSpot.z - actor.mesh.position.z;
        this.movementOrchestrator.triggerLongJump(actor, dirX, dirZ, Math.max(0.25, charge));
        if (this.state.courtSurface === 'SAND' || this.matchEvolution.sandLevel > 0.16) {
          this.particleSystem.emitSandSpray(actor.mesh.position, -dirX * 1.4, -dirZ * 1.4, 14);
        } else {
          this.particleSystem.emitDustBurst(actor.mesh.position, 14, 1.2);
        }
        this.reactiveState.lastActionLabel =
          grade === 'PERFECT' ? 'HYPER LONG JUMP' : 'LONG JUMP LEAP';
      } else if (this.state.activePrompt === 'BLOCK' && !actor.isJumping) {
        actor.isJumping = true;
        actor.yVel = actor.stats.vertical * (0.9 + charge * 0.08);
        actor.animState = 'BLOCK_ROOF';
        actor.animTimer = 0;
        this.reactiveState.lastActionLabel = grade === 'PERFECT' ? 'IRON ROOF JUMP' : 'BLOCK SEAL';
      } else if (
        (this.state.activePrompt === 'SPIKE' || act === 'JUMP_SPIKE') &&
        !actor.isJumping &&
        distXZ < 3.4
      ) {
        actor.isJumping = true;
        actor.yVel = actor.stats.vertical * (0.94 + charge * 0.1);
        actor.animState = 'SPIKE_WINDUP';
        actor.animTimer = 0;
        this.reactiveState.lastActionLabel =
          act === 'FEINT_TIP' ? 'FEATHER TIP' : grade === 'PERFECT' ? 'PERFECT CHARGE SPIKE' : 'JUMP SPIKE';
      } else if ((this.state.activePrompt === 'DIG' || act === 'DIVE_SAVE' || act === 'PASS_DIG') && distXZ < 3.8) {
        actor.animState = this.ball.position.y < 0.78 || act === 'DIVE_SAVE' ? 'DIVE_PANCAKE' : 'PASS_BUMP';
        actor.animTimer = 0;
        this.reactiveState.lastActionLabel = grade === 'PERFECT' ? '3-PT LASER PASS' : 'PASS DIG';
      } else if (this.state.activePrompt === 'SET' || act === 'STRIKE_SET') {
        actor.animState = act === 'QUICK_SET' ? 'SET_QUICK' : act === 'RIGHT' ? 'SET_BACK' : 'SET_HIGH_ARC';
        actor.animTimer = 0;
        this.reactiveState.lastActionLabel = act === 'QUICK_SET' ? 'FAST 1-TEMPO' : 'STRIKE SET';
      }
    }

    this.reactiveState.chargeLevel = 0;
    this.notifyState();
  }

  public triggerServe(power: number, anglePct: number, type: ServeVariant) {
    if (this.state.matchState !== 'SERVE' || this.state.servingTeam !== 'A') return;
    const server = this.units.find((u) => u.isServer && u.team === 'A');
    if (!server) return;

    const targetX =
      anglePct !== 0
        ? (anglePct / 100) * 4.0
        : THREE.MathUtils.clamp(this.playerAimXZ.x, -4.0, 4.0);
    const targetZ =
      type === 'LONG_SERVE'
        ? THREE.MathUtils.clamp(Math.min(this.playerAimXZ.y, -7.85), -8.85, -7.75)
        : THREE.MathUtils.clamp(this.playerAimXZ.y, -8.4, -2.5);
    this.executeServe(server, power, targetX, targetZ, type);
  }

  public triggerPlayerAction(lane?: 'LEFT' | 'MID' | 'RIGHT') {
    const act: PlayerMoveAction = lane || 'MID';
    this.beginReactiveAction(act);
    this.reactiveState.chargeLevel = 0.65;
    this.releaseReactiveAction(act);
  }

  public setControlMode(mode: ControlMode) {
    this.state.controlMode = mode;
    if (mode === 'AUTO' && this.state.matchState === 'SERVE' && this.state.servingTeam === 'A') {
      this.autoServeTimer = 0.65;
    }
    this.log(`Control Mode switched to ${mode === 'PLAYER' ? 'YOU PLAY (Interactive Touch)' : 'AI COACH (Autonomous)'}.`);
    this.notifyState();
  }

  private getActiveCyanControlUnit(): Unit | null {
    if (this.state.matchState === 'SERVE' && this.state.servingTeam === 'A') {
      return this.units.find((u) => u.isServer) || null;
    }
    if (this.manualActiveUnitId !== null) {
      const manual = this.units.find((u) => u.id === this.manualActiveUnitId && u.team === 'A');
      if (manual) return manual;
    }
    if (this.currentSide === 'A') {
      if (this.sideTouches === 0) return this.expectedReceiver;
      if (this.sideTouches === 1) return this.expectedSetter;
      return this.expectedSpiker;
    }
    const cyanUnits = this.units.filter((u) => u.team === 'A');
    return (
      cyanUnits.find((u) => u.assignedPlayRole === 'BLOCKER') ||
      cyanUnits.find((u) => u.isLibero) ||
      cyanUnits[0] ||
      null
    );
  }

  // =========================================================================
  // BALLISTIC KINEMATICS & SERVE / HIT EXECUTION
  // =========================================================================
  private solveBallisticVelocity(
    start: THREE.Vector3,
    target: THREE.Vector3,
    flightTime: number,
    clearNet: boolean
  ): THREE.Vector3 {
    return this.ballisticBridge.solveBallisticVelocity(start, target, flightTime, clearNet);
  }

  public calculateBallIntercept(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    targetY = 1.05
  ): { point: THREE.Vector3; timeToIntercept: number; isValid: boolean } {
    const res = this.ballisticBridge.calculateBallIntercept(pos, vel, targetY);
    this.lastTrajectoryConfidence = res.confidence;
    return res;
  }

  private executeServe(
    server: Unit,
    power: number,
    targetX: number,
    targetZ: number,
    type: ServeVariant
  ) {
    if (this.pendingServeSpec) return;

    const zSign = server.team === 'A' ? 1 : -1;
    const isLongServe = type === 'LONG_SERVE';

    if (isLongServe) {
      server.mesh.position.z = 11.65 * zSign;
      server.targetPos.set(server.mesh.position.x, 0, 8.85 * zSign);
      server.velocity.set(0, 0, -4.8 * zSign);
      server.isLongJump = true;
    } else {
      server.isLongJump = false;
    }

    server.isServer = false;
    server.hasBall = false;
    server.cooldown = 0.85;
    server.isJumping = type === 'JUMP' || isLongServe;
    if (server.isJumping) {
      server.yVel = server.stats.vertical * (isLongServe ? 0.98 : 0.88);
    }
    server.animState = type === 'JUMP' || isLongServe ? 'SERVE_JUMP' : 'SERVE_FLOAT';
    server.animTimer = 0;

    // Transition into SERVE_TOSS first so the ball visibly arcs up before impact!
    this.state.matchState = 'PLAY';
    this.ballPhase = 'SERVE_TOSS';
    this.serveTossTimer = isLongServe ? 0.44 : type === 'JUMP' ? 0.36 : 0.28;
    this.pendingServeSpec = { server, power, targetX, targetZ, type };
    this.refereeCallText = isLongServe
      ? `${server.team === 'A' ? 'CYAN' : 'ORG'} LONG SERVE RUNWAY!`
      : `${server.team === 'A' ? 'CYAN' : 'ORG'} SERVE TOSS`;

    this.ball.position.set(server.mesh.position.x, 1.48, server.mesh.position.z - 0.34 * zSign);
    this.ballPosPrev.copy(this.ball.position);
    this.ballVel.set(0, isLongServe ? 6.1 : type === 'JUMP' ? 4.8 : 3.2, (isLongServe ? -0.82 : -0.35) * zSign);
    this.ballSpin.set(isLongServe ? -12 : -6, 0, 0);

    if (isLongServe) {
      this.particleSystem.emitDustBurst(server.mesh.position, 14, 1.15);
    }

    this.rallyCountReset(server.team);
    this.notifyState();
  }

  private completeServeStrike() {
    const spec = this.pendingServeSpec;
    if (!spec) return;
    this.pendingServeSpec = null;

    const { server, power, targetX, targetZ, type } = spec;
    const isLongServe = type === 'LONG_SERVE';
    this.ballPhase = 'SERVE_FLIGHT';
    this.refereeCallText = isLongServe ? 'LONG SERVE BOMB!' : `${type} SERVE IN FLIGHT`;

    const strikeY = isLongServe
      ? Math.max(2.95, this.ball.position.y)
      : type === 'JUMP'
      ? Math.max(2.65, this.ball.position.y)
      : Math.max(2.15, this.ball.position.y);
    this.ball.position.set(server.mesh.position.x, strikeY, server.mesh.position.z);
    this.ballPosPrev.copy(this.ball.position);

    const target = new THREE.Vector3(targetX, isLongServe ? 0.38 : 0.55, targetZ);
    const baseFlight = isLongServe ? 0.94 : type === 'JUMP' ? 1.15 : type === 'TOPSPIN' ? 1.32 : 1.55;
    const flightTime = Math.max(0.62, baseFlight - (power / 100) * 0.32);
    this.ballVel.copy(this.solveBallisticVelocity(this.ball.position, target, flightTime, true));
    this.ballSpin.set(
      type === 'FLOAT' ? 1.5 : isLongServe ? -26 : -18,
      (Math.random() - 0.5) * (isLongServe ? 7 : 4),
      0
    );
    this.ballSquishTimer = 0.1;

    const kmh = Math.round(this.ballVel.length() * 3.6);
    this.state.ballSpeedKmh = kmh;
    this.state.lastShotType = isLongServe ? 'LONG SERVE BOMB' : `${type} SERVE`;
    this.injectFloorRipple(this.ball.position.x, this.ball.position.z, isLongServe ? 1.0 : 0.85);
    this.playImpactAudio(type === 'FLOAT' ? 'BUMP' : 'SPIKE', kmh);
    this.movementOrchestrator.notifyOpponentContact(server.team === 'A' ? 'B' : 'A');

    if (isLongServe) {
      this.spawnAerialSpikeRing(this.ball.position, this.ballVel, 0x00f0ff);
      this._sweatEmitPos.set(server.mesh.position.x, server.mesh.position.y + 1.9, server.mesh.position.z);
      this.particleSystem.emitSweatSpray(this._sweatEmitPos, this.ballVel, 16, Math.max(0.4, server.sweatLevel));
      this.triggerPostFXImpactFlash(this.ball.position, 0.88);
      this.triggerComicStrikeCamera(server, target, kmh, 'LONG SERVE!!', `${kmh} KM/H BASELINE BOMB`);
    }

    this.announceVoice(
      `${server.name} fires a ${isLongServe ? 'long runway' : type.toLowerCase()} serve at ${kmh} kilometers per hour!`,
      'HIGH'
    );
    this.log(`${server.team === 'A' ? 'CYAN' : 'ORG'} #${server.jerseyNumber} ${type} SERVE (${kmh} km/h).`);
    this.assignTeamRolesOnCross();
    this.notifyState();
  }

  private rallyCountReset(servingTeam: 'A' | 'B') {
    this.state.rallyCount = 1;
    this.sideTouches = 0;
    this.rallyChainStage = 'READY';
    this.lastContactPlayer = null;
    this.currentSide = servingTeam === 'A' ? 'B' : 'A';
    this.state.touchesA = 0;
    this.state.touchesB = 0;
    this.state.teamFSMStateA = this.currentSide === 'A' ? 'TOUCH_1_PASS' : 'BLOCK_AND_COVER';
    this.state.teamFSMStateB = this.currentSide === 'B' ? 'TOUCH_1_PASS' : 'BLOCK_AND_COVER';
  }

  private assignTeamRolesOnCross() {
    const tactic = this.currentSide === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB;
    const roles = this.aiSteering.assignTeamRolesOnCross(
      this.units,
      this.currentSide,
      this.rawLandingSpot,
      tactic
    );
    this.expectedSetter = roles.expectedSetter;
    this.expectedReceiver = roles.expectedReceiver;
    this.expectedSpiker = roles.expectedSpiker;
  }

  private scorePoint(winner: 'A' | 'B', reason: string) {
    if (this.state.matchState !== 'PLAY') return;
    const prevServing = this.state.servingTeam;

    if (winner === 'A') {
      this.state.scoreA++;
      this.state.momentumA = Math.min(100, this.state.momentumA + 16);
      this.state.momentumB = Math.max(0, this.state.momentumB - 10);
    } else {
      this.state.scoreB++;
      this.state.momentumB = Math.min(100, this.state.momentumB + 16);
      this.state.momentumA = Math.max(0, this.state.momentumA - 10);
    }

    // FIVB Side-Out Rotation: winning team rotates clockwise only if they were receiving!
    if (winner !== prevServing) {
      this.rotateTeamClockwise(winner);
    }

    this.state.servingTeam = winner;
    this.celebrationWinnerTeam = winner;
    this.state.hyperDriveActive = this.state.momentumA >= 90 || this.state.momentumB >= 90;
    this.state.activePrompt = 'NONE';
    this.landingRing.visible = false;
    this.timingRing.visible = false;
    this.bannerClearTimer = 1.75;
    this.pointDelay = 1.55;

    this.movementOrchestrator.orchestrateCelebration(
      this.units,
      winner,
      this.state.scoreA,
      this.state.scoreB,
      this.lastContactPlayer
    );
    this.units.forEach((u) => {
      if (u.team === winner) {
        this._sweatEmitPos.set(u.mesh.position.x, 1.5, u.mesh.position.z);
        this.particleSystem.emitSweatSpray(this._sweatEmitPos, new THREE.Vector3(0, 1.4, 0), 9, 0.78);
      }
    });

    this.blowRefereeWhistle();
    this.ballPhase = 'DEAD_ROLL';
    this.pendingServeSpec = null;
    const refCall: 'IN' | 'OUT' | 'NET' | 'BLOCK' | 'ACE' = reason.includes('OUT')
      ? 'OUT'
      : reason.includes('FAULT') || reason.includes('NET')
      ? 'NET'
      : this.state.lastShotType.includes('BLOCK')
      ? 'BLOCK'
      : this.state.rallyCount <= 1
      ? 'ACE'
      : 'IN';
    this.stadiumPersonnel?.triggerCall(winner, refCall);
    this.refereeCallText = `${refCall} • POINT ${winner === 'A' ? 'CYAN' : 'VICE'}`;

    this.crowdSystem.triggerCheer(
      winner,
      Math.min(1, 0.55 + this.state.rallyCount * 0.06),
      `${winner === 'A' ? 'CYAN' : 'VICE'} POINT ROAR`
    );
    this.log(`Point ${winner === 'A' ? 'CYAN' : 'ORANGE'}! (${reason})`);
    this.announceVoice(`Point ${winner === 'A' ? 'Cyan' : 'Orange'}! ${reason.toLowerCase()}`, 'HIGH');

    // Update persistent Career stats & Synthetic Storyline Evolution
    updateCareerStats((prev) => ({
      ...prev,
      totalPointsScored: prev.totalPointsScored + (winner === 'A' ? 1 : 0),
    }));
    this.syntheticStory.onPointScored(
      winner,
      this.state.scoreA,
      this.state.scoreB,
      this.reactiveState.comboStreak
    );

    // Capture top spike clip & trigger optional slow-motion multi-angle instant replay
    let triggeredSlowMoReplay = false;
    if (this.pendingSpikeMeta && this.pendingSpikeMeta.speedKmh >= 62) {
      const clip = this.replaySystem.captureBestSpikeClip({
        ...this.pendingSpikeMeta,
        impactPos: this.ball.position,
        scoreA: this.state.scoreA,
        scoreB: this.state.scoreB,
        currentSet: this.state.currentSet,
      });
      if (clip) {
        saveReplayVaultClips(this.replaySystem.getClips());
        this.state.savedSpikesCount = this.replaySystem.getClips().length;
        if (
          this.state.screenMode === 'PLAYING' &&
          this.replaySystem.isAutoShowcaseEnabled() &&
          clip.speedKmh >= 76 &&
          this.state.matchFormat !== 'PRACTICE'
        ) {
          triggeredSlowMoReplay = this.replaySystem.triggerLatestMultiAngleReplay(false);
        }
      }
      this.pendingSpikeMeta = null;
    }

    const isStory = this.state.matchFormat === 'STORY_MATCH' && this.activeStoryChapter !== null;
    const setsToWin = isStory
      ? this.activeStoryChapter!.setsToWin
      : this.state.matchFormat === 'QUICK_SET'
      ? 1
      : 2;
    const setTargetPts = isStory
      ? this.activeStoryChapter!.targetScore
      : this.state.matchFormat === 'PRACTICE'
      ? 999
      : 25;

    if (this.state.scoreA >= setTargetPts && this.state.scoreA - this.state.scoreB >= 2) {
      this.state.setsA++;
      if (this.state.setsA >= setsToWin) {
        this.state.matchState = 'MATCH_OVER';
        updateCareerStats((prev) => ({
          ...prev,
          matchesPlayed: prev.matchesPlayed + 1,
          matchesWon: prev.matchesWon + 1,
        }));
        if (isStory && this.activeStoryChapter) {
          const margin = this.state.scoreA - this.state.scoreB;
          const stars = margin >= 5 || this.reactiveState.comboStreak >= 3 ? 3 : margin >= 3 ? 2 : 1;
          recordStoryChapterVictory(this.activeStoryChapter.chapterNumber, stars, STORY_CHAPTERS.length);
          this.beginStoryCutscene('POST_WIN', this.activeStoryChapter.postWinCutscene);
        } else {
          this.state.screenMode = 'MATCH_OVER';
        }
      } else {
        this.state.matchState = 'SET_OVER';
      }
      this.pointDelay = 2.4;
    } else if (this.state.scoreB >= setTargetPts && this.state.scoreB - this.state.scoreA >= 2) {
      this.state.setsB++;
      if (this.state.setsB >= setsToWin) {
        this.state.matchState = 'MATCH_OVER';
        updateCareerStats((prev) => ({
          ...prev,
          matchesPlayed: prev.matchesPlayed + 1,
        }));
        if (isStory && this.activeStoryChapter) {
          this.beginStoryCutscene('POST_LOSS', this.activeStoryChapter.postLossCutscene);
        } else {
          this.state.screenMode = 'MATCH_OVER';
        }
      } else {
        this.state.matchState = 'SET_OVER';
      }
      this.pointDelay = 2.4;
    } else {
      this.state.matchState = 'POINT_SCORED';
      if (
        (this.state.scoreA >= setTargetPts - 1 || this.state.scoreB >= setTargetPts - 1) &&
        Math.abs(this.state.scoreA - this.state.scoreB) >= 1 &&
        setTargetPts < 100
      ) {
        const leadingTeam = this.state.scoreA > this.state.scoreB ? 'A' : 'B';
        const isMatchPt =
          (leadingTeam === 'A' && this.state.setsA >= setsToWin - 1) ||
          (leadingTeam === 'B' && this.state.setsB >= setsToWin - 1);
        this.refereeCallText = `${isMatchPt ? 'MATCH POINT' : 'SET POINT'} · ${
          leadingTeam === 'A' ? 'AIM VANCOUVER' : 'RIVAL'
        }`;
        this.crowdSystem.triggerCheer(leadingTeam, 0.92, isMatchPt ? 'MATCH POINT ROAR!' : 'SET POINT TENSION!');
      }
      if (
        isStory &&
        this.activeStoryChapter &&
        !this.storyState.midMatchTriggered &&
        Math.max(this.state.scoreA, this.state.scoreB) >= this.activeStoryChapter.midMatchTriggerScore &&
        this.activeStoryChapter.midMatchCutscene.length > 0
      ) {
        this.pendingMidCutscene = true;
      }
    }

    if (triggeredSlowMoReplay) {
      this.pointDelay = 0.35;
    }

    this.syncGeminiBrainState(true);
    this.notifyState();
  }

  // =========================================================================
  // UPDATE LOOP: PHYSICS, SWEPT NET COLLISION & AI/PLAYER GAMEPLAY
  // =========================================================================
  private updatePhysics(dt: number) {
    if (this.state.matchState === 'SERVE') {
      this.ballPhase = 'HELD_READY';
      const server = this.units.find((u) => u.isServer && u.hasBall);
      if (server) {
        const zSign = server.team === 'A' ? 1 : -1;
        this.ball.position.set(
          server.mesh.position.x,
          1.32 + Math.sin(performance.now() * 0.004) * 0.05,
          server.mesh.position.z - 0.35 * zSign
        );
      }
      return;
    }

    if (this.ballPhase === 'SERVE_TOSS' && this.pendingServeSpec) {
      this.ballPosPrev.copy(this.ball.position);
      this.ballVel.y += this.GRAVITY * dt;
      this.ball.position.addScaledVector(this.ballVel, dt);
      this.ball.rotation.x += this.ballSpin.x * dt;
      this.serveTossTimer -= dt;
      if (this.serveTossTimer <= 0) {
        this.completeServeStrike();
      }
      return;
    }

    if (this.state.matchState !== 'PLAY' && this.state.matchState !== 'POINT_SCORED' && this.state.matchState !== 'SET_OVER') return;

    this.ballPosPrev.copy(this.ball.position);

    // Aerodynamic Magnus + Gravity + Wind Drift from Match Evolution
    const mx = (this.ballSpin.y * this.ballVel.z - this.ballSpin.z * this.ballVel.y) * 0.01;
    const my = (this.ballSpin.z * this.ballVel.x - this.ballSpin.x * this.ballVel.z) * 0.01;
    const mz = (this.ballSpin.x * this.ballVel.y - this.ballSpin.y * this.ballVel.x) * 0.01;
    this.ballVel.x += (mx + this.matchEvolution.windX * 0.14) * dt;
    this.ballVel.y += (this.GRAVITY + my) * dt;
    this.ballVel.z += (mz + this.matchEvolution.windZ * 0.14) * dt;

    // Drag
    const spd = this.ballVel.length();
    if (spd > 0.1) {
      const drag = Math.max(0, 1 - 0.0015 * spd * dt);
      this.ballVel.multiplyScalar(drag);
    }

    this.ball.position.addScaledVector(this.ballVel, dt);
    this.ball.rotation.x += this.ballSpin.x * dt;
    this.ball.rotation.y += this.ballSpin.y * dt;

    if (this.ball.position.y > this.ballApex) {
      this.ballApex = this.ball.position.y;
      this.state.lastJumpHeight = Number(this.ballApex.toFixed(2));
    }

    // Swept Net Crossing Collision (prevents fast spikes tunneling through z = 0!)
    const crossedNet =
      this.ballPosPrev.z !== this.ball.position.z &&
      Math.sign(this.ballPosPrev.z) !== Math.sign(this.ball.position.z);
    if (crossedNet && Math.abs(this.ball.position.x) < this.COURT_WIDTH / 2 + 0.45) {
      const frac = Math.abs(this.ballPosPrev.z) / Math.max(0.001, Math.abs(this.ball.position.z - this.ballPosPrev.z));
      const yAtNet = THREE.MathUtils.lerp(this.ballPosPrev.y, this.ball.position.y, frac);

      if (yAtNet >= this.NET_HEIGHT - 0.1 && yAtNet <= this.NET_HEIGHT + 0.12) {
        // Net tape clip
        this.ballVel.z *= 0.68;
        this.ballVel.y = -Math.abs(this.ballVel.y) * 0.25 - 0.8;
        this.netImpacts.push({ pos: this.ball.position.clone(), force: 6, time: 0 });
        this.playImpactAudio('BLOCK', 45);
      } else if (yAtNet < this.NET_HEIGHT - 0.1 && yAtNet > this.NET_HEIGHT - 1.05) {
        // Blocked by net mesh
        this.ball.position.z = Math.sign(this.ballPosPrev.z) * 0.22;
        this.ballVel.z *= -0.38;
        this.ballVel.y = Math.max(this.ballVel.y, 0.8);
        this.netImpacts.push({ pos: this.ball.position.clone(), force: 11, time: 0 });
        this.playImpactAudio('BLOCK', 60);
      }
    }

    // Floor Impact & Point Evaluation + Dust/Sand Burst & PostFX Flash (zero repetitive low-bounce audio)
    if (this.ball.position.y <= this.BALL_RADIUS) {
      this.ball.position.y = this.BALL_RADIUS;
      this.ballSquishTimer = 0.12;
      this.frameImpactEvent = true;

      const impactSpeed = Math.abs(this.ballVel.y);
      const nowMs = performance.now();
      if (impactSpeed > 1.85 && nowMs - this.lastFloorAudioTime > 180) {
        this.lastFloorAudioTime = nowMs;
        this.injectFloorRipple(this.ball.position.x, this.ball.position.z, Math.min(1.0, impactSpeed / 10));
        this.playImpactAudio('FLOOR', Math.round(impactSpeed * 3.6));
      }

      if (impactSpeed > 2.4) {
        if (this.state.courtSurface === 'SAND' || this.matchEvolution.sandLevel > 0.2) {
          this.particleSystem.emitSandSpray(this.ball.position, this.ballVel.x * 0.2, this.ballVel.z * 0.2, 26);
        }
        this.particleSystem.emitDustBurst(this.ball.position, 22, 1.45);
        this.triggerPostFXImpactFlash(this.ball.position, Math.min(1, impactSpeed / 12));
      }

      if (this.state.matchState === 'PLAY') {
        const inX = Math.abs(this.ball.position.x) <= this.COURT_WIDTH / 2 + 0.04;
        const inZ = Math.abs(this.ball.position.z) <= this.COURT_LENGTH / 2 + 0.04;
        if (inX && inZ) {
          this.scorePoint(this.ball.position.z > 0 ? 'B' : 'A', 'BALL IN COURT');
        } else {
          const lastTouchTeam = this.lastContactPlayer?.team || (this.currentSide === 'A' ? 'B' : 'A');
          this.scorePoint(lastTouchTeam === 'A' ? 'B' : 'A', 'BALL OUT OF BOUNDS');
        }
      }

      if (Math.abs(this.ballVel.y) < 0.45) {
        this.ballVel.set(this.ballVel.x * 0.8, 0, this.ballVel.z * 0.8);
      } else {
        const cor = this.state.courtSurface === 'SAND' ? 0.35 : 0.72;
        this.ballVel.y = Math.abs(this.ballVel.y) * cor;
        this.ballVel.x *= 0.85;
        this.ballVel.z *= 0.85;
      }
    }

    // Perimeter Bounds Clamp
    if (Math.abs(this.ball.position.x) > 7.4) {
      this.ball.position.x = Math.sign(this.ball.position.x) * 7.4;
      this.ballVel.x *= -0.5;
    }
    if (Math.abs(this.ball.position.z) > 12.4) {
      this.ball.position.z = Math.sign(this.ball.position.z) * 12.4;
      this.ballVel.z *= -0.5;
    }

    // Squish + Shadow Sync
    if (this.ballSquishTimer > 0) {
      this.ballSquishTimer -= dt;
      const s = Math.max(0, this.ballSquishTimer / 0.12);
      this.ball.scale.set(1 + s * 0.25, 1 - s * 0.3, 1 + s * 0.25);
    } else {
      this.ball.scale.set(1, 1, 1);
    }

    this.ballShadow.position.set(this.ball.position.x, 0.034, this.ball.position.z);
    const heightScale = THREE.MathUtils.clamp(1.15 - this.ball.position.y * 0.12, 0.35, 1.1);
    this.ballShadow.scale.setScalar(heightScale);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.45 - this.ball.position.y * 0.05, 0.12, 0.45);
  }

  private updateAIAndPlayerControl(dt: number) {
    if (this.state.matchState === 'PLAY') {
      const targetInterceptY = this.sideTouches === 0 ? 0.52 : 1.05;
      const intercept = this.calculateBallIntercept(this.ball.position, this.ballVel, targetInterceptY);
      this.rawLandingSpot.copy(intercept.point);
      this.timeToBallContact = intercept.timeToIntercept;

      // Update Floor Landing Ring & Shrinking Timing Ring (NO trajectory lines)
      this.landingRing.visible = true;
      this.landingRing.position.set(
        THREE.MathUtils.clamp(this.rawLandingSpot.x, -7, 7),
        0.036,
        THREE.MathUtils.clamp(this.rawLandingSpot.z, -12, 12)
      );

      const predictedSide: 'A' | 'B' = this.rawLandingSpot.z >= 0 ? 'A' : 'B';
      const crossingHysteresis =
        Math.abs(this.rawLandingSpot.z) > 0.24 &&
        (this.ballPhase !== 'SERVE_TOSS');
      if (predictedSide !== this.currentSide && crossingHysteresis) {
        this.currentSide = predictedSide;
        this.sideTouches = 0;
        this.rallyChainStage = 'READY';
        this.lastContactPlayer = null;
        this.playerActionQueued = false;
        this.state.touchesA = 0;
        this.state.touchesB = 0;
        this.state.teamFSMStateA = this.currentSide === 'A' ? 'TOUCH_1_PASS' : 'BLOCK_AND_COVER';
        this.state.teamFSMStateB = this.currentSide === 'B' ? 'TOUCH_1_PASS' : 'BLOCK_AND_COVER';
        this.assignTeamRolesOnCross();
      }

      // Compute Interactive Action Prompt & Timing Window for Mobile Player
      let prompt: ActionPromptType = 'NONE';
      let timing = 0;
      if (this.currentSide === 'A') {
        if (this.sideTouches === 0) prompt = 'DIG';
        else if (this.sideTouches === 1) prompt = 'SET';
        else prompt = 'SPIKE';
        timing = THREE.MathUtils.clamp(1 - Math.abs(this.timeToBallContact - 0.18) / 0.9, 0, 1);
      } else if (this.sideTouches === 2 && this.ball.position.y > 2.0) {
        prompt = 'BLOCK';
        timing = THREE.MathUtils.clamp(1 - Math.abs(this.ball.position.z) / 3.5, 0, 1);
      }
      this.state.activePrompt = prompt;
      this.state.promptTiming = Number(timing.toFixed(2));

      const cyanCtrl = this.getActiveCyanControlUnit();
      if (cyanCtrl) {
        this.state.activePlayerName = cyanCtrl.name;
        this.state.activePlayerJersey = cyanCtrl.jerseyNumber;
      }

      if (this.state.controlMode === 'PLAYER' && prompt !== 'NONE') {
        this.timingRing.visible = true;
        this.timingRing.position.copy(this.landingRing.position);
        const s = 0.8 + (1 - timing) * 1.4;
        this.timingRing.scale.setScalar(s);
      } else {
        this.timingRing.visible = false;
      }
    } else {
      this.landingRing.visible = false;
      this.timingRing.visible = false;
    }

    const activeControlUnit = this.getActiveCyanControlUnit();

    // Update each of the 12 athletes cleanly
    for (const u of this.units) {
      u.animTimer += dt;
      if (u.cooldown > 0) u.cooldown = Math.max(0, u.cooldown - dt);
      u.skills.forEach((sk) => {
        if (sk.currentCooldown > 0) sk.currentCooldown = Math.max(0, sk.currentCooldown - dt);
      });

      // Calibrated Vertical Jumping Physics (realistic ~0.75-0.95m leap + fall/get-up recovery)
      if (u.isJumping) {
        u.mesh.position.y += u.yVel * dt;
        u.yVel += this.PLAYER_GRAVITY * dt;
        if (u.mesh.position.y <= 0) {
          u.mesh.position.y = 0;
          u.yVel = 0;
          u.isJumping = false;
          const wasLongJump = Boolean(u.isLongJump);
          u.isLongJump = false;
          const horizSpd = Math.hypot(u.velocity.x, u.velocity.z);
          if ((horizSpd > 6.2 || (wasLongJump && horizSpd > 5.4)) && this.state.matchState === 'PLAY') {
            u.isDowned = true;
            u.fallRecoveryTimer = 0.42;
            u.animState = 'FALLEN_FLOOR';
          } else {
            u.animState = 'LANDING_ABSORB';
          }
          u.animTimer = 0;
          if (this.state.courtSurface === 'SAND' || this.matchEvolution.sandLevel > 0.16) {
            this.particleSystem.emitSandSpray(u.mesh.position, u.velocity.x * 0.3, u.velocity.z * 0.3, 14);
          } else {
            this.particleSystem.emitDustBurst(u.mesh.position, 10, 0.9);
          }
          if (u.sweatLevel > 0.2) {
            this._sweatEmitPos.set(u.mesh.position.x, 1.35, u.mesh.position.z);
            this.particleSystem.emitSweatSpray(this._sweatEmitPos, u.velocity, 7, u.sweatLevel);
          }
        }
      }

      // Fall-down -> Getting-up push-off recovery lifecycle
      if (u.isDowned) {
        u.fallRecoveryTimer = Math.max(0, (u.fallRecoveryTimer ?? 0) - dt);
        if (u.animState === 'FALLEN_FLOOR' && u.fallRecoveryTimer <= 0) {
          u.animState = 'GETTING_UP';
          u.animTimer = 0;
          u.fallRecoveryTimer = 0.42;
        } else if (u.animState === 'GETTING_UP' && u.fallRecoveryTimer <= 0) {
          u.isDowned = false;
          u.fallRecoveryTimer = 0;
          u.animState = 'READY_STANCE';
          u.animTimer = 0;
        }
      }

      // Compute Target Position by Phase & Role
      const zSign = u.team === 'A' ? 1 : -1;
      if (this.state.matchState === 'PLAY') {
        if (u.team === this.currentSide) {
          if (this.sideTouches === 0 && u === this.expectedReceiver) {
            u.targetPos.set(
              THREE.MathUtils.clamp(this.rawLandingSpot.x, -4.3, 4.3),
              0,
              THREE.MathUtils.clamp(this.rawLandingSpot.z, zSign > 0 ? 0.65 : -8.65, zSign > 0 ? 8.65 : -0.65)
            );
            // Allow mobile player touch-drag to fine-steer active Cyan receiver
            if (u === activeControlUnit && this.state.controlMode === 'PLAYER' && this.playerSteerTarget) {
              u.targetPos.x = THREE.MathUtils.lerp(u.targetPos.x, this.playerSteerTarget.x, 0.75);
              u.targetPos.z = THREE.MathUtils.lerp(u.targetPos.z, this.playerSteerTarget.y, 0.75);
            }
          } else if (u === this.expectedSetter) {
            u.targetPos.set(1.1 * zSign, 0, 1.45 * zSign);
          } else if (u === this.expectedSpiker) {
            const teamTactic = u.team === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB;
            const hitZ =
              teamTactic === 'PIPE_HEAVY' || u.role === 'LeftBack'
                ? (this.sideTouches >= 2 ? 2.45 * zSign : 4.2 * zSign)
                : this.sideTouches >= 1
                ? 0.92 * zSign
                : 3.15 * zSign;
            const hitX = u.role === 'Outside' ? -2.95 * zSign : u.role === 'Middle' ? 0.15 * zSign : 2.75 * zSign;
            u.targetPos.set(hitX, 0, hitZ);
          } else {
            const base = this.getZoneBasePos(u.team, u.rotationZone);
            u.targetPos.copy(base);
          }
        } else {
          const defStrat = u.team === 'A' ? this.state.defensiveStrategyA : this.state.defensiveStrategyB;
          const ballX = THREE.MathUtils.clamp(this.ball.position.x, -3.5, 3.5);
          const oppSpikerX = this.expectedSpiker
            ? THREE.MathUtils.clamp(this.expectedSpiker.mesh.position.x, -3.5, 3.5)
            : ballX;
          this.aiSteering.computeDefensiveTarget(
            u,
            defStrat,
            ballX,
            oppSpikerX,
            this.getZoneBasePos(u.team, u.rotationZone)
          );
        }
      } else if (this.state.matchState === 'SERVE' && !u.isServer) {
        u.targetPos.copy(this.getZoneBasePos(u.team, u.rotationZone));
      }

      const tx = THREE.MathUtils.clamp(u.targetPos.x + (u.tacticalOffset?.x || 0), -4.25, 4.25);
      const allowRunway = (this.state.matchState === 'SERVE' && u.isServer) || Boolean(u.isLongJump);
      const tz = THREE.MathUtils.clamp(
        u.targetPos.z + (u.tacticalOffset?.z || 0),
        allowRunway ? -12.2 : u.team === 'A' ? 0.55 : -8.6,
        allowRunway ? 12.2 : u.team === 'A' ? 8.6 : -0.55
      );

      const lookX =
        this.state.matchState === 'PLAY'
          ? u.assignedPlayRole === 'SETTER'
            ? -2.8 * zSign
            : this.ball.position.x
          : 0;
      const lookZ =
        this.state.matchState === 'PLAY'
          ? u.assignedPlayRole === 'SETTER'
            ? 1.5 * zSign
            : this.ball.position.z
          : 0;

      const floorFlow = this.spatialMatrix.sampleFlowAt(u.mesh.position.x, u.mesh.position.z);
      const isUserControlledUnit =
        u === activeControlUnit &&
        u.team === 'A' &&
        this.state.controlMode === 'PLAYER' &&
        this.state.matchState === 'PLAY';
      const moveRes = this.movementOrchestrator.stepUnit({
        unit: u,
        allUnits: this.units,
        targetX: tx,
        targetZ: tz,
        lookX,
        lookZ,
        huntMode: this.huntModeActive,
        turbulence: this.swarmWorker.workerTurbulence,
        floorFlow,
        ballPos: this.ball.position,
        isExpectedReceiver: u === this.expectedReceiver && this.sideTouches === 0,
        isExpectedSpiker: u === this.expectedSpiker,
        sideTouches: this.sideTouches,
        dt,
        manualMoveX: isUserControlledUnit ? this.manualMoveX : 0,
        manualMoveZ: isUserControlledUnit ? this.manualMoveZ : 0,
        reactiveCharge: u.reactiveCharge || 0,
        onFootPlantScuff: (pos, vx, vz) => {
          if (this.state.courtSurface === 'SAND' || this.matchEvolution.sandLevel > 0.16) {
            this.particleSystem.emitSandSpray(pos, vx, vz, 8);
          } else {
            this.particleSystem.emitDustBurst(pos, 6, 0.65);
          }
        },
      });
      const dist = moveRes.dist;

      // Update Grounded Vectorial Floor Chevron
      if (u.parts.vectorArrow) {
        const vx = u.velocity.x + floorFlow.vx * 0.25;
        const vz = u.velocity.z + floorFlow.vz * 0.25;
        const spd = Math.hypot(vx, vz);
        if (spd > 0.18) {
          const worldAngle = Math.atan2(vx, vz);
          const localAngle = worldAngle - u.mesh.rotation.y;
          u.parts.vectorArrow.position.set(Math.sin(localAngle) * 0.52, 0.032, Math.cos(localAngle) * 0.52);
          u.parts.vectorArrow.rotation.y = localAngle;
        } else {
          u.parts.vectorArrow.position.set(0, 0.032, 0.48);
          u.parts.vectorArrow.rotation.y = 0;
        }
        const arrowMat = u.parts.vectorArrow.material as THREE.MeshBasicMaterial;
        arrowMat.opacity = THREE.MathUtils.clamp(0.18 + floorFlow.energy * 0.55 + (u.isJumping ? 0.2 : 0), 0.16, 0.85);
      }

      // Update Athlete Sweat & Stamina based on exertion + Match Evolution
      const exertion =
        (u.actualSpeed > 2.2 ? 0.018 : 0.003) +
        (u.isJumping ? 0.035 : 0) +
        (u.animState === 'DIVE_PANCAKE' || u.animState === 'FALLEN_FLOOR' ? 0.04 : 0) +
        this.matchEvolution.intensity * 0.008;
      if (this.state.matchState === 'PLAY') {
        u.sweatLevel = THREE.MathUtils.clamp(u.sweatLevel + exertion * dt, 0.04, 1.0);
        u.stamina = THREE.MathUtils.clamp(
          u.stamina - (u.actualSpeed > 3.2 || u.isJumping ? 1.8 : -0.9) * dt,
          28,
          100
        );
      }
      u.parts.skinMat.roughness = THREE.MathUtils.lerp(0.5, 0.14, u.sweatLevel);

      // Update Chibi-Voxel Squash & Stretch + Sweat Sheen Shader Uniforms per Athlete
      const squashVal = u.isJumping
        ? THREE.MathUtils.clamp(u.yVel * 0.032, -0.14, 0.2)
        : u.animState === 'LANDING_ABSORB'
        ? -0.13
        : 0;
      this.characterShaderRig.updateUnitState(
        u.jerseyNumber + (u.team === 'A' ? 0 : 100),
        squashVal,
        u.digitalSkin.interceptReadiness / 100,
        u.sweatLevel
      );

      // Update Invisible Digital Skin Telemetry & Active Highlight Ring
      const distToBall = u.mesh.position.distanceTo(this.ball.position);
      const isActiveCyan = u === activeControlUnit && u.team === 'A';
      const auraMat = u.parts.auraMesh.material as THREE.MeshBasicMaterial;
      auraMat.opacity = isActiveCyan ? 0.82 : 0.0;

      u.digitalSkin.proximityValue = Number(THREE.MathUtils.clamp(1 - distToBall / 14, 0, 1).toFixed(2));
      const baseReadiness =
        u.assignedPlayRole === 'RECEIVER' || u.assignedPlayRole === 'SETTER' || u.assignedPlayRole === 'SPIKER'
          ? 96
          : u.assignedPlayRole === 'BLOCKER'
          ? 88
          : 78;
      u.digitalSkin.interceptReadiness = Math.round(
        THREE.MathUtils.clamp(baseReadiness - dist * 5 + (this.huntModeActive ? 4 : 0), 52, 100)
      );
      u.digitalSkin.reactionState =
        u.cooldown > 0.25
          ? 'STRIKE_EXECUTION'
          : u === activeControlUnit || u === this.expectedReceiver || u === this.expectedSpiker
          ? 'TRACKING_INTERCEPT'
          : u.actualSpeed < 0.25
          ? 'LOCK_POSITION'
          : 'SENSORY_STANDBY';

      // Pre-contact Jump / Dig Animations + Continuous Swept Anatomical Hand Hitbox Checks
      if (this.state.matchState === 'PLAY' && u.cooldown <= 0) {
        const dXZ = Math.hypot(this.ball.position.x - u.mesh.position.x, this.ball.position.z - u.mesh.position.z);

        // Pre-jump animations with calibrated athletic leap impulse (yVel * ~0.92..0.98 vs PLAYER_GRAVITY -21.8)
        if (!u.isJumping && !u.isDowned) {
          if (u.team === this.currentSide) {
            if (this.sideTouches === 2 && u === this.expectedSpiker && dXZ < 2.65 && this.ball.position.y > 1.85) {
              const isQuickHit = u.role === 'Middle' || this.desiredSetType === 'QUICK';
              u.isJumping = true;
              u.yVel = u.stats.vertical * (isQuickHit ? 0.88 : 0.96);
              u.animState = 'SPIKE_WINDUP';
              u.animTimer = 0;
              this.particleSystem.emitDustBurst(u.mesh.position, 8, 0.85);
            } else if (this.sideTouches === 0 && u === this.expectedReceiver && dXZ < 2.35 && this.ball.position.y < 1.38) {
              if (this.ball.position.y < 0.62) {
                u.animState = 'DIVE_PANCAKE';
                u.animTimer = 0;
                u.isDowned = true;
                u.fallRecoveryTimer = 0.64;
              } else {
                u.animState = 'PASS_BUMP';
              }
            }
          } else if (
            u.assignedPlayRole === 'BLOCKER' &&
            this.sideTouches === 2 &&
            this.ball.position.y > 2.25 &&
            Math.abs(this.ball.position.z) < 2.2 &&
            dXZ < 2.4 &&
            Math.abs(u.mesh.position.z) < 1.35
          ) {
            u.isJumping = true;
            u.yVel = u.stats.vertical * 0.88;
            u.animState = 'BLOCK_ROOF';
            u.animTimer = 0;
          }
        }

        // Continuous Swept 3D Hand OBB Hitbox Detection (Forearm Platform / Pancake Hand / Overhead Cups / Strike Palm / Block Wall)
        if (u.team === this.currentSide) {
          const hit = this.handHitboxSystem.testSweptHandHitbox(
            u,
            this.ballPosPrev,
            this.ball.position,
            this.BALL_RADIUS,
            this.sideTouches,
            false,
            isUserControlledUnit && (this.playerActionQueued || this.reactiveState.isCharging),
            this._hitResult
          );
          if (hit && (this.ballVel.y < 5.2 || this._hitResult.zone === 'PANCAKE_HAND')) {
            this.handleTeamContact(
              u,
              this._hitResult.zone,
              this._hitResult.handNormal,
              this._hitResult.qualityFactor
            );
          }
        } else if (u.animState === 'BLOCK_ROOF' && u.isJumping) {
          const blockHit = this.handHitboxSystem.testSweptHandHitbox(
            u,
            this.ballPosPrev,
            this.ball.position,
            this.BALL_RADIUS,
            this.sideTouches,
            true,
            isUserControlledUnit,
            this._hitResult
          );
          if (blockHit && this.ballVel.z * zSign < 0) {
            // Monster Roof Block using Hand Normal deflection!
            u.cooldown = 0.85;
            u.sweatLevel = Math.min(1, u.sweatLevel + 0.08);
            const blockSpd = Math.max(14.5, this.ballVel.length() * 0.78);
            this.ballVel.set(
              this._hitResult.handNormal.x * blockSpd * 0.45 + (Math.random() - 0.5) * 1.8,
              -Math.max(4.6, blockSpd * 0.42),
              zSign * -blockSpd * 0.72
            );
            this.sideTouches = 0; // Block doesn't count against 3-hit limit
            this.rallyChainStage = 'READY';
            this.lastContactPlayer = null;
            this.ballPhase = 'BLOCK_DEFLECT';
            this.refereeCallText = 'ROOF BLOCK DEFLECTION';
            this.currentSide = u.team === 'A' ? 'B' : 'A';
            this.playImpactAudio('BLOCK', 75);
            this.movementOrchestrator.notifyOpponentContact(u.team === 'A' ? 'B' : 'A');
            this.crowdSystem.triggerCheer(u.team, 0.88, 'MONSTER ROOF BLOCK!');
            this.injectFloorRipple(u.mesh.position.x, u.mesh.position.z, 0.95);
            this.spawnHitboxPulse(this.ball.position, 'BLOCK_WALL');
            this.state.lastShotType = 'ROOF BLOCK';
            this.triggerSkillBanner(u, 'Roof Penetration Block');
            this.announceVoice(`${u.name} slams down a roof block!`, 'HIGH');
            this.log(`ROOF BLOCK by ${u.team === 'A' ? 'CYAN' : 'ORG'} #${u.jerseyNumber}!`);

            const blockKmh = Math.round(this.ballVel.length() * 3.6);
            this.triggerComicStrikeCamera(
              u,
              this._v1.set(this.ball.position.x, 0.2, zSign * -3.5),
              Math.max(76, blockKmh),
              'ROOF DENIED!!',
              'BLOCK WALL SMASH'
            );

            this.frameStrikeEvent = true;
            this.frameSpikerId = u.id;
            this._sweatEmitPos.set(u.mesh.position.x, u.mesh.position.y + 1.9, u.mesh.position.z);
            this.particleSystem.emitSweatSpray(this._sweatEmitPos, this.ballVel, 14, Math.max(0.35, u.sweatLevel));
            this.triggerPostFXImpactFlash(this.ball.position, 0.86);
            this.pendingSpikeMeta = {
              spiker: u,
              speedKmh: Math.max(78, blockKmh),
              jumpHeight: Number((u.mesh.position.y + 2.3).toFixed(2)),
              shotType: 'MONSTER ROOF BLOCK',
            };
            updateCareerStats((prev) => ({ ...prev, totalBlocks: prev.totalBlocks + 1 }));

            this.assignTeamRolesOnCross();
            this.notifyState();
          }
        }
      }

      // Locomotion state differentiation: STAND -> WALK -> RUN -> APPROACH -> DIVE/FALLEN -> GETTING_UP
      if (
        !u.isJumping &&
        !u.isDowned &&
        u.animState !== 'PASS_BUMP' &&
        u.animState !== 'PASS_OVERHEAD' &&
        u.animState !== 'DIVE_PANCAKE' &&
        u.animState !== 'SET_HIGH_ARC' &&
        u.animState !== 'SET_QUICK' &&
        u.animState !== 'SET_BACK' &&
        u.animState !== 'SPIKE_SWING' &&
        u.animState !== 'FALLEN_FLOOR' &&
        u.animState !== 'GETTING_UP' &&
        u.animState !== 'CELEBRATION'
      ) {
        if (u.actualSpeed >= 2.2) {
          u.animState =
            u === this.expectedSpiker && this.sideTouches >= 1
              ? 'APPROACH_3STEP'
              : 'RUN';
        } else if (u.actualSpeed >= 0.25) {
          u.animState = 'WALK';
        } else {
          u.animState = 'READY_STANCE';
        }
      } else if (
        !u.isJumping &&
        !u.isDowned &&
        u.animTimer > 0.45 &&
        u.animState !== 'CELEBRATION' &&
        u.animState !== 'FALLEN_FLOOR' &&
        u.animState !== 'GETTING_UP'
      ) {
        u.animState =
          u.actualSpeed >= 2.2
            ? 'RUN'
            : u.actualSpeed >= 0.25
            ? 'WALK'
            : 'READY_STANCE';
        u.animTimer = 0;
      }

      this.applySkeletalRig(u, dt);
    }

    // Advance the 12x24 Self-Propagating Floor Spatial Matrix & emit zone notifications
    this.spatialMatrix.stepSelfPropagatingGrid(this.units, dt);
  }

  private handleTeamContact(
    unit: Unit,
    hitZone: HandContactZone = 'FOREARM_PLATFORM',
    handNormal?: THREE.Vector3,
    contactQuality = 0.9
  ) {
    if (this.sideTouches >= 3) {
      this.blowRefereeWhistle();
      this.state.netViolation = {
        type: 'FOUR HITS FAULT',
        ruleNumber: 'FIVB 9.1',
        jerseyNumber: unit.jerseyNumber,
        playerName: unit.name,
        team: unit.team,
        description: 'Team exceeded 3-hit limit before crossing net.',
      };
      this.scorePoint(unit.team === 'A' ? 'B' : 'A', 'FOUR HITS FAULT');
      return;
    }

    if (this.lastContactPlayer === unit && this.sideTouches >= 1) {
      this.blowRefereeWhistle();
      this.state.netViolation = {
        type: 'DOUBLE CONTACT FAULT',
        ruleNumber: 'FIVB 9.3.4',
        jerseyNumber: unit.jerseyNumber,
        playerName: unit.name,
        team: unit.team,
        description: 'Same player contacted ball twice consecutively.',
      };
      this.scorePoint(unit.team === 'A' ? 'B' : 'A', 'DOUBLE CONTACT FAULT');
      return;
    }

    unit.cooldown = 0.5;
    this.lastContactPlayer = unit;
    this.sideTouches++;
    this.state.rallyCount++;
    if (unit.team === 'A') this.state.touchesA = this.sideTouches;
    else this.state.touchesB = this.sideTouches;

    const isCyanPlayerTouch = unit.team === 'A' && (this.playerActionQueued || this.reactiveBufferTimer > 0);
    const reactiveBonus = isCyanPlayerTouch ? Math.max(0.14, this.reactiveAdaptivePower) : 0;
    const timingBonus = isCyanPlayerTouch ? 0.25 + reactiveBonus : 0;
    const attackOverride = unit.team === 'A' ? this.desiredAttackOverride : null;
    this.playerActionQueued = false;
    this.reactiveBufferTimer = 0;
    this.reactiveState.bufferedAction = null;
    this.desiredAttackOverride = null;
    this.reactiveAdaptivePower = 0;
    unit.reactiveCharge = 0;
    this.ballSquishTimer = 0.09;
    this.injectFloorRipple(this.ball.position.x, this.ball.position.z, 0.72);
    this.spawnHitboxPulse(this.ball.position, hitZone);
    this.bannerClearTimer = 1.65;

    const zSign = unit.team === 'A' ? 1 : -1;

    // Reactive Continuation: if an incoming comic slow-mo spike is cleanly dug by defense, smoothly return to real time!
    if (this.sideTouches === 1 && this.comicStrike.active && this.comicStrike.phase !== 'REALTIME_RETURN') {
      this.comicStrike.phase = 'REALTIME_RETURN';
      this.comicStrikeTimer = Math.max(this.comicStrikeTimer, this.comicStrikeDuration * 0.74);
      this.comicStrike.calloutText = hitZone === 'PANCAKE_HAND' ? 'MIRACLE DIG!!' : 'LIVE SAVE!!';
    }

    // Determine whether player executed an aggressive 2nd-touch Strike/Dump directly over the net
    const isDirectSecondTouchStrike =
      this.sideTouches === 2 &&
      unit.team === 'A' &&
      (attackOverride === 'JUMP_SPIKE' || (attackOverride === 'FEINT_TIP' && unit.isJumping));

    if (this.sideTouches === 1) {
      // STAGE 1: PASS / DIG (Passing Matrix Evaluation using individual pattern)
      this.rallyChainStage = 'PASS_STAGE';
      this.ballPhase = 'PASS_ARC';
      this.refereeCallText = hitZone === 'PANCAKE_HAND' ? 'MIRACLE PANCAKE DIG' : 'STAGE 1 · PASS DIG';
      const passEval = this.movementOrchestrator.evaluatePassAttempt(
        unit,
        hitZone,
        contactQuality,
        timingBonus,
        this.ball.position.y
      );
      const setterTarget = this.expectedSetter
        ? new THREE.Vector3(this.expectedSetter.targetPos.x, 3.65, this.expectedSetter.targetPos.z)
        : new THREE.Vector3(1.1 * zSign, 3.65, 1.45 * zSign);
      const spreadMiss = (1 - contactQuality) * passEval.spreadScale;
      setterTarget.x += (Math.random() - 0.5) * spreadMiss * 0.9;
      const flight =
        (hitZone === 'PANCAKE_HAND' ? 1.32 : 1.16) *
        (passEval.quality === 'PERFECT_3' ? 0.96 : 1.04);
      const basePassVel = this.solveBallisticVelocity(this.ball.position, setterTarget, flight, false);
      if (handNormal) {
        basePassVel.x += handNormal.x * spreadMiss * 0.45;
      }
      this.ballVel.copy(basePassVel);
      this.ballSpin.set(0, 0, 0);
      if (hitZone !== 'PANCAKE_HAND') {
        unit.animState = passEval.useOverheadAnim ? 'PASS_OVERHEAD' : 'PASS_BUMP';
        unit.animTimer = 0;
      }

      this.state.lastPassQuality = passEval.quality;
      this.state.lastPassRatingText = passEval.ratingText;
      this.state.lastShotType = hitZone === 'PANCAKE_HAND' ? 'PANCAKE SAVE' : 'PASS DIG';
      if (unit.team === 'A') this.state.teamFSMStateA = 'TOUCH_2_SET';
      else this.state.teamFSMStateB = 'TOUCH_2_SET';
      this.playImpactAudio('BUMP', 42);
      this.syntheticStory.onDigSave(unit.name, unit.jerseyNumber, hitZone === 'PANCAKE_HAND');
      this.log(`STAGE 1 PASS (#${unit.jerseyNumber} ${unit.name}, ${hitZone}, ${passEval.qualityScore}%) -> Setter`);
    } else if (this.sideTouches === 2 && !isDirectSecondTouchStrike) {
      // STAGE 2: STRIKE-READY TEMPO SET (Passing Matrix tempo modulation)
      this.rallyChainStage = 'STRIKE_STAGE';
      this.ballPhase = 'SET_TEMPO';
      this.refereeCallText = 'STAGE 2 · STRIKE SET';
      const setEval = this.movementOrchestrator.evaluatePassAttempt(
        unit,
        hitZone,
        contactQuality,
        timingBonus,
        this.ball.position.y
      );
      const tactic = unit.team === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB;
      const isQuick =
        this.desiredSetType === 'QUICK' ||
        attackOverride === 'STRIKE_SET' ||
        tactic === 'FAST_QUICK' ||
        this.expectedSpiker?.role === 'Middle';
      const isPipe = tactic === 'PIPE_HEAVY' || this.expectedSpiker?.role === 'LeftBack';
      const spikerTarget = this.expectedSpiker
        ? new THREE.Vector3(
            this.expectedSpiker.targetPos.x,
            isQuick ? 3.15 : isPipe ? 3.85 : 4.05,
            this.expectedSpiker.targetPos.z
          )
        : new THREE.Vector3(-2.6 * zSign, 3.95, 1.1 * zSign);
      const flight = (isQuick ? 0.7 : isPipe ? 0.94 : 1.06) * setEval.flightTimeMult;
      this.ballVel.copy(this.solveBallisticVelocity(this.ball.position, spikerTarget, flight, false));
      this.ballSpin.set(0, 0, 0);
      unit.animState = isQuick ? 'SET_QUICK' : this.desiredSetType === 'BACK' ? 'SET_BACK' : 'SET_HIGH_ARC';
      unit.animTimer = 0;

      this.state.lastShotType = isQuick ? 'STRIKE QUICK SET' : isPipe ? 'BACK-ROW PIPE SET' : 'HIGH PIN STRIKE SET';
      if (unit.team === 'A') this.state.teamFSMStateA = 'TOUCH_3_ATTACK';
      else this.state.teamFSMStateB = 'TOUCH_3_ATTACK';
      this.playImpactAudio('SET', 34);
      this.announceVoice(`${unit.name} tees up ${isQuick ? 'fast strike tempo' : isPipe ? 'back-row pipe' : 'the pin'} for ${this.expectedSpiker?.name || 'the spiker'}!`, 'NORMAL');
      this.log(`STAGE 2 STRIKE SET (#${unit.jerseyNumber} ${unit.name}, ${setEval.qualityScore}%) -> ${this.expectedSpiker?.name || 'Spiker'}`);
    } else {
      // STAGE 3: FULL SPIKE / 2ND-TOUCH DIRECT STRIKE -> COMIC CLOSE-UP ORBIT CAMERA!
      this.rallyChainStage = 'SPIKE_STAGE';
      this.ballPhase = 'ATTACK_STRIKE';
      this.refereeCallText = isDirectSecondTouchStrike ? 'QUICK 2-TOUCH STRIKE!' : 'STAGE 3 · POWER SPIKE';
      const useAim = unit.team === 'A' && this.state.controlMode === 'PLAYER';
      const oppTeam = unit.team === 'A' ? 'B' : 'A';
      const oppDef = unit.team === 'A' ? this.state.defensiveStrategyB : this.state.defensiveStrategyA;
      const teamTactic = unit.team === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB;

      const oppBlockersJumping = this.units.filter(
        (b) => b.team === oppTeam && b.animState === 'BLOCK_ROOF' && b.isJumping && Math.abs(b.mesh.position.x - unit.mesh.position.x) < 1.85
      ).length;

      let variant: ShotVariant = 'POWER_CROSS';
      if (attackOverride === 'FEINT_TIP') {
        variant = 'JUMP_FLOAT_TIP';
      } else if (unit.role === 'Middle' || this.desiredSetType === 'QUICK' || attackOverride === 'QUICK_SET' || isDirectSecondTouchStrike) {
        variant = 'QUICK_TEMPO_1';
      } else if (teamTactic === 'PIPE_HEAVY' || unit.role === 'LeftBack') {
        variant = 'BACK_ROW_PIPE';
      } else if (oppBlockersJumping >= 2 && Math.random() > 0.42) {
        variant = Math.random() > 0.5 ? 'TOOL_BLOCK_WIPE' : 'JUMP_FLOAT_TIP';
      } else if (oppDef === 'WING_PINCH' || attackOverride === 'RIGHT') {
        variant = Math.random() > 0.45 ? 'DOWN_THE_LINE' : 'CUT_SHOT_SHARP';
      } else {
        const roll = Math.random();
        variant = roll < 0.42 ? 'POWER_CROSS' : roll < 0.7 ? 'CUT_SHOT_SHARP' : roll < 0.9 ? 'DOWN_THE_LINE' : 'JUMP_FLOAT_TIP';
      }

      const oppZDir = unit.team === 'A' ? -1 : 1;
      const crossSign = unit.mesh.position.x >= 0 ? -1 : 1;
      let smartAimX = crossSign * (2.2 + Math.random() * 1.6);
      let smartAimZ = oppZDir * (3.6 + Math.random() * 4.1);
      let baseFlight = 0.62;
      let spinX = -29;
      let spinY = (Math.random() - 0.5) * 6;
      let clearHigh = false;
      let variantLabel = 'CROSS-COURT LASER SPIKE';

      switch (variant) {
        case 'CUT_SHOT_SHARP':
          smartAimX = crossSign * (3.45 + Math.random() * 0.65);
          smartAimZ = oppZDir * (2.35 + Math.random() * 1.6);
          baseFlight = 0.54;
          spinX = -32;
          spinY = crossSign * 9;
          variantLabel = 'SHARP WRIST CUT SHOT';
          break;
        case 'DOWN_THE_LINE':
          smartAimX = Math.sign(unit.mesh.position.x || 1) * (3.35 + Math.random() * 0.65);
          smartAimZ = oppZDir * (5.8 + Math.random() * 2.4);
          baseFlight = 0.58;
          spinX = -30;
          variantLabel = 'DOWN-THE-LINE MISSILE';
          break;
        case 'BACK_ROW_PIPE':
          smartAimX = (Math.random() - 0.5) * 3.6;
          smartAimZ = oppZDir * (5.2 + Math.random() * 2.6);
          baseFlight = 0.66;
          spinX = -28;
          variantLabel = 'BACK-ROW PIPE SPIKE';
          break;
        case 'QUICK_TEMPO_1':
          smartAimX = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.8);
          smartAimZ = oppZDir * (2.6 + Math.random() * 2.2);
          baseFlight = 0.48;
          spinX = -34;
          variantLabel = isDirectSecondTouchStrike ? 'SURPRISE 2-TOUCH STRIKE' : '1-TEMPO MIDDLE BOUNCE';
          break;
        case 'JUMP_FLOAT_TIP':
          smartAimX = crossSign * (0.4 + Math.random() * 2.1);
          smartAimZ = oppZDir * (1.85 + Math.random() * 1.25);
          baseFlight = 0.96;
          spinX = -4;
          clearHigh = true;
          variantLabel = 'FEATHER ROLL TIP';
          break;
        case 'TOOL_BLOCK_WIPE':
          smartAimX = crossSign * (3.75 + Math.random() * 0.45);
          smartAimZ = oppZDir * (4.1 + Math.random() * 3.2);
          baseFlight = 0.72;
          spinX = -22;
          spinY = crossSign * 12;
          clearHigh = true;
          variantLabel = 'HIGH-HANDS BLOCK WIPE';
          break;
        default:
          break;
      }

      const aimX = useAim ? this.playerAimXZ.x : smartAimX;
      const aimZ = useAim ? this.playerAimXZ.y : smartAimZ;
      const target = new THREE.Vector3(aimX, variant === 'JUMP_FLOAT_TIP' ? 0.25 : 0.36, aimZ);

      const diffScale = this.state.difficulty === 'LEGEND' ? 0.92 : this.state.difficulty === 'PRO' ? 1.0 : 1.12;
      const unitPowerScale = THREE.MathUtils.clamp(unit.stats.power / 1.2, 0.85, 1.34);
      const isLateScramble = unit.team === 'A' && this.reactiveLastTimingGrade === 'LATE' && variant !== 'JUMP_FLOAT_TIP';
      const isPerfectSnap = unit.team === 'A' && this.reactiveLastTimingGrade === 'PERFECT' && variant !== 'JUMP_FLOAT_TIP';
      const flight = Math.max(
        0.38,
        ((baseFlight * diffScale) - timingBonus * 0.22 + (isLateScramble ? 0.14 : 0)) / unitPowerScale
      );
      this.ballVel.copy(this.solveBallisticVelocity(this.ball.position, target, flight, clearHigh || isLateScramble || this.ball.position.y < 2.65));
      if (handNormal) {
        this.ballVel.x += handNormal.x * (1 - contactQuality) * 0.8;
      }
      this.ballSpin.set(spinX * (isPerfectSnap ? 1.25 : 1), spinY, 0);

      unit.animState = 'SPIKE_SWING';
      unit.animTimer = 0;
      unit.sweatLevel = Math.min(1, unit.sweatLevel + 0.09);
      const kmh = Math.round(this.ballVel.length() * 3.6);
      this.state.ballSpeedKmh = kmh;
      this.state.lastShotType = isPerfectSnap ? `HYPER ${variantLabel}` : isLateScramble ? 'SCRAMBLE ROLL SHOT' : variantLabel;
      this.cameraShake = variant === 'JUMP_FLOAT_TIP' ? 0.06 : isPerfectSnap ? 0.26 : 0.19;
      if (isPerfectSnap) {
        this.hitStopTimer = 0.045;
        this.sensorMicroZoom = Math.min(1, this.sensorMicroZoom + 0.55);
        this.triggerSkillBanner(unit, `Perfect Timing (${kmh} km/h)`);
      }

      // Trigger Comic-Style Close-Up Slow-Mo Orbital Strike Camera on impactful spikes!
      if (variant !== 'JUMP_FLOAT_TIP' && (kmh >= 64 || isPerfectSnap || this.rallyChainStage === 'SPIKE_STAGE')) {
        const callout = isPerfectSnap
          ? 'HYPER SMASH!!'
          : kmh >= 85
          ? 'THUNDER SPIKE!!'
          : variant === 'CUT_SHOT_SHARP'
          ? 'CUT LASER!!'
          : 'SPIKE STRIKE!';
        this.triggerComicStrikeCamera(unit, target, kmh, callout, variantLabel);
      } else if (variant !== 'JUMP_FLOAT_TIP') {
        this.triggerSpikeActionCam(unit, target);
      }

      // Aerial contact shockwave halo + Post-FX Velocity Chromatic Split + Sweat Droplet Spray
      this.spawnAerialSpikeRing(this.ball.position, this.ballVel, variant === 'JUMP_FLOAT_TIP' ? 0x38bdf8 : 0xffb347);
      this.postFXVelocityPulse = THREE.MathUtils.clamp((kmh - 55) / 52, 0.25, 1.0);
      this.triggerPostFXImpactFlash(this.ball.position, THREE.MathUtils.clamp(kmh / 110, 0.35, 1.0));
      this.frameStrikeEvent = true;
      this.frameSpikerId = unit.id;
      this._sweatEmitPos.set(unit.mesh.position.x, unit.mesh.position.y + 1.85, unit.mesh.position.z);
      this.particleSystem.emitSweatSpray(this._sweatEmitPos, this.ballVel, 20, Math.max(0.35, unit.sweatLevel));

      if (kmh > this.bestSpikeKmhThisMatch) {
        this.bestSpikeKmhThisMatch = kmh;
      }
      const contactJumpHeight = Number((unit.mesh.position.y + 2.35).toFixed(2));
      this.state.lastJumpHeight = contactJumpHeight;
      this.pendingSpikeMeta = {
        spiker: unit,
        speedKmh: kmh,
        jumpHeight: contactJumpHeight,
        shotType: variantLabel,
      };
      updateCareerStats((prev) => ({
        ...prev,
        totalSpikes: prev.totalSpikes + 1,
        fastestSpikeKmh: kmh > prev.fastestSpikeKmh ? kmh : prev.fastestSpikeKmh,
        bestSpikeOwner: kmh > prev.fastestSpikeKmh ? unit.name : prev.bestSpikeOwner,
      }));

      if (unit.team === 'A') this.state.teamFSMStateA = 'BLOCK_AND_COVER';
      else this.state.teamFSMStateB = 'BLOCK_AND_COVER';

      this.playImpactAudio(variant === 'JUMP_FLOAT_TIP' ? 'SET' : 'SPIKE', kmh);
      this.movementOrchestrator.notifyOpponentContact(unit.team === 'A' ? 'B' : 'A');
      if (kmh >= 78) {
        this.crowdSystem.triggerCheer(unit.team, Math.min(1, (kmh - 60) / 50), `${variantLabel} ${kmh} KM/H!`);
      }
      this.announceVoice(`${unit.name} fires a ${variantLabel.toLowerCase()} at ${kmh} kilometers per hour!`, 'HIGH');
      this.syntheticStory.onSpike(unit.name, unit.jerseyNumber, kmh, unit.team === 'A' && unit.jerseyNumber === 14);
      this.log(`${variantLabel} #${unit.jerseyNumber} ${unit.name} (${kmh} km/h)!`);
    }

    this.notifyState();
  }

  /**
   * Verified Right-Hand-Rule Skeletal Rig (+Z is forward facing direction):
   * - Arm hanging down along -Y: negative rotation.x swings arm FORWARD (+Z) and UP!
   * - Leg hanging down along -Y: negative rotation.x swings thigh FORWARD (+Z); positive knee bends BACK!
   */
  private applySkeletalRig(u: Unit, dt: number) {
    const p = u.parts;
    const t = u.animTimer;

    // Reset local joint rotations cleanly every frame
    p.hips.position.y = 0.88;
    p.torso.rotation.set(0, 0, 0);
    p.head.rotation.set(0, 0, 0);
    p.armUpperL.rotation.set(0, 0, 0);
    p.armLowerL.rotation.set(0, 0, 0);
    p.armUpperR.rotation.set(0, 0, 0);
    p.armLowerR.rotation.set(0, 0, 0);
    p.legUpperL.rotation.set(0, 0, 0);
    p.legLowerL.rotation.set(0, 0, 0);
    p.shoesL.rotation.set(0, 0, 0);
    p.legUpperR.rotation.set(0, 0, 0);
    p.legLowerR.rotation.set(0, 0, 0);
    p.shoesR.rotation.set(0, 0, 0);

    const charge = u.reactiveCharge || 0;
    let targetCrouch = 0.04 + charge * 0.14;
    if (u.animState === 'PASS_BUMP') targetCrouch = 0.19;
    else if (u.animState === 'DIVE_PANCAKE') targetCrouch = 0.56;
    else if (u.animState === 'FALLEN_FLOOR') targetCrouch = 0.64;
    else if (u.animState === 'GETTING_UP') targetCrouch = Math.max(0.06, 0.62 * (1 - Math.min(1, t / 0.42)));
    else if (u.animState === 'APPROACH_3STEP') targetCrouch = 0.14;
    else if (u.animState === 'WALK') targetCrouch = 0.025;
    else if (u.animState === 'LANDING_ABSORB') targetCrouch = 0.22;
    else if (u.defeatSlump) targetCrouch = 0.12;
    u.currentCrouch = THREE.MathUtils.lerp(u.currentCrouch, targetCrouch, Math.min(1, dt * 13));
    p.hips.position.y = 0.88 - u.currentCrouch;

    switch (u.animState) {
      case 'WALK': {
        const sL = Math.sin(u.stepCycle);
        const sR = Math.sin(u.stepCycle + Math.PI);
        p.legUpperL.rotation.x = -sL * 0.34;
        p.legLowerL.rotation.x = Math.max(0.08, sL * 0.42);
        p.shoesL.rotation.x = -(p.legUpperL.rotation.x + p.legLowerL.rotation.x) * 0.48;
        p.legUpperR.rotation.x = -sR * 0.34;
        p.legLowerR.rotation.x = Math.max(0.08, sR * 0.42);
        p.shoesR.rotation.x = -(p.legUpperR.rotation.x + p.legLowerR.rotation.x) * 0.48;

        p.armUpperL.rotation.set(-sR * 0.28 - 0.14, 0, 0.12);
        p.armLowerL.rotation.set(-0.42, 0, 0);
        p.armUpperR.rotation.set(-sL * 0.28 - 0.14, 0, -0.12);
        p.armLowerR.rotation.set(-0.42, 0, 0);
        p.torso.rotation.x = 0.08 + u.currentLeanPitch;
        p.torso.rotation.y = sL * 0.08;
        p.torso.rotation.z = u.currentLeanRoll;
        break;
      }
      case 'RUN': {
        const sL = Math.sin(u.stepCycle);
        const sR = Math.sin(u.stepCycle + Math.PI);
        p.legUpperL.rotation.x = -sL * 0.62;
        p.legLowerL.rotation.x = Math.max(0.14, sL * 0.82);
        p.shoesL.rotation.x = -(p.legUpperL.rotation.x + p.legLowerL.rotation.x) * 0.55;
        p.legUpperR.rotation.x = -sR * 0.62;
        p.legLowerR.rotation.x = Math.max(0.14, sR * 0.82);
        p.shoesR.rotation.x = -(p.legUpperR.rotation.x + p.legLowerR.rotation.x) * 0.55;

        p.armUpperL.rotation.set(-sR * 0.65 - 0.2, 0, 0.14);
        p.armLowerL.rotation.set(-0.82, 0, 0);
        p.armUpperR.rotation.set(-sL * 0.65 - 0.2, 0, -0.14);
        p.armLowerR.rotation.set(-0.82, 0, 0);
        p.torso.rotation.x = 0.2 + u.currentLeanPitch;
        p.torso.rotation.y = sL * 0.14;
        p.torso.rotation.z = u.currentLeanRoll;
        break;
      }
      case 'APPROACH_3STEP': {
        // Volleyball double-arm backswing runway launch prep
        const sL = Math.sin(u.stepCycle);
        const sR = Math.sin(u.stepCycle + Math.PI);
        const sweep = Math.min(1, t * 2.2);
        p.legUpperL.rotation.x = -sL * 0.68;
        p.legLowerL.rotation.x = Math.max(0.16, sL * 0.88);
        p.shoesL.rotation.x = -(p.legUpperL.rotation.x + p.legLowerL.rotation.x) * 0.55;
        p.legUpperR.rotation.x = -sR * 0.68;
        p.legLowerR.rotation.x = Math.max(0.16, sR * 0.88);
        p.shoesR.rotation.x = -(p.legUpperR.rotation.x + p.legLowerR.rotation.x) * 0.55;

        p.armUpperL.rotation.set(0.65 * sweep - sR * 0.25, 0, 0.22);
        p.armLowerL.rotation.set(-0.28, 0, 0);
        p.armUpperR.rotation.set(0.65 * sweep - sL * 0.25, 0, -0.22);
        p.armLowerR.rotation.set(-0.28, 0, 0);
        p.torso.rotation.x = 0.26 + u.currentLeanPitch;
        p.torso.rotation.y = -0.12 * sweep;
        p.torso.rotation.z = u.currentLeanRoll;
        break;
      }
      case 'PASS_BUMP': {
        // Dynamic Knee-Spring Forearm Platform (arms extend FORWARD +Z & lift cleanly)
        const lift = Math.sin(Math.min(1, t * 4.2) * Math.PI) * 0.18;
        p.armUpperL.rotation.set(-1.08 - lift, 0, -0.28);
        p.armLowerL.rotation.set(-0.06, 0, 0.08);
        p.armUpperR.rotation.set(-1.08 - lift, 0, 0.28);
        p.armLowerR.rotation.set(-0.06, 0, -0.08);
        p.torso.rotation.x = 0.28 - lift * 0.5 + u.currentLeanPitch * 0.5;
        p.torso.rotation.z = u.currentLeanRoll * 0.5;
        p.legUpperL.rotation.x = -0.45;
        p.legLowerL.rotation.x = 0.74;
        p.legUpperR.rotation.x = -0.45;
        p.legLowerR.rotation.x = 0.74;
        break;
      }
      case 'PASS_OVERHEAD': {
        // High Overhead Cushion / Tomahawk Pass Release
        const push = Math.sin(Math.min(1, t * 4.6) * Math.PI) * 0.24;
        p.armUpperL.rotation.set(-2.05 - push, 0, 0.24);
        p.armLowerL.rotation.set(-0.85 + push * 0.5, 0, -0.14);
        p.armUpperR.rotation.set(-2.05 - push, 0, -0.24);
        p.armLowerR.rotation.set(-0.85 + push * 0.5, 0, 0.14);
        p.torso.rotation.x = -0.08 + u.currentLeanPitch * 0.4;
        p.torso.rotation.z = u.currentLeanRoll * 0.4;
        p.legUpperL.rotation.x = -0.26;
        p.legLowerL.rotation.x = 0.46;
        p.legUpperR.rotation.x = -0.22;
        p.legLowerR.rotation.x = 0.38;
        break;
      }
      case 'DIVE_PANCAKE': {
        // Horizontal pancake dive lunge with reaching lead arm & kicked trail leg
        const d = Math.min(1, t * 6.5);
        p.torso.rotation.x = 1.28 * d;
        p.torso.rotation.y = 0.18 * d;
        p.armUpperL.rotation.set(-2.22 * d, 0, 0.16);
        p.armLowerL.rotation.set(-0.08, 0, 0);
        p.armUpperR.rotation.set(-1.72 * d, 0, -0.24);
        p.armLowerR.rotation.set(-0.25, 0, 0);
        p.legUpperL.rotation.x = 0.52 * d;
        p.legLowerL.rotation.x = 0.35 * d;
        p.legUpperR.rotation.x = 0.32 * d;
        p.legLowerR.rotation.x = 0.62 * d;
        break;
      }
      case 'FALLEN_FLOOR': {
        // Grounded floor sprawl & braced landing tumble recovery
        const settle = Math.min(1, t * 6.0);
        p.torso.rotation.x = THREE.MathUtils.lerp(1.15, 1.38, settle);
        p.torso.rotation.z = Math.sin(t * 7) * 0.05;
        p.armUpperL.rotation.set(-1.95, 0, 0.38);
        p.armLowerL.rotation.set(-0.35, 0, 0);
        p.armUpperR.rotation.set(-1.82, 0, -0.38);
        p.armLowerR.rotation.set(-0.42, 0, 0);
        p.legUpperL.rotation.x = 0.58;
        p.legLowerL.rotation.x = 0.45;
        p.legUpperR.rotation.x = 0.34;
        p.legLowerR.rotation.x = 0.85;
        break;
      }
      case 'GETTING_UP': {
        // Crisp athletic push-up rise off the court with front-knee plant
        const up = Math.min(1, t / 0.42);
        const easedUp = up * up * (3 - 2 * up);
        p.torso.rotation.x = THREE.MathUtils.lerp(1.32, 0.22, easedUp);
        p.armUpperL.rotation.set(THREE.MathUtils.lerp(-1.45, -0.52, easedUp), 0, 0.22);
        p.armLowerL.rotation.set(-0.45, 0, 0);
        p.armUpperR.rotation.set(THREE.MathUtils.lerp(-1.45, -0.52, easedUp), 0, -0.22);
        p.armLowerR.rotation.set(-0.45, 0, 0);
        p.legUpperL.rotation.x = THREE.MathUtils.lerp(0.28, -0.42, easedUp);
        p.legLowerL.rotation.x = THREE.MathUtils.lerp(0.95, 0.62, easedUp);
        p.legUpperR.rotation.x = THREE.MathUtils.lerp(0.45, -0.22, easedUp);
        p.legLowerR.rotation.x = THREE.MathUtils.lerp(0.65, 0.42, easedUp);
        break;
      }
      case 'LANDING_ABSORB': {
        // Deep knee-spring landing recovery with counterbalance arms
        const rec = Math.max(0, 1 - t * 3.2);
        p.legUpperL.rotation.x = -0.42 * rec;
        p.legLowerL.rotation.x = 0.76 * rec;
        p.legUpperR.rotation.x = -0.42 * rec;
        p.legLowerR.rotation.x = 0.76 * rec;
        p.armUpperL.rotation.set(-0.45 * rec, 0, 0.45 * rec);
        p.armUpperR.rotation.set(-0.45 * rec, 0, -0.45 * rec);
        p.torso.rotation.x = 0.24 * rec;
        break;
      }
      case 'SET_HIGH_ARC':
      case 'SET_QUICK':
      case 'SET_BACK': {
        const push = Math.sin(Math.min(1, t * 5) * Math.PI);
        p.armUpperL.rotation.set(-2.28 - push * 0.3, 0, 0.26);
        p.armLowerL.rotation.set(-0.78 + push * 0.4, 0, -0.15);
        p.armUpperR.rotation.set(-2.28 - push * 0.3, 0, -0.26);
        p.armLowerR.rotation.set(-0.78 + push * 0.4, 0, 0.15);
        p.torso.rotation.x = u.animState === 'SET_BACK' ? -0.24 : 0.04;
        p.legUpperL.rotation.x = -0.18 * (1 - push);
        p.legLowerL.rotation.x = 0.32 * (1 - push);
        p.legUpperR.rotation.x = -0.18 * (1 - push);
        p.legLowerR.rotation.x = 0.32 * (1 - push);
        break;
      }
      case 'SPIKE_WINDUP': {
        // Bow-and-Arrow aerial windup amplified by reactive Charge level
        const coil = Math.min(1.2, Math.max(0, t) * 5.2 + charge * 0.35);
        p.armUpperL.rotation.set(-2.6, 0, 0.24);
        p.armLowerL.rotation.set(-0.2, 0, 0);
        p.armUpperR.rotation.set(0.82 * coil, 0, -0.62);
        p.armLowerR.rotation.set(-1.52 * coil, 0, 0);
        p.torso.rotation.x = -0.28 * coil;
        p.torso.rotation.y = -0.4 * coil;
        p.torso.rotation.z = u.currentLeanRoll * 0.4;
        p.legUpperL.rotation.x = 0.32 * coil;
        p.legLowerL.rotation.x = 0.72 * coil;
        p.legUpperR.rotation.x = 0.18 * coil;
        p.legLowerR.rotation.x = 0.8 * coil;
        break;
      }
      case 'SPIKE_SWING':
      case 'SERVE_JUMP': {
        // Explosive torso uncoil + pike/scissor leg kick + whip wrist follow-through
        const swing = Math.min(1, Math.max(0, t) * 7.6);
        p.armUpperL.rotation.set(-0.35 * (1 - swing) + 0.22 * swing, 0, 0.26);
        p.armLowerL.rotation.set(-0.92, 0, 0);
        p.armUpperR.rotation.set(-3.05 + swing * 2.45, 0, -0.14);
        p.armLowerR.rotation.set(-0.12 - swing * 0.2, 0, 0);
        p.torso.rotation.x = 0.38 * swing;
        p.torso.rotation.y = -0.32 * (1 - swing) + 0.22 * swing;
        p.legUpperL.rotation.x = -0.36 * swing;
        p.legLowerL.rotation.x = 0.22;
        p.legUpperR.rotation.x = -0.22 * swing;
        p.legLowerR.rotation.x = 0.38;
        break;
      }
      case 'SERVE_FLOAT': {
        const swing = Math.min(1, Math.max(0, t) * 5.5);
        p.armUpperL.rotation.set(-1.6 * (1 - swing), 0, 0.16);
        p.armUpperR.rotation.set(-2.3 + swing * 1.4, 0, -0.14);
        p.armLowerR.rotation.set(-0.24, 0, 0);
        p.torso.rotation.x = 0.16 * swing;
        break;
      }
      case 'LONG_JUMP_LEAP': {
        // Horizontal athletic flight pose: streamlined torso dive + lead reach + trailing legs
        const reach = Math.min(1, Math.max(0.15, t * 4.5));
        p.armUpperL.rotation.set(-2.35 * reach, 0, 0.14);
        p.armLowerL.rotation.set(-0.12, 0, 0);
        p.armUpperR.rotation.set(-2.15 * reach, 0, -0.18);
        p.armLowerR.rotation.set(-0.16, 0, 0);
        p.torso.rotation.x = 0.95 * reach;
        p.torso.rotation.z = u.currentLeanRoll * 0.45;
        p.legUpperL.rotation.x = 0.48 * reach;
        p.legLowerL.rotation.x = 0.42;
        p.legUpperR.rotation.x = 0.28 * reach;
        p.legLowerR.rotation.x = 0.56;
        break;
      }
      case 'BLOCK_ROOF': {
        p.armUpperL.rotation.set(-3.0, 0, 0.14);
        p.armLowerL.rotation.set(-0.08, 0, 0);
        p.armUpperR.rotation.set(-3.0, 0, -0.14);
        p.armLowerR.rotation.set(-0.08, 0, 0);
        p.torso.rotation.x = 0.18;
        break;
      }
      case 'CELEBRATION': {
        const pattern = this.movementOrchestrator.getBehaviorPattern(u);
        const phase = t * pattern.celebrationTempoMult + (u.celebrationPhase || 0);
        const bounce = Math.abs(Math.sin(phase * 6.8));
        switch (u.celebrationStyle) {
          case 'CHEST_BUMP_SYNC': {
            const leap = Math.max(0, Math.sin(phase * 5.8));
            p.armUpperL.rotation.set(0.35 * leap - 0.6, 0, 0.65);
            p.armUpperR.rotation.set(0.35 * leap - 0.6, 0, -0.65);
            p.torso.rotation.x = -0.22 * leap;
            p.legUpperL.rotation.x = 0.25 * leap;
            p.legLowerL.rotation.x = 0.45 * leap;
            p.legUpperR.rotation.x = 0.25 * leap;
            p.legLowerR.rotation.x = 0.45 * leap;
            break;
          }
          case 'KNEE_SLIDE_ROAR': {
            p.legUpperL.rotation.x = 0.55;
            p.legLowerL.rotation.x = 1.25;
            p.legUpperR.rotation.x = -0.35;
            p.legLowerR.rotation.x = 0.85;
            const pump = Math.sin(phase * 9.5) * 0.25;
            p.armUpperL.rotation.set(-2.35 + pump, 0, 0.52);
            p.armUpperR.rotation.set(-2.35 + pump, 0, -0.52);
            p.armLowerL.rotation.set(-0.55, 0, 0);
            p.armLowerR.rotation.set(-0.55, 0, 0);
            p.torso.rotation.x = -0.26;
            break;
          }
          case 'TEAM_WAVE_SALUTE': {
            const wave = Math.sin(phase * 4.5 + u.id * 0.45);
            p.armUpperL.rotation.set(-2.2 + wave * 0.55, 0, 0.42);
            p.armUpperR.rotation.set(-2.2 - wave * 0.55, 0, -0.42);
            p.torso.rotation.z = wave * 0.14;
            p.legUpperL.rotation.x = -0.18 * bounce;
            p.legUpperR.rotation.x = -0.18 * (1 - bounce);
            break;
          }
          case 'FIST_PUMP_ROAR': {
            const punch = Math.sin(phase * 11.5) * 0.48;
            p.armUpperL.rotation.set(-0.95, 0, 0.28);
            p.armLowerL.rotation.set(-1.15, 0, 0);
            p.armUpperR.rotation.set(-2.48 + punch, 0, -0.28);
            p.armLowerR.rotation.set(-0.78 + punch * 0.4, 0, 0);
            p.torso.rotation.x = -0.2;
            p.torso.rotation.y = Math.sin(phase * 4.5) * 0.28;
            p.legUpperL.rotation.x = -0.26 * bounce;
            p.legLowerL.rotation.x = 0.52 * bounce;
            break;
          }
          case 'AEROPLANE_GLIDE': {
            p.armUpperL.rotation.set(-0.15, 0, 1.44);
            p.armUpperR.rotation.set(-0.15, 0, -1.44);
            p.torso.rotation.x = 0.24;
            p.torso.rotation.z = Math.sin(phase * 4.5) * 0.32;
            p.legUpperL.rotation.x = -0.24;
            p.legLowerL.rotation.x = 0.38;
            break;
          }
          case 'SPIKE_FLEX_BOW': {
            p.armUpperL.rotation.set(-1.55, 0.2, 0.72);
            p.armLowerL.rotation.set(-1.65, 0, -0.2);
            p.armUpperR.rotation.set(-1.55, -0.2, -0.72);
            p.armLowerR.rotation.set(-1.65, 0, 0.2);
            p.torso.rotation.x = -0.16;
            p.torso.rotation.y = Math.sin(phase * 3.0) * 0.25;
            break;
          }
          case 'HIGH_FIVE_BOUNCE': {
            const alt = Math.sin(phase * 10);
            p.armUpperL.rotation.set(-2.58 + alt * 0.38, 0, 0.24);
            p.armUpperR.rotation.set(-2.58 - alt * 0.38, 0, -0.24);
            p.torso.rotation.z = alt * 0.12;
            p.legUpperL.rotation.x = -0.2 * bounce;
            p.legUpperR.rotation.x = -0.2 * (1 - bounce);
            break;
          }
          default: {
            const pump = Math.sin(phase * 8.5) * 0.3;
            p.armUpperL.rotation.set(-2.82 + pump, 0, 0.34);
            p.armUpperR.rotation.set(-2.82 + pump, 0, -0.34);
            p.torso.rotation.x = -0.1 + bounce * 0.12;
            p.legUpperL.rotation.x = -0.28 * bounce;
            p.legLowerL.rotation.x = 0.45 * bounce;
            p.legUpperR.rotation.x = -0.28 * bounce;
            p.legLowerR.rotation.x = 0.45 * bounce;
            break;
          }
        }
        break;
      }
      default: {
        if (u.defeatSlump) {
          const pattern = this.movementOrchestrator.getBehaviorPattern(u);
          const breath = Math.sin(t * 4.0 + u.id) * 0.04;
          if (pattern.defeatStyle === 'HANDS_ON_KNEES') {
            p.torso.rotation.x = 0.44 + breath;
            p.armUpperL.rotation.set(-0.62, 0, 0.14);
            p.armLowerL.rotation.set(-0.35, 0, 0);
            p.armUpperR.rotation.set(-0.62, 0, -0.14);
            p.armLowerR.rotation.set(-0.35, 0, 0);
            p.legUpperL.rotation.x = -0.34;
            p.legLowerL.rotation.x = 0.58;
            p.legUpperR.rotation.x = -0.34;
            p.legLowerR.rotation.x = 0.58;
          } else if (pattern.defeatStyle === 'TOWEL_BREATH') {
            p.torso.rotation.x = 0.12 + breath * 1.4;
            p.armUpperL.rotation.set(-0.35, 0, 0.22);
            p.armLowerL.rotation.set(-1.1, 0, -0.18);
            p.armUpperR.rotation.set(-1.35, 0, -0.15);
            p.armLowerR.rotation.set(-1.35, 0, 0.2);
            p.legUpperL.rotation.x = -0.18;
            p.legLowerL.rotation.x = 0.34;
            p.legUpperR.rotation.x = -0.14;
            p.legLowerR.rotation.x = 0.28;
          } else {
            // HANDS_ON_HIPS
            p.torso.rotation.x = 0.24 + breath;
            p.armUpperL.rotation.set(-0.22, 0, 0.32);
            p.armLowerL.rotation.set(-0.85, 0, -0.28);
            p.armUpperR.rotation.set(-0.22, 0, -0.32);
            p.armLowerR.rotation.set(-0.85, 0, 0.28);
            p.legUpperL.rotation.x = -0.24;
            p.legLowerL.rotation.x = 0.44;
            p.legUpperR.rotation.x = -0.24;
            p.legLowerR.rotation.x = 0.44;
          }
          break;
        }
        // Athletic Volleyball Ready Stance + Charge Coil + Organic Micro-Movement
        const ph = t + u.id * 1.17;
        const breathe = Math.sin(ph * 3.1) * 0.024;
        const weightSway = Math.sin(ph * 2.15) * 0.05;
        const microHop = Math.max(0, Math.sin(ph * 4.4)) * 0.016;
        p.armUpperL.rotation.set(-0.42 + breathe - charge * 0.35, 0, 0.15 + weightSway * 0.35);
        p.armLowerL.rotation.set(-0.68 - charge * 0.3, 0, -0.06);
        p.armUpperR.rotation.set(-0.42 + breathe - charge * 0.35, 0, -0.15 + weightSway * 0.35);
        p.armLowerR.rotation.set(-0.68 - charge * 0.3, 0, 0.06);
        p.legUpperL.rotation.x = -0.24 - charge * 0.24 - microHop * 1.5;
        p.legLowerL.rotation.x = 0.38 + charge * 0.36 + microHop * 1.8;
        p.legUpperR.rotation.x = -0.24 - charge * 0.24 + microHop * 1.5;
        p.legLowerR.rotation.x = 0.38 + charge * 0.36 - microHop * 1.2;
        p.torso.rotation.x = 0.15 + charge * 0.18 + breathe * 0.6 + u.currentLeanPitch * 0.4;
        p.torso.rotation.z = weightSway * 0.55 + u.currentLeanRoll * 0.4;
        break;
      }
    }

    // Apply exact trigonometric Legs-to-Floor grounding formula (prevents shoe sink or hover)
    this.movementOrchestrator.applyLegsToFloor(u);

    // Track ball smoothly (or gaze up at the AIM VANCOUVER billboard during the PS6 intro)
    if (this.state.screenMode === 'MAIN_MENU') {
      const hero = this.getIntroHeroUnit();
      if (u.id === hero.id) {
        if (this.introState.phase === 'HERO_LOOK_UP') {
          p.head.rotation.x = THREE.MathUtils.damp(p.head.rotation.x, -0.48, 8, dt);
          p.head.rotation.y = Math.sin(t * 1.1) * 0.04;
          p.torso.rotation.x = THREE.MathUtils.damp(p.torso.rotation.x, -0.1, 6, dt);
        } else if (this.introState.phase === 'BALL_SWOOSH_TO_FEET') {
          const dy = this.ball.position.y - (u.mesh.position.y + 1.65);
          const dxz = Math.max(0.4, Math.hypot(this.ball.position.x - u.mesh.position.x, this.ball.position.z - u.mesh.position.z));
          p.head.rotation.x = THREE.MathUtils.clamp(-Math.atan2(dy, dxz) * 0.68, -0.5, 0.44);
          p.head.rotation.y = 0;
        } else {
          p.head.rotation.x = -0.22;
          p.head.rotation.y = Math.sin(t * 1.4) * 0.08;
        }
      } else {
        p.head.rotation.x = -0.08;
        p.head.rotation.y = Math.sin(t * 1.8 + u.id) * 0.08;
      }
    } else if (u.defeatSlump) {
      p.head.rotation.x = 0.28;
      p.head.rotation.y = Math.sin(t * 1.4 + u.id) * 0.08;
    } else {
      const dy = this.ball.position.y - (u.mesh.position.y + 1.65);
      const dxz = Math.max(0.5, Math.hypot(this.ball.position.x - u.mesh.position.x, this.ball.position.z - u.mesh.position.z));
      p.head.rotation.x = THREE.MathUtils.clamp(-Math.atan2(dy, dxz) * 0.55, -0.45, 0.35);
      p.head.rotation.y = Math.sin(t * 2.2 + u.id) * 0.06;
    }
  }

  private spawnAerialSpikeRing(worldPos: THREE.Vector3, dir: THREE.Vector3, colorHex = 0xffb347) {
    if (this.impactRings.length >= 8) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 24),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.position.copy(worldPos);
    this._v1.copy(worldPos).add(dir);
    ring.lookAt(this._v1);
    this.scene.add(ring);
    this.impactRings.push({ mesh: ring, life: 0, maxLife: 0.38 });
  }

  private spawnHitboxPulse(worldPos: THREE.Vector3, zone: HandContactZone) {
    if (this.impactRings.length >= 10) return;
    const colorHex =
      zone === 'STRIKE_PALM'
        ? 0xff3d7f
        : zone === 'PANCAKE_HAND' || zone === 'LONG_JUMP_REACH' || zone === 'TORSO_SAVE'
        ? 0x00f0ff
        : zone === 'BLOCK_WALL'
        ? 0xffb347
        : 0x38bdf8;
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.19, 20),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    pulse.position.copy(worldPos);
    pulse.lookAt(this.camera.position);
    this.scene.add(pulse);
    this.impactRings.push({ mesh: pulse, life: 0, maxLife: 0.28 });
  }

  // =========================================================================
  // QUANTUM ORGANIC SCREEN OS v10.5 CONTROLS + BIOLOGICAL SYSTEMS
  // =========================================================================
  private injectFloorRipple(worldX: number, worldZ: number, strength = 0.8) {
    const nowSec = performance.now() * 0.001;
    this.matrixPipeline.injectCourtImpact(worldX, worldZ, nowSec);
    this.hasPendingImpact = true;
    this.pendingImpactPos.set(worldX, 0, worldZ);

    this.organicBlock.membraneTension = THREE.MathUtils.clamp(0.45 + strength * 0.5, 0.45, 0.95);
    this.organicBlock.lastRippleTimeSec = nowSec;

    // Expanding ground impact ring mesh
    if (this.impactRings.length < 10) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.2, 24),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(worldX, 0.041, worldZ);
      ring.renderOrder = 4;
      this.scene.add(ring);
      this.impactRings.push({ mesh: ring, life: 0, maxLife: 0.55 });
    }
  }

  public triggerMitosis() {
    this.organicBlock.mitosisRate = this.organicBlock.mitosisRate === 1.0 ? 1.65 : 1.0;
    this.log(`PixelBlock_0x01 Mitosis Rate: ${this.organicBlock.mitosisRate}x`);
    this.notifyState();
  }

  public triggerNutrientSurge() {
    this.organicBlock.atpLevel = Math.min(100, this.organicBlock.atpLevel + 15);
    this.organicBlock.membraneTension = 0.95;
    this.state.momentumA = Math.min(100, this.state.momentumA + 15);
    this.log('Nutrient ATP Surge injected into team telemetry.');
    this.notifyState();
  }

  public pulseBioluminescence() {
    this.organicBlock.bioluminescence = this.organicBlock.bioluminescence > 100 ? 88.2 : 126.0;
    this.log(`Bioluminescence Photon Flux: ${this.organicBlock.bioluminescence.toFixed(1)} lm`);
    this.notifyState();
  }

  public resetTissue() {
    this.organicBlock.mitosisRate = 1.0;
    this.organicBlock.membraneTension = 0.45;
    this.organicBlock.bioluminescence = 88.2;
    this.organicBlock.atpLevel = 98;
    this.notifyState();
  }

  public toggleCellularMatrix() {
    this.organicBlock.cellularMatrixEnabled = !this.organicBlock.cellularMatrixEnabled;
    this.notifyState();
  }

  public setTissueScale(scale: 256 | 512 | 1024 | 4096) {
    this.organicBlock.tissueScale = scale;
    this.notifyState();
  }

  public exportTelemetryJSON() {
    const payload = this.telemetryRecorder.getExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cometic-volleyball-telemetry-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.log(`Exported ${payload.frameCount} telemetry frames + Hyper-Assessment JSON.`);
  }

  // =========================================================================
  // PS6 SPIKE ACTION FOLLOW-THROUGH CAMERA + WEATHER & SURFACE CONTROLS
  // =========================================================================
  private triggerComicStrikeCamera(
    spiker: Unit,
    target: THREE.Vector3,
    speedKmh: number,
    calloutText: string,
    subText: string
  ) {
    if (!this.spikeCamEnabled) return;
    this.spikeCamActive = false;
    this.comicStrikeTimer = 0;
    this.comicStrikeStartBallPos.copy(this.ball.position);
    this.aiCameraDirector.programComicStrikeOrbit(
      this.ball.position,
      target,
      spiker.team,
      speedKmh
    );
    this._projVec.copy(this.ball.position).project(this.camera);
    const sx = THREE.MathUtils.clamp(this._projVec.x * 0.5 + 0.5, 0.12, 0.88);
    const sy = THREE.MathUtils.clamp(-this._projVec.y * 0.5 + 0.5, 0.15, 0.82);
    this.comicBurstUV.set(sx, 1 - sy);

    this.comicStrike = {
      active: true,
      phase: 'IMPACT_FREEZE',
      calloutText,
      subText: `#${spiker.jerseyNumber} ${spiker.name} · ${subText}`,
      speedKmh,
      chainStage: this.rallyChainStage,
      screenX: sx,
      screenY: sy,
      intensity: 0.95,
      timeScale: 0.14,
      dutchTiltDeg: 6.5,
    };
    this.state.spikeCamActive = true;
  }

  private cancelComicStrikeCamera() {
    if (!this.comicStrike.active) return;
    this.comicStrike.active = false;
    this.comicStrike.phase = 'IDLE';
    this.comicStrike.intensity = 0;
    this.comicStrike.timeScale = 1.0;
    this.comicStrike.dutchTiltDeg = 0;
    this.comicStrikeTimer = 0;
    this.activeCameraDutchTiltDeg = 0;
    this.state.spikeCamActive = false;
    this.camera.fov = this.baseCamFov;
    this.camera.updateProjectionMatrix();
  }

  private triggerSpikeActionCam(spiker: Unit, target: THREE.Vector3) {
    if (!this.spikeCamEnabled || this.comicStrike.active) return;
    this.spikeCamActive = true;
    this.spikeCamTimer = 0;
    this.state.spikeCamActive = true;

    const zSign = spiker.team === 'A' ? 1 : -1;
    const sideOffset = spiker.mesh.position.x >= 0 ? 1.85 : -1.85;
    this.spikeCamAnchor.set(
      THREE.MathUtils.clamp(spiker.mesh.position.x + sideOffset, -5.2, 5.2),
      Math.max(3.6, spiker.mesh.position.y + 2.95),
      spiker.mesh.position.z + 4.35 * zSign
    );
    this.spikeCamStrikeTarget.copy(target);
  }

  private cancelSpikeActionCam() {
    if (!this.spikeCamActive) return;
    this.spikeCamActive = false;
    this.spikeCamTimer = 0;
    this.state.spikeCamActive = false;
    this.camera.fov = this.baseCamFov;
    this.camera.updateProjectionMatrix();
  }

  public setSpikeCamEnabled(enabled: boolean) {
    this.spikeCamEnabled = enabled;
    this.state.spikeCamEnabled = enabled;
    if (!enabled) {
      this.cancelSpikeActionCam();
      this.cancelComicStrikeCamera();
    }
    this.notifyState();
  }

  public setAIDirectorEnabled(enabled: boolean) {
    this.aiCameraDirector.setAutoDirectorEnabled(enabled);
    this.log(`AI Auto-Director ${enabled ? 'ENABLED' : 'MANUAL'} (Self-Programming Cutscene & Close-Up Solver).`);
    this.notifyState();
  }

  public programLiveDirectorAngle() {
    const focus = this.getActiveCyanControlUnit() || this.units[0] || null;
    this.cutsceneShotTimer = 0;
    this.aiCameraDirector.programCutsceneShot({
      shotHint: focus?.team === 'B' ? 'PLAYER_CLOSEUP_B' : 'PLAYER_CLOSEUP_A',
      emotion: 'DETERMINED',
      focusUnit: focus,
      allUnits: this.units,
      intensity: this.matchEvolution.intensity,
    });
    this.notifyState();
  }

  private getViewportAspect(): number {
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    return w / h;
  }

  // System 1: Aspect-Aware Portrait Framing & Vertical Safe-Area FOV Compensation
  private getLensBaseFov(lens: CameraLensPreset, aspect = this.getViewportAspect()): number {
    const portraitBoost = aspect < 1.0 ? THREE.MathUtils.clamp((1.0 - aspect) * 24, 4, 15) : 0;
    switch (lens) {
      case '24MM_WIDE':
        return 54 + portraitBoost;
      case '35MM_CINE':
        return 42 + portraitBoost;
      case '50MM_STD':
        return 34 + portraitBoost * 0.9;
      case '85MM_TELE':
        return 25 + portraitBoost * 0.8;
      case '135MM_SNIPER':
        return 19 + portraitBoost * 0.55;
    }
  }

  private getLensVignetteStrength(lens: CameraLensPreset): number {
    switch (lens) {
      case '24MM_WIDE':
        return 0.24;
      case '35MM_CINE':
        return 0.17;
      case '50MM_STD':
        return 0.12;
      case '85MM_TELE':
        return 0.14;
      case '135MM_SNIPER':
        return 0.21;
    }
  }

  // System 3 companion: Subtle Optical Barrel / Telephoto Compression Factor
  private getLensDistortion(lens: CameraLensPreset): number {
    switch (lens) {
      case '24MM_WIDE':
        return 0.045;
      case '35MM_CINE':
        return 0.022;
      case '50MM_STD':
        return 0.0;
      case '85MM_TELE':
        return -0.014;
      case '135MM_SNIPER':
        return -0.026;
    }
  }

  // System 4: Stadium Bowl Bounds Clamping (keeps camera cleanly inside stands & VIP rails)
  private clampCameraToStadiumBowl(pos: THREE.Vector3, allowOverhead = false): THREE.Vector3 {
    if (allowOverhead) return pos;
    pos.x = THREE.MathUtils.clamp(pos.x, -11.4, 11.4);
    pos.z = THREE.MathUtils.clamp(pos.z, -14.8, 15.1);
    pos.y = Math.max(2.65, pos.y);
    return pos;
  }

  public setCameraAngle(angle: CameraPreset, instant = false) {
    this.state.cameraAngle = angle;
    this.spikeCamActive = false;
    this.state.spikeCamActive = false;
    this.userOrbitPauseTimer = 0;
    const aspect = this.getViewportAspect();
    const isPortrait = aspect < 1.0;

    switch (angle) {
      case 'BROADCAST':
        // Authentic FIVB VNL / Olympic TV Main Hard-Cam (inside West/East bowl sightline)
        this.baseCamPos.set(isPortrait ? 11.2 : 11.0, isPortrait ? 8.6 : 7.4, isPortrait ? 11.6 : 10.2);
        this.baseCamTarget.set(0, isPortrait ? 1.15 : 1.35, 0);
        this.cameraLens = isPortrait ? '50MM_STD' : '85MM_TELE';
        break;
      case 'CINEMATIC_FLOW':
        // Sweeping Crane / Steadicam Orbital Flow inside the stadium bowl overlooking VIP & skyline
        this.baseCamPos.set(isPortrait ? 11.0 : 10.8, isPortrait ? 7.4 : 6.4, isPortrait ? 12.6 : 11.8);
        this.baseCamTarget.set(0, 1.3, 0);
        this.cameraLens = '35MM_CINE';
        break;
      case 'ACTION':
        // High-Speed Courtside Net-Rail Gimbal (50mm dynamic speed lens)
        this.baseCamPos.set(isPortrait ? 9.6 : 8.4, isPortrait ? 4.4 : 3.45, 3.6);
        this.baseCamTarget.set(0, 1.35, 0);
        this.cameraLens = '50MM_STD';
        break;
      case 'COURT_BEHIND':
        // Authentic TV Baseline End-Court Rail Cam (strictly in front of South bleachers z <= 14.9)
        this.baseCamPos.set(0, isPortrait ? 7.2 : 6.1, isPortrait ? 14.8 : 14.4);
        this.baseCamTarget.set(0, isPortrait ? 1.1 : 1.25, -1.6);
        this.cameraLens = isPortrait ? '35MM_CINE' : '50MM_STD';
        break;
      case 'SKY_CAM':
        // TV Overhead Tactical Blimp Cam
        this.baseCamPos.set(0, 26.5, 2.2);
        this.baseCamTarget.set(0, 0, 0);
        this.cameraLens = '35MM_CINE';
        break;
      case 'ISOMETRIC':
        // TV Corner Jib Crane Telephoto
        this.baseCamPos.set(11.2, 10.6, 14.2);
        this.baseCamTarget.set(0, 1.2, 0);
        this.cameraLens = isPortrait ? '50MM_STD' : '85MM_TELE';
        break;
    }

    this.state.cameraLens = this.cameraLens;
    this.baseCamFov = this.getLensBaseFov(this.cameraLens, aspect);

    if (instant) {
      this.camera.position.copy(this.baseCamPos);
      this.controls.target.copy(this.baseCamTarget);
      this.currentCamFov = this.baseCamFov;
      this.camera.fov = this.baseCamFov;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.camTransitionTimer = 0;
    } else {
      // System 4: Smoothly Damped Broadcast Cut Transition
      this.camTransitionTimer = 0.55;
    }
    this.notifyState();
  }

  public setCameraLens(lens: CameraLensPreset) {
    this.cameraLens = lens;
    this.state.cameraLens = lens;
    this.baseCamFov = this.getLensBaseFov(lens, this.getViewportAspect());
    this.camTransitionTimer = Math.max(this.camTransitionTimer, 0.35);
    this.log(`Camera Lens switched to ${lens.replace('_', ' ')} (${Math.round(this.baseCamFov)}° FOV).`);
    this.notifyState();
  }

  public setCameraFilter(filter: CameraFilterMode) {
    this.cameraFilter = filter;
    this.state.cameraFilter = filter;
    this.renderer.domElement.style.filter = !this.postFX.isEnabled() ? getCssFilterForMode(filter) : 'none';
    this.log(`Camera Filter set to ${filter.replace('_', ' ')}.`);
    this.notifyState();
  }

  public setGraphicsQuality(quality: GraphicsQualityPreset) {
    this.graphicsQuality = quality;
    this.state.graphicsQuality = quality;
    const dpr = window.devicePixelRatio || 1;
    let targetRatio = 1;
    if (this.isSoftwareGl) {
      targetRatio = quality === 'LOW' ? 0.75 : 1;
    } else if (quality === 'LOW') {
      targetRatio = 0.75;
    } else if (quality === 'MEDIUM') {
      targetRatio = 1.0;
    } else if (quality === 'HIGH') {
      targetRatio = Math.min(dpr, 1.5);
    } else {
      targetRatio = Math.min(dpr, 2.0);
    }

    this.lastAppliedPixelRatio = targetRatio;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && quality !== 'LOW';
    this.postFX.setQualityPreset(quality);
    this.postFX.setEnabled(this.postFXEnabled && quality !== 'LOW');
    this.particleSystem.setEnabled(this.particlesEnabled && quality !== 'LOW');
    this.matrixPipeline.arenaHaloMat.uniforms.u_qualityScale.value =
      quality === 'LOW' ? 0.5 : quality === 'MEDIUM' ? 0.8 : quality === 'HIGH' ? 1.0 : 1.35;
    this.renderer.domElement.style.filter = !this.postFX.isEnabled() ? getCssFilterForMode(this.cameraFilter) : 'none';
    this.resize();
    this.log(`Graphics Quality preset: ${quality.replace('_', ' ')}.`);
    this.notifyState();
  }

  public setCeremonyPhase(phase: CeremonyPhase, durationSec = 16) {
    this.ceremonyPhase = phase;
    this.state.ceremonyPhase = phase;
    this.ceremonyTimer = phase === 'LIVE_MATCH' ? 0 : durationSec;
    this.state.ceremonyTimer = this.ceremonyTimer;

    if (phase === 'OPENING_CEREMONY') {
      this.state.screenMode = 'PLAYING';
      this.refereeCallText = 'OPENING CEREMONY SHOWCASE';
      this.crowdSystem.triggerCheer('N', 0.95, 'OPENING CEREMONY');
      this.log('Opening Ceremony active — cheerleaders & crowd synced to arena audio!');
    } else if (phase === 'INTERMISSION') {
      this.state.screenMode = 'PLAYING';
      this.refereeCallText = 'INTERMISSION HALFTIME SHOW';
      this.crowdSystem.triggerCheer('N', 0.88, 'INTERMISSION DANCE');
      this.log('Intermission Show active — floor crew & cheerleaders on stadium deck!');
    } else {
      this.refereeCallText = 'PLAY READY';
      this.log('Live Match Play resumed.');
    }
    this.notifyState();
  }

  public setWeather(weather: EnvironmentTheme) {
    this.state.weather = weather;
    const bgHex =
      weather === 'SUNNY'
        ? 0x2563eb
        : weather === 'SUNSET'
        ? 0x16072b
        : weather === 'BEACH'
        ? 0x0ea5e9
        : weather === 'CYBER'
        ? 0x050916
        : 0x080512;
    this.scene.background = new THREE.Color(bgHex);
    this.palmTreesGroup.visible = weather === 'BEACH';
    this.stadiumGroup.visible = weather !== 'BEACH';
    // System 2: Calibrated Broadcast Contrast Lighting (crisp shadow separation without flat haze)
    this.sunLight.intensity = (weather === 'SUNNY' || weather === 'BEACH' ? 2.45 : 2.2) * this.state.lightingIntensity;
    this.ambientLight.intensity = (weather === 'SUNNY' || weather === 'BEACH' ? 0.85 : 0.68) * this.state.lightingIntensity;
    this.applyHorizonFog();
    this.notifyState();
  }

  public setCourtSurface(surface: CourtSurface) {
    this.state.courtSurface = surface;
    this.baseCourtRoughness = this.courtFloorSystem.applySurface(surface, this.matchEvolution.wetnessLevel);
    this.notifyState();
  }

  // =========================================================================
  // PS6 MENUS, SAVES, MATCH EVOLUTION, ROSTER CUSTOMIZATION & REPLAY CONTROLS
  // =========================================================================
  private triggerPostFXImpactFlash(worldPos: THREE.Vector3, strength: number) {
    this.postFXImpactFlash = Math.max(this.postFXImpactFlash, strength);
    this._projVec.copy(worldPos).project(this.camera);
    this.postFXImpactUV.set(
      THREE.MathUtils.clamp(this._projVec.x * 0.5 + 0.5, 0.05, 0.95),
      THREE.MathUtils.clamp(this._projVec.y * 0.5 + 0.5, 0.05, 0.95)
    );
  }

  private updateMatchEvolution(dt: number) {
    const evo = this.matchEvolution;
    if (this.state.screenMode === 'PLAYING' && this.state.matchState === 'PLAY') {
      evo.elapsedSeconds += dt;
    }

    const avgSweat =
      this.units.reduce((acc, u) => acc + u.sweatLevel, 0) / Math.max(1, this.units.length);
    evo.avgSweatLevel = Number(avgSweat.toFixed(2));

    const totalPts = this.state.scoreA + this.state.scoreB + (this.state.currentSet - 1) * 32;
    const autoIntensity = THREE.MathUtils.clamp(
      0.12 + totalPts * 0.011 + evo.elapsedSeconds * 0.0025 + this.state.rallyCount * 0.015,
      0.12,
      1.0
    );

    if (evo.mode === 'AUTO_EVOLVE') {
      evo.intensity = Number(THREE.MathUtils.lerp(evo.intensity, autoIntensity, Math.min(1, dt * 0.8)).toFixed(3));
      if (evo.intensity < 0.32) {
        evo.stage = 'OPENING_BREEZE';
        evo.dustLevel = 0.24;
        evo.sandLevel = this.state.courtSurface === 'SAND' ? 0.3 : 0.08;
        evo.rainLevel = 0.0;
      } else if (evo.intensity < 0.58) {
        evo.stage = 'RISING_HEAT';
        evo.dustLevel = 0.52;
        evo.sandLevel = this.state.courtSurface === 'SAND' ? 0.55 : 0.2;
        evo.rainLevel = 0.05;
      } else if (evo.intensity < 0.8) {
        evo.stage = 'DUST_SQUALL';
        evo.dustLevel = 0.82;
        evo.sandLevel = this.state.courtSurface === 'SAND' ? 0.88 : 0.48;
        evo.rainLevel = 0.22;
      } else {
        evo.stage = 'MONSOON_CLIMAX';
        evo.dustLevel = 0.45;
        evo.sandLevel = this.state.courtSurface === 'SAND' ? 0.65 : 0.32;
        evo.rainLevel = 0.92;
      }
    } else if (evo.mode === 'CLEAR') {
      evo.stage = 'OPENING_BREEZE';
      evo.intensity = 0.1;
      evo.dustLevel = 0.08;
      evo.sandLevel = 0.02;
      evo.rainLevel = 0;
    } else if (evo.mode === 'DUST_STORM') {
      evo.stage = 'DUST_SQUALL';
      evo.intensity = 0.72;
      evo.dustLevel = 0.95;
      evo.sandLevel = 0.38;
      evo.rainLevel = 0;
    } else if (evo.mode === 'SAND_SQUALL') {
      evo.stage = 'DUST_SQUALL';
      evo.intensity = 0.78;
      evo.dustLevel = 0.55;
      evo.sandLevel = 0.98;
      evo.rainLevel = 0;
    } else if (evo.mode === 'RAIN_STORM') {
      evo.stage = 'MONSOON_CLIMAX';
      evo.intensity = 0.95;
      evo.dustLevel = 0.25;
      evo.sandLevel = 0.15;
      evo.rainLevel = 0.98;
    }

    // Court wetness increases with rain and dries gradually when clear
    const targetWet = THREE.MathUtils.clamp(evo.rainLevel * 0.95, 0, 1);
    evo.wetnessLevel = THREE.MathUtils.lerp(evo.wetnessLevel, targetWet, Math.min(1, dt * 0.35));
    this.courtMat.roughness = THREE.MathUtils.lerp(this.baseCourtRoughness, 0.11, evo.wetnessLevel);
    this.courtMat.metalness = THREE.MathUtils.lerp(0.04, 0.26, evo.wetnessLevel);

    const t = performance.now() * 0.0004;
    const gust = 0.45 + evo.intensity * 2.1;
    evo.windX = Math.sin(t * 1.1) * gust;
    evo.windZ = Math.cos(t * 0.75) * gust * 0.55;
    if (this.state.screenMode === 'PLAYING') {
      this.syntheticStory.onWeatherEvolution(evo.stage, this.state.weather);
    }
  }

  public startStoryChapter(chapterId: string) {
    const ch = getStoryChapterById(chapterId);
    if (!ch) return;
    const started = this.dspEngine.resumeOrAutoStartMusic(this.introState.selectedPreset);
    this.introState.selectedPreset = started.preset;
    this.introState.musicSelected = true;
    this.syntheticStory.resetForNewMatch();
    this.syntheticStory.onMatchKickoff(this.dspEngine.mp3TrackName);
    this.replaySystem.stopReplay();
    this.activeStoryChapter = ch;
    this.pendingMidCutscene = false;
    this.storyState = {
      activeChapterId: ch.id,
      chapterNumber: ch.chapterNumber,
      chapterTitle: ch.title,
      opponentClub: ch.opponentClub,
      objectiveSummary: ch.objectiveSummary,
      targetScore: ch.targetScore,
      cutscenePhase: 'PRE',
      dialogueIndex: 0,
      totalLines: ch.preMatchCutscene.length,
      currentLine: ch.preMatchCutscene[0] || null,
      midMatchTriggered: false,
    };

    this.state.matchFormat = 'STORY_MATCH';
    this.state.controlMode = 'PLAYER';
    this.state.scoreA = 0;
    this.state.scoreB = 0;
    this.state.setsA = 0;
    this.state.setsB = 0;
    this.state.currentSet = 1;
    this.state.momentumA = 30;
    this.state.momentumB = 25;
    this.bestSpikeKmhThisMatch = 0;
    this.matchEvolution.elapsedSeconds = 0;
    this.matchEvolution.intensity = 0.14;
    this.matchEvolution.wetnessLevel = 0;
    this.reactiveState.comboStreak = 0;
    this.reactiveState.lastTimingGrade = 'NONE';
    this.units.forEach((u) => {
      u.sweatLevel = 0.05;
      u.stamina = 100;
      u.defeatSlump = false;
      u.reactiveCharge = 0;
    });

    this.setDifficulty(ch.difficulty);
    this.setWeather(ch.weather);
    this.setCourtSurface(ch.courtSurface);
    this.setEnvDynamicsMode(ch.envMode);
    this.resetPoint('A');
    this.beginStoryCutscene('PRE', ch.preMatchCutscene);
    this.log(`STORY MODE · Chapter ${ch.chapterNumber}: ${ch.title}`);
    this.notifyState();
  }

  private beginStoryCutscene(phase: 'PRE' | 'MID' | 'POST_WIN' | 'POST_LOSS', lines: StoryDialogueLine[]) {
    if (!lines || lines.length === 0) {
      if (phase === 'POST_WIN' || phase === 'POST_LOSS') {
        this.state.screenMode = 'MATCH_OVER';
      } else {
        this.state.screenMode = 'PLAYING';
      }
      this.notifyState();
      return;
    }
    this.storyState.cutscenePhase = phase;
    this.storyState.dialogueIndex = 0;
    this.storyState.totalLines = lines.length;
    this.storyState.currentLine = lines[0];
    this.applyCutsceneLineActorPose(lines[0]);
    this.state.screenMode = 'STORY_CUTSCENE';
    this.notifyState();
  }

  private applyCutsceneLineActorPose(line: StoryDialogueLine) {
    let focusUnit: Unit | null = null;
    if (line.focusUnitTeam && line.focusUnitJersey) {
      const target = this.units.find(
        (u) => u.team === line.focusUnitTeam && u.jerseyNumber === line.focusUnitJersey
      );
      if (target) {
        focusUnit = target;
        if (line.targetAnim) {
          target.animState = line.targetAnim;
          target.animTimer = 0;
          if (line.targetAnim === 'CELEBRATION') {
            target.celebrationStyle = 'FIST_PUMP_ROAR';
          }
        }
      }
    } else if (line.focusUnitTeam) {
      focusUnit = this.units.find((u) => u.team === line.focusUnitTeam) || null;
    }

    this.cutsceneShotTimer = 0;
    if (this.aiCameraDirector.isEnabled()) {
      this.aiCameraDirector.programCutsceneShot({
        shotHint: line.cameraShot || 'STADIUM_ESTABLISH',
        emotion: line.emotion,
        focusUnit,
        allUnits: this.units,
        intensity: this.matchEvolution.intensity,
      });
    }
  }

  public advanceStoryCutscene() {
    const ch = this.activeStoryChapter;
    if (!ch || !this.storyState.cutscenePhase) {
      this.state.screenMode = 'PLAYING';
      this.notifyState();
      return;
    }
    const list =
      this.storyState.cutscenePhase === 'PRE'
        ? ch.preMatchCutscene
        : this.storyState.cutscenePhase === 'MID'
        ? ch.midMatchCutscene
        : this.storyState.cutscenePhase === 'POST_WIN'
        ? ch.postWinCutscene
        : ch.postLossCutscene;

    const nextIdx = this.storyState.dialogueIndex + 1;
    if (nextIdx < list.length) {
      this.storyState.dialogueIndex = nextIdx;
      this.storyState.currentLine = list[nextIdx];
      this.applyCutsceneLineActorPose(list[nextIdx]);
      this.notifyState();
      return;
    }

    this.finishCurrentCutscenePhase();
  }

  public skipStoryCutscene() {
    this.finishCurrentCutscenePhase();
  }

  private finishCurrentCutscenePhase() {
    const phase = this.storyState.cutscenePhase;
    this.storyState.cutscenePhase = null;
    this.storyState.currentLine = null;
    if (phase === 'POST_WIN' || phase === 'POST_LOSS') {
      this.state.screenMode = 'MATCH_OVER';
    } else {
      this.state.screenMode = 'PLAYING';
      this.setCameraAngle(this.state.cameraAngle, false);
      if (phase === 'MID') {
        this.storyState.midMatchTriggered = true;
        this.resetPoint(this.state.servingTeam);
      }
    }
    this.notifyState();
  }

  public getStoryProgress() {
    return loadStoryProgress();
  }

  private getIntroHeroUnit(): Unit {
    return (
      this.units.find((u) => u.team === 'A' && u.jerseyNumber === 14) ||
      this.units.find((u) => u.team === 'A')!
    );
  }

  public replayIntroCutscene() {
    this.state.screenMode = 'MAIN_MENU';
    this.introState.phase = 'ORBIT_STADIUM';
    this.introState.phaseElapsed = 0;
    this.introLookStoryTriggered = false;
    this.introState.subBannerText = 'COAL HARBOUR ARENA · VANCOUVER, BC';
    this.notifyState();
  }

  public cutToBillboardFocus() {
    this.state.screenMode = 'MAIN_MENU';
    this.introState.phase = 'BILLBOARD_FULLSCREEN';
    this.introState.phaseElapsed = 0;
    this.introState.subBannerText = 'SELECT YOUR MUSIC · PRESS PLAY TO LAUNCH';
    this.notifyState();
  }

  public selectIntroMusicPreset(preset: IntroMusicPresetId) {
    if (preset === 'SILENT') {
      this.dspEngine.stopAllMusic();
      this.introState.musicSelected = false;
      this.introState.selectedPreset = 'SILENT';
      this.log('INTRO EQ: Court ambience mode selected.');
    } else {
      this.dspEngine.playPresetTrack(preset);
      this.introState.musicSelected = true;
      this.introState.selectedPreset = preset;
      this.log(`INTRO EQ: Playing ${preset.replace(/_/g, ' ')} on AIM Vancouver Billboard.`);
    }
    this.notifyState();
  }

  public launchFromIntroWithBallSwoosh(format: MatchFormat) {
    this.introState.pendingFormat = format;
    const started = this.dspEngine.resumeOrAutoStartMusic(this.introState.selectedPreset);
    this.introState.selectedPreset = started.preset;
    this.introState.musicSelected = true;
    this.syntheticStory.resetForNewMatch();
    this.syntheticStory.onMatchKickoff(this.dspEngine.mp3TrackName);

    this.state.screenMode = 'MAIN_MENU';
    this.introState.phase = 'BALL_SWOOSH_TO_FEET';
    this.introState.phaseElapsed = 0;
    this.introState.subBannerText = 'MATCH INCOMING · VANCOUVER KICKOFF';
    this.introHeroBounceTriggered = false;

    const hero = this.getIntroHeroUnit();
    this.units.forEach((u) => {
      u.isJumping = false;
      u.yVel = 0;
      u.isDowned = false;
      u.fallRecoveryTimer = 0;
      u.defeatSlump = false;
      u.animState = 'READY_STANCE';
      u.animTimer = 0;
      const base = this.getZoneBasePos(u.team, u.rotationZone);
      u.mesh.position.copy(base);
      u.mesh.lookAt(base.x, 0, -22.5);
    });
    hero.mesh.position.set(0, 0, 4.35);
    hero.mesh.lookAt(0, 0, -22.5);

    this.ball.visible = true;
    this.ball.position.set(0, 10.2, -21.2);
    this.ballPosPrev.copy(this.ball.position);
    this.playIntroBallSwooshAudio();
    this.notifyState();
  }

  private playIntroBallSwooshAudio() {
    try {
      const audio = this.dspEngine.getDestination();
      if (!audio) return;
      const { ctx, destination } = audio;
      const now = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(340, now);
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
      osc.start(now);
      osc.stop(now + 0.96);
    } catch {
      // Non-blocking
    }
  }

  public setScreenMode(mode: GameScreenMode) {
    const prev = this.state.screenMode;
    this.state.screenMode = mode;
    if (mode !== 'MAIN_MENU') {
      this.ball.visible = true;
    } else if (prev === 'PLAYING' || prev === 'PAUSED' || prev === 'MATCH_OVER') {
      this.introState.phase = 'ORBIT_STADIUM';
      this.introState.phaseElapsed = 0;
      this.introState.subBannerText = 'COAL HARBOUR ARENA · VANCOUVER, BC';
    } else if (this.introState.phase === 'BALL_SWOOSH_TO_FEET') {
      this.introState.phase = 'BILLBOARD_FULLSCREEN';
      this.introState.phaseElapsed = 0;
    }
    if (mode !== 'PLAYING' && this.replaySystem.isActive() && mode !== 'REPLAY_VAULT') {
      this.replaySystem.stopReplay();
    }
    this.notifyState();
  }

  public startNewMatch(format: MatchFormat, controlMode?: ControlMode) {
    this.ball.visible = true;
    const started = this.dspEngine.resumeOrAutoStartMusic(this.introState.selectedPreset);
    this.introState.selectedPreset = started.preset;
    this.introState.musicSelected = true;
    if (format !== 'STORY_MATCH') {
      this.activeStoryChapter = null;
      this.storyState.activeChapterId = null;
      this.storyState.cutscenePhase = null;
      this.storyState.currentLine = null;
    }
    this.replaySystem.stopReplay();
    this.state.matchFormat = format;
    this.state.controlMode = controlMode ?? (format === 'AI_SHOWCASE' ? 'AUTO' : 'PLAYER');
    this.state.scoreA = 0;
    this.state.scoreB = 0;
    this.state.setsA = 0;
    this.state.setsB = 0;
    this.state.currentSet = 1;
    this.state.momentumA = 25;
    this.state.momentumB = 25;
    this.bestSpikeKmhThisMatch = 0;
    this.matchEvolution.elapsedSeconds = 0;
    this.matchEvolution.intensity = 0.14;
    this.matchEvolution.wetnessLevel = 0;
    this.reactiveState.comboStreak = 0;
    this.reactiveState.lastTimingGrade = 'NONE';
    this.units.forEach((u) => {
      u.sweatLevel = 0.05;
      u.stamina = 100;
      u.defeatSlump = false;
      u.reactiveCharge = 0;
    });

    this.state.screenMode = 'PLAYING';
    this.setCameraAngle(this.state.cameraAngle);
    this.resetPoint('A');
    if (format === 'PRACTICE') {
      this.log('Practice Rally Mode active — unlimited points, full replay capture.');
    } else if (format === 'AI_SHOWCASE') {
      this.log('AI Pro Showcase Mode — autonomous 6v6 tactical exhibition.');
    } else {
      this.log(`Started ${format === 'QUICK_SET' ? 'Quick 1-Set' : 'Championship Best-of-3'} match!`);
    }
    this.notifyState();
  }

  public togglePause() {
    if (this.state.screenMode === 'PLAYING') {
      this.state.screenMode = 'PAUSED';
    } else if (this.state.screenMode === 'PAUSED') {
      this.state.screenMode = 'PLAYING';
    }
    this.notifyState();
  }

  public createMatchSave(slotName: string): SavedMatchSlot {
    const teamAUnits = this.units.filter((u) => u.team === 'A').map((u) => u.rotationZone);
    const teamBUnits = this.units.filter((u) => u.team === 'B').map((u) => u.rotationZone);
    const playerSweat: Record<number, number> = {};
    this.units.forEach((u) => {
      playerSweat[u.id] = Number(u.sweatLevel.toFixed(2));
    });

    const slot: SavedMatchSlot = {
      id: `save-${Date.now()}`,
      name: slotName.trim() || `Match Set ${this.state.currentSet} (${this.state.scoreA}-${this.state.scoreB})`,
      savedAt: new Date().toLocaleString(),
      matchFormat: this.state.matchFormat,
      scoreA: this.state.scoreA,
      scoreB: this.state.scoreB,
      setsA: this.state.setsA,
      setsB: this.state.setsB,
      currentSet: this.state.currentSet,
      servingTeam: this.state.servingTeam,
      weather: this.state.weather,
      courtSurface: this.state.courtSurface,
      difficulty: this.state.difficulty,
      tacticalPlayA: this.state.tacticalPlayA,
      defensiveStrategyA: this.state.defensiveStrategyA,
      envDynamicsMode: this.matchEvolution.mode,
      evolutionIntensity: this.matchEvolution.intensity,
      elapsedSeconds: Math.round(this.matchEvolution.elapsedSeconds),
      bestSpikeKmh: this.bestSpikeKmhThisMatch,
      rotationA: teamAUnits,
      rotationB: teamBUnits,
      playerSweat,
      topSpikes: this.replaySystem.getClips().slice(0, 4),
    };
    saveMatchSlot(slot);
    this.log(`Saved match slot: "${slot.name}"`);
    this.notifyState();
    return slot;
  }

  public loadMatchSave(slot: SavedMatchSlot) {
    this.replaySystem.stopReplay();
    this.state.matchFormat = slot.matchFormat;
    this.state.scoreA = slot.scoreA;
    this.state.scoreB = slot.scoreB;
    this.state.setsA = slot.setsA;
    this.state.setsB = slot.setsB;
    this.state.currentSet = slot.currentSet;
    this.state.difficulty = slot.difficulty;
    this.state.tacticalPlayA = slot.tacticalPlayA;
    this.state.defensiveStrategyA = slot.defensiveStrategyA;
    this.matchEvolution.mode = slot.envDynamicsMode;
    this.matchEvolution.intensity = slot.evolutionIntensity;
    this.matchEvolution.elapsedSeconds = slot.elapsedSeconds;
    this.bestSpikeKmhThisMatch = slot.bestSpikeKmh;

    const teamA = this.units.filter((u) => u.team === 'A');
    const teamB = this.units.filter((u) => u.team === 'B');
    teamA.forEach((u, idx) => {
      if (slot.rotationA[idx]) {
        u.rotationZone = slot.rotationA[idx];
        u.defensiveZone = ZONE_MAP[u.rotationZone];
      }
      u.sweatLevel = slot.playerSweat[u.id] ?? 0.1;
    });
    teamB.forEach((u, idx) => {
      if (slot.rotationB[idx]) {
        u.rotationZone = slot.rotationB[idx];
        u.defensiveZone = ZONE_MAP[u.rotationZone];
      }
      u.sweatLevel = slot.playerSweat[u.id] ?? 0.1;
    });

    if (slot.topSpikes?.length) {
      this.replaySystem.loadClips(slot.topSpikes);
    }

    this.setWeather(slot.weather);
    this.setCourtSurface(slot.courtSurface);
    this.state.screenMode = 'PLAYING';
    this.setCameraAngle(this.state.cameraAngle);
    this.resetPoint(slot.servingTeam);
    this.log(`Loaded save "${slot.name}" (${slot.scoreA}-${slot.scoreB}, Set ${slot.currentSet}).`);
    this.notifyState();
  }

  public updateUnitProfile(
    unitId: number,
    patch: {
      name?: string;
      stats?: Partial<UnitStats>;
      accessory?: PlayerAccessory;
      hairStyle?: PlayerHairStyle;
      archetype?: string;
      bio?: string;
    }
  ) {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit) return;

    if (patch.name) unit.name = patch.name.toUpperCase().slice(0, 12);
    if (patch.stats) {
      unit.stats = { ...unit.stats, ...patch.stats };
    }
    if (patch.accessory) unit.profile.accessory = patch.accessory;
    if (patch.hairStyle) unit.profile.hairStyle = patch.hairStyle;
    if (patch.archetype) unit.profile.archetype = patch.archetype;
    if (patch.bio) unit.profile.bio = patch.bio;

    saveRosterOverride(unitId, {
      name: unit.name,
      stats: unit.stats,
      profile: unit.profile,
    });

    // Rebuild 3D mesh cleanly in-place so gear/hair/jersey updates immediately
    const oldPos = unit.mesh.position.clone();
    const oldRot = unit.mesh.rotation.y;
    this.scene.remove(unit.mesh);
    const newParts = this.buildPlayerMesh(unit.team, unit.name, unit.jerseyNumber, unit.isLibero, unit.profile);
    newParts.group.position.copy(oldPos);
    newParts.group.rotation.y = oldRot;
    this.scene.add(newParts.group);
    unit.parts = newParts;
    unit.mesh = newParts.group;
    this.movementOrchestrator.refreshUnitPattern(unit);
    this.notifyState();
  }

  public injectCustomAthletePrompt(unitId: number, prompt: string): string {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || !prompt.trim()) return 'No unit selected';
    const compiled = compileAthleteFromPrompt(prompt, unit.stats, unit.profile);
    this.updateUnitProfile(unitId, {
      stats: compiled.stats,
      accessory: compiled.profile.accessory,
      hairStyle: compiled.profile.hairStyle,
      archetype: compiled.profile.archetype,
      bio: compiled.profile.bio,
    });
    this.log(`AI ATHLETE COMPILER: ${unit.name} -> ${compiled.summary}`);
    return compiled.summary;
  }

  public setEnvDynamicsMode(mode: EnvDynamicsMode) {
    this.matchEvolution.mode = mode;
    this.notifyState();
  }

  public setPostFXEnabled(enabled: boolean) {
    this.postFXEnabled = enabled;
    this.postFX.setEnabled(enabled && this.graphicsQuality !== 'LOW');
    this.renderer.domElement.style.filter = !this.postFX.isEnabled() ? getCssFilterForMode(this.cameraFilter) : 'none';
    this.notifyState();
  }

  public setParticlesEnabled(enabled: boolean) {
    this.particlesEnabled = enabled;
    this.particleSystem.setEnabled(enabled);
    this.notifyState();
  }

  // Slow-Motion Multi-Angle Spike Showcase Controls
  public getStoredSpikeClips(): SpikeReplayClip[] {
    return this.replaySystem.getClips();
  }

  public startSpikeShowcase(clipIndex = 0) {
    const started =
      clipIndex > 0
        ? this.replaySystem.playClipAt(clipIndex, true)
        : this.replaySystem.startContinuousShowcase();
    if (started) {
      if (this.state.screenMode === 'REPLAY_VAULT' || this.state.screenMode === 'MATCH_OVER' || this.state.screenMode === 'MAIN_MENU') {
        this.state.screenMode = 'PLAYING';
      }
      this.notifyState();
    }
  }

  public stopSpikeReplay() {
    this.replaySystem.stopReplay();
    this.setCameraAngle(this.state.cameraAngle);
    this.notifyState();
  }

  public cycleReplayAngle(angle?: ReplayAngleMode) {
    if (angle) this.replaySystem.setAngle(angle);
    else this.replaySystem.nextAngle();
    this.notifyState();
  }

  public nextReplayClip() {
    this.replaySystem.nextClip();
    this.notifyState();
  }

  public setReplaySpeed(speed: number) {
    this.replaySystem.setPlaybackSpeed(speed);
    this.notifyState();
  }

  public setAutoShowcaseEnabled(enabled: boolean) {
    this.replaySystem.setAutoShowcase(enabled);
    this.notifyState();
  }

  private applyHorizonFog() {
    const d = THREE.MathUtils.clamp(this.state.fogDensity, 0.001, 0.02);
    const farDist = THREE.MathUtils.clamp(420 / (1 + d * 48), 110, 390);
    const bgColor = (this.scene.background as THREE.Color)?.getHex() ?? 0x060b16;
    // Push linear fog start out to 76m so the active court, VIP suites & players stay milky-haze free
    this.scene.fog = new THREE.Fog(bgColor, 76, farDist);
  }

  public setFogDensity(density: number) {
    this.state.fogDensity = density;
    this.applyHorizonFog();
    this.notifyState();
  }

  public setLightingIntensity(intensity: number) {
    this.state.lightingIntensity = intensity;
    this.setWeather(this.state.weather);
  }

  public setGameSpeed(speed: number) {
    this.state.gameSpeed = speed;
    this.notifyState();
  }

  public setDifficulty(level: DifficultyLevel) {
    this.state.difficulty = level;
    this.notifyState();
  }

  public setTacticalPlay(team: 'A' | 'B', play: TacticalPlay) {
    if (team === 'A') this.state.tacticalPlayA = play;
    else this.state.tacticalPlayB = play;
    this.notifyState();
  }

  public setDefensiveStrategy(team: 'A' | 'B', strategy: DefensiveStrategy) {
    if (team === 'A') this.state.defensiveStrategyA = strategy;
    else this.state.defensiveStrategyB = strategy;
    this.notifyState();
  }

  public toggleHuntMode() {
    this.huntModeActive = !this.huntModeActive;
    const mod = this.swarmModules.find((m) => m.id === 'odonata-hunt-tracker');
    if (mod) mod.isolated = this.huntModeActive;
    this.notifyState();
  }

  public toggleDSPAudio() {
    this.dspEngine.toggleHarmonicDrone();
    this.notifyState();
  }

  public async loadMp3Track(file: File) {
    const res = await this.dspEngine.loadMp3File(file);
    this.introState.musicSelected = true;
    this.introState.selectedPreset = 'CUSTOM_MP3';
    this.log(`AUDIO EQ: Loaded "${res.trackName}" onto AIM V Arena Billboard.`);
    this.announceVoice(`Now playing ${res.trackName} on the AIM V billboard equalizer`, 'NORMAL');
    this.notifyState();
    return res;
  }

  public async toggleMp3Playback() {
    await this.dspEngine.toggleMp3Playback();
    this.notifyState();
  }

  public setMp3Volume(vol: number) {
    this.dspEngine.setMp3Volume(vol);
    this.notifyState();
  }

  public toggleIsolateModule(id: string) {
    this.swarmModules = this.swarmModules.map((m) =>
      m.id === id ? { ...m, isolated: !m.isolated } : m
    );
    this.notifyState();
  }

  public setVoiceAnnouncerEnabled(enabled: boolean) {
    this.state.voiceAnnouncerEnabled = enabled;
    this.notifyState();
  }

  public setVoiceAnnouncerVolume(vol: number) {
    this.state.voiceAnnouncerVolume = vol;
    this.notifyState();
  }

  public setSpriteMatrixVisible(visible: boolean) {
    this.movementOrchestrator.setSpritesVisible(visible);
    this.state.spriteMatrixVisible = visible;
    this.notifyState();
  }

  public getUnits(): Unit[] {
    return this.units;
  }

  // =========================================================================
  // AUDIO + VOICE + GEMINI BRAIN REAL-TIME JSON SYNC (ZERO HIGH-PITCH SOUNDS)
  // =========================================================================
  private playImpactAudio(type: 'BUMP' | 'SET' | 'SPIKE' | 'BLOCK' | 'FLOOR', speedKmh: number) {
    try {
      const audio = this.dspEngine.getDestination();
      if (!audio) return;
      const { ctx, destination } = audio;
      const now = ctx.currentTime;
      const vol = this.state.voiceAnnouncerVolume ?? 0.75;
      if (vol <= 0.02) return;

      // Warm lowpass filter guarantees zero harsh or high-pitch frequencies on any impact/drop
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      const cutoff = type === 'FLOOR' ? 290 : type === 'SPIKE' || type === 'BLOCK' ? 430 : 370;
      lowpass.frequency.setValueAtTime(cutoff, now);
      lowpass.Q.setValueAtTime(0.65, now);
      lowpass.connect(destination);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';

      const startHz = type === 'SPIKE' ? 98 : type === 'FLOOR' ? 62 : 82;
      const endHz = type === 'FLOOR' ? 28 : 34;
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.14);

      const pwr = THREE.MathUtils.clamp(speedKmh / 95, 0.28, 1.15);
      const peakGain = (type === 'FLOOR' ? 0.17 : 0.2) * pwr * vol;
      // 6ms soft attack ramp avoids any digital click
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.19);

      osc.connect(gain);
      gain.connect(lowpass);
      osc.start(now);
      osc.stop(now + 0.21);
    } catch {
      // Autoplay guard
    }
  }

  private blowRefereeWhistle() {
    try {
      const audio = this.dspEngine.getDestination();
      if (!audio) return;
      const { ctx, destination } = audio;
      const now = ctx.currentTime;
      const vol = this.state.voiceAnnouncerVolume ?? 0.75;
      if (vol <= 0.02) return;

      // Warm broadcast low-mid point chime + low-passed crowd swell (replaces shrill whistle)
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(360, now);
      lowpass.connect(destination);

      const o1 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(174.61, now);
      o1.frequency.linearRampToValueAtTime(220.0, now + 0.16);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.1 * vol, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
      o1.connect(g);
      g.connect(lowpass);
      o1.start(now);
      o1.stop(now + 0.3);

      this.crowdSystem?.playWarmCrowdSwell(ctx, destination, vol, this.crowdSystem.getMoodState().excitement);
    } catch {
      // Autoplay guard
    }
  }

  private announceVoice(text: string, priority: 'HIGH' | 'NORMAL' = 'NORMAL') {
    const clean = text.trim();
    if (clean) {
      this.state.liveCommentaryLine = clean.toUpperCase();
      const hist = this.state.commentaryHistory ? [...this.state.commentaryHistory] : [];
      if (hist[0] !== clean) {
        hist.unshift(clean);
        if (hist.length > 8) hist.pop();
        this.state.commentaryHistory = hist;
      }
    }

    if (this.state.voiceAnnouncerEnabled !== true) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (priority === 'NORMAL' && now - this.lastAnnouncedVoiceTime < 2200) return;
    this.lastAnnouncedVoiceTime = now;
    try {
      if (priority === 'HIGH') window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1.12;
      u.volume = this.state.voiceAnnouncerVolume ?? 0.75;
      window.speechSynthesis.speak(u);
    } catch {
      // SpeechSynthesis guard
    }
  }

  private updateGeminiBrainSync(dt: number) {
    this.geminiSyncTimer += dt;
    if (this.geminiSyncTimer >= 2.2 && !this.isGeminiSyncing) {
      this.geminiSyncTimer = 0;
      this.syncGeminiBrainState(false);
    }
  }

  public async syncGeminiBrainState(force = false) {
    if (this.isGeminiSyncing && !force) return;
    this.isGeminiSyncing = true;
    try {
      const unitsTelemetry = this.units.map((u) => ({
        id: u.id,
        team: u.team,
        role: u.role,
        jersey: u.jerseyNumber,
        x: Number(u.mesh.position.x.toFixed(2)),
        z: Number(u.mesh.position.z.toFixed(2)),
        distToBall: Number(u.mesh.position.distanceTo(this.ball.position).toFixed(2)),
        assignedPlayRole: u.assignedPlayRole,
        defensiveZone: u.defensiveZone,
        readiness: u.digitalSkin.interceptReadiness,
        reactionState: u.digitalSkin.reactionState,
      }));

      const res = await fetch('/api/gemini-brain/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ballSpeedKmh: this.state.ballSpeedKmh,
          matchState: this.state.matchState,
          rallyCount: this.state.rallyCount,
          scoreA: this.state.scoreA,
          scoreB: this.state.scoreB,
          currentSide: this.currentSide,
          lastShotType: this.state.lastShotType,
          lastJumpHeight: this.state.lastJumpHeight,
          teamFSMStateA: this.state.teamFSMStateA,
          teamFSMStateB: this.state.teamFSMStateB,
          tacticalPlayA: this.state.tacticalPlayA,
          tacticalPlayB: this.state.tacticalPlayB,
          defensiveStrategyA: this.state.defensiveStrategyA,
          defensiveStrategyB: this.state.defensiveStrategyB,
          interceptXZ: {
            x: Number(this.rawLandingSpot.x.toFixed(2)),
            z: Number(this.rawLandingSpot.z.toFixed(2)),
          },
          agiTurbulence: this.swarmWorker.workerTurbulence,
          fractalFoldN: this.swarmWorker.fractalFoldN,
          huntModeActive: this.huntModeActive,
          preyLockCount: this.huntModeActive ? 4 : 0,
          fps: this.fpsGovernor.currentFps,
          adaptiveQualityScale: this.fpsGovernor.adaptiveQualityScale,
          unitsTelemetry,
          netViolation: this.state.netViolation ? this.state.netViolation.type : null,
          eventTrigger: force,
        }),
      });

      if (res.ok) {
        const brain = await res.json();
        const applyOffsets = (arr: { id: number; xOffset: number; zOffset: number }[] | undefined) => {
          arr?.forEach((item) => {
            const unit = this.units.find((u) => u.id === item.id);
            if (unit) unit.tacticalOffset = { x: item.xOffset || 0, z: item.zOffset || 0 };
          });
        };
        applyOffsets(brain.playerPositioningMatrix?.teamA);
        applyOffsets(brain.playerPositioningMatrix?.teamB);

        const readinessSum = this.units.reduce((acc, u) => acc + u.digitalSkin.interceptReadiness, 0);
        const quote = brain.geminiVoiceCommentary?.spokenQuote || '';
        if (quote && quote !== this.lastAnnouncedGeminiQuote) {
          this.lastAnnouncedGeminiQuote = quote;
          this.state.liveCommentaryLine = `${quote.toUpperCase()} • ${brain.tactics?.recommendedSetterPlay?.toUpperCase() || ''}`;
        }

        this.state.geminiBrainStatus = {
          isSyncing: false,
          lastSyncTime: Date.now(),
          tacticName: brain.tactics?.recommendedSetterPlay || 'Balanced Transition',
          coachInstruction: brain.geminiVoiceCommentary?.coachingInsight || 'Perimeter coverage active',
          lastVoiceCommentary: quote,
          readinessAverage: Math.round(readinessSum / Math.max(1, this.units.length)),
          recommendedTargetZone: brain.tactics?.recommendedTargetZone || 4,
        };
      }
    } catch {
      // Non-blocking sync
    } finally {
      this.isGeminiSyncing = false;
    }
  }

  public async promptGeminiCoach(instruction: string) {
    try {
      const res = await fetch('/api/gemini-brain/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: instruction }),
      });
      if (res.ok) {
        const brain = await res.json();
        if (brain.tactics?.teamA_offense) this.state.tacticalPlayA = brain.tactics.teamA_offense;
        if (brain.tactics?.teamA_defense) this.state.defensiveStrategyA = brain.tactics.teamA_defense;
        const quote = brain.geminiVoiceCommentary?.spokenQuote || `Coach order: ${instruction}`;
        this.announceVoice(quote, 'HIGH');
        this.log(`GEMINI COACH: ${quote}`);
        await this.syncGeminiBrainState(true);
      }
    } catch {
      // Non-blocking
    }
  }

  // =========================================================================
  // HUD & JUMBOTRON + MAIN ANIMATION LOOP
  // =========================================================================
  private updateJumbotron(elapsedSec: number) {
    const ctx = this.jumbotronCtx;
    if (!ctx) return;

    const W = 1024;
    const H = 384;
    const eq = this.dspEngine.getAudioEQState();
    const isIntro = this.state.screenMode === 'MAIN_MENU';

    // Pulse speaker woofer rings around the billboard with bass amplitude
    const pulseScale = 1 + this.dspEngine.bassAmp * 0.24;
    for (let i = 0; i < this.introBillboardSpeakerRings.length; i++) {
      this.introBillboardSpeakerRings[i].scale.setScalar(pulseScale);
    }

    // GTA6 Vice Coast Midnight Stadium Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#070411');
    bgGrad.addColorStop(0.5, '#190b33');
    bgGrad.addColorStop(1, '#08182f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle scanline grid on screen surface
    ctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
    for (let sy = 16; sy < H; sy += 12) {
      ctx.fillRect(14, sy, W - 28, 2);
    }

    const frameGrad = ctx.createLinearGradient(0, 0, W, 0);
    frameGrad.addColorStop(0, '#00f0ff');
    frameGrad.addColorStop(0.5, '#ffb347');
    frameGrad.addColorStop(1, '#ff3d7f');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    if (isIntro) {
      // Hero AIM VANCOUVER Branding Header
      ctx.textAlign = 'center';
      ctx.font = '900 58px sans-serif';
      const titleGrad = ctx.createLinearGradient(220, 0, 804, 0);
      titleGrad.addColorStop(0, '#00f0ff');
      titleGrad.addColorStop(0.48, '#ffffff');
      titleGrad.addColorStop(1, '#ff3d7f');
      ctx.fillStyle = titleGrad;
      ctx.fillText('AIM VANCOUVER', W / 2, 68);

      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('PS6 PRO VOLLEYBALL • STADIUM MUSIC EQUALIZER', W / 2, 96);
    } else {
      // Live Match Scoreboard Header
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`CYAN ${this.state.scoreA}`, 42, 66);

      ctx.fillStyle = '#ff3d7f';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.state.scoreB} VAN`, W - 42, 66);

      ctx.fillStyle = '#ffb347';
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(`AIM VANCOUVER • ${this.state.ballSpeedKmh} KM/H`, W / 2, 64);
    }

    // 32-Band Real-Time MP3 + Stadium Synth Spectrum Equalizer
    const bins = this.dspEngine.getSpectrumBins(32);
    const hasAudio = this.dspEngine.mp3Playing || this.dspEngine.isDroneRunning;
    const yBottom = isIntro ? 302 : 298;
    const maxH = isIntro ? 182 : 172;
    const barW = 20;
    const gap = 8.8;
    const startX = (W - (32 * barW + 31 * gap)) / 2;

    for (let i = 0; i < 32; i++) {
      const idleFloor = hasAudio
        ? 0.05
        : 0.1 + 0.08 * Math.sin(elapsedSec * 3.6 + i * 0.42) + 0.04 * Math.cos(elapsedSec * 2.1 - i * 0.2);
      const level = Math.max(idleFloor, bins[i]);
      if (level > this.eqPeakHold[i]) {
        this.eqPeakHold[i] = level;
      } else {
        this.eqPeakHold[i] = Math.max(level, this.eqPeakHold[i] - 0.014);
      }

      const x = startX + i * (barW + gap);
      const bh = Math.min(maxH, level * maxH);

      const barGrad = ctx.createLinearGradient(0, yBottom - maxH, 0, yBottom);
      barGrad.addColorStop(0, '#ff3d7f');
      barGrad.addColorStop(0.55, '#ffb347');
      barGrad.addColorStop(1, '#00f0ff');
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, yBottom - bh, barW, bh);

      // Subtle floor reflection bars
      ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
      ctx.fillRect(x, yBottom + 4, barW, Math.round(bh * 0.14));

      // Crisp Peak Cap
      const peakY = yBottom - Math.min(maxH, this.eqPeakHold[i] * maxH) - 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, peakY, barW, 4);
    }

    // Track Title & Interactive Music Callout Strip
    ctx.textAlign = 'center';
    const trackBanner = eq.trackName
      ? `${eq.isPlaying ? '▶ PLAYING' : '❚❚ PAUSED'}  •  ${eq.trackName.toUpperCase()}  •  BASS ${Math.round(eq.bassLevel * 100)}%`
      : isIntro
      ? 'SELECT YOUR MUSIC TRACK BELOW  •  PRESS PLAY TO LAUNCH BALL TO COURT'
      : `AIM VANCOUVER BCCC • COAL HARBOUR ARENA • ${this.state.lastShotType}`;
    ctx.fillStyle = eq.trackName ? '#00f0ff' : '#e2e8f0';
    ctx.font = 'bold 21px monospace';
    ctx.fillText(trackBanner.slice(0, 62), W / 2, 348);

    if (eq.trackName && eq.duration > 0) {
      const pct = Math.min(1, eq.currentTime / eq.duration);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(56, 362, W - 112, 6);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(56, 362, Math.round((W - 112) * pct), 6);
    }

    this.jumbotronTex.needsUpdate = true;
  }

  private triggerSkillBanner(unit: Unit, skillName: string) {
    this.state.activeSkillNotification = {
      skillName,
      unitName: `${unit.team === 'A' ? 'Cyan' : 'Orange'} #${unit.jerseyNumber}`,
      description: 'Tactical skill activated',
      team: unit.team,
      time: Date.now(),
    };
    this.bannerClearTimer = 1.65;
  }

  private refreshSnapshot() {
    const readinessAvg = Math.round(
      this.units.reduce((acc, u) => acc + u.digitalSkin.interceptReadiness, 0) /
        Math.max(1, this.units.length)
    );
    if (!this.state.geminiBrainStatus) {
      this.state.geminiBrainStatus = {
        isSyncing: false,
        lastSyncTime: Date.now(),
        tacticName: 'Balanced Transition',
        coachInstruction: 'Maintain non-overlapping zonal coverage.',
        lastVoiceCommentary: 'Athletes ready on the court.',
        readinessAverage: readinessAvg,
        recommendedTargetZone: 4,
      };
    } else {
      this.state.geminiBrainStatus.readinessAverage = readinessAvg;
    }

    this.state.agiSwarm = {
      fps: this.fpsGovernor.currentFps,
      adaptiveQualityScale: Number(this.fpsGovernor.adaptiveQualityScale.toFixed(2)),
      throttled: this.fpsGovernor.adaptiveQualityScale < 0.8,
      workerTurbulence: Number(this.swarmWorker.workerTurbulence.toFixed(3)),
      fractalFoldN: Number(this.swarmWorker.fractalFoldN.toFixed(3)),
      preyLockCount: this.huntModeActive ? 4 : 0,
      huntModeActive: this.huntModeActive,
      dspAudioEnabled: this.dspEngine.isDroneRunning,
      bassAmp: Number(this.dspEngine.bassAmp.toFixed(3)),
      trebleAmp: Number(this.dspEngine.trebleAmp.toFixed(3)),
      isolatedModules: this.swarmModules.map((m) => ({
        ...m,
        status: m.isolated ? 'ISOLATED' : this.fpsGovernor.adaptiveQualityScale < 0.8 ? 'THROTTLED' : 'ACTIVE',
      })),
    };
    this.state.organicBlock = { ...this.organicBlock };
    this.state.spikeCamEnabled = this.spikeCamEnabled;
    this.state.spikeCamActive = this.spikeCamActive;
    this.state.audioEQ = this.dspEngine.getAudioEQState();
    this.state.spatialNotifications = this.spatialMatrix.getRecentNotifications();

    const spatial =
      this.lastSpatialAssessment ||
      this.spatialMatrix.evaluateGrid(
        this.units,
        this.currentSide,
        this.currentSide === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB,
        this.currentSide === 'A' ? this.state.defensiveStrategyB : this.state.defensiveStrategyA,
        this.ball.position,
        this.rawLandingSpot
      );
    this.state.selfPropagatingEnergy = spatial.selfPropagatingEnergy;
    this.state.matchEvolution = { ...this.matchEvolution };
    this.state.replayState = this.replaySystem.getPlaybackState();
    this.state.savedSpikesCount = this.replaySystem.getClips().length;
    this.state.postFXEnabled = this.postFXEnabled;
    this.state.particlesEnabled = this.particlesEnabled;
    this.state.crowdMood = this.crowdSystem.getMoodState();
    this.state.spriteMatrixSlots = [...this.movementOrchestrator.getMatrixSnapshot(this.units)];
    this.state.spriteMatrixVisible = this.movementOrchestrator.isSpritesVisible();
    const orch = this.movementOrchestrator.getOrchestratorSnapshot(this.units);
    this.state.orchestrator = { ...orch, records: [...orch.records] };
    this.state.screenSensor = { ...this.screenSensorState };
    this.state.cameraLens = this.cameraLens;
    this.state.cameraFilter = this.cameraFilter;
    this.state.graphicsQuality = this.graphicsQuality;
    this.state.ballPhase = this.ballPhase;
    this.state.ceremonyPhase = this.ceremonyPhase;
    this.state.ceremonyTimer = Number(this.ceremonyTimer.toFixed(1));
    this.state.refereeCallText = this.refereeCallText;
    this.state.reactiveControl = { ...this.reactiveState };
    this.state.manualUnitLocked = this.manualUnitLocked;
    this.state.storyState = { ...this.storyState };
    this.state.rallyChainStage = this.rallyChainStage;
    this.state.comicStrike = { ...this.comicStrike };
    this.state.aiDirector = { ...this.aiCameraDirector.getState() };
    this.state.introCutscene = { ...this.introState };
    this.state.syntheticStoryline = this.syntheticStory.getState();
    this.state.hyperAssessment = this.telemetryRecorder.evaluateHyperAssessment(
      this.units,
      this.ball.position,
      this.fpsGovernor.currentFps,
      this.bioRegister,
      spatial,
      this.lastTrajectoryConfidence,
      this.sideTouches,
      Boolean(this.state.netViolation)
    );
  }

  private notifyState() {
    this.refreshSnapshot();
    this.onStateUpdate({ ...this.state, actionLog: [...this.state.actionLog] });
  }

  private log(msg: string) {
    this.state.actionLog.unshift(msg);
    if (this.state.actionLog.length > 6) this.state.actionLog.pop();
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      const poll = () => {
        if (this.disposed) return;
        if (!sync || gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED) {
          if (sync) gl.deleteSync(sync);
          this.softGlTimeoutId = window.setTimeout(() => {
            if (!this.disposed) this.animate();
          }, 80);
        } else {
          this.softGlTimeoutId = window.setTimeout(poll, 16);
        }
      };
      this.softGlTimeoutId = window.setTimeout(poll, 16);
    } else {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  private animate = () => {
    if (this.disposed) return;
    this.scheduleNextFrame();

    const now = performance.now();
    this.fpsGovernor.beginFrame(now);
    const rawDt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const elapsedSec = now * 0.001;

    // Sample FFT Audio Bus
    const { bassAmp, trebleAmp } = this.dspEngine.sampleFFT();

    const isReplayActive = this.replaySystem.isActive();
    const isMenuScreen =
      this.state.screenMode === 'MAIN_MENU' ||
      this.state.screenMode === 'STORY_HUB' ||
      this.state.screenMode === 'ROSTER' ||
      this.state.screenMode === 'SAVES' ||
      this.state.screenMode === 'REPLAY_VAULT' ||
      this.state.screenMode === 'SETTINGS';
    const isCutsceneScreen = this.state.screenMode === 'STORY_CUTSCENE';
    const isPaused = this.state.screenMode === 'PAUSED';

    // Decay Post-FX transient impulses smoothly
    this.postFXVelocityPulse = Math.max(0, this.postFXVelocityPulse - rawDt * 1.45);
    this.postFXImpactFlash = Math.max(0, this.postFXImpactFlash - rawDt * 2.2);

    // Continuous Critically Damped Screen Sensor & Velocity Impulse
    const sensorDamp = 1 - Math.exp(-14 * rawDt);
    this.prevSensorUV.copy(this.smoothSensorUV);
    this.smoothSensorUV.lerp(this.rawSensorUV, sensorDamp);
    const frameSensorDist = Math.hypot(
      this.smoothSensorUV.x - this.prevSensorUV.x,
      this.smoothSensorUV.y - this.prevSensorUV.y
    );
    const instantVel = frameSensorDist / Math.max(0.008, rawDt);
    this.sensorVelMag = THREE.MathUtils.damp(this.sensorVelMag, THREE.MathUtils.clamp(instantVel * 0.45, 0, 1), 10, rawDt);
    this.sensorMicroZoom = THREE.MathUtils.damp(this.sensorMicroZoom, this.sensorVelMag * 0.65, 6, rawDt);
    this.screenSensorState.smoothX = this.smoothSensorUV.x;
    this.screenSensorState.smoothY = this.smoothSensorUV.y;
    this.screenSensorState.velMag = Number(this.sensorVelMag.toFixed(3));
    this.screenSensorState.microZoom = Number(this.sensorMicroZoom.toFixed(3));
    this.screenSensorState.active = this.sensorActive;

    const sensorParallaxX = (this.smoothSensorUV.x - 0.5) * 0.52;
    const sensorParallaxY = (0.5 - this.smoothSensorUV.y) * 0.32;

    if (isReplayActive && !isPaused) {
      // =========================================================
      // SLOW-MOTION MULTI-ANGLE SPIKE REPLAY SHOWCASE LOOP
      // =========================================================
      const replayStillRunning = this.replaySystem.stepReplay(
        rawDt,
        this.ball,
        this.ballShadow,
        this.units,
        this.camera,
        this.controls.target,
        (u, unitDt) => this.applySkeletalRig(u, unitDt),
        {
          onStrikeMoment: (ballPos, spikerPos) => {
            this.postFXVelocityPulse = 0.92;
            this.triggerPostFXImpactFlash(ballPos, 0.85);
            this._sweatEmitPos.set(spikerPos.x, spikerPos.y + 1.85, spikerPos.z);
            this.particleSystem.emitSweatSpray(this._sweatEmitPos, new THREE.Vector3(0, 1.2, 0), 20, 0.9);
          },
          onImpactMoment: (ballPos) => {
            this.triggerPostFXImpactFlash(ballPos, 0.95);
            this.particleSystem.emitDustBurst(ballPos, 24, 1.5);
            if (this.state.courtSurface === 'SAND' || this.matchEvolution.sandLevel > 0.16) {
              this.particleSystem.emitSandSpray(ballPos, 0, 0, 22);
            }
            this.injectFloorRipple(ballPos.x, ballPos.z, 1.0);
          },
        }
      );

      if (!replayStillRunning) {
        this.setCameraAngle(this.state.cameraAngle);
      }

      const replayDt = rawDt * this.replaySystem.getPlaybackState().playbackSpeed;
      this.particleSystem.update(replayDt, elapsedSec, this.matchEvolution, this.units, this.state.courtSurface);
      this.ballisticBridge.updateTrail(this.ball.position, this.ballVel, true);
    } else if (isCutsceneScreen) {
      // =========================================================
      // PS6 REAL-TIME 3D STORY CUTSCENE CAMERA (AI SELF-PROGRAMMED)
      // =========================================================
      this.cutsceneShotTimer += rawDt;
      const line = this.storyState.currentLine;
      const shot: CutsceneCameraShot = line?.cameraShot || 'STADIUM_ESTABLISH';
      const camDamp = 1 - Math.exp(-4.2 * rawDt);
      let targetFov = 36;

      if (this.aiCameraDirector.isEnabled()) {
        const solved = this.aiCameraDirector.evaluateCutsceneFrame(
          this.cutsceneShotTimer,
          this._v1,
          this._v2
        );
        this._v1.x += sensorParallaxX * 0.35;
        this._v1.y += sensorParallaxY * 0.2;
        this.camera.position.lerp(this._v1, camDamp);
        this.controls.target.lerp(this._v2, camDamp * 1.2);
        targetFov = solved.fov;
        this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(
          this.activeCameraDutchTiltDeg,
          solved.dutchTiltDeg,
          5.5,
          rawDt
        );
      } else if (shot === 'PLAYER_CLOSEUP_A' || shot === 'PLAYER_CLOSEUP_B') {
        const tm = line?.focusUnitTeam || (shot === 'PLAYER_CLOSEUP_A' ? 'A' : 'B');
        const actor =
          this.units.find((u) => u.team === tm && u.jerseyNumber === line?.focusUnitJersey) ||
          this.units.find((u) => u.team === tm)!;
        const zDir = tm === 'A' ? -1 : 1;
        this._v1.set(
          actor.mesh.position.x + Math.sin(elapsedSec * 0.4) * 0.8 + sensorParallaxX * 0.4,
          1.95 + sensorParallaxY * 0.2,
          actor.mesh.position.z + zDir * 3.1
        );
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(actor.mesh.position.x, 1.38, actor.mesh.position.z);
        this.controls.target.lerp(this._v2, camDamp * 1.2);
        targetFov = 31;
      } else if (shot === 'NET_FACEOFF') {
        this._v1.set(
          6.8 + Math.sin(elapsedSec * 0.35) * 0.9,
          2.65,
          Math.cos(elapsedSec * 0.35) * 1.6
        );
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 1.65, 0);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 34;
      } else if (shot === 'SKYLINE_SWEEP') {
        const ang = elapsedSec * 0.16;
        this._v1.set(Math.sin(ang) * 11.0, 7.6, 13.8);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 3.2, -16);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 42;
      } else if (shot === 'VIP_BOX_LOOK') {
        this._v1.set(-8.5 + Math.sin(elapsedSec * 0.25) * 2.0, 5.2, -4.0);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 3.8, 16.5);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 40;
      } else if (shot === 'TEAM_HUDDLE_PAN') {
        const focusZ = line?.focusUnitTeam === 'B' ? -3.2 : 3.2;
        this._v1.set(Math.sin(elapsedSec * 0.45) * 5.6, 3.25, focusZ + (line?.focusUnitTeam === 'B' ? -4.8 : 4.8));
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 1.25, focusZ);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 35;
      } else if (shot === 'COURT_FLYBY') {
        const fly = elapsedSec * 0.32;
        this._v1.set(Math.sin(fly) * 10.2, 4.6, Math.cos(fly) * 12.2);
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 1.75, 0);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 42;
      } else if (shot === 'HERO_LOW_ANGLE') {
        const actor =
          this.units.find(
            (u) => u.team === (line?.focusUnitTeam || 'A') && u.jerseyNumber === (line?.focusUnitJersey || 14)
          ) || this.units[0];
        const zDir = actor.team === 'A' ? 1 : -1;
        this._v1.set(actor.mesh.position.x + 1.15, 1.22, actor.mesh.position.z + zDir * 2.4);
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(actor.mesh.position.x, 1.48, actor.mesh.position.z);
        this.controls.target.lerp(this._v2, camDamp * 1.2);
        targetFov = 29;
      } else if (shot === 'BENCH_HUDDLE') {
        const benchZ = line?.focusUnitTeam === 'B' ? -6.8 : 6.8;
        this._v1.set(-7.6, 2.35, benchZ + (line?.focusUnitTeam === 'B' ? -2.2 : 2.2));
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(-2.2, 1.28, benchZ);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 34;
      } else {
        const orb = elapsedSec * 0.18;
        this._v1.set(Math.sin(orb) * 11.2, 6.8, Math.cos(orb) * 13.5);
        this.clampCameraToStadiumBowl(this._v1);
        this.camera.position.lerp(this._v1, camDamp);
        this._v2.set(0, 1.4, 0);
        this.controls.target.lerp(this._v2, camDamp);
        targetFov = 44;
      }

      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, targetFov, 6, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();

      this.units.forEach((u) => {
        u.animTimer += rawDt;
        this.applySkeletalRig(u, rawDt);
      });
      this.updateMatchEvolution(rawDt * 0.15);
      this.particleSystem.update(rawDt, elapsedSec, this.matchEvolution, this.units, this.state.courtSurface);
    } else if (isMenuScreen) {
      // =========================================================
      // PS6 CINEMATIC INTRO SEQUENCE (ROTATING ARENA -> HERO LOOK UP -> AIM VANCOUVER BILLBOARD -> BALL SWOOSH TO FEET)
      // =========================================================
      const hero = this.getIntroHeroUnit();

      if (this.state.screenMode === 'MAIN_MENU') {
        this.introState.phaseElapsed += rawDt;
        const pt = this.introState.phaseElapsed;

        // Pose teams neatly on court while hero stands front-and-center facing the billboard
        hero.mesh.position.set(0, 0, 4.35);
        hero.mesh.lookAt(0, 0, -22.5);
        hero.animState = 'READY_STANCE';

        if (this.introState.phase === 'ORBIT_STADIUM') {
          this.ball.visible = false;
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 8, rawDt);
          const orbitU = Math.min(1, pt / 3.4);
          const orbitAngle = -0.62 + orbitU * 1.18;
          const radius = THREE.MathUtils.lerp(18.5, 13.8, orbitU);
          this._v1.set(
            Math.sin(orbitAngle) * radius + sensorParallaxX * 0.9,
            THREE.MathUtils.lerp(8.6, 4.6, orbitU) + sensorParallaxY * 0.5,
            Math.cos(orbitAngle) * radius
          );
          this.camera.position.lerp(this._v1, 1 - Math.exp(-4.5 * rawDt));
          this._v2.set(
            0,
            THREE.MathUtils.lerp(3.2, 5.4, orbitU),
            THREE.MathUtils.lerp(-4.0, -14.0, orbitU)
          );
          this.controls.target.lerp(this._v2, 1 - Math.exp(-4.5 * rawDt));
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 42 - this.sensorMicroZoom * 1.5, 7, rawDt);
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();

          if (pt >= 3.4) {
            this.introState.phase = 'HERO_LOOK_UP';
            this.introState.phaseElapsed = 0;
            this.introState.subBannerText = `#${hero.jerseyNumber} ${hero.name} LOCKS EYES ON AIM VANCOUVER`;
            if (!this.introLookStoryTriggered) {
              this.introLookStoryTriggered = true;
              this.syntheticStory.onIntroLookUp();
            }
          }
        } else if (this.introState.phase === 'HERO_LOOK_UP') {
          this.ball.visible = false;
          const lookU = Math.min(1, pt / 2.6);
          // Over-the-shoulder low-angle close-up past hero looking straight up at AIM VANCOUVER billboard
          this._v1.set(
            THREE.MathUtils.lerp(1.42, 0.88, lookU) + sensorParallaxX * 0.25,
            THREE.MathUtils.lerp(1.34, 1.54, lookU) + sensorParallaxY * 0.18,
            THREE.MathUtils.lerp(6.15, 5.42, lookU)
          );
          this.camera.position.lerp(this._v1, 1 - Math.exp(-5.8 * rawDt));
          this._v2.set(
            0,
            THREE.MathUtils.lerp(2.2, 9.6, lookU),
            THREE.MathUtils.lerp(1.5, -22.5, lookU)
          );
          this.controls.target.lerp(this._v2, 1 - Math.exp(-5.8 * rawDt));
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, -2.6, 6, rawDt);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 34, 6, rawDt);
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();

          if (pt >= 2.6) {
            this.introState.phase = 'BILLBOARD_FULLSCREEN';
            this.introState.phaseElapsed = 0;
            this.introState.subBannerText = 'SELECT YOUR MUSIC · PRESS PLAY TO LAUNCH';
          }
        } else if (this.introState.phase === 'BILLBOARD_FULLSCREEN') {
          this.ball.visible = false;
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 10, rawDt);
          const fovDeg = 38;
          const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5);
          const halfW = 8.15;
          const halfH = 3.15;
          const distForWidth = (halfW * 1.12) / Math.max(0.28, tanHalf * this.camera.aspect);
          const distForHeight = (halfH * 1.62) / tanHalf;
          const centerDist = Math.max(11.4, distForWidth, distForHeight);

          this._v1.set(
            sensorParallaxX * 0.35,
            10.05 + sensorParallaxY * 0.22,
            -22.5 + centerDist
          );
          this._v2.set(0, 9.95, -22.5);
          const cutSnap = pt < 0.25 ? 1 - Math.exp(-24 * rawDt) : 1 - Math.exp(-8 * rawDt);
          this.camera.position.lerp(this._v1, cutSnap);
          this.controls.target.lerp(this._v2, cutSnap);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, fovDeg, 12, rawDt);
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        } else if (this.introState.phase === 'BALL_SWOOSH_TO_FEET') {
          this.ball.visible = true;
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, -1.8, 7, rawDt);

          if (pt < 1.15) {
            // Swoosh out from AIM VANCOUVER billboard across the stadium net onto Cyan court
            const u = pt / 1.15;
            const bx = THREE.MathUtils.lerp(0, 0.42, u) + Math.sin(u * Math.PI) * 1.15;
            const by = THREE.MathUtils.lerp(10.2, this.BALL_RADIUS, Math.pow(u, 1.25)) + Math.sin(u * Math.PI) * 1.5;
            const bz = THREE.MathUtils.lerp(-21.2, 1.55, u);
            this.ball.position.set(bx, by, bz);
            this.ball.rotation.x += rawDt * 24;
            this.ball.rotation.z -= rawDt * 9;
            this._v3.set(0, -4, 18);
            this.ballisticBridge.updateTrail(this.ball.position, this._v3, true);
            if (Math.random() < 0.45) {
              this.particleSystem.emitDustBurst(this.ball.position, 4, 0.65);
            }

            this._v1.set(bx - 2.35, Math.max(2.15, by + 1.2), bz - 4.8);
            this.camera.position.lerp(this._v1, 1 - Math.exp(-10 * rawDt));
            this._v2.set(bx * 0.6, Math.max(0.75, by * 0.65), bz + 2.4);
            this.controls.target.lerp(this._v2, 1 - Math.exp(-10 * rawDt));
            this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 44, 8, rawDt);
          } else if (pt < 1.65) {
            // Court Impact Bounce + Dust/Sand Burst
            if (!this.introHeroBounceTriggered) {
              this.introHeroBounceTriggered = true;
              this.ball.position.set(0.42, this.BALL_RADIUS, 1.55);
              this.particleSystem.emitDustBurst(this.ball.position, 22, 1.4);
              this.injectFloorRipple(this.ball.position.x, this.ball.position.z, 0.9);
              this.playImpactAudio('FLOOR', 62);
            }
            const u = (pt - 1.15) / 0.5;
            const bx = THREE.MathUtils.lerp(0.42, 0.32, u);
            const by = this.BALL_RADIUS + Math.sin(u * Math.PI) * 0.62;
            const bz = THREE.MathUtils.lerp(1.55, 2.75, u);
            this.ball.position.set(bx, by, bz);
            this.ball.rotation.x += rawDt * 15;
            this.ballisticBridge.updateTrail(this.ball.position, this._v3.set(0, 1, 6), true);

            this._v1.set(-2.35, 2.1, bz - 3.6);
            this.camera.position.lerp(this._v1, 1 - Math.exp(-8 * rawDt));
            this._v2.set(0.18, 0.55, bz + 1.3);
            this.controls.target.lerp(this._v2, 1 - Math.exp(-8 * rawDt));
            this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 36, 7, rawDt);
          } else if (pt < 2.85) {
            // Smooth Roll Right Up to Main Player's Feet
            const u = (pt - 1.65) / 1.2;
            const eased = 1 - Math.pow(1 - u, 2.2);
            const bx = THREE.MathUtils.lerp(0.32, 0.25, eased);
            const bz = THREE.MathUtils.lerp(2.75, 3.88, eased);
            const stepRoll = Math.max(0, bz - this.ball.position.z);
            this.ball.position.set(bx, this.BALL_RADIUS, bz);
            this.ball.rotation.x += stepRoll / this.BALL_RADIUS;
            this.ballisticBridge.updateTrail(this.ball.position, this._v3.set(0, 0, 0), false);

            // Low-angle framing showing volleyball rolling right up to Ishikawa's sneakers & rising to match
            this._v1.set(
              THREE.MathUtils.lerp(-2.2, 2.4, eased),
              THREE.MathUtils.lerp(1.45, 2.35, eased),
              THREE.MathUtils.lerp(1.9, 6.9, eased)
            );
            this.camera.position.lerp(this._v1, 1 - Math.exp(-6.5 * rawDt));
            this._v2.set(0.14, THREE.MathUtils.lerp(0.28, 1.15, eased), 4.15);
            this.controls.target.lerp(this._v2, 1 - Math.exp(-6.5 * rawDt));
            this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 35, 6, rawDt);
          } else {
            this.ballShadow.visible = true;
            this.startNewMatch(this.introState.pendingFormat);
          }

          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        }

        // Sync Ball Shadow cleanly during ball swoosh
        this.ballShadow.visible = this.ball.visible;
        if (this.ball.visible) {
          this.ballShadow.position.set(this.ball.position.x, 0.034, this.ball.position.z);
          const hs = THREE.MathUtils.clamp(1.15 - this.ball.position.y * 0.12, 0.35, 1.1);
          this.ballShadow.scale.setScalar(hs);
        }
      } else {
        // Other menu sub-pages (ROSTER / SAVES / VAULT / SETTINGS / STORY_HUB) keep rotating stadium orbit
        this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 8, rawDt);
        const orbitAngle = elapsedSec * 0.14;
        this._v1.set(
          Math.sin(orbitAngle) * 19.5 + sensorParallaxX * 1.4,
          8.2 + Math.sin(elapsedSec * 0.3) * 0.9 + sensorParallaxY,
          Math.cos(orbitAngle) * 19.5
        );
        this.camera.position.lerp(this._v1, 1 - Math.exp(-3.5 * rawDt));
        this._v2.set(sensorParallaxX * 0.4, 1.4 + sensorParallaxY * 0.3, 0);
        this.controls.target.lerp(this._v2, 1 - Math.exp(-3.5 * rawDt));
        const menuFov = 44 - this.sensorMicroZoom * 2.2;
        this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, menuFov, 7, rawDt);
        this.camera.fov = this.currentCamFov;
        this.camera.updateProjectionMatrix();
      }

      this.units.forEach((u) => {
        u.animTimer += rawDt;
        this.applySkeletalRig(u, rawDt);
      });
      this.updateMatchEvolution(rawDt * 0.2);
      this.particleSystem.update(rawDt, elapsedSec, this.matchEvolution, this.units, this.state.courtSurface);
    } else if (!isPaused) {
      // =========================================================
      // ACTIVE MATCH SIMULATION LOOP + COMIC SLOW-MO TIME DILATION
      // =========================================================
      if (this.reactiveState.isCharging) {
        this.reactiveChargeTimer += rawDt;
        this.reactiveState.chargeLevel = THREE.MathUtils.clamp(this.reactiveChargeTimer / 0.52, 0.08, 1.0);
        const actor = this.getActiveCyanControlUnit();
        if (actor) actor.reactiveCharge = this.reactiveState.chargeLevel;
      }
      if (this.reactiveGradeClearTimer > 0) {
        this.reactiveGradeClearTimer -= rawDt;
        if (this.reactiveGradeClearTimer <= 0) {
          this.reactiveState.lastTimingGrade = 'NONE';
        }
      }
      if (this.reactiveBufferTimer > 0) {
        this.reactiveBufferTimer -= rawDt;
        if (this.reactiveBufferTimer <= 0) {
          this.reactiveState.bufferedAction = null;
        } else if (
          this.state.matchState === 'PLAY' &&
          this.state.promptTiming >= 0.68
        ) {
          const actor = this.getActiveCyanControlUnit();
          if (actor && !actor.isJumping && !actor.isDowned && this.state.activePrompt === 'SPIKE') {
            actor.isJumping = true;
            actor.yVel = actor.stats.vertical * 0.96;
            actor.animState = 'SPIKE_WINDUP';
            actor.animTimer = 0;
            this.reactiveState.lastTimingGrade = 'PERFECT';
            this.reactiveState.lastActionLabel = 'BUFFERED TIMING SNAP';
            this.reactiveAdaptivePower = Math.max(this.reactiveAdaptivePower, 0.22);
            this.playerActionQueued = true;
            this.reactiveBufferTimer = 0;
            this.reactiveState.bufferedAction = null;
          }
        }
      }

      if (this.hitStopTimer > 0) {
        this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      }

      // Advance Live Comic Slow-Motion Strike Sequence & Reactive Real-Time Return
      let comicTimeScale = 1.0;
      if (this.comicStrike.active) {
        this.comicStrikeTimer += rawDt;
        const p = this.comicStrikeTimer / this.comicStrikeDuration;
        if (p < 0.14) {
          this.comicStrike.phase = 'IMPACT_FREEZE';
          this.comicStrike.intensity = 0.96;
          comicTimeScale = 0.14;
        } else if (p < 0.72) {
          this.comicStrike.phase = 'ORBIT_FOLLOW';
          const orbitP = (p - 0.14) / 0.58;
          this.comicStrike.intensity = THREE.MathUtils.lerp(0.92, 0.52, orbitP);
          comicTimeScale = THREE.MathUtils.lerp(0.22, 0.38, orbitP);
        } else if (p < 1.0) {
          this.comicStrike.phase = 'REALTIME_RETURN';
          const retP = (p - 0.72) / 0.28;
          this.comicStrike.intensity = THREE.MathUtils.lerp(0.52, 0.0, retP);
          comicTimeScale = THREE.MathUtils.lerp(0.45, 1.0, retP);
        } else {
          this.cancelComicStrikeCamera();
        }
        this.comicStrike.timeScale = Number(comicTimeScale.toFixed(2));
        this._projVec.copy(this.ball.position).project(this.camera);
        this.comicStrike.screenX = THREE.MathUtils.clamp(this._projVec.x * 0.5 + 0.5, 0.1, 0.9);
        this.comicStrike.screenY = THREE.MathUtils.clamp(-this._projVec.y * 0.5 + 0.5, 0.15, 0.82);
        this.comicBurstUV.set(this.comicStrike.screenX, 1 - this.comicStrike.screenY);
      }

      const dt = rawDt * this.state.gameSpeed * (this.hitStopTimer > 0 ? 0.14 : comicTimeScale);

      // Auto-clear transient court callout banners cleanly
      if (this.bannerClearTimer > 0) {
        this.bannerClearTimer -= rawDt;
        if (this.bannerClearTimer <= 0) {
          this.state.lastPassRatingText = '';
          this.state.activeSkillNotification = null;
          this.state.netViolation = null;
        }
      }

      // Serve countdown for AI Team B or AUTO mode
      if (this.state.matchState === 'SERVE' && this.autoServeTimer > 0) {
        this.autoServeTimer -= rawDt;
        if (this.autoServeTimer <= 0) {
          const srv = this.units.find((u) => u.isServer);
          if (srv) {
            const zTarget = srv.team === 'A' ? -(4.0 + Math.random() * 4.0) : 4.0 + Math.random() * 4.0;
            const xTarget = (Math.random() - 0.5) * 6.8;
            this.executeServe(srv, 84, xTarget, zTarget, Math.random() > 0.35 ? 'JUMP' : 'FLOAT');
          }
        }
      }

      if (this.ceremonyPhase !== 'LIVE_MATCH') {
        // Opening Ceremony / Intermission Show: Cheerleaders & crowd dance to uploaded music; rally pauses cleanly
        this.ceremonyTimer = Math.max(0, this.ceremonyTimer - rawDt);
        this.state.ceremonyTimer = Number(this.ceremonyTimer.toFixed(1));
        this.units.forEach((u) => {
          u.animTimer += rawDt;
          this.applySkeletalRig(u, rawDt);
        });
        this.updateMatchEvolution(rawDt * 0.25);
        this.particleSystem.update(rawDt, elapsedSec, this.matchEvolution, this.units, this.state.courtSurface);

        if (this.ceremonyTimer <= 0) {
          this.ceremonyPhase = 'LIVE_MATCH';
          this.state.ceremonyPhase = 'LIVE_MATCH';
          this.refereeCallText = 'PLAY READY';
          this.resetPoint(this.state.servingTeam);
        }
      } else {
        // Point-scored -> crisp reset to next Serve (or Story mid-match cutscene twist!)
        if (this.state.matchState === 'POINT_SCORED') {
          this.pointDelay -= rawDt;
          if (this.pointDelay <= 0) {
            this.celebrationWinnerTeam = null;
            this.units.forEach((u) => {
              u.defeatSlump = false;
            });
            if (this.pendingMidCutscene && this.activeStoryChapter) {
              this.pendingMidCutscene = false;
              this.beginStoryCutscene('MID', this.activeStoryChapter.midMatchCutscene);
            } else {
              this.resetPoint(this.state.servingTeam);
            }
          }
        } else if (this.state.matchState === 'SET_OVER') {
          this.pointDelay -= rawDt;
          if (this.pointDelay <= 0) {
            this.celebrationWinnerTeam = null;
            this.units.forEach((u) => {
              u.defeatSlump = false;
            });
            this.state.currentSet++;
            this.state.scoreA = 0;
            this.state.scoreB = 0;
            this.setCeremonyPhase('INTERMISSION', 12);
          }
        }

        this.frameStrikeEvent = false;
        this.frameImpactEvent = false;
        this.frameSpikerId = null;

        this.updateMatchEvolution(dt);
        this.updatePhysics(dt);
        this.updateAIAndPlayerControl(dt);
        this.updateGeminiBrainSync(rawDt);

        if (this.state.matchState === 'PLAY') {
          this.replaySystem.recordLiveFrame(
            dt,
            this.ball,
            this.state.ballSpeedKmh,
            this.frameStrikeEvent,
            this.frameImpactEvent,
            this.frameSpikerId,
            this.units
          );
        }

        this.particleSystem.update(dt, elapsedSec, this.matchEvolution, this.units, this.state.courtSurface);
        this.ballisticBridge.updateTrail(this.ball.position, this.ballVel, this.state.matchState === 'PLAY');
      }

      // Dynamic PS6 Spike Follow-Through & TV Broadcast Micro-Zoom / Micro-Movement Tracking
      if (this.userOrbitPauseTimer > 0 && !this.isUserOrbiting) {
        this.userOrbitPauseTimer = Math.max(0, this.userOrbitPauseTimer - rawDt);
      }

      // Compute smooth context-sensitive micro-zoom target FOV
      let targetFov = this.baseCamFov;
      if (this.state.matchState === 'SERVE') {
        targetFov -= 1.6;
      } else if (this.state.matchState === 'POINT_SCORED' || this.state.matchState === 'SET_OVER') {
        targetFov -= 3.2;
      } else if (this.expectedSpiker && this.expectedSpiker.isJumping && this.expectedSpiker.mesh.position.y > 0.25) {
        targetFov -= Math.min(3.8, this.expectedSpiker.mesh.position.y * 3.4);
      }
      targetFov -= this.sensorMicroZoom * 2.1;

      if (this.comicStrike.active && this.spikeCamEnabled) {
        const p = Math.min(1, this.comicStrikeTimer / this.comicStrikeDuration);
        const camLerp = 1 - Math.exp(-12 * rawDt);
        this.aiCameraDirector.evaluateComicOrbitFrame(
          Math.min(1, p / 0.74),
          this.ball.position,
          this._comicOrbitSol
        );

        if (p < 0.72) {
          this.camera.position.lerp(this._comicOrbitSol.cameraPos, camLerp);
          this.controls.target.lerp(this._comicOrbitSol.lookTarget, camLerp * 1.25);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this._comicOrbitSol.fov, 10, rawDt);
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(
            this.activeCameraDutchTiltDeg,
            this._comicOrbitSol.dutchTiltDeg,
            10,
            rawDt
          );
          this.comicStrike.dutchTiltDeg = Number(this.activeCameraDutchTiltDeg.toFixed(1));
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        } else {
          // Reactive Return to Real Time: smooth blend back to standard court camera
          const returnLerp = 1 - Math.exp(-9.5 * rawDt);
          this.camera.position.lerp(this.baseCamPos, returnLerp);
          this.controls.target.lerp(this.baseCamTarget, returnLerp);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this.baseCamFov, 9, rawDt);
          this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 9, rawDt);
          this.comicStrike.dutchTiltDeg = Number(this.activeCameraDutchTiltDeg.toFixed(1));
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        }
      } else if (this.spikeCamActive && this.spikeCamEnabled) {
        this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 8, rawDt);
        this.spikeCamTimer += rawDt;
        const p = this.spikeCamTimer / this.spikeCamDuration;
        const camLerp = 1 - Math.exp(-10 * rawDt);

        if (p < 0.68) {
          const trackProgress = Math.min(1, p / 0.68);
          const followZ = THREE.MathUtils.lerp(this.spikeCamAnchor.z, this.spikeCamAnchor.z * 0.28, trackProgress);
          const followX = THREE.MathUtils.lerp(this.spikeCamAnchor.x, this.ball.position.x * 0.55, trackProgress * 0.65);
          this._v1.set(followX, THREE.MathUtils.lerp(this.spikeCamAnchor.y, 4.4, trackProgress), followZ);
          this.camera.position.lerp(this._v1, camLerp);

          this._v2.copy(this.ball.position).lerp(this.spikeCamStrikeTarget, 0.25);
          this.controls.target.lerp(this._v2, camLerp * 1.25);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 30, 8, rawDt);
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        } else if (p < 1.0) {
          const returnLerp = 1 - Math.exp(-7.5 * rawDt);
          this.camera.position.lerp(this.baseCamPos, returnLerp);
          this.controls.target.lerp(this.baseCamTarget, returnLerp);
          this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this.baseCamFov, 7, rawDt);
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        } else {
          this.cancelSpikeActionCam();
        }
      } else if (!this.isUserOrbiting && this.userOrbitPauseTimer <= 0) {
        this.activeCameraDutchTiltDeg = THREE.MathUtils.damp(this.activeCameraDutchTiltDeg, 0, 8, rawDt);
        // Real TV Camera Operator Pan + Gentle Handheld Micro-Movement + Smooth Transitions + Bowl Bounds Clamping
        if (this.camTransitionTimer > 0) {
          this.camTransitionTimer = Math.max(0, this.camTransitionTimer - rawDt);
        }
        const tvRate = this.camTransitionTimer > 0 ? 7.5 : 3.6;
        const tvDamp = 1 - Math.exp(-tvRate * rawDt);
        const microBreathX = Math.sin(elapsedSec * 0.85) * 0.10 + sensorParallaxX * 0.52;
        const microBreathY = Math.cos(elapsedSec * 1.15) * 0.07 + sensorParallaxY * 0.42;
        const celebFocusZ = this.celebrationWinnerTeam
          ? this.celebrationWinnerTeam === 'A'
            ? 2.4
            : -2.4
          : 0;

        if (this.state.cameraAngle === 'BROADCAST') {
          this._v1.set(
            this.baseCamPos.x + THREE.MathUtils.clamp(this.ball.position.x * 0.14, -1.2, 1.2) + microBreathX,
            this.baseCamPos.y + microBreathY,
            this.baseCamPos.z + THREE.MathUtils.clamp(this.ball.position.z * 0.30, -2.8, 2.8) + celebFocusZ * 0.35
          );
          this.clampCameraToStadiumBowl(this._v1);
          this.camera.position.lerp(this._v1, tvDamp);
          this._v2.set(
            THREE.MathUtils.clamp(this.ball.position.x * 0.36, -2.2, 2.2) + sensorParallaxX * 0.35,
            THREE.MathUtils.clamp(1.15 + this.ball.position.y * 0.16, 1.0, 2.1) + sensorParallaxY * 0.25,
            THREE.MathUtils.clamp(this.ball.position.z * 0.42, -3.6, 3.6) * (this.celebrationWinnerTeam ? 0.35 : 1) + celebFocusZ * 0.65
          );
          this.controls.target.lerp(this._v2, tvDamp * 1.15);
        } else if (this.state.cameraAngle === 'CINEMATIC_FLOW') {
          // Sweeping Steadicam / Crane Flow Camera (strictly inside stadium bowl revealing 4th side VIPs & Vancouver skyline)
          const flowSpeed = this.ceremonyPhase !== 'LIVE_MATCH' ? 0.36 : 0.22;
          const flowOrbit = elapsedSec * flowSpeed + THREE.MathUtils.clamp(this.ball.position.z * 0.04, -0.32, 0.32);
          const flowRadiusX = 10.6 - THREE.MathUtils.clamp(this.state.ballSpeedKmh * 0.012, 0, 1.2);
          const flowRadiusZ = 14.2 - THREE.MathUtils.clamp(this.state.ballSpeedKmh * 0.015, 0, 1.5);
          const flowDamp = 1 - Math.exp(-(this.camTransitionTimer > 0 ? 7.2 : 3.1) * rawDt);
          this._v1.set(
            Math.cos(flowOrbit) * flowRadiusX + microBreathX,
            6.1 + Math.sin(elapsedSec * 0.52) * 0.85 + THREE.MathUtils.clamp(this.ball.position.y * 0.22, 0, 1.3) + microBreathY,
            Math.sin(flowOrbit) * flowRadiusZ
          );
          this.clampCameraToStadiumBowl(this._v1);
          this.camera.position.lerp(this._v1, flowDamp);
          this._v2.set(
            THREE.MathUtils.clamp(this.ball.position.x * 0.44, -2.4, 2.4) + sensorParallaxX * 0.38,
            THREE.MathUtils.clamp(1.25 + this.ball.position.y * 0.20, 1.1, 2.3) + sensorParallaxY * 0.28,
            THREE.MathUtils.clamp(this.ball.position.z * 0.46, -4.0, 4.0) + celebFocusZ * 0.55
          );
          this.controls.target.lerp(this._v2, flowDamp * 1.2);
        } else if (this.state.cameraAngle === 'COURT_BEHIND') {
          this._v1.set(
            THREE.MathUtils.clamp(this.ball.position.x * 0.34, -2.2, 2.2) + microBreathX,
            this.baseCamPos.y + microBreathY,
            this.baseCamPos.z
          );
          this.clampCameraToStadiumBowl(this._v1);
          this.camera.position.lerp(this._v1, tvDamp);
          this._v2.set(
            THREE.MathUtils.clamp(this.ball.position.x * 0.44, -2.6, 2.6) + sensorParallaxX * 0.35,
            THREE.MathUtils.clamp(1.15 + this.ball.position.y * 0.14, 1.05, 2.0) + sensorParallaxY * 0.22,
            this.baseCamTarget.z + THREE.MathUtils.clamp(this.ball.position.z * 0.2, -1.8, 1.8)
          );
          this.controls.target.lerp(this._v2, tvDamp);
        } else if (this.state.cameraAngle === 'ACTION') {
          const actionPosDamp = 1 - Math.exp(-(this.camTransitionTimer > 0 ? 8.0 : 5.4) * rawDt);
          const actionLookDamp = 1 - Math.exp(-7.2 * rawDt);
          this._v1.set(
            this.baseCamPos.x - THREE.MathUtils.clamp(this.ball.position.x * 0.2, -1.0, 1.0) + microBreathX,
            THREE.MathUtils.clamp(this.baseCamPos.y + this.ball.position.y * 0.2, 2.9, 5.1) + microBreathY,
            THREE.MathUtils.clamp(this.ball.position.z * 0.65, -6.2, 6.2)
          );
          this.clampCameraToStadiumBowl(this._v1);
          this.camera.position.lerp(this._v1, actionPosDamp);
          this._v2.set(
            THREE.MathUtils.clamp(this.ball.position.x * 0.55, -2.8, 2.8) + sensorParallaxX * 0.3,
            THREE.MathUtils.clamp(1.25 + this.ball.position.y * 0.22, 1.15, 2.4) + sensorParallaxY * 0.2,
            THREE.MathUtils.clamp(this.ball.position.z * 0.62, -5.2, 5.2)
          );
          this.controls.target.lerp(this._v2, actionLookDamp);
          targetFov -= THREE.MathUtils.clamp(this.state.ballSpeedKmh * 0.04, 0, 3.5);
        } else {
          this._v1.set(
            this.baseCamPos.x + microBreathX,
            this.baseCamPos.y + microBreathY,
            this.baseCamPos.z
          );
          this.clampCameraToStadiumBowl(this._v1, this.state.cameraAngle === 'SKY_CAM');
          this.camera.position.lerp(this._v1, tvDamp);
          this._v2.set(
            this.state.cameraAngle === 'SKY_CAM' ? 0 : THREE.MathUtils.clamp(this.ball.position.x * 0.3, -1.8, 1.8) + sensorParallaxX * 0.3,
            this.state.cameraAngle === 'SKY_CAM' ? 0 : 1.2 + sensorParallaxY * 0.2,
            this.state.cameraAngle === 'SKY_CAM' ? 0 : THREE.MathUtils.clamp(this.ball.position.z * 0.3, -2.6, 2.6)
          );
          this.controls.target.lerp(this._v2, tvDamp);
        }

        // Apply smooth FOV micro-zoom without jarring resets
        const prevFov = this.currentCamFov;
        this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, targetFov, this.camTransitionTimer > 0 ? 8.5 : 5.5, rawDt);
        if (Math.abs(this.currentCamFov - prevFov) > 0.005) {
          this.camera.fov = this.currentCamFov;
          this.camera.updateProjectionMatrix();
        }
      }

      if (this.cameraShake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.22;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.22;
        this.cameraShake = Math.max(0, this.cameraShake - rawDt * 2.8);
      }

      if (this.organicBlock.membraneTension > 0.45) {
        this.organicBlock.membraneTension = Math.max(0.45, this.organicBlock.membraneTension - rawDt * 0.18);
      }

      // Spatial Matrix Voronoi Evaluation + Telemetry Frame Ring-Buffer Recording
      const currentOffense = this.currentSide === 'A' ? this.state.tacticalPlayA : this.state.tacticalPlayB;
      const oppDefense = this.currentSide === 'A' ? this.state.defensiveStrategyB : this.state.defensiveStrategyA;
      this.lastSpatialAssessment = this.spatialMatrix.evaluateGrid(
        this.units,
        this.currentSide,
        currentOffense,
        oppDefense,
        this.ball.position,
        this.rawLandingSpot
      );
      this.telemetryRecorder.recordFrame(
        this.ball.position,
        Math.round(this.ballVel.length() * 3.6),
        this.bioRegister,
        this.lastSpatialAssessment
      );
    }

    // Sync Bio-Register Vector4: (atpFlux, tissueMass, tension, biolume)
    this.bioRegister.set(
      this.organicBlock.atpLevel / 100,
      this.organicBlock.mitosisRate,
      this.organicBlock.membraneTension,
      this.organicBlock.bioluminescence
    );

    // Update SentientGameMatrix & Chibi-Voxel CharacterShaderRig
    this.matrixPipeline.update(rawDt, elapsedSec, {
      atpFlux: this.bioRegister.x,
      tissueMass: this.bioRegister.y,
      tension: this.bioRegister.z,
      biolume: this.bioRegister.w,
      rippleKinetic: (this.organicBlock.membraneTension - 0.45) * 2.0,
      hasImpact: this.hasPendingImpact,
      impactPos: this.pendingImpactPos,
      bassAmp,
      trebleAmp,
      turbulence: this.swarmWorker.workerTurbulence,
      fractalFold: this.swarmWorker.fractalFoldN,
      huntMode: this.huntModeActive,
      cellularEnabled: this.organicBlock.cellularMatrixEnabled,
    });
    this.hasPendingImpact = false;
    this.characterShaderRig.update(elapsedSec, this.bioRegister.x);

    // Impact Ground Ripple Rings
    for (let i = this.impactRings.length - 1; i >= 0; i--) {
      const r = this.impactRings[i];
      r.life += rawDt;
      if (r.life >= r.maxLife) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.impactRings.splice(i, 1);
      } else {
        const p = r.life / r.maxLife;
        r.mesh.scale.setScalar(1 + p * 6.5);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.72;
      }
    }

    // Lightweight Net Wobble
    if (this.netImpacts.length > 0) {
      const pos = this.netMesh.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length; i += 3) {
        let dz = 0;
        for (const imp of this.netImpacts) {
          const dist = Math.abs(this.netOrigPos[i] - imp.pos.x);
          if (dist < 2.2) {
            dz += Math.sin(imp.time * 22 - dist * 4) * (1 - dist / 2.2) * Math.exp(-imp.time * 3.5) * imp.force * 0.03;
          }
        }
        pos[i + 2] = this.netOrigPos[i + 2] + dz;
      }
      this.netMesh.geometry.attributes.position.needsUpdate = true;
      this.netImpacts.forEach((im) => (im.time += rawDt));
      this.netImpacts = this.netImpacts.filter((im) => im.time < 1.2);
    }

    this.crowdSystem?.update(rawDt, elapsedSec, this.state);
    this.vipSuites?.update(elapsedSec, this.state, this.stadiumGroup.visible);
    this.stadiumPersonnel?.update(rawDt, elapsedSec, this.ball.position, this.state, this.ballPhase);
    this.vancouverSkyline?.update(
      rawDt,
      elapsedSec,
      this.state.weather,
      bassAmp,
      this.dspEngine.midAmp,
      trebleAmp
    );
    this.vancouverCity?.update(rawDt, elapsedSec, this.state.weather, bassAmp, trebleAmp);

    // Beat-Reactive Arena Trim, Billboard Neon & Corner Light Pylons
    if (this.trimTealMat && this.trimCoralMat) {
      const b = bassAmp;
      const tr = trebleAmp;
      this.trimTealMat.color.setRGB(
        THREE.MathUtils.clamp(b * 0.65, 0, 1),
        THREE.MathUtils.clamp(0.88 + tr * 0.12, 0, 1),
        1.0
      );
      this.trimCoralMat.color.setRGB(
        1.0,
        THREE.MathUtils.clamp(0.24 + b * 0.36, 0, 1),
        THREE.MathUtils.clamp(0.42 + tr * 0.4, 0, 1)
      );
    }
    if (this.billboardTopNeonMat && this.billboardBotNeonMat) {
      this.billboardTopNeonMat.color.setRGB(
        THREE.MathUtils.clamp(bassAmp * 0.8, 0, 1),
        THREE.MathUtils.clamp(0.86 + trebleAmp * 0.14, 0, 1),
        1.0
      );
      this.billboardBotNeonMat.color.setRGB(
        1.0,
        THREE.MathUtils.clamp(0.28 + bassAmp * 0.4, 0, 1),
        THREE.MathUtils.clamp(0.2 + trebleAmp * 0.45, 0, 1)
      );
    }
    for (let i = 0; i < this.reactiveLightPillars.length; i++) {
      const bar = this.reactiveLightPillars[i];
      const pulse = 0.72 + (i % 2 === 0 ? bassAmp : trebleAmp) * 0.55;
      bar.scale.y = pulse;
    }

    this.updateJumbotron(elapsedSec);
    this.controls.update();
    if (Math.abs(this.activeCameraDutchTiltDeg) > 0.04) {
      this.camera.lookAt(this.controls.target);
      this.camera.rotateZ(THREE.MathUtils.degToRad(this.activeCameraDutchTiltDeg));
    }

    // Graphics System 2 & System 3: Multi-Pass Post-FX Composer Render with ACES LUT, Lens Optics & Comic Strike Pass
    this.postFX.render(rawDt, elapsedSec, {
      velocityPulse: this.postFXVelocityPulse,
      slowMoFactor: isReplayActive ? 1.0 : this.comicStrike.active ? this.comicStrike.intensity * 0.65 : 0.0,
      rainIntensity: this.matchEvolution.rainLevel,
      impactFlash: this.postFXImpactFlash,
      impactUV: this.postFXImpactUV,
      filterMode: this.cameraFilter,
      lensVignette: this.getLensVignetteStrength(this.cameraLens),
      lensDistortion: this.getLensDistortion(this.cameraLens),
      comicFactor: this.comicStrike.active ? this.comicStrike.intensity : 0,
      comicBurstUV: this.comicBurstUV,
    });

    // Render Screen-Space Bioluminescent Membrane Ripple Matrix & Screen Sensor Overlay
    if (this.overlayCtx && this.overlayCanvas) {
      renderMembraneRippleOverlay(
        this.overlayCtx,
        this.overlayCanvas.clientWidth,
        this.overlayCanvas.clientHeight,
        elapsedSec,
        this.organicBlock,
        this.screenSensorState
      );
    }

    this.fpsGovernor.endFrame(performance.now());
    this.hudTelemetryTimer += rawDt;
    if (this.hudTelemetryTimer >= 0.14) {
      this.hudTelemetryTimer = 0;
      this.notifyState();
    }
  };

  public start() {
    this.lastTime = performance.now();
    this.resize();
    this.controls.update();
    this.postFX.render(0.016, 0, {
      velocityPulse: 0,
      slowMoFactor: 0,
      rainIntensity: this.matchEvolution.rainLevel,
      impactFlash: 0,
      impactUV: this.postFXImpactUV,
    });
    this.animate();
  }

  public stop() {
    cancelAnimationFrame(this.animationFrameId);
    if (this.softGlTimeoutId !== null) {
      clearTimeout(this.softGlTimeoutId);
      this.softGlTimeoutId = null;
    }
  }

  private resize = () => {
    if (!this.container || !this.camera || !this.renderer) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(this.container.clientWidth || rect.width || window.innerWidth));
    const height = Math.max(1, Math.floor(this.container.clientHeight || rect.height || window.innerHeight));
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.baseCamFov = this.getLensBaseFov(this.cameraLens, aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.lastAppliedPixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.postFX?.setSize(width, height, this.lastAppliedPixelRatio);
    this.particleSystem?.setPixelRatio(this.lastAppliedPixelRatio);

    if (this.overlayCanvas && this.overlayCtx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.overlayCanvas.width = Math.max(1, Math.floor(width * dpr));
      this.overlayCanvas.height = Math.max(1, Math.floor(height * dpr));
      this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  public dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerInteract);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.dispose();
    this.swarmWorker.dispose();
    this.dspEngine.dispose();
    this.movementOrchestrator?.dispose();
    this.courtFloorSystem?.dispose();
    this.crowdSystem?.dispose();
    this.vipSuites?.dispose();
    this.stadiumPersonnel?.dispose();
    this.vancouverSkyline?.dispose();
    this.vancouverCity?.dispose();
    this.sponsorTextures.forEach((t) => t.dispose());
    this.particleSystem?.dispose();
    this.postFX?.dispose();
    this.matrixPipeline.courtMembraneMat.dispose();
    this.matrixPipeline.arenaHaloMat.dispose();
    this.envRenderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
