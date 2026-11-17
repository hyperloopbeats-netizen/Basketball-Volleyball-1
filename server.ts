import express, { Request, Response } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BRAIN_FILE_PATH = path.join(__dirname, 'gemini-brain-state.json');

app.use(express.json({ limit: '2mb' }));

// Initialize Google GenAI client on the server with mandatory telemetry header
let aiClient: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  aiClient = new GoogleGenAI({
    ...(apiKey ? { apiKey } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
} catch (e) {
  console.warn('GoogleGenAI initialization fallback:', (e as Error).message);
}

// Helper to read brain state JSON file safely
function readBrainState() {
  try {
    if (fs.existsSync(BRAIN_FILE_PATH)) {
      const data = fs.readFileSync(BRAIN_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading brain state file:', err);
  }
  return {
    timestamp: Date.now(),
    version: '2.0.0-odonata',
    rallyId: 0,
    tactics: {
      teamA_offense: 'BALANCED',
      teamB_offense: 'BALANCED',
      teamA_defense: 'ZONAL_PERIMETER',
      teamB_defense: 'ZONAL_PERIMETER',
      recommendedSetterPlay: 'Balanced Transition Set',
      recommendedTargetZone: 4,
      tempo: 'HIGH_SPEED',
      whistleActive: false,
      interceptPredictionAdjustment: { anticipationBoostMs: 40, liberoSafetyMargin: 0.48 },
    },
    agiSwarmTelemetry: {
      workerTurbulence: 0.618,
      fractalFoldN: 3.0,
      huntModeActive: true,
      preyLockCount: 4,
      fps: 120,
      adaptiveQualityScale: 1.0,
    },
    playerPositioningMatrix: { teamA: [], teamB: [] },
    ballKinematicsAnalysis: { speedKmh: 0, apex: 0, trajectoryPhase: 'SERVE' },
    geminiVoiceCommentary: {
      headline: 'Odonata-Net & Gemini Brain Active',
      playAnalysis: 'Real-time ballistic telemetry synchronized.',
      spokenQuote: 'Athletes locked on service formation.',
      coachingInsight: 'Maintain non-overlapping perimeter coverage.',
    },
    coachPrompt: '',
  };
}

function writeBrainState(state: any) {
  try {
    fs.writeFileSync(BRAIN_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to brain state file:', err);
  }
}

interface IncomingUnitTelemetry {
  id: number;
  team: 'A' | 'B';
  role: string;
  jersey: number;
  x: number;
  z: number;
  distToBall: number;
  assignedPlayRole: string;
  defensiveZone: string;
  readiness: number;
  reactionState: string;
}

/**
 * Computes genuine adaptive tactical positioning offsets from live unit telemetry,
 * ballistic intercept coordinates, and off-thread swarm turbulence (no static constants).
 */
function computeAdaptivePositioningMatrix(
  unitsTelemetry: IncomingUnitTelemetry[],
  interceptXZ: { x: number; z: number },
  agiTurbulence: number,
  huntModeActive: boolean,
  currentSide: 'A' | 'B' | null
) {
  const buildTeamMatrix = (team: 'A' | 'B') => {
    const teamUnits = unitsTelemetry.filter((u) => u.team === team);
    const zSign = team === 'A' ? 1 : -1;
    const isAttacking = currentSide === team;

    return teamUnits.map((u) => {
      // Adaptive shade based on ball intercept lateral drift & swarm harmonic turbulence
      const ballPullX = Math.max(-0.35, Math.min(0.35, (interceptXZ.x - u.x) * 0.06));
      const harmonicShift = (agiTurbulence - 0.618) * 0.35;

      let xOffset = 0;
      let zOffset = 0;

      if (u.assignedPlayRole === 'RECEIVER') {
        // Primary receiver locks directly onto predicted intercept without artificial offset drift
        xOffset = 0;
        zOffset = 0;
      } else if (u.assignedPlayRole === 'SETTER') {
        xOffset = Math.max(-0.2, Math.min(0.2, harmonicShift * 0.4));
        zOffset = isAttacking ? -0.1 * zSign : 0.15 * zSign;
      } else if (u.assignedPlayRole === 'SPIKER') {
        xOffset = ballPullX * 0.5 + (u.role === 'Outside' ? -0.15 : 0.15);
        zOffset = isAttacking ? -0.18 * zSign : 0.12 * zSign;
      } else if (u.assignedPlayRole === 'BLOCKER') {
        // Track hitter across net laterally
        xOffset = Math.max(-0.4, Math.min(0.4, (interceptXZ.x - u.x) * 0.12));
        zOffset = -0.05 * zSign;
      } else {
        // Cover defenders expand into open diagonal gaps away from the ball/teammates
        xOffset = ballPullX + harmonicShift * (u.jersey % 2 === 0 ? 1 : -1);
        zOffset = (isAttacking ? -0.15 : 0.25) * zSign;
      }

      const proximityReadiness = Math.round(
        Math.max(
          15,
          Math.min(
            100,
            (u.readiness || 50) * (huntModeActive ? 1.06 : 1.0) - Math.min(25, u.distToBall * 1.4)
          )
        )
      );

      return {
        id: u.id,
        role: u.role,
        jersey: u.jersey,
        xOffset: Number(xOffset.toFixed(3)),
        zOffset: Number(zOffset.toFixed(3)),
        targetZone: u.defensiveZone,
        readiness: proximityReadiness,
        tacticalRole: u.assignedPlayRole || 'COVER',
        reactionState: u.reactionState || 'SENSORY_STANDBY',
      };
    });
  };

  return {
    teamA: buildTeamMatrix('A'),
    teamB: buildTeamMatrix('B'),
  };
}

let lastGeminiCallTime = 0;
const GEMINI_CALL_INTERVAL_MS = 2500;

// 1. GET /api/gemini-brain - Read live JSON state
app.get('/api/gemini-brain', (_req: Request, res: Response) => {
  res.json(readBrainState());
});

// 2. POST /api/gemini-brain/sync - Real moment telemetry read/write & Gemini processing
app.post('/api/gemini-brain/sync', async (req: Request, res: Response) => {
  const telemetry = req.body || {};
  const currentBrain = readBrainState();
  const now = Date.now();

  const ballSpeedKmh = Number(telemetry.ballSpeedKmh || 0);
  const matchState = telemetry.matchState || 'PLAY';
  const rallyCount = Number(telemetry.rallyCount || 0);
  const scoreA = Number(telemetry.scoreA || 0);
  const scoreB = Number(telemetry.scoreB || 0);
  const teamFSM_A = telemetry.teamFSMStateA || 'TOUCH_1_PASS';
  const teamFSM_B = telemetry.teamFSMStateB || 'BLOCK_AND_COVER';
  const lastShotType = telemetry.lastShotType || 'BALL IN PLAY';
  const currentSide: 'A' | 'B' | null = telemetry.currentSide || null;
  const interceptXZ = telemetry.interceptXZ || { x: 0, z: 0 };
  const agiTurbulence = Number(telemetry.agiTurbulence ?? 0.618);
  const fractalFoldN = Number(telemetry.fractalFoldN ?? 3.0);
  const huntModeActive = telemetry.huntModeActive !== false;
  const unitsTelemetry: IncomingUnitTelemetry[] = Array.isArray(telemetry.unitsTelemetry)
    ? telemetry.unitsTelemetry
    : [];

  const playerPositioningMatrix = computeAdaptivePositioningMatrix(
    unitsTelemetry,
    interceptXZ,
    agiTurbulence,
    huntModeActive,
    currentSide
  );

  let commentary = currentBrain.geminiVoiceCommentary;
  let recommendedPlay = currentBrain.tactics?.recommendedSetterPlay || 'Balanced Transition Set';
  let recommendedTargetZone = currentBrain.tactics?.recommendedTargetZone || (currentSide === 'A' ? 4 : 2);

  const canCallGemini = now - lastGeminiCallTime > GEMINI_CALL_INTERVAL_MS || Boolean(telemetry.eventTrigger);

  if (canCallGemini) {
    lastGeminiCallTime = now;
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (apiKey && aiClient) {
      try {
        const prompt = `You are the master AI coach and play-by-play volleyball tactician for AIM Volleyball.
Current match state:
- Score: Cyan ${scoreA} - Orange ${scoreB}
- Match Phase: ${matchState} (Rally #${rallyCount})
- Team In Possession: ${currentSide === 'A' ? 'Cyan Spikers' : currentSide === 'B' ? 'Orange Titans' : 'Serve Setup'}
- Ball Speed: ${ballSpeedKmh} km/h, Last Shot: ${lastShotType}, Predicted Landing: (${Number(interceptXZ.x).toFixed(2)}, ${Number(interceptXZ.z).toFixed(2)})
- AGI Hunt Mode: ${huntModeActive ? 'ACTIVE' : 'STANDBY'}, Swarm Turbulence: ${agiTurbulence.toFixed(3)}
- Team A FSM State: ${teamFSM_A}, Team B FSM State: ${teamFSM_B}
- Coach Prompt: "${currentBrain.coachPrompt || 'Optimize offensive velocity and zero-overlap defensive spacing'}"`;

        const geminiPromise = aiClient.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recommendedSetterPlay: { type: Type.STRING },
                recommendedTargetZone: { type: Type.INTEGER },
                spokenQuote: { type: Type.STRING },
                coachingInsight: { type: Type.STRING },
              },
            },
          },
        });

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1400));
        const response: any = await Promise.race([geminiPromise, timeoutPromise]);

        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          recommendedPlay = parsed.recommendedSetterPlay || recommendedPlay;
          if (typeof parsed.recommendedTargetZone === 'number') {
            recommendedTargetZone = Math.max(1, Math.min(6, parsed.recommendedTargetZone));
          }
          commentary = {
            headline: `Gemini 4: ${lastShotType}`,
            playAnalysis: parsed.coachingInsight || commentary.playAnalysis,
            spokenQuote: parsed.spokenQuote || commentary.spokenQuote,
            coachingInsight: parsed.coachingInsight || commentary.coachingInsight,
          };
        }
      } catch {
        // Non-blocking fallback keeps 120 FPS loop unobstructed
      }
    } else {
      const isTeamAAttacking = currentSide === 'A';
      recommendedPlay = isTeamAAttacking ? 'Quick 1-Tempo Set to Middle' : 'High Outside Arc Set';
      commentary = {
        headline: `Odonata AGI: ${lastShotType}`,
        playAnalysis: isTeamAAttacking
          ? `Transition attack tracking landing (${Number(interceptXZ.x).toFixed(1)}m, ${Number(interceptXZ.z).toFixed(1)}m)`
          : 'Pin blockers sealing cross-court lane while backcourt forms umbrella',
        spokenQuote:
          ballSpeedKmh > 75
            ? `Blistering pace at ${ballSpeedKmh} kilometers per hour!`
            : lastShotType.includes('PASS')
            ? 'Clean platform dime pass to the setter!'
            : 'Swarm tracking ballistic intercept vector!',
        coachingInsight: huntModeActive
          ? `Odonata Hunt locked (${unitsTelemetry.length} units synced).`
          : 'Maintaining zonal coverage discipline.',
      };
    }
  }

  const updatedBrain = {
    timestamp: now,
    version: '2.0.0-odonata',
    rallyId: rallyCount,
    lastUpdated: new Date().toISOString(),
    tactics: {
      teamA_offense: telemetry.tacticalPlayA || currentBrain.tactics?.teamA_offense || 'BALANCED',
      teamB_offense: telemetry.tacticalPlayB || currentBrain.tactics?.teamB_offense || 'BALANCED',
      teamA_defense: telemetry.defensiveStrategyA || currentBrain.tactics?.teamA_defense || 'ZONAL_PERIMETER',
      teamB_defense: telemetry.defensiveStrategyB || currentBrain.tactics?.teamB_defense || 'ZONAL_PERIMETER',
      recommendedSetterPlay: recommendedPlay,
      recommendedTargetZone,
      tempo: ballSpeedKmh > 75 ? 'SUPERSONIC_TRANSITION' : 'HIGH_SPEED',
      whistleActive: Boolean(telemetry.netViolation),
      interceptPredictionAdjustment: {
        anticipationBoostMs: huntModeActive ? Math.round(45 + agiTurbulence * 30) : 25,
        liberoSafetyMargin: Number((0.45 + Math.abs(agiTurbulence - 0.618) * 0.25).toFixed(3)),
      },
    },
    agiSwarmTelemetry: {
      workerTurbulence: Number(agiTurbulence.toFixed(4)),
      fractalFoldN: Number(fractalFoldN.toFixed(3)),
      huntModeActive,
      preyLockCount: Number(telemetry.preyLockCount ?? 4),
      fps: Number(telemetry.fps ?? 120),
      adaptiveQualityScale: Number(telemetry.adaptiveQualityScale ?? 1.0),
    },
    playerPositioningMatrix,
    ballKinematicsAnalysis: {
      speedKmh: ballSpeedKmh,
      apex: Number(telemetry.lastJumpHeight || 0),
      interceptX: Number(Number(interceptXZ.x || 0).toFixed(2)),
      interceptZ: Number(Number(interceptXZ.z || 0).toFixed(2)),
      trajectoryPhase: matchState,
      recommendedSpikeAngle: Math.round(Math.atan2(ballSpeedKmh, 20) * (180 / Math.PI)),
      recommendedBlockDepth: ballSpeedKmh > 80 ? 0.45 : 0.3,
    },
    geminiVoiceCommentary: commentary,
    coachPrompt: currentBrain.coachPrompt || '',
  };

  writeBrainState(updatedBrain);
  res.json(updatedBrain);
});

// 3. POST /api/gemini-brain/prompt - Real-time custom coach prompting
app.post('/api/gemini-brain/prompt', async (req: Request, res: Response) => {
  const { prompt } = req.body;
  const currentBrain = readBrainState();
  currentBrain.coachPrompt = prompt || '';

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (apiKey && aiClient && prompt) {
    try {
      const geminiPromise = aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are the master volleyball strategist. The head coach issued this directive: "${prompt}". Choose best tactical settings and concise voice order.`,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              teamA_offense: {
                type: Type.STRING,
                enum: ['FAST_QUICK', 'HIGH_OUTSIDE', 'PIPE_HEAVY', 'BALANCED', 'ALL_OUT_SPIKE'],
              },
              teamA_defense: {
                type: Type.STRING,
                enum: ['COMMIT_BLOCK', 'ZONAL_PERIMETER', 'WING_PINCH', 'ROTATIONAL_DEEP'],
              },
              spokenQuote: { type: Type.STRING },
              coachingInsight: { type: Type.STRING },
            },
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1600));
      const response: any = await Promise.race([geminiPromise, timeoutPromise]);

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        if (parsed.teamA_offense) currentBrain.tactics.teamA_offense = parsed.teamA_offense;
        if (parsed.teamA_defense) currentBrain.tactics.teamA_defense = parsed.teamA_defense;
        currentBrain.geminiVoiceCommentary = {
          headline: `Coach Order: ${prompt.slice(0, 28)}`,
          playAnalysis: parsed.coachingInsight || `Executing coach order: ${prompt}`,
          spokenQuote: parsed.spokenQuote || `Coach strategy: ${prompt}`,
          coachingInsight: parsed.coachingInsight || 'Tactical matrix reconfigured.',
        };
      }
    } catch {
      currentBrain.geminiVoiceCommentary = {
        headline: `Coach: ${prompt.slice(0, 28)}`,
        playAnalysis: `Tactical directive applied: ${prompt}`,
        spokenQuote: `Coach orders: ${prompt}`,
        coachingInsight: 'Team adapting court coverage and hit tempo.',
      };
    }
  } else if (prompt) {
    currentBrain.geminiVoiceCommentary = {
      headline: `Coach: ${prompt.slice(0, 28)}`,
      playAnalysis: `Tactical directive applied: ${prompt}`,
      spokenQuote: `Coach orders: ${prompt}`,
      coachingInsight: 'Team adapting court coverage and hit tempo.',
    };
  }

  currentBrain.timestamp = Date.now();
  currentBrain.lastUpdated = new Date().toISOString();
  writeBrainState(currentBrain);
  res.json(currentBrain);
});

// 3B. POST /api/gemini-brain/orchestrate - Autonomous Self-Healing OS & 3v3 Game Orchestrator
let lastOrchestrateCallTime = 0;
const ORCHESTRATE_MIN_INTERVAL_MS = 3200;

app.post('/api/gemini-brain/orchestrate', async (req: Request, res: Response) => {
  const payload = req.body || {};
  const now = Date.now();
  const gameMode: 'BASKETBALL_3V3' | 'VOLLEYBALL_6V6' =
    payload.gameMode === 'VOLLEYBALL_6V6' ? 'VOLLEYBALL_6V6' : 'BASKETBALL_3V3';
  const fps = Number(payload.fps ?? 60);
  const scoreA = Number(payload.scoreA ?? 0);
  const scoreB = Number(payload.scoreB ?? 0);
  const shotClock = Number(payload.shotClock ?? 12);
  const possessionTeam: 'A' | 'B' = payload.possessionTeam === 'B' ? 'B' : 'A';
  const degradedSubsystems: string[] = Array.isArray(payload.degradedSubsystems)
    ? payload.degradedSubsystems
    : [];
  const activeStep = Number(payload.activeStep ?? 1);
  const userDirective = typeof payload.userDirective === 'string' ? payload.userDirective.trim() : '';

  const fallbackPlay =
    possessionTeam === 'A'
      ? scoreA < scoreB
        ? 'FIVE_OUT_3PT'
        : 'PICK_AND_ROLL'
      : 'FAST_BREAK';
  const fallbackDefense = scoreA >= scoreB + 3 ? 'PAINT_PROTECT' : 'SWITCH_EVERYTHING';

  let result = {
    source: 'DETERMINISTIC_KERNEL',
    timestamp: now,
    osDirective: {
      healActions: degradedSubsystems.length > 0 ? degradedSubsystems.map((id) => `RECOVER:${id}`) : [],
      targetStep: Math.min(10, Math.max(1, degradedSubsystems.length > 0 ? 10 : activeStep)),
      bloomBoost: degradedSubsystems.length > 0 ? 0.35 : scoreA + scoreB >= 14 ? 0.25 : 0.12,
      adaptiveQualityHint: fps < 38 ? 'STEP_DOWN' : fps > 56 ? 'STEP_UP' : 'KEEP',
      opfsCheckpoint: degradedSubsystems.length > 0 || (scoreA + scoreB) % 4 === 0,
      statusBanner:
        degradedSubsystems.length > 0
          ? `Autonomous Heal Active (${degradedSubsystems.join(', ')})`
          : `Google Studio Orchestrating ${gameMode === 'BASKETBALL_3V3' ? '3v3 Basketball' : 'Volleyball'}`,
    },
    gameDirective: {
      playCall: fallbackPlay,
      defenseCall: fallbackDefense,
      focusJersey: possessionTeam === 'A' ? 14 : 6,
      intensityBoost: scoreA >= 15 || scoreB >= 15 ? 1.25 : 1.0,
      coachCallout:
        userDirective
          ? `Executing Studio Directive: ${userDirective}`
          : possessionTeam === 'A'
          ? 'Spread the 3x3 arc — slip the screen or attack the rim!'
          : 'Wall up the paint and contest every 2-point jumper!',
      broadcastLine:
        gameMode === 'BASKETBALL_3V3'
          ? `STUDIO AI: Cyan ${scoreA} - Vice Coral ${scoreB} · Clock ${shotClock.toFixed(1)}s · Play ${fallbackPlay}`
          : `STUDIO AI: Cyan ${scoreA} - Coral ${scoreB} · Court Synced`,
    },
  };

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const shouldQueryModel =
    Boolean(apiKey && aiClient) &&
    (Boolean(userDirective) || degradedSubsystems.length > 0 || now - lastOrchestrateCallTime > ORCHESTRATE_MIN_INTERVAL_MS);

  if (shouldQueryModel && aiClient) {
    lastOrchestrateCallTime = now;
    try {
      const prompt = `You are the Google Studio Master Orchestrator controlling the AIM-Cometic Self-Healing OS and live 3D sports engine.
State:
- Active Sport Engine: ${gameMode}
- Score: Cyan ${scoreA} vs Coral ${scoreB}, Possession: Team ${possessionTeam}, ShotClock: ${shotClock.toFixed(1)}s
- Renderer FPS: ${fps}, Cometic Matrix Step: ${activeStep}/10
- Degraded Subsystems: ${degradedSubsystems.length > 0 ? degradedSubsystems.join(', ') : 'NONE'}
- Operator/Coach Directive: "${userDirective || 'Maximize autonomous stability, hype stadium energy, and call winning 3v3 basketball tactics.'}"
Return JSON choosing tactical calls, OS self-healing step adjustment, and concise energetic broadcast line.`;

      const geminiPromise = aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              playCall: {
                type: Type.STRING,
                enum: ['PICK_AND_ROLL', 'FIVE_OUT_3PT', 'ISO_SLASH', 'GIVE_AND_GO', 'FAST_BREAK'],
              },
              defenseCall: {
                type: Type.STRING,
                enum: ['MAN_TO_MAN', 'SWITCH_EVERYTHING', 'PAINT_PROTECT', 'FULL_PRESS'],
              },
              targetStep: { type: Type.INTEGER },
              bloomBoost: { type: Type.NUMBER },
              opfsCheckpoint: { type: Type.BOOLEAN },
              statusBanner: { type: Type.STRING },
              coachCallout: { type: Type.STRING },
              broadcastLine: { type: Type.STRING },
            },
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1650));
      const response: any = await Promise.race([geminiPromise, timeoutPromise]);

      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        result = {
          source: 'GEMINI_4_STUDIO',
          timestamp: Date.now(),
          osDirective: {
            healActions: degradedSubsystems.map((id) => `RECOVER:${id}`),
            targetStep:
              typeof parsed.targetStep === 'number'
                ? Math.min(10, Math.max(1, Math.round(parsed.targetStep)))
                : result.osDirective.targetStep,
            bloomBoost:
              typeof parsed.bloomBoost === 'number'
                ? Math.min(0.8, Math.max(0, parsed.bloomBoost))
                : result.osDirective.bloomBoost,
            adaptiveQualityHint: fps < 38 ? 'STEP_DOWN' : fps > 56 ? 'STEP_UP' : 'KEEP',
            opfsCheckpoint: typeof parsed.opfsCheckpoint === 'boolean' ? parsed.opfsCheckpoint : result.osDirective.opfsCheckpoint,
            statusBanner: parsed.statusBanner || result.osDirective.statusBanner,
          },
          gameDirective: {
            playCall: parsed.playCall || fallbackPlay,
            defenseCall: parsed.defenseCall || fallbackDefense,
            focusJersey: possessionTeam === 'A' ? 14 : 6,
            intensityBoost: scoreA >= 15 || scoreB >= 15 ? 1.25 : 1.05,
            coachCallout: parsed.coachCallout || result.gameDirective.coachCallout,
            broadcastLine: parsed.broadcastLine || result.gameDirective.broadcastLine,
          },
        };
      }
    } catch {
      // Fall back cleanly to deterministic kernel orchestration
    }
  }

  const currentBrain = readBrainState();
  currentBrain.timestamp = result.timestamp;
  currentBrain.osOrchestration = result;
  writeBrainState(currentBrain);
  res.json(result);
});

// 4. Google Maps Platform Config & Print/Places Server Proxies
function resolveServerMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    ''
  );
}

app.get('/api/maps/config', (_req: Request, res: Response) => {
  const apiKey = resolveServerMapsApiKey();
  res.json({
    configured: Boolean(apiKey),
    apiKey,
  });
});

app.get('/api/maps/static-image', async (req: Request, res: Response) => {
  const apiKey = resolveServerMapsApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'Google Maps API key not configured on server.' });
    return;
  }

  const center = typeof req.query.center === 'string' ? req.query.center : '49.2804,-123.1119';
  const zoom = typeof req.query.zoom === 'string' ? req.query.zoom : '15';
  const size = typeof req.query.size === 'string' ? req.query.size : '640x400';
  const scale = typeof req.query.scale === 'string' ? req.query.scale : '2';
  const maptype = typeof req.query.maptype === 'string' ? req.query.maptype : 'hybrid';

  const params = new URLSearchParams({
    center,
    zoom,
    size,
    scale,
    maptype,
    format: 'png',
    language: 'en',
    region: 'CA',
    key: apiKey,
    solution_id: 'gmp_mcp_codeassist_v1_aistudio',
  });

  const markersParam = req.query.markers;
  if (Array.isArray(markersParam)) {
    for (const m of markersParam) {
      if (typeof m === 'string' && m.trim()) params.append('markers', m);
    }
  } else if (typeof markersParam === 'string' && markersParam.trim()) {
    params.append('markers', markersParam);
  }

  try {
    const upstream = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
    if (upstream.status === 429) {
      res.status(429).json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Google Maps quota exceeded' } });
      return;
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText);
      res.status(upstream.status).json({ error: errText });
      return;
    }
    const arrayBuf = await upstream.arrayBuffer();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Static map fetch failed' });
  }
});

app.post('/api/maps/places-nearby', async (req: Request, res: Response) => {
  const apiKey = resolveServerMapsApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'Google Maps API key not configured on server.' });
    return;
  }

  const body = req.body || {};
  const lat = Number(body.lat ?? 49.2804);
  const lng = Number(body.lng ?? -123.1119);
  const radius = Math.min(5000, Math.max(150, Number(body.radius ?? 1400)));
  const includedTypes = Array.isArray(body.includedTypes) && body.includedTypes.length > 0
    ? body.includedTypes
    : ['tourist_attraction', 'stadium', 'parking', 'transit_station', 'park'];
  const maxResultCount = Math.min(15, Math.max(1, Number(body.maxResultCount ?? 12)));

  try {
    const upstream = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.rating,places.googleMapsUri',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount,
        rankPreference: 'POPULARITY',
        languageCode: 'en',
        regionCode: 'CA',
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (upstream.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
      res.status(429).json(data);
      return;
    }
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Places search failed' });
  }
});

// Vite middleware mounting in development, or static hosting in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', async (req: Request, res: Response, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) return next();
          const safeCode = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR disabled: WebSocket transport suppressed */'
          );
          res.type('application/javascript').send(safeCode);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (Gemini Brain full-stack enabled)`);
  });
}

startServer();
