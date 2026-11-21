// 시네마틱 (스토리 장면): 위아래 검은 띠 + 자막 + 카메라 이동. 클릭/스페이스/터치로 다음, 건너뛰기 버튼.
import * as THREE from '../vendor/three.module.js';

const ease = (t) => t * t * (3 - 2 * t);

export class Cinematic {
  constructor() {
    const el = document.createElement('div');
    el.className = 'cine';
    el.innerHTML = `<div class="cine-bar top"></div><div class="cine-bar bottom"><div class="cine-text"><span class="cine-who"></span><span class="cine-line"></span></div></div><button class="cine-skip">건너뛰기 ⏭</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.who = el.querySelector('.cine-who'); this.line = el.querySelector('.cine-line');
    this.active = false;
    el.querySelector('.cine-skip').addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    el.addEventListener('pointerdown', () => { if (this.active) this.next(); });
    window.addEventListener('keydown', (e) => { if (this.active && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); e.stopImmediatePropagation(); this.next(); } }, true);
  }

  // shots: [{ from:{pos,look}, to:{pos,look}, dur, who, text, enter?() }]
  play(shots, camera, onEnd) {
    this.shots = shots; this.camera = camera; this.onEnd = onEnd;
    this.i = -1; this.active = true;
    this.el.classList.add('on');
    this._next();
  }
  _next() {
    this.i++;
    if (this.i >= this.shots.length) { this.end(); return; }
    const s = this.shots[this.i];
    this.t = 0;
    s.enter?.();
    this.who.textContent = s.who ? s.who + ' ' : '';
    this.line.textContent = s.text || '';
    this.line.parentElement.classList.remove('pop'); void this.line.offsetWidth; this.line.parentElement.classList.add('pop');
    this.onLine?.(s.text, s.who);
  }
  next() { if (this.t > 0.35) this._next(); }
  skip() { if (!this.active) return; for (let k = this.i + 1; k < this.shots.length; k++) this.shots[k].enter?.(); this.end(); }
  end() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.remove('on');
    this.onStop?.();
    const cb = this.onEnd; this.onEnd = null;
    cb?.();
  }
  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.i];
    this.t += dt;
    s.tick?.(dt, this.t); // 장면 안에서 캐릭터를 움직일 때 (날아감·떨어짐)
    if (!this.active || this.shots[this.i] !== s) return;
    const k = ease(Math.min(1, this.t / s.dur));
    const f = typeof s.from === 'function' ? s.from() : s.from, to = typeof s.to === 'function' ? s.to() : (s.to || f);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(f.pos).lerp(to.pos, k);
    const look = f.look.clone().lerp(to.look, k);
    this.camera.lookAt(look);
    if (Math.abs(this.camera.fov - 60) > 0.1) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
    if (this.t > s.dur + (s.hold ?? 1.6)) this._next(); // 자동으로 다음 장면
  }
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
