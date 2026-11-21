// 최종 보스: 닥터 기어의 거대 기계. 맵 전체를 쫓아다니며 공격함.
//  공격: 미사일 / 하늘에서 내려찍기(충격파 → 점프로 피하기) / 돌진
//  약점: 공격 직후 주저앉아 가운데 핵이 빛날 때 공격하기! (슈퍼 상태면 언제든지)
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { SFX } from './audio.js';
import { toon } from './character.js';

const glowMat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, toneMapped: false, depthWrite: o >= 1 });

export class Boss {
  // opts: { hpScale, mini, name, leash: {center, r}, onDefeated }
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.mini = !!opts.mini;
    this.name = opts.name || '';
    this.maxHp = Math.round((this.mini ? 4 : CFG.boss.hp) * (opts.hpScale || 1) * (game.hard ? CFG.hard.bossHp : 1));
    this.hp = this.maxHp;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'enter'; this.t = 0;
    this.atkTimer = 4;
    this.invulnT = 0;
    this.alive = true; this.done = false;
    this.missiles = []; this.waves = [];
    this.R = 3.6; // 몸 반지름
    this._build();
    if (this.mini) { this.mesh.scale.setScalar(0.62); this.R = 2.3; }
  }

  _build() {
    const g = new THREE.Group();
    const metal = toon(this.opts.mini ? 0xb0582c : this.game.world.T.villainMetal), dark = toon(0x2c3036), yellow = toon(0xffc233), red = toon(0xd83a2a);
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    const sph = new THREE.SphereGeometry(1, 24, 16), cyl = new THREE.CylinderGeometry(1, 1, 1, 20), cone = new THREE.ConeGeometry(1, 1, 16), box = new THREE.BoxGeometry(1, 1, 1);
    add(sph, metal, 0, 0, 0, 3.6, 2.6, 3.4);
    add(cyl, yellow, 0, -0.3, 0, 3.75, 0.5, 3.55);
    for (let i = 0; i < 10; i++) add(box, dark, Math.cos(i / 10 * 6.28) * 3.7, -0.3, Math.sin(i / 10 * 6.28) * 3.5, 0.5, 0.7, 0.5).rotation.y = -i / 10 * 6.28;
    // 조종석 (빨간 바이저)
    add(sph, dark, 0, 2.1, 0.6, 1.8, 1.3, 1.6);
    this.visor = add(box, glowMat(0xff3020), 0, 2.3, 2.05, 2.2, 0.35, 0.2);
    for (const s of [-1, 1]) add(cone, red, s * 1.5, 3.4, 0, 0.35, 1.4, 0.35).rotation.z = -s * 0.5;
    // 약점 핵
    this.coreMat = glowMat(0xff8a20);
    this.core = add(sph, this.coreMat, 0, 0.3, 3.1, 0.9, 0.9, 0.6);
    // 팔 + 대포
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 3.9, 0.4, 0);
      const a1 = new THREE.Mesh(sph, metal); a1.scale.set(1.1, 1.1, 1.1); a1.castShadow = true;
      const gun = new THREE.Mesh(cyl, dark); gun.scale.set(0.55, 2.6, 0.55); gun.rotation.x = Math.PI / 2; gun.position.z = 1.4; gun.castShadow = true;
      const tip = new THREE.Mesh(cyl, yellow); tip.scale.set(0.65, 0.3, 0.65); tip.rotation.x = Math.PI / 2; tip.position.z = 2.7;
      arm.add(a1, gun, tip); g.add(arm); this.arms.push(arm);
    }
    // 아래쪽 분사구 + 불꽃
    this.flames = [];
    for (const [x, z] of [[1.6, 1.4], [-1.6, 1.4], [1.6, -1.4], [-1.6, -1.4]]) {
      add(cyl, dark, x, -2.3, z, 0.6, 0.8, 0.6);
      const f = add(cone, glowMat(0x66ccff, 0.8), x, -3.3, z, 0.45, 1.4, 0.45); f.rotation.x = Math.PI;
      this.flames.push(f);
    }
    // 허리 톱니 고리
    this.ring = add(new THREE.TorusGeometry(4.3, 0.25, 6, 32), yellow, 0, -0.9, 0);
    this.ring.rotation.x = Math.PI / 2;
    g.visible = false;
    this.mesh = g;
    this.game.scene.add(g);
    // 내려찍기 경고 원
    this.warn = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.warn.rotation.x = -Math.PI / 2; this.warn.visible = false;
    this.game.scene.add(this.warn);
    this.missileGeo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    this.missileMat = toon(0xd83a2a);
    this.waveGeo = new THREE.TorusGeometry(1, 0.35, 6, 48);
  }

  get targetable() { return this.alive && this.state !== 'enter' && this.state !== 'dying'; }
  get vulnerable() { return this.state === 'stunned' || this.state === 'dizzy'; }

  spawnNear(p, dist = 30) {
    const a = Math.random() * Math.PI * 2;
    this.pos.set(p.x + Math.cos(a) * dist, 0, p.z + Math.sin(a) * dist);
    this.groundY = this.game.world.groundAt(this.pos.x, this.pos.z);
    this.pos.y = this.groundY + 70;
    this.mesh.visible = true; this.spawned = true;
    this.state = 'enter'; this.t = 0;
    SFX.bossRoar();
  }

  target() {
    let best = null, bd = Infinity;
    for (const p of this.game.players) if (p.alive) { const d = p.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  setState(s) { this.state = s; this.t = 0; }

  update(dt, time) {
    if (!this.spawned) return;
    const W = this.game.world;
    this.t += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);
    const tgt = this.target();
    const ground = (x, z) => Math.max(0, W.groundAt(x, z));
    const hoverY = ground(this.pos.x, this.pos.z) + (this.mini ? 4.5 : 7);
    const face = (p, rate = 3) => { if (!p) return; const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt); };
    const frozen = (this.game.freezeT || 0) > 0 && this.state !== 'dying';

    if (frozen) { /* 블랙홀 중에는 멈춤 */ }
    else if (this.state === 'enter') {
      this.pos.y += (hoverY - this.pos.y) * Math.min(1, dt * 1.5);
      if (this.t > 2.5) this.setState('chase');
    } else if (this.state === 'chase') {
      if (tgt && (!this.opts.leash || tgt.pos.distanceTo(this.opts.leash.center) < this.opts.leash.r + 60)) {
        face(tgt.pos);
        const to = tgt.pos.clone().sub(this.pos).setY(0);
        const d = to.length();
        const want = d > 24 ? CFG.boss.chaseSpeed * (this.game.hard ? CFG.hard.bossSpeed : 1) * (d > 80 ? 2.2 : 1) : d < 14 ? -6 : 0;
        this.pos.addScaledVector(to.normalize(), want * dt);
      }
      this.pos.y += (hoverY + Math.sin(time * 2) * 0.6 - this.pos.y) * Math.min(1, dt * 3);
      this.atkTimer -= dt;
      if (this.atkTimer <= 0 && tgt) {
        const r = Math.random();
        if (r < 0.35 && !this.mini) this.setState('missiles');
        else if (r < 0.7 || (this.mini && r < 0.55)) { this.setState('stompUp'); this.stompAt = tgt.pos.clone(); SFX.warn(); }
        else { this.setState('chargePrep'); SFX.warn(); }
        this.atkTimer = (3 + Math.random() * 2) / (this.game.hard ? CFG.hard.bossSpeed : 1);
      }
    } else if (this.state === 'missiles') {
      face(tgt?.pos);
      this.pos.y += (hoverY - this.pos.y) * Math.min(1, dt * 3);
      const n = Math.floor(this.t / 0.3);
      if (n > (this.fired ?? -1) && n < 4 && tgt) { this.fired = n; this.fireMissile(tgt, n % 2 ? 1 : -1); }
      if (this.t > 1.6) { this.fired = -1; this.setState('chase'); }
    } else if (this.state === 'stompUp') {
      if (tgt && this.t < 1.3) this.stompAt.lerp(tgt.pos, Math.min(1, dt * 2));
      const gy = ground(this.stompAt.x, this.stompAt.z);
      this.pos.x += (this.stompAt.x - this.pos.x) * Math.min(1, dt * 3);
      this.pos.z += (this.stompAt.z - this.pos.z) * Math.min(1, dt * 3);
      this.pos.y += (gy + 22 - this.pos.y) * Math.min(1, dt * 3);
      this.warn.visible = true; this.warn.position.set(this.stompAt.x, gy + 0.2, this.stompAt.z);
      this.warn.material.opacity = 0.4 + Math.sin(time * 20) * 0.3;
      if (this.t > 1.8) this.setState('stompDown');
    } else if (this.state === 'stompDown') {
      this.vel.y = -60;
      this.pos.y += this.vel.y * dt;
      const gy = ground(this.pos.x, this.pos.z);
      const lowY = this.mini ? 1.6 : 2.6;
      if (this.pos.y <= gy + lowY) {
        this.pos.y = gy + lowY; this.warn.visible = false;
        this.game.fx.explosion(this.pos.clone().setY(gy + 0.5), 1.2);
        this.spawnWave(this.pos.clone().setY(gy), this.mini ? 1.0 : 1.6);
        SFX.slamHit(); SFX.explosion();
        for (const p of this.game.players) p.shake = Math.max(p.shake, 0.4);
        this.setState('stunned');
      }
    } else if (this.state === 'chargePrep') {
      face(tgt?.pos, 5);
      this.pos.x += (Math.random() - 0.5) * 0.3; this.pos.z += (Math.random() - 0.5) * 0.3;
      this.pos.y += (ground(this.pos.x, this.pos.z) + 3.2 - this.pos.y) * Math.min(1, dt * 4);
      if (this.t > 1.0) { this.chargeDir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); this.setState('charge'); SFX.boost(); }
    } else if (this.state === 'charge') {
      this.pos.addScaledVector(this.chargeDir, (this.mini ? 34 : 48) * dt);
      this.pos.y = ground(this.pos.x, this.pos.z) + 3.2;
      if (Math.random() < 0.5) this.game.fx.burst(this.pos.clone().setY(this.pos.y - 2.5), 0xb09070, 2, 6);
      if (this.t > 1.3) this.setState('dizzy');
    } else if (this.state === 'stunned' || this.state === 'dizzy') {
      const gy = ground(this.pos.x, this.pos.z);
      this.pos.y += (gy + 2.4 - this.pos.y) * Math.min(1, dt * 5);
      if (this.t > (this.state === 'stunned' ? CFG.boss.stunTime : 2.6)) this.setState('chase');
      if (Math.random() < 0.15) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0xffe14d, 1, 3);
    } else if (this.state === 'dying') {
      this.pos.y += (ground(this.pos.x, this.pos.z) + 3 - this.pos.y) * dt * 2;
      if (Math.random() < dt * 8) {
        const p = this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 7));
        this.game.fx.explosion(p, 0.6); SFX.explosion();
      }
      this.mesh.rotation.z = Math.sin(this.t * 20) * 0.1;
      if (this.t > 3) {
        this.game.fx.explosion(this.pos.clone(), 2.5); SFX.explosion();
        this.mesh.visible = false; this.spawned = false; this.alive = false; this.done = true;
        this.opts.onDefeated?.();
        return;
      }
    }
    // 장벽 안에 머무르기
    const r = Math.hypot(this.pos.x, this.pos.z), lim = CFG.world.barrierR - 20;
    if (r > lim) { this.pos.x *= lim / r; this.pos.z *= lim / r; }
    if (this.opts.leash) { // 중간 보스는 자기 구역에서만
      const L = this.opts.leash, dx = this.pos.x - L.center.x, dz = this.pos.z - L.center.z, d = Math.hypot(dx, dz);
      if (d > L.r) { this.pos.x = L.center.x + dx / d * L.r; this.pos.z = L.center.z + dz / d * L.r; }
    }

    // 모습
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (this.vulnerable) this.mesh.rotation.x = Math.sin(this.t * 6) * 0.08 + 0.15; else this.mesh.rotation.x = this.state === 'charge' ? 0.3 : 0;
    this.ring.rotation.z += dt * (this.state === 'charge' ? 20 : 3);
    const vul = this.vulnerable;
    this.coreMat.color.set(vul ? (Math.floor(time * 8) % 2 ? 0xffffff : 0xffd040) : 0xff8a20);
    this.core.scale.setScalar(vul ? 1.1 + Math.sin(time * 15) * 0.15 : 0.8);
    this.visor.material.color.set(this.invulnT > 0 ? 0xffffff : 0xff3020);
    for (const f of this.flames) { f.visible = !vul; f.scale.y = 1.2 + Math.random() * 0.6; }
    this.mesh.visible = this.invulnT > 0 ? Math.floor(time * 20) % 2 === 0 : true;
    if (this.state === 'dying') this.mesh.visible = true;

    this.updateMissiles(dt, tgt);
    this.updateWaves(dt);
    this.contact();
  }

  fireMissile(tgt, side) {
    const arm = this.arms[side > 0 ? 0 : 1];
    const p = arm.getWorldPosition(new THREE.Vector3());
    const m = new THREE.Mesh(this.missileGeo, this.missileMat);
    m.castShadow = true;
    this.game.scene.add(m);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0.6, Math.cos(this.yaw)).normalize();
    this.missiles.push({ m, pos: p, vel: fwd.multiplyScalar(CFG.boss.missileSpeed), life: 6 });
    SFX.missile();
  }
  updateMissiles(dt, tgt) {
    const W = this.game.world;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      ms.life -= dt;
      if (tgt && ms.life < 5.6) { // 천천히 따라옴
        const want = tgt.pos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(ms.pos).normalize().multiplyScalar(CFG.boss.missileSpeed);
        ms.vel.lerp(want, Math.min(1, dt * 0.9));
      }
      ms.pos.addScaledVector(ms.vel, dt);
      ms.m.position.copy(ms.pos);
      ms.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ms.vel.clone().normalize());
      if (Math.random() < 0.6) this.game.fx.burst(ms.pos.clone(), 0xaaaaaa, 1, 1);
      let boom = ms.life <= 0 || ms.pos.y <= Math.max(0, W.groundAt(ms.pos.x, ms.pos.z)) + 0.2;
      for (const p of this.game.players) if (p.alive && p.pos.clone().setY(p.pos.y + 0.8).distanceTo(ms.pos) < 1.4) boom = true;
      if (boom) {
        this.game.fx.explosion(ms.pos.clone(), 0.5); SFX.explosion();
        for (const p of this.game.players) if (p.alive && p.pos.distanceTo(ms.pos) < 3) p.hurt(ms.pos);
        this.game.scene.remove(ms.m);
        this.missiles.splice(i, 1);
      }
    }
  }
  spawnWave(c, life = 1.6) {
    const m = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    m.rotation.x = Math.PI / 2;
    this.game.scene.add(m);
    this.waves.push({ m, c, r: 3, life });
  }
  updateWaves(dt) {
    const W = this.game.world;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += 20 * dt; w.life -= dt;
      w.m.scale.set(w.r, w.r, 1.5);
      w.m.position.set(w.c.x, w.c.y + 0.6, w.c.z);
      w.m.material.opacity = 0.85 * Math.min(1, w.life);
      for (const p of this.game.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.pos.x - w.c.x, p.pos.z - w.c.z);
        const h = p.pos.y - W.groundAt(p.pos.x, p.pos.z, p.pos.y + 1);
        if (Math.abs(d - w.r) < 1.3 && h < 1.2) p.hurt(w.c);
      }
      if (w.life <= 0) { this.game.scene.remove(w.m); this.waves.splice(i, 1); }
    }
  }
  contact() {
    if (!this.targetable) return;
    for (const p of this.game.players) {
      if (!p.alive) continue;
      const c = p.pos.clone(); c.y += 0.8;
      if (c.distanceTo(this.pos) > this.R + 0.9) continue;
      if ((this.vulnerable || p.superOn) && p.attacking) {
        this.damage(1, p);
        const away = c.clone().sub(this.pos).setY(0).normalize();
        const big = p.bounceBuffer > 0; // 맞히는 순간 점프 = 더 높이
        p.vel.set(away.x * 12, big ? 30 : 17, away.z * 12); p.state = 'air'; p.s = 0; p.airActionUsed = false; p.slamming = false; p.cancelAbilities();
        p.ball = true; p.bounceBuffer = 0; p.bounceWindow = big ? 0 : 0.2; if (big) p.bigBounceFx?.();
      } else if (!p.superOn) {
        p.hurt(this.pos);
      }
    }
  }
  tryHit(player, pos, r, dmg) {
    if (!this.targetable) return false;
    if (pos.distanceTo(this.pos) > r + this.R) return false;
    if (!this.vulnerable && !player.superOn) return false;
    return this.damage(dmg, player);
  }
  damage(n, player) {
    if (this.invulnT > 0 || !this.targetable) return false;
    this.hp = Math.max(0, this.hp - n);
    this.invulnT = 0.9;
    SFX.bossHit();
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd040, 20, 10);
    if (player) player.shake = 0.3;
    if (this.hp <= 0) { this.setState('dying'); this.warn.visible = false; this.game.hud.toast('💥 해냈다!', 'gold'); }
    else if (this.vulnerable && this.t > 0.5 && Math.random() < 0.4) this.setState('chase');
    return true;
  }
  dispose() {
    this.game.scene.remove(this.mesh, this.warn);
    for (const m of this.missiles) this.game.scene.remove(m.m);
    for (const w of this.waves) this.game.scene.remove(w.m);
  }
}
