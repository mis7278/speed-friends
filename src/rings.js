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
    this.mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    this.mesh.frustumCulled = false;
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
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.active[i]) { this.timer[i] -= dt; if (this.timer[i] <= 0) this.active[i] = true; }
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
            this.active[i] = false; this.timer[i] = CFG.rings.respawn;
            pl.collectRing(1);
          }
        }
      }
    }
    for (let i = 0; i < this.spots.length; i++) {
      const sc = this.active[i] ? 1 : 0;
      m.compose(this.spots[i], q, s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, m);
    }
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
