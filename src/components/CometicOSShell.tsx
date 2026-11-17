import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Activity,
  Box,
  Clapperboard,
  Cpu,
  Globe,
  HardDrive,
  HeartPulse,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import { CometicKernelState, SubsystemId } from '../os/osTypes';
import { COMETIC_MATRIX_STEPS, cometicOSKernel } from '../os/CometicOSKernel';
import { BasketReplayClip } from '../basketball/basketballTypes';
import { SpikeReplayClip } from '../types';

interface CometicOSShellProps {
  kernelState: CometicKernelState;
  basketballClips: BasketReplayClip[];
  volleyballClips: SpikeReplayClip[];
  onPlayHighlightInGame: (index: number) => void;
}

/**
 * Lightweight Three.js Zero-Crossing CAD Kernel mini-viewport
 * Renders TORUS / GYROID / HOOP_RIM SDF wireframe geometry inside the OS Workstation.
 */
const CADMiniViewport: React.FC<{ shape: CometicKernelState['cadShape'] }> = ({ shape }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const w = Math.max(120, host.clientWidth || 320);
    const h = Math.max(96, host.clientHeight || 140);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0.8, 3.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const geo =
      shape === 'GYROID'
        ? new THREE.TorusKnotGeometry(0.85, 0.25, 64, 16, 2, 3)
        : shape === 'HOOP_RIM'
        ? new THREE.TorusGeometry(0.95, 0.09, 14, 42)
        : new THREE.TorusGeometry(0.88, 0.3, 18, 40);

    const mat = new THREE.MeshBasicMaterial({
      color: shape === 'HOOP_RIM' ? 0xff6b1a : shape === 'GYROID' ? 0x00f0ff : 0x34d399,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    if (shape === 'HOOP_RIM') mesh.rotation.x = Math.PI * 0.35;
    scene.add(mesh);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      mesh.rotation.y += 0.015;
      mesh.rotation.x += shape === 'HOOP_RIM' ? 0 : 0.008;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [shape]);

  return <div ref={hostRef} className="w-full h-32 rounded-xl overflow-hidden bg-slate-950/90 border border-white/10" />;
};

export const CometicOSShell: React.FC<CometicOSShellProps> = ({
  kernelState,
  basketballClips,
  volleyballClips,
  onPlayHighlightInGame,
}) => {
  const [clockText, setClockText] = useState(() => new Date().toTimeString().slice(0, 5));
  const [replInput, setReplInput] = useState('');
  const [studioInput, setStudioInput] = useState('');

  // Cometic Studio Pro Video Editor state
  const [vePlaying, setVePlaying] = useState(false);
  const [veTime, setVeTime] = useState(0);
  const [veLut, setVeLut] = useState<'cyberpunk' | 'matrix' | 'cinematic' | 'monochrome'>('cyberpunk');
  const [veTitle, setVeTitle] = useState('AIM VANCOUVER 3X3 MASTER CUT');
  const [veExtraClips, setVeExtraClips] = useState<{ id: string; name: string; duration: number; type: 'video' | 'audio' }[]>([
    { id: 'c1', name: 'Coal Harbour Aerial Drone.mp4', duration: 5, type: 'video' },
    { id: 'c2', name: 'Vice Synth Anthem.wav', duration: 8, type: 'audio' },
  ]);

  // Aether-Net Browser state
  const [browserUrl, setBrowserUrl] = useState('https://en.wikipedia.org/wiki/Basketball');
  const [browserInput, setBrowserInput] = useState('https://en.wikipedia.org/wiki/Basketball');

  useEffect(() => {
    const id = window.setInterval(() => setClockText(new Date().toTimeString().slice(0, 5)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!vePlaying) return;
    const id = window.setInterval(() => {
      setVeTime((prev) => {
        if (prev >= 15) {
          setVePlaying(false);
          return 0;
        }
        return Number((prev + 0.1).toFixed(1));
      });
    }, 100);
    return () => clearInterval(id);
  }, [vePlaying]);

  const degradedCount = kernelState.subsystems.filter(
    (s) => s.status === 'DEGRADED' || s.status === 'HEALING'
  ).length;

  const isWorkstation = kernelState.viewMode === 'OS_WORKSTATION';

  const handleReplSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replInput.trim()) return;
    cometicOSKernel.executeReplCommand(replInput);
    setReplInput('');
  };

  const handleStudioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioInput.trim()) return;
    void cometicOSKernel.orchestrateWithStudio(studioInput);
    setStudioInput('');
  };

  const totalClips =
    kernelState.activeSport === 'BASKETBALL_3V3'
      ? basketballClips.map((c, idx) => ({ id: c.id, name: c.title, duration: 4, type: 'video' as const, index: idx }))
      : volleyballClips.map((c, idx) => ({
          id: c.id,
          name: `#${c.spikerJersey} ${c.spikerName} (${c.speedKmh}km/h)`,
          duration: 4,
          type: 'video' as const,
          index: idx,
        }));

  return (
    <>
      {/* TOP AUTONOMOUS COMETIC OS STATUS & LAUNCH BAR (h-9) */}
      <header className="fixed top-0 inset-x-0 h-9 z-50 bg-[#090612]/95 border-b border-pink-500/35 px-2 sm:px-2.5 flex items-center justify-between gap-1.5 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <div className="hidden xs:flex sm:flex items-center gap-1 text-pink-300 font-bold shrink-0 whitespace-nowrap">
            <Cpu className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden md:inline">AIM-COMETIC OS v30.0</span>
            <span className="md:hidden">OS</span>
          </div>

          {/* SPORT ENGINE SWITCHER */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-white/10 shrink-0">
            <button
              onClick={() => cometicOSKernel.setActiveSport('BASKETBALL_3V3')}
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-black cursor-pointer whitespace-nowrap ${
                kernelState.activeSport === 'BASKETBALL_3V3'
                  ? 'bg-[#ff6b1a] text-[#090612]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span className="sm:hidden">3v3 HOOPS</span>
              <span className="hidden sm:inline">3v3 BASKETBALL</span>
            </button>
            <button
              onClick={() => cometicOSKernel.setActiveSport('VOLLEYBALL_6V6')}
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-black cursor-pointer whitespace-nowrap ${
                kernelState.activeSport === 'VOLLEYBALL_6V6'
                  ? 'bg-[#00f0ff] text-[#090612]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span className="sm:hidden">VOLLEY</span>
              <span className="hidden sm:inline">VOLLEYBALL</span>
            </button>
          </div>

          {/* VIEWPORT MODE SWITCHER: GAME FOCUS vs FULL OS WORKSTATION */}
          <button
            onClick={() =>
              cometicOSKernel.setViewMode(isWorkstation ? 'GAME_FOCUS' : 'OS_WORKSTATION')
            }
            className={`px-2 py-0.5 rounded-lg border text-[10px] font-black flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              isWorkstation
                ? 'bg-pink-500 text-slate-950 border-pink-400'
                : 'bg-slate-900 text-pink-300 border-pink-500/40 hover:bg-pink-500/20'
            }`}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span className="sm:hidden">{isWorkstation ? 'COURT' : 'OS'}</span>
            <span className="hidden sm:inline">{isWorkstation ? 'BACK TO COURT' : 'OS WORKSTATION'}</span>
          </button>
        </div>

        {/* RIGHT OS TELEMETRY & QUICK APP LAUNCHERS */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <button
            onClick={() => cometicOSKernel.triggerManualHealAll()}
            title="Autonomous Self-Healing Status — Click to run diagnostics & recover"
            className={`px-1.5 sm:px-2 py-0.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
              degradedCount > 0
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35 hover:bg-emerald-500/25'
            }`}
          >
            <HeartPulse className="w-3 h-3 shrink-0" />
            <span className="hidden md:inline">
              {degradedCount > 0 ? `HEALING (${degradedCount})` : `SELF-HEAL OK`}
            </span>
            {kernelState.totalHealCycles > 0 && (
              <span className="text-[9px] opacity-80">#{kernelState.totalHealCycles}</span>
            )}
          </button>

          <button
            onClick={() => cometicOSKernel.setActiveModal(kernelState.activeModal === 'MATRIX' ? 'NONE' : 'MATRIX')}
            className="hidden sm:flex px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 hover:bg-purple-500/35 text-[10px] font-bold items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>MATRIX {kernelState.cometicStep}/10</span>
          </button>

          <button
            onClick={() =>
              cometicOSKernel.setActiveModal(kernelState.activeModal === 'VIDEO_EDITOR' ? 'NONE' : 'VIDEO_EDITOR')
            }
            className="hidden md:flex px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/35 text-[10px] font-bold items-center gap-1 cursor-pointer"
          >
            <Video className="w-3 h-3" />
            <span>STUDIO PRO</span>
          </button>

          <button
            onClick={() =>
              cometicOSKernel.setActiveModal(kernelState.activeModal === 'BROWSER' ? 'NONE' : 'BROWSER')
            }
            className="hidden md:flex px-2 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/35 text-[10px] font-bold items-center gap-1 cursor-pointer"
          >
            <Globe className="w-3 h-3" />
            <span>NET</span>
          </button>

          <span className="px-1.5 sm:px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px] text-emerald-300 tabular-nums">
            {kernelState.liveFps} <span className="hidden sm:inline">FPS</span>
          </span>
          <span className="hidden lg:inline px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px] text-pink-300 tabular-nums">
            OPFS {kernelState.opfs.usagePct}%
          </span>
          <span className="hidden sm:inline text-slate-400 text-[10px] tabular-nums pl-1">{clockText}</span>
        </div>
      </header>

      {/* ================================================================= */}
      {/* FULL AUTONOMOUS OS WORKSTATION WORKSPACE (WHEN ACTIVE)            */}
      {/* ================================================================= */}
      {isWorkstation && (
        <div className="fixed inset-x-0 top-9 bottom-0 z-30 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-y-auto pointer-events-none">
          {/* LEFT COLUMN: OPFS SCRATCH DISK + AETHERFS LOGGER */}
          <div className="lg:col-span-4 flex flex-col gap-3 min-h-0 pointer-events-auto">
            {/* OPFS Scratch Disk Monitor */}
            <div className="bg-[#0b0f1c]/94 border border-pink-500/35 rounded-2xl p-4 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center">
                    <HardDrive className="w-4 h-4 text-slate-950" />
                  </div>
                  <h3 className="font-bold text-xs text-pink-300 font-mono">OPFS Scratch Disk Monitor</h3>
                </div>
                <button
                  onClick={() => void cometicOSKernel.writeOPFSSnapshot('manual_ui')}
                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 text-[10px] font-mono cursor-pointer hover:bg-emerald-500/35"
                >
                  Snapshot
                </button>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Quota ({kernelState.opfs.backendMode}):</span>
                  <span className="text-pink-400 font-bold">
                    {kernelState.opfs.usedGb} GB / {kernelState.opfs.allocatedGb.toFixed(1)} GB
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-900 border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-400 via-purple-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${kernelState.opfs.usagePct}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-slate-950/90 border border-white/10">
                    <div className="text-[10px] text-slate-400">Inode Health</div>
                    <div className="text-sm font-bold text-emerald-300 mt-0.5 tabular-nums">
                      {kernelState.opfs.inodeCount.toLocaleString()} OK
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/90 border border-white/10">
                    <div className="text-[10px] text-slate-400">I/O Throughput</div>
                    <div className="text-sm font-bold text-pink-300 mt-0.5 tabular-nums">
                      {kernelState.opfs.throughputMbps} MB/s
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AetherFS Sync Logger */}
            <div className="bg-[#0b0f1c]/94 border border-indigo-500/35 rounded-2xl p-4 shadow-2xl flex flex-col flex-1 min-h-[220px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
                <h3 className="font-bold text-xs text-indigo-300 font-mono">AetherFS Self-Heal Journal</h3>
                <button
                  onClick={() => cometicOSKernel.clearLogs()}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-300 cursor-pointer font-mono"
                >
                  Clear
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] pt-2 max-h-64">
                {kernelState.aetherLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded border space-y-0.5 ${
                      log.severity === 'heal'
                        ? 'bg-emerald-500/10 border-emerald-400/30'
                        : log.severity === 'warn'
                        ? 'bg-amber-500/10 border-amber-400/30'
                        : log.severity === 'studio'
                        ? 'bg-purple-500/10 border-purple-400/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span className="font-bold">[{log.source}]</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <p className="text-slate-200 leading-snug">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER COLUMN: SELF-HEALING WATCHDOG + GOOGLE STUDIO ORCHESTRATOR + CAD */}
          <div className="lg:col-span-5 flex flex-col gap-3 min-h-0 pointer-events-auto">
            {/* Autonomous Self-Healing Subsystem Registry */}
            <div className="bg-[#0b0f1c]/94 border border-emerald-500/35 rounded-2xl p-4 shadow-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-xs text-emerald-300 font-mono">
                    Autonomous Self-Healing Watchdog ({kernelState.subsystems.length} Subsystems)
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <button
                    onClick={() => cometicOSKernel.setSelfHealEnabled(!kernelState.selfHealEnabled)}
                    className={`px-2 py-0.5 rounded border cursor-pointer font-bold ${
                      kernelState.selfHealEnabled
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-800 border-white/15 text-slate-400'
                    }`}
                  >
                    {kernelState.selfHealEnabled ? 'AUTO-HEAL ON' : 'PAUSED'}
                  </button>
                  <button
                    onClick={() => cometicOSKernel.triggerManualHealAll()}
                    className="px-2 py-0.5 rounded bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>HEAL ALL</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[10px]">
                {kernelState.subsystems.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2 rounded-xl bg-slate-950/90 border border-white/10 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 truncate">{sub.name}</div>
                      <div className="text-[9px] text-slate-400 truncate">{sub.lastAction}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                          sub.status === 'NOMINAL'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : sub.status === 'RECOVERED'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-amber-500/25 text-amber-300'
                        }`}
                      >
                        {sub.status}
                      </span>
                      <button
                        title={`Inject test fault into ${sub.name}`}
                        onClick={() => cometicOSKernel.injectFault(sub.id as SubsystemId)}
                        className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/35 text-rose-300 cursor-pointer"
                      >
                        <ShieldAlert className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Google Studio Gemini 4 Orchestrator Console */}
            <div className="bg-[#0b0f1c]/94 border border-purple-500/40 rounded-2xl p-4 shadow-2xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                  <h3 className="font-bold text-xs text-purple-200 font-mono">
                    Google Studio Gemini 4 Game & OS Orchestrator
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-purple-300">
                  {kernelState.studioSource} · {kernelState.studioLastSyncTime}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-white/10 font-mono text-[11px] space-y-1">
                <div className="text-amber-300 font-bold">{kernelState.studioStatusBanner}</div>
                {kernelState.latestOrchestration && (
                  <div className="text-slate-300 text-[10px]">
                    Play: <span className="text-[#00f0ff] font-bold">{kernelState.latestOrchestration.gameDirective.playCall}</span> · Defense:{' '}
                    <span className="text-[#ff3d7f] font-bold">{kernelState.latestOrchestration.gameDirective.defenseCall}</span> —{' '}
                    {kernelState.latestOrchestration.gameDirective.coachCallout}
                  </div>
                )}
              </div>

              <form onSubmit={handleStudioSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={studioInput}
                  onChange={(e) => setStudioInput(e.target.value)}
                  placeholder="Issue Studio AI directive (e.g. 'Run 5-out 2PT shooting & boost bloom')..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-400"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs cursor-pointer"
                >
                  Orchestrate
                </button>
              </form>
            </div>

            {/* Zero-Crossing CAD Kernel */}
            <div className="bg-[#0b0f1c]/94 border border-cyan-500/35 rounded-2xl p-4 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-xs text-emerald-300 font-mono">Zero-Crossing CAD Kernel</h3>
                </div>
                <div className="flex items-center gap-1 font-mono text-[10px]">
                  {(['HOOP_RIM', 'TORUS', 'GYROID'] as const).map((shape) => (
                    <button
                      key={shape}
                      onClick={() => cometicOSKernel.setCadShape(shape)}
                      className={`px-2 py-0.5 rounded cursor-pointer border ${
                        kernelState.cadShape === shape
                          ? 'bg-emerald-400 text-slate-950 border-emerald-400 font-bold'
                          : 'bg-slate-900 text-emerald-300 border-white/10'
                      }`}
                    >
                      {shape.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <CADMiniViewport shape={kernelState.cadShape} />
            </div>
          </div>

          {/* RIGHT COLUMN: INTERACTIVE REPL TERMINAL & APP LAUNCHERS */}
          <div className="lg:col-span-3 flex flex-col gap-3 min-h-0 pointer-events-auto">
            <div className="bg-[#0b0f1c]/94 border border-amber-500/35 rounded-2xl p-4 shadow-2xl flex flex-col flex-1 min-h-[320px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-xs text-amber-300 font-mono">OS REPL Console</h3>
                </div>
                <button
                  onClick={() => cometicOSKernel.executeReplCommand('stress')}
                  className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/35 font-mono font-bold text-[10px] cursor-pointer"
                >
                  Stress Test
                </button>
              </div>

              <div className="flex-1 overflow-y-auto font-mono text-[11px] bg-slate-950/90 rounded-xl p-2.5 mt-2 border border-white/10 space-y-1">
                {kernelState.replLines.map((line) => (
                  <div
                    key={line.id}
                    className={
                      line.tone === 'cyan'
                        ? 'text-cyan-300'
                        : line.tone === 'emerald'
                        ? 'text-emerald-400'
                        : line.tone === 'amber'
                        ? 'text-amber-300'
                        : line.tone === 'pink'
                        ? 'text-pink-400'
                        : line.tone === 'rose'
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }
                  >
                    {line.text}
                  </div>
                ))}
              </div>

              <form onSubmit={handleReplSubmit} className="flex items-center gap-1.5 mt-2 shrink-0">
                <span className="text-amber-400 font-mono text-xs">$</span>
                <input
                  type="text"
                  value={replInput}
                  onChange={(e) => setReplInput(e.target.value)}
                  placeholder="help, heal, fault, overdrive..."
                  className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-slate-100 font-mono focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs cursor-pointer"
                >
                  Exec
                </button>
              </form>

              {/* APP LAUNCH DOCK INSIDE WORKSTATION */}
              <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2.5 border-t border-white/10 font-mono text-[10px]">
                <button
                  onClick={() => cometicOSKernel.setActiveModal('VIDEO_EDITOR')}
                  className="py-1.5 px-2 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  <Clapperboard className="w-3.5 h-3.5" />
                  <span>Video Editor</span>
                </button>
                <button
                  onClick={() => cometicOSKernel.setActiveModal('BROWSER')}
                  className="py-1.5 px-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Browser</span>
                </button>
                <button
                  onClick={() => cometicOSKernel.setActiveModal('MATRIX')}
                  className="py-1.5 px-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-200 font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>10-Step Matrix</span>
                </button>
                <button
                  onClick={() => cometicOSKernel.runCometicOverdrive()}
                  className="py-1.5 px-2 rounded-xl bg-pink-500/20 border border-pink-400/40 text-pink-200 font-bold cursor-pointer flex items-center justify-center gap-1"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Overdrive</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 1: COMETIC STUDIO PRO VIDEO EDITOR (WITH LIVE HIGHLIGHTS)   */}
      {/* ================================================================= */}
      {kernelState.activeModal === 'VIDEO_EDITOR' && (
        <div className="fixed inset-x-4 top-12 bottom-4 z-50 bg-[#0b0f19]/96 border border-rose-500/50 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl">
          <div className="flex items-center justify-between border-b border-rose-500/30 pb-2">
            <span className="font-mono text-xs font-bold text-rose-300">
              COMETIC STUDIO PRO — NON-LINEAR HIGHLIGHT EDITOR
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void cometicOSKernel.writeOPFSSnapshot('video_master_export')}
                className="px-3 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400 text-emerald-200 font-mono text-[10px] font-bold cursor-pointer"
              >
                Export Master to OPFS
              </button>
              <button
                onClick={() => cometicOSKernel.setActiveModal('NONE')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-mono text-[10px] cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>CLOSE</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
            <div className="lg:col-span-8 flex flex-col gap-2 min-h-0">
              <div
                className={`flex-1 rounded-xl border border-rose-400/40 relative flex flex-col items-center justify-center p-4 overflow-hidden ${
                  veLut === 'cyberpunk'
                    ? 'bg-gradient-to-br from-slate-950 via-rose-950 to-purple-950'
                    : veLut === 'matrix'
                    ? 'bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900'
                    : veLut === 'cinematic'
                    ? 'bg-gradient-to-br from-slate-950 via-cyan-950 to-blue-950'
                    : 'bg-slate-950'
                }`}
              >
                <h2 className="font-vice text-2xl text-pink-300 tracking-wider text-center">{veTitle}</h2>
                <div className="font-mono text-xs text-rose-200 mt-2">
                  Timecode: 00:00:{veTime.toFixed(1).padStart(4, '0')} / 00:00:15.0
                </div>
                {totalClips.length > 0 && (
                  <button
                    onClick={() => {
                      cometicOSKernel.setActiveModal('NONE');
                      cometicOSKernel.setViewMode('GAME_FOCUS');
                      onPlayHighlightInGame(0);
                    }}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-[#00f0ff] text-[#090612] font-mono text-xs font-black cursor-pointer"
                  >
                    Launch 3D Multi-Angle Replay ({totalClips[0].name})
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setVeTime(0)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setVePlaying((p) => !p)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {vePlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{vePlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={() => cometicOSKernel.logEvent('EDITOR', `Split timeline clip at ${veTime.toFixed(1)}s`, 'info')}
                  className="px-3 py-2 rounded-xl bg-purple-600/40 border border-purple-400/40 text-purple-200 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Split Clip</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-4 bg-slate-900/90 rounded-xl border border-rose-500/30 p-3 flex flex-col gap-3 font-mono text-xs overflow-y-auto">
              <div className="text-rose-300 font-bold border-b border-rose-500/20 pb-1">Color Grade & Overlay</div>
              <select
                value={veLut}
                onChange={(e) => setVeLut(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-rose-200"
              >
                <option value="cyberpunk">Cyberpunk Neon Pink</option>
                <option value="matrix">Matrix Emerald Grid</option>
                <option value="cinematic">Cinematic Teal & Orange</option>
                <option value="monochrome">Noir Monochrome</option>
              </select>
              <input
                type="text"
                value={veTitle}
                onChange={(e) => setVeTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
              />
              <div className="text-[10px] text-slate-400 font-bold pt-2 border-t border-white/10">
                Captured Arena Highlights ({totalClips.length})
              </div>
              <div className="space-y-1.5">
                {totalClips.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setVeExtraClips((prev) => [...prev, { id: `${c.id}-${Date.now()}`, name: c.name, duration: 4, type: 'video' }])}
                    className="w-full p-2 rounded-lg bg-slate-950 border border-rose-500/30 hover:border-rose-400 text-left text-[10px] text-rose-200 cursor-pointer"
                  >
                    + Add to Timeline: {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-28 bg-slate-950/95 rounded-xl border border-rose-500/30 p-2.5 flex flex-col gap-2 font-mono text-[10px] relative">
            <div className="flex justify-between text-rose-300 font-bold">
              <span>TIMELINE TRACKS</span>
              <span className="text-slate-400">Playhead: {veTime.toFixed(1)}s</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {veExtraClips.map((c) => (
                <div
                  key={c.id}
                  className={`px-3 py-2 rounded border shrink-0 ${
                    c.type === 'video'
                      ? 'bg-rose-600/25 border-rose-400/50 text-rose-200'
                      : 'bg-indigo-600/25 border-indigo-400/50 text-indigo-200'
                  }`}
                >
                  {c.name} ({c.duration}s)
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: AETHER-NET SANDBOX BROWSER                               */}
      {/* ================================================================= */}
      {kernelState.activeModal === 'BROWSER' && (
        <div className="fixed inset-x-4 top-12 bottom-4 z-50 bg-[#0b0f19]/96 border border-cyan-500/50 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl">
          <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2 font-mono">
            <span className="text-xs font-bold text-cyan-300">AETHER-NET BROWSER — SANDBOX VIEWPORT</span>
            <button
              onClick={() => cometicOSKernel.setActiveModal('NONE')}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-[10px] cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>CLOSE</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              let next = browserInput.trim();
              if (!next.startsWith('http://') && !next.startsWith('https://')) next = `https://${next}`;
              setBrowserUrl(next);
              setBrowserInput(next);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={browserInput}
              onChange={(e) => setBrowserInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 font-mono"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs cursor-pointer"
            >
              Go
            </button>
          </form>

          <div className="flex items-center gap-2 font-mono text-[10px]">
            {[
              { label: 'FIBA 3x3 Rules', url: 'https://en.wikipedia.org/wiki/3x3_basketball' },
              { label: 'Vancouver Coal Harbour', url: 'https://en.wikipedia.org/wiki/Coal_Harbour' },
              { label: 'Volleyball Tactics', url: 'https://en.wikipedia.org/wiki/Volleyball' },
            ].map((bm) => (
              <button
                key={bm.label}
                onClick={() => {
                  setBrowserUrl(bm.url);
                  setBrowserInput(bm.url);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
              >
                {bm.label}
              </button>
            ))}
          </div>

          <iframe
            title="Aether-Net Browser Sandbox"
            src={browserUrl}
            className="flex-1 w-full bg-white rounded-xl border border-cyan-500/30"
          />
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: COMETIC 10-STEP MATRIX + OVERDRIVE CONTROL               */}
      {/* ================================================================= */}
      {kernelState.activeModal === 'MATRIX' && (
        <div className="fixed inset-x-4 top-12 bottom-4 z-50 bg-[#0b0f19]/96 border border-pink-500/50 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between border-b border-pink-500/30 pb-2">
            <span className="font-mono text-xs font-bold text-pink-200">
              COMETIC ENGINE — 10-STEP AUTONOMOUS SHADER MATRIX
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => cometicOSKernel.runCometicOverdrive()}
                className="px-3 py-1 rounded-lg bg-pink-500/30 border border-pink-400 text-pink-200 font-mono text-[10px] font-bold hover:bg-pink-500/50 cursor-pointer"
              >
                OVERDRIVE [1-10]
              </button>
              <button
                onClick={() => cometicOSKernel.setActiveModal('NONE')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-mono text-[10px] cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono">
            {COMETIC_MATRIX_STEPS.map((st) => {
              const unlocked = kernelState.unlockedSteps.includes(st.step);
              const active = kernelState.cometicStep === st.step;
              return (
                <button
                  key={st.step}
                  onClick={() => cometicOSKernel.activateCometicStep(st.step)}
                  className={`p-3 rounded-xl border text-left space-y-1 cursor-pointer transition-colors ${
                    active
                      ? 'bg-cyan-900/50 border-[#00f0ff] text-white'
                      : unlocked
                      ? 'bg-pink-950/40 border-pink-400/60 text-pink-100'
                      : 'bg-slate-900/75 border-white/10 text-slate-400'
                  }`}
                >
                  <div className="flex justify-between text-[11px] font-bold text-pink-300">
                    <span>{st.code}</span>
                    <span>{active ? 'ACTIVE' : unlocked ? 'SYNCED' : 'READY'}</span>
                  </div>
                  <div className="text-[10px] font-bold text-white">{st.title}</div>
                  <div className="text-[9px] text-slate-300 leading-snug">{st.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
