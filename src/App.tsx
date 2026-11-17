import React, { useEffect, useRef, useState } from 'react';
import { VolleyballEngine } from './engine';
import {
  CameraFilterMode,
  CameraLensPreset,
  CameraPreset,
  CareerStats,
  CeremonyPhase,
  CourtSurface,
  DefensiveStrategy,
  DifficultyLevel,
  EnvDynamicsMode,
  EnvironmentTheme,
  GameState,
  GraphicsQualityPreset,
  IntroMusicPresetId,
  MatchFormat,
  PlayerAccessory,
  PlayerHairStyle,
  ReplayAngleMode,
  SavedMatchSlot,
  ServeVariant,
  SpikeReplayClip,
  StoryCampaignProgress,
  TacticalPlay,
  Unit,
} from './types';
import {
  deleteMatchSlot,
  loadCareerStats,
  loadSavedMatches,
  loadStoryProgress,
} from './saveManager';
import { STORY_CHAPTERS } from './story/storyCampaign';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Camera,
  CloudRain,
  Droplets,
  FastForward,
  Film,
  Flame,
  Gamepad2,
  HardDrive,
  Layers,
  Lock,
  MapPin,
  Menu,
  Music,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Upload,
  Users,
  Video,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { VancouverMapPrintModal } from './components/VancouverMapPrintModal';
import { PlayerControlSidePanel } from './components/PlayerControlSidePanel';
import { CometicOSShell } from './components/CometicOSShell';
import { BasketballEngine } from './basketball/BasketballEngine';
import { BasketballHUD } from './basketball/BasketballHUD';
import { BasketGameState } from './basketball/basketballTypes';
import { cometicOSKernel } from './os/CometicOSKernel';
import { CometicKernelState } from './os/osTypes';

type DrawerTab = 'ARENA' | 'TACTICS' | 'STORY';

const EVOLUTION_LABELS: Record<string, string> = {
  OPENING_BREEZE: 'OPENING BREEZE',
  RISING_HEAT: 'RISING HEAT',
  DUST_SQUALL: 'DUST SQUALL',
  MONSOON_CLIMAX: 'MONSOON CLIMAX',
};

const ANGLE_LABELS: Record<ReplayAngleMode, string> = {
  NET_TAPE_SWEEP: 'NET TAPE SWEEP',
  SPIKER_SHOULDER: 'SPIKER SHOULDER',
  FLOOR_IMPACT_LOW: 'LOW FLOOR IMPACT',
  ORBIT_DRONE: '360° ORBIT DRONE',
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<VolleyballEngine | null>(null);
  const basketEngineRef = useRef<BasketballEngine | null>(null);
  const hasMountedSportRef = useRef(false);

  const [kernelState, setKernelState] = useState<CometicKernelState>(() => cometicOSKernel.getSnapshot());
  const [basketState, setBasketState] = useState<BasketGameState | null>(null);

  const [gameState, setGameState] = useState<GameState>({
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
    promptTiming: 1,
    activePlayerName: 'ISHIKAWA',
    activePlayerJersey: 14,
    teamFSMStateA: 'SERVE_FORMATION',
    teamFSMStateB: 'RECEIVE_FORMATION',
    touchesA: 0,
    touchesB: 0,
    netViolation: null,
    cameraAngle: 'BROADCAST',
    actionLog: ['Tap opponent court to aim, tap SERVE to play.'],
    weather: 'SUNSET',
    courtSurface: 'OLYMPIC_BLUE',
    fogDensity: 0.004,
    lightingIntensity: 1.0,
    ballSpeedKmh: 0,
    lastShotType: 'READY',
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
    spikeCamEnabled: true,
    spikeCamActive: false,
    liveCommentaryLine: 'AIM V PS6 EDITION • VICE COAST STADIUM LIVE',
    commentaryHistory: ['AIM V PS6 Edition ready.'],
    voiceAnnouncerEnabled: false,
    voiceAnnouncerVolume: 0.75,
    spatialNotifications: [],
    selfPropagatingEnergy: 0.25,
    matchEvolution: {
      stage: 'OPENING_BREEZE',
      mode: 'AUTO_EVOLVE',
      intensity: 0.14,
      dustLevel: 0.22,
      sandLevel: 0.08,
      rainLevel: 0,
      wetnessLevel: 0,
      avgSweatLevel: 0.05,
      windX: 0.6,
      windZ: 0.25,
      elapsedSeconds: 0,
    },
    replayState: {
      active: false,
      showcaseLoop: false,
      autoShowcaseEnabled: true,
      clipIndex: 0,
      totalClips: 0,
      currentClip: null,
      currentAngle: 'NET_TAPE_SWEEP',
      angleIndex: 0,
      totalAngles: 4,
      progress: 0,
      playbackSpeed: 0.28,
    },
    savedSpikesCount: 0,
    postFXEnabled: true,
    particlesEnabled: true,
    crowdMood: {
      excitement: 0.24,
      waveActive: false,
      cheerLabel: 'ARENA WARMUP',
      decibelLevel: 79,
    },
    spriteMatrixSlots: [],
    spriteMatrixVisible: true,
    screenSensor: {
      smoothX: 0.5,
      smoothY: 0.5,
      velMag: 0,
      microZoom: 0,
      active: false,
    },
    cameraLens: '85MM_TELE',
    cameraFilter: 'BROADCAST_STD',
    graphicsQuality: 'HIGH',
    ballPhase: 'HELD_READY',
    ceremonyPhase: 'LIVE_MATCH',
    ceremonyTimer: 0,
    refereeCallText: 'PLAY READY',
    reactiveControl: {
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
    },
    storyState: {
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
    },
    rallyChainStage: 'READY',
    comicStrike: {
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
    },
    aiDirector: {
      autoDirectorEnabled: true,
      currentProgramLabel: 'BROADCAST AI TRACKER',
      programRule: 'LIVE_COURT_BALANCE',
      azimuthDeg: 0,
      elevationDeg: 18,
      fovDeg: 42,
      dutchTiltDeg: 0,
      fitnessScore: 95,
      selfProgrammedShotsCount: 0,
    },
    introCutscene: {
      phase: 'ORBIT_STADIUM',
      phaseElapsed: 0,
      musicSelected: false,
      selectedPreset: 'HARBOUR_PULSE',
      pendingFormat: 'BEST_OF_3',
      subBannerText: 'COAL HARBOUR ARENA · VANCOUVER, BC',
    },
    syntheticStoryline: {
      heroName: 'ISHIKAWA',
      heroJersey: 14,
      heroGearLabel: 'ORANGE & BLACK AIM VEST · BASEBALL CAP',
      actNumber: 1,
      actTitle: 'ACT I · HARBOUR CALL',
      evolutionXp: 20,
      nextActXp: 100,
      auraLevel: 1,
      heroMood: 'FOCUSED',
      activeLine:
        'Ishikawa steps onto Coal Harbour blue in the black-and-orange AIM vest and cap — eyes locked on the billboard.',
      currentBeatHeadline: 'HARBOUR CALL',
      milestonesUnlocked: ['AIM #14 Gear Equipped'],
      recentBeats: [],
    },
  });

  const [serveType, setServeType] = useState<ServeVariant>('JUMP');
  const [selectedFormat, setSelectedFormat] = useState<MatchFormat>('BEST_OF_3');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('ARENA');
  const [coachPromptInput, setCoachPromptInput] = useState('');
  const [isPromptingCoach, setIsPromptingCoach] = useState(false);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [mp3LoadError, setMp3LoadError] = useState<string | null>(null);

  // PS6 Roster, Saves, Career, Story Campaign & Replay Vault state
  const [rosterTeamTab, setRosterTeamTab] = useState<'A' | 'B'>('A');
  const [selectedUnitId, setSelectedUnitId] = useState<number>(1);
  const [athletePrompt, setAthletePrompt] = useState('');
  const [athleteCompileMsg, setAthleteCompileMsg] = useState('');
  const [savedSlots, setSavedSlots] = useState<SavedMatchSlot[]>(() => loadSavedMatches());
  const [saveSlotName, setSaveSlotName] = useState('');
  const [saveConfirmBanner, setSaveConfirmBanner] = useState('');
  const [careerStats, setCareerStats] = useState<CareerStats>(() => loadCareerStats());
  const [storyProgress, setStoryProgress] = useState<StoryCampaignProgress>(() => loadStoryProgress());
  const [replayClips, setReplayClips] = useState<SpikeReplayClip[]>([]);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const drawerOpenRef = useRef(drawerOpen);
  const screenModeRef = useRef(gameState.screenMode);
  const serveTypeRef = useRef(serveType);
  const keysHeldRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  useEffect(() => {
    screenModeRef.current = gameState.screenMode;
    if (
      gameState.screenMode === 'SAVES' ||
      gameState.screenMode === 'MAIN_MENU' ||
      gameState.screenMode === 'MATCH_OVER' ||
      gameState.screenMode === 'STORY_HUB'
    ) {
      setSavedSlots(loadSavedMatches());
      setCareerStats(loadCareerStats());
      setStoryProgress(loadStoryProgress());
    }
    if (gameState.screenMode === 'REPLAY_VAULT' || gameState.screenMode === 'MAIN_MENU') {
      if (engineRef.current) {
        setReplayClips([...engineRef.current.getStoredSpikeClips()]);
      }
    }
    if ((gameState.screenMode === 'ROSTER' || gameState.screenMode === 'PLAYING') && engineRef.current) {
      setAllUnits([...engineRef.current.getUnits()]);
    }
  }, [gameState.screenMode]);

  useEffect(() => {
    serveTypeRef.current = serveType;
  }, [serveType]);

  useEffect(() => {
    const unsub = cometicOSKernel.subscribe(setKernelState);
    cometicOSKernel.startWatchdog();
    return () => {
      unsub();
      cometicOSKernel.stopWatchdog();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const isSportSwitch = hasMountedSportRef.current;
    hasMountedSportRef.current = true;

    if (kernelState.activeSport === 'BASKETBALL_3V3') {
      let bEngine: BasketballEngine | null = null;
      try {
        bEngine = new BasketballEngine(
          containerRef.current,
          (nextState) => {
            setBasketState(nextState);
          },
          isSportSwitch
        );
        basketEngineRef.current = bEngine;
        setInitError(null);
      } catch (err) {
        setInitError(err instanceof Error ? err.message : 'Unable to initialize 3v3 Basketball WebGL2 context');
      }
      return () => {
        bEngine?.dispose();
        basketEngineRef.current = null;
      };
    }

    let engine: VolleyballEngine | null = null;
    try {
      engine = new VolleyballEngine(
        containerRef.current,
        overlayCanvasRef.current,
        (state) => {
          setGameState(state);
          if (
            (drawerOpenRef.current || screenModeRef.current === 'ROSTER') &&
            engine
          ) {
            setAllUnits([...engine.getUnits()]);
          }
        }
      );

      engine.start();
      if (isSportSwitch) {
        engine.cutToBillboardFocus();
      }
      engineRef.current = engine;
      setAllUnits([...engine.getUnits()]);
      setReplayClips([...engine.getStoredSpikeClips()]);
      setInitError(null);

      // Bind Volleyball engine directly into the Autonomous Self-Healing OS Watchdog
      cometicOSKernel.registerEngineHooks({
        getHealthReport: () => ({
          fps: 60,
          webglLost: false,
          stalledSeconds: 0,
          outOfBoundsCount: 0,
          audioSuspended: false,
          scoreA: engine?.state.scoreA ?? 0,
          scoreB: engine?.state.scoreB ?? 0,
          possessionTeam: engine?.state.servingTeam ?? 'A',
        }),
        selfHeal: (reason: string) => {
          engine?.setPostFXEnabled(true);
          return `Volleyball engine verified (${reason})`;
        },
        applyCometicModulation: () => {
          // Non-disruptive shader sync hook
        },
        applyStudioDirective: (dir) => {
          if (engine && dir.coachCallout) {
            void engine.promptGeminiCoach(dir.coachCallout);
          }
        },
      });
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Unable to initialize 3D WebGL context');
    }

    const syncMoveAxes = () => {
      const held = keysHeldRef.current;
      const mx = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const mz = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      engineRef.current?.setKeyboardMoveAxis(mx, mz);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (engineRef.current?.state.screenMode === 'STORY_CUTSCENE') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          engineRef.current.advanceStoryCutscene();
        } else if (e.code === 'Escape') {
          engineRef.current.skipStoryCutscene();
        }
        return;
      }

      if (e.code === 'Escape') {
        if (engineRef.current?.state.replayState.active) {
          engineRef.current.stopSpikeReplay();
        } else if (
          engineRef.current?.state.screenMode === 'PLAYING' ||
          engineRef.current?.state.screenMode === 'PAUSED'
        ) {
          engineRef.current.togglePause();
        }
        return;
      }

      if (engineRef.current?.state.screenMode !== 'PLAYING') return;

      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        keysHeldRef.current.add(e.code);
        syncMoveAxes();
      }

      if (e.repeat) return;

      if (e.code === 'Tab') {
        e.preventDefault();
        engineRef.current.cycleActiveCyanPlayer();
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const isSrv =
          engineRef.current.state.matchState === 'SERVE' &&
          engineRef.current.state.servingTeam === 'A';
        engineRef.current.beginReactiveAction(isSrv ? 'SERVE' : 'MID');
      } else if (e.code === 'Digit1') {
        engineRef.current.beginReactiveAction('PASS_DIG');
      } else if (e.code === 'Digit2') {
        engineRef.current.beginReactiveAction('STRIKE_SET');
      } else if (e.code === 'Digit3') {
        engineRef.current.beginReactiveAction('JUMP_SPIKE');
      } else if (e.code === 'KeyJ') {
        engineRef.current.beginReactiveAction('LEFT');
      } else if (e.code === 'KeyK') {
        engineRef.current.beginReactiveAction('QUICK_SET');
      } else if (e.code === 'KeyL') {
        engineRef.current.beginReactiveAction('RIGHT');
      } else if (e.code === 'KeyE') {
        engineRef.current.beginReactiveAction('FEINT_TIP');
      } else if (e.code === 'KeyC') {
        engineRef.current.beginReactiveAction('LONG_JUMP');
      } else if (e.code === 'ShiftLeft' || e.code === 'KeyF') {
        engineRef.current.beginReactiveAction('DIVE_SAVE');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keysHeldRef.current.delete(e.code)) {
        syncMoveAxes();
      }
      if (engineRef.current?.state.screenMode !== 'PLAYING') return;

      if (e.code === 'Space' || e.code === 'Enter') {
        const isSrv =
          engineRef.current.state.matchState === 'SERVE' &&
          engineRef.current.state.servingTeam === 'A';
        engineRef.current.releaseReactiveAction(isSrv ? 'SERVE' : 'MID', serveTypeRef.current);
      } else if (e.code === 'Digit1') {
        engineRef.current.releaseReactiveAction('PASS_DIG', serveTypeRef.current);
      } else if (e.code === 'Digit2') {
        engineRef.current.releaseReactiveAction('STRIKE_SET', serveTypeRef.current);
      } else if (e.code === 'Digit3') {
        engineRef.current.releaseReactiveAction('JUMP_SPIKE', serveTypeRef.current);
      } else if (e.code === 'KeyJ') {
        engineRef.current.releaseReactiveAction('LEFT', serveTypeRef.current);
      } else if (e.code === 'KeyK') {
        engineRef.current.releaseReactiveAction('QUICK_SET', serveTypeRef.current);
      } else if (e.code === 'KeyL') {
        engineRef.current.releaseReactiveAction('RIGHT', serveTypeRef.current);
      } else if (e.code === 'KeyE') {
        engineRef.current.releaseReactiveAction('FEINT_TIP', serveTypeRef.current);
      } else if (e.code === 'KeyC') {
        engineRef.current.releaseReactiveAction('LONG_JUMP', serveTypeRef.current);
      } else if (e.code === 'ShiftLeft' || e.code === 'KeyF') {
        engineRef.current.releaseReactiveAction('DIVE_SAVE', serveTypeRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cometicOSKernel.registerEngineHooks(null);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [kernelState.activeSport]);

  const openDrawerTo = (tab: DrawerTab) => {
    if (engineRef.current) {
      setAllUnits([...engineRef.current.getUnits()]);
    }
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  const handleSendCoachDirective = async (instruction: string) => {
    if (!instruction.trim() || !engineRef.current) return;
    setIsPromptingCoach(true);
    try {
      await engineRef.current.promptGeminiCoach(instruction);
      setCoachPromptInput('');
    } finally {
      setIsPromptingCoach(false);
    }
  };

  const handleMp3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMp3LoadError(null);
    try {
      if (kernelState.activeSport === 'BASKETBALL_3V3' && basketEngineRef.current) {
        await basketEngineRef.current.loadMp3Track(file);
      } else if (engineRef.current) {
        await engineRef.current.loadMp3Track(file);
      }
    } catch (err) {
      setMp3LoadError(err instanceof Error ? err.message : 'Could not decode MP3 audio file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleQuickSave = () => {
    if (!engineRef.current) return;
    const label =
      saveSlotName.trim() ||
      `Set ${gameState.currentSet} · ${gameState.scoreA}-${gameState.scoreB}`;
    engineRef.current.createMatchSave(label);
    setSavedSlots(loadSavedMatches());
    setSaveSlotName('');
    setSaveConfirmBanner(`Saved "${label}"`);
    window.setTimeout(() => setSaveConfirmBanner(''), 2200);
  };

  const handleDeleteSave = (id: string) => {
    setSavedSlots(deleteMatchSlot(id));
  };

  const handleCompileAthlete = () => {
    if (!engineRef.current || !athletePrompt.trim()) return;
    const summary = engineRef.current.injectCustomAthletePrompt(selectedUnitId, athletePrompt);
    setAthleteCompileMsg(summary);
    setAllUnits([...engineRef.current.getUnits()]);
    setAthletePrompt('');
  };

  const eq = gameState.audioEQ;
  const evo = gameState.matchEvolution;
  const replay = gameState.replayState;
  const storyEvo = gameState.syntheticStoryline;
  const cyanUnits = allUnits.filter((u) => u.team === 'A');
  const rosterUnits = allUnits.filter((u) => u.team === rosterTeamTab);
  const selectedUnit = allUnits.find((u) => u.id === selectedUnitId) || allUnits[0] || null;

  const isPlayingScreen = gameState.screenMode === 'PLAYING';
  const isCyanServing = gameState.matchState === 'SERVE' && gameState.servingTeam === 'A';
  const timingPct = Math.round((gameState.promptTiming ?? 0) * 100);
  const timingSweetSpot = timingPct >= 65;

  const tickerText = `${storyEvo.actTitle} · ${storyEvo.currentBeatHeadline}   •   ${
    gameState.liveCommentaryLine || 'MATCH LIVE'
  }   •   RADAR ${gameState.ballSpeedKmh} KM/H   •   `;

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#090612] text-slate-100 select-none">
      {gmpQuotaExceeded && (
        <div
          role="status"
          className="no-print bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm flex items-center justify-between gap-2"
        >
          <span className="flex-1">
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
          <button
            type="button"
            onClick={() => setGmpQuotaExceeded(false)}
            className="px-2 py-0.5 rounded bg-amber-200/80 hover:bg-amber-200 text-amber-950 font-bold text-[10px] shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hidden MP3 / Audio Upload Input wired to Arena Billboard EQ */}
      <input
        ref={mp3InputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        onChange={handleMp3Upload}
        className="hidden no-print"
      />

      {/* 3D WebGL Viewport Container */}
      <div ref={containerRef} className="no-print absolute inset-0 w-full h-full z-0 touch-none" />

      {initError && (
        <div className="no-print absolute inset-0 z-50 flex items-center justify-center p-6 bg-[#090612]/94">
          <div className="max-w-sm bg-[#120924] border border-[#ff3d7f]/50 rounded-2xl p-5 text-center space-y-2">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#ffb347]">
              Graphics Initialization Issue
            </div>
            <div className="text-xs text-slate-300">{initError}</div>
          </div>
        </div>
      )}

      {/* Screen-Space Bioluminescent Synapse Membrane Overlay Canvas */}
      <canvas
        ref={overlayCanvasRef}
        className={`no-print absolute inset-0 w-full h-full pointer-events-none z-10 ${
          kernelState.activeSport === 'BASKETBALL_3V3' ? 'hidden' : ''
        }`}
      />

      {/* AIM-Cometic Autonomous Self-Healing OS Workstation Shell */}
      <div className="no-print">
        <CometicOSShell
          kernelState={kernelState}
          basketballClips={basketEngineRef.current?.getHighlightClips() || []}
          volleyballClips={replayClips}
          onPlayHighlightInGame={(idx) => {
            if (kernelState.activeSport === 'BASKETBALL_3V3') {
              basketEngineRef.current?.startReplayShowcase(idx);
            } else {
              engineRef.current?.startSpikeShowcase(idx);
            }
          }}
        />
      </div>

      {/* 3-ON-3 BASKETBALL HUD */}
      {kernelState.activeSport === 'BASKETBALL_3V3' &&
        kernelState.viewMode === 'GAME_FOCUS' &&
        basketState && (
          <div className="no-print">
            <BasketballHUD
              engine={basketEngineRef.current}
              state={basketState}
              onOpenMap={() => setMapModalOpen(true)}
              mp3InputRef={mp3InputRef}
            />
          </div>
        )}

      <div
        className={`no-print ${
          kernelState.activeSport === 'VOLLEYBALL_6V6' && kernelState.viewMode === 'GAME_FOCUS'
            ? ''
            : 'hidden'
        }`}
      >

      {/* ========================================================= */}
      {/* PS6 OPENING CUTSCENE -> AIM VANCOUVER BILLBOARD -> SWOOSH */}
      {/* ========================================================= */}
      {gameState.screenMode === 'MAIN_MENU' && (() => {
        const intro = gameState.introCutscene;
        const isCutsceneOrbitOrLook =
          intro.phase === 'ORBIT_STADIUM' || intro.phase === 'HERO_LOOK_UP';
        const isBallSwoosh = intro.phase === 'BALL_SWOOSH_TO_FEET';

        if (isCutsceneOrbitOrLook || isBallSwoosh) {
          return (
            <div className="absolute inset-x-0 top-9 bottom-0 z-30 pointer-events-none flex flex-col justify-between">
              <div className="bg-[#090612] border-b border-white/10 px-4 py-2 flex items-center justify-between gap-3 pointer-events-auto">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-vice text-lg tracking-wider whitespace-nowrap">
                    <span className="text-[#00f0ff]">AIM</span>{' '}
                    <span className="text-[#ff6b1a]">VANCOUVER</span>
                  </span>
                  <span className="hidden sm:inline font-mono text-[10px] text-[#ffb347] uppercase truncate border-l border-white/15 pl-2.5">
                    {storyEvo.actTitle}
                  </span>
                </div>
                <button
                  onClick={() =>
                    isBallSwoosh
                      ? engineRef.current?.startNewMatch(selectedFormat)
                      : engineRef.current?.cutToBillboardFocus()
                  }
                  className="px-3 py-1 rounded-lg bg-[#140b26] border border-white/20 text-slate-200 hover:border-[#00f0ff] font-mono text-[10px] font-bold uppercase whitespace-nowrap"
                >
                  {isBallSwoosh ? 'SKIP TO SERVE' : 'SKIP TO MUSIC'}
                </button>
              </div>

              <div />

              <div className="bg-[#090612] border-t border-[#ff6b1a]/40 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="font-mono text-[10px] sm:text-xs text-slate-200 truncate">
                  {intro.phase === 'ORBIT_STADIUM'
                    ? 'VANCOUVER HARBOUR · #14 ISHIKAWA ARRIVES IN ORANGE & BLACK AIM GEAR'
                    : intro.phase === 'HERO_LOOK_UP'
                    ? storyEvo.activeLine
                    : 'MUSIC LIVE · VOLLEYBALL SWOOSHING TO #14 ISHIKAWA...'}
                </div>
                <div className="font-mono text-[10px] text-[#ff6b1a] font-bold tabular-nums whitespace-nowrap">
                  {isBallSwoosh ? 'KICKOFF' : '#14 AIM'}
                </div>
              </div>
            </div>
          );
        }

        // BILLBOARD_FULLSCREEN: Camera centered cleanly on 3D AIM VANCOUVER + Music EQ Billboard
        return (
          <div className="absolute inset-x-0 top-9 bottom-0 z-30 pointer-events-none flex flex-col justify-between">
            {/* Slim Single-Line Top Bar */}
            <header className="bg-[#090612]/92 border-b border-white/10 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2 pointer-events-auto">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="font-vice text-lg sm:text-xl tracking-wider leading-none whitespace-nowrap">
                  <span className="text-[#00f0ff]">AIM</span>{' '}
                  <span className="text-[#ff6b1a]">VANCOUVER</span>
                </h1>
                <span className="hidden sm:inline font-mono text-[10px] text-[#ffb347] border-l border-white/15 pl-2.5 truncate">
                  #14 ISHIKAWA · {storyEvo.actTitle}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMapModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-mono text-[10px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                >
                  <MapPin className="w-3 h-3" />
                  <span>AREA MAP</span>
                </button>
                <button
                  onClick={() => engineRef.current?.replayIntroCutscene()}
                  className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 hover:border-[#00f0ff] font-mono text-[10px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>INTRO</span>
                </button>
              </div>
            </header>

            <div className="flex-1" />

            {/* Condensed Bottom Music & Play Dock */}
            <div className="bg-[#090612]/94 border-t border-[#ff6b1a]/45 px-3 sm:px-5 py-2 pointer-events-auto">
              <div className="max-w-4xl mx-auto space-y-1.5">
                {/* Active Storyline Beat Line */}
                <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-300 truncate">
                  <span className="truncate">
                    <span className="text-[#ff6b1a] font-bold">STORY:</span> {storyEvo.activeLine}
                  </span>
                  {eq?.trackName && (
                    <span className="hidden md:inline text-[#00f0ff] shrink-0">
                      ♪ {eq.trackName.replace('AIM VANCOUVER · ', '')}
                    </span>
                  )}
                </div>

                {/* Music Selector Row */}
                <div className="flex flex-wrap items-center gap-1">
                  <Music className="w-3.5 h-3.5 text-[#ff6b1a] mr-1 shrink-0" />
                  {(
                    [
                      { id: 'HARBOUR_PULSE', label: 'HARBOUR' },
                      { id: 'PACIFIC_THUNDER', label: 'THUNDER' },
                      { id: 'NEON_GROOVE', label: 'GROOVE' },
                    ] as { id: IntroMusicPresetId; label: string }[]
                  ).map((trk) => {
                    const active = intro.selectedPreset === trk.id && Boolean(eq?.trackName);
                    return (
                      <button
                        key={trk.id}
                        onClick={() => engineRef.current?.selectIntroMusicPreset(trk.id)}
                        className={`h-7 px-2.5 rounded-lg font-mono text-[9px] font-extrabold uppercase border whitespace-nowrap ${
                          active
                            ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                            : 'bg-[#140b26] text-slate-200 border-white/15 hover:border-[#00f0ff]/50'
                        }`}
                      >
                        {trk.label}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => mp3InputRef.current?.click()}
                    className={`h-7 px-2.5 rounded-lg font-mono text-[9px] font-extrabold uppercase border flex items-center gap-1 whitespace-nowrap ${
                      intro.selectedPreset === 'CUSTOM_MP3'
                        ? 'bg-[#ff6b1a] text-[#090612] border-[#ff6b1a]'
                        : 'bg-[#160d2c] text-[#ffb347] border-[#ffb347]/40'
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    <span>{intro.selectedPreset === 'CUSTOM_MP3' ? 'MP3 READY' : 'MP3'}</span>
                  </button>

                  {eq?.trackName && (
                    <button
                      aria-label={eq.isPlaying ? 'Pause music' : 'Play music'}
                      onClick={() => engineRef.current?.toggleMp3Playback()}
                      className="h-7 px-2 rounded-lg bg-[#140b26] border border-white/20 text-white font-mono text-[9px] font-bold flex items-center gap-1 whitespace-nowrap"
                    >
                      {eq.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  )}

                  {mp3LoadError && (
                    <span className="font-mono text-[9px] text-[#ff3d7f] ml-1">{mp3LoadError}</span>
                  )}
                </div>

                {/* Format + Condensed Navigation + Hero PLAY MATCH */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: 'QUICK_SET', label: '1-SET' },
                        { id: 'BEST_OF_3', label: 'BO3' },
                        { id: 'PRACTICE', label: 'PRACTICE' },
                        { id: 'AI_SHOWCASE', label: 'AI 6V6' },
                      ] as { id: MatchFormat; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFormat(f.id)}
                        className={`h-8 px-2.5 rounded-lg text-[9px] font-extrabold uppercase border whitespace-nowrap ${
                          selectedFormat === f.id
                            ? 'bg-[#ff6b1a] text-[#090612] border-[#ff6b1a]'
                            : 'bg-[#140b26] text-slate-300 border-white/10'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}

                    <button
                      onClick={() => engineRef.current?.setScreenMode('STORY_HUB')}
                      className="h-8 px-2.5 rounded-lg bg-[#140b26] border border-[#00f0ff]/35 text-[#00f0ff] text-[9px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>STORY</span>
                    </button>
                    <button
                      onClick={() => engineRef.current?.setScreenMode('ROSTER')}
                      aria-label="Open Roster"
                      className="h-8 px-2 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 text-[9px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                    >
                      <Users className="w-3 h-3" />
                      <span className="hidden sm:inline">ROSTER</span>
                    </button>
                    {gameState.savedSpikesCount > 0 && (
                      <button
                        onClick={() => engineRef.current?.setScreenMode('REPLAY_VAULT')}
                        aria-label="Open Replay Vault"
                        className="h-8 px-2 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 text-[9px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                      >
                        <Film className="w-3 h-3 text-[#ff3d7f]" />
                        <span className="hidden sm:inline">VAULT</span>
                      </button>
                    )}
                    {savedSlots.length > 0 && (
                      <button
                        onClick={() => engineRef.current?.setScreenMode('SAVES')}
                        aria-label="Open Saves"
                        className="h-8 px-2 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 text-[9px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                      >
                        <HardDrive className="w-3 h-3 text-[#ffb347]" />
                        <span className="hidden sm:inline">SAVES</span>
                      </button>
                    )}
                    <button
                      onClick={() => engineRef.current?.setScreenMode('SETTINGS')}
                      aria-label="Open Settings"
                      className="h-8 px-2 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 text-[9px] font-bold uppercase flex items-center gap-1 whitespace-nowrap"
                    >
                      <Settings className="w-3 h-3 text-emerald-400" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {savedSlots.length > 0 && (
                      <button
                        onClick={() => engineRef.current?.loadMatchSave(savedSlots[0])}
                        className="h-9 px-3 rounded-xl bg-[#160d2c] border border-[#ffb347]/60 text-[#ffb347] font-bold text-[10px] uppercase flex items-center gap-1 whitespace-nowrap"
                      >
                        <FastForward className="w-3.5 h-3.5" />
                        <span>RESUME</span>
                      </button>
                    )}
                    <button
                      onClick={() =>
                        engineRef.current?.launchFromIntroWithBallSwoosh(selectedFormat)
                      }
                      className="h-9 px-5 rounded-xl bg-[#00f0ff] hover:bg-[#3bf4ff] text-[#090612] font-black text-xs sm:text-sm tracking-wider uppercase flex items-center gap-1.5 whitespace-nowrap shadow-lg transition-transform duration-150 active:scale-[0.97]"
                    >
                      <Play className="w-4 h-4 fill-[#090612]" />
                      <span>PLAY MATCH</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* PS6 STORY MODE CAMPAIGN HUB                               */}
      {/* ========================================================= */}
      {gameState.screenMode === 'STORY_HUB' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 bg-[#090612]/94 p-4 sm:p-6 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/15 text-xs font-bold flex items-center gap-1.5 hover:border-[#00f0ff]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>MENU</span>
              </button>
              <div>
                <div className="font-vice text-xl tracking-wider text-white">
                  PACIFIC CUP · STORY CAMPAIGN
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  {STORY_CHAPTERS.length} Narrative Chapters · Interactive 3D Cutscenes · Adaptive Weather & Rivals
                </div>
              </div>
            </div>
            <div className="font-mono text-xs bg-[#140b26] border border-[#00f0ff]/40 rounded-lg px-3 py-1.5 text-[#00f0ff] tabular-nums">
              COMPLETED {storyProgress.completedChapters.length}/{STORY_CHAPTERS.length}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl w-full mx-auto">
            {STORY_CHAPTERS.map((ch) => {
              const unlocked = ch.chapterNumber <= storyProgress.unlockedChapter;
              const completed = storyProgress.completedChapters.includes(ch.chapterNumber);
              const stars = storyProgress.chapterStars[ch.chapterNumber] || 0;
              return (
                <div
                  key={ch.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${
                    unlocked
                      ? 'bg-[#0e091c] border-[#00f0ff]/35'
                      : 'bg-[#0b0714]/80 border-white/10 opacity-65'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#ffb347] uppercase">
                        CHAPTER {ch.chapterNumber} · {ch.subtitle}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= stars ? 'text-[#ffb347] fill-[#ffb347]' : 'text-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <h2 className="font-vice text-2xl tracking-wider text-white">{ch.title}</h2>
                    <div className="font-mono text-[10px] text-[#00f0ff]">
                      VS {ch.opponentClub.toUpperCase()} · {ch.locationLabel}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{ch.objectiveSummary}</p>
                    <div className="flex flex-wrap gap-1.5 font-mono text-[9px]">
                      <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-slate-300">
                        {ch.difficulty}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-cyan-300">
                        {ch.courtSurface.replace(/_/g, ' ')}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-black/50 border border-white/10 text-amber-300">
                        TARGET {ch.targetScore} PTS
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={!unlocked}
                    onClick={() => engineRef.current?.startStoryChapter(ch.id)}
                    className={`w-full py-2.5 rounded-xl font-extrabold text-xs uppercase flex items-center justify-center gap-2 transition-colors ${
                      unlocked
                        ? completed
                          ? 'bg-[#160d2c] border border-[#00f0ff] text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612]'
                          : 'bg-[#ff3d7f] hover:bg-[#ff5490] text-white'
                        : 'bg-slate-900 text-slate-500 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {unlocked ? (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>{completed ? 'REPLAY CHAPTER CUTSCENE' : 'START CHAPTER'}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>COMPLETE CHAPTER {ch.chapterNumber - 1} TO UNLOCK</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REAL-TIME 3D STORY CUTSCENE OVERLAY (LETTERBOX + DIALOGUE) */}
      {/* ========================================================= */}
      {gameState.screenMode === 'STORY_CUTSCENE' && gameState.storyState?.currentLine && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 pointer-events-none flex flex-col justify-between">
          {/* Top Cinema Letterbox Bar */}
          <div className="bg-[#090612]/96 border-b border-white/10 px-4 py-3 flex items-center justify-between pointer-events-auto">
            <div>
              <div className="font-mono text-[10px] text-[#00f0ff] uppercase tracking-wider">
                CH. {gameState.storyState.chapterNumber} · {gameState.storyState.chapterTitle} ·{' '}
                {gameState.storyState.cutscenePhase === 'PRE'
                  ? 'PRE-MATCH BRIEFING'
                  : gameState.storyState.cutscenePhase === 'MID'
                  ? 'TURNING POINT'
                  : gameState.storyState.cutscenePhase === 'POST_WIN'
                  ? 'VICTORY EPILOGUE'
                  : 'LOCKER ROOM DEBRIEF'}
              </div>
              <div className="text-[11px] font-bold text-slate-300">
                VS {gameState.storyState.opponentClub} · Line {gameState.storyState.dialogueIndex + 1}/
                {gameState.storyState.totalLines}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gameState.aiDirector && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#140b26] border border-[#00f0ff]/35 font-mono text-[9px] tabular-nums whitespace-nowrap">
                  <Camera className="w-3 h-3 text-[#00f0ff]" />
                  <span className="text-[#00f0ff] font-bold">
                    AI CAM: {gameState.aiDirector.programRule.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-400">
                    {Math.round(gameState.aiDirector.azimuthDeg)}° · {Math.round(gameState.aiDirector.fovDeg)}mm
                  </span>
                </div>
              )}
              <button
                onClick={() => engineRef.current?.programLiveDirectorAngle()}
                className="px-2.5 py-1.5 rounded-lg bg-[#140b26] border border-[#ffb347]/40 text-[#ffb347] hover:border-[#ffb347] text-[10px] font-extrabold uppercase whitespace-nowrap"
              >
                AI RE-ANGLE
              </button>
              <button
                onClick={() => engineRef.current?.skipStoryCutscene()}
                className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/20 text-slate-200 hover:border-[#ff3d7f] text-[10px] font-extrabold uppercase whitespace-nowrap"
              >
                SKIP SCENE
              </button>
            </div>
          </div>

          {/* Bottom Cinema Dialogue Box */}
          <div className="bg-[#090612]/96 border-t border-[#00f0ff]/40 px-4 sm:px-8 py-4 pointer-events-auto">
            <div className="max-w-3xl mx-auto space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold uppercase ${
                      gameState.storyState.currentLine.team === 'A'
                        ? 'bg-[#00f0ff] text-[#090612]'
                        : gameState.storyState.currentLine.team === 'B'
                        ? 'bg-[#ff3d7f] text-white'
                        : 'bg-[#ffb347] text-[#090612]'
                    }`}
                  >
                    {gameState.storyState.currentLine.jerseyNumber
                      ? `#${gameState.storyState.currentLine.jerseyNumber} `
                      : ''}
                    {gameState.storyState.currentLine.speaker}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">
                    {gameState.storyState.currentLine.roleTitle}
                  </span>
                </div>
                <span className="font-mono text-[9px] text-[#ffb347] uppercase">
                  {gameState.storyState.currentLine.emotion.replace(/_/g, ' ')}
                </span>
              </div>

              <p className="text-sm sm:text-base font-medium text-white leading-relaxed">
                “{gameState.storyState.currentLine.line}”
              </p>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  {Array.from({ length: gameState.storyState.totalLines }).map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1 rounded-full transition-all ${
                        idx === gameState.storyState!.dialogueIndex
                          ? 'w-5 bg-[#00f0ff]'
                          : 'w-2 bg-white/20'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => engineRef.current?.advanceStoryCutscene()}
                  className="px-4 py-2 rounded-xl bg-[#00f0ff] hover:bg-[#3bf4ff] text-[#090612] font-extrabold text-xs uppercase flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>
                    {gameState.storyState.dialogueIndex + 1 >= gameState.storyState.totalLines
                      ? gameState.storyState.cutscenePhase === 'POST_WIN' ||
                        gameState.storyState.cutscenePhase === 'POST_LOSS'
                        ? 'FINISH SCENE'
                        : 'ENTER COURT'
                      : 'CONTINUE'}
                  </span>
                  <FastForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PS6 ROSTER & ATHLETE STUDIO (+ AI ATHLETE COMPILER)       */}
      {/* ========================================================= */}
      {gameState.screenMode === 'ROSTER' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 bg-[#090612]/94 p-4 sm:p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/15 text-xs font-bold flex items-center gap-1.5 hover:border-[#00f0ff]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>MENU</span>
              </button>
              <div>
                <div className="font-vice text-xl tracking-wider text-white">
                  ATHLETE ROSTER & GEAR STUDIO
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  Customize player visuals, stats, sweat readiness, or compile an archetype via prompt
                </div>
              </div>
            </div>
            <div className="flex gap-1.5">
              {(['A', 'B'] as const).map((tm) => (
                <button
                  key={tm}
                  onClick={() => {
                    setRosterTeamTab(tm);
                    const first = allUnits.find((u) => u.team === tm);
                    if (first) setSelectedUnitId(first.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase whitespace-nowrap ${
                    rosterTeamTab === tm
                      ? tm === 'A'
                        ? 'bg-[#00f0ff] text-[#090612]'
                        : 'bg-[#ff3d7f] text-white'
                      : 'bg-[#140b26] text-slate-300 border border-white/10'
                  }`}
                >
                  {tm === 'A' ? 'CYAN STORM' : 'VICE CORAL'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 overflow-y-auto">
            {/* Left 6-Athlete List */}
            <div className="md:col-span-5 space-y-2">
              {rosterUnits.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnitId(u.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                    selectedUnit?.id === u.id
                      ? 'bg-[#170f2e] border-[#00f0ff]'
                      : 'bg-[#0e091c] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-[#ffb347] tabular-nums">
                        #{u.jerseyNumber}
                      </span>
                      <span className="font-bold text-sm text-white truncate">{u.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{u.role}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {u.profile.archetype} · {u.profile.accessory.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[10px] shrink-0 tabular-nums">
                    <div className="text-[#00f0ff]">PWR {Math.round(u.stats.power * 100)}</div>
                    <div className="text-slate-400">SWEAT {Math.round(u.sweatLevel * 100)}%</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Right Selected Athlete Editor + AI Prompt Compiler */}
            {selectedUnit && (
              <div className="md:col-span-7 bg-[#0e091c] border border-white/10 rounded-2xl p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <div className="font-mono text-[10px] text-[#00f0ff] uppercase">
                      #{selectedUnit.jerseyNumber} · {selectedUnit.role} · {selectedUnit.profile.archetype}
                    </div>
                    <h2 className="text-xl font-extrabold text-white">{selectedUnit.name}</h2>
                    <p className="text-xs text-slate-400 mt-1">{selectedUnit.profile.bio}</p>
                  </div>
                  <div className="font-mono text-[11px] bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 tabular-nums">
                    <div>STAMINA: <span className="text-emerald-400">{Math.round(selectedUnit.stamina)}%</span></div>
                    <div>SWEAT SHEEN: <span className="text-[#00f0ff]">{Math.round(selectedUnit.sweatLevel * 100)}%</span></div>
                  </div>
                </div>

                {/* Stat Sliders */}
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  {(
                    [
                      { key: 'power', label: 'SPIKE POWER', min: 0.85, max: 1.65, step: 0.05 },
                      { key: 'vertical', label: 'VERTICAL JUMP', min: 4.4, max: 6.8, step: 0.1 },
                      { key: 'awareness', label: 'AWARENESS', min: 0.8, max: 1.4, step: 0.05 },
                      { key: 'accuracy', label: 'SET / DIG ACCURACY', min: 0.8, max: 1.4, step: 0.05 },
                    ] as const
                  ).map((st) => (
                    <div key={st.key} className="bg-black/40 border border-white/10 rounded-xl p-2.5">
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>{st.label}</span>
                        <span className="text-[#00f0ff] font-bold tabular-nums">
                          {selectedUnit.stats[st.key].toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={st.min}
                        max={st.max}
                        step={st.step}
                        value={selectedUnit.stats[st.key]}
                        onChange={(e) => {
                          engineRef.current?.updateUnitProfile(selectedUnit.id, {
                            stats: { [st.key]: Number(e.target.value) },
                          });
                        }}
                        className="w-full accent-[#00f0ff]"
                      />
                    </div>
                  ))}
                </div>

                {/* Gear & Hair Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase text-slate-400 mb-1.5">
                      Court Gear Accessory
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          'BASEBALL_CAP',
                          'HEADBAND',
                          'VISOR',
                          'ARM_SLEEVE',
                          'CAPTAIN_BAND',
                          'NONE',
                        ] as PlayerAccessory[]
                      ).map(
                        (acc) => (
                          <button
                            key={acc}
                            onClick={() =>
                              engineRef.current?.updateUnitProfile(selectedUnit.id, { accessory: acc })
                            }
                            className={`px-2 py-1 rounded text-[10px] font-bold border ${
                              selectedUnit.profile.accessory === acc
                                ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                                : 'bg-[#140b26] text-slate-300 border-white/10'
                            }`}
                          >
                            {acc.replace(/_/g, ' ')}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase text-slate-400 mb-1.5">
                      Hair Silhouette
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(['SPIKY', 'SWEPT', 'BUN', 'CROP'] as PlayerHairStyle[]).map((hs) => (
                        <button
                          key={hs}
                          onClick={() =>
                            engineRef.current?.updateUnitProfile(selectedUnit.id, { hairStyle: hs })
                          }
                          className={`px-2.5 py-1 rounded text-[10px] font-bold border ${
                            selectedUnit.profile.hairStyle === hs
                              ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                              : 'bg-[#140b26] text-slate-300 border-white/10'
                          }`}
                        >
                          {hs}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Athlete Compiler Console */}
                <div className="bg-[#140b26] border border-[#ffb347]/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#ffb347] font-bold">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>AI ATHLETE ARCHETYPE COMPILER</span>
                    </span>
                    {athleteCompileMsg && (
                      <span className="text-[10px] text-emerald-300">{athleteCompileMsg}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={athletePrompt}
                      onChange={(e) => setAthletePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCompileAthlete();
                      }}
                      placeholder="e.g. Cybernetic wing cannon with neon visor and massive jump..."
                      className="flex-1 bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ffb347]"
                    />
                    <button
                      onClick={handleCompileAthlete}
                      disabled={!athletePrompt.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[#ffb347] disabled:opacity-40 text-[#090612] font-extrabold text-xs whitespace-nowrap"
                    >
                      COMPILE
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PS6 SAVED MATCHES & CAREER STATS HUB                      */}
      {/* ========================================================= */}
      {gameState.screenMode === 'SAVES' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 bg-[#090612]/94 p-4 sm:p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/15 text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>MENU</span>
              </button>
              <div>
                <div className="font-vice text-xl tracking-wider text-white">
                  SAVE SLOTS & CAREER RECORDS
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  Persistent match checkpoints including FIVB rotations, sweat, weather & spike highlights
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 overflow-y-auto">
            {/* Career Summary */}
            <div className="md:col-span-4 space-y-3">
              <div className="bg-[#0e091c] border border-[#ffb347]/35 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#ffb347] uppercase">
                  <Trophy className="w-4 h-4" />
                  <span>Career Telemetry</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
                  <div className="bg-black/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">MATCHES WON</div>
                    <div className="text-lg font-extrabold text-white">
                      {careerStats.matchesWon} / {careerStats.matchesPlayed}
                    </div>
                  </div>
                  <div className="bg-black/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">FASTEST SPIKE</div>
                    <div className="text-lg font-extrabold text-[#00f0ff]">
                      {careerStats.fastestSpikeKmh} <span className="text-[10px]">KM/H</span>
                    </div>
                  </div>
                  <div className="bg-black/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">TOTAL SPIKES</div>
                    <div className="text-lg font-extrabold text-[#ff3d7f]">{careerStats.totalSpikes}</div>
                  </div>
                  <div className="bg-black/40 rounded-lg p-2.5">
                    <div className="text-[10px] text-slate-400">ROOF BLOCKS</div>
                    <div className="text-lg font-extrabold text-emerald-400">{careerStats.totalBlocks}</div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  Record Holder: <span className="text-[#ffb347] font-bold">{careerStats.bestSpikeOwner}</span>
                </div>
              </div>

              {/* Save Current Match Box */}
              <div className="bg-[#0e091c] border border-white/10 rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-extrabold text-white uppercase">Save Active Match State</div>
                <input
                  type="text"
                  value={saveSlotName}
                  onChange={(e) => setSaveSlotName(e.target.value)}
                  placeholder={`Set ${gameState.currentSet} (${gameState.scoreA}-${gameState.scoreB})`}
                  className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500"
                />
                <button
                  onClick={handleQuickSave}
                  className="w-full py-2 rounded-lg bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>WRITE SAVE SLOT</span>
                </button>
                {saveConfirmBanner && (
                  <div className="text-[11px] font-mono text-emerald-400">{saveConfirmBanner}</div>
                )}
              </div>
            </div>

            {/* Saved Slots List */}
            <div className="md:col-span-8 space-y-2.5">
              {savedSlots.length === 0 ? (
                <div className="bg-[#0e091c] border border-white/10 rounded-2xl p-8 text-center text-xs text-slate-400">
                  No saved matches yet. Start a match or click "WRITE SAVE SLOT" to preserve your match progress.
                </div>
              ) : (
                savedSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="bg-[#0e091c] border border-white/15 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-white truncate">{slot.name}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5 tabular-nums">
                        Score {slot.scoreA}-{slot.scoreB} (Sets {slot.setsA}-{slot.setsB}) · {slot.weather} · {slot.courtSurface} · Best {slot.bestSpikeKmh} km/h
                      </div>
                      <div className="font-mono text-[9px] text-slate-500 mt-0.5">{slot.savedAt}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => engineRef.current?.loadMatchSave(slot)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase whitespace-nowrap"
                      >
                        LOAD
                      </button>
                      <button
                        aria-label="Delete save slot"
                        onClick={() => handleDeleteSave(slot.id)}
                        className="p-2 rounded-lg bg-[#1a0d26] border border-rose-500/30 text-rose-400 hover:bg-rose-950"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PS6 SPIKE REPLAY VAULT (MULTI-ANGLE SLOW-MO SHOWCASE)     */}
      {/* ========================================================= */}
      {gameState.screenMode === 'REPLAY_VAULT' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 bg-[#090612]/94 p-4 sm:p-6 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/15 text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>MENU</span>
              </button>
              <div>
                <div className="font-vice text-xl tracking-wider text-white">
                  SLOW-MOTION SPIKE SHOWCASE VAULT
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  Repeated multi-angle 0.28x replays across 4 camera rigs (Net Tape, Shoulder, Floor Impact, Orbit Drone)
                </div>
              </div>
            </div>
            {replayClips.length > 0 && (
              <button
                onClick={() => engineRef.current?.startSpikeShowcase(0)}
                className="px-4 py-2 rounded-xl bg-[#ff3d7f] text-white font-extrabold text-xs uppercase flex items-center gap-1.5 whitespace-nowrap"
              >
                <Film className="w-4 h-4" />
                <span>LOOP ALL BEST SPIKES</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pt-4">
            {replayClips.length === 0 ? (
              <div className="bg-[#0e091c] border border-white/10 rounded-2xl p-8 text-center space-y-3 max-w-md mx-auto mt-8">
                <Film className="w-8 h-8 text-[#ff3d7f] mx-auto" />
                <div className="text-sm font-bold text-white">No Spike Highlights Captured Yet</div>
                <div className="text-xs text-slate-400">
                  Play a match or run an AI 6v6 Showcase — spikes over 62 km/h and roof blocks are automatically captured for slow-motion multi-angle playback.
                </div>
                <button
                  onClick={() => engineRef.current?.startNewMatch('AI_SHOWCASE')}
                  className="px-4 py-2 rounded-lg bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase"
                >
                  LAUNCH AI 6V6 SHOWCASE
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {replayClips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    className="bg-[#0e091c] border border-white/15 hover:border-[#ff3d7f]/60 rounded-xl p-4 space-y-2.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className={clip.team === 'A' ? 'text-[#00f0ff] font-bold' : 'text-[#ff3d7f] font-bold'}>
                          #{clip.spikerJersey} {clip.spikerName}
                        </span>
                        <span className="text-[#ffb347] font-bold">SCORE {clip.ratingScore}</span>
                      </div>
                      <div className="text-base font-extrabold text-white mt-1 tabular-nums">
                        {clip.speedKmh} KM/H · {clip.shotType}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 mt-1 tabular-nums">
                        Peak {clip.jumpHeight}m · Set {clip.setNumber} ({clip.scoreA}-{clip.scoreB}) · {clip.frames.length} frames
                      </div>
                    </div>
                    <button
                      onClick={() => engineRef.current?.startSpikeShowcase(idx)}
                      className="w-full py-2 rounded-lg bg-[#160d2c] border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-extrabold text-xs uppercase flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>WATCH 4-ANGLE SLOW-MO</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PS6 GRAPHICS & EVOLUTION SETTINGS SCREEN                  */}
      {/* ========================================================= */}
      {gameState.screenMode === 'SETTINGS' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 bg-[#090612]/94 p-4 sm:p-6 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/10 pb-3 shrink-0">
            <button
              onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
              className="px-3 py-1.5 rounded-lg bg-[#140b26] border border-white/15 text-xs font-bold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>MENU</span>
            </button>
            <div>
              <div className="font-vice text-xl tracking-wider text-white">
                PS6 GRAPHICS & ENVIRONMENTAL EVOLUTION
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                Configure Post-FX Composer, GPU Atmospheric Particles, and Match Weather Progression
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pt-4 max-w-3xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-white">PS6 Post-FX Composer</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    UnrealBloom, spike radial chromatic blur, rain lens refraction, slow-mo cinema grade
                  </div>
                </div>
                <button
                  onClick={() => engineRef.current?.setPostFXEnabled(!gameState.postFXEnabled)}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold shrink-0 ${
                    gameState.postFXEnabled
                      ? 'bg-[#00f0ff] text-[#090612]'
                      : 'bg-[#140b26] text-slate-400 border border-white/10'
                  }`}
                >
                  {gameState.postFXEnabled ? 'ENABLED' : 'BYPASS'}
                </button>
              </div>

              <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-white">Atmospheric GPU Particles</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Custom shader Dust plumes, Sand squalls, Rain streaks + splashes, Sweat droplets
                  </div>
                </div>
                <button
                  onClick={() => engineRef.current?.setParticlesEnabled(!gameState.particlesEnabled)}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold shrink-0 ${
                    gameState.particlesEnabled
                      ? 'bg-[#ff3d7f] text-white'
                      : 'bg-[#140b26] text-slate-400 border border-white/10'
                  }`}
                >
                  {gameState.particlesEnabled ? 'ENABLED' : 'OFF'}
                </button>
              </div>

              <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-white">Auto Slow-Mo Spike Replay</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Automatically showcases monster kills (76+ km/h) from 2 angles after point scored
                  </div>
                </div>
                <button
                  onClick={() =>
                    engineRef.current?.setAutoShowcaseEnabled(!replay.autoShowcaseEnabled)
                  }
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold shrink-0 ${
                    replay.autoShowcaseEnabled
                      ? 'bg-[#ffb347] text-[#090612]'
                      : 'bg-[#140b26] text-slate-400 border border-white/10'
                  }`}
                >
                  {replay.autoShowcaseEnabled ? 'AUTO ON' : 'MANUAL'}
                </button>
              </div>

              <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-white">Voice Broadcast Announcer</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Web Speech play-by-play callouts for points, spikes & blocks
                  </div>
                </div>
                <button
                  onClick={() =>
                    engineRef.current?.setVoiceAnnouncerEnabled(!gameState.voiceAnnouncerEnabled)
                  }
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold shrink-0 ${
                    gameState.voiceAnnouncerEnabled
                      ? 'bg-emerald-400 text-[#090612]'
                      : 'bg-[#140b26] text-slate-400 border border-white/10'
                  }`}
                >
                  {gameState.voiceAnnouncerEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="bg-[#0e091c] border border-[#00f0ff]/25 rounded-xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-white">AI Self-Programming Camera Director</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Auto-synthesizes comic close-up orbits & obstruction-free cutscene angles
                  </div>
                </div>
                <button
                  onClick={() =>
                    engineRef.current?.setAIDirectorEnabled(
                      !(gameState.aiDirector?.autoDirectorEnabled ?? true)
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold shrink-0 ${
                    gameState.aiDirector?.autoDirectorEnabled ?? true
                      ? 'bg-[#00f0ff] text-[#090612]'
                      : 'bg-[#140b26] text-slate-400 border border-white/10'
                  }`}
                >
                  {gameState.aiDirector?.autoDirectorEnabled ?? true ? 'AUTO AI' : 'MANUAL'}
                </button>
              </div>
            </div>

            <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 space-y-3">
              <div>
                <div className="text-xs font-extrabold text-white uppercase mb-2">
                  Graphics Quality Preset
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'LOW', label: 'LOW' },
                      { id: 'MEDIUM', label: 'MEDIUM' },
                      { id: 'HIGH', label: 'HIGH' },
                      { id: 'ULTRA_PS6', label: 'ULTRA PS6' },
                    ] as { id: GraphicsQualityPreset; label: string }[]
                  ).map((q) => (
                    <button
                      key={q.id}
                      onClick={() => engineRef.current?.setGraphicsQuality(q.id)}
                      className={`py-2 px-2 rounded-lg text-[10px] font-extrabold border whitespace-nowrap ${
                        gameState.graphicsQuality === q.id
                          ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                          : 'bg-[#140b26] text-slate-300 border-white/10'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-extrabold text-white uppercase mb-2">
                  Camera Color Filter
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {(
                    [
                      { id: 'BROADCAST_STD', label: 'TV STD' },
                      { id: 'VICE_NEON', label: 'VICE NEON' },
                      { id: 'CINEMA_NOIR', label: 'NOIR' },
                      { id: 'GOLDEN_HOUR', label: 'GOLDEN' },
                      { id: 'VINTAGE_VHS', label: 'VHS' },
                      { id: 'CRISP_HDR', label: 'CRISP HDR' },
                    ] as { id: CameraFilterMode; label: string }[]
                  ).map((fl) => (
                    <button
                      key={fl.id}
                      onClick={() => engineRef.current?.setCameraFilter(fl.id)}
                      className={`py-2 px-2 rounded-lg text-[10px] font-extrabold border whitespace-nowrap ${
                        gameState.cameraFilter === fl.id
                          ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                          : 'bg-[#140b26] text-slate-300 border-white/10'
                      }`}
                    >
                      {fl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-extrabold text-white uppercase mb-2">
                  Camera Lens Focal Length
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: '24MM_WIDE', label: '24MM' },
                      { id: '35MM_CINE', label: '35MM' },
                      { id: '50MM_STD', label: '50MM' },
                      { id: '85MM_TELE', label: '85MM' },
                      { id: '135MM_SNIPER', label: '135MM' },
                    ] as { id: CameraLensPreset; label: string }[]
                  ).map((ln) => (
                    <button
                      key={ln.id}
                      onClick={() => engineRef.current?.setCameraLens(ln.id)}
                      className={`py-2 px-2 rounded-lg text-[10px] font-extrabold border whitespace-nowrap ${
                        gameState.cameraLens === ln.id
                          ? 'bg-[#ffb347] text-[#090612] border-[#ffb347]'
                          : 'bg-[#140b26] text-slate-300 border-white/10'
                      }`}
                    >
                      {ln.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#0e091c] border border-white/15 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-extrabold text-white uppercase">
                Match Evolution Environment Mode
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {(
                  [
                    { id: 'AUTO_EVOLVE', label: 'MATCH EVOLVE' },
                    { id: 'CLEAR', label: 'CLEAR SKY' },
                    { id: 'DUST_STORM', label: 'DUST SQUALL' },
                    { id: 'SAND_SQUALL', label: 'SAND STORM' },
                    { id: 'RAIN_STORM', label: 'MONSOON RAIN' },
                  ] as { id: EnvDynamicsMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => engineRef.current?.setEnvDynamicsMode(m.id)}
                    className={`py-2 px-2 rounded-lg text-[10px] font-extrabold border whitespace-nowrap ${
                      evo.mode === m.id
                        ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                        : 'bg-[#140b26] text-slate-300 border-white/10'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IN-GAME HUD (TOP BAR + REPLAY BROADCAST + BOTTOM PLAY)    */}
      {/* ========================================================= */}
      {(isPlayingScreen || gameState.screenMode === 'PAUSED' || gameState.screenMode === 'MATCH_OVER') && (
        <>
          <header className="absolute top-9 inset-x-0 h-7 z-30 bg-[#090612]/94 border-b border-[#ff3d7f]/35 px-2 flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span className="font-vice text-sm leading-none tracking-wider flex items-center gap-0.5">
                <span className="text-[#00f0ff]">AIM</span>
                <span className="text-[#ff6b1a]">VAN</span>
              </span>
              <div className="flex items-center gap-1 font-mono font-bold tabular-nums border-l border-white/10 pl-2">
                <span className="text-[#00f0ff]">C</span>
                <span className="text-white text-[11px]">{gameState.scoreA}</span>
                <span className="text-slate-500">-</span>
                <span className="text-white text-[11px]">{gameState.scoreB}</span>
                <span className="text-[#ff3d7f]">V</span>
                <span className="text-[#ffb347] text-[9px] hidden sm:inline ml-0.5">
                  S{gameState.currentSet} ({gameState.setsA}-{gameState.setsB})
                </span>
              </div>
              <button
                onClick={() => openDrawerTo('STORY')}
                className="hidden lg:inline font-mono text-[9px] text-[#ff6b1a] border-l border-white/10 pl-2 hover:text-white"
              >
                {storyEvo.actTitle}
              </button>
            </div>

            {/* Running Commentary & Storyline Beat Line */}
            <div className="flex-1 min-w-0 overflow-hidden border-x border-white/10 px-2 h-full flex items-center">
              <div className="aim-running-line font-mono text-[10px] tracking-wide text-[#00f0ff]">
                <span className="pr-8">{tickerText}</span>
                <span className="pr-8" aria-hidden="true">
                  {tickerText}
                </span>
              </div>
            </div>

            {/* Active Contextual Controls Only */}
            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
              {gameState.savedSpikesCount > 0 && !replay.active && (
                <button
                  onClick={() => engineRef.current?.startSpikeShowcase(0)}
                  className="h-5 px-1.5 rounded bg-[#140b26] border border-[#ff3d7f]/60 text-[#ff3d7f] font-mono text-[9px] font-bold flex items-center gap-0.5 hover:bg-[#ff3d7f] hover:text-white"
                >
                  <Film className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">{gameState.savedSpikesCount}</span>
                </button>
              )}

              {eq?.trackName && (
                <button
                  aria-label={eq.isPlaying ? 'Pause music track' : 'Play music track'}
                  onClick={() => engineRef.current?.toggleMp3Playback()}
                  className="h-5 px-1.5 rounded bg-[#ff6b1a] text-[#090612] font-mono text-[9px] font-extrabold flex items-center gap-0.5"
                >
                  {eq.isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                </button>
              )}

              <button
                onClick={() =>
                  engineRef.current?.setControlMode(
                    gameState.controlMode === 'PLAYER' ? 'AUTO' : 'PLAYER'
                  )
                }
                className={`h-5 px-1.5 rounded text-[9px] font-extrabold uppercase flex items-center gap-0.5 border ${
                  gameState.controlMode === 'PLAYER'
                    ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                    : 'bg-[#140b26] text-[#ffb347] border-[#ffb347]/40'
                }`}
              >
                <Gamepad2 className="w-2.5 h-2.5" />
                <span>{gameState.controlMode === 'PLAYER' ? 'PLAY' : 'AUTO'}</span>
              </button>

              <button
                aria-label="Open Vancouver Map and Print Studio"
                onClick={() => setMapModalOpen(true)}
                className="h-5 px-1.5 rounded bg-[#140b26] border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-mono text-[9px] font-bold flex items-center gap-0.5"
              >
                <MapPin className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">MAP</span>
              </button>

              <button
                aria-label="Pause match"
                onClick={() => engineRef.current?.togglePause()}
                className="h-5 w-6 rounded bg-[#140b26] border border-white/15 text-slate-200 flex items-center justify-center hover:bg-[#1e1038]"
              >
                <Pause className="w-3 h-3" />
              </button>

              <button
                aria-label="Open settings drawer"
                onClick={() => (drawerOpen ? setDrawerOpen(false) : openDrawerTo('ARENA'))}
                className="h-5 w-6 rounded bg-[#140b26] border border-white/15 text-slate-200 flex items-center justify-center hover:bg-[#1e1038]"
              >
                <Menu className="w-3 h-3" />
              </button>
            </div>
          </header>

          {/* Show Callout Badge ONLY when an active fault, skill, or pass rating triggers */}
          {!replay.active &&
            (gameState.netViolation ||
              gameState.activeSkillNotification ||
              gameState.lastPassRatingText) && (
              <div className="absolute top-[68px] inset-x-0 z-20 pointer-events-none flex justify-center px-2">
                {gameState.netViolation ? (
                  <div className="bg-[#ffb347] text-[#090612] px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase flex items-center gap-1 shadow">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>
                      {gameState.netViolation.type} #{gameState.netViolation.jerseyNumber}
                    </span>
                  </div>
                ) : gameState.activeSkillNotification ? (
                  <div className="bg-[#ff3d7f] text-white px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase flex items-center gap-1 shadow">
                    <Zap className="w-2.5 h-2.5 fill-white shrink-0" />
                    <span>
                      {gameState.activeSkillNotification.skillName} ·{' '}
                      {gameState.activeSkillNotification.unitName}
                    </span>
                  </div>
                ) : (
                  <div className="bg-[#00f0ff] text-[#090612] px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase flex items-center gap-1 shadow">
                    <Award className="w-2.5 h-2.5 shrink-0" />
                    <span>{gameState.lastPassRatingText}</span>
                  </div>
                )}
              </div>
            )}

          {/* ========================================================= */}
          {/* COMIC-STYLE SLOW-MO STRIKE CLOSE-UP IMPACT BADGE          */}
          {/* ========================================================= */}
          {gameState.comicStrike?.active && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150"
                style={{
                  left: `${Math.round(Math.min(0.8, Math.max(0.2, gameState.comicStrike.screenX)) * 100)}%`,
                  top: `${Math.round(Math.min(0.56, Math.max(0.16, gameState.comicStrike.screenY * 0.72)) * 100)}%`,
                  transform: `translate(-50%, -50%) rotate(${(gameState.comicStrike.dutchTiltDeg * 0.6).toFixed(1)}deg) skewX(-8deg)`,
                }}
              >
                <div className="bg-[#ffb347] text-[#090612] border-2 border-[#090612] shadow-[4px_4px_0px_#ff3d7f] px-3 py-1.5">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Zap className="w-4 h-4 fill-[#090612] shrink-0" />
                    <span className="font-vice text-lg sm:text-xl tracking-wider leading-none uppercase">
                      {gameState.comicStrike.calloutText}
                    </span>
                    <span className="font-mono text-xs font-black bg-[#090612] text-[#00f0ff] px-1.5 py-0.5 tabular-nums">
                      {gameState.comicStrike.speedKmh} KM/H
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono text-[9px] font-extrabold uppercase mt-0.5 border-t border-[#090612]/25 pt-0.5 tabular-nums whitespace-nowrap">
                    <span>{gameState.comicStrike.subText}</span>
                    <span className="text-[#9e0039]">
                      {gameState.comicStrike.phase === 'REALTIME_RETURN'
                        ? `REAL TIME ${gameState.comicStrike.timeScale.toFixed(2)}x`
                        : `SLOW-MO ORBIT ${gameState.comicStrike.timeScale.toFixed(2)}x`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SLOW-MOTION MULTI-ANGLE REPLAY BROADCAST CONTROLLER       */}
          {/* ========================================================= */}
          {replay.active && replay.currentClip ? (
            <div className="absolute bottom-3 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
              <div className="pointer-events-auto bg-[#090612]/96 border border-[#ff3d7f]/60 rounded-2xl px-4 py-2.5 shadow-2xl max-w-2xl w-full space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="px-2 py-0.5 rounded bg-[#ff3d7f] text-white text-[10px] font-extrabold uppercase">
                      SLOW-MO {replay.playbackSpeed}x
                    </span>
                    <span className="font-extrabold text-white">
                      #{replay.currentClip.spikerJersey} {replay.currentClip.spikerName}
                    </span>
                    <span className="text-[#00f0ff] font-bold tabular-nums">
                      {replay.currentClip.speedKmh} KM/H
                    </span>
                    <span className="text-slate-400 hidden sm:inline">
                      · {replay.currentClip.shotType}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-[#ffb347] font-bold tabular-nums">
                    CAM {replay.angleIndex + 1}/{replay.totalAngles} · {ANGLE_LABELS[replay.currentAngle]}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00f0ff]"
                    style={{ width: `${Math.round(replay.progress * 100)}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {([0.18, 0.28, 0.5] as const).map((spd) => (
                      <button
                        key={spd}
                        onClick={() => engineRef.current?.setReplaySpeed(spd)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${
                          Math.abs(replay.playbackSpeed - spd) < 0.02
                            ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                            : 'bg-[#140b26] text-slate-300 border-white/10'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => engineRef.current?.cycleReplayAngle()}
                      className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-[#00f0ff]/40 text-[#00f0ff] font-bold text-[10px] uppercase flex items-center gap-1 whitespace-nowrap"
                    >
                      <Camera className="w-3 h-3" />
                      <span>NEXT ANGLE</span>
                    </button>
                    {replay.totalClips > 1 && (
                      <button
                        onClick={() => engineRef.current?.nextReplayClip()}
                        className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-[#ffb347]/40 text-[#ffb347] font-bold text-[10px] uppercase flex items-center gap-1 whitespace-nowrap"
                      >
                        <FastForward className="w-3 h-3" />
                        <span>NEXT SPIKE ({replay.clipIndex + 1}/{replay.totalClips})</span>
                      </button>
                    )}
                    <button
                      onClick={() => engineRef.current?.stopSpikeReplay()}
                      className="px-3 py-1 rounded-lg bg-[#ff3d7f] text-white font-extrabold text-[10px] uppercase whitespace-nowrap"
                    >
                      RESUME COURT
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : gameState.ceremonyPhase !== 'LIVE_MATCH' ? (
            /* ========================================================= */
            /* OPENING CEREMONY / INTERMISSION STADIUM SHOW CONTROLS     */
            /* ========================================================= */
            <div className="absolute bottom-3 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
              <div className="pointer-events-auto bg-[#090612]/96 border border-[#00f0ff]/55 rounded-2xl px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 max-w-xl w-full">
                <div>
                  <div className="font-mono text-[10px] font-extrabold text-[#ffb347] uppercase tabular-nums">
                    {gameState.ceremonyPhase === 'OPENING_CEREMONY' ? 'OPENING CEREMONY' : 'SET INTERMISSION SHOW'} · {Math.ceil(gameState.ceremonyTimer)}S
                  </div>
                  <div className="text-xs text-slate-200 font-bold">
                    {eq?.isPlaying
                      ? `Cheerleaders & Crowd Dancing to "${eq.trackName || 'Arena Track'}"`
                      : 'Upload / Play MP3 Audio to Sync Cheerleaders & Crowd Wave'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <button
                    onClick={() => (eq?.trackName ? engineRef.current?.toggleMp3Playback() : mp3InputRef.current?.click())}
                    className="px-3 py-1.5 rounded-lg bg-[#160d2c] border border-[#ffb347]/60 text-[#ffb347] font-bold text-[10px] uppercase flex items-center gap-1"
                  >
                    <Music className="w-3 h-3" />
                    <span>{eq?.trackName ? (eq.isPlaying ? 'PAUSE BEAT' : 'PLAY BEAT') : 'ADD MP3'}</span>
                  </button>
                  <button
                    onClick={() => engineRef.current?.setCeremonyPhase('LIVE_MATCH')}
                    className="px-3 py-1.5 rounded-lg bg-[#00f0ff] text-[#090612] font-extrabold text-[10px] uppercase"
                  >
                    START MATCH
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* DYNAMIC REACTIVE HOLD-TO-CHARGE PLAY CONTROLS (BOTTOM)    */
            /* ========================================================= */
            <div className="absolute bottom-2 inset-x-0 z-30 pointer-events-none flex flex-col items-center gap-1.5 px-2">
              {/* Live Timing Grade / Combo / Charge Gauge Callout */}
              {gameState.controlMode === 'PLAYER' &&
                (gameState.reactiveControl.isCharging ||
                  gameState.reactiveControl.lastTimingGrade !== 'NONE' ||
                  gameState.reactiveControl.bufferedAction) && (
                  <div className="bg-[#090612]/94 border border-[#00f0ff]/45 rounded-lg px-2.5 py-0.5 font-mono text-[9px] flex items-center gap-2 shadow-lg tabular-nums">
                    {gameState.reactiveControl.isCharging ? (
                      <>
                        <span className="text-[#ffb347] font-extrabold uppercase">
                          CHARGING {Math.round(gameState.reactiveControl.chargeLevel * 100)}%
                        </span>
                        <div className="w-20 h-1.5 bg-white/15 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#ffb347]"
                            style={{ width: `${Math.round(gameState.reactiveControl.chargeLevel * 100)}%` }}
                          />
                        </div>
                      </>
                    ) : gameState.reactiveControl.bufferedAction ? (
                      <span className="text-[#00f0ff] font-bold">
                        BUFFERED ({gameState.reactiveControl.bufferedAction}) · READY ON CONTACT
                      </span>
                    ) : (
                      <>
                        <span
                          className={`font-extrabold ${
                            gameState.reactiveControl.lastTimingGrade === 'PERFECT'
                              ? 'text-[#ffb347]'
                              : gameState.reactiveControl.lastTimingGrade === 'GREAT'
                              ? 'text-[#00f0ff]'
                              : gameState.reactiveControl.lastTimingGrade === 'EARLY'
                              ? 'text-emerald-300'
                              : 'text-[#ff3d7f]'
                          }`}
                        >
                          {gameState.reactiveControl.lastTimingGrade} TIMING
                        </span>
                        <span className="text-slate-300">
                          {gameState.reactiveControl.lastActionLabel}
                        </span>
                        {gameState.reactiveControl.comboStreak > 1 && (
                          <span className="text-[#ffb347] font-extrabold">
                            x{gameState.reactiveControl.comboStreak} STREAK
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

              {gameState.controlMode === 'PLAYER' ? (
                isCyanServing ? (
                  <div className="pointer-events-auto flex items-center gap-1.5 bg-[#090612]/94 border border-[#ff3d7f]/40 rounded-full p-1 shadow-xl">
                    {(['FLOAT', 'TOPSPIN', 'JUMP', 'LONG_SERVE'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setServeType(type)}
                        className={`h-7 px-2 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${
                          serveType === type
                            ? 'bg-[#ff3d7f] text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {type === 'TOPSPIN' ? 'TOP' : type === 'LONG_SERVE' ? 'LONG' : type}
                      </button>
                    ))}
                    <button
                      onPointerDown={(e) => {
                        e.preventDefault();
                        engineRef.current?.beginReactiveAction('SERVE');
                      }}
                      onPointerUp={() =>
                        engineRef.current?.releaseReactiveAction('SERVE', serveType)
                      }
                      onPointerCancel={() =>
                        engineRef.current?.releaseReactiveAction('SERVE', serveType)
                      }
                      className="relative overflow-hidden h-7 px-4 rounded-full bg-[#00f0ff] active:bg-[#ffb347] text-[#090612] font-extrabold text-[10px] tracking-wider uppercase flex items-center gap-1 transition-transform duration-150 active:scale-[0.96] touch-none"
                    >
                      <Zap className="w-3 h-3 fill-[#090612]" />
                      <span>
                        {gameState.reactiveControl.isCharging
                          ? `PWR ${Math.round(gameState.reactiveControl.chargeLevel * 100)}%`
                          : 'HOLD SERVE'}
                      </span>
                    </button>
                  </div>
                ) : gameState.matchState === 'PLAY' ? (
                  <div className="flex flex-col items-center gap-1 max-w-[98vw]">
                    {/* Live 3-Stage Pass -> Strike -> Spike Chain Strip */}
                    <div className="flex items-center gap-1 bg-[#090612]/92 border border-white/10 rounded-full px-2.5 py-0.5 font-mono text-[8px] tracking-wider uppercase whitespace-nowrap">
                      <span
                        className={
                          gameState.rallyChainStage === 'READY' || gameState.rallyChainStage === 'PASS_STAGE'
                            ? 'text-[#00f0ff] font-extrabold'
                            : 'text-slate-500'
                        }
                      >
                        1.PASS
                      </span>
                      <span className="text-slate-600">→</span>
                      <span
                        className={
                          gameState.rallyChainStage === 'STRIKE_STAGE'
                            ? 'text-[#ffb347] font-extrabold'
                            : 'text-slate-500'
                        }
                      >
                        2.STRIKE
                      </span>
                      <span className="text-slate-600">→</span>
                      <span
                        className={
                          gameState.rallyChainStage === 'SPIKE_STAGE'
                            ? 'text-[#ff3d7f] font-extrabold'
                            : 'text-slate-500'
                        }
                      >
                        3.SPIKE
                      </span>
                      {gameState.aiDirector?.autoDirectorEnabled && (
                        <>
                          <span className="text-slate-600 hidden sm:inline">·</span>
                          <span className="text-emerald-300 hidden sm:inline tabular-nums">
                            AI CAM {Math.round(gameState.aiDirector.fitnessScore)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="pointer-events-auto flex items-center gap-1 bg-[#090612]/94 border border-[#00f0ff]/35 rounded-full p-1 shadow-xl overflow-x-auto max-w-full">
                      <button
                        aria-label="Switch active Cyan player"
                        onClick={() => engineRef.current?.cycleActiveCyanPlayer()}
                        className="h-7 px-2 rounded-full bg-[#140b26] border border-white/10 text-[9px] font-mono font-bold text-[#00f0ff] tabular-nums whitespace-nowrap shrink-0"
                      >
                        #{gameState.activePlayerJersey}
                      </button>

                      {/* 1. PASS / DIG */}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('PASS_DIG');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('PASS_DIG', serveType)
                        }
                        onPointerCancel={() =>
                          engineRef.current?.releaseReactiveAction('PASS_DIG', serveType)
                        }
                        className={`h-7 px-2.5 rounded-full text-[9px] font-extrabold uppercase whitespace-nowrap shrink-0 touch-none ${
                          gameState.activePrompt === 'DIG' || gameState.rallyChainStage === 'READY'
                            ? 'bg-[#00f0ff] text-[#090612]'
                            : 'bg-[#140b26] text-cyan-200 border border-white/10'
                        }`}
                      >
                        PASS
                      </button>

                      {/* 2. STRIKE / SET */}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('STRIKE_SET');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('STRIKE_SET', serveType)
                        }
                        onPointerCancel={() =>
                          engineRef.current?.releaseReactiveAction('STRIKE_SET', serveType)
                        }
                        className={`h-7 px-2.5 rounded-full text-[9px] font-extrabold uppercase whitespace-nowrap shrink-0 touch-none ${
                          gameState.activePrompt === 'SET' || gameState.rallyChainStage === 'PASS_STAGE'
                            ? 'bg-[#ffb347] text-[#090612]'
                            : 'bg-[#140b26] text-amber-200 border border-white/10'
                        }`}
                      >
                        STRIKE
                      </button>

                      {/* 3. JUMP SPIKE / SMART PRIMARY */}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('JUMP_SPIKE');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('JUMP_SPIKE', serveType)
                        }
                        onPointerCancel={() =>
                          engineRef.current?.releaseReactiveAction('JUMP_SPIKE', serveType)
                        }
                        className={`relative overflow-hidden h-7 px-3 rounded-full font-extrabold text-[10px] tracking-wider uppercase flex items-center gap-1 whitespace-nowrap shrink-0 transition-transform duration-150 active:scale-[0.96] touch-none ${
                          gameState.reactiveControl.isCharging
                            ? 'bg-[#ff3d7f] text-white'
                            : timingSweetSpot &&
                              (gameState.activePrompt === 'SPIKE' || gameState.activePrompt === 'BLOCK')
                            ? 'bg-[#ff3d7f] text-white'
                            : gameState.rallyChainStage === 'STRIKE_STAGE'
                            ? 'bg-[#ff3d7f] text-white'
                            : 'bg-[#1a1030] text-slate-200 border border-[#ff3d7f]/40'
                        }`}
                      >
                        <Zap className="w-3 h-3 shrink-0" />
                        <span>
                          {gameState.reactiveControl.isCharging
                            ? `${Math.round(gameState.reactiveControl.chargeLevel * 100)}%`
                            : gameState.activePrompt === 'BLOCK'
                            ? 'BLOCK'
                            : 'SPIKE'}
                        </span>
                        <span
                          className="absolute bottom-0 left-0 h-0.5 bg-[#00f0ff]"
                          style={{
                            width: `${
                              gameState.reactiveControl.isCharging
                                ? Math.round(gameState.reactiveControl.chargeLevel * 100)
                                : timingPct
                            }%`,
                          }}
                        />
                      </button>

                      {/* LONG JUMP LEAP (HORIZONTAL + VERTICAL COVER) */}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('LONG_JUMP');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('LONG_JUMP', serveType)
                        }
                        onPointerCancel={() =>
                          engineRef.current?.releaseReactiveAction('LONG_JUMP', serveType)
                        }
                        className="h-7 px-2.5 rounded-full bg-[#140b26] active:bg-[#00f0ff] active:text-[#090612] border border-[#00f0ff]/35 text-[9px] font-extrabold text-[#00f0ff] whitespace-nowrap shrink-0 touch-none"
                      >
                        L-JUMP
                      </button>

                      {/* DIVE + FALL RECOVERY */}
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('DIVE_SAVE');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('DIVE_SAVE', serveType)
                        }
                        onPointerCancel={() =>
                          engineRef.current?.releaseReactiveAction('DIVE_SAVE', serveType)
                        }
                        className="h-7 px-2.5 rounded-full bg-[#140b26] active:bg-[#ffb347] active:text-[#090612] text-[9px] font-bold text-amber-200 whitespace-nowrap shrink-0 touch-none"
                      >
                        DIVE
                      </button>

                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('LEFT');
                        }}
                        onPointerUp={() => engineRef.current?.releaseReactiveAction('LEFT', serveType)}
                        className="h-7 px-2 rounded-full bg-[#140b26] active:bg-[#ff3d7f] text-[9px] font-bold text-slate-200 whitespace-nowrap shrink-0 touch-none"
                      >
                        L
                      </button>
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('FEINT_TIP');
                        }}
                        onPointerUp={() =>
                          engineRef.current?.releaseReactiveAction('FEINT_TIP', serveType)
                        }
                        className="h-7 px-2 rounded-full bg-[#140b26] active:bg-[#00f0ff] active:text-[#090612] text-[9px] font-bold text-cyan-200 whitespace-nowrap shrink-0 touch-none"
                      >
                        TIP
                      </button>
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault();
                          engineRef.current?.beginReactiveAction('RIGHT');
                        }}
                        onPointerUp={() => engineRef.current?.releaseReactiveAction('RIGHT', serveType)}
                        className="h-7 px-2 rounded-full bg-[#140b26] active:bg-[#ff3d7f] text-[9px] font-bold text-slate-200 whitespace-nowrap shrink-0 touch-none"
                      >
                        R
                      </button>
                    </div>
                  </div>
                ) : null
              ) : (
                <div className="pointer-events-auto flex items-center gap-1.5 bg-[#090612]/92 border border-[#ff3d7f]/35 rounded-full px-3 py-1 text-[9px] font-mono text-[#00f0ff] shadow-lg">
                  <span>{gameState.tacticalPlayA.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500">·</span>
                  <button
                    onClick={() => openDrawerTo('TACTICS')}
                    className="text-[#ffb347] font-bold uppercase underline-offset-2 hover:underline"
                  >
                    Strategy
                  </button>
                </div>
              )}
            </div>
          )}

          {isPlayingScreen && !replay.active && (
            <PlayerControlSidePanel
              units={allUnits}
              activeUnitId={
                allUnits.find((u) => u.team === 'A' && u.jerseyNumber === gameState.activePlayerJersey)?.id ?? 1
              }
              controlMode={gameState.controlMode}
              manualUnitLocked={Boolean(gameState.manualUnitLocked)}
              spriteMatrixSlots={gameState.spriteMatrixSlots}
              onSelectUnit={(id) => engineRef.current?.selectControlledUnit(id)}
              onUnlockAuto={() => engineRef.current?.clearManualUnitLock()}
            />
          )}
        </>
      )}

      {/* ========================================================= */}
      {/* PAUSE OVERLAY MODAL                                       */}
      {/* ========================================================= */}
      {gameState.screenMode === 'PAUSED' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-40 bg-[#090612]/90 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0f0920] border border-[#00f0ff]/40 rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="text-center border-b border-white/10 pb-3">
              <div className="font-mono text-[10px] text-[#ffb347] uppercase">MATCH PAUSED</div>
              <div className="font-vice text-2xl tracking-wider text-white mt-0.5">
                CYAN {gameState.scoreA} - {gameState.scoreB} VICE
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                Set {gameState.currentSet} ({gameState.setsA}-{gameState.setsB}) · {EVOLUTION_LABELS[evo.stage]}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => engineRef.current?.togglePause()}
                className="w-full py-2.5 rounded-xl bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-[#090612]" />
                <span>RESUME MATCH</span>
              </button>
              <button
                onClick={handleQuickSave}
                className="w-full py-2.5 rounded-xl bg-[#160d2c] border border-[#ffb347]/50 text-[#ffb347] font-bold text-xs uppercase flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{saveConfirmBanner || 'QUICK SAVE CHECKPOINT'}</span>
              </button>
              {gameState.savedSpikesCount > 0 && (
                <button
                  onClick={() => engineRef.current?.startSpikeShowcase(0)}
                  className="w-full py-2.5 rounded-xl bg-[#160d2c] border border-[#ff3d7f]/50 text-[#ff3d7f] font-bold text-xs uppercase flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>WATCH BEST SPIKES ({gameState.savedSpikesCount})</span>
                </button>
              )}
              <button
                onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                className="w-full py-2.5 rounded-xl bg-[#140b26] border border-white/15 text-slate-300 font-bold text-xs uppercase"
              >
                EXIT TO MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MATCH OVER PODIUM + MULTI-ANGLE SPIKE REPLAY LAUNCH       */}
      {/* ========================================================= */}
      {gameState.screenMode === 'MATCH_OVER' && (
        <div className="absolute inset-x-0 top-9 bottom-0 z-40 bg-[#090612]/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0f0920] border border-[#ffb347]/50 rounded-2xl p-6 space-y-4 text-center shadow-2xl">
            <Trophy className="w-10 h-10 text-[#ffb347] mx-auto" />
            <div>
              <div className="font-mono text-[11px] uppercase text-[#00f0ff]">
                FINAL MATCH RESULT
              </div>
              <h2 className="font-vice text-3xl tracking-wider text-white mt-1">
                {gameState.setsA > gameState.setsB ? 'CYAN STORM VICTORY' : 'VICE CORAL VICTORY'}
              </h2>
              <div className="font-mono text-sm text-slate-300 mt-1 tabular-nums">
                Sets {gameState.setsA}-{gameState.setsB} · Final Score {gameState.scoreA}-{gameState.scoreB}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
              <div className="bg-black/45 rounded-lg p-2">
                <div className="text-[9px] text-slate-400">TOP SPIKE</div>
                <div className="font-bold text-[#ffb347]">{careerStats.fastestSpikeKmh} km/h</div>
              </div>
              <div className="bg-black/45 rounded-lg p-2">
                <div className="text-[9px] text-slate-400">AVG SWEAT</div>
                <div className="font-bold text-[#00f0ff]">{Math.round(evo.avgSweatLevel * 100)}%</div>
              </div>
              <div className="bg-black/45 rounded-lg p-2">
                <div className="text-[9px] text-slate-400">HIGHLIGHTS</div>
                <div className="font-bold text-[#ff3d7f]">{gameState.savedSpikesCount} clips</div>
              </div>
            </div>

            <div className="space-y-2">
              {gameState.savedSpikesCount > 0 && (
                <button
                  onClick={() => engineRef.current?.startSpikeShowcase(0)}
                  className="w-full py-2.5 rounded-xl bg-[#ff3d7f] text-white font-extrabold text-xs uppercase flex items-center justify-center gap-2"
                >
                  <Film className="w-4 h-4" />
                  <span>WATCH BEST SPIKES SHOWCASE (4 ANGLES)</span>
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                {gameState.matchFormat === 'STORY_MATCH' && gameState.storyState?.activeChapterId ? (
                  <button
                    onClick={() => engineRef.current?.setScreenMode('STORY_HUB')}
                    className="py-2.5 rounded-xl bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>STORY CAMPAIGN</span>
                  </button>
                ) : (
                  <button
                    onClick={() => engineRef.current?.startNewMatch(gameState.matchFormat)}
                    className="py-2.5 rounded-xl bg-[#00f0ff] text-[#090612] font-extrabold text-xs uppercase flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>REMATCH</span>
                  </button>
                )}
                <button
                  onClick={() => engineRef.current?.setScreenMode('MAIN_MENU')}
                  className="py-2.5 rounded-xl bg-[#140b26] border border-white/15 text-slate-200 font-bold text-xs uppercase"
                >
                  MAIN MENU
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* UNIFIED SYSTEM DRAWER (ARENA / TACTICS / MATRIX / BRAIN)  */}
      {/* ========================================================= */}
      {drawerOpen && (
        <aside className="fixed top-9 bottom-0 right-0 w-full max-w-[420px] z-40 bg-[#090612] border-l border-[#ff3d7f]/35 shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ff3d7f]" />
              <span className="font-vice text-base tracking-wider uppercase text-white">
                <span className="text-[#00f0ff]">AIM</span> <span className="text-[#ff3d7f]">VANCOUVER</span> · ARENA DECK
              </span>
            </div>
            <button
              aria-label="Close drawer"
              onClick={() => setDrawerOpen(false)}
              className="w-9 h-9 rounded-lg bg-[#140b26] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3 Navigation Tabs */}
          <div className="px-3 pt-2.5 pb-2 border-b border-white/10 grid grid-cols-3 gap-1.5 shrink-0">
            {(
              [
                { id: 'ARENA', label: 'ARENA', icon: Sliders },
                { id: 'TACTICS', label: 'TACTICS', icon: Shield },
                { id: 'STORY', label: 'STORY & DJ', icon: BookOpen },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = drawerTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={`py-2 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-[#00f0ff] text-[#090612]'
                      : 'bg-[#140b26] text-slate-300 hover:bg-[#1e1038]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Drawer Content Scroll Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* ==================== TAB 1: ARENA + MATCH EVOLUTION ==================== */}
            {drawerTab === 'ARENA' && (
              <>
                {/* Match Evolution Readout & Mode */}
                <div className="bg-[#140b26] border border-[#00f0ff]/35 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-white flex items-center gap-1.5">
                      <CloudRain className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span>Match Evolution · {EVOLUTION_LABELS[evo.stage]}</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#ffb347] tabular-nums">
                      {Math.round(evo.intensity * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px] tabular-nums">
                    <div className="bg-black/50 rounded p-1.5">
                      <div className="text-[9px] text-slate-400 flex items-center gap-1">
                        <Wind className="w-2.5 h-2.5 text-amber-300" />DUST
                      </div>
                      <div className="font-bold text-amber-200">{Math.round(evo.dustLevel * 100)}%</div>
                    </div>
                    <div className="bg-black/50 rounded p-1.5">
                      <div className="text-[9px] text-slate-400 flex items-center gap-1">
                        <Flame className="w-2.5 h-2.5 text-orange-300" />SAND
                      </div>
                      <div className="font-bold text-orange-200">{Math.round(evo.sandLevel * 100)}%</div>
                    </div>
                    <div className="bg-black/50 rounded p-1.5">
                      <div className="text-[9px] text-slate-400 flex items-center gap-1">
                        <CloudRain className="w-2.5 h-2.5 text-sky-300" />RAIN
                      </div>
                      <div className="font-bold text-sky-200">{Math.round(evo.rainLevel * 100)}%</div>
                    </div>
                    <div className="bg-black/50 rounded p-1.5">
                      <div className="text-[9px] text-slate-400 flex items-center gap-1">
                        <Droplets className="w-2.5 h-2.5 text-cyan-300" />SWEAT
                      </div>
                      <div className="font-bold text-cyan-200">{Math.round(evo.avgSweatLevel * 100)}%</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-1">
                    {(
                      [
                        { id: 'AUTO_EVOLVE', label: 'AUTO' },
                        { id: 'CLEAR', label: 'CLEAR' },
                        { id: 'DUST_STORM', label: 'DUST' },
                        { id: 'SAND_SQUALL', label: 'SAND' },
                        { id: 'RAIN_STORM', label: 'RAIN' },
                      ] as { id: EnvDynamicsMode; label: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => engineRef.current?.setEnvDynamicsMode(m.id)}
                        className={`py-1 rounded text-[9px] font-bold border ${
                          evo.mode === m.id
                            ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2 Graphics Systems Toggles */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => engineRef.current?.setParticlesEnabled(!gameState.particlesEnabled)}
                    className={`p-2.5 rounded-xl border text-left ${
                      gameState.particlesEnabled
                        ? 'bg-[#170f2e] border-[#ff3d7f]/60 text-white'
                        : 'bg-slate-900 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Layers className="w-3.5 h-3.5 text-[#ff3d7f]" />
                      <span className="font-mono text-[9px] font-bold">
                        {gameState.particlesEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold mt-1">GPU Particle FX</div>
                  </button>

                  <button
                    onClick={() => engineRef.current?.setPostFXEnabled(!gameState.postFXEnabled)}
                    className={`p-2.5 rounded-xl border text-left ${
                      gameState.postFXEnabled
                        ? 'bg-[#170f2e] border-[#00f0ff]/60 text-white'
                        : 'bg-slate-900 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Sparkles className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span className="font-mono text-[9px] font-bold">
                        {gameState.postFXEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold mt-1">PS6 PostFX Composer</div>
                  </button>
                </div>

                {/* Vancouver City Map & Area Print Launcher */}
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setMapModalOpen(true);
                  }}
                  className="w-full p-2.5 rounded-xl bg-[#140b26] border border-[#00f0ff]/45 hover:border-[#00f0ff] flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#00f0ff] shrink-0" />
                    <div>
                      <div className="text-[11px] font-bold text-white">
                        Vancouver District Map &amp; Print
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Explore real streets, traffic, parking &amp; print area sheet
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#00f0ff] text-[#090612] font-mono text-[9px] font-black uppercase shrink-0">
                    OPEN MAP
                  </span>
                </button>

                <div className="flex items-center justify-between bg-slate-900 border border-white/10 rounded-xl p-2.5">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-amber-300" />
                    <div>
                      <div className="text-[11px] font-bold text-white">
                        Comic Slow-Mo Spike Orbit
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Close-up comic orbit &amp; reactive return on spikes
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      engineRef.current?.setSpikeCamEnabled(
                        gameState.spikeCamEnabled === false
                      )
                    }
                    className={`px-3 py-1 rounded-lg font-mono text-[10px] font-bold border ${
                      gameState.spikeCamEnabled !== false
                        ? 'bg-amber-400 text-slate-950 border-amber-200'
                        : 'bg-slate-800 text-slate-400 border-white/10'
                    }`}
                  >
                    {gameState.spikeCamEnabled !== false ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* AI Self-Programming Camera Director */}
                <div className="bg-[#140b26] border border-[#00f0ff]/35 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-[#00f0ff]" />
                        <span>AI Self-Programming Camera</span>
                      </div>
                      <div className="font-mono text-[9px] text-slate-400 mt-0.5 tabular-nums">
                        {gameState.aiDirector?.programRule.replace(/_/g, ' ') || 'LIVE COURT'} ·{' '}
                        {Math.round(gameState.aiDirector?.azimuthDeg ?? 0)}° AZ · FIT{' '}
                        {Math.round(gameState.aiDirector?.fitnessScore ?? 95)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => engineRef.current?.programLiveDirectorAngle()}
                        className="px-2 py-1 rounded-lg bg-[#1e1038] border border-[#ffb347]/50 text-[#ffb347] font-mono text-[9px] font-bold whitespace-nowrap"
                      >
                        RE-FRAME
                      </button>
                      <button
                        onClick={() =>
                          engineRef.current?.setAIDirectorEnabled(
                            !(gameState.aiDirector?.autoDirectorEnabled ?? true)
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold border whitespace-nowrap ${
                          gameState.aiDirector?.autoDirectorEnabled ?? true
                            ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                            : 'bg-slate-800 text-slate-400 border-white/10'
                        }`}
                      >
                        {gameState.aiDirector?.autoDirectorEnabled ?? true ? 'AUTO' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stadium Crowd Mood + Sprite Matrix Quick Toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#140b26] border border-[#ffb347]/35 rounded-xl p-2.5">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-[#ffb347] font-bold">CROWD ENERGY</span>
                      <span className="text-white font-extrabold tabular-nums">
                        {gameState.crowdMood.decibelLevel} dB
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-300 truncate mt-1">
                      {gameState.crowdMood.cheerLabel}
                    </div>
                    <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-[#ff3d7f]"
                        style={{ width: `${Math.round(gameState.crowdMood.excitement * 100)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      engineRef.current?.setSpriteMatrixVisible(!gameState.spriteMatrixVisible)
                    }
                    className={`p-2.5 rounded-xl border text-left transition-transform duration-150 active:scale-[0.98] ${
                      gameState.spriteMatrixVisible
                        ? 'bg-[#170f2e] border-[#00f0ff]/60 text-white'
                        : 'bg-slate-900 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[9px] font-bold">
                      <span className="text-[#00f0ff]">FLOOR MATRIX</span>
                      <span>{gameState.spriteMatrixVisible ? 'ON' : 'OFF'}</span>
                    </div>
                    <div className="text-[10px] font-bold mt-1">Court Footwork Grid</div>
                  </button>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    TV Broadcast & Cinematic Cameras
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'BROADCAST', label: 'TV MAIN' },
                        { id: 'CINEMATIC_FLOW', label: 'FLOW CAM' },
                        { id: 'ACTION', label: 'ACTION' },
                        { id: 'COURT_BEHIND', label: 'END-LINE' },
                        { id: 'SKY_CAM', label: 'BLIMP' },
                        { id: 'ISOMETRIC', label: 'JIB CAM' },
                      ] as { id: CameraPreset; label: string }[]
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        onClick={() => engineRef.current?.setCameraAngle(cam.id)}
                        className={`py-2 rounded-lg text-[10px] font-bold border whitespace-nowrap ${
                          gameState.cameraAngle === cam.id
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera Lenses, Filters & Graphics Quality */}
                <div className="bg-[#140b26] border border-white/10 rounded-xl p-3 space-y-2.5">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                      Optical Camera Lens
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {(
                        [
                          { id: '24MM_WIDE', label: '24mm' },
                          { id: '35MM_CINE', label: '35mm' },
                          { id: '50MM_STD', label: '50mm' },
                          { id: '85MM_TELE', label: '85mm' },
                          { id: '135MM_SNIPER', label: '135mm' },
                        ] as { id: CameraLensPreset; label: string }[]
                      ).map((ln) => (
                        <button
                          key={ln.id}
                          onClick={() => engineRef.current?.setCameraLens(ln.id)}
                          className={`py-1.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap ${
                            gameState.cameraLens === ln.id
                              ? 'bg-[#ffb347] text-[#090612] border-[#ffb347]'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {ln.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                      Camera Color Filter
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'BROADCAST_STD', label: 'TV STD' },
                          { id: 'VICE_NEON', label: 'VICE NEON' },
                          { id: 'CINEMA_NOIR', label: 'NOIR' },
                          { id: 'GOLDEN_HOUR', label: 'GOLDEN' },
                          { id: 'VINTAGE_VHS', label: 'VHS' },
                          { id: 'CRISP_HDR', label: 'CRISP HDR' },
                        ] as { id: CameraFilterMode; label: string }[]
                      ).map((fl) => (
                        <button
                          key={fl.id}
                          onClick={() => engineRef.current?.setCameraFilter(fl.id)}
                          className={`py-1.5 rounded text-[9px] font-bold border whitespace-nowrap ${
                            gameState.cameraFilter === fl.id
                              ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {fl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                      Graphics Quality & Stadium Show
                    </div>
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {(
                        [
                          { id: 'LOW', label: 'LOW' },
                          { id: 'MEDIUM', label: 'MED' },
                          { id: 'HIGH', label: 'HIGH' },
                          { id: 'ULTRA_PS6', label: 'ULTRA' },
                        ] as { id: GraphicsQualityPreset; label: string }[]
                      ).map((q) => (
                        <button
                          key={q.id}
                          onClick={() => engineRef.current?.setGraphicsQuality(q.id)}
                          className={`py-1.5 rounded text-[9px] font-bold border whitespace-nowrap ${
                            gameState.graphicsQuality === q.id
                              ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'LIVE_MATCH', label: 'LIVE MATCH' },
                          { id: 'OPENING_CEREMONY', label: 'CEREMONY' },
                          { id: 'INTERMISSION', label: 'INTERMISSION' },
                        ] as { id: CeremonyPhase; label: string }[]
                      ).map((ph) => (
                        <button
                          key={ph.id}
                          onClick={() => engineRef.current?.setCeremonyPhase(ph.id, 20)}
                          className={`py-1.5 rounded text-[9px] font-bold border whitespace-nowrap ${
                            gameState.ceremonyPhase === ph.id
                              ? 'bg-emerald-400 text-[#090612] border-emerald-200'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {ph.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    Arena Atmosphere
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {(['NIGHT', 'SUNNY', 'SUNSET', 'BEACH', 'CYBER'] as EnvironmentTheme[]).map(
                      (w) => (
                        <button
                          key={w}
                          onClick={() => engineRef.current?.setWeather(w)}
                          className={`py-2 rounded-lg text-[10px] font-bold border whitespace-nowrap ${
                            gameState.weather === w
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {w}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    Court Surface
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'OLYMPIC_BLUE', label: 'Olympic Blue' },
                        { id: 'HARDWOOD', label: 'Championship Maple' },
                        { id: 'SAND', label: 'Beach Sand' },
                        { id: 'CYBER', label: 'Bio-Dark Court' },
                      ] as { id: CourtSurface; label: string }[]
                    ).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => engineRef.current?.setCourtSurface(s.id)}
                        className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-left ${
                          gameState.courtSurface === s.id
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                      Match Speed
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[0.5, 1.0, 1.5].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => engineRef.current?.setGameSpeed(spd)}
                          className={`py-1.5 rounded-lg font-mono text-[11px] font-bold border ${
                            gameState.gameSpeed === spd
                              ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                      Difficulty
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['ROOKIE', 'INTERMEDIATE', 'PRO', 'LEGEND'] as DifficultyLevel[]).map(
                        (lvl) => (
                          <button
                            key={lvl}
                            onClick={() => engineRef.current?.setDifficulty(lvl)}
                            className={`py-1 rounded-md text-[9px] font-bold border ${
                              gameState.difficulty === lvl
                                ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                                : 'bg-slate-900 text-slate-300 border-white/10'
                            }`}
                          >
                            {lvl}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>HORIZON FOG DEPTH</span>
                      <span>{(gameState.fogDensity * 1000).toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.001"
                      max="0.015"
                      step="0.001"
                      value={gameState.fogDensity}
                      onChange={(e) =>
                        engineRef.current?.setFogDensity(Number(e.target.value))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>ARENA LIGHTING</span>
                      <span>{Math.round(gameState.lightingIntensity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={gameState.lightingIntensity}
                      onChange={(e) =>
                        engineRef.current?.setLightingIntensity(Number(e.target.value))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ==================== TAB 2: TACTICS ==================== */}
            {drawerTab === 'TACTICS' && (
              <>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    Cyan Offensive Strategy (Affects Setter Read & Routes)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'BALANCED', label: 'Smart Setter Decoy' },
                        { id: 'FAST_QUICK', label: '1-Tempo Middle Quick' },
                        { id: 'HIGH_OUTSIDE', label: 'High Pin Arch' },
                        { id: 'PIPE_HEAVY', label: 'Back-Row Pipe' },
                        { id: 'ALL_OUT_SPIKE', label: 'All-Out Aggro' },
                      ] as { id: TacticalPlay; label: string }[]
                    ).map((play) => (
                      <button
                        key={play.id}
                        onClick={() => engineRef.current?.setTacticalPlay('A', play.id)}
                        className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-left ${
                          gameState.tacticalPlayA === play.id
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {play.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    Defensive Perimeter Formation
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'ZONAL_PERIMETER', label: 'Zonal Perimeter' },
                        { id: 'COMMIT_BLOCK', label: 'Commit Double Block' },
                        { id: 'WING_PINCH', label: 'Wing Pinch' },
                        { id: 'ROTATIONAL_DEEP', label: 'Rotational Deep' },
                      ] as { id: DefensiveStrategy; label: string }[]
                    ).map((def) => (
                      <button
                        key={def.id}
                        onClick={() => engineRef.current?.setDefensiveStrategy('A', def.id)}
                        className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border text-left ${
                          gameState.defensiveStrategyA === def.id
                            ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                            : 'bg-slate-900 text-slate-300 border-white/10'
                        }`}
                      >
                        {def.label}
                      </button>
                    ))}
                  </div>
                </div>

                {gameState.orchestrator && (
                  <div className="bg-[#140b26] border border-[#00f0ff]/35 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-[#00f0ff] font-extrabold uppercase">
                        MOVEMENT ORCHESTRATOR ({gameState.orchestrator.totalSpecsCount} SPRITE SPECS)
                      </span>
                      <span className="text-emerald-300 font-bold tabular-nums">
                        FLOOR {gameState.orchestrator.floorContactAccuracyPct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 font-mono text-[9px] tabular-nums">
                      <div className="bg-black/45 rounded-lg px-2 py-1">
                        <div className="text-slate-400">CYAN PASS MATRIX</div>
                        <div className="text-[#00f0ff] font-bold">
                          {gameState.orchestrator.teamAvgPassQualityA}% AVG
                        </div>
                      </div>
                      <div className="bg-black/45 rounded-lg px-2 py-1">
                        <div className="text-slate-400">VICE PASS MATRIX</div>
                        <div className="text-[#ff3d7f] font-bold">
                          {gameState.orchestrator.teamAvgPassQualityB}% AVG
                        </div>
                      </div>
                      <div className="bg-black/45 rounded-lg px-2 py-1">
                        <div className="text-slate-400">CELEBRATION</div>
                        <div className="text-[#ffb347] font-bold truncate">
                          {gameState.orchestrator.lastCelebrationFormation}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-2">
                    Cyan Rotation, Behavior Patterns &amp; Legs-to-Floor
                  </div>
                  <div className="space-y-1.5">
                    {cyanUnits.map((u) => {
                      const rec = gameState.orchestrator?.records.find((r) => r.unitId === u.id);
                      return (
                        <div
                          key={u.id}
                          className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 space-y-1 font-mono text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold">
                                Z{u.rotationZone}
                              </span>
                              <span className="text-white font-bold truncate">
                                #{u.jerseyNumber} {u.name}
                              </span>
                              <span className="text-slate-400 text-[10px]">{u.role}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-sky-300 text-[10px]">
                                {Math.round(u.sweatLevel * 100)}%S
                              </span>
                              <span className="text-cyan-300 font-bold">
                                {u.digitalSkin?.interceptReadiness ?? 90}%
                              </span>
                            </div>
                          </div>
                          {rec && (
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[9px] text-slate-400 border-t border-white/5 pt-1 tabular-nums">
                              <span className="text-[#ffb347] truncate">
                                {rec.movementPattern.replace(/_/g, ' ')} ·{' '}
                                {rec.passingPattern.replace(/_/g, ' ')}
                              </span>
                              <span className="text-emerald-300 shrink-0">
                                [{rec.spriteCol},{rec.spriteRow}] {rec.spriteSpecLabel} ·{' '}
                                PASS {rec.passingAvgQuality}% · FOOT {rec.legsToFloor.plantedFoot} (
                                {rec.legsToFloor.hipHeightM.toFixed(2)}m)
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ==================== TAB 3: SYNTHETIC STORYLINE EVOLUTION + DJ & COACH ==================== */}
            {drawerTab === 'STORY' && (
              <>
                {/* Main Hero Synthetic Storyline Evolution Card */}
                <div className="bg-[#140b26] border border-[#ff6b1a]/50 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-[10px] text-[#ff6b1a] font-extrabold uppercase">
                        {storyEvo.actTitle}
                      </div>
                      <div className="text-sm font-extrabold text-white">
                        #{storyEvo.heroJersey} {storyEvo.heroName}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-[#ff6b1a] text-[#090612] font-mono text-[9px] font-black uppercase">
                      {storyEvo.heroMood.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="font-mono text-[9px] text-[#ffb347]">
                    {storyEvo.heroGearLabel}
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">{storyEvo.activeLine}</p>

                  {/* Act Evolution XP Meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[9px] text-slate-400 tabular-nums">
                      <span>STORYLINE EVOLUTION XP</span>
                      <span className="text-[#00f0ff] font-bold">
                        {storyEvo.evolutionXp} / {storyEvo.nextActXp}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#ff6b1a]"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((storyEvo.evolutionXp / Math.max(1, storyEvo.nextActXp)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {storyEvo.milestonesUnlocked.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {storyEvo.milestonesUnlocked.map((ms) => (
                        <span
                          key={ms}
                          className="px-2 py-0.5 rounded bg-black/50 border border-[#00f0ff]/35 font-mono text-[9px] text-[#00f0ff]"
                        >
                          {ms}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Evolving Story Beats Feed */}
                <div className="bg-[#0e091c] border border-white/10 rounded-xl p-3 space-y-2">
                  <div className="text-[10px] font-mono text-[#ffb347] uppercase font-bold">
                    Live Match Storyline Beats
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {storyEvo.recentBeats.map((b) => (
                      <div key={b.id} className="bg-black/45 border border-white/10 rounded-lg p-2 space-y-0.5">
                        <div className="flex items-center justify-between font-mono text-[9px]">
                          <span className="text-[#ff6b1a] font-bold">{b.headline}</span>
                          <span className="text-slate-500">{b.timestamp}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 leading-snug">{b.narrative}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arena DJ & Music Reactivity */}
                <div className="bg-[#140b26] border border-[#00f0ff]/35 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-[#ff6b1a]" />
                        <span>Stadium Music &amp; Skyline EQ</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {eq?.trackName || 'Arena Anthem Ready'}
                      </div>
                    </div>
                    <button
                      onClick={() => mp3InputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-[#ffb347] text-[#090612] font-bold text-[10px] flex items-center gap-1 shrink-0 whitespace-nowrap"
                    >
                      <Upload className="w-3 h-3" />
                      <span>MP3</span>
                    </button>
                  </div>

                  {eq?.trackName && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => engineRef.current?.toggleMp3Playback()}
                          className="px-3 py-1 rounded-lg bg-[#00f0ff] text-[#090612] font-bold text-[10px] flex items-center gap-1 shrink-0"
                        >
                          {eq.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{eq.isPlaying ? 'PAUSE' : 'PLAY'}</span>
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={eq.volume}
                          onChange={(e) =>
                            engineRef.current?.setMp3Volume(Number(e.target.value))
                          }
                          className="flex-1 accent-[#ff6b1a]"
                        />
                        <span className="font-mono text-[10px] text-slate-300 tabular-nums w-8 text-right">
                          {Math.round(eq.volume * 100)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] tabular-nums">
                        <div className="bg-black/50 rounded px-2 py-1 flex justify-between">
                          <span className="text-[#00f0ff]">BASS</span>
                          <span>{Math.round(eq.bassLevel * 100)}%</span>
                        </div>
                        <div className="bg-black/50 rounded px-2 py-1 flex justify-between">
                          <span className="text-[#ff6b1a]">MID</span>
                          <span>{Math.round(eq.midLevel * 100)}%</span>
                        </div>
                        <div className="bg-black/50 rounded px-2 py-1 flex justify-between">
                          <span className="text-[#ff3d7f]">HIGH</span>
                          <span>{Math.round(eq.highLevel * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Streamlined Coach Directive */}
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1.5">
                    Coach Play Call
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={coachPromptInput}
                      onChange={(e) => setCoachPromptInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendCoachDirective(coachPromptInput);
                      }}
                      placeholder="e.g. Feed #14 pipe attack"
                      className="flex-1 bg-slate-900 border border-white/15 rounded-lg px-2.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00f0ff]"
                    />
                    <button
                      disabled={isPromptingCoach || !coachPromptInput.trim()}
                      onClick={() => handleSendCoachDirective(coachPromptInput)}
                      className="px-3 rounded-lg bg-[#00f0ff] disabled:opacity-40 text-[#090612] font-bold text-xs flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>GO</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      )}
      </div>

      {/* Interactive Google Maps & Print Area Studio Modal (remains outside .no-print) */}
      <VancouverMapPrintModal isOpen={mapModalOpen} onClose={() => setMapModalOpen(false)} />
    </div>
  );
}
