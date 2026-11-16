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
    skyTop: 0x2a74ee, skyHorizon: 0xc4e6ff, skyBottom: 0xa7c9e4, sun: 0xfff0cc, fog: 0xcbe6ff, fogDensity: 0.00105,
    hemiSky: 0xdcefff, hemiGround: 0x62803c, sunInt: 2.3, hemiInt: 1.05,
    waterDeep: 0x1b6fc4, waterShallow: 0x4fd6e6, swampWater: 0x8040d8, frozen: false, grass: true, snowyTrees: false,
    villainMetal: 0x50565f,
  },
  ice: {
    grassA: 0xf4f8ff, grassB: 0xdde8f6, grassDry: 0xcfe0f2, dirt: 0xb3c4d8, road: 0xd3e0ee, roadLine: 0xffffff,
    rock: 0x8794a8, cliffA: 0x8fc0ee, cliffB: 0xd6ebff, metal: 0x58637a, metalLine: 0x394255, rust: 0x5d7aa0,
    swampA: 0xc7dcf2, swampB: 0xa9b6ff, sand: 0xe8f0ff, underwater: 0xb8d4ee, snow: 0xffffff, mountain: 0xbfcbdc,
    leaf: [0xe9f3ff, 0xd8e8f8, 0xf6faff, 0xcfe2f5], pine: [0x2a5a4a, 0x386c5c], caps: [0x7fd8ff, 0xa0a8ff, 0xdff6ff],
    skyTop: 0x4a86e0, skyHorizon: 0xe2efff, skyBottom: 0xc8d8ea, sun: 0xfff6e8, fog: 0xe4eefa, fogDensity: 0.0012,
    hemiSky: 0xeef6ff, hemiGround: 0x9aaabf, sunInt: 2.0, hemiInt: 1.15,
    waterDeep: 0x9fd0f0, waterShallow: 0xd8f0ff, swampWater: 0xb0a8ff, frozen: true, grass: false, snowyTrees: true,
    villainMetal: 0x4a5266,
  },
};

// ---------------- 구역 ----------------
export const ZONES = {
  rust: { x: 470, z: 400, r: 300, name: '녹슨 공장' },
  swamp: { x: -470, z: -380, r: 300, name: '보라 늪' },
  mesa: { x: -480, z: 400, r: 300, name: '노란 협곡' },
  lake: { x: 460, z: -420, r: 290, name: '파란 호수' },
};
const ZL = [ZONES.rust, ZONES.swamp, ZONES.mesa, ZONES.lake];
const ZW = new Float32Array(4);
export function zoneWeights(x, z) {
  const wob = (vnoise(x * 0.008 + 50, z * 0.008) - 0.5) * 110;
  for (let i = 0; i < 4; i++) {
    const Z = ZL[i];
    const d = Math.hypot(x - Z.x, z - Z.z) + wob;
    ZW[i] = 1 - smooth(Z.r * 0.6, Z.r, d);
  }
  return ZW;
}

// ---------------- 퀘스트 장소 (평평하게 다짐) ----------------
export const SITES = {
  base: { x: -150, z: 230, r: 42, h: 3.5 },      // 퀘스트1: 로봇 기지
  factory: { x: 230, z: -230, r: 50, h: 3 },     // 퀘스트2: 로봇 생산 공장
  lab: { x: -520, z: -420, r: 60, h: 2.5 },      // 퀘스트4~5: 과학 연구소 (보라 늪 한가운데)
};
const SITES_LIST = Object.values(SITES);

// ---------------- 길 ----------------
export const ROAD = { width: 7, shoulder: 10 };
export const startRoadX = (z) => 30 * Math.sin(z * 0.009);
export const ringR = (th) => 430 + 40 * Math.sin(3 * th + 0.5);
export function ringPoint(th, out = new THREE.Vector3()) { const r = ringR(th); return out.set(r * Math.cos(th), 0, r * Math.sin(th)); }
export function ringDir(th) {
  const r = ringR(th), dr = 120 * Math.cos(3 * th + 0.5);
  return new THREE.Vector3(dr * Math.cos(th) - r * Math.sin(th), 0, dr * Math.sin(th) + r * Math.cos(th)).normalize();
}
export function startRoadDir(z) { return new THREE.Vector3(30 * 0.009 * Math.cos(z * 0.009), 0, 1).normalize(); }
export function roadDist(x, z) {
  let d = Infinity;
  if (z > -70 && z < 450) d = Math.abs(x - startRoadX(z)) + Math.max(0, -60 - z) * 3;
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  return Math.min(d, Math.abs(r - ringR(th)));
}
function roadMask(x, z) { return 1 - smooth(ROAD.width, ROAD.width + ROAD.shoulder, roadDist(x, z)); }
const roadBase = (x, z) => 3 + 2.5 * (vnoise(x * 0.004, z * 0.004) * 2 - 1);

// ---------------- 지형 높이 ----------------
export function terrainHeight(x, z) {
  zoneWeights(x, z);
  let h = 3 + (fbm(x * 0.0045 + 3, z * 0.0045, 3) - 0.5) * 22 + (vnoise(x * 0.035, z * 0.035) - 0.5) * 2.2;
  h = Math.max(h, 0.8);
  if (ZW[0] > 0) h = mix(h, 2.5 + vnoise(x * 0.02, z * 0.02) * 0.4, ZW[0]);
  if (ZW[1] > 0) h = mix(h, 0.3 + (fbm(x * 0.02 + 7, z * 0.02, 3) - 0.5) * 8, ZW[1]);
  if (ZW[2] > 0) {
    const v = fbm(x * 0.007 + 11, z * 0.007 - 4, 3) * 7;
    const fl = Math.floor(v), t = smooth(0.8, 1, v - fl);
    h = mix(h, Math.max(1.5, 9 * (fl + t) - 8), ZW[2]);
  }
  if (ZW[3] > 0) {
    const d = Math.hypot(x - ZONES.lake.x, z - ZONES.lake.z) / ZONES.lake.r;
    let lk = mix(-4, 2, smooth(0.45, 0.85, d));
    lk += Math.max(0, vnoise(x * 0.015, z * 0.015) - 0.68) * 30;
    h = mix(h, lk, ZW[3]);
  }
  const ds = Math.hypot(x, z);
  h = mix(h, 3, 1 - smooth(25, 60, ds));
  for (const F of SITES_LIST) { const d = Math.hypot(x - F.x, z - F.z); if (d < F.r) h = mix(h, F.h, 1 - smooth(F.r * 0.65, F.r, d)); }
  const rm = roadMask(x, z);
  if (rm > 0) h = mix(h, roadBase(x, z), rm);
  if (ds > 860) h += smooth(880, 1120, ds) * (45 + 110 * fbm(x * 0.004, z * 0.004, 3));
  return h;
}

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
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

class Batch {
  constructor(cell = 220) { this.cell = cell; this.cells = new Map(); }
  add(geo, color, m, kind = 'lit') {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const key = kind + ':' + Math.floor(m.elements[12] / this.cell) + ',' + Math.floor(m.elements[14] / this.cell);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(g);
  }
  build(parent, mats, shadows) {
    for (const [key, list] of this.cells) {
      const kind = key.split(':')[0];
      const geo = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[kind]);
      mesh.castShadow = shadows && kind === 'lit'; mesh.receiveShadow = kind === 'lit';
      parent.add(mesh);
    }
    this.cells.clear();
  }
}

// 여러 부품으로 된 물체를 대량으로 (나무 등)
class InstSet {
  constructor(parts, cap) { // parts: [{geo, mat, local: Matrix4, colors?: [..]}]
    this.parts = parts.map((p) => ({ ...p, mesh: new THREE.InstancedMesh(p.geo, p.mat, cap), n: 0 }));
    for (const p of this.parts) if (p.colors) p.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  }
  add(x, y, z, s, ry, rnd, sy = s) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, sy, s));
    const mm = new THREE.Matrix4();
    for (const p of this.parts) {
      if (p.mesh.count <= p.n) continue;
      mm.multiplyMatrices(_m, p.local);
      p.mesh.setMatrixAt(p.n, mm);
      if (p.colors) p.mesh.setColorAt(p.n, _c.set(p.colors[Math.floor(rnd * p.colors.length * 0.999)]));
      p.n++;
    }
  }
  finish(parent, castShadow) {
    for (const p of this.parts) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      p.mesh.castShadow = castShadow; p.mesh.receiveShadow = true;
      p.mesh.computeBoundingSphere?.();
      parent.add(p.mesh);
    }
  }
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

// =====================================================================
export class World {
  constructor(scene, themeName = 'forest', quality = { mobile: false }) {
    this.scene = scene;
    this.themeName = themeName;
    this.T = THEMES[themeName];
    this.q = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    this.platforms = []; this.pgrid = new Map(); this.movers = [];
    this.ramps = []; this.loops = []; this.springs = []; this.boostPads = []; this.checkpoints = [];
    this.treeGrid = new Map(); this.ringSpots = []; this.enemySpots = []; this.hazards = []; this.walls = [];
    this.spinners = []; this.smokeEmitters = []; this.searchlights = []; this.lights = [];
    this.questTargets = {}; this.secret = null;
    this.barrierUp = true; this.barrierSink = 0;
    this.occ = new Set();
    this.rand = mulberry32(themeName === 'forest' ? 1234 : 777);
    this.batch = new Batch();
    this.matLit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this._build();
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
    if (this.T.frozen) return Math.max(h, 0);
    return h < CFG.water.swimDepth ? CFG.water.swimDepth : h;
  }
  groundAt(x, z, y = Infinity, stepUp = 0.9) {
    let h = terrainHeight(x, z), surface = 'terrain';
    if (this.T.frozen) { if (h < 0) { h = 0; surface = 'ice'; } }
    else if (h < CFG.water.swimDepth) { h = CFG.water.swimDepth; surface = 'water'; }
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
    this.lastSurface = surface;
    return h;
  }
  // 카메라가 벽 속으로 들어가지 않게
  solidAt(p) {
    for (const b of this._near(p.x, p.z)) {
      if (b.dead || b.kind === 'disc') continue;
      if (p.x > b.min.x - 0.3 && p.x < b.max.x + 0.3 && p.z > b.min.z - 0.3 && p.z < b.max.z + 0.3 && p.y > b.min.y - 0.3 && p.y < b.max.y + 0.3) return true;
    }
    return false;
  }
  isWater(x, z) { return !this.T.frozen && terrainHeight(x, z) < 0; }

  collide(pos, radius, height, vel) {
    let hit = false;
    const doBox = (p) => {
      if (p.dead || p.kind === 'disc') return;
      if (pos.y >= p.max.y - 0.05 || pos.y + height <= p.min.y) return;
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
    this.lastHitBox = null;
    for (const p of this._near(pos.x, pos.z)) doBox(p);
    for (const p of this.movers) doBox(p);
    const gx = Math.floor(pos.x / 20), gz = Math.floor(pos.z / 20);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.treeGrid.get((gx + i) * 100003 + (gz + j));
      if (!list) continue;
      for (const t of list) {
        if (pos.y > t.y + t.h) continue;
        const dx = pos.x - t.x, dz = pos.z - t.z, rr = radius + t.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
          pos.x += nx * (rr - d); pos.z += nz * (rr - d);
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
          hit = true;
        }
      }
    }
    // 바깥 경계 (장벽이 있을 때는 장벽, 없으면 산)
    const r = Math.hypot(pos.x, pos.z);
    const lim = this.barrierUp ? CFG.world.barrierR - 3 : CFG.world.exitR + 60;
    if (r > lim) {
      const nx = pos.x / r, nz = pos.z / r;
      pos.x = nx * lim; pos.z = nz * lim;
      const vn = vel.x * nx + vel.z * nz;
      if (vn > 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      hit = true;
    }
    return hit;
  }

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
    this.batch.add(geo, color, _m, kind);
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
  _tree(x, z, r, h) {
    const t = { x, z, y: terrainHeight(x, z), r, h };
    const k = Math.floor(x / 20) * 100003 + Math.floor(z / 20);
    if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
    this.treeGrid.get(k).push(t);
  }

  // =================================================================
  _build() {
    this._terrain();
    this._makeTreeSets();
    this._start();
    this._robotBase();
    this._smallFactory();
    this._lab();
    this._mainRoad();
    this._ringRoad();
    this._zoneMeadow();
    this._zoneRust();
    this._zoneSwamp();
    this._zoneMesa();
    this._zoneLake();
    this._breakableWalls();
    this._barrier();
    this._outside();
    this._fieldFill();
    for (const s of this.treeSets) s.finish(this.root, !this.q.mobile);
    this.batch.build(this.root, { lit: this.matLit, glow: this.matGlow }, !this.q.mobile);
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
    if (ds > 870) { out.lerp(_c.set(T.mountain), smooth(900, 1000, ds) * 0.7); if (h > 85) out.lerp(_c.set(T.snow), smooth(85, 110, h)); }
    if (T.snowyTrees && slope < 0.6) out.lerp(_c.set(0xffffff), 0.25);
    return out;
  }

  _terrainMesh(half, step, holeHalf) {
    const N = Math.round(half * 2 / step) + 1;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -half + i * step, z = -half + j * step;
      H[j * N + i] = terrainHeight(x, z);
    }
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -half + i * step, z = -half + j * step, h = H[k];
      const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)];
      const hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
      const slope = Math.hypot(hx, hz) / (2 * step);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.colorAt(x, z, h, slope, c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      if (holeHalf) {
        const x0 = -half + i * step, z0 = -half + j * step;
        if (x0 >= -holeHalf && x0 + step <= holeHalf && z0 >= -holeHalf && z0 + step <= holeHalf) continue;
      }
      const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(N * N > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.matLit);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }
  _terrain() {
    const inner = 900;
    this._terrainMesh(inner, this.q.mobile ? 6 : 4, 0);
    this._terrainMesh(CFG.world.terrainHalf, 25, inner);
  }

  // ---------- 나무 종류 ----------
  _makeTreeSets() {
    const T = this.T, lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const leafMat = lam(0xffffff, { flatShading: true });
    const cap = this.q.mobile ? 0.6 : 1;
    this.trees = {
      round: new InstSet([
        { geo: new THREE.CylinderGeometry(0.3, 0.5, 1, 7), mat: lam(0x8b5a2b), local: L(0, 1.6, 0, 1, 3.2, 1) },
        { geo: new THREE.IcosahedronGeometry(1, 1), mat: leafMat, local: L(0, 4.3, 0, 2.6, 2.3, 2.6), colors: T.leaf },
        { geo: new THREE.IcosahedronGeometry(1, 1), mat: leafMat, local: L(0.9, 3.6, 0.4, 1.8, 1.6, 1.8), colors: T.leaf },
        { geo: new THREE.IcosahedronGeometry(1, 1), mat: leafMat, local: L(-0.8, 3.8, -0.5, 1.7, 1.5, 1.7), colors: T.leaf },
      ], Math.floor(2600 * cap)),
      pine: new InstSet([
        { geo: new THREE.CylinderGeometry(0.25, 0.4, 1, 6), mat: lam(0x6b4423), local: L(0, 1, 0, 1, 2, 1) },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: leafMat, local: L(0, 2.8, 0, 2.4, 3, 2.4), colors: T.pine },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: leafMat, local: L(0, 4.4, 0, 1.8, 2.6, 1.8), colors: T.pine },
        { geo: new THREE.ConeGeometry(1, 1, 8), mat: T.snowyTrees ? lam(0xffffff) : leafMat, local: L(0, 5.8, 0, 1.1, 2, 1.1), colors: T.snowyTrees ? null : T.pine },
      ], Math.floor(2600 * cap)),
      mush: new InstSet([
        { geo: new THREE.CylinderGeometry(0.35, 0.55, 1, 8), mat: lam(0xf0e6d8), local: L(0, 1.6, 0, 1, 3.2, 1) },
        { geo: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: lam(0xffffff, { emissive: 0x220a33 }), local: L(0, 3, 0, 2.4, 1.4, 2.4), colors: T.caps },
        { geo: new THREE.SphereGeometry(0.2, 6, 4), mat: new THREE.MeshBasicMaterial({ color: 0xfff6b0, toneMapped: false }), local: L(0.8, 3.9, 0.6, 1, 1, 1) },
      ], Math.floor(700 * cap)),
      metal: new InstSet([
        { geo: new THREE.CylinderGeometry(0.25, 0.45, 1, 6), mat: lam(0x6d737c), local: L(0, 1.8, 0, 1, 3.6, 1) },
        { geo: new THREE.ConeGeometry(1, 1, 6), mat: lam(0x454b55, { flatShading: true }), local: L(0, 4.3, 0, 2, 3.2, 2) },
        { geo: new THREE.BoxGeometry(1, 1, 1), mat: lam(0x9a5530), local: L(0, 2.2, 0, 1.2, 0.25, 1.2, 0, 0.4, 0) },
        { geo: new THREE.SphereGeometry(0.22, 6, 4), mat: new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), local: L(0, 6.1, 0, 1, 1, 1) },
      ], Math.floor(900 * cap)),
      bush: new InstSet([
        { geo: new THREE.IcosahedronGeometry(1, 1), mat: leafMat, local: L(0, 0.5, 0, 1.3, 0.9, 1.3), colors: T.leaf },
        { geo: new THREE.IcosahedronGeometry(1, 1), mat: leafMat, local: L(0.8, 0.4, 0.3, 0.9, 0.7, 0.9), colors: T.leaf },
      ], Math.floor(2500 * cap)),
      rock: new InstSet([
        { geo: new THREE.DodecahedronGeometry(1, 0), mat: lam(0xffffff, { flatShading: true }), local: L(0, 0.3, 0, 1, 0.7, 1.2), colors: [T.rock, 0x9c968a, 0x7d7a72] },
      ], Math.floor(1800 * cap)),
      flower: new InstSet([
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 1, 3), mat: lam(0x3c8f2f), local: L(0, 0.3, 0, 1, 0.6, 1) },
        { geo: new THREE.IcosahedronGeometry(0.16, 0), mat: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), local: L(0, 0.62, 0, 1, 0.6, 1), colors: [0xffffff, 0xffe14d, 0xff7ab6, 0x9f7bff, 0xff6040] },
      ], Math.floor(5000 * cap)),
    };
    this.treeSets = Object.values(this.trees);
  }
  _plantTree(type, x, z, s = 1) {
    const y = terrainHeight(x, z);
    if (y < 0.2 && !this.T.frozen) return false;
    this.trees[type].add(x, y - 0.1, z, s, this.rand() * 6.28, this.rand());
    if (type !== 'bush' && type !== 'flower' && type !== 'rock') this._tree(x, z, (type === 'mush' ? 0.55 : 0.45) * s, 6 * s);
    if (type === 'rock' && s > 1.4) this._tree(x, z, 0.9 * s, 0.8 * s);
    this._occupy(x, z, type === 'flower' ? 0.3 : 1.5 * s);
    return true;
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
    base = base.clone(); base.y = terrainHeight(base.x, base.z);
    fwd = fwd.clone().normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const loop = { base, fwd, side, R, offset, length: 2 * Math.PI * R, width: CFG.loop.width };
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
    const N = 160, W = loop.width;
    const pos = [], col = [], idx = [];
    const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      loop.pathAt(t, p); loop.centerAt(t, c);
      n.copy(c).sub(p).normalize().multiplyScalar(-0.15);
      const a = p.clone().addScaledVector(side, -W / 2).add(n), b = p.clone().addScaledVector(side, W / 2).add(n);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const stripe = Math.floor(i / 8) % 2 ? [0.15, 0.55, 1] : [1, 0.85, 0.3];
      col.push(...stripe, ...stripe);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 80; i++) { loop.pathAt(i / 80, p); pts.push(p.clone().addScaledVector(side, s * W / 2)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      tube.castShadow = true;
      this.root.add(tube);
    }
    // 받침 기둥
    for (const s of [-1, 1]) {
      const q = base.clone().addScaledVector(side, s * (offset / 2 + loop.width / 2 + 1.5));
      this.put(BASE.box, 0x5d646e, q.x, base.y + R * 0.5, q.z, 0.8, R, 0.8);
      this.put(BASE.box, 0xffc233, q.x, base.y + R, q.z, 1.2, 0.6, 1.2);
    }
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
      for (let i = 0; i < 2; i++) { const y = 20 + i * 55; g.beginPath(); g.moveTo(8, y + 40); g.lineTo(32, y); g.lineTo(56, y + 40); g.lineTo(44, y + 40); g.lineTo(32, y + 20); g.lineTo(20, y + 40); g.fill(); }
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
  fence(x1, z1, x2, z2, color = 0xa8743f) {
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
    const y = terrainHeight(x, z);
    this.put(BASE.cyl, 0x7a4f28, x, y + 0.35, z, 0.7, len, 0.7, yaw, 0, Math.PI / 2);
    this.putRel(BASE.cyl, 0xd9b27a, x, z, y, yaw, len / 2 + 0.01, 0.35, 0, 0.6, 0.02, 0.6, 0, 0, Math.PI / 2);
    this._occupy(x, z, len / 2);
  }
  powerPole(x, z) {
    const y = terrainHeight(x, z);
    this.put(BASE.cyl6, 0x6b5a48, x, y + 4, z, 0.3, 8, 0.3);
    this.put(BASE.box, 0x6b5a48, x, y + 7.4, z, 2.4, 0.2, 0.2);
    this.put(BASE.sph, 0xff3020, x, y + 8.1, z, 0.3, 0.3, 0.3, 0, 0, 0, 'glow');
    this._tree(x, z, 0.3, 8);
    return new THREE.Vector3(x, y + 7.4, z);
  }
  cable(a, b) {
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
    this._heartTree(0, -54);
  }

  // ---------- 퀘스트 1: 로봇 기지 ----------
  _robotBase() {
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
  }

  // ---------- 퀘스트 2: 로봇 생산 공장 (안으로 들어가서 싸움) ----------
  _smallFactory() {
    const F = SITES.factory, y = F.h;
    this.questTargets.factory = new THREE.Vector3(F.x, y, F.z);
    const W = 44, D = 34, H = 13, t = 1.2, door = 14;
    const wall = (cx, cz, sx, sz) => { this.put(BASE.box, 0x7b828c, cx, y + H / 2, cz, sx, H, sz); this._solid(cx, y + H / 2, cz, sx, H, sz); };
    wall(F.x, F.z - D / 2, W, t);
    wall(F.x - W / 2, F.z, t, D); wall(F.x + W / 2, F.z, t, D);
    wall(F.x - (W + door) / 4, F.z + D / 2, (W - door) / 2, t); wall(F.x + (W + door) / 4, F.z + D / 2, (W - door) / 2, t);
    this.put(BASE.box, 0x7b828c, F.x, y + H - 1.5, F.z + D / 2, door, 3, t);
    for (const cx of [F.x - W * 0.3, F.x + W * 0.3]) { this.put(BASE.box, 0x4a5058, cx, y + H + 0.5, F.z, W * 0.4, 1, D + 1); this._solid(cx, y + H + 0.5, F.z, W * 0.4, 1, D + 1); }
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
  }

  // ---------- 퀘스트 4~5: 과학 연구소 ----------
  _lab() {
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
  }

  // ---------- 할아버지 나무 (숲의 별 조각을 품은 나무) + 기어 군단의 흡수 장치 ----------
  _heartTree(x, z) {
    const y = terrainHeight(x, z) - 0.5;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const bark = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.5, 26, 12), bark); trunk.position.y = 13;
    g.add(trunk);
    for (let i = 0; i < 6; i++) { // 뿌리
      const a = i / 6 * Math.PI * 2, r = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 9, 6), bark);
      r.position.set(Math.cos(a) * 5, 1.2, Math.sin(a) * 5); r.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); g.add(r);
    }
    for (let i = 0; i < 5; i++) { // 굵은 가지
      const a = i / 5 * Math.PI * 2 + 0.4, b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 14, 8), bark);
      b.position.set(Math.cos(a) * 5, 26, Math.sin(a) * 5); b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(b);
    }
    this.treeLeafMat = new THREE.MeshLambertMaterial({ color: 0x7f8a6a, flatShading: true });
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const blobs = [[0, 34, 0, 13], [9, 30, 4, 9], [-9, 31, -3, 10], [3, 29, -10, 9], [-4, 30, 10, 9], [0, 41, 0, 8], [7, 37, -6, 7], [-7, 37, 6, 7]];
    for (const [bx, by, bz, r] of blobs) { const m = new THREE.Mesh(leafGeo, this.treeLeafMat); m.position.set(bx, by, bz); m.scale.set(r, r * 0.8, r); g.add(m); }
    // 별 조각 (초록) — 나무 가운데에서 빛남
    this.treeCore = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshBasicMaterial({ color: 0x5a8a5a, toneMapped: false }));
    this.treeCore.position.set(0, 12, 3.4); g.add(this.treeCore);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.root.add(g);
    this._tree(x, z, 5.2, 30);
    // 흡수 장치: 줄기를 조이는 고리 + 빨간 불빛 + 땅속으로 들어가는 관
    const drain = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x50565f }), red = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), yel = new THREE.MeshLambertMaterial({ color: 0xffc233 });
    for (const hy of [4, 9, 15]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8 - hy * 0.1, 0.5, 8, 24), metal); ring.rotation.x = Math.PI / 2; ring.position.set(x, y + hy, z); drain.add(ring);
      for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), red); const a = k / 4 * Math.PI * 2; l.position.set(x + Math.cos(a) * (4.8 - hy * 0.1), y + hy, z + Math.sin(a) * (4.8 - hy * 0.1)); drain.add(l); }
    }
    for (const a of [0.6, 2.4, 4.2]) { // 관 3개: 나무에서 숲 바깥쪽으로
      const dx = Math.cos(a), dz = Math.sin(a);
      const sx = x + dx * 4.6, sz = z + dz * 4.6;
      const pump = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), metal); pump.position.set(sx + dx * 2, y + 1.5, sz + dz * 2); drain.add(pump);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.5, 3.05), yel); stripe.position.copy(pump.position).add(new THREE.Vector3(0, 0.6, 0)); drain.add(stripe);
      const len = 60, mx = sx + dx * (len / 2 + 3), mz = sz + dz * (len / 2 + 3);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, len, 10), metal);
      pipe.position.set(mx, Math.max(terrainHeight(mx, mz), y) + 1.4, mz); pipe.rotation.set(0, 0, 0); pipe.rotation.order = 'YXZ'; pipe.rotation.y = Math.atan2(dx, dz); pipe.rotation.x = Math.PI / 2;
      drain.add(pipe);
      for (let k = 0; k < 5; k++) { // 관 속을 흘러가는 초록 빛
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.8, toneMapped: false }));
        glow.userData = { sx: sx + dx * 3, sz: sz + dz * 3, dx, dz, len, k, py: pipe.position.y };
        drain.add(glow);
      }
    }
    drain.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root.add(drain);
    this.treeDrain = drain;
    this.heartTree = { pos: new THREE.Vector3(x, y, z), restored: false, glowT: 0 };
    this.questTargets.heartTree = new THREE.Vector3(x, y, z);
    this._occupy(x, z, 12);
  }
  restoreTree() {
    if (!this.heartTree || this.heartTree.restored) return;
    this.heartTree.restored = true;
    this.treeDrain.visible = false;
  }

  _mainRoad() {
    const P = (z) => new THREE.Vector3(startRoadX(z), null, z);
    for (let z = 30; z < 420; z += 40) {
      if ([150, 300, 220].some((c) => Math.abs(z - c) < 30)) continue;
      this._ringLine(P(z), P(z + 22), 6);
    }
    this.questTargets.firstFlag = this._addCheckpoint(startRoadX(95) - 10, 95).pos;
    this._addCheckpoint(startRoadX(205) - 10, 205);
    this._addCheckpoint(startRoadX(345) - 10, 345);
    this._addBoostPad(P(118), startRoadDir(118));
    const L1 = this._addLoop(new THREE.Vector3(startRoadX(150), 0, 150), startRoadDir(150));
    this.questTargets.loop = L1.entry.clone();
    this._addBoostPad(P(268), startRoadDir(268));
    this._addLoop(new THREE.Vector3(startRoadX(300), 0, 300), startRoadDir(300));
    this._addRamp(new THREE.Vector3(startRoadX(220), 0, 220), startRoadDir(220), 8, 14, 3.5);
    this._ringArc(new THREE.Vector3(startRoadX(242), 0, 242), startRoadDir(242), 26, 6, 9, 3);
    // 길가: 울타리, 가로등, 표지판
    for (let z = 40; z < 420; z += 18) {
      if ([150, 300].some((c) => Math.abs(z - c) < 22)) continue;
      for (const s of [-1, 1]) {
        const x = startRoadX(z) + s * (ROAD.width + 4);
        if (this.rand() < 0.55) this.fence(x, z, startRoadX(z + 12) + s * (ROAD.width + 4), z + 12);
      }
      if (z % 54 === 40) this.warningSign(startRoadX(z) + ROAD.width + 6, z + 6, Math.PI);
    }
    for (let z = 60; z < 420; z += 70) this.signpost(startRoadX(z) - ROAD.width - 5, z, 0.2);
    for (let z = 20; z < 420; z += 4) { // 몬스터
      if (z % 26 !== 0 || [150, 300, 220].some((c) => Math.abs(z - c) < 25)) continue;
      this.enemySpots.push({ pos: new THREE.Vector3(startRoadX(z) + (this.rand() - 0.5) * 10, 0, z), type: 'beetle' });
    }
  }

  _ringRoad() {
    const thLoops = [0.25, 2.55, 4.3];
    for (let th = 0; th < Math.PI * 2; th += 0.06) {
      if (thLoops.some((t) => Math.abs(th - t) < 0.09)) continue;
      if (Math.floor(th / 0.06) % 3 === 0) this._ringLine(ringPoint(th).setY(NaN), ringPoint(th + 0.04).setY(NaN), 5);
    }
    for (const r of this.ringSpots) if (Number.isNaN(r.y)) r.y = this.groundAt(r.x, r.z) + 1.2;
    for (const th of thLoops) {
      const d = ringDir(th);
      this._addLoop(ringPoint(th), d);
      this._addBoostPad(ringPoint(th - 0.07), ringDir(th - 0.07));
      this._addBoostPad(ringPoint(th + 0.8), ringDir(th + 0.8));
    }
    // 점프대
    for (const th of [1.2, 3.5, 5.4]) {
      this._addRamp(ringPoint(th), ringDir(th), 8, 14, 4);
      const c = ringPoint(th + 0.06); this._ringArc(c, ringDir(th + 0.06), 30, 8, 9, 3);
    }
    // 길가 체크포인트
    for (const th of [0.9, 1.9, 3.0, 3.9, 5.0, 5.9]) {
      const p = ringPoint(th), d = ringDir(th), side = new THREE.Vector3(d.z, 0, -d.x);
      p.addScaledVector(side, ROAD.width + 5);
      this._addCheckpoint(p.x, p.z);
    }
    // 가로 울타리와 전봇대·전선
    let prevPole = null;
    for (let th = 0; th < Math.PI * 2; th += 0.05) {
      const p = ringPoint(th), d = ringDir(th), out = new THREE.Vector3(-d.z, 0, d.x);
      const q = p.clone().addScaledVector(out, ROAD.width + 6);
      if (thLoops.some((t) => Math.abs(th - t) < 0.08)) { prevPole = null; continue; }
      if (Math.floor(th / 0.05) % 2 === 0 && this._free(q.x, q.z, 0.5)) {
        const top = this.powerPole(q.x, q.z);
        if (prevPole && prevPole.distanceTo(top) < 60) this.cable(prevPole, top);
        prevPole = top;
      }
      if (this.rand() < 0.3) { const f = p.clone().addScaledVector(out, -(ROAD.width + 4)); const f2 = ringPoint(th + 0.02).addScaledVector(out, -(ROAD.width + 4)); this.fence(f.x, f.z, f2.x, f2.z); }
    }
    for (let th = 0.1; th < Math.PI * 2; th += 0.11) {
      const p = ringPoint(th).add(new THREE.Vector3((this.rand() - 0.5) * 8, 0, (this.rand() - 0.5) * 8));
      if (thLoops.some((t) => Math.abs(th - t) < 0.1)) continue;
      zoneWeights(p.x, p.z);
      const type = ZW[0] > 0.5 ? 'tank' : ZW[1] > 0.5 ? 'wasp' : ZW[2] > 0.5 ? 'hopper' : ZW[3] > 0.5 ? 'wasp' : 'beetle';
      this.enemySpots.push({ pos: p, type });
    }
  }

  _zoneMeadow() {
    // 숲: 둥근 나무 군락, 덤불, 꽃, 바위, 통나무
    for (let i = 0; i < 2600; i++) {
      const x = (this.rand() - 0.5) * 1640, z = (this.rand() - 0.5) * 1640;
      if (Math.hypot(x, z) > 820) continue;
      zoneWeights(x, z);
      const zw = Math.max(ZW[0], ZW[1], ZW[2], ZW[3]);
      if (zw > 0.4) continue;
      const cluster = vnoise(x * 0.012, z * 0.012);
      if (cluster < 0.45) continue;
      if (!this._free(x, z, 1.5)) continue;
      this._plantTree('round', x, z, 0.85 + this.rand() * 0.7);
    }
    for (let i = 0; i < 3500; i++) {
      const x = (this.rand() - 0.5) * 1640, z = (this.rand() - 0.5) * 1640;
      if (Math.hypot(x, z) > 830) continue;
      zoneWeights(x, z);
      if (ZW[0] > 0.4 || ZW[1] > 0.6) continue;
      if (!this._free(x, z, 0.6)) continue;
      const r = this.rand();
      if (r < 0.45) this._plantTree('flower', x, z, 1 + this.rand() * 0.6);
      else if (r < 0.8) this._plantTree('bush', x, z, 0.6 + this.rand() * 0.7);
      else this._plantTree('rock', x, z, 0.5 + this.rand() * 1.4);
    }
    for (let i = 0; i < 70; i++) {
      const x = (this.rand() - 0.5) * 1500, z = (this.rand() - 0.5) * 1500;
      zoneWeights(x, z); if (ZW[0] > 0.3 || Math.hypot(x, z) > 800) continue;
      if (this._free(x, z, 3)) this.log(x, z, this.rand() * 3, 3 + this.rand() * 3);
    }
    // 기계화가 시작된 숲 (바깥쪽일수록 많음)
    for (let i = 0; i < 260; i++) {
      const a = this.rand() * Math.PI * 2, r = 250 + Math.sqrt(this.rand()) * 560;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 2.5)) continue;
      const k = this.rand();
      if (k < 0.25) this._plantTree('metal', x, z, 0.9 + this.rand() * 0.5);
      else if (k < 0.45) this.robotDebris(x, z);
      else if (k < 0.6) this.barrel(x, z, this.rand() < 0.5 ? 0xd04020 : 0x2a6fd0);
      else if (k < 0.72) this.oilPuddle(x, z);
      else if (k < 0.82) this.warningSign(x, z, this.rand() * 6);
      else if (k < 0.9 && r > 600) this.drill(x, z);
      else this.crate(x, z, 1.2 + this.rand() * 0.6);
    }
    // 들판 몬스터
    for (let i = 0; i < 45; i++) {
      const a = this.rand() * Math.PI * 2, r = 60 + this.rand() * 700;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      zoneWeights(x, z); if (Math.max(ZW[0], ZW[1], ZW[2], ZW[3]) > 0.4) continue;
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type: this.rand() < 0.25 ? 'wasp' : 'beetle' });
    }
  }

  // 공장 건물
  factory(x, z, w, d, h, yaw = 0) {
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
    return y + h;
  }
  smokestack(x, z, h) {
    const y = terrainHeight(x, z);
    for (let i = 0; i < 5; i++) this.put(BASE.cyl, i % 2 ? 0xffffff : 0xd83a2a, x, y + h * (i + 0.5) / 5, z, 2.6 - i * 0.15, h / 5, 2.6 - i * 0.15);
    this.put(BASE.cyl, 0x333333, x, y + h + 0.2, z, 2.2, 0.5, 2.2);
    this.smokeEmitters.push({ pos: new THREE.Vector3(x, y + h + 1, z), rate: 1.2, dark: true });
    this._solid(x, y + h / 2, z, 2.4, h, 2.4);
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
    const blocks = [[-70, -60], [60, -80], [-90, 50], [80, 60], [0, 110], [130, -10], [-140, -20], [10, -150]];
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
    for (let i = 0; i < 6; i++) {
      const a = this.rand() * 6.28, r = R(40, 200);
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
    for (let i = 0; i < 10; i++) {
      const a = this.rand() * 6.28, r = R(30, 220);
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 10)) continue;
      this._saw(x, z, this.rand() * 3, R(8, 14));
    }
    // 파이프, 기계 나무, 상자, 드럼통, 거대 톱니
    for (let i = 0; i < 18; i++) {
      const a = this.rand() * 6.28, r = R(20, 260), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const a2 = this.rand() * 6.28, l = R(20, 50), x2 = x + Math.cos(a2) * l, z2 = z + Math.sin(a2) * l;
      if (roadDist(x, z) < 14 || roadDist(x2, z2) < 14) continue;
      this.pipe(x, z, x2, z2, R(2.5, 6), this.rand() < 0.5 ? 0x8a9099 : 0x9a5530);
    }
    for (let i = 0; i < 260; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 280, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 2)) continue;
      const k = this.rand();
      if (k < 0.4) this._plantTree('metal', x, z, 0.9 + this.rand() * 0.6);
      else if (k < 0.6) this.barrel(x, z, this.rand() < 0.5 ? 0xd04020 : 0xffc233);
      else if (k < 0.75) this.crate(x, z, R(1.2, 2.2));
      else if (k < 0.85) this.robotDebris(x, z);
      else if (k < 0.92) this.oilPuddle(x, z);
      else this.warningSign(x, z, this.rand() * 6);
    }
    for (let i = 0; i < 7; i++) {
      const a = this.rand() * 6.28, r = R(40, 250), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 8)) continue;
      const s = R(8, 14), y = terrainHeight(x, z);
      const g = new THREE.Mesh(BASE.gear, new THREE.MeshLambertMaterial({ color: this.rand() < 0.5 ? 0x9a5530 : 0x7b828c }));
      g.scale.set(s, s, s * 1.5); g.position.set(x, y + s * 0.3, z); g.rotation.y = this.rand() * 3;
      g.castShadow = true; this.root.add(g);
      this.spinners.push({ mesh: g, axis: 'z', speed: (this.rand() - 0.5) * 0.8 });
      this._occupy(x, z, s / 2);
    }
    // 크레인
    for (let i = 0; i < 3; i++) {
      const a = this.rand() * 6.28, r = R(60, 200), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
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
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 220;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 3 === 0 ? 'beetle' : 'tank' });
    }
    // 퀘스트 캠프 (중앙 광장)
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * 14, 0, Z.z + Math.sin(a) * 14), type: i % 4 === 3 ? 'beetle' : 'tank', tag: 'big' });
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
    for (let i = 0; i < 700; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 300, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 2)) continue;
      const k = this.rand();
      if (k < 0.45) this._plantTree('mush', x, z, R(0.8, 2.2));
      else if (k < 0.6) this._plantTree('metal', x, z, R(0.8, 1.2));
      else if (k < 0.85) this._plantTree('flower', x, z, R(1, 1.6));
      else this._plantTree('rock', x, z, R(0.6, 1.6));
    }
    // 연잎 발판 (물 위에서 둥실)
    for (let i = 0; i < 40; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 260, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (terrainHeight(x, z) > -0.8 || !this._free(x, z, 3)) continue;
      const p = this._mover({ x, y: 0.15, z }, { x, y: 0.5, z }, 3.4, 0.4, 3.4, R(2.5, 4), 0x2f8a3a, 0x58c84a);
      this._ringCircle(x, z, 0.1, 1, 1.4, 0.5);
    }
    // 독버섯 거인 버섯 + 빛나는 포자
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * 6.28, r = R(30, 250), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 7)) continue;
      const y = terrainHeight(x, z), H = R(10, 18), cr = R(6, 9);
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
    for (let i = 0; i < 28; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 260;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 4 === 0 ? 'beetle' : 'wasp' });
    }
    this._addCheckpoint(Z.x + 40, Z.z + 40);
  }

  _zoneMesa() {
    const Z = ZONES.mesa, R = (a, b) => a + this.rand() * (b - a);
    for (let i = 0; i < 900; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 300, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 1.5)) continue;
      const k = this.rand();
      if (k < 0.5) this._plantTree('pine', x, z, R(0.7, 1.4));
      else if (k < 0.75) this._plantTree('rock', x, z, R(0.6, 2.2));
      else this._plantTree('bush', x, z, R(0.5, 0.9));
    }
    // 절벽 아래 스프링 (협곡 위로 올라가는 길)
    let springs = 0;
    for (let i = 0; i < 600 && springs < 22; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 260, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      let up = 0;
      for (let k = 0; k < 4; k++) { const b = k * Math.PI / 2; up = Math.max(up, terrainHeight(x + Math.cos(b) * 6, z + Math.sin(b) * 6) - h); }
      if (up > 6 && this._free(x, z, 3)) { this._addSpring(x, z, 30); springs++; }
    }
    // 협곡을 건너는 움직이는 발판, 회전 톱니 원판
    for (let i = 0; i < 8; i++) {
      const a = this.rand() * 6.28, r = R(40, 240), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      if (!this._free(x, z, 14)) continue;
      const y = terrainHeight(x, z) + R(4, 10), d = R(10, 18), ang = this.rand() * 3;
      this._mover({ x: x - Math.cos(ang) * d, y, z: z - Math.sin(ang) * d }, { x: x + Math.cos(ang) * d, y, z: z + Math.sin(ang) * d }, 5, 0.8, 5, R(4, 7));
      this._ringLine(new THREE.Vector3(x - Math.cos(ang) * d, y + 0.5, z - Math.sin(ang) * d), new THREE.Vector3(x + Math.cos(ang) * d, y + 0.5, z + Math.sin(ang) * d), 7, 1.4);
      this._addSpring(x - Math.cos(ang) * (d + 6), z - Math.sin(ang) * (d + 6), 24);
    }
    for (let i = 0; i < 5; i++) {
      const a = this.rand() * 6.28, r = R(40, 240), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
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
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 260;
      this.enemySpots.push({ pos: new THREE.Vector3(Z.x + Math.cos(a) * r, 0, Z.z + Math.sin(a) * r), type: i % 4 === 0 ? 'beetle' : 'hopper' });
    }
    this._addCheckpoint(Z.x - 30, Z.z - 50);
  }

  _zoneLake() {
    const Z = ZONES.lake, R = (a, b) => a + this.rand() * (b - a);
    for (let i = 0; i < 600; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 300, x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.2 || !this._free(x, z, 1.5)) continue;
      const k = this.rand();
      if (k < 0.45) this._plantTree('round', x, z, R(0.8, 1.3));
      else if (k < 0.7) this._plantTree('bush', x, z, R(0.6, 1));
      else this._plantTree('flower', x, z, 1.3);
    }
    // 물 위를 달리는 링 길
    for (let i = 0; i < 10; i++) {
      const a = this.rand() * 6.28, r = R(20, 160), x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const a2 = this.rand() * 6.28;
      this._ringLine(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + Math.cos(a2) * 40, 0, z + Math.sin(a2) * 40), 8, 1.2);
    }
    // 부두 (나무 다리)
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, r = Z.r * 0.62;
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
    for (let i = 0; i < 6; i++) this.put(BASE.cyl, i % 2 ? 0xffffff : 0xd83a2a, lx, ly + 4 + 2.5 * (i + 0.5), lz, 4 - i * 0.25, 2.5, 4 - i * 0.25);
    this.put(BASE.cyl, 0xfff3a0, lx, ly + 20, lz, 2.8, 2, 2.8, 0, 0, 0, 'glow');
    this.put(BASE.cone, 0xd83a2a, lx, ly + 22.5, lz, 3.6, 3, 3.6);
    this._solid(lx, ly + 12, lz, 3.6, 16, 3.6);
    this._addCheckpoint(lx + 7, lz);
    this._addSpring(lx - 7, lz, 30, ly + 4);
    for (let i = 0; i < 24; i++) {
      const a = this.rand() * 6.28, r = Math.sqrt(this.rand()) * 260;
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      this.enemySpots.push({ pos: new THREE.Vector3(x, 0, z), type: terrainHeight(x, z) < 0 ? 'wasp' : (i % 2 ? 'hopper' : 'beetle') });
    }
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
    const spots = [[150, 180], [-200, 120], [260, -120], [-120, -260], [40, -330], [-330, 40], [330, 220], [-260, 330]];
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
      const a = this.rand() * Math.PI * 2, r = Rb + 10 + Math.pow(this.rand(), 0.8) * 340;
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
    // 들판 곳곳 링, 스프링, 체크포인트
    for (let i = 0; i < 80; i++) {
      const a = this.rand() * 6.28, r = 60 + Math.sqrt(this.rand()) * 740, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 3)) continue;
      if (this.rand() < 0.5) this._ringCircle(x, z, 4, 8);
      else { const b = this.rand() * 6.28; this._ringLine(new THREE.Vector3(x, null, z), new THREE.Vector3(x + Math.cos(b) * 20, null, z + Math.sin(b) * 20), 6); }
    }
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * 6.28, r = 60 + Math.sqrt(this.rand()) * 720, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._free(x, z, 3)) continue;
      this._addSpring(x, z, 30);
      const h = terrainHeight(x, z);
      this._ringLine(new THREE.Vector3(x, h + 8, z), new THREE.Vector3(x, h + 20, z), 5, 0);
    }
    for (const [x, z] of [[200, 120], [-180, 230], [230, -170], [-220, -90], [100, 300], [-90, -250], [300, 40], [-300, -10], [620, 0], [-620, 60], [0, -640], [60, 640]]) {
      let px = x, pz = z;
      for (let k = 0; k < 10 && !this._free(px, pz, 2); k++) { px += 6; pz += 4; }
      this._addCheckpoint(px, pz);
    }
  }

  // ---------- 미니맵 그림 ----------
  _minimap() {
    const S = 256, half = 900;
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
    g.beginPath(); g.arc(S / 2, S / 2, CFG.world.barrierR / half * S / 2, 0, 7); g.stroke();
    this.mapCanvas = cv; this.mapHalf = half;
  }

  // =================================================================
  update(dt, time) {
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
    for (const c of this.checkpoints) {
      c.flash = Math.max(0, c.flash - dt * 0.6);
      const pulse = c.active ? 0.35 + Math.sin(time * 4) * 0.15 : 0;
      c.mat.emissiveIntensity = pulse + c.flash * 0.8;
      c.glow.material.opacity = c.active ? 0.08 + c.flash * 0.5 : 0;
      c.glow.visible = c.active;
      c.glow.scale.y = 0.6 + c.flash;
    }
    for (const s of this.searchlights) s.pivot.rotation.y = s.base + Math.sin(time * 0.4 + s.phase) * 0.9;
    // 할아버지 나무: 힘을 빼앗기는 중에는 시들고, 되찾으면 반짝
    if (this.heartTree) {
      const T = this.heartTree;
      if (T.restored) T.glowT = Math.min(1, T.glowT + dt * 0.4);
      const k = T.glowT;
      this.treeLeafMat.color.setRGB(0.5 + (0.32 - 0.5) * k, 0.54 + (0.82 - 0.54) * k, 0.42 + (0.3 - 0.42) * k);
      this.treeLeafMat.emissive.setRGB(0.02 * k, 0.12 * k, 0.03 * k);
      this.treeCore.material.color.setRGB(0.35 + 0.15 * k + 0.1 * Math.sin(time * 3) * k, 0.54 + 0.46 * k, 0.35 + 0.2 * k);
      this.treeCore.rotation.y = time * (0.3 + k);
      this.treeCore.scale.setScalar(1 + k * (0.3 + Math.sin(time * 4) * 0.1));
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
