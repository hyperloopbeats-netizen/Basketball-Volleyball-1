import {
  EnvironmentTheme,
  MatchEvolutionStage,
  SyntheticStorylineBeat,
  SyntheticStorylineState,
} from '../types';

const ACT_DEFS: Record<
  1 | 2 | 3 | 4,
  { title: string; nextXp: number; unlockTitle: string; arrivalLine: string }
> = {
  1: {
    title: 'ACT I · HARBOUR CALL',
    nextXp: 100,
    unlockTitle: 'Orange & Black AIM Vest + Cap Debut',
    arrivalLine:
      'Ishikawa steps onto Coal Harbour blue in the black-and-orange AIM vest and cap — eyes locked on the billboard.',
  },
  2: {
    title: 'ACT II · AIM PROVING GROUND',
    nextXp: 240,
    unlockTitle: 'Reactive Tempo & Thunder Arm Sync',
    arrivalLine:
      'Every pass feeds Ishikawa’s rhythm — the stadium speakers rattle and Vancouver’s skyline answers beat for beat.',
  },
  3: {
    title: 'ACT III · STORM BREAKER',
    nextXp: 420,
    unlockTitle: 'Gale-Force Spike & Weather Mastery',
    arrivalLine:
      'Harbour mist and rain descend over the court, yet Ishikawa’s AIM #14 silhouette cuts sharper through every gust.',
  },
  4: {
    title: 'ACT IV · PACIFIC LEGEND',
    nextXp: 650,
    unlockTitle: 'Vancouver Crown Immortal',
    arrivalLine:
      'All four stands roar in sync with the anthem — #14 Ishikawa owns Coal Harbour Arena.',
  },
};

/**
 * Autonomous Synthetic Storyline Evolution Engine
 * Dynamically evolves #14 ISHIKAWA's narrative arc, emotional state, and milestone log
 * in direct response to intro look-up, kickoff, thunder spikes, digs, weather shifts, and points.
 */
export class SyntheticStorylineEngine {
  private state: SyntheticStorylineState;
  private beatCounter = 0;
  private lastWeatherRecorded: MatchEvolutionStage | null = null;
  private bestStreakSeen = 0;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): SyntheticStorylineState {
    return {
      heroName: 'ISHIKAWA',
      heroJersey: 14,
      heroGearLabel: 'ORANGE & BLACK AIM VEST · BASEBALL CAP',
      actNumber: 1,
      actTitle: ACT_DEFS[1].title,
      evolutionXp: 20,
      nextActXp: ACT_DEFS[1].nextXp,
      auraLevel: 1,
      heroMood: 'FOCUSED',
      activeLine: ACT_DEFS[1].arrivalLine,
      currentBeatHeadline: 'HARBOUR CALL',
      milestonesUnlocked: ['AIM #14 Gear Equipped'],
      recentBeats: [
        {
          id: 'beat-init',
          actNumber: 1,
          headline: 'HARBOUR CALL',
          narrative: 'Ishikawa adjusts his orange-and-black baseball cap beneath the AIM Vancouver EQ lights.',
          timestamp: 'PRE-MATCH',
          triggerTag: 'ARRIVAL',
        },
      ],
    };
  }

  public getState(): SyntheticStorylineState {
    return {
      ...this.state,
      milestonesUnlocked: [...this.state.milestonesUnlocked],
      recentBeats: [...this.state.recentBeats],
    };
  }

  private pushBeat(headline: string, narrative: string, triggerTag: string, xpGain: number) {
    this.beatCounter++;
    this.state.evolutionXp += xpGain;
    this.state.currentBeatHeadline = headline;
    this.state.activeLine = narrative;

    const beat: SyntheticStorylineBeat = {
      id: `beat-${this.beatCounter}-${Date.now()}`,
      actNumber: this.state.actNumber,
      headline,
      narrative,
      timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
      triggerTag,
    };
    this.state.recentBeats = [beat, ...this.state.recentBeats].slice(0, 6);

    // Check Act evolution thresholds autonomously
    while (this.state.actNumber < 4 && this.state.evolutionXp >= ACT_DEFS[this.state.actNumber].nextXp) {
      const nextAct = (this.state.actNumber + 1) as 2 | 3 | 4;
      this.state.actNumber = nextAct;
      this.state.actTitle = ACT_DEFS[nextAct].title;
      this.state.nextActXp = ACT_DEFS[nextAct].nextXp;
      this.state.auraLevel = nextAct;
      const unlock = ACT_DEFS[nextAct].unlockTitle;
      if (!this.state.milestonesUnlocked.includes(unlock)) {
        this.state.milestonesUnlocked.push(unlock);
      }
      this.state.heroMood = nextAct >= 4 ? 'UNSTOPPABLE' : nextAct === 3 ? 'LOCKED_IN' : 'FIRED_UP';
      const actBeat: SyntheticStorylineBeat = {
        id: `act-${nextAct}-${Date.now()}`,
        actNumber: nextAct,
        headline: `EVOLVED · ${ACT_DEFS[nextAct].title}`,
        narrative: ACT_DEFS[nextAct].arrivalLine,
        timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        triggerTag: 'ACT_UP',
      };
      this.state.activeLine = ACT_DEFS[nextAct].arrivalLine;
      this.state.currentBeatHeadline = actBeat.headline;
      this.state.recentBeats = [actBeat, ...this.state.recentBeats].slice(0, 6);
    }
  }

  public onIntroLookUp() {
    this.state.heroMood = 'FOCUSED';
    this.pushBeat(
      'BILLBOARD LOCK-ON',
      'Under the Coal Harbour sky, #14 Ishikawa locks eyes on AIM Vancouver — waiting for your track.',
      'INTRO',
      15
    );
  }

  public onMatchKickoff(trackName: string | null) {
    this.lastWeatherRecorded = null;
    this.bestStreakSeen = 0;
    const anthem = trackName ? trackName.replace('AIM VANCOUVER · ', '') : 'ARENA PULSE';
    this.state.heroMood = 'FIRED_UP';
    this.pushBeat(
      'BALL AT HIS FEET',
      `${anthem} surges through the bowls as the volleyball rolls up to Ishikawa’s sneakers. First serve yours.`,
      'KICKOFF',
      30
    );
  }

  public onSpike(playerName: string, jersey: number, kmh: number, isHero: boolean) {
    if (kmh < 68 && !isHero) return;
    if (isHero && kmh >= 84) {
      this.state.heroMood = 'UNSTOPPABLE';
      if (!this.state.milestonesUnlocked.includes('Sonic Aim Strike (85+ km/h)')) {
        this.state.milestonesUnlocked.push('Sonic Aim Strike (85+ km/h)');
      }
      this.pushBeat(
        `THUNDER STRIKE · ${kmh} KM/H`,
        `Black-and-orange blur at the net! #14 Ishikawa crushes a ${kmh} km/h lightning bolt inside the line.`,
        'HERO_SPIKE',
        45
      );
    } else if (isHero) {
      this.state.heroMood = 'FIRED_UP';
      this.pushBeat(
        `AIM CANNON · ${kmh} KM/H`,
        `Ishikawa snaps the orange brim low and drives ${kmh} km/h cleanly past the double block.`,
        'HERO_SPIKE',
        28
      );
    } else if (kmh >= 86) {
      this.pushBeat(
        `SQUAD FIREPOWER · #${jersey}`,
        `#${jersey} ${playerName} blasts ${kmh} km/h — feeding Ishikawa’s sideline momentum.`,
        'TEAM_SPIKE',
        18
      );
    }
  }

  public onDigSave(playerName: string, jersey: number, isMiracle: boolean) {
    if (!isMiracle && jersey !== 14) return;
    this.state.heroMood = 'LOCKED_IN';
    if (isMiracle && !this.state.milestonesUnlocked.includes('Zero-Inch Pancake')) {
      this.state.milestonesUnlocked.push('Zero-Inch Pancake');
    }
    this.pushBeat(
      isMiracle ? 'FLOOR PANCAKE MIRACLE' : 'CLUTCH DIG UP',
      `#${jersey} ${playerName} refuses to let Coal Harbour touch glass — sliding steel keeps the AIM rally alive!`,
      'DEFENSE',
      isMiracle ? 36 : 16
    );
  }

  public onPointScored(winner: 'A' | 'B', scoreA: number, scoreB: number, comboStreak: number) {
    if (winner === 'A') {
      if (comboStreak >= 3 && comboStreak > this.bestStreakSeen) {
        this.bestStreakSeen = comboStreak;
        this.state.heroMood = 'UNSTOPPABLE';
        this.pushBeat(
          `${comboStreak}X SYNTHETIC SURGE`,
          `Unbroken reactive streak! Ishikawa rallies Team AIM (${scoreA}-${scoreB}) while the neon towers pulse.`,
          'STREAK',
          40
        );
      } else if (scoreB - scoreA >= 3 && scoreA >= 8) {
        this.state.heroMood = 'LOCKED_IN';
        this.pushBeat(
          'GRIT THROUGH ADVERSITY',
          `Down ${scoreA}-${scoreB}, #14 tugs his cap down and points to the back row — comeback mode engaged.`,
          'COMEBACK',
          32
        );
      } else if ((scoreA + scoreB) % 4 === 0) {
        this.pushBeat(
          `SCOREBOARD CLIMB · ${scoreA}-${scoreB}`,
          `Point Cyan! Coal Harbour erupts as the AIM vest leads the side-out rotation.`,
          'POINT',
          22
        );
      }
    } else if (scoreB - scoreA >= 2 && (scoreA + scoreB) % 5 === 0) {
      this.state.heroMood = 'FOCUSED';
      this.pushBeat(
        'RIVAL PRESSURE',
        `Vice Coral steals one (${scoreA}-${scoreB}). Ishikawa claps once — locking in for the answer.`,
        'RIVAL',
        15
      );
    }
  }

  public onWeatherEvolution(stage: MatchEvolutionStage, weather: EnvironmentTheme) {
    if (this.lastWeatherRecorded === stage || stage === 'OPENING_BREEZE') return;
    this.lastWeatherRecorded = stage;
    const desc =
      stage === 'MONSOON_CLIMAX'
        ? `Monsoon rain slicks the court under ${weather} floodlights — Ishikawa’s orange trim glows against the storm.`
        : stage === 'DUST_SQUALL'
        ? `Gale dust swirls from Burrard Inlet — only clean hand-eye precision cuts through.`
        : `Stadium heat rises around Coal Harbour; sweat and tempo climb together.`;
    this.pushBeat(`ATMOSPHERE · ${stage.replace(/_/g, ' ')}`, desc, 'WEATHER', 35);
  }

  public resetForNewMatch() {
    this.lastWeatherRecorded = null;
    this.bestStreakSeen = 0;
    this.state = {
      ...this.state,
      heroMood: 'FIRED_UP',
    };
  }
}
