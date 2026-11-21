// 효과: 폭발 파편, 충격파
import * as THREE from '../vendor/three.module.js';

export class Effects {
  constructor(scene, game) {
    this.scene = scene; this.game = game;
    this.specials = [];
    const N = 260;
    this.parts = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    for (let i = 0; i < N; i++) this.parts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1 });
    scene.add(this.mesh);
    this.waves = [];
    // 떨어지는 나뭇잎
    const LN = 220;
    this.leafParts = [];
    this.leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.22), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), LN);
    this.leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LN * 3), 3);
    this.leafMesh.frustumCulled = false;
    for (let i = 0; i < LN; i++) this.leafParts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: 0, life: 0 });
    scene.add(this.leafMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  burst(pos, color = 0xffaa00, n = 14, speed = 8) {
    let k = 0;
    this._c.set(color);
    for (let i = 0; i < this.parts.length && k < n; i++) {
      const p = this.parts[i];
      if (p.alive) continue;
      p.alive = true; p.life = p.max = 0.5 + Math.random() * 0.4;
      p.pos.copy(pos);
      p.vel.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.mesh.setColorAt(i, this._c);
      k++;
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  shockwave(pos, radius, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.rotation.x = Math.PI / 2;
    m.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    this.scene.add(m);
    this.waves.push({ m, t: 0, dur: 0.35, radius });
  }

  leaves(pos, color = 0x5cc444, n = 10) {
    let k = 0; const c = new THREE.Color();
    for (let i = 0; i < this.leafParts.length && k < n; i++) {
      const p = this.leafParts[i]; if (p.alive) continue;
      p.alive = true; p.life = 3 + Math.random() * 2.5; p.phase = Math.random() * 6;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4));
      p.vel.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); p.spin = 2 + Math.random() * 4;
      this.leafMesh.setColorAt(i, c.set(color).multiplyScalar(0.8 + Math.random() * 0.4));
      k++;
    }
    this.leafMesh.instanceColor.needsUpdate = true;
  }
  // 비행형 슈퍼: 회오리
  tornado(pos, dir, speed, owner) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.3, 4.5, 12, 1, true), mat); m.rotation.x = Math.PI; m.position.y = 2.2 + i * 0.2; m.scale.setScalar(1 - i * 0.15); g.add(m); }
    g.position.copy(pos);
    this.scene.add(g);
    this.specials.push({ kind: 'tornado', g, dir: dir.clone().setY(0).normalize(), speed, life: 1.3, owner, hit: new Set() });
  }
  // 순간이동형 슈퍼: 블랙홀
  blackhole(center, life = 1.4, size = 12, lift = 4) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x050010 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xa060ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0x6a2cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.rotation.x = 1.2;
    g.add(core, ring, halo);
    g.position.copy(center); g.position.y += lift;
    this.scene.add(g);
    const sp = { kind: 'hole', g, ring, life, max: life, size };
    this.specials.push(sp);
    return sp;
  }
  // 크리스탈 씨앗이 빛줄기로 날아와 캐릭터에게 들어감
  seedBeam(from, target, onArrive) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xaaffb0, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.add(halo); m.position.copy(from);
    this.scene.add(m);
    this.specials.push({ kind: 'seed', g: m, from: from.clone(), target, life: 1.6, max: 1.6, onArrive });
  }
  // 슈퍼 내려찍기: 넓게 퍼지는 불꽃 고리 + 사방으로 튀는 번개
  superSlam(pos, R) {
    const g0 = pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    this.shockwave(g0, R, 0xffd23a);
    this.shockwave(g0, R * 0.7, 0xff6a1a);
    this.shockwave(g0, R * 1.08, 0x8fe8ff);
    for (let i = 0; i < 4; i++) this.burst(g0, [0xff5a10, 0xffb020, 0xffe680, 0xff3010][i], 22, 14 + i * 4);
    // 땅을 따라 퍼지는 불꽃 기둥
    const fire = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const grp = new THREE.Group(); grp.position.copy(g0);
    const cone = new THREE.ConeGeometry(0.9, 4, 7);
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2, m = new THREE.Mesh(cone, fire);
      m.userData.a = a; m.userData.k = 0.5 + Math.random() * 0.5;
      grp.add(m);
    }
    this.scene.add(grp);
    this.specials.push({ kind: 'fireRing', g: grp, mat: fire, cone, life: 0.9, max: 0.9, R });
    // 번개
    const bolt = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bg = new THREE.Group(); bg.position.copy(g0);
    this.scene.add(bg);
    this.specials.push({ kind: 'bolts', g: bg, mat: bolt, life: 0.7, max: 0.7, R, t: 0 });
    // 가운데 번쩍
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(g0); this.scene.add(m);
    this.specials.push({ kind: 'boom', g: m, life: 0.5, max: 0.5, size: R / 9 });
  }
  _makeBolts(s) {
    for (const c of s.g.children) c.geometry.dispose();
    s.g.clear();
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, r = s.R * (0.4 + Math.random() * 0.6), pts = [];
      const N = 9;
      for (let k = 0; k <= N; k++) {
        const t = k / N, j = (k === 0 || k === N) ? 0 : 1;
        pts.push(new THREE.Vector3(Math.cos(a) * r * t + (Math.random() - 0.5) * 2.5 * j, (1 - t) * 6 + Math.random() * 1.5 * j + 0.3, Math.sin(a) * r * t + (Math.random() - 0.5) * 2.5 * j));
      }
      s.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), s.mat));
    }
  }

  // 파워형 슈퍼 펀치: 앞으로 넓게 퍼지는 부채꼴 충격파
  coneBlast(o, dir, len, half) {
    const yaw = Math.atan2(dir.x, dir.z);
    const mk = (color, op) => {
      const geo = new THREE.CircleGeometry(1, 24, Math.PI / 2 - half, half * 2);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.copy(o).setY(o.y - 0.6); m.rotation.y = yaw + Math.PI; this.scene.add(m);
      return m;
    };
    const a = mk(0xffd040, 0.75), b = mk(0xff5a20, 0.6);
    b.position.y += 0.3;
    this.specials.push({ kind: 'cone', g: a, g2: b, life: 0.6, max: 0.6, len });
    for (let d = 6; d <= len; d += 7) {
      const spread = Math.tan(half) * d * 0.8;
      for (let k = 0; k < 2; k++) {
        const side = (Math.random() - 0.5) * 2 * spread, p = o.clone().addScaledVector(dir, d).add(new THREE.Vector3(dir.z * side, 0, -dir.x * side));
        this.burst(p, [0xffd040, 0xff7a20, 0xffffff][k % 3], 4, 9);
      }
      if (d % 21 === 6) this.shockwave(o.clone().addScaledVector(dir, d).setY(o.y - 0.7), 6 + d * 0.12, 0xffc040);
    }
    this.explosion(o.clone().addScaledVector(dir, 4), 1.2);
  }

  // 큰 폭발 (보스)
  explosion(pos, size = 1) {
    this.burst(pos, 0xffa020, 20, 12 * size);
    this.burst(pos, 0x555555, 12, 8 * size);
    this.shockwave(pos, 8 * size, 0xffc060);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(pos); this.scene.add(m);
    this.specials.push({ kind: 'boom', g: m, life: 0.5, max: 0.5, size });
  }

  update(dt) {
    {
      const m = this._m, q = this._q, s = this._s;
      for (let i = 0; i < this.leafParts.length; i++) {
        const p = this.leafParts[i]; let sc = 0;
        if (p.alive) {
          p.life -= dt; if (p.life <= 0) p.alive = false;
          p.vel.y = Math.max(p.vel.y - 6 * dt, -1.6);           // 천천히 하늘하늘
          p.phase += dt * 3;
          p.pos.x += (p.vel.x + Math.sin(p.phase) * 1.2) * dt; p.pos.z += (p.vel.z + Math.cos(p.phase * 0.8) * 1.0) * dt; p.pos.y += p.vel.y * dt;
          p.rot.x += p.spin * dt; p.rot.z += p.spin * 0.7 * dt;
          sc = p.alive ? Math.min(1, p.life) : 0;
        }
        m.compose(p.pos, q.setFromEuler(p.rot), s.set(sc, sc, sc));
        this.leafMesh.setMatrixAt(i, m);
      }
      this.leafMesh.instanceMatrix.needsUpdate = true;
      q.identity();
    }
    for (let i = this.specials.length - 1; i >= 0; i--) {
      const s = this.specials[i];
      s.life -= dt;
      if (s.kind === 'tornado') {
        s.g.position.addScaledVector(s.dir, s.speed * dt);
        const w = this.game.world;
        s.g.position.y = Math.max(w.groundAt(s.g.position.x, s.g.position.z, s.g.position.y + 2), s.g.position.y - 10 * dt);
        s.g.rotation.y += dt * 25;
        for (const e of this.game.enemies.inRadius(s.g.position, 3.8)) if (!s.hit.has(e)) { s.hit.add(e); if (this.game.enemies.hit(e, 3, s.g.position, 22)) s.owner.onKill(); }
        if (!s.hitBoss && this.game.boss?.tryHit(s.owner, s.g.position, 4.5, 1)) s.hitBoss = true;
        if (Math.random() < 0.5) this.burst(s.g.position.clone(), 0xffffff, 1, 4);
      } else if (s.kind === 'hole') {
        const k = 1 - s.life / s.max;
        const S = s.size || 12, grow = Math.min(1, (s.max - s.life) / 0.4), sc = s.closing ? Math.max(0.01, s.life / 0.3) * S : grow * S * (1 + Math.sin(s.life * 12) * 0.04);
        if (Math.random() < 0.7) { const a = Math.random() * 6.28, r = S * 2.2; this.burst(s.g.position.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * S, Math.sin(a) * r)), 0x9a5cff, 1, 2); }
        s.g.scale.setScalar(Math.max(0.01, sc));
        s.ring.rotation.z += dt * 8;
      } else if (s.kind === 'seed') {
        const k = 1 - s.life / s.max, to = s.target().clone().add(new THREE.Vector3(0, 1, 0));
        const e = k * k * (3 - 2 * k);
        s.g.position.lerpVectors(s.from, to, e); s.g.position.y += Math.sin(k * Math.PI) * Math.min(60, s.from.distanceTo(to) * 0.25);
        s.g.rotation.y += dt * 8;
        if (Math.random() < 0.8) this.burst(s.g.position.clone(), 0x9dff9a, 1, 2);
        if (s.life <= 0) { this.burst(to, 0x9dff9a, 24, 7); this.shockwave(to.clone().setY(to.y - 1), 4, 0x9dff9a); s.onArrive?.(); }
      } else if (s.kind === 'fireRing') {
        const k = 1 - s.life / s.max;
        for (const m of s.g.children) {
          const r = s.R * Math.min(1, k * 1.6) * m.userData.k;
          m.position.set(Math.cos(m.userData.a) * r, 1.5 * (1 - k), Math.sin(m.userData.a) * r);
          m.scale.set(1.4 - k, (1 - k) * (1.5 + Math.sin(k * 30 + m.userData.a * 5) * 0.4), 1.4 - k);
        }
        s.mat.opacity = 0.85 * (1 - k);
        if (s.life <= 0) { s.cone.dispose(); s.mat.dispose(); }
      } else if (s.kind === 'bolts') {
        s.t -= dt;
        if (s.t <= 0) { s.t = 0.07; this._makeBolts(s); }
        s.mat.opacity = Math.min(1, s.life / s.max * 1.6) * (0.6 + Math.random() * 0.4);
        if (s.life <= 0) { for (const c of s.g.children) c.geometry.dispose(); s.mat.dispose(); }
      } else if (s.kind === 'cone') {
        const k = 1 - s.life / s.max, r = s.len * Math.min(1, k * 2.2);
        s.g.scale.set(r, 1, r); s.g2.scale.set(r * 0.85, 1, r * 0.85);
        s.g.material.opacity = 0.75 * (1 - k); s.g2.material.opacity = 0.6 * (1 - k);
        if (s.life <= 0) { this.scene.remove(s.g2); s.g.geometry.dispose(); s.g2.geometry.dispose(); s.g.material.dispose(); s.g2.material.dispose(); }
      } else if (s.kind === 'boom') {
        const k = 1 - s.life / s.max;
        s.g.scale.setScalar((1 + k * 6) * s.size);
        s.g.material.opacity = 0.9 * (1 - k);
      }
      if (s.life <= 0) { this.scene.remove(s.g); this.specials.splice(i, 1); }
    }
    const m = this._m, q = this._q, s = this._s;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      let sc = 0;
      if (p.alive) {
        p.life -= dt;
        p.vel.y -= 20 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.life <= 0) p.alive = false; else sc = p.life / p.max;
      }
      m.compose(p.pos, q, s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const k = w.t / w.dur;
      w.m.scale.setScalar(0.5 + k * w.radius);
      w.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); this.waves.splice(i, 1); }
    }
  }
}
