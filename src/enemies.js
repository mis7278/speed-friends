// 몬스터: 기계로 개조된 숲 동물들. 구역 색과 어울리는 종류가 나옴.
//  들판(초록) = 딱정벌레 로봇 / 녹슨 공장(주황) = 드릴 탱크 / 보라 늪 = 말벌 로봇 / 노란 협곡·호수 = 개구리 로봇
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { SFX } from './audio.js';
import { toon } from './character.js';

const glow = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
const M = {}; // 재사용 재질
const mat = (c) => (M[c] ??= toon(c));

function mesh(geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; return o;
}
const G = {
  sph: new THREE.SphereGeometry(1, 14, 10), hemi: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 10),
};

function beetleMesh() { // 무당벌레 로봇
  const g = new THREE.Group();
  g.add(mesh(G.hemi, mat(0xe84545), 0, 0.35, 0, 0.9, 0.75, 1.0));
  g.add(mesh(G.box, mat(0x222222), 0, 0.75, 0, 0.06, 0.5, 1.9));
  for (const [x, z] of [[0.4, 0.3], [-0.4, 0.3], [0.35, -0.4], [-0.35, -0.4]]) g.add(mesh(G.sph, mat(0x222222), x, 0.85, z, 0.14, 0.06, 0.14));
  g.add(mesh(G.sph, mat(0x50565f), 0, 0.5, 0.8, 0.45, 0.4, 0.4));
  g.add(mesh(G.sph, glow(0x66ffff), 0.18, 0.6, 1.12, 0.1, 0.1, 0.06));
  g.add(mesh(G.sph, glow(0x66ffff), -0.18, 0.6, 1.12, 0.1, 0.1, 0.06));
  g.add(mesh(G.cyl, mat(0x444a55), 0, 0.3, 0, 0.95, 0.2, 1.05));
  const legs = [];
  for (const s of [-1, 1]) for (const z of [0.4, 0, -0.4]) { const l = mesh(G.box, mat(0x50565f), s * 0.95, 0.2, z, 0.5, 0.08, 0.08); l.rotation.z = s * 0.4; g.add(l); legs.push(l); }
  g.userData.legs = legs;
  return g;
}
function tankMesh() { // 드릴 코뿔소 탱크 (녹슨 주황)
  const g = new THREE.Group();
  g.add(mesh(G.box, mat(0xc0652e), 0, 0.85, 0, 1.6, 0.9, 2.0));
  g.add(mesh(G.box, mat(0x8a4422), 0, 1.35, -0.1, 1.3, 0.3, 1.5));
  g.add(mesh(G.box, mat(0xffc233), 0, 0.85, 1.01, 1.6, 0.2, 0.02));
  const drill = mesh(G.cone, mat(0xd8dde3), 0, 0.9, 1.6, 0.35, 1.0, 0.35); drill.rotation.x = Math.PI / 2; g.add(drill);
  g.add(mesh(G.sph, glow(0xff3020), 0.45, 1.05, 1.0, 0.12, 0.12, 0.06));
  g.add(mesh(G.sph, glow(0xff3020), -0.45, 1.05, 1.0, 0.12, 0.12, 0.06));
  for (const s of [-1, 1]) g.add(mesh(G.box, mat(0x2c3036), s * 0.9, 0.35, 0, 0.35, 0.6, 2.1));
  for (let i = 0; i < 3; i++) g.add(mesh(G.cone, mat(0x9aa0a8), (i - 1) * 0.45, 1.6, -0.2, 0.15, 0.4, 0.15));
  g.userData.drill = drill;
  return g;
}
function waspMesh() { // 말벌 로봇 (보라·노랑)
  const g = new THREE.Group();
  g.add(mesh(G.sph, mat(0x8a4dff), 0, 0, 0, 0.55, 0.5, 0.65));
  g.add(mesh(G.sph, mat(0xffd23a), 0, -0.05, -0.75, 0.45, 0.42, 0.6));
  const band = mesh(G.cyl, mat(0x2a1a44), 0, -0.05, -0.75, 0.47, 0.12, 0.47); band.rotation.x = Math.PI / 2; g.add(band);
  const sting = mesh(G.cone, mat(0x222222), 0, -0.1, -1.4, 0.12, 0.4, 0.12); sting.rotation.x = -Math.PI / 2; g.add(sting);
  g.add(mesh(G.sph, glow(0xff3020), 0.2, 0.1, 0.55, 0.12, 0.14, 0.08));
  g.add(mesh(G.sph, glow(0xff3020), -0.2, 0.1, 0.55, 0.12, 0.14, 0.08));
  const wings = [];
  for (const s of [-1, 1]) { const w = mesh(G.sph, new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.55 }), s * 0.6, 0.45, -0.1, 0.6, 0.05, 0.3); g.add(w); wings.push(w); }
  g.userData.wings = wings;
  return g;
}
function hopperMesh() { // 개구리 로봇 (노란 협곡·호수)
  const g = new THREE.Group();
  g.add(mesh(G.sph, mat(0x7ac043), 0, 0.6, 0, 0.8, 0.6, 0.9));
  g.add(mesh(G.sph, mat(0xf0e080), 0, 0.5, 0.35, 0.6, 0.4, 0.6));
  g.add(mesh(G.box, mat(0x50565f), 0, 1.05, -0.1, 0.9, 0.2, 0.8));
  for (const s of [-1, 1]) {
    g.add(mesh(G.sph, mat(0x50565f), s * 0.42, 1.15, 0.45, 0.28, 0.28, 0.28));
    g.add(mesh(G.sph, glow(0xffe14d), s * 0.42, 1.18, 0.66, 0.14, 0.14, 0.08));
    g.add(mesh(G.box, mat(0x50565f), s * 0.75, 0.25, -0.2, 0.3, 0.3, 0.9));
  }
  return g;
}

function towerMesh() { // 로봇 기지 안테나 탑
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat(0x3a4048), 0, 0.6, 0, 3.2, 1.2, 3.2));
  g.add(mesh(G.box, mat(0x50565f), 0, 5, 0, 1.6, 8, 1.6));
  g.add(mesh(G.box, mat(0xffc233), 0, 2, 0, 1.7, 0.6, 1.7));
  g.add(mesh(G.box, mat(0xffc233), 0, 6, 0, 1.7, 0.6, 1.7));
  const dish = mesh(G.hemi, mat(0xb0b6be), 0, 9.6, 0.6, 1.8, 0.6, 1.8); dish.rotation.x = 1.2; g.add(dish);
  g.add(mesh(G.sph, glow(0xff2a10), 0, 10.4, 0, 0.6, 0.6, 0.6));
  g.add(mesh(G.box, glow(0xff5030), 0, 4, 0.82, 0.8, 0.8, 0.05));
  g.userData.spin = dish;
  return g;
}
function machineMesh() { // 로봇 생산 기계
  const g = new THREE.Group();
  g.add(mesh(G.box, mat(0x5d646e), 0, 2.5, 0, 7, 5, 5));
  g.add(mesh(G.box, mat(0xffc233), 0, 0.4, 2.51, 7, 0.8, 0.05));
  g.add(mesh(G.box, mat(0x2c3036), 0, 5.6, 0, 5, 1.2, 4));
  g.add(mesh(G.box, mat(0x3a4048), 0, 1.6, 2.6, 4, 3, 0.4));
  g.add(mesh(G.sph, glow(0xff8a20), 0, 3.8, 2.55, 0.9, 0.9, 0.3));
  for (const s of [-1, 1]) { g.add(mesh(G.cyl, mat(0x8a9099), s * 2.5, 7, -1, 0.5, 3, 0.5)); g.add(mesh(G.sph, glow(0xff3020), s * 2.5, 8.7, -1, 0.4, 0.4, 0.4)); }
  const press = mesh(G.box, mat(0x9aa0a8), 0, 4.5, 3.4, 3, 0.6, 1.6); g.add(press);
  g.userData.press = press;
  return g;
}

// 로봇 안에 갇혀 있던 동물 친구 (로봇을 부수면 튀어나와 도망감)
function critterMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'bird') {
    g.add(mesh(G.sph, mat(0x5ab8ff), 0, 0.35, 0, 0.3, 0.28, 0.36));
    g.add(mesh(G.sph, mat(0xffffff), 0, 0.3, 0.12, 0.2, 0.18, 0.2));
    const beak = mesh(G.cone, mat(0xffb020), 0, 0.38, 0.38, 0.07, 0.16, 0.07); beak.rotation.x = Math.PI / 2; g.add(beak);
    const wings = [];
    for (const s of [-1, 1]) { const w = mesh(G.sph, mat(0x3a8ae0), s * 0.32, 0.4, 0, 0.26, 0.05, 0.16); g.add(w); wings.push(w); }
    g.userData.wings = wings;
  } else if (kind === 'squirrel') {
    g.add(mesh(G.sph, mat(0xc8763a), 0, 0.3, 0, 0.25, 0.3, 0.25));
    g.add(mesh(G.sph, mat(0xc8763a), 0, 0.62, 0.08, 0.2, 0.2, 0.2));
    const tail = mesh(G.sph, mat(0xe09050), 0, 0.5, -0.3, 0.18, 0.4, 0.15); tail.rotation.x = 0.5; g.add(tail);
    for (const s of [-1, 1]) g.add(mesh(G.cone, mat(0xc8763a), s * 0.1, 0.84, 0.06, 0.06, 0.14, 0.06));
  } else if (kind === 'frog') {
    g.add(mesh(G.sph, mat(0x6ad04a), 0, 0.22, 0, 0.32, 0.22, 0.34));
    for (const s of [-1, 1]) { g.add(mesh(G.sph, mat(0xffffff), s * 0.14, 0.42, 0.18, 0.09, 0.09, 0.09)); g.add(mesh(G.sph, mat(0x111111), s * 0.14, 0.43, 0.25, 0.04, 0.04, 0.04)); }
  } else { // 토끼
    g.add(mesh(G.sph, mat(0xf4f0ea), 0, 0.3, 0, 0.26, 0.28, 0.3));
    g.add(mesh(G.sph, mat(0xf4f0ea), 0, 0.6, 0.12, 0.2, 0.2, 0.2));
    for (const s of [-1, 1]) g.add(mesh(G.sph, mat(0xf4f0ea), s * 0.08, 0.9, 0.08, 0.06, 0.2, 0.04));
    g.add(mesh(G.sph, mat(0xff8aa0), 0, 0.6, 0.31, 0.04, 0.04, 0.04));
  }
  return g;
}
// 미사일 로봇: 다리 달린 포탑. 빨간 불이 깜빡이면 곧 미사일 발사!
function gunnerMesh() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) { const l = mesh(G.box, mat(0x3a4048), s * 0.9, 0.6, z, 0.25, 1.2, 0.25); l.rotation.z = s * 0.35; g.add(l); }
  g.add(mesh(G.box, mat(0x5a8a3a), 0, 1.6, 0, 1.6, 1.0, 1.6));
  g.add(mesh(G.box, mat(0xffc233), 0, 1.15, 0, 1.65, 0.15, 1.65));
  const head = new THREE.Group(); head.position.y = 2.25; g.add(head);
  head.add(mesh(G.sph, mat(0x50565f), 0, 0, 0, 0.75, 0.55, 0.75));
  for (const s of [-1, 1]) { const b = mesh(G.cyl, mat(0x2a2e35), s * 0.45, 0.05, 0.7, 0.22, 1.1, 0.22); b.rotation.x = Math.PI / 2; head.add(b); }
  const lamp = mesh(G.sph, glow(0xff2010), 0, 0.5, 0.1, 0.18, 0.18, 0.18); head.add(lamp);
  g.userData.head = head; g.userData.lamp = lamp;
  return g;
}
const CRITTER_OF = { beetle: 'bunny', crawler: 'bunny', tank: 'squirrel', wasp: 'bird', flyer: 'bird', hopper: 'frog', gunner: 'squirrel' };

const TYPES = {
  tower: { make: towerMesh, hp: 5, radius: 2.0, speed: 0, color: 0xff5030, static: true, harmless: true, noRespawn: true, big: true },
  machine: { make: machineMesh, hp: 6, radius: 3.6, speed: 0, color: 0xffa030, static: true, harmless: true, noRespawn: true, big: true },
  beetle: { make: beetleMesh, hp: 3, armor: 0, radius: 1.0, speed: 1, color: 0xe84545, size: 2.0 },
  crawler: { make: beetleMesh, hp: 3, armor: 0, radius: 1.0, speed: 1, color: 0xe84545, size: 2.0 },
  tank: { make: tankMesh, hp: 10, armor: 2, radius: 1.3, speed: 0.75, color: 0xc0652e, size: 1.7 },
  wasp: { make: waspMesh, hp: 2, armor: 0, radius: 0.9, speed: 1.15, color: 0x8a4dff, flying: true, size: 1.8 },
  flyer: { make: waspMesh, hp: 2, armor: 0, radius: 0.9, speed: 1.15, color: 0x8a4dff, flying: true, size: 1.8 },
  hopper: { make: hopperMesh, hp: 5, armor: 1, radius: 1.0, speed: 0.9, color: 0x7ac043, hops: true, size: 1.9 },
  gunner: { make: gunnerMesh, hp: 6, armor: 1, radius: 1.5, speed: 0.45, color: 0x5a8a3a, size: 1.25, shoots: true },
};

export class Enemies {
  constructor(scene, world, spots, fx, pickups, game) {
    this.scene = scene; this.world = world; this.fx = fx; this.pickups = pickups; this.game = game;
    this.list = [];
    for (const sp of spots) this._spawn(sp);
    this.critters = [];
  }

  _freeCritter(e) {
    const kind = CRITTER_OF[e.type] || 'bunny';
    let c = this.critters.find((k) => !k.alive && k.kind === kind);
    if (!c) {
      if (this.critters.length > 24) { c = this.critters.find((k) => !k.alive); if (c) { this.scene.remove(c.mesh); } }
      const m = critterMesh(kind);
      this.scene.add(m);
      if (c) { c.mesh = m; c.kind = kind; } else { c = { mesh: m, kind }; this.critters.push(c); }
    }
    const p = this.game?.player;
    const away = p ? e.pos.clone().sub(p.pos).setY(0) : new THREE.Vector3(1, 0, 0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
    c.alive = true; c.t = 0; c.pos = e.pos.clone().add(new THREE.Vector3(0, 0.6, 0)); c.vy = 9; c.dir = away; c.hop = 0;
    c.mesh.visible = true; c.mesh.position.copy(c.pos); c.mesh.scale.setScalar(1.3);
    c.mesh.rotation.y = Math.atan2(away.x, away.z);
    this.fx.burst(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xff8ab0, 6, 3);
    SFX.freed();
  }
  _updateCritters(dt, time) {
    for (const c of this.critters) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.kind === 'bird') {
        c.pos.addScaledVector(c.dir, 7 * dt); c.pos.y += (c.t < 0.3 ? 8 : 4) * dt;
        for (const w of c.mesh.userData.wings) w.rotation.z = Math.sin(time * 40) * 0.8;
      } else {
        c.vy -= 30 * dt; c.pos.y += c.vy * dt;
        const g = this.world.groundAt(c.pos.x, c.pos.z, c.pos.y + 1);
        if (c.pos.y <= g) { c.pos.y = g; c.vy = c.t > 0.4 ? 6 : 0; }   // 깡충깡충
        if (c.t > 0.4) c.pos.addScaledVector(c.dir, 8 * dt);
      }
      c.mesh.position.copy(c.pos);
      const k = c.t > 2.6 ? Math.max(0, 1 - (c.t - 2.6) / 0.4) : 1;
      c.mesh.scale.setScalar(1.3 * k);
      if (c.t > 3) { c.alive = false; c.mesh.visible = false; }
    }
  }

  _spawn(sp) {
    const T = TYPES[sp.type] || TYPES.beetle;
    const mesh = T.static ? T.make() : null;
    const home = sp.pos.clone();
    home.y = this.world.terrainAt(home.x, home.z);
    const e = {
      type: sp.type, T, home, pos: home.clone(), yaw: Math.random() * 6.28, mesh, camp: !!sp.camp,
      alive: true, respawnTimer: 0, dying: 0, knock: new THREE.Vector3(), hp: T.hp, maxHp: T.hp,
      tag: sp.tag || null, leash: sp.leash || 30, shielded: false,
      wanderT: Math.random() * 10, radius: T.radius * (T.size || 1), flying: !!T.flying, idx: this.list.length, shootT: 2 + Math.random() * 2, asleep: false, hopT: Math.random() * 2, vy: 0, hitFlash: 0,
    };
    if (mesh) { mesh.position.copy(e.pos); this.scene.add(mesh); }
    if (T.static) { // 보호막 (주변 로봇을 먼저 물리쳐야 꺼짐)
      e.shield = new THREE.Mesh(new THREE.SphereGeometry(T.radius * 2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      e.shield.position.y = T.radius * 1.2; e.shield.visible = false;
      mesh.add(e.shield);
    }
    this.list.push(e);
  }

  _ensureMesh(e) {
    if (e.mesh) return;
    const inner = e.T.make(), sz = e.T.size || 1;
    inner.scale.setScalar(sz);
    e.mesh = new THREE.Group(); e.mesh.add(inner); e.mesh.userData = inner.userData; // 크기는 안쪽, 맞았을 때 출렁임은 바깥
    e.mesh.position.copy(e.pos); this.scene.add(e.mesh);
  }
  // 체력 막대 (맞으면 잠깐 보임)
  _bar(e) {
    if (!e.bar) {
      const g = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.22), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthTest: false }));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), new THREE.MeshBasicMaterial({ color: 0x3ddc5a, depthTest: false }));
      fill.position.z = 0.01; fill.geometry.translate(0.75, 0, 0); fill.position.x = -0.75;
      bg.renderOrder = 20; fill.renderOrder = 21;
      g.add(bg, fill); g.userData.fill = fill;
      this.scene.add(g); e.bar = g;
    }
    return e.bar;
  }
  hit(e, dmg, fromPos, knockPower = 10, launch = false, remote = false) {
    if (!e.alive || e.dying > 0) return false;
    if (!remote && this.game?.net?.shared) this.game.net.sendGame({ t: 'eh', i: e.idx, d: dmg, f: [+fromPos.x.toFixed(1), +fromPos.y.toFixed(1), +fromPos.z.toFixed(1)], k: knockPower, l: launch ? 1 : 0 });
    if (!e.T.static) dmg = Math.max(1, Math.round(dmg) - (e.T.armor || 0)); // 방어력만큼 덜 아픔
    e.barT = 4;
    if (e.T.static) { if (e.hitCD > 0) return false; e.hitCD = 0.45; }
    if (e.shielded) { this.fx.burst(e.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0x66ccff, 6, 5); SFX.store(); return false; }
    e.hp -= e.T.static ? 1 : dmg;
    const dir = e.pos.clone().sub(fromPos).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    if (e.hp > 0) { // 단단한 몬스터: 밀려나기만
      if (!e.T.static && launch) { // 내려찍기: 뒤로 붕 날아갔다가 다시 덤빔
        e.flyV = dir.clone().multiplyScalar(knockPower * (e.T.big ? 0.5 : 1)); e.flyV.y = 9 + knockPower * 0.25; e.flyT = 2.5; e.stunT = 0.6;
      } else if (!e.T.static) e.pos.addScaledVector(dir, 1.5 + Math.min(2.5, dmg * 0.4));
      e.hitFlash = 0.3;
      if (e.T.static) { this.fx.burst(e.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0xffa030, 14, 8); this.game && (this.game.player.shake = 0.2); }
      this.fx.burst(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 6, 5);
      SFX.punch();
      return false;
    }
    e.knock.copy(dir.multiplyScalar(e.T.static ? 0 : knockPower)); e.knock.y = e.T.static ? 0 : knockPower * 0.6;
    e.dying = e.T.static ? 0.8 : 0.35;
    this.game?.onEnemyDeath?.(e);
    return true;
  }

  _die(e) {
    e.alive = false; e.dying = 0;
    e.mesh.visible = false;
    e.respawnTimer = CFG.enemies.respawn;
    const c = e.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.fx.burst(c, e.T.color, 16, 9);
    this.fx.burst(c, 0x50565f, 8, 7);
    this.fx.burst(c, 0xffffff, 8, 5);
    if (e.T.big) { this.fx.explosion(c.clone().setY(c.y + 2), 1.5); SFX.explosion(); }
    else this._freeCritter(e);
    SFX.enemyPop();
    if (Math.random() < CFG.enemies.dropChance) this.pickups.spawnHeart(e.pos.clone().add(new THREE.Vector3(0, 1, 0)));
  }

  update(dt, time, players) {
    this._updateCritters(dt, time);
    this._updateMissiles(dt);
    const C = CFG.enemies;
    const frozen = (this.game?.freezeT || 0) > 0;
    for (const e of this.list) {
      let near = null, nd = Infinity;
      for (const p of players) { const d = p.pos.distanceTo(e.pos); if (d < nd) { nd = d; near = p; } }
      e.asleep = nd > C.sleepRange;
      if (e.mesh) e.mesh.visible = e.alive && !e.asleep;
      if (e.bar) e.bar.visible = false;
      if (e.asleep) continue; // 아무도 없으면 시간 정지
      this._ensureMesh(e);
      e.barT = Math.max(0, (e.barT || 0) - dt);
      if (e.alive && e.dying <= 0 && e.barT > 0 && e.hp < e.maxHp) {
        const b = this._bar(e), f = b.userData.fill, k = Math.max(0, e.hp / e.maxHp);
        b.visible = true;
        b.position.copy(e.pos).add(new THREE.Vector3(0, e.T.static ? 9 : (e.flying ? 1.4 : 2.2) * (e.T.size || 1), 0));
        if (this.game?.camera) b.quaternion.copy(this.game.camera.quaternion);
        b.scale.setScalar(e.T.static ? 2.5 : 1 + e.maxHp * 0.03);
        f.scale.x = k;
        f.material.color.set(k > 0.5 ? 0x3ddc5a : k > 0.25 ? 0xffc233 : 0xff4040);
      }
      if (!e.alive) {
        e.respawnTimer -= dt;
        if (e.T.noRespawn || this.netClient) continue; // 친구 쪽은 방장이 다시 살림
        if (e.respawnTimer <= 0 && e.home.distanceTo(near.pos) > 15) {
          e.alive = true; e.hp = e.maxHp; e.pos.copy(e.home); e.mesh.visible = true; e.mesh.rotation.set(0, 0, 0); e.mesh.scale.setScalar(1);
        }
        continue;
      }
      if (e.dying > 0 && e.T.static) { // 큰 구조물: 흔들리다 폭발
        e.dying -= dt;
        e.mesh.position.set(e.pos.x + (Math.random() - 0.5) * 0.4, e.pos.y, e.pos.z + (Math.random() - 0.5) * 0.4);
        if (Math.random() < 0.3) this.fx.burst(e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4)), 0xffa030, 3, 6);
        if (e.dying <= 0) this._die(e);
        continue;
      }
      if (e.T.static) {
        e.mesh.position.copy(e.pos);
        if (e.shield) { e.shield.visible = e.shielded; e.shield.material.opacity = 0.18 + Math.sin(time * 4) * 0.06; }
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.hitCD = Math.max(0, (e.hitCD || 0) - dt);
        e.mesh.scale.setScalar(1 + e.hitFlash * 0.15);
        if (e.mesh.userData.spin) e.mesh.userData.spin.rotation.z += dt;
        if (e.mesh.userData.press) e.mesh.userData.press.position.y = 3.6 + Math.abs(Math.sin(time * 3)) * 1.2;
        continue;
      }
      if (e.dying > 0) {
        e.dying -= dt;
        e.knock.y -= 30 * dt;
        e.pos.addScaledVector(e.knock, dt);
        e.mesh.rotation.x += dt * 15; e.mesh.rotation.z += dt * 10;
        e.mesh.position.copy(e.pos);
        if (e.dying <= 0) this._die(e);
        continue;
      }
      if (frozen) { e.mesh.position.copy(e.pos); continue; }
      if (e.flyT > 0) { // 날아가는 중 (공격 안 함)
        e.flyT -= dt;
        e.flyV.y -= 30 * dt;
        e.pos.addScaledVector(e.flyV, dt);
        e.mesh.rotation.x += dt * 9;
        const gy = this.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 1) + (e.flying ? 2.2 : 0);
        if (e.pos.y <= gy && e.flyV.y < 0) { e.pos.y = gy; e.flyT = 0; e.mesh.rotation.x = 0; this.fx.burst(e.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xd9c9a0, 6, 4); }
        e.mesh.position.copy(e.pos);
        continue;
      }
      if (e.stunT > 0) { e.stunT -= dt; e.mesh.position.copy(e.pos); e.mesh.rotation.z = Math.sin(time * 30) * 0.15 * e.stunT; continue; }
      if (e.T.shoots) this._shoot(e, dt, time, near, nd);
      if (this.netClient && e.netPos) { // 방장이 보낸 위치로 부드럽게
        if (e.pos.distanceTo(e.netPos) > 25) e.pos.copy(e.netPos); else e.pos.lerp(e.netPos, Math.min(1, dt * 10));
        let dy = (e.netYaw ?? e.yaw) - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 10);
        e.mesh.position.copy(e.pos); e.mesh.rotation.y = e.yaw;
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.mesh.scale.setScalar(1 + e.hitFlash * 0.4);
        const u = e.mesh.userData;
        if (u.wings) for (const w of u.wings) w.rotation.z = Math.sin(time * 50) * 0.5;
        if (u.legs) u.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 14 + i) * 0.4));
        continue;
      }
      const H = this.game?.hard;
      let tx, tz, speed = C.speed * e.T.speed * (H ? CFG.hard.enemySpeed : 1);
      if (nd < C.chaseRange * (H ? CFG.hard.chaseRange : 1) && near.alive) { tx = near.pos.x; tz = near.pos.z; }
      else {
        e.wanderT += dt * 0.4;
        tx = e.home.x + Math.cos(e.wanderT) * 6; tz = e.home.z + Math.sin(e.wanderT * 1.3) * 6; speed *= 0.5;
      }
      const dx = tx - e.pos.x, dz = tz - e.pos.z, dl = Math.hypot(dx, dz);
      let moving = dl > 0.5;
      if (e.T.hops) { // 개구리: 폴짝폴짝
        const g0 = this.world.terrainAt(e.pos.x, e.pos.z);
        if (e.pos.y <= g0 + 0.01) { e.hopT -= dt; moving = false; if (e.hopT <= 0 && dl > 0.5) { e.vy = 11; e.hopT = 0.8 + Math.random() * 0.8; e.pos.y += 0.05; } }
        else moving = true;
        speed *= 2.2;
      }
      if (moving) {
        const want = Math.atan2(dx, dz);
        let diff = want - e.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        e.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 3);
        const nx = e.pos.x + Math.sin(e.yaw) * speed * dt, nz = e.pos.z + Math.cos(e.yaw) * speed * dt;
        if (Math.abs(this.world.terrainAt(nx, nz) - this.world.terrainAt(e.pos.x, e.pos.z)) < 1.5 || e.flying) { e.pos.x = nx; e.pos.z = nz; }
      }
      const hd = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      const LR = e.leash;
      if (hd > LR) { const k = Math.max(LR / hd, 1 - dt * 1.5); e.pos.x = e.home.x + (e.pos.x - e.home.x) * k; e.pos.z = e.home.z + (e.pos.z - e.home.z) * k; } // 멀리 날아갔으면 천천히 돌아옴
      const g = this.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 1);
      if (e.flying) e.pos.y = Math.max(g, 0) + 2.2 * (e.T.size || 1) + Math.sin(time * 2 + e.wanderT) * 0.4;
      else if (e.T.hops) { e.vy -= 30 * dt; e.pos.y += e.vy * dt; if (e.pos.y < g) { e.pos.y = g; e.vy = 0; } }
      else e.pos.y = g;
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y = e.yaw;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.mesh.scale.setScalar(1 + e.hitFlash * 0.4);
      const u = e.mesh.userData;
      if (u.wings) for (const w of u.wings) w.rotation.z = Math.sin(time * 50) * 0.5;
      if (u.legs) u.legs.forEach((l, i) => (l.rotation.x = Math.sin(time * 14 + i) * 0.4));
      if (u.drill) u.drill.rotation.y += dt * 20;
    }
  }

  // ---- 미사일 로봇 ----
  _shoot(e, dt, time, near, nd) {
    const u = e.mesh.userData, me = this.game?.player;
    if (!me || !me.alive) return;
    const d = me.pos.distanceTo(e.pos);
    e.shootT -= dt;
    if (u.head) { const want = Math.atan2(me.pos.x - e.pos.x, me.pos.z - e.pos.z) - e.yaw; u.head.rotation.y += Math.atan2(Math.sin(want - u.head.rotation.y), Math.cos(want - u.head.rotation.y)) * Math.min(1, dt * 5); }
    const warn = e.shootT < 0.8 && d < 55;
    if (u.lamp) u.lamp.scale.setScalar(warn ? 0.18 * (1.4 + Math.sin(time * 30)) : 0.18);
    if (e.shootT > 0) return;
    e.shootT = 3 + Math.random() * 1.5;
    if (d > 55 || d < 4) return;
    const from = e.pos.clone().add(new THREE.Vector3(0, 2.8 * (e.T.size || 1), 0));
    const dir = me.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(from).normalize();
    this.missiles ??= [];
    if (!this.misGeo) { this.misGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8); this.misGeo.rotateX(Math.PI / 2); this.misMat = new THREE.MeshLambertMaterial({ color: 0xd83a2a, emissive: 0x400000 }); this.misTip = new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }); }
    const m = new THREE.Mesh(this.misGeo, this.misMat);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), this.misTip); tip.position.z = -0.6; m.add(tip);
    m.position.copy(from); this.scene.add(m);
    this.missiles.push({ m, pos: from, vel: dir.multiplyScalar(17), life: 5 });
    this.fx.burst(from.clone(), 0xffa030, 5, 4);
    SFX.punch?.();
  }
  _updateMissiles(dt) {
    if (!this.missiles?.length) return;
    const me = this.game.player;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const s = this.missiles[i];
      s.life -= dt;
      if (me?.alive) { // 천천히 따라옴
        const want = me.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(s.pos).normalize().multiplyScalar(s.vel.length());
        s.vel.lerp(want, Math.min(1, dt * 1.1));
      }
      s.pos.addScaledVector(s.vel, dt);
      s.m.position.copy(s.pos); s.m.lookAt(s.pos.clone().sub(s.vel));
      if (Math.random() < 0.5) this.fx.burst(s.pos.clone(), 0xcccccc, 1, 1);
      let boom = s.life <= 0 || s.pos.y < this.world.groundAt(s.pos.x, s.pos.z, s.pos.y + 1);
      if (me?.alive && s.pos.distanceTo(me.pos.clone().add(new THREE.Vector3(0, 0.9, 0))) < 1.5) {
        boom = true;
        if (me.attacking) { this.fx.burst(s.pos.clone(), 0xffffff, 8, 6); } // 공격 중이면 미사일을 부숨
        else me.hurt(s.pos);
      }
      if (boom) { this.fx.explosion(s.pos.clone(), 0.5); SFX.explosion(); this.scene.remove(s.m); this.missiles.splice(i, 1); }
    }
  }
  inRadius(pos, r) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || e.dying > 0 || e.asleep) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, dy = e.pos.y - pos.y;
      if (dx * dx + dz * dz < r * r && Math.abs(dy) < Math.max(r, 3)) out.push(e);
    }
    return out;
  }
}

// 체력 아이템
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.1, -0.35, -0.6, -0.1, -0.6, 0.2);
    s.bezierCurveTo(-0.6, 0.55, -0.15, 0.6, 0, 0.3);
    s.bezierCurveTo(0.15, 0.6, 0.6, 0.55, 0.6, 0.2);
    s.bezierCurveTo(0.6, -0.1, 0.1, -0.35, 0, -0.5);
    this.geo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1 });
    this.geo.center();
    this.mat = new THREE.MeshLambertMaterial({ color: 0xff4d6d, emissive: 0x661020 });
  }
  spawnRingBag(pos) {
    if (!this.bagGeo) {
      this.bagGeo = new THREE.SphereGeometry(0.55, 12, 10); this.bagMat = new THREE.MeshLambertMaterial({ color: 0xc8904a });
      this.bagTop = new THREE.TorusGeometry(0.35, 0.12, 8, 16); this.bagGold = new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0x7a5200 });
    }
    const m = new THREE.Group();
    const bag = new THREE.Mesh(this.bagGeo, this.bagMat); bag.scale.set(1, 0.9, 1);
    const ring = new THREE.Mesh(this.bagTop, this.bagGold); ring.position.y = 0.55; ring.rotation.x = Math.PI / 2;
    m.add(bag, ring);
    m.position.copy(pos);
    this.scene.add(m);
    this.items.push({ m, pos: pos.clone(), life: 25, vy: 8, bag: true });
  }
  spawnHeart(pos) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.items.push({ m, pos: pos.clone(), life: 20, vy: 6 });
  }
  update(dt, time, players, world) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const g = world.groundAt(it.pos.x, it.pos.z, it.pos.y) + 1;
      it.vy -= 20 * dt; it.pos.y += it.vy * dt;
      if (it.pos.y < g) { it.pos.y = g; it.vy = 0; }
      it.m.position.set(it.pos.x, it.pos.y + Math.sin(time * 3) * 0.15, it.pos.z);
      it.m.rotation.y = time * 2;
      it.m.visible = it.life > 3 || Math.floor(time * 10) % 2 === 0;
      let taken = false;
      for (const p of players) {
        if (p.alive && p.pos.distanceTo(it.pos) < 1.8) {
          if (it.bag) { p.collectRing(CFG.items.ringBag); SFX.ringBag(); p.game.hud.toast(`💰 링 주머니! +${CFG.items.ringBag}`, 'gold'); }
          else p.collectHeart();
          taken = true; break;
        }
      }
      if (taken || it.life <= 0) { this.scene.remove(it.m); this.items.splice(i, 1); }
    }
  }
}
