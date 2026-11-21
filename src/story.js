// 스토리 등장인물: 닥터 기어의 간부 과학자 (임시 이름은 names.js 에서 바꾸기)
import * as THREE from '../vendor/three.module.js';
import { toon } from './character.js';

export class Scientist {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
    const sph = new THREE.SphereGeometry(1, 18, 14), cyl = new THREE.CylinderGeometry(1, 1, 1, 18), cone = new THREE.ConeGeometry(1, 1, 8);
    // 호버 포드
    add(sph, toon(0x6a4a9a), 0, 0, 0, 1.8, 0.6, 1.8);
    add(cyl, toon(0xffc233), 0, 0, 0, 1.85, 0.15, 1.85);
    add(cyl, toon(0x3a4048), 0, -0.55, 0, 0.7, 0.4, 0.7);
    this.jet = add(cone, new THREE.MeshBasicMaterial({ color: 0x66ccff, toneMapped: false }), 0, -1.1, 0, 0.45, 0.8, 0.45);
    this.jet.rotation.x = Math.PI;
    // 과학자: 하얀 가운, 큰 둥근 고글, 삐죽 주황 머리
    const man = new THREE.Group(); man.position.y = 0.35; g.add(man);
    add(sph, toon(0xf4f4f0), 0, 0.55, 0, 0.55, 0.6, 0.5, man);
    add(sph, toon(0xffd9b8), 0, 1.35, 0, 0.45, 0.45, 0.45, man);
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(0.16, 0.05, 6, 14), toon(0x2c3036), s * 0.18, 1.42, 0.38, 1, 1, 1, man);
      add(sph, new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false }), s * 0.18, 1.42, 0.38, 0.13, 0.13, 0.05, man);
      add(sph, toon(0xf4f4f0), s * 0.55, 0.7, 0.1, 0.14, 0.4, 0.14, man).rotation.z = s * 0.8;
    }
    for (let i = 0; i < 5; i++) { const h = add(cone, toon(0xff7a20), (i - 2) * 0.14, 1.78, -0.05, 0.1, 0.4, 0.1, man); h.rotation.z = (i - 2) * 0.3; }
    add(sph, toon(0x2c3036), 0, 1.12, 0.36, 0.14, 0.05, 0.05, man); // 콧수염 대신 작은 입
    this.man = man;
    g.visible = false;
    scene.add(g);
    this.mesh = g;
    this.pos = g.position;
    this.flight = null;
  }
  show(p) { this.mesh.visible = true; this.pos.copy(p); }
  hide() { this.mesh.visible = false; this.flight = null; }
  flyTo(to, dur) { this.flight = { from: this.pos.clone(), to: to.clone(), t: 0, dur }; }
  update(dt, time) {
    if (!this.mesh.visible) return;
    if (this.flight) {
      const f = this.flight; f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
      this.pos.lerpVectors(f.from, f.to, e);
      this.pos.y += Math.sin(k * Math.PI) * Math.min(40, f.from.distanceTo(f.to) * 0.15);
      const d = f.to.clone().sub(f.from);
      this.mesh.rotation.y = Math.atan2(d.x, d.z);
      if (k >= 1) this.flight = null;
    }
    this.man.position.y = 0.35 + Math.sin(time * 3) * 0.08;
    this.man.rotation.z = Math.sin(time * 5) * 0.08;
    this.jet.scale.y = 0.8 + Math.random() * 0.5;
  }
}

// 닥터 기어 (홀로그램으로만 등장): 키 크고 마른 몸, 보라 긴 코트, 톱니 어깨, 기계 팔, 빨간 외눈 렌즈, 뒤로 넘긴 흰 머리
export class GearHologram {
  constructor(scene) {
    const g = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color: 0x5fe8ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); g.add(o); return o; };
    const sph = new THREE.SphereGeometry(1, 16, 12), box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14), cone = new THREE.ConeGeometry(1, 1, 12);
    const M = this.mat;
    add(box, M, 0.25, 0.9, 0, 0.22, 1.8, 0.22); add(box, M, -0.25, 0.9, 0, 0.22, 1.8, 0.22);       // 다리
    add(new THREE.CylinderGeometry(0.45, 0.85, 1, 14), M, 0, 2.2, 0, 1, 2.0, 1);                 // 긴 코트
    add(sph, M, 0, 3.4, 0, 0.55, 0.7, 0.45);                                                      // 몸통
    for (const s of [-1, 1]) { const t = add(new THREE.TorusGeometry(0.28, 0.09, 6, 12), M, s * 0.65, 3.85, 0); t.rotation.y = Math.PI / 2; } // 톱니 어깨
    add(box, M, 0.85, 3.2, 0.1, 0.16, 1.1, 0.16).rotation.z = 0.35;                               // 팔
    const arm = add(box, M, -0.95, 3.4, 0.25, 0.22, 1.0, 0.22); arm.rotation.set(-0.8, 0, -0.6); // 기계 팔 (앞으로 내민)
    add(sph, M, -1.15, 3.85, 0.75, 0.2, 0.2, 0.2);
    add(sph, M, 0, 4.45, 0, 0.42, 0.5, 0.42);                                                     // 머리
    add(cone, M, 0, 4.7, -0.3, 0.38, 0.8, 0.3).rotation.x = -1.2;                                  // 뒤로 넘긴 머리카락
    add(new THREE.TorusGeometry(0.16, 0.04, 6, 16), M, 0.16, 4.5, 0.38);                           // 외눈 렌즈
    add(sph, this.eyeMat, 0.16, 4.5, 0.4, 0.12, 0.12, 0.05);
    add(cyl, M, 0, 0.02, 0, 1.4, 0.04, 1.4);                                                       // 홀로그램 받침 빛
    g.visible = false;
    scene.add(g);
    this.mesh = g;
  }
  show(pos, scale = 8, faceTo = null) {
    this.mesh.visible = true; this.mesh.position.copy(pos); this.mesh.scale.setScalar(scale);
    if (faceTo) this.mesh.rotation.y = Math.atan2(faceTo.x - pos.x, faceTo.z - pos.z);
  }
  hide() { this.mesh.visible = false; }
  update(dt, time) {
    if (!this.mesh.visible) return;
    this.mat.opacity = 0.42 + Math.sin(time * 30) * 0.06 + (Math.random() < 0.04 ? -0.3 : 0); // 지직거림
    this.mesh.position.y += Math.sin(time * 2) * 0.01;
  }
}

// 캐릭터별 대사
export const LINES = {
  speed: { start: '기어 제국? 웃기지 마! 내 친구들은 내가 구한다. 느려, 느려~ 간다!', chase: '어딜 도망가! 쫓아가자!', win: '봤지? 이게 바로 스피드라고!' },
  flyer: { start: '저 로봇들 구조는 내가 다 알아! 형, 아니 친구들, 같이 가자!', chase: '위에서 보니까 보라 늪 쪽이야! 쫓아가자!', win: '해냈다! 숲이 다시 반짝여!' },
  power: { start: '이 대지의 크리스탈은 아무도 못 가져간다. 내 주먹이 지킨다!', chase: '거기 서! 도망가도 소용없어!', win: '좋았어! 숲이 다시 살아났다!' },
  blink: { start: '기어의 연구소... 거기 뭐가 있는지 알아. 내가 막을게.', chase: '저 연구소로 가는 거야. 따라가자.', win: '...우리가 해냈어.' },
};
// 혼자 할 때 무전으로 도와주는 친구
export const RADIO_FRIEND = { speed: 'flyer', flyer: 'speed', power: 'speed', blink: 'flyer' };

// ---- 이야기 장면용 탈것 ----
const _m = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
const _glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: o < 1, opacity: o });
// 주인공이 타는 작은 우주선 (하늘 도시 → 거대 우주선)
export function makeShuttle() {
  const g = new THREE.Group(), sph = new THREE.SphereGeometry(1, 18, 12), box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 12);
  _m(sph, toon(0xf4f4f0), 0, 0, 0, 2.2, 1.6, 4.2, g);
  _m(sph, _glow(0x7fd8ff, 0.7), 0, 0.9, 1.2, 1.3, 0.9, 1.8, g);
  for (const s of [-1, 1]) { _m(box, toon(0x3a6fd0), s * 2.6, -0.3, -0.8, 3, 0.25, 2.2, g); _m(box, toon(0xffc233), s * 3.9, -0.3, -0.8, 0.3, 0.6, 2.2, g); }
  const f = _m(cone, _glow(0x66ccff, 0.85), 0, 0, -5, 1, 2.5, 1, g); f.rotation.x = -Math.PI / 2;
  g.userData.flame = f;
  return g;
}
// 닥터 기어가 타고 도망치는 작은 비행접시
export function makeGearPod() {
  const g = new THREE.Group(), sph = new THREE.SphereGeometry(1, 20, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  _m(sph, toon(0x6a4a9a), 0, 0, 0, 4, 1.2, 4, g);
  _m(cyl, toon(0xffc233), 0, 0, 0, 4.1, 0.3, 4.1, g);
  _m(sph, _glow(0xb070ff, 0.5), 0, 1, 0, 1.8, 1.6, 1.8, g);
  _m(sph, toon(0x6a4a9a), 0, 0.9, 0, 0.6, 0.9, 0.6, g); _m(sph, toon(0xf0f0f0), 0, 1.9, 0, 0.5, 0.5, 0.5, g); _m(sph, _glow(0xff3020), 0.18, 1.95, 0.42, 0.14, 0.14, 0.08, g);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; _m(sph, _glow(0xff3020), Math.cos(a) * 3.6, -0.2, Math.sin(a) * 3.6, 0.3, 0.3, 0.3, g); }
  return g;
}
// 닥터 기어의 최종 전함 (거대 우주선에서 도망칠 때)
export function makeBattleship() {
  const g = new THREE.Group(), sph = new THREE.SphereGeometry(1, 20, 14), box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 12);
  _m(sph, toon(0x4a3a6a), 0, 0, 0, 14, 5, 20, g); _m(box, toon(0x2c3036), 0, -2, 0, 26, 2, 30, g);
  for (const s of [-1, 1]) _m(box, toon(0x4a3a6a), s * 20, -1, -4, 18, 1.6, 12, g);
  _m(sph, _glow(0x9a5aff, 0.55), 0, 4.5, 3, 5, 4, 5, g);
  for (const x of [-8, 0, 8]) { const f = _m(cone, _glow(0x66ccff, 0.8), x, 0, -24, 2.2, 8, 2.2, g); f.rotation.x = -Math.PI / 2; }
  return g;
}
