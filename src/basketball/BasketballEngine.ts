import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CameraFilterMode,
  CameraLensPreset,
  CameraPreset,
  CourtSurface,
  DifficultyLevel,
  EnvDynamicsMode,
  EnvironmentTheme,
  GraphicsQualityPreset,
  IntroMusicPresetId,
  MatchEvolutionState,
  PlayerParts,
  PlayerProfileMeta,
  ReplayAngleMode,
  TimingGrade,
  UnitStats,
} from '../types';
import {
  BASKET_BALL_RADIUS,
  BASKET_GRAVITY,
  BasketCameraPreset,
  BasketDefenseScheme,
  BasketGameState,
  BasketMatchFormat,
  BasketPlayCall,
  BasketReplayClip,
  BasketReplayFrame,
  BasketRole,
  BasketScreenMode,
  BasketShotPreview,
  BasketUnit,
  CelebrationCutsceneType,
  StealOutcomeKind,
} from './basketballTypes';
import {
  ARC_RADIUS,
  BACKBOARD_Z,
  BasketballCourtSystem,
  COURT_D,
  COURT_W,
  HOOP_POS,
  RIM_RADIUS,
  RIM_TUBE_RADIUS,
} from './BasketballCourtSystem';
import { BasketballAudioEngine } from './BasketballAudio';
import { BasketballContactEngine } from './BasketballContactEngine';
import { BallFlightStyle, BasketballBounceSystem } from './BasketballBounceSystem';
import { BasketballPassingEngine } from './BasketballPassingEngine';
import { BasketballSoccerGoalie } from './BasketballSoccerGoalie';
import { BasketballStadiumSystem } from './BasketballStadiumSystem';
import { BasketballSkinMaps, createAIMBasketballSkin } from './BasketballBallSkin';
import {
  BasketballShotMeterEngine,
  ReleasedJumpShotResult,
} from './BasketballShotMeterEngine';
import { PS6PostFXPipeline, getCssFilterForMode } from '../matrix/graphics/ps6PostFX';
import { CharacterShaderRig } from '../matrix/shaders/characterShader';
import { AtmosphericParticleSystem } from '../matrix/graphics/atmosphericParticles';
import { CrowdSystem } from '../matrix/graphics/crowdSystem';
import { VIPSuitesSystem } from '../matrix/graphics/vipSuitesSystem';
import { StadiumPersonnelSystem } from '../matrix/graphics/stadiumPersonnel';
import { VancouverSkyline } from '../matrix/graphics/vancouverSkyline';
import { VancouverCityDistrict } from '../matrix/graphics/vancouverCityDistrict';
import { AICameraSelfProgrammer } from '../matrix/ai/aiCameraDirector';
import { BallisticRaycasterBridge } from '../matrix/physics/ballisticBridge';
import { FrameRateGovernor, OdonataDSPEngine } from '../agiSwarm';
import { getDefaultPlayerProfile } from '../saveManager';
import {
  EngineHealthReport,
  CometicKernelState,
  StudioOrchestrationResult,
  SubsystemId,
} from '../os/osTypes';
import { cometicOSKernel } from '../os/CometicOSKernel';

const BALL_RADIUS = BASKET_BALL_RADIUS;
const GRAVITY = BASKET_GRAVITY;

const REPLAY_ANGLES: ReplayAngleMode[] = [
  'NET_TAPE_SWEEP',
  'SPIKER_SHOULDER',
  'FLOOR_IMPACT_LOW',
  'ORBIT_DRONE',
];

const LENS_FOV_MAP: Record<CameraLensPreset, number> = {
  '24MM_WIDE': 58,
  '35MM_CINE': 48,
  '50MM_STD': 38,
  '85MM_TELE': 28,
  '135MM_SNIPER': 21,
};

const ROSTER_A: { name: string; role: BasketRole; num: number }[] = [
  { name: 'ISHIKAWA', role: 'PG', num: 14 },
  { name: 'SEKITA', role: 'WING', num: 8 },
  { name: 'NISHIDA', role: 'BIG', num: 1 },
];

const ROSTER_B: { name: string; role: BasketRole; num: number }[] = [
  { name: 'GIANNELLI', role: 'PG', num: 6 },
  { name: 'MICHIELETTO', role: 'WING', num: 5 },
  { name: 'ROMANO', role: 'BIG', num: 16 },
];

export class BasketballEngine {
  private container: HTMLElement;
  private onStateChange: (state: BasketGameState) => void;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private postFX!: PS6PostFXPipeline;
  private characterShaderRig = new CharacterShaderRig();
  private courtSystem!: BasketballCourtSystem;
  private stadiumSystem!: BasketballStadiumSystem;
  private contactEngine!: BasketballContactEngine;
  private bounceSystem!: BasketballBounceSystem;
  private soccerGoalie!: BasketballSoccerGoalie;
  private particleSystem!: AtmosphericParticleSystem;
  private crowdSystem!: CrowdSystem;
  private vipSuites!: VIPSuitesSystem;
  private stadiumPersonnel!: StadiumPersonnelSystem;
  private vancouverSkyline!: VancouverSkyline;
  private vancouverCity!: VancouverCityDistrict;
  private aiCameraDirector = new AICameraSelfProgrammer();
  private ballisticBridge!: BallisticRaycasterBridge;
  private dspEngine = new OdonataDSPEngine();
  private audioEngine = new BasketballAudioEngine();
  private audioUnlocked = false;
  private fpsGovernor = new FrameRateGovernor();

  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private ambientLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLightA!: THREE.DirectionalLight;
  private rimLightB!: THREE.DirectionalLight;
  private oceanMesh!: THREE.Mesh;
  private stadiumGroup = new THREE.Group();
  private palmTreesGroup = new THREE.Group();

  private jumbotronCanvas!: HTMLCanvasElement;
  private jumbotronCtx!: CanvasRenderingContext2D;
  private jumbotronTex!: THREE.CanvasTexture;
  private billboardTopNeonMat!: THREE.MeshBasicMaterial;
  private billboardBotNeonMat!: THREE.MeshBasicMaterial;
  private introBillboardSpeakerRings: THREE.Mesh[] = [];
  private eqBars: number[] = new Array(32).fill(0.15);
  private eqPeakHold: number[] = new Array(32).fill(0.15);
  private introBounceTriggered = false;

  private units: BasketUnit[] = [];
  private ball!: THREE.Group;
  private ballMesh!: THREE.Mesh;
  private ballSkinMaps: BasketballSkinMaps | null = null;
  private ballShadow!: THREE.Mesh;
  private aimReticle!: THREE.Mesh;
  private shotTargetRing!: THREE.Mesh;
  private shotArcLine!: THREE.Line;
  private shotArcGeo!: THREE.BufferGeometry;
  private slideShotMeterEngine = new BasketballShotMeterEngine();
  private passingEngine = new BasketballPassingEngine();
  private ballVel = new THREE.Vector3();
  private ballSpin = new THREE.Vector3();
  private ballPosPrev = new THREE.Vector3();
  private dribblePhase = 0;
  private prevDribbleHalfCycle = 0;
  private passTargetUnit: BasketUnit | null = null;
  private passTimer = 0;
  private passDuration = 0.28;
  private passIsBounce = false;
  private dribbleHandSide: -1 | 1 = 1;
  private ballCarryBlendTimer = 0;
  private shotHasHitRim = false;
  private shotAscentTimer = 0;
  private lastShotReleasePos = new THREE.Vector3();
  private shotWillScorePoints = 1;
  private shooterUnit: BasketUnit | null = null;
  private dunkTargetPos = new THREE.Vector3();
  private dunkStartPos = new THREE.Vector3();
  private dunkProgress = 0;
  private lastDunkSlamUnit: BasketUnit | null = null;
  private looseBallPickupDelay = 0;
  private queuedShotOnCatch = false;
  private queuedShotCharge: number | null = null;

  private keysDown = new Set<string>();
  private pointerTarget: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private _mouseNDC = new THREE.Vector2();
  private isUserOrbiting = false;
  private userOrbitPauseTimer = 0;
  private pointerHoverTimer = 0;

  // One-Tap & Double-Tap Ankle-Breaker + One-Tap Steal Engine State
  private lastTapMs = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private lastKeyEMs = 0;
  private ankleBreakerCooldown = 0;
  private ankleBreakerBannerTimer = 0;
  private stealCooldown = 0;
  private stealPursuitTargetId: number | null = null;
  private lastCelebrationType: CelebrationCutsceneType = 'NONE';
  private celebrationCompanionUnit: BasketUnit | null = null;
  private readonly pendingReactions: Array<{
    defenderId: number;
    committedVx: number;
    committedVz: number;
    reactionDelay: number;
    elapsed: number;
    anchorPos: THREE.Vector3;
    resolved: boolean;
  }> = [];

  private baseCamPos = new THREE.Vector3(0, 7.6, 11.4);
  private baseCamTarget = new THREE.Vector3(0, 1.5, -2.3);
  private baseCamFov = 48;
  private currentCamFov = 48;
  private cameraShake = 0;
  private hitStopTimer = 0;
  private activeDutchTiltDeg = 0;
  private goalieFocusTimer = 0;
  private aiCamHoldTimer = 0;
  private aiCamTargetPos = new THREE.Vector3();
  private aiCamLookPos = new THREE.Vector3();
  private comicTimer = 0;
  private comicDuration = 1.65;
  private comicBurstUV = new THREE.Vector2(0.5, 0.5);
  private postFXImpactFlash = 0;
  private postFXImpactUV = new THREE.Vector2(0.5, 0.5);

  private isSoftwareGl = false;
  private webglLost = false;
  private disposed = false;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastTime = 0;
  private elapsedTime = 0;
  private hudEmitTimer = 0;
  private clockTexTimer = 0;
  private stalledTimer = 0;
  private celebrationTimer = 0;

  private liveBuffer: BasketReplayFrame[] = [];
  private savedHighlights: BasketReplayClip[] = [];
  private replayElapsed = 0;
  private replayDuration = 2.4;

  private osBloomBoost = 0.2;
  private osParticleScale = 1.1;

  // Pre-allocated zero-GC scratch math vectors
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _v4 = new THREE.Vector3();
  private readonly _goalCamPos = new THREE.Vector3();
  private readonly _goalLookPos = new THREE.Vector3();
  private readonly _comicSol = {
    cameraPos: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    fov: 32,
    dutchTiltDeg: 0,
    azimuthDeg: 0,
    fitnessScore: 90,
  };
  private readonly _compatSceneState: Record<string, any> = {
    scoreA: 0,
    scoreB: 0,
    currentSet: 1,
    rallyCount: 0,
    setsA: 0,
    setsB: 0,
    ballSpeedKmh: 0,
    momentumA: 30,
    momentumB: 30,
    hyperDriveActive: false,
    ceremonyPhase: 'NONE',
    audioEQ: null,
    crowdMood: null,
    matchEvolution: null,
    matchState: 'PLAY',
  };

  private state: BasketGameState;

  constructor(
    container: HTMLElement,
    onStateChange: (state: BasketGameState) => void,
    startAtBillboard = false
  ) {
    this.container = container;
    this.onStateChange = onStateChange;

    const evo: MatchEvolutionState = {
      stage: 'OPENING_BREEZE',
      mode: 'AUTO_EVOLVE',
      intensity: 0.16,
      dustLevel: 0.12,
      sandLevel: 0.04,
      rainLevel: 0,
      wetnessLevel: 0,
      avgSweatLevel: 0.08,
      windX: 0.4,
      windZ: 0.2,
      elapsedSeconds: 0,
    };

    this.state = {
      screenMode: 'MAIN_MENU',
      introCutscene: {
        phase: startAtBillboard ? 'BILLBOARD_FULLSCREEN' : 'ORBIT_STADIUM',
        phaseElapsed: 0,
        selectedPreset: 'HARBOUR_PULSE',
        pendingFormat: 'QUICK_21',
        subBannerText: startAtBillboard
          ? 'SELECT YOUR MUSIC · PRESS PLAY TO LAUNCH'
          : 'COAL HARBOUR ARENA · VANCOUVER 3X3',
        musicSelected: true,
      },
      matchFormat: 'QUICK_21',
      matchState: 'CHECK_BALL',
      controlMode: 'PLAYER',
      scoreA: 0,
      scoreB: 0,
      targetScore: 21,
      possessionTeam: 'A',
      arcCleared: true,
      shotClock: 12.0,
      checkTimer: 0.85,
      ballHandlerId: 1,
      activeCyanId: 1,
      activePlayerName: 'ISHIKAWA',
      activePlayerJersey: 14,
      activePlayCall: 'PICK_AND_ROLL',
      defenseSchemeB: 'SWITCH_EVERYTHING',
      defenseSchemeA: 'MAN_TO_MAN',
      cameraAngle: 'BROADCAST',
      cameraFilter: 'VICE_NEON',
      cameraLens: '35MM_CINE',
      graphicsQuality: 'HIGH',
      weather: 'SUNSET',
      courtSurface: 'OLYMPIC_BLUE',
      difficulty: 'PRO',
      ballSpeedKmh: 0,
      lastShotSummary: 'CHECK BALL AT TOP OF THE KEY',
      liveCommentaryLine: 'AIM VANCOUVER 3X3 · COAL HARBOUR STADIUM LIVE',
      studioCoachCallout: 'Google Studio AI ready — drive the lane, hit a hitbox, or kick at the Goalie!',
      actionLog: [
        'WASD/Tap court to move · HOLD SPACE Shoot/Dunk · Q Pass/Switch · E Cross/Steal · Click players for Optical Contact!',
      ],
      shotMeter: {
        isCharging: false,
        chargeLevel: 0,
        sweetSpotStart: 0.66,
        sweetSpotEnd: 0.88,
        previewType: 'ARC_2PT',
        lastTimingGrade: 'NONE',
        lastActionLabel: 'READY',
        comboStreak: 0,
      },
      slideMeter: this.slideShotMeterEngine.getState(),
      flowTelemetry: {
        flowState: 'HALFCOURT_SET',
        flowMeter: 28,
        hotTeam: 'NEUTRAL',
        tempoLabel: 'HALFCOURT SET',
        onFirePlayerName: null,
      },
      comicStrike: {
        active: false,
        calloutText: 'POSTER DUNK!',
        subText: '#14 ISHIKAWA',
        speedKmh: 92,
        phase: 'IDLE',
        chainStage: 'READY',
        timeScale: 0.25,
        dutchTiltDeg: -6,
        screenX: 0.5,
        screenY: 0.4,
        intensity: 0,
      },
      matchEvolution: evo,
      crowdMood: {
        excitement: 0.3,
        waveActive: false,
        cheerLabel: 'VANCOUVER 3X3!',
        decibelLevel: 82,
      },
      introBillboardEQ: {
        trackName: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 0.85,
        bassLevel: 0.2,
        midLevel: 0.2,
        highLevel: 0.2,
        bins: new Array(32).fill(0.15),
      },
      introSelectedPreset: 'HARBOUR_PULSE',
      replayState: {
        active: false,
        clipIndex: 0,
        totalClips: 0,
        currentClip: null,
        currentAngle: 'NET_TAPE_SWEEP',
        angleIndex: 0,
        progress: 0,
        playbackSpeed: 0.28,
      },
      savedHighlightsCount: 0,
      postFXEnabled: true,
      particlesEnabled: true,
      voiceAnnouncerEnabled: false,
      spikeCamEnabled: true,
      aiCameraEnabled: true,
      oneTapControlEnabled: true,
      ankleBreaker: {
        active: false,
        reactionDelayMs: 240,
        frozenDefenderName: null,
        cooldownSec: 0,
      },
      fps: 60,
      streakA: 0,
      streakB: 0,
      opticalContact: {
        overlayEnabled: false,
        activeHitboxCount: 30,
        hoveredTargetLabel: null,
        hoveredZone: null,
        selectedTargetId: null,
        lastContactLabel: 'OPTICAL PROXIMITY RIG ONLINE · 30 HITBOXES',
        totalContacts: 0,
        proximityAlerts: 0,
        closestMatchupMeters: 9.9,
        recentEvents: [],
      },
      bouncePhysics: {
        activeFormFrames: 0,
        ballSpinRpm: 0,
        lastBounceSurface: 'OLYMPIC_BLUE',
        lastRestitution: 0.75,
        lastNormalE: 0.75,
        lastTangentialE: 0.78,
        entryAngleDeg: 46,
        flightApexM: 3.8,
        lastSpinKickKmh: 0,
        bounceCount: 0,
        continuousChainSummary: 'READY',
        eventChain: [],
      },
      soccerGoalie: {
        stance: 'READY',
        saves: 0,
        goalsConceded: 0,
        shotsFaced: 0,
        lastOutcome: 'COAL HARBOUR PK STATION READY',
        shotInFlight: false,
      },
      stealTelemetry: {
        activeLunge: false,
        lastOutcome: 'NONE',
        lastStealerName: null,
        stealCountA: 0,
        stealCountB: 0,
        pursuitTargetId: null,
        windowLabel: '1-TAP STEAL READY',
      },
      celebrationCutscene: {
        active: false,
        type: 'NONE',
        title: '',
        scorerName: '',
        scorerJersey: 14,
        team: 'A',
        durationSec: 1.85,
        elapsedSec: 0,
        canSkip: false,
      },
      lastPassStyle: 'CHEST_LASER',
    };

    this.initScene();
    this.buildArenaAndBillboard();
    this.buildTeamsAndBall();
    this.setWeather('SUNSET');
    this.setupListeners();
    this.resetCheckBall('A', true);
    this.poseIntroFormation();
    this.registerWithKernel();
    this.dspEngine.playPresetTrack('HARBOUR_PULSE');
    this.start();
  }

  private initScene() {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16072b);
    this.scene.fog = new THREE.Fog(0x16072b, 76, 300);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 460);
    this.camera.position.copy(this.baseCamPos);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    const gl = this.renderer.getContext();
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const rStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rStr);
      if (this.isSoftwareGl) {
        this.renderer.shadowMap.enabled = false;
      }
    }

    this.container.appendChild(this.renderer.domElement);

    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.envRenderTarget = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = this.envRenderTarget.texture;
      this.scene.environmentIntensity = 0.38;
    } catch {
      this.scene.environment = null;
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 38;
    this.controls.enablePan = false;
    this.controls.target.copy(this.baseCamTarget);
    this.controls.update();

    this.postFX = new PS6PostFXPipeline(
      this.renderer,
      this.scene,
      this.camera,
      this.isSoftwareGl
    );
    this.postFX.setEnabled(!this.isSoftwareGl);
    this.postFX.setQualityPreset('HIGH');

    this.ambientLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.78);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff6e9, 2.35);
    this.sunLight.position.set(16, 26, 12);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 70;
    this.sunLight.shadow.camera.left = -16;
    this.sunLight.shadow.camera.right = 16;
    this.sunLight.shadow.camera.top = 16;
    this.sunLight.shadow.camera.bottom = -16;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLightA = new THREE.DirectionalLight(0x00f0ff, 0.78);
    this.rimLightA.position.set(-14, 12, -16);
    this.scene.add(this.rimLightA);

    this.rimLightB = new THREE.DirectionalLight(0xff3d7f, 0.72);
    this.rimLightB.position.set(14, 12, 16);
    this.scene.add(this.rimLightB);
  }

  private buildArenaAndBillboard() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.courtSystem = new BasketballCourtSystem(this.scene, maxAniso, this.isSoftwareGl);
    this.stadiumSystem = new BasketballStadiumSystem(this.stadiumGroup, maxAniso, this.isSoftwareGl);
    this.crowdSystem = new CrowdSystem(this.stadiumGroup);
    this.vipSuites = new VIPSuitesSystem(this.stadiumGroup, maxAniso);
    this.scene.add(this.stadiumGroup);

    // Coastal Beach Trees (visible in BEACH mode)
    for (const [px, pz] of [[-12.5, -14], [12.5, -14], [-12.5, 14], [12.5, 14]]) {
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

    // Giant AIM VANCOUVER 32-Band EQ Billboard + Flanking Woofer Speaker Towers Behind Hoop (z = -18.5, y = 9.4)
    this.jumbotronCanvas = document.createElement('canvas');
    this.jumbotronCanvas.width = 1024;
    this.jumbotronCanvas.height = 384;
    this.jumbotronCtx = this.jumbotronCanvas.getContext('2d')!;
    this.jumbotronTex = new THREE.CanvasTexture(this.jumbotronCanvas);
    this.jumbotronTex.colorSpace = THREE.SRGBColorSpace;
    this.jumbotronTex.anisotropy = maxAniso;

    const bbGrp = new THREE.Group();
    bbGrp.position.set(0, 9.4, -18.5);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.72, roughness: 0.28 });
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(16.4, 6.45, 0.55), frameMat);
    bezel.position.set(0, 0, -0.32);
    bbGrp.add(bezel);

    this.billboardTopNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const topNeon = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.22, 0.65), this.billboardTopNeonMat);
    topNeon.position.set(0, 3.28, -0.15);
    bbGrp.add(topNeon);

    this.billboardBotNeonMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    const botNeon = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.2, 0.65), this.billboardBotNeonMat);
    botNeon.position.set(0, -3.28, -0.15);
    bbGrp.add(botNeon);

    const boardPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(15.6, 5.85),
      new THREE.MeshBasicMaterial({ map: this.jumbotronTex })
    );
    bbGrp.add(boardPlane);

    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 10.2, 0.65), pylonMat);
      pylon.position.set(side * 6.8, -5.0, -0.55);
      bbGrp.add(pylon);

      const spkTower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.8, 0.8), frameMat);
      spkTower.position.set(side * 9.0, 0, -0.18);
      bbGrp.add(spkTower);

      for (const wy of [-1.75, 0, 1.75]) {
        const cone = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.48, 24),
          new THREE.MeshBasicMaterial({
            color: side < 0 ? 0x00f0ff : 0xff3d7f,
            side: THREE.DoubleSide,
          })
        );
        cone.position.set(side * 9.0, wy, 0.24);
        bbGrp.add(cone);
        this.introBillboardSpeakerRings.push(cone);
      }
    }
    this.scene.add(bbGrp);

    // Coal Harbour Skyline, Outer City District, Stadium Personnel, Soccer Goalie & Particles
    this.vancouverSkyline = new VancouverSkyline(this.scene, maxAniso);
    this.vancouverCity = new VancouverCityDistrict(this.scene, maxAniso);
    this.stadiumPersonnel = new StadiumPersonnelSystem(this.scene);
    this.stadiumPersonnel.setBasketballSidelineLayout();
    this.soccerGoalie = new BasketballSoccerGoalie(this.scene, maxAniso, this.isSoftwareGl);
    this.particleSystem = new AtmosphericParticleSystem(this.scene, 1.0);
    this.ballisticBridge = new BallisticRaycasterBridge(this.scene, BALL_RADIUS, GRAVITY, 3.05, 8);
    this.contactEngine = new BasketballContactEngine(this.scene);
    this.bounceSystem = new BasketballBounceSystem(this.scene);

    this.oceanMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({ color: 0x061d34, roughness: 0.22, metalness: 0.45 })
    );
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.y = -0.35;
    this.scene.add(this.oceanMesh);
  }

  private buildBasketballPlayerMesh(
    team: 'A' | 'B',
    name: string,
    num: number,
    profile: PlayerProfileMeta
  ): { parts: PlayerParts; floorRing: THREE.Mesh; floorSprite: THREE.Mesh } {
    const group = new THREE.Group();
    const isHero = team === 'A' && num === 14;
    const teamColor = isHero ? 0xff6b1a : team === 'A' ? 0x00f0ff : 0xff3d7f;
    const secondaryColor = isHero ? 0x0d0f14 : team === 'A' ? 0x090612 : 0x1e0814;

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    if (isHero) {
      const vestGrad = ctx.createLinearGradient(0, 0, 0, 512);
      vestGrad.addColorStop(0, '#14171f');
      vestGrad.addColorStop(0.5, '#1e202c');
      vestGrad.addColorStop(1, '#1a120b');
      ctx.fillStyle = vestGrad;
      ctx.fillRect(0, 0, 512, 512);

      // Breathable pro mesh micro-dots
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let y = 16; y < 500; y += 12) {
        for (let x = 16; x < 500; x += 12) {
          ctx.fillRect(x, y, 4, 4);
        }
      }

      ctx.fillStyle = '#ff6b1a';
      ctx.fillRect(0, 0, 512, 42);
      ctx.fillRect(0, 470, 512, 42);
      ctx.fillRect(92, 42, 26, 428);
      ctx.fillRect(394, 42, 26, 428);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(118, 42, 6, 428);
      ctx.fillRect(388, 42, 6, 428);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.font = '900 36px sans-serif';
      ctx.fillText('AIM VANCOUVER', 256, 118);
      ctx.fillStyle = '#ff6b1a';
      ctx.font = '900 176px sans-serif';
      ctx.fillText(String(num), 256, 336);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(name.slice(0, 10), 256, 412);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      if (team === 'A') {
        grad.addColorStop(0, '#00d8f6');
        grad.addColorStop(1, '#03598c');
      } else {
        grad.addColorStop(0, '#ff3d7f');
        grad.addColorStop(1, '#881337');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 16; y < 500; y += 12) {
        for (let x = 16; x < 500; x += 12) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#090612';
      ctx.fillRect(0, 0, 512, 38);
      ctx.fillRect(0, 472, 512, 40);
      ctx.fillStyle = team === 'A' ? '#ffb347' : '#f8fafc';
      ctx.fillRect(70, 38, 12, 434);
      ctx.fillRect(430, 38, 12, 434);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(name.slice(0, 10), 256, 124);
      ctx.font = '900 184px sans-serif';
      ctx.fillText(String(num), 256, 344);
    }

    const jerseyTex = new THREE.CanvasTexture(c);
    jerseyTex.colorSpace = THREE.SRGBColorSpace;
    jerseyTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const skinMat = new THREE.MeshStandardMaterial({ color: profile.skinToneHex, roughness: 0.45, metalness: 0.04 });
    const jerseyMat = this.characterShaderRig.enhanceJerseyMaterial(
      new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.44, metalness: 0.14 }),
      num + (team === 'A' ? 0 : 100),
      teamColor
    );
    const shortsMat = new THREE.MeshStandardMaterial({ color: secondaryColor, roughness: 0.56, metalness: 0.16 });
    const trimAccentMat = new THREE.MeshStandardMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: 0.38,
      roughness: 0.32,
      metalness: 0.18,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: num % 2 === 0 ? 0x161214 : 0x3b2314,
      roughness: 0.82,
    });
    const kneePadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65 });

    const hips = new THREE.Group();
    hips.position.y = 0.88;
    group.add(hips);

    // Sculpted pro basketball shorts with athletic side stripes
    const shortsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.194, 0.28, 20), shortsMat);
    shortsMesh.position.y = 0.015;
    shortsMesh.castShadow = !this.isSoftwareGl;
    hips.add(shortsMesh);

    for (const side of [-1, 1]) {
      const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.12), trimAccentMat);
      sideStripe.position.set(side * 0.175, 0.01, 0);
      hips.add(sideStripe);
    }

    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.166, 0.045, 20), trimAccentMat);
    waistband.position.y = 0.145;
    hips.add(waistband);

    const torso = new THREE.Group();
    torso.position.y = 0.10;
    hips.add(torso);

    // Tapered athletic torso V-taper + broad shoulder yoke + armhole trim
    const chestMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.208, 0.152, 0.47, 22), jerseyMat);
    chestMesh.position.y = 0.25;
    chestMesh.castShadow = !this.isSoftwareGl;
    torso.add(chestMesh);

    const shoulderYoke = new THREE.Mesh(new THREE.CapsuleGeometry(0.148, 0.21, 10, 16), jerseyMat);
    shoulderYoke.rotation.z = Math.PI / 2;
    shoulderYoke.position.y = 0.455;
    torso.add(shoulderYoke);

    const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.02, 10, 20), trimAccentMat);
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = 0.515;
    torso.add(collarRing);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.07, 0.16, 14), skinMat);
    neckMesh.position.y = 0.55;
    torso.add(neckMesh);

    const head = new THREE.Group();
    head.position.y = 0.64;
    torso.add(head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.124, 22, 20), skinMat);
    headMesh.scale.set(0.94, 1.08, 0.99);
    headMesh.castShadow = !this.isSoftwareGl;
    head.add(headMesh);

    // Sculpted jaw, nose bridge & ears for close-up camera fidelity
    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.068, 0.115), skinMat);
    jawMesh.position.set(0, -0.058, 0.028);
    head.add(jawMesh);

    const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.036), skinMat);
    noseMesh.position.set(0, 0.0, 0.116);
    head.add(noseMesh);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), skinMat);
      ear.scale.set(0.45, 0.95, 0.72);
      ear.position.set(s * 0.118, 0.005, 0);
      head.add(ear);
    }

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairMesh.scale.set(0.96, 1.05, 1.02);
    hairMesh.position.y = 0.02;
    hairMesh.rotation.x = -0.2;
    head.add(hairMesh);

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

    if (profile.accessory === 'BASEBALL_CAP') {
      const capOrange = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.42, metalness: 0.08 });
      const capBlack = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.5, metalness: 0.16 });
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.134, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capOrange
      );
      crown.scale.set(0.98, 1.04, 1.02);
      crown.position.y = 0.036;
      crown.rotation.x = -0.12;
      head.add(crown);

      const capBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.135, 0.135, 0.024, 18, 1, true),
        capBlack
      );
      capBand.position.y = 0.042;
      capBand.rotation.x = -0.12;
      head.add(capBand);

      const capButton = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), capBlack);
      capButton.position.set(0, 0.172, -0.012);
      head.add(capButton);

      const emblemBg = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.044, 0.018), capBlack);
      emblemBg.position.set(0, 0.072, 0.124);
      emblemBg.rotation.x = -0.18;
      head.add(emblemBg);

      const emblemStripe = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.014, 0.02), capOrange);
      emblemStripe.position.set(0, 0.072, 0.127);
      emblemStripe.rotation.x = -0.18;
      head.add(emblemStripe);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.172, 0.014, 0.115), capBlack);
      visor.position.set(0, 0.036, 0.155);
      visor.rotation.x = 0.14;
      head.add(visor);
    } else if (profile.accessory === 'HEADBAND') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.034, 18, 1, true), trimAccentMat);
      band.position.y = 0.044;
      band.rotation.x = -0.14;
      head.add(band);
    } else if (profile.accessory === 'VISOR') {
      const visorMat = new THREE.MeshStandardMaterial({
        color: teamColor,
        emissive: teamColor,
        emissiveIntensity: 0.75,
        roughness: 0.15,
        metalness: 0.7,
      });
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.036, 0.065), visorMat);
      visor.position.set(0, 0.014, 0.105);
      head.add(visor);
    }

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x090612 });
    const browMat = new THREE.MeshStandardMaterial({ color: 0x161214, roughness: 0.7 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), eyeMat);
      eye.position.set(s * 0.04, 0.014, 0.113);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.016), browMat);
      brow.position.set(s * 0.04, 0.032, 0.114);
      brow.rotation.z = s * -0.08;
      head.add(eye, brow);
    }

    const buildArm = (isRight: boolean) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(isRight ? -0.22 : 0.22, 0.45, 0);
      torso.add(shoulder);
      const armUpper = new THREE.Group();
      shoulder.add(armUpper);
      // Tapered athletic bicep/tricep + deltoid
      const upperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.043, 0.23, 12), skinMat);
      upperMesh.position.y = -0.115;
      upperMesh.castShadow = !this.isSoftwareGl;
      armUpper.add(upperMesh);

      const shoulderCap = new THREE.Mesh(
        new THREE.SphereGeometry(isHero ? 0.058 : 0.064, 12, 12),
        isHero
          ? skinMat
          : new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.44, metalness: 0.14 })
      );
      armUpper.add(shoulderCap);

      // Captain band on PG (#14, #6)
      if ((num === 14 || num === 6) && !isRight) {
        const captainBand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.051, 0.051, 0.046, 12),
          trimAccentMat
        );
        captainBand.position.y = -0.1;
        armUpper.add(captainBand);
      }

      const armLower = new THREE.Group();
      armLower.position.set(0, -0.23, 0);
      armUpper.add(armLower);
      const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), skinMat);
      armLower.add(elbowJoint);

      const lowerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.032, 0.22, 12), skinMat);
      lowerMesh.position.y = -0.11;
      lowerMesh.castShadow = !this.isSoftwareGl;
      armLower.add(lowerMesh);

      if (isRight || profile.accessory === 'ARM_SLEEVE') {
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.19, 12), shortsMat);
        sleeve.position.y = -0.105;
        armLower.add(sleeve);

        const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.042, 12), trimAccentMat);
        wristband.position.y = -0.198;
        armLower.add(wristband);
      }
      // Articulated palm + thumb pocket + finger bevel for realistic ball release
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.078, 0.032), skinMat);
      hand.position.set(0, -0.236, 0.008);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.022), skinMat);
      thumb.position.set(isRight ? 0.032 : -0.032, 0.006, 0.012);
      thumb.rotation.z = isRight ? -0.42 : 0.42;
      hand.add(thumb);
      armLower.add(hand);
      return { shoulder, armUpper, armLower, hand };
    };
    const leftArm = buildArm(false);
    const rightArm = buildArm(true);

    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32, metalness: 0.08 });
    const outsoleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 });
    const buildLeg = (side: -1 | 1) => {
      const legUpper = new THREE.Group();
      legUpper.position.set(side * 0.105, -0.02, 0);
      hips.add(legUpper);
      // Tapered athletic quad
      const thighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.058, 0.37, 14), skinMat);
      thighMesh.position.y = -0.185;
      thighMesh.castShadow = !this.isSoftwareGl;
      legUpper.add(thighMesh);
      const shortHem = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.09, 0.14, 14), shortsMat);
      shortHem.position.y = -0.07;
      legUpper.add(shortHem);

      const legLower = new THREE.Group();
      legLower.position.set(0, -0.38, 0);
      legUpper.add(legLower);
      // Tapered gastrocnemius calf muscle
      const shinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.038, 0.36, 14), skinMat);
      shinMesh.position.y = -0.18;
      shinMesh.castShadow = !this.isSoftwareGl;
      legLower.add(shinMesh);

      const kneePad = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.1, 14), kneePadMat);
      kneePad.position.y = -0.04;
      legLower.add(kneePad);

      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.044, 0.13, 14), shoeMat);
      sock.position.y = -0.31;
      legLower.add(sock);

      // Multi-part sculpted high-top basketball sneaker (outsole, cushioned midsole, upper, tongue & ankle collar)
      const shoes = new THREE.Group();
      shoes.position.set(0, -0.39, 0.038);
      legLower.add(shoes);
      const upperShoe = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.074, 0.242), shoeMat);
      upperShoe.position.y = 0.008;
      const outsole = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.022, 0.248), outsoleMat);
      outsole.position.y = -0.036;
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.044, 0.09), trimAccentMat);
      collar.position.set(0, 0.032, -0.068);
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.048, 0.04), trimAccentMat);
      tongue.position.set(0, 0.042, 0.02);
      tongue.rotation.x = -0.3;
      shoes.add(upperShoe, outsole, collar, tongue);
      return { legUpper, legLower, shoes };
    };
    const leftLeg = buildLeg(1);
    const rightLeg = buildLeg(-1);

    group.scale.setScalar(profile.heightScale || 1.0);

    // Volleyball-matched 4x4 Sprite Kinetic Floor Coordination Plate & Aura Ring
    const auraMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.56, 24),
      new THREE.MeshBasicMaterial({
        color: teamColor,
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

    const floorSprite = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.41, 16),
      new THREE.MeshBasicMaterial({
        color: teamColor,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    floorSprite.rotation.x = -Math.PI / 2;
    floorSprite.position.y = 0.024;
    floorSprite.renderOrder = 2;
    group.add(floorSprite);

    const arrowGeo = new THREE.ConeGeometry(0.13, 0.34, 3);
    arrowGeo.rotateX(Math.PI / 2);
    const vectorArrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.45, depthWrite: false })
    );
    vectorArrow.scale.set(1.0, 0.08, 1.0);
    vectorArrow.position.set(0, 0.032, 0.48);
    vectorArrow.renderOrder = 3;
    group.add(vectorArrow);

    const parts: PlayerParts = {
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

    return { parts, floorRing: auraMesh, floorSprite };
  }

  private buildTeamsAndBall() {
    const createTeam = (team: 'A' | 'B', roster: typeof ROSTER_A) => {
      roster.forEach((info, i) => {
        const id = this.units.length + 1;
        const mappedVolleyRole =
          info.role === 'PG' ? 'Setter' : info.role === 'WING' ? 'Outside' : 'Middle';
        const profile = getDefaultPlayerProfile(info.name, mappedVolleyRole, info.num, team);
        if (team === 'A' && info.num === 14) profile.accessory = 'BASEBALL_CAP';
        if (info.role === 'BIG') profile.heightScale = 1.08;
        if (info.role === 'PG') profile.heightScale = 0.98;

        const { parts, floorRing, floorSprite } = this.buildBasketballPlayerMesh(
          team,
          info.name,
          info.num,
          profile
        );
        const startX = i === 0 ? 0 : i === 1 ? -4.1 : 4.1;
        const startZ = team === 'A' ? (i === 0 ? 2.85 : 1.1) : i === 0 ? 0.5 : -2.2;
        parts.group.position.set(startX, 0, startZ);
        parts.group.rotation.y = Math.PI;
        this.scene.add(parts.group);

        const stats: UnitStats = {
          awareness: info.role === 'PG' ? 1.18 : 1.02,
          power: info.role === 'BIG' ? 1.38 : 1.15,
          accuracy: info.role === 'PG' || info.role === 'WING' ? 1.24 : 1.02,
          vertical: info.role === 'BIG' ? 6.4 : info.role === 'WING' ? 6.1 : 5.4,
        };

        this.units.push({
          id,
          name: info.name,
          team,
          role: info.role,
          jerseyNumber: info.num,
          parts,
          mesh: parts.group,
          speed: info.role === 'PG' ? 7.6 : info.role === 'WING' ? 7.15 : 6.45,
          actualSpeed: 0,
          targetPos: parts.group.position.clone(),
          velocity: new THREE.Vector3(),
          yVel: 0,
          isJumping: false,
          animState: 'READY_STANCE',
          animTimer: 0,
          stepCycle: 0,
          hasBall: false,
          stunTimer: 0,
          stats,
          profile,
          sweatLevel: 0.08,
          stamina: 100,
          guardingId: null,
          currentLeanPitch: 0,
          currentLeanRoll: 0,
          landingCompression: 0,
          splitStepTimer: 0,
          scuffCooldown: 0,
          wasInAir: false,
          screenActiveTimer: 0,
          floorRingMesh: floorRing,
          floorSpriteMesh: floorSprite,
        });
      });
    };

    createTeam('A', ROSTER_A);
    createTeam('B', ROSTER_B);

    const teamA = this.units.filter((u) => u.team === 'A');
    const teamB = this.units.filter((u) => u.team === 'B');
    teamA.forEach((u, idx) => (u.guardingId = teamB[idx].id));
    teamB.forEach((u, idx) => (u.guardingId = teamA[idx].id));

    // Register 30 Real-Time Anatomical Hitboxes with Optical Contact Engine
    this.contactEngine.registerUnits(this.units);
    this.state.opticalContact.activeHitboxCount = this.units.length * 5;

    // Layered AIM Pro Series 2024 Basketball Skin (Cropped, Spherically Un-projected & Extended)
    this.ballSkinMaps = createAIMBasketballSkin(this.renderer, this.isSoftwareGl);
    this.ball = new THREE.Group();
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 36, 36),
      new THREE.MeshStandardMaterial({
        map: this.ballSkinMaps.map,
        bumpMap: this.ballSkinMaps.bumpMap,
        bumpScale: 0.0085,
        roughnessMap: this.ballSkinMaps.roughnessMap,
        roughness: 0.88,
        metalness: 0.05,
      })
    );
    this.ballMesh.castShadow = !this.isSoftwareGl;
    this.ball.add(this.ballMesh);
    this.scene.add(this.ball);

    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.032;
    this.ballShadow.renderOrder = 4;
    this.scene.add(this.ballShadow);

    this.aimReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    this.aimReticle.rotation.x = -Math.PI / 2;
    this.aimReticle.position.set(0, 0.036, 2.65);
    this.aimReticle.visible = false;
    this.scene.add(this.aimReticle);

    // Shot Landing / Arc Prediction Marker under hoop + Live 3D Trajectory Ribbon
    this.shotTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.31, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    this.shotTargetRing.rotation.x = -Math.PI / 2;
    this.shotTargetRing.position.set(HOOP_POS.x, 0.034, HOOP_POS.z);
    this.shotTargetRing.visible = false;
    this.scene.add(this.shotTargetRing);

    this.shotArcGeo = new THREE.BufferGeometry().setFromPoints(this.slideShotMeterEngine.previewPoints);
    this.shotArcLine = new THREE.Line(
      this.shotArcGeo,
      new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.72,
      })
    );
    this.shotArcLine.visible = false;
    this.shotArcLine.frustumCulled = false;
    this.scene.add(this.shotArcLine);
  }

  private getHeroUnit(): BasketUnit {
    return (
      this.units.find((u) => u.team === 'A' && u.jerseyNumber === 14) || this.units[0]
    );
  }

  private poseIntroFormation() {
    const hero = this.getHeroUnit();
    this.units.forEach((u, idx) => {
      u.isJumping = false;
      u.yVel = 0;
      u.velocity.set(0, 0, 0);
      u.animState = 'READY_STANCE';
      const xOff = u.id === hero.id ? 0 : (idx % 2 === 0 ? -1 : 1) * (2.2 + (idx % 3) * 1.1);
      const zOff = u.id === hero.id ? 3.2 : u.team === 'A' ? 2.4 : -0.6;
      u.mesh.position.set(xOff, 0, zOff);
      u.mesh.lookAt(xOff, 0, -18.5);
    });
  }

  // =========================================================================
  // VOLLEYBALL-MATCHED INTRO & BILLBOARD MP3 PLAYER FLOW
  // =========================================================================
  public replayIntroCutscene() {
    this.tryUnlockAudio();
    this.stopReplay();
    this.state.screenMode = 'MAIN_MENU';
    this.state.introCutscene.phase = 'ORBIT_STADIUM';
    this.state.introCutscene.phaseElapsed = 0;
    this.state.introCutscene.subBannerText = 'COAL HARBOUR ARENA · VANCOUVER 3X3';
    this.introBounceTriggered = false;
    this.bounceSystem.clearFormFrames();
    this.poseIntroFormation();
    this.notifyState();
  }

  public cutToBillboardFocus() {
    this.state.screenMode = 'MAIN_MENU';
    this.state.introCutscene.phase = 'BILLBOARD_FULLSCREEN';
    this.state.introCutscene.phaseElapsed = 0;
    this.state.introCutscene.subBannerText = 'SELECT YOUR MUSIC · PRESS PLAY TO LAUNCH';
    this.bounceSystem.clearFormFrames();
    this.poseIntroFormation();
    this.notifyState();
  }

  public selectIntroMusicPreset(preset: IntroMusicPresetId) {
    this.selectMusicPreset(preset);
    this.state.introCutscene.selectedPreset = preset;
    this.state.introCutscene.musicSelected = preset !== 'SILENT';
    this.notifyState();
  }

  public launchFromIntroWithBallSwoosh(format: BasketMatchFormat) {
    this.tryUnlockAudio();
    this.state.introCutscene.pendingFormat = format;
    this.state.matchFormat = format;
    this.state.controlMode = format === 'AI_SHOWCASE' ? 'AUTO' : 'PLAYER';
    const started = this.dspEngine.resumeOrAutoStartMusic(this.state.introSelectedPreset);
    this.state.introSelectedPreset = started.preset;
    this.state.introCutscene.selectedPreset = started.preset;

    this.state.screenMode = 'MAIN_MENU';
    this.state.introCutscene.phase = 'BALL_SWOOSH_TO_FEET';
    this.state.introCutscene.phaseElapsed = 0;
    this.state.introCutscene.subBannerText = 'TIP-OFF INCOMING · VANCOUVER 3X3';
    this.introBounceTriggered = false;

    this.poseIntroFormation();
    this.ball.visible = true;
    this.ball.position.set(0, 9.6, -18.0);
    this.ballPosPrev.copy(this.ball.position);
    this.bounceSystem.notifyRelease(this.ball.position, this._v1.set(0, -3, 14), 'PASS');
    this.audioEngine.playIntroBallSwoosh(this.dspEngine.getDestination());
    this.notifyState();
  }

  public setScreenMode(mode: BasketScreenMode) {
    this.state.screenMode = mode;
    if (mode === 'MAIN_MENU') {
      this.cutToBillboardFocus();
      return;
    }
    this.ball.visible = true;
    this.notifyState();
  }

  // =========================================================================
  // LISTENERS & REAL-TIME OPTICAL POINTER RAYCASTING
  // =========================================================================
  private setupListeners() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('pointerup', this.handleWindowPointerUp);
    window.addEventListener('blur', this.handleWindowPointerUp);

    const dom = this.renderer.domElement;
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);

    this.controls.addEventListener('start', () => {
      this.isUserOrbiting = true;
      this.goalieFocusTimer = 0;
    });
    this.controls.addEventListener('end', () => {
      this.isUserOrbiting = false;
      this.userOrbitPauseTimer = 2.4;
    });
  }

  private handleWindowPointerUp = () => {
    if (this.state.shotMeter.isCharging) {
      this.releaseShotOrBlock();
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.webglLost = true;
    cometicOSKernel.logEvent(
      'SELF-HEAL',
      'WebGL2 Context lost on 3v3 Basketball viewport — initiating recovery.',
      'warn'
    );
  };

  private handleContextRestored = () => {
    this.webglLost = false;
    cometicOSKernel.logEvent('SELF-HEAL', 'WebGL2 Context restored cleanly by autonomous OS.', 'heal');
  };

  private tryUnlockAudio() {
    if (this.audioUnlocked && this.dspEngine.mp3Playing) return;
    this.audioUnlocked = true;
    const bus = this.dspEngine.getDestination();
    if (bus && bus.ctx.state === 'suspended') {
      bus.ctx.resume().catch(() => {});
    }
    if (this.state.introSelectedPreset !== 'SILENT') {
      this.dspEngine.resumeOrAutoStartMusic(this.state.introSelectedPreset);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    this.tryUnlockAudio();
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const code = e.code;
    this.keysDown.add(code);

    if (this.state.screenMode !== 'PLAYING') return;

    if (
      this.state.matchState === 'SCORE_CELEBRATION' &&
      this.state.celebrationCutscene.active &&
      this.state.celebrationCutscene.canSkip &&
      (code === 'Space' || code === 'KeyQ' || code === 'Enter')
    ) {
      e.preventDefault();
      this.skipCelebrationCutscene();
      return;
    }

    if (code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.beginShotOrBlockCharge();
    } else if (code === 'KeyQ' && !e.repeat) {
      e.preventDefault();
      this.triggerPassOrSwitch();
    } else if (code === 'KeyE' && !e.repeat) {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastKeyEMs < 320 && this.getHandler()?.team === 'A') {
        this.triggerSpecialAnkleBreaker();
        this.lastKeyEMs = 0;
      } else {
        this.lastKeyEMs = now;
        this.triggerCrossoverOrSteal();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
    if (e.code === 'Space') {
      this.releaseShotOrBlock();
    }
  };

  private updateRayFromEvent(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouseNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this._mouseNDC, this.camera);
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (this.state.screenMode !== 'PLAYING') return;
    if (this.pointerHoverTimer < 0.03) return;
    this.pointerHoverTimer = 0;
    this.updateRayFromEvent(e);
    const hit = this.contactEngine.raycastPointer(this.raycaster.ray);
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.tryUnlockAudio();
    if (e.button !== 0 || this.state.screenMode !== 'PLAYING') return;

    if (this.state.matchState === 'SCORE_CELEBRATION' && this.state.celebrationCutscene.active) {
      if (this.state.celebrationCutscene.canSkip) {
        this.skipCelebrationCutscene();
      }
      return;
    }

    this.updateRayFromEvent(e);

    // 1. Check Coal Harbour Soccer Goalie / Penalty Zone Click!
    const goalHits = this.raycaster.intersectObjects(this.soccerGoalie.clickableMeshes, false);
    if (goalHits.length > 0) {
      if (this.soccerGoalie.triggerPenaltyShot()) {
        this.audioEngine.playSoccerKick(this.dspEngine.getDestination());
        this.pushLog('PENALTY CHALLENGE: Soccer shot fired at Coal Harbour Keeper #1!');
        this.notifyState();
      }
      return;
    }

    const handler = this.getHandler();
    const boxHit = this.contactEngine.raycastPointer(this.raycaster.ray);

    // 2. One-Tap Steal on Moving/Dribbling or Shooting Opponent!
    const activeThreatB: BasketUnit | null =
      handler && handler.team === 'B'
        ? handler
        : this.shooterUnit &&
          this.shooterUnit.team === 'B' &&
          (this.state.matchState === 'SHOT_FLIGHT' || this.state.matchState === 'DUNK_FLIGHT')
        ? this.shooterUnit
        : null;

    if (
      this.state.oneTapControlEnabled &&
      this.state.controlMode === 'PLAYER' &&
      activeThreatB
    ) {
      const oppTorsoPos = this._v1.copy(activeThreatB.mesh.position).setY(1.1);
      const nearOppTorso = this.raycaster.ray.distanceToPoint(oppTorsoPos) < 1.35;
      const nearBall = this.raycaster.ray.distanceToPoint(this.ball.position) < 1.15;
      if (boxHit?.unitId === activeThreatB.id || nearOppTorso || nearBall) {
        this.attemptSteal(this.getActiveCyan(), activeThreatB, 'ONE_TAP');
        return;
      }
    }

    // 3. One-Tap Hoop Area -> Direct Shoot / Dunk!
    if (
      this.state.oneTapControlEnabled &&
      this.state.controlMode === 'PLAYER' &&
      handler &&
      handler.team === 'A' &&
      (this.state.matchState === 'LIVE_PLAY' || this.state.matchState === 'CHECK_BALL')
    ) {
      const distToHoopRay = this.raycaster.ray.distanceToPoint(HOOP_POS);
      if (distToHoopRay < 1.15) {
        if (this.state.matchState === 'CHECK_BALL') this.state.matchState = 'LIVE_PLAY';
        this.executeShotOrDunk(handler, 0.75);
        return;
      }
    }

    // 4. Double-Tap Detection -> Special Ankle-Breaker with Natural Reaction Time!
    const now = performance.now();
    const tapDistPx = Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY);
    const isDoubleTap = now - this.lastTapMs < 330 && tapDistPx < 56;
    this.lastTapMs = now;
    this.lastTapX = e.clientX;
    this.lastTapY = e.clientY;

    const floorHit = new THREE.Vector3();
    const hitFloor = this.raycaster.ray.intersectPlane(this.floorPlane, floorHit) !== null;

    if (
      isDoubleTap &&
      this.state.oneTapControlEnabled &&
      this.state.controlMode === 'PLAYER' &&
      handler &&
      handler.team === 'A'
    ) {
      if (this.state.matchState === 'CHECK_BALL') this.state.matchState = 'LIVE_PLAY';
      this.triggerSpecialAnkleBreaker(hitFloor ? floorHit : undefined);
      return;
    }

    // 5. One-Tap Teammate Pass when tapping near a teammate!
    if (
      this.state.oneTapControlEnabled &&
      this.state.controlMode === 'PLAYER' &&
      handler &&
      handler.team === 'A' &&
      !boxHit
    ) {
      for (const mate of this.getTeamUnits('A')) {
        if (mate.id === handler.id) continue;
        if (this.raycaster.ray.distanceToPoint(this._v1.copy(mate.mesh.position).setY(1.1)) < 1.15) {
          if (this.state.matchState === 'CHECK_BALL') this.state.matchState = 'LIVE_PLAY';
          this.executePass(handler, mate);
          return;
        }
      }
    }

    // 6. Check Real-Time Optical Player Hitbox Click!
    if (boxHit) {
      this.interactWithHitbox(boxHit.unitId, boxHit.zone, boxHit.point);
      return;
    }

    // 7. One-Tap Move Active Cyan Player on Open Court (clears steal pursuit lock)
    if (this.state.controlMode !== 'PLAYER') return;
    this.stealPursuitTargetId = null;
    this.state.stealTelemetry.pursuitTargetId = null;
    if (hitFloor) {
      floorHit.x = THREE.MathUtils.clamp(floorHit.x, -COURT_W / 2 + 0.4, COURT_W / 2 - 0.4);
      floorHit.z = THREE.MathUtils.clamp(floorHit.z, -COURT_D / 2 + 0.4, COURT_D / 2 - 0.4);
      this.pointerTarget = floorHit;
      this.aimReticle.position.set(floorHit.x, 0.036, floorHit.z);
      this.aimReticle.visible = true;
    }
  };

  /**
   * Dynamic Optical Hitbox Interaction (called by 3D click OR HUD quick-target).
   */
  public interactWithHitbox(
    targetUnitId: number,
    zone: string = 'TORSO',
    point?: THREE.Vector3
  ) {
    const target = this.units.find((u) => u.id === targetUnitId);
    if (!target) return;

    const pt = point || target.mesh.position.clone().setY(1.2);
    this.contactEngine.setSelectedTarget(target.id, pt, `#${target.jerseyNumber} ${target.name}`, this.elapsedTime);

    const handler = this.getHandler();
    const activeCyan = this.getActiveCyan();

    if (target.team === 'A') {
      if (
        handler &&
        handler.team === 'A' &&
        handler.id !== target.id &&
        (this.state.matchState === 'LIVE_PLAY' || this.state.matchState === 'CHECK_BALL')
      ) {
        if (this.state.matchState === 'CHECK_BALL') this.state.matchState = 'LIVE_PLAY';
        this.executePass(handler, target);
      } else {
        this.state.activeCyanId = target.id;
        this.state.activePlayerName = target.name;
        this.state.activePlayerJersey = target.jerseyNumber;
        this.pushLog(`OPTICAL CONTROL LOCK: Switched to #${target.jerseyNumber} ${target.name}.`);
      }
    } else {
      // Dynamic interaction with Opponent hitbox: Steal while moving/shooting OR Screen/Check
      const isActiveShooter =
        this.shooterUnit?.id === target.id &&
        (this.state.matchState === 'SHOT_FLIGHT' || this.state.matchState === 'DUNK_FLIGHT');
      if (target.hasBall || isActiveShooter) {
        this.attemptSteal(activeCyan, target, 'ONE_TAP');
        return;
      } else if (zone === 'TORSO') {
        target.screenActiveTimer = 0.9;
        this.audioEngine.playBodyScreenThump(this.dspEngine.getDestination(), 0.75);
        this.pushLog(`OPTICAL SCREEN LOCK: Bumped #${target.jerseyNumber} ${target.name}'s torso OBB!`);
      } else {
        target.stunTimer = 0.6;
        target.animState = 'SLUMP';
        this.pushLog(`OPTICAL HAND CHECK: Interrupted #${target.jerseyNumber} ${target.name}'s ${zone}!`);
      }
    }
    this.notifyState();
  }

  // =========================================================================
  // OS KERNEL SELF-HEALING & ORCHESTRATOR INTEGRATION
  // =========================================================================
  private registerWithKernel() {
    cometicOSKernel.registerEngineHooks({
      getHealthReport: (): EngineHealthReport => {
        const audio = this.dspEngine.getDestination();
        const oob = this.units.filter(
          (u) => Math.abs(u.mesh.position.x) > 12.5 || Math.abs(u.mesh.position.z) > 10.5
        ).length;
        return {
          fps: this.state.fps,
          webglLost: this.webglLost,
          stalledSeconds: this.stalledTimer,
          outOfBoundsCount: oob + (this.ball.position.length() > 35 ? 1 : 0),
          audioSuspended: Boolean(
            this.state.introBillboardEQ.isPlaying && audio && audio.ctx.state === 'suspended'
          ),
          scoreA: this.state.scoreA,
          scoreB: this.state.scoreB,
          shotClock: this.state.shotClock,
          possessionTeam: this.state.possessionTeam,
        };
      },
      selfHeal: (reason: string) => {
        this.stalledTimer = 0;
        this.webglLost = false;
        this.units.forEach((u) => {
          u.mesh.position.x = THREE.MathUtils.clamp(u.mesh.position.x, -7.2, 7.2);
          u.mesh.position.z = THREE.MathUtils.clamp(u.mesh.position.z, -5.2, 5.2);
          if (u.mesh.position.y < 0) u.mesh.position.y = 0;
        });
        if (this.ball.position.length() > 30 || this.ball.position.y < -0.5) {
          this.resetCheckBall(this.state.possessionTeam, false);
        }
        if (this.state.fps < 28 && !this.isSoftwareGl) {
          this.renderer.setPixelRatio(0.85);
          this.postFX.setQualityPreset('MEDIUM');
        }
        this.dspEngine.resumeOrAutoStartMusic(this.state.introSelectedPreset);
        this.pushLog(`OS SELF-HEAL: ${reason}`);
        this.notifyState();
        return 'Rescued court positions, stabilized clock & synced DSP/PostFX';
      },
      applyCometicModulation: (mod: CometicKernelState['shaderModulation']) => {
        this.osBloomBoost = mod.bloomBoost;
        this.osParticleScale = mod.particleScale;
        this.postFX?.setQualityPreset(mod.bloomBoost > 0.3 ? 'ULTRA_PS6' : 'HIGH');
      },
      applyStudioDirective: (dir: StudioOrchestrationResult['gameDirective']) => {
        this.state.activePlayCall = dir.playCall;
        this.state.defenseSchemeB = dir.defenseCall;
        this.state.studioCoachCallout = dir.coachCallout;
        this.state.liveCommentaryLine = dir.broadcastLine;
        this.notifyState();
      },
      injectFault: (subsystem: SubsystemId) => {
        if (subsystem === 'basketball-3v3-core') {
          this.stalledTimer = 6.2;
          this.pushLog('DIAGNOSTIC FAULT: 3v3 Shot Clock / Physics stall injected.');
        } else if (subsystem === 'webgl2-renderer') {
          this.webglLost = true;
          this.pushLog('DIAGNOSTIC FAULT: Simulated WebGL2 pipeline drop.');
        }
      },
    });
  }

  // =========================================================================
  // GAME RULES, CHECK-BALL, SCORING & PLAYER CONTROLS
  // =========================================================================
  private getTeamUnits(team: 'A' | 'B'): BasketUnit[] {
    return this.units.filter((u) => u.team === team);
  }

  private getHandler(): BasketUnit | null {
    return this.units.find((u) => u.id === this.state.ballHandlerId) || null;
  }

  private getActiveCyan(): BasketUnit {
    return (
      this.units.find((u) => u.id === this.state.activeCyanId && u.team === 'A') ||
      this.getTeamUnits('A')[0]
    );
  }

  private isOutsideTwoPointArc(pos: THREE.Vector3): boolean {
    const dx = pos.x - HOOP_POS.x;
    const dz = pos.z - HOOP_POS.z;
    const dist = Math.hypot(dx, dz);
    return dist >= ARC_RADIUS || (Math.abs(pos.x) >= 6.6 && pos.z <= -2.9);
  }

  public startNewMatch(format: BasketMatchFormat, controlMode?: 'PLAYER' | 'AUTO') {
    this.tryUnlockAudio();
    this.stopReplay();
    this.state.screenMode = 'PLAYING';
    this.state.matchFormat = format;
    this.state.controlMode = controlMode ?? (format === 'AI_SHOWCASE' ? 'AUTO' : 'PLAYER');
    this.state.scoreA = 0;
    this.state.scoreB = 0;
    this.state.streakA = 0;
    this.state.streakB = 0;
    this.state.targetScore = format === 'PRACTICE' ? 99 : 21;
    this.state.shotMeter.comboStreak = 0;
    this.bounceSystem.clearFormFrames();
    this.resetCheckBall('A', true);
    this.setCameraAngle(this.state.cameraAngle);
    this.pushLog(`Tip-off! 3v3 ${format.replace('_', ' ')} match underway.`);
    cometicOSKernel.logEvent('HOOPS-3V3', `Started new 3v3 Basketball match (${format}).`, 'info');
    this.notifyState();
  }

  private resetCheckBall(offenseTeam: 'A' | 'B', resetClock = true) {
    this.state.possessionTeam = offenseTeam;
    this.state.matchState = 'CHECK_BALL';
    this.state.arcCleared = true;
    if (resetClock) this.state.shotClock = 12.0;
    this.state.checkTimer = 0.85;
    this.state.shotMeter.isCharging = false;
    this.state.shotMeter.chargeLevel = 0;
    this.slideShotMeterEngine.cancel();
    this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
    this.pointerTarget = null;
    this.aimReticle.visible = false;
    this.shotTargetRing.visible = false;
    if (this.shotArcLine) this.shotArcLine.visible = false;
    this.shooterUnit = null;
    this.lastDunkSlamUnit = null;
    this.passTargetUnit = null;
    this.shotHasHitRim = false;
    this.shotAscentTimer = 0;
    this.looseBallPickupDelay = 0;
    this.queuedShotOnCatch = false;
    this.queuedShotCharge = null;
    this.stealPursuitTargetId = null;
    this.state.stealTelemetry.pursuitTargetId = null;
    this.state.stealTelemetry.activeLunge = false;
    this.state.celebrationCutscene.active = false;
    this.state.celebrationCutscene.type = 'NONE';
    this.celebrationCompanionUnit = null;
    this.ballMesh?.scale.set(1, 1, 1);
    this.bounceSystem?.clearFormFrames();

    const off = this.getTeamUnits(offenseTeam);
    const def = this.getTeamUnits(offenseTeam === 'A' ? 'B' : 'A');

    const offCoords = [
      new THREE.Vector3(0, 0, 2.75),
      new THREE.Vector3(-4.8, 0, 0.4),
      new THREE.Vector3(4.8, 0, 0.4),
    ];
    const defCoords = [
      new THREE.Vector3(0, 0, 0.75),
      new THREE.Vector3(-3.0, 0, -1.6),
      new THREE.Vector3(3.0, 0, -1.6),
    ];

    off.forEach((u, i) => {
      u.mesh.position.copy(offCoords[i]);
      u.targetPos.copy(offCoords[i]);
      u.velocity.set(0, 0, 0);
      u.yVel = 0;
      u.isJumping = false;
      u.stunTimer = 0;
      u.hasBall = i === 0;
      u.animState = i === 0 ? 'TRIPLE_THREAT' : 'READY_STANCE';
      u.mesh.lookAt(HOOP_POS.x, 0, HOOP_POS.z);
    });

    def.forEach((u, i) => {
      u.mesh.position.copy(defCoords[i]);
      u.targetPos.copy(defCoords[i]);
      u.velocity.set(0, 0, 0);
      u.yVel = 0;
      u.isJumping = false;
      u.stunTimer = 0;
      u.hasBall = false;
      u.animState = 'READY_STANCE';
      u.mesh.lookAt(offCoords[i].x, 0, offCoords[i].z);
    });

    const pg = off[0];
    this.state.ballHandlerId = pg.id;
    if (offenseTeam === 'A') {
      this.state.activeCyanId = pg.id;
      this.state.activePlayerName = pg.name;
      this.state.activePlayerJersey = pg.jerseyNumber;
    } else {
      const topDef = this.getTeamUnits('A')[0];
      this.state.activeCyanId = topDef.id;
      this.state.activePlayerName = topDef.name;
      this.state.activePlayerJersey = topDef.jerseyNumber;
    }

    this.ball.position.set(pg.mesh.position.x + 0.28, 1.05, pg.mesh.position.z - 0.15);
    this.ballPosPrev.copy(this.ball.position);
    this.ballVel.set(0, 0, 0);
  }

  public beginShotOrBlockCharge() {
    this.tryUnlockAudio();
    if (this.state.screenMode !== 'PLAYING') return;
    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
      this.state.checkTimer = 0;
    }
    if (this.state.matchState !== 'LIVE_PLAY') return;

    const handler = this.getHandler();
    const passInFlightToCyan = this.passTargetUnit && this.passTargetUnit.team === 'A' ? this.passTargetUnit : null;

    if ((handler && handler.team === 'A') || passInFlightToCyan) {
      const shooter = handler && handler.team === 'A' ? handler : passInFlightToCyan!;
      this.queuedShotOnCatch = Boolean(!handler && passInFlightToCyan);
      this.queuedShotCharge = null;

      if (this.state.activeCyanId !== shooter.id) {
        this.state.activeCyanId = shooter.id;
        this.state.activePlayerName = shooter.name;
        this.state.activePlayerJersey = shooter.jerseyNumber;
      }
      this.slideShotMeterEngine.beginGather(0.14);
      const sol = this.slideShotMeterEngine.solveTrajectoryEnvelope(
        shooter,
        this.getTeamUnits('B'),
        HOOP_POS,
        this.isOutsideTwoPointArc(shooter.mesh.position),
        this.state.flowTelemetry.flowMeter,
        0.14
      );
      this.state.shotMeter.isCharging = true;
      this.state.shotMeter.chargeLevel = 0.14;
      this.state.shotMeter.sweetSpotStart = sol.sweetSpotStart;
      this.state.shotMeter.sweetSpotEnd = sol.sweetSpotEnd;
      this.state.shotMeter.previewType = sol.previewType;
      this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
      this.syncShotArcLineGeometry(0x00f0ff);
      this.shotArcLine.visible = true;
      this.shotTargetRing.visible = true;
      if (!this.queuedShotOnCatch) {
        this.bounceSystem.startNewChain(
          'HAND_GATHER',
          'GATHER',
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          this.elapsedTime
        );
      }
      this.notifyState();
    } else if (this.state.controlMode === 'PLAYER') {
      const def = this.getActiveCyan();
      if (!def.isJumping) {
        def.isJumping = true;
        def.yVel = def.stats.vertical * 0.94;
        def.animState = 'BLOCK_LEAP';
        def.animTimer = 0;
        def.mesh.lookAt(HOOP_POS.x, 0, HOOP_POS.z);
        this.particleSystem.emitDustBurst(def.mesh.position, 8, 0.75);
        this.pushLog(`#${def.jerseyNumber} ${def.name} leaps for the block!`);
      }
    }
  }

  public setSlideShotLevel(normalized01: number) {
    if (!this.state.shotMeter.isCharging) return;
    this.slideShotMeterEngine.setManualSlideLevel(normalized01);
    this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
    this.state.shotMeter.chargeLevel = this.state.slideMeter.sliderValue;
  }

  public cancelShotCharge() {
    this.queuedShotOnCatch = false;
    this.queuedShotCharge = null;
    this.slideShotMeterEngine.cancel();
    this.state.shotMeter.isCharging = false;
    this.state.shotMeter.chargeLevel = 0;
    this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
    this.shotArcLine.visible = false;
    this.shotTargetRing.visible = false;
    this.notifyState();
  }

  private syncShotArcLineGeometry(colorHex: number) {
    if (!this.shotArcGeo || !this.shotArcLine) return;
    const posAttr = this.shotArcGeo.getAttribute('position') as THREE.BufferAttribute;
    const pts = this.slideShotMeterEngine.previewPoints;
    const count = Math.min(posAttr.count, pts.length);
    for (let i = 0; i < count; i++) {
      posAttr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    }
    posAttr.needsUpdate = true;
    (this.shotArcLine.material as THREE.LineBasicMaterial).color.setHex(colorHex);
  }

  private computeShotPreview(unit: BasketUnit): BasketShotPreview {
    const dist = Math.hypot(unit.mesh.position.x - HOOP_POS.x, unit.mesh.position.z - HOOP_POS.z);
    if (dist < 3.45 && unit.mesh.position.z < 0.2) return 'POSTER_DUNK';
    if (dist < 4.4) return 'LAYUP';
    return this.isOutsideTwoPointArc(unit.mesh.position) ? 'ARC_2PT' : 'MID_1PT';
  }

  public releaseShotOrBlock() {
    if (!this.state.shotMeter.isCharging && !this.queuedShotOnCatch) return;
    this.state.shotMeter.isCharging = false;
    this.shotTargetRing.visible = false;
    this.shotArcLine.visible = false;

    const handler = this.getHandler();
    // If pass to Cyan is still airborne when player releases shoot button, queue immediate catch-and-shoot!
    if (!handler && this.passTargetUnit && this.passTargetUnit.team === 'A' && this.state.matchState === 'LIVE_PLAY') {
      const capturedCharge = THREE.MathUtils.clamp(this.slideShotMeterEngine.getState().sliderValue, 0.04, 1.0);
      this.queuedShotOnCatch = true;
      this.queuedShotCharge = capturedCharge;
      this.slideShotMeterEngine.cancel();
      this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
      this.pushLog(`CATCH & SHOOT QUEUED (${Math.round(capturedCharge * 100)}% PWR)`);
      this.notifyState();
      return;
    }

    this.queuedShotOnCatch = false;
    this.queuedShotCharge = null;

    if (!handler || handler.team !== 'A') {
      this.slideShotMeterEngine.cancel();
      this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
      this.notifyState();
      return;
    }
    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
    }
    if (this.state.matchState !== 'LIVE_PLAY') {
      this.slideShotMeterEngine.cancel();
      this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
      this.notifyState();
      return;
    }
    const released = this.slideShotMeterEngine.release(
      handler,
      this.getTeamUnits('B'),
      HOOP_POS,
      this.isOutsideTwoPointArc(handler.mesh.position),
      this.state.flowTelemetry.flowMeter
    );
    this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };
    this.executeShotOrDunk(handler, released);
  }

  public triggerPassOrSwitch() {
    this.tryUnlockAudio();
    if (this.state.screenMode !== 'PLAYING') return;
    if (this.state.matchState === 'SCORE_CELEBRATION' && this.state.celebrationCutscene.canSkip) {
      this.skipCelebrationCutscene();
      return;
    }
    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
      this.state.checkTimer = 0;
    }
    if (this.state.matchState !== 'LIVE_PLAY' || this.passTargetUnit) return;

    const handler = this.getHandler();
    if (handler && handler.team === 'A') {
      const teammates = this.getTeamUnits('A').filter((u) => u.id !== handler.id);
      const best = this.passingEngine.selectBestTeammate(
        handler,
        teammates,
        this.getTeamUnits('B'),
        this.contactEngine,
        HOOP_POS,
        this.state.arcCleared,
        (pos) => this.isOutsideTwoPointArc(pos)
      );
      if (best) this.executePass(handler, best);
    } else {
      const cyan = this.getTeamUnits('A');
      const idx = cyan.findIndex((u) => u.id === this.state.activeCyanId);
      const next = cyan[(idx + 1) % cyan.length];
      this.state.activeCyanId = next.id;
      this.state.activePlayerName = next.name;
      this.state.activePlayerJersey = next.jerseyNumber;
      this.notifyState();
    }
  }

  /**
   * Double-Tap Special Ankle-Breaker with Natural Human Reaction Latency!
   * Nearby defenders hold their pre-fake velocity for `reactionDelay` (~180-330ms) before
   * reacting — if caught inside closeout proximity moving at pace, their stance slips!
   */
  public triggerSpecialAnkleBreaker(worldTarget?: THREE.Vector3) {
    this.tryUnlockAudio();
    if (this.state.screenMode !== 'PLAYING' || this.ankleBreakerCooldown > 0) return;
    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
      this.state.checkTimer = 0;
    }
    if (this.state.matchState !== 'LIVE_PLAY') return;

    const handler = this.getHandler();
    if (!handler || handler.team !== 'A') return;

    this.ankleBreakerCooldown = 1.15;
    handler.animState = 'ANKLE_BREAKER';
    handler.animTimer = 0;
    handler.splitStepTimer = 0.34;
    this.dribbleHandSide = this.dribbleHandSide === 1 ? -1 : 1;
    this.ballCarryBlendTimer = 0.14;

    const dirX = worldTarget
      ? worldTarget.x - handler.mesh.position.x
      : HOOP_POS.x - handler.mesh.position.x;
    const dirZ = worldTarget
      ? worldTarget.z - handler.mesh.position.z
      : HOOP_POS.z - handler.mesh.position.z;
    const len = Math.max(0.01, Math.hypot(dirX, dirZ));
    const nx = dirX / len;
    const nz = dirZ / len;
    const latSign = this.dribbleHandSide;
    handler.velocity.set(
      nx * 9.2 - nz * latSign * 4.8,
      0,
      nz * 9.2 + nx * latSign * 4.8
    );
    if (worldTarget) {
      this.pointerTarget = worldTarget.clone();
      this.aimReticle.position.set(worldTarget.x, 0.036, worldTarget.z);
      this.aimReticle.visible = true;
    }

    this.activeDutchTiltDeg = latSign * 5.8;
    this.courtSystem.triggerRipple(handler.mesh.position.x, handler.mesh.position.z, 1.7, this.elapsedTime);
    this.particleSystem.emitDustBurst(handler.mesh.position, 14, 1.05);
    this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());
    this.bounceSystem.notifyRelease(this.ball.position, handler.velocity, 'DRIBBLE');

    // Queue realistic human visual-motor reaction latency for defending players within threat radius
    const baseDelay =
      this.state.difficulty === 'ROOKIE' ? 0.32 : this.state.difficulty === 'PRO' ? 0.23 : 0.27;
    let avgReactionMs = Math.round(baseDelay * 1000);

    for (const def of this.getTeamUnits('B')) {
      const d = def.mesh.position.distanceTo(handler.mesh.position);
      if (d < 3.6 && def.stunTimer <= 0) {
        const delay = THREE.MathUtils.clamp(
          baseDelay + (1 - def.stats.awareness) * 0.08 + (100 - def.stamina) * 0.001,
          0.16,
          0.35
        );
        avgReactionMs = Math.round(delay * 1000);
        // Replace existing queued reaction if re-crossed
        const existing = this.pendingReactions.find((r) => r.defenderId === def.id && !r.resolved);
        if (existing) {
          existing.committedVx = def.velocity.x;
          existing.committedVz = def.velocity.z;
          existing.reactionDelay = delay;
          existing.elapsed = 0;
          existing.anchorPos.copy(handler.mesh.position);
        } else {
          this.pendingReactions.push({
            defenderId: def.id,
            committedVx: def.velocity.x,
            committedVz: def.velocity.z,
            reactionDelay: delay,
            elapsed: 0,
            anchorPos: handler.mesh.position.clone(),
            resolved: false,
          });
        }
      }
    }

    this.state.ankleBreaker = {
      active: true,
      reactionDelayMs: avgReactionMs,
      frozenDefenderName: null,
      cooldownSec: Number(this.ankleBreakerCooldown.toFixed(1)),
    };
    this.ankleBreakerBannerTimer = 1.65;
    this.state.lastShotSummary = `DOUBLE-TAP ANKLE BREAKER · ${avgReactionMs}MS REACTION TEST!`;
    this.notifyState();
  }

  public triggerCrossoverOrSteal() {
    this.tryUnlockAudio();
    if (this.state.screenMode !== 'PLAYING') return;
    if (this.state.matchState === 'SCORE_CELEBRATION' && this.state.celebrationCutscene.canSkip) {
      this.skipCelebrationCutscene();
      return;
    }
    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
      this.state.checkTimer = 0;
    }

    const handler = this.getHandler();
    if (handler && handler.team === 'A' && this.state.matchState === 'LIVE_PLAY') {
      handler.animState = 'CROSSOVER';
      handler.animTimer = 0;
      handler.splitStepTimer = 0.25;
      this.dribbleHandSide = this.dribbleHandSide === 1 ? -1 : 1;
      const toHoop = this._v1
        .set(HOOP_POS.x - handler.mesh.position.x, 0, HOOP_POS.z - handler.mesh.position.z)
        .normalize();
      const side = this.dribbleHandSide;
      handler.velocity.set(
        toHoop.x * 8.2 - toHoop.z * side * 4.2,
        0,
        toHoop.z * 8.2 + toHoop.x * side * 4.2
      );
      this.activeDutchTiltDeg = side * 4.2;
      this.courtSystem.triggerRipple(handler.mesh.position.x, handler.mesh.position.z, 1.5, this.elapsedTime);
      this.particleSystem.emitDustBurst(handler.mesh.position, 10, 0.85);
      this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());

      for (const def of this.getTeamUnits('B')) {
        if (def.mesh.position.distanceTo(handler.mesh.position) < 1.65) {
          def.stunTimer = 1.1;
          def.animState = 'SLUMP';
          this.contactEngine.recordExternalContact(
            'BODY_BUMP',
            `#${handler.jerseyNumber} ${handler.name}`,
            `#${def.jerseyNumber} ${def.name}`,
            'STANCE',
            0.9,
            def.mesh.position.clone().setY(0.25),
            this.elapsedTime,
            0x00f0ff
          );
          this.state.lastShotSummary = `ANKLE BREAKER BY #${handler.jerseyNumber} ${handler.name}!`;
          this.pushLog(`CROSSOVER! #${handler.jerseyNumber} shook #${def.jerseyNumber}!`);
        }
      }
      this.notifyState();
      return;
    }

    // Defense: One-Tap / Manual Steal while Opponent is Moving with Ball OR Rising to Shoot/Dunk!
    const oppTarget =
      handler && handler.team === 'B'
        ? handler
        : this.shooterUnit &&
          this.shooterUnit.team === 'B' &&
          (this.state.matchState === 'SHOT_FLIGHT' || this.state.matchState === 'DUNK_FLIGHT')
        ? this.shooterUnit
        : null;

    if (oppTarget) {
      this.attemptSteal(this.getActiveCyan(), oppTarget, this.state.oneTapControlEnabled ? 'ONE_TAP' : 'MANUAL');
    } else {
      this.notifyState();
    }
  }

  /**
   * Full Real-Time Steal Engine supporting:
   *  - ONE_TAP auto-pursuit closeout & immediate steal swipe
   *  - Moving / dribbling ball-handler steals (`CLEAN_RIP`, `POKE_LOOSE`, `REACH_MISS`)
   *  - Shooting / dunk gather strips (`SHOOTING_STRIP` during ascent or dunk flight)
   */
  public attemptSteal(
    stealer: BasketUnit,
    target: BasketUnit | null,
    mode: 'ONE_TAP' | 'MANUAL'
  ) {
    if (this.state.screenMode !== 'PLAYING' || this.stealCooldown > 0) return;

    if (this.state.matchState === 'CHECK_BALL') {
      this.state.matchState = 'LIVE_PLAY';
      this.state.checkTimer = 0;
    }

    const isShootingWindow =
      this.shooterUnit &&
      this.shooterUnit.team !== stealer.team &&
      ((this.state.matchState === 'SHOT_FLIGHT' && this.shotAscentTimer < 0.36 && this.ball.position.y < 3.1) ||
        (this.state.matchState === 'DUNK_FLIGHT' && this.dunkProgress < 0.56));

    // 1. Shooting / Dunk Gather Strip!
    if (isShootingWindow && this.shooterUnit) {
      const shooter = this.shooterUnit;
      const dBallXZ = Math.hypot(this.ball.position.x - stealer.mesh.position.x, this.ball.position.z - stealer.mesh.position.z);
      const reachY = stealer.mesh.position.y + (stealer.isJumping ? 2.68 : 2.15);

      if (mode === 'ONE_TAP' && dBallXZ > 2.45 && dBallXZ <= 6.2 && stealer.team === 'A') {
        const dx = this.ball.position.x - stealer.mesh.position.x;
        const dz = this.ball.position.z - stealer.mesh.position.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        stealer.velocity.set((dx / len) * stealer.speed * 1.32, 0, (dz / len) * stealer.speed * 1.32);
        stealer.animState = 'STEAL_LUNGE';
        stealer.animTimer = 0;
        this.pushLog(`1-TAP CONTEST LUNGE: #${stealer.jerseyNumber} closing to strip #${shooter.jerseyNumber}!`);
        this.notifyState();
        return;
      }

      if (dBallXZ <= 2.45 && this.ball.position.y <= reachY + 0.55) {
        this.stealCooldown = 0.68;
        this.stealPursuitTargetId = null;
        this.state.stealTelemetry.pursuitTargetId = null;
        this.state.stealTelemetry.activeLunge = true;
        stealer.animState = 'STEAL_LUNGE';
        stealer.animTimer = 0;
        stealer.mesh.lookAt(shooter.mesh.position.x, 0, shooter.mesh.position.z);
        if (!stealer.isJumping && this.ball.position.y > 1.75) {
          stealer.isJumping = true;
          stealer.yVel = stealer.stats.vertical * 0.56;
        }

        const cleanRip = dBallXZ < 1.65;
        this.state.matchState = 'LIVE_PLAY';
        this.shooterUnit = null;
        this.passTargetUnit = null;
        this.shotAscentTimer = 0;
        this.state.comicStrike.active = false;
        this.hitStopTimer = 0.04;
        this.cameraShake = 0.45;
        this.bounceSystem.clearFormFrames();

        if (stealer.team === 'A') this.state.stealTelemetry.stealCountA += 1;
        else this.state.stealTelemetry.stealCountB += 1;
        this.state.stealTelemetry.lastOutcome = 'SHOOTING_STRIP';
        this.state.stealTelemetry.lastStealerName = `#${stealer.jerseyNumber} ${stealer.name}`;
        this.state.stealTelemetry.windowLabel = 'SHOT STRIPPED!';

        if (cleanRip) {
          stealer.hasBall = true;
          this.state.ballHandlerId = stealer.id;
          this.state.possessionTeam = stealer.team;
          this.state.shotClock = 12.0;
          this.state.arcCleared = this.isOutsideTwoPointArc(stealer.mesh.position);
          if (stealer.team === 'A') {
            this.state.activeCyanId = stealer.id;
            this.state.activePlayerName = stealer.name;
            this.state.activePlayerJersey = stealer.jerseyNumber;
          }
        } else {
          this.state.ballHandlerId = null;
          this.looseBallPickupDelay = 0.26;
          const rx = this.ball.position.x - shooter.mesh.position.x;
          const rz = this.ball.position.z - shooter.mesh.position.z;
          const rLen = Math.max(0.01, Math.hypot(rx, rz));
          this.ballVel.set((rx / rLen) * 5.8 + (Math.random() - 0.5) * 2.2, 2.4, (rz / rLen) * 5.8 + (Math.random() - 0.5) * 2.2);
          this.ballSpin.set(8, 12, -6);
        }

        shooter.stunTimer = 0.65;
        this.contactEngine.recordExternalContact(
          'STEAL_STRIP',
          `#${stealer.jerseyNumber} ${stealer.name}`,
          `#${shooter.jerseyNumber} ${shooter.name}`,
          'HAND_R',
          0.98,
          this.ball.position.clone(),
          this.elapsedTime,
          stealer.team === 'A' ? 0x00f0ff : 0xff3d7f
        );
        this.bounceSystem.recordPhysicsEvent(
          'OPTICAL_DEFLECT',
          'SHOOTING STRIP',
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          0.8,
          this.elapsedTime
        );
        this.particleSystem.emitDustBurst(this.ball.position, 14, 1.0);
        this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);
        this.audioEngine.playArenaHorn(this.dspEngine.getDestination(), 'WHISTLE');
        this.state.lastShotSummary = `SHOOTING STRIP! #${stealer.jerseyNumber} ${stealer.name} RIPS #${shooter.jerseyNumber}'S SHOT!`;
        this.state.liveCommentaryLine = `STRIPPED IN MID-AIR! #${stealer.jerseyNumber} DISARMS THE SHOOTER!`;
        this.pushLog(`SHOOTING STRIP! #${stealer.jerseyNumber} steals #${shooter.jerseyNumber}'s shot!`);
        this.notifyState();
        return;
      }
    }

    // 2. Moving / Dribbling Handler Steal
    const handler = target && target.hasBall ? target : this.getHandler();
    if (!handler || handler.team === stealer.team || this.state.matchState !== 'LIVE_PLAY') return;

    const d = stealer.mesh.position.distanceTo(handler.mesh.position);
    if (mode === 'ONE_TAP' && d > 2.65 && d <= 6.8 && stealer.team === 'A') {
      this.stealPursuitTargetId = handler.id;
      this.state.stealTelemetry.pursuitTargetId = handler.id;
      this.state.stealTelemetry.windowLabel = 'CLOSING TO STEAL';
      this.pointerTarget = handler.mesh.position.clone();
      this.aimReticle.position.set(handler.mesh.position.x, 0.036, handler.mesh.position.z);
      this.aimReticle.visible = true;
      this.pushLog(`1-TAP STEAL LOCK: #${stealer.jerseyNumber} sprinting to pick #${handler.jerseyNumber}!`);
      this.notifyState();
      return;
    }

    this.stealCooldown = 0.62;
    this.stealPursuitTargetId = null;
    this.state.stealTelemetry.pursuitTargetId = null;
    this.state.stealTelemetry.activeLunge = true;
    stealer.animState = 'STEAL_LUNGE';
    stealer.animTimer = 0;
    stealer.mesh.lookAt(handler.mesh.position.x, 0, handler.mesh.position.z);

    const dx = handler.mesh.position.x - stealer.mesh.position.x;
    const dz = handler.mesh.position.z - stealer.mesh.position.z;
    const len = Math.max(0.01, Math.hypot(dx, dz));
    stealer.velocity.set((dx / len) * 6.8, 0, (dz / len) * 6.8);

    // Compute Steal Success from Reach Proximity + Dribble Exposure + Handler Motion + Approach Angle
    const proximityScore = THREE.MathUtils.clamp(1 - d / 2.65, 0, 1);
    const bounceExposed = Math.sin(this.dribblePhase % Math.PI) < 0.65 ? 0.22 : 0.05;
    const motionExposure = handler.actualSpeed > 3.2 ? 0.14 : 0.04;
    const stunBonus = handler.stunTimer > 0 ? 0.35 : 0;
    const fwdX = Math.sin(handler.mesh.rotation.y);
    const fwdZ = Math.cos(handler.mesh.rotation.y);
    const facingDot = (-(dx / len)) * fwdX + (-(dz / len)) * fwdZ;
    const angleBonus = facingDot > -0.15 ? 0.16 : -0.1;

    const totalScore = proximityScore * 0.65 + bounceExposed + motionExposure + stunBonus + angleBonus;
    let outcome: StealOutcomeKind = 'REACH_MISS';

    if (d <= 2.65 && (totalScore >= 0.56 || d < 1.38)) {
      outcome = 'CLEAN_RIP';
    } else if (d <= 2.65 && (totalScore >= 0.34 || d < 2.05)) {
      outcome = 'POKE_LOOSE';
    }

    this.state.stealTelemetry.lastOutcome = outcome;
    this.state.stealTelemetry.lastStealerName = `#${stealer.jerseyNumber} ${stealer.name}`;

    if (outcome === 'CLEAN_RIP') {
      handler.hasBall = false;
      handler.stunTimer = 0.72;
      handler.animState = 'SLUMP';
      stealer.hasBall = true;
      this.state.ballHandlerId = stealer.id;
      this.state.possessionTeam = stealer.team;
      this.state.shotClock = 12.0;
      this.state.arcCleared = this.isOutsideTwoPointArc(stealer.mesh.position);
      this.dribblePhase = Math.PI * 0.5;
      this.ballCarryBlendTimer = 0.12;
      if (stealer.team === 'A') {
        this.state.stealTelemetry.stealCountA += 1;
        this.state.activeCyanId = stealer.id;
        this.state.activePlayerName = stealer.name;
        this.state.activePlayerJersey = stealer.jerseyNumber;
      } else {
        this.state.stealTelemetry.stealCountB += 1;
      }
      this.state.stealTelemetry.windowLabel = 'CLEAN RIP STEAL!';
      this.contactEngine.recordExternalContact(
        'STEAL_STRIP',
        `#${stealer.jerseyNumber} ${stealer.name}`,
        `#${handler.jerseyNumber} ${handler.name}`,
        'HAND_R',
        0.95,
        this.ball.position.clone(),
        this.elapsedTime,
        stealer.team === 'A' ? 0x00f0ff : 0xff3d7f
      );
      this.particleSystem.emitDustBurst(stealer.mesh.position, 10, 0.9);
      this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);
      this.audioEngine.playArenaHorn(this.dspEngine.getDestination(), 'WHISTLE');
      this.state.lastShotSummary = `CLEAN RIP STEAL BY #${stealer.jerseyNumber} ${stealer.name}!`;
      this.state.liveCommentaryLine = `TURNOVER! #${stealer.jerseyNumber} ${stealer.name} RIPS THE DRIBBLE FREE!`;
      this.pushLog(`STEAL! #${stealer.jerseyNumber} picks #${handler.jerseyNumber}'s pocket!`);
    } else if (outcome === 'POKE_LOOSE') {
      handler.hasBall = false;
      handler.stunTimer = 0.48;
      this.state.ballHandlerId = null;
      this.looseBallPickupDelay = 0.26;
      const latX = -dz / len;
      const latZ = dx / len;
      this.ballVel.set(
        (dx / len) * 5.4 + latX * (Math.random() > 0.5 ? 2.8 : -2.8),
        2.5,
        (dz / len) * 5.4 + latZ * (Math.random() > 0.5 ? 2.8 : -2.8)
      );
      this.ballSpin.set(10, (Math.random() - 0.5) * 14, -8);
      if (stealer.team === 'A') this.state.stealTelemetry.stealCountA += 1;
      else this.state.stealTelemetry.stealCountB += 1;
      this.state.stealTelemetry.windowLabel = 'BALL POKED LOOSE!';
      this.contactEngine.recordExternalContact(
        'STEAL_STRIP',
        `#${stealer.jerseyNumber} ${stealer.name}`,
        `#${handler.jerseyNumber} ${handler.name}`,
        'HAND_L',
        0.72,
        this.ball.position.clone(),
        this.elapsedTime,
        0xffb347
      );
      this.bounceSystem.recordPhysicsEvent(
        'OPTICAL_DEFLECT',
        'POKE LOOSE',
        this.ball.position,
        this.ballVel,
        this.ballSpin,
        0.78,
        this.elapsedTime
      );
      this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);
      this.state.lastShotSummary = `POKE LOOSE! #${stealer.jerseyNumber} KNOCKS IT AWAY FROM #${handler.jerseyNumber}!`;
      this.pushLog(`POKE STEAL! Loose ball off #${handler.jerseyNumber}!`);
    } else {
      stealer.stunTimer = 0.28;
      stealer.velocity.multiplyScalar(0.5);
      this.state.stealTelemetry.windowLabel = 'REACH MISSED';
      this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());
      this.state.lastShotSummary = `REACH MISS BY #${stealer.jerseyNumber} ${stealer.name}`;
    }

    this.notifyState();
  }

  private executePass(from: BasketUnit, to: BasketUnit) {
    if (this.passTargetUnit) return;
    from.hasBall = false;
    from.animState = 'PASS_RELEASE';
    from.animTimer = 0;
    from.mesh.updateMatrixWorld(true);
    from.mesh.lookAt(to.mesh.position.x, 0, to.mesh.position.z);

    const plan = this.passingEngine.planOrganicPass(
      from,
      to,
      this.units,
      this.contactEngine,
      HOOP_POS,
      this.state.courtSurface,
      COURT_W,
      COURT_D
    );

    this.state.ballHandlerId = null;
    this.passTargetUnit = to;
    this.passTimer = 0;
    this.passDuration = plan.flightDuration;
    this.passIsBounce = plan.style === 'BOUNCE_THREAD';
    this.state.lastPassStyle = plan.style;

    this.ball.position.copy(plan.startPos);
    this.ballPosPrev.copy(plan.startPos);
    this.ballVel.copy(plan.initialVelocity);
    this.ballSpin.copy(plan.initialSpin);
    this.state.lastShotSummary = plan.summaryLabel;

    const passKindLabel =
      plan.style === 'BOUNCE_THREAD'
        ? 'BOUNCE PASS'
        : plan.style === 'TOUCH_LOB'
        ? 'TOUCH LOB'
        : plan.style === 'NO_LOOK_WHIP'
        ? 'WHIP CURVE'
        : 'CHEST PASS';

    this.bounceSystem.startNewChain(
      'HAND_GATHER',
      passKindLabel,
      this.ball.position,
      this.ballVel,
      this.ballSpin,
      this.elapsedTime
    );
    this.bounceSystem.notifyRelease(this.ball.position, this.ballVel, 'PASS', this.ballSpin, this.elapsedTime);
    this.state.ballSpeedKmh = Math.round(this.ballVel.length() * 3.6);
    this.audioEngine.playPassSnap(this.dspEngine.getDestination(), false);
    this.notifyState();
  }

  private executeShotOrDunk(shooter: BasketUnit, chargeOrResult: number | ReleasedJumpShotResult) {
    this.shotArcLine.visible = false;
    const opp = this.getTeamUnits(shooter.team === 'A' ? 'B' : 'A');
    const outsideArc = this.isOutsideTwoPointArc(shooter.mesh.position);
    if (outsideArc && !this.state.arcCleared) {
      this.state.arcCleared = true;
    }

    const shotResult: ReleasedJumpShotResult =
      typeof chargeOrResult === 'number'
        ? this.slideShotMeterEngine.release(
            shooter,
            opp,
            HOOP_POS,
            outsideArc,
            this.state.flowTelemetry.flowMeter,
            chargeOrResult
          )
        : chargeOrResult;

    this.state.slideMeter = { ...this.slideShotMeterEngine.getState() };

    const { grade, solution, willSwish, chargeLevel } = shotResult;
    const preview = solution.previewType;

    this.state.shotMeter.lastTimingGrade = grade;
    this.state.shotMeter.lastActionLabel = solution.predictedShotLabel;
    this.state.shotMeter.sweetSpotStart = solution.sweetSpotStart;
    this.state.shotMeter.sweetSpotEnd = solution.sweetSpotEnd;
    this.state.shotMeter.chargeLevel = chargeLevel;
    if (grade === 'PERFECT' || grade === 'GREAT') {
      this.state.shotMeter.comboStreak += 1;
    } else {
      this.state.shotMeter.comboStreak = 0;
    }

    if (shooter.team === 'A' && grade === 'PERFECT') {
      this.state.flowTelemetry.flowMeter = Math.min(100, this.state.flowTelemetry.flowMeter + 12);
    }

    shooter.hasBall = false;
    this.passTargetUnit = null;
    this.shotHasHitRim = false;
    this.shotAscentTimer = 0;
    this.stealPursuitTargetId = null;
    this.state.stealTelemetry.pursuitTargetId = null;
    this.state.ballHandlerId = null;
    this.shooterUnit = shooter;
    this.lastShotReleasePos.copy(shooter.mesh.position);
    this.shotWillScorePoints = outsideArc ? 2 : 1;

    const nearestDefDist = Math.min(...opp.map((d) => d.mesh.position.distanceTo(shooter.mesh.position)));

    if (preview === 'POSTER_DUNK') {
      this.state.matchState = 'DUNK_FLIGHT';
      shooter.animState = 'DUNK_LAUNCH';
      shooter.animTimer = 0;
      shooter.isJumping = true;
      this.dunkStartPos.copy(shooter.mesh.position);
      this.dunkTargetPos.set(0, 0, HOOP_POS.z + 0.42);
      this.dunkProgress = 0;
      this.lastDunkSlamUnit = shooter;
      shooter.mesh.lookAt(HOOP_POS.x, 0, HOOP_POS.z);
      this.bounceSystem.startNewChain(
        'HAND_GATHER',
        'DUNK TAKEOFF',
        this.ball.position,
        this.ballVel,
        this.ballSpin,
        this.elapsedTime
      );
      this.bounceSystem.notifyRelease(
        this.ball.position,
        this._v1.set(0, 6, -7),
        'DUNK',
        this.ballSpin,
        this.elapsedTime
      );
      this.particleSystem.emitDustBurst(shooter.mesh.position, 14, 1.0);
      this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());
      this.state.lastShotSummary = `${grade} POSTER DUNK · #${shooter.jerseyNumber} ${shooter.name}`;
      if (this.state.spikeCamEnabled) {
        this.triggerComicStrike(
          `${grade === 'PERFECT' ? 'MONSTER POSTER!' : 'SLAM DUNK!'}`,
          `#${shooter.jerseyNumber} ${shooter.name}`,
          96
        );
      }
      this.notifyState();
      return;
    }

    // Calibrated Jump Shot / Stepback release using aerodynamic solution & Magnus spin
    this.state.matchState = 'SHOT_FLIGHT';
    shooter.animState = nearestDefDist < 2.1 ? 'STEPBACK' : 'JUMPER_RISE';
    shooter.animTimer = 0;
    shooter.isJumping = true;
    shooter.yVel = shooter.stats.vertical * 0.72;
    shooter.mesh.updateMatrixWorld(true);
    shooter.mesh.lookAt(HOOP_POS.x, 0, HOOP_POS.z);

    this.ball.position.copy(solution.releaseOrigin);
    this.ballPosPrev.copy(solution.releaseOrigin);
    this.ballVel.copy(solution.initialVelocity);
    this.ballSpin.copy(solution.initialSpin);

    if (typeof chargeOrResult === 'number') {
      this.bounceSystem.startNewChain(
        'HAND_GATHER',
        'GATHER',
        solution.releaseOrigin,
        this.ballVel,
        this.ballSpin,
        this.elapsedTime
      );
    }
    this.bounceSystem.notifyRelease(
      solution.releaseOrigin,
      this.ballVel,
      'SHOT',
      this.ballSpin,
      this.elapsedTime
    );

    this.state.ballSpeedKmh = Math.round(this.ballVel.length() * 3.6);
    this.state.lastShotSummary = `${grade} ${solution.predictedShotLabel} · ${Math.round(
      chargeLevel * 100
    )}% PWR · ${solution.releaseAngleDeg}° ARC`;

    if (this.shotWillScorePoints === 2 && grade === 'PERFECT' && this.state.spikeCamEnabled) {
      this.triggerComicStrike('DEEP 2PT SPLASH!', `#${shooter.jerseyNumber} ${shooter.name}`, this.state.ballSpeedKmh);
    }
    this.audioEngine.playPassSnap(this.dspEngine.getDestination(), false);
    this.notifyState();
  }

  private triggerComicStrike(calloutText: string, subText: string, speedKmh: number) {
    this.comicTimer = 0;
    this.state.comicStrike = {
      active: true,
      calloutText,
      subText,
      speedKmh,
      phase: 'ORBIT_FOLLOW',
      chainStage: 'READY',
      timeScale: 0.24,
      dutchTiltDeg: -7.5,
      screenX: 0.5,
      screenY: 0.36,
      intensity: 1.0,
    };
    this.aiCameraDirector.programComicStrikeOrbit(
      this.ball.position,
      HOOP_POS,
      this.shooterUnit?.team ?? 'A',
      speedKmh
    );
  }

  private handleBasketMade(scorer: BasketUnit, points: number, wasDunk: boolean) {
    const dirX = THREE.MathUtils.clamp(this.ballVel.x * 0.22, -1, 1);
    const dirZ = THREE.MathUtils.clamp(this.ballVel.z * 0.22, -1, 1);
    this.courtSystem.triggerNetSwish(wasDunk ? 2.1 : 1.3, wasDunk ? 1.0 : 0.16, dirX, dirZ);
    this.courtSystem.triggerRipple(HOOP_POS.x, HOOP_POS.z, wasDunk ? 1.85 : 1.15, this.elapsedTime);
    this.stadiumSystem.triggerScoreStrobe(scorer.team === 'A' ? 0x00f0ff : 0xff3d7f, wasDunk ? 1.35 : 0.85);
    this.crowdSystem.triggerCheer(scorer.team, wasDunk ? 1.0 : 0.72, wasDunk ? 'POSTER DUNK!' : 'BUCKET!');
    this.state.crowdMood.excitement = Math.min(1, this.state.crowdMood.excitement + 0.34);
    this.state.crowdMood.waveActive = wasDunk || points === 2;
    this.postFXImpactFlash = wasDunk ? 0.88 : 0.65;
    this.cameraShake = wasDunk ? 0.95 : 0.32;

    if (wasDunk) {
      this.hitStopTimer = 0.055;
      this.particleSystem.emitDustBurst(this._v1.set(HOOP_POS.x, 0.2, HOOP_POS.z), 20, 1.35);
      this.particleSystem.emitSweatSpray(
        scorer.mesh.position.clone().setY(2.2),
        new THREE.Vector3(0, 1.6, 0),
        18,
        1.0
      );
    }

    scorer.animState = 'CELEBRATION';
    scorer.animTimer = 0;

    this.bounceSystem.recordPhysicsEvent(
      wasDunk ? 'DUNK_FLUSH' : 'NET_SWISH',
      wasDunk ? 'DUNK FLUSH' : 'NET SWISH',
      this.ball.position,
      this.ballVel,
      this.ballSpin,
      1.0,
      this.elapsedTime
    );
    this.state.bouncePhysics = this.bounceSystem.getTelemetry(this.state.courtSurface, this.ballSpin);

    if (scorer.team === 'A') {
      this.state.scoreA += points;
      this.state.streakA += 1;
      this.state.streakB = 0;
      this.state.flowTelemetry.flowMeter = Math.min(100, this.state.flowTelemetry.flowMeter + (wasDunk ? 26 : points === 2 ? 22 : 15));
    } else {
      this.state.scoreB += points;
      this.state.streakB += 1;
      this.state.streakA = 0;
      this.state.flowTelemetry.flowMeter = Math.min(100, this.state.flowTelemetry.flowMeter + 16);
    }

    const label = wasDunk ? 'POSTER SLAM DUNK!' : points === 2 ? 'TWO-POINT RAINMAKER!' : 'BUCKET!';
    this.state.lastShotSummary = `${label} +${points} BY #${scorer.jerseyNumber} ${scorer.name}`;
    this.state.liveCommentaryLine = `${scorer.team === 'A' ? 'CYAN' : 'VICE CORAL'} SCORES +${points}! SCORE ${this.state.scoreA}-${this.state.scoreB}`;
    this.pushLog(`+${points} PTS (${label}) — #${scorer.jerseyNumber} ${scorer.name}`);

    const bus = this.dspEngine.getDestination();
    this.audioEngine.playNetSwish(bus, wasDunk);
    if (bus && (wasDunk || points === 2)) {
      this.crowdSystem.playWarmCrowdSwell(bus.ctx, bus.destination, 0.85, wasDunk ? 0.95 : 0.65);
    }

    if (wasDunk || points === 2) {
      this.saveHighlightClip(scorer, points, wasDunk ? 'POSTER DUNK' : '2PT SPLASH');
    }

    const winTarget = this.state.targetScore;
    if (
      this.state.matchFormat !== 'PRACTICE' &&
      (this.state.scoreA >= winTarget || this.state.scoreB >= winTarget) &&
      (this.state.matchFormat === 'QUICK_21' || Math.abs(this.state.scoreA - this.state.scoreB) >= 2)
    ) {
      this.state.matchState = 'MATCH_OVER';
      this.state.screenMode = 'MATCH_OVER';
      this.celebrationTimer = 4.0;
      const winTeam = this.state.scoreA > this.state.scoreB ? 'CYAN STORM' : 'VICE CORAL';
      this.state.liveCommentaryLine = `${winTeam} WINS THE 3X3 CHAMPIONSHIP ${this.state.scoreA}-${this.state.scoreB}!`;
      cometicOSKernel.logEvent('HOOPS-3V3', this.state.liveCommentaryLine, 'studio');
      this.notifyState();
      return;
    }

    this.state.possessionTeam = scorer.team === 'A' ? 'B' : 'A';
    this.state.matchState = 'SCORE_CELEBRATION';
    this.stealPursuitTargetId = null;
    this.state.stealTelemetry.pursuitTargetId = null;
    this.triggerIrregularCelebration(scorer, points, wasDunk);
    this.notifyState();
  }

  private triggerIrregularCelebration(scorer: BasketUnit, points: number, wasDunk: boolean) {
    const scoreMax = Math.max(this.state.scoreA, this.state.scoreB);
    const isClutch = this.state.matchFormat !== 'PRACTICE' && scoreMax >= Math.max(15, this.state.targetScore - 4);
    const teamStreak = scorer.team === 'A' ? this.state.streakA : this.state.streakB;
    const isBigMoment = wasDunk || points === 2 || isClutch || teamStreak >= 2;
    const shouldPlayCutscene = isBigMoment || Math.random() < 0.54;

    if (!shouldPlayCutscene) {
      this.celebrationCompanionUnit = null;
      this.state.celebrationCutscene = {
        active: false,
        type: 'NONE',
        title: '',
        scorerName: scorer.name,
        scorerJersey: scorer.jerseyNumber,
        team: scorer.team,
        durationSec: 0.85,
        elapsedSec: 0,
        canSkip: false,
      };
      this.celebrationTimer = 0.85;
      scorer.animState = 'CELEBRATION';
      scorer.animTimer = 0;
      return;
    }

    const pool: CelebrationCutsceneType[] = [
      'ICE_IN_VEINS',
      'ROCK_THE_BABY',
      'AIR_GUITAR_ROCK',
      'CHEST_BUMP_SQUAD',
      'CROWD_SILENCER',
    ];
    const candidates = pool.filter((t) => t !== this.lastCelebrationType);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || 'ICE_IN_VEINS';
    this.lastCelebrationType = chosen;

    const durationSec = Number((1.65 + Math.random() * 0.8).toFixed(2));
    this.celebrationTimer = durationSec;
    this.shooterUnit = scorer;
    this.state.comicStrike.active = false;

    const titles: Record<CelebrationCutsceneType, string> = {
      NONE: 'BUCKET CELEBRATION',
      ICE_IN_VEINS: 'ICE IN HIS VEINS',
      ROCK_THE_BABY: 'ROCK THE BABY',
      AIR_GUITAR_ROCK: 'STADIUM AIR GUITAR',
      CHEST_BUMP_SQUAD: 'SQUAD CHEST BUMP',
      CROWD_SILENCER: 'CROWD SILENCER',
    };

    const animByType: Record<CelebrationCutsceneType, BasketUnit['animState']> = {
      NONE: 'CELEBRATION',
      ICE_IN_VEINS: 'CELEBRATE_ICE',
      ROCK_THE_BABY: 'CELEBRATE_ROCK',
      AIR_GUITAR_ROCK: 'CELEBRATE_GUITAR',
      CHEST_BUMP_SQUAD: 'CELEBRATE_BUMP',
      CROWD_SILENCER: 'CELEBRATE_SHUSH',
    };

    scorer.isJumping = false;
    scorer.yVel = 0;
    scorer.mesh.position.y = 0;
    scorer.velocity.set(0, 0, 0);
    scorer.animState = animByType[chosen];
    scorer.animTimer = 0;

    if (chosen === 'CHEST_BUMP_SQUAD') {
      const mates = this.getTeamUnits(scorer.team).filter((u) => u.id !== scorer.id);
      let nearest = mates[0] || null;
      let bestD = 999;
      for (const m of mates) {
        const d = m.mesh.position.distanceTo(scorer.mesh.position);
        if (d < bestD) {
          bestD = d;
          nearest = m;
        }
      }
      this.celebrationCompanionUnit = nearest;
      if (nearest) {
        nearest.isJumping = false;
        nearest.yVel = 0;
        nearest.mesh.position.y = 0;
        nearest.velocity.set(0, 0, 0);
        nearest.animState = 'CELEBRATE_BUMP';
        nearest.animTimer = 0;
        scorer.mesh.lookAt(nearest.mesh.position.x, 0, nearest.mesh.position.z);
        nearest.mesh.lookAt(scorer.mesh.position.x, 0, scorer.mesh.position.z);
      }
    } else {
      this.celebrationCompanionUnit = null;
      scorer.mesh.lookAt(0, 0, 5.5);
    }

    this.state.celebrationCutscene = {
      active: true,
      type: chosen,
      title: titles[chosen],
      scorerName: scorer.name,
      scorerJersey: scorer.jerseyNumber,
      team: scorer.team,
      durationSec,
      elapsedSec: 0,
      canSkip: false,
    };
  }

  public skipCelebrationCutscene() {
    if (this.state.matchState !== 'SCORE_CELEBRATION' || !this.state.celebrationCutscene.active) return;
    this.state.celebrationCutscene.active = false;
    this.state.celebrationCutscene.type = 'NONE';
    this.celebrationCompanionUnit = null;
    this.celebrationTimer = 0;
    this.resetCheckBall(this.state.possessionTeam, true);
    this.notifyState();
  }

  private saveHighlightClip(scorer: BasketUnit, points: number, shotType: string) {
    if (this.liveBuffer.length < 10) return;
    const clip: BasketReplayClip = {
      id: `hoops-${Date.now()}`,
      title: `#${scorer.jerseyNumber} ${scorer.name} · ${shotType}`,
      scorerName: scorer.name,
      scorerJersey: scorer.jerseyNumber,
      scorerTeam: scorer.team,
      pointsValue: points,
      shotType,
      speedKmh: Math.max(48, this.state.ballSpeedKmh),
      frames: this.liveBuffer.slice(-85),
    };
    this.savedHighlights = [clip, ...this.savedHighlights].slice(0, 8);
    this.state.savedHighlightsCount = this.savedHighlights.length;
    cometicOSKernel.logEvent('OPFS', `Captured 3v3 highlight: ${clip.title}`, 'info');
  }

  public getHighlightClips(): BasketReplayClip[] {
    return [...this.savedHighlights];
  }

  public startReplayShowcase(clipIndex = 0) {
    if (this.savedHighlights.length === 0) return;
    const idx = Math.max(0, Math.min(this.savedHighlights.length - 1, clipIndex));
    const clip = this.savedHighlights[idx];
    this.replayElapsed = 0;
    this.replayDuration = Math.max(1.4, clip.frames.reduce((s, f) => s + f.dt, 0));
    this.state.replayState = {
      active: true,
      clipIndex: idx,
      totalClips: this.savedHighlights.length,
      currentClip: clip,
      currentAngle: REPLAY_ANGLES[0],
      angleIndex: 0,
      progress: 0,
      playbackSpeed: 0.28,
    };
    this.notifyState();
  }

  public stopReplay() {
    if (!this.state.replayState.active) return;
    this.state.replayState.active = false;
    this.state.replayState.currentClip = null;
    this.setCameraAngle(this.state.cameraAngle);
    this.notifyState();
  }

  public cycleReplayAngle() {
    if (!this.state.replayState.active) return;
    const nextIdx = (this.state.replayState.angleIndex + 1) % REPLAY_ANGLES.length;
    this.state.replayState.angleIndex = nextIdx;
    this.state.replayState.currentAngle = REPLAY_ANGLES[nextIdx];
    this.notifyState();
  }

  public setReplaySpeed(spd: number) {
    this.state.replayState.playbackSpeed = spd;
    this.notifyState();
  }

  // =========================================================================
  // UPDATE LOOP: INTRO, PHYSICS, OPTICAL CONTACT, BOUNCE, SOCCER GOALIE & CAM
  // =========================================================================
  private animate = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const now = performance.now();
    this.fpsGovernor.beginFrame(now);
    const rawDt = Math.min(0.05, Math.max(0.004, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsedTime += rawDt;
    this.pointerHoverTimer += rawDt;

    this.state.fps = Math.round(this.fpsGovernor.currentFps);

    if (this.state.replayState.active && this.state.replayState.currentClip) {
      this.updateWeatherAndMusic(rawDt);
      this.updateReplayFrame(rawDt);
      this.renderFrame(rawDt);
      return;
    }

    if (this.state.screenMode === 'MAIN_MENU') {
      this.updateWeatherAndMusic(rawDt);
      this.updateIntroCutscene(rawDt);
      this.updateUnitsKinematics(rawDt * 0.4, false);
      this.contactEngine.syncHitboxes(this.units, rawDt, this.elapsedTime);
      this.renderFrame(rawDt);
      return;
    }

    if (this.state.screenMode === 'PAUSED') {
      this.updateWeatherAndMusic(rawDt * 0.2);
      this.renderFrame(rawDt);
      return;
    }

    // Impact Hit-Stop Micro-Freeze for poster dunks & swat blocks
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      this.updateCamera(rawDt);
      this.renderFrame(rawDt);
      return;
    }

    let timeScale = 1.0;
    if (this.state.comicStrike.active) {
      this.comicTimer += rawDt;
      const p = this.comicTimer / this.comicDuration;
      if (p < 0.72) {
        this.state.comicStrike.phase = 'ORBIT_FOLLOW';
        timeScale = 0.24;
        this.state.comicStrike.timeScale = 0.24;
      } else if (p < 1.0) {
        this.state.comicStrike.phase = 'REALTIME_RETURN';
        timeScale = THREE.MathUtils.lerp(0.24, 1.0, (p - 0.72) / 0.28);
        this.state.comicStrike.timeScale = Number(timeScale.toFixed(2));
      } else {
        this.state.comicStrike.active = false;
        this.state.comicStrike.phase = 'IDLE';
        this.state.comicStrike.intensity = 0;
      }
    }

    const dt = rawDt * timeScale;

    this.updateWeatherAndMusic(rawDt);
    this.updateGameplay(dt);
    this.updateFlowState(dt);
    this.updateUnitsKinematics(dt, true);
    this.contactEngine.syncHitboxes(this.units, dt, this.elapsedTime);
    this.updateCamera(rawDt);
    this.renderFrame(rawDt);
  };

  private updateIntroCutscene(rawDt: number) {
    const hero = this.getHeroUnit();
    const intro = this.state.introCutscene;
    intro.phaseElapsed += rawDt;
    const pt = intro.phaseElapsed;

    hero.mesh.position.set(0, 0, 3.2);
    hero.mesh.lookAt(0, 0, -18.5);
    hero.animState = 'READY_STANCE';

    if (intro.phase === 'ORBIT_STADIUM') {
      this.ball.visible = false;
      this.bounceSystem.clearFormFrames();
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, 0, 8, rawDt);
      const orbitU = Math.min(1, pt / 3.0);
      const orbitAngle = -0.68 + orbitU * 1.24;
      const radius = THREE.MathUtils.lerp(20.0, 14.2, orbitU);
      this._v1.set(
        Math.sin(orbitAngle) * radius,
        THREE.MathUtils.lerp(9.2, 4.8, orbitU),
        Math.cos(orbitAngle) * radius
      );
      this.camera.position.lerp(this._v1, 1 - Math.exp(-4.6 * rawDt));
      this._v2.set(
        THREE.MathUtils.lerp(3.5, 0, orbitU),
        THREE.MathUtils.lerp(2.4, 5.8, orbitU),
        THREE.MathUtils.lerp(-4.0, -14.5, orbitU)
      );
      this.controls.target.lerp(this._v2, 1 - Math.exp(-4.6 * rawDt));
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 44, 7, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();

      if (pt >= 3.0) {
        intro.phase = 'HERO_LOOK_UP';
        intro.phaseElapsed = 0;
        intro.subBannerText = `#${hero.jerseyNumber} ${hero.name} LOOKS UP AT AIM VANCOUVER`;
      }
    } else if (intro.phase === 'HERO_LOOK_UP') {
      this.ball.visible = false;
      const lookU = Math.min(1, pt / 2.4);
      this._v1.set(
        THREE.MathUtils.lerp(1.42, 0.88, lookU),
        THREE.MathUtils.lerp(1.34, 1.54, lookU),
        THREE.MathUtils.lerp(5.2, 4.5, lookU)
      );
      this.camera.position.lerp(this._v1, 1 - Math.exp(-5.8 * rawDt));
      this._v2.set(0, THREE.MathUtils.lerp(2.0, 9.4, lookU), THREE.MathUtils.lerp(1.0, -18.5, lookU));
      this.controls.target.lerp(this._v2, 1 - Math.exp(-5.8 * rawDt));
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, -2.4, 6, rawDt);
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 35, 6, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();

      if (pt >= 2.4) {
        intro.phase = 'BILLBOARD_FULLSCREEN';
        intro.phaseElapsed = 0;
        intro.subBannerText = 'SELECT YOUR MUSIC · PRESS PLAY TO LAUNCH';
      }
    } else if (intro.phase === 'BILLBOARD_FULLSCREEN') {
      this.ball.visible = false;
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, 0, 10, rawDt);
      // Exact Trig Fit Formula matching Volleyball Billboard Framing!
      const fovDeg = 38;
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5);
      const halfW = 8.35;
      const halfH = 3.35;
      const distForWidth = (halfW * 1.12) / Math.max(0.28, tanHalf * this.camera.aspect);
      const distForHeight = (halfH * 1.56) / tanHalf;
      const centerDist = Math.max(11.4, distForWidth, distForHeight);

      this._v1.set(Math.sin(this.elapsedTime * 0.22) * 0.45, 9.4, -18.5 + centerDist);
      this._v2.set(0, 9.3, -18.5);
      const cutSnap = pt < 0.25 ? 1 - Math.exp(-20 * rawDt) : 1 - Math.exp(-8 * rawDt);
      this.camera.position.lerp(this._v1, cutSnap);
      this.controls.target.lerp(this._v2, cutSnap);
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, fovDeg, 12, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
    } else if (intro.phase === 'BALL_SWOOSH_TO_FEET') {
      this.ball.visible = true;
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, -1.8, 7, rawDt);
      this.ballPosPrev.copy(this.ball.position);

      if (pt < 1.15) {
        const u = pt / 1.15;
        const bx = THREE.MathUtils.lerp(0, 0.36, u) + Math.sin(u * Math.PI) * 1.1;
        const by = THREE.MathUtils.lerp(9.6, BALL_RADIUS, Math.pow(u, 1.25)) + Math.sin(u * Math.PI) * 1.4;
        const bz = THREE.MathUtils.lerp(-18.0, 1.6, u);
        this.ball.position.set(bx, by, bz);
        this.ballVel.subVectors(this.ball.position, this.ballPosPrev).divideScalar(Math.max(0.008, rawDt));
        this.ball.rotation.x += rawDt * 24;
        this.bounceSystem.updateFormFrames(rawDt, this.ball, this.ballMesh, this.ballVel, 'PASS');
        this.ballisticBridge.updateTrail(this.ball.position, this.ballVel, true);

        this._v1.set(bx - 2.35, Math.max(2.15, by + 1.2), bz - 4.4);
        this.camera.position.lerp(this._v1, 1 - Math.exp(-10 * rawDt));
        this._v2.set(bx * 0.6, Math.max(0.75, by * 0.65), bz + 2.2);
        this.controls.target.lerp(this._v2, 1 - Math.exp(-10 * rawDt));
        this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 44, 8, rawDt);
      } else if (pt < 1.75) {
        if (!this.introBounceTriggered) {
          this.introBounceTriggered = true;
          this.ball.position.set(0.36, BALL_RADIUS, 1.6);
          this.bounceSystem.triggerSquash(1.0);
          this.particleSystem.emitDustBurst(this.ball.position, 22, 1.4);
          this.courtSystem.triggerRipple(this.ball.position.x, this.ball.position.z, 1.25, this.elapsedTime);
          this.audioEngine.playDribbleBounce(
            this.dspEngine.getDestination(),
            8.2,
            this.state.courtSurface,
            0
          );
        }
        const u = (pt - 1.15) / 0.6;
        const bx = THREE.MathUtils.lerp(0.36, 0.28, u);
        const by = BALL_RADIUS + Math.sin(u * Math.PI) * 0.82;
        const bz = THREE.MathUtils.lerp(1.6, 2.75, u);
        this.ball.position.set(bx, by, bz);
        this.ballVel.set(0, 2, 3);
        this.bounceSystem.updateFormFrames(rawDt, this.ball, this.ballMesh, this.ballVel, 'PASS');

        this._v1.set(-2.35, 2.1, bz - 3.2);
        this.camera.position.lerp(this._v1, 1 - Math.exp(-8 * rawDt));
        this._v2.set(0.18, 0.65, bz + 0.8);
        this.controls.target.lerp(this._v2, 1 - Math.exp(-8 * rawDt));
      } else {
        this.bounceSystem.clearFormFrames();
        this.startNewMatch(intro.pendingFormat, this.state.matchFormat === 'AI_SHOWCASE' ? 'AUTO' : 'PLAYER');
        return;
      }

      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
    }

    this.controls.update();
    if (Math.abs(this.activeDutchTiltDeg) > 0.05) {
      this.camera.lookAt(this.controls.target);
      this.camera.rotateZ(THREE.MathUtils.degToRad(this.activeDutchTiltDeg));
    }
  }

  private updateWeatherAndMusic(rawDt: number) {
    const evo = this.state.matchEvolution;
    if (evo.mode === 'AUTO_EVOLVE') {
      evo.elapsedSeconds += rawDt;
      evo.intensity = THREE.MathUtils.clamp(0.14 + evo.elapsedSeconds * 0.0022, 0.14, 0.92);
      if (evo.intensity < 0.35) evo.stage = 'OPENING_BREEZE';
      else if (evo.intensity < 0.58) evo.stage = 'RISING_HEAT';
      else if (evo.intensity < 0.78) {
        evo.stage = 'DUST_SQUALL';
        evo.dustLevel = 0.52;
      } else {
        evo.stage = 'MONSOON_CLIMAX';
        evo.rainLevel = 0.65;
        evo.wetnessLevel = Math.min(0.65, evo.wetnessLevel + rawDt * 0.05);
      }
    }

    this.dspEngine.sampleFFT();
    this.eqBars = this.dspEngine.getSpectrumBins(32);
    this.state.introBillboardEQ = this.dspEngine.getAudioEQState();

    this.drawBillboardCanvas();

    const bassEnergy = this.state.introBillboardEQ.bassLevel;
    const midEnergy = this.state.introBillboardEQ.midLevel;
    const highEnergy = this.state.introBillboardEQ.highLevel;

    this.courtSystem.update(rawDt, this.elapsedTime, bassEnergy, highEnergy, this.ball.position, this.ballVel);
    this.stadiumSystem.update(rawDt, this.elapsedTime, bassEnergy, highEnergy, this.state.weather);

    // Update Coal Harbour Soccer Goalie station & Optical hitboxes
    this.soccerGoalie.update(rawDt, this.elapsedTime, (kind, worldPos) => {
      const bus = this.dspEngine.getDestination();
      if (kind === 'KICK') {
        this.audioEngine.playSoccerKick(bus);
      } else if (kind === 'SAVE') {
        this.audioEngine.playGoalieParry(bus, true);
        this.contactEngine.recordExternalContact(
          'GOALIE_PARRY',
          '#1 KEEPER',
          'PENALTY BALL',
          'GOALIE_GLOVE_R',
          0.95,
          worldPos,
          this.elapsedTime,
          0x10b981
        );
      } else if (kind === 'GOAL') {
        this.audioEngine.playGoalieParry(bus, false);
        this.crowdSystem.triggerCheer('A', 0.55, 'GOAL!');
      }
    });

    const pulseScale = 1 + bassEnergy * 0.24;
    for (let i = 0; i < this.introBillboardSpeakerRings.length; i++) {
      this.introBillboardSpeakerRings[i].scale.setScalar(pulseScale);
    }

    const compat = this._compatSceneState;
    compat.scoreA = this.state.scoreA;
    compat.scoreB = this.state.scoreB;
    compat.rallyCount = this.state.streakA + this.state.streakB;
    compat.setsA = this.state.streakA;
    compat.setsB = this.state.streakB;
    compat.ballSpeedKmh = this.state.ballSpeedKmh;
    compat.momentumA = Math.min(100, 30 + this.state.streakA * 18);
    compat.momentumB = Math.min(100, 30 + this.state.streakB * 18);
    compat.hyperDriveActive = this.state.shotMeter.comboStreak >= 2;
    compat.audioEQ = this.state.introBillboardEQ;
    compat.crowdMood = this.state.crowdMood;
    compat.matchEvolution = evo;

    this.crowdSystem.update(rawDt, this.elapsedTime, compat as any);
    this.vipSuites.update(this.elapsedTime, compat as any, true);
    this.stadiumPersonnel.update(rawDt, this.elapsedTime, this.ball.position, compat as any, 'ATTACK_STRIKE');
    this.vancouverSkyline.update(rawDt, this.elapsedTime, this.state.weather, bassEnergy, midEnergy, highEnergy);
    this.vancouverCity.update(rawDt, this.elapsedTime, this.state.weather, bassEnergy, highEnergy);
    this.particleSystem.update(rawDt, this.elapsedTime, evo, [] as any, this.state.courtSurface);

    const trailActive =
      this.state.screenMode === 'PLAYING' &&
      (this.state.matchState === 'SHOT_FLIGHT' ||
        this.state.matchState === 'DUNK_FLIGHT' ||
        Boolean(this.passTargetUnit));
    if (this.state.screenMode === 'PLAYING') {
      this.ballisticBridge.updateTrail(this.ball.position, this.ballVel, trailActive);
    }
  }

  private drawBillboardCanvas() {
    const ctx = this.jumbotronCtx;
    if (!ctx) return;

    const W = 1024;
    const H = 384;
    const eq = this.state.introBillboardEQ;

    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#070411');
    bgGrad.addColorStop(0.5, '#190b33');
    bgGrad.addColorStop(1, '#08182f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

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

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CYAN ${this.state.scoreA}`, 42, 62);

    ctx.fillStyle = '#ff3d7f';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.state.scoreB} CORAL`, W - 42, 62);

    ctx.fillStyle = '#ffb347';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(`AIM VANCOUVER 3X3 • ${this.state.shotClock.toFixed(1)}S`, W / 2, 62);

    const hasAudio = eq.isPlaying;
    const yBottom = 298;
    const maxH = 172;
    const barW = 20;
    const gap = 8.8;
    const startX = (W - (32 * barW + 31 * gap)) / 2;

    for (let i = 0; i < 32; i++) {
      const idleFloor = hasAudio
        ? 0.06
        : 0.1 +
          0.08 * Math.sin(this.elapsedTime * 3.6 + i * 0.42) +
          0.04 * Math.cos(this.elapsedTime * 2.1 - i * 0.2);
      const level = Math.max(idleFloor, this.eqBars[i] || 0.1);
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

      ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
      ctx.fillRect(x, yBottom + 4, barW, Math.round(bh * 0.14));

      const peakY = yBottom - Math.min(maxH, this.eqPeakHold[i] * maxH) - 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, peakY, barW, 4);
    }

    ctx.textAlign = 'center';
    const trackBanner = eq.trackName
      ? `${eq.isPlaying ? '▶ LIVE AUDIO' : '❚❚ PAUSED'}  •  ${eq.trackName.toUpperCase()}  •  BASS ${Math.round(eq.bassLevel * 100)}%`
      : `AIM VANCOUVER BCCC • ${this.state.lastShotSummary}`;
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

  private getCurrentBallFlightStyle(): BallFlightStyle {
    if (this.state.matchState === 'DUNK_FLIGHT') return 'DUNK';
    if (this.state.matchState === 'SHOT_FLIGHT') return 'SHOT';
    if (this.passTargetUnit) return 'PASS';
    if (this.state.ballHandlerId) return 'DRIBBLE';
    return 'LOOSE';
  }

  private updateGameplay(dt: number) {
    this.clockTexTimer += dt;
    if (this.clockTexTimer > 0.12) {
      this.clockTexTimer = 0;
      this.courtSystem.updateShotClockBoard(
        this.state.shotClock,
        this.state.scoreA,
        this.state.scoreB,
        this.state.arcCleared
      );
    }

    const flightStyle = this.getCurrentBallFlightStyle();
    this.bounceSystem.updateFormFrames(dt, this.ball, this.ballMesh, this.ballVel, flightStyle);
    this.ballPosPrev.copy(this.ball.position);

    if (this.state.matchState === 'MATCH_OVER') {
      this.celebrationTimer -= dt;
      if (this.celebrationTimer <= 0 && this.state.controlMode === 'AUTO') {
        this.startNewMatch(this.state.matchFormat, 'AUTO');
      }
      return;
    }

    if (this.state.matchState === 'SCORE_CELEBRATION') {
      const celSubSteps = 2;
      const celDt = dt / celSubSteps;
      for (let cs = 0; cs < celSubSteps; cs++) {
        this.bounceSystem.stepAirborneBallPhysics(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          this.ball.rotation,
          celDt,
          this.elapsedTime
        );
        this.bounceSystem.resolveArenaAndHoopCollisions(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          HOOP_POS,
          BACKBOARD_Z,
          RIM_RADIUS,
          RIM_TUBE_RADIUS,
          this.state.matchEvolution.wetnessLevel,
          this.elapsedTime
        );
        const bounceRes = this.bounceSystem.resolveFloorBounce(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          this.ball.rotation,
          this.state.courtSurface,
          this.state.matchEvolution.wetnessLevel,
          celDt,
          this.elapsedTime
        );
        if (bounceRes.bounced) {
          this.courtSystem.triggerRipple(this.ball.position.x, this.ball.position.z, 0.8, this.elapsedTime);
          this.audioEngine.playDribbleBounce(
            this.dspEngine.getDestination(),
            bounceRes.impactSpeed,
            this.state.courtSurface,
            this.state.matchEvolution.wetnessLevel
          );
        }
      }

      if (this.state.celebrationCutscene.active) {
        const cel = this.state.celebrationCutscene;
        cel.elapsedSec += dt;
        cel.canSkip = cel.elapsedSec >= 0.45;
        if (cel.type === 'CHEST_BUMP_SQUAD' && this.shooterUnit && this.celebrationCompanionUnit) {
          const scorer = this.shooterUnit;
          const buddy = this.celebrationCompanionUnit;
          const dist = scorer.mesh.position.distanceTo(buddy.mesh.position);
          if (dist > 0.78) {
            this._v1.subVectors(buddy.mesh.position, scorer.mesh.position).setY(0).normalize();
            scorer.mesh.position.addScaledVector(this._v1, dt * 1.45);
            buddy.mesh.position.addScaledVector(this._v1, -dt * 1.45);
          }
          const hop = cel.elapsedSec > 0.48 && cel.elapsedSec < 0.92
            ? Math.sin(((cel.elapsedSec - 0.48) / 0.44) * Math.PI) * 0.34
            : 0;
          scorer.mesh.position.y = hop;
          buddy.mesh.position.y = hop;
          scorer.mesh.lookAt(buddy.mesh.position.x, 0, buddy.mesh.position.z);
          buddy.mesh.lookAt(scorer.mesh.position.x, 0, scorer.mesh.position.z);
        }
      }

      this.celebrationTimer -= dt;
      if (this.celebrationTimer <= 0) {
        this.state.celebrationCutscene.active = false;
        this.state.celebrationCutscene.type = 'NONE';
        this.celebrationCompanionUnit = null;
        this.resetCheckBall(this.state.possessionTeam, true);
      }
      return;
    }

    if (this.state.matchState === 'CHECK_BALL') {
      this.state.checkTimer -= dt;
      const handler = this.getHandler();
      if (handler) {
        this.dribblePhase += dt * 7.2;
        const u = (this.dribblePhase % Math.PI) / Math.PI;
        const parabolicBounce = 4 * u * (1 - u);
        this.ball.position.set(
          handler.mesh.position.x + 0.28,
          BALL_RADIUS + parabolicBounce * 0.78,
          handler.mesh.position.z - 0.15
        );
      }
      if (this.state.checkTimer <= 0) {
        this.state.matchState = 'LIVE_PLAY';
        this.state.lastShotSummary = 'LIVE 3X3 PLAY · 12S CLOCK';
        this.notifyState();
      }
      return;
    }

    if (this.state.shotMeter.isCharging) {
      const handler = this.getHandler();
      const targetUnit =
        handler && handler.team === 'A'
          ? handler
          : this.passTargetUnit && this.passTargetUnit.team === 'A'
          ? this.passTargetUnit
          : null;
      const defenders = this.getTeamUnits('B');
      this.slideShotMeterEngine.update(
        dt,
        targetUnit,
        defenders,
        HOOP_POS,
        targetUnit ? this.isOutsideTwoPointArc(targetUnit.mesh.position) : false,
        this.state.flowTelemetry.flowMeter,
        () => this.releaseShotOrBlock()
      );
      if (this.state.shotMeter.isCharging && targetUnit) {
        const sm = this.slideShotMeterEngine.getState();
        const sol = this.slideShotMeterEngine.getLastSolution();
        this.state.slideMeter = { ...sm };
        this.state.shotMeter.chargeLevel = sm.sliderValue;
        this.state.shotMeter.sweetSpotStart = sm.sweetSpotStart;
        this.state.shotMeter.sweetSpotEnd = sm.sweetSpotEnd;
        this.state.shotMeter.previewType = sol.previewType;
        const inSweet = sm.sliderValue >= sm.sweetSpotStart && sm.sliderValue <= sm.sweetSpotEnd;
        this.syncShotArcLineGeometry(inSweet ? 0x10b981 : sm.sliderValue > sm.sweetSpotEnd ? 0xffb347 : 0x00f0ff);
        this.shotArcLine.visible = true;
        this.shotTargetRing.position.set(sol.targetPoint.x, 0.034, sol.targetPoint.z);
        this.shotTargetRing.scale.setScalar(1 + 0.25 * Math.sin(this.elapsedTime * 14));
      }
    } else if (this.shotArcLine.visible) {
      this.shotArcLine.visible = false;
    }

    if (this.state.matchState === 'LIVE_PLAY') {
      this.state.shotClock = Math.max(0, this.state.shotClock - dt);
      if (this.state.shotClock <= 0) {
        const nextTeam = this.state.possessionTeam === 'A' ? 'B' : 'A';
        this.state.lastShotSummary = '12S SHOT CLOCK VIOLATION · TURNOVER!';
        this.pushLog(`12s Shot Clock expired — ${nextTeam === 'A' ? 'CYAN' : 'CORAL'} ball!`);
        this.courtSystem.triggerBuzzerFlash();
        this.stadiumSystem.triggerScoreStrobe(0xff1e42, 1.2);
        this.audioEngine.playArenaHorn(this.dspEngine.getDestination(), 'BUZZER');
        this.resetCheckBall(nextTeam, true);
        return;
      }

      const handler = this.getHandler();
      if (handler && !this.state.arcCleared && this.isOutsideTwoPointArc(handler.mesh.position)) {
        this.state.arcCleared = true;
        this.state.lastShotSummary = '2PT ARC CLEARED · SCORE LIVE!';
      }

      if (this.passTargetUnit) {
        this.passTimer += dt;
        this.bounceSystem.stepAirborneBallPhysics(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          this.ball.rotation,
          dt,
          this.elapsedTime
        );
        this.state.ballSpeedKmh = Math.round(this.ballVel.length() * 3.6);

        // Bounce Pass Floor Contact Solver (realistic restitution `e` + spin kick up into hands!)
        if (this.ball.position.y <= BALL_RADIUS) {
          const bounceRes = this.bounceSystem.resolveFloorBounce(
            this.ball.position,
            this.ballVel,
            this.ballSpin,
            this.ball.rotation,
            this.state.courtSurface,
            this.state.matchEvolution.wetnessLevel,
            dt,
            this.elapsedTime
          );
          if (bounceRes.bounced) {
            this.courtSystem.triggerRipple(this.ball.position.x, this.ball.position.z, 0.85, this.elapsedTime);
            this.audioEngine.playDribbleBounce(
              this.dspEngine.getDestination(),
              bounceRes.impactSpeed,
              this.state.courtSurface,
              this.state.matchEvolution.wetnessLevel
            );
          }
        }

        const target = this.passTargetUnit;
        // Soft last-moment catch cushion inside receiver reach without unnatural mid-flight snapping
        if (this.passTimer > this.passDuration * 0.84 && !this.passIsBounce) {
          this._v1.set(target.mesh.position.x, target.mesh.position.y + 1.2, target.mesh.position.z);
          this._v2.subVectors(this._v1, this.ball.position);
          const d = this._v2.length();
          if (d > 0.05 && d < 1.35) {
            this.ballVel.lerp(this._v2.normalize().multiplyScalar(Math.max(8, this.ballVel.length())), dt * 7);
          }
        }

        // Real-Time Optical Defender OBB Pass Interception Check!
        const opticalHit = this.contactEngine.checkBallVsDefenderHands(
          this.ballPosPrev,
          this.ball.position,
          BALL_RADIUS,
          target.team,
          this.units,
          this.elapsedTime
        );
        if (opticalHit && this.passTimer > 0.05) {
          this.passTargetUnit = null;
          this.queuedShotOnCatch = false;
          this.queuedShotCharge = null;
          this.looseBallPickupDelay = 0.24;
          this.ballVel.reflect(opticalHit.contactNormal).multiplyScalar(0.55);
          this.ballVel.y = Math.max(2.6, this.ballVel.y);
          this.bounceSystem.recordPhysicsEvent(
            'OPTICAL_DEFLECT',
            'DEFLECT',
            opticalHit.contactPoint,
            this.ballVel,
            this.ballSpin,
            0.55,
            this.elapsedTime
          );
          this.contactEngine.recordExternalContact(
            'PASS_DEFLECT',
            `#${opticalHit.defender.jerseyNumber} ${opticalHit.defender.name}`,
            'PASS BALL',
            opticalHit.zone,
            opticalHit.impactForce,
            opticalHit.contactPoint,
            this.elapsedTime,
            0xffb347
          );
          this.state.lastShotSummary = `OPTICAL ${opticalHit.zone} DEFLECTION BY #${opticalHit.defender.jerseyNumber}!`;
          this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);
        }

        if (this.passTargetUnit) {
          const catchDist3D = Math.hypot(
            target.mesh.position.x - this.ball.position.x,
            target.mesh.position.y + 1.18 - this.ball.position.y,
            target.mesh.position.z - this.ball.position.z
          );
          const timedOut = this.passTimer > this.passDuration + 0.55;
          if (catchDist3D < 0.74) {
            target.hasBall = true;
            target.animState = 'PASS_CATCH';
            target.animTimer = 0;
            this.state.ballHandlerId = target.id;
            this.passTargetUnit = null;
            this.dribblePhase = Math.PI * 0.55;
            this.ballCarryBlendTimer = 0.14;
            this.bounceSystem.clearFormFrames();
            this.bounceSystem.recordPhysicsEvent(
              'PASS_CATCH',
              'CATCH',
              this.ball.position,
              this.ballVel,
              this.ballSpin,
              0.9,
              this.elapsedTime
            );
            if (target.team === 'A') {
              this.state.activeCyanId = target.id;
              this.state.activePlayerName = target.name;
              this.state.activePlayerJersey = target.jerseyNumber;
            }
            if (!this.state.arcCleared && this.isOutsideTwoPointArc(target.mesh.position)) {
              this.state.arcCleared = true;
              this.state.lastShotSummary = 'ARC CLEARED · ATTACK LIVE!';
            }
            this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);

            // If user clicked/released shoot right as pass arrived, execute immediate Catch & Shoot!
            if (this.queuedShotOnCatch && target.team === 'A') {
              this.queuedShotOnCatch = false;
              if (this.queuedShotCharge !== null) {
                const queuedCharge = this.queuedShotCharge;
                this.queuedShotCharge = null;
                this.executeShotOrDunk(target, queuedCharge);
                return;
              }
            } else {
              this.queuedShotOnCatch = false;
              this.queuedShotCharge = null;
            }
            this.notifyState();
          } else if (timedOut) {
            this.passTargetUnit = null;
            this.queuedShotOnCatch = false;
            this.queuedShotCharge = null;
            this.looseBallPickupDelay = 0.18;
            this.state.lastShotSummary = 'LOOSE PASS · CHASE THE BOUNCE!';
          }
        }
      } else if (handler) {
        if (this.ballCarryBlendTimer > 0) this.ballCarryBlendTimer = Math.max(0, this.ballCarryBlendTimer - dt);
        // When gathering/sliding the liquid-glass jump shot meter, bring ball smoothly up into high release pocket!
        if (this.state.shotMeter.isCharging && handler.team === 'A') {
          handler.animState = 'JUMPER_RISE';
          const sol = this.slideShotMeterEngine.getLastSolution();
          this.ball.position.lerp(sol.releaseOrigin, Math.min(1, dt * 20));
          this.ball.rotation.x += dt * 2.2;
        } else {
          const dribbleRate = handler.actualSpeed > 2.5 ? 11.8 : 7.8;
          this.dribblePhase += dt * dribbleRate;
          const halfCycle = Math.floor(this.dribblePhase / Math.PI);
          if (halfCycle !== this.prevDribbleHalfCycle) {
            this.prevDribbleHalfCycle = halfCycle;
            this.courtSystem.triggerRipple(handler.mesh.position.x, handler.mesh.position.z, 0.75, this.elapsedTime);
            this.bounceSystem.triggerSquash(0.85);
            this.audioEngine.playDribbleBounce(
              this.dspEngine.getDestination(),
              handler.actualSpeed > 2 ? 6.6 : 5.1,
              this.state.courtSurface,
              this.state.matchEvolution.wetnessLevel
            );
          }

          const dribble = this.bounceSystem.computeDribbleBounce(
            this.dribblePhase,
            handler.actualSpeed,
            this.state.courtSurface,
            this.state.matchEvolution.wetnessLevel
          );
          const handAnchor = this.dribbleHandSide > 0 ? handler.parts.handR : handler.parts.handL;
          handAnchor.getWorldPosition(this._v2);
          const targetY =
            handler.animState === 'TRIPLE_THREAT' || handler.animState === 'PASS_CATCH'
              ? this._v2.y
              : dribble.y;
          const handX = THREE.MathUtils.lerp(
            this._v2.x,
            handler.mesh.position.x + Math.sin(handler.mesh.rotation.y) * 0.3,
            0.25 - dribble.palmCushion * 0.08
          );
          const handZ = THREE.MathUtils.lerp(
            this._v2.z,
            handler.mesh.position.z + Math.cos(handler.mesh.rotation.y) * 0.3,
            0.25 - dribble.palmCushion * 0.08
          );
          const carryLerp = this.ballCarryBlendTimer > 0 ? Math.min(1, dt * 18) : Math.min(1, dt * 28);
          this.ball.position.lerp(this._v1.set(handX, targetY, handZ), carryLerp);
          this.ball.rotation.x += dt * (4.4 + handler.actualSpeed * 1.4);
          this.ball.rotation.z += dt * this.dribbleHandSide * 1.1;
        }
      } else {
        this.updateLooseBallPhysics(dt);
      }

      this.update3v3AIAndPlayerMovement(dt);
      this.recordBufferFrame(dt);
      return;
    }

    if (this.state.matchState === 'DUNK_FLIGHT' && this.shooterUnit) {
      const dunker = this.shooterUnit;
      this.dunkProgress = Math.min(1, this.dunkProgress + dt * 1.48);
      const p = this.dunkProgress;

      dunker.mesh.position.x = THREE.MathUtils.lerp(this.dunkStartPos.x, this.dunkTargetPos.x, p);
      dunker.mesh.position.z = THREE.MathUtils.lerp(this.dunkStartPos.z, this.dunkTargetPos.z, p);
      dunker.mesh.position.y = Math.sin(p * Math.PI) * 1.68;
      dunker.mesh.lookAt(HOOP_POS.x, 0, HOOP_POS.z);

      this.ball.position.set(
        dunker.mesh.position.x,
        dunker.mesh.position.y + 2.05 + (p > 0.65 ? -(p - 0.65) * 2.4 : 0),
        dunker.mesh.position.z - 0.25
      );
      this.ballVel.subVectors(this.ball.position, this.ballPosPrev).divideScalar(Math.max(0.008, dt));

      const blockHit = this.contactEngine.checkBallVsDefenderHands(
        this.ballPosPrev,
        this.ball.position,
        BALL_RADIUS,
        dunker.team,
        this.units,
        this.elapsedTime
      );
      if (blockHit && p > 0.2 && p < 0.76) {
        this.executeShotBlock(blockHit.defender, blockHit.zone, blockHit.contactPoint);
        return;
      }

      if (this.dunkProgress >= 0.78) {
        dunker.isJumping = false;
        dunker.yVel = 0;
        this.ball.position.set(HOOP_POS.x, HOOP_POS.y - 0.14, HOOP_POS.z);
        this.ballVel.set(0, -6.2, 0);
        this.handleBasketMade(dunker, 1, true);
      }
      this.recordBufferFrame(dt);
      return;
    }

    if (this.state.matchState === 'SHOT_FLIGHT') {
      this.shotAscentTimer += dt;
      const subSteps = 6;
      const subDt = dt / subSteps;

      for (let step = 0; step < subSteps; step++) {
        const prevY = this.ball.position.y;
        const stepPrev = this._v4.copy(this.ball.position);
        this.bounceSystem.stepAirborneBallPhysics(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          this.ball.rotation,
          subDt,
          this.elapsedTime
        );

        // 1. Optical Hand-OBB Block Check while rising or mid-arc
        if (this.shooterUnit && this.ballVel.y > -3.0 && this.ball.position.z > HOOP_POS.z + 0.35) {
          const blockHit = this.contactEngine.checkBallVsDefenderHands(
            stepPrev,
            this.ball.position,
            BALL_RADIUS,
            this.shooterUnit.team,
            this.units,
            this.elapsedTime
          );
          if (blockHit && blockHit.defender.isJumping) {
            this.executeShotBlock(blockHit.defender, blockHit.zone, blockHit.contactPoint);
            return;
          }
        }

        // 2. Full Multi-Element Arena Colliders (Backboard Glass/Pad, Rim Torus/Neck, Boom/Mast/ShotClock, Barriers)
        const arenaCol = this.bounceSystem.resolveArenaAndHoopCollisions(
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          HOOP_POS,
          BACKBOARD_Z,
          RIM_RADIUS,
          RIM_TUBE_RADIUS,
          this.state.matchEvolution.wetnessLevel,
          this.elapsedTime
        );
        if (arenaCol.hitBackboard) {
          this.courtSystem.triggerBackboardImpact();
          this.audioEngine.playBackboardThud(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
        }
        if (arenaCol.hitRim) {
          this.shotHasHitRim = true;
          this.courtSystem.triggerRimClank(arenaCol.maxImpactSpeed * 0.14);
          this.audioEngine.playRimClank(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
        }
        if (arenaCol.hitStructure || arenaCol.hitBarrier) {
          this.audioEngine.playBackboardThud(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
        }

        // 3. Hoop Cylinder Swish / Shooter's Bounce Drop-In Check
        const dx = this.ball.position.x - HOOP_POS.x;
        const dz = this.ball.position.z - HOOP_POS.z;
        const horizErr = Math.hypot(dx, dz);

        if (
          prevY >= HOOP_POS.y - 0.02 &&
          this.ball.position.y < HOOP_POS.y - 0.02 &&
          this.ballVel.y < 0 &&
          horizErr < RIM_RADIUS - 0.03
        ) {
          if (this.shooterUnit) {
            this.ballVel.x *= 0.36;
            this.ballVel.z *= 0.36;
            this.ballVel.y = Math.max(-5.5, this.ballVel.y * 0.68);
            this.handleBasketMade(this.shooterUnit, this.shotWillScorePoints, false);
            return;
          }
        }

        // 4. Floor Impact OR Rebound Exit -> Live Physical Loose Ball Scramble!
        const hitFloor = this.ball.position.y <= BALL_RADIUS;
        const clearMissBelowRim =
          this.ball.position.y < HOOP_POS.y - 0.42 && horizErr > RIM_RADIUS + 0.1 && this.ballVel.y < 0;
        const caromOut = this.shotHasHitRim && this.ballVel.y > 0.65 && horizErr > RIM_RADIUS + 0.24;

        if (hitFloor || clearMissBelowRim || caromOut) {
          if (hitFloor) {
            const bounceRes = this.bounceSystem.resolveFloorBounce(
              this.ball.position,
              this.ballVel,
              this.ballSpin,
              this.ball.rotation,
              this.state.courtSurface,
              this.state.matchEvolution.wetnessLevel,
              subDt,
              this.elapsedTime
            );
            if (bounceRes.bounced) {
              this.courtSystem.triggerRipple(this.ball.position.x, this.ball.position.z, 0.9, this.elapsedTime);
              this.audioEngine.playDribbleBounce(
                this.dspEngine.getDestination(),
                bounceRes.impactSpeed,
                this.state.courtSurface,
                this.state.matchEvolution.wetnessLevel
              );
            }
          }
          this.state.matchState = 'LIVE_PLAY';
          this.shooterUnit = null;
          this.shotHasHitRim = false;
          this.looseBallPickupDelay = hitFloor ? 0.16 : 0.25;
          this.state.lastShotSummary = hitFloor
            ? 'FLOOR BOUNCE · LOOSE BALL!'
            : 'RIM REBOUND · CRASH THE GLASS!';
          break;
        }
      }

      this.state.ballSpeedKmh = Math.round(this.ballVel.length() * 3.6);
      this.update3v3AIAndPlayerMovement(dt);
      this.recordBufferFrame(dt);
    }
  }

  private executeShotBlock(
    blocker: BasketUnit,
    zone: 'HAND_L' | 'HAND_R' | 'TORSO' | 'HEAD' = 'HAND_R',
    contactPt?: THREE.Vector3
  ) {
    this.state.matchState = 'LIVE_PLAY';
    this.shooterUnit = null;
    this.passTargetUnit = null;
    blocker.hasBall = true;
    this.state.ballHandlerId = blocker.id;
    this.state.possessionTeam = blocker.team;
    this.state.shotClock = 12.0;
    this.state.arcCleared = this.isOutsideTwoPointArc(blocker.mesh.position);
    this.hitStopTimer = 0.045;
    this.postFXImpactFlash = 0.72;
    this.cameraShake = 0.58;
    this.stadiumSystem.triggerScoreStrobe(0xffb347, 1.0);
    this.bounceSystem.clearFormFrames();
    this.contactEngine.recordExternalContact(
      'SHOT_BLOCK',
      `#${blocker.jerseyNumber} ${blocker.name}`,
      'SHOT BALL',
      zone,
      1.0,
      contactPt || this.ball.position.clone(),
      this.elapsedTime,
      0xffb347
    );

    this.state.lastShotSummary = `REJECTED! ROOF BLOCK BY #${blocker.jerseyNumber} ${blocker.name}!`;
    this.state.liveCommentaryLine = `GET THAT OUTTA HERE! #${blocker.jerseyNumber} SWATS IT!`;
    this.pushLog(`BLOCK! #${blocker.jerseyNumber} ${blocker.name} denies the shot!`);
    if (this.state.spikeCamEnabled) {
      this.triggerComicStrike('REJECTED!', `BLOCK BY #${blocker.jerseyNumber}`, 88);
    }
    const bus = this.dspEngine.getDestination();
    this.audioEngine.playArenaHorn(bus, 'BLOCK');
    if (bus) {
      this.crowdSystem.playWarmCrowdSwell(bus.ctx, bus.destination, 0.8, 0.72);
    }
    this.notifyState();
  }

  private updateLooseBallPhysics(dt: number) {
    if (this.looseBallPickupDelay > 0) {
      this.looseBallPickupDelay = Math.max(0, this.looseBallPickupDelay - dt);
    }

    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.bounceSystem.stepAirborneBallPhysics(
        this.ball.position,
        this.ballVel,
        this.ballSpin,
        this.ball.rotation,
        subDt,
        this.elapsedTime
      );

      // Full multi-element collisions even during loose ball scrambles (backboard, rim, stanchion, LED barriers)
      const arenaCol = this.bounceSystem.resolveArenaAndHoopCollisions(
        this.ball.position,
        this.ballVel,
        this.ballSpin,
        HOOP_POS,
        BACKBOARD_Z,
        RIM_RADIUS,
        RIM_TUBE_RADIUS,
        this.state.matchEvolution.wetnessLevel,
        this.elapsedTime
      );
      if (arenaCol.hitBackboard) {
        this.courtSystem.triggerBackboardImpact();
        this.audioEngine.playBackboardThud(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
      }
      if (arenaCol.hitRim) {
        this.courtSystem.triggerRimClank(arenaCol.maxImpactSpeed * 0.14);
        this.audioEngine.playRimClank(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
      }
      if (arenaCol.hitBarrier || arenaCol.hitStructure) {
        this.audioEngine.playBackboardThud(this.dspEngine.getDestination(), arenaCol.maxImpactSpeed);
      }

      const bounceRes = this.bounceSystem.resolveFloorBounce(
        this.ball.position,
        this.ballVel,
        this.ballSpin,
        this.ball.rotation,
        this.state.courtSurface,
        this.state.matchEvolution.wetnessLevel,
        subDt,
        this.elapsedTime
      );
      if (bounceRes.bounced) {
        this.courtSystem.triggerRipple(this.ball.position.x, this.ball.position.z, 0.85, this.elapsedTime);
        this.audioEngine.playDribbleBounce(
          this.dspEngine.getDestination(),
          bounceRes.impactSpeed,
          this.state.courtSurface,
          this.state.matchEvolution.wetnessLevel
        );
      }

      // Fast loose ball glancing off unaware / stunned player torso capsules
      const ballSpd = this.ballVel.length();
      if (
        (this.looseBallPickupDelay > 0 || ballSpd > 7.6) &&
        this.ball.position.y > 0.35 &&
        this.ball.position.y < 1.85
      ) {
        for (const u of this.units) {
          const rx = this.ball.position.x - u.mesh.position.x;
          const rz = this.ball.position.z - u.mesh.position.z;
          const dXZ = Math.hypot(rx, rz);
          const minR = 0.34 + BALL_RADIUS;
          if (dXZ < minR && dXZ > 0.001) {
            const nx = rx / dXZ;
            const nz = rz / dXZ;
            const push = minR - dXZ + 0.01;
            this.ball.position.x += nx * push;
            this.ball.position.z += nz * push;
            const res = this.bounceSystem.resolveImpactWithE(
              this.ballVel,
              this.ballSpin,
              nx,
              0.12,
              nz,
              0.46,
              0.38,
              this.state.matchEvolution.wetnessLevel
            );
            if (res.impactSpeed > 1.2) {
              this.audioEngine.playBodyScreenThump(this.dspEngine.getDestination(), 0.45);
            }
          }
        }
      }
    }

    this.state.ballSpeedKmh = Math.round(this.ballVel.length() * 3.6);

    // Jump for high rebounding balls around the paint
    if (this.ball.position.y > 1.65 && this.ball.position.y < 3.15) {
      for (const u of this.units) {
        if (!u.isJumping && u.stunTimer <= 0 && u.mesh.position.distanceTo(HOOP_POS) < 3.1) {
          const dBall = Math.hypot(u.mesh.position.x - this.ball.position.x, u.mesh.position.z - this.ball.position.z);
          if (dBall < 1.85 && Math.random() < dt * 4.5) {
            u.isJumping = true;
            u.yVel = u.stats.vertical * 0.85;
            u.animState = 'BLOCK_LEAP';
          }
        }
      }
    }

    // Realistic Rebound / Loose-Ball Pickup once bounce grace timer expires
    if (this.looseBallPickupDelay <= 0 && this.ball.position.y < 2.55) {
      let best: BasketUnit | null = null;
      let bestDist = 0.92;
      for (const u of this.units) {
        if (u.stunTimer > 0) continue;
        const reachY = u.mesh.position.y + (u.isJumping ? 2.25 : 1.75);
        if (this.ball.position.y > reachY + 0.18) continue;
        const maxReachXZ = u.isJumping ? 0.96 : 0.84;
        const d = Math.hypot(u.mesh.position.x - this.ball.position.x, u.mesh.position.z - this.ball.position.z);
        if (d < maxReachXZ && d < bestDist && (u.isJumping || Math.abs(this.ballVel.y) < 7.2)) {
          bestDist = d;
          best = u;
        }
      }
      if (best) {
        const prevOffense = this.state.possessionTeam;
        best.hasBall = true;
        this.state.ballHandlerId = best.id;
        this.state.possessionTeam = best.team;
        this.state.shotClock = 12.0;
        this.dribblePhase = Math.PI * 0.45;
        this.ballCarryBlendTimer = 0.14;
        this.bounceSystem.clearFormFrames();
        this.bounceSystem.recordPhysicsEvent(
          'REBOUND_SECURED',
          'REBOUND',
          this.ball.position,
          this.ballVel,
          this.ballSpin,
          1.0,
          this.elapsedTime
        );
        this.audioEngine.playPassSnap(this.dspEngine.getDestination(), true);
        if (best.team !== prevOffense) {
          this.state.arcCleared = this.isOutsideTwoPointArc(best.mesh.position);
          this.state.lastShotSummary = `DEFENSIVE REBOUND BY #${best.jerseyNumber} — ${this.state.arcCleared ? 'LIVE!' : 'CLEAR ARC!'}`;
        } else {
          this.state.arcCleared = true;
          this.state.lastShotSummary = `OFFENSIVE BOARD BY #${best.jerseyNumber}! PUT IT BACK!`;
        }
        if (best.team === 'A') {
          this.state.activeCyanId = best.id;
          this.state.activePlayerName = best.name;
          this.state.activePlayerJersey = best.jerseyNumber;
        }
        this.notifyState();
      }
    }
  }

  private updateFlowState(dt: number) {
    const handler = this.getHandler();
    const scoreMax = Math.max(this.state.scoreA, this.state.scoreB);
    const scoreDiff = Math.abs(this.state.scoreA - this.state.scoreB);
    const isClutch =
      this.state.matchFormat !== 'PRACTICE' &&
      scoreMax >= Math.max(15, this.state.targetScore - 4) &&
      scoreDiff <= 4;

    let flowTarget = this.state.flowTelemetry.flowMeter;
    flowTarget -= dt * 2.2;
    if (handler && handler.actualSpeed > 4.2) flowTarget += dt * 4.5;
    if (this.state.shotMeter.comboStreak >= 2) flowTarget += dt * 4.2;
    if (this.state.ankleBreaker.active) flowTarget += dt * 6.5;
    if (isClutch) flowTarget = Math.max(flowTarget, 78);
    const flowMeter = THREE.MathUtils.clamp(flowTarget, 12, 100);

    const nearestDefDist =
      handler
        ? Math.min(
            ...this.getTeamUnits(handler.team === 'A' ? 'B' : 'A').map((d) =>
              d.mesh.position.distanceTo(handler.mesh.position)
            )
          )
        : 9;

    let flowState = this.state.flowTelemetry.flowState;
    let tempoLabel = 'HALFCOURT SET';
    if (isClutch) {
      flowState = 'CLUTCH_TIME';
      tempoLabel = 'CLUTCH TIME · GAME POINT';
    } else if (this.state.streakA >= 2 || this.state.streakB >= 2 || this.state.shotMeter.comboStreak >= 2) {
      flowState = 'ON_FIRE_ZONE';
      tempoLabel = 'ON FIRE ZONE · +FLOW';
    } else if (!this.state.arcCleared || (handler && handler.actualSpeed > 4.6)) {
      flowState = 'TRANSITION_PUSH';
      tempoLabel = 'TRANSITION PUSH';
    } else if (handler && nearestDefDist < 2.2 && (this.state.activePlayCall === 'ISO_SLASH' || this.state.ankleBreaker.active)) {
      flowState = 'ISOLATION_LOCK';
      tempoLabel = 'ISO 1-ON-1 LOCK';
    } else {
      flowState = 'HALFCOURT_SET';
      tempoLabel = 'HALFCOURT SET';
    }

    const hotTeam =
      this.state.streakA >= 2 ? 'A' : this.state.streakB >= 2 ? 'B' : 'NEUTRAL';
    const onFireUnit =
      this.state.shotMeter.comboStreak >= 2 && handler
        ? `#${handler.jerseyNumber} ${handler.name}`
        : hotTeam === 'A'
        ? 'CYAN STORM'
        : hotTeam === 'B'
        ? 'VICE CORAL'
        : null;

    this.state.flowTelemetry.flowState = flowState;
    this.state.flowTelemetry.flowMeter = Math.round(flowMeter);
    this.state.flowTelemetry.hotTeam = hotTeam;
    this.state.flowTelemetry.tempoLabel = tempoLabel;
    this.state.flowTelemetry.onFirePlayerName = onFireUnit;
  }

  private update3v3AIAndPlayerMovement(dt: number) {
    if (this.stealCooldown > 0) {
      this.stealCooldown = Math.max(0, this.stealCooldown - dt);
      if (this.stealCooldown < 0.25) {
        this.state.stealTelemetry.activeLunge = false;
      }
    }
    if (this.ankleBreakerCooldown > 0) {
      this.ankleBreakerCooldown = Math.max(0, this.ankleBreakerCooldown - dt);
      this.state.ankleBreaker.cooldownSec = Number(this.ankleBreakerCooldown.toFixed(1));
    }
    if (this.ankleBreakerBannerTimer > 0) {
      this.ankleBreakerBannerTimer = Math.max(0, this.ankleBreakerBannerTimer - dt);
      if (this.ankleBreakerBannerTimer <= 0) {
        this.state.ankleBreaker.active = false;
      }
    }

    const handler = this.getHandler();
    const activeCyan = this.getActiveCyan();
    const offTeam = this.state.possessionTeam;
    const isPlayerControl = this.state.controlMode === 'PLAYER';

    // Update live steal opportunity window label
    if (
      this.shooterUnit &&
      this.shooterUnit.team === 'B' &&
      ((this.state.matchState === 'SHOT_FLIGHT' && this.shotAscentTimer < 0.36 && this.ball.position.y < 3.1) ||
        (this.state.matchState === 'DUNK_FLIGHT' && this.dunkProgress < 0.56))
    ) {
      this.state.stealTelemetry.windowLabel = 'SHOOTING STRIP WINDOW!';
    } else if (this.stealPursuitTargetId !== null) {
      this.state.stealTelemetry.windowLabel = 'CLOSING TO STEAL';
    } else if (handler && handler.team === 'B') {
      this.state.stealTelemetry.windowLabel =
        Math.sin(this.dribblePhase % Math.PI) < 0.65 || handler.actualSpeed > 3.2
          ? 'DRIBBLE VULNERABLE · 1-TAP'
          : 'PROTECTED DRIBBLE';
    } else if (this.stealCooldown <= 0) {
      this.state.stealTelemetry.windowLabel = '1-TAP STEAL READY';
    }

    // Advance natural human visual-motor reaction queue for Double-Tap Ankle-Breaker
    for (let i = this.pendingReactions.length - 1; i >= 0; i--) {
      const rx = this.pendingReactions[i];
      rx.elapsed += dt;
      if (rx.elapsed >= rx.reactionDelay && !rx.resolved) {
        rx.resolved = true;
        const def = this.units.find((u) => u.id === rx.defenderId);
        if (def && handler && handler.team === 'A') {
          const distNow = def.mesh.position.distanceTo(handler.mesh.position);
          const sepVel = Math.hypot(
            handler.velocity.x - rx.committedVx,
            handler.velocity.z - rx.committedVz
          );
          if (distNow < 2.65 && sepVel > 3.6) {
            def.stunTimer = 1.45;
            def.animState = 'SLUMP';
            def.landingCompression = 0.28;
            def.velocity.set(rx.committedVx * 0.5, 0, rx.committedVz * 0.5);
            this.state.ankleBreaker.frozenDefenderName = `#${def.jerseyNumber} ${def.name}`;
            this.contactEngine.recordExternalContact(
              'BODY_BUMP',
              `#${handler.jerseyNumber} ${handler.name}`,
              `#${def.jerseyNumber} ${def.name}`,
              'STANCE',
              1.0,
              def.mesh.position.clone().setY(0.2),
              this.elapsedTime,
              0xd946ef
            );
            this.particleSystem.emitDustBurst(def.mesh.position, 14, 1.1);
            this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());
            this.state.lastShotSummary = `ANKLE BREAKER! #${def.jerseyNumber} ${def.name} DROPPED (${Math.round(
              rx.reactionDelay * 1000
            )}ms)!`;
            this.pushLog(`ANKLE BREAKER! #${def.jerseyNumber} bit on the ${Math.round(rx.reactionDelay * 1000)}ms fake!`);
          }
        }
        this.pendingReactions.splice(i, 1);
      }
    }

    for (const u of this.units) {
      if (u.screenActiveTimer > 0) u.screenActiveTimer = Math.max(0, u.screenActiveTimer - dt);
      if (u.splitStepTimer > 0) u.splitStepTimer = Math.max(0, u.splitStepTimer - dt);
      if (u.scuffCooldown > 0) u.scuffCooldown = Math.max(0, u.scuffCooldown - dt);

      if (u.stunTimer > 0) {
        u.stunTimer = Math.max(0, u.stunTimer - dt);
        u.velocity.multiplyScalar(0.85);
        continue;
      }

      // If defender is inside human visual-motor reaction latency window, keep moving along stale vector!
      const activeReaction = this.pendingReactions.find((r) => r.defenderId === u.id && !r.resolved);
      if (activeReaction) {
        u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, activeReaction.committedVx, dt * 8);
        u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, activeReaction.committedVz, dt * 8);
        continue;
      }

      const isUserControlled = isPlayerControl && u.id === activeCyan.id;
      if (isUserControlled) {
        this.stalledTimer = 0;

        // Active One-Tap Auto-Pursuit Steal Lock!
        if (this.stealPursuitTargetId !== null) {
          if (!handler || handler.id !== this.stealPursuitTargetId || handler.team === 'A') {
            this.stealPursuitTargetId = null;
            this.state.stealTelemetry.pursuitTargetId = null;
          } else {
            const dxS = handler.mesh.position.x - u.mesh.position.x;
            const dzS = handler.mesh.position.z - u.mesh.position.z;
            const distS = Math.hypot(dxS, dzS);
            if (distS <= 2.35 && this.stealCooldown <= 0) {
              this.attemptSteal(u, handler, 'ONE_TAP');
            } else {
              const spdS = u.speed * 1.24;
              u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, (dxS / Math.max(0.01, distS)) * spdS, dt * 14);
              u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, (dzS / Math.max(0.01, distS)) * spdS, dt * 14);
              continue;
            }
          }
        }

        let ix = 0;
        let iz = 0;
        if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) iz -= 1;
        if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) iz += 1;
        if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) ix -= 1;
        if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) ix += 1;

        const sprinting = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
        const topSpeed = u.speed * (sprinting ? 1.25 : 1.0);

        if (ix !== 0 || iz !== 0) {
          this.pointerTarget = null;
          this.aimReticle.visible = false;
          const len = Math.hypot(ix, iz);
          const targetVx = (ix / len) * topSpeed;
          const targetVz = (iz / len) * topSpeed;
          const dot = targetVx * u.velocity.x + targetVz * u.velocity.z;
          if (dot < -3.0 && u.scuffCooldown <= 0 && !u.isJumping) {
            u.scuffCooldown = 0.28;
            u.splitStepTimer = 0.16;
            this.particleSystem.emitDustBurst(u.mesh.position, 6, 0.65);
            this.audioEngine.playSneakerSqueak(this.dspEngine.getDestination());
          }
          u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, targetVx, dt * 14);
          u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, targetVz, dt * 14);
        } else if (this.pointerTarget) {
          const dx = this.pointerTarget.x - u.mesh.position.x;
          const dz = this.pointerTarget.z - u.mesh.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.25) {
            this.pointerTarget = null;
            this.aimReticle.visible = false;
            u.velocity.multiplyScalar(0.75);
          } else {
            u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, (dx / dist) * topSpeed, dt * 12);
            u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, (dz / dist) * topSpeed, dt * 12);
          }
        } else {
          u.velocity.multiplyScalar(Math.max(0, 1 - dt * 11));
        }
        continue;
      }

      if (!handler) {
        u.targetPos.set(this.ball.position.x, 0, this.ball.position.z);
      } else if (u.team === offTeam) {
        if (u.hasBall) {
          if (!this.state.arcCleared) {
            u.targetPos.set(u.mesh.position.x < 0 ? -3.4 : 3.4, 0, 3.15);
          } else {
            const driveIntensity =
              this.state.activePlayCall === 'ISO_SLASH' || this.state.activePlayCall === 'FAST_BREAK';
            if (this.state.activePlayCall === 'FIVE_OUT_3PT') {
              u.targetPos.set(u.role === 'PG' ? 0 : u.role === 'WING' ? -5.8 : 5.8, 0, 1.95);
            } else {
              u.targetPos.set(
                Math.sin(this.elapsedTime * 1.4) * (driveIntensity ? 1.8 : 2.6),
                0,
                driveIntensity ? -2.9 : -1.2
              );
            }

            const hoopDist = Math.hypot(u.mesh.position.x - HOOP_POS.x, u.mesh.position.z - HOOP_POS.z);
            const closeDefender = Math.min(
              ...this.getTeamUnits(u.team === 'A' ? 'B' : 'A').map((d) =>
                d.mesh.position.distanceTo(u.mesh.position)
              )
            );
            const clockLow = this.state.shotClock < 2.6;
            const wantsDunk = hoopDist < 3.2 && closeDefender > 1.25;
            const wantsJumper = (closeDefender > 2.15 && hoopDist < 7.6) || clockLow;

            if ((wantsDunk || wantsJumper) && Math.random() < dt * (clockLow ? 3.5 : 1.35)) {
              const simCharge = 0.68 + Math.random() * 0.22;
              this.executeShotOrDunk(u, simCharge);
            } else if (closeDefender < 1.35 && Math.random() < dt * 1.6) {
              const mates = this.getTeamUnits(u.team).filter((m) => m.id !== u.id);
              const oppList = this.getTeamUnits(u.team === 'A' ? 'B' : 'A');
              const targetMate = this.passingEngine.selectBestTeammate(
                u,
                mates,
                oppList,
                this.contactEngine,
                HOOP_POS,
                this.state.arcCleared,
                (pos) => this.isOutsideTwoPointArc(pos)
              );
              if (targetMate) this.executePass(u, targetMate);
            }
          }
        } else {
          if (this.state.activePlayCall === 'PICK_AND_ROLL' && u.role === 'BIG') {
            u.targetPos.set(handler.mesh.position.x + 1.05, 0, handler.mesh.position.z - 0.65);
            if (u.mesh.position.distanceTo(u.targetPos) < 0.7) {
              u.screenActiveTimer = 0.35;
            }
          } else if (u.role === 'WING') {
            u.targetPos.set(-5.6, 0, -2.4 + Math.sin(this.elapsedTime * 1.1) * 1.4);
          } else {
            u.targetPos.set(5.6, 0, -2.1 + Math.cos(this.elapsedTime * 1.1) * 1.4);
          }
        }
      } else {
        const oppUnits = this.getTeamUnits(offTeam);
        const assignment = oppUnits.find((o) => o.id === u.guardingId) || oppUnits[0];
        if (assignment) {
          const scheme = u.team === 'B' ? this.state.defenseSchemeB : this.state.defenseSchemeA;
          const sagRatio = scheme === 'PAINT_PROTECT' ? 0.56 : scheme === 'FULL_PRESS' ? 0.18 : 0.34;
          u.targetPos.lerpVectors(assignment.mesh.position, HOOP_POS, sagRatio);
          u.targetPos.y = 0;

          if (assignment.isJumping && !u.isJumping && u.mesh.position.distanceTo(assignment.mesh.position) < 2.2) {
            u.isJumping = true;
            u.yVel = u.stats.vertical * 0.88;
            u.animState = 'BLOCK_LEAP';
          } else if (
            assignment.hasBall &&
            !this.state.shotMeter.isCharging &&
            this.stealCooldown <= 0 &&
            u.mesh.position.distanceTo(assignment.mesh.position) < 0.96 &&
            Math.random() < dt * (this.state.difficulty === 'ROOKIE' ? 0.25 : 0.48)
          ) {
            this.attemptSteal(u, assignment, 'MANUAL');
          }
        }
      }

      const flowMul = 1 + (this.state.flowTelemetry.flowMeter / 100) * 0.08;
      const dx = u.targetPos.x - u.mesh.position.x;
      const dz = u.targetPos.z - u.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.18) {
        const moveSpd = u.speed * 0.88 * flowMul;
        u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, (dx / dist) * moveSpd, dt * 8.5);
        u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, (dz / dist) * moveSpd, dt * 8.5);
      } else {
        u.velocity.multiplyScalar(0.8);
      }
    }

    // Resolve Real-Time Optical Player-to-Player Screen / Box-out / Bump Contacts
    const contactSummary = this.contactEngine.resolvePlayerBodyContacts(
      this.units,
      this.state.possessionTeam,
      this.elapsedTime
    );
    if (contactSummary.maxImpulse > 0.65) {
      this.audioEngine.playBodyScreenThump(this.dspEngine.getDestination(), contactSummary.maxImpulse);
    }
  }

  private updateUnitsKinematics(dt: number, liveMatch: boolean) {
    this.characterShaderRig.update(this.elapsedTime, 1.0);
    const activeCyan = this.getActiveCyan();

    const chaseApronMargin = this.getHandler() ? -0.4 : 1.35;
    for (const u of this.units) {
      if (liveMatch && (this.state.matchState !== 'DUNK_FLIGHT' || u.id !== this.lastDunkSlamUnit?.id)) {
        u.mesh.position.x = THREE.MathUtils.clamp(
          u.mesh.position.x + u.velocity.x * dt,
          -COURT_W / 2 - chaseApronMargin,
          COURT_W / 2 + chaseApronMargin
        );
        u.mesh.position.z = THREE.MathUtils.clamp(
          u.mesh.position.z + u.velocity.z * dt,
          -COURT_D / 2 - chaseApronMargin,
          COURT_D / 2 + chaseApronMargin
        );

        if (u.isJumping) {
          u.wasInAir = true;
          u.yVel += GRAVITY * dt;
          u.mesh.position.y += u.yVel * dt;
          if (u.mesh.position.y <= 0) {
            u.mesh.position.y = 0;
            u.yVel = 0;
            u.isJumping = false;
            u.landingCompression = 0.22;
            u.animState = 'LANDING_ABSORB';
            u.animTimer = 0;
            this.particleSystem.emitDustBurst(u.mesh.position, 8, 0.72);
          }
        }
      }

      if (u.landingCompression > 0) {
        u.landingCompression = THREE.MathUtils.damp(u.landingCompression, 0, 12, dt);
      }

      u.actualSpeed = Math.hypot(u.velocity.x, u.velocity.z);
      if (u.actualSpeed > 0.35 && !u.isJumping) {
        u.stepCycle += dt * u.actualSpeed * 2.15;
        const targetYaw = Math.atan2(u.velocity.x, u.velocity.z);
        const yawDiff = ((targetYaw - u.mesh.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        u.mesh.rotation.y = this.dampAngle(u.mesh.rotation.y, targetYaw, 13, dt);
        // Smooth kinetic banking lean pitch & roll matching Volleyball MovementOrchestrator
        u.currentLeanPitch = THREE.MathUtils.damp(
          u.currentLeanPitch,
          THREE.MathUtils.clamp(u.actualSpeed * 0.024, 0, 0.22),
          10,
          dt
        );
        u.currentLeanRoll = THREE.MathUtils.damp(
          u.currentLeanRoll,
          THREE.MathUtils.clamp(-yawDiff * 0.14, -0.18, 0.18),
          10,
          dt
        );
        if (u.animState !== 'CROSSOVER' && u.animState !== 'STEAL_LUNGE' && u.animState !== 'PASS_RELEASE') {
          u.animState = u.hasBall ? 'DRIBBLE_RUN' : 'RUN';
        }
      } else if (!u.isJumping && u.stunTimer <= 0) {
        u.currentLeanPitch = THREE.MathUtils.damp(u.currentLeanPitch, 0, 10, dt);
        u.currentLeanRoll = THREE.MathUtils.damp(u.currentLeanRoll, 0, 10, dt);
        const isCelebrating =
          this.state.matchState === 'SCORE_CELEBRATION' &&
          (u.animState === 'CELEBRATION' ||
            u.animState === 'CELEBRATE_ICE' ||
            u.animState === 'CELEBRATE_ROCK' ||
            u.animState === 'CELEBRATE_GUITAR' ||
            u.animState === 'CELEBRATE_BUMP' ||
            u.animState === 'CELEBRATE_SHUSH');
        if (u.screenActiveTimer > 0) {
          u.animState = 'SCREEN_SET';
        } else if (isCelebrating) {
          // hold celebration cutscene choreography
        } else if (u.animState === 'CELEBRATION' && u.animTimer < 1.1) {
          // hold celebration
        } else if (u.animState === 'LANDING_ABSORB' && u.landingCompression > 0.04) {
          // hold knee absorb
        } else if (u.hasBall && liveMatch) {
          u.animState = 'TRIPLE_THREAT';
        } else {
          u.animState = 'READY_STANCE';
        }
        if (liveMatch && !isCelebrating) {
          const lookAtTarget = u.hasBall ? HOOP_POS : this.ball.position;
          const lookYaw = Math.atan2(lookAtTarget.x - u.mesh.position.x, lookAtTarget.z - u.mesh.position.z);
          u.mesh.rotation.y = this.dampAngle(u.mesh.rotation.y, lookYaw, 8, dt);
        }
      }

      this.animateArticulatedLimbs(u, dt);
      u.sweatLevel = Math.min(1, u.sweatLevel + dt * (u.actualSpeed > 2 ? 0.015 : 0.002));
      this.characterShaderRig.updateUnitState(
        u.jerseyNumber + (u.team === 'A' ? 0 : 100),
        u.isJumping ? 0.14 : 0,
        u.hasBall ? 1.0 : 0.65,
        u.sweatLevel
      );

      // Grounded Floor Sprites: anchor y inversely to jump height so sprites NEVER float in mid-air!
      const hScale = u.profile.heightScale || 1.0;
      const jumpHeightOffset = -u.mesh.position.y / hScale;
      const airScale = THREE.MathUtils.clamp(1 - u.mesh.position.y * 0.18, 0.55, 1.0);
      const isHighlighted = u.id === activeCyan.id || u.hasBall;

      const auraMat = u.parts.auraMesh.material as THREE.MeshBasicMaterial;
      auraMat.opacity = isHighlighted ? (u.hasBall ? 0.88 : 0.52) * airScale : 0;
      u.parts.auraMesh.position.y = jumpHeightOffset + 0.03;
      u.parts.auraMesh.scale.setScalar(airScale);

      if (u.floorSpriteMesh) {
        const spMat = u.floorSpriteMesh.material as THREE.MeshBasicMaterial;
        const beatScale = (1 + (u.actualSpeed > 0.5 ? Math.sin(u.stepCycle) * 0.14 : 0.04)) * airScale;
        u.floorSpriteMesh.position.y = jumpHeightOffset + 0.024;
        u.floorSpriteMesh.scale.setScalar(beatScale);
        spMat.opacity = (isHighlighted ? 0.42 : 0.16) * airScale;
      }
      if (u.parts.vectorArrow) {
        u.parts.vectorArrow.visible = u.actualSpeed > 0.6;
        if (u.parts.vectorArrow.visible) {
          const velYaw = Math.atan2(u.velocity.x, u.velocity.z);
          const relYaw = velYaw - u.mesh.rotation.y;
          u.parts.vectorArrow.position.set(
            Math.sin(relYaw) * 0.48,
            jumpHeightOffset + 0.032,
            Math.cos(relYaw) * 0.48
          );
          u.parts.vectorArrow.rotation.y = relYaw;
        }
      }
    }
  }

  private animateArticulatedLimbs(u: BasketUnit, dt: number) {
    const p = u.parts;
    u.animTimer += dt;
    const stride = u.actualSpeed > 0.35 ? Math.sin(u.stepCycle) * 0.76 : 0;

    // Grounded Legs-to-Floor FK + Kinetic Sprint Banking + Landing Compression
    const comp = u.landingCompression;
    p.legUpperL.rotation.x = stride - comp * 1.4;
    p.legUpperR.rotation.x = -stride - comp * 1.4;
    p.legLowerL.rotation.x = Math.max(0, -stride * 0.92) + comp * 2.5;
    p.legLowerR.rotation.x = Math.max(0, stride * 0.92) + comp * 2.5;
    p.shoesL.rotation.x = -(p.legUpperL.rotation.x + p.legLowerL.rotation.x) * 0.42;
    p.shoesR.rotation.x = -(p.legUpperR.rotation.x + p.legLowerR.rotation.x) * 0.42;

    p.hips.position.y =
      0.88 - comp * 0.35 + (u.actualSpeed > 0.35 ? Math.abs(Math.cos(u.stepCycle)) * 0.045 : 0);
    p.hips.rotation.x = u.currentLeanPitch;
    p.hips.rotation.z = u.currentLeanRoll;

    p.shoulderL.rotation.z = 0.1;
    p.shoulderR.rotation.z = -0.1;
    p.head.rotation.x = u.isJumping ? -0.18 : 0.04;

    if (u.animState === 'DUNK_LAUNCH') {
      p.armUpperR.rotation.x = -2.92;
      p.armUpperL.rotation.x = -2.55;
      p.armLowerR.rotation.x = -0.18;
      p.armLowerL.rotation.x = -0.25;
      p.torso.rotation.x = 0.28;
    } else if (u.animState === 'JUMPER_RISE' || u.animState === 'BLOCK_LEAP') {
      p.armUpperR.rotation.x = -2.62;
      p.armUpperL.rotation.x = -2.42;
      p.armLowerR.rotation.x = -0.35;
      p.armLowerL.rotation.x = -0.45;
      p.torso.rotation.x = -0.08;
    } else if (u.animState === 'STEPBACK') {
      p.armUpperR.rotation.x = -2.52;
      p.armUpperL.rotation.x = -2.15;
      p.armLowerR.rotation.x = -0.28;
      p.armLowerL.rotation.x = -0.45;
      p.torso.rotation.x = -0.24;
    } else if (u.animState === 'PASS_RELEASE' && u.animTimer < 0.28) {
      p.armUpperR.rotation.x = -1.45;
      p.armUpperL.rotation.x = -1.45;
      p.armLowerR.rotation.x = -0.12;
      p.armLowerL.rotation.x = -0.12;
      p.torso.rotation.x = 0.2;
    } else if (u.animState === 'PASS_CATCH' && u.animTimer < 0.22) {
      p.armUpperR.rotation.x = -1.1;
      p.armUpperL.rotation.x = -1.1;
      p.armLowerR.rotation.x = -0.95;
      p.armLowerL.rotation.x = -0.95;
      p.torso.rotation.x = 0.14;
    } else if (u.animState === 'ANKLE_BREAKER' && u.animTimer < 0.42) {
      p.torso.rotation.x = 0.42;
      p.hips.position.y = 0.72;
      p.armUpperR.rotation.x = -1.25;
      p.armLowerR.rotation.x = -0.75;
      p.armUpperL.rotation.x = -1.15;
      p.armLowerL.rotation.x = -0.85;
    } else if (u.animState === 'CROSSOVER' && u.animTimer < 0.35) {
      p.torso.rotation.x = 0.34;
      p.hips.position.y = 0.76;
      p.armUpperR.rotation.x = -1.05;
      p.armLowerR.rotation.x = -0.85;
      p.armUpperL.rotation.x = -0.75;
      p.armLowerL.rotation.x = -0.95;
    } else if (u.animState === 'SCREEN_SET' || u.animState === 'BOX_OUT') {
      p.hips.position.y = 0.78;
      p.legUpperL.rotation.z = 0.14;
      p.legUpperR.rotation.z = -0.14;
      p.armUpperR.rotation.x = -1.15;
      p.armUpperL.rotation.x = -1.15;
      p.armLowerR.rotation.x = -1.15;
      p.armLowerL.rotation.x = -1.15;
      p.torso.rotation.x = 0.12;
    } else if (u.animState === 'TRIPLE_THREAT') {
      p.hips.position.y = 0.82;
      p.torso.rotation.x = 0.16;
      p.armUpperR.rotation.x = -0.85;
      p.armLowerR.rotation.x = -1.05;
      p.armUpperL.rotation.x = -0.75;
      p.armLowerL.rotation.x = -0.95;
    } else if (u.animState === 'STEAL_LUNGE' && u.animTimer < 0.36) {
      p.torso.rotation.x = 0.44;
      p.hips.position.y = 0.72;
      p.armUpperR.rotation.x = -1.68;
      p.armLowerR.rotation.x = -0.18;
      p.armUpperL.rotation.x = -0.65;
      p.armLowerL.rotation.x = -0.75;
    } else if (u.animState === 'CELEBRATION') {
      p.armUpperR.rotation.x = -2.65 + Math.sin(u.animTimer * 12) * 0.2;
      p.armUpperL.rotation.x = -0.5;
      p.torso.rotation.x = -0.06;
    } else if (u.animState === 'CELEBRATE_ICE') {
      p.torso.rotation.x = -0.08;
      p.armUpperL.rotation.x = -1.35;
      p.armLowerL.rotation.x = -0.22;
      p.armUpperR.rotation.x = -1.45 + Math.sin(u.animTimer * 10) * 0.14;
      p.armLowerR.rotation.x = -1.25;
      p.head.rotation.x = -0.12;
    } else if (u.animState === 'CELEBRATE_ROCK') {
      const sway = Math.sin(u.animTimer * 7.5) * 0.32;
      p.hips.position.y = 0.78 + Math.abs(sway) * 0.06;
      p.torso.rotation.x = 0.1;
      p.hips.rotation.z = sway * 0.35;
      p.armUpperL.rotation.x = -1.15;
      p.armUpperR.rotation.x = -1.15;
      p.armLowerL.rotation.x = -1.25 + sway * 0.4;
      p.armLowerR.rotation.x = -1.25 - sway * 0.4;
    } else if (u.animState === 'CELEBRATE_GUITAR') {
      const strum = Math.sin(u.animTimer * 18) * 0.48;
      p.torso.rotation.x = -0.22;
      p.hips.position.y = 0.76;
      p.armUpperL.rotation.x = -1.35;
      p.armLowerL.rotation.x = -0.65;
      p.armUpperR.rotation.x = -0.85 + strum * 0.5;
      p.armLowerR.rotation.x = -1.15 + strum;
      p.head.rotation.x = -0.24 + Math.sin(u.animTimer * 9) * 0.12;
    } else if (u.animState === 'CELEBRATE_BUMP') {
      p.torso.rotation.x = -0.18;
      p.armUpperL.rotation.x = -0.75;
      p.armUpperR.rotation.x = -0.75;
      p.armLowerL.rotation.x = -0.95;
      p.armLowerR.rotation.x = -0.95;
      p.shoulderL.rotation.z = 0.45;
      p.shoulderR.rotation.z = -0.45;
    } else if (u.animState === 'CELEBRATE_SHUSH') {
      p.torso.rotation.x = -0.04;
      p.armUpperR.rotation.x = -1.85;
      p.armLowerR.rotation.x = -1.42;
      p.armUpperL.rotation.x = -0.25;
      p.head.rotation.x = -0.06;
    } else if (u.animState === 'SLUMP') {
      p.hips.position.y = 0.72;
      p.torso.rotation.x = 0.45;
      p.armUpperL.rotation.x = -0.25;
      p.armUpperR.rotation.x = -0.25;
    } else if (u.hasBall) {
      const bounceSin = Math.sin(this.dribblePhase * 2.0);
      const isRight = this.dribbleHandSide > 0;
      p.armUpperR.rotation.x = isRight ? -0.92 + bounceSin * 0.28 : -0.45;
      p.armLowerR.rotation.x = isRight ? -0.88 - bounceSin * 0.22 : -0.68;
      p.armUpperL.rotation.x = !isRight ? -0.92 + bounceSin * 0.28 : -0.42;
      p.armLowerL.rotation.x = !isRight ? -0.88 - bounceSin * 0.22 : -0.65;
      p.torso.rotation.x = 0.14;
    } else {
      p.legUpperL.rotation.z = 0;
      p.legUpperR.rotation.z = 0;
      p.armUpperL.rotation.x = -stride * 0.75 - 0.15;
      p.armUpperR.rotation.x = stride * 0.75 - 0.15;
      p.armLowerL.rotation.x = -0.48 - Math.max(0, stride) * 0.25;
      p.armLowerR.rotation.x = -0.48 - Math.max(0, -stride) * 0.25;
      p.torso.rotation.x = u.actualSpeed > 1 ? 0.12 : 0.04;
    }
  }

  private dampAngle(a: number, b: number, lambda: number, dt: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * (1 - Math.exp(-lambda * dt));
  }

  private recordBufferFrame(dt: number) {
    this.liveBuffer.push({
      dt,
      ballPos: [this.ball.position.x, this.ball.position.y, this.ball.position.z],
      ballSpeedKmh: this.state.ballSpeedKmh,
      players: this.units.map((u) => ({
        id: u.id,
        pos: [u.mesh.position.x, u.mesh.position.y, u.mesh.position.z],
        rotY: u.mesh.rotation.y,
      })),
    });
    if (this.liveBuffer.length > 120) this.liveBuffer.shift();
  }

  private updateReplayFrame(rawDt: number) {
    const clip = this.state.replayState.currentClip;
    if (!clip || clip.frames.length === 0) return;

    this.replayElapsed += rawDt * this.state.replayState.playbackSpeed;
    if (this.replayElapsed >= this.replayDuration) {
      this.replayElapsed = 0;
    }
    const progress = this.replayElapsed / this.replayDuration;
    this.state.replayState.progress = progress;

    const frameIdx = Math.min(clip.frames.length - 1, Math.floor(progress * clip.frames.length));
    const f = clip.frames[frameIdx];
    this.ball.position.set(f.ballPos[0], f.ballPos[1], f.ballPos[2]);
    this.state.ballSpeedKmh = f.ballSpeedKmh;
    f.players.forEach((pf) => {
      const u = this.units.find((x) => x.id === pf.id);
      if (u) {
        u.mesh.position.set(pf.pos[0], pf.pos[1], pf.pos[2]);
        u.mesh.rotation.y = pf.rotY;
      }
    });

    const ang = this.state.replayState.currentAngle;
    const t = this.elapsedTime * 0.55;
    if (ang === 'NET_TAPE_SWEEP') {
      this.camera.position.lerp(this._v1.set(Math.sin(t) * 3.8, 3.6, HOOP_POS.z + 3.4), 0.12);
    } else if (ang === 'FLOOR_IMPACT_LOW') {
      this.camera.position.lerp(this._v1.set(-3.8, 1.35, -1.2), 0.12);
    } else if (ang === 'SPIKER_SHOULDER') {
      this.camera.position.lerp(this._v1.set(f.ballPos[0] + 2.4, f.ballPos[1] + 1.2, f.ballPos[2] + 3.8), 0.12);
    } else {
      this.camera.position.lerp(this._v1.set(Math.cos(t) * 6.5, 4.8, Math.sin(t) * 6.5 - 1.5), 0.12);
    }
    this.controls.target.lerp(this.ball.position, 0.2);
    this.controls.update();
  }

  private updateCamera(rawDt: number) {
    if (this.userOrbitPauseTimer > 0 && !this.isUserOrbiting) {
      this.userOrbitPauseTimer = Math.max(0, this.userOrbitPauseTimer - rawDt);
    }

    if (this.goalieFocusTimer > 0) {
      this.goalieFocusTimer = Math.max(0, this.goalieFocusTimer - rawDt);
      this.soccerGoalie.getStationFocusTarget(this._goalCamPos, this._goalLookPos);
      const damp = 1 - Math.exp(-6.5 * rawDt);
      this.camera.position.lerp(this._goalCamPos, damp);
      this.controls.target.lerp(this._goalLookPos, damp);
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, 42, 7, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      return;
    }

    if (this.aiCamHoldTimer > 0) {
      this.aiCamHoldTimer = Math.max(0, this.aiCamHoldTimer - rawDt);
      const damp = 1 - Math.exp(-5.0 * rawDt);
      this.camera.position.lerp(this.aiCamTargetPos, damp);
      this.controls.target.lerp(this.aiCamLookPos, damp);
      this.controls.update();
      return;
    }

    if (
      this.state.matchState === 'SCORE_CELEBRATION' &&
      this.state.celebrationCutscene.active &&
      this.shooterUnit
    ) {
      const cel = this.state.celebrationCutscene;
      const p = Math.min(1, cel.elapsedSec / Math.max(0.5, cel.durationSec));
      const scorer = this.shooterUnit;
      const damp = 1 - Math.exp(-8.5 * rawDt);
      let targetFov = 36;
      let targetTilt = 0;

      if (cel.type === 'ICE_IN_VEINS') {
        const dist = THREE.MathUtils.lerp(3.45, 2.2, p);
        this._v1.set(scorer.mesh.position.x + 0.9, 1.15 + p * 0.28, scorer.mesh.position.z + dist);
        this._v2.set(scorer.mesh.position.x, 1.38, scorer.mesh.position.z);
        targetFov = 32;
      } else if (cel.type === 'ROCK_THE_BABY') {
        const arc = -0.5 + p * 1.0;
        this._v1.set(scorer.mesh.position.x + Math.sin(arc) * 2.85, 1.25, scorer.mesh.position.z + Math.cos(arc) * 2.85);
        this._v2.set(scorer.mesh.position.x, 1.15, scorer.mesh.position.z);
        targetFov = 36;
      } else if (cel.type === 'AIR_GUITAR_ROCK') {
        const ang = p * 1.15;
        this._v1.set(scorer.mesh.position.x + Math.sin(ang) * 3.1, 0.85, scorer.mesh.position.z + Math.cos(ang) * 3.1);
        this._v2.set(scorer.mesh.position.x, 1.28, scorer.mesh.position.z);
        targetFov = 38;
        targetTilt = -6.2 * Math.cos(p * Math.PI);
      } else if (cel.type === 'CHEST_BUMP_SQUAD' && this.celebrationCompanionUnit) {
        this._v2.lerpVectors(scorer.mesh.position, this.celebrationCompanionUnit.mesh.position, 0.5);
        this._v2.y = 1.25;
        this._v1.set(this._v2.x + 2.4, 1.4, this._v2.z + 3.1);
        targetFov = 40;
      } else {
        // CROWD_SILENCER
        const dist = THREE.MathUtils.lerp(3.2, 4.7, p);
        this._v1.set(scorer.mesh.position.x - 1.35 + p * 1.8, 1.2 + p * 0.45, scorer.mesh.position.z + dist);
        this._v2.set(scorer.mesh.position.x, 1.45, scorer.mesh.position.z - 1.2);
        targetFov = 42;
      }

      this.camera.position.lerp(this._v1, damp);
      this.controls.target.lerp(this._v2, damp * 1.15);
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, targetFov, 7, rawDt);
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, targetTilt, 8, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
    } else if (this.state.comicStrike.active && this.state.spikeCamEnabled) {
      const p = Math.min(1, this.comicTimer / this.comicDuration);
      this.aiCameraDirector.evaluateComicOrbitFrame(Math.min(1, p / 0.72), this.ball.position, this._comicSol);
      const damp = 1 - Math.exp(-11 * rawDt);
      if (p < 0.72) {
        this.camera.position.lerp(this._comicSol.cameraPos, damp);
        this.controls.target.lerp(this._comicSol.lookTarget, damp * 1.2);
        this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this._comicSol.fov, 10, rawDt);
        this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, this._comicSol.dutchTiltDeg, 10, rawDt);
      } else {
        this.camera.position.lerp(this.baseCamPos, damp);
        this.controls.target.lerp(this.baseCamTarget, damp);
        this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this.baseCamFov, 9, rawDt);
        this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, 0, 9, rawDt);
      }
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
    } else if (!this.isUserOrbiting && this.userOrbitPauseTimer <= 0) {
      this.activeDutchTiltDeg = THREE.MathUtils.damp(this.activeDutchTiltDeg, 0, 8, rawDt);
      const damp = 1 - Math.exp(-5.4 * rawDt);
      const activeCyan = this.getActiveCyan();
      const handler = this.getHandler();
      const focusUnit = handler || activeCyan;

      if (this.state.cameraAngle === 'PLAYER_CAM' && focusUnit) {
        const yaw = Math.atan2(HOOP_POS.x - focusUnit.mesh.position.x, HOOP_POS.z - focusUnit.mesh.position.z);
        const backX = focusUnit.mesh.position.x - Math.sin(yaw) * 4.4;
        const backZ = focusUnit.mesh.position.z - Math.cos(yaw) * 4.4;
        this._v1.set(backX, 2.55 + focusUnit.mesh.position.y * 0.45, backZ);
        this.camera.position.lerp(this._v1, damp);
        this._v2.lerpVectors(focusUnit.mesh.position, HOOP_POS, 0.52);
        this._v2.y = 1.9 + Math.max(0, this.ball.position.y - 1.5) * 0.35;
        this.controls.target.lerp(this._v2, damp * 1.15);
      } else if (this.state.cameraAngle === 'BASELINE_LOW') {
        const swayX = THREE.MathUtils.clamp(this.ball.position.x * 0.45, -3.4, 3.4);
        this._v1.set(swayX - 1.4, 1.55, HOOP_POS.z - 2.1);
        this.camera.position.lerp(this._v1, damp);
        this._v2.set(this.ball.position.x * 0.6, 2.05, THREE.MathUtils.clamp(this.ball.position.z * 0.65, -4.5, 4.5));
        this.controls.target.lerp(this._v2, damp);
      } else {
        const bx = THREE.MathUtils.clamp(this.ball.position.x * 0.28, -2.5, 2.5);
        const bz = THREE.MathUtils.clamp(this.ball.position.z * 0.25, -2.2, 2.2);
        this._v1.set(this.baseCamPos.x + bx, this.baseCamPos.y, this.baseCamPos.z + bz);
        this.camera.position.lerp(this._v1, damp);
        const rimPull = this.state.matchState === 'SHOT_FLIGHT' ? 0.35 : 0;
        this._v2.set(
          THREE.MathUtils.lerp(THREE.MathUtils.clamp(this.ball.position.x * 0.42, -2.4, 2.4), HOOP_POS.x, rimPull),
          THREE.MathUtils.lerp(1.55 + Math.max(0, this.ball.position.y - 1) * 0.22, HOOP_POS.y, rimPull * 0.65),
          THREE.MathUtils.lerp(THREE.MathUtils.clamp(this.ball.position.z * 0.45 - 1.6, -4.4, 2.2), HOOP_POS.z, rimPull)
        );
        this.controls.target.lerp(this._v2, damp);
      }

      const meterZoom = this.slideShotMeterEngine.isActive() ? -3.4 : 0;
      const dynamicSpeedFov =
        this.state.matchState === 'DUNK_FLIGHT'
          ? 4.5
          : this.state.matchState === 'SHOT_FLIGHT'
          ? -2.8
          : meterZoom;
      this.currentCamFov = THREE.MathUtils.damp(this.currentCamFov, this.baseCamFov + dynamicSpeedFov, 6, rawDt);
      this.camera.fov = this.currentCamFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.22;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.22;
      this.cameraShake = Math.max(0, this.cameraShake - rawDt * 2.8);
    }

    this.controls.update();
    if (Math.abs(this.activeDutchTiltDeg) > 0.05) {
      this.camera.lookAt(this.controls.target);
      this.camera.rotateZ(THREE.MathUtils.degToRad(this.activeDutchTiltDeg));
    }
  }

  private renderFrame(rawDt: number) {
    this.ballShadow.visible = this.ball.visible;
    this.ballShadow.position.set(this.ball.position.x, 0.032, this.ball.position.z);
    const heightScale = THREE.MathUtils.clamp(1.1 - this.ball.position.y * 0.14, 0.4, 1.0);
    this.ballShadow.scale.setScalar(heightScale);

    if (this.postFXImpactFlash > 0) {
      this.postFXImpactFlash = Math.max(0, this.postFXImpactFlash - rawDt * 2.5);
    }

    this.postFX.render(rawDt, this.elapsedTime, {
      velocityPulse: this.state.matchState === 'DUNK_FLIGHT' ? 0.85 : 0.1 + this.osBloomBoost * 0.25,
      slowMoFactor: this.state.replayState.active ? 1.0 : this.state.comicStrike.active ? 0.68 : 0,
      rainIntensity: this.state.matchEvolution.rainLevel,
      impactFlash: this.postFXImpactFlash,
      impactUV: this.postFXImpactUV,
      filterMode: this.state.cameraFilter,
      comicFactor: this.state.comicStrike.active ? 1.0 : 0,
      comicBurstUV: this.comicBurstUV,
    });

    this.fpsGovernor.endFrame(performance.now());
    this.hudEmitTimer += rawDt;
    const emitInterval = this.state.shotMeter.isCharging ? 0.016 : 0.1;
    if (this.hudEmitTimer >= emitInterval) {
      this.hudEmitTimer = 0;
      this.state.opticalContact = this.contactEngine.getTelemetry();
      this.state.bouncePhysics = this.bounceSystem.getTelemetry(this.state.courtSurface, this.ballSpin);
      this.state.soccerGoalie = this.soccerGoalie.getTelemetry();
      this.notifyState();
    }
  }

  // =========================================================================
  // PUBLIC CONTROLS FOR HUD & OS
  // =========================================================================
  public setControlMode(mode: 'PLAYER' | 'AUTO') {
    this.state.controlMode = mode;
    this.pushLog(`Control switched to ${mode === 'PLAYER' ? 'MANUAL 3V3 PLAYER' : 'AUTONOMOUS AI SHOWCASE'}`);
    this.notifyState();
  }

  public setPlayCall(play: BasketPlayCall) {
    this.state.activePlayCall = play;
    this.pushLog(`Offense Play Called: ${play.replace(/_/g, ' ')}`);
    this.notifyState();
  }

  public setDefenseScheme(scheme: BasketDefenseScheme) {
    this.state.defenseSchemeA = scheme;
    this.pushLog(`Cyan Defense Scheme: ${scheme.replace(/_/g, ' ')}`);
    this.notifyState();
  }

  public setCameraAngle(preset: BasketCameraPreset) {
    this.goalieFocusTimer = 0;
    this.aiCamHoldTimer = 0;
    this.state.cameraAngle = preset;
    if (preset === 'BROADCAST') {
      this.baseCamPos.set(0, 7.6, 11.4);
      this.baseCamTarget.set(0, 1.5, -2.3);
    } else if (preset === 'ACTION') {
      this.baseCamPos.set(5.4, 4.4, 7.2);
      this.baseCamTarget.set(0, 1.6, -2.6);
    } else if (preset === 'COURT_BEHIND') {
      this.baseCamPos.set(0, 5.2, 10.6);
      this.baseCamTarget.set(0, 2.0, -4.0);
    } else if (preset === 'BASELINE_LOW') {
      this.baseCamPos.set(-1.4, 1.55, HOOP_POS.z - 2.1);
      this.baseCamTarget.set(0, 2.05, 0.8);
    } else if (preset === 'PLAYER_CAM') {
      this.baseCamPos.set(0, 2.6, 8.2);
      this.baseCamTarget.set(0, 1.9, -3.5);
    } else if (preset === 'SKY_CAM') {
      this.baseCamPos.set(0, 15.8, 3.2);
      this.baseCamTarget.set(0, 0.5, -1.6);
    } else if (preset === 'ISOMETRIC') {
      this.baseCamPos.set(-10.5, 9.2, 8.8);
      this.baseCamTarget.set(0, 1.4, -2.0);
    } else if (preset === 'CINEMATIC_FLOW') {
      this.baseCamPos.set(8.2, 3.2, 7.8);
      this.baseCamTarget.set(0, 1.8, -3.2);
    }
    this.notifyState();
  }

  public setCameraLens(lens: CameraLensPreset) {
    this.state.cameraLens = lens;
    this.baseCamFov = LENS_FOV_MAP[lens] || 48;
    this.notifyState();
  }

  public setCameraFilter(filter: CameraFilterMode) {
    this.state.cameraFilter = filter;
    this.renderer.domElement.style.filter = !this.postFX.isEnabled() ? getCssFilterForMode(filter) : 'none';
    this.notifyState();
  }

  public programAICameraAngle() {
    const hints = ['HERO_LOW_ANGLE', 'COURT_FLYBY', 'SKYLINE_SWEEP', 'VIP_BOX_LOOK'] as const;
    const hint = hints[Math.floor(Math.random() * hints.length)];
    const plan = this.aiCameraDirector.programCutsceneShot({
      shotHint: hint,
      emotion: this.state.streakA > 1 ? 'VICTORY_ROAR' : 'FOCUSED',
      focusUnit: null,
      allUnits: [],
      intensity: 0.85,
    });
    this.aiCamTargetPos.copy(plan.anchorBase);
    this.aiCamLookPos.set(
      this.ball.position.x * 0.45,
      1.45,
      THREE.MathUtils.clamp(this.ball.position.z * 0.5 - 1.4, -5.5, 3.5)
    );
    this.aiCamHoldTimer = 4.2;
    this.goalieFocusTimer = 0;
    this.pushLog(`AI DIRECTOR: ${plan.label} (${plan.rule})`);
    this.notifyState();
  }

  public focusGoalieCameraAndKick() {
    this.goalieFocusTimer = 5.5;
    this.aiCamHoldTimer = 0;
    if (this.soccerGoalie.triggerPenaltyShot()) {
      this.audioEngine.playSoccerKick(this.dspEngine.getDestination());
      this.pushLog('COAL HARBOUR PK ZONE: Soccer penalty shot vs #1 Keeper!');
    }
    this.notifyState();
  }

  public toggleOpticalOverlay() {
    const next = !this.contactEngine.isOverlayEnabled();
    this.contactEngine.setOverlayEnabled(next);
    this.soccerGoalie.setOpticalOverlay(next);
    this.state.opticalContact.overlayEnabled = next;
    this.pushLog(`OPTICAL CONTACT ENGINE: Wireframe Hitbox Overlay ${next ? 'ENABLED' : 'HIDDEN'}.`);
    this.notifyState();
  }

  public toggleOneTapControl() {
    this.state.oneTapControlEnabled = !this.state.oneTapControlEnabled;
    this.pushLog(
      `CONTROL SYSTEM: ${this.state.oneTapControlEnabled ? 'ONE-TAP + DOUBLE-TAP ANKLE BREAKER ON' : 'CLASSIC MODE'}`
    );
    this.notifyState();
  }

  public setCourtSurface(surface: CourtSurface) {
    this.state.courtSurface = surface;
    this.courtSystem.setCourtSurface(surface);
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
    (this.scene.background as THREE.Color).setHex(bgHex);
    this.scene.fog = new THREE.Fog(bgHex, 76, 300);
    this.palmTreesGroup.visible = weather === 'BEACH';
    this.stadiumGroup.visible = weather !== 'BEACH';
    this.sunLight.intensity = weather === 'SUNNY' || weather === 'BEACH' ? 2.55 : 2.35;
    this.ambientLight.intensity = weather === 'SUNNY' || weather === 'BEACH' ? 0.88 : 0.78;
    this.notifyState();
  }

  public setEnvDynamicsMode(mode: EnvDynamicsMode) {
    this.state.matchEvolution.mode = mode;
    if (mode === 'CLEAR') {
      this.state.matchEvolution.rainLevel = 0;
      this.state.matchEvolution.dustLevel = 0;
      this.state.matchEvolution.wetnessLevel = 0;
    } else if (mode === 'RAIN_STORM') {
      this.state.matchEvolution.rainLevel = 0.72;
      this.state.matchEvolution.wetnessLevel = 0.55;
    } else if (mode === 'DUST_STORM') {
      this.state.matchEvolution.dustLevel = 0.65;
    }
    this.notifyState();
  }

  public selectMusicPreset(preset: IntroMusicPresetId) {
    this.audioUnlocked = true;
    this.state.introSelectedPreset = preset;
    this.state.introCutscene.selectedPreset = preset;
    if (preset === 'SILENT') this.dspEngine.stopAllMusic();
    else this.dspEngine.playPresetTrack(preset);
    this.notifyState();
  }

  public cycleMusicPreset() {
    this.audioUnlocked = true;
    const order: IntroMusicPresetId[] = ['HARBOUR_PULSE', 'PACIFIC_THUNDER', 'NEON_GROOVE', 'SILENT'];
    const cur =
      this.state.introSelectedPreset === 'CUSTOM_MP3'
        ? 'HARBOUR_PULSE'
        : this.state.introSelectedPreset;
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length];
    this.selectMusicPreset(next);
  }

  public setMusicVolume(vol: number) {
    this.audioUnlocked = true;
    this.dspEngine.setMp3Volume(vol);
    this.state.introBillboardEQ.volume = vol;
    this.notifyState();
  }

  public async loadMp3Track(file: File) {
    this.audioUnlocked = true;
    await this.dspEngine.loadMp3File(file);
    this.state.introSelectedPreset = 'CUSTOM_MP3';
    this.state.introCutscene.selectedPreset = 'CUSTOM_MP3';
    this.state.introCutscene.musicSelected = true;
    this.notifyState();
  }

  public async toggleMp3Playback() {
    this.audioUnlocked = true;
    await this.dspEngine.toggleMp3Playback();
    this.notifyState();
  }

  private pushLog(msg: string) {
    this.state.actionLog = [msg, ...this.state.actionLog].slice(0, 5);
  }

  private notifyState() {
    this.onStateChange({
      ...this.state,
      introCutscene: { ...this.state.introCutscene },
      shotMeter: { ...this.state.shotMeter },
      slideMeter: { ...this.state.slideMeter },
      flowTelemetry: { ...this.state.flowTelemetry },
      comicStrike: { ...this.state.comicStrike },
      matchEvolution: { ...this.state.matchEvolution },
      crowdMood: { ...this.state.crowdMood },
      introBillboardEQ: { ...this.state.introBillboardEQ },
      replayState: { ...this.state.replayState },
      opticalContact: { ...this.state.opticalContact },
      bouncePhysics: {
        ...this.state.bouncePhysics,
        eventChain: [...this.state.bouncePhysics.eventChain],
      },
      soccerGoalie: { ...this.state.soccerGoalie },
      stealTelemetry: { ...this.state.stealTelemetry },
      celebrationCutscene: { ...this.state.celebrationCutscene },
    });
  }

  public start() {
    this.lastTime = performance.now();
    this.resize();
    this.animate();
  }

  private resize = () => {
    if (!this.container || !this.camera || !this.renderer) return;
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(this.container.clientWidth || rect.width || window.innerWidth));
    const h = Math.max(1, Math.floor(this.container.clientHeight || rect.height || window.innerHeight));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.postFX?.setSize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    cometicOSKernel.registerEngineHooks(null);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('blur', this.handleWindowPointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.controls.dispose();
    this.shotArcGeo?.dispose();
    if (this.shotArcLine?.material) {
      (this.shotArcLine.material as THREE.Material).dispose();
    }
    this.dspEngine.dispose();
    this.ballSkinMaps?.dispose();
    this.courtSystem.dispose();
    this.stadiumSystem.dispose();
    this.contactEngine.dispose();
    this.bounceSystem.dispose();
    this.soccerGoalie.dispose();
    this.crowdSystem.dispose();
    this.vipSuites.dispose();
    this.stadiumPersonnel.dispose();
    this.vancouverSkyline.dispose();
    this.vancouverCity.dispose();
    this.particleSystem.dispose();
    this.postFX.dispose();
    this.jumbotronTex.dispose();
    this.envRenderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
