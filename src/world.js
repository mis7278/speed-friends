// 스테이지 월드: 지형, 구역(들판/녹슨 공장/보라 늪/노란 협곡/호수), 코스, 소품, 기계 장벽
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------------- 노이즈 ----------------
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// ---------------- 테마 (스테이지별 색) ----------------
export const THEMES = {
  forest: {
    grassA: 0x6fd052, grassB: 0x3f9f3c, grassDry: 0xc8b65a, dirt: 0xb98b55, road: 0xdcc08a, roadLine: 0xf6e8c0,
    rock: 0x8f8b80, cliffA: 0xc97c42, cliffB: 0xe8b462, metal: 0x5d646e, metalLine: 0x3a4048, rust: 0x9a5530,
    swampA: 0x45573a, swampB: 0x5e3f6e, sand: 0xe6d49a, underwater: 0x7f9a6a, snow: 0xf4f8ff, mountain: 0x6f8470,
    leaf: [0x2f9e44, 0x5cc444, 0x86cf4a, 0x3fae3a], pine: [0x1f6e3a, 0x2d8a4a], caps: [0xb04dff, 0x30d0c0, 0xff5fa0],
    skyTop: 0x2a74ee, skyHorizon: 0xc4e6ff, skyBottom: 0xa7c9e4, sun: 0xfff0cc, fog: 0xcbe6ff, fogDensity: 0.00055,
    hemiSky: 0xdcefff, hemiGround: 0x62803c, sunInt: 2.3, hemiInt: 1.05,
    waterDeep: 0x1b6fc4, waterShallow: 0x4fd6e6, swampWater: 0x8040d8, frozen: false, grass: true, snowyTrees: false,
    villainMetal: 0x50565f,
  },
  ice: { // 2스테이지: 1스테이지와 같은 땅에 눈이 소복이 (나무·집 위에도 눈)
    grassA: 0xf4f8ff, grassB: 0xdde8f6, grassDry: 0xcfe0f2, dirt: 0xb3c4d8, road: 0xd3e0ee, roadLine: 0xffffff,
    rock: 0x8794a8, cliffA: 0x8fc0ee, cliffB: 0xd6ebff, metal: 0x58637a, metalLine: 0x394255, rust: 0x5d7aa0,
    swampA: 0xc7dcf2, swampB: 0xa9b6ff, sand: 0xe8f0ff, underwater: 0xb8d4ee, snow: 0xffffff, mountain: 0xbfcbdc,
    leaf: [0x2f6e4a, 0x3f7f56, 0x4a8a5f, 0x356f4c], pine: [0x1f5a3a, 0x2d6a4a], caps: [0x7fd8ff, 0xa0a8ff, 0xdff6ff],
    skyTop: 0x4a86e0, skyHorizon: 0xe2efff, skyBottom: 0xc8d8ea, sun: 0xfff6e8, fog: 0xe4eefa, fogDensity: 0.0006,
    hemiSky: 0xeef6ff, hemiGround: 0x9aaabf, sunInt: 2.0, hemiInt: 1.15,
    waterDeep: 0x9fd0f0, waterShallow: 0xd8f0ff, swampWater: 0xb0a8ff, frozen: true, grass: false, snowyTrees: true,
    villainMetal: 0x4a5266,
  },
  lava: { // 3스테이지: 끝없는 용암 바다 한가운데의 섬 (나무·집 없음, 여러 가지 화산 돌)
    grassA: 0x4a3f3a, grassB: 0x2f2826, grassDry: 0x6a4434, dirt: 0x5a3a2a, road: 0x8a7a6a, roadLine: 0xffb060,
    rock: 0x3a3230, cliffA: 0x7a3a22, cliffB: 0xa85a32, metal: 0x4d535c, metalLine: 0x2a2e35, rust: 0x8a4020,
    swampA: 0x56504c, swampB: 0x6e5c56, sand: 0x5a3426, underwater: 0xff6a20, snow: 0x7a6a66, mountain: 0x3a302c,
    leaf: [0x3a3230, 0x2a2422, 0x4a3a34, 0x30282a], pine: [0x1a1418, 0x2a2026], caps: [0xff6a20, 0xffb040, 0xff3a10],
    skyTop: 0x4a1c16, skyHorizon: 0xe08048, skyBottom: 0x8a3a20, sun: 0xffc080, fog: 0xa05a3a, fogDensity: 0.0007,
    hemiSky: 0xffc8a0, hemiGround: 0x6a2a1a, sunInt: 1.9, hemiInt: 1.05,
    waterDeep: 0xff4a10, waterShallow: 0xffc040, swampWater: 0xff6a20, frozen: false, grass: false, snowyTrees: false, lava: true,
    villainMetal: 0x4a4a52,
  },
  sky: { // 4스테이지: 하늘 위 기계 철판 땅 (구멍 아래는 푹신한 구름, 끝 너머는 낭떠러지)
    grassA: 0x9aa6b4, grassB: 0x7d8a99, grassDry: 0xb0b8c4, dirt: 0x6a7480, road: 0xd8dee6, roadLine: 0x4fd8ff,
    rock: 0x6a7480, cliffA: 0xc89a3a, cliffB: 0xe8c060, metal: 0x5d646e, metalLine: 0x3a4048, rust: 0x7a8aa0,
    swampA: 0x6a5a9a, swampB: 0x8a6ac8, sand: 0xc8d0da, underwater: 0xffffff, snow: 0xffffff, mountain: 0x8a94a3,
    leaf: [0x4fd8ff, 0x7fe8ff, 0x3ac0f0, 0x9ff0ff], pine: [0x5a6470, 0x6a7480], caps: [0x4fd8ff, 0xffd23a, 0xff6ab0],
    skyTop: 0x2a6ae0, skyHorizon: 0xd8ecff, skyBottom: 0xf4f8ff, sun: 0xfff6e0, fog: 0xe4f0ff, fogDensity: 0.00045,
    hemiSky: 0xeaf4ff, hemiGround: 0xc8d4e4, sunInt: 2.2, hemiInt: 1.2,
    waterDeep: 0xffffff, waterShallow: 0xffffff, swampWater: 0xffffff, frozen: false, grass: false, snowyTrees: false, skyLand: true,
    villainMetal: 0x50565f,
  },
  ship: { // 5스테이지: 맵 전체가 닥터 기어의 거대 우주선 (진짜 본거지). 끝은 우주선 외벽, 밖은 우주
    grassA: 0x5d6572, grassB: 0x4a515c, grassDry: 0x6a7280, dirt: 0x3a4048, road: 0x8a94a3, roadLine: 0xff4fd8,
    rock: 0x4a515c, cliffA: 0x6a4a9a, cliffB: 0x8a6ac8, metal: 0x3a4048, metalLine: 0x23272e, rust: 0x5a3a7a,
    swampA: 0x2a3a5a, swampB: 0x2a5a7a, sand: 0x6a7480, underwater: 0x4fd8ff, snow: 0x9aa6b4, mountain: 0x3a4048,
    leaf: [0xff4fd8, 0xd040ff, 0x9a5aff, 0xff7ae0], pine: [0x3a4048, 0x4a515c], caps: [0xff4fd8, 0x4fd8ff, 0xffd23a],
    skyTop: 0x01020a, skyHorizon: 0x0a1028, skyBottom: 0x000000, sun: 0xeef2ff, fog: 0x0a1028, fogDensity: 0.00035,
    hemiSky: 0xc8d0ff, hemiGround: 0x3a3050, sunInt: 2.1, hemiInt: 1.15,
    waterDeep: 0x000000, waterShallow: 0x000000, swampWater: 0x000000, frozen: false, grass: false, snowyTrees: false, shipLand: true, space: true,
    villainMetal: 0x3a3f4a,
  },
  space: { // 6스테이지: 우주 (아래에 지구) — 슈퍼 상태로 날며 싸우는 비행 슈팅
    grassA: 0, grassB: 0, grassDry: 0, dirt: 0, road: 0, roadLine: 0, rock: 0, cliffA: 0, cliffB: 0, metal: 0x3a4048, metalLine: 0, rust: 0,
    swampA: 0, swampB: 0, sand: 0, underwater: 0, snow: 0, mountain: 0, leaf: [0x888888], pine: [0x888888], caps: [0x888888],
    skyTop: 0x000005, skyHorizon: 0x050a20, skyBottom: 0x000000, sun: 0xffffff, fog: 0x000000, fogDensity: 0.00001,
    hemiSky: 0xdde6ff, hemiGround: 0x30406a, sunInt: 2.4, hemiInt: 1.2,
    waterDeep: 0, waterShallow: 0, swampWater: 0, frozen: false, grass: false, snowyTrees: false, space: true, villainMetal: 0x3a3f4a,
  },
};
// 지금 스테이지의 땅 종류 (World가 만들어질 때 정해짐): forest / ice / lava / sky
export const MODE = { name: 'forest' };
// 얼음 나라 시작 지점: 북쪽 장벽 바로 안쪽의 거대한 얼음산 (장벽보다 훨씬 높음)
export const ICE_PEAK = { x: 0, z: 1440, r: 330, h: 235, top: 16 };
// 대지 한가운데: 땅속에 크리스탈이 잠들어 있던 곳 (기어 군단이 파낸 구덩이)
export const CRYSTAL_SITE = { x: 0, z: -54, r: 16, d: 2.6 };

// ---------------- 구역 (맵 4배: 가로세로 2배) ----------------
export const ZONES = {
  rust: { x: 940, z: 800, r: 600, name: '녹슨 공장' },
  swamp: { x: -940, z: -760, r: 600, name: '보라 늪' },
  mesa: { x: -960, z: 800, r: 600, name: '노란 협곡' },
  lake: { x: 920, z: -840, r: 580, name: '파란 호수' },
};
const ZL = [ZONES.rust, ZONES.swamp, ZONES.mesa, ZONES.lake];
const ZW = new Float32Array(4);
export function zoneWeights(x, z) {
  const wob = (vnoise(x * 0.004 + 50, z * 0.004) - 0.5) * 220;
  for (let i = 0; i < 4; i++) {
    const Z = ZL[i];
    const d = Math.hypot(x - Z.x, z - Z.z) + wob;
    ZW[i] = 1 - smooth(Z.r * 0.6, Z.r, d);
  }
  return ZW;
}

// ---------------- 퀘스트 장소 (평평하게 다짐) ----------------
export const SITES = {
  base: { x: -300, z: 460, r: 42, h: 3.5 },      // 퀘스트1: 로봇 기지
  factory: { x: 460, z: -460, r: 50, h: 3 },     // 퀘스트2: 로봇 생산 공장
  lab: { x: -1040, z: -840, r: 60, h: 2.5 },     // 퀘스트4~5: 과학 연구소 (보라 늪 한가운데)
};
const SITES_LIST = Object.values(SITES);

// ---------------- 올라갈 수 있는 산 ----------------
export const MOUNTAINS = [
  { x: -460, z: 220, r: 260, h: 105 },
  { x: 470, z: -150, r: 240, h: 90 },
  { x: -300, z: -620, r: 280, h: 120 },
  { x: 380, z: 1180, r: 300, h: 140 },
  { x: -1300, z: 30, r: 270, h: 125 },
  { x: 1320, z: 120, r: 270, h: 115 },
];

// ---------------- 연못 (빠지면 헤엄쳐야 함, 물가는 완만해서 언제든 나올 수 있음) ----------------
export const PONDS = [
  { x: -230, z: 220, r: 46, d: 11, falls: true },   // 비밀 폭포
  { x: -180, z: 700, r: 40, d: 10, pier: true },
  { x: 250, z: 560, r: 45, d: 12 },
  { x: -560, z: -120, r: 50, d: 11, pier: true },
  { x: 300, z: 180, r: 36, d: 9 },
  { x: -200, z: -300, r: 45, d: 12, pier: true },
  { x: 700, z: 160, r: 45, d: 12 },
  { x: -60, z: 1300, r: 55, d: 13, pier: true },
  { x: 1250, z: -330, r: 50, d: 12 },
  { x: -650, z: -1150, r: 45, d: 10 },
];

// ---------------- 하늘 지역 (하늘 섬과 대포) ----------------
export const SKY = { x: 0, z: -1080, r: 420 };

// ---------------- 다음 대지로 가는 길 (북쪽) ----------------
export const EXIT = { halfWidth: 75, start: 1700, end: 2250 };
export function exitMask(x, z) { // 0~1: 북쪽 출구 길 안쪽일수록 1
  if (z < 1500 || MODE.name !== 'forest') return 0;
  return (1 - smooth(EXIT.halfWidth, EXIT.halfWidth + 60, Math.abs(x))) * smooth(1500, 1650, z);
}

// ---------------- 길 ----------------
export const ROAD = { width: 7, shoulder: 10 };
export const START_ROAD_END = 860;
export const startRoadX = (z) => 60 * Math.sin(z * 0.0045);
export const ringR = (th) => 860 + 80 * Math.sin(3 * th + 0.5);
export function ringPoint(th, out = new THREE.Vector3()) { const r = ringR(th); return out.set(r * Math.cos(th), 0, r * Math.sin(th)); }
export function ringDir(th) {
  const r = ringR(th), dr = 240 * Math.cos(3 * th + 0.5);
  return new THREE.Vector3(dr * Math.cos(th) - r * Math.sin(th), 0, dr * Math.sin(th) + r * Math.cos(th)).normalize();
}
export function startRoadDir(z) { return new THREE.Vector3(60 * 0.0045 * Math.cos(z * 0.0045), 0, 1).normalize(); }
export function roadDist(x, z) {
  let d = Infinity;
  if (z > -70 && z < START_ROAD_END + 20) d = Math.abs(x - startRoadX(z)) + Math.max(0, -60 - z) * 3;
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  return Math.min(d, Math.abs(r - ringR(th)));
}
function roadMask(x, z) { return 1 - smooth(ROAD.width, ROAD.width + ROAD.shoulder, roadDist(x, z)); }
// 하늘 도시의 구멍 (떨어지면 아래 구름 위로)
const VILLAGE_SPOTS = [[-120, 380], [450, 450], [-470, -40], [60, -420]];
export const SKY_HOLES = (() => {
  const r = mulberry32(4242), out = [];
  for (let i = 0; i < 900 && out.length < 34; i++) {
    const a = r() * Math.PI * 2, d = 140 + r() * 1420, x = Math.cos(a) * d, z = Math.sin(a) * d, R = 14 + r() * 26;
    if (roadDist(x, z) < R + 18) continue;
    if (Object.values(SITES).some((F) => Math.hypot(x - F.x, z - F.z) < F.r + R + 25)) continue;
    if (VILLAGE_SPOTS.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 50 + R)) continue;
    if (out.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + R + 60)) continue;
    out.push({ x, z, r: R });
  }
  return out;
})();
const skyEdgeR = (x, z) => CFG.sky.edge + (vnoise(x * 0.004 + 31, z * 0.004 - 7) - 0.5) * 120;
const lavaEdgeR = (x, z) => CFG.lava.edge + (vnoise(x * 0.004 + 20, z * 0.004) - 0.5) * 160;
export function skyEdgeAt(x, z) { return skyEdgeR(x, z); }
const roadBase = (x, z) => 3 + 2.5 * (vnoise(x * 0.004, z * 0.004) * 2 - 1);

// ---------------- 지형 높이 ----------------
export function terrainHeight(x, z) {
  zoneWeights(x, z);
  let h = 3 + (fbm(x * 0.0035 + 3, z * 0.0035, 3) - 0.5) * 24 + (vnoise(x * 0.035, z * 0.035) - 0.5) * 2.2;
  h = Math.max(h, 0.8);
  if (ZW[0] > 0) h = mix(h, 2.5 + vnoise(x * 0.02, z * 0.02) * 0.4, ZW[0]);
  if (ZW[1] > 0) h = mix(h, 0.3 + (fbm(x * 0.02 + 7, z * 0.02, 3) - 0.5) * 8, ZW[1]);
  if (ZW[2] > 0) {
    const v = fbm(x * 0.0045 + 11, z * 0.0045 - 4, 3) * 7;
    const fl = Math.floor(v), t = smooth(0.8, 1, v - fl);
    h = mix(h, Math.max(1.5, 9 * (fl + t) - 8), ZW[2]);
  }
  if (ZW[3] > 0) {
    const d = Math.hypot(x - ZONES.lake.x, z - ZONES.lake.z) / ZONES.lake.r;
    let lk = mix(-11, 2, smooth(0.3, 0.85, d));
    lk += Math.max(0, vnoise(x * 0.012, z * 0.012) - 0.68) * 30;
    h = mix(h, lk, ZW[3]);
  }
  // 올라갈 수 있는 산 (경사가 완만해서 달리거나 점프로 오를 수 있음)
  for (const M of MOUNTAINS) {
    const dx = x - M.x, dz = z - M.z, d2 = (dx * dx + dz * dz) / (M.r * M.r);
    if (d2 < 1) { const k = (1 - d2) * (1 - d2); h += M.h * k * (0.85 + 0.3 * vnoise(x * 0.02 + M.x, z * 0.02)); }
  }
  for (const P of PONDS) {
    const dx = x - P.x, dz = z - P.z, d2 = dx * dx + dz * dz, R = P.r * 1.6;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2);
    const hp = d < P.r ? mix(-P.d, 0.4, smooth(P.r * 0.15, P.r, d)) : 0.4 + (d - P.r) * 0.25;
    h = mix(h, Math.min(h, hp), 1 - smooth(P.r * 1.2, R, d));
  }
  const md = MODE.name;
  if (md === 'space') return -600;
  if (md === 'ice') { // 거대한 얼음산 (꼭대기는 평평한 출발 지점)
    const P = ICE_PEAK, d = Math.hypot(x - P.x, z - P.z);
    if (d < P.r) h += P.h * Math.pow(1 - smooth(P.top, P.r, d), 1.25) * (0.94 + 0.06 * vnoise(x * 0.03, z * 0.03));
  } else if (md === 'lava') { // 용암이 흐르는 좁은 골짜기 (점프로 넘어갈 수 있음)
    const rv = Math.abs(vnoise(x * 0.0055 + 13, z * 0.0055 - 9) - 0.5);
    if (rv < 0.03) h = mix(h, -3, (1 - smooth(0.012, 0.03, rv)) * smooth(90, 160, Math.hypot(x, z)));
  } else if (md === 'sky') { // 물이던 곳(호수·연못·늪)과 구멍 → 아래로 구름이 보이는 구멍
    if (h < 0.3) h = CFG.sky.cloudY;
    for (const H of SKY_HOLES) {
      const dx = x - H.x, dz = z - H.z; if (dx * dx + dz * dz > H.r * H.r) continue;
      h = mix(CFG.sky.cloudY, h, smooth(H.r - 2.5, H.r, Math.sqrt(dx * dx + dz * dz)));
    }
  }
  const ds = Math.hypot(x, z);
  h = mix(h, 3, 1 - smooth(25, 60, ds));
  { // 크리스탈 구덩이
    const C = CRYSTAL_SITE, dc = Math.hypot(x - C.x, z - C.z);
    if (dc < C.r + 4) h = mix(h, 3 - C.d * Math.max(0, 1 - (dc / C.r) ** 2), 1 - smooth(C.r, C.r + 4, dc));
  }
  for (const F of SITES_LIST) { const d = Math.hypot(x - F.x, z - F.z); if (d < F.r) h = mix(h, F.h, 1 - smooth(F.r * 0.65, F.r, d)); }
  const rm = roadMask(x, z);
  if (rm > 0) h = mix(h, roadBase(x, z), rm);
  if (md === 'lava') { // 섬 끝: 용암 바다로 가라앉음
    const E = lavaEdgeR(x, z);
    if (ds > E - 160) h = mix(h, -22, smooth(E - 160, E + 50, ds));
    return h;
  }
  if (md === 'sky') { if (ds > skyEdgeR(x, z)) h = CFG.sky.cloudY; return h; } // 땅 끝 너머: 구름 바다 (밟을 수 없음)
  if (md === 'ship') { // 우주선 갑판: 높낮이를 낮추고 물 없음, 외벽 너머는 우주
    if (ds > CFG.world.barrierR + 3) return -600;
    return Math.max(0.5, 3 + (h - 3) * 0.4);
  }
  // 맵 바깥: 가파른 산맥 (북쪽 출구 길만 뚫려 있음)
  if (ds > 1700) {
    const ex = exitMask(x, z);
    const wall = smooth(1720, 1860, ds) * (170 + 140 * fbm(x * 0.003, z * 0.003, 3));
    h += wall * (1 - ex) + ex * smooth(1700, 2300, z) * 14 * vnoise(x * 0.02, z * 0.02);
  }
  return h;
}
// 북쪽 출구 길에서 얼음 나라 쪽으로 갈수록 눈이 덮임 (0~1)
export function snowAmount(x, z) { return exitMask(x, z) * smooth(1750, 2150, z); }

// ---------------- 정적 메시 묶음 (그리기 횟수 줄이기) ----------------
const BASE = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  tri: new THREE.CylinderGeometry(0.5, 0.5, 1, 3),
  sph: new THREE.SphereGeometry(0.5, 10, 8),
  hemi: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  dode: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 14),
  gear: (() => { // 톱니바퀴
    const s = new THREE.Shape(); const N = 12;
    for (let i = 0; i < N * 2; i++) { const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? 0.42 : 0.5; const a2 = a + Math.PI / (N * 2); i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); s.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.14, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }); g.translate(0, 0, -0.06); return g;
  })(),
};
const _v2 = new THREE.Vector2();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

// 소품 묶음: 처음엔 "설계도"만 저장해 두고, 플레이어 가까운 칸만 실제 메시로 만들어요 (멀어지면 치움)
class Batch {
  constructor(cell = 200) { this.cell = cell; this.cells = new Map(); this.built = new Map(); }
  add(geo, color, m, kind = 'lit') {
    const ix = Math.floor(m.elements[12] / this.cell), iz = Math.floor(m.elements[14] / this.cell);
    const key = kind + ':' + ix + ',' + iz;
    let c = this.cells.get(key);
    if (!c) { c = { kind, cx: (ix + 0.5) * this.cell, cz: (iz + 0.5) * this.cell, list: [] }; this.cells.set(key, c); }
    c.list.push({ geo, color, m: m.clone() });
  }
  _make(c, mats, shadows) {
    const geos = [];
    for (const r of c.list) {
      let g = r.geo.index ? r.geo.toNonIndexed() : r.geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(r.m);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      _c.set(r.color);
      for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geos.push(g);
    }
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[c.kind]);
    mesh.castShadow = shadows && c.kind === 'lit'; mesh.receiveShadow = c.kind === 'lit';
    return mesh;
  }
  buildAll(parent, mats, shadows) { for (const [k, c] of this.cells) { const m = this._make(c, mats, shadows); parent.add(m); this.built.set(k, m); } }
  // 가까운 칸 만들기 (한 번에 maxBuild 칸까지), 먼 칸 치우기
  stream(parent, mats, shadows, fx, fz, rIn, rOut, maxBuild = 1) {
    let made = 0;
    for (const [k, c] of this.cells) {
      const d = Math.hypot(c.cx - fx, c.cz - fz);
      const m = this.built.get(k);
      if (!m && d < rIn && made < maxBuild) { const mesh = this._make(c, mats, shadows); parent.add(mesh); this.built.set(k, mesh); made++; }
      else if (m && d > rOut) { parent.remove(m); m.geometry.dispose(); this.built.delete(k); }
    }
    return made;
  }
}

// 나무·바위 같은 물체를 대량으로: 위치 정보는 전부 갖고 있고, 그리는 건 플레이어 근처만
class TreeSet {
  constructor(parts, cap, nearR) { // parts: [{geo, mat, local: Matrix4, colors?: [..]}]
    this.cap = cap; this.nearR = nearR;
    this.parts = parts.map((p) => ({ ...p, mesh: new THREE.InstancedMesh(p.geo, p.mat, cap) }));
    for (const p of this.parts) { if (p.colors) p.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); p.mesh.count = 0; p.mesh.frustumCulled = false; }
    this.data = []; this.buckets = new Map(); this.slot = new Map();
  }
  add(x, y, z, s, ry, rnd, sy = s) {
    const i = this.data.length;
    this.data.push({ x, y, z, s, sy, ry, rnd, dead: false });
    const k = Math.floor(x / 128) * 100003 + Math.floor(z / 128);
    if (!this.buckets.has(k)) this.buckets.set(k, []);
    this.buckets.get(k).push(i);
    return i;
  }
  attach(parent, castShadow) { for (const p of this.parts) { p.mesh.castShadow = castShadow; p.mesh.receiveShadow = true; parent.add(p.mesh); } }
  rebuild(fx, fz) {
    const R = this.nearR, bx0 = Math.floor((fx - R) / 128), bx1 = Math.floor((fx + R) / 128), bz0 = Math.floor((fz - R) / 128), bz1 = Math.floor((fz + R) / 128);
    const mm = new THREE.Matrix4();
    this.slot.clear();
    let n = 0;
    for (let bx = bx0; bx <= bx1 && n < this.cap; bx++) for (let bz = bz0; bz <= bz1 && n < this.cap; bz++) {
      const list = this.buckets.get(bx * 100003 + bz);
      if (!list) continue;
      for (const i of list) {
        const d = this.data[i];
        if (d.dead || (d.x - fx) ** 2 + (d.z - fz) ** 2 > R * R) continue;
        if (n >= this.cap) break;
        _m.compose(_p.set(d.x, d.y, d.z), _q.setFromEuler(_e.set(0, d.ry, 0)), _s.set(d.s, d.sy, d.s));
        for (const p of this.parts) {
          mm.multiplyMatrices(_m, p.local);
          p.mesh.setMatrixAt(n, mm);
          if (p.colors) p.mesh.setColorAt(n, _c.set(p.colors[Math.floor(d.rnd * p.colors.length * 0.999)]));
        }
        this.slot.set(i, n);
        n++;
      }
    }
    for (const p of this.parts) {
      p.mesh.count = n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
  show(i) {
    const n = this.slot.get(i), d = this.data[i];
    if (n == null || d.dead) return;
    const mm = new THREE.Matrix4();
    _m.compose(_p.set(d.x, d.y, d.z), _q.setFromEuler(_e.set(0, d.ry, 0)), _s.set(d.s, d.sy, d.s));
    for (const p of this.parts) { mm.multiplyMatrices(_m, p.local); p.mesh.setMatrixAt(n, mm); p.mesh.instanceMatrix.needsUpdate = true; }
  }
  hide(i) {
    const n = this.slot.get(i);
    if (n == null) return;
    _m.makeScale(0, 0, 0);
    for (const p of this.parts) { p.mesh.setMatrixAt(n, _m); p.mesh.instanceMatrix.needsUpdate = true; }
  }
}

// 바람에 흔들리는 나뭇잎 (가까이 빠르게 지나가면 더 크게 흔들림)
const SWAY = { time: { value: 0 }, player: { value: new THREE.Vector3() }, gust: { value: 0 } };
function swayMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SWAY.time; sh.uniforms.uPlayer = SWAY.player; sh.uniforms.uGust = SWAY.gust;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uPlayer; uniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float hgt = 1.0 + 0.5 * transformed.y;
        float pd = length(ip.xz - uPlayer.xz);
        float g = uGust * (1.0 - smoothstep(2.0, 12.0, pd));
        float sw = sin(uTime * 1.6 + ip.x * 0.13 + ip.z * 0.11) * 0.06 + sin(uTime * 14.0 + ip.x) * 0.25 * g;
        transformed.x += sw * hgt; transformed.z += cos(uTime * 1.3 + ip.z * 0.1) * 0.04 * hgt + sin(uTime * 17.0 + ip.z) * 0.2 * g * hgt;
      #endif`);
  };
  return mat;
}
// 멀리 있는 숲: 아주 단순한 모양 하나로 (가까운 곳은 셰이더가 숨김)
const FAR = { center: { value: new THREE.Vector2() }, nearR: { value: 400 } };
function farMaterial(color) {
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFarC = FAR.center; sh.uniforms.uNearR = FAR.nearR;
    sh.vertexShader = 'uniform vec2 uFarC; uniform float uNearR;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 fp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        if (length(fp.xz - uFarC) < uNearR - 20.0) transformed *= 0.0;
      #endif`);
  };
  return mat;
}

const L = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function starPath(g, cx, cy, ro, ri) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}

// ---------------- 지형 스트리밍: 가까운 땅은 촘촘하게, 멀리는 단순하게 ----------------
class TerrainStreamer {
  constructor(world, mobile) {
    this.w = world; this.CH = 256; this.half = CFG.world.terrainHalf;
    this.lods = mobile ? [{ step: 8, r: 400 }, { step: 32, r: 1100 }] : [{ step: 4, r: 470 }, { step: 16, r: 1250 }];
    this.chunks = new Map();
    this.cover = { value: 0 }; this.center = { value: new THREE.Vector2() };
    this._far(mobile ? 80 : 64);
  }
  // 맵 전체를 아주 단순하게 (가까운 곳은 그리지 않음)
  _far(step) {
    const g = this._grid(-this.half, -this.half, this.half * 2, step, 0);
    const mat = this.w.matLit.clone();
    const cover = this.cover, center = this.center;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCover = cover; sh.uniforms.uC = center;
      sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWxz = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = 'uniform float uCover; uniform vec2 uC; varying vec2 vWxz;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (length(vWxz - uC) < uCover) discard;');
    };
    mat.polygonOffset = true; mat.polygonOffsetFactor = 4; mat.polygonOffsetUnits = 8;
    g.translate(0, -1.5, 0);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.w.root.add(mesh);
    this.farMesh = mesh;
  }
  // x0,z0에서 size 크기, step 간격의 땅 조각 (skirt: 옆면을 아래로 늘려 틈 가리기)
  _grid(x0, z0, size, step, skirt) {
    const N = Math.round(size / step) + 1, W = this.w;
    const H = new Float32Array((N + 2) * (N + 2));
    for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) H[(j + 1) * (N + 2) + (i + 1)] = terrainHeight(x0 + i * step, z0 + j * step);
    const hAt = (i, j) => H[(j + 1) * (N + 2) + (i + 1)];
    const vCount = N * N + (skirt ? 4 * N : 0);
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
    const c = new THREE.Color();
    let k = 0;
    const put = (x, y, z, nx, ny, nz, cc) => { pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b; k++; };
    const normals = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + i * step, z = z0 + j * step, h = hAt(i, j);
      const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * step), dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * step);
      const l = Math.hypot(dx, 1, dz), nx = -dx / l, ny = 1 / l, nz = -dz / l;
      W.colorAt(x, z, h, Math.hypot(dx, dz), c);
      const q = (j * N + i) * 3; normals[q] = nx; normals[q + 1] = ny; normals[q + 2] = nz;
      put(x, h, z, nx, ny, nz, c);
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, b = a + 1, d = a + N, e = d + 1; idx.push(a, d, b, b, d, e); }
    if (skirt) { // 네 변 아래로 늘어뜨린 벽
      const edges = [[0, 0, 1, 0], [N - 1, 0, 0, 1], [N - 1, N - 1, -1, 0], [0, N - 1, 0, -1]];
      for (const [si, sj, di, dj] of edges) {
        const start = k;
        for (let t = 0; t < N; t++) {
          const i = si + di * t, j = sj + dj * t, src = j * N + i;
          c.setRGB(col[src * 3], col[src * 3 + 1], col[src * 3 + 2]);
          put(pos[src * 3], pos[src * 3 + 1] - skirt, pos[src * 3 + 2], normals[src * 3], normals[src * 3 + 1], normals[src * 3 + 2], c);
        }
        for (let t = 0; t < N - 1; t++) {
          const i = si + di * t, j = sj + dj * t, i2 = si + di * (t + 1), j2 = sj + dj * (t + 1);
          const a = j * N + i, b = j2 * N + i2, a2 = start + t, b2 = start + t + 1;
          idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(vCount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : idx);
    geo.computeBoundingSphere();
    return geo;
  }
  _want(i, j, fx, fz) {
    const cx = (i + 0.5) * this.CH, cz = (j + 0.5) * this.CH;
    const d = Math.max(0, Math.hypot(cx - fx, cz - fz) - this.CH * 0.5);
    if (d < this.lods[0].r) return 0;
    if (d < this.lods[1].r) return 1;
    return -1;
  }
  update(fx, fz, budgetMs = 6, all = false) {
    const t0 = performance.now(), CH = this.CH, R = this.lods[1].r + CH;
    const i0 = Math.floor((fx - R) / CH), i1 = Math.floor((fx + R) / CH), j0 = Math.floor((fz - R) / CH), j1 = Math.floor((fz + R) / CH);
    const todo = [];
    const seen = new Set();
    let coverR = Infinity;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if ((i + 1) * CH < -this.half || i * CH > this.half || (j + 1) * CH < -this.half || j * CH > this.half) continue;
      const key = i * 1000 + j, want = this._want(i, j, fx, fz);
      if (want < 0) continue;
      seen.add(key);
      const cur = this.chunks.get(key);
      if (!cur || cur.lod !== want) {
        const d = Math.hypot((i + 0.5) * CH - fx, (j + 0.5) * CH - fz);
        todo.push({ key, i, j, want, d });
        if (!cur) coverR = Math.min(coverR, d - CH * 0.75);
      }
    }
    for (const [key, ch] of this.chunks) if (!seen.has(key)) { this.w.root.remove(ch.mesh); ch.mesh.geometry.dispose(); this.chunks.delete(key); }
    todo.sort((a, b) => a.d - b.d);
    for (const t of todo) {
      if (!all && performance.now() - t0 > budgetMs) break;
      const old = this.chunks.get(t.key);
      const geo = this._grid(t.i * CH, t.j * CH, CH, this.lods[t.want].step, t.want === 0 ? 6 : 10);
      const mesh = new THREE.Mesh(geo, this.w.matLit);
      mesh.receiveShadow = true;
      this.w.root.add(mesh);
      if (old) { this.w.root.remove(old.mesh); old.mesh.geometry.dispose(); }
      this.chunks.set(t.key, { lod: t.want, mesh });
      if (!old && t.d - CH * 0.75 <= coverR) coverR = Infinity; // 다시 계산은 다음 프레임에
    }
    // 아직 못 만든 칸이 있으면 그 칸까지는 먼 지형을 보여줌 (구멍 방지)
    let missing = Infinity;
    for (const t of todo) if (!this.chunks.get(t.key)) missing = Math.min(missing, t.d - CH * 0.75);
    this.cover.value = Math.max(0, Math.min(this.lods[1].r - CH * 0.25, missing));
    this.center.value.set(fx, fz);
  }
}

// =====================================================================
export class World {
  constructor(scene, themeName = 'forest', quality = { mobile: false }) {
    MODE.name = themeName;
    this.mode = themeName;
    this.scene = scene;
    this.themeName = themeName;
    this.T = THEMES[themeName];
    this.q = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    this.platforms = []; this.pgrid = new Map(); this.movers = [];
    this.ramps = []; this.loops = []; this.springs = []; this.boostPads = []; this.checkpoints = [];
    this.treeGrid = new Map(); this.ringSpots = []; this.enemySpots = []; this.hazards = []; this.walls = [];
    this.spinners = []; this.smokeEmitters = []; this.searchlights = []; this.lights = []; this.cannons = [];
    this.questTargets = {}; this.secret = null;
    this.landmarks = []; this.towerTops = [];
    this.houses = []; this.fadeBoxes = []; this.indoors = []; this.discoveries = []; this.chests = []; this.waterfalls = []; this.beacons = [];
    this.barrierUp = true; this.barrierSink = 0;
    this.occ = new Set();
    this.rand = mulberry32({ forest: 1234, ice: 777, lava: 555, sky: 999, ship: 4321 }[themeName] || 777);
    this.meltPatches = [];
    this.hullHoles = (quality.hullHoles || []).map((h) => ({ a: +h.a || 0, y: +h.y || 0 }));
    this.batch = new Batch();       // 작은 소품: 가까울 때만 만들어짐
    this.bigBatch = new Batch(400); // 큰 건물·랜드마크: 멀리서도 보임
    this.lm = false;                // true인 동안 put()은 랜드마크로
    this.breakables = [];           // 부술 수 있는 나무·바위 (파워형·슈퍼)
    this.streamT = 0; this.lastRebuild = new THREE.Vector2(1e9, 1e9);
    this.matLit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    if (themeName === 'space') this._buildSpace(); else this._build();
  }

  // ---------- 지면 ----------
  _cell(ix, iz) { return ix * 100003 + iz; }
  _register(p) {
    this.platforms.push(p);
    if (p.moving) { this.movers.push(p); return p; }
    const C = 40, mg = 3;
    for (let ix = Math.floor((p.min.x - mg) / C); ix <= Math.floor((p.max.x + mg) / C); ix++)
      for (let iz = Math.floor((p.min.z - mg) / C); iz <= Math.floor((p.max.z + mg) / C); iz++) {
        const k = this._cell(ix, iz);
        if (!this.pgrid.has(k)) this.pgrid.set(k, []);
        this.pgrid.get(k).push(p);
      }
    return p;
  }
  _near(x, z) { return this.pgrid.get(this._cell(Math.floor(x / 40), Math.floor(z / 40))) || []; }

  terrainAt(x, z) {
    let h = terrainHeight(x, z);
    if (this.T.frozen || this.mode === 'lava') return Math.max(h, 0);
    if (this.mode === 'sky') return h;
    return h < CFG.water.swimDepth ? CFG.water.swimDepth : h;
  }
  groundAt(x, z, y = Infinity, stepUp = 0.9, deep = false) {
    let h = terrainHeight(x, z), surface = 'terrain';
    if (this.mode === 'lava') { if (h < CFG.lava.level) { h = CFG.lava.level - 0.3; surface = 'lava'; } }
    else if (this.mode === 'space') { h = 0; surface = 'space'; }
    else if (this.mode === 'ship' && h < -100) { h = -1e4; surface = 'void'; }
    else if (this.mode === 'sky') { if (h < -20) { if (Math.hypot(x, z) < skyEdgeR(x, z)) { h = CFG.sky.cloudY; surface = 'cloud'; } else { h = -1e4; surface = 'void'; } } }
    else if (this.T.frozen) { if (h < 0) { h = 0; surface = 'ice'; } }
    else if (h < CFG.water.swimDepth) { if (!deep) h = CFG.water.swimDepth; surface = 'water'; }
    else if (h < 0) surface = 'shallow';
    this.lastPlatform = null;
    const test = (p) => {
      if (p.dead) return;
      let top;
      if (p.kind === 'disc') { const dx = x - p.center.x, dz = z - p.center.z; if (dx * dx + dz * dz > p.radius * p.radius) return; top = p.top; }
      else { if (x < p.min.x || x > p.max.x || z < p.min.z || z > p.max.z) return; top = p.max.y; }
      if (top <= y + stepUp && top > h) { h = top; surface = 'platform'; this.lastPlatform = p; }
    };
    for (const p of this._near(x, z)) test(p);
    for (const p of this.movers) test(p);
    for (const r of this.ramps) {
      const dx = x - r.center.x, dz = z - r.center.z;
      const lx = dx * r.cos - dz * r.sin, lz = dx * r.sin + dz * r.cos;
      if (Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.l / 2) {
        const rh = r.base + r.h * (lz / r.l + 0.5);
        if (rh <= y + stepUp && rh > h) { h = rh; surface = 'ramp'; this.lastPlatform = null; }
      }
    }
    // 루프 바깥쪽 꼭대기 (위에서 떨어지면 설 수 있음)
    for (const L of this.loops) {
      const rx = x - L.base.x, rz = z - L.base.z, along = rx * L.fwd.x + rz * L.fwd.z, Ro = L.R + CFG.loop.thickness;
      if (Math.abs(along) > Ro * 0.75) continue;
      const lat = rx * L.side.x + rz * L.side.z, t = (Math.PI - Math.asin(along / Ro)) / (Math.PI * 2);
      if (Math.abs(lat - L.offset * (t - 0.5)) > L.width / 2) continue;
      const top = L.base.y + L.R + Math.sqrt(Ro * Ro - along * along);
      if (top <= y + stepUp && top > h) { h = top; surface = 'loopTop'; this.lastPlatform = null; }
    }
    this.lastSurface = surface;
    return h;
  }
  // 카메라가 벽 속으로 들어가지 않게
  solidAt(p, skipFade = false) {
    for (const b of this._near(p.x, p.z)) {
      if (b.dead || b.kind === 'disc' || (skipFade && b.fade)) continue;
      if (p.x > b.min.x - 0.3 && p.x < b.max.x + 0.3 && p.z > b.min.z - 0.3 && p.z < b.max.z + 0.3 && p.y > b.min.y - 0.3 && p.y < b.max.y + 0.3) return true;
    }
    return false;
  }
  // 화면에 그려진 땅(격자 메시)이 실제 높이보다 얼마나 위에 있는지 + 경사 → 캐릭터가 땅에 묻혀 보이지 않게 그만큼 올려 그림
  visualLift(x, z) {
    if (this.mode === 'space') return 0;
    const st = this.terrain.lods[0].step;
    const x0 = Math.floor(x / st) * st, z0 = Math.floor(z / st) * st, fx = (x - x0) / st, fz = (z - z0) / st;
    const h00 = terrainHeight(x0, z0), h10 = terrainHeight(x0 + st, z0), h01 = terrainHeight(x0, z0 + st), h11 = terrainHeight(x0 + st, z0 + st);
    const mesh = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    const h = terrainHeight(x, z);
    const slope = Math.hypot(terrainHeight(x + 0.5, z) - terrainHeight(x - 0.5, z), terrainHeight(x, z + 0.5) - terrainHeight(x, z - 0.5));
    return Math.min(3, Math.max(0, Math.max(h00, h10, h01, h11) > h ? mesh - h : 0) + Math.min(0.5, slope * 0.35));
  }
  // 카메라와 캐릭터 사이에 있는 나무는 잠깐 숨김 (시야 확보)
  occludeTrees(a, b) {
    const now = new Set(), dir = b.clone().sub(a), len = dir.length();
    if (len > 0.01) {
      dir.divideScalar(len);
      const cells = new Set();
      for (let d = 0; d <= len; d += 6) { const x = a.x + dir.x * d, z = a.z + dir.z * d; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cells.add((Math.floor(x / 20) + i) * 100003 + (Math.floor(z / 20) + j)); }
      const P = new THREE.Vector3();
      for (const k of cells) {
        const list = this.treeGrid.get(k); if (!list) continue;
        for (const t of list) {
          if (t.dead || !t.ref || t.ref.kind !== 'tree') continue;
          const s = t.ref.set.data[t.ref.idx]?.s || 1;
          for (let d = 0.8; d < len - 0.5; d += 0.7) { // 선을 따라가며 나무(줄기·잎) 안에 들어가는지
            P.copy(a).addScaledVector(dir, d);
            const hy = P.y - t.y; if (hy < 0 || hy > 8 * s) continue;
            const rr = hy < 2.2 * s ? 0.7 * s : 2.8 * s;
            if ((P.x - t.x) ** 2 + (P.z - t.z) ** 2 < rr * rr) { now.add(t); break; }
          }
        }
      }
    }
    for (const t of this._occ || []) if (!now.has(t)) t.ref.set.show(t.ref.idx);
    for (const t of now) t.ref.set.hide(t.ref.idx);
    this._occ = now;
  }
  // 카메라용: 이 점이 루프 트랙 안(두께 속)인지
  loopSolidAt(p) {
    const TH = CFG.loop.thickness + 0.3;
    for (const L of this.loops) {
      const rx = p.x - L.base.x, rz = p.z - L.base.z, along = rx * L.fwd.x + rz * L.fwd.z;
      if (Math.abs(along) > L.R + TH + 1) continue;
      const lat = rx * L.side.x + rz * L.side.z, up = p.y - (L.base.y + L.R), d = Math.hypot(along, up);
      if (d < L.R - 0.4 || d > L.R + TH) continue;
      let a = Math.atan2(along, -up); if (a < 0) a += Math.PI * 2;
      if (Math.abs(lat - L.offset * (a / (Math.PI * 2) - 0.5)) < L.width / 2 + 0.4) return true;
    }
    return false;
  }
  isWater(x, z) { return !this.T.frozen && !this.T.lava && !this.T.skyLand && !this.T.space && terrainHeight(x, z) < 0; }
  lavaAt(x, z) { return this.mode === 'lava' && terrainHeight(x, z) < CFG.lava.level; }

  collide(pos, radius, height, vel, oldY = pos.y) {
    let hit = false;
    const doBox = (p) => {
      if (p.dead || p.kind === 'disc') return;
      if (pos.y >= p.max.y - 0.05 || pos.y + height <= p.min.y) return;
      // 위에서 내려와 발판 윗면에 닿은 경우: 옆으로 밀지 않음 (착지는 groundAt이 처리)
      if (oldY >= p.max.y - 0.3 - Math.abs(p.delta?.y || 0) * 2) return;
      if (pos.y < p.min.y && pos.x > p.min.x - radius * 0.5 && pos.x < p.max.x + radius * 0.5 && pos.z > p.min.z - radius * 0.5 && pos.z < p.max.z + radius * 0.5) {
        pos.y = p.min.y - height; if (vel.y > 0) vel.y = 0; return;
      }
      const cx = Math.max(p.min.x, Math.min(pos.x, p.max.x)), cz = Math.max(p.min.z, Math.min(pos.z, p.max.z));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        let nx, nz, d = Math.sqrt(d2);
        if (d < 1e-4) {
          const pen = [pos.x - p.min.x, p.max.x - pos.x, pos.z - p.min.z, p.max.z - pos.z];
          const i = pen.indexOf(Math.min(...pen));
          nx = [-1, 1, 0, 0][i]; nz = [0, 0, -1, 1][i]; d = -pen[i];
        } else { nx = dx / d; nz = dz / d; }
        pos.x += nx * (radius - d); pos.z += nz * (radius - d);
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
        hit = true; this.lastHitBox = p;
      }
    };
    this.lastHitBox = null; this.lastHitTree = null;
    for (const p of this._near(pos.x, pos.z)) doBox(p);
    for (const p of this.movers) doBox(p);
    const gx = Math.floor(pos.x / 20), gz = Math.floor(pos.z / 20);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.treeGrid.get((gx + i) * 100003 + (gz + j));
      if (!list) continue;
      for (const t of list) {
        if (t.dead || pos.y > t.y + t.h) continue;
        const dx = pos.x - t.x, dz = pos.z - t.z, rr = radius + t.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
          pos.x += nx * (rr - d); pos.z += nz * (rr - d);
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
          hit = true; if (t.ref) this.lastHitTree = t;
        }
      }
    }
    // 바깥 경계: 장벽 (장벽보다 높이 날아서 넘어가면 통과 → 기어 군단이 막음), 장벽이 없으면 맵 끝
    const r = Math.hypot(pos.x, pos.z);
    this.hullHitA = null;
    if (this.mode === 'ship') {
      const Rb = CFG.world.barrierR;
      if (r > Rb - 3 && r < Rb + 3) {
        const a = Math.atan2(pos.z, pos.x), hole = this.hullHoles.some((h) => Math.abs(Math.atan2(Math.sin(a - h.a), Math.cos(a - h.a))) * Rb < 1.25 && pos.y < h.y + 2.4 && pos.y > h.y - 1);
        if (!hole && r < Rb + 1.5) {
          const lim2 = Rb - 3, nx = pos.x / r, nz = pos.z / r;
          pos.x = nx * lim2; pos.z = nz * lim2;
          const vn = vel.x * nx + vel.z * nz; if (vn > 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
          this.hullHitA = a; hit = true;
        } else if (hole) { // 구멍 옆면에 부딪힘 (가운데로)
          const h = this.hullHoles.find((q) => Math.abs(Math.atan2(Math.sin(a - q.a), Math.cos(a - q.a))) * Rb < 1.25);
          const ta = h.a, d = Math.atan2(Math.sin(a - ta), Math.cos(a - ta)) * Rb;
          if (Math.abs(d) > 0.6) { const na = ta + Math.sign(d) * 0.6 / Rb; pos.x = Math.cos(na) * r; pos.z = Math.sin(na) * r; }
        }
      }
      return hit;
    }
    let lim = this.barrierUp ? CFG.world.barrierR - 3 : CFG.world.terrainHalf - 150;
    // 장벽보다 높이 있거나, 이미 장벽 바깥에 있으면 막지 않음 (바깥에서 안으로 돌아오는 건 가능)
    if (this.barrierUp && r > lim - 2 && (pos.y > this.barrierTop(pos.x, pos.z) || r > CFG.world.barrierR + 1)) lim = CFG.world.terrainHalf - 150;
    if (r > lim) {
      const nx = pos.x / r, nz = pos.z / r;
      pos.x = nx * lim; pos.z = nz * lim;
      const vn = vel.x * nx + vel.z * nz;
      if (vn > 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      hit = true;
    }
    return hit;
  }

  treesInRadius(pos, r) {
    const out = [], gx = Math.floor(pos.x / 20), gz = Math.floor(pos.z / 20), n = Math.ceil(r / 20);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const list = this.treeGrid.get((gx + i) * 100003 + (gz + j));
      if (list) for (const t of list) if (!t.dead && t.ref && (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2 < r * r && Math.abs(t.y - pos.y) < t.h + 3) out.push(t);
    }
    return out;
  }
  barrierTop(x, z) { const r = Math.hypot(x, z) || 1, R = CFG.world.barrierR; return terrainHeight(x / r * R, z / r * R) + 20; }

  // ---------- 배치 도우미 ----------
  _free(x, z, r = 2) {
    if (roadDist(x, z) < ROAD.width + 3 + r) return false;
    if (Math.hypot(x, z) < 45 + r) return false;
    const C = 3;
    for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
      for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) if (this.occ.has(i * 100003 + j)) return false;
    return true;
  }
  _occupy(x, z, r = 2) {
    const C = 3;
    for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
      for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) this.occ.add(i * 100003 + j);
  }
  _occupyBox(minx, minz, maxx, maxz) {
    for (let i = Math.floor(minx / 3); i <= Math.floor(maxx / 3); i++) for (let j = Math.floor(minz / 3); j <= Math.floor(maxz / 3); j++) this.occ.add(i * 100003 + j);
  }
  put(geo, color, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, kind = 'lit') {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    (this.lm ? this.bigBatch : this.batch).add(geo, color, _m, kind);
  }
  // 돌려진 좌표계 기준으로 부품 놓기
  putRel(geo, color, ox, oz, oy, yaw, lx, ly, lz, sx, sy, sz, ry = 0, rx = 0, rz = 0, kind = 'lit') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    this.put(geo, color, ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c, sx, sy, sz, yaw + ry, rx, rz, kind);
  }
  _solid(cx, cy, cz, sx, sy, sz, extra = {}) {
    const p = { kind: 'box', min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: new THREE.Vector3(cx + sx / 2, cy + sy / 2 + 0.05, cz + sz / 2), ...extra };
    this._occupyBox(p.min.x - 1, p.min.z - 1, p.max.x + 1, p.max.z + 1);
    return this._register(p);
  }
  _addPlatform(cx, cy, cz, sx, sy, sz, color = 0xb07a48, topColor = null) {
    this.put(BASE.box, color, cx, cy, cz, sx, sy, sz);
    this.put(BASE.box, topColor ?? this.T.grassA, cx, cy + sy / 2 - 0.2, cz, sx + 0.25, 0.5, sz + 0.25);
    return this._solid(cx, cy, cz, sx, sy, sz);
  }
  _tree(x, z, r, h, ref = null, y = null) {
    const t = { x, z, y: y ?? terrainHeight(x, z), r, h, ref, dead: false };
    if (ref) { ref.collider = t; this.breakables.push(ref); }
    const k = Math.floor(x / 20) * 100003 + Math.floor(z / 20);
    if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
    this.treeGrid.get(k).push(t);
  }

  // =================================================================
  _build() {
    this.terrain = new TerrainStreamer(this, this.q.mobile);
    this._makeTreeSets();
    const md = this.mode, walled = md === 'forest' || md === 'ice';
    for (const P of PONDS) this._occupy(P.x, P.z, P.r + 4);
    if (md === 'sky') for (const H of SKY_HOLES) this._occupy(H.x, H.z, H.r + 3);
    this._start();
    this._robotBase();
    this._smallFactory();
    this._lab();
    if (walled) this._ponds();
    if (md !== 'lava' && md !== 'ship') this._villages(); // 용암 섬·우주선에는 사람이 살던 흔적이 없음
    this._discoveries();
    this._landmarks();
    this._mainRoad();
    this._ringRoad();
    this._zoneMeadow();
    this._zoneRust();
    this._zoneSwamp();
    this._zoneMesa();
    this._zoneLake();
    this._breakableWalls();
    if (walled) { this._barrier(); this._outside(); }
    else { // 벽 없는 대지: 용암 바다 / 하늘 끝 / 우주선 외벽
      this.barrierGroup = new THREE.Group(); this.root.add(this.barrierGroup); this.barrierUp = false;
      if (md === 'lava') this._lavaSea(); else if (md === 'sky') this._skyEdge(); else this._hull();
    }
    this._fieldFill();
    if (md === 'sky') this._holeRims();
    this._exitDevice();
    this._tidySpots();
    for (const s of this.treeSets) s.attach(this.root, !this.q.mobile && s.shadow !== false);
    this._farForest();
    this.bigBatch.buildAll(this.root, { lit: this.matLit, glow: this.matGlow }, !this.q.mobile);
    this._minimap();
  }

  // ---------- 지형 색 ----------
  colorAt(x, z, h, slope, out) {
    const T = this.T;
    zoneWeights(x, z);
    const w = [ZW[0], ZW[1], ZW[2], ZW[3]];
    const n = vnoise(x * 0.05, z * 0.05), n2 = vnoise(x * 0.012 + 9, z * 0.012);
    out.set(T.grassA).lerp(_c.set(T.grassB), n * 0.55 + n2 * 0.35);
    if (n2 > 0.72) out.lerp(_c.set(T.grassDry), (n2 - 0.72) * 2.5);
    // 녹슨 공장: 금속 바닥판
    if (w[0] > 0.05) {
      const gx = ((x % 8) + 8) % 8, gz = ((z % 8) + 8) % 8;
      const plate = _c.set(T.metal).lerp(new THREE.Color(T.rust), vnoise(x * 0.07, z * 0.07) * 0.8);
      if (gx < 0.35 || gz < 0.35) plate.set(T.metalLine);
      out.lerp(plate, smooth(0.05, 0.5, w[0]));
    }
    if (w[1] > 0.05) out.lerp(_c.set(T.swampA).lerp(new THREE.Color(T.swampB), n), smooth(0.05, 0.5, w[1]));
    if (w[2] > 0.05) {
      const band = (Math.sin(h * 1.6) * 0.5 + 0.5);
      const rockC = _c.set(T.cliffA).lerp(new THREE.Color(T.cliffB), band * 0.7 + n * 0.3);
      const k = slope > 0.5 ? 1 : 0.35 + n * 0.2;
      out.lerp(rockC, smooth(0.05, 0.5, w[2]) * k);
    }
    if (h < 1.3) out.lerp(_c.set(T.sand), smooth(1.3, 0.4, h) * (1 - smooth(0.2, 0.6, w[1])));
    if (h < -0.2) out.lerp(_c.set(T.underwater), smooth(-0.2, -2, h));
    if (h < -3) out.multiplyScalar(1 - smooth(-3, -12, h) * 0.45);
    if (slope > 0.7 && w[2] < 0.3) out.lerp(_c.set(T.rock), smooth(0.7, 1.4, slope));
    const rd = roadDist(x, z);
    if (rd < ROAD.width + 2.5) {
      const rc = _c.set(T.road);
      if (rd < 0.45) rc.set(T.roadLine);
      out.lerp(rc, smooth(ROAD.width + 2.5, ROAD.width - 0.5, rd) * (0.85 + n * 0.15));
      if (rd > ROAD.width - 1.2 && rd < ROAD.width - 0.6) out.lerp(_c.set(T.roadLine), 0.6);
    }
    for (const k in SITES) {
      const F = SITES[k], d = Math.hypot(x - F.x, z - F.z);
      if (d < F.r * 0.75) { const odd = (Math.floor(x / 4) + Math.floor(z / 4)) & 1; out.lerp(_c.set(k === 'lab' ? (odd ? 0x8a8fa0 : 0x7a7f90) : (odd ? 0x6d737c : 0x5d636b)), 1 - smooth(F.r * 0.6, F.r * 0.75, d)); }
    }
    const ds = Math.hypot(x, z);
    if (ds < 30) { const tile = (Math.floor(x / 3) + Math.floor(z / 3)) & 1; out.lerp(_c.set(tile ? 0xd8c8a8 : 0xc4b28e), 1 - smooth(24, 30, ds)); }
    if (h > 45 && slope > 0.35) out.lerp(_c.set(T.rock), smooth(45, 90, h) * smooth(0.35, 0.8, slope) * 0.7);
    if (h > 105) out.lerp(_c.set(T.snow), smooth(105, 135, h) * 0.9);
    if (ds > 1700) { out.lerp(_c.set(T.mountain), smooth(1720, 1850, ds) * 0.7 * (1 - exitMask(x, z))); if (h > 160) out.lerp(_c.set(T.snow), smooth(160, 220, h)); }
    const sn = snowAmount(x, z);
    if (sn > 0) out.lerp(_c.set(0xf4f8ff), sn).lerp(_c.set(0xcfe3f5), sn * vnoise(x * 0.08, z * 0.08) * 0.4);
    if (T.snowyTrees && slope < 0.6) out.lerp(_c.set(0xffffff), 0.25);
    if (this.mode === 'lava') {
      if (h < 1.4) out.lerp(_c.set(0x6a2a16), smooth(1.4, 0.1, h) * 0.6);   // 용암 가까운 땅은 붉게 달아오름
      const ash = vnoise(x * 0.03 + 5, z * 0.03); if (ash > 0.7) out.lerp(_c.set(0x8a8480), (ash - 0.7) * 2); // 화산재
    } else if (this.mode === 'sky') {
      if (h < -20) return out.set(0xffffff).lerp(_c.set(0xd4e2f4), vnoise(x * 0.03, z * 0.03) * 0.7); // 구멍 아래 구름
      const gx = ((x % 16) + 16) % 16, gz = ((z % 16) + 16) % 16;
      if (gx < 1.5 || gz < 1.5) out.multiplyScalar(0.8);                // 철판 이음새
    }
    return out;
  }

  // ---------- 나무 종류 (가까이 있는 것만 그림, 잎은 바람에 흔들림) ----------
  _makeTreeSets() {
    const T = this.T, lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const leafMat = swayMaterial(lam(0xffffff, { flatShading: true }));
    const mob = this.q.mobile, NR = mob ? 360 : 480, SR = mob ? 220 : 300;
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const set = (parts, cap, nearR, extra = {}) => Object.assign(new TreeSet(parts.filter(Boolean), cap, nearR), extra);
    const snowMat = T.snowyTrees ? swayMaterial(lam(0xffffff, { flatShading: true })) : null;
    const cap = (x, y, z, sx, sy, sz = sx, geo = ico) => (T.snowyTrees ? { geo, mat: snowMat, local: L(x, y, z, sx, sy, sz) } : null); // 소복이 쌓인 눈
    this.trees = {
      round: set([ // 둥근 참나무
        { geo: new THREE.CylinderGeometry(0.3, 0.5, 1, 7), mat: lam(0x8b5a2b), local: L(0, 1.6, 0, 1, 3.2, 1) },
        { geo: ico, mat: leafMat, local: L(0, 4.3, 0, 2.6, 2.3, 2.6), colors: T.leaf },
        { geo: ico, mat: leafMat, local: L(0.9, 3.6, 0.4, 1.8, 1.6, 1.8), colors: T.leaf },
        { geo: ico, mat: leafMat, local: L(-0.8, 3.8, -0.5, 1.7, 1.5, 1.7), colors: T.leaf },
        cap(0, 6.05, 0, 2.3, 0.8), cap(0.9, 5.0, 0.4, 1.5, 0.55),
      ], 1800, NR, { canopy: 2.8, canopyY: 4.2, leaf: T.leaf[0] }),
      pine: set([ // 소나무
        { geo: new THREE.CylinderGeometry(0.25, 0.4, 1, 6), mat: lam(0x6b4423), local: L(0, 1, 0, 1, 2, 1) },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: leafMat, local: L(0, 2.8, 0, 2.4, 3, 2.4), colors: T.pine },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: leafMat, local: L(0, 4.4, 0, 1.8, 2.6, 1.8), colors: T.pine },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: T.snowyTrees ? swayMaterial(lam(0xffffff)) : leafMat, local: L(0, 5.8, 0, 1.1, 2, 1.1), colors: T.snowyTrees ? null : T.pine },
        cap(0, 3.65, 0, 1.95, 0.9, 1.95, new THREE.ConeGeometry(1, 1, 8)), cap(0, 5.1, 0, 1.45, 0.8, 1.45, new THREE.ConeGeometry(1, 1, 8)),
      ], 1800, NR, { canopy: 2.2, canopyY: 3.6, leaf: T.pine[0], cone: true }),
      birch: set([ // 하얀 자작나무
        { geo: new THREE.CylinderGeometry(0.18, 0.28, 1, 6), mat: lam(0xeeeae0), local: L(0, 2.6, 0, 1, 5.2, 1) },
        { geo: new THREE.BoxGeometry(1, 1, 1), mat: lam(0x333333), local: L(0, 1.5, 0.2, 0.06, 0.18, 0.12) },
        { geo: ico, mat: leafMat, local: L(0, 5.6, 0, 1.6, 2.4, 1.6), colors: T.snowyTrees ? T.leaf : [0xa8d84a, 0xc8e05a, 0x8fcf4f] },
        cap(0, 7.4, 0, 1.3, 0.7),
      ], 900, NR, { canopy: 1.8, canopyY: 5.4, leaf: 0xa8d84a }),
      poplar: set([ // 키 큰 포플러
        { geo: new THREE.CylinderGeometry(0.22, 0.35, 1, 6), mat: lam(0x7a5530), local: L(0, 1.4, 0, 1, 2.8, 1) },
        { geo: ico, mat: leafMat, local: L(0, 5.2, 0, 1.4, 4.2, 1.4), colors: T.snowyTrees ? T.leaf : [0x3f9a3a, 0x2f8a3f, 0x4fae46] },
        cap(0, 8.7, 0, 1.0, 1.0),
      ], 900, NR, { canopy: 1.5, canopyY: 5.2, leaf: 0x3f9a3a, tall: true }),
      cherry: set([ // 분홍 꽃나무
        { geo: new THREE.CylinderGeometry(0.28, 0.45, 1, 7), mat: lam(0x6e4a3a), local: L(0, 1.4, 0, 1, 2.8, 1, 0, 0, 0.12) },
        { geo: ico, mat: leafMat, local: L(0.2, 3.9, 0, 2.6, 1.9, 2.6), colors: T.snowyTrees ? T.leaf : [0xffb7d5, 0xff9ec4, 0xffd0e4] },
        { geo: ico, mat: leafMat, local: L(-0.9, 3.4, 0.6, 1.6, 1.3, 1.6), colors: T.snowyTrees ? T.leaf : [0xffb7d5, 0xffc8de] },
        cap(0.2, 5.35, 0, 2.3, 0.75),
      ], 600, NR, { canopy: 2.6, canopyY: 3.8, leaf: 0xffb7d5 }),
      palm: set([ // 호숫가 야자수
        { geo: new THREE.CylinderGeometry(0.2, 0.32, 1, 6), mat: lam(0xa07850), local: L(0.4, 3, 0, 1, 6, 1, 0, 0, -0.13) },
        { geo: new THREE.ConeGeometry(1, 1, 6), mat: leafMat, local: L(0.8, 6.1, 0, 3.2, 0.7, 3.2), colors: T.snowyTrees ? T.leaf : [0x3fae4a, 0x2f9a40] },
      ], 500, NR, { canopy: 2.6, canopyY: 6, leaf: 0x3fae4a }),
      mush: set([
        { geo: new THREE.CylinderGeometry(0.35, 0.55, 1, 8), mat: lam(0xf0e6d8), local: L(0, 1.6, 0, 1, 3.2, 1) },
        { geo: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: lam(0xffffff, { emissive: 0x220a33 }), local: L(0, 3, 0, 2.4, 1.4, 2.4), colors: T.caps },
        { geo: new THREE.SphereGeometry(0.2, 6, 4), mat: new THREE.MeshBasicMaterial({ color: 0xfff6b0, toneMapped: false }), local: L(0.8, 3.9, 0.6, 1, 1, 1) },
      ], 900, NR, { canopy: 2.4, canopyY: 3.2, leaf: T.caps[0] }),
      metal: set([
        { geo: new THREE.CylinderGeometry(0.25, 0.45, 1, 6), mat: lam(0x6d737c), local: L(0, 1.8, 0, 1, 3.6, 1) },
        { geo: new THREE.ConeGeometry(1, 1, 6), mat: lam(0x454b55, { flatShading: true }), local: L(0, 4.3, 0, 2, 3.2, 2) },
        { geo: new THREE.BoxGeometry(1, 1, 1), mat: lam(0x9a5530), local: L(0, 2.2, 0, 1.2, 0.25, 1.2, 0, 0.4, 0) },
        { geo: new THREE.SphereGeometry(0.22, 6, 4), mat: new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), local: L(0, 6.1, 0, 1, 1, 1) },
      ], 900, NR, { canopy: 2, canopyY: 4.3, leaf: 0x454b55, cone: true }),
      bush: set([
        { geo: ico, mat: leafMat, local: L(0, 0.5, 0, 1.3, 0.9, 1.3), colors: T.leaf },
        { geo: ico, mat: leafMat, local: L(0.8, 0.4, 0.3, 0.9, 0.7, 0.9), colors: T.leaf },
        cap(0, 1.0, 0, 1.05, 0.38),
      ], 2500, SR, { shadow: false }),
      rock: set([
        { geo: new THREE.DodecahedronGeometry(1, 0), mat: lam(0xffffff, { flatShading: true }), local: L(0, 0.3, 0, 1, 0.7, 1.2), colors: [T.rock, 0x9c968a, 0x7d7a72] },
        cap(0, 0.8, 0, 0.85, 0.28, 1.0),
      ], 1800, NR),
      flower: set([
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 1, 3), mat: lam(0x3c8f2f), local: L(0, 0.3, 0, 1, 0.6, 1) },
        { geo: new THREE.IcosahedronGeometry(0.16, 0), mat: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), local: L(0, 0.62, 0, 1, 0.6, 1), colors: [0xffffff, 0xffe14d, 0xff7ab6, 0x9f7bff, 0xff6040] },
      ], 4000, SR, { shadow: false }),
    };
    if (this.mode === 'lava') Object.assign(this.trees, this._lavaSets(set, lam, NR, SR));
    if (this.mode === 'sky' || this.mode === 'ship') Object.assign(this.trees, this._skySets(set, lam, NR, SR));
    this.treeSets = Object.values(this.trees);
    this.treeTypes = ['round', 'pine', 'birch', 'poplar', 'cherry', 'palm', 'mush', 'metal'];
  }
  // 용암 섬: 나무 대신 여러 가지 화산 돌 (같은 자리에 놓이고, 부술 수도 있음)
  _lavaSets(set, lam, NR, SR) {
    const glowM = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const hex = new THREE.CylinderGeometry(1, 1, 1, 6), dode = new THREE.DodecahedronGeometry(1, 0), oct = new THREE.OctahedronGeometry(1, 0), cone5 = new THREE.ConeGeometry(1, 1, 5);
    const basalt = lam(0xffffff, { flatShading: true }), B = [0x3a3432, 0x2c2826, 0x4a403c];
    return {
      round: set([ // 현무암 기둥 무리
        { geo: hex, mat: basalt, local: L(0, 2.2, 0, 1.0, 4.4, 1.0), colors: B },
        { geo: hex, mat: basalt, local: L(1.4, 1.5, 0.3, 0.8, 3.0, 0.8), colors: B },
        { geo: hex, mat: basalt, local: L(-0.9, 1.1, 1.0, 0.75, 2.2, 0.75), colors: B },
        { geo: hex, mat: basalt, local: L(-0.6, 2.8, -1.1, 0.7, 5.6, 0.7), colors: B },
      ], 1800, NR, { canopy: 1.8, canopyY: 2.2, leaf: 0x3a3432, tall: true }),
      pine: set([ // 흑요석 가시 바위
        { geo: cone5, mat: lam(0x1c1620, { flatShading: true }), local: L(0, 2.5, 0, 1.2, 5, 1.2) },
        { geo: cone5, mat: lam(0x2a2030, { flatShading: true }), local: L(0.9, 1.4, 0.4, 0.7, 2.8, 0.7, 0, 0, -0.35) },
        { geo: cone5, mat: lam(0x2a2030, { flatShading: true }), local: L(-0.8, 1.2, -0.3, 0.6, 2.4, 0.6, 0.3, 0, 0.3) },
      ], 1800, NR, { canopy: 1.3, canopyY: 2.4, leaf: 0x1c1620, cone: true }),
      birch: set([ // 용암 기둥 (갈라진 틈으로 빛)
        { geo: hex, mat: basalt, local: L(0, 2.6, 0, 1.1, 5.2, 1.1), colors: B },
        { geo: hex, mat: glowM(0xff6a20), local: L(0, 2.6, 0, 1.13, 0.25, 1.13) },
        { geo: hex, mat: glowM(0xffa030), local: L(0, 4.1, 0, 1.13, 0.18, 1.13) },
        { geo: dode, mat: glowM(0xff5010), local: L(0, 5.3, 0, 0.7, 0.4, 0.7) },
      ], 900, NR, { canopy: 1.2, canopyY: 3, leaf: 0x5a2a1a, tall: true }),
      poplar: set([ // 쌓인 돌탑
        { geo: dode, mat: basalt, local: L(0, 0.9, 0, 1.4, 1.0, 1.4), colors: B },
        { geo: dode, mat: basalt, local: L(0.1, 2.4, 0, 1.0, 0.8, 1.0), colors: B },
        { geo: dode, mat: basalt, local: L(-0.1, 3.6, 0.1, 0.7, 0.6, 0.7), colors: B },
      ], 900, NR, { canopy: 1.1, canopyY: 2, leaf: 0x3a3432, tall: true }),
      cherry: set([ // 불꽃 수정 바위
        { geo: dode, mat: basalt, local: L(0, 0.8, 0, 1.8, 1.2, 1.6), colors: B },
        { geo: oct, mat: glowM(0xff4a1a), local: L(0.5, 2.3, 0.2, 0.45, 1.3, 0.45, 0, 0, -0.3) },
        { geo: oct, mat: glowM(0xffa030), local: L(-0.5, 2.0, -0.3, 0.35, 1.0, 0.35, 0.3, 0, 0.3) },
        { geo: oct, mat: glowM(0xff6a20), local: L(0, 2.6, -0.5, 0.3, 1.1, 0.3, -0.3, 0, 0) },
      ], 600, NR, { canopy: 1.5, canopyY: 1.3, leaf: 0x7a2a1a }),
      palm: set([ // 화산재 둔덕
        { geo: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat: lam(0x6a6460, { flatShading: true }), local: L(0, 0, 0, 2.6, 1.6, 2.6) },
        { geo: dode, mat: basalt, local: L(1.2, 0.6, 0.5, 0.7, 0.6, 0.7), colors: B },
      ], 500, NR, { canopy: 2.2, canopyY: 0.8, leaf: 0x6a6460 }),
      mush: set([ // 김 나는 분출구
        { geo: new THREE.CylinderGeometry(0.6, 1.6, 1, 8), mat: basalt, local: L(0, 1, 0, 1, 2, 1), colors: B },
        { geo: new THREE.CylinderGeometry(0.55, 0.55, 1, 8), mat: glowM(0xff7a20), local: L(0, 2.02, 0, 1, 0.06, 1) },
      ], 900, NR, { canopy: 1.4, canopyY: 1, leaf: 0x3a3432 }),
      bush: set([ // 작은 돌무더기
        { geo: dode, mat: basalt, local: L(0, 0.35, 0, 0.8, 0.55, 0.8), colors: B },
        { geo: dode, mat: basalt, local: L(0.7, 0.25, 0.3, 0.5, 0.4, 0.5), colors: B },
      ], 2500, SR, { shadow: false }),
      rock: set([
        { geo: dode, mat: basalt, local: L(0, 0.3, 0, 1, 0.7, 1.2), colors: [0x3a3230, 0x5a4038, 0x7a3a22] },
      ], 1800, NR),
      flower: set([ // 불씨 자갈
        { geo: new THREE.IcosahedronGeometry(0.16, 0), mat: glowM(0xffffff), local: L(0, 0.1, 0, 1, 0.7, 1), colors: [0xff5a10, 0xffa030, 0xff3a10] },
      ], 4000, SR, { shadow: false }),
    };
  }
  // 하늘 도시: 기계 나무·안테나·가로등 같은 철판 땅의 장치들
  _skySets(set, lam, NR, SR) {
    const glowM = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const metal = lam(0xffffff), M = [0x8a94a3, 0x6d7785, 0xa0aab8];
    const holo = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0a3040, flatShading: true });
    const ico = new THREE.IcosahedronGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    const dome = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    return {
      round: set([ // 기계 나무 (금속 줄기 + 빛나는 잎)
        { geo: cyl, mat: metal, local: L(0, 1.6, 0, 0.35, 3.2, 0.35), colors: M },
        { geo: cyl, mat: glowM(0x4fd8ff), local: L(0, 2.6, 0, 0.4, 0.15, 0.4) },
        { geo: ico, mat: holo, local: L(0, 4.3, 0, 2.4, 2.1, 2.4), colors: [0x4fd8ff, 0x7fe8ff, 0x3ac0f0] },
      ], 1800, NR, { canopy: 2.4, canopyY: 4.3, leaf: 0x4fd8ff }),
      pine: set([ // 안테나 탑
        { geo: box, mat: metal, local: L(0, 0.5, 0, 1.6, 1, 1.6), colors: M },
        { geo: new THREE.ConeGeometry(1, 1, 4), mat: metal, local: L(0, 4, 0, 0.6, 7, 0.6), colors: M },
        { geo: new THREE.SphereGeometry(0.3, 6, 4), mat: glowM(0xff3020), local: L(0, 7.6, 0, 1, 1, 1) },
        { geo: new THREE.TorusGeometry(0.8, 0.08, 4, 12), mat: metal, local: L(0, 4.5, 0, 1, 1, 1, Math.PI / 2, 0, 0), colors: M },
      ], 1800, NR, { canopy: 0.8, canopyY: 3.5, leaf: 0x6d7785, cone: true }),
      birch: set([ // 가로등
        { geo: cyl, mat: metal, local: L(0, 2.5, 0, 0.15, 5, 0.15), colors: M },
        { geo: box, mat: metal, local: L(0.5, 5, 0, 1.2, 0.15, 0.3), colors: M },
        { geo: box, mat: glowM(0xfff0b0), local: L(0.9, 4.85, 0, 0.5, 0.12, 0.35) },
      ], 900, NR, { canopy: 0.5, canopyY: 4.5, leaf: 0x8a94a3, tall: true }),
      poplar: set([ // 배기 굴뚝
        { geo: cyl, mat: metal, local: L(0, 3, 0, 0.8, 6, 0.8), colors: M },
        { geo: cyl, mat: lam(0xffc233), local: L(0, 4.5, 0, 0.85, 0.4, 0.85) },
        { geo: cyl, mat: lam(0x3a4048), local: L(0, 6.1, 0, 0.95, 0.3, 0.95) },
      ], 900, NR, { canopy: 0.9, canopyY: 3, leaf: 0x8a94a3, tall: true }),
      cherry: set([ // 분홍 빛 나무
        { geo: cyl, mat: metal, local: L(0, 1.4, 0, 0.3, 2.8, 0.3), colors: M },
        { geo: ico, mat: holo, local: L(0, 3.8, 0, 2.3, 1.7, 2.3), colors: [0xff8ad0, 0xffb0e0, 0xff6ab0] },
      ], 600, NR, { canopy: 2.3, canopyY: 3.8, leaf: 0xff8ad0 }),
      palm: set([ // 접시 안테나
        { geo: cyl, mat: metal, local: L(0, 1.5, 0, 0.25, 3, 0.25), colors: M },
        { geo: dome, mat: lam(0xdde4ee, { side: THREE.DoubleSide }), local: L(0, 3.4, 0, 1.8, 0.6, 1.8, 0.6, 0, 0) },
      ], 500, NR, { canopy: 1.8, canopyY: 3.4, leaf: 0xdde4ee }),
      mush: set([ // 환풍기 돔
        { geo: cyl, mat: metal, local: L(0, 0.6, 0, 1.6, 1.2, 1.6), colors: M },
        { geo: dome, mat: holo, local: L(0, 1.2, 0, 1.5, 1.0, 1.5), colors: [0x4fd8ff, 0xffd23a, 0xff6ab0] },
      ], 900, NR, { canopy: 1.5, canopyY: 1.2, leaf: 0x4fd8ff }),
      bush: set([ // 상자 더미
        { geo: box, mat: metal, local: L(0, 0.45, 0, 0.9, 0.9, 0.9), colors: [0x8a94a3, 0xffc233, 0x5d8ad0] },
        { geo: box, mat: metal, local: L(0.8, 0.3, 0.2, 0.6, 0.6, 0.6), colors: [0x6d7785, 0xd0603a] },
      ], 2500, SR, { shadow: false }),
      rock: set([ // 금속 블록
        { geo: box, mat: lam(0xffffff, { flatShading: true }), local: L(0, 0.35, 0, 1.4, 0.7, 1.2), colors: M },
      ], 1800, NR),
      flower: set([ // 바닥 불빛
        { geo: new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), mat: glowM(0xffffff), local: L(0, 0.05, 0, 1, 1, 1), colors: [0x4fd8ff, 0xffd23a, 0x7dff9a] },
      ], 4000, SR, { shadow: false }),
    };
  }
  // 아무 데나 어울리는 나무 고르기 (숲 구역)
  _forestType() { const r = this.rand(); return r < 0.5 ? 'round' : r < 0.68 ? 'birch' : r < 0.84 ? 'poplar' : r < 0.93 ? 'pine' : 'cherry'; }
  _plantTree(type, x, z, s = 1) {
    const y = terrainHeight(x, z);
    if (y < 0.2 && !this.T.frozen) return false;
    const set = this.trees[type];
    const idx = set.add(x, y - 0.1, z, s, this.rand() * 6.28, this.rand());
    const isTree = this.treeTypes.includes(type);
    if (isTree) this._tree(x, z, (type === 'mush' ? 0.55 : 0.45) * s, 7 * s, { set, idx, type, kind: 'tree' });
    if (type === 'rock' && s > 1.0) this._tree(x, z, 0.9 * s, 0.9 * s, { set, idx, type, kind: 'rock' });
    this._occupy(x, z, type === 'flower' ? 0.3 : 1.5 * s);
    return true;
  }
  // 멀리 보이는 숲: 나무 하나를 아주 단순한 덩어리 하나로
  _farForest() {
    const list = [];
    for (const type of this.treeTypes) {
      const set = this.trees[type];
      set.data.forEach((d, i) => { if (i % 2 === 0 || type === 'poplar') list.push({ set, d, i }); });
    }
    const geoBlob = new THREE.IcosahedronGeometry(1, 0), geoCone = new THREE.ConeGeometry(1, 1, 5);
    const make = (geo, items) => {
      const mesh = new THREE.InstancedMesh(geo, farMaterial(0xffffff), Math.max(1, items.length));
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, items.length) * 3), 3);
      items.forEach((it, n) => {
        const { set, d } = it, sc = set.canopy * d.s * 1.15;
        _m.compose(_p.set(d.x, d.y + set.canopyY * d.s, d.z), _q.identity(), _s.set(sc, set.cone ? sc * 2.2 : set.tall ? sc * 2.6 : sc * 0.95, sc));
        mesh.setMatrixAt(n, _m);
        mesh.setColorAt(n, _c.set(set.leaf).multiplyScalar(0.85 + d.rnd * 0.25));
        it.set.data[it.i].far = { mesh, n };
      });
      mesh.count = items.length; mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    };
    make(geoBlob, list.filter((it) => !it.set.cone));
    make(geoCone, list.filter((it) => it.set.cone));
  }
  // 플레이어 주변 다시 그리기 (나무·소품·지형)
  stream(focus, dt, force = false) {
    if (this.mode === 'space') return;
    SWAY.player.value.copy(focus);
    FAR.center.value.set(focus.x, focus.z); FAR.nearR.value = this.trees.round.nearR;
    this.terrain.update(focus.x, focus.z, this.q.mobile ? 5 : 7, force);
    this._regrow(dt, focus);
    this.streamT -= dt;
    if (force || this.lastRebuild.distanceTo(_v2.set(focus.x, focus.z)) > 40 || this.treesDirty) {
      this.lastRebuild.set(focus.x, focus.z); this.treesDirty = false;
      for (const s of this.treeSets) s.rebuild(focus.x, focus.z);
    }
    if (force || this.streamT <= 0) {
      this.streamT = 0.2;
      const R = this.q.mobile ? 420 : 560;
      this.batch.stream(this.root, { lit: this.matLit, glow: this.matGlow }, !this.q.mobile, focus.x, focus.z, R, R + 160, force ? 999 : 2);
      const HR = this.q.mobile ? 380 : 520;
      for (const w of this.houses) w.mesh.visible = !w.dead && Math.abs(w.mesh.position.x - focus.x) < HR && Math.abs(w.mesh.position.z - focus.z) < HR;
      for (const c of this.chests) c.group.visible = Math.abs(c.pos.x - focus.x) < 300 && Math.abs(c.pos.z - focus.z) < 300;
    }
  }
  // 나무·바위 부수기 (파워형이나 슈퍼일 때)
  breakTree(t) {
    if (t.dead) return false;
    t.dead = true;
    const ref = t.ref, d = ref.set.data[ref.idx];
    d.dead = true; ref.set.hide(ref.idx);
    if (d.far) { _m.makeScale(0, 0, 0); d.far.mesh.setMatrixAt(d.far.n, _m); d.far.mesh.instanceMatrix.needsUpdate = true; }
    ref.respawn = 150; // 150초 뒤 다시 자람
    return true;
  }
  _regrow(dt, focus) {
    for (const w of this.houses) {
      if (!w.respawn) continue;
      w.respawn -= dt;
      if (w.respawn <= 0 && Math.hypot(w.mesh.position.x - focus.x, w.mesh.position.z - focus.z) > 80) { w.respawn = 0; w.dead = false; }
    }
    for (const ref of this.breakables) {
      if (!ref.respawn) continue;
      ref.respawn -= dt;
      const t = ref.collider;
      if (ref.respawn <= 0 && Math.hypot(t.x - focus.x, t.z - focus.z) > 80) {
        ref.respawn = 0; t.dead = false;
        const d = ref.set.data[ref.idx]; d.dead = false;
        if (d.far) { const set = ref.set, sc = set.canopy * d.s * 1.15; _m.compose(_p.set(d.x, d.y + set.canopyY * d.s, d.z), _q.identity(), _s.set(sc, set.cone ? sc * 2.2 : set.tall ? sc * 2.6 : sc * 0.95, sc)); d.far.mesh.setMatrixAt(d.far.n, _m); d.far.mesh.instanceMatrix.needsUpdate = true; }
        this.treesDirty = true;
      }
    }
  }

  // ---------- 코스 부품 ----------
  _addRamp(center, dir, w, l, h, color = 0xff8c2a) {
    const yaw = Math.atan2(dir.x, dir.z);
    const base = terrainHeight(center.x, center.z);
    const r = { center: center.clone(), yaw, w, l, h, base, cos: Math.cos(yaw), sin: Math.sin(yaw) };
    this.ramps.push(r);
    const shape = new THREE.Shape();
    shape.moveTo(-l / 2, -1); shape.lineTo(l / 2, -1); shape.lineTo(l / 2, h); shape.lineTo(-l / 2, 0); shape.lineTo(-l / 2, -1);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2);
    _m.compose(_p.set(center.x, base, center.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1));
    this.batch.add(geo, color, _m);
    for (let i = 0; i < 3; i++) {
      const lz = -l / 2 + l * (0.25 + i * 0.25);
      this.put(BASE.box, 0xffffff, center.x + Math.sin(yaw) * lz, base + h * (lz / l + 0.5) + 0.06, center.z + Math.cos(yaw) * lz, w + 0.05, 0.08, 1, yaw, -Math.atan2(h, l));
    }
    this._occupy(center.x, center.z, l / 2 + 2);
    return r;
  }

  _addLoop(base, fwd, R = CFG.loop.radius, offset = CFG.loop.width + 1.5) {
    fwd = fwd.clone().normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    base = base.clone().addScaledVector(side, offset * 0.5);   // 입구가 길 한가운데 오도록
    base.y = terrainHeight(base.x, base.z);
    const loop = { base, fwd, side, R, offset, length: 2 * Math.PI * R, width: CFG.loop.width };
    // 입구 바로 앞 가속 발판 (밟으면 입구 방향으로!)
    this._addBoostPad(base.clone().addScaledVector(side, -offset * 0.5).addScaledVector(fwd, -14), fwd);
    loop.pathAt = (t, out = new THREE.Vector3()) => {
      const a = t * Math.PI * 2;
      return out.copy(base).addScaledVector(fwd, R * Math.sin(a)).addScaledVector(side, offset * (t - 0.5)).setY(base.y + R * (1 - Math.cos(a)));
    };
    loop.centerAt = (t, out = new THREE.Vector3()) => out.copy(base).addScaledVector(side, offset * (t - 0.5)).setY(base.y + R);
    loop.tangentAt = (t, out = new THREE.Vector3()) => {
      const a = t * Math.PI * 2;
      return out.copy(fwd).multiplyScalar(Math.cos(a) * R * 2 * Math.PI).addScaledVector(side, offset).setY(Math.sin(a) * R * 2 * Math.PI).normalize();
    };
    loop.entry = loop.pathAt(0); loop.exit = loop.pathAt(1);
    // 생김새: 동그랗게 말린 땅 조각 (안쪽 면 = 잔디, 옆면·바깥 = 흙, 바깥 꼭대기에도 잔디)
    const N = 180, W = loop.width, TH = CFG.loop.thickness;
    const pos = [], col = [], idx = [];
    const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), C1 = new THREE.Color(), C2 = new THREE.Color();
    const gA = new THREE.Color(this.T.grassA), gB = new THREE.Color(this.T.grassB), dirt = new THREE.Color(0x8a5a32), dirt2 = new THREE.Color(0x6b4426), rock = new THREE.Color(0x7d6a55);
    const ring = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      loop.pathAt(t, p); loop.centerAt(t, c);
      n.copy(c).sub(p).normalize();
      ring.push({ il: p.clone().addScaledVector(side, -W / 2), ir: p.clone().addScaledVector(side, W / 2), ol: p.clone().addScaledVector(side, -W / 2).addScaledVector(n, -TH), or: p.clone().addScaledVector(side, W / 2).addScaledVector(n, -TH), ny: n.y, t });
    }
    const strip = (ka, kb, colorFn) => {
      const start = pos.length / 3;
      ring.forEach((r, i) => {
        const A = r[ka], B = r[kb];
        pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
        colorFn(r, i, 0, C1); colorFn(r, i, 1, C2);
        col.push(C1.r, C1.g, C1.b, C2.r, C2.g, C2.b);
        if (i < N) { const k = start + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
    };
    const noise = (i, s) => vnoise(i * 0.35 + s * 3.1, base.x * 0.01 + s);
    strip('il', 'ir', (r, i, s, out) => out.copy(gA).lerp(gB, noise(i, s) * 0.8));                                   // 안쪽 (달리는 면)
    strip('or', 'ol', (r, i, s, out) => (-r.ny > 0.45 ? out.copy(gA).lerp(gB, noise(i, s + 5)) : out.copy(dirt).lerp(rock, noise(i, s + 2)))); // 바깥 (꼭대기는 잔디)
    strip('ol', 'il', (r, i, s, out) => out.copy(s ? gA : dirt).lerp(dirt2, s ? 0 : noise(i, 7) * 0.6));             // 왼쪽 옆면
    strip('ir', 'or', (r, i, s, out) => out.copy(s ? dirt : gA).lerp(dirt2, s ? noise(i, 9) * 0.6 : 0));             // 오른쪽 옆면
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2e2417 })); // 그늘진 아랫면도 너무 까맣지 않게
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    this._occupy(base.x, base.z, R + 6);
    this.loops.push(loop);
    for (let i = 1; i < 10; i++) { const q = loop.pathAt(i / 10); q.lerp(loop.centerAt(i / 10), 0.09); this.ringSpots.push(q); }
    return loop;
  }

  _addSpring(x, z, power = CFG.spring.power, y = null) {
    const gy = y ?? terrainHeight(x, z);
    const g = new THREE.Group();
    const baseM = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.35, 16), new THREE.MeshLambertMaterial({ color: 0x4a505c }));
    baseM.position.y = 0.17;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    coil.position.y = 0.6;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0x330000 }));
    top.position.y = 1.0;
    g.add(baseM, coil, top);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, gy, z);
    this.root.add(g);
    this.springs.push({ pos: new THREE.Vector3(x, gy, z), top: gy + 1.1, power, mesh: g, topMesh: top, coil, comp: 0 });
    this._occupy(x, z, 2.5);
  }

  _addBoostPad(pos, dir) {
    const yaw = Math.atan2(dir.x, dir.z);
    if (!this._boostTex) this._boostTex = canvasTex(64, 128, (g) => {
      g.fillStyle = '#1e90ff'; g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 2; i++) { const y = 108 - i * 55; g.beginPath(); g.moveTo(8, y - 40); g.lineTo(32, y); g.lineTo(56, y - 40); g.lineTo(44, y - 40); g.lineTo(32, y - 20); g.lineTo(20, y - 40); g.fill(); }
    });
    if (!this._boostMat) { this._boostTex.wrapT = THREE.RepeatWrapping; this._boostMat = new THREE.MeshBasicMaterial({ map: this._boostTex, toneMapped: false }); }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 5), this._boostMat);
    const y = terrainHeight(pos.x, pos.z);
    mesh.position.set(pos.x, y + 0.08, pos.z); mesh.rotation.y = yaw;
    this.root.add(mesh);
    this.boostPads.push({ pos: mesh.position.clone(), dir: dir.clone().normalize(), mesh });
  }

  // 체크포인트: 바닥의 노란 별 장판
  _addCheckpoint(x, z, y = null) {
    if (y == null && (this.mode === 'lava' || this.mode === 'sky') && terrainHeight(x, z) < 0.5) { // 마른 땅으로 옮김
      for (let k = 1; k < 40; k++) { const a = k * 2.4, r = k * 2.2, nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r; if (terrainHeight(nx, nz) >= 0.7) { x = nx; z = nz; break; } }
    }
    const gy = y ?? this.groundAt(x, z);
    if (!this._cpTex) {
      this._cpTex = canvasTex(256, 256, (g) => {
        g.fillStyle = '#ffd23a'; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = '#e09a00'; g.lineWidth = 14; g.strokeRect(7, 7, 242, 242);
        g.strokeStyle = '#fff3a6'; g.lineWidth = 4; g.strokeRect(22, 22, 212, 212);
        starPath(g, 128, 136, 96, 40);
        g.fillStyle = '#fff176'; g.fill();
        g.lineWidth = 9; g.strokeStyle = '#d98a00'; g.stroke();
      });
    }
    const mat = new THREE.MeshLambertMaterial({ map: this._cpTex, emissive: 0xffd23a, emissiveIntensity: 0.0 });
    const side = new THREE.MeshLambertMaterial({ color: 0xc98a00 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 3.6), [side, side, mat, side, side, side]);
    mesh.position.set(x, gy + 0.1, z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    glow.position.set(x, gy + 3, z);
    this.root.add(glow);
    const cp = { pos: new THREE.Vector3(x, gy, z), active: false, mesh, mat, glow, flash: 0 };
    this.checkpoints.push(cp);
    this._occupy(x, z, 3);
    return cp;
  }
  activateCheckpoint(cp) { cp.active = true; cp.flash = 1; }

  _ringLine(a, b, n, lift = 1.2) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = (a.y != null ? a.y + (b.y - a.y) * t : this.groundAt(x, z)) + lift;
      this.ringSpots.push(new THREE.Vector3(x, y, z));
    }
  }
  _ringArc(center, fwd, len, height, n, lift = 1.2) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = center.clone().addScaledVector(fwd, (t - 0.5) * len);
      p.y = this.groundAt(p.x, p.z) + lift + Math.sin(t * Math.PI) * height;
      this.ringSpots.push(p);
    }
  }
  _ringCircle(cx, cz, r, n, lift = 1.2, y = null) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      this.ringSpots.push(new THREE.Vector3(x, (y ?? this.groundAt(x, z)) + lift, z));
    }
  }

  // ---------- 소품 ----------
  get noLife() { return this.mode === 'lava' || this.mode === 'ship'; }
  fence(x1, z1, x2, z2, color = 0xa8743f) {
    if (this.noLife) return;
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 3));
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n, y = terrainHeight(x, z);
      this.put(BASE.box, color, x, y + 0.6, z, 0.22, 1.2, 0.22);
      if (i < n) {
        const xm = x1 + (x2 - x1) * (i + 0.5) / n, zm = z1 + (z2 - z1) * (i + 0.5) / n, ym = terrainHeight(xm, zm);
        for (const hy of [0.45, 0.9]) this.put(BASE.box, color, xm, ym + hy, zm, 0.1, 0.16, len / n, yaw);
      }
    }
  }
  signpost(x, z, yaw, color = 0xffffff, board = 0x3c7bd8) {
    if (this.noLife) return;
    const y = terrainHeight(x, z);
    this.put(BASE.cyl6, 0x8a8f99, x, y + 1.4, z, 0.14, 2.8, 0.14);
    this.putRel(BASE.box, board, x, z, y, yaw, 0, 2.5, 0, 1.8, 0.8, 0.08);
    this.putRel(BASE.box, color, x, z, y, yaw, 0, 2.5, 0.05, 1.3, 0.12, 0.02);
    this.putRel(BASE.box, color, x, z, y, yaw, 0.35, 2.5, 0.05, 0.12, 0.45, 0.02, 0, 0, 0.8);
  }
  warningSign(x, z, yaw) {
    const y = terrainHeight(x, z);
    this.put(BASE.cyl6, 0x8a8f99, x, y + 1.1, z, 0.12, 2.2, 0.12);
    this.putRel(BASE.tri, 0x222222, x, z, y, yaw, 0, 2.35, 0, 1.25, 0.1, 1.25, 0, -Math.PI / 2, 0);
    this.putRel(BASE.tri, 0xffd000, x, z, y, yaw, 0, 2.35, 0.04, 1.05, 0.1, 1.05, 0, -Math.PI / 2, 0);
    this.putRel(BASE.box, 0x222222, x, z, y, yaw, 0, 2.3, 0.1, 0.1, 0.35, 0.02);
  }
  barrel(x, z, color = 0xd04020) {
    const y = terrainHeight(x, z);
    this.put(BASE.cyl, color, x, y + 0.55, z, 0.9, 1.1, 0.9);
    this.put(BASE.cyl, 0x333333, x, y + 0.75, z, 0.95, 0.08, 0.95);
    this.put(BASE.cyl, 0x333333, x, y + 0.3, z, 0.95, 0.08, 0.95);
    this._tree(x, z, 0.5, 1.1); this._occupy(x, z, 1);
  }
  crate(x, z, s = 1.4, y = null) {
    y = y ?? terrainHeight(x, z);
    const ry = this.rand() * 0.6;
    this.put(BASE.box, 0xc08a4a, x, y + s / 2, z, s, s, s, ry);
    this.put(BASE.box, 0x8a5a2a, x, y + s / 2, z, s * 1.02, s * 0.14, s * 1.02, ry);
    this.put(BASE.box, 0x8a5a2a, x, y + s / 2, z, s * 0.14, s * 1.02, s * 1.02, ry);
    this._solid(x, y + s / 2, z, s * 0.95, s, s * 0.95);
  }
  log(x, z, yaw, len = 4) {
    if (this.noLife) return;
    const y = terrainHeight(x, z);
    this.put(BASE.cyl, 0x7a4f28, x, y + 0.35, z, 0.7, len, 0.7, yaw, 0, Math.PI / 2);
    this.putRel(BASE.cyl, 0xd9b27a, x, z, y, yaw, len / 2 + 0.01, 0.35, 0, 0.6, 0.02, 0.6, 0, 0, Math.PI / 2);
    this._occupy(x, z, len / 2);
  }
  powerPole(x, z) {
    const y = terrainHeight(x, z);
    if (this.mode === 'lava') return new THREE.Vector3(x, -999, z);
    this.put(BASE.cyl6, 0x6b5a48, x, y + 4, z, 0.3, 8, 0.3);
    this.put(BASE.box, 0x6b5a48, x, y + 7.4, z, 2.4, 0.2, 0.2);
    this.put(BASE.sph, 0xff3020, x, y + 8.1, z, 0.3, 0.3, 0.3, 0, 0, 0, 'glow');
    this._tree(x, z, 0.3, 8);
    return new THREE.Vector3(x, y + 7.4, z);
  }
  cable(a, b) {
    if (a.y < -100 || b.y < -100) return;
    const N = 4;
    let prev = a.clone();
    for (let i = 1; i <= N; i++) {
      const t = i / N, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 1.4;
      const mid = prev.clone().add(p).multiplyScalar(0.5), d = p.clone().sub(prev), len = d.length();
      _m.lookAt(prev, p, new THREE.Vector3(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      _q.multiply(q2);
      _m.compose(mid, _q, _s.set(0.06, len, 0.06));
      this.batch.add(BASE.cyl6, 0x222222, _m);
      prev = p;
    }
  }
  robotDebris(x, z) {
    const y = terrainHeight(x, z), ry = this.rand() * 6.28;
    this.putRel(BASE.sph, 0x8a9099, x, z, y, ry, 0, 0.5, 0, 1.1, 0.9, 1.1);
    this.putRel(BASE.sph, 0xff3020, x, z, y, ry, 0, 0.6, 0.5, 0.25, 0.25, 0.15, 0, 0, 0, 'glow');
    this.putRel(BASE.box, 0x6a7079, x, z, y, ry, 1.2, 0.2, 0.3, 1.2, 0.3, 0.5, 0.5);
    this.putRel(BASE.cyl6, 0x555b63, x, z, y, ry, -0.9, 0.25, -0.4, 0.2, 1.4, 0.2, 0, 0, 1.3);
    this.putRel(BASE.gear, 0x9a5530, x, z, y, ry, 0.4, 0.06, -1.1, 1.4, 1.4, 1.4, 0, Math.PI / 2, 0);
    this._occupy(x, z, 1.6);
  }
  drill(x, z) {
    const y = terrainHeight(x, z), ry = this.rand() * 6.28;
    this.putRel(BASE.box, 0x50565f, x, z, y, ry, 0, 3.5, 0, 3.2, 3, 3.2);
    this.putRel(BASE.box, 0xffc233, x, z, y, ry, 0, 4.2, 1.62, 3.2, 0.5, 0.05);
    this.putRel(BASE.cyl, 0x6d737c, x, z, y, ry, 0, 1.2, 0, 1.4, 2.4, 1.4);
    this.putRel(BASE.cone, 0xb0b6be, x, z, y, ry, 0, -0.3, 0, 1.6, 2, 1.6, 0, Math.PI, 0);
    this.putRel(BASE.cyl6, 0x3a4048, x, z, y, ry, 1, 6, 0, 0.4, 2.5, 0.4);
    this.putRel(BASE.sph, 0xff3020, x, z, y, ry, 0, 5.3, 0, 0.35, 0.35, 0.35, 0, 0, 0, 'glow');
    this.smokeEmitters.push({ pos: new THREE.Vector3(x + Math.cos(ry), y + 7.3, z), rate: 0.6, dark: true });
    this._solid(x, y + 3.5, z, 3.2, 3, 3.2);
    this._tree(x, z, 1.0, 2);
  }
  oilPuddle(x, z) { const y = terrainHeight(x, z); this.put(BASE.cyl, 0x1a1a22, x, y + 0.03, z, 3 + this.rand() * 2, 0.04, 2 + this.rand() * 2, this.rand() * 3); }

  // =================================================================
  _start() {
    // 시작 광장
    this.spawn = { pos: new THREE.Vector3(0, 3, 4), yaw: 0 };
    this.startCheckpoint = this._addCheckpoint(-7, 2);
    this.activateCheckpoint(this.startCheckpoint); this.startCheckpoint.flash = 0;
    if (this.noLife) { // 사람 흔적 대신: 둥글게 선 현무암 기둥 / 금속 기둥
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = Math.cos(a) * 27, z = Math.sin(a) * 27; if (roadDist(x, z) < ROAD.width + 3) continue; const h = 4 + (i % 3) * 2.5; this.put(BASE.cyl6, this.mode === 'lava' ? 0x2e2826 : 0x4a515c, x, 3 + h / 2, z, 2.2, h, 2.2); this.put(BASE.cyl6, this.mode === 'lava' ? 0xff6a20 : 0xff4fd8, x, 3 + h + 0.1, z, 2.25, 0.25, 2.25, 0, 0, 0, 'glow'); this._solid(x, 3 + h / 2, z, 2, h, 2); }
      this._occupy(0, 0, 30);
      this._crystalSite(CRYSTAL_SITE.x, CRYSTAL_SITE.z);
      return;
    }
    // 출발 아치
    const y = 3;
    for (const s of [-1, 1]) {
      this.put(BASE.box, 0x8a6a48, s * 9, y + 4, 22, 1.2, 8, 1.2);
      this.put(BASE.box, 0x6a4a2a, s * 9, y + 0.4, 22, 1.8, 0.8, 1.8);
      this._solid(s * 9, y + 4, 22, 1.2, 8, 1.2);
    }
    this.put(BASE.box, 0x8a6a48, 0, y + 8.3, 22, 20, 1.2, 1.4);
    for (let i = -4; i <= 4; i++) this.put(BASE.box, i % 2 ? 0xffd23a : 0x3d9bff, i * 2, y + 8.3, 22.75, 1.8, 0.9, 0.1);
    // 광장 주변 꽃밭, 의자, 표지판
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) > -0.2) continue;
      const x = Math.cos(a) * 28, z = Math.sin(a) * 28;
      if (roadDist(x, z) < ROAD.width + 2) continue;
      this.trees.bush.add(x, terrainHeight(x, z), z, 1 + this.rand() * 0.4, this.rand() * 6, this.rand());
      for (let k = 0; k < 6; k++) this.trees.flower.add(x + (this.rand() - 0.5) * 4, terrainHeight(x, z), z + (this.rand() - 0.5) * 4, 1.3, 0, this.rand());
    }
    this.signpost(12, 18, -0.4, 0xffffff, 0x2f9e44);
    this.signpost(-12, 18, 0.4, 0xffffff, 0xd84a3c);
    for (const [x, z] of [[-18, -10], [18, -10], [0, -22]]) {
      this.put(BASE.box, 0x8b5a2b, x, 3.5, z, 2.6, 0.18, 0.8);
      this.put(BASE.box, 0x6b4423, x - 1, 3.2, z, 0.18, 0.5, 0.7); this.put(BASE.box, 0x6b4423, x + 1, 3.2, z, 0.18, 0.5, 0.7);
    }
    // 분수
    this.put(BASE.cyl, 0xb8b0a0, 0, 3.4, -12, 6, 0.8, 6);
    this.put(BASE.cyl, 0x4fc0ff, 0, 3.75, -12, 5.2, 0.1, 5.2);
    this.put(BASE.cyl, 0xb8b0a0, 0, 4.6, -12, 0.8, 2, 0.8);
    this._solid(0, 3.4, -12, 4.6, 0.8, 4.6);
    this._occupy(0, 0, 30);
    this._crystalSite(CRYSTAL_SITE.x, CRYSTAL_SITE.z);
    if (this.mode === 'ice') this._icePeak();
  }
  // 얼음 나라: 장벽보다 훨씬 높은 얼음산 꼭대기에서 시작 (아래로 뛰어내리며 출발)
  _icePeak() {
    const P = ICE_PEAK, y = terrainHeight(P.x, P.z);
    this.spawn = { pos: new THREE.Vector3(P.x, y + 0.5, P.z - 4), yaw: Math.PI };
    const cp = this._addCheckpoint(P.x + 6, P.z + 2);
    this.activateCheckpoint(cp); cp.flash = 0;
    this.activateCheckpoint(this.startCheckpoint); this.startCheckpoint.flash = 0;
    this.peakCheckpoint = cp;
    const lm0 = this.lm; this.lm = true;
    for (let i = 0; i < 14; i++) { // 꼭대기를 둘러싼 얼음 기둥
      const a = i / 14 * Math.PI * 2, r = P.top + 2 + (i % 2) * 3, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) < 0) continue;
      this.put(BASE.cone4, i % 2 ? 0xbfe6ff : 0xe8f6ff, x, terrainHeight(x, z) + 3, z, 2.2, 7 + (i % 3) * 3, 2.2, i, 0, 0, 'glow');
    }
    this.put(BASE.cyl6, 0x5a6478, P.x - 5, y + 5, P.z + 4, 0.35, 10, 0.35);
    this.put(BASE.box, 0x4fb8ff, P.x - 3.6, y + 9, P.z + 4, 2.8, 1.8, 0.1);
    this.lm = lm0;
    const S = new THREE.Vector3(P.x, null, P.z - P.top), E = new THREE.Vector3(P.x, null, P.z - P.r * 0.8); // 내려가는 길의 링
    for (let k = 0; k < 10; k++) { const a = S.clone().lerp(E, k / 10), b = S.clone().lerp(E, (k + 0.6) / 10); this._ringLine(a, b, 5); }
    this._occupy(P.x, P.z, P.top + 6);
  }

  // ---------- 퀘스트 1: 로봇 기지 ----------
  _robotBase() {
    const lm0 = this.lm; this.lm = true;
    const F = SITES.base, y = F.h;
    this.questTargets.base = new THREE.Vector3(F.x, y, F.z);
    const R = 24;
    for (let i = 0; i < 16; i++) { // 금속 울타리 (4군데 입구)
      if (i % 4 === 0) continue;
      const a = (i + 0.5) / 16 * Math.PI * 2, x = F.x + Math.cos(a) * R, z = F.z + Math.sin(a) * R;
      this.put(BASE.box, 0x50565f, x, y + 2, z, 1, 4, 9, -a);
      this.put(BASE.box, 0xffc233, x, y + 0.5, z, 1.05, 0.5, 9.05, -a);
      this.put(BASE.cone, 0x9aa0a8, x, y + 4.6, z, 0.5, 1.2, 0.5);
      this._solid(x, y + 2, z, 3.5, 4, 3.5);
    }
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { // 입구 기둥 + 빨간 깃발
      const a = i / 4 * Math.PI * 2 + s * 0.17, x = F.x + Math.cos(a) * R, z = F.z + Math.sin(a) * R;
      this.put(BASE.cyl6, 0x3a4048, x, y + 3.5, z, 0.3, 7, 0.3);
      this.put(BASE.box, 0xd83a2a, x + 0.9, y + 6.2, z, 1.6, 1, 0.08);
      this.put(BASE.sph, 0xff3020, x, y + 7.2, z, 0.35, 0.35, 0.35, 0, 0, 0, 'glow');
    }
    for (const [ox, oz, c] of [[-12, -8, 0xd85a2a], [-12, -4, 0x2a6fd0], [10, 10, 0x3a9a4a], [12, -10, 0xd85a2a]]) { // 컨테이너
      this.put(BASE.box, c, F.x + ox, y + 1.3, F.z + oz, 6, 2.6, 2.6);
      this.put(BASE.box, 0x222222, F.x + ox, y + 1.3, F.z + oz + 1.31, 5.6, 2.2, 0.05);
      this._solid(F.x + ox, y + 1.3, F.z + oz, 6, 2.6, 2.6);
    }
    for (let i = 0; i < 6; i++) this.barrel(F.x - 6 + i * 1.2, F.z + 14, i % 2 ? 0xd04020 : 0x333333);
    this._ringCircle(F.x, F.z, 16, 14);
    this.enemySpots.push({ pos: new THREE.Vector3(F.x, y, F.z), type: 'tower', tag: 'base' });
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; this.enemySpots.push({ pos: new THREE.Vector3(F.x + Math.cos(a) * 12, 0, F.z + Math.sin(a) * 12), type: i % 3 ? 'beetle' : 'wasp', tag: 'base' }); }
    this._addCheckpoint(F.x + 34, F.z - 10);
    this._occupy(F.x, F.z, F.r);
    this.lm = lm0;
  }

  // ---------- 퀘스트 2: 로봇 생산 공장 (안으로 들어가서 싸움) ----------
  _smallFactory() {
    const lm0 = this.lm; this.lm = true;
    const F = SITES.factory, y = F.h;
    this.questTargets.factory = new THREE.Vector3(F.x, y, F.z);
    const W = 44, D = 34, H = 13, t = 1.2, door = 14;
    const wall = (cx, cz, sx, sz) => this._fadeBox(cx, y + H / 2, cz, sx, H, sz, 0x7b828c);
    wall(F.x, F.z - D / 2, W, t);
    wall(F.x - W / 2, F.z, t, D); wall(F.x + W / 2, F.z, t, D);
    wall(F.x - (W + door) / 4, F.z + D / 2, (W - door) / 2, t); wall(F.x + (W + door) / 4, F.z + D / 2, (W - door) / 2, t);
    this._fadeBox(F.x, y + H - 1.5, F.z + D / 2, door, 3, t, 0x7b828c, false);
    for (const cx of [F.x - W * 0.3, F.x + W * 0.3]) this._fadeBox(cx, y + H + 0.5, F.z, W * 0.4, 1, D + 1, 0x4a5058);
    this.indoors.push({ min: new THREE.Vector3(F.x - W / 2, y - 1, F.z - D / 2), max: new THREE.Vector3(F.x + W / 2, y + H, F.z + D / 2) });
    for (let i = 0; i < 4; i++) this.put(BASE.box, 0x3a4048, F.x, y + H + 0.5, F.z - D / 2 + 4 + i * 8.5, W * 0.2, 0.5, 0.5);
    this.put(BASE.box, 0xffc233, F.x, y + H - 3, F.z + D / 2 + 0.7, door + 2, 0.6, 0.1);
    this.put(BASE.box, 0xd83a2a, F.x, y + H + 3, F.z + D / 2 - 2, 14, 4, 0.5);
    for (const ox of [-12, 12]) {
      this.put(BASE.box, 0x2c3036, F.x + ox, y + 0.6, F.z - 2, 4, 1.2, 24);
      for (let k = 0; k < 4; k++) this.robotDebris(F.x + ox + (k % 2 ? 1 : -1), F.z - 10 + k * 6);
    }
    for (let i = 0; i < 3; i++) this.put(BASE.box, 0xfff0c0, F.x - 14 + i * 14, y + H - 0.5, F.z, 6, 0.3, 1, 0, 0, 0, 'glow');
    this.smokestack(F.x + W / 2 + 4, F.z - 10, 22);
    this.smokestack(F.x + W / 2 + 4, F.z + 2, 18);
    this.enemySpots.push({ pos: new THREE.Vector3(F.x, y, F.z - 9), type: 'machine', tag: 'factory' });
    for (let i = 0; i < 9; i++) this.enemySpots.push({ pos: new THREE.Vector3(F.x - 15 + (i % 5) * 7.5, 0, F.z - 4 + Math.floor(i / 5) * 9), type: i % 3 === 2 ? 'tank' : 'beetle', tag: 'factory', leash: 12 });
    this._ringLine(new THREE.Vector3(F.x, null, F.z + D / 2 + 12), new THREE.Vector3(F.x, null, F.z + 4), 8);
    this._addCheckpoint(F.x, F.z + D / 2 + 16);
    this._occupy(F.x, F.z, F.r);
    this.lm = lm0;
  }

  // ---------- 퀘스트 4~5: 과학 연구소 ----------
  _lab() {
    const lm0 = this.lm; this.lm = true;
    const F = SITES.lab, y = F.h;
    const bx = F.x, bz = F.z - 20;
    this.questTargets.lab = new THREE.Vector3(F.x, y, F.z + 8);
    this.put(BASE.box, 0xd8dce4, bx, y + 8, bz, 40, 16, 22);
    this.put(BASE.box, 0x5a6070, bx, y + 16.4, bz, 41, 0.8, 23);
    this.put(BASE.box, 0x6a2cff, bx, y + 3, bz + 11.05, 8, 6, 0.1, 0, 0, 0, 'glow');
    for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) this.put(BASE.box, 0x88e0ff, bx - 17 + i * 6.8, y + 8 + r * 4, bz + 11.05, 3.2, 2, 0.1, 0, 0, 0, 'glow');
    this.put(BASE.hemi, 0x9fd8ff, bx + 8, y + 16.8, bz, 14, 9, 14);
    this.put(BASE.cyl6, 0x3a4048, bx - 12, y + 24, bz, 0.5, 16, 0.5);
    this.put(BASE.torus, 0xb0b6be, bx - 12, y + 29, bz, 4, 4, 4, 0, Math.PI / 2);
    this.put(BASE.sph, 0xff3020, bx - 12, y + 32.4, bz, 0.8, 0.8, 0.8, 0, 0, 0, 'glow');
    this._solid(bx, y + 8, bz, 40, 16, 22);
    for (const s of [-1, 1]) { // 테슬라 코일
      const cx = F.x + s * 22, cz = F.z + 6;
      this.put(BASE.cyl, 0x3a4048, cx, y + 4, cz, 1.6, 8, 1.6);
      for (let k = 0; k < 4; k++) this.put(BASE.torus, 0xc08a4a, cx, y + 2 + k * 1.6, cz, 2.4, 2.4, 2.4, 0, Math.PI / 2);
      this.put(BASE.sph, 0xb070ff, cx, y + 9, cz, 2.2, 2.2, 2.2, 0, 0, 0, 'glow');
      this._solid(cx, y + 4, cz, 2, 8, 2);
    }
    this.put(BASE.cyl, 0xffc233, F.x, y + 0.03, F.z + 10, 22, 0.06, 22);
    this.put(BASE.cyl, 0x3a4048, F.x, y + 0.05, F.z + 10, 19, 0.06, 19);
    this.put(BASE.box, 0xffc233, F.x, y + 0.07, F.z + 10, 2, 0.06, 12);
    this.put(BASE.box, 0xffc233, F.x, y + 0.07, F.z + 10, 12, 0.06, 2);
    this.labPad = new THREE.Vector3(F.x, y, F.z + 10);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; this.enemySpots.push({ pos: new THREE.Vector3(F.x + Math.cos(a) * 30, 0, F.z + 20 + Math.sin(a) * 25), type: i % 2 ? 'wasp' : 'hopper', tag: 'lab' }); }
    this._addCheckpoint(F.x + 30, F.z + 34);
    this._occupy(F.x, F.z, F.r);
    this.lm = lm0;
  }

  // ---------- 땅속에 잠들어 있던 대지의 크리스탈 + 기어 군단이 파낸 구덩이·굴착기·흡수 관 ----------
  _crystalSite(x, z) {
    const C = CRYSTAL_SITE, y0 = 3, by = y0 - C.d;
    const col = { forest: 0x3ddc5a, ice: 0x4fb8ff, lava: 0xff5a3a, sky: 0xffd23a }[this.mode] || 0x3ddc5a;
    const metal = new THREE.MeshLambertMaterial({ color: 0x50565f }), dark = new THREE.MeshLambertMaterial({ color: 0x2c3036 });
    const yel = new THREE.MeshLambertMaterial({ color: 0xffc233 }), red = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false });
    const mk = (geo, m, px, py, pz, sx = 1, sy = 1, sz = 1, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    // 크리스탈
    this.crystalMat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, flatShading: true });
    const cg = new THREE.Group(); cg.position.set(x, 0, z); this.root.add(cg);
    const oct = new THREE.OctahedronGeometry(1, 0);
    this.crystalMesh = mk(oct, this.crystalMat, 0, by + 3, 0, 3, 6.5, 3, cg);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, o = mk(oct, this.crystalMat, Math.cos(a) * 3.6, by + 1.2, Math.sin(a) * 3.6, 0.8, 2.2, 0.8, cg); o.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5); }
    this.crystalGroup = cg;
    // 파내기 전의 땅 (첫 이야기 장면에서만)
    const lid = new THREE.Mesh(new THREE.CircleGeometry(C.r + 2.5, 40), new THREE.MeshLambertMaterial({ color: new THREE.Color(this.T.grassA).lerp(new THREE.Color(this.T.grassB), 0.4) }));
    lid.rotation.x = -Math.PI / 2; lid.position.set(x, y0 + 0.08, z); lid.receiveShadow = true; this.root.add(lid);
    this.crystalLid = lid;
    // 굴착기: 네 다리 탑 + 위에서 내려오는 거대한 드릴
    const rig = new THREE.Group(); rig.position.set(x, 0, z); this.root.add(rig);
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
    const L = C.r + 2, top = y0 + 24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mk(box, metal, sx * L, y0 + 12, sz * L, 1.4, 24, 1.4, rig);
      mk(box, yel, sx * L, y0 + 1, sz * L, 1.6, 0.8, 1.6, rig);
      this._solid(x + sx * L, y0 + 12, z + sz * L, 1.4, 24, 1.4);
    }
    for (const sx of [-1, 1]) { mk(box, dark, sx * L, top, 0, 1.2, 1.2, L * 2 + 1.4, rig); mk(box, dark, 0, top, sx * L, L * 2 + 1.4, 1.2, 1.2, rig); }
    mk(box, metal, 0, top + 1.4, 0, 9, 2.6, 9, rig);
    mk(box, yel, 0, top + 1.4, 4.55, 9, 0.6, 0.1, rig);
    for (const s2 of [-1, 1]) mk(new THREE.SphereGeometry(0.5, 8, 6), red, s2 * 3.6, top + 2.9, 0, 1, 1, 1, rig);
    const drill = new THREE.Group(); rig.add(drill);
    mk(cyl, metal, 0, 5, 0, 1.3, 10, 1.3, drill);
    const tip = mk(new THREE.ConeGeometry(2.2, 6, 10), new THREE.MeshLambertMaterial({ color: 0xd8dde3, flatShading: true }), 0, -3, 0, 1, 1, 1, drill); tip.rotation.x = Math.PI;
    for (let k = 0; k < 3; k++) mk(new THREE.TorusGeometry(1.6 - k * 0.4, 0.25, 6, 14), yel, 0, -1 - k * 1.6, 0, 1, 1, 1, drill).rotation.x = Math.PI / 2;
    this.drillRig = drill; this.drillTop = top - 11; this.drillLow = by + 9.5; drill.position.y = this.drillTop;
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, r = C.r + 4 + (i % 2) * 2; mk(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: this.T.dirt }), Math.cos(a) * r, y0 - 0.3, Math.sin(a) * r, 3 + (i % 3), 1.6 + (i % 2), 2.6, rig); } // 파낸 흙더미
    rig.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.crystalRig = rig;
    // 크리스탈에 꽂은 관 → 펌프 → 대지 바깥으로 이어지는 관 (빛이 빨려 나감)
    const drain = new THREE.Group();
    const ccen = new THREE.Vector3(x, by + 4, z);
    for (const a of [0.6, 2.4, 4.2]) {
      const dx = Math.cos(a), dz = Math.sin(a);
      const pump = new THREE.Vector3(x + dx * (C.r + 1), y0 + 1.5, z + dz * (C.r + 1));
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 8), dark);
      cab.position.copy(ccen).lerp(pump, 0.5); cab.scale.y = ccen.distanceTo(pump); cab.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pump.clone().sub(ccen).normalize()); drain.add(cab);
      const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.3, 6, 12), yel); clamp.position.copy(ccen).lerp(pump, 0.18); clamp.quaternion.copy(cab.quaternion); clamp.rotateX(Math.PI / 2); drain.add(clamp);
      const pb = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), metal); pb.position.copy(pump); drain.add(pb);
      const st = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.5, 3.05), yel); st.position.copy(pump).add(new THREE.Vector3(0, 0.6, 0)); drain.add(st);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), red); lamp.position.copy(pump).add(new THREE.Vector3(0, 1.8, 0)); drain.add(lamp);
      const sx = pump.x, sz = pump.z, len = 60, mx = sx + dx * (len / 2 + 1.5), mz = sz + dz * (len / 2 + 1.5);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, len, 10), metal);
      pipe.position.set(mx, Math.max(terrainHeight(mx, mz), y0) + 1.4, mz); pipe.rotation.order = 'YXZ'; pipe.rotation.y = Math.atan2(dx, dz); pipe.rotation.x = Math.PI / 2;
      drain.add(pipe);
      for (let k = 0; k < 5; k++) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, toneMapped: false }));
        glow.userData = { sx: sx + dx * 1.5, sz: sz + dz * 1.5, dx, dz, len, k, py: pipe.position.y };
        drain.add(glow);
      }
    }
    drain.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root.add(drain);
    this.treeDrain = drain;
    this._tree(x, z, 2.8, 10);
    this.heartTree = { pos: new THREE.Vector3(x, y0, z), restored: false, glowT: 0 };
    this.questTargets.heartTree = this.questTargets.crystal = new THREE.Vector3(x, y0, z);
    this._occupy(x, z, C.r + 8);
    this.crystalState(2);
  }
  // 크리스탈 상태: 0 = 아직 땅속 / 1 = 굴착기가 파는 중 / 2 = 관을 꽂아 힘을 빼앗는 중 / 3 = 되찾음
  crystalState(st) {
    this.cState = st; this.drillT = 0;
    this.crystalLid.visible = st === 0;
    this.crystalGroup.visible = st !== 0;
    this.crystalRig.visible = st === 1 || st === 2;
    this.treeDrain.visible = st === 2;
    if (st === 1) this.drillRig.position.y = this.drillTop;
    if (st === 3) this.heartTree.restored = true;
    if (st === 4) { this.heartTree.restored = true; this.heartTree.glowT = 1; this.crystalGroup.visible = false; }
  }
  restoreTree() {
    if (!this.heartTree || this.heartTree.restored) return;
    this.crystalState(3);
  }

  _mainRoad() {
    const P = (z) => new THREE.Vector3(startRoadX(z), null, z);
    const loopZ = [230, 520, 760];
    const near = (z, d) => loopZ.some((c) => Math.abs(z - c) < d) || Math.abs(z - 380) < d;
    for (let z = 30; z < START_ROAD_END - 20; z += 26) {
      if (near(z, 40)) continue;
      this._ringLine(P(z), P(z + 18), 7);
    }
    this.questTargets.firstFlag = this._addCheckpoint(startRoadX(95) - 10, 95).pos;
    for (const z of [300, 450, 640, 820]) this._addCheckpoint(startRoadX(z) - 10, z);
    loopZ.forEach((z, i) => { const L = this._addLoop(new THREE.Vector3(startRoadX(z), 0, z), startRoadDir(z)); if (i === 0) this.questTargets.loop = L.entry.clone(); });
    this._addRamp(new THREE.Vector3(startRoadX(380), 0, 380), startRoadDir(380), 8, 14, 3.5);
    this._ringArc(new THREE.Vector3(startRoadX(402), 0, 402), startRoadDir(402), 26, 6, 9, 3);
    for (let z = 40; z < START_ROAD_END; z += 18) {
      if (near(z, 30)) continue;
      for (const s of [-1, 1]) {
        const x = startRoadX(z) + s * (ROAD.width + 4);
        if (this.rand() < 0.55) this.fence(x, z, startRoadX(z + 12) + s * (ROAD.width + 4), z + 12);
      }
      if (z % 54 === 40) this.warningSign(startRoadX(z) + ROAD.width + 6, z + 6, Math.PI);
    }
    for (let z = 60; z < START_ROAD_END; z += 70) this.signpost(startRoadX(z) - ROAD.width - 5, z, 0.2);
    for (let z = 52; z < START_ROAD_END; z += 26) {
      if (near(z, 30)) continue;
      this.enemySpots.push({ pos: new THREE.Vector3(startRoadX(z) + (this.rand() - 0.5) * 10, 0, z), type: 'beetle' });
    }
  }

  _ringRoad() {
    const thLoops = [0.25, 1.35, 2.55, 3.45, 4.3, 5.4];
    const near = (th, d) => thLoops.some((t) => Math.abs(th - t) < d);
    for (let th = 0; th < Math.PI * 2; th += 0.025) {
      if (near(th, 0.05)) continue;
      if (Math.floor(th / 0.025) % 2 === 0) this._ringLine(ringPoint(th).setY(NaN), ringPoint(th + 0.018).setY(NaN), 7);
    }
    for (const r of this.ringSpots) if (Number.isNaN(r.y)) r.y = this.groundAt(r.x, r.z) + 1.2;
    for (const th of thLoops) this._addLoop(ringPoint(th), ringDir(th));
    for (const th of [0.75, 1.9, 3.0, 3.9, 4.85, 5.95]) this._addBoostPad(ringPoint(th), ringDir(th)); // 직선 가속 발판
    for (const th of [1.0, 2.2, 3.15, 4.0, 5.1, 6.1]) { // 점프대 + 공중 링
      this._addRamp(ringPoint(th), ringDir(th), 8, 14, 4);
      const c = ringPoint(th + 0.03); this._ringArc(c, ringDir(th + 0.03), 30, 8, 9, 3);
    }
    for (let th = 0.45; th < Math.PI * 2; th += 0.5) { // 길가 체크포인트
      if (near(th, 0.06)) continue;
      const p = ringPoint(th), d = ringDir(th), side = new THREE.Vector3(d.z, 0, -d.x);
      p.addScaledVector(side, ROAD.width + 5);
      this._addCheckpoint(p.x, p.z);
    }
    let prevPole = null;
    for (let th = 0; th < Math.PI * 2; th += 0.025) { // 울타리와 전봇대·전선
      const p = ringPoint(th), d = ringDir(th), out = new THREE.Vector3(-d.z, 0, d.x);
      const q = p.clone().addScaledVector(out, ROAD.width + 6);
      if (near(th, 0.04)) { prevPole = null; continue; }
      if (Math.floor(th / 0.025) % 2 === 0 && this._free(q.x, q.z, 0.5)) {
        const top = this.powerPole(q.x, q.z);
        if (prevPole && prevPole.distanceTo(top) < 60) this.cable(prevPole, top);
        prevPole = top;
      }
      if (this.rand() < 0.3) { const f = p.clone().addScaledVector(out, -(ROAD.width + 4)); const f2 = ringPoint(th + 0.01).addScaledVector(out, -(ROAD.width + 4)); this.fence(f.x, f.z, f2.x, f2.z); }
    }
    for (let th = 0.05; th < Math.PI * 2; th += 0.055) {
      const p = ringPoint(th).add(new THREE.Vector3((this.rand() - 0.5) * 8, 0, (this.rand() - 0.5) * 8));
      if (near(th, 0.06)) continue;
      zoneWeights(p.x, p.z);
      const type = ZW[0] > 0.5 ? 'tank' : ZW[1] > 0.5 ? 'wasp' : ZW[2] > 0.5 ? 'hopper' : ZW[3] > 0.5 ? 'wasp' : 'beetle';
      this.enemySpots.push({ pos: p, type });
    }
  }

  _zoneMeadow() {
    const RR = CFG.world.barrierR - 20;
    // 숲: 여러 종류 나무 군락
    for (let i = 0; i < 13000; i++) {
      const x = (this.rand() - 0.5) * RR * 2, z = (this.rand() - 0.5) * RR * 2;
      if (Math.hypot(x, z) > RR) continue;
      zoneWeights(x, z);
      if (Math.max(ZW[0], ZW[1], ZW[2], ZW[3]) > 0.4) continue;
      const cluster = vnoise(x * 0.006, z * 0.006);
      if (cluster < 0.45) continue;
      if (!this._free(x, z, 1.5)) continue;
      const h = terrainHeight(x, z);
      this._plantTree(h > 70 ? 'pine' : this._forestType(), x, z, 0.85 + this.rand() * 0.75);
    }
    for (let i = 0; i < 16000; i++) {
      const x = (this.rand() - 0.5) * RR * 2, z = (this.rand() - 0.5) * RR * 2;
      if (Math.hypot(x, z) > RR) continue;
      zoneWeights(x, z);
      if (ZW[0] > 0.4 || ZW[1] > 0.6) continue;
      if (!this._free(x, z, 0.6)) continue;
      const r = this.rand();
      if (r < 0.45) this._plantTree('flower', x, z, 1 + this.rand() * 0.6);
      else if (r < 0.78) this._plantTree('bush', x, z, 0.6 + this.rand() * 0.7);
      else this._plantTree('rock', x, z, 0.5 + this.rand() * 1.6);
    }
    for (let i = 0; i < 260; i++) {
      const x = (this.rand() - 0.5) * RR * 2, z = (this.rand() - 0.5) * RR * 2;
      zoneWeights(x, z); if (ZW[0] > 0.3 || Math.hypot(x, z) > RR) continue;
      if (this._free(x, z, 3)) this.log(x, z, this.rand() * 3, 3 + this.rand() * 3);
    }
    // 기계화가 시작된 숲 (바깥쪽일수록 많음)
    for (let i = 0; i < 1000; i++) {
      const a = this.rand() * Math.PI * 2, r = 500 + Math.sqrt(this.rand()) * (RR - 520);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 2.5)) continue;
      const k = this.rand();
      if (k < 0.25) this._plantTree('metal', x, z, 0.9 + this.rand() * 0.5);
      else if (k < 0.45) this.robotDebris(x, z);
      else if (k < 0.6) this.barrel(x, z, this.rand() < 0.5 ? 0xd04020 : 0x2a6fd0);
      else if (k < 0.72) this.oilPuddle(x, z);
      else if (k < 0.82) this.warningSign(x, z, this.rand() * 6);
      else if (k < 0.9 && r > 1200) this.drill(x, z);
      else this.crate(x, z, 1.2 + this.rand() * 0.6);
    }
    for (let i = 0; i < 330; i++) { // 들판 몬스터 (전부 로봇)
      const a = this.rand() * Math.PI * 2, r = 60 + this.rand() * (RR - 80);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      zoneWeights(x, z); if (Math.max(ZW[0], ZW[1], ZW[2], ZW[3]) > 0.4) continue;
      const rt = this.rand();
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type: rt < 0.18 ? 'wasp' : rt < 0.36 ? 'gunner' : rt < 0.52 ? 'brute' : rt < 0.62 ? 'hopper' : 'beetle' });
    }
    for (let i = 0; i < 220; i++) { // 구역마다 어울리는 로봇
      const a = this.rand() * Math.PI * 2, r = 200 + this.rand() * (RR - 220);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      zoneWeights(x, z);
      const w = [ZW[0], ZW[1], ZW[2], ZW[3]], zi = w.indexOf(Math.max(...w));
      if (w[zi] < 0.4) continue;
      const rt = this.rand();
      const type = [rt < 0.5 ? 'brute' : 'tank', rt < 0.6 ? 'wasp' : 'beetle', rt < 0.6 ? 'hopper' : 'gunner', rt < 0.5 ? 'gunner' : 'wasp'][zi];
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type });
    }
    this._mountains();
  }

  // 올라갈 수 있는 산: 꼭대기 체크포인트, 오르는 길의 링, 봉우리 스프링
  _mountains() {
    for (const M of MOUNTAINS) {
      const top = terrainHeight(M.x, M.z);
      this._addCheckpoint(M.x + 6, M.z);
      this._ringCircle(M.x, M.z, 10, 14);
      this._addSpring(M.x - 8, M.z, 34);
      this._ringLine(new THREE.Vector3(M.x - 8, top + 10, M.z), new THREE.Vector3(M.x - 8, top + 30, M.z), 6, 0);
      for (let k = 0; k < 3; k++) { // 산을 감아 오르는 링 길
        const a0 = this.rand() * 6.28;
        for (let i = 0; i < 18; i++) {
          const t = i / 18, a = a0 + t * 2.4, rr = M.r * (0.85 - t * 0.7);
          const x = M.x + Math.cos(a) * rr, z = M.z + Math.sin(a) * rr;
          this.ringSpots.push(new THREE.Vector3(x, terrainHeight(x, z) + 1.2, z));
        }
      }
      for (let i = 0; i < 70; i++) { // 산의 나무·바위
        const a = this.rand() * 6.28, rr = Math.sqrt(this.rand()) * M.r * 0.9;
        const x = M.x + Math.cos(a) * rr, z = M.z + Math.sin(a) * rr;
        if (!this._free(x, z, 1.5)) continue;
        this._plantTree(this.rand() < 0.6 ? 'pine' : 'rock', x, z, 0.8 + this.rand() * 0.8);
      }
    }
  }

  // 공장 건물
  factory(x, z, w, d, h, yaw = 0) {
    const lm0 = this.lm; this.lm = true;
    const y = terrainHeight(x, z);
    const T = this.T;
    this.put(BASE.box, 0x7b828c, x, y + h / 2, z, w, h, d, yaw);
    this.put(BASE.box, 0x4a5058, x, y + h + 0.3, z, w + 0.6, 0.6, d + 0.6, yaw);
    this.put(BASE.box, 0xffc233, x, y + 1.1, z, w + 0.05, 0.4, d + 0.05, yaw);
    // 녹 얼룩, 창문
    const rows = Math.max(1, Math.floor((h - 3) / 3.2));
    for (let r = 0; r < rows; r++) for (let c = 0; c < Math.floor(w / 3); c++) {
      const lx = -w / 2 + 1.5 + c * 3, ly = 3 + r * 3.2;
      const lit = this.rand() < 0.6;
      this.putRel(BASE.box, lit ? 0xffd27a : 0x2a3340, x, z, y, yaw, lx, ly, d / 2 + 0.02, 1.6, 1.2, 0.08, 0, 0, 0, lit ? 'glow' : 'lit');
      this.putRel(BASE.box, lit ? 0xffd27a : 0x2a3340, x, z, y, yaw, lx, ly, -d / 2 - 0.02, 1.6, 1.2, 0.08, 0, 0, 0, lit ? 'glow' : 'lit');
    }
    this.putRel(BASE.box, T.rust, x, z, y, yaw, w * 0.2, h * 0.6, d / 2 + 0.03, w * 0.25, h * 0.5, 0.05);
    this.putRel(BASE.box, 0x3a4048, x, z, y, yaw, 0, 1.8, d / 2 + 0.03, 3.4, 3.6, 0.1);
    // 지붕 환기팬
    this.putRel(BASE.cyl, 0x5a6068, x, z, y, yaw, w * 0.25, h + 1, 0, 2, 1.2, 2);
    // 충돌 (가로세로 정렬: yaw는 0 또는 90도만 사용)
    const sw = Math.abs(Math.cos(yaw)) > 0.5 ? w : d, sd = Math.abs(Math.cos(yaw)) > 0.5 ? d : w;
    this._solid(x, y + h / 2, z, sw, h, sd);
    this.lm = lm0;
    return y + h;
  }
  smokestack(x, z, h) {
    const lm0 = this.lm; this.lm = true;
    const y = terrainHeight(x, z);
    for (let i = 0; i < 5; i++) this.put(BASE.cyl, i % 2 ? 0xffffff : 0xd83a2a, x, y + h * (i + 0.5) / 5, z, 2.6 - i * 0.15, h / 5, 2.6 - i * 0.15);
    this.put(BASE.cyl, 0x333333, x, y + h + 0.2, z, 2.2, 0.5, 2.2);
    this.smokeEmitters.push({ pos: new THREE.Vector3(x, y + h + 1, z), rate: 1.2, dark: true });
    this._solid(x, y + h / 2, z, 2.4, h, 2.4);
    this.lm = lm0;
  }
  pipe(x1, z1, x2, z2, hgt = 2.5, color = 0x8a9099) {
    const y = Math.max(terrainHeight(x1, z1), terrainHeight(x2, z2)) + hgt;
    const len = Math.hypot(x2 - x1, z2 - z1), yaw = Math.atan2(x2 - x1, z2 - z1);
    this.put(BASE.cyl, color, (x1 + x2) / 2, y, (z1 + z2) / 2, 1, len, 1, yaw, Math.PI / 2);
    const n = Math.max(1, Math.floor(len / 8));
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n, gy = terrainHeight(x, z);
      this.put(BASE.box, 0x50565f, x, (gy + y) / 2, z, 0.3, y - gy, 0.3);
      this.put(BASE.cyl, 0xffc233, x, y, z, 1.15, 0.25, 1.15, yaw, Math.PI / 2);
    }
  }

  _zoneRust() {
    const Z = ZONES.rust, R = (a, b) => a + this.rand() * (b - a);
    this.questTargets.camp = new THREE.Vector3(Z.x, terrainHeight(Z.x, Z.z), Z.z);
    // 큰 공장들
    const blocks = [[-140, -120], [120, -160], [-180, 100], [160, 120], [0, 220], [260, -20], [-280, -40], [20, -300], [-320, 220], [330, 260], [-60, 380], [380, -260], [-380, -280], [200, 420]];
    const roofs = [];
    for (const [ox, oz] of blocks) {
      const x = Z.x + ox, z = Z.z + oz;
      if (roadDist(x, z) < 30) continue;
      const w = R(18, 30), d = R(14, 22), h = R(10, 18);
      const top = this.factory(x, z, w, d, h);
      roofs.push({ x, z, w, d, top });
      if (this.rand() < 0.7) this.smokestack(x + w / 2 + 3, z, h + R(8, 16));
      // 지붕 위 링
      this._ringCircle(x, z, 3.5, 8, 1.2, top);
      // 엘리베이터 (지붕으로 올라가는 움직이는 발판)
      const ex = x - w / 2 - 3.5, ey0 = terrainHeight(ex, z) + 0.3;
      this._mover({ x: ex, y: ey0, z }, { x: ex, y: top - 0.2, z }, 4, 0.6, 4, 7, 0x5a6068, 0xffc233);
    }
    // 컨베이어 벨트
    for (let i = 0; i < 18; i++) {
      const a = this.rand() * 6.28, r = R(80, 400);
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 14) || roadDist(x, z) < 25) continue;
      const along = this.rand() < 0.5;
      const y = terrainHeight(x, z) + 0.6;
      const sx = along ? 24 : 4, sz = along ? 4 : 24;
      this.put(BASE.box, 0x2c3036, x, y - 0.1, z, sx, 1.2, sz);
      const dir = this.rand() < 0.5 ? 1 : -1;
      const conv = new THREE.Vector3(along ? dir * 12 : 0, 0, along ? 0 : dir * 12);
      const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 23.8), this._beltMat());
      beltMesh.position.set(x, y + 0.52, z); beltMesh.rotation.y = Math.atan2(conv.x, conv.z);
      this.root.add(beltMesh);
      this._solid(x, y, z, sx, 1.1, sz, { conv });
      this._ringLine(new THREE.Vector3(x - (along ? 10 : 0), y + 0.6, z - (along ? 0 : 10)), new THREE.Vector3(x + (along ? 10 : 0), y + 0.6, z + (along ? 0 : 10)), 6, 1.2);
    }
    // 톱날 (위험!)
    for (let i = 0; i < 30; i++) {
      const a = this.rand() * 6.28, r = R(60, 440);
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 10)) continue;
      this._saw(x, z, this.rand() * 3, R(8, 14));
    }
    // 파이프, 기계 나무, 상자, 드럼통, 거대 톱니
    for (let i = 0; i < 54; i++) {
      const a = this.rand() * 6.28, r = R(40, 520), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const a2 = this.rand() * 6.28, l = R(20, 50), x2 = x + Math.cos(a2) * l, z2 = z + Math.sin(a2) * l;
      if (roadDist(x, z) < 14 || roadDist(x2, z2) < 14) continue;
      this.pipe(x, z, x2, z2, R(2.5, 6), this.rand() < 0.5 ? 0x8a9099 : 0x9a5530);
    }
    for (let i = 0; i < 780; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 560, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 2)) continue;
      const k = this.rand();
      if (k < 0.4) this._plantTree('metal', x, z, 0.9 + this.rand() * 0.6);
      else if (k < 0.6) this.barrel(x, z, this.rand() < 0.5 ? 0xd04020 : 0xffc233);
      else if (k < 0.75) this.crate(x, z, R(1.2, 2.2));
      else if (k < 0.85) this.robotDebris(x, z);
      else if (k < 0.92) this.oilPuddle(x, z);
      else this.warningSign(x, z, this.rand() * 6);
    }
    for (let i = 0; i < 21; i++) {
      const a = this.rand() * 6.28, r = R(80, 500), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 8)) continue;
      const s = R(8, 14), y = terrainHeight(x, z);
      const g = new THREE.Mesh(BASE.gear, new THREE.MeshLambertMaterial({ color: this.rand() < 0.5 ? 0x9a5530 : 0x7b828c }));
      g.scale.set(s, s, s * 1.5); g.position.set(x, y + s * 0.3, z); g.rotation.y = this.rand() * 3;
      g.castShadow = true; this.root.add(g);
      this.spinners.push({ mesh: g, axis: 'z', speed: (this.rand() - 0.5) * 0.8 });
      this._occupy(x, z, s / 2);
    }
    // 크레인
    for (let i = 0; i < 9; i++) {
      const a = this.rand() * 6.28, r = R(120, 400), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 6)) continue;
      const y = terrainHeight(x, z), H = R(26, 36);
      this.put(BASE.box, 0xffc233, x, y + H / 2, z, 1.6, H, 1.6);
      this.put(BASE.box, 0xffc233, x + 8, y + H, z, 22, 1.2, 1.2);
      this.put(BASE.box, 0x3a4048, x - 3, y + H - 1, z, 3, 2, 2.4);
      this.put(BASE.cyl6, 0x222222, x + 16, y + H - 6, z, 0.1, 12, 0.1);
      this.put(BASE.box, 0x6d737c, x + 16, y + H - 12.5, z, 3, 1.4, 3);
      this.put(BASE.sph, 0xff3020, x, y + H + 1, z, 0.5, 0.5, 0.5, 0, 0, 0, 'glow');
      this._solid(x, y + H / 2, z, 1.6, H, 1.6);
    }
    // 몬스터: 녹슨 탱크 + 딱정벌레
    for (let i = 0; i < 78; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 440;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 3 === 0 ? 'beetle' : 'tank' });
    }
    // 퀘스트 캠프 (중앙 광장)
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * 16, 0, Z.z + Math.sin(a) * 14), type: i % 4 === 3 ? 'beetle' : 'tank', tag: 'big' });
    }
    this._ringCircle(Z.x, Z.z, 18, 16);
    this._addCheckpoint(Z.x + 25, Z.z - 25);
  }
  _beltMat() {
    if (!this._belt) {
      const tex = canvasTex(64, 64, (g) => { g.fillStyle = '#25282c'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffc233'; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(16, 8 + i * 32); g.lineTo(48, 8 + i * 32); g.lineTo(32, 26 + i * 32); g.fill(); } });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 6);
      this._belt = new THREE.MeshBasicMaterial({ map: tex });
    }
    return this._belt;
  }
  _saw(x, z, yaw, len) {
    const y = terrainHeight(x, z);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.put(BASE.box, 0x2c3036, x, y + 0.15, z, 0.8, 0.3, len + 2, yaw);
    this.put(BASE.box, 0xffc233, x, y + 0.32, z, 0.3, 0.05, len + 2, yaw);
    const saw = new THREE.Group();
    const blade = new THREE.Mesh(BASE.gear, new THREE.MeshLambertMaterial({ color: 0xd8dde3, emissive: 0x222222 }));
    blade.scale.set(2.6, 2.6, 0.6);
    saw.add(blade);
    saw.position.set(x, y + 1.1, z); saw.rotation.y = yaw + Math.PI / 2;
    saw.traverse((o) => (o.castShadow = true));
    this.root.add(saw);
    this.hazards.push({ kind: 'saw', mesh: saw, blade, center: new THREE.Vector3(x, y + 1.1, z), dir, len, radius: 1.4, pos: saw.position, phase: this.rand() * 6 });
    this.warningSign(x + dir.z * 3, z - dir.x * 3, yaw);
    this._occupy(x, z, len / 2 + 1);
  }
  // 움직이는 발판 (a ↔ b)
  _mover(a, b, sx, sy, sz, period, color = 0x8a6a48, topColor = 0xffc233) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color }));
    const top = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.2, 0.2, sz + 0.2), new THREE.MeshLambertMaterial({ color: topColor }));
    top.position.y = sy / 2;
    g.add(body, top); g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.root.add(g);
    const p = { kind: 'box', moving: true, mesh: g, a: new THREE.Vector3(a.x, a.y, a.z), b: new THREE.Vector3(b.x, b.y, b.z), size: new THREE.Vector3(sx, sy, sz), period, phase: this.rand() * 6, min: new THREE.Vector3(), max: new THREE.Vector3(), cur: new THREE.Vector3(), delta: new THREE.Vector3() };
    this._moverPos(p, 0); p.delta.set(0, 0, 0);
    this._register(p);
    this._occupy(a.x, a.z, Math.max(sx, sz)); this._occupy(b.x, b.z, Math.max(sx, sz));
    return p;
  }
  _moverPos(p, time) {
    const t = 0.5 - 0.5 * Math.cos((time / p.period) * Math.PI * 2 + p.phase);
    const old = p.cur.clone();
    p.cur.copy(p.a).lerp(p.b, t);
    p.delta.copy(p.cur).sub(old);
    p.mesh.position.copy(p.cur).add(new THREE.Vector3(0, -p.size.y / 2, 0));
    p.min.set(p.cur.x - p.size.x / 2, p.cur.y - p.size.y, p.cur.z - p.size.z / 2);
    p.max.set(p.cur.x + p.size.x / 2, p.cur.y + 0.05, p.cur.z + p.size.z / 2);
  }
  // 회전 원판
  _disc(x, y, z, radius, angVel, color = 0x9a5530) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(BASE.gear, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(radius * 2.1, radius * 2.1, 6); m.rotation.x = -Math.PI / 2; m.position.y = -0.36;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, 0.1, 0.8), new THREE.MeshLambertMaterial({ color: 0xffc233 }));
    stripe.position.y = 0.02;
    g.add(m, stripe);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1, 8), new THREE.MeshLambertMaterial({ color: 0x50565f }));
    const gy = terrainHeight(x, z);
    pole.scale.y = y - gy; pole.position.set(x, (y + gy) / 2 - 0.4, z);
    this.root.add(pole);
    g.position.set(x, y, z);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.root.add(g);
    const p = { kind: 'disc', moving: true, mesh: g, center: new THREE.Vector3(x, y, z), radius, top: y + 0.05, angVel, dAng: 0, min: new THREE.Vector3(), max: new THREE.Vector3(), delta: new THREE.Vector3() };
    this._register(p);
    this._occupy(x, z, radius + 1);
    return p;
  }

  _zoneSwamp() {
    const Z = ZONES.swamp, R = (a, b) => a + this.rand() * (b - a);
    for (let i = 0; i < 2100; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 600, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 2)) continue;
      const k = this.rand();
      if (k < 0.45) this._plantTree('mush', x, z, R(0.8, 2.2));
      else if (k < 0.6) this._plantTree('metal', x, z, R(0.8, 1.2));
      else if (k < 0.85) this._plantTree('flower', x, z, R(1, 1.6));
      else this._plantTree('rock', x, z, R(0.6, 1.6));
    }
    // 연잎 발판 (물 위에서 둥실)
    for (let i = 0; i < 120; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 520, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (terrainHeight(x, z) > -0.8 || !this._free(x, z, 3)) continue;
      const p = this._mover({ x, y: 0.15, z }, { x, y: 0.5, z }, 3.4, 0.4, 3.4, R(2.5, 4), 0x2f8a3a, 0x58c84a);
      this._ringCircle(x, z, 0.1, 1, 1.4, 0.5);
    }
    // 독버섯 거인 버섯 + 빛나는 포자
    for (let i = 0; i < 36; i++) {
      const a = this.rand() * 6.28, r = R(60, 500), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 7)) continue;
      const y = terrainHeight(x, z), H = R(10, 18), cr = R(12, 18);
      this.put(BASE.cyl, 0xefe2d0, x, y + H / 2, z, 2.2, H, 2.2);
      this.put(BASE.hemi, this.T.caps[i % 3], x, y + H - 0.5, z, cr * 2, cr, cr * 2);
      for (let k = 0; k < 6; k++) this.put(BASE.sph, 0xffffff, x + Math.cos(k) * cr * 0.6, y + H + cr * 0.3, z + Math.sin(k) * cr * 0.6, 0.9, 0.5, 0.9);
      this._solid(x, y + H / 2, z, 2.2, H, 2.2);
      this._register({ kind: 'disc', center: new THREE.Vector3(x, 0, z), radius: cr * 0.95, top: y + H - 0.5 + cr * 0.45, min: new THREE.Vector3(x - cr, 0, z - cr), max: new THREE.Vector3(x + cr, y + H + cr, z + cr) });
      this._ringCircle(x, z, cr * 0.5, 6, 1.2, y + H - 0.5 + cr * 0.45);
      if (i % 3 === 0) this._addSpring(x + cr + 2, z, 34);
    }
    // 비밀 장소: 바위벽으로 둘러싸인 빛나는 숲 (부서지는 벽 또는 스프링으로 넘어가기)
    const sx = Z.x - 80, sz = Z.z + 60, sy = terrainHeight(sx, sz);
    const wallH = 9;
    for (const [ox, oz, w, d] of [[0, -14, 30, 2], [0, 14, 30, 2], [-14, 0, 2, 30], [14, 0, 2, 30]]) {
      if (ox === 14) { // 이쪽 벽에 부서지는 문
        this.put(BASE.box, 0x6d6a62, sx + ox, sy + wallH / 2, sz - 9, d, wallH, 12);
        this._solid(sx + ox, sy + wallH / 2, sz - 9, d, wallH, 12);
        this.put(BASE.box, 0x6d6a62, sx + ox, sy + wallH / 2, sz + 9, d, wallH, 12);
        this._solid(sx + ox, sy + wallH / 2, sz + 9, d, wallH, 12);
        this._wallPiece(sx + ox, sy, sz, 2, wallH, 6.2);
        continue;
      }
      this.put(BASE.box, 0x6d6a62, sx + ox, sy + wallH / 2, sz + oz, w, wallH, d);
      this._solid(sx + ox, sy + wallH / 2, sz + oz, w, wallH, d);
    }
    this._addSpring(sx - 19, sz, 30);
    this.secret = { pos: new THREE.Vector3(sx, sy, sz), found: false };
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xff66ff, toneMapped: false }));
    gem.position.set(sx, sy + 2, sz);
    this.root.add(gem); this.secret.mesh = gem;
    this._ringCircle(sx, sz, 6, 12);
    for (let k = 0; k < 8; k++) this.trees.mush.add(sx + Math.cos(k) * 10, sy, sz + Math.sin(k) * 10, 0.8, k, k / 8);
    this._occupy(sx, sz, 16);
    // 몬스터: 보라 말벌
    for (let i = 0; i < 84; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 520;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 4 === 0 ? 'beetle' : 'wasp' });
    }
    this._addCheckpoint(Z.x + 40, Z.z + 40);
  }

  _zoneMesa() {
    const Z = ZONES.mesa, R = (a, b) => a + this.rand() * (b - a);
    for (let i = 0; i < 2700; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 600, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 1.5)) continue;
      const k = this.rand();
      if (k < 0.5) this._plantTree('pine', x, z, R(0.7, 1.4));
      else if (k < 0.75) this._plantTree('rock', x, z, R(0.6, 2.2));
      else this._plantTree('bush', x, z, R(0.5, 0.9));
    }
    // 절벽 아래 스프링 (협곡 위로 올라가는 길)
    let springs = 0;
    for (let i = 0; i < 600 && springs < 50; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 520, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      let up = 0;
      for (let k = 0; k < 4; k++) { const b = k * Math.PI / 2; up = Math.max(up, terrainHeight(x + Math.cos(b) * 6, z + Math.sin(b) * 6) - h); }
      if (up > 6 && this._free(x, z, 3)) { this._addSpring(x, z, 30); springs++; }
    }
    // 협곡을 건너는 움직이는 발판, 회전 톱니 원판
    for (let i = 0; i < 24; i++) {
      const a = this.rand() * 6.28, r = R(80, 480), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 14)) continue;
      const y = terrainHeight(x, z) + R(4, 10), d = R(10, 18), ang = this.rand() * 3;
      this._mover({ x: x - Math.cos(ang) * d, y, z: z - Math.sin(ang) * d }, { x: x + Math.cos(ang) * d, y, z: z + Math.sin(ang) * d }, 5, 0.8, 5, R(4, 7));
      this._ringLine(new THREE.Vector3(x - Math.cos(ang) * d, y + 0.5, z - Math.sin(ang) * d), new THREE.Vector3(x + Math.cos(ang) * d, y + 0.5, z + Math.sin(ang) * d), 7, 1.4);
      this._addSpring(x - Math.cos(ang) * (d + 6), z - Math.sin(ang) * (d + 6), 24);
    }
    for (let i = 0; i < 15; i++) {
      const a = this.rand() * 6.28, r = R(80, 480), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 10)) continue;
      const y = terrainHeight(x, z) + R(3, 6);
      this._disc(x, y, z, R(6, 8), (this.rand() < 0.5 ? -1 : 1) * R(0.5, 0.9));
      this._ringCircle(x, z, 4, 8, 1.2, y);
      this._addSpring(x + 10, z, 24);
    }
    // 하늘 발판 탑 (퀘스트: 큰 별)
    const tx = Z.x + 60, tz = Z.z - 70;
    const gh = terrainHeight(tx, tz);
    this._occupy(tx + 15, tz + 15, 30);
    this._addSpring(tx, tz, CFG.spring.power, gh);
    const plats = [[tx + 6, gh + 8, tz + 5, 7, 1.5, 7], [tx + 13, gh + 12, tz + 11, 6, 1.5, 6], [tx + 20, gh + 16, tz + 17, 6, 1.5, 6], [tx + 29, gh + 20, tz + 23, 9, 1.5, 9]];
    plats.forEach((p, i) => {
      this._addPlatform(...p, 0xb07a48, this.T.grassA);
      if (i < 3) this._addSpring(p[0], p[2], 22, p[1] + 0.75);
      else this.questTargets.bigStar = new THREE.Vector3(p[0], p[1] + 2.5, p[2]);
      this._ringCircle(p[0], p[2], 2.2, 6, 1.2, p[1] + 0.8);
    });
    this._addCheckpoint(plats[3][0] + 3, plats[3][2] + 3, plats[3][1] + 0.8);
    // 몬스터: 개구리 로봇
    for (let i = 0; i < 78; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 520;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 4 === 0 ? 'beetle' : 'hopper' });
    }
    this._addCheckpoint(Z.x - 30, Z.z - 50);
  }

  _zoneLake() {
    const Z = ZONES.lake, R = (a, b) => a + this.rand() * (b - a);
    for (let i = 0; i < 1800; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 600, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.2 || !this._free(x, z, 1.5)) continue;
      const k = this.rand();
      if (k < 0.45) this._plantTree('round', x, z, R(0.8, 1.3));
      else if (k < 0.7) this._plantTree('bush', x, z, R(0.6, 1));
      else this._plantTree('flower', x, z, 1.3);
    }
    // 물 위를 달리는 링 길
    for (let i = 0; i < 30; i++) {
      const a = this.rand() * 6.28, r = R(40, 320), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const a2 = this.rand() * 6.28;
      this._ringLine(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + Math.cos(a2) * 40, 0, z + Math.sin(a2) * 40), 8, 1.2);
    }
    // 부두 (나무 다리)
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + 0.3, r = Z.r * 0.62;
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const len = 30, dx = -Math.cos(a), dz = -Math.sin(a);
      for (let k = 0; k < 10; k++) {
        const px = x + dx * k * 3, pz = z + dz * k * 3;
        this.put(BASE.box, 0xb08050, px, 0.9, pz, 3.2, 0.3, 3.2, Math.atan2(dx, dz));
        this.put(BASE.cyl6, 0x6b4423, px + dz * 1.4, 0, pz - dx * 1.4, 0.3, 3, 0.3);
        this.put(BASE.cyl6, 0x6b4423, px - dz * 1.4, 0, pz + dx * 1.4, 0.3, 3, 0.3);
        this._solid(px, 0.7, pz, 3, 0.4, 3);
      }
      this.barrel(x + dx * 27 + dz * 1, z + dz * 27 - dx * 1, 0x2a6fd0);
      this._ringLine(new THREE.Vector3(x, null, z), new THREE.Vector3(x + dx * len, null, z + dz * len), 7);
    }
    // 등대 섬
    const lx = Z.x, lz = Z.z, ly = Math.max(1, terrainHeight(lx, lz));
    this.put(BASE.cyl, 0xe8d9b0, lx, ly + 2, lz, 22, 4, 22);
    this._register({ kind: 'disc', center: new THREE.Vector3(lx, 0, lz), radius: 11, top: ly + 4, min: new THREE.Vector3(lx - 11, 0, lz - 11), max: new THREE.Vector3(lx + 11, ly + 4, lz + 11) });
    for (let i = 0; i < 18; i++) this.put(BASE.cyl, i % 2 ? 0xffffff : 0xd83a2a, lx, ly + 4 + 2.5 * (i + 0.5), lz, 4 - i * 0.25, 2.5, 4 - i * 0.25);
    this.put(BASE.cyl, 0xfff3a0, lx, ly + 20, lz, 2.8, 2, 2.8, 0, 0, 0, 'glow');
    this.put(BASE.cone, 0xd83a2a, lx, ly + 22.5, lz, 3.6, 3, 3.6);
    this._solid(lx, ly + 12, lz, 3.6, 16, 3.6);
    this._addCheckpoint(lx + 7, lz);
    this._addSpring(lx - 7, lz, 30, ly + 4);
    for (let i = 0; i < 72; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 520;
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type: terrainHeight(x, z) < 0 ? 'wasp' : (i % 2 ? 'hopper' : 'beetle') });
    }
  }

  // 카메라가 뒤에 있으면 반투명해지는 벽 (건물 안에서 캐릭터가 잘 보이게)
  _fadeBox(cx, cy, cz, sx, sy, sz, color, solid = true) {
    const mesh = new THREE.Mesh(BASE.box, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 }));
    mesh.position.set(cx, cy, cz); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = !this.q.mobile; mesh.receiveShadow = true;
    this.root.add(mesh);
    const box = { min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2), fade: mesh };
    if (solid) Object.assign(box, this._solid(cx, cy, cz, sx, sy, sz, { fade: mesh }));
    this.fadeBoxes.push(box);
    return box;
  }

  // ---------- 연못: 물가 나무 발판, 수련잎, 물속 링 ----------
  _ponds() {
    for (const P of PONDS) {
      this._ringCircle(P.x, P.z, P.r * 0.25, 8, 0, -P.d * 0.6);      // 잠수해야 먹을 수 있는 링
      for (let i = 0; i < 10; i++) {                                     // 수련잎
        const a = this.rand() * 6.28, r = P.r * (0.45 + this.rand() * 0.4);
        this.put(BASE.cyl, 0x4f9a3a, P.x + Math.cos(a) * r, 0.03, P.z + Math.sin(a) * r, 1.4 + this.rand(), 0.05, 1.4 + this.rand());
        if (this.rand() < 0.3) this.put(BASE.sph, 0xffb3d9, P.x + Math.cos(a) * r, 0.25, P.z + Math.sin(a) * r, 0.35, 0.25, 0.35);
      }
      if (P.pier) { // 물로 뛰어들 수 있는 나무 발판
        const len = P.r * 0.55, x0 = P.x + P.r * 1.05, y = 0.9;
        this.put(BASE.box, 0xa8744a, x0 - len / 2, y, P.z, len, 0.35, 3.2);
        for (let k = 0; k <= len; k += 4) for (const sz of [-1, 1]) this.put(BASE.box, 0x6b4423, x0 - k, y - 2, P.z + sz * 1.4, 0.35, 4.5, 0.35);
        this._solid(x0 - len / 2, y, P.z, len, 0.35, 3.2);
        this._addSpring(x0 - len + 1.5, P.z, 30, y + 0.2);
      }
      if (P.falls) this._waterfall(P);
    }
  }
  _waterfall(P) {
    const x = P.x - P.r - 9, z = P.z;
    const topY = terrainHeight(x - 22, z) + 2;
    const lm0 = this.lm; this.lm = true;
    this.put(BASE.box, 0x8f8b80, x - 6, topY / 2 - 2, z, 14, topY + 4, 36);
    this.put(BASE.box, 0x7d796f, x - 4, topY * 0.7, z - 12, 10, topY * 0.6, 8, 0.2);
    this.put(BASE.box, 0x9a968a, x - 4, topY * 0.55, z + 13, 9, topY * 0.5, 8, -0.15);
    this.put(BASE.box, 0x6fc0ff, x - 14, topY - 1.6, z, 18, 0.3, 9, 0, 0, 0, 'glow'); // 위쪽 물줄기
    this.lm = lm0;
    this._solid(x - 6, topY / 2 - 2, z, 14, topY + 4, 36);
    // 흐르는 폭포 (텍스처가 아래로 흘러감)
    const tex = canvasTex(64, 256, (g) => {
      g.fillStyle = '#9fdcff'; g.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 50); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.88, toneMapped: false });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, topY + 0.5), mat);
    fall.position.set(x + 1.2, topY / 2 - 0.2, z); fall.rotation.y = Math.PI / 2;
    this.root.add(fall);
    for (let i = 0; i < 9; i++) this.put(BASE.sph, 0xffffff, x + 2 + this.rand() * 4, 0.2, z + (this.rand() - 0.5) * 9, 1.4 + this.rand(), 0.6, 1.4 + this.rand());
    this.waterfalls.push({ mat, pos: new THREE.Vector3(x + 3, 0.5, z) });
    this._chest(x - 8, z + 6, topY, '비밀 폭포');
    this._addSpring(x + 4, z + 14, 44, terrainHeight(x + 4, z + 14));
    this.discoveries.push({ name: '비밀 폭포', pos: new THREE.Vector3(P.x, 0, P.z), r: P.r + 15 });
  }

  // ---------- 나무집 (파워형·슈퍼면 부술 수 있음) ----------
  _house(x, z, yaw, w, d, opts = {}) {
    if (this.mode === 'lava') return null; // 용암 섬에는 집이 없음
    if (this.mode === 'ice') opts = { roof: 0xf2f7ff, ...opts };                 // 지붕에 눈이 소복
    if (this.mode === 'sky') opts = { wall: [0x9aa6b4, 0x8a94a3, 0xb0bac6][Math.floor(this.rand() * 3)], roof: [0x4fd8ff, 0x3a6fd0, 0xffc233][Math.floor(this.rand() * 3)], ...opts };
    if (!this.houseMat) {
      this.houseMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const pr = new THREE.CylinderGeometry(1, 1, 1, 3); pr.rotateZ(-Math.PI / 2); pr.rotateX(-Math.PI / 2); pr.translate(0, 0.5, 0); pr.scale(1, 1 / 1.5, 1 / 1.732);
      this.prismGeo = pr;
    }
    const pick = (arr) => arr[Math.floor(this.rand() * arr.length)];
    const wallC = opts.wall ?? pick([0xc8935a, 0xb98250, 0xd9b07a, 0xa8744a, 0xe0c090]);
    const roofC = opts.roof ?? pick([0xc0452c, 0x8a3a2a, 0x3f7a4a, 0x4a6fa8, 0x7a5a3a, 0xd0703a]);
    const wallH = opts.h ?? 4.2, roofH = Math.min(w, d) * 0.45;
    const parts = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), C = new THREE.Color();
    const add = (geo, color, px, py, pz, sx, sy, sz, rx = 0) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(M.compose(new THREE.Vector3(px, py, pz), Q.setFromEuler(E.set(rx, 0, 0)), new THREE.Vector3(sx, sy, sz)));
      const n = g.attributes.position.count, arr = new Float32Array(n * 3); C.set(color);
      for (let i = 0; i < n; i++) { arr[i * 3] = C.r; arr[i * 3 + 1] = C.g; arr[i * 3 + 2] = C.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(g);
    };
    const B = BASE.box, base = 0.5;
    add(B, 0x8a8580, 0, -0.6, 0, w + 0.5, 2.3, d + 0.5);                       // 돌 기초
    add(B, wallC, 0, base + wallH / 2, 0, w, wallH, d);                        // 벽
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(B, 0x6b4423, sx * w / 2, base + wallH / 2, sz * d / 2, 0.45, wallH, 0.45);
    add(B, 0x6b4423, 0, base + wallH - 0.15, 0, w + 0.1, 0.3, d + 0.1);        // 들보
    add(this.prismGeo, wallC, 0, base + wallH, 0, w, roofH, d);                // 박공
    const L = Math.hypot(d / 2 + 0.5, roofH), a = Math.atan2(roofH, d / 2);
    for (const sz of [-1, 1]) add(B, roofC, 0, base + wallH + roofH / 2 + 0.2, sz * d / 4, w + 0.9, 0.35, L + 0.5, sz * a);
    add(B, 0x5a3820, 0, base + 1.1, d / 2 + 0.04, 1.4, 2.2, 0.12);           // 문
    add(B, 0xffd23a, 0.45, base + 1.1, d / 2 + 0.12, 0.15, 0.15, 0.1);
    if (w > 6) for (const sx of [-1, 1]) add(B, 0xfff0b0, sx * w / 4 + sx * 0.4, base + 2.6, d / 2 + 0.04, 1.1, 1.0, 0.12);
    for (const sx of [-1, 1]) add(B, 0xfff0b0, sx * (w / 2 + 0.04), base + 2.6, 0, 0.12, 1.0, 1.2);
    add(B, 0x8a6a5a, w * 0.25, base + wallH + roofH * 0.55, -d * 0.18, 0.8, roofH + 1.2, 0.8); // 굴뚝
    if (this.mode === 'ice') { // 지붕 꼭대기와 굴뚝 위의 눈, 처마 고드름
      add(B, 0xffffff, 0, base + wallH + roofH + 0.35, 0, w + 1.1, 0.5, 1.2);
      add(B, 0xffffff, w * 0.25, base + wallH + roofH * 1.1 + 0.75, -d * 0.18, 1.0, 0.35, 1.0);
      for (let k = -2; k <= 2; k++) for (const sz of [-1, 1]) add(BASE.cone4, 0xd8f0ff, k * w / 5, base + wallH - 0.3, sz * (d / 2 + 0.45), 0.18, 0.7, 0.18, Math.PI);
    }
    const geo = mergeGeometries(parts); parts.forEach((g) => g.dispose());
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    let y = -Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) y = Math.max(y, terrainHeight(x + lx * c + lz * sn, z - lx * sn + lz * c));
    const mesh = new THREE.Mesh(geo, this.houseMat);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    mesh.castShadow = !this.q.mobile; mesh.receiveShadow = true;
    this.root.add(mesh);
    const along = Math.abs(c) > 0.5, sw = along ? w : d, sd = along ? d : w, Hc = base + wallH + roofH * 0.55 + 0.6;
    const box = this._solid(x, y - 0.6 + Hc / 2, z, sw + 0.3, Hc, sd + 0.3, { breakable: true, house: true, mesh, roofColor: roofC });
    this.walls.push(box); this.houses.push(box);
    return box;
  }
  _lantern(x, z) {
    if (this.noLife) return;
    const y = terrainHeight(x, z);
    this.put(BASE.cyl6, 0x5a3820, x, y + 1.5, z, 0.18, 3, 0.18);
    this.put(BASE.box, 0x3a2a1a, x, y + 3.15, z, 0.6, 0.12, 0.6);
    this.put(BASE.sph, 0xffcf6a, x, y + 2.8, z, 0.32, 0.4, 0.32, 0, 0, 0, 'glow');
  }
  // ---------- 숲속 마을 ----------
  _villages() {
    const NM = { forest: ['도토리 마을', '버섯지붕 마을', '호숫가 마을', '소나무 마을'], ice: ['눈사람 마을', '고드름 마을', '얼음호수 마을', '눈꽃 마을'],
      lava: ['현무암 야영지', '불씨 야영지', '유황 야영지', '흑요석 야영지'], sky: ['구름다리 마을', '프로펠러 마을', '안테나 마을', '별빛 마을'] }[this.mode] || [];
    const list = [
      { x: -120, z: 380, name: NM[0], n: 7 },
      { x: 450, z: 450, name: NM[1], n: 8 },
      { x: -470, z: -40, name: NM[2], n: 6 },
      { x: 60, z: -420, name: NM[3], n: 7 },
    ];
    for (const V of list) {
      const y0 = terrainHeight(V.x, V.z);
      this.discoveries.push({ name: V.name, pos: new THREE.Vector3(V.x, y0, V.z), r: 42 });
      // 광장 우물
      this.put(BASE.cyl, 0x9a968a, V.x, y0 + 0.5, V.z, 3, 1.2, 3);
      this.put(BASE.cyl, 0x3a6fb0, V.x, y0 + 1.05, V.z, 2.4, 0.1, 2.4);
      for (const s of [-1, 1]) this.put(BASE.box, 0x6b4423, V.x + s * 1.3, y0 + 2, V.z, 0.25, 3, 0.25);
      this.put(BASE.box, 0xc0452c, V.x, y0 + 3.6, V.z, 3.6, 0.3, 2.4);
      this._solid(V.x, y0 + 0.6, V.z, 2.6, 1.2, 2.6);
      this._ringCircle(V.x, V.z, 7, 10);
      this._chest(V.x + 4, V.z - 3, null, V.name);
      for (let i = 0; i < V.n; i++) {
        const a = (i + 0.5) / V.n * Math.PI * 2 + 0.3, R = 21 + this.rand() * 6;
        const hx = V.x + Math.cos(a) * R, hz = V.z + Math.sin(a) * R;
        const yaw = Math.round(Math.atan2(V.x - hx, V.z - hz) / (Math.PI / 2)) * (Math.PI / 2);
        const w = 6 + this.rand() * 3.5, d = 5.5 + this.rand() * 2.5;
        this._house(hx, hz, yaw, w, d, i === 0 ? { h: 6.5 } : {});
        for (let k = 0; k < 5; k++) this.trees.flower.add(hx + (this.rand() - 0.5) * (w + 4), terrainHeight(hx, hz), hz + (this.rand() - 0.5) * (d + 4), 1.3, 0, this.rand());
        const la = a + Math.PI / V.n;
        this._lantern(V.x + Math.cos(la) * 13, V.z + Math.sin(la) * 13);
      }
      // 울타리
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * Math.PI * 2; if (i % 10 === 0) continue;
        const fx = V.x + Math.cos(a) * 36, fz = V.z + Math.sin(a) * 36, fy = terrainHeight(fx, fz);
        this.put(BASE.box, 0x8b5a2b, fx, fy + 0.7, fz, 0.25, 1.4, 0.25);
        this.put(BASE.box, 0xa8744a, fx, fy + 1.0, fz, 0.15, 0.18, 5.8, -a);
      }
      this._addCheckpoint(V.x - 6, V.z + 4);
      for (let k = 0; k < 4; k++) this.enemySpots.push({ pos: new THREE.Vector3(V.x + (this.rand() - 0.5) * 60, 0, V.z + (this.rand() - 0.5) * 60), type: 'beetle' });
      this._occupy(V.x, V.z, 36);
    }
    // 숲 곳곳의 외딴 오두막
    let n = 0;
    for (let i = 0; i < 400 && n < 18; i++) {
      const a = this.rand() * 6.28, r = 150 + this.rand() * 1350, x = Math.cos(a) * r, z = Math.sin(a) * r;
      zoneWeights(x, z); if (Math.max(ZW[0], ZW[1], ZW[2], ZW[3]) > 0.2) continue;
      if (!this._free(x, z, 9) || terrainHeight(x, z) < 1) continue;
      this._house(x, z, Math.floor(this.rand() * 4) * Math.PI / 2, 5.5 + this.rand() * 2, 5 + this.rand() * 2);
      this._lantern(x + 5, z + 5);
      n++;
    }
  }

  // ---------- 보물 상자 ----------
  _chest(x, z, y, name) {
    if (!this.chestMats) this.chestMats = { wood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), gold: new THREE.MeshLambertMaterial({ color: 0xffc233, emissive: 0x5a3a00 }) };
    const M = this.chestMats;
    y = y ?? terrainHeight(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(BASE.box, M.wood); body.scale.set(1.5, 0.9, 1); body.position.y = 0.45; g.add(body);
    const band = new THREE.Mesh(BASE.box, M.gold); band.scale.set(1.55, 0.18, 1.05); band.position.y = 0.75; g.add(band);
    const lid = new THREE.Group(); lid.position.set(0, 0.9, -0.5); g.add(lid);
    const top = new THREE.Mesh(BASE.box, M.wood); top.scale.set(1.5, 0.4, 1); top.position.set(0, 0.2, 0.5); lid.add(top);
    const lock = new THREE.Mesh(BASE.box, M.gold); lock.scale.set(0.3, 0.35, 0.1); lock.position.set(0, 0.05, 1.02); lid.add(lock);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, y, z); g.rotation.y = this.rand() * 6.28;
    this.root.add(g);
    this.chests.push({ pos: new THREE.Vector3(x, y, z), group: g, lid, opened: false, name });
    this._occupy(x, z, 2);
  }

  // ---------- 가보고 싶은 장소들 (멀리서도 보이고, 가면 보물 상자) ----------
  _discoveries() {
    const lm0 = this.lm; this.lm = true;
    // 1) 산꼭대기 빛의 제단: 하늘로 빛기둥이 솟아서 멀리서도 보임
    const beamMatBase = { transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide };
    MOUNTAINS.forEach((M, i) => {
      const top = terrainHeight(M.x, M.z);
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2, px = M.x + Math.cos(a) * 15, pz = M.z + Math.sin(a) * 15, py = terrainHeight(px, pz);
        const hh = 3 + ((k * 37) % 5);
        this.put(BASE.cyl, 0xd8d2c0, px, py + hh / 2, pz, 1.3, hh, 1.3);
        if (k % 2 === 0) this.put(BASE.box, 0xc8c2b0, px, py + hh + 0.3, pz, 2.4, 0.6, 2.4, a);
      }
      const nm = this.noLife ? `${this.mode === 'lava' ? '화산 봉우리' : '관측 갑판'} ${i + 1}` : `빛의 제단 ${i + 1}`;
      this.put(BASE.box, 0xc8c2b0, M.x, top + 0.6, M.z + 3, 3.6, 1.2, 2.6);
      this._solid(M.x, top + 0.6, M.z + 3, 3.6, 1.2, 2.6);
      this._chest(M.x, M.z + 3, top + 1.2, nm);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.2, 260, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dffe0, ...beamMatBase }));
      mesh.position.set(M.x, top + 130, M.z + 3);
      this.root.add(mesh);
      this.beacons.push({ mesh, phase: i, name: nm });
      this.discoveries.push({ name: nm, pos: new THREE.Vector3(M.x, top, M.z), r: 30 });
    });
    if (this.noLife) { this.lm = lm0; return; }
    // 2) 거인의 돌다리 (노란 협곡 옆)
    {
      const cx = -760, cz = 1150, span = 22;
      let y = 0; for (const sx of [-1, 1]) y = Math.max(y, terrainHeight(cx + sx * span, cz));
      const top = y + 34;
      for (const sx of [-1, 1]) {
        const px = cx + sx * span, gy = terrainHeight(px, cz), hh = top - gy;
        this.put(BASE.box, 0xc98a5a, px, gy + hh / 2, cz, 9, hh, 10, sx * 0.05);
        this.put(BASE.box, 0xb5774a, px + sx * 2, gy + hh * 0.3, cz + 2, 8, hh * 0.6, 9, -sx * 0.1);
        this._solid(px, gy + hh / 2, cz, 9, hh, 10);
        this._addSpring(px - sx * 8, cz, 58, terrainHeight(px - sx * 8, cz));
      }
      this.put(BASE.box, 0xc98a5a, cx, top + 2.5, cz, span * 2 + 9, 5, 10);
      this.put(BASE.box, 0xa86a3a, cx, top + 0.2, cz, span * 2 - 6, 1.2, 9);
      for (const sx of [-1, 1]) this.put(BASE.box, 0xc98a5a, cx + sx * (span - 6), top - 2, cz, 8, 5, 9.5, 0, 0, sx * 0.6);
      this._solid(cx, top + 2.5, cz, span * 2 + 9, 5, 10);
      this._chest(cx, cz, top + 5, '거인의 돌다리');
      this._ringArc(new THREE.Vector3(cx - span, top + 6, cz), new THREE.Vector3(1, 0, 0), span * 2, 6, 10, 0);
      this.discoveries.push({ name: '거인의 돌다리', pos: new THREE.Vector3(cx, y, cz), r: 45 });
      this._occupy(cx, cz, span + 12);
    }
    // 3) 거대 버섯 숲: 버섯 갓을 밟고 하늘 높이
    {
      const cx = 1000, cz = -100, gy0 = terrainHeight(cx, cz);
      const caps = [0xd8392b, 0xe8742a, 0x9a4ad8, 0xd8392b, 0x3a8ad8, 0xe8742a, 0xd8392b];
      let a = 0, lastTop = gy0;
      for (let i = 0; i < 7; i++) {
        const big = i === 6, rr = big ? 0 : 12 + (i % 2) * 7, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const gy = terrainHeight(x, z), top = gy0 + 6 + i * 5.2 + (big ? 2 : 0), r = big ? 9 : 4.5 + (i % 3);
        this.put(BASE.cyl, 0xf0e6d0, x, (gy + top) / 2, z, big ? 3 : 1.8, top - gy, big ? 3 : 1.8);
        this.put(BASE.hemi, caps[i], x, top - 0.4, z, r * 2, r * 1.1, r * 2);
        for (let k = 0; k < 5; k++) { const b = k / 5 * 6.28 + i; this.put(BASE.sph, 0xfff6e8, x + Math.cos(b) * r * 0.55, top - 0.4 + r * 0.4, z + Math.sin(b) * r * 0.55, r * 0.14, r * 0.08, r * 0.14); }
        this._register({ kind: 'disc', center: new THREE.Vector3(x, 0, z), radius: r * 0.92, top: top, min: new THREE.Vector3(x - r, top - 2, z - r), max: new THREE.Vector3(x + r, top, z + r) });
        this._solid(x, (gy + top) / 2 - 1, z, big ? 3 : 1.8, top - gy - 2, big ? 3 : 1.8);
        this._ringCircle(x, z, r * 0.4, 5, 1.2, top);
        if (big) this._chest(x + 2, z, top, '거대 버섯 숲');
        a += 1.05; lastTop = top;
      }
      this._addSpring(cx + 16, cz - 6, 30);
      for (let i = 0; i < 40; i++) { const b = this.rand() * 6.28, r = 20 + this.rand() * 30; this.trees.mush.add(cx + Math.cos(b) * r, terrainHeight(cx + Math.cos(b) * r, cz + Math.sin(b) * r), cz + Math.sin(b) * r, 0.8 + this.rand() * 1.4, this.rand() * 6, this.rand()); }
      this.discoveries.push({ name: '거대 버섯 숲', pos: new THREE.Vector3(cx, gy0, cz), r: 40 });
      this._occupy(cx, cz, 30);
    }
    // 4) 숲 전망대 (나무 탑)
    {
      const cx = -900, cz = 300, gy = terrainHeight(cx, cz), H = 44;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(BASE.box, 0x7a4a26, cx + sx * 4, gy + H / 2, cz + sz * 4, 0.9, H, 0.9);
      for (let k = 8; k < H; k += 9) for (const s of [-1, 1]) { this.put(BASE.box, 0x8b5a2b, cx + s * 4, gy + k, cz, 0.4, 0.4, 8.5); this.put(BASE.box, 0x8b5a2b, cx, gy + k, cz + s * 4, 8.5, 0.4, 0.4); }
      this._solid(cx, gy + H / 2, cz, 8.8, H - 2, 8.8);
      this._plat(cx, gy + H + 0.6, cz, 13, 13, 0x8b5a2b, 0xa8744a);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(BASE.box, 0x7a4a26, cx + sx * 6, gy + H + 3, cz + sz * 6, 0.5, 5, 0.5);
      this.put(BASE.cone4, 0xc0452c, cx, gy + H + 7.2, cz, 10.5, 4, 10.5, Math.PI / 4);
      let y = gy + 4, a = 0;
      while (y < gy + H - 2) { this._plat(cx + Math.cos(a) * 9.5, y, cz + Math.sin(a) * 9.5, 4, 4, 0x8b5a2b, 0xa8744a); y += 4.6; a += 0.85; }
      this._chest(cx + 3, cz + 3, gy + H + 1.2, '숲 전망대');
      this._addCheckpoint(cx - 3, cz - 3, gy + H + 1.2);
      this.discoveries.push({ name: '숲 전망대', pos: new THREE.Vector3(cx, gy, cz), r: 30 });
      this._occupy(cx, cz, 16);
    }
    // 5) 풍차 언덕 (꽃밭)
    {
      const cx = 150, cz = 1000, gy = terrainHeight(cx, cz);
      this.put(BASE.cyl, 0xe8e0d0, cx, gy + 8, cz, 5, 16, 5);
      this.put(BASE.cone, 0xc0452c, cx, gy + 18, cz, 6, 4.5, 6);
      this.put(BASE.box, 0x5a3820, cx, gy + 1.3, cz + 2.5, 1.6, 2.6, 0.3);
      this._solid(cx, gy + 8, cz, 7, 16, 7);
      const blades = new THREE.Group(), bm = new THREE.MeshLambertMaterial({ color: 0xf4ead8 }), fm = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
        const f = new THREE.Mesh(BASE.box, fm); f.scale.set(0.4, 9, 0.3); f.position.y = 4.5; arm.add(f);
        const sail = new THREE.Mesh(BASE.box, bm); sail.scale.set(2.2, 7, 0.12); sail.position.set(1.3, 5, 0); arm.add(sail);
        blades.add(arm);
      }
      blades.position.set(cx, gy + 14, cz + 3.6);
      blades.traverse((o) => { o.castShadow = true; });
      this.root.add(blades);
      this.spinners.push({ mesh: blades, axis: 'z', speed: 0.8 });
      for (let i = 0; i < 500; i++) { const b = this.rand() * 6.28, r = 8 + Math.sqrt(this.rand()) * 45, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r; this.trees.flower.add(x, terrainHeight(x, z), z, 1.3 + this.rand() * 0.5, 0, this.rand()); }
      this._chest(cx - 4, cz + 4, null, '풍차 언덕');
      this._ringCircle(cx, cz, 20, 16);
      this.discoveries.push({ name: '풍차 언덕', pos: new THREE.Vector3(cx, gy, cz), r: 40 });
      this._occupy(cx, cz, 50);
    }
    // 6) 쓰러진 거인 나무 (통나무 다리)
    {
      const x0 = -555, x1 = -485, cz = -420;
      let y = 0; for (let x = x0; x <= x1; x += 5) y = Math.max(y, terrainHeight(x, cz));
      const ly = y + 3.2, cx = (x0 + x1) / 2, len = x1 - x0;
      this.put(BASE.cyl, 0x6b4a2e, cx, ly, cz, 6.4, len, 6.4, 0, 0, Math.PI / 2);
      this.put(BASE.box, 0x5c8a3a, cx, ly + 3.1, cz, len * 0.8, 0.4, 3.5);
      this.put(BASE.cone, 0x5a3e26, x1 + 3, ly, cz, 9, 6, 9, 0, 0, -Math.PI / 2);
      for (let k = 0; k < 5; k++) this.put(BASE.cyl, 0x6b4a2e, x0 + 8 + k * 12, ly + 3, cz + (k % 2 ? 2.5 : -2.5), 0.8, 5, 0.8, 0, k % 2 ? 0.5 : -0.5);
      this._solid(cx, ly, cz, len, 6.4, 5.6);
      this._ringLine(new THREE.Vector3(x0 + 4, ly + 4.4, cz), new THREE.Vector3(x1 - 4, ly + 4.4, cz), 14, 0);
      this._chest(x1 - 3, cz, ly + 3.2, '쓰러진 거인 나무');
      for (const s of [-1, 1]) this._addSpring(cx + s * 12, cz + 6, 30, terrainHeight(cx + s * 12, cz + 6));
      this.discoveries.push({ name: '쓰러진 거인 나무', pos: new THREE.Vector3(cx, y, cz), r: 45 });
      this._occupy(cx, cz, len / 2 + 6);
    }
    this.lm = lm0;
  }

  // 부서지는 벽 (파워형은 언제나, 나머지는 슈퍼일 때)
  _wallPiece(x, y, z, sx, sy, sz) {
    if (!this._crackTex) this._crackTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#9a8f7a'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; g.fillRect(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 20, 6 + Math.random() * 10); }
      g.strokeStyle = '#3a3226'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 0); g.lineTo(54, 40); g.lineTo(78, 64); g.lineTo(50, 98); g.lineTo(66, 128); g.moveTo(54, 40); g.lineTo(18, 52); g.moveTo(78, 64); g.lineTo(118, 70); g.stroke();
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ map: this._crackTex }));
    mesh.position.set(x, y + sy / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    const p = this._solid(x, y + sy / 2, z, sx, sy, sz, { breakable: true, mesh });
    this.walls.push(p);
    return p;
  }
  _breakableWalls() {
    // 링 보물 창고: 부서지는 벽 안쪽에 링이 가득
    const spots = [[300, 360], [-400, 240], [520, -240], [-240, -520], [80, -660], [-660, 80], [660, 440], [-520, 660], [1100, 300], [-1100, -300], [200, 1300], [-200, -1350], [900, -1100], [-900, 1100]];
    for (const [x, z] of spots) {
      if (!this._free(x, z, 8)) continue;
      const y = terrainHeight(x, z);
      for (const [ox, oz, w, d] of [[0, -5, 10, 1.2], [0, 5, 10, 1.2], [-5, 0, 1.2, 10]]) {
        this.put(BASE.box, 0x7a756b, x + ox, y + 2.5, z + oz, w, 5, d);
        this._solid(x + ox, y + 2.5, z + oz, w, 5, d);
      }
      this.put(BASE.box, 0x7a756b, x, y + 5.2, z, 10.5, 0.6, 10.5);
      this._solid(x, y + 5.2, z, 10.5, 0.6, 10.5);
      this._wallPiece(x + 5, y, z, 1.2, 5, 8.8);
      this._ringCircle(x, z, 2.2, 10);
      this._occupy(x, z, 8);
    }
  }

  // ---------- 기계 장벽 (보스를 이기면 사라짐) ----------
  _barrier() {
    const Rb = CFG.world.barrierR;
    this.barrierGroup = new THREE.Group();
    this.root.add(this.barrierGroup);
    const panelTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#4f5560'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#5c636f'; for (let i = 0; i < 4; i++) g.fillRect(8 + i * 62, 30, 54, 170);
      g.fillStyle = '#3a3f48'; for (let i = 0; i < 4; i++) g.fillRect(8 + i * 62, 30, 54, 6);
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#111' : '#ffc233'; g.beginPath(); g.moveTo(i * 32 - 32, 256); g.lineTo(i * 32, 216); g.lineTo(i * 32 + 32, 216); g.lineTo(i * 32, 256); g.fill(); }
      g.fillStyle = '#ff3020'; g.fillRect(0, 0, 256, 10);
      g.fillStyle = 'rgba(160,80,40,0.5)'; for (let i = 0; i < 12; i++) g.fillRect(Math.random() * 256, 40 + Math.random() * 160, 4, 20 + Math.random() * 40);
      g.fillStyle = '#ddd'; for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(20 + i * 54, 20 + j * 190, 3, 0, 7); g.fill(); }
    });
    const segW = 24, N = Math.ceil(Math.PI * 2 * Rb / segW), H = 22;
    const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(segW + 0.6, H, 2.5), new THREE.MeshLambertMaterial({ map: panelTex }), N);
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 3, 6), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }), N * 4);
    const towers = new THREE.InstancedMesh(new THREE.CylinderGeometry(4, 5, 34, 10), new THREE.MeshLambertMaterial({ color: 0x3a3f48 }), Math.ceil(N / 6));
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(3.6, 12, 8), new THREE.MeshLambertMaterial({ color: 0x5d646e }), Math.ceil(N / 6));
    const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false }), Math.ceil(N / 6) * 2);
    let si = 0, ti = 0, ei = 0;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, x = Math.cos(a) * Rb, z = Math.sin(a) * Rb;
      const y = terrainHeight(x, z) - 2;
      const yaw = -a + Math.PI / 2;
      _m.compose(_p.set(x, y + H / 2, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1));
      panel.setMatrixAt(i, _m);
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * 6;
        _m.compose(_p.set(x - Math.sin(a) * off, y + H + 1.5, z + Math.cos(a) * off), _q.identity(), _s.set(1, 1, 1));
        spikes.setMatrixAt(si++, _m);
      }
      if (i % 6 === 0) {
        _m.compose(_p.set(x * 1.01, y + 17, z * 1.01), _q.identity(), _s.set(1, 1, 1)); towers.setMatrixAt(ti, _m);
        _m.compose(_p.set(x * 1.01, y + 36, z * 1.01), _q.identity(), _s.set(1, 1, 1)); heads.setMatrixAt(ti++, _m);
        for (const s of [-1, 1]) {
          _m.compose(_p.set(x * 1.01 - Math.cos(a) * 3.1 - Math.sin(a) * s * 1.4, y + 36.5, z * 1.01 - Math.sin(a) * 3.1 + Math.cos(a) * s * 1.4), _q.identity(), _s.set(1, 1, 1));
          eyes.setMatrixAt(ei++, _m);
        }
        if (ti % 2 === 0) {
          const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
          beam.geometry.translate(0, -35, 0);
          const pivot = new THREE.Group(); pivot.position.set(x * 0.995, y + 36, z * 0.995);
          pivot.add(beam); beam.rotation.x = Math.PI / 2 + 0.5;
          this.barrierGroup.add(pivot);
          this.searchlights.push({ pivot, base: -a - Math.PI / 2, phase: this.rand() * 6 });
        }
      }
    }
    for (const m of [panel, spikes, towers, heads, eyes]) { m.count = Math.min(m.count, m === spikes ? si : m === eyes ? ei : m === panel ? N : ti); m.instanceMatrix.needsUpdate = true; m.castShadow = m !== eyes; this.barrierGroup.add(m); }
  }

  // 장벽 너머: 계속 이어지는 숲과 산, 그리고 숲을 포위한 거대 기계들
  _outside() {
    const Rb = CFG.world.barrierR;
    this.outsideGroup = new THREE.Group(); this.root.add(this.outsideGroup);
    for (let i = 0; i < 2600; i++) {
      const a = this.rand() * Math.PI * 2, r = Rb + 10 + Math.pow(this.rand(), 0.8) * 520;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > 140) continue;
      const k = this.rand();
      const type = h > 50 ? 'pine' : k < 0.6 ? 'round' : 'pine';
      this.trees[type].add(x, h - 0.2, z, 1 + this.rand() * 0.9, this.rand() * 6, this.rand());
    }
    // 거대 기계 (포위군)
    const mats = { body: new THREE.MeshLambertMaterial({ color: this.T.villainMetal }), dark: new THREE.MeshLambertMaterial({ color: 0x2c3036 }), stripe: new THREE.MeshLambertMaterial({ color: 0xffc233 }), eye: new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false }) };
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + this.rand() * 0.2, r = Rb + 70 + this.rand() * 90;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrainHeight(x, z);
      const g = new THREE.Group();
      if (i % 2 === 0) { // 거대 로봇 보초
        const S = 2.4 + this.rand();
        const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px * S, py * S, pz * S); m.scale.set(sx * S, sy * S, sz * S); m.castShadow = true; g.add(m); return m; };
        add(BASE.box, mats.body, 0, 14, 0, 9, 9, 6);
        add(BASE.box, mats.stripe, 0, 10, 3.05, 9, 1, 0.1);
        add(BASE.sph, mats.body, 0, 21, 0, 6, 5, 5);
        add(BASE.box, mats.eye, 0, 21.5, 2.4, 4, 0.8, 0.4);
        for (const s of [-1, 1]) {
          add(BASE.box, mats.dark, s * 2.5, 5, 0, 2.6, 10, 2.6);
          add(BASE.box, mats.dark, s * 6, 13, 0, 2.2, 9, 2.2);
          add(BASE.cyl, mats.body, s * 6, 7.5, 0, 3, 2.5, 3);
        }
      } else { // 드릴 기지 + 굴뚝
        const S = 1.6;
        const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px * S, py * S, pz * S); m.scale.set(sx * S, sy * S, sz * S); m.castShadow = true; g.add(m); return m; };
        add(BASE.box, mats.body, 0, 5, 0, 18, 10, 14);
        add(BASE.box, mats.stripe, 0, 1, 7.05, 18, 1.2, 0.1);
        add(BASE.cyl, mats.dark, 5, 16, 0, 3, 22, 3);
        add(BASE.cyl, mats.dark, -5, 14, 2, 2.4, 18, 2.4);
        add(BASE.box, mats.eye, 0, 8, 7.1, 10, 1, 0.2);
        this.smokeEmitters.push({ pos: new THREE.Vector3(x + 5 * S * Math.cos(-a), y + 27 * S, z + 5 * S * Math.sin(-a)), rate: 2.2, dark: true, barrier: true });
        this.smokeEmitters.push({ pos: new THREE.Vector3(x, y + 24 * S, z), rate: 1.6, dark: true, barrier: true });
      }
      g.position.set(x, y - 1, z);
      g.rotation.y = -a - Math.PI / 2;
      this.barrierGroup.add(g);
    }
  }

  _fieldFill() {
    const RR = CFG.world.barrierR - 40;
    for (let i = 0; i < 110; i++) { // 스프링 + 위쪽 링
      const a = this.rand() * 6.28, r = 60 + Math.sqrt(this.rand()) * RR, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 3)) continue;
      this._addSpring(x, z, 30);
      const h = terrainHeight(x, z);
      this._ringLine(new THREE.Vector3(x, h + 8, z), new THREE.Vector3(x, h + 34, z), 8, 0);
    }
    for (let i = 0; i < 46; i++) { // 체크포인트
      const a = i / 46 * Math.PI * 2 + this.rand() * 0.1, r = 250 + (i % 3) * 420 + this.rand() * 80;
      let px = Math.cos(a) * r, pz = Math.sin(a) * r;
      for (let k = 0; k < 12 && !this._free(px, pz, 2); k++) { px += 7; pz += 5; }
      if (Math.hypot(px, pz) < RR) this._addCheckpoint(px, pz);
    }
    // 들판의 하늘 탑 (엘리베이터·발판을 타고 높이 올라가는 링 코스)
    for (const [x, z] of [[-620, 520], [640, 380], [-700, -330], [260, 700], [1180, -420], [-1180, 420]]) this._tower(x, z, 70 + this.rand() * 30, false);
    this._skyMore();
    this._skyRegion();
    if (this.mode === 'forest') this._exitPath();
    this._pathRings();
  }

  // ---------- 하늘 코스 도우미 ----------
  _plat(x, y, z, sx, sz, color = 0xb07a48, top = null) { // 공중 발판 (멀리서도 보임)
    const lm0 = this.lm; this.lm = true;
    const p = this._addPlatform(x, y - 0.6, z, sx, 1.2, sz, color, top ?? this.T.grassA);
    this.lm = lm0;
    return p;
  }
  _tower(cx, cz, height, sky) {
    const lm0 = this.lm; this.lm = true;
    const gy = terrainHeight(cx, cz);
    this.put(BASE.cyl, 0x8a8f99, cx, gy + height / 2, cz, 5, height, 5);
    for (let k = 0; k < height; k += 12) this.put(BASE.cyl, 0xffc233, cx, gy + k + 6, cz, 5.4, 0.8, 5.4);
    this.put(BASE.sph, 0xff3020, cx, gy + height + 1.5, cz, 1.2, 1.2, 1.2, 0, 0, 0, 'glow');
    this._solid(cx, gy + height / 2, cz, 4, height, 4);
    this.lm = lm0;
    // 나선형 발판 (점프로 한 칸씩)
    let y = gy + 4, a = this.rand() * 6.28, n = 0;
    while (y < gy + height - 4) {
      const x = cx + Math.cos(a) * 9, z = cz + Math.sin(a) * 9;
      if (n % 5 === 4) { // 가끔은 엘리베이터
        this._mover({ x, y, z }, { x, y: y + 12, z }, 4.5, 0.6, 4.5, 4.5, 0x5a6068, 0xffc233);
        y += 12;
      } else {
        this._plat(x, y, z, 5, 5);
        this._ringCircle(x, z, 0.1, 1, 1.4, y);
        y += 5.5;
      }
      a += 1.0; n++;
    }
    this._plat(cx, gy + height + 0.5, cz, 9, 9, 0x8a8f99, 0xffc233);
    this.towerTops.push(new THREE.Vector3(cx, gy + height + 0.5, cz));
    this._ringCircle(cx, cz, 3, 10, 1.4, gy + height + 0.5);
    this._addSpring(cx + 3, cz + 3, 36, gy + height + 0.5);
    this._addSpring(cx + Math.cos(0) * 9, cz, 26, gy + 0.3);
    this._occupy(cx, cz, 14);
    return gy + height;
  }
  _skyIsland(x, y, z, r, cannonYaw = null) {
    const lm0 = this.lm; this.lm = true;
    this.put(BASE.cyl, this.T.grassA, x, y - 0.6, z, r * 2, 1.2, r * 2);
    this.put(BASE.cyl, 0x9a7a52, x, y - 2.5, z, r * 1.95, 2.8, r * 1.95);
    this.put(BASE.cone, 0x7a6248, x, y - 4 - r * 0.6, z, r * 1.9, r * 1.2, r * 1.9, 0, Math.PI);
    this.put(BASE.cone, 0x6a5440, x + r * 0.3, y - 4 - r * 1.2, z - r * 0.2, r * 0.8, r * 1.0, r * 0.8, 0, Math.PI);
    this.lm = lm0;
    this._register({ kind: 'disc', center: new THREE.Vector3(x, 0, z), radius: r, top: y, min: new THREE.Vector3(x - r, y - 6, z - r), max: new THREE.Vector3(x + r, y, z + r) });
    for (let i = 0; i < Math.floor(r * 0.8); i++) { // 섬 위 나무·꽃
      const a = this.rand() * 6.28, rr = Math.sqrt(this.rand()) * r * 0.8, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (this.rand() < 0.35) { const set = this.trees.cherry, s = 0.8 + this.rand() * 0.4; const idx = set.add(px, y, pz, s, this.rand() * 6, this.rand()); this._tree(px, pz, 0.45 * s, 7, { set, idx, type: 'cherry', kind: 'tree' }, y); }
      else this.trees.flower.add(px, y, pz, 1.3, 0, this.rand());
    }
    this._ringCircle(x, z, r * 0.5, 12, 1.3, y);
    this._addCheckpoint(x + r * 0.4, z, y);
    if (cannonYaw != null) this._cannon(x - r * 0.4, y, z, cannonYaw);
  }
  // 대포: 공처럼 굴러 들어가면 방향을 골라 발사!
  _cannon(x, y, z, yaw) {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a4048 }), gold = new THREE.MeshLambertMaterial({ color: 0xffc233 }), red = new THREE.MeshLambertMaterial({ color: 0xd83a2a });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.4, 16), red); base.position.y = 0.7; g.add(base);
    const pivot = new THREE.Group(); pivot.position.y = 2.2; g.add(pivot);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4.4, 16, 1, true), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.2; pivot.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.2, 8, 20), gold); ring.position.z = 3.4; pivot.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), new THREE.MeshBasicMaterial({ color: 0x111111 })); inner.position.z = 3.35; pivot.add(inner);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.root.add(g);
    pivot.rotation.x = -0.6;
    this.cannons.push({ pos: new THREE.Vector3(x, y, z), group: g, pivot, yaw, pitch: 0.6, mouth: () => new THREE.Vector3(x, y + 2.2, z) });
    this._solid(x, y + 0.7, z, 3.6, 1.4, 3.6);
  }
  _skyRegion() {
    const S = SKY;
    this.questTargets.sky = new THREE.Vector3(S.x, terrainHeight(S.x, S.z), S.z);
    // 큰 하늘 탑 2개에서 출발 → 떠 있는 발판 → 하늘 섬들 (대포는 하늘 섬에만)
    const t1 = this._tower(S.x - 160, S.z + 120, 110, true);
    const t2 = this._tower(S.x + 170, S.z + 90, 95, true);
    const islands = [
      [S.x - 60, 130, S.z, 26, 0.3], [S.x + 120, 155, S.z - 120, 22, -2.4], [S.x - 180, 175, S.z - 160, 20, 2.6], [S.x + 20, 200, S.z - 260, 24, Math.PI], [S.x + 230, 185, S.z + 40, 18, -1.2],
    ];
    for (const [x, y, z, r, cy] of islands) this._skyIsland(x, y, z, r, cy);
    // 발판 다리 (점프·엘리베이터·움직이는 발판)
    const bridge = (ax, ay, az, bx, by, bz) => {
      const d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(d / 11));
      for (let i = 1; i < n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
        if (i % 4 === 2) this._mover({ x: x - 4, y, z }, { x: x + 4, y: y + 3, z }, 4.5, 0.6, 4.5, 3.5, 0x5a6068, 0xffc233);
        else { this._plat(x, y, z, 5, 5); this._ringCircle(x, z, 0.1, 1, 1.4, y); }
      }
    };
    bridge(S.x - 160, t1 + 1, S.z + 120, islands[0][0], islands[0][1], islands[0][2]);
    bridge(S.x + 170, t2 + 1, S.z + 90, islands[4][0], islands[4][1], islands[4][2]);
    bridge(islands[0][0], islands[0][1], islands[0][2], islands[1][0], islands[1][1], islands[1][2]);
    bridge(islands[0][0], islands[0][1], islands[0][2], islands[2][0], islands[2][1], islands[2][2]);
    bridge(islands[1][0], islands[1][1], islands[1][2], islands[3][0], islands[3][1], islands[3][2]);
    bridge(islands[4][0], islands[4][1], islands[4][2], islands[1][0], islands[1][1], islands[1][2]);
    // 하늘 링 아치
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; this._ringLine(new THREE.Vector3(S.x + Math.cos(a) * 90, 140 + k * 10, S.z - 100 + Math.sin(a) * 90), new THREE.Vector3(S.x + Math.cos(a + 0.5) * 90, 140 + k * 10, S.z - 100 + Math.sin(a + 0.5) * 90), 8, 0); }
  }

  // ---------- 하늘로 올라가는 구조물 더 많이: 하늘 탑 + 탑 꼭대기에서 이어지는 떠 있는 섬 ----------
  _bridge(ax, ay, az, bx, by, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(d / 10));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      if (i % 5 === 3) this._mover({ x: x - 3.5, y, z }, { x: x + 3.5, y: y + 2.5, z }, 4.5, 0.6, 4.5, 3.5, 0x5a6068, 0xffc233);
      else { this._plat(x, y, z, 4.6, 4.6); this._ringCircle(x, z, 0.1, 1, 1.4, y); }
    }
  }
  _skyMore() {
    let n = 0;
    for (let i = 0; i < 400 && n < 16; i++) {
      const a = this.rand() * 6.28, r = 250 + this.rand() * 1300, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - SKY.x, z - SKY.z) < SKY.r + 60 || Math.hypot(x, z) > CFG.world.barrierR - 80) continue;
      if (!this._free(x, z, 16)) continue;
      if (this.towerTops.some((t) => Math.hypot(t.x - x, t.z - z) < 220)) continue;
      const top = this._tower(x, z, 65 + this.rand() * 75, false);
      // 탑 꼭대기에서 발판 다리로 이어진 하늘 섬 (섬에는 링과 높이 솟는 스프링)
      const b = this.rand() * 6.28, dist = 45 + this.rand() * 30, ix = x + Math.cos(b) * dist, iz = z + Math.sin(b) * dist, iy = top + 8 + this.rand() * 25;
      this._bridge(x, top + 1, z, ix, iy, iz);
      this._skyIsland(ix, iy, iz, 12 + this.rand() * 8, null);
      this._addSpring(ix + 4, iz + 4, 42, iy);
      this._ringLine(new THREE.Vector3(ix + 4, iy + 10, iz + 4), new THREE.Vector3(ix + 4, iy + 45, iz + 4), 10, 0);
      for (let k = 0; k < 3; k++) { const c = this.rand() * 6.28; this._ringArc(new THREE.Vector3(ix + Math.cos(c) * 30, iy, iz + Math.sin(c) * 30), new THREE.Vector3(Math.cos(c + 1.6), 0, Math.sin(c + 1.6)), 40, 14, 10, 0); }
      n++;
    }
    // 들판 곳곳에 떠 있는 발판 사다리 (땅 스프링 → 공중 발판 3~5개 → 링)
    for (let i = 0, m = 0; i < 600 && m < 40; i++) {
      const a = this.rand() * 6.28, r = 120 + this.rand() * 1450, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 8) || terrainHeight(x, z) < 1) continue;
      const gy = terrainHeight(x, z);
      this._addSpring(x, z, 34, gy);
      let y = gy + 12, px = x, pz = z;
      const dir = this.rand() * 6.28, steps = 3 + Math.floor(this.rand() * 3);
      for (let k = 0; k < steps; k++) {
        px += Math.cos(dir) * 8; pz += Math.sin(dir) * 8; y += 5;
        this._plat(px, y, pz, 4.5, 4.5);
        this._ringLine(new THREE.Vector3(px, y + 1.4, pz), new THREE.Vector3(px + Math.cos(dir) * 6, y + 3, pz + Math.sin(dir) * 6), 3, 0);
      }
      this._addSpring(px, pz, 36, y);
      this._ringLine(new THREE.Vector3(px, y + 10, pz), new THREE.Vector3(px, y + 34, pz), 7, 0);
      this._occupy(x, z, 8);
      m++;
    }
  }

  // ---------- 랜드마크: 멀리서도 보이는 큰 구조물 (부서지지 않음) — "OO 쪽으로 와!" ----------
  _landmarks() {
    const lm0 = this.lm; this.lm = true;
    const B = BASE;
    const add = (name, icon, x, z, build) => {
      for (let k = 0; k < 12 && !this._free(x, z, 10); k++) { x += 9; z += 6; }
      const y = terrainHeight(x, z);
      build(x, y, z);
      this.landmarks.push({ name, icon, x, z });
      this.discoveries.push({ name, pos: new THREE.Vector3(x, y, z), r: 40 });
      this._ringCircle(x, z, 16, 18);
      this._occupy(x, z, 18);
    };
    if (this.mode === 'lava') { this._lavaMarks(add, B); this.lm = lm0; return; }
    if (this.mode === 'ship') { this._shipMarks(add, B); this.lm = lm0; return; }
    add('시계탑', '🕰', 489, 178, (x, y, z) => {
      this.put(B.box, 0xd8c9a8, x, y + 22, z, 9, 44, 9); this.put(B.box, 0x8a6a48, x, y + 1, z, 11, 2, 11);
      for (const [dx, dz, ry] of [[0, 4.6, 0], [0, -4.6, 0], [4.6, 0, Math.PI / 2], [-4.6, 0, Math.PI / 2]]) {
        this.put(B.cyl, 0xffffff, x + dx, y + 36, z + dz, 6, 0.3, 6, ry, Math.PI / 2); this.put(B.box, 0x222222, x + dx * 1.02, y + 37, z + dz * 1.02, 0.4, 2.6, 0.4, ry);
      }
      this.put(B.cone4, 0x3f5fa8, x, y + 49, z, 12, 10, 12, Math.PI / 4); this.put(B.sph, 0xffd23a, x, y + 54.5, z, 1.4, 1.4, 1.4, 0, 0, 0, 'glow');
      this._solid(x, y + 22, z, 9, 44, 9);
    });
    add('무지개 아치', '🌈', 130, 520, (x, y, z) => {
      [0xff4040, 0xff9a30, 0xffe040, 0x50d060, 0x40a0ff, 0x6050e0, 0xb050e0].forEach((c, i) => {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(26 - i * 2.1, 1.05, 8, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
        arc.position.set(x, y - 1, z); arc.rotation.y = 0.5; this.root.add(arc);
      });
    });
    add('돌거인 석상', '🗿', -398, 334, (x, y, z) => {
      const st = 0x9a958a;
      for (const s of [-1, 1]) { this.put(B.box, st, x + s * 4, y + 7, z, 5, 14, 5); this.put(B.box, st, x + s * 10, y + 22, z, 4, 14, 4); }
      this.put(B.box, st, x, y + 22, z, 14, 16, 8); this.put(B.box, st, x, y + 35, z, 9, 9, 8);
      for (const s of [-1, 1]) this.put(B.box, 0x50e0ff, x + s * 2.2, y + 36, z + 4.05, 1.6, 1, 0.2, 0, 0, 0, 'glow');
      this.put(B.box, 0x6d9a4a, x, y + 40, z, 9.5, 1.2, 8.5);
      this._solid(x, y + 7, z, 13, 14, 5); this._solid(x, y + 22, z, 14, 16, 8);
    });
    add('관람차', '🎡', -489, -178, (x, y, z) => {
      for (const s of [-1, 1]) { this.put(B.box, 0xd0d4da, x - 8, y + 15, z + s * 4, 1, 32, 1, 0, 0, 0.27); this.put(B.box, 0xd0d4da, x + 8, y + 15, z + s * 4, 1, 32, 1, 0, 0, -0.27); }
      const wheel = new THREE.Group(), R = 18, mat = new THREE.MeshLambertMaterial({ color: 0xff5a8a }), spoke = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 48), mat); wheel.add(rim);
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, sp = new THREE.Mesh(B.box, spoke); sp.scale.set(0.3, R * 2, 0.3); sp.rotation.z = a; wheel.add(sp);
        const cab = new THREE.Mesh(B.box, new THREE.MeshLambertMaterial({ color: [0xffd23a, 0x40a0ff, 0x50d060, 0xff6a3a][k % 4] })); cab.scale.set(2.4, 2.4, 2.4); cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); wheel.add(cab);
      }
      wheel.position.set(x, y + 31, z); wheel.rotation.y = Math.PI / 2; this.root.add(wheel);
      this.spinners.push({ mesh: wheel, axis: 'z', speed: 0.15 });
    });
    add('작은 성', '🏰', -90, -540, (x, y, z) => {
      const st = 0xb8b0a0, H = 12;
      for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { this.put(B.cyl, st, x + dx, y + 10, z + dz, 7, 20, 7); this.put(B.cone, 0xc0452c, x + dx, y + 23, z + dz, 8, 7, 8); this._solid(x + dx, y + 10, z + dz, 6, 20, 6); }
      for (const [cx, cz, sx, sz] of [[0, -14, 22, 2], [-14, 0, 2, 22], [14, 0, 2, 22]]) { this.put(B.box, st, x + cx, y + H / 2, z + cz, sx, H, sz); this._solid(x + cx, y + H / 2, z + cz, sx, H, sz); }
      for (const s of [-1, 1]) { this.put(B.box, st, x + s * 8, y + H / 2, z + 14, 8, H, 2); this._solid(x + s * 8, y + H / 2, z + 14, 8, H, 2); }
      this.put(B.box, st, x, y + 18, z, 12, 24, 12); this.put(B.cone4, 0x3f5fa8, x, y + 34, z, 14, 9, 14, Math.PI / 4); this._solid(x, y + 18, z, 12, 24, 12);
      this.put(B.box, 0xd83a2a, x + 0.7, y + 41, z, 1.4, 1, 0.1); this.put(B.cyl6, 0x3a3a3a, x, y + 40, z, 0.2, 4, 0.2);
    });
    add('물탱크 탑', '🛢', 398, -334, (x, y, z) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(B.box, 0x8a6a48, x + sx * 4, y + 13, z + sz * 4, 0.8, 26, 0.8);
      this.put(B.cyl, 0x4a8ad8, x, y + 31, z, 12, 10, 12); this.put(B.cone, 0x2f5fa0, x, y + 38, z, 13, 4, 13);
      this._solid(x, y + 31, z, 10, 10, 10); this._addSpring(x, z, 48, y);
    });
    add('빨간 등대', '🗼', 1150, 0, (x, y, z) => {
      for (let i = 0; i < 6; i++) this.put(B.cyl, i % 2 ? 0xffffff : 0xd83a2a, x, y + 4 + i * 7, z, 8 - i * 0.6, 7, 8 - i * 0.6);
      this.put(B.cyl, 0xfff0a0, x, y + 46, z, 4.4, 4, 4.4, 0, 0, 0, 'glow'); this.put(B.cone, 0x333333, x, y + 50, z, 6, 4, 6);
      this._solid(x, y + 22, z, 7, 44, 7);
    });
    add('번개 송신탑', '📡', 813, 813, (x, y, z) => {
      for (let i = 0; i < 7; i++) { const w = 12 - i * 1.5, yy = y + i * 10; for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(B.box, 0xd84a3a, x + sx * w / 2, yy + 5, z + sz * w / 2, 0.6, 10.5, 0.6, 0, sz * 0.08, -sx * 0.08); this.put(B.box, 0xeeeeee, x, yy + 10, z, w, 0.5, w); }
      this.put(B.sph, 0xff2010, x, y + 73, z, 2, 2, 2, 0, 0, 0, 'glow');
      this._solid(x, y + 30, z, 8, 60, 8);
    });
    add('열기구', '🎈', 20, 1150, (x, y, z) => {
      const g = new THREE.Group(), env = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshLambertMaterial({ color: 0xff7a3a }));
      env.scale.y = 1.2; g.add(env);
      const band = new THREE.Mesh(new THREE.TorusGeometry(10.1, 0.6, 6, 32), new THREE.MeshLambertMaterial({ color: 0xffe040 })); band.rotation.x = Math.PI / 2; g.add(band);
      const bask = new THREE.Mesh(BASE.box, new THREE.MeshLambertMaterial({ color: 0x8a5a2b })); bask.scale.set(4, 2.5, 4); bask.position.y = -17; g.add(bask);
      g.position.set(x, y + 55, z); this.root.add(g);
      this.spinners.push({ mesh: g, axis: 'y', speed: 0.12 });
      this._plat(x, y + 37, z, 4, 4, 0x8a5a2b, 0xa8744a);
      this._ringLine(new THREE.Vector3(x + 6, y + 8, z), new THREE.Vector3(x + 2, y + 34, z), 10, 0);
      this._addSpring(x + 6, z, 46, y);
    });
    add('피라미드', '🔺', -813, 813, (x, y, z) => {
      for (let i = 0; i < 8; i++) { const w = 44 - i * 5.5; this.put(B.box, i % 2 ? 0xe0c080 : 0xd4b06a, x, y + 2.25 + i * 4.5, z, w, 4.5, w); this._solid(x, y + 2.25 + i * 4.5, z, w, 4.5, w); }
      this.put(B.box, 0xffd23a, x, y + 37, z, 3, 2, 3, 0, 0, 0, 'glow');
    });
    add('거대 해바라기', '🌻', -1150, 0, (x, y, z) => {
      this.put(B.cyl, 0x4f9a3a, x, y + 15, z, 2, 30, 2);
      for (const s of [-1, 1]) this.put(B.sph, 0x5cb04a, x + s * 4, y + 12, z, 8, 2, 4, 0, 0, s * 0.4);
      this.put(B.cyl, 0x6b4a2e, x, y + 31, z + 1.2, 12, 1.2, 12, 0, Math.PI / 2 - 0.25);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; this.put(B.sph, 0xffd23a, x + Math.cos(a) * 9, y + 31 + Math.sin(a) * 9 * 0.97, z + 0.6, 5, 2.6, 1, 0, 0, a); }
      this._solid(x, y + 15, z, 2, 30, 2);
    });
    add('보라 수정탑', '💎', -813, -813, (x, y, z) => {
      this.put(B.cone4, 0xb070ff, x, y + 22, z, 9, 44, 9, 0, 0, 0, 'glow');
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; this.put(B.cone4, 0x8a50e0, x + Math.cos(a) * 8, y + 7, z + Math.sin(a) * 8, 4, 14, 4, a, 0.25 * Math.cos(a), 0.25 * Math.sin(a), 'glow'); }
      this._solid(x, y + 15, z, 6, 30, 6);
    });
    add('거북 바위', '🐢', 813, -813, (x, y, z) => {
      const yy = Math.max(y, 0);
      this.put(B.hemi, 0x6a8a4a, x, yy - 1, z, 36, 18, 30); this.put(B.sph, 0x8aa86a, x + 20, yy + 3, z, 9, 7, 8);
      for (const [dx, dz] of [[-10, 13], [10, 13], [-10, -13], [10, -13]]) this.put(B.sph, 0x8aa86a, x + dx, yy, z + dz, 7, 4, 7);
      this._register({ kind: 'disc', center: new THREE.Vector3(x, 0, z), radius: 13, top: yy + 8, min: new THREE.Vector3(x - 14, yy - 2, z - 14), max: new THREE.Vector3(x + 14, yy + 8, z + 14) });
      this._ringCircle(x, z, 6, 10, 1.3, yy + 8);
    });
    this.lm = lm0;
  }

  // ---------- 길 모양 링: 마을·발견 장소·랜드마크·탑·퀘스트 장소를 잇는 오솔길을 따라 ----------
  _pathRings() {
    const nodes = [];
    const push = (x, z) => { if (Math.hypot(x, z) < CFG.world.barrierR - 40) nodes.push({ x, z }); };
    for (const d of this.discoveries) push(d.pos.x, d.pos.z);
    for (const t of this.towerTops) push(t.x, t.z);
    for (const k in SITES) push(SITES[k].x, SITES[k].z);
    for (const P of PONDS) push(P.x + P.r * 1.3, P.z);
    push(0, 40);
    const edges = new Set(), solid = new THREE.Vector3();
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.z - b.z) })).filter((o) => o.j !== i && o.d > 30 && o.d < 650).sort((p, q) => p.d - q.d).slice(0, 3);
      for (const o of near) edges.add(i < o.j ? i + ',' + o.j : o.j + ',' + i);
    });
    const step = 3.0, on = 11, off = 9; // 링 양을 이전의 약 2/3로
    for (const e of edges) {
      const [i, j] = e.split(',').map(Number), A = nodes[i], Bn = nodes[j];
      const L = Math.hypot(Bn.x - A.x, Bn.z - A.z), nx = -(Bn.z - A.z) / L, nz = (Bn.x - A.x) / L;
      const bend = (this.rand() - 0.5) * L * 0.25, wav = this.rand() * 6;
      const n = Math.floor(L / step);
      for (let k = 3; k < n - 3; k++) {
        if (k % (on + off) >= on) continue;
        const t = k / n, side = bend * Math.sin(Math.PI * t) + Math.sin(t * 9 + wav) * 4;
        const x = A.x + (Bn.x - A.x) * t + nx * side, z = A.z + (Bn.z - A.z) * t + nz * side;
        const h = terrainHeight(x, z);
        if (h < 0.2 || Math.hypot(x, z) > CFG.world.barrierR - 30) continue;
        const y = this.groundAt(x, z, h + 3) + 1.2;
        if (this.solidAt(solid.set(x, y, z)) || this.loopSolidAt(solid)) continue;
        this.ringSpots.push(new THREE.Vector3(x, y, z));
      }
    }
  }

  // ---------- 다음 대지로 가는 길 (북쪽, 점점 눈이 덮임) ----------
  _exitPath() {
    const E = EXIT, ice = this.T.frozen;
    this.exitGate = new THREE.Vector3(0, terrainHeight(0, E.start + 40), E.start + 40);
    const lm0 = this.lm; this.lm = true;
    for (const sx of [-1, 1]) { // 문 기둥
      const x = sx * (E.halfWidth - 10), z = E.start + 60, y = terrainHeight(x, z);
      this.put(BASE.box, 0x9ab8d8, x, y + 14, z, 5, 28, 5);
      this.put(BASE.cone, 0xdff4ff, x, y + 31, z, 4, 6, 4, 0, 0, 0, 'glow');
    }
    this.lm = lm0;
    for (let z = E.start + 20; z < E.end + 100; z += 7) { // 양옆 눈 덮인 소나무, 얼음 결정
      for (const sx of [-1, 1]) {
        const x = sx * (E.halfWidth - 6 + this.rand() * 30);
        if (this.rand() < 0.7) { const set = this.trees.pine, s = 0.9 + this.rand() * 0.8, y = terrainHeight(x, z); set.add(x, y, z, s, this.rand() * 6, this.rand()); }
        if (this.rand() < 0.15) this.put(BASE.cone4, ice ? 0xbfe0ff : 0xcfeaff, x * 0.8, terrainHeight(x * 0.8, z) + 1.5, z, 1.4, 3 + this.rand() * 3, 1.4, this.rand(), 0, 0, 'glow');
      }
    }
    for (let z = E.start + 30; z < E.end; z += 40) this._ringLine(new THREE.Vector3(-6, null, z), new THREE.Vector3(6, null, z + 20), 6);
    this.signpost(18, E.start + 80, Math.PI, 0xffffff, 0x4fb8ff);
  }

  // ---------- 미니맵 그림 ----------
  _minimap() {
    const S = 320, half = 1800;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), img = g.createImageData(S, S), c = new THREE.Color();
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -half + (i + 0.5) / S * half * 2, z = -half + (j + 0.5) / S * half * 2;
      const h = terrainHeight(x, z);
      this.colorAt(x, z, h, 0, c);
      if (h < 0 && !this.T.frozen) { zoneWeights(x, z); c.set(ZW[1] > 0.4 ? this.T.swampWater : this.T.waterDeep); }
      const k = (j * S + i) * 4;
      img.data[k] = c.r * 255; img.data[k + 1] = c.g * 255; img.data[k + 2] = c.b * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = '#ff3020'; g.lineWidth = 3;
    if (this.barrierUp) { g.beginPath(); g.arc(S / 2, S / 2, CFG.world.barrierR / half * S / 2, 0, 7); g.stroke(); }
    this.mapCanvas = cv; this.mapHalf = half;
  }

  // =================================================================
  update(dt, time) {
    if (this.mode === 'space') return;
    for (const s of this.springs) {
      s.comp = Math.max(0, s.comp - dt * 4);
      const k = 1 - s.comp * 0.5;
      s.coil.scale.y = k; s.coil.position.y = 0.3 + 0.3 * k; s.topMesh.position.y = 0.3 + 0.7 * k;
    }
    if (this._boostTex) this._boostTex.offset.y = (time * 1.5) % 1;
    if (this._belt) this._belt.map.offset.y = -(time * 2) % 1;
    if (this.secret && this.secret.mesh.visible) { this.secret.mesh.rotation.y = time * 2; this.secret.mesh.position.y = this.secret.pos.y + 2 + Math.sin(time * 3) * 0.3; }
    for (const p of this.movers) {
      if (p.kind === 'disc') { p.dAng = p.angVel * dt; p.mesh.rotation.y += p.dAng; }
      else this._moverPos(p, time);
    }
    for (const h of this.hazards) {
      const t = Math.sin(time * 1.2 + h.phase) * 0.5;
      h.mesh.position.copy(h.center).addScaledVector(h.dir, t * h.len);
      h.blade.rotation.z += dt * 18;
    }
    for (const s of this.spinners) s.mesh.rotation[s.axis] += s.speed * dt;
    for (const c of this.chests) if (c.opened && c.lid.rotation.x > -1.9) c.lid.rotation.x = Math.max(-1.9, c.lid.rotation.x - dt * 4);
    for (const b of this.beacons) { b.mesh.material.opacity = (b.found ? 0.18 : 0.5) + Math.sin(time * 2 + b.phase) * 0.08; if (b.found && !b.gold) { b.gold = true; b.mesh.material.color.set(0xffd86a); } b.mesh.rotation.y = time * 0.3; }
    for (const w of this.waterfalls) w.mat.map.offset.y = (time * 1.6) % 1;
    for (const c of this.checkpoints) {
      c.flash = Math.max(0, c.flash - dt * 0.6);
      const pulse = c.active ? 0.35 + Math.sin(time * 4) * 0.15 : 0;
      c.mat.emissiveIntensity = pulse + c.flash * 0.8;
      c.glow.material.opacity = c.active ? 0.08 + c.flash * 0.5 : 0;
      c.glow.visible = c.active;
      c.glow.scale.y = 0.6 + c.flash;
    }
    for (const s of this.searchlights) s.pivot.rotation.y = s.base + Math.sin(time * 0.4 + s.phase) * 0.9;
    // 대지의 크리스탈: 빼앗기는 중에는 흐릿하게 깜빡, 되찾으면 환하게
    if (this.heartTree) {
      const T = this.heartTree, st = this.cState;
      if (T.restored) T.glowT = Math.min(1, T.glowT + dt * 0.4);
      const k = T.glowT;
      this.crystalMat.emissiveIntensity = (st === 2 ? 0.1 + 0.08 * Math.sin(time * 7) : 0.3) + k * (0.9 + Math.sin(time * 3) * 0.25);
      this.crystalMesh.rotation.y = time * (0.15 + k * 0.6);
      if (st !== 5) this.crystalGroup.position.y = k * 2.5; // 5 = 수호자 장면에서 직접 움직이는 중
      if (st === 1) { // 드릴이 내려가며 땅을 팜
        this.drillT += dt;
        this.drillRig.position.y = this.drillTop + (this.drillLow - this.drillTop) * Math.min(1, this.drillT / 2.2);
        this.drillRig.rotation.y += dt * 16;
        this.drillRig.position.x = (Math.random() - 0.5) * 0.15;
      } else if (st === 2) { this.drillRig.position.y = this.drillTop; this.drillRig.rotation.y += dt * 1.5; this.drillRig.position.x = 0; }
      if (this.treeDrain.visible) for (const o of this.treeDrain.children) {
        const u = o.userData; if (u.len == null) continue;
        const t = ((time * 0.25 + u.k / 5) % 1) * u.len;
        o.position.set(u.sx + u.dx * t, u.py, u.sz + u.dz * t);
      }
    }
    // 장벽 가라앉기
    if (!this.barrierUp && this.barrierGroup.visible) {
      this.barrierSink += dt;
      this.barrierGroup.position.y = -Math.pow(this.barrierSink, 2) * 6;
      if (this.barrierSink > 4.5) this.barrierGroup.visible = false;
    }
  }

  // ---------- 용암 섬 바깥: 끝없는 용암 바다와 먼 화산들 ----------
  _lavaSea() {
    const lm0 = this.lm; this.lm = true;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + this.rand() * 0.3, r = 2150 + this.rand() * 500, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const H = 90 + this.rand() * 110, R = H * (1.1 + this.rand() * 0.5);
      this.put(BASE.cone, 0x2e2624, x, H / 2 - 20, z, R * 2, H, R * 2, this.rand() * 6);
      this.put(BASE.cyl, 0xff6a20, x, H - 20 - H * 0.04, z, R * 0.32, 1, R * 0.32, 0, 0, 0, 'glow');
      this.smokeEmitters.push({ pos: new THREE.Vector3(x, H - 10, z), rate: 1.4, dark: true });
    }
    for (let i = 0; i < 90; i++) { // 용암 바다의 작은 돌섬
      const a = this.rand() * Math.PI * 2, r = CFG.lava.edge + 120 + this.rand() * 700, x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.put(BASE.dode, [0x2e2624, 0x3a3230, 0x241e1c][i % 3], x, 0, z, 6 + this.rand() * 14, 3 + this.rand() * 8, 6 + this.rand() * 14, this.rand() * 6);
    }
    this.lm = lm0;
  }
  // ---------- 하늘 도시 끝: 경고 기둥, 끝을 지키는 커다란 로봇, 멀리 떠 있는 섬 ----------
  _skyEdge() {
    for (let i = 0, n = 0; i < 60 && n < 18; i++) {
      const a = (n + 0.5) / 18 * Math.PI * 2 + (this.rand() - 0.5) * 0.1, r = CFG.sky.edge - 130 - this.rand() * 50;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) < 0.5) continue;
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type: 'titan', leash: 45 }); n++;
    }
    const N = 300;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, x0 = Math.cos(a), z0 = Math.sin(a), R = skyEdgeR(x0 * 1700, z0 * 1700) - 7;
      const x = x0 * R, z = z0 * R, y = terrainHeight(x, z);
      if (y < 0.5) continue;
      this.put(BASE.box, i % 2 ? 0xffc233 : 0x2c3036, x, y + 0.6, z, 1.2, 1.2, 1.2, -a);
      if (i % 3 === 0) { this.put(BASE.cyl6, 0x5d646e, x, y + 2.5, z, 0.3, 4, 0.3); this.put(BASE.sph, 0xff3020, x, y + 4.8, z, 0.7, 0.7, 0.7, 0, 0, 0, 'glow'); }
    }
    const lm0 = this.lm; this.lm = true;
    for (let i = 0; i < 24; i++) { // 멀리 떠 있는 하늘 섬과 비행선
      const a = this.rand() * Math.PI * 2, r = 2050 + this.rand() * 800, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 20 + this.rand() * 140;
      if (i % 4 === 0) {
        this.put(BASE.sph, 0xd8dee6, x, y + 30, z, 60, 18, 18, a);
        this.put(BASE.box, 0x5d646e, x, y + 19, z, 14, 5, 6, a);
        this.put(BASE.box, 0xffc233, x - Math.sin(a) * 28, y + 34, z - Math.cos(a) * 28, 1, 14, 10, a);
      } else {
        const R = 25 + this.rand() * 45;
        this.put(BASE.cone, 0x7a8493, x, y - R * 0.5, z, R * 2, R * 1.4, R * 2, 0, Math.PI);
        this.put(BASE.cyl, 0x9aa6b4, x, y + 0.5, z, R * 2.05, 1.5, R * 2.05);
        this.put(BASE.box, 0x4fd8ff, x, y + 6, z, R * 0.4, 10, R * 0.4, 0, 0, 0, 'glow');
      }
    }
    this.lm = lm0;
  }
  // 하늘 도시 구멍 테두리: 노랑·검정 경고 블록 + 빨간 불빛 (떨어지는 곳이 잘 보이게)
  _holeRims() {
    for (const H of SKY_HOLES) {
      const n = Math.ceil(H.r * 2 * Math.PI / 3.2);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, x = H.x + Math.cos(a) * (H.r + 0.8), z = H.z + Math.sin(a) * (H.r + 0.8), y = terrainHeight(x, z);
        if (y < 0) continue;
        this.put(BASE.box, i % 2 ? 0xffc233 : 0x2c3036, x, y + 0.25, z, 3.0, 0.5, 0.9, -a + Math.PI / 2);
        if (i % 6 === 0) this.put(BASE.sph, 0xff3020, x, y + 0.8, z, 0.5, 0.5, 0.5, 0, 0, 0, 'glow');
      }
    }
  }
  // ---------- 다음 대지로 가는 장치: 얼음 나라 = 거대 대포, 용암 섬 = 하늘로 솟는 분출구 ----------
  _exitDevice() {
    if (this.mode !== 'ice') return;
    let x = SITES.lab.x + 60, z = SITES.lab.z + 50;
    for (let k = 0; k < 40 && !this._free(x, z, 14); k++) { x += 9; z -= 6; }
    const y = terrainHeight(x, z), g = new THREE.Group(); g.position.set(x, y, z); this.root.add(g);
    const mk = (geo, c, px, py, pz, sx = 1, sy = 1, sz = 1, parent = g, glow = false) => { const o = new THREE.Mesh(geo, glow ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : new THREE.MeshLambertMaterial({ color: c })); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
    const yaw = Math.atan2(x, z); // 대지 바깥쪽을 향해
    if (this.mode === 'ice') {
      mk(box, 0x4a5266, 0, 2, 0, 18, 4, 18); mk(box, 0xffc233, 0, 4.1, 0, 18.2, 0.4, 18.2);
      mk(cyl, 0x3a4048, 0, 5, 0, 7, 2, 7);
      const piv = new THREE.Group(); piv.position.y = 7.5; piv.rotation.y = yaw; g.add(piv);
      const tilt = new THREE.Group(); tilt.rotation.x = -0.75; piv.add(tilt);
      const barrel = mk(cyl, 0x5d6880, 0, 0, 9, 4.2, 26, 4.2, tilt); barrel.rotation.x = Math.PI / 2;
      for (const zz of [0, 8, 16, 21]) { const r = mk(new THREE.TorusGeometry(4.4, 0.6, 8, 24), 0xffc233, 0, 0, zz, 1, 1, 1, tilt); }
      mk(cyl, 0x111111, 0, 0, 22.1, 3.4, 0.2, 3.4, tilt).rotation.x = Math.PI / 2;
      mk(new THREE.SphereGeometry(4.6, 16, 12), 0x4a5266, 0, 0, -3, 1, 1, 1, tilt);
      for (const s of [-1, 1]) mk(box, 0x2c3036, s * 5.5, 0, 0, 2, 5, 6, tilt);
      this.exitGlow = mk(new THREE.SphereGeometry(1.2, 10, 8), 0xff3020, 0, 7.8, 0, 1, 1, 1, g, true);
      for (let k = 0; k < 7; k++) mk(box, 0x7a8493, 0, 0.35 + k * 0.6, 12 - k * 1.1, 6, 0.7, 1.4, g); // 계단
      this._cannonSolid = [x, y + 2, z, 18, 4, 18];
      g.visible = false; // 보스를 물리치면 나타남
    } else {
      mk(new THREE.CylinderGeometry(8, 15, 7, 18), 0x2e2624, 0, 3.5, 0);
      mk(new THREE.CylinderGeometry(6.5, 6.5, 0.4, 18), 0xff6a20, 0, 7.05, 0, 1, 1, 1, g, true);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mk(new THREE.ConeGeometry(1.5, 6, 5), 0x1c1620, Math.cos(a) * 11, 5, Math.sin(a) * 11).rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
      this.exitGlow = mk(new THREE.TorusGeometry(6, 0.5, 8, 28), 0xffd040, 0, 7.6, 0, 1, 1, 1, g, true); this.exitGlow.rotation.x = Math.PI / 2;
      this.smokeEmitters.push({ pos: new THREE.Vector3(x, y + 9, z), rate: 1.5, dark: false });
      this._solid(x, y + 3, z, 16, 6, 16);
    }
    this.exitDevice = { pos: new THREE.Vector3(x, y, z), r: 11, kind: this.mode === 'ice' ? 'cannon' : 'geyser', group: g, yaw, top: y + (this.mode === 'ice' ? 4 : 7), hidden: this.mode === 'ice' };
    this.questTargets.exit = this.exitDevice.pos;
    this._occupy(x, z, 14);
  }
  revealExit() {
    const X = this.exitDevice; if (!X || !X.hidden) return;
    X.hidden = false; X.group.visible = true;
    if (this._cannonSolid) { this._solid(...this._cannonSolid); this._cannonSolid = null; }
  }
  // 마무리: 360도 루프 근처에는 몬스터를 두지 않고, 용암·구멍 위의 링과 몬스터는 치움
  _tidySpots() {
    const nearLoop = (p) => this.loops.some((L) => Math.hypot(p.x - L.base.x, p.z - L.base.z) < 80);
    const wet = (p) => (this.mode === 'lava' || this.mode === 'sky') && terrainHeight(p.x, p.z) < 0.5;
    if (this.mode === 'ship') { let k = 0; for (const sp of this.enemySpots) if (!sp.tag && (sp.type === 'beetle' || sp.type === 'hopper') && (k++ % 3 === 0)) sp.type = 'colossus'; }
    this.enemySpots = this.enemySpots.filter((sp) => sp.tag || sp.type === 'titan' || (!nearLoop(sp.pos) && !(wet(sp.pos) && sp.type !== 'wasp')));
    if (this.mode === 'lava' || this.mode === 'sky') this.ringSpots = this.ringSpots.filter((r) => !(r.y < 1.2 && terrainHeight(r.x, r.z) < 0.3));
    // 링 양 줄이기: 이전의 약 2/3 (한 개씩 빼지 않고 12m 칸 단위로 통째로 빼서 줄이 끊겨 보이지 않게)
    this.ringSpots = this.ringSpots.filter((r) => hash2(Math.floor(r.x / 12) + 77, Math.floor(r.z / 12) - 31) > 0.23);
  }
  // ---------- 얼음 나라: 슈퍼 공격으로 땅을 내리치면 눈이 녹아 땅이 드러남 ----------
  _meshH(x, z) {
    const st = this.terrain.lods[0].step, x0 = Math.floor(x / st) * st, z0 = Math.floor(z / st) * st, fx = (x - x0) / st, fz = (z - z0) / st;
    return (terrainHeight(x0, z0) * (1 - fx) + terrainHeight(x0 + st, z0) * fx) * (1 - fz) + (terrainHeight(x0, z0 + st) * (1 - fx) + terrainHeight(x0 + st, z0 + st) * fx) * fz;
  }
  meltSnow(p, r) {
    if (this.mode !== 'ice' || !(r > 0)) return false;
    for (const m of this.meltPatches) if (Math.hypot(m.x - p.x, m.z - p.z) < m.r * 0.45 && m.r >= r * 0.8) return false; // 이미 녹은 곳
    if (!this.meltMat) this.meltMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const RN = 7, SEG = 22, pos = [], col = [], idx = [], C = new THREE.Color(), G1 = new THREE.Color(0x6fd052), G2 = new THREE.Color(0x3f9f3c), SOIL = new THREE.Color(0x8a6a45), WET = new THREE.Color(0xc8d8e8);
    const vert = (x, z, k) => {
      const h = terrainHeight(x, z);
      pos.push(x, Math.max(h, this._meshH(x, z), 0) + 0.18, z);
      const n = vnoise(x * 0.2, z * 0.2);
      C.copy(G1).lerp(G2, n);
      if (k > 0.62) C.lerp(SOIL, smooth(0.62, 0.85, k));
      if (k > 0.86) C.lerp(WET, smooth(0.86, 1, k) * 0.6);
      col.push(C.r, C.g, C.b, k > 0.88 ? 1 - smooth(0.88, 1, k) : 1);
    };
    vert(p.x, p.z, 0);
    for (let i = 1; i <= RN; i++) for (let j = 0; j < SEG; j++) {
      const a = j / SEG * Math.PI * 2, rr = r * i / RN * (1 + (vnoise(Math.cos(a) * 3 + p.x, Math.sin(a) * 3 + p.z) - 0.5) * 0.3 * (i / RN));
      vert(p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr, i / RN);
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
    for (let i = 1; i < RN; i++) for (let j = 0; j < SEG; j++) {
      const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + (j + 1) % SEG, c = a + SEG, d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.meltMat); mesh.renderOrder = 1; mesh.receiveShadow = true;
    this.root.add(mesh);
    this.meltPatches.push({ x: p.x, z: p.z, r, mesh });
    if (this.meltPatches.length > CFG.snow.maxPatches) { const o = this.meltPatches.shift(); this.root.remove(o.mesh); o.mesh.geometry.dispose(); }
    return true;
  }

  // ---------- 용암 섬 랜드마크: 생명의 흔적 없이, 화산이 만든 지형과 기어 군단의 채굴 시설 ----------
  _lavaMarks(add, B) {
    const GL = 'glow';
    add('흑요석 첨탑', '🗡', 489, 178, (x, y, z) => { this.put(B.cone4, 0x1a1420, x, y + 35, z, 14, 70, 14, 0.3); for (let k = 0; k < 4; k++) this.put(B.cone4, 0xff5a10, x, y + 12 + k * 13, z, 14.2 - k * 2.6, 0.8, 14.2 - k * 2.6, 0.3, 0, 0, GL); this._solid(x, y + 15, z, 9, 30, 9); });
    add('용암 폭포', '🌋', 130, 520, (x, y, z) => { this.put(B.box, 0x2e2624, x, y + 20, z, 30, 40, 14); this.put(B.box, 0xff6a20, x, y + 20, z + 7.1, 9, 40, 0.3, 0, 0, 0, GL); this.put(B.cyl, 0xffa030, x, y + 0.3, z + 12, 16, 0.6, 10, 0, 0, 0, GL); this._solid(x, y + 20, z, 30, 40, 14); });
    add('현무암 아치', '🌉', -398, 334, (x, y, z) => { for (const s of [-1, 1]) { this.put(B.cyl6, 0x3a3432, x + s * 14, y + 14, z, 7, 28, 7); this._solid(x + s * 14, y + 14, z, 6, 28, 6); } this.put(B.box, 0x2e2826, x, y + 30, z, 36, 6, 8); this.put(B.box, 0xff6a20, x, y + 27.2, z, 30, 0.4, 8.2, 0, 0, 0, GL); this._plat(x, y + 33, z, 36, 8, 0x2e2826, 0x3a3432); });
    add('불꽃 수정 동굴', '💎', -489, -178, (x, y, z) => { this.put(B.hemi, 0x2e2624, x, y - 2, z, 34, 22, 34); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; this.put(B.cone4, k % 2 ? 0xff4a1a : 0xffa030, x + Math.cos(a) * 15, y + 8, z + Math.sin(a) * 15, 3, 14 + (k % 3) * 5, 3, a, Math.cos(a) * 0.4, Math.sin(a) * 0.4, GL); } });
    add('거대 용암 기둥', '🔥', -90, -540, (x, y, z) => { this.put(B.cyl6, 0x2e2826, x, y + 26, z, 12, 52, 12); this.put(B.torus, 0xff6a20, x, y + 53, z, 14, 14, 14, 0, Math.PI / 2, 0, GL); this.put(B.cyl6, 0xffa030, x, y + 52.5, z, 9, 0.6, 9, 0, 0, 0, GL); this._solid(x, y + 26, z, 10, 52, 10); });
    add('기어 채굴탑', '🏗', 398, -334, (x, y, z) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(B.box, 0x50565f, x + sx * 6, y + 20, z + sz * 6, 1.4, 40, 1.4); this.put(B.box, 0xffc233, x, y + 40, z, 15, 2, 15); this.put(B.cone, 0xd8dde3, x, y + 8, z, 6, 12, 6, 0, Math.PI); this.put(B.sph, 0xff3020, x, y + 42, z, 1.6, 1.6, 1.6, 0, 0, 0, GL); this._solid(x, y + 20, z, 14, 40, 14); });
    add('쌍둥이 화산', '🌋', 1150, 0, (x, y, z) => { for (const s of [-1, 1]) { this.put(B.cone, 0x2e2624, x + s * 22, y + 18, z, 36, 36, 36); this.put(B.cyl, 0xff6a20, x + s * 22, y + 35.5, z, 8, 1, 8, 0, 0, 0, GL); this.smokeEmitters.push({ pos: new THREE.Vector3(x + s * 22, y + 38, z), rate: 1.2, dark: true }); } });
    add('부서진 운석', '☄', 813, 813, (x, y, z) => { this.put(B.ico1, 0x241e1c, x, y + 6, z, 30, 26, 30); for (let k = 0; k < 6; k++) this.put(B.box, 0xff5a10, x + (k - 2.5) * 4, y + 12 + (k % 2) * 6, z + 14.5, 0.6, 9, 0.4, 0, 0, 0.6 - k * 0.2, GL); });
    add('용암 분수', '⛲', 20, 1150, (x, y, z) => { this.put(B.cyl, 0x2e2624, x, y + 3, z, 20, 6, 20); this.put(B.cyl, 0xff6a20, x, y + 6.1, z, 16, 0.3, 16, 0, 0, 0, GL); this.put(B.cone, 0xffa030, x, y + 16, z, 3, 20, 3, 0, 0, 0, GL); this._solid(x, y + 3, z, 18, 6, 18); });
    add('유황 굴뚝', '🟡', -813, 813, (x, y, z) => { for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, h = 14 + (k % 3) * 8; this.put(B.cyl, 0x5a5030, x + Math.cos(a) * 9, y + h / 2, z + Math.sin(a) * 9, 4, h, 4); this.put(B.cyl, 0xffe14d, x + Math.cos(a) * 9, y + h, z + Math.sin(a) * 9, 4.2, 0.6, 4.2, 0, 0, 0, GL); this.smokeEmitters.push({ pos: new THREE.Vector3(x + Math.cos(a) * 9, y + h + 1, z + Math.sin(a) * 9), rate: 0.5, dark: false }); } });
    add('흑요석 거울벽', '🪞', -1150, 0, (x, y, z) => { this.put(B.box, 0x0e0a14, x, y + 20, z, 4, 40, 34, 0, 0, 0.15); this.put(B.box, 0x2a2440, x + 2.1, y + 20, z, 0.2, 38, 32, 0, 0, 0.15); this._solid(x, y + 20, z, 6, 40, 34); });
    add('기어 송신탑', '📡', -813, -813, (x, y, z) => { this.put(B.cyl6, 0x3a4048, x, y + 25, z, 2, 50, 2); this.put(B.hemi, 0xb0b6be, x, y + 46, z, 12, 4, 12, 0, 1.1); this.put(B.sph, 0xff3020, x, y + 51, z, 1.4, 1.4, 1.4, 0, 0, 0, GL); this._solid(x, y + 25, z, 3, 50, 3); });
    add('불의 고리', '⭕', 813, -813, (x, y, z) => { this.put(B.torus, 0x2e2826, x, y + 18, z, 32, 32, 32); this.put(B.torus, 0xff6a20, x, y + 18, z, 30, 30, 10, 0, 0, 0, GL); });
  }
  // ---------- 우주선 랜드마크: 반응로·함교·포탑 같은 거대 기계 ----------
  _shipMarks(add, B) {
    const GL = 'glow', N1 = 0xff4fd8, N2 = 0x4fd8ff;
    add('반응로 코어', '⚛', 489, 178, (x, y, z) => { this.put(B.cyl, 0x3a4048, x, y + 3, z, 30, 6, 30); this.put(B.sph, N2, x, y + 18, z, 18, 18, 18, 0, 0, 0, GL); for (let k = 0; k < 3; k++) this.put(B.torus, 0x5d6572, x, y + 18, z, 28, 28, 28, k, k * 1.1, 0); this._solid(x, y + 3, z, 28, 6, 28); });
    add('함교 탑', '🏢', 130, 520, (x, y, z) => { this.put(B.box, 0x4a515c, x, y + 30, z, 18, 60, 18); this.put(B.box, N1, x, y + 50, z + 9.1, 14, 3, 0.2, 0, 0, 0, GL); this.put(B.box, 0x2a2e35, x, y + 62, z, 26, 4, 26); this._solid(x, y + 30, z, 18, 60, 18); });
    add('거대 포탑', '🔫', -398, 334, (x, y, z) => { this.put(B.cyl, 0x3a4048, x, y + 6, z, 22, 12, 22); this.put(B.hemi, 0x5d6572, x, y + 12, z, 18, 10, 18); for (const s of [-1, 1]) this.put(B.cyl, 0x2a2e35, x + s * 4, y + 16, z + 16, 2.4, 26, 2.4, 0, Math.PI / 2 - 0.3); this._solid(x, y + 6, z, 20, 12, 20); });
    add('격납고', '🛸', -489, -178, (x, y, z) => { this.put(B.box, 0x4a515c, x, y + 14, z, 50, 28, 36); this.put(B.box, 0x111318, x, y + 10, z + 18.1, 30, 20, 0.3); this.put(B.box, N2, x, y + 21, z + 18.2, 30, 0.6, 0.3, 0, 0, 0, GL); this._solid(x, y + 14, z, 50, 28, 36); });
    add('에너지 기둥', '⚡', -90, -540, (x, y, z) => { this.put(B.cyl6, 0x3a4048, x, y + 30, z, 8, 60, 8); this.put(B.cyl6, N1, x, y + 30, z, 8.3, 50, 2, 0, 0, 0, GL); this._solid(x, y + 30, z, 7, 60, 7); });
    add('레이더 접시', '📡', 398, -334, (x, y, z) => { this.put(B.cyl6, 0x3a4048, x, y + 12, z, 3, 24, 3); this.put(B.hemi, 0xb0b6be, x, y + 26, z, 22, 6, 22, 0, 1.0); this.put(B.sph, N1, x, y + 30, z, 1.5, 1.5, 1.5, 0, 0, 0, GL); this._solid(x, y + 12, z, 4, 24, 4); });
    add('엔진 노즐', '🚀', 1150, 0, (x, y, z) => { this.put(B.cyl, 0x2a2e35, x, y + 18, z, 36, 36, 36, 0, 0, Math.PI / 2); this.put(B.cyl, N2, x - 18.5, y + 18, z, 26, 0.8, 26, 0, 0, Math.PI / 2, GL); });
    add('사령관 동상', '🗿', 813, 813, (x, y, z) => { this.put(B.box, 0x3a4048, x, y + 4, z, 16, 8, 16); this.put(B.cyl, 0x6a4a9a, x, y + 22, z, 8, 28, 8); this.put(B.sph, 0x6a4a9a, x, y + 40, z, 9, 10, 9); this.put(B.sph, 0xff3020, x + 2, y + 41, z + 4, 2, 2, 1, 0, 0, 0, GL); this._solid(x, y + 4, z, 16, 8, 16); });
    add('워프 게이트', '🌀', 20, 1150, (x, y, z) => { this.put(B.torus, 0x4a515c, x, y + 24, z, 44, 44, 44); this.put(B.torus, N1, x, y + 24, z, 40, 40, 8, 0, 0, 0, GL); });
    add('냉각 탑', '❄', -813, 813, (x, y, z) => { for (let k = 0; k < 3; k++) { this.put(B.cyl, 0x5d6572, x + (k - 1) * 16, y + 15, z, 12, 30, 12); this.put(B.cyl, N2, x + (k - 1) * 16, y + 30.2, z, 10, 0.4, 10, 0, 0, 0, GL); this.smokeEmitters.push({ pos: new THREE.Vector3(x + (k - 1) * 16, y + 32, z), rate: 0.6, dark: false }); } });
    add('로봇 조립대', '🤖', -1150, 0, (x, y, z) => { this.put(B.box, 0x3a4048, x, y + 2, z, 40, 4, 20); for (let k = 0; k < 4; k++) { this.put(B.box, 0x5a6478, x - 15 + k * 10, y + 9, z, 4, 10, 3); this.put(B.sph, 0xff2a10, x - 15 + k * 10, y + 15, z + 1.5, 0.8, 0.8, 0.4, 0, 0, 0, GL); } this._solid(x, y + 2, z, 40, 4, 20); });
    add('중력 구체', '🔮', -813, -813, (x, y, z) => { this.put(B.sph, 0x9a5aff, x, y + 26, z, 20, 20, 20, 0, 0, 0, GL); this.put(B.cyl, 0x3a4048, x, y + 3, z, 14, 6, 14); });
    add('보급 창고', '📦', 813, -813, (x, y, z) => { for (let k = 0; k < 8; k++) this.put(B.box, [0x5d6572, 0xffc233, 0x3a6fd0][k % 3], x + (k % 4) * 9 - 13, y + 4 + Math.floor(k / 4) * 8, z, 8, 8, 8); this._solid(x, y + 8, z, 36, 16, 8); });
  }
  // ---------- 우주선 외벽: 아주 높아서 못 넘음. 슈퍼 상태로 부딪히면 캐릭터만 지나갈 구멍이 뚫림 (저장됨) ----------
  _hull() {
    const Rb = CFG.world.barrierR, segW = 24, N = Math.ceil(Math.PI * 2 * Rb / segW), H = 90;
    const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(segW + 0.6, H, 2.5), new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), N);
    const neon = new THREE.InstancedMesh(new THREE.BoxGeometry(segW + 0.7, 0.8, 2.6), new THREE.MeshBasicMaterial({ color: 0xff4fd8, toneMapped: false }), N * 2);
    let ni = 0;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, x = Math.cos(a) * Rb, z = Math.sin(a) * Rb, y = terrainHeight(x * 0.995, z * 0.995) - 2, yaw = -a + Math.PI / 2;
      _m.compose(_p.set(x, y + H / 2, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1)); panel.setMatrixAt(i, _m);
      for (const hy of [8, 30]) { _m.compose(_p.set(x, y + hy, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1)); neon.setMatrixAt(ni++, _m); }
    }
    panel.instanceMatrix.needsUpdate = true; neon.instanceMatrix.needsUpdate = true;
    this.barrierGroup.add(panel, neon);
    this.holeGroup = new THREE.Group(); this.root.add(this.holeGroup);
    for (const h of this.hullHoles) this._holeMesh(h);
  }
  _holeMesh(h) {
    const Rb = CFG.world.barrierR, g = new THREE.Group();
    if (!this._holeMats) this._holeMats = { space: new THREE.MeshBasicMaterial({ color: 0x02030a, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 }), rim: new THREE.MeshBasicMaterial({ color: 0xff8a30, toneMapped: false }) };
    for (const off of [-1.32, 1.32]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14), this._holeMats.space); d.position.set(0, 0, off); g.add(d);
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 4, 14), this._holeMats.rim); r.position.set(0, 0, off * 1.01); g.add(r);
    }
    g.position.set(Math.cos(h.a) * Rb, h.y + 1.3, Math.sin(h.a) * Rb);
    g.rotation.y = -h.a + Math.PI / 2;
    g.scale.set(1, 1.25, 1);
    this.holeGroup.add(g);
  }
  breakHull(a, y) {
    const Rb = CFG.world.barrierR;
    if (this.hullHoles.some((h) => Math.abs(Math.atan2(Math.sin(a - h.a), Math.cos(a - h.a))) * Rb < 3)) return false;
    const gy = terrainHeight(Math.cos(a) * (Rb - 4), Math.sin(a) * (Rb - 4));
    const h = { a: +a.toFixed(5), y: +Math.max(gy, Math.min(y, gy + 0.5)).toFixed(2) };
    this.hullHoles.push(h); this._holeMesh(h);
    return h;
  }
  // ---------- 6스테이지(우주): 땅 없이 최소한만 ----------
  _buildSpace() {
    this.terrain = { lods: [{ step: 4 }], update() {}, chunks: new Map() };
    this.trees = { round: { nearR: 300 } }; this.treeSets = []; this.treeTypes = [];
    this.spawn = { pos: new THREE.Vector3(0, 0, 0), yaw: 0 };
    this.startCheckpoint = { pos: new THREE.Vector3(0, 0, 0), active: true };
    this.barrierGroup = new THREE.Group(); this.barrierUp = false;
    this.heartTree = null; this.questTargets = { base: new THREE.Vector3(), factory: new THREE.Vector3(), lab: new THREE.Vector3(), camp: new THREE.Vector3(), crystal: new THREE.Vector3(), heartTree: new THREE.Vector3(), bigStar: new THREE.Vector3(0, -999, 0) };
    this.labPad = new THREE.Vector3(); this.exitGate = new THREE.Vector3();
    const cv = document.createElement('canvas'); cv.width = cv.height = 8; cv.getContext('2d').fillRect(0, 0, 8, 8);
    this.mapCanvas = cv; this.mapHalf = 1800;
  }

  removeBarrier() {
    this.barrierUp = false; this.barrierSink = 0;
    for (const e of this.smokeEmitters) if (e.barrier) e.rate = 0;
  }

  nearestCheckpoint(pos) {
    let best = this.startCheckpoint, bd = Infinity;
    for (const c of this.checkpoints) {
      if (!c.active) continue;
      const d = c.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
