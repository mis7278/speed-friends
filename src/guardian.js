// 퀘스트를 깨기 전에 장벽 너머로 넘어가면: "어림도 없다!" — 절대 못 이기는 거대 로봇 군단이 막아섬
import * as THREE from '../vendor/three.module.js';
import { SFX } from './audio.js';
import { NAMES } from './names.js';

export class Guardians {
  constructor(game) {
    this.game = game; this.active = false; this.t = 0; this.robots = []; this.beams = [];
    const metal = new THREE.MeshLambertMaterial({ color: 0x3a3f48 }), dark = new THREE.MeshLambertMaterial({ color: 0x1e2228 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false }), stripe = new THREE.MeshLambertMaterial({ color: 0xffc233 });
    const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const add = (geo, m, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
      add(box, metal, 0, 26, 0, 14, 14, 9); add(box, stripe, 0, 20, 4.6, 14, 1.4, 0.2);
      add(sph, metal, 0, 37, 0, 7, 6, 6);
      const e = add(box, eye, 0, 37.5, 5.6, 8, 1.4, 0.6);
      for (const sx of [-1, 1]) { add(box, dark, sx * 4, 9, 0, 4, 18, 4); add(box, dark, sx * 9.5, 24, 0, 3.5, 16, 3.5); add(sph, metal, sx * 9.5, 14, 0, 3, 3, 3); }
      g.userData.eye = e;
      g.visible = false;
      game.scene.add(g);
      this.robots.push(g);
    }
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
  }
  trigger() {
    if (this.active) return;
    const pl = this.game.player;
    this.active = true; this.t = 0;
    const W = this.game.world, c = pl.pos;
    this.robots.forEach((g, i) => {
      const a = i / this.robots.length * Math.PI * 2, r = 45 + (i % 2) * 18;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      g.userData.y0 = W.groundAt(x, z, 999) ;
      g.position.set(x, g.userData.y0 - 45, z);
      g.lookAt(c.x, g.position.y, c.z);
      g.visible = true;
    });
    SFX.bossRoar(); SFX.warn();
    this.game.hud.toast(`🤖 ${NAMES.villain}: 어림도 없다! 내 기계 군단을 이길 수 있을 것 같으냐!`, 'gold');
    for (const p of this.game.players) p.shake = 1;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const pl = this.game.player, c = pl.pos.clone().add(new THREE.Vector3(0, 1, 0));
    this.robots.forEach((g) => {
      g.position.y += (g.userData.y0 - g.position.y) * Math.min(1, dt * 2.2);
      g.lookAt(c.x, g.position.y, c.z);
      g.userData.eye.scale.x = 8 * (1 + Math.sin(this.t * 20) * 0.1);
    });
    if (this.t > 2.2 && !this.beams.length) { // 모든 로봇이 레이저 발사
      for (const g of this.robots) {
        const from = g.userData.eye.getWorldPosition(new THREE.Vector3());
        const len = from.distanceTo(c);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, len, 10, 1, true), this.beamMat);
        beam.position.copy(from).lerp(c, 0.5);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(from).normalize());
        this.game.scene.add(beam); this.beams.push(beam);
      }
      SFX.blackhole();
      this.game.hud.flash('rgba(255,40,20,0.6)');
    }
    if (this.t > 2.8 && pl.alive) { // 슈퍼여도 소용없음
      this.game.fx.explosion(c, 2);
      SFX.explosion();
      pl.superOn = false; pl.invuln = 0;
      pl.die();
      this.game.hud.toast('퀘스트를 모두 깨고 장벽을 무너뜨려야 나갈 수 있어요!', '');
    }
    if (this.t > 4) {
      for (const b of this.beams) { this.game.scene.remove(b); b.geometry.dispose(); }
      this.beams = [];
      for (const g of this.robots) g.visible = false;
      this.active = false;
    }
  }
}
