let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

export function getMaster(): GainNode | null {
  return master;
}

export function isMuted() {
  return muted;
}

export function unlock() {
  ensureCtx();
}

function blip(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  gain = 0.25,
  delay = 0
) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(duration: number, gain = 0.3, filterFreq = 800, delay = 0) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * 0.2), t + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
}

export function playShoot() {
  blip('square', 880, 220, 0.08, 0.12);
}

export function playExplosion(size = 1) {
  const big = size > 1;
  noise(big ? 0.6 : 0.25, big ? 0.5 : 0.3, big ? 500 : 900);
  if (big) {
    blip('sine', 80, 30, 0.5, 0.35, 0.02);
  }
}

export function playPowerUp() {
  blip('sine', 440, 880, 0.1, 0.2);
  blip('sine', 660, 1320, 0.12, 0.18, 0.08);
}

export function playHit() {
  blip('sawtooth', 200, 60, 0.2, 0.3);
  noise(0.15, 0.25, 400);
}

export function playShield() {
  blip('sine', 300, 600, 0.15, 0.2);
}

export function playGameOver() {
  blip('sawtooth', 220, 55, 0.8, 0.3);
  noise(0.7, 0.4, 300, 0.1);
}

export function playBossFlash() {
  blip('sawtooth', 440, 40, 1.2, 0.4);
  noise(0.8, 0.5, 400, 0.05);
  blip('sine', 880, 40, 1.0, 0.25, 0.1);
}

export function playLevelComplete() {
  blip('sine', 523, 523, 0.12, 0.2);
  blip('sine', 659, 659, 0.12, 0.2, 0.12);
  blip('sine', 784, 784, 0.12, 0.2, 0.24);
  blip('sine', 1047, 1047, 0.3, 0.25, 0.36);
}

export function playTransition() {
  blip('sine', 220, 720, 0.5, 0.22);
  blip('sine', 330, 990, 0.4, 0.14, 0.12);
  noise(0.45, 0.12, 1400, 0.02);
}

export function startEngine() {
  const c = ensureCtx();
  if (!c || !master) return;
  stopEngine();
  engineOsc = c.createOscillator();
  engineGain = c.createGain();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineGain.gain.value = 0;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 8;
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain);
  lfoGain.connect(engineOsc.frequency);
  lfo.start();
  engineOsc.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
  engineGain.gain.setTargetAtTime(0.06, c.currentTime, 0.1);
}

export function stopEngine() {
  if (engineOsc && engineGain && ctx) {
    engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const osc = engineOsc;
    engineOsc = null;
    engineGain = null;
    setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 200);
  }
}
