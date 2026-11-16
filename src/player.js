// 플레이어 조작 (4명: 스피드형 / 비행형 / 파워형 / 순간이동형)
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { NAMES } from './names.js';
import { SFX } from './audio.js';
import { CharacterView } from './character.js';
import { newStats } from './missions.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Player {
  constructor(game, kind = 'speed') {
    this.game = game;
    this.kind = kind;
    this.view = new CharacterView(kind);
    game.scene.add(this.view.root);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    game.scene.add(this.shadow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.ringCheckPos = new THREE.Vector3();
    this.yaw = 0;
    this.s = 0;                 // 땅에서의 속도
    this.gear = 1; this.gearTimer = 0;
    this.state = 'ground';      // ground | air | charge | loop | dead
    this.ball = false; this.rolling = false; this.rollTime = 0;
    this.slamming = false;
    this.dashTime = 0;
    this.airActionUsed = false;
    this.holdValid = false; this.holdTime = 0;
    this.chargeLevel = 0;
    this.chargeDir = new THREE.Vector3(0, 0, 1);
    this.controlLock = 0; this.invuln = 0; this.hurtT = 0;
    this.health = CFG.player.maxHealth;
    this.rings = 0;
    this.storedHearts = 0;
    this.superOn = false; this.superDrain = 0; this.auraWasReady = false;
    this.alive = true; this.deadTimer = 0;
    this.loop = null; this.loopT = 0; this.loopLat = 0; this.loopCD = 0;
    this.padCooldown = 0;
    this.onRamp = false; this.slopeVy = 0;
    this.standOn = null; this.inWater = false;
    this.stats = newStats();
    this.secretFound = false;
    this.ringSfxCooldown = 0;
    this.shake = 0;
    // 캐릭터 능력
    this.superFlight = false;
    this.flying = false; this.flyGauge = CFG.flyer.gaugeMax; this.tornadoCD = 0;
    this.gliding = false; this.punchT = 0;
    this.blink = null; this.ult = null; this.ultCD = 0; this.flashV = 0; this.hidden = false;
  }

  get grounded() { return this.state === 'ground' || this.state === 'charge' || this.state === 'loop'; }
  get attacking() { return this.ball || this.slamming || this.superOn || this.dashTime > 0 || this.gliding || this.punchT > 0 || this.superFlight; }
  canCollect() { return this.alive; }
  mul() { return CFG.characters[this.kind].speed * (this.superOn ? CFG.super.speedMul : 1); }
  cap(g) { return CFG.gears[g - 1].cap * this.mul(); }
  gearFor(s) { let g = 1; while (g < 3 && s > this.cap(g) * 1.02) g++; return g; }
  maxSpeed() { return this.cap(this.gear); }

  canTransform() {
    if (this.game.hard) return !this.superOn && this.rings >= CFG.hard.superRingsNeeded; // 도전 모드: 씨앗 없이 변신
    return !this.superOn && this.game.missions.crystals >= CFG.super.crystalsNeeded && this.rings >= CFG.super.ringsNeeded;
  }

  spawnAt(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.s = 0; this.gear = 1;
    this.state = 'ground'; this.ball = this.rolling = this.slamming = false;
    this.cancelAbilities();
    this.pos.y = this.game.world.groundAt(p.x, p.z, p.y + 2);
  }
  cancelAbilities() {
    this.superFlight = this.flying = this.gliding = false;
    this.blink = null; this.ult = null; this.hidden = false; this.dashTime = 0;
  }

  // ---------------------------------------------------------
  update(dt, input, camYaw) {
    const P = CFG.player;
    for (const k of ['invuln', 'controlLock', 'padCooldown', 'dashTime', 'ringSfxCooldown', 'shake', 'hurtT', 'punchT', 'tornadoCD', 'ultCD', 'loopCD']) this[k] = Math.max(0, this[k] - dt);
    this.flashV = Math.max(0, this.flashV - dt * 2);

    if (this.state === 'dead') {
      this.deadTimer -= dt;
      this.game.hud.setFade(Math.min(1, 1 - this.deadTimer / P.respawnDelay) * 0.8);
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    // 카메라 기준 입력 방향
    const f = tmpV.set(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = tmpV2.set(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const wish = new THREE.Vector3().addScaledVector(f, input.move.y).addScaledVector(r, input.move.x);
    const wishLen = Math.min(1, wish.length());
    const hasMove = wishLen > 0.2 && this.controlLock <= 0;
    if (wishLen > 0.001) wish.divideScalar(wish.length());
    const A = input.buttons.a, B = input.buttons.b;
    const locked = this.controlLock > 0;

    if (this.blink) { this.updateBlink(dt); this.finishFrame(dt); return; }
    if (this.ult) { this.updateUlt(dt); this.finishFrame(dt); return; }

    // ----- A 버튼 -----
    if (!locked && A.pressed) {
      if (this.grounded && this.state !== 'loop') this.jump();
      else if (this.state === 'air' && !this.slamming) this.airA(wish, hasMove);
    }
    if (A.released) { this.holdValid = false; this.gliding = false; }
    if (this.holdValid && A.held) {
      this.holdTime += dt;
      const ultReady = this.kind === 'blink' && this.superOn && this.ultCD <= 0;
      if (this.canTransform() || ultReady) {
        if (this.holdTime > 0.2 && this.state === 'air') this.vel.y = Math.max(this.vel.y, -1.2);
        if (this.holdTime >= CFG.super.holdTime) { this.holdValid = false; ultReady ? this.startUlt(wish, hasMove) : this.transform(); }
      }
    }

    // ----- B 버튼 -----
    if (!locked && B.pressed) {
      if (this.state === 'ground') {
        if (hasMove) this.startCharge(wish);
        else if (this.kind === 'power') this.punch();
      } else if (this.state === 'charge') {
        if (this.chargeLevel < P.spinMaxTaps) { this.chargeLevel++; SFX.spinCharge(this.chargeLevel); }
      } else if (this.state === 'air' && !this.slamming) this.startSlam();
    }

    // ----- 상태별 움직임 -----
    if (this.state === 'charge') this.updateCharge(dt, wish, hasMove);
    else if (this.state === 'ground') this.updateGround(dt, wish, wishLen, hasMove);
    else if (this.state === 'air') this.updateAir(dt, wish, hasMove);
    else if (this.state === 'loop') this.updateLoop(dt, wish, hasMove);

    this.interact(dt);
    this.finishFrame(dt);
  }

  finishFrame(dt) {
    if (this.superOn) {
      this.superDrain += dt * CFG.super.drainPerSec;
      while (this.superDrain >= 1) { this.superDrain -= 1; this.rings = Math.max(0, this.rings - 1); }
      if (this.rings <= 0) { this.superOn = false; this.superFlight = false; this.game.hud.toast(`${NAMES.superForm} 변신이 풀렸어요`); }
    }
    const ready = this.canTransform();
    if (ready && !this.auraWasReady) { SFX.superReady(); this.game.hud.toast(`✨ ${NAMES.superForm} 변신 가능! 땅에서 점프를 1.5초 꾹!`, 'gold'); }
    this.auraWasReady = ready;
    if (this.pos.y < -60) this.die();
    this.ringCheckPos.copy(this.pos).add(new THREE.Vector3(0, 0.9, 0));
    this.updateView(dt);
  }

  // ---------------- 점프 / 공중 기술 ----------------
  jump() {
    const P = CFG.player;
    if (this.state === 'charge') this.state = 'ground';
    const jv = P.jumpVel * CFG.characters[this.kind].jump * (this.superOn ? CFG.super.jumpMul : 1);
    this.vel.set(Math.sin(this.yaw) * this.s, jv, Math.cos(this.yaw) * this.s);
    this.vel.y += Math.max(0, this.slopeVy * 0.5);
    this.state = 'air'; this.standOn = null;
    this.ball = true; this.rolling = false;
    this.airActionUsed = false;
    this.holdValid = true; this.holdTime = 0;
    this.stats.jumps++;
    SFX.jump();
  }

  airA(wish, hasMove) {
    const k = this.kind;
    if (k === 'flyer') {
      if (this.superOn) { if (this.tornadoCD <= 0) this.fireTornado(wish, hasMove); return; }
      if (this.flying) { this.flap(); return; }
      if (!this.airActionUsed) { this.flying = true; this.airActionUsed = true; this.ball = false; this.holdValid = false; this.flap(); }
      return;
    }
    if (this.airActionUsed) return;
    this.airActionUsed = true; this.holdValid = false;
    if (k === 'speed') { this.superOn ? this.startSuperFlight(wish, hasMove) : this.dash(wish, hasMove); }
    else if (k === 'power') { this.gliding = true; this.ball = false; this.vel.y = Math.max(this.vel.y, 0); SFX.glide(); }
    else if (k === 'blink') this.startBlink(wish, hasMove);
  }

  dash(wish, hasMove) {
    const P = CFG.player;
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const sp = Math.max(P.dashSpeed * this.mul(), hs);
    this.vel.x = dir.x * sp; this.vel.z = dir.z * sp;
    this.vel.y = P.dashLift;
    this.yaw = Math.atan2(dir.x, dir.z);
    this.dashTime = 0.35;
    this.ball = true;
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff, 8, 4);
    SFX.dash();
  }

  // 스피드형 슈퍼: 달리던 속도만큼 포물선을 그리며 하늘로!
  startSuperFlight(wish, hasMove) {
    const S = CFG.super;
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const hs = Math.max(Math.hypot(this.vel.x, this.vel.z), this.cap(3));
    this.vel.set(dir.x * hs, Math.min(S.flightMaxLift, hs * S.flightLift), dir.z * hs);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.superFlight = true; this.ball = false;
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffd700, 20, 8);
    this.game.fx.shockwave(this.pos, 5, 0xffd700);
    SFX.flight();
  }

  flap() {
    const F = CFG.flyer;
    if (this.flyGauge <= 0) return;
    this.vel.y = Math.max(this.vel.y, F.flapVel);
    this.flyGauge = Math.max(0, this.flyGauge - F.flapCost);
    SFX.flap();
  }

  fireTornado(wish, hasMove) {
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.game.fx.tornado(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), dir, CFG.flyer.tornadoSpeed * 1.4, this);
    this.tornadoCD = CFG.flyer.tornadoCooldown;
    this.vel.y = Math.max(this.vel.y, 6);
    SFX.tornado();
  }

  punch() {
    this.punchT = 0.35;
    SFX.punch();
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const c = this.pos.clone().addScaledVector(fwd, 1.6);
    this.s = Math.max(this.s, 6);
    for (const e of this.game.enemies.inRadius(c, CFG.power.punchRange)) if (this.game.enemies.hit(e, 2, this.pos, 20)) this.onKill();
    this.game.boss?.tryHit(this, c, CFG.power.punchRange, 1);
    for (const w of this.game.world.walls) {
      if (w.dead) continue;
      const cx = Math.max(w.min.x, Math.min(c.x, w.max.x)), cz = Math.max(w.min.z, Math.min(c.z, w.max.z));
      if (Math.hypot(c.x - cx, c.z - cz) < 2.2) this.breakWall(w);
    }
    this.game.fx.burst(c.clone().setY(this.pos.y + 1), 0xffffff, 6, 5);
  }

  // ---------------- 순간이동형 ----------------
  startBlink(wish, hasMove) {
    const B = CFG.blink;
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let target = null, bd = Infinity;
    const cand = this.game.enemies.inRadius(this.pos, B.range).map((e) => ({ pos: e.pos }));
    if (this.game.boss?.targetable) cand.push({ pos: this.game.boss.pos, boss: true });
    for (const c of cand) {
      const d = c.pos.clone().sub(this.pos); d.y = 0;
      const l = d.length(); if (l < 0.5) continue;
      if (d.divideScalar(l).dot(dir) < 0.55) continue;
      if (l < bd) { bd = l; target = c.pos.clone(); }
    }
    this.blink = { phase: 'out', t: 0.18, target, dir };
    this.vel.set(0, 0, 0); this.ball = false;
    this.flashV = 1;
    SFX.blink();
  }
  updateBlink(dt) {
    const b = this.blink, B = CFG.blink;
    b.t -= dt;
    this.hidden = b.phase === 'out' && b.t < 0.1 || b.phase === 'gone';
    if (b.t > 0) return;
    if (b.phase === 'out') {
      if (b.target) {
        this.pos.copy(b.target).addScaledVector(b.dir, -1.2); this.pos.y += 1.2;
        const R = B.energyRadius * (this.superOn ? 1.5 : 1);
        let n = 0;
        for (const e of this.game.enemies.inRadius(this.pos, R)) if (this.game.enemies.hit(e, this.superOn ? 2 : 1, this.pos, 14)) { n++; this.onKill(); }
        if (this.game.boss?.tryHit(this, this.pos, R, 1)) n++;
        this.game.fx.shockwave(this.pos, R, 0x9a5cff);
        this.game.fx.burst(this.pos.clone(), 0x6a2cff, 24, 10);
        this.flashV = 1; SFX.slamHit();
        b.phase = 'strike'; b.t = 0.28; b.hit = n > 0;
      } else { b.phase = 'fail'; b.t = 0.18; this.hidden = false; }
    } else if (b.phase === 'strike') {
      if (b.hit) {
        // 진행 방향 뒤쪽 안전한 곳으로
        const back = this.pos.clone().addScaledVector(b.dir, -9);
        back.y = this.game.world.groundAt(back.x, back.z, this.pos.y + 5) + 0.5;
        this.pos.copy(back);
        this.flashV = 1; SFX.blink();
      }
      b.phase = 'gone'; b.t = 0.12;
    } else {
      this.blink = null; this.hidden = false;
      this.state = 'air'; this.vel.set(0, 5, 0);
    }
  }
  startUlt(wish, hasMove) {
    const B = CFG.blink;
    const cost = Math.ceil(this.rings * B.ultRingCost);
    this.rings = Math.max(0, this.rings - cost);
    this.ultCD = B.ultCooldown;
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.ult = { t: 0, dir, y0: this.pos.y, fired: false };
    this.game.freezeT = 2.2;
    this.state = 'air'; this.vel.set(0, 0, 0); this.ball = false;
    SFX.blackhole();
    this.game.hud.toast('🌑 블랙홀!', 'gold');
  }
  updateUlt(dt) {
    const u = this.ult;
    u.t += dt;
    this.pos.y = u.y0 + Math.min(1, u.t / 0.6) * 6;
    if (!u.fired && u.t > 0.8) {
      u.fired = true;
      const center = this.pos.clone().addScaledVector(u.dir, 18);
      this.game.fx.blackhole(center);
      this.game.hud.flash('rgba(60,0,120,0.55)');
      const cam = this.game.camera, frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const e of this.game.enemies.inRadius(this.pos, CFG.blink.ultRange)) {
        if (!frustum.containsPoint(e.pos)) continue;
        if (this.game.enemies.hit(e, 9, center, 20)) this.onKill();
      }
      if (this.game.boss?.targetable && frustum.containsPoint(this.game.boss.pos)) this.game.boss.damage(2, this);
      this.shake = 0.5;
    }
    if (u.t > 1.8) {
      const back = this.pos.clone().addScaledVector(u.dir, -6);
      this.pos.x = back.x; this.pos.z = back.z;
      this.ult = null; this.state = 'air'; this.vel.set(0, 0, 0);
    }
  }

  // ---------------- 스핀 / 내려찍기 ----------------
  startCharge(wish) {
    this.state = 'charge';
    this.chargeLevel = 1;
    this.chargeDir.copy(wish);
    this.s = 0; this.vel.set(0, 0, 0); this.gear = 1;
    this.ball = true; this.rolling = false;
    SFX.spinCharge(1);
  }

  updateCharge(dt, wish, hasMove) {
    const P = CFG.player;
    if (hasMove) {
      this.chargeDir.copy(wish);
      this.yaw = Math.atan2(wish.x, wish.z);
      this.carry(dt);
      this.pos.y = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (Math.random() < 0.3) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(-wish.x, 0.2, -wish.z)), 0xd9c9a0, 1, 3);
    } else {
      // 방향키를 떼면 발사!
      this.s = (P.spinLaunchBase + P.spinLaunchPerTap * (this.chargeLevel - 1)) * this.mul();
      this.gear = this.gearFor(this.s);
      this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      this.state = 'ground';
      this.rolling = true; this.ball = true; this.rollTime = 0;
      if (this.chargeLevel >= P.spinMaxTaps) this.stats.maxSpins++;
      SFX.spinLaunch(this.chargeLevel);
      this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffffff, 6 + this.chargeLevel, 6);
    }
  }

  startSlam() {
    this.slamming = true;
    this.superFlight = this.flying = this.gliding = false;
    this.vel.x *= 0.15; this.vel.z *= 0.15;
    this.vel.y = -CFG.player.slamSpeed;
    this.ball = true;
    this.holdValid = false;
    this.dashTime = 0;
    SFX.slam();
  }

  slamImpact() {
    const P = CFG.player;
    const R = P.slamRadius * (this.superOn ? 1.5 : 1);
    let n = 0;
    for (const e of this.game.enemies.inRadius(this.pos, R)) if (this.game.enemies.hit(e, 2, this.pos, 18)) { n++; this.onKill(); }
    this.game.boss?.tryHit(this, this.pos, R, 1);
    if (n >= 3) this.stats.slamMulti = 1;
    this.game.fx.shockwave(this.pos, R, 0xffffff);
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xd9c9a0, 12, 8);
    SFX.slamHit();
    this.shake = 0.25;
  }

  // ---------------- 땅 위 (자동차처럼 1단 → 2단 → 3단) ----------------
  updateGround(dt, wish, wishLen, hasMove) {
    const P = CFG.player, m = this.mul();
    const waterMul = this.inWater ? CFG.water.slow : 1;
    if (hasMove) {
      const want = Math.atan2(wish.x, wish.z);
      const d = angDiff(want, this.yaw);
      if (Math.abs(d) > 2.4 && this.s > 6) {
        this.s = Math.max(0, this.s - P.brake * m * dt);   // 반대 방향: 브레이크
        this.gearTimer = 0;
      } else {
        const fast = this.s / m;
        const rate = P.turnRate * (this.rolling ? 0.5 : 1) * (fast > 20 ? 0.6 : 1) * (fast > 34 ? 0.7 : 1);
        this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
        if (this.rolling) { this.rollTime += dt; if (this.rollTime >= P.rollToRun) { this.rolling = false; this.ball = false; } }
        const top = this.cap(this.gear) * waterMul * Math.max(0.35, wishLen) * (Math.abs(d) > 1.2 ? 0.8 : 1);
        if (this.s < top) this.s = Math.min(top, this.s + CFG.gears[this.gear - 1].accel * m * dt);
        else if (this.s > this.cap(3) * waterMul) this.s = Math.max(top, this.s - P.overDecay * m * dt); // 스핀·가속 발판 속도는 천천히 줄어듦
        else this.s = Math.max(top, this.s - 14 * m * dt);
        // 다음 단계로
        if (this.gear < 3 && this.s >= this.cap(this.gear) * 0.97 && wishLen > 0.7 && !this.inWater) {
          this.gearTimer += dt;
          if (this.gearTimer >= CFG.gearUpTime) { this.gear++; this.gearTimer = 0; SFX.gearUp(this.gear); this.game.fx.shockwave(this.pos, 2.5 + this.gear, 0xbfe8ff); }
        } else this.gearTimer = 0;
      }
    } else {
      this.s = Math.max(0, this.s - (this.rolling ? P.decel * 0.3 : P.decel) * m * dt);
      this.gearTimer = 0;
    }
    while (this.gear > 1 && this.s < this.cap(this.gear - 1) * 0.8) this.gear--;
    if (this.s > this.cap(this.gear) * 1.05) this.gear = this.gearFor(this.s);
    if (this.rolling && this.s < P.rollMinSpeed) { this.rolling = false; }
    this.ball = this.rolling;

    this.vel.x = Math.sin(this.yaw) * this.s;
    this.vel.z = Math.cos(this.yaw) * this.s;
    this.moveAndGround(dt);
    if (this.state === 'ground') this.checkLoopEntry();
  }

  // 움직이는 발판·회전판·컨베이어 위에서 같이 움직이기
  carry(dt) {
    const p = this.standOn;
    if (!p || p.dead) return;
    if (p.kind === 'disc' && p.dAng) {
      const dx = this.pos.x - p.center.x, dz = this.pos.z - p.center.z, c = Math.cos(p.dAng), s = Math.sin(p.dAng);
      this.pos.x = p.center.x + dx * c + dz * s; this.pos.z = p.center.z - dx * s + dz * c;
      this.yaw += p.dAng;
    } else if (p.moving) this.pos.add(p.delta);
    if (p.conv) this.pos.addScaledVector(p.conv, dt);
  }

  moveAndGround(dt) {
    const world = this.game.world, P = CFG.player;
    this.carry(dt);
    const oldY = this.pos.y, ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (world.collide(this.pos, P.radius, P.height, this.vel)) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (world.lastHitBox?.breakable) this.tryBreak(world.lastHitBox);
      this.s = Math.min(this.s, hs);
      if (hs > 0.5) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    }
    let g = this.groundHere(this.pos.x, this.pos.z, oldY);
    // 절벽: 너무 가파르면 못 올라감 (옆으로 미끄러지기)
    const climb = (gg, x, z) => gg - oldY <= Math.max(0.9, Math.hypot(x - ox, z - oz) * P.maxClimb);
    if (!climb(g, this.pos.x, this.pos.z)) {
      const gx = this.groundHere(this.pos.x, oz, oldY), gz = this.groundHere(ox, this.pos.z, oldY);
      if (climb(gx, this.pos.x, oz) && Math.abs(this.pos.x - ox) > 0.01) { this.pos.z = oz; g = gx; }
      else if (climb(gz, ox, this.pos.z) && Math.abs(this.pos.z - oz) > 0.01) { this.pos.x = ox; g = gz; }
      else { this.pos.x = ox; this.pos.z = oz; g = this.groundHere(ox, oz, oldY); this.s *= 0.5; }
      this.s *= 0.97;
    }
    const surface = this._surf;
    const snap = 0.6 + this.s * dt * 0.8;
    if (oldY - g <= snap) {
      this.slopeVy = THREE.MathUtils.clamp((g - oldY) / dt, -40, 40);
      this.pos.y = g;
      this.onRamp = surface === 'ramp';
      this.standOn = this._plat;
      const wasWater = this.inWater;
      this.inWater = surface === 'water' || surface === 'shallow';
      if (this.inWater && !wasWater) { SFX.splash(); this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xbfe8ff, 10, 5); }
      if (this._waterRun && Math.random() < 0.5) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0xdff4ff, 1, 4);
    } else {
      this.state = 'air'; this.standOn = null;
      this.vel.y = Math.min(this.slopeVy, 0);
      if (this.onRamp) this.vel.y = Math.max(this.slopeVy, this.s * 0.55); // 점프대 발사!
      this.onRamp = false;
      this.airActionUsed = false;
      this.holdValid = false;
      if (!this.rolling) this.ball = false;
    }
  }
  // 지면 높이 (빠르면 물 위를 달림)
  groundHere(x, z, y) {
    const world = this.game.world;
    let g = world.groundAt(x, z, y);
    this._surf = world.lastSurface; this._plat = world.lastPlatform; this._waterRun = false;
    if ((this._surf === 'water' || this._surf === 'shallow') && this.s >= CFG.water.runSpeed && y >= -0.3) { g = Math.max(g, 0); this._surf = 'waterRun'; this._waterRun = true; }
    return g;
  }

  // ---------------- 360도 루프 (직접 속도와 방향을 맞춰야 돌 수 있음) ----------------
  checkLoopEntry() {
    if (this.loopCD > 0 || this.s < 6) return;
    const hv = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    for (const L of this.game.world.loops) {
      const rel = this.pos.clone().sub(L.entry);
      const along = rel.dot(L.fwd), lat = rel.dot(L.side);
      if (along > -1.5 && along < 1.5 && Math.abs(lat) < L.width / 2 - 0.3 && hv.dot(L.fwd) > CFG.loop.entryAlign) {
        this.state = 'loop'; this.loop = L; this.loopT = 0.002; this.loopLat = lat;
        this.rolling = this.rolling && this.s > 10;
        return;
      }
    }
  }

  updateLoop(dt, wish, hasMove) {
    const L = this.loop, C = CFG.loop, m = this.mul();
    const a = this.loopT * Math.PI * 2;
    const g = CFG.player.gravity * C.gravityScale;
    let push = hasMove ? C.push * m : -2;
    if (hasMove) { // 반대로 누르면 브레이크
      const camBack = wish.dot(L.fwd);
      if (camBack < -0.6 && Math.abs(Math.cos(a)) > 0.7) push = -C.push * 2 * m;
    }
    this.s += (push - g * Math.sin(a)) * dt;
    if (this.s > this.cap(3) * 1.6) this.s -= CFG.player.overDecay * dt;
    this.loopT += this.s * dt / L.length;
    if (this.loopT >= 1) { // 성공!
      L.pathAt(1, this.pos).addScaledVector(L.side, this.loopLat);
      this.state = 'ground'; this.yaw = Math.atan2(L.fwd.x, L.fwd.z);
      this.loop = null; this.stats.loops++; this.slopeVy = 0; this.loopCD = 0.5;
      return;
    }
    if (this.loopT <= 0) { // 속도가 모자라서 뒤로 미끄러져 나옴
      L.pathAt(0, this.pos).addScaledVector(L.side, this.loopLat);
      this.state = 'ground'; this.yaw = Math.atan2(-L.fwd.x, -L.fwd.z); this.s = Math.abs(this.s);
      this.loop = null; this.loopCD = 1.0; this.slopeVy = 0;
      return;
    }
    // 위쪽에서 너무 느리면 떨어짐
    const cosA = Math.cos(a);
    if (cosA < 0.1 && this.s * this.s / L.R < -g * cosA + 0.5) {
      const tan = L.tangentAt(this.loopT);
      this.vel.copy(tan).multiplyScalar(this.s);
      this.state = 'air'; this.loop = null; this.loopCD = 1.2;
      this.airActionUsed = false; this.ball = true; this.rolling = false;
      this.game.hud.toast('속도가 부족해요! 더 빠르게 💨');
      return;
    }
    L.pathAt(this.loopT, this.pos).addScaledVector(L.side, this.loopLat);
  }

  // ---------------- 공중 ----------------
  updateAir(dt, wish, hasMove) {
    const P = CFG.player, S = CFG.super;
    if (this.slamming) {
      this.vel.y = -P.slamSpeed;
    } else if (this.superFlight) {
      this.vel.y = Math.max(S.flightMinFall, this.vel.y - P.gravity * S.flightGravity * dt);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hasMove) {
        const cur = Math.atan2(this.vel.x, this.vel.z), want = Math.atan2(wish.x, wish.z);
        const na = cur + Math.sign(angDiff(want, cur)) * Math.min(Math.abs(angDiff(want, cur)), 2.2 * dt);
        this.vel.x = Math.sin(na) * hs; this.vel.z = Math.cos(na) * hs;
      }
      if (Math.random() < 0.6) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffe680, 1, 2);
    } else {
      let grav = this.dashTime > 0 ? P.gravity * 0.25 : P.gravity;
      if (this.flying) {
        grav *= CFG.flyer.gravityMul;
        this.flyGauge = Math.max(0, this.flyGauge - CFG.flyer.drainPerSec * dt);
        if (this.flyGauge <= 0) this.flying = false;
      }
      this.vel.y -= grav * dt;
      if (this.gliding) this.vel.y = Math.max(this.vel.y, -CFG.power.glideFall);
      const tgtBase = this.gliding ? CFG.power.glideSpeed * this.mul() : this.flying ? this.cap(2) : this.maxSpeed() * 0.75;
      if (hasMove) {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        const tgt = Math.max(hs, tgtBase);
        const k = Math.min(1, P.airControl * (this.gliding || this.flying ? 3 : 4.5) * dt);
        this.vel.x += (wish.x * tgt - this.vel.x) * k;
        this.vel.z += (wish.z * tgt - this.vel.z) * k;
      } else if (this.gliding) {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs < tgtBase) { const f = Math.sin(this.yaw), c = Math.cos(this.yaw); this.vel.x += f * (tgtBase - hs) * dt * 2; this.vel.z += c * (tgtBase - hs) * dt * 2; }
      }
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 1) this.yaw += angDiff(Math.atan2(this.vel.x, this.vel.z), this.yaw) * Math.min(1, dt * 10);
    const world = this.game.world;
    const oldY = this.pos.y, ox = this.pos.x, oz = this.pos.z;
    this.pos.addScaledVector(this.vel, dt);
    if (world.collide(this.pos, P.radius, P.height, this.vel) && world.lastHitBox?.breakable) this.tryBreak(world.lastHitBox);
    let g = world.groundAt(this.pos.x, this.pos.z, Math.max(oldY, this.pos.y));
    let surf = world.lastSurface;
    if ((surf === 'water' || surf === 'shallow') && hs >= CFG.water.runSpeed && oldY >= -0.2) { g = Math.max(g, 0); surf = 'waterRun'; }
    // 절벽 옆면에 부딪힘
    if (g - this.pos.y > 1.0 && g - oldY > 1.0) {
      this.pos.x = ox; this.pos.z = oz; this.vel.x *= -0.1; this.vel.z *= -0.1;
      g = world.groundAt(ox, oz, oldY); surf = world.lastSurface;
    }
    this._plat = world.lastPlatform;
    if (this.pos.y <= g && this.vel.y <= 0) this.land(g, surf);
  }

  land(g, surf) {
    this.pos.y = g;
    this.state = 'ground';
    this.s = Math.hypot(this.vel.x, this.vel.z);
    if (this.s > 0.5) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.gear = Math.max(1, this.gearFor(this.s * 0.99));
    this.vel.y = 0; this.slopeVy = 0;
    this.holdValid = false;
    this.dashTime = 0;
    this.superFlight = this.flying = this.gliding = false;
    this.flyGauge = CFG.flyer.gaugeMax;
    this.standOn = this._plat;
    this.inWater = surf === 'water' || surf === 'shallow';
    if (this.slamming) { this.slamming = false; this.s = 0; this.gear = 1; this.slamImpact(); }
    this.ball = this.rolling;
    this.onRamp = surf === 'ramp';
  }

  // ---------------- 주변과 부딪힘 ----------------
  interact(dt) {
    const world = this.game.world;
    for (const sp of world.springs) {
      const dx = this.pos.x - sp.pos.x, dz = this.pos.z - sp.pos.z;
      if (dx * dx + dz * dz < 1.5 * 1.5 && this.pos.y > sp.pos.y - 0.3 && this.pos.y < sp.top + 1.0 && this.vel.y <= 0.5 && this.state !== 'loop') {
        this.state = 'air'; this.standOn = null;
        this.pos.y = sp.top;
        this.vel.y = sp.power * (this.superOn ? 1.2 : 1);
        this.vel.x *= 0.5; this.vel.z *= 0.5;
        this.ball = this.rolling = this.slamming = false;
        this.cancelAbilities();
        this.airActionUsed = false; this.holdValid = false;
        this.flyGauge = CFG.flyer.gaugeMax;
        sp.comp = 1;
        this.stats.springs++;
        SFX.spring();
      }
    }
    if (this.state === 'ground' && this.padCooldown <= 0) {
      for (const b of world.boostPads) {
        const dx = this.pos.x - b.pos.x, dz = this.pos.z - b.pos.z;
        if (dx * dx + dz * dz < 2.8 * 2.8 && Math.abs(this.pos.y - b.pos.y) < 1.5) {
          const sp = CFG.boostPad.speed * this.mul();
          this.yaw = Math.atan2(b.dir.x, b.dir.z);
          this.s = Math.max(this.s, sp); this.gear = 3;
          this.padCooldown = 0.4;
          SFX.boost();
        }
      }
    }
    for (const c of world.checkpoints) {
      if (c.active) continue;
      if (Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < 2.3 && Math.abs(c.pos.y - this.pos.y) < 2.5) {
        world.activateCheckpoint(c);
        SFX.checkpoint();
        this.game.hud.toast('⭐ 체크포인트!');
        this.game.onCheckpoint?.(c);
      }
    }
    if (!this.secretFound && world.secret && world.secret.pos.distanceTo(this.pos) < 5) {
      this.secretFound = true; this.stats.secret = 1;
      world.secret.mesh.visible = false;
      this.game.fx.burst(world.secret.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xff66ff, 30, 9);
      SFX.crystal();
      this.game.hud.toast('🔮 숨겨진 장소를 찾았다!', 'gold');
    }
    // 위험물 (톱날)
    for (const h of world.hazards) {
      if (Math.abs(h.pos.x - this.pos.x) > 4 || Math.abs(h.pos.z - this.pos.z) > 4) continue;
      const c = this.pos.clone(); c.y += 0.8;
      if (c.distanceTo(h.pos) < h.radius + 0.6) this.hurt(h.pos);
    }
    // 몬스터
    const center = this.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    for (const e of this.game.enemies.inRadius(this.pos, 6)) {
      const ec = e.pos.clone().add(new THREE.Vector3(0, e.flying ? 0 : 0.6, 0));
      const dh = Math.hypot(ec.x - center.x, ec.z - center.z), dy = Math.abs(ec.y - center.y);
      if (dh > e.radius + 0.7 || dy > 1.6) continue;
      const stomp = this.state === 'air' && this.vel.y < -2 && center.y > ec.y + 0.4;
      if (this.attacking || stomp) {
        if (this.game.enemies.hit(e, this.superOn ? 3 : 1, this.pos, 12)) {
          this.onKill();
          if (this.state === 'air' && !this.slamming && !this.superFlight && !this.gliding) {
            this.vel.y = CFG.player.bounceVel;
            this.airActionUsed = false;
            this.dashTime = 0;
          }
        } else if (!this.superOn && e.alive && e.dying <= 0 && !e.shielded) { // 단단한 몬스터: 튕겨남
          const away = center.clone().sub(ec).setY(0).normalize();
          this.vel.x = away.x * 10; this.vel.z = away.z * 10; this.vel.y = 9; this.state = 'air'; this.s = 0;
        }
      } else if (e.T.harmless) {
        const away = center.clone().sub(ec).setY(0).normalize();
        this.pos.addScaledVector(away, 0.2);
      } else if (this.invuln <= 0) {
        this.hurt(e.pos);
      }
    }
  }

  tryBreak(w) {
    if (w.dead) return;
    const ok = this.superOn || (this.kind === 'power' && (this.attacking || this.s > this.cap(1) * 0.8));
    if (ok) this.breakWall(w);
    else if (!this._wallHint) { this._wallHint = true; this.game.hud.toast('금 간 벽! 파워형이나 슈퍼 상태면 부술 수 있어요'); setTimeout(() => (this._wallHint = false), 6000); }
  }
  breakWall(w) {
    if (w.dead) return;
    w.dead = true; w.mesh.visible = false;
    const c = w.min.clone().add(w.max).multiplyScalar(0.5);
    this.game.fx.burst(c, 0x9a8f7a, 30, 10);
    this.game.fx.burst(c, 0x5a5246, 20, 7);
    this.stats.walls++;
    this.shake = 0.3;
    SFX.wallBreak();
  }

  onKill() {
    this.stats.kills++;
    this.stats.streak++;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.game.onEnemyKilled?.();
  }

  // 맞았을 때: 링을 모두 떨어뜨리고, 뒤로 데굴데굴 날아감
  hurt(fromPos, dmgMul = 1) {
    if (this.superOn || this.invuln > 0 || this.state === 'dead' || this.blink || this.ult) return;
    const P = CFG.player;
    const dmg = P.damage * dmgMul * (this.rings === 0 ? 1 + P.zeroRingExtra : 1) * (this.game.hard ? CFG.hard.damage : 1);
    this.health -= dmg;
    if (this.rings > 0) { this.game.rings.scatter(this.pos, this.rings); this.rings = 0; SFX.ringLoss(); }
    SFX.hurt();
    this.stats.streak = 0;
    this.invuln = P.hurtInvuln;
    if (this.state === 'loop') this.loop = null;
    const away = this.pos.clone().sub(fromPos).setY(0);
    if (away.lengthSq() < 0.01) away.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    away.normalize().multiplyScalar(P.hurtKnockback);
    this.vel.set(away.x, P.hurtLift, away.z);
    this.state = 'air'; this.standOn = null;
    this.ball = this.rolling = this.slamming = false;
    this.cancelAbilities();
    this.airActionUsed = true; this.holdValid = false;
    this.s = 0; this.gear = 1;
    this.controlLock = 0.7; this.hurtT = 0.7;
    this.shake = 0.25;
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 10, 6);
    if (this.health <= 0) this.die();
  }

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead'; this.alive = false;
    this.deadTimer = CFG.player.respawnDelay;
    this.health = 0;
    this.superOn = false;
    this.cancelAbilities();
    SFX.death();
    this.view.root.visible = false;
  }

  respawn() {
    const cp = this.game.world.nearestCheckpoint(this.pos);
    this.spawnAt(cp.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), this.yaw);
    this.health = CFG.player.maxHealth;
    this.rings = 0;
    this.invuln = 2;
    this.alive = true;
    this.view.root.visible = true;
    this.game.hud.setFade(0);
    this.game.hud.toast('다시 시작! 💪');
  }

  collectRing(n) {
    this.rings += n;
    this.stats.ringsCollected += n;
    if (this.ringSfxCooldown <= 0) { SFX.ring(); this.ringSfxCooldown = 0.05; }
  }

  collectHeart() {
    const P = CFG.player, I = CFG.items;
    if (this.health < P.maxHealth) { this.health = Math.min(P.maxHealth, this.health + I.healAmount); SFX.heal(); this.game.hud.toast(`❤️ 체력 +${I.healAmount}%`); }
    else if (this.storedHearts < I.maxStored) { this.storedHearts++; SFX.store(); this.game.hud.toast('❤️ 아이템 칸에 보관!'); }
  }

  useHeart() {
    if (this.storedHearts <= 0) { this.game.hud.toast('보관한 체력 아이템이 없어요'); return; }
    if (this.health >= CFG.player.maxHealth) { this.game.hud.toast('체력이 이미 가득해요'); return; }
    this.storedHearts--;
    this.health = Math.min(CFG.player.maxHealth, this.health + CFG.items.healAmount);
    SFX.heal();
  }

  transform() {
    this.superOn = true;
    this.superDrain = 0;
    this.vel.y = Math.max(this.vel.y, 4);
    this.s *= CFG.super.speedMul; this.gear = this.gearFor(this.s);
    SFX.transform();
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffd700, 30, 10);
    this.game.fx.shockwave(this.pos, 8, 0xffd700);
    this.game.hud.toast(`✨ ${NAMES.superForm} 변신! ✨`, 'gold');
  }

  pose() {
    if (this.ult) return 'cast';
    if (this.punchT > 0) return 'punch';
    if (this.grounded) return 'run';
    if (this.superFlight) return 'flight';
    if (this.gliding) return 'glide';
    if (this.flying) return 'fly';
    return 'air';
  }

  updateView(dt) {
    const v = this.view;
    v.root.position.copy(this.pos);
    if (this.state === 'loop' && this.loop) {
      const L = this.loop;
      const fwd = L.tangentAt(this.loopT);
      if (this.s < 0) fwd.negate();
      const up = L.centerAt(this.loopT).sub(L.pathAt(this.loopT)).normalize();
      const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
      const up2 = new THREE.Vector3().crossVectors(fwd, right);
      tmpM.makeBasis(right, up2, fwd);
      v.root.quaternion.setFromRotationMatrix(tmpM);
    } else {
      v.root.quaternion.setFromAxisAngle(UP, this.yaw);
    }
    const hs = this.state === 'air' ? Math.hypot(this.vel.x, this.vel.z) : Math.abs(this.s);
    v.update(dt, {
      speed: hs / (this.superOn ? CFG.super.speedMul * 0.7 : 1) * (this.superOn ? 1.4 : 1),
      grounded: this.grounded, ball: (this.ball || this.state === 'charge') && !this.superFlight,
      charging: this.state === 'charge', chargeLevel: this.chargeLevel,
      hurt: this.hurtT > 0, pose: this.pose(), superOn: this.superOn, auraReady: this.canTransform(),
      superCharge: this.holdValid && this.canTransform() ? Math.min(1, this.holdTime / CFG.super.holdTime) : 0,
      blink: this.invuln > 0 && !this.superOn, time: this.game.time, flash: this.flashV * 0.6, hidden: this.hidden,
    });
    const g = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
    const h = this.pos.y - g;
    this.shadow.visible = this.alive && this.state !== 'loop' && h > 0.5;
    this.shadow.position.set(this.pos.x, g + 0.06, this.pos.z);
    const k = Math.max(0.3, 1 - h / 15);
    this.shadow.scale.setScalar(k);
    this.shadow.material.opacity = 0.3 * k;
  }

  dispose() { this.game.scene.remove(this.view.root, this.shadow); }
}
