// 키보드 · 터치 · 게임패드(조이콘) 입력을 하나로 합쳐 줍니다.
import { CFG } from './config.js';

// 키 설정 (나중에 설정 메뉴에서 바꿀 수 있게 할 예정)
export const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  a: ['Space'],
  b: [],            // B는 마우스 왼쪽 클릭 (아래 _bindMouse)
  item1: ['Digit1', 'Numpad1'],
  item2: ['Digit2', 'Numpad2'],
  camLeft: ['KeyQ'],
  camRight: ['KeyE'],
};

function makeButton() {
  return { held: false, pressed: false, released: false, _src: new Set() };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };        // x: 오른쪽+, y: 앞+
    this.cam = { dx: 0, dy: 0 };       // 이번 프레임 카메라 회전량
    this.camKey = 0;                   // Q/E
    this.manualCamTime = 999;          // 마지막으로 직접 카메라를 돌린 뒤 경과 시간
    this.buttons = { a: makeButton(), b: makeButton(), item1: makeButton(), item2: makeButton() };
    this.keys = new Set();
    this.touchMove = { x: 0, y: 0, active: false };
    this.padState = { a: false, b: false, item1: false, item2: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this._bindKeyboard();
    this._bindMouse();
  }

  _codeToAction(code) {
    for (const [action, codes] of Object.entries(KEYMAP)) if (codes.includes(code)) return action;
    return null;
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const act = this._codeToAction(e.code);
      if (!act) return;
      e.preventDefault();
      if (e.repeat) return;
      this.keys.add(act);
      if (this.buttons[act]) this._press(act, 'key');
    });
    window.addEventListener('keyup', (e) => {
      const act = this._codeToAction(e.code);
      if (!act) return;
      e.preventDefault();
      this.keys.delete(act);
      if (this.buttons[act]) this._release(act, 'key');
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      for (const k of Object.keys(this.buttons)) { this.buttons[k]._src.clear(); this.buttons[k].held = false; }
    });
  }

  _bindMouse() {
    // 왼쪽 클릭 = B, 오른쪽 버튼 드래그 = 카메라 회전
    let dragging = false, lx = 0, ly = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { e.preventDefault(); this._press('b', 'mouse'); }
      if (e.button === 2) { dragging = true; lx = e.clientX; ly = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._release('b', 'mouse');
      if (e.button === 2) dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const s = CFG.camera.mouseSensitivity;
      this.cam.dx += (e.clientX - lx) * s; this.cam.dy += (e.clientY - ly) * s;
      lx = e.clientX; ly = e.clientY;
      this.manualCamTime = 0;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 터치 화면 쪽에서 호출
  touchCamera(dx, dy) {
    const s = CFG.camera.touchSensitivity;
    this.cam.dx += dx * s; this.cam.dy += dy * s;
    this.manualCamTime = 0;
  }

  _press(name, src) {
    const b = this.buttons[name];
    if (b._src.size === 0) { b.pressed = true; b.held = true; }
    b._src.add(src);
  }
  _release(name, src) {
    const b = this.buttons[name];
    if (!b._src.has(src)) return;
    b._src.delete(src);
    if (b._src.size === 0) { b.held = false; b.released = true; }
  }
  pressTouch(name) { this._press(name, 'touch'); }
  releaseTouch(name) { this._release(name, 'touch'); }

  _pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let mx = 0, my = 0, cx = 0, cy = 0;
    const st = { a: false, b: false, item1: false, item2: false };
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const bt = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = (i) => (p.axes[i] || 0);
      // 왼쪽 스틱
      let x = ax(0), y = ax(1);
      // 조이콘 하나만 연결된 경우 등: 방향 버튼(POV 햇)이 axes[9]에 오는 경우
      if (p.mapping !== 'standard' && p.axes.length > 9) {
        const h = ax(9);
        if (h >= -1.05 && h <= 1.05) {
          const ang = (h + 1) / 2 * (Math.PI * 2) * (7 / 8);
          x = Math.sin(ang); y = -Math.cos(ang);
        }
      }
      // 표준 패드의 방향 버튼
      if (p.mapping === 'standard') {
        if (bt(12)) y = -1; if (bt(13)) y = 1; if (bt(14)) x = -1; if (bt(15)) x = 1;
        cx = ax(2); cy = ax(3);
      }
      if (Math.hypot(x, y) > 0.2) { mx = x; my = y; }
      if (bt(0)) st.a = true;
      if (bt(1)) st.b = true;
      if (bt(4) || bt(6)) st.item1 = true;
      if (bt(5) || bt(7)) st.item2 = true;
    }
    for (const k of Object.keys(st)) {
      if (st[k] && !this.padState[k]) this._press(k, 'pad');
      if (!st[k] && this.padState[k]) this._release(k, 'pad');
    }
    this.padState = st;
    if (Math.abs(cx) > 0.2 || Math.abs(cy) > 0.2) {
      this.cam.dx += cx * 0.05; this.cam.dy += cy * 0.03; this.manualCamTime = 0;
    }
    return { x: mx, y: -my };
  }

  // 매 프레임 시작 때 호출
  update(dt) {
    const pad = this._pollGamepads();
    let x = 0, y = 0;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('right')) x += 1;
    if (this.keys.has('up')) y += 1;
    if (this.keys.has('down')) y -= 1;
    if (this.touchMove.active) { x = this.touchMove.x; y = this.touchMove.y; }
    if (pad.x || pad.y) { x = pad.x; y = pad.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
    this.camKey = (this.keys.has('camRight') ? 1 : 0) - (this.keys.has('camLeft') ? 1 : 0);
    if (this.camKey) this.manualCamTime = 0;
    this.manualCamTime += dt;
  }

  // 매 프레임 끝에 호출
  endFrame() {
    for (const b of Object.values(this.buttons)) { b.pressed = false; b.released = false; }
    this.cam.dx = 0; this.cam.dy = 0;
  }

  hasMove() { return Math.hypot(this.move.x, this.move.y) > 0.2; }
}
