import {
  CareerStats,
  PlayerAccessory,
  PlayerHairStyle,
  PlayerProfileMeta,
  Role,
  SavedMatchSlot,
  SpikeReplayClip,
  StoryCampaignProgress,
  UnitStats,
} from './types';

const SAVES_KEY = 'aimv_ps6_saves_v1';
const CAREER_KEY = 'aimv_ps6_career_v1';
const REPLAY_VAULT_KEY = 'aimv_ps6_replays_v1';
const ROSTER_KEY = 'aimv_ps6_roster_v1';
const STORY_KEY = 'aimv_ps6_story_v1';

export interface RosterOverrideEntry {
  name?: string;
  stats?: Partial<UnitStats>;
  profile?: Partial<PlayerProfileMeta>;
}

const DEFAULT_CAREER: CareerStats = {
  matchesPlayed: 0,
  matchesWon: 0,
  totalSpikes: 0,
  fastestSpikeKmh: 0,
  bestSpikeOwner: 'NONE',
  totalBlocks: 0,
  totalPointsScored: 0,
};

export function getDefaultPlayerProfile(
  name: string,
  role: Role,
  jerseyNum: number,
  team: 'A' | 'B'
): PlayerProfileMeta {
  const skinTones = [0xe4b590, 0xd49d76, 0xc68b63, 0x9b6444, 0xebbda0, 0xcf946c];
  const hairs: PlayerHairStyle[] = ['SPIKY', 'SWEPT', 'BUN', 'CROP'];
  const accessories: PlayerAccessory[] =
    jerseyNum === 14 && team === 'A'
      ? ['BASEBALL_CAP']
      : role === 'Libero'
      ? ['HEADBAND']
      : role === 'Setter'
      ? ['VISOR']
      : jerseyNum === 6
      ? ['CAPTAIN_BAND']
      : role === 'Outside' || role === 'Opposite'
      ? ['ARM_SLEEVE']
      : ['HEADBAND'];

  const archetypes: Record<Role, string> = {
    Outside: 'Vertical Wing Cannon',
    Setter: 'Tactical Quantum Playmaker',
    Opposite: 'Back-Row Terminator',
    Middle: 'Skyline Roof Enforcer',
    LeftBack: 'Pipe Specialist',
    Libero: 'Floor Pancake Anchor',
  };

  const bios: Record<Role, string> = {
    Outside: 'Explosive 3-step approach specialist built for cross-court lasers and high-seam tooling.',
    Setter: 'Reads opposing blockers mid-air to disguise 1-tempo quicks and back-row pipe angles.',
    Opposite: 'Heavy-arm right-side finisher generating maximum topspin dive over triple blocks.',
    Middle: 'High-reach net sentinel engineered for rapid lateral closes and monster roof blocks.',
    LeftBack: 'Two-way perimeter receiver who launches soaring pipe attacks out of Zone 6.',
    Libero: 'Relentless defensive engine turning 115 km/h spikes into pinpoint 3-point passes.',
  };

  const idx = (jerseyNum + (team === 'A' ? 0 : 3)) % skinTones.length;
  const hairIdx = (jerseyNum + (team === 'A' ? 1 : 2)) % hairs.length;
  const heightScale =
    role === 'Middle' ? 1.07 : role === 'Opposite' ? 1.04 : role === 'Outside' ? 1.02 : role === 'Libero' ? 0.94 : 0.99;

  return {
    archetype: archetypes[role],
    bio: `${name} (${team === 'A' ? 'Cyan Storm' : 'Vice Coral'}) · ${bios[role]}`,
    accessory: accessories[0],
    hairStyle: hairs[hairIdx],
    skinToneHex: skinTones[idx],
    heightScale,
  };
}

/**
 * Deterministic prompt-to-athlete compiler (mirrors AI Brain Injector console pattern)
 * Lets players type natural language prompts to reshape an athlete's stats, gear, and archetype.
 */
export function compileAthleteFromPrompt(prompt: string, currentStats: UnitStats, currentProfile: PlayerProfileMeta): {
  stats: UnitStats;
  profile: PlayerProfileMeta;
  summary: string;
} {
  const p = prompt.toLowerCase();
  const nextStats: UnitStats = { ...currentStats };
  const nextProfile: PlayerProfileMeta = { ...currentProfile };

  if (/cannon|power|spike|laser|smash|heavy|titan/.test(p)) {
    nextStats.power = Math.min(1.65, Number((currentStats.power + 0.18).toFixed(2)));
    nextStats.vertical = Math.min(6.7, Number((currentStats.vertical + 0.35).toFixed(2)));
    nextProfile.archetype = 'Overdrive Spike Cannon';
    nextProfile.accessory = 'ARM_SLEEVE';
  } else if (/block|wall|roof|giant|tall|middle/.test(p)) {
    nextStats.vertical = Math.min(6.8, Number((currentStats.vertical + 0.45).toFixed(2)));
    nextStats.awareness = Math.min(1.35, Number((currentStats.awareness + 0.12).toFixed(2)));
    nextProfile.heightScale = Math.min(1.12, Number((currentProfile.heightScale + 0.04).toFixed(2)));
    nextProfile.archetype = 'Skyline Roof Titan';
    nextProfile.accessory = 'HEADBAND';
  } else if (/ninja|cyber|speed|dig|libero|reflex|pancake|quick/.test(p)) {
    nextStats.awareness = Math.min(1.4, Number((currentStats.awareness + 0.2).toFixed(2)));
    nextStats.accuracy = Math.min(1.4, Number((currentStats.accuracy + 0.18).toFixed(2)));
    nextProfile.archetype = 'Cybernetic Reflex Specialist';
    nextProfile.accessory = 'VISOR';
  } else if (/captain|setter|precision|sniper|brain/.test(p)) {
    nextStats.accuracy = Math.min(1.42, Number((currentStats.accuracy + 0.22).toFixed(2)));
    nextStats.awareness = Math.min(1.35, Number((currentStats.awareness + 0.15).toFixed(2)));
    nextProfile.archetype = 'Quantum Tactician';
    nextProfile.accessory = 'CAPTAIN_BAND';
  } else {
    nextStats.power = Math.min(1.55, Number((currentStats.power + 0.1).toFixed(2)));
    nextStats.vertical = Math.min(6.5, Number((currentStats.vertical + 0.25).toFixed(2)));
    nextProfile.archetype = 'Vice Coast All-Star';
  }

  if (/visor|cyber|neon/.test(p)) nextProfile.accessory = 'VISOR';
  if (/cap|hat|baseball/.test(p)) nextProfile.accessory = 'BASEBALL_CAP';
  if (/headband|bandana/.test(p)) nextProfile.accessory = 'HEADBAND';
  if (/sleeve/.test(p)) nextProfile.accessory = 'ARM_SLEEVE';
  if (/captain/.test(p)) nextProfile.accessory = 'CAPTAIN_BAND';

  if (/spiky/.test(p)) nextProfile.hairStyle = 'SPIKY';
  else if (/bun/.test(p)) nextProfile.hairStyle = 'BUN';
  else if (/swept/.test(p)) nextProfile.hairStyle = 'SWEPT';
  else if (/crop|buzz/.test(p)) nextProfile.hairStyle = 'CROP';

  nextProfile.bio = `Compiled from directive: "${prompt.trim().slice(0, 72)}"`;
  return {
    stats: nextStats,
    profile: nextProfile,
    summary: `${nextProfile.archetype} · PWR ${Math.round(nextStats.power * 100)} · VERT ${nextStats.vertical.toFixed(1)}`,
  };
}

export function loadSavedMatches(): SavedMatchSlot[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMatchSlot(slot: SavedMatchSlot): SavedMatchSlot[] {
  const existing = loadSavedMatches().filter((s) => s.id !== slot.id);
  const updated = [slot, ...existing].slice(0, 6);
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(updated));
  } catch {
    // Storage quota guard
  }
  return updated;
}

export function deleteMatchSlot(id: string): SavedMatchSlot[] {
  const updated = loadSavedMatches().filter((s) => s.id !== id);
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
  return updated;
}

export function loadCareerStats(): CareerStats {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (!raw) return { ...DEFAULT_CAREER };
    return { ...DEFAULT_CAREER, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CAREER };
  }
}

export function updateCareerStats(updater: (prev: CareerStats) => CareerStats): CareerStats {
  const next = updater(loadCareerStats());
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function loadReplayVaultClips(): SpikeReplayClip[] {
  try {
    const raw = localStorage.getItem(REPLAY_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReplayVaultClips(clips: SpikeReplayClip[]): void {
  try {
    // Persist up to top 6 clips (including lightweight frames) cleanly within localStorage limits
    const trimmed = clips.slice(0, 6);
    localStorage.setItem(REPLAY_VAULT_KEY, JSON.stringify(trimmed));
  } catch {
    // If quota is tight, persist metadata + downsampled keyframes
    try {
      const compact = clips.slice(0, 4).map((c) => ({
        ...c,
        frames: c.frames.filter((_, idx) => idx % 2 === 0 || c.frames[idx]?.strikeEvent || c.frames[idx]?.impactEvent),
      }));
      localStorage.setItem(REPLAY_VAULT_KEY, JSON.stringify(compact));
    } catch {
      // Ignore
    }
  }
}

export function loadRosterOverrides(): Record<number, RosterOverrideEntry> {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function saveRosterOverride(unitId: number, entry: RosterOverrideEntry): void {
  const all = loadRosterOverrides();
  all[unitId] = {
    name: entry.name ?? all[unitId]?.name,
    stats: { ...all[unitId]?.stats, ...entry.stats },
    profile: { ...all[unitId]?.profile, ...entry.profile },
  };
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(all));
  } catch {
    // Ignore
  }
}

const DEFAULT_STORY_PROGRESS: StoryCampaignProgress = {
  unlockedChapter: 1,
  completedChapters: [],
  chapterStars: {},
};

export function loadStoryProgress(): StoryCampaignProgress {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return { ...DEFAULT_STORY_PROGRESS };
    const parsed = JSON.parse(raw);
    return {
      unlockedChapter: Number(parsed.unlockedChapter) || 1,
      completedChapters: Array.isArray(parsed.completedChapters) ? parsed.completedChapters : [],
      chapterStars: parsed.chapterStars || {},
    };
  } catch {
    return { ...DEFAULT_STORY_PROGRESS };
  }
}

export function saveStoryProgress(progress: StoryCampaignProgress): void {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify(progress));
  } catch {
    // Ignore
  }
}

export function recordStoryChapterVictory(
  chapterNumber: number,
  starsEarned: number,
  totalChapters: number
): StoryCampaignProgress {
  const prev = loadStoryProgress();
  const completed = prev.completedChapters.includes(chapterNumber)
    ? prev.completedChapters
    : [...prev.completedChapters, chapterNumber];
  const nextUnlocked = Math.min(
    totalChapters,
    Math.max(prev.unlockedChapter, chapterNumber + 1)
  );
  const next: StoryCampaignProgress = {
    unlockedChapter: nextUnlocked,
    completedChapters: completed,
    chapterStars: {
      ...prev.chapterStars,
      [chapterNumber]: Math.max(prev.chapterStars[chapterNumber] || 0, starsEarned),
    },
  };
  saveStoryProgress(next);
  return next;
}
