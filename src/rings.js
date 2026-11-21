// 링 (모으는 아이템) + 맞았을 때 흩어지는 링
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';

function starGeometry() {
  const s = new THREE.Shape();
  const N = 5, ro = 0.6, ri = 0.28;
  for (let i = 0; i < N * 2; i++) {
    const r = i % 2 ? ri : ro, a = i / (N * 2) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1 });
  g.center();
  return g;
}

export class Rings {
  constructor(scene, world, spots) {
    this.world = world;
    this.spots = spots;
    const geo = starGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0x7a5200 });
    // 가까운 링만 그림 (맵 전체에 링이 아주 많아도 가벼움)
    this.cap = Math.min(spots.length, 4000);
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.cap));
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.near = []; this.nearAt = new THREE.Vector2(1e9, 1e9); this.nearT = 0;
    this.nearR = (matchMedia('(pointer: coarse)').matches ? 170 : 240);
    this.off = [];   // 먹어서 꺼진 링 (다시 생길 때까지)
    this.active = new Array(spots.length).fill(true);
    this.timer = new Float32Array(spots.length);
    this.grid = new Map();
    spots.forEach((p, i) => {
      const k = Math.floor(p.x / 10) + ',' + Math.floor(p.z / 10);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
    scene.add(this.mesh);
    // 흩어진 링
    const S = CFG.rings.scatterMax;
    this.scatterMesh = new THREE.InstancedMesh(geo, mat, S);
    this.scatterMesh.frustumCulled = false;
    this.scattered = [];
    for (let i = 0; i < S; i++) this.scattered.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
    scene.add(this.scatterMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  // 친구가 먹은 링
  takeRemote(i) {
    if (!this.active[i]) return;
    this.active[i] = false; this.timer[i] = CFG.rings.respawn / (this.players || 1); this.off.push(i);
  }
  // count개를 pos 주변에 흩뿌림
  scatter(pos, count) {
    const n = Math.min(count, this.scattered.length);
    let made = 0;
    for (const r of this.scattered) {
      if (made >= n) break;
      if (r.alive) continue;
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 6;
      r.alive = true; r.life = CFG.rings.scatterLife; r.age = 0;
      r.pos.copy(pos).add(new THREE.Vector3(0, 1, 0));
      r.vel.set(Math.cos(a) * sp, 9 + Math.random() * 6, Math.sin(a) * sp);
      made++;
    }
  }

  // players: [{pos, onRing(cb)}]
  update(dt, time, players) {
    const m = this._m, q = this._q, s = this._s;
    q.setFromEuler(this._e.set(0, time * 3, 0));
    const R2 = CFG.rings.pickupRadius ** 2;
    // 다시 생기기
    for (let k = this.off.length - 1; k >= 0; k--) {
      const i = this.off[k];
      this.timer[i] -= dt; if (this.timer[i] <= 0) { this.active[i] = true; this.off[k] = this.off[this.off.length - 1]; this.off.pop(); }
    }
    // 가까운 링 목록 다시 만들기 (조금 움직였을 때만)
    const focus = players[0]?.pos;
    this.nearT -= dt;
    if (focus && (this.nearT <= 0 && this.nearAt.distanceTo(new THREE.Vector2(focus.x, focus.z)) > 15)) {
      this.nearT = 0.25; this.nearAt.set(focus.x, focus.z);
      const R = this.nearR, gx = Math.floor(focus.x / 10), gz = Math.floor(focus.z / 10), n = Math.ceil(R / 10);
      this.near.length = 0;
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        if (a * a + b * b > n * n + 2) continue;
        const list = this.grid.get((gx + a) + ',' + (gz + b));
        if (list) for (const i of list) { if (this.near.length < this.cap) this.near.push(i); }
      }
    }
    // 줍기
    for (const pl of players) {
      if (!pl.canCollect()) continue;
      const c = pl.ringCheckPos;
      const gx = Math.floor(c.x / 10), gz = Math.floor(c.z / 10);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = this.grid.get((gx + a) + ',' + (gz + b));
        if (!list) continue;
        for (const i of list) {
          if (!this.active[i]) continue;
          if (this.spots[i].distanceToSquared(c) < R2) {
            this.active[i] = false; this.timer[i] = CFG.rings.respawn / (this.players || 1); this.off.push(i);
            pl.collectRing(1);
            this.net?.shared && this.net.sendGame({ t: 'rg', i });
          }
        }
      }
    }
    let k = 0;
    for (const i of this.near) {
      if (!this.active[i]) continue;
      m.compose(this.spots[i], q, s.set(1, 1, 1));
      this.mesh.setMatrixAt(k++, m);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;

    // 흩어진 링 움직이기
    for (let i = 0; i < this.scattered.length; i++) {
      const r = this.scattered[i];
      let sc = 0;
      if (r.alive) {
        r.age += dt; r.life -= dt;
        r.vel.y -= 25 * dt;
        r.pos.addScaledVector(r.vel, dt);
        const g = this.world.groundAt(r.pos.x, r.pos.z, r.pos.y) + 0.5;
        if (r.pos.y < g) { r.pos.y = g; r.vel.y = Math.abs(r.vel.y) * 0.6; r.vel.x *= 0.8; r.vel.z *= 0.8; }
        if (r.age > 0.6) {
          for (const pl of players) {
            if (pl.canCollect() && r.pos.distanceToSquared(pl.ringCheckPos) < R2 * 1.3) { r.alive = false; pl.collectRing(1); break; }
          }
        }
        if (r.life <= 0) r.alive = false;
        if (r.alive) sc = r.life < 2 ? (Math.floor(time * 12) % 2 ? 1 : 0.0) : 1;
      }
      m.compose(r.pos, q, s.set(sc, sc, sc));
      this.scatterMesh.setMatrixAt(i, m);
    }
    this.scatterMesh.instanceMatrix.needsUpdate = true;
  }
}
