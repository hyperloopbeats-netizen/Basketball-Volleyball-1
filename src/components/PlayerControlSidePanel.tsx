import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Unlock, Users } from 'lucide-react';
import {
  Role,
  SpriteMatrixUnitSlot,
  SpriteSpecId,
  Unit,
} from '../types';
import {
  MOVEMENT_REACTION_SPRITE_SPECS,
  renderSpriteSpecIcon,
} from '../matrix/ai/spriteSpecSheet';

interface PlayerControlSidePanelProps {
  units: Unit[];
  activeUnitId: number;
  controlMode: 'PLAYER' | 'AI';
  manualUnitLocked: boolean;
  spriteMatrixSlots?: SpriteMatrixUnitSlot[];
  onSelectUnit: (unitId: number) => void;
  onUnlockAuto: () => void;
}

const ROLE_SHORT: Record<Role, string> = {
  Setter: 'S',
  Outside: 'OH',
  Middle: 'MB',
  Opposite: 'OP',
  LeftBack: 'LB',
  Libero: 'L',
};

const SpriteIconBadge: React.FC<{
  specId: SpriteSpecId;
  tintCss: string;
  size?: number;
}> = ({ specId, tintCss, size = 32 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderSpriteSpecIcon(canvas, specId, tintCss);
  }, [specId, tintCss]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      style={{ width: size, height: size }}
      className="rounded-lg border border-white/15 bg-[#07040f] shrink-0"
    />
  );
};

export const PlayerControlSidePanel: React.FC<PlayerControlSidePanelProps> = ({
  units,
  activeUnitId,
  controlMode,
  manualUnitLocked,
  spriteMatrixSlots = [],
  onSelectUnit,
  onUnlockAuto,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  const teamAUnits = units.filter((u) => u.team === 'A');
  if (teamAUnits.length === 0) return null;

  const slotById = new Map<number, SpriteMatrixUnitSlot>();
  for (const s of spriteMatrixSlots) {
    slotById.set(s.unitId, s);
  }

  return (
    <div className="no-print fixed left-2 top-16 sm:top-20 z-30 pointer-events-auto flex items-start gap-1">
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Open player control sprite panel"
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#090612]/92 border border-[#00f0ff]/45 text-[#00f0ff] shadow-xl hover:border-[#ffb347] transition-colors"
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[10px] font-extrabold tracking-wider uppercase">
            SQUAD
          </span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      ) : (
        <aside
          aria-label="Team A player control panel"
          className="w-[186px] sm:w-[214px] max-h-[calc(100vh-12rem)] flex flex-col rounded-2xl bg-[#090612]/92 border border-[#00f0ff]/40 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 border-b border-white/10 bg-[#120b24]/90 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shrink-0" />
              <span className="font-mono text-[9px] font-extrabold tracking-wider uppercase text-white truncate">
                CTRL · SPRITES
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {manualUnitLocked && controlMode === 'PLAYER' && (
                <button
                  type="button"
                  onClick={onUnlockAuto}
                  title="Return to Smart Auto-Switch"
                  className="px-1.5 py-0.5 rounded bg-[#ffb347]/20 border border-[#ffb347]/50 text-[#ffb347] font-mono text-[8px] font-extrabold flex items-center gap-0.5 hover:bg-[#ffb347]/30"
                >
                  <Unlock className="w-2.5 h-2.5" />
                  <span>AUTO</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse player control sprite panel"
                className="p-1 rounded-lg hover:bg-white/10 text-slate-300"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Roster Sprite List */}
          <div className="p-1.5 space-y-1 overflow-y-auto">
            {teamAUnits.map((u) => {
              const slot = slotById.get(u.id);
              const specId: SpriteSpecId = slot?.activeSpriteId ?? 'READY_COIL';
              const spec = MOVEMENT_REACTION_SPRITE_SPECS[specId];
              const isSelected = u.id === activeUnitId;
              const tintCss = u.isLibero ? '#ffb347' : '#00f0ff';
              const staminaPct = Math.max(0, Math.min(100, Math.round(u.stamina ?? 100)));
              const footPhase = u.footPlantPhase ?? 'DOUBLE_SUPPORT';
              const footLabel =
                footPhase === 'AIRBORNE'
                  ? 'AIR'
                  : footPhase === 'LEFT_PLANT'
                  ? 'L-PLT'
                  : footPhase === 'RIGHT_PLANT'
                  ? 'R-PLT'
                  : 'DBL';

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onSelectUnit(u.id)}
                  className={`w-full text-left rounded-xl p-1.5 border transition-colors flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#00f0ff]/16 border-[#00f0ff] shadow-md'
                      : 'bg-[#120b24]/70 border-white/10 hover:border-[#00f0ff]/45'
                  }`}
                >
                  <SpriteIconBadge specId={specId} tintCss={tintCss} size={32} />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className={`font-mono text-[9px] font-black tabular-nums ${
                            u.isLibero ? 'text-[#ffb347]' : 'text-[#00f0ff]'
                          }`}
                        >
                          #{u.jerseyNumber}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-white truncate">
                          {u.name}
                        </span>
                      </div>
                      <span className="font-mono text-[8px] font-bold px-1 py-0.5 rounded bg-black/50 text-slate-300 shrink-0">
                        {ROLE_SHORT[u.role]}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 font-mono text-[8px]">
                      <span className="text-cyan-200/90 truncate">
                        {spec.label} [{spec.atlasCol},{spec.atlasRow}]
                      </span>
                      <span
                        className={`px-1 rounded font-bold shrink-0 ${
                          footLabel === 'AIR'
                            ? 'bg-[#ff3d7f]/25 text-[#ff3d7f]'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {footLabel}
                      </span>
                    </div>

                    {/* Readiness / Stamina Bar */}
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full ${
                            staminaPct > 65
                              ? 'bg-[#00f0ff]'
                              : staminaPct > 35
                              ? 'bg-[#ffb347]'
                              : 'bg-[#ff3d7f]'
                          }`}
                          style={{ width: `${staminaPct}%` }}
                        />
                      </div>
                      {isSelected && manualUnitLocked && controlMode === 'PLAYER' && (
                        <Lock className="w-2.5 h-2.5 text-[#ffb347] shrink-0" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );
};
