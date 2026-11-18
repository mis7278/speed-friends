// 효과음 (파일 없이 코드로 만든 소리). 나중에 소리 파일로 교체 가능.
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

// 휴대폰에서 소리 장치가 아직 준비 안 됐으면(시간·샘플레이트가 0/NaN) 그냥 조용히 넘어감
function audioReady() {
  return ctx && ctx.state !== 'closed' && Number.isFinite(ctx.currentTime) && ctx.sampleRate > 0;
}
function tone(freq, dur, { type = 'sine', slide = null, vol = 0.5, delay = 0 } = {}) {
  if (!audioReady() || !Number.isFinite(freq) || !(dur > 0)) return;
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
  if (!audioReady() || !(dur > 0)) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
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
  roll() { noise(0.35, { vol: 0.35, freq: 900, slide: 3500 }); tone(300, 0.25, { type: 'sawtooth', slide: 900, vol: 0.1 }); },
  ringBag() { [880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.12, { vol: 0.2, delay: i * 0.05 })); },
  splash() { noise(0.3, { vol: 0.35, freq: 1200, slide: 400 }); },
};

// =====================================================================
//  소리 파일 사용하기
//  game/sounds/sfx/이름.mp3, sounds/bgm/이름.mp3, sounds/voice/이름.mp3 에 넣으면
//  (게임 실행.bat 을 켜거나 업로드할 때 sounds/list.json 이 자동으로 만들어져요)
//  파일이 있으면 파일 소리를, 없으면 위의 코드로 만든 소리를 써요.
// =====================================================================
export const SFX_INFO = {
  jump: ['점프', 'A 버튼으로 점프할 때'],
  dash: ['회전 돌진', '공중에서 A 한 번 더 (스피드형)'],
  ring: ['링 줍기', '링을 하나 먹을 때 (아주 짧게)'],
  spinCharge: ['스핀 충전', 'B 연타할 때마다 (점점 높게 재생됨)'],
  spinLaunch: ['스핀 발사', '스핀으로 튀어나갈 때'],
  slam: ['내려찍기 시작', '공중에서 B'],
  slamHit: ['내려찍기 쾅', '내려찍기가 땅에 닿을 때'],
  enemyPop: ['로봇 부서짐', '몬스터를 물리칠 때'],
  freed: ['동물 친구 풀려남', '로봇에서 동물이 튀어나올 때 (귀여운 소리)'],
  hurt: ['맞음', '몬스터에게 맞았을 때'],
  ringLoss: ['링 흩어짐', '맞아서 링을 떨어뜨릴 때'],
  spring: ['스프링', '스프링을 밟을 때'],
  boost: ['가속 발판', '파란 가속 발판을 밟을 때'],
  gearUp: ['속도 단계 올라감', '1단→2단, 2단→3단'],
  heal: ['체력 회복', '하트를 먹거나 쓸 때'],
  store: ['아이템 보관', '체력이 가득해서 하트를 보관할 때'],
  checkpoint: ['체크포인트', '노란 별 장판을 밟을 때'],
  crystal: ['씨앗·크리스탈', '씨앗을 받거나 크리스탈을 되찾을 때'],
  superReady: ['변신 준비 완료', '슈퍼 변신을 할 수 있게 됐을 때'],
  transform: ['슈퍼 변신', '슈퍼로 변신하는 순간'],
  flight: ['슈퍼 비행', '스피드형 슈퍼 비행 시작'],
  quest: ['퀘스트 완료·시작', '퀘스트를 깨거나 새로 시작할 때'],
  death: ['쓰러짐', '체력이 0이 될 때'],
  flap: ['날갯짓', '비행형이 날 때 (A 연타)'],
  glide: ['활공', '파워형 활공 시작'],
  punch: ['펀치', '파워형 펀치, 단단한 로봇 때릴 때'],
  blink: ['순간이동', '순간이동형 순간이동'],
  blackhole: ['블랙홀', '순간이동형 슈퍼 필살기'],
  tornado: ['회오리', '비행형 슈퍼 회오리 발사'],
  wallBreak: ['벽 부서짐', '금 간 벽을 부술 때'],
  explosion: ['큰 폭발', '보스·기지 탑·생산 기계 폭발'],
  missile: ['미사일 발사', '보스가 미사일을 쏠 때'],
  bossHit: ['보스 맞음', '보스에게 공격이 들어갈 때'],
  bossRoar: ['보스 등장', '보스가 나타날 때 (기계 굉음)'],
  warn: ['경고음', '보스가 큰 공격을 준비할 때'],
  splash: ['물 첨벙', '물에 들어갈 때'],
  roll: ['몸 말기 (슝~)', '달리다가 C 버튼으로 구르기 시작'],
  ringBag: ['링 주머니', '링 주머니(+30)를 먹을 때'],
};
export const BGM_INFO = {
  title: ['시작 화면', '캐릭터 고르는 화면'],
  story: ['이야기 장면', '시네마틱 장면 (차분하거나 두근두근)'],
  stage1: ['숲 스테이지', '1스테이지 숲을 달릴 때 (신나고 빠른 곡)'],
  stage2: ['얼음 나라 스테이지', '2스테이지'],
  stage3: ['화산 스테이지', '3스테이지'],
  stage4: ['로봇 도시 스테이지', '4스테이지'],
  stage5: ['하늘 요새 스테이지', '5스테이지'],
  boss: ['보스전', '최종 보스와 싸울 때'],
  super: ['슈퍼 변신', '슈퍼 상태일 때 (아주 신나는 곡)'],
  clear: ['스테이지 클리어', '보스를 이긴 뒤 짧은 축하 곡'],
};

const files = { sfx: {}, bgm: {}, voice: {} }; // 이름 → 파일 경로
const buffers = new Map();
let musicGain = null, voiceGain = null, curMusic = null, curMusicName = null, curVoice = null;
export const audioSettings = { music: 0.5, sfx: 1, voice: 1 };

async function loadList() {
  try {
    const r = await fetch('sounds/list.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const j = await r.json();
    for (const kind of ['sfx', 'bgm', 'voice']) for (const f of j[kind] || []) files[kind][f.replace(/\.[^.]+$/, '')] = `sounds/${kind}/${f}`;
    for (const k of Object.keys(files.sfx)) getBuffer(files.sfx[k]); // 효과음은 미리 불러 둠
  } catch (e) {}
}
function getBuffer(url) {
  if (buffers.has(url)) return buffers.get(url);
  const p = fetch(url).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then((b) => { buffers.set(url, b); return b; }).catch(() => null);
  buffers.set(url, p);
  return p;
}
function playBuffer(buf, { gain = master, vol = 1, rate = 1, loop = false } = {}) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = loop; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(gain); src.start();
  return { src, g };
}
const _initSynth = initAudio;
export function initSound() {
  const first = !ctx;
  _initSynth();
  if (!ctx || !first) return;
  musicGain = ctx.createGain(); musicGain.gain.value = audioSettings.music; musicGain.connect(ctx.destination);
  voiceGain = ctx.createGain(); voiceGain.gain.value = audioSettings.voice * 1.2; voiceGain.connect(ctx.destination);
  loadList().then(() => { if (curMusicName) { const n = curMusicName; curMusicName = null; playMusic(n); } });
}
// 효과음: 파일이 있으면 파일로 바꿔서 재생
for (const key of Object.keys(SFX)) {
  const synth = SFX[key];
  SFX[key] = (...args) => {
    try { // 소리 오류가 게임을 멈추면 안 됨
      const url = files.sfx[key];
      const buf = url && buffers.get(url);
      if (buf && !(buf instanceof Promise) && audioReady()) {
        const rate = key === 'spinCharge' ? 0.8 + (args[0] || 1) * 0.06 : key === 'gearUp' ? 0.9 + (args[0] || 1) * 0.1 : 1;
        playBuffer(buf, { vol: audioSettings.sfx * 2.2, rate });
      } else synth(...args);
    } catch (e) { /* 무시 */ }
  };
}
// 배경음악 (파일이 있을 때만), 부드럽게 바뀜
export function playMusic(name) {
  if (name === curMusicName) return;
  curMusicName = name;
  if (!ctx || !musicGain) return;
  const old = curMusic; curMusic = null;
  if (old) { old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { old.src.stop(); } catch (e) {} }, 2000); }
  const url = files.bgm[name];
  if (!url) return;
  Promise.resolve(getBuffer(url)).then((buf) => {
    if (!buf || curMusicName !== name) return;
    const m = playBuffer(buf, { gain: musicGain, loop: true, vol: 0 });
    m.g.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    curMusic = m;
  });
}
// 목소리 (파일이 있을 때만). 이름이 없으면 조용히 넘어감
export function playVoice(id) {
  stopVoice();
  if (!ctx || !id) return;
  const url = files.voice[id];
  if (!url) return;
  Promise.resolve(getBuffer(url)).then((buf) => { if (buf) curVoice = playBuffer(buf, { gain: voiceGain }); });
}
export function stopVoice() { if (curVoice) { try { curVoice.src.stop(); } catch (e) {} curVoice = null; } }
export function hasVoiceFile(id) { return !!files.voice[id]; }
