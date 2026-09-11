// Adaptive playback for the user-approved Space Force theme.
//
// The theme is one cohesive arrangement. Phase changes alter its tone and
// intensity while every moment remains on the same AudioContext clock.

import { getMaster } from './audio';

export type MusicState = 'playing' | 'paused' | 'dead' | 'clear';

type PhaseTreatment = {
  gain: number;
  lowpassHz: number;
  highShelfDb: number;
};

const MUSIC_URL = '/music/level_02/space-force-theme-loop.ogg';
const FALLBACK_PHASE = 'ASTEROID FIELD';
const RAMP_TIME_CONSTANT = 0.75;

const PHASE_TREATMENTS: Record<string, PhaseTreatment> = {
  'ASTEROID FIELD': { gain: 0.50, lowpassHz: 1600, highShelfDb: -4 },
  'DRONE SQUAD': { gain: 0.64, lowpassHz: 4500, highShelfDb: -1 },
  'INTERCEPTOR SURGE': { gain: 0.78, lowpassHz: 9500, highShelfDb: 1 },
  'THE ORBITAL WARDEN': { gain: 0.88, lowpassHz: 18000, highShelfDb: 2 },
  'SECTOR CLEAR': { gain: 0.38, lowpassHz: 2200, highShelfDb: -3 },
  'LASER LABYRINTH': { gain: 0.55, lowpassHz: 2500, highShelfDb: -3 },
  'PRISM LATTICE': { gain: 0.62, lowpassHz: 4200, highShelfDb: -1 },
  'KAMIKAZE PURSUIT': { gain: 0.72, lowpassHz: 7200, highShelfDb: 0.5 },
  'LASER GATES': { gain: 0.76, lowpassHz: 9000, highShelfDb: 1 },
  'METEOR SLALOM': { gain: 0.82, lowpassHz: 12000, highShelfDb: 1.5 },
  'SERPENT RIFT': { gain: 0.90, lowpassHz: 18000, highShelfDb: 2 },
  'NEBULA CLEAR': { gain: 0.38, lowpassHz: 2200, highShelfDb: -3 },
};

type MusicGraph = {
  source: AudioBufferSourceNode | null;
  lowpass: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  gain: GainNode;
};

let ctx: BaseAudioContext | null = null;
let graph: MusicGraph | null = null;
let initialized = false;
let generation = 0;
let requestedPhase = FALLBACK_PHASE;
let requestedState: MusicState = 'playing';

function treatmentFor(phase: string, state: MusicState): PhaseTreatment {
  const base = PHASE_TREATMENTS[phase] ?? PHASE_TREATMENTS[FALLBACK_PHASE];
  if (state === 'paused') {
    return { ...base, gain: base.gain * 0.25 };
  }
  if (state === 'dead') {
    return { gain: 0.28, lowpassHz: 900, highShelfDb: -6 };
  }
  return base;
}

function applyTreatment(at = ctx?.currentTime ?? 0): void {
  if (!ctx || !graph) return;
  const treatment = treatmentFor(requestedPhase, requestedState);
  graph.gain.gain.setTargetAtTime(treatment.gain, at, RAMP_TIME_CONSTANT);
  graph.lowpass.frequency.setTargetAtTime(treatment.lowpassHz, at, RAMP_TIME_CONSTANT);
  graph.highShelf.gain.setTargetAtTime(treatment.highShelfDb, at, RAMP_TIME_CONSTANT);
}

async function loadAndStart(loadGeneration: number, audioContext: BaseAudioContext): Promise<void> {
  try {
    const response = await fetch(MUSIC_URL);
    if (!response.ok) return;
    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    if (loadGeneration !== generation || !graph || ctx !== audioContext) return;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(graph.lowpass);
    graph.source = source;

    const startAt = audioContext.currentTime + 0.05;
    source.start(startAt);
    applyTreatment(startAt);
  } catch {
    // A failed music fetch leaves gameplay and sound effects available.
  }
}

export function initMusic(): void {
  if (initialized) return;
  const master = getMaster();
  if (!master) return;

  ctx = master.context;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.Q.value = 0.7;
  lowpass.frequency.value = PHASE_TREATMENTS[FALLBACK_PHASE].lowpassHz;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 2600;
  highShelf.gain.value = PHASE_TREATMENTS[FALLBACK_PHASE].highShelfDb;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  lowpass.connect(highShelf);
  highShelf.connect(gain);
  gain.connect(master);
  graph = { source: null, lowpass, highShelf, gain };
  initialized = true;

  const loadGeneration = ++generation;
  void loadAndStart(loadGeneration, ctx);
}

export function setMusicPhase(phase: string, state: MusicState): void {
  requestedPhase = phase;
  requestedState = state;
  applyTreatment();
}

export function destroyMusic(): void {
  generation += 1;
  if (graph) {
    try { graph.source?.stop(); } catch { /* already stopped */ }
    try {
      graph.source?.disconnect();
      graph.lowpass.disconnect();
      graph.highShelf.disconnect();
      graph.gain.disconnect();
    } catch { /* already disconnected */ }
  }
  graph = null;
  ctx = null;
  initialized = false;
}
