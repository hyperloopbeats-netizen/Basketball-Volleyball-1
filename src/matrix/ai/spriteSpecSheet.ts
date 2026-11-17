import * as THREE from 'three';
import {
  AnimState,
  CelebrationStyle,
  IndividualBehaviorPattern,
  LegsToFloorTelemetry,
  PlayerParts,
  SpriteSpecEntry,
  SpriteSpecId,
  Unit,
} from '../../types';

/**
 * FULL SPEC SHEET OF MOVEMENT, PASSING, REACTION & CELEBRATION SPRITES (4x4 ATLAS = 16 SPECS)
 * Row 0: Locomotion & Approach Movement Matrix
 * Row 1: Vertical Launch, Pancake Dive, Split-Step & Braking Reaction Matrix
 * Row 2: Ball Contact Passing, Setting, Spiking & Block Matrix
 * Row 3: Floor Recovery & Celebration Matrix
 */
export const MOVEMENT_REACTION_SPRITE_SPECS: Record<SpriteSpecId, SpriteSpecEntry> = {
  READY_COIL: {
    id: 'READY_COIL',
    category: 'MOVEMENT',
    label: 'Ready Athletic Coil',
    atlasCol: 0,
    atlasRow: 0,
    colorHex: 0x00f0ff,
    baseScale: 0.92,
    baseOpacity: 0.28,
    strideCadenceMult: 1.0,
    kneeFlexTargetDeg: 22,
    hipDropRatio: 0.05,
    footprintScuffRate: 0.0,
  },
  LATERAL_SHUFFLE: {
    id: 'LATERAL_SHUFFLE',
    category: 'MOVEMENT',
    label: 'Lateral Glide Shuffle',
    atlasCol: 1,
    atlasRow: 0,
    colorHex: 0x38bdf8,
    baseScale: 1.02,
    baseOpacity: 0.44,
    strideCadenceMult: 1.12,
    kneeFlexTargetDeg: 30,
    hipDropRatio: 0.08,
    footprintScuffRate: 0.2,
  },
  SPRINT_PURSUIT: {
    id: 'SPRINT_PURSUIT',
    category: 'MOVEMENT',
    label: 'High-Velocity Sprint',
    atlasCol: 2,
    atlasRow: 0,
    colorHex: 0x00f0ff,
    baseScale: 1.16,
    baseOpacity: 0.62,
    strideCadenceMult: 1.28,
    kneeFlexTargetDeg: 46,
    hipDropRatio: 0.1,
    footprintScuffRate: 0.68,
  },
  RUNWAY_3STEP_APPROACH: {
    id: 'RUNWAY_3STEP_APPROACH',
    category: 'MOVEMENT',
    label: '3-Step Runway Launch',
    atlasCol: 3,
    atlasRow: 0,
    colorHex: 0xffb347,
    baseScale: 1.22,
    baseOpacity: 0.72,
    strideCadenceMult: 1.35,
    kneeFlexTargetDeg: 52,
    hipDropRatio: 0.14,
    footprintScuffRate: 0.88,
  },
  AERIAL_APEX_FLOAT: {
    id: 'AERIAL_APEX_FLOAT',
    category: 'REACTION',
    label: 'Aerial Apex Halo',
    atlasCol: 0,
    atlasRow: 1,
    colorHex: 0x38bdf8,
    baseScale: 1.04,
    baseOpacity: 0.56,
    strideCadenceMult: 0.85,
    kneeFlexTargetDeg: 28,
    hipDropRatio: 0.0,
    footprintScuffRate: 0.0,
  },
  PASS_PANCAKE_DIVE: {
    id: 'PASS_PANCAKE_DIVE',
    category: 'PASSING',
    label: 'Pancake Dive Extension',
    atlasCol: 1,
    atlasRow: 1,
    colorHex: 0xffb347,
    baseScale: 1.32,
    baseOpacity: 0.78,
    strideCadenceMult: 1.4,
    kneeFlexTargetDeg: 34,
    hipDropRatio: 0.58,
    footprintScuffRate: 1.0,
  },
  SPLIT_STEP_REACT: {
    id: 'SPLIT_STEP_REACT',
    category: 'REACTION',
    label: 'Split-Step Neural Hop',
    atlasCol: 2,
    atlasRow: 1,
    colorHex: 0x34d399,
    baseScale: 1.08,
    baseOpacity: 0.64,
    strideCadenceMult: 1.2,
    kneeFlexTargetDeg: 36,
    hipDropRatio: 0.11,
    footprintScuffRate: 0.45,
  },
  DECEL_BRAKE_PLANT: {
    id: 'DECEL_BRAKE_PLANT',
    category: 'REACTION',
    label: 'Heel-Toe Brake Plant',
    atlasCol: 3,
    atlasRow: 1,
    colorHex: 0xff6b1a,
    baseScale: 1.18,
    baseOpacity: 0.74,
    strideCadenceMult: 0.95,
    kneeFlexTargetDeg: 48,
    hipDropRatio: 0.17,
    footprintScuffRate: 0.95,
  },
  PASS_FOREARM_PLATFORM: {
    id: 'PASS_FOREARM_PLATFORM',
    category: 'PASSING',
    label: 'Forearm Pass Lock',
    atlasCol: 0,
    atlasRow: 2,
    colorHex: 0x00f0ff,
    baseScale: 1.12,
    baseOpacity: 0.68,
    strideCadenceMult: 0.9,
    kneeFlexTargetDeg: 44,
    hipDropRatio: 0.2,
    footprintScuffRate: 0.35,
  },
  SET_TEMPO_RELEASE: {
    id: 'SET_TEMPO_RELEASE',
    category: 'PASSING',
    label: 'Tempo Set Release',
    atlasCol: 1,
    atlasRow: 2,
    colorHex: 0x34d399,
    baseScale: 1.1,
    baseOpacity: 0.66,
    strideCadenceMult: 1.05,
    kneeFlexTargetDeg: 20,
    hipDropRatio: 0.06,
    footprintScuffRate: 0.22,
  },
  STRIKE_THUNDER_SPIKE: {
    id: 'STRIKE_THUNDER_SPIKE',
    category: 'REACTION',
    label: 'Thunder Spike Snap',
    atlasCol: 2,
    atlasRow: 2,
    colorHex: 0xff3d7f,
    baseScale: 1.36,
    baseOpacity: 0.85,
    strideCadenceMult: 1.45,
    kneeFlexTargetDeg: 24,
    hipDropRatio: 0.04,
    footprintScuffRate: 0.9,
  },
  BLOCK_NET_WALL: {
    id: 'BLOCK_NET_WALL',
    category: 'REACTION',
    label: 'Roof Block Seal',
    atlasCol: 3,
    atlasRow: 2,
    colorHex: 0xff6b1a,
    baseScale: 1.24,
    baseOpacity: 0.78,
    strideCadenceMult: 1.0,
    kneeFlexTargetDeg: 18,
    hipDropRatio: 0.02,
    footprintScuffRate: 0.4,
  },
  GETUP_RECOVER: {
    id: 'GETUP_RECOVER',
    category: 'MOVEMENT',
    label: 'Floor Push-Up Rise',
    atlasCol: 0,
    atlasRow: 3,
    colorHex: 0x94a3b8,
    baseScale: 1.06,
    baseOpacity: 0.54,
    strideCadenceMult: 0.85,
    kneeFlexTargetDeg: 58,
    hipDropRatio: 0.36,
    footprintScuffRate: 0.55,
  },
  CELEB_ROAR_JUMP: {
    id: 'CELEB_ROAR_JUMP',
    category: 'CELEBRATION',
    label: 'Victory Roar Burst',
    atlasCol: 1,
    atlasRow: 3,
    colorHex: 0xffb347,
    baseScale: 1.28,
    baseOpacity: 0.82,
    strideCadenceMult: 1.3,
    kneeFlexTargetDeg: 32,
    hipDropRatio: 0.1,
    footprintScuffRate: 0.4,
  },
  CELEB_SLIDE_GLIDE: {
    id: 'CELEB_SLIDE_GLIDE',
    category: 'CELEBRATION',
    label: 'Knee Slide & Glide Trail',
    atlasCol: 2,
    atlasRow: 3,
    colorHex: 0xff3d7f,
    baseScale: 1.3,
    baseOpacity: 0.78,
    strideCadenceMult: 1.18,
    kneeFlexTargetDeg: 68,
    hipDropRatio: 0.28,
    footprintScuffRate: 0.75,
  },
  DEFEAT_RECOVERY_BREATH: {
    id: 'DEFEAT_RECOVERY_BREATH',
    category: 'CELEBRATION',
    label: 'Post-Point Breath Reset',
    atlasCol: 3,
    atlasRow: 3,
    colorHex: 0x64748b,
    baseScale: 0.9,
    baseOpacity: 0.32,
    strideCadenceMult: 0.75,
    kneeFlexTargetDeg: 26,
    hipDropRatio: 0.12,
    footprintScuffRate: 0.0,
  },
};

export const SPRITE_SPEC_LIST: SpriteSpecEntry[] = Object.values(MOVEMENT_REACTION_SPRITE_SPECS);

/**
 * Draws the vector glyph for any of the 16 Sprite Specs centered at (0, 0) in a 256x256 nominal space.
 */
export function drawSpriteGlyphById(ctx: CanvasRenderingContext2D, specId: SpriteSpecId) {
  switch (specId) {
    case 'READY_COIL':
      ctx.strokeStyle = 'rgba(255,255,255,0.78)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0.28, Math.PI * 2 - 0.28);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, 108);
      ctx.lineTo(-18, 80);
      ctx.lineTo(18, 80);
      ctx.closePath();
      ctx.fill();
      break;
    case 'LATERAL_SHUFFLE':
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 74, 0.35, Math.PI - 0.35);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.48)';
      ctx.beginPath();
      ctx.arc(0, -18, 50, 0.45, Math.PI - 0.45);
      ctx.stroke();
      break;
    case 'SPRINT_PURSUIT':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const yOff of [-16, 36]) {
        ctx.globalAlpha = yOff > 0 ? 0.96 : 0.62;
        ctx.beginPath();
        ctx.moveTo(-66, yOff - 34);
        ctx.lineTo(0, yOff + 28);
        ctx.lineTo(66, yOff - 34);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-84, -64);
      ctx.lineTo(-84, 24);
      ctx.moveTo(84, -64);
      ctx.lineTo(84, 24);
      ctx.stroke();
      break;
    case 'RUNWAY_3STEP_APPROACH':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, 88, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(0, 72);
      ctx.lineTo(-42, 8);
      ctx.lineTo(-16, 8);
      ctx.lineTo(-16, -60);
      ctx.lineTo(16, -60);
      ctx.lineTo(16, 8);
      ctx.lineTo(42, 8);
      ctx.closePath();
      ctx.fill();
      break;
    case 'AERIAL_APEX_FLOAT': {
      const grad = ctx.createRadialGradient(0, 0, 18, 0, 0, 102);
      grad.addColorStop(0, 'rgba(255,255,255,0.16)');
      grad.addColorStop(0.68, 'rgba(255,255,255,0.88)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 102, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'PASS_PANCAKE_DIVE':
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.rotate(i * 0.34);
        ctx.beginPath();
        ctx.moveTo(0, 94);
        ctx.lineTo(-14, 34);
        ctx.lineTo(14, 34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI);
      ctx.stroke();
      break;
    case 'SPLIT_STEP_REACT':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 48, -52);
        ctx.lineTo(s * 92, 0);
        ctx.lineTo(s * 48, 52);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'DECEL_BRAKE_PLANT':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      for (const r of [48, 84]) {
        ctx.globalAlpha = r < 60 ? 0.92 : 0.56;
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      break;
    case 'PASS_FOREARM_PLATFORM':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-64, -36);
      ctx.lineTo(0, 64);
      ctx.lineTo(64, -36);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 8, 72, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
      break;
    case 'SET_TEMPO_RELEASE':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, 76, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'STRIKE_THUNDER_SPIKE':
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.moveTo(0, 102);
        ctx.lineTo(-10, 42);
        ctx.lineTo(10, 42);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'BLOCK_NET_WALL':
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(-86, -18, 172, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-66, 22, 132, 14);
      break;
    case 'GETUP_RECOVER':
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'CELEB_ROAR_JUMP':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 36);
        ctx.lineTo(0, 96);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'CELEB_SLIDE_GLIDE':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-64, 52);
      ctx.quadraticCurveTo(0, -48, 64, 52);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-42, 76);
      ctx.lineTo(42, 76);
      ctx.stroke();
      break;
    case 'DEFEAT_RECOVERY_BREATH':
      ctx.strokeStyle = 'rgba(255,255,255,0.68)';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 16]);
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
}

/**
 * Renders a crisp mini Sprite Spec UI badge onto an HTML canvas (for Player-Picker Side Panel).
 */
export function renderSpriteSpecIcon(
  canvas: HTMLCanvasElement,
  specId: SpriteSpecId,
  tintCss: string
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Tinted athletic plate backdrop
  ctx.fillStyle = 'rgba(9, 6, 18, 0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = tintCss;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  const scale = Math.min(w, h) / 245;
  ctx.scale(scale, scale);
  drawSpriteGlyphById(ctx, specId);
  ctx.restore();
}

/**
 * Generates a crisp 1024x1024 (4x4, 256x256 per spec) procedural athletic sprite atlas.
 */
export function buildSpriteSpecAtlasTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const cellSize = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  for (const spec of SPRITE_SPEC_LIST) {
    ctx.save();
    ctx.translate(spec.atlasCol * cellSize + cellSize * 0.5, spec.atlasRow * cellSize + cellSize * 0.5);
    drawSpriteGlyphById(ctx, spec.id);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Assigns each individual athlete a unique behavioral signature across
 * Movement Matrix, Passing Matrix, and Celebration Matrix.
 */
export function assignIndividualBehaviorPattern(u: Unit): IndividualBehaviorPattern {
  const isHero14 = u.team === 'A' && u.jerseyNumber === 14 && !u.isLibero;
  const seed = (u.jerseyNumber * 17 + (u.team === 'A' ? 3 : 11)) % 12;

  if (isHero14) {
    return {
      movementPattern: 'EXPLOSIVE_CUTTER',
      passingPattern: 'LASER_PLATFORM',
      primaryCelebration: 'FIST_PUMP_ROAR',
      secondaryCelebration: 'KNEE_SLIDE_ROAR',
      defeatStyle: 'HANDS_ON_HIPS',
      accelMult: 1.14,
      sprintBankMult: 1.18,
      splitStepHeight: 0.1,
      strideLengthMult: 1.06,
      voronoiCushionM: 1.48,
      platformStability: 0.94,
      diveCommitRadius: 3.4,
      diveMinBallY: 0.78,
      setTempoMult: 0.96,
      overheadBias: 0.32,
      passSpreadScale: 0.72,
      celebrationTempoMult: 1.15,
      huddleRadiusBias: -0.15,
      jumpImpulseBoost: 0.55,
    };
  }

  if (u.isLibero) {
    return {
      movementPattern: 'GLIDE_LIBERO',
      passingPattern: 'PANCAKE_SWEEPER',
      primaryCelebration: 'AEROPLANE_GLIDE',
      secondaryCelebration: 'HIGH_FIVE_BOUNCE',
      defeatStyle: 'HANDS_ON_KNEES',
      accelMult: 1.18,
      sprintBankMult: 1.08,
      splitStepHeight: 0.095,
      strideLengthMult: 0.94,
      voronoiCushionM: 1.38,
      platformStability: 0.98,
      diveCommitRadius: 3.9,
      diveMinBallY: 0.86,
      setTempoMult: 1.02,
      overheadBias: 0.18,
      passSpreadScale: 0.55,
      celebrationTempoMult: 1.2,
      huddleRadiusBias: 0.1,
      jumpImpulseBoost: 0.4,
    };
  }

  if (u.role === 'Setter') {
    return {
      movementPattern: 'TEMPO_ARCHITECT',
      passingPattern: 'QUICK_HANDS_SETTER',
      primaryCelebration: 'CHEST_BUMP_SYNC',
      secondaryCelebration: 'TEAM_WAVE_SALUTE',
      defeatStyle: 'TOWEL_BREATH',
      accelMult: 1.1,
      sprintBankMult: 0.95,
      splitStepHeight: 0.08,
      strideLengthMult: 0.98,
      voronoiCushionM: 1.44,
      platformStability: 0.95,
      diveCommitRadius: 2.9,
      diveMinBallY: 0.68,
      setTempoMult: 0.88,
      overheadBias: 0.85,
      passSpreadScale: 0.62,
      celebrationTempoMult: 1.04,
      huddleRadiusBias: -0.2,
      jumpImpulseBoost: 0.25,
    };
  }

  if (u.role === 'Middle') {
    return {
      movementPattern: 'SHADOW_GUARD',
      passingPattern: 'TACTICAL_DEFLECTOR',
      primaryCelebration: 'TEAM_HUDDLE_JUMP',
      secondaryCelebration: 'CHEST_BUMP_SYNC',
      defeatStyle: 'HANDS_ON_HIPS',
      accelMult: 1.02,
      sprintBankMult: 0.92,
      splitStepHeight: 0.075,
      strideLengthMult: 1.1,
      voronoiCushionM: 1.54,
      platformStability: 0.84,
      diveCommitRadius: 2.5,
      diveMinBallY: 0.6,
      setTempoMult: 0.92,
      overheadBias: 0.4,
      passSpreadScale: 0.92,
      celebrationTempoMult: 0.96,
      huddleRadiusBias: 0.05,
      jumpImpulseBoost: 0.48,
    };
  }

  if (u.role === 'Opposite') {
    return {
      movementPattern: 'POWER_PENDULUM',
      passingPattern: 'HIGH_ARC_ANCHOR',
      primaryCelebration: 'SPIKE_FLEX_BOW',
      secondaryCelebration: 'FIST_PUMP_ROAR',
      defeatStyle: 'HANDS_ON_KNEES',
      accelMult: 1.06,
      sprintBankMult: 1.15,
      splitStepHeight: 0.088,
      strideLengthMult: 1.08,
      voronoiCushionM: 1.5,
      platformStability: 0.88,
      diveCommitRadius: 3.1,
      diveMinBallY: 0.72,
      setTempoMult: 1.05,
      overheadBias: 0.28,
      passSpreadScale: 0.82,
      celebrationTempoMult: 1.08,
      huddleRadiusBias: 0.14,
      jumpImpulseBoost: 0.6,
    };
  }

  // Outside / LeftBack individual variation by jersey seed
  const outsideCelebs: CelebrationStyle[] = [
    'HIGH_FIVE_BOUNCE',
    'TEAM_WAVE_SALUTE',
    'KNEE_SLIDE_ROAR',
    'FIST_PUMP_ROAR',
  ];
  return {
    movementPattern: seed % 2 === 0 ? 'ACE_COUNTER' : 'EXPLOSIVE_CUTTER',
    passingPattern: seed % 2 === 0 ? 'LASER_PLATFORM' : 'HIGH_ARC_ANCHOR',
    primaryCelebration: outsideCelebs[seed % outsideCelebs.length],
    secondaryCelebration: outsideCelebs[(seed + 1) % outsideCelebs.length],
    defeatStyle: seed % 3 === 0 ? 'TOWEL_BREATH' : 'HANDS_ON_KNEES',
    accelMult: 1.04 + (seed % 4) * 0.025,
    sprintBankMult: 1.05 + (seed % 3) * 0.04,
    splitStepHeight: 0.082 + (seed % 3) * 0.008,
    strideLengthMult: 1.0 + (seed % 3) * 0.03,
    voronoiCushionM: 1.44 + (seed % 2) * 0.06,
    platformStability: 0.89 + (seed % 3) * 0.03,
    diveCommitRadius: 3.25 + (seed % 3) * 0.2,
    diveMinBallY: 0.72,
    setTempoMult: 1.0,
    overheadBias: 0.35,
    passSpreadScale: 0.78,
    celebrationTempoMult: 0.98 + (seed % 4) * 0.06,
    huddleRadiusBias: ((seed % 3) - 1) * 0.12,
    jumpImpulseBoost: 0.35 + (seed % 3) * 0.12,
  };
}

// Analytical Rig Segment Constants (matching buildPlayerMesh in engine.ts)
const RIG_HIP_SOCKET_DROP = 0.02;
const RIG_THIGH_LEN = 0.38;
const RIG_SHIN_LEN = 0.39;
const RIG_SOLE_THICK = 0.054;
const RIG_HALF_TOE_LEN = 0.068;

/**
 * LEGS-TO-FLOOR FORMULA:
 * Computes the exact vertical hip elevation & compensatory ankle pitch in local group units
 * so the lower/weight-bearing shoe sole sits cleanly flush on y = 0 (court surface) without
 * sinking into the floor or floating, while knees/hips stay above ground during floor dives/slides.
 */
export function solveLegsToFloor(
  p: PlayerParts,
  animState: AnimState,
  isJumping: boolean,
  heightScale: number,
  celebrationStyle: CelebrationStyle | undefined,
  outTelemetry: LegsToFloorTelemetry
): number {
  const thL = p.legUpperL.rotation.x;
  const knL = p.legLowerL.rotation.x;
  const thR = p.legUpperR.rotation.x;
  const knR = p.legLowerR.rotation.x;

  // Vertical reach from hip socket down to ankle joint for each leg
  const dropAnkleL = RIG_THIGH_LEN * Math.cos(thL) + RIG_SHIN_LEN * Math.cos(thL + knL);
  const dropAnkleR = RIG_THIGH_LEN * Math.cos(thR) + RIG_SHIN_LEN * Math.cos(thR + knR);

  // Planted foot determination (greater downward reach is closer to/planted on floor)
  const diff = dropAnkleL - dropAnkleR;
  const planted: 'L' | 'R' | 'BOTH' | 'AIR' = isJumping
    ? 'AIR'
    : Math.abs(diff) < 0.025
    ? 'BOTH'
    : diff > 0
    ? 'L'
    : 'R';

  // Compensatory ankle flattening when grounded so sole rests cleanly on court plane
  if (!isJumping && animState !== 'DIVE_PANCAKE' && animState !== 'FALLEN_FLOOR') {
    const compL = -(thL + knL) * (planted === 'L' || planted === 'BOTH' ? 0.85 : 0.45);
    const compR = -(thR + knR) * (planted === 'R' || planted === 'BOTH' ? 0.85 : 0.45);
    p.shoesL.rotation.x = THREE.MathUtils.clamp(compL, -0.58, 0.58);
    p.shoesR.rotation.x = THREE.MathUtils.clamp(compR, -0.58, 0.58);
  }

  const footPitchL = thL + knL + p.shoesL.rotation.x;
  const footPitchR = thR + knR + p.shoesR.rotation.x;

  const soleDropL =
    RIG_SOLE_THICK * Math.cos(footPitchL) + RIG_HALF_TOE_LEN * Math.abs(Math.sin(footPitchL));
  const soleDropR =
    RIG_SOLE_THICK * Math.cos(footPitchR) + RIG_HALF_TOE_LEN * Math.abs(Math.sin(footPitchR));

  const totalReachL = RIG_HIP_SOCKET_DROP + dropAnkleL + soleDropL;
  const totalReachR = RIG_HIP_SOCKET_DROP + dropAnkleR + soleDropR;

  // Knee pad floor clearance check (knee pads have ~0.066 radius)
  const kneeClearanceL = RIG_HIP_SOCKET_DROP + RIG_THIGH_LEN * Math.cos(thL) + 0.072;
  const kneeClearanceR = RIG_HIP_SOCKET_DROP + RIG_THIGH_LEN * Math.cos(thR) + 0.072;

  let solvedHipY: number;
  let clampApplied = false;

  if (animState === 'FALLEN_FLOOR') {
    solvedHipY = 0.23;
    clampApplied = true;
  } else if (animState === 'DIVE_PANCAKE') {
    solvedHipY = Math.max(0.28, Math.max(kneeClearanceL, kneeClearanceR) * 0.72);
    clampApplied = true;
  } else if (animState === 'CELEBRATION' && celebrationStyle === 'KNEE_SLIDE_ROAR') {
    solvedHipY = Math.max(0.49, Math.max(kneeClearanceL, kneeClearanceR));
    clampApplied = true;
  } else if (isJumping) {
    // Airborne: natural suspended hip height allowing clean knee-tuck without shifting root
    const airReach = Math.max(totalReachL, totalReachR);
    solvedHipY = animState === 'LONG_JUMP_LEAP'
      ? THREE.MathUtils.clamp(airReach * 0.92, 0.52, 0.8)
      : THREE.MathUtils.clamp(airReach, 0.58, 0.855);
  } else {
    // Grounded analytical formula: planted sole rests directly at y = 0.002m!
    const maxVerticalDrop = Math.max(totalReachL, totalReachR, kneeClearanceL, kneeClearanceR);
    solvedHipY = Math.max(0.24, maxVerticalDrop + 0.002);
    if (solvedHipY <= 0.25) clampApplied = true;
  }

  p.hips.position.y = solvedHipY;

  const scale = heightScale || 1.0;
  const gapL = Math.max(0, (solvedHipY - totalReachL) * scale);
  const gapR = Math.max(0, (solvedHipY - totalReachR) * scale);

  outTelemetry.hipHeightM = Number((solvedHipY * scale).toFixed(3));
  outTelemetry.leftFootFloorGapM = Number(gapL.toFixed(3));
  outTelemetry.rightFootFloorGapM = Number(gapR.toFixed(3));
  outTelemetry.kneeFlexLeftDeg = Math.round(THREE.MathUtils.radToDeg(Math.max(0, knL)));
  outTelemetry.kneeFlexRightDeg = Math.round(THREE.MathUtils.radToDeg(Math.max(0, knR)));
  outTelemetry.plantedFoot = planted;
  outTelemetry.groundClampApplied = clampApplied;

  return solvedHipY;
}
