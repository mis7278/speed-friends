// 캐릭터 외형 (임시 도형 캐릭터, 만화풍 음영 + 외곽선). 나중에 .glb 스킨으로 교체할 수 있게 분리.
import * as THREE from '../vendor/three.module.js';

export const CHARACTER_DEFS = {
  // 임시 오리지널 디자인 (아들이 디자인하면 교체)
  speed: { body: 0x35d07f, belly: 0xfff1d6, accent: 0xff8a1f, shoe: 0xffffff, superColor: 0xffd700, desc: '숲에서 제일 빠른 친구\n2단 점프: 회전 돌진\n슈퍼: 하늘을 날아가요' },
  flyer: { body: 0xffd84a, belly: 0xffffff, accent: 0x3d7bff, shoe: 0x3d7bff, superColor: 0xffe680, desc: '하늘을 나는 꼬마 발명가\n2단 점프: A 연타로 비행\n슈퍼: 회오리 발사' },
  power: { body: 0x9a6a50, belly: 0xffe0b3, accent: 0x2ecc71, shoe: 0x2ecc71, superColor: 0xff7ad9, desc: '힘센 대지의 수호자\n2단 점프: A 꾹 활공\nB(제자리): 펀치! 벽 부수기' },
  blink: { body: 0x7a52e0, belly: 0xe6e0ff, accent: 0x22e1ff, shoe: 0x22e1ff, superColor: 0xffc9a8, desc: '신비한 순간이동 친구\n2단 점프: 순간이동 공격\n슈퍼: 점프 꾹 → 블랙홀' },
};

let gradientMap = null;
function toonGradient() {
  if (gradientMap) return gradientMap;
  const d = new Uint8Array([90, 170, 235, 255]);
  gradientMap = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}
export const toon = (c, opts = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient(), ...opts });

let outlineMat = null;
function outline() {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.028;'); };
  return outlineMat;
}

function part(geo, mat, withOutline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (withOutline) { const o = new THREE.Mesh(geo, outline()); o.raycast = () => {}; m.add(o); }
  return m;
}

function limb(r, len, mat) {
  const g = new THREE.Group();
  const m = part(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.position.y = -len / 2 - r * 0.5;
  g.add(m);
  return g;
}

export class CharacterView {
  constructor(kind = 'speed') {
    const d = CHARACTER_DEFS[kind];
    this.kind = kind;
    this.def = d;
    this.root = new THREE.Group();       // 발 위치
    this.pivot = new THREE.Group();      // 몸 중심 (회전용)
    this.pivot.position.y = 0.8;
    this.root.add(this.pivot);
    this.body = new THREE.Group();
    this.body.position.y = -0.8;
    this.pivot.add(this.body);

    this.bodyMat = toon(d.body);
    this.bodyBase = new THREE.Color(d.body);
    this.superColor = new THREE.Color(d.superColor);
    const belly = toon(d.belly), accent = toon(d.accent), white = toon(0xffffff), black = toon(0x111111);
    const big = kind === 'power';

    const torso = part(new THREE.SphereGeometry(0.42, 18, 14), this.bodyMat);
    torso.scale.set(big ? 1.25 : 1, 1.15, big ? 1.05 : 0.9); torso.position.y = 0.85;
    const bellyM = part(new THREE.SphereGeometry(0.3, 14, 10), belly, false);
    bellyM.scale.set(big ? 1.2 : 1, 1.2, 0.6); bellyM.position.set(0, 0.82, big ? 0.3 : 0.22);
    const head = part(new THREE.SphereGeometry(0.52, 20, 16), this.bodyMat);
    head.position.y = 1.58;
    const muzzle = part(new THREE.SphereGeometry(0.25, 14, 10), belly, false);
    muzzle.scale.set(1.2, 0.8, 0.8); muzzle.position.set(0, 1.44, 0.42);
    const nose = part(new THREE.SphereGeometry(0.075, 8, 6), black, false);
    nose.position.set(0, 1.5, 0.63);
    this.body.add(torso, bellyM, head, muzzle, nose);
    for (const s of [-1, 1]) {
      const eye = part(new THREE.SphereGeometry(0.15, 12, 10), white, false);
      eye.scale.set(0.8, 1.15, 0.6); eye.position.set(s * 0.18, 1.68, 0.42);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), black);
      pupil.position.set(s * 0.17, 1.69, 0.5);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(s * 0.15, 1.73, 0.54);
      this.body.add(eye, pupil, shine);
      let ear;
      if (kind === 'speed') { ear = part(new THREE.ConeGeometry(0.17, 0.45, 8), this.bodyMat); ear.position.set(s * 0.3, 2.04, -0.05); ear.rotation.z = -s * 0.35; }
      else if (kind === 'blink') { ear = part(new THREE.ConeGeometry(0.13, 0.7, 8), this.bodyMat); ear.position.set(s * 0.34, 2.12, -0.08); ear.rotation.z = -s * 0.55; ear.rotation.x = -0.2; }
      else { ear = part(new THREE.SphereGeometry(0.18, 12, 10), this.bodyMat); ear.scale.set(1, 1, 0.5); ear.position.set(s * 0.38, 1.98, 0); }
      this.body.add(ear);
    }
    // 캐릭터별 장식
    if (kind === 'speed') { // 번개 모양 앞머리
      const tuft = part(new THREE.ConeGeometry(0.16, 0.5, 4), accent);
      tuft.position.set(0.05, 2.05, 0.22); tuft.rotation.set(0.6, 0, -0.4);
      this.body.add(tuft);
    } else if (kind === 'flyer') { // 고글 + 날개
      const band = part(new THREE.TorusGeometry(0.5, 0.05, 6, 24), black, false);
      band.position.y = 1.8; band.rotation.x = Math.PI / 2 - 0.15; band.scale.set(1.02, 1.02, 1);
      const gog = part(new THREE.TorusGeometry(0.11, 0.04, 6, 14), accent, false);
      gog.position.set(0.15, 1.92, 0.42); const gog2 = gog.clone(); gog2.position.x = -0.15;
      this.body.add(band, gog, gog2);
      this.wings = [];
      for (const s of [-1, 1]) {
        const wg = new THREE.Group();
        const wm = part(new THREE.SphereGeometry(0.5, 12, 8), accent);
        wm.scale.set(1, 0.35, 0.08); wm.position.x = s * 0.45;
        wg.add(wm); wg.position.set(s * 0.15, 1.1, -0.35); wg.userData.s = s;
        this.body.add(wg); this.wings.push(wg);
      }
    } else if (kind === 'power') { // 이마 보호대
      const brow = part(new THREE.BoxGeometry(0.8, 0.14, 0.3), accent);
      brow.position.set(0, 1.86, 0.32); brow.rotation.x = -0.3;
      this.body.add(brow);
    } else if (kind === 'blink') { // 이마 보석 + 망토
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0x22e1ff, toneMapped: false }));
      gem.position.set(0, 1.86, 0.48);
      this.body.add(gem);
      this.cape = new THREE.Group();
      const cm = part(new THREE.PlaneGeometry(0.9, 1.0), toon(0x3a1f8a, { side: THREE.DoubleSide }), false);
      cm.position.y = -0.5;
      this.cape.add(cm); this.cape.position.set(0, 1.22, -0.36);
      this.body.add(this.cape);
    }
    // 목도리 (스피드형)
    this.scarfTail = new THREE.Group();
    if (kind === 'speed') {
      const scarf = part(new THREE.TorusGeometry(0.3, 0.09, 8, 16), accent);
      scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.18;
      const tail = part(new THREE.BoxGeometry(0.16, 0.06, 0.55), accent);
      tail.position.z = -0.27;
      this.scarfTail.add(tail);
      this.scarfTail.position.set(0.12, 1.18, -0.28);
      this.body.add(scarf);
    }
    this.body.add(this.scarfTail);
    // 팔다리
    const armR = big ? 0.13 : 0.1, handR = big ? 0.24 : 0.14, sx = big ? 0.56 : 0.45;
    this.armL = limb(armR, 0.38, this.bodyMat); this.armL.position.set(sx, 1.08, 0);
    this.armR = limb(armR, 0.38, this.bodyMat); this.armR.position.set(-sx, 1.08, 0);
    for (const a of [this.armL, this.armR]) { const h = part(new THREE.SphereGeometry(handR, 12, 10), big ? accent : white); h.position.y = -0.62; a.add(h); }
    this.legL = limb(0.12, 0.28, this.bodyMat); this.legL.position.set(0.18, 0.55, 0);
    this.legR = limb(0.12, 0.28, this.bodyMat); this.legR.position.set(-0.18, 0.55, 0);
    for (const l of [this.legL, this.legR]) {
      const sh = part(new THREE.BoxGeometry(0.28, 0.22, 0.5), toon(d.shoe)); sh.position.set(0, -0.5, 0.08); l.add(sh);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.06, 0.3), accent); st.position.set(0, -0.46, 0.1); l.add(st);
    }
    this.body.add(this.armL, this.armR, this.legL, this.legR);
    // 아주 빠를 때 발 주변 회전 잔상
    this.legBlur = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 6, 20), new THREE.MeshBasicMaterial({ color: d.shoe === 0xffffff ? 0xffffff : d.shoe, transparent: true, opacity: 0, depthWrite: false }));
    this.legBlur.rotation.y = Math.PI / 2; this.legBlur.position.set(0, 0.4, 0.05);
    this.body.add(this.legBlur);

    // 구르기 공
    this.ball = new THREE.Group();
    const bm = part(new THREE.SphereGeometry(0.72, 18, 14), this.bodyMat);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 24), belly);
    stripe.rotation.y = Math.PI / 2;
    const stripe2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 6, 24), accent);
    this.ball.add(bm, stripe, stripe2);
    this.ball.visible = false;
    this.pivot.add(this.ball);

    // 변신 가능 아우라 / 변신 중 빛
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.aura.visible = false;
    this.pivot.add(this.aura);
    // 순간이동/블랙홀용 빛
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9a5cff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pivot.add(this.flash);

    this.phase = 0;
    this.ballSpin = 0;
    this.tumble = 0;
  }

  dispose(scene) { scene.remove(this.root); }

  // st: { speed, grounded, ball, charging, chargeLevel, hurt, pose, superOn, auraReady, superCharge, blink, time, flash }
  update(dt, st) {
    const t = st.time;
    this.body.visible = !st.ball;
    this.ball.visible = st.ball;
    if (st.ball) {
      const rate = st.charging ? 18 + st.chargeLevel * 4 : 10 + st.speed * 0.9;
      this.ballSpin += rate * dt;
      this.ball.rotation.set(this.ballSpin, 0, 0);
      const squash = st.charging ? 1 + Math.sin(t * 40) * 0.05 : 1;
      this.ball.scale.set(1, squash, 1);
    }
    const s = st.speed;
    let legL = 0, legR = 0, armL = 0, armR = 0, armZ = 0.25, lean = 0, blur = 0;
    this.body.position.y = -0.8;
    const pose = st.pose || (st.grounded ? 'run' : 'air');
    if (pose === 'run') {
      if (s > 0.5) {
        this.phase += dt * (5 + s * 0.75);
        if (s > 21) { // 아주 빠르면 다리가 바퀴처럼 빙글빙글
          legL = this.phase * 1.6; legR = legL + Math.PI;
          blur = Math.min(0.55, (s - 21) / 15);
          armL = armR = 1.35; armZ = 0.45; lean = 0.42;
        } else {
          const amp = Math.min(1.25, 0.45 + s / 12);
          legL = Math.sin(this.phase) * amp; legR = -legL;
          const back = Math.max(0, (s - 14) / 7);
          armL = -Math.sin(this.phase) * amp * 0.8 * (1 - back) + back * 1.2;
          armR = Math.sin(this.phase) * amp * 0.8 * (1 - back) + back * 1.2;
          lean = Math.min(0.35, s * 0.017);
          this.body.position.y = -0.8 + Math.abs(Math.sin(this.phase)) * 0.06;
        }
      } else {
        this.phase += dt * 2;
        this.body.position.y = -0.8 + Math.sin(this.phase) * 0.02;
        armL = armR = 0.05;
      }
    } else if (pose === 'flight') { // 몸을 45도 앞으로, 두 팔은 뒤로 쭉
      lean = 0.8; armL = armR = 1.5; armZ = 0.2; legL = 0.5; legR = 0.7;
    } else if (pose === 'glide') {
      lean = 0.6; armL = armR = -1.2; armZ = 1.3; legL = 0.4; legR = 0.5;
    } else if (pose === 'fly') {
      lean = 0.35; armL = armR = 0.6; armZ = 1.0; legL = 0.3; legR = 0.1;
    } else if (pose === 'punch') {
      lean = 0.25; armL = -1.6; armR = 0.6; armZ = 0.1; legL = -0.4; legR = 0.5;
    } else if (pose === 'cast') {
      armL = armR = 3.0; armZ = 0.4; lean = -0.15;
    } else { // 공중 (스프링 등): 만세
      armL = armR = 0; armZ = 2.6; legL = 0.3; legR = -0.2;
    }
    if (st.hurt) { // 넉백: 뒤로 데굴
      this.tumble -= dt * 11;
      armL = armR = -1; armZ = 1.3; legL = 0.6; legR = -0.6; lean = 0;
    } else this.tumble = 0;
    this.pivot.rotation.x = this.tumble;
    this.armL.rotation.set(armL, 0, armZ); this.armR.rotation.set(armR, 0, -armZ);
    this.legL.rotation.set(legL, 0, 0); this.legR.rotation.set(legR, 0, 0);
    this.body.rotation.x = lean;
    this.legBlur.material.opacity = blur;
    this.legBlur.visible = blur > 0.01;
    this.legBlur.rotation.x = this.phase * 3;
    this.scarfTail.rotation.x = -0.2 - Math.min(1.2, s * 0.04) + Math.sin(t * 20) * 0.1 * Math.min(1, s / 10);
    if (this.wings) for (const w of this.wings) w.rotation.z = w.userData.s * (pose === 'fly' ? Math.sin(t * 30) * 0.7 : 0.2);
    if (this.cape) this.cape.rotation.x = -0.1 - Math.min(1.1, s * 0.035) + Math.sin(t * 12) * 0.08;

    // 색 / 아우라
    if (st.superOn) {
      const k = 0.75 + Math.sin(t * 10) * 0.25;
      this.bodyMat.color.copy(this.superColor).multiplyScalar(0.95 + k * 0.15);
      this.bodyMat.emissive.copy(this.superColor).multiplyScalar(0.4 * k);
    } else {
      this.bodyMat.color.copy(this.bodyBase);
      this.bodyMat.emissive.setRGB(0, 0, 0);
    }
    const showAura = st.superOn || st.auraReady;
    this.aura.visible = showAura;
    if (showAura) {
      this.aura.material.color.copy(st.superOn ? this.superColor : new THREE.Color(0xfff3a0));
      const pulse = 1 + Math.sin(t * (st.superOn ? 14 : 5)) * 0.08 + (st.superCharge || 0) * 0.5;
      this.aura.scale.setScalar(pulse);
      this.aura.material.opacity = (st.superOn ? 0.3 : 0.18) + (st.superCharge || 0) * 0.3;
    }
    this.flash.material.opacity = st.flash || 0;
    this.flash.scale.setScalar(1 + (st.flash || 0) * 1.5);
    this.root.visible = !(st.blink && Math.floor(t * 15) % 2 === 0) && !st.hidden;
  }
}
