// 퀘스트를 깨기 전에 장벽 너머로 넘어가면: "어림도 없다!" — 거대하고 빠르고 강한 기어 군단이 쫓아옴.
// 거의 도망칠 수 없지만, 정말로 북쪽 눈길 끝(다음 대지)까지 달려가면 넘어갈 수 있음.
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { SFX } from './audio.js';
import { NAMES } from './names.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Guardians {
  constructor(game) {
    this.game = game; this.active = false; this.t = 0; this.robots = []; this.shots = []; this.leaveT = 0;
    const metal = new THREE.MeshLambertMaterial({ color: 0x3a3f48 }), dark = new THREE.MeshLambertMaterial({ color: 0x1e2228 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }), stripe = new THREE.MeshLambertMaterial({ color: 0xffc233 });
    const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < CFG.guardian.count; i++) {
      const g = new THREE.Group();
      const add = (parent, geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
      const body = new THREE.Group(); g.add(body);
      add(body, box, metal, 0, 26, 0, 14, 14, 9); add(body, box, stripe, 0, 20, 4.6, 14, 1.4, 0.2);
      add(body, sph, metal, 0, 37, 0, 7, 6, 6);
      const e = add(body, box, eye, 0, 37.5, 5.6, 8, 1.4, 0.6);
      const legs = [];
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(sx * 4, 19, 0); g.add(hip);
        add(hip, box, dark, 0, -9, 0, 4, 18, 4); add(hip, box, metal, 0, -18.5, 1.5, 5, 1.5, 8);
        legs.push(hip);
        const arm = add(body, box, dark, sx * 9.5, 24, 0, 3.5, 16, 3.5); add(body, sph, metal, sx * 9.5, 14, 0, 3, 3, 3);
        arm.userData.s = sx;
      }
      g.userData = { eye: e, legs, body, y0: 0, laserT: 0, stompT: 0, stomping: 0 };
      g.visible = false;
      game.scene.add(g);
      this.robots.push(g);
    }
    this.warnMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    this.cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  }
  get speed() { return this.game.hard ? CFG.guardian.hardSpeed : CFG.guardian.speed; }

  // at: 장벽을 넘은 곳 (같이 하기: 누가 넘든 모두에게 똑같이 — 넘은 곳 근처 + 장벽 바깥 둘레 전체에 우르르)
  trigger(at = null, broadcast = true) {
    if (this.active) return;
    const pl = this.game.player, W = this.game.world;
    this.active = true; this.t = 0; this.leaveT = 0; this.escapeToast = false;
    const c = (at || pl.pos).clone();
    if (broadcast && this.game.net?.shared) this.game.net.sendGame({ t: 'gd', x: +c.x.toFixed(1), z: +c.z.toFixed(1) });
    const out = V(c.x, 0, c.z).normalize(), side = V(out.z, 0, -out.x);
    const D = CFG.guardian.startDist, near = CFG.guardian.near, R = CFG.world.barrierR + 70, a0 = Math.atan2(c.z, c.x);
    const spots = [[-1.0, 0], [-0.8, 0.9], [-0.8, -0.9], [0.2, 1.3], [1.5, 0.15]];
    this.robots.forEach((g, i) => {
      let p;
      if (i < near) { const [f, s] = spots[i]; p = c.clone().addScaledVector(out, f * D).addScaledVector(side, s * D * 0.8); }
      else { const a = a0 + (i - near + 1) / (this.robots.length - near + 1) * Math.PI * 2; p = V(Math.cos(a) * R, 0, Math.sin(a) * R); }
      g.userData.y0 = W.groundAt(p.x, p.z, 999);
      g.position.set(p.x, g.userData.y0 - 45, p.z);
      g.lookAt(c.x, g.position.y, c.z);
      g.userData.laserT = 1.2 + i * 0.45; g.userData.stompT = 0; g.userData.stomping = 0;
      g.visible = true;
    });
    SFX.bossRoar(); SFX.warn();
    for (const p of this.game.players) p.shake = 1;
    // 짧은 장면: "어림도 없다!"
    const look = c.clone().add(V(0, 12, 0)), r0 = this.robots[0];
    const cam = c.clone().addScaledVector(out, 14).add(V(0, 4, 0));
    this.game.playCine?.([
      { from: { pos: cam, look }, to: { pos: cam.clone().add(V(0, 6, 0)), look: r0.position.clone().setY(g0y(r0) + 30) }, dur: 2.2, hold: 0.8,
        who: `${NAMES.villain}:`, text: '어림도 없다! 내 기계 군단을 이길 수 있을 것 같으냐!' },
      { from: { pos: c.clone().add(V(0, 60, 0)).addScaledVector(out, -40), look: c }, to: { pos: c.clone().add(V(0, 75, 0)).addScaledVector(out, -50), look: c }, dur: 2, hold: 0.8,
        text: '도망쳐! 북쪽 눈길 끝까지 달려가면… 따돌릴 수 있을지도 몰라!' },
    ]);
    function g0y(g) { return g.userData.y0; }
  }
  stop() {
    for (const s of this.shots) { this.game.scene.remove(s.mesh); }
    this.shots = [];
    for (const g of this.robots) g.visible = false;
    this.active = false;
  }
  // 레이저: 빨간 조준선이 먼저 보이고 → 잠시 뒤 그 자리에 발사 (빠르게 움직이면 피할 수 있음)
  _aim(g, target) {
    const from = g.userData.eye.getWorldPosition(new THREE.Vector3());
    const mesh = new THREE.Mesh(this.cyl, this.warnMat);
    this.game.scene.add(mesh);
    const s = { g, from, to: target.clone(), mesh, t: CFG.guardian.laserWarn, fired: false };
    this._place(s, 0.25);
    this.shots.push(s);
    SFX.warn();
  }
  _place(s, r) {
    const len = s.from.distanceTo(s.to);
    s.mesh.position.copy(s.from).lerp(s.to, 0.5);
    s.mesh.scale.set(r, len, r);
    s.mesh.quaternion.setFromUnitVectors(V(0, 1, 0), s.to.clone().sub(s.from).normalize());
  }
  _damage(pl, from, mul) {
    if (!pl.alive || pl.state === 'dead') return;
    if (pl.superOn) { // 슈퍼여도 링이 크게 줄어듦
      pl.rings = Math.max(0, pl.rings - 25);
      const away = pl.pos.clone().sub(from).setY(0).normalize();
      pl.vel.set(away.x * 20, 14, away.z * 20); pl.state = 'air'; pl.s = 0;
      SFX.hurt(); pl.shake = 0.5;
      if (pl.rings <= 0) { pl.superOn = false; this.game.hud.toast('슈퍼 변신이 풀렸어요!'); }
    } else pl.hurt(from, mul);
  }

  update(dt, cineOnly = false) {
    if (!this.active) return;
    const game = this.game, pl = game.player, G = CFG.guardian, W = game.world;
    this.t += dt;
    const c = pl.pos.clone().add(V(0, 1, 0));
    // 땅에서 솟아오르기
    for (const g of this.robots) {
      g.position.y += (g.userData.y0 - g.position.y) * Math.min(1, dt * 2.2);
    }
    if (cineOnly) return;
    // 쫓아갈 대상: 장벽 밖에 있는 플레이어 (나 + 같이 하는 친구들)
    const outside = (p) => Math.hypot(p.x, p.z) > CFG.world.barrierR - 30 || p.z > CFG.world.barrierR;
    const targets = [];
    if (pl.alive && outside(pl.pos)) targets.push({ pos: pl.pos, me: true, vel: pl.vel, s: pl.s, yaw: pl.yaw, state: pl.state });
    for (const f of game.net?.proxies?.() || []) if (outside(f.pos)) targets.push({ pos: f.pos, me: false });
    // 장벽 밖에 아무도 없으면 돌아감
    if (!targets.length) {
      this.leaveT += dt;
      for (const g of this.robots) g.position.y -= dt * 30;
      if (this.leaveT > 2) { this.stop(); if (pl.alive) game.hud.toast(`🤖 ${NAMES.villain}: 흥, 겁먹고 돌아갔군!`, ''); }
      return;
    }
    this.leaveT = 0;
    if (!this.escapeToast && pl.pos.z > CFG.world.exitR - 150 && Math.abs(pl.pos.x) < 140) { this.escapeToast = true; game.hud.toast('조금만 더! 눈길 끝까지 달려!', 'gold'); }
    const sp = this.speed * (this.t < 3 ? 0.5 : 1);
    this.robots.forEach((g, i) => {
      const u = g.userData;
      let tg = targets[0], best = Infinity;
      for (const t of targets) { const dd = (t.pos.x - g.position.x) ** 2 + (t.pos.z - g.position.z) ** 2; if (dd < best) { best = dd; tg = t; } }
      const c = tg.pos.clone().add(V(0, 1, 0));
      const to = V(c.x - g.position.x, 0, c.z - g.position.z), d = to.length();
      // 쫓아가기 (발 구르기 중엔 멈춤)
      if (u.stomping > 0) {
        u.stomping -= dt;
        u.body.position.y = Math.sin((1 - u.stomping / 0.55) * Math.PI) * 6;
        if (u.stomping <= 0) { // 쿵!
          u.body.position.y = 0;
          const foot = g.position.clone().setY(u.y0);
          game.fx.shockwave(foot, G.stompRange, 0xffa040); game.fx.burst(foot.clone().add(V(0, 1, 0)), 0x8a7a5a, 20, 12);
          SFX.slamHit(); pl.shake = Math.max(pl.shake, 0.6);
          if (outside(pl.pos) && pl.pos.distanceTo(foot) < G.stompRange && pl.pos.y < foot.y + 8) this._damage(pl, foot, G.damage);
        }
      } else if (d > 9) {
        const step = Math.min(d - 8, sp * dt);
        g.position.x += to.x / d * step; g.position.z += to.z / d * step;
        u.y0 = W.groundAt(g.position.x, g.position.z, 999);
        g.position.y += (u.y0 - g.position.y) * Math.min(1, dt * 6);
        const ph = this.t * 5 + i;
        u.legs[0].rotation.x = Math.sin(ph) * 0.5; u.legs[1].rotation.x = -Math.sin(ph) * 0.5;
        u.body.position.y = Math.abs(Math.cos(ph)) * 1.2;
      } else if (tg.me && pl.alive) { // 붙잡힘
        game.fx.explosion(c, 2); SFX.explosion();
        pl.superOn = false; pl.invuln = 0; pl.die();
        game.hud.toast('기어 군단에게 붙잡혔어요! 퀘스트를 모두 깨고 장벽을 무너뜨려요!', '');
      }
      g.lookAt(c.x, g.position.y, c.z);
      u.eye.scale.x = 8 * (1 + Math.sin(this.t * 20) * 0.1);
      // 공격
      u.laserT -= dt; u.stompT -= dt;
      if (d < G.stompRange && u.stomping <= 0 && u.stompT <= 0) { u.stomping = 0.55; u.stompT = 2.2; }
      else if (u.laserT <= 0 && d < 160) {
        u.laserT = G.laserEvery * (0.8 + Math.random() * 0.4);
        const lead = V(0, 0, 0);
        if (tg.me) { if (pl.state === 'ground') lead.set(Math.sin(pl.yaw) * pl.s * 0.3, 0, Math.cos(pl.yaw) * pl.s * 0.3); else lead.set(pl.vel.x * 0.3, 0, pl.vel.z * 0.3); }
        const tgt = tg.pos.clone().add(lead); tgt.y = W.groundAt(tgt.x, tgt.z, tg.pos.y + 2) + 0.5;
        this._aim(g, tgt);
      }
    });
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.from.copy(s.g.userData.eye.getWorldPosition(new THREE.Vector3()));
      s.t -= dt;
      if (!s.fired) {
        this._place(s, 0.25 + (1 - s.t / G.laserWarn) * 0.3);
        if (s.t <= 0) { // 발사!
          s.fired = true; s.t = 0.25; s.mesh.material = this.beamMat; this._place(s, 1.4);
          game.fx.explosion(s.to, 0.9); SFX.explosion();
          const pc = pl.pos.clone().add(V(0, 0.8, 0));
          if (pc.distanceTo(s.to) < G.laserRadius) this._damage(pl, s.to, G.damage);
        }
      } else if (s.t <= 0) { game.scene.remove(s.mesh); this.shots.splice(i, 1); }
    }
  }
}
