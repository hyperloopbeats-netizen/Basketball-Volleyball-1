import React, { useRef, useState } from 'react';
import {
  Activity,
  Camera,
  Crosshair,
  Film,
  Flame,
  Gamepad2,
  MapPin,
  Music,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Target,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import { BasketballEngine } from './BasketballEngine';
import {
  BasketCameraPreset,
  BasketGameState,
  BasketMatchFormat,
  BasketPlayCall,
  CourtFlowState,
} from './basketballTypes';
import {
  CameraFilterMode,
  CameraLensPreset,
  CourtSurface,
  EnvironmentTheme,
  IntroMusicPresetId,
} from '../types';
import { cometicOSKernel } from '../os/CometicOSKernel';

interface BasketballHUDProps {
  engine: BasketballEngine | null;
  state: BasketGameState;
  onOpenMap: () => void;
  mp3InputRef: React.RefObject<HTMLInputElement | null>;
}

const PLAY_OPTIONS: { id: BasketPlayCall; label: string }[] = [
  { id: 'PICK_AND_ROLL', label: 'P&R' },
  { id: 'FIVE_OUT_3PT', label: '5-OUT' },
  { id: 'ISO_SLASH', label: 'ISO' },
  { id: 'GIVE_AND_GO', label: 'CUT' },
  { id: 'FAST_BREAK', label: 'RUN' },
];

const SUNO_PRESETS: { id: IntroMusicPresetId; label: string; bpm: string }[] = [
  { id: 'HARBOUR_PULSE', label: 'HARBOUR PULSE', bpm: '118 BPM' },
  { id: 'PACIFIC_THUNDER', label: 'PACIFIC THUNDER', bpm: '128 BPM' },
  { id: 'NEON_GROOVE', label: 'NEON GROOVE', bpm: '106 BPM' },
  { id: 'SILENT', label: 'MUTE AUDIO', bpm: 'OFF' },
];

const CAMERA_LENSES: { id: CameraLensPreset; label: string }[] = [
  { id: '24MM_WIDE', label: '24MM' },
  { id: '35MM_CINE', label: '35MM' },
  { id: '50MM_STD', label: '50MM' },
  { id: '85MM_TELE', label: '85MM' },
  { id: '135MM_SNIPER', label: '135MM' },
];

const CAMERA_FILTERS: { id: CameraFilterMode; label: string }[] = [
  { id: 'VICE_NEON', label: 'VICE NEON' },
  { id: 'BROADCAST_STD', label: 'BROADCAST' },
  { id: 'CRISP_HDR', label: 'CRISP HDR' },
  { id: 'GOLDEN_HOUR', label: 'GOLDEN HR' },
  { id: 'CINEMA_NOIR', label: 'NOIR' },
  { id: 'VINTAGE_VHS', label: 'VHS' },
];

const CAMERA_ANGLES: { id: BasketCameraPreset; label: string }[] = [
  { id: 'BROADCAST', label: 'BROADCAST' },
  { id: 'ACTION', label: 'ACTION' },
  { id: 'CINEMATIC_FLOW', label: 'CINE FLOW' },
  { id: 'PLAYER_CAM', label: 'PLAYER CAM' },
  { id: 'BASELINE_LOW', label: 'BASELINE LOW' },
  { id: 'COURT_BEHIND', label: 'BEHIND' },
  { id: 'SKY_CAM', label: 'SKY CAM' },
  { id: 'ISOMETRIC', label: 'ISO 3D' },
];

const FLOW_BADGE_STYLES: Record<CourtFlowState, string> = {
  HALFCOURT_SET: 'bg-slate-800/90 text-slate-200 border-white/15',
  TRANSITION_PUSH: 'bg-[#00f0ff]/20 text-[#00f0ff] border-[#00f0ff]/50',
  ISOLATION_LOCK: 'bg-purple-500/25 text-purple-200 border-purple-400/55',
  ON_FIRE_ZONE: 'bg-[#ff6b1a]/25 text-[#ffb347] border-[#ff6b1a]/70',
  CLUTCH_TIME: 'bg-[#ff3d7f]/25 text-[#ff6b9d] border-[#ff3d7f]/70',
};

export const BasketballHUD: React.FC<BasketballHUDProps> = ({
  engine,
  state,
  onOpenMap,
  mp3InputRef,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sunoOpen, setSunoOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<BasketMatchFormat>(state.matchFormat || 'QUICK_21');
  const dragActiveRef = useRef(false);
  const dragOriginYRef = useRef(0);

  const isOffenseA = state.possessionTeam === 'A';
  const sm = state.slideMeter;
  const sweetStart = Math.round(sm.sweetSpotStart * 100);
  const sweetWidth = Math.max(8, Math.round((sm.sweetSpotEnd - sm.sweetSpotStart) * 100));
  const sliderPct = Math.round(sm.sliderValue * 100);
  const liquidPct = Math.round(sm.liquidLevel * 100);
  const inSweetSpot = sm.sliderValue >= sm.sweetSpotStart && sm.sliderValue <= sm.sweetSpotEnd;
  const eqVolPct = Math.round((state.introBillboardEQ.volume ?? 0.85) * 100);
  const eq = state.introBillboardEQ;

  // Dynamic liquid meniscus SVG wave coordinates in 0..100 space
  const liquidTopY = Math.max(4, Math.min(96, 100 - sm.liquidLevel * 100));
  const amp = Math.min(7.5, 2.2 + Math.abs(sm.liquidVelocity) * 1.4);
  const wSin = Math.sin(sm.wavePhase) * amp;
  const wCos = Math.cos(sm.wavePhase * 1.15) * (amp * 0.8);
  const frontWavePath = `M 0 ${liquidTopY.toFixed(1)} Q 25 ${(liquidTopY - wSin).toFixed(1)} 50 ${liquidTopY.toFixed(1)} T 100 ${liquidTopY.toFixed(1)} L 100 100 L 0 100 Z`;
  const backWavePath = `M 0 ${(liquidTopY + 1.5).toFixed(1)} Q 25 ${(liquidTopY + 1.5 + wCos).toFixed(1)} 50 ${(liquidTopY + 1.5).toFixed(1)} T 100 ${(liquidTopY + 1.5).toFixed(1)} L 100 100 L 0 100 Z`;

  // =========================================================================
  // VOLLEYBALL-MATCHED INTRO & BILLBOARD MP3 PLAYER MODE
  // =========================================================================
  if (state.screenMode === 'MAIN_MENU') {
    const intro = state.introCutscene;
    const isOrbitOrLook =
      intro.phase === 'ORBIT_STADIUM' || intro.phase === 'HERO_LOOK_UP';
    const isBallSwoosh = intro.phase === 'BALL_SWOOSH_TO_FEET';

    if (isOrbitOrLook || isBallSwoosh) {
      return (
        <div className="absolute inset-x-0 top-9 bottom-0 z-30 pointer-events-none flex flex-col justify-between">
          <div className="bg-[#090612] border-b border-white/10 px-4 py-2 flex items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-vice text-lg tracking-wider whitespace-nowrap">
                <span className="text-[#00f0ff]">AIM</span>{' '}
                <span className="text-[#ff6b1a]">VANCOUVER 3X3</span>
              </span>
              <span className="hidden sm:inline font-mono text-[10px] text-[#ffb347] uppercase truncate border-l border-white/15 pl-2.5">
                COAL HARBOUR STADIUM · HOOPS EDITION
              </span>
            </div>
            <button
              onClick={() =>
                isBallSwoosh
                  ? engine?.startNewMatch(selectedFormat)
                  : engine?.cutToBillboardFocus()
              }
              className="px-3 py-1 rounded-lg bg-[#140b26] border border-white/20 text-slate-200 hover:border-[#00f0ff] font-mono text-[10px] font-bold uppercase whitespace-nowrap cursor-pointer"
            >
              {isBallSwoosh ? 'SKIP TO TIP-OFF' : 'SKIP TO MUSIC'}
            </button>
          </div>

          <div />

          <div className="bg-[#090612] border-t border-[#ff6b1a]/40 px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] sm:text-xs text-slate-200 truncate">
              {intro.subBannerText}
            </div>
            <div className="font-mono text-[10px] text-[#ff6b1a] font-bold tabular-nums whitespace-nowrap">
              {isBallSwoosh ? 'TIP-OFF' : '#14 AIM'}
            </div>
          </div>
        </div>
      );
    }

    // BILLBOARD_FULLSCREEN: Camera centered cleanly on 3D AIM VANCOUVER + 32-Band Music EQ Billboard
    return (
      <div className="absolute inset-x-0 top-9 bottom-0 z-30 pointer-events-none flex flex-col justify-between">
        {/* Slim Single-Line Top Bar */}
        <header className="bg-[#090612]/92 border-b border-white/10 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2 pointer-events-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="font-vice text-lg sm:text-xl tracking-wider leading-none whitespace-nowrap">
              <span className="text-[#00f0ff]">AIM</span>{' '}
              <span className="text-[#ff6b1a]">VANCOUVER 3X3</span>
            </h1>
            <span className="hidden sm:inline font-mono text-[10px] text-[#ffb347] border-l border-white/15 pl-2.5 truncate">
              #14 ISHIKAWA · SUNO EQ BILLBOARD & COAL HARBOUR ARENA
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenMap}
              className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-mono text-[10px] font-bold uppercase flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <MapPin className="w-3 h-3" />
              <span>AREA MAP</span>
            </button>
            <button
              onClick={() => engine?.replayIntroCutscene()}
              className="px-2.5 py-1 rounded-lg bg-[#140b26] border border-white/15 text-slate-200 hover:border-[#00f0ff] font-mono text-[10px] font-bold uppercase flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>INTRO</span>
            </button>
          </div>
        </header>

        <div className="flex-1" />

        {/* Condensed Bottom Billboard MP3 Player & 3v3 Launch Dock */}
        <div className="bg-[#090612]/94 border-t border-[#ff6b1a]/45 px-3 sm:px-5 py-2 pointer-events-auto">
          <div className="max-w-4xl mx-auto space-y-1.5">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-300 truncate">
              <span className="truncate">
                <span className="text-[#ff6b1a] font-bold">BILLBOARD EQ:</span>{' '}
                {eq.trackName
                  ? `${eq.trackName.replace('AIM VANCOUVER · ', '')} · BASS ${Math.round(eq.bassLevel * 100)}%`
                  : 'SELECT A STADIUM ANTHEM OR UPLOAD MP3 FOR 32-BAND VISUALIZER'}
              </span>
              <span className="hidden md:inline text-[#00f0ff] shrink-0">
                30-BOX OPTICAL CONTACT ENGINE READY
              </span>
            </div>

            {/* Music Selector Row */}
            <div className="flex flex-wrap items-center gap-1">
              <Music className="w-3.5 h-3.5 text-[#ff6b1a] mr-1 shrink-0" />
              {(
                [
                  { id: 'HARBOUR_PULSE', label: 'HARBOUR' },
                  { id: 'PACIFIC_THUNDER', label: 'THUNDER' },
                  { id: 'NEON_GROOVE', label: 'GROOVE' },
                  { id: 'SILENT', label: 'MUTE' },
                ] as { id: IntroMusicPresetId; label: string }[]
              ).map((trk) => {
                const active = intro.selectedPreset === trk.id && (trk.id === 'SILENT' || Boolean(eq.trackName));
                return (
                  <button
                    key={trk.id}
                    onClick={() => engine?.selectIntroMusicPreset(trk.id)}
                    className={`h-7 px-2.5 rounded-lg font-mono text-[9px] font-extrabold uppercase border whitespace-nowrap cursor-pointer ${
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
                className={`h-7 px-2.5 rounded-lg font-mono text-[9px] font-extrabold uppercase border flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                  intro.selectedPreset === 'CUSTOM_MP3'
                    ? 'bg-[#ff6b1a] text-[#090612] border-[#ff6b1a]'
                    : 'bg-[#160d2c] text-[#ffb347] border-[#ffb347]/40'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>{intro.selectedPreset === 'CUSTOM_MP3' ? 'MP3 READY' : 'UPLOAD MP3'}</span>
              </button>

              {eq.trackName && (
                <button
                  aria-label={eq.isPlaying ? 'Pause music' : 'Play music'}
                  onClick={() => engine?.toggleMp3Playback()}
                  className="h-7 px-2 rounded-lg bg-[#140b26] border border-white/20 text-white font-mono text-[9px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  {eq.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}

              <div className="hidden sm:flex items-center gap-1.5 ml-auto font-mono text-[9px] text-slate-300">
                <Volume2 className="w-3 h-3 text-[#00f0ff]" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={eqVolPct}
                  onChange={(e) => engine?.setMusicVolume(Number(e.target.value) / 100)}
                  className="w-20 accent-[#ffb347] cursor-pointer"
                  aria-label="Master Volume"
                />
                <span className="tabular-nums w-7 text-right">{eqVolPct}%</span>
              </div>
            </div>

            {/* Format Selector + Hero PLAY 3V3 */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'QUICK_21', label: 'QUICK TO 21' },
                    { id: 'PRO_STREET', label: 'WIN BY 2' },
                    { id: 'PRACTICE', label: 'SHOOTAROUND' },
                    { id: 'AI_SHOWCASE', label: 'AI 3V3' },
                  ] as { id: BasketMatchFormat; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFormat(f.id)}
                    className={`h-8 px-2.5 rounded-lg text-[9px] font-extrabold uppercase border whitespace-nowrap cursor-pointer ${
                      selectedFormat === f.id
                        ? 'bg-[#ff6b1a] text-[#090612] border-[#ff6b1a]'
                        : 'bg-[#140b26] text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => engine?.launchFromIntroWithBallSwoosh(selectedFormat)}
                className="h-9 px-5 rounded-xl bg-[#00f0ff] hover:bg-[#3bf4ff] text-[#090612] font-black text-xs sm:text-sm tracking-wider uppercase flex items-center gap-1.5 whitespace-nowrap shadow-lg transition-transform duration-150 active:scale-[0.97] cursor-pointer ml-auto"
              >
                <Play className="w-4 h-4 fill-[#090612]" />
                <span>PLAY 3V3</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* TOP SCOREBOARD & LIVE BROADCAST TICKER (positioned cleanly below 36px OS bar) */}
      <div className="absolute top-10 inset-x-0 z-20 px-2.5 sm:px-3 pointer-events-none flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1.5">
          {/* Left: 3v3 Scoreboard + 12s Shot Clock */}
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-[#090612]/92 border border-[#00f0ff]/45 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-xl">
            <div className="flex items-center gap-1 sm:gap-1.5 font-mono tabular-nums">
              <span className="text-[10px] font-black text-[#00f0ff]">CY</span>
              <span className="text-base sm:text-lg font-black text-white leading-none">{state.scoreA}</span>
              <span className="text-slate-500 font-bold">-</span>
              <span className="text-base sm:text-lg font-black text-white leading-none">{state.scoreB}</span>
              <span className="text-[10px] font-black text-[#ff3d7f]">VC</span>
            </div>

            <div className="h-4 sm:h-5 w-px bg-white/15" />

            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] sm:text-xs font-black ${
                  state.shotClock <= 3.5
                    ? 'bg-[#ff3d7f] text-white'
                    : 'bg-[#ffb347] text-[#090612]'
                }`}
              >
                {state.shotClock.toFixed(1)}s
              </span>
              <span className="text-[10px] font-bold text-slate-300 hidden md:inline">
                TO {state.targetScore}
              </span>
            </div>

            {!state.arcCleared && (
              <span className="px-1.5 py-0.5 rounded bg-amber-400 text-[#090612] font-mono text-[9px] sm:text-[10px] font-black uppercase whitespace-nowrap">
                CLR ARC
              </span>
            )}

            <div className="h-4 sm:h-5 w-px bg-white/15 hidden sm:block" />

            <span
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[9px] font-black uppercase whitespace-nowrap tabular-nums ${
                FLOW_BADGE_STYLES[state.flowTelemetry.flowState]
              }`}
              title={state.flowTelemetry.tempoLabel}
            >
              <Flame className="w-3 h-3" />
              <span>{state.flowTelemetry.flowState.replace(/_/g, ' ')}</span>
              <span>{state.flowTelemetry.flowMeter}%</span>
            </span>
          </div>

          {/* Center: Live Studio Playcaller Banner */}
          <div className="hidden lg:flex items-center gap-2 bg-[#090612]/90 border border-white/15 rounded-xl px-3 py-1.5 max-w-md truncate">
            <Sparkles className="w-3.5 h-3.5 text-[#00f0ff] shrink-0" />
            <span className="font-mono text-[10px] text-cyan-200 truncate">
              {state.lastShotSummary}
            </span>
          </div>

          {/* Right: Quick Arena Actions */}
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
            {state.savedHighlightsCount > 0 && !state.replayState.active && (
              <button
                onClick={() => engine?.startReplayShowcase(0)}
                className="h-8 px-2 sm:px-2.5 rounded-xl bg-[#090612]/92 border border-[#ff3d7f]/60 text-[#ff3d7f] hover:bg-[#ff3d7f] hover:text-white font-mono text-[10px] font-black flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Film className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">REPLAYS ({state.savedHighlightsCount})</span>
              </button>
            )}

            <button
              onClick={() => engine?.toggleOneTapControl()}
              title="Toggle One-Tap Context Controls (Tap Hoop Shoot, Tap Teammate Pass, 2x Tap Ankle Breaker)"
              className={`h-8 px-2 sm:px-2.5 rounded-xl font-mono text-[10px] font-black flex items-center gap-1 border cursor-pointer whitespace-nowrap ${
                state.oneTapControlEnabled
                  ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                  : 'bg-[#090612]/92 border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612]'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {state.oneTapControlEnabled ? '1-TAP ON' : '1-TAP OFF'}
              </span>
            </button>

            <button
              onClick={() => engine?.toggleOpticalOverlay()}
              title="Toggle Real-Time 30-Box Optical Contact Wireframes"
              className={`h-8 px-2 sm:px-2.5 rounded-xl font-mono text-[10px] font-black flex items-center gap-1 border cursor-pointer whitespace-nowrap ${
                state.opticalContact.overlayEnabled
                  ? 'bg-emerald-400 text-[#090612] border-emerald-400'
                  : 'bg-[#090612]/92 border-emerald-400/45 text-emerald-300 hover:bg-emerald-400 hover:text-[#090612]'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden md:inline">OPTICAL</span>
            </button>

            <button
              onClick={() => engine?.focusGoalieCameraAndKick()}
              title="Focus Coal Harbour Soccer Keeper & Fire Penalty Shot"
              className="h-8 px-2 sm:px-2.5 rounded-xl bg-[#090612]/92 border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-mono text-[10px] font-black flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Target className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                PK {state.soccerGoalie.saves}/{state.soccerGoalie.shotsFaced}
              </span>
            </button>

            <button
              onClick={() => engine?.setControlMode(state.controlMode === 'PLAYER' ? 'AUTO' : 'PLAYER')}
              className={`h-8 px-2 sm:px-2.5 rounded-xl font-mono text-[10px] font-black flex items-center gap-1 border cursor-pointer whitespace-nowrap ${
                state.controlMode === 'PLAYER'
                  ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                  : 'bg-[#090612]/92 text-[#ffb347] border-[#ffb347]/50'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>{state.controlMode === 'PLAYER' ? 'PLAY' : 'AI'}</span>
            </button>

            <button
              aria-label="Suno Studio Sound System"
              onClick={() => {
                setSunoOpen((v) => !v);
                setSettingsOpen(false);
                if (!state.introBillboardEQ.isPlaying && state.introSelectedPreset !== 'SILENT') {
                  engine?.selectMusicPreset(
                    state.introSelectedPreset === 'CUSTOM_MP3' ? 'HARBOUR_PULSE' : state.introSelectedPreset
                  );
                }
              }}
              className={`h-8 px-2 sm:px-2.5 rounded-xl font-mono text-[10px] font-black flex items-center gap-1 border cursor-pointer whitespace-nowrap ${
                state.introBillboardEQ.isPlaying
                  ? 'bg-[#ffb347] text-[#090612] border-[#ffb347]'
                  : 'bg-[#090612]/92 border-[#ffb347]/45 text-[#ffb347] hover:bg-[#ffb347] hover:text-[#090612]'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {state.introBillboardEQ.isPlaying ? 'SUNO EQ' : 'AUDIO'}
              </span>
            </button>

            <button
              aria-label="Vancouver Arena Map"
              onClick={onOpenMap}
              className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-xl bg-[#090612]/92 border border-[#00f0ff]/45 text-[#00f0ff] hover:bg-[#00f0ff] hover:text-[#090612] font-mono text-[10px] font-black flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MAP</span>
            </button>

            <button
              aria-label="Basketball Arena Settings"
              onClick={() => {
                setSettingsOpen((v) => !v);
                setSunoOpen(false);
              }}
              className="h-8 w-8 rounded-xl bg-[#090612]/92 border border-white/20 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TELEMETRY & CONTINUOUS BALL PHYSICS EVENT CHAIN STRIP (compact desktop bar) */}
        <div className="hidden sm:flex justify-center">
          <div className="bg-[#090612]/90 border border-white/10 rounded-lg px-3 py-0.5 font-mono text-[10px] text-slate-300 flex items-center gap-2 max-w-6xl truncate tabular-nums">
            <span className="text-emerald-300 font-bold truncate max-w-[160px]">
              {state.opticalContact.hoveredTargetLabel
                ? `HOVER ${state.opticalContact.hoveredTargetLabel} [${state.opticalContact.hoveredZone}]`
                : state.opticalContact.lastContactLabel}
            </span>
            <span className="text-white/20">|</span>
            <span className="text-[#ff6b1a] shrink-0 font-bold">
              STL {state.stealTelemetry.stealCountA}-{state.stealTelemetry.stealCountB} · {state.lastPassStyle.replace(/_/g, ' ')}
            </span>
            <span className="text-white/20">|</span>
            <span className="text-[#00f0ff] shrink-0">
              {state.bouncePhysics.ballSpinRpm} RPM · e={state.bouncePhysics.lastNormalE.toFixed(2)} · APEX {state.bouncePhysics.flightApexM.toFixed(1)}M
            </span>
            <span className="text-white/20">|</span>
            <span className="text-[#ffb347] truncate max-w-[220px]" title={state.bouncePhysics.continuousChainSummary}>
              CHAIN: {state.bouncePhysics.continuousChainSummary}
            </span>
          </div>
        </div>
      </div>

      {/* SUNO STUDIO SOUND SYSTEM POPOVER */}
      {sunoOpen && (
        <div className="fixed top-20 right-3 z-40 w-80 bg-[#090612]/96 border border-[#ffb347]/55 rounded-2xl p-4 shadow-2xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-white/15 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-[#ffb347]">
              <Music className="w-4 h-4" />
              <span>SUNO STUDIO SOUND</span>
            </div>
            <button
              onClick={() => setSunoOpen(false)}
              className="px-2 py-0.5 rounded bg-white/10 text-slate-300 hover:text-white cursor-pointer"
            >
              CLOSE
            </button>
          </div>

          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">NOW SPINNING</div>
              <div className="text-[11px] font-bold text-[#00f0ff] truncate">
                {state.introBillboardEQ.trackName || 'MUTED'}
              </div>
            </div>
            <button
              onClick={() => engine?.toggleMp3Playback()}
              className="h-8 w-8 shrink-0 rounded-lg bg-[#ffb347] text-[#090612] flex items-center justify-center cursor-pointer"
              aria-label="Play or pause stadium music"
            >
              {state.introBillboardEQ.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">STADIUM ANTHEM PRESETS</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SUNO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => engine?.selectMusicPreset(preset.id)}
                  className={`py-1.5 px-2 rounded-lg text-left border cursor-pointer ${
                    state.introSelectedPreset === preset.id
                      ? 'bg-[#ffb347] text-[#090612] border-[#ffb347]'
                      : 'bg-slate-900 text-slate-200 border-white/15 hover:border-[#ffb347]/50'
                  }`}
                >
                  <div className="text-[10px] font-black leading-tight">{preset.label}</div>
                  <div className="text-[9px] opacity-75">{preset.bpm}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-300">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span>ARENA MASTER MIX</span>
              </span>
              <span className="font-bold tabular-nums text-[#00f0ff]">{eqVolPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={eqVolPct}
              onChange={(e) => engine?.setMusicVolume(Number(e.target.value) / 100)}
              className="w-full accent-[#ffb347] cursor-pointer"
            />
          </div>

          <button
            onClick={() => mp3InputRef.current?.click()}
            className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-[#00f0ff]/45 text-[#00f0ff] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>UPLOAD CUSTOM MP3 TO BILLBOARD EQ</span>
          </button>
        </div>
      )}

      {/* IRREGULAR CELEBRATION CUTSCENE BROADCAST BANNER */}
      {state.celebrationCutscene.active && (
        <div className="absolute inset-x-0 bottom-20 z-25 pointer-events-none flex justify-center px-3">
          <div
            className={`pointer-events-auto bg-[#090612]/95 rounded-2xl px-4 py-2.5 shadow-2xl border-2 flex items-center gap-4 font-mono ${
              state.celebrationCutscene.team === 'A' ? 'border-[#00f0ff]' : 'border-[#ff3d7f]'
            }`}
          >
            <div>
              <div
                className={`text-[10px] font-black tracking-widest uppercase ${
                  state.celebrationCutscene.team === 'A' ? 'text-[#00f0ff]' : 'text-[#ff3d7f]'
                }`}
              >
                {state.celebrationCutscene.team === 'A' ? 'CYAN STORM SHOWTIME' : 'VICE CORAL SIGNATURE'}
              </div>
              <div className="font-vice text-2xl tracking-wider text-[#ffb347] leading-none mt-0.5">
                {state.celebrationCutscene.title}
              </div>
              <div className="text-[11px] font-bold text-slate-200 mt-0.5">
                #{state.celebrationCutscene.scorerJersey} {state.celebrationCutscene.scorerName}
              </div>
            </div>
            {state.celebrationCutscene.canSkip && (
              <button
                onClick={() => engine?.skipCelebrationCutscene()}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#00f0ff] hover:text-[#090612] border border-white/20 text-slate-100 text-[10px] font-black uppercase whitespace-nowrap cursor-pointer"
              >
                SKIP (TAP / SPACE)
              </button>
            )}
          </div>
        </div>
      )}

      {/* COMIC STRIKE SLOW-MO IMPACT CALLOUT */}
      {state.comicStrike.active && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
          <div
            className="bg-[#ffb347] text-[#090612] border-2 border-[#090612] shadow-[5px_5px_0px_#ff3d7f] px-4 py-2"
            style={{ transform: `rotate(${(state.comicStrike.dutchTiltDeg * 0.6).toFixed(1)}deg) skewX(-8deg)` }}
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Zap className="w-5 h-5 fill-[#090612]" />
              <span className="font-vice text-2xl tracking-wider uppercase leading-none">
                {state.comicStrike.calloutText}
              </span>
              <span className="font-mono text-xs font-black bg-[#090612] text-[#00f0ff] px-2 py-0.5 tabular-nums">
                {state.comicStrike.speedKmh} KM/H
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 font-mono text-[10px] font-black uppercase mt-1 border-t border-[#090612]/25 pt-0.5">
              <span>{state.comicStrike.subText}</span>
              <span className="text-[#9e0039]">SLOW-MO {state.comicStrike.timeScale.toFixed(2)}x</span>
            </div>
          </div>
        </div>
      )}

      {/* MATCH OVER OVERLAY */}
      {state.matchState === 'MATCH_OVER' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none px-4">
          <div className="pointer-events-auto bg-[#090612]/96 border border-[#00f0ff]/60 rounded-2xl p-5 max-w-sm w-full text-center space-y-3 shadow-2xl">
            <div className="font-vice text-3xl tracking-wider text-[#ffb347]">
              {state.scoreA > state.scoreB ? 'TEAM CYAN VICTORY' : 'TEAM CORAL VICTORY'}
            </div>
            <div className="font-mono text-xl font-black text-white tabular-nums">
              CY {state.scoreA} — {state.scoreB} VC
            </div>
            <div className="font-mono text-[11px] text-slate-300">{state.lastShotSummary}</div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => engine?.startNewMatch(state.matchFormat)}
                className="flex-1 py-2.5 rounded-xl bg-[#00f0ff] text-[#090612] font-mono text-xs font-black cursor-pointer"
              >
                REMATCH 3V3
              </button>
              <button
                onClick={() => engine?.cutToBillboardFocus()}
                className="py-2.5 px-3 rounded-xl bg-slate-900 border border-white/20 text-slate-200 font-mono text-xs font-bold cursor-pointer"
              >
                BILLBOARD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARENA QUICK SETTINGS & CAMERA / OPTICAL / GOALIE DRAWER */}
      {settingsOpen && (
        <div className="fixed top-20 right-3 z-40 w-80 bg-[#090612]/96 border border-[#00f0ff]/45 rounded-2xl p-4 shadow-2xl space-y-3 font-mono text-xs max-h-[78vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/15 pb-2">
            <span className="font-bold text-[#00f0ff]">3V3 ARENA, CAMERA & OPTICAL</span>
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-2 py-0.5 rounded bg-white/10 text-slate-300 hover:text-white cursor-pointer"
            >
              CLOSE
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">MATCH FORMAT</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'QUICK_21', label: 'QUICK TO 21' },
                  { id: 'PRO_STREET', label: 'WIN BY 2' },
                  { id: 'PRACTICE', label: 'SHOOTAROUND' },
                  { id: 'AI_SHOWCASE', label: 'AI SHOWCASE' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    engine?.startNewMatch(f.id);
                    setSettingsOpen(false);
                  }}
                  className={`py-1.5 px-2 rounded-lg font-bold text-[10px] border cursor-pointer ${
                    state.matchFormat === f.id
                      ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                      : 'bg-slate-900 text-slate-200 border-white/15'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* LIGHTS, CAMERA, ACTION: ANGLE + AI RE-ANGLE + LENS + FILTER */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold">CAMERA ANGLE</span>
              <button
                onClick={() => engine?.programAICameraAngle()}
                className="px-2 py-0.5 rounded bg-[#00f0ff]/20 border border-[#00f0ff]/50 text-[#00f0ff] text-[9px] font-black cursor-pointer"
              >
                AI RE-ANGLE
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {CAMERA_ANGLES.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => engine?.setCameraAngle(cam.id)}
                  className={`py-1.5 px-1 rounded-lg text-[9px] font-bold border cursor-pointer ${
                    state.cameraAngle === cam.id
                      ? 'bg-[#ffb347] text-[#090612] border-[#ffb347]'
                      : 'bg-slate-900 text-slate-300 border-white/15'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">OPTICAL LENS FOCAL LENGTH</div>
            <div className="grid grid-cols-5 gap-1">
              {CAMERA_LENSES.map((lens) => (
                <button
                  key={lens.id}
                  onClick={() => engine?.setCameraLens(lens.id)}
                  className={`py-1 rounded-lg text-[9px] font-bold border cursor-pointer ${
                    state.cameraLens === lens.id
                      ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                      : 'bg-slate-900 text-slate-300 border-white/15'
                  }`}
                >
                  {lens.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">COLOR GRADE FILTER</div>
            <div className="grid grid-cols-3 gap-1.5">
              {CAMERA_FILTERS.map((flt) => (
                <button
                  key={flt.id}
                  onClick={() => engine?.setCameraFilter(flt.id)}
                  className={`py-1 px-1.5 rounded-lg text-[9px] font-bold border cursor-pointer ${
                    state.cameraFilter === flt.id
                      ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                      : 'bg-slate-900 text-slate-300 border-white/15'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
          </div>

          {/* OPTICAL CONTACT & SOCCER GOALIE MODULE */}
          <div className="bg-slate-900/90 border border-emerald-400/30 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-emerald-300 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" />
                <span>OPTICAL & KEEPER BAY</span>
              </span>
              <span className="text-slate-400 tabular-nums">
                {state.opticalContact.activeHitboxCount} BOXES · PROX {state.opticalContact.proximityAlerts} ({state.opticalContact.closestMatchupMeters.toFixed(1)}M)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => engine?.toggleOpticalOverlay()}
                className={`py-1.5 px-1.5 rounded-lg text-[9px] font-bold border cursor-pointer ${
                  state.opticalContact.overlayEnabled
                    ? 'bg-emerald-400 text-[#090612] border-emerald-400'
                    : 'bg-[#090612] text-emerald-300 border-emerald-400/40'
                }`}
              >
                {state.opticalContact.overlayEnabled ? 'HIDE BOXES' : 'SHOW BOXES'}
              </button>
              <button
                onClick={() => engine?.toggleOneTapControl()}
                className={`py-1.5 px-1.5 rounded-lg text-[9px] font-bold border cursor-pointer ${
                  state.oneTapControlEnabled
                    ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                    : 'bg-[#090612] text-[#00f0ff] border-[#00f0ff]/40'
                }`}
              >
                {state.oneTapControlEnabled ? '1-TAP ON' : '1-TAP OFF'}
              </button>
              <button
                onClick={() => {
                  engine?.focusGoalieCameraAndKick();
                  setSettingsOpen(false);
                }}
                className="py-1.5 px-1.5 rounded-lg text-[9px] font-bold bg-[#090612] border border-[#ffb347]/45 text-[#ffb347] hover:bg-[#ffb347] hover:text-[#090612] cursor-pointer"
              >
                GOALIE PK
              </button>
            </div>
            <div className="text-[9px] text-slate-400 tabular-nums flex justify-between">
              <span>e_n={state.bouncePhysics.lastNormalE.toFixed(2)} · e_t={state.bouncePhysics.lastTangentialE.toFixed(2)}</span>
              <span>SPIN: {state.bouncePhysics.ballSpinRpm} RPM</span>
              <span>PK: {state.soccerGoalie.saves}/{state.soccerGoalie.shotsFaced}</span>
            </div>
            <div className="text-[9px] text-[#00f0ff] truncate tabular-nums border-t border-white/10 pt-1">
              FLOW: {state.flowTelemetry.tempoLabel} ({state.flowTelemetry.flowMeter}%)
            </div>
            <div className="text-[9px] text-amber-300 truncate tabular-nums">
              CHAIN: {state.bouncePhysics.continuousChainSummary}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">COURT DECK SURFACE</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'OLYMPIC_BLUE', label: 'VICE BLUE' },
                  { id: 'HARDWOOD', label: 'MAPLE WOOD' },
                  { id: 'SAND', label: 'VENICE ASPHALT' },
                  { id: 'CYBER', label: 'CYBER GRID' },
                ] as { id: CourtSurface; label: string }[]
              ).map((surf) => (
                <button
                  key={surf.id}
                  onClick={() => engine?.setCourtSurface(surf.id)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                    state.courtSurface === surf.id
                      ? 'bg-[#ff3d7f] text-white border-[#ff3d7f]'
                      : 'bg-slate-900 text-slate-300 border-white/15'
                  }`}
                >
                  {surf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold">STADIUM SKYLINE WEATHER</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['SUNSET', 'NIGHT', 'CYBER', 'SUNNY', 'BEACH'] as EnvironmentTheme[]).map((w) => (
                <button
                  key={w}
                  onClick={() => engine?.setWeather(w)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer ${
                    state.weather === w
                      ? 'bg-emerald-400 text-[#090612] border-emerald-400'
                      : 'bg-slate-900 text-slate-300 border-white/15'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-1.5">
            <button
              onClick={() => mp3InputRef.current?.click()}
              className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 border border-white/20 text-slate-200 hover:text-white flex items-center justify-center gap-1 cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>MP3</span>
            </button>
            <button
              onClick={() => {
                engine?.replayIntroCutscene();
                setSettingsOpen(false);
              }}
              className="py-1.5 px-2.5 rounded-lg bg-slate-900 border border-[#00f0ff]/40 text-[#00f0ff] font-bold cursor-pointer"
            >
              INTRO
            </button>
            <button
              onClick={() => {
                engine?.startNewMatch(state.matchFormat);
                setSettingsOpen(false);
              }}
              className="py-1.5 px-3 rounded-lg bg-[#ff3d7f] text-white font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>RESET</span>
            </button>
          </div>
        </div>
      )}

      {/* REPLAY PLAYBACK CONTROLLER OR LIVE BOTTOM PLAYER CONTROLS */}
      {state.replayState.active && state.replayState.currentClip ? (
        <div className="absolute bottom-3 inset-x-0 z-30 flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto bg-[#090612]/95 border border-[#ff3d7f]/65 rounded-2xl px-4 py-2.5 shadow-2xl max-w-2xl w-full space-y-2">
            <div className="flex items-center justify-between gap-2 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#ff3d7f] text-white text-[10px] font-black">
                  SLOW-MO {state.replayState.playbackSpeed}x
                </span>
                <span className="font-bold text-white">{state.replayState.currentClip.title}</span>
              </div>
              <span className="text-[#ffb347] text-[10px] font-bold">
                CAM {state.replayState.angleIndex + 1}/4
              </span>
            </div>

            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00f0ff]"
                style={{ width: `${Math.round(state.replayState.progress * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {[0.18, 0.28, 0.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => engine?.setReplaySpeed(spd)}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                      Math.abs(state.replayState.playbackSpeed - spd) < 0.02
                        ? 'bg-[#00f0ff] text-[#090612] border-[#00f0ff]'
                        : 'bg-slate-900 text-slate-300 border-white/15'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => engine?.cycleReplayAngle()}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-[#00f0ff]/45 text-[#00f0ff] font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Camera className="w-3 h-3" />
                  <span>NEXT ANGLE</span>
                </button>
                <button
                  onClick={() => engine?.stopReplay()}
                  className="px-3 py-1 rounded-lg bg-[#ff3d7f] text-white font-mono text-[10px] font-black cursor-pointer"
                >
                  RESUME 3V3
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-2.5 inset-x-0 z-20 pointer-events-none flex flex-col items-center gap-1 px-2">
          {/* ANKLE-BREAKER NATURAL REACTION READOUT */}
          {state.ankleBreaker.active && (
            <div className="bg-[#090612]/95 border border-[#ff6b1a] rounded-xl px-3 py-1 flex items-center gap-2 font-mono text-[10px] shadow-xl tabular-nums">
              <Zap className="w-3.5 h-3.5 text-[#ff6b1a]" />
              <span className="font-black text-[#ffb347]">
                ANKLE BREAKER · {state.ankleBreaker.reactionDelayMs}MS REACTION
              </span>
              {state.ankleBreaker.frozenDefenderName && (
                <span className="text-[#ff3d7f] font-black">
                  DROP: {state.ankleBreaker.frozenDefenderName}
                </span>
              )}
            </div>
          )}

          {/* LAST TIMING GRADE FLASH BADGE */}
          {!sm.isExpanded && state.shotMeter.lastTimingGrade !== 'NONE' && (
            <div className="bg-[#090612]/94 border border-[#00f0ff]/45 rounded-xl px-3 py-1 flex items-center gap-2.5 font-mono text-[10px] shadow-xl tabular-nums">
              <span
                className={`font-black ${
                  state.shotMeter.lastTimingGrade === 'PERFECT'
                    ? 'text-emerald-400'
                    : state.shotMeter.lastTimingGrade === 'GREAT'
                    ? 'text-[#00f0ff]'
                    : 'text-[#ffb347]'
                }`}
              >
                {state.shotMeter.lastTimingGrade} RELEASE
              </span>
              <span className="text-slate-300">{state.shotMeter.lastActionLabel}</span>
              {state.shotMeter.comboStreak > 1 && (
                <span className="text-[#ff6b1a] font-black">x{state.shotMeter.comboStreak} HOT</span>
              )}
            </div>
          )}

          {/* LIVE ONE-TAP / SHOOTING STRIP STEAL READOUT */}
          {!isOffenseA &&
            (state.stealTelemetry.pursuitTargetId !== null ||
              state.stealTelemetry.windowLabel.includes('WINDOW') ||
              state.stealTelemetry.activeLunge) && (
              <div className="bg-[#090612]/95 border border-[#00f0ff] rounded-xl px-3 py-1 flex items-center gap-2 font-mono text-[10px] shadow-xl">
                <Zap className="w-3.5 h-3.5 text-[#00f0ff]" />
                <span className="font-black text-[#00f0ff]">{state.stealTelemetry.windowLabel}</span>
                {state.stealTelemetry.lastOutcome !== 'NONE' && state.stealTelemetry.lastStealerName && (
                  <span className="text-[#ffb347] font-bold">
                    LAST: {state.stealTelemetry.lastOutcome.replace(/_/g, ' ')} ({state.stealTelemetry.lastStealerName})
                  </span>
                )}
              </div>
            )}

          {/* PLAYBOOK + MAIN ACTION BAR */}
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 bg-[#090612]/92 border border-[#00f0ff]/35 rounded-2xl px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-2xl max-w-[96vw]">
            <div className="flex items-center gap-1 sm:border-r border-white/15 sm:pr-2">
              {PLAY_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => engine?.setPlayCall(p.id)}
                  className={`h-7 px-1.5 sm:px-2 rounded-lg font-mono text-[10px] font-bold whitespace-nowrap cursor-pointer ${
                    state.activePlayCall === p.id
                      ? 'bg-[#ff6b1a] text-[#090612]'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <span className="hidden md:inline font-mono text-[10px] font-black text-[#00f0ff] px-1 whitespace-nowrap">
              #{state.activePlayerJersey} {state.activePlayerName}
            </span>

            <button
              onClick={() => engine?.triggerPassOrSwitch()}
              className="h-8 px-2.5 sm:px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-[#00f0ff]/45 text-[#00f0ff] font-mono text-[10px] font-black whitespace-nowrap cursor-pointer"
            >
              {isOffenseA ? 'PASS (Q)' : 'SWITCH (Q)'}
            </button>

            <button
              onClick={() => engine?.triggerCrossoverOrSteal()}
              className={`h-8 px-2.5 sm:px-3 rounded-xl border font-mono text-[10px] font-black whitespace-nowrap cursor-pointer ${
                !isOffenseA && state.stealTelemetry.windowLabel.includes('WINDOW')
                  ? 'bg-[#ff3d7f] border-[#ff3d7f] text-white'
                  : 'bg-slate-900 hover:bg-slate-800 border-[#ffb347]/45 text-[#ffb347]'
              }`}
            >
              {isOffenseA
                ? 'CROSS (E)'
                : state.oneTapControlEnabled
                ? '1-TAP STEAL (E)'
                : 'STEAL (E)'}
            </button>

            {isOffenseA && (
              <button
                onClick={() => engine?.triggerSpecialAnkleBreaker()}
                disabled={state.ankleBreaker.cooldownSec > 0}
                title="Double-Tap Court or Double-Tap E for Ankle Breaker (triggers natural defender reaction delay)"
                className={`h-8 px-2.5 sm:px-3 rounded-xl font-mono text-[10px] font-black flex items-center gap-1 whitespace-nowrap border tabular-nums ${
                  state.ankleBreaker.cooldownSec > 0
                    ? 'bg-slate-900/70 border-white/15 text-slate-500 cursor-not-allowed'
                    : 'bg-[#ff6b1a] hover:bg-[#ff853d] border-[#ff6b1a] text-[#090612] cursor-pointer'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {state.ankleBreaker.cooldownSec > 0
                    ? `BRK ${state.ankleBreaker.cooldownSec.toFixed(1)}s`
                    : '2x BREAKER'}
                </span>
              </button>
            )}

            {/* SLIDE POP-UP LIQUID GLASS SHOOTING METER + BLUE MORPH TRIGGER BUTTON */}
            <div className="relative inline-flex items-center">
              {isOffenseA && sm.isExpanded && (
                <div
                  className="absolute bottom-full right-0 mb-2.5 w-48 sm:w-52 rounded-3xl p-3 font-mono select-none touch-none z-50 border border-cyan-300/60"
                  style={{
                    background:
                      'linear-gradient(155deg, rgba(16, 32, 62, 0.94) 0%, rgba(8, 13, 30, 0.95) 55%, rgba(18, 45, 72, 0.92) 100%)',
                    boxShadow:
                      '0 18px 42px rgba(0, 240, 255, 0.34), inset 0 1px 1px rgba(255, 255, 255, 0.48), inset 0 -1px 2px rgba(0, 240, 255, 0.25)',
                  }}
                >
                  {/* Specular liquid glass top highlight streak */}
                  <div
                    className="pointer-events-none absolute inset-x-3 top-1.5 h-2 rounded-full opacity-60"
                    style={{
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.45), rgba(0,240,255,0.12), rgba(255,255,255,0.35))',
                    }}
                  />

                  <div className="flex items-center justify-between text-[10px] font-black mb-1.5 pt-0.5 tabular-nums">
                    <span className={inSweetSpot ? 'text-emerald-300' : 'text-[#00f0ff]'}>
                      {sm.predictedShotLabel}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-200 border border-cyan-300/35">
                      {sm.makeProbPct}%
                    </span>
                  </div>

                  {/* Expanded Liquid Glass Vertical Slider Chamber */}
                  <div className="flex items-stretch gap-2.5">
                    <div
                      className="relative flex-1 h-40 rounded-2xl overflow-hidden border border-cyan-200/45"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(15, 28, 56, 0.88) 0%, rgba(7, 12, 26, 0.95) 100%)',
                        boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.72), inset 0 0 14px rgba(0, 240, 255, 0.16)',
                      }}
                    >
                      {/* Calibrated Emerald Sweet Spot Window */}
                      <div
                        className="absolute inset-x-0 border-y border-emerald-300/80 z-10 pointer-events-none flex items-center justify-end pr-1.5"
                        style={{
                          bottom: `${sweetStart}%`,
                          height: `${sweetWidth}%`,
                          background:
                            'linear-gradient(180deg, rgba(16, 185, 129, 0.34), rgba(52, 211, 153, 0.22))',
                        }}
                      >
                        <span className="text-[8px] font-black text-emerald-200 tracking-wider">
                          SWEET
                        </span>
                      </div>

                      {/* Animated Liquid Wave Meniscus Fill */}
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        <defs>
                          <linearGradient id="aimLiquidGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={inSweetSpot ? '#34d399' : '#38bdf8'} stopOpacity="0.92" />
                            <stop offset="55%" stopColor={inSweetSpot ? '#059669' : '#0284c7'} stopOpacity="0.82" />
                            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.96" />
                          </linearGradient>
                        </defs>
                        <path d={backWavePath} fill="#0ea5e9" fillOpacity="0.32" />
                        <path d={frontWavePath} fill="url(#aimLiquidGrad)" />
                      </svg>

                      {/* Horizontal Finger Slide Thumb Level */}
                      <div
                        className="absolute inset-x-1 h-1.5 rounded-full bg-white z-20 pointer-events-none"
                        style={{
                          bottom: `calc(${sliderPct}% - 3px)`,
                          boxShadow: '0 0 10px rgba(255, 255, 255, 0.95)',
                        }}
                      />

                      {/* Vertical Glass Sheen Streak */}
                      <div
                        className="pointer-events-none absolute inset-y-2 left-1.5 w-1.5 rounded-full opacity-35 z-20"
                        style={{
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.05))',
                        }}
                      />
                    </div>

                    {/* Right Ballistic Readouts */}
                    <div className="w-16 flex flex-col justify-between text-[9px] tabular-nums py-0.5">
                      <div>
                        <div className="text-slate-400">POWER</div>
                        <div className="text-sm font-black text-white">{liquidPct}%</div>
                      </div>
                      <div>
                        <div className="text-slate-400">ARC</div>
                        <div className="text-xs font-bold text-[#00f0ff]">{sm.releaseAngleDeg}°</div>
                      </div>
                      <div>
                        <div className="text-slate-400">RANGE</div>
                        <div className="text-xs font-bold text-slate-200">{sm.distanceFt}FT</div>
                      </div>
                      <div>
                        <div className="text-slate-400">CONTEST</div>
                        <div className={`text-xs font-bold ${sm.contestPct > 45 ? 'text-[#ff3d7f]' : 'text-emerald-300'}`}>
                          {sm.contestPct}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-white/15 flex items-center justify-between text-[9px] text-cyan-200">
                    <span>SLIDE UP & RELEASE</span>
                    <span className="font-bold text-[#ffb347]">{sm.entryAngleDeg}° ENTRY</span>
                  </div>
                </div>
              )}

              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  dragActiveRef.current = true;
                  dragOriginYRef.current = e.clientY;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // ignore if unsupported
                  }
                  engine?.beginShotOrBlockCharge();
                }}
                onPointerMove={(e) => {
                  if (!dragActiveRef.current || !isOffenseA || !sm.isExpanded) return;
                  const deltaUpPx = dragOriginYRef.current - e.clientY;
                  if (Math.abs(deltaUpPx) > 4) {
                    const norm = Math.max(0.06, Math.min(1, 0.14 + deltaUpPx / 135));
                    engine?.setSlideShotLevel(norm);
                  }
                }}
                onPointerUp={(e) => {
                  dragActiveRef.current = false;
                  try {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  } catch {
                    // ignore
                  }
                  engine?.releaseShotOrBlock();
                }}
                onLostPointerCapture={() => {
                  if (dragActiveRef.current) {
                    dragActiveRef.current = false;
                    engine?.releaseShotOrBlock();
                  }
                }}
                onPointerCancel={() => {
                  dragActiveRef.current = false;
                  engine?.releaseShotOrBlock();
                }}
                className={`font-mono font-black flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer touch-none transition-all duration-150 ${
                  isOffenseA && sm.isExpanded
                    ? 'h-10 px-5 sm:px-6 rounded-2xl text-xs text-white border border-cyan-200/80 scale-[1.04]'
                    : 'h-8 px-3 sm:px-4 rounded-xl bg-[#00f0ff] active:bg-[#ffb347] text-[#090612] text-[10px] sm:text-[11px]'
                }`}
                style={
                  isOffenseA && sm.isExpanded
                    ? {
                        background:
                          'linear-gradient(160deg, rgba(56, 189, 248, 0.95) 0%, rgba(2, 132, 199, 0.95) 60%, rgba(14, 116, 144, 0.98) 100%)',
                        boxShadow:
                          '0 0 24px rgba(0, 240, 255, 0.65), inset 0 1px 1px rgba(255, 255, 255, 0.7)',
                      }
                    : undefined
                }
              >
                {isOffenseA ? <Flame className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                <span>
                  {isOffenseA
                    ? sm.isExpanded
                      ? `RELEASE ${sliderPct}%`
                      : 'SHOOT / DUNK'
                    : 'BLOCK JUMP'}
                </span>
              </button>
            </div>

            <button
              onClick={() => void cometicOSKernel.orchestrateWithStudio('Analyze current 3v3 court spacing & suggest play')}
              className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-xl bg-purple-600/35 hover:bg-purple-600/55 border border-purple-400/50 text-purple-200 font-mono text-[10px] font-bold flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
              aria-label="Ask Studio AI Coach"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">STUDIO</span>
            </button>
          </div>

          <div className="hidden sm:block text-[10px] font-mono text-slate-300 bg-[#090612]/80 px-2.5 py-0.5 rounded-lg border border-white/10">
            1-Tap Move/Pass/Shoot · 1-Tap Opp (Moving or Shooting) Steal · 2x Tap Ankle Breaker · Slide Shoot · Q Pass
          </div>
        </div>
      )}
    </>
  );
};
