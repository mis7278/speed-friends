// 효과음 (파일 없이 코드로 만든 소리). 나중에 소리 파일로 교체 가능.
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

function tone(freq, dur, { type = 'sine', slide = null, vol = 0.5, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.4, freq = 1200, slide = null, q = 1 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const SFX = {
  jump() { tone(320, 0.18, { type: 'square', slide: 720, vol: 0.18 }); },
  dash() { noise(0.3, { vol: 0.5, freq: 600, slide: 3000 }); tone(500, 0.2, { type: 'sawtooth', slide: 1200, vol: 0.12 }); },
  ring() { tone(1320, 0.09, { vol: 0.25 }); tone(1760, 0.18, { vol: 0.25, delay: 0.06 }); },
  // 스핀 차지: 연타할수록 높고 큰 소리 (n = 1~10)
  spinCharge(n) {
    const f = 140 + n * 55;
    tone(f, 0.25, { type: 'sawtooth', slide: f * 1.9, vol: 0.10 + n * 0.015 });
    noise(0.2, { vol: 0.15 + n * 0.02, freq: 400 + n * 200 });
  },
  spinLaunch(n) { noise(0.45, { vol: 0.5, freq: 400 + n * 80, slide: 4000 }); tone(200 + n * 30, 0.35, { type: 'sawtooth', slide: 1600, vol: 0.15 }); },
  slam() { noise(0.15, { vol: 0.3, freq: 2000, slide: 300 }); },
  slamHit() { noise(0.4, { vol: 0.7, freq: 300, slide: 60, q: 0.7 }); tone(110, 0.3, { type: 'square', slide: 40, vol: 0.2 }); },
  enemyPop() { noise(0.25, { vol: 0.5, freq: 1500, slide: 200 }); tone(600, 0.15, { type: 'square', slide: 150, vol: 0.15 }); },
  hurt() { tone(400, 0.35, { type: 'sawtooth', slide: 120, vol: 0.25 }); },
  ringLoss() { for (let i = 0; i < 6; i++) tone(1500 - i * 120, 0.12, { vol: 0.15, delay: i * 0.04 }); },
  spring() { tone(250, 0.3, { type: 'triangle', slide: 1000, vol: 0.3 }); },
  boost() { noise(0.4, { vol: 0.35, freq: 800, slide: 5000 }); },
  heal() { tone(660, 0.12, { vol: 0.25 }); tone(880, 0.12, { vol: 0.25, delay: 0.08 }); tone(1100, 0.2, { vol: 0.25, delay: 0.16 }); },
  store() { tone(900, 0.1, { type: 'triangle', vol: 0.25 }); tone(700, 0.15, { type: 'triangle', vol: 0.25, delay: 0.08 }); },
  checkpoint() { [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.25, delay: i * 0.09 })); },
  crystal() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.25, delay: i * 0.1 })); },
  superReady() { [523, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.2, delay: i * 0.07 })); },
  transform() { noise(0.8, { vol: 0.4, freq: 300, slide: 6000 }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: 'square', vol: 0.1, delay: i * 0.06 })); },
  quest() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.12, delay: i * 0.1 })); },
  death() { tone(500, 0.8, { type: 'triangle', slide: 80, vol: 0.3 }); },
  gearUp(g) { tone(300 + g * 160, 0.25, { type: 'sawtooth', slide: 700 + g * 260, vol: 0.12 }); noise(0.3, { vol: 0.25, freq: 900, slide: 4000 }); },
  flap() { noise(0.15, { vol: 0.3, freq: 700, slide: 1600 }); },
  glide() { noise(0.4, { vol: 0.2, freq: 500, slide: 900 }); },
  punch() { noise(0.2, { vol: 0.6, freq: 400, slide: 120 }); tone(160, 0.15, { type: 'square', slide: 60, vol: 0.2 }); },
  blink() { tone(1400, 0.2, { type: 'sine', slide: 300, vol: 0.2 }); noise(0.2, { vol: 0.2, freq: 3000, slide: 500 }); },
  blackhole() { tone(80, 1.5, { type: 'sawtooth', slide: 30, vol: 0.3 }); noise(1.5, { vol: 0.5, freq: 200, slide: 60, q: 0.5 }); },
  tornado() { noise(0.7, { vol: 0.45, freq: 500, slide: 2500, q: 2 }); },
  wallBreak() { noise(0.6, { vol: 0.8, freq: 250, slide: 60, q: 0.5 }); tone(90, 0.4, { type: 'square', slide: 40, vol: 0.2 }); },
  flight() { noise(0.9, { vol: 0.4, freq: 300, slide: 5000 }); tone(400, 0.6, { type: 'triangle', slide: 1400, vol: 0.15 }); },
  explosion() { noise(1.0, { vol: 0.9, freq: 200, slide: 40, q: 0.4 }); tone(70, 0.8, { type: 'square', slide: 30, vol: 0.25 }); },
  missile() { noise(0.4, { vol: 0.25, freq: 1500, slide: 700 }); },
  bossHit() { tone(220, 0.3, { type: 'square', slide: 80, vol: 0.3 }); noise(0.3, { vol: 0.6, freq: 800, slide: 150 }); },
  bossRoar() { tone(110, 1.0, { type: 'sawtooth', slide: 55, vol: 0.3 }); tone(116, 1.0, { type: 'sawtooth', slide: 50, vol: 0.2 }); },
  warn() { tone(880, 0.15, { type: 'square', vol: 0.15 }); tone(880, 0.15, { type: 'square', vol: 0.15, delay: 0.25 }); },
  freed() { tone(1200, 0.1, { type: 'triangle', slide: 1800, vol: 0.18, delay: 0.12 }); tone(1600, 0.12, { type: 'triangle', slide: 2400, vol: 0.15, delay: 0.22 }); },
  splash() { noise(0.3, { vol: 0.35, freq: 1200, slide: 400 }); },
};
