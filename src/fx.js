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
  blackhole(center) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x050010 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color: 0xa060ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0x6a2cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.rotation.x = 1.2;
    g.add(core, ring, halo);
    g.position.copy(center); g.position.y += 4;
    this.scene.add(g);
    this.specials.push({ kind: 'hole', g, ring, life: 1.4, max: 1.4 });
  }
  // 크리스탈 씨앗이 빛줄기로 날아와 캐릭터에게 들어감
  seedBeam(from, target, onArrive) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xaaffb0, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.add(halo); m.position.copy(from);
    this.scene.add(m);
    this.specials.push({ kind: 'seed', g: m, from: from.clone(), target, life: 1.6, max: 1.6, onArrive });
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
        const sc = k < 0.3 ? k / 0.3 * 12 : k < 0.75 ? 12 : (1 - k) / 0.25 * 12;
        s.g.scale.setScalar(Math.max(0.01, sc));
        s.ring.rotation.z += dt * 8;
      } else if (s.kind === 'seed') {
        const k = 1 - s.life / s.max, to = s.target().clone().add(new THREE.Vector3(0, 1, 0));
        const e = k * k * (3 - 2 * k);
        s.g.position.lerpVectors(s.from, to, e); s.g.position.y += Math.sin(k * Math.PI) * Math.min(60, s.from.distanceTo(to) * 0.25);
        s.g.rotation.y += dt * 8;
        if (Math.random() < 0.8) this.burst(s.g.position.clone(), 0x9dff9a, 1, 2);
        if (s.life <= 0) { this.burst(to, 0x9dff9a, 24, 7); this.shockwave(to.clone().setY(to.y - 1), 4, 0x9dff9a); s.onArrive?.(); }
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
