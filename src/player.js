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

// 가려졌을 때 보이는 실루엣: 캐릭터를 한 번 더 그리되, 앞에 다른 물체가 있는 부분에만 하늘색으로 (자기 몸끼리는 무시)
let SIL_MAT = null;
function makeSilhouette(root) {
  if (!SIL_MAT) {
    SIL_MAT = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth, toneMapped: false, fog: false });
    SIL_MAT.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0); mvPosition.z += 0.8; gl_Position = projectionMatrix * mvPosition;');
    };
  }
  const clone = root.clone(true);
  const src = [], dst = [];
  root.traverse((o) => src.push(o)); clone.traverse((o) => dst.push(o));
  for (const o of dst) { if (o.isMesh) { o.material = SIL_MAT; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 50; } }
  return { root: clone, src, dst };
}

export class Player {
  constructor(game, kind = 'speed') {
    this.game = game;
    this.kind = kind;
    this.view = new CharacterView(kind);
    game.scene.add(this.view.root);
    this.sil = makeSilhouette(this.view.root);
    game.scene.add(this.sil.root);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    game.scene.add(this.shadow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.ringCheckPos = new THREE.Vector3();
    this.yaw = 0;
    this.s = 0;                 // 땅에서의 속도
    this.gear = 1; this.gearTimer = 0;
    this.state = 'ground';      // ground | air | charge | loop | swim | cannon | dead
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
    this.springLevel = 0; this.springChain = false; this.rollLimit = 0; this.cannon = null; this.cannonT = 0;
  }

  get grounded() { return this.state === 'ground' || this.state === 'charge' || this.state === 'loop'; }
  get attacking() { return this.ball || this.slamming || this.superOn || this.dashTime > 0 || this.gliding || this.punchT > 0 || this.superFlight; }
  canCollect() { return this.alive; }
  mul() { return CFG.characters[this.kind].speed * (this.superOn ? CFG.super.speedMul : 1); }
  cap(g) { return CFG.gears[g - 1].cap * CFG.characters[this.kind].gearCap[g - 1] * (this.superOn ? CFG.super.speedMul : 1); }
  gearFor(s) { let g = 1; while (g < 3 && s > this.cap(g) * 1.02) g++; return g; }
  maxSpeed() { return this.cap(this.gear); }

  canTransform() {
    if (this.superOn) return false;
    if (this.game.allClear) return (this.superCD || 0) <= 0;       // 5개 대지를 모두 되찾으면: 링 없이 변신 (쿨타임만)
    return this.rings >= (this.game.hard ? CFG.hard.superRingsNeeded : CFG.super.ringsNeeded);
  }

  spawnAt(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.s = 0; this.gear = 1;
    this.state = 'ground'; this.ball = this.rolling = this.slamming = false;
    this.loop = null; this.loopCD = 0; this.cannon = null; this.springChain = false;
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
    for (const k of ['invuln', 'controlLock', 'padCooldown', 'dashTime', 'ringSfxCooldown', 'shake', 'hurtT', 'punchT', 'tornadoCD', 'ultCD', 'loopCD', 'bounceWindow', 'bounceBuffer', 'superPunchCD']) this[k] = Math.max(0, this[k] - dt);
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
    if (this.state === 'cannon') { this.updateCannon(dt, input); this.finishFrame(dt); return; }
    this.cannonT = Math.max(0, this.cannonT - dt);
    if (this.ult) { this.updateUlt(dt); this.finishFrame(dt); return; }

    // ----- A 버튼 -----
    if (!locked && A.pressed) {
      if (this.state === 'loop') this.loopJump();
      else if (this.grounded) this.jump();
      else if (this.state === 'air' && !this.slamming) {
        if (this.bounceWindow > 0) { this.vel.y = CFG.player.bigBounce; this.bounceWindow = 0; this.bigBounceFx(); } // 맞힌 직후 점프 = 높이 튕기기
        else if (this.vel.y < 0 && this.ball && this.enemyBelow()) this.bounceBuffer = 0.22;              // 맞히기 직전 점프도 인정
        else this.airA(wish, hasMove);
      }
    }
    if (A.released) { this.holdValid = false; this.gliding = false; }
    if (this.holdValid && A.held) {
      this.holdTime += dt;
      if (this.canTransform() || this.superOn) {
        if (this.holdTime > 0.2 && this.state === 'air') this.vel.y = Math.max(this.vel.y, -1.2);
        if (this.holdTime >= CFG.super.holdTime) { this.holdValid = false; this.superOn ? this.untransform() : this.transform(); }
      }
    }
    // 순간이동형 슈퍼: C 꾹 → 블랙홀 필살기
    const Cb0 = input.buttons.c;
    if (Cb0 && Cb0.held && this.kind === 'blink' && this.superOn && this.ultCD <= 0 && !locked) {
      this.cHold = (this.cHold || 0) + dt;
      if (this.cHold >= CFG.blink.ultHold) { this.cHold = 0; this.startUlt(wish, hasMove); this.finishFrame(dt); return; }
    } else this.cHold = 0;

    // ----- B 버튼 -----
    if (!locked && B.pressed) {
      if (this.state === 'ground') {
        if (hasMove) this.startCharge(wish);
        else if (this.kind === 'power') this.punch();
      } else if (this.state === 'charge') {
        if (this.chargeLevel < P.spinMaxTaps) { this.chargeLevel++; SFX.spinCharge(this.chargeLevel); }
      } else if (this.state === 'air' && !this.slamming) this.startSlam();
    }
    // ----- C 버튼: 스핀 발사 / 달리다가 몸을 말아 구르기 -----
    const Cb = input.buttons.c;
    if (!locked && Cb && Cb.pressed) {
      if (this.state === 'charge') this.launchSpin();
      else if (this.state === 'ground' || this.state === 'loop') {
        if (this.rolling) { this.rolling = false; this.ball = false; }
        else if (this.s > 3) { this.rolling = true; this.ball = true; this.rollTime = 0; this.rollLimit = 1.4; SFX.roll(); this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffffff, 5, 3); }
      }
    }

    // ----- 상태별 움직임 -----
    if (this.state === 'charge') this.updateCharge(dt, wish, hasMove);
    else if (this.state === 'ground') this.updateGround(dt, wish, wishLen, hasMove);
    else if (this.state === 'air') this.updateAir(dt, wish, hasMove);
    else if (this.state === 'loop') this.updateLoop(dt, wish, hasMove);
    else if (this.state === 'swim') this.updateSwim(dt, wish, hasMove, input);

    this.interact(dt);
    this.finishFrame(dt);
  }

  finishFrame(dt) {
    this.superCD = Math.max(0, (this.superCD || 0) - dt);
    if (this.superOn) {
      if (this.game.allClear) { // 링 없이 변신한 경우: 5분 뒤 풀림
        this.superTime = (this.superTime || 0) + dt;
        if (this.superTime >= CFG.super.freeTime) this.untransform();
      } else {
        this.superDrain += dt * CFG.super.drainPerSec;
        while (this.superDrain >= 1) { this.superDrain -= 1; this.rings = Math.max(0, this.rings - 1); }
        if (this.rings <= 0) this.untransform();
      }
    }
    const ready = this.canTransform();
    if (ready && !this.auraWasReady) { SFX.superReady(); this.game.hud.toast(`✨ ${NAMES.superForm} 변신 가능! 점프를 1.5초 꾹!`, 'gold'); }
    this.auraWasReady = ready;
    const W = this.game.world;
    if (this.alive && W.mode === 'lava' && this.state !== 'loop' && this.pos.y < CFG.lava.level + 0.25 && W.lavaAt(this.pos.x, this.pos.z)) this.hazardDeath('lava');
    else if (this.alive && W.mode === 'sky' && this.pos.y < CFG.sky.cloudY - 3) this.hazardDeath('void');
    else if (this.pos.y < -60 && W.mode !== 'sky') this.die();
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
      if (!this.airActionUsed) { this.flying = true; this.flyTime = 0; this.airActionUsed = true; this.ball = false; this.holdValid = false; this.flap(); }
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

  // 스피드형 슈퍼 2단 점프: 그 자리에서 살짝 더 뛰어오른 뒤, 천천히 내려옴
  startSuperFlight(wish, hasMove) {
    const S = CFG.super;
    this.vel.y = Math.max(this.vel.y, 0) + S.floatHop;
    this.superFlight = true; this.ball = false;
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffd700, 20, 8);
    this.game.fx.shockwave(this.pos, 5, 0xffd700);
    SFX.flight();
  }

  // 점프 연타 = 헬리콥터처럼 누를수록 더 빨리 올라감 (게이지 사용). 게이지가 없거나 20초가 지나면 더 못 올라감
  flap() {
    const F = CFG.flyer;
    if (this.flyGauge <= 0 || this.flyTime >= F.maxTime) return;
    this.vel.y = Math.min(F.maxRise, Math.max(this.vel.y, 0) + F.flapAdd);
    this.flyGauge = Math.max(0, this.flyGauge - F.flapCost);
    this.flapRecent = 0.6;
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
    if (this.superOn) { if ((this.superPunchCD || 0) <= 0) this.superPunch(); return; }
    this.punchT = 0.35;
    SFX.punch();
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const c = this.pos.clone().addScaledVector(fwd, 1.6);
    this.s = Math.max(this.s, 6);
    for (const e of this.game.enemies.inRadius(c, CFG.power.punchRange)) if (this.game.enemies.hit(e, this.superOn ? 8 : 4, this.pos, 20)) this.onKill();
    this.smashAround(c, CFG.power.punchRange);
    this.game.boss?.tryHit(this, c, CFG.power.punchRange, 1);
    for (const w of this.game.world.walls) {
      if (w.dead) continue;
      const cx = Math.max(w.min.x, Math.min(c.x, w.max.x)), cz = Math.max(w.min.z, Math.min(c.z, w.max.z));
      if (Math.hypot(c.x - cx, c.z - cz) < 2.2) this.breakWall(w);
    }
    this.game.fx.burst(c.clone().setY(this.pos.y + 1), 0xffffff, 6, 5);
  }

  // 파워형 슈퍼 활강: 아주 빠르게 날며, 땅에 내려올 때까지 지나가는 곳 아래를 계속 공격
  superGlideTick(dt) {
    const C = CFG.power;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs < C.superGlideSpeed) { const f = Math.sin(this.yaw), c = Math.cos(this.yaw); this.vel.x += f * (C.superGlideSpeed - hs) * Math.min(1, dt * 4); this.vel.z += c * (C.superGlideSpeed - hs) * Math.min(1, dt * 4); }
    this.glidePulse = (this.glidePulse || 0) - dt;
    if (Math.random() < 0.8) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), Math.random() < 0.5 ? 0xff7ad9 : 0xffe14d, 2, 4);
    if (this.glidePulse > 0) return;
    this.glidePulse = 0.12;
    const R = C.superGlideRadius, en = this.game.enemies;
    const gy = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    for (const e of en.list) {
      if (!e.alive || e.dying > 0) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      if (dx * dx + dz * dz > R * R || e.pos.y > this.pos.y + 6 || e.pos.y < gy - 6) continue;
      if (e.T.static) en.hit(e, 1, this.pos);
      else if (en.hit(e, C.superGlideDamage, this.pos.clone().setY(e.pos.y), 22, true)) this.onKill();
    }
    const B = this.game.boss; if (B?.targetable && Math.hypot(B.pos.x - this.pos.x, B.pos.z - this.pos.z) < R + B.R && B.pos.y > gy - 6) B.damage(1, this);
    // 지나가는 땅이 초토화: 폭발이 연달아 터지고, 나무·바위·벽이 부서짐
    const ground = this.pos.clone().setY(gy);
    this.smashAround(ground, R * 0.8);
    this.melt(ground, R * 0.6);
    for (const w of this.game.world.walls) { if (w.dead) continue; const c = w.min.clone().add(w.max).multiplyScalar(0.5); if (Math.hypot(c.x - ground.x, c.z - ground.z) < R) this.breakWall(w); }
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    for (const k of [-1, 0, 1]) {
      const p = ground.clone().addScaledVector(side, k * R * 0.55 + (Math.random() - 0.5) * 4);
      p.y = this.game.world.groundAt(p.x, p.z, gy + 5) + 0.4;
      if (k === 0 || Math.random() < 0.7) this.game.fx.explosion(p, 0.9 + Math.random() * 0.5);
      this.game.fx.burst(p, [0xff5a10, 0xffb020, 0x5a4a3a][(Math.random() * 3) | 0], 8, 12);
    }
    this.game.fx.shockwave(ground, R, 0xff7ad9);
    if (Math.random() < 0.35) SFX.explosion();
    this.shake = Math.max(this.shake, 0.35);
  }

  // 얼음 나라: 슈퍼 공격이 닿은 땅은 눈이 녹아 흙과 풀이 드러남 (같이 하기 중이면 모두에게)
  melt(p, r) { if (this.superOn && this.game.world.mode === 'ice') this.game.melt?.(p, r); }

  // 파워형 슈퍼 펀치: 주먹 방향으로 넓게 퍼지며 70m까지 쾅!
  superPunch() {
    const C = CFG.power;
    this.punchT = 0.45; this.superPunchCD = C.superPunchCooldown;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const o = this.pos.clone().add(new THREE.Vector3(0, 1, 0)), cosA = Math.cos(C.superPunchAngle);
    const inCone = (p, extra = 0) => { const d = p.clone().sub(o); const dy = d.y; d.y = 0; const l = d.length(); return l < C.superPunchRange + extra && Math.abs(dy) < 25 && (l < 3 || d.dot(fwd) / l > cosA); };
    const en = this.game.enemies;
    for (const e of en.list) {
      if (!e.alive || e.dying > 0 || !inCone(e.pos)) continue;
      if (e.T.static) en.hit(e, 1, this.pos);
      else if (en.hit(e, C.superPunchDamage, this.pos, 30, true)) this.onKill();
    }
    const B = this.game.boss; if (B?.targetable && inCone(B.pos, B.R)) B.damage(2, this);
    for (let d = 4; d < 45; d += 6) this.smashAround(o.clone().addScaledVector(fwd, d).setY(this.pos.y), 3 + d * 0.25);
    for (let d = 8; d < 60; d += 13) this.melt(o.clone().addScaledVector(fwd, d), 4 + d * 0.18);
    for (const w of this.game.world.walls) { if (w.dead) continue; const c = w.min.clone().add(w.max).multiplyScalar(0.5); if (inCone(c)) this.breakWall(w); }
    this.game.fx.coneBlast(o, fwd, C.superPunchRange, C.superPunchAngle);
    this.game.hud.flash('rgba(255,200,80,0.55)');
    SFX.punch(); SFX.explosion();
    this.shake = 0.8;
    this.s = Math.max(this.s, 4);
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
        for (const e of this.game.enemies.inRadius(this.pos, R)) if (this.game.enemies.hit(e, this.superOn ? 6 : 3, this.pos, 14)) { n++; this.onKill(); }
        if (this.game.boss?.tryHit(this, this.pos, R, 1)) n++;
        this.game.fx.shockwave(this.pos, R, 0x9a5cff);
        this.game.fx.burst(this.pos.clone(), 0x6a2cff, 24, 10);
        this.flashV = 1; SFX.slamHit();
        b.phase = 'strike'; b.t = 0.28; b.hit = true;
      } else { b.phase = 'fail'; b.t = 0.18; this.hidden = false; }
    } else if (b.phase === 'strike') {
      if (b.hit) {
        // 진행 방향 뒤쪽 안전한 곳으로
        const back = this.pos.clone().addScaledVector(b.dir, -9);
        back.y = this.game.world.groundAt(back.x, back.z, this.pos.y + 5) + 0.5;
        this.pos.copy(back);
        this.flashV = 1; SFX.blink();
        // 돌아온 자리에서 한 번 더 범위 공격 + 잠깐 무적
        const R = B.energyRadius * (this.superOn ? 1.5 : 1);
        for (const e of this.game.enemies.inRadius(this.pos, R)) if (this.game.enemies.hit(e, this.superOn ? 6 : 3, this.pos, 14)) this.onKill();
        this.game.boss?.tryHit(this, this.pos, R, 1);
        this.game.fx.shockwave(this.pos, R, 0x9a5cff);
        this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0x6a2cff, 16, 8);
        this.invuln = Math.max(this.invuln, B.returnInvuln);
      }
      b.phase = 'gone'; b.t = 0.12;
    } else {
      this.blink = null; this.hidden = false;
      this.state = 'air'; this.vel.set(0, 5, 0);
      if (b.target) this.invuln = Math.max(this.invuln, B.returnInvuln);
    }
  }
  // 순간이동형 슈퍼 필살기 (C 꾹): 공중으로 솟아올라 블랙홀 → 넓은 범위 몬스터를 빨아들임 → 쾅! 폭발하며 사방으로 날려버림
  startUlt(wish, hasMove) {
    const B = CFG.blink;
    const cost = Math.ceil(this.rings * B.ultRingCost);
    if (!this.game.allClear) this.rings = Math.max(0, this.rings - cost);
    this.ultCD = B.ultCooldown;
    const dir = hasMove ? wish.clone() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const c = this.pos.clone().addScaledVector(dir, 30);
    c.y = this.game.world.groundAt(c.x, c.z, this.pos.y + 20) + 14;
    this.ult = { t: 0, dir, y0: this.pos.y, center: c, fired: false, boom: false, pulled: [] };
    this.game.freezeT = 99;
    this.state = 'air'; this.vel.set(0, 0, 0); this.ball = false; this.rolling = false;
    this.invuln = Math.max(this.invuln, 3);
    SFX.blackhole();
    this.game.hud.toast('🌑 블랙홀!', 'gold');
  }
  updateUlt(dt) {
    const u = this.ult, B = CFG.blink, en = this.game.enemies;
    u.t += dt;
    this.pos.y = u.y0 + Math.min(1, u.t / 0.6) * 8;
    if (!u.fired && u.t > 0.6) {
      u.fired = true;
      u.hole = this.game.fx.blackhole(u.center.clone().setY(u.center.y - 4), 99, 8, 4); // 다 모일 때까지 유지
      this.game.hud.flash('rgba(60,0,120,0.55)');
      for (const e of en.list) {
        if (!e.alive || e.dying > 0 || e.T.static) continue;
        if (e.pos.distanceTo(u.center) < B.ultPullRange) { en._ensureMesh?.(e); u.pulled.push(e); e.flyT = 0; e.stunT = 0; }
      }
      this.shake = 0.4;
    }
    if (u.fired && !u.boom) { // 빨려 들어감
      for (const e of u.pulled) {
        if (!e.alive) continue;
        const k = Math.min(1, dt * (1.2 + u.t * 0.8));
        e.pos.lerp(u.center, k);
        if (e.mesh) { e.mesh.position.copy(e.pos); e.mesh.rotation.y += dt * 12; e.mesh.rotation.x += dt * 6; e.mesh.scale.setScalar(Math.max(0.5, 1 - (u.t - 0.6) * 0.3)); }
      }
      this.shake = Math.max(this.shake, 0.15);
    }
    const gathered = u.fired && u.t > 1.4 && u.pulled.every((e) => !e.alive || e.pos.distanceTo(u.center) < 3);
    if (!u.boom && (gathered || u.t > 6)) { // 다 모이면 쾅!
      u.boom = true; u.boomT = u.t; this.game.freezeT = 0;
      if (u.hole) { u.hole.closing = true; u.hole.life = 0.3; }
      this.game.fx.explosion(u.center, 3.5);
      this.game.fx.shockwave(u.center.clone().setY(u.center.y - 8), B.ultPullRange * 0.6, 0xb070ff);
      this.game.fx.burst(u.center, 0x6a2cff, 40, 22); this.game.fx.burst(u.center, 0xffffff, 30, 18);
      this.game.hud.flash('rgba(200,140,255,0.7)');
      SFX.explosion(); this.shake = 0.9;
      for (const e of u.pulled) {
        if (!e.alive) continue;
        if (e.mesh) { e.mesh.scale.setScalar(1); e.mesh.rotation.set(0, 0, 0); }
        if (en.hit(e, B.ultDamage, u.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2)), 26, true)) this.onKill();
      }
      for (const e of en.list) if (e.T.static && e.alive && e.pos.distanceTo(u.center) < B.ultPullRange) en.hit(e, 1, u.center);
      if (this.game.boss?.targetable && this.game.boss.pos.distanceTo(u.center) < B.ultPullRange * 1.2) this.game.boss.damage(2, this);
      this.smashAround(u.center.clone().setY(u.center.y - 9), 25);
      this.melt(u.center, 22);
    }
    if (u.boom && u.t > u.boomT + 0.6) { this.ult = null; this.state = 'air'; this.vel.set(0, 2, 0); }
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
    if (this.knockV && this.knockV.lengthSq() > 0.05) { // 밀려나는 중
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.addScaledVector(this.knockV, dt);
      this.game.world.collide(this.pos, P.radius, P.height, this.knockV, this.pos.y);
      const g = this.groundHere(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (g - this.pos.y > 1.2) { this.pos.x = ox; this.pos.z = oz; } else this.pos.y = g;
      this.knockV.multiplyScalar(Math.max(0, 1 - dt * 5));
    }
    if (hasMove) {
      this.chargeDir.copy(wish);
      this.yaw = Math.atan2(wish.x, wish.z);
      this.carry(dt);
      this.pos.y = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
      if (Math.random() < 0.3) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(-wish.x, 0.2, -wish.z)), 0xd9c9a0, 1, 3);
    } else {
      this.carry(dt);
      this.pos.y = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    }
  }
  launchSpin() { // C 버튼: 스핀 속도로 튀어나가기!
    const P = CFG.player;
    {
      this.s = (P.spinLaunchBase + P.spinLaunchPerTap * (this.chargeLevel - 1)) * this.mul();
      this.gear = this.gearFor(this.s);
      this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      this.state = 'ground';
      this.rolling = true; this.ball = true; this.rollTime = 0; this.rollLimit = P.rollToRun;
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
    const sup = this.superOn;
    const R = P.slamRadius * (sup ? CFG.super.slamRadiusMul : 1);
    let n = 0;
    for (const e of this.game.enemies.inRadius(this.pos, R)) if (this.game.enemies.hit(e, sup ? 8 : 3, this.pos, sup ? 26 : 16, true)) { n++; this.onKill(); }
    this.smashAround(this.pos, sup ? R * 0.55 : R * 0.8);
    this.game.boss?.tryHit(this, this.pos, R, 1);
    if (n >= 3) this.stats.slamMulti = 1;
    if (sup) {
      this.melt(this.pos, R * 0.75);
      this.game.fx.superSlam(this.pos.clone(), R);
      this.game.hud.flash('rgba(255,210,90,0.5)');
      SFX.explosion();
      this.shake = 0.7;
    } else {
      this.game.fx.shockwave(this.pos, R, 0xffffff);
      this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xd9c9a0, 12, 8);
      this.shake = 0.25;
    }
    SFX.slamHit();
  }

  // ---------------- 땅 위 (자동차처럼 1단 → 2단 → 3단) ----------------
  updateGround(dt, wish, wishLen, hasMove) {
    const P = CFG.player, m = this.mul();
    const waterMul = this.inWater ? CFG.water.slow : 1;
    if (hasMove) {
      const want = Math.atan2(wish.x, wish.z);
      const d = angDiff(want, this.yaw);
      if (this.s < 5 && Math.abs(d) > 1.0) {
        this.yaw = want;                                  // 느릴 때는 바로 그 방향으로 몸을 돌림 (뒤로 가기 = 정면을 보며 카메라 쪽으로)
        this.gearTimer = 0;
      } else if (Math.abs(d) > 2.4 && this.s > 5) {
        this.s = Math.max(0, this.s - P.brake * m * dt);   // 반대 방향: 브레이크
        this.gearTimer = 0;
      } else {
        const fast = this.s / m;
        const rate = P.turnRate * (this.rolling ? 0.5 : 1) * (fast > 20 ? 0.6 : 1) * (fast > 34 ? 0.7 : 1);
        this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
        if (this.rolling) { this.rollTime += dt; if (this.rollTime >= (this.rollLimit || P.rollToRun)) { this.rolling = false; this.ball = false; } }
        const top = this.cap(this.gear) * waterMul * Math.max(0.35, wishLen) * (Math.abs(d) > 1.2 ? 0.8 : 1);
        const CH = CFG.characters[this.kind];
        if (this.s < top) this.s = Math.min(top, this.s + CFG.gears[this.gear - 1].accel * m * CH.accel * (this.inWater ? 0.6 : 1) * dt);
        else if (this.inWater) this.s = Math.max(top, this.s - (P.overDecay + CFG.water.groundDragQuad * this.s * this.s) * dt); // 물 속: 강한 힘도 저항 때문에 금방 느려짐
        else if (this.s > this.cap(3) * waterMul) this.s = Math.max(top, this.s - P.overDecay * m * dt); // 스핀·가속 발판 속도는 천천히 줄어듦
        else this.s = Math.max(top, this.s - 14 * m * dt);
        // 다음 단계로
        if (this.gear < 3 && this.s >= this.cap(this.gear) * 0.97 && wishLen > 0.7 && !this.inWater) {
          this.gearTimer += dt;
          if (this.gearTimer >= CFG.gearUpTime * CFG.characters[this.kind].gearUp) { this.gear++; this.gearTimer = 0; SFX.gearUp(this.gear); this.game.fx.shockwave(this.pos, 2.5 + this.gear, 0xbfe8ff); }
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
    if (this.state === 'ground' || this.state === 'air') {
      if (this.loopContact(this._ox, this._oz)) return;
      if (this.state === 'ground') { const gy = this.groundHere(this.pos.x, this.pos.z, this.pos.y + 0.5); if (Math.abs(gy - this.pos.y) < 1.2) this.pos.y = gy; }
    }
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
    this._ox = ox; this._oz = oz;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const v0x = this.vel.x, v0z = this.vel.z;
    if (world.collide(this.pos, P.radius, P.height, this.vel, oldY)) {
      if (world.lastHitBox?.breakable) this.tryBreak(world.lastHitBox);
      if (world.lastHitTree && this.smashTree(world.lastHitTree)) { this.vel.x = v0x; this.vel.z = v0z; }
      else {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        this.s = Math.min(this.s, hs);
        if (hs > 0.5) this.yaw = Math.atan2(this.vel.x, this.vel.z);
      }
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
    let g = world.groundAt(x, z, y, 0.9, true);
    this._surf = world.lastSurface; this._plat = world.lastPlatform; this._waterRun = false;
    if ((this._surf === 'water' || this._surf === 'shallow') && this.s >= CFG.water.runSpeed && y >= -0.3) { g = Math.max(g, 0); this._surf = 'waterRun'; this._waterRun = true; }
    return g;
  }

  // ---------------- 360도 루프 = 동그랗게 말린 진짜 땅 ----------------
  // 트랙은 두께가 있는 단단한 띠. 어느 방향에서 와도 부딪히고, 바닥 같은 곳에는 착지, 위쪽(벽·천장)은
  // 속도가 충분할 때만 붙어서 달림 (원심력 v²/R 이 중력보다 커야 함). 위에서 떨어지면 바깥 꼭대기에도 설 수 있음.
  // 트랙 위에서의 위치 = (loopT: 0~1 한 바퀴 중 어디, loopLat: 트랙 가운데에서 옆으로), 속도 = (loopVt: 트랙 방향, loopVu: 옆)
  _loopGeo(L, x, y, z) {
    const rx = x - L.base.x, rz = z - L.base.z;
    const along = rx * L.fwd.x + rz * L.fwd.z, lat = rx * L.side.x + rz * L.side.z, up = y - (L.base.y + L.R);
    const d = Math.hypot(along, up);
    let a = Math.atan2(along, -up); if (a < 0) a += Math.PI * 2;
    const t = a / (Math.PI * 2);
    return { along, lat, up, d, a, t, dl: lat - L.offset * (t - 0.5) };
  }
  // 바깥(중심에서 멀어지는) 방향
  _loopOut(L, g) { return new THREE.Vector3().addScaledVector(L.fwd, g.along / (g.d || 1)).setY(g.up / (g.d || 1)); }
  _loopPush(L, g, newD) { this.pos.addScaledVector(this._loopOut(L, g), newD - g.d); }
  attachLoop(L, t, lat) {
    const T = L.tangentAt(t);
    this.state = 'loop'; this.loop = L; this.standOn = null;
    this.loopT = Math.min(0.999, Math.max(0.001, t)); this.loopLat = lat;
    this.loopVt = this.vel.dot(T); this.loopVu = this.vel.dot(L.side) * 0.5;
    this.gear = this.gearFor(Math.abs(this.loopVt) * 0.99);
    this.slamming = false; this.superFlight = this.flying = this.gliding = false; this.dashTime = 0;
    this.springChain = false; this.springLevel = 0; this.airActionUsed = false; this.holdValid = false;
    L.pathAt(this.loopT, this.pos).addScaledVector(L.side, lat);
  }
  // 땅·공중에서 움직인 뒤 루프 트랙과 닿았는지 (ox, oz = 움직이기 전 위치)
  loopContact(ox, oz) {
    const W = CFG.loop, TH = W.thickness, gL = CFG.player.gravity * W.gravityScale, P = CFG.player;
    for (const L of this.game.world.loops) {
      const rx = this.pos.x - L.base.x, rz = this.pos.z - L.base.z;
      if (Math.abs(rx * L.fwd.x + rz * L.fwd.z) > L.R + TH + 2 || Math.abs(rx * L.side.x + rz * L.side.z) > L.offset / 2 + L.width / 2 + 2) continue;
      const inRib = (g) => Math.abs(g.dl) < L.width / 2 + 0.25;
      const F = this._loopGeo(L, this.pos.x, this.pos.y, this.pos.z);
      const Hd = this._loopGeo(L, this.pos.x, this.pos.y + P.height, this.pos.z);
      // 1) 발이 트랙 두께 안에 들어감 → 안쪽 면(달리는 면)이나 바깥쪽 면으로 밀어냄
      if (inRib(F) && F.d > L.R - 0.05 && F.d < L.R + TH - 0.03) {
        const vOut = this.vel.dot(this._loopOut(L, F));      // 바깥쪽으로 움직이는 중이면 안쪽 면에 닿은 것, 안쪽으로 움직이면 바깥 면
        const fromInside = Math.abs(vOut) > 0.5 ? vOut > 0 : F.d - L.R <= L.R + TH - F.d;
        if (fromInside) { // 안쪽 면
          const ny = Math.cos(F.a), vt = this.vel.dot(L.tangentAt(F.t));
          const stick = ny > 0.35 || (vt * vt / L.R + gL * ny > 0 && Math.abs(vt) > 6);
          if (stick && this.loopCD <= 0) { this.attachLoop(L, F.t, F.dl); return true; }
          this._loopPush(L, F, L.R - 0.04);                        // 벽·천장에 부딪힘
          const out = this._loopOut(L, F), vn = this.vel.dot(out);
          if (vn > 0) this.vel.addScaledVector(out, -vn);
        } else {                            // 바깥쪽 면
          this._loopPush(L, F, L.R + TH + 0.04);
          const out = this._loopOut(L, F), vn = this.vel.dot(out);
          if (vn < 0) this.vel.addScaledVector(out, -vn);
          if (this.state === 'ground') this.s *= 0.5;
        }
        continue;
      }
      // 2) 발은 트랙 바깥(아래)인데 머리가 트랙을 뚫음 → 옆에서 트랙 몸통에 부딪힘
      if (inRib(Hd) && F.d >= L.R + TH - 0.05 && Hd.d < L.R + TH) {
        this.pos.x = ox; this.pos.z = oz;
        if (this.state === 'air') { this.vel.x *= -0.2; this.vel.z *= -0.2; if (this.vel.y > 0 && Hd.up < -L.R * 0.3) this.vel.y = 0; }
        else this.s *= 0.3;
        continue;
      }
      // 3) 루프 안에서 점프해 머리가 안쪽 면(천장)에 닿음
      if (inRib(Hd) && F.d < L.R - 0.05 && Hd.d > L.R - 0.05 && this.state === 'air') {
        const vt = this.vel.dot(L.tangentAt(Hd.t)), ny = Math.cos(Hd.a);
        if (this.loopCD <= 0 && vt * vt / L.R + gL * ny > 0 && Math.abs(vt) > 6) { this.attachLoop(L, Hd.t, Hd.dl); return true; } // 빠르면 천장에 붙어서 달림
        this.pos.addScaledVector(this._loopOut(L, Hd), (L.R - 0.06) - Hd.d);
        const out = this._loopOut(L, Hd), vn = this.vel.dot(out);
        if (vn > 0) this.vel.addScaledVector(out, -vn);
      }
    }
    return false;
  }
  // 트랙 위에서 점프: 그 자리 바닥이 향하는 쪽(루프 중심 쪽)으로
  loopJump() {
    const L = this.loop, t = Math.min(1, Math.max(0, this.loopT));
    const n = L.centerAt(t).sub(L.pathAt(t)).normalize();
    const v = L.tangentAt(t).multiplyScalar(this.loopVt).addScaledVector(L.side, this.loopVu);
    const jv = CFG.player.jumpVel * CFG.characters[this.kind].jump * (this.superOn ? CFG.super.jumpMul : 1);
    this.vel.copy(v).addScaledVector(n, jv);
    this.pos.addScaledVector(n, 0.1);
    this.loop = null; this.loopCD = 0.3; this.state = 'air'; this.standOn = null;
    this.ball = true; this.rolling = false; this.airActionUsed = false; this.holdValid = true; this.holdTime = 0;
    this.stats.jumps++;
    SFX.jump();
  }

  updateLoop(dt, wish, hasMove) {
    const L = this.loop, C = CFG.loop, m = this.mul(), P = CFG.player;
    // 방향키는 보통 땅처럼 카메라 기준: 루프 진행 방향 쪽 = 앞으로
    const fwdIn = hasMove ? wish.x * L.fwd.x + wish.z * L.fwd.z : 0, sideIn = hasMove ? wish.x * L.side.x + wish.z * L.side.z : 0;
    const a = this.loopT * Math.PI * 2;
    const g = P.gravity * C.gravityScale;
    const dir = Math.sign(this.loopVt) || Math.sign(fwdIn) || 1, sp = Math.abs(this.loopVt);
    this.gear = Math.max(1, Math.min(this.gear, this.gearFor(sp))); // 트랙 위에서는 단계가 올라가지 않음 (들어올 때 속도가 중요)
    const acc = CFG.gears[this.gear - 1].accel * m * CFG.characters[this.kind].accel * C.accelMul;
    // 땅과 같은 달리기: 가는 방향 키 = 가속(지금 단계 최고 속도까지), 반대 키 = 브레이크, 놓으면 천천히 느려짐
    if (Math.abs(fwdIn) > 0.2 && Math.sign(fwdIn) === dir) { if (sp < this.cap(this.gear)) this.loopVt += dir * acc * Math.abs(fwdIn) * dt; }
    else if (Math.abs(fwdIn) > 0.2) { this.loopVt -= dir * Math.min(sp + 1, P.brake * m * dt); }
    else this.loopVt -= dir * Math.min(sp, (this.rolling ? 1 : 3) * dt);
    this.loopVt -= g * Math.sin(a) * dt;            // 올라갈 때 중력 때문에 느려지고, 내려올 때 빨라짐
    if (Math.abs(this.loopVt) > this.cap(3) * 1.6) this.loopVt -= Math.sign(this.loopVt) * P.overDecay * dt;
    // 옆 방향
    this.loopVu += sideIn * C.sideAccel * m * dt;
    this.loopVu *= Math.max(0, 1 - 2.5 * dt);
    this.loopT += this.loopVt * dt / L.length;
    this.loopLat += this.loopVu * dt;
    this.s = Math.hypot(this.loopVt, this.loopVu);
    if (this.rolling) { this.rollTime += dt; if (this.rollTime >= (this.rollLimit || 1.4) && Math.abs(fwdIn) > 0.2) this.rolling = false; }
    this.ball = this.rolling;
    const surfVel = () => L.tangentAt(Math.min(1, Math.max(0, this.loopT))).multiplyScalar(this.loopVt).addScaledVector(L.side, this.loopVu);
    const leave = (toGround) => {
      this.loop = null; this.loopCD = toGround ? 0 : 0.6;
      const v = surfVel();
      if (toGround) { this.state = 'ground'; this.s = Math.hypot(v.x, v.z); if (this.s > 0.3) this.yaw = Math.atan2(v.x, v.z); this.slopeVy = 0; this.gear = this.gearFor(this.s); }
      else { this.vel.copy(v); this.state = 'air'; this.airActionUsed = false; this.rolling = false; }
    };
    // 트랙 옆 가장자리 밖으로 나가면 떨어짐
    if (Math.abs(this.loopLat) > L.width / 2 + 0.2) { L.pathAt(Math.min(1, Math.max(0, this.loopT)), this.pos).addScaledVector(L.side, this.loopLat); leave(false); return; }
    if (this.loopT >= 1) { L.pathAt(1, this.pos).addScaledVector(L.side, this.loopLat); if (this.loopVt > 0) this.stats.loops++; leave(true); return; }
    if (this.loopT <= 0) { L.pathAt(0, this.pos).addScaledVector(L.side, this.loopLat); leave(true); return; }
    // 원심력이 모자라면 트랙에서 떨어짐: v²/R + g·cos(a) < 0 (천장 쪽), 세워진 벽에서 너무 느려도 미끄러져 떨어짐
    const ny = Math.cos(a), vt = this.loopVt;
    if (vt * vt / L.R + g * ny < 0 || (ny < 0.3 && Math.abs(vt) < 4)) {
      L.pathAt(this.loopT, this.pos).addScaledVector(L.side, this.loopLat);
      const n = L.centerAt(this.loopT).sub(L.pathAt(this.loopT)).normalize();
      this.pos.addScaledVector(n, 0.12);
      leave(false);
      return;
    }
    L.pathAt(this.loopT, this.pos).addScaledVector(L.side, this.loopLat);
    if (Math.abs(this.loopVt) > 0.5) this.yaw = Math.atan2(L.fwd.x * Math.sign(this.loopVt), L.fwd.z * Math.sign(this.loopVt));
  }

  // ---------------- 물 속 헤엄 ----------------
  // 물 깊이가 swimAt보다 깊으면 헤엄. 부력으로 둥둥 뜨고, 저항(drag) 때문에 강한 힘도 금방 느려짐.
  // A = 위로 헤엄 (수면에서는 물 밖으로 점프), B = 아래로 잠수, C = 순간 돌진
  enterSwim() {
    if (this.state === 'swim') return;
    this.state = 'swim'; this.standOn = null;
    this.ball = this.rolling = this.slamming = false;
    this.cancelAbilities();
    this.inWater = true;
    SFX.splash();
    this.game.fx.burst(this.pos.clone().setY(0.1), 0xdff4ff, 18, 7);
  }
  updateSwim(dt, wish, hasMove, input) {
    const W = CFG.water, P = CFG.player, m = this.mul(), world = this.game.world;
    const btn = input.buttons, locked = this.controlLock > 0;
    if (hasMove) {
      this.vel.x += wish.x * W.swimAccel * m * dt; this.vel.z += wish.z * W.swimAccel * m * dt;
      this.yaw += angDiff(Math.atan2(wish.x, wish.z), this.yaw) * Math.min(1, dt * 6);
    }
    const atTop = this.pos.y > W.floatY - 0.6;
    if (!locked && btn.a.pressed) {
      if (atTop) { // 물 밖으로 점프
        this.vel.y = P.jumpVel * 0.8 * CFG.characters[this.kind].jump;
        this.state = 'air'; this.ball = true; this.airActionUsed = false; this.inWater = false;
        SFX.jump(); this.game.fx.burst(this.pos.clone().setY(0.1), 0xdff4ff, 14, 6);
        this.pos.y += 0.1;
        return;
      }
      this.vel.y += W.stroke; SFX.flap();
    }
    if (!locked && btn.b.pressed) { this.vel.y -= W.stroke; SFX.flap(); }
    if (btn.b.held) this.vel.y -= W.buoyancy * 1.4 * dt;      // 꾹 누르면 계속 잠수
    this.burstCD = Math.max(0, (this.burstCD || 0) - dt);
    if (!locked && btn.c && btn.c.pressed && this.burstCD <= 0) { // 순간 돌진: 확 빨라지지만 물 저항으로 금방 느려짐 (0.6초마다)
      this.burstCD = 0.6;
      const d = hasMove ? wish : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.vel.addScaledVector(d, W.burst * m); this.dashTime = 0.45; this.ball = true;
      SFX.dash(); this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 8, 4);
    }
    if (this.dashTime <= 0) this.ball = false;
    // 부력: 수면 아래면 위로, 수면 위면 아래로 (둥둥)
    if (this.pos.y < W.floatY) this.vel.y += W.buoyancy * dt;
    else this.vel.y -= P.gravity * 0.6 * dt;
    // 물 저항 (빠를수록 훨씬 크게)
    const v = this.vel.length();
    this.vel.multiplyScalar(Math.max(0, 1 - (W.drag + W.dragQuad * v) * dt));
    this.s = Math.hypot(this.vel.x, this.vel.z);
    const ox = this.pos.x, oz = this.pos.z, oldY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    if (world.collide(this.pos, P.radius, P.height, this.vel, oldY) && world.lastHitBox?.breakable) this.tryBreak(world.lastHitBox);
    const bed = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.9, true);
    if (this.pos.y < bed) {
      if (bed - oldY > 1.2) { this.pos.x = ox; this.pos.z = oz; } // 물 속 절벽
      else { this.pos.y = bed; this.vel.y = Math.max(0, this.vel.y); }
    }
    const bed2 = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.9, true);
    if (bed2 > -W.swimAt && this.pos.y <= bed2 + 0.35) { this.land(bed2, world.lastSurface); return; } // 얕은 곳: 다시 걷기
    if (this.pos.y > 0.4) { this.state = 'air'; this.inWater = false; }
    if (Math.random() < (this.pos.y < W.floatY - 0.5 ? 0.12 : 0.03) + Math.min(0.3, v * 0.01)) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xe8fbff, 1, 1.5);
  }

  // ---------------- 공중 ----------------
  updateAir(dt, wish, hasMove) {
    const P = CFG.player, S = CFG.super;
    if (this.slamming) {
      this.vel.y = -P.slamSpeed;
    } else if (this.superFlight) {
      this.vel.y = Math.max(this.vel.y > 0 ? -99 : S.floatMinFall, this.vel.y - P.gravity * (this.vel.y > 0 ? 1 : S.floatGravity) * dt);
      if (hasMove) {
        const hs = Math.hypot(this.vel.x, this.vel.z), tgt = Math.max(hs, this.maxSpeed() * 0.75);
        const k = Math.min(1, P.airControl * 4.5 * dt);
        this.vel.x += (wish.x * tgt - this.vel.x) * k; this.vel.z += (wish.z * tgt - this.vel.z) * k;
      }
      if (Math.random() < 0.6) this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffe680, 1, 2);
    } else {
      let grav = this.dashTime > 0 ? P.gravity * 0.25 : P.gravity;
      if (this.cannonT > 0) grav *= 0.35;
      const F = CFG.flyer;
      if (this.flying) {
        grav *= F.gravityMul;
        this.flyTime += dt;
        this.flapRecent = Math.max(0, (this.flapRecent || 0) - dt);
        if (this.flapRecent <= 0) this.flyGauge = Math.min(F.gaugeMax, this.flyGauge + F.regenPerSec * dt); // 가만히 내려오면 게이지가 다시 참
      }
      this.vel.y -= grav * dt;
      if (this.flying) this.vel.y = Math.max(this.vel.y, -F.fallSpeed); // 서서히 내려옴
      if (this.gliding) this.vel.y = Math.max(this.vel.y, -(this.superOn ? CFG.power.superGlideFall : CFG.power.glideFall)); // 슈퍼 활강은 빠른 대신 조금 빨리 내려옴
      const superGlide = this.gliding && this.superOn;
      const tgtBase = superGlide ? CFG.power.superGlideSpeed : this.gliding ? CFG.power.glideSpeed * this.mul() : this.flying ? this.cap(2) : this.maxSpeed() * 0.75;
      if (superGlide) this.superGlideTick(dt);
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
    const v0x = this.vel.x, v0z = this.vel.z;
    if (world.collide(this.pos, P.radius, P.height, this.vel, oldY)) {
      if (world.lastHitBox?.breakable) this.tryBreak(world.lastHitBox);
      if (world.lastHitTree && this.smashTree(world.lastHitTree)) { this.vel.x = v0x; this.vel.z = v0z; }
    }
    if (this.loopContact(ox, oz)) return;
    let g = world.groundAt(this.pos.x, this.pos.z, Math.max(oldY, this.pos.y), 0.9, true);
    let surf = world.lastSurface;
    if ((surf === 'water' || surf === 'shallow') && hs >= CFG.water.runSpeed && oldY >= -0.2 && !this.slamming) { g = Math.max(g, 0); surf = 'waterRun'; }
    else if (surf === 'water' && g < -CFG.water.swimAt && this.pos.y < CFG.water.floatY + 0.4 && this.vel.y <= 0) {
      this.vel.multiplyScalar(this.slamming ? 0.2 : 0.45); this.enterSwim(); return;
    }
    // 절벽 옆면에 부딪힘
    if (g - this.pos.y > 1.0 && g - oldY > 1.0) {
      this.pos.x = ox; this.pos.z = oz; this.vel.x *= -0.1; this.vel.z *= -0.1;
      g = world.groundAt(ox, oz, oldY, 0.9, true); surf = world.lastSurface;
    }
    this._plat = world.lastPlatform;
    if (this.pos.y <= g && this.vel.y <= 0) this.land(g, surf);
  }

  land(g, surf) {
    if (surf === 'cloud') { this.cloudBounce(g); return; }
    this.cloudChain = false;
    this.pos.y = g;
    this.springChain = false; this.springLevel = 0; this.cannonT = 0;
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
    this.cannonCD = Math.max(0, (this.cannonCD || 0) - dt);
    if (this.state === 'air' && this.cannonCD <= 0) for (const c of world.cannons) {
      const m = c.mouth().add(new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(2.5));
      if (m.distanceTo(this.pos.clone().setY(this.pos.y + 0.8)) < 2.6) { this.enterCannon(c); return; }
    }
    this.leafFx(dt);
    for (const sp of world.springs) {
      const dx = this.pos.x - sp.pos.x, dz = this.pos.z - sp.pos.z;
      if (dx * dx + dz * dz < 1.5 * 1.5 && this.pos.y > sp.pos.y - 0.3 && this.pos.y < sp.top + 1.0 && this.vel.y <= 0.5 && this.state !== 'loop') {
        const chain = this.state === 'air' && this.springChain;
        this.springLevel = chain ? Math.min(3, this.springLevel + 1) : 1;
        this.springChain = true;
        this.state = 'air'; this.standOn = null;
        this.pos.y = sp.top;
        this.vel.y = sp.power * [1, 1.45, 1.9][this.springLevel - 1] * (this.superOn ? 1.2 : 1);
        if (this.springLevel > 1) this.game.fx.shockwave(sp.pos.clone().setY(sp.top), 2 + this.springLevel, 0xffe14d);
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
    for (const e of this.game.enemies.inRadius(this.pos, 8)) {
      const esz = e.T.size || 1;
      const ec = e.pos.clone().add(new THREE.Vector3(0, e.flying ? 0 : 0.6 * esz, 0));
      const dh = Math.hypot(ec.x - center.x, ec.z - center.z), dy = Math.abs(ec.y - center.y);
      if (dh > e.radius + 0.7 || dy > 1.6 + (esz - 1) * 0.9) continue;
      if (e.flyT > 0) continue;
      const stomp = this.state === 'air' && this.vel.y < -2 && center.y > ec.y + 0.4;
      if (this.attacking || stomp) {
        const ballHit = this.ball && !this.slamming && this.state !== 'charge';
        // 공처럼 굴러서 맞히면 몬스터는 뒤로 밀려남 (안 죽었을 때)
        const killed = this.game.enemies.hit(e, stomp && !this.attacking ? 2 : this.attackDamage(), this.pos, ballHit ? 11 : 12, ballHit);
        if (killed) this.onKill();
        if (this.state === 'air' && !this.slamming && !this.superFlight && !this.gliding && (ballHit || center.y > ec.y - 0.2)) {
          this.enemyBounce(); // 회전하며 맞히면 그 방향 그대로 위로 튕김 (타이밍 맞춰 점프하면 훨씬 높이)
        } else if (ballHit && this.state === 'ground') { // 땅에서 굴러서 맞혀도 톡 튕겨 오름
          this.vel.set(Math.sin(this.yaw) * this.s * 0.6, CFG.player.rollBounce, Math.cos(this.yaw) * this.s * 0.6);
          this.state = 'air'; this.standOn = null; this.ball = true; this.rolling = false; this.airActionUsed = false; this.bounceWindow = 0.2;
        } else if (this.state === 'charge') { // 스핀 충전 중: 몬스터만 맞고 뒤로 날아감, 나는 제자리에서 계속 회전
          if (!killed && e.alive && e.dying <= 0 && !e.T.static) { const d = ec.clone().sub(center).setY(0).normalize().multiplyScalar(14); e.flyV = d; e.flyV.y = 10; e.flyT = 2.5; e.stunT = 0.6; }
        } else if (!killed && !this.superOn && e.alive && e.dying <= 0 && !e.shielded) { // 단단한 몬스터: 튕겨남
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

  // 몬스터를 밟고 튕기기 (2D 소닉처럼): 그냥 맞히면 살짝, 맞히는 순간 점프를 누르면 높이!
  enemyBounce() {
    const P = CFG.player;
    const big = this.bounceBuffer > 0;
    this.vel.y = big ? P.bigBounce : P.bounceVel;
    this.bounceBuffer = 0; this.bounceWindow = big ? 0 : 0.2;
    this.ball = true; this.airActionUsed = false; this.dashTime = 0; this.holdValid = false;
    if (big) this.bigBounceFx();
  }
  bigBounceFx() {
    SFX.spring();
    this.game.fx.shockwave(this.pos, 3.5, 0xffe14d);
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffe14d, 12, 6);
  }
  // 지금 공격의 세기
  attackDamage() {
    const sp = this.state === 'air' ? Math.hypot(this.vel.x, this.vel.z) : Math.abs(this.s);
    let d = 1;
    if (this.slamming) d = 3;
    else if (this.superFlight) d = 5;
    else if (this.punchT > 0) d = 4;
    else if (this.dashTime > 0) d = 2 + sp / 20;
    else if (this.gliding) d = 2;
    else if (this.ball) d = 1 + sp / 10;      // 구르기: 빠를수록 세게 (초속 32 = 4, 50 = 6)
    if (this.superOn) d *= 2;
    return Math.round(d);
  }
  enemyBelow() {
    for (const e of this.game.enemies.inRadius(this.pos, 4)) {
      const dy = this.pos.y - e.pos.y;
      if (dy > -0.5 && dy < 4.5 && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 1.6) return true;
    }
    return false;
  }
  canSmash() { return this.superOn || this.kind === 'power'; }
  // 나무·바위 부수기 (파워형은 언제나, 나머지는 슈퍼일 때)
  smashTree(t) {
    if (!t.ref || t.dead || !this.canSmash()) return false;
    const sp = this.state === 'air' ? Math.hypot(this.vel.x, this.vel.z) : this.s;
    if (!this.superOn && !(this.attacking || sp > this.cap(1) * 0.6)) return false;
    const W = this.game.world;
    if (!W.breakTree(t)) return false;
    if (this.game.net?.shared) this.game.net.sendGame({ t: 'tb', k: t.ref.type, i: t.ref.idx }); // 친구 화면에서도 부서짐
    const set = t.ref.set, top = new THREE.Vector3(t.x, t.y + (t.ref.kind === 'rock' ? 0.8 : 3), t.z);
    if (t.ref.kind === 'rock') { this.game.fx.burst(top, 0x8f8b80, 22, 9); this.game.fx.burst(top, 0x6d6a62, 12, 6); }
    else { this.game.fx.burst(top, 0x8b5a2b, 14, 8); this.game.fx.leaves(top.clone().setY(t.y + 4), set.leaf, 26); }
    SFX.wallBreak();
    this.shake = Math.max(this.shake, 0.15);
    this.stats.smash = (this.stats.smash || 0) + 1;
    if (Math.random() < CFG.items.ringBagChance) this.game.pickups.spawnRingBag(top.clone().setY(t.y + 1.5));
    return true;
  }
  // 근처 나무·바위 한꺼번에 (내려찍기·펀치)
  smashAround(c, r) {
    if (!this.canSmash()) return;
    for (const t of this.game.world.treesInRadius(c, r)) this.smashTree(t);
  }
  // 빠르게 지나가면 나뭇잎이 떨어짐
  leafFx(dt) {
    const sp = this.state === 'air' ? Math.hypot(this.vel.x, this.vel.z) : this.s;
    if (sp < 16) return;
    for (const t of this.game.world.treesInRadius(this.pos, 3.8)) {
      if (t.dead || t.ref?.kind !== 'tree' || (t.leafT || 0) > this.game.time) continue;
      t.leafT = this.game.time + 2;
      this.game.fx.leaves(new THREE.Vector3(t.x, t.y + 4.5 * (t.ref.set.data[t.ref.idx]?.s || 1), t.z), t.ref.set.leaf, 8);
    }
  }

  // ---------------- 대포 (하늘 섬) ----------------
  enterCannon(c) {
    this.cannon = c; this.state = 'cannon'; this.hidden = true; this.vel.set(0, 0, 0); this.s = 0;
    this.ball = true; this.slamming = false; this.cancelAbilities(); this.hidden = true;
    SFX.store();
    this.game.hud.toast('🎯 방향키로 조준하고 A·B·C 버튼으로 발사!', 'gold');
  }
  updateCannon(dt, input) {
    const c = this.cannon, mv = input.move;
    c.yaw -= mv.x * 1.4 * dt;
    c.pitch = Math.max(0.1, Math.min(1.25, c.pitch + mv.y * 0.9 * dt));
    c.group.rotation.y = c.yaw; c.pivot.rotation.x = -c.pitch;
    this.pos.copy(c.mouth());
    this.yaw = c.yaw;
    const B = input.buttons;
    if (B.a.pressed || B.b.pressed || (B.c && B.c.pressed)) {
      const dir = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      this.pos.addScaledVector(dir, 3.6);
      this.vel.copy(dir).multiplyScalar(CFG.cannon.speed * (this.superOn ? 1.3 : 1));
      this.state = 'air'; this.hidden = false; this.ball = true; this.dashTime = 0.6; this.cannonT = CFG.cannon.flightTime;
      this.airActionUsed = false; this.cannon = null; this.cannonCD = 1.5;
      SFX.explosion(); SFX.boost();
      this.game.fx.burst(this.pos.clone(), 0xffffff, 16, 10);
      this.shake = 0.3;
    }
  }

  tryBreak(w) {
    if (w.dead) return;
    const ok = this.superOn || (this.kind === 'power' && (this.attacking || this.s > this.cap(1) * 0.8));
    if (ok) this.breakWall(w);
    else if (!w.house && !this._wallHint) { this._wallHint = true; this.game.hud.toast('금 간 벽! 파워형이나 슈퍼 상태면 부술 수 있어요'); setTimeout(() => (this._wallHint = false), 6000); }
  }
  breakWall(w, remote = false) {
    if (w.dead) return;
    if (!remote && this.game.net?.shared) this.game.net.sendGame({ t: 'wb', i: this.game.world.walls.indexOf(w) });
    w.dead = true; w.mesh.visible = false;
    const c = w.min.clone().add(w.max).multiplyScalar(0.5);
    if (w.house) { // 나무집: 나뭇조각이 우수수, 가끔 링 주머니
      this.game.fx.burst(c, 0xb07a48, 34, 11); this.game.fx.burst(c, 0x7a4a26, 22, 8); this.game.fx.burst(c.clone().setY(w.max.y), w.roofColor || 0xc0452c, 16, 9);
      w.respawn = 150;
      if (Math.random() < 0.3) this.game.pickups.spawnRingBag(c.clone().setY(w.min.y + 1.5));
      this.stats.smash = (this.stats.smash || 0) + 1;
    } else {
      this.game.fx.burst(c, 0x9a8f7a, 30, 10);
      this.game.fx.burst(c, 0x5a5246, 20, 7);
      this.stats.walls++;
    }
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
    if (this.rings > 0) { const lost = Math.min(this.rings, P.ringLoss); this.game.rings.scatter(this.pos, lost); this.rings -= lost; SFX.ringLoss(); }
    SFX.hurt();
    this.stats.streak = 0;
    this.invuln = P.hurtInvuln;
    if (this.state === 'charge') { // 스핀 충전 중: 밀려나기만 하고 스핀은 계속
      const away = this.pos.clone().sub(fromPos).setY(0); if (away.lengthSq() < 0.01) away.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.shake = 0.25; this.hurtT = 0.3; // 제자리에서 계속 회전
      if (this.health <= 0) this.die();
      return;
    }
    if (this.state === 'loop') this.loop = null;
    const wasSwim = this.state === 'swim';
    const away = this.pos.clone().sub(fromPos).setY(0);
    if (away.lengthSq() < 0.01) away.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    away.normalize().multiplyScalar(P.hurtKnockback);
    this.vel.set(away.x, P.hurtLift, away.z);
    this.state = 'air'; this.standOn = null;
    if (wasSwim) this.vel.multiplyScalar(0.4);
    this.ball = this.rolling = this.slamming = false;
    this.cancelAbilities();
    this.airActionUsed = true; this.holdValid = false;
    this.s = 0; this.gear = 1;
    this.controlLock = 0.7; this.hurtT = 0.7;
    this.shake = 0.25;
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 10, 6);
    if (this.health <= 0) this.die();
  }

  // 하늘 도시: 구멍 아래 구름은 푹신해서 스프링처럼 튀어 오름 (연달아 3번 밟으면 땅 위까지 높이!)
  cloudBounce(g) {
    const S = CFG.sky;
    this.pos.y = g;
    this.cloudLevel = this.cloudChain ? Math.min(3, (this.cloudLevel || 1) + 1) : 1;
    this.cloudChain = true;
    this.state = 'air'; this.standOn = null;
    this.vel.y = S.bounce[this.cloudLevel - 1] * (this.superOn ? 1.15 : 1);
    this.vel.x *= 0.8; this.vel.z *= 0.8;
    this.ball = this.rolling = false;
    if (this.slamming) { this.slamming = false; this.vel.y *= 1.1; }
    this.cancelAbilities();
    this.airActionUsed = false; this.holdValid = false; this.springChain = false;
    this.flyGauge = CFG.flyer.gaugeMax;
    const fx = this.game.fx, at = this.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
    fx.burst(at, 0xffffff, 10 + this.cloudLevel * 6, 6 + this.cloudLevel * 2);
    if (this.cloudLevel > 1) fx.shockwave(this.pos.clone(), 2 + this.cloudLevel * 2, 0xdff4ff);
    if (this.cloudLevel === 3) this.game.hud.toast('☁️ 슝~! 구름이 높이 튕겨 줬어요!');
    SFX.spring();
  }
  // 용암에 빠지거나 하늘 끝에서 떨어짐: 링 30%를 잃고 체크포인트에서 다시 시작
  hazardDeath(kind) {
    if (this.state === 'dead' || this.voidFalling) return;
    const keep = Math.floor(this.rings * (kind === 'lava' ? CFG.lava.ringKeep : CFG.sky.ringKeep)), lost = this.rings - keep;
    if (kind === 'lava') {
      this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff6a20, 26, 10);
      this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x3a3230, 12, 7);
      this.game.hud.toast(`🔥 앗 뜨거! 용암에 빠졌어요${lost ? ` (링 -${lost})` : ''}`);
      this.die(keep);
    } else if (this.game.onVoidFall) { this.voidFalling = true; this.game.onVoidFall(keep, lost); }
    else this.die(keep);
  }

  die(keepRings = 0) {
    if (this.state === 'dead') return;
    this.keepRings = keepRings;
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
    this.rings = this.keepRings || 0; this.keepRings = 0;
    this.voidFalling = false; this.cloudChain = false;
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

  untransform() {
    if (!this.superOn) return;
    this.superOn = false; this.superFlight = false;
    if (this.game.allClear) this.superCD = CFG.super.freeCooldown;
    this.s = Math.min(this.s, this.cap(3)); this.gear = this.gearFor(this.s);
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff, 14, 6);
    this.game.hud.toast(`${NAMES.superForm} 변신이 풀렸어요`);
  }
  transform() {
    this.superOn = true;
    this.superDrain = 0; this.superTime = 0;
    this.vel.y = Math.max(this.vel.y, 4);
    this.s *= CFG.super.speedMul; this.gear = this.gearFor(this.s);
    SFX.transform();
    this.game.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffd700, 30, 10);
    this.game.fx.shockwave(this.pos, 8, 0xffd700);
    this.game.hud.toast(`✨ ${NAMES.superForm} 변신! ✨`, 'gold');
  }

  pose() {
    if (this.ult || this.state === 'cannon') return 'cast';
    if (this.punchT > 0) return 'punch';
    if (this.grounded) return 'run';
    if (this.state === 'swim') return this.dashTime > 0 ? 'air' : 'glide';
    if (this.superFlight) return 'air';
    if (this.gliding) return 'glide';
    if (this.flying) return 'fly';
    return 'air';
  }

  updateView(dt) {
    const v = this.view;
    v.root.position.copy(this.pos);
    // 땅 위를 걸을 때: 화면의 땅 모양에 맞춰 살짝 올려서 다리가 보이게 (언덕에서 묻혀 보이던 문제)
    const onTerrain = (this.state === 'ground' || this.state === 'charge') && (this._surf === 'terrain' || this._surf === 'shallow' || this._surf == null) && !this.standOn;
    this.vLift = (this.vLift || 0) + ((onTerrain ? this.game.world.visualLift(this.pos.x, this.pos.z) : 0) - (this.vLift || 0)) * Math.min(1, dt * 12);
    v.root.position.y += this.vLift;
    if (this.state === 'loop' && this.loop) {
      const L = this.loop;
      const fwd = L.tangentAt(this.loopT).multiplyScalar(this.loopVt).addScaledVector(L.side, this.loopVu);
      if (fwd.lengthSq() < 0.01) fwd.copy(L.tangentAt(this.loopT)); else fwd.normalize();
      const up = L.centerAt(this.loopT).sub(L.pathAt(this.loopT)).normalize();
      fwd.addScaledVector(up, -fwd.dot(up)).normalize();
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
      blink: this.invuln > 0 && !this.superOn, time: this.game.time, flash: this.flashV * 0.6, hidden: this.hidden || !!this.firstPerson,
    });
    // 실루엣 따라가기
    const S = this.sil;
    for (let i = 0; i < S.src.length; i++) { const a = S.src[i], b = S.dst[i]; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible; }
    S.root.visible = v.root.visible && this.alive && !this.hidden && !this.firstPerson;
    const g = this.game.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
    const h = this.pos.y - g;
    this.shadow.visible = this.alive && this.state !== 'loop' && this.state !== 'swim' && h > 0.5;
    this.shadow.position.set(this.pos.x, g + 0.06, this.pos.z);
    const k = Math.max(0.3, 1 - h / 15);
    this.shadow.scale.setScalar(k);
    this.shadow.material.opacity = 0.3 * k;
  }

  dispose() { this.game.scene.remove(this.view.root, this.shadow, this.sil.root); }
}
