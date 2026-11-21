// 6스테이지 '최후의 결전': 슈퍼 상태로 우주를 날며 싸우는 비행 슈팅 (1945 같은 방식)
//  - 앞으로 계속 날아가고, 정해진 넓은 범위(4명이 넉넉하게) 안에서만 움직임
//  - 몬스터는 시간표대로 나옴 (같이 하기: 모두 같은 시간표 → 같은 몬스터, 맞힌 피해는 서로 알려줌)
//  - 자동 에너지탄 / A = 빠른 대시 / B = 사방으로 에너지 오로라 펑! / C = 궁극기 (1분마다)
//  - 몬스터를 다 무찌르면 최종 보스: 닥터 기어의 최종 전함
import * as THREE from '../vendor/three.module.js';
import { SFX } from './audio.js';
import { mulberry32 } from './world.js';
import { robotMesh } from './enemies.js';
import { toon } from './character.js';

export const SH = {
  scroll: 26,                 // 앞으로 날아가는 속도
  halfW: 52, back: -8, front: 44, // 움직일 수 있는 범위 (가로 ±52m, 앞뒤 -8~44m)
  speed: 30, dashSpeed: 85, dashTime: 0.22, dashCD: 0.6,
  fireEvery: 0.12, boltSpeed: 95, boltDmg: 1,
  auraR: 17, auraDmg: 5, auraCD: 0.9,
  bombCD: 60, bombDmg: 30,
  hp: 100, bulletDmg: 8, bodyDmg: 12, laserDmg: 20, respawn: 3,
  bossHp: 650,
  heartHeal: 25,              // 하트 하나로 채우는 체력
  heartDrop: 0.4,             // 몬스터를 물리쳤을 때 하트가 나올 확률 (육중한 로봇은 항상)
  bossHeartEvery: 9,          // 보스전: 몇 초마다 하트가 날아오는지
  heartDrift: 7,              // 하트가 플레이어 쪽으로 흘러오는 속도
};
const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: o < 1, opacity: o, depthWrite: o >= 1 });

// 몬스터 시간표 (모두에게 똑같음)
function makeSchedule() {
  const r = mulberry32(2026), list = [];
  let t = 3;
  const push = (o) => list.push({ id: list.length, ...o });
  for (let w = 0; w < 34; w++) {
    const kind = w < 4 ? 'drone' : ['drone', 'fighter', 'drone', 'mine', 'heavy', 'fighter'][w % 6];
    const side = r() < 0.5 ? -1 : 1;
    if (kind === 'drone') { const n = 5 + (w % 3); const x0 = (r() - 0.5) * 60; for (let i = 0; i < n; i++) push({ type: 'drone', t0: t + i * 0.35, x0: x0 + side * i * 4, amp: 10 + r() * 14, ph: r() * 6 }); }
    else if (kind === 'fighter') { for (let i = 0; i < 3; i++) push({ type: 'fighter', t0: t + i * 0.7, x0: (i - 1) * 26 + (r() - 0.5) * 8, stay: 30 + r() * 8 }); }
    else if (kind === 'mine') { for (let i = 0; i < 8; i++) push({ type: 'mine', t0: t + i * 0.25, x0: (r() - 0.5) * 96, amp: 0, ph: r() * 6 }); }
    else push({ type: 'heavy', t0: t, x0: (r() - 0.5) * 40, stay: 34 });
    t += kind === 'heavy' ? 6 : 4.2 - Math.min(1.6, w * 0.05);
  }
  return { list, end: t };
}
const TYPE = {
  drone: { hp: 3, r: 2.2, size: 1.6, speed: 30, mesh: 'wasp' },
  fighter: { hp: 6, r: 2.6, size: 1.8, speed: 22, mesh: 'gunner', shoot: 1.6 },
  mine: { hp: 2, r: 2.0, size: 1.0, speed: 16, mesh: null },
  heavy: { hp: 26, r: 4.5, size: 3.2, speed: 12, mesh: 'brute', shoot: 2.2 },
};

export class Shmup {
  constructor(game, o) { // o: { net, pl, onWin(), onToast }
    this.game = game; this.o = o; this.net = o.net; this.pl = o.pl;
    this.scene = game.scene; this.camera = game.camera;
    this.active = false; this.t = 0; this.phase = 'waves';
    const S = makeSchedule(); this.sched = S.list; this.waveEnd = S.end;
    this.enemies = new Map();     // id → 살아 있는 몬스터
    this.dead = new Set();        // 죽은 몬스터 id (모두 같음)
    this.shots = []; this.bolts = []; this.hearts = new Map(); this.heartsTaken = new Set();
    this.lx = 0; this.lz = 6; this.vx = 0; this.vz = 0;
    this.fireT = 0; this.dashT = 0; this.dashCD = 0; this.auraCD = 0; this.bombCD = 0; this.downT = 0; this.invuln = 0;
    this.n = 1;
    this.boltGeo = new THREE.SphereGeometry(0.35, 6, 4); this.boltMat = glow(0xfff2a0);
    this.shotGeo = new THREE.SphereGeometry(0.7, 8, 6); this.shotMat = glow(0xff3a5a);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.hudEl = { dash: document.getElementById('sh-dash'), aura: document.getElementById('sh-aura'), bomb: document.getElementById('sh-bomb'), wave: document.getElementById('sh-wave') };
  }
  get z0() { return this.t * SH.scroll; }
  start(t = 0) {
    this.active = true; this.t = t; this.n = Math.max(1, this.net?.shared ? this.net.count : 1);
    const pl = this.pl = this.game.player || this.pl; // 지금 고른 캐릭터 pl.superOn = true; pl.state = 'air'; pl.alive = true; pl.health = SH.hp; pl.view.root.visible = true;
    document.body.classList.add('shmup');
    this.game.hud.setQuest('최후의 결전', '닥터 기어의 함대를 물리쳐라! A 대시 · B 오로라 · C 궁극기 · ❤️ 하트는 체력이 필요한 친구가 먹기!');
    if (this.net?.shared && this.net.host) this.net.sendGame({ t: 'sx', tm: this.t });
    this.syncT = 1;
  }
  stop() { this.active = false; document.body.classList.remove('shmup'); }

  // ---- 같이 하기 소식 ----
  onNet(m) {
    if (m.t === 'sx') { if (Math.abs(m.tm - this.t) > 0.4) this.t = +m.tm; if (m.boss && this.phase === 'waves') this.startBoss(); }
    else if (m.t === 'sh') { // 친구가 하트를 먹음 → 내 화면에서도 사라짐
      const id = String(m.i); this.heartsTaken.add(id); const h = this.hearts.get(id);
      if (h) { this.group.remove(h.mesh); this.hearts.delete(id); this.game.fx.burst(h.mesh.position.clone(), 0xff6a8a, 8, 5); }
      this.o.onToast?.(`💗 ${m.who || '친구'}가 하트를 먹었어요!`);
    }
    else if (m.t === 'sd') { const e = this.enemies.get(m.i | 0); if (e) this.damage(e, +m.d || 1, true); else if (m.i === -1 && this.boss) this.hitBoss(+m.d || 1, true); }
  }

  // ---- 몬스터 ----
  _spawn(s) {
    const T = TYPE[s.type];
    let mesh;
    if (T.mesh) { mesh = new THREE.Group(); const inner = robotMesh(T.mesh); inner.scale.setScalar(T.size); mesh.add(inner); if (s.type !== 'drone') { const jet = new THREE.Mesh(new THREE.ConeGeometry(0.8 * T.size, 2.5 * T.size, 8), glow(0x66ccff, 0.8)); jet.rotation.x = -Math.PI / 2; jet.position.set(0, T.size, -1.5 * T.size); mesh.add(jet); } }
    else { mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), toon(0xd83a2a)); const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), glow(0xffd040)); sp.position.y = 1.4; mesh.add(sp); }
    this.group.add(mesh);
    const e = { s, T, hp: Math.round(T.hp * (1 + 0.5 * (this.n - 1))), mesh, kx: 0, kz: 0, kv: new THREE.Vector2(), shootT: T.shoot ? 1 + (s.id % 5) * 0.2 : 0, flash: 0, pos: new THREE.Vector3() };
    this.enemies.set(s.id, e);
  }
  _local(e) { // 몬스터 위치 (앞쪽에서 날아와 지나감)
    const s = e.s, a = this.t - s.t0;
    let lx = s.x0, lz;
    if (s.type === 'drone') { lz = 80 - a * e.T.speed; lx = s.x0 + Math.sin(a * 1.4 + s.ph) * s.amp; }
    else if (s.type === 'mine') { lz = 80 - a * e.T.speed; lx = s.x0 + Math.sin(a * 0.6 + s.ph) * 4; }
    else { // 들어와서 머물며 쏘다가 빠져나감
      const inT = (80 - s.stay) / e.T.speed;
      lz = a < inT ? 80 - a * e.T.speed : a < inT + 9 ? s.stay : s.stay - (a - inT - 9) * e.T.speed * 1.6;
      lx = s.x0 + Math.sin(a * 0.5) * 10;
    }
    return [lx + e.kx, lz + e.kz];
  }
  damage(e, d, remote = false) {
    if (!remote && this.net?.shared) this.net.sendGame({ t: 'sd', i: e.s.id, d });
    e.hp -= d; e.flash = 0.15;
    if (e.hp <= 0) this._kill(e);
  }
  _kill(e) {
    this.dead.add(e.s.id); this.enemies.delete(e.s.id); this.group.remove(e.mesh);
    this.game.fx.explosion(e.pos.clone(), e.T.size * 0.6); this.game.fx.burst(e.pos.clone(), 0xffd040, 10, 10);
    SFX.enemyPop(); if (e.T.size > 2) SFX.explosion();
    this.kills = (this.kills || 0) + 1;
    // 하트: 모두에게 같은 몬스터에서 나옴 (몬스터 번호로 정함)
    const r = ((e.s.id * 2654435761) >>> 0) % 1000 / 1000;
    if (e.s.type === 'heavy' || r < SH.heartDrop) this._heart('k' + e.s.id, e.pos.x, e.pos.z - this.z0);
  }
  // ---- 하트 (체력 회복): 먼저 먹은 한 명만! ----
  _heart(id, lx, lz) {
    if (this.hearts.has(id) || this.heartsTaken.has(id)) return;
    if (!this.heartGeo) {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.5); sh.bezierCurveTo(-0.1, -0.35, -0.6, -0.1, -0.6, 0.2); sh.bezierCurveTo(-0.6, 0.55, -0.15, 0.6, 0, 0.3);
      sh.bezierCurveTo(0.15, 0.6, 0.6, 0.55, 0.6, 0.2); sh.bezierCurveTo(0.6, -0.1, 0.1, -0.35, 0, -0.5);
      this.heartGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1 }); this.heartGeo.center();
      this.heartMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false });
      this.heartGlow = glow(0xff9ab0, 0.35);
    }
    const g = new THREE.Group(), m = new THREE.Mesh(this.heartGeo, this.heartMat); m.scale.setScalar(2.6); g.add(m);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), this.heartGlow); g.add(halo);
    this.group.add(g);
    this.hearts.set(id, { id, mesh: g, lx, lz, t: 0 });
  }
  _updateHearts(dt) {
    const pl = this.pl;
    for (const h of [...this.hearts.values()]) {
      h.t += dt; h.lz -= SH.heartDrift * dt;
      if (h.lz < SH.back - 12 || h.t > 25) { this.group.remove(h.mesh); this.hearts.delete(h.id); continue; } // 놓침
      h.mesh.position.set(h.lx, 0.5 + Math.sin(h.t * 3) * 0.4, this.z0 + h.lz);
      h.mesh.rotation.y = h.t * 2.5;
      const full = pl.health >= SH.hp;
      h.mesh.children[1].visible = !full || Math.floor(h.t * 4) % 2 === 0;
      // 체력이 가득이면 먹지 않고 지나감 → 친구에게 양보할 수 있음
      if (this.downT <= 0 && !full && Math.hypot(h.lx - this.lx, h.lz - this.lz) < 3) {
        pl.health = Math.min(SH.hp, pl.health + SH.heartHeal);
        this.group.remove(h.mesh); this.hearts.delete(h.id); this.heartsTaken.add(h.id);
        this.game.fx.burst(pl.pos.clone(), 0xff6a8a, 16, 7); SFX.heal?.();
        this.o.onToast?.(`❤️ 체력 +${SH.heartHeal}!`);
        if (this.net?.shared) this.net.sendGame({ t: 'sh', i: h.id, who: this.o.myName?.() });
      }
    }
  }
  _shoot(from, dir, speed = 26, homing = 0) {
    const m = new THREE.Mesh(this.shotGeo, this.shotMat); m.position.copy(from); this.group.add(m);
    this.shots.push({ m, lx: from.x, lz: from.z - this.z0, vx: dir.x * speed, vz: dir.z * speed, life: 6, homing });
  }
  _aimDir(px, pz) { // 가장 가까운 플레이어 쪽
    let best = null, bd = Infinity;
    const cand = [{ x: this.lx, z: this.lz, me: true }, ...[...(this.net?.remotes?.values() || [])].map((r) => ({ x: r.pos.x, z: r.pos.z - this.z0 }))];
    for (const c of cand) { const d = Math.hypot(c.x - px, c.z - pz); if (d < bd) { bd = d; best = c; } }
    const v = new THREE.Vector3(best.x - px, 0, best.z - pz); if (v.lengthSq() < 0.01) v.set(0, 0, -1); return v.normalize();
  }

  // ---- 보스: 닥터 기어의 최종 전함 ----
  startBoss() {
    if (this.phase !== 'waves') return;
    this.phase = 'boss'; this.bossT = 0;
    if (this.net?.shared) this.net.sendGame({ t: 'sx', tm: this.t, boss: 1 });
    const g = new THREE.Group(), hull = toon(0x4a3a6a), dark = toon(0x2c3036), gold = toon(0xffc233);
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o; };
    const sph = new THREE.SphereGeometry(1, 24, 16), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
    add(sph, hull, 0, 0, 0, 14, 5, 20); add(box, dark, 0, -2, 0, 26, 2, 30); add(cyl, gold, 0, 0, 0, 14.5, 1, 20.5).rotation.x = 0;
    for (const s of [-1, 1]) { add(box, hull, s * 20, -1, -4, 18, 1.6, 12).rotation.z = s * 0.15; add(cyl, dark, s * 28, -1, 6, 2, 14, 2).rotation.x = Math.PI / 2; add(sph, glow(0xff3020), s * 28, -1, 13.2, 1.4, 1.4, 1.4); }
    add(sph, glow(0x9a5aff, 0.55), 0, 4.5, -3, 5, 4, 5);                    // 조종석 유리
    add(sph, toon(0x6a4a9a), 0, 4, -3, 1.6, 2.4, 1.6); add(sph, toon(0xffd9b8), 0, 6.6, -3, 1.2, 1.2, 1.2); add(sph, glow(0xff3020), 0.4, 6.8, -1.9, 0.35, 0.35, 0.2); // 닥터 기어
    for (const x of [-8, 0, 8]) { const f = add(new THREE.ConeGeometry(2.2, 8, 12), glow(0x66ccff, 0.8), x, 0, -24); f.rotation.x = -Math.PI / 2; }
    this.core = add(sph, glow(0xff8a20), 0, 0, 20.5, 3, 3, 1.5);
    this.bossMesh = g; this.group.add(g);
    g.scale.setScalar(0.75);
    this.boss = { hp: Math.round(SH.bossHp * (1 + 0.6 * (this.n - 1))), max: 0, lx: 0, lz: 120, flash: 0 };
    this.boss.max = this.boss.hp;
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 120), glow(0xff3a5a, 0.35)); this.laser.visible = false; this.group.add(this.laser);
    this.game.hud.setQuest('최종 보스: 닥터 기어의 최종 전함', '미사일을 피하면서 공격! 빨간 선 = 레이저! ❤️ 하트가 날아오면 누가 먹을지 정해요');
    SFX.bossRoar?.(); this.o.onToast?.('⚠️ 닥터 기어의 최종 전함이 나타났다!');
  }
  hitBoss(d, remote = false) {
    const B = this.boss; if (!B || B.hp <= 0) return;
    if (!remote && this.net?.shared) this.net.sendGame({ t: 'sd', i: -1, d });
    B.hp -= d; B.flash = 0.1;
    if (B.hp <= 0) { this.phase = 'dying'; this.dieT = 0; SFX.explosion(); }
  }
  _bossUpdate(dt) {
    const B = this.boss; this.bossT += dt;
    const bt = this.bossT;
    B.lz += (48 - B.lz) * Math.min(1, dt * 0.8);
    B.lx = Math.sin(bt * 0.35) * 26;
    const bp = new THREE.Vector3(B.lx, 6, this.z0 + B.lz);
    this.bossMesh.position.copy(bp); this.bossMesh.rotation.y = Math.PI; this.bossMesh.rotation.z = Math.sin(bt * 0.8) * 0.06;
    this.bossMesh.visible = B.flash > 0 ? Math.floor(bt * 30) % 2 === 0 : true; B.flash = Math.max(0, B.flash - dt);
    this.core.scale.setScalar(3 * (1 + Math.sin(bt * 6) * 0.1));
    if (this.phase === 'dying') {
      this.dieT += dt;
      if (Math.random() < dt * 10) this.game.fx.explosion(bp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 30)), 1.5);
      if (Math.random() < dt * 4) SFX.explosion();
      this.bossMesh.position.y -= this.dieT * 2; this.bossMesh.rotation.z += dt * 0.4;
      if (this.dieT > 4 && !this.won) { this.won = true; this.laser.visible = false; this.o.onWin?.(); }
      return;
    }
    // 공격 순서 (시간표): 부채꼴 탄 → 따라오는 미사일 → 레이저 → 로봇 부르기
    const cyc = bt % 16, prev = (bt - dt) % 16, hit = (k) => prev < k && cyc >= k;
    const enraged = B.hp < B.max * 0.4;
    if (hit(1) || hit(3) || (enraged && hit(5))) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + bt; this._shoot(bp.clone().setY(0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a) * 0.6 - 0.6).normalize(), 20); }
    if (hit(6) || hit(6.5) || hit(7)) for (const s of [-28, 28]) this._shoot(new THREE.Vector3(B.lx + s, 0, this.z0 + B.lz + 6), this._aimDir(B.lx + s, B.lz), 18, 1.2);
    if (cyc >= 9 && cyc < 13.5) { // 레이저: 1.2초 빨간 선(경고) → 굵은 빔이 옆으로 쓸고 지나감
      const k = cyc - 9, lx = -48 + Math.min(1, Math.max(0, (k - 1.2) / 3)) * 96;
      this.laser.visible = true; this.laser.position.set(k < 1.2 ? this.lx : lx, 0, this.z0 + 20);
      if (k < 1.2) { this.laserAim = this.lx; this.laser.position.x = this.laserAim; this.laser.scale.set(0.4, 0.4, 1); this.laser.material.opacity = 0.5 + Math.sin(bt * 30) * 0.3; }
      else { this.laser.position.x = lx; this.laser.scale.set(4, 4, 1); this.laser.material.opacity = 0.85; if (Math.abs(this.lx - lx) < 3 && this.invuln <= 0 && this.downT <= 0) this._hurt(SH.laserDmg); }
    } else this.laser.visible = false;
    if (hit(14)) for (let i = 0; i < 5; i++) { const id = 10000 + Math.floor(bt / 16) * 10 + i; if (!this.dead.has(id) && !this.enemies.has(id)) this._spawn({ id, type: 'drone', t0: this.t, x0: B.lx + (i - 2) * 10, amp: 8, ph: i }); }
    // 몸에 부딪힘
    if (Math.abs(this.lx - B.lx) < 22 && Math.abs(this.lz - B.lz) < 14) this._hurt(SH.bodyDmg, bp);
  }

  // ---- 플레이어 ----
  _hurt(d, from) {
    if (this.invuln > 0 || this.downT > 0) return;
    const pl = this.pl;
    pl.health -= d * (this.game.hard ? 1.4 : 1); this.invuln = 1.0; SFX.hurt();
    this.game.fx.burst(pl.pos.clone(), 0xffffff, 10, 6); this.game.hud.flash?.('rgba(255,60,60,0.35)');
    if (pl.health <= 0) { this.downT = SH.respawn; pl.view.root.visible = false; this.game.fx.explosion(pl.pos.clone(), 1.2); this.o.onToast?.('으앗! 3초 뒤 다시 날아올라요!'); }
  }
  _aura() {
    const p = this.pl.pos;
    this.game.fx.shockwave(p.clone(), SH.auraR, 0xffe14d); this.game.fx.shockwave(p.clone(), SH.auraR * 0.6, 0xff7ad9); this.game.fx.burst(p.clone(), 0xfff2a0, 30, 16);
    SFX.explosion();
    for (const e of [...this.enemies.values()]) {
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d < SH.auraR + e.T.r) { e.kv.set(dx / (d || 1) * 40, dz / (d || 1) * 40); this.damage(e, SH.auraDmg); }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) { const s = this.shots[i]; if (Math.hypot(s.m.position.x - p.x, s.m.position.z - p.z) < SH.auraR) { this.group.remove(s.m); this.shots.splice(i, 1); } }
    if (this.boss && Math.hypot(this.boss.lx - this.lx, this.boss.lz - this.lz) < SH.auraR + 16) this.hitBoss(SH.auraDmg);
  }
  _bomb() {
    this.game.hud.flash?.('rgba(255,240,180,0.85)');
    for (let i = 0; i < 5; i++) setTimeout(() => this.game.fx.shockwave(this.pl.pos.clone(), 20 + i * 18, [0xffe14d, 0xff7ad9, 0x4fd8ff][i % 3]), i * 90);
    this.game.fx.explosion(this.pl.pos.clone().add(new THREE.Vector3(0, 0, 20)), 4);
    SFX.explosion(); SFX.superReady?.();
    for (const e of [...this.enemies.values()]) if (e.pos.z - this.z0 < 90) this.damage(e, SH.bombDmg);
    for (const s of this.shots) this.group.remove(s.m); this.shots.length = 0;
    if (this.boss && this.phase === 'boss') this.hitBoss(SH.bombDmg);
    this.o.onToast?.('💥 궁극기! 화면 전체 공격!');
  }

  update(dt, input) {
    this.t += dt;
    const pl = this.pl, z0 = this.z0;
    // 방장이 시간을 알려줌 (모두 같은 몬스터)
    if (this.net?.shared && this.net.host) { this.syncT -= dt; if (this.syncT <= 0) { this.syncT = 1; this.net.sendGame({ t: 'sx', tm: +this.t.toFixed(2), boss: this.phase !== 'waves' ? 1 : 0 }); } }
    // 몬스터 등장 (시간표)
    for (const s of this.sched) if (s.t0 <= this.t && s.t0 > this.t - 12 && !this.dead.has(s.id) && !this.enemies.has(s.id) && !s.gone) this._spawn(s);
    if (this.phase === 'waves' && this.t > this.waveEnd + 4 && this.enemies.size === 0) this.startBoss();
    // 플레이어 이동
    this.invuln = Math.max(0, this.invuln - dt); this.dashCD = Math.max(0, this.dashCD - dt); this.auraCD = Math.max(0, this.auraCD - dt); this.bombCD = Math.max(0, this.bombCD - dt);
    const A = input.buttons.a, Bb = input.buttons.b, C = input.buttons.c;
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0) { pl.health = SH.hp; this.invuln = 2; this.lx = 0; this.lz = 4; pl.view.root.visible = true; }
    } else {
      const mx = -input.move.x, mz = input.move.y;
      if (A?.pressed && this.dashCD <= 0) { const l = Math.hypot(mx, mz); this.dashDir = l > 0.2 ? [mx / l, mz / l] : [0, 1]; this.dashT = SH.dashTime; this.dashCD = SH.dashCD; this.invuln = Math.max(this.invuln, 0.3); SFX.boost?.(); this.game.fx.burst(pl.pos.clone(), 0xffffff, 12, 8); }
      if (this.dashT > 0) { this.dashT -= dt; this.vx = this.dashDir[0] * SH.dashSpeed; this.vz = this.dashDir[1] * SH.dashSpeed; }
      else { this.vx += (mx * SH.speed - this.vx) * Math.min(1, dt * 10); this.vz += (mz * SH.speed - this.vz) * Math.min(1, dt * 10); }
      this.lx = Math.max(-SH.halfW, Math.min(SH.halfW, this.lx + this.vx * dt));
      this.lz = Math.max(SH.back, Math.min(SH.front, this.lz + this.vz * dt));
      if (Bb?.pressed && this.auraCD <= 0) { this.auraCD = SH.auraCD; this._aura(); }
      if (C?.pressed) { if (this.bombCD <= 0) { this.bombCD = SH.bombCD; this._bomb(); } else this.o.onToast?.(`궁극기 준비 중... ${Math.ceil(this.bombCD)}초`); }
      // 자동 에너지탄
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = SH.fireEvery; for (const s of [-0.9, 0.9]) { const m = new THREE.Mesh(this.boltGeo, this.boltMat); m.scale.set(1, 1, 3); this.group.add(m); this.bolts.push({ m, lx: this.lx + s, lz: this.lz + 1.5, life: 0.9 }); } }
    }
    pl.pos.set(this.lx, Math.sin(this.t * 3) * 0.4, z0 + this.lz);
    pl.yaw = 0; pl.vel.set(this.vx, 0, SH.scroll + this.vz);
    const v = pl.view; v.root.scale.setScalar(1.7);
    v.root.visible = this.downT <= 0 && (this.invuln <= 0 || Math.floor(this.t * 16) % 2 === 0);
    pl.updateView?.(dt); v.root.position.copy(pl.pos); v.root.rotation.set(0.5 + this.vz * 0.004, 0, -this.vx * 0.012); v.root.visible = this.downT <= 0 && (this.invuln <= 0 || Math.floor(this.t * 16) % 2 === 0);
    if (Math.random() < 0.6) this.game.fx.burst(pl.pos.clone().add(new THREE.Vector3(0, 0, -1)), 0xffe14d, 1, 3);
    // 에너지탄
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.life -= dt; b.lz += SH.boltSpeed * dt;
      b.m.position.set(b.lx, 0, z0 + b.lz);
      let used = b.life <= 0;
      if (!used) for (const e of this.enemies.values()) { if (Math.abs(e.pos.x - b.lx) < e.T.r && Math.abs(e.pos.z - (z0 + b.lz)) < e.T.r + 1) { this.damage(e, SH.boltDmg); used = true; break; } }
      if (!used && this.boss && this.phase === 'boss' && Math.abs(this.boss.lx - b.lx) < 20 && Math.abs(this.boss.lz - b.lz) < 14) { this.hitBoss(SH.boltDmg); used = true; this.game.fx.burst(b.m.position.clone(), 0xffd040, 2, 4); }
      if (used) { this.group.remove(b.m); this.bolts.splice(i, 1); }
    }
    // 몬스터
    for (const e of [...this.enemies.values()]) {
      e.kx += e.kv.x * dt; e.kz += e.kv.y * dt; e.kv.multiplyScalar(Math.max(0, 1 - dt * 3)); e.kx *= 1 - dt * 0.5; e.kz *= 1 - dt * 0.5;
      const [lx, lz] = this._local(e);
      if (lz < -30) { this.enemies.delete(e.s.id); this.group.remove(e.mesh); e.s.gone = true; continue; } // 지나감
      e.pos.set(lx, 0, z0 + lz);
      e.mesh.position.copy(e.pos); e.mesh.rotation.y = Math.PI + Math.sin(this.t * 2 + e.s.id) * 0.2; e.mesh.rotation.z += e.kv.length() * dt * 0.2;
      if (e.s.type === 'mine') e.mesh.rotation.y += dt * 3;
      e.flash = Math.max(0, e.flash - dt); e.mesh.scale.setScalar(1 + e.flash * 2);
      if (e.T.shoot && lz < 70) { e.shootT -= dt; if (e.shootT <= 0) { e.shootT = e.T.shoot; if (e.s.type === 'heavy') for (let k = -2; k <= 2; k++) { const d = this._aimDir(lx, lz); d.applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.22); this._shoot(e.pos.clone(), d, 20); } else this._shoot(e.pos.clone(), this._aimDir(lx, lz), 24); } }
      if (this.downT <= 0 && Math.hypot(lx - this.lx, lz - this.lz) < e.T.r + 1.2) { this._hurt(SH.bodyDmg); if (e.s.type === 'mine') this.damage(e, 99); }
    }
    // 적 탄
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.life -= dt;
      if (s.homing) { const d = this._aimDir(s.lx, s.lz), sp = Math.hypot(s.vx, s.vz); s.vx += (d.x * sp - s.vx) * Math.min(1, dt * s.homing); s.vz += (d.z * sp - s.vz) * Math.min(1, dt * s.homing); }
      s.lx += s.vx * dt; s.lz += s.vz * dt;
      s.m.position.set(s.lx, 0, z0 + s.lz);
      let gone = s.life <= 0 || s.lz < -40 || Math.abs(s.lx) > 90;
      if (!gone && this.downT <= 0 && Math.hypot(s.lx - this.lx, s.lz - this.lz) < 1.5) { this._hurt(SH.bulletDmg); gone = true; }
      if (gone) { this.group.remove(s.m); this.shots.splice(i, 1); }
    }
    if (this.boss) this._bossUpdate(dt);
    // 보스전: 정해진 시간마다 하트가 날아옴 (모두에게 같은 자리)
    if (this.boss && this.phase === 'boss') { const n = Math.floor(this.bossT / SH.bossHeartEvery); if (n > (this.lastBossHeart ?? 0)) { this.lastBossHeart = n; this._heart('b' + n, Math.sin(n * 1.7) * 38, SH.front + 6); } }
    this._updateHearts(dt);
    // 카메라: 위 뒤에서 내려다봄
    const cam = this.camera;
    cam.up.set(0, 1, 0); cam.position.set(this.lx * 0.25, 40, z0 - 30); cam.lookAt(this.lx * 0.25, -4, z0 + 22);
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov = 60; cam.updateProjectionMatrix(); }
    // 아래 정보
    const H = this.hudEl;
    if (H.dash) { H.dash.style.opacity = this.dashCD > 0 ? 0.5 : 1; H.aura.style.opacity = this.auraCD > 0 ? 0.5 : 1; H.bomb.textContent = this.bombCD > 0 ? `C 궁극기 ${Math.ceil(this.bombCD)}초` : 'C 궁극기 준비!'; H.wave.textContent = this.boss ? `보스 ${Math.max(0, Math.ceil(this.boss.hp / this.boss.max * 100))}%` : `함대 ${Math.min(100, Math.round(this.t / (this.waveEnd + 4) * 100))}%`; }
    if (this.boss) this.game.hud.setBoss?.('🛸 닥터 기어의 최종 전함', Math.max(0, this.boss.hp / this.boss.max));
  }
}
