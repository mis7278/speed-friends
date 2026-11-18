// 같이 하기 (온라인): 방장이 방을 만들면 4글자 방 번호가 나오고, 친구가 그 번호로 들어옴 (최대 4명).
// 연결: PeerJS (무료 공개 중계 서버로 처음 만남만 연결 → 그다음은 기기끼리 직접 WebRTC).
// 지금 단계: 서로의 캐릭터가 같은 맵에서 실시간으로 보임 (몬스터·링·퀘스트는 각자).
import * as THREE from '../vendor/three.module.js';
import { CharacterView } from './character.js';
import { NAMES } from './names.js';

const PREFIX = 'speedfriends-room-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEND_HZ = 15;
const MAX_PLAYERS = 4;

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.2, 0.8, 1); sp.renderOrder = 30;
  return sp;
}
const COLORS = ['#ffe14d', '#7df0ff', '#ff9ad5', '#9dff8a'];

export class Net {
  constructor(game) {
    this.game = game;
    this.peer = null; this.conns = new Map(); this.host = false; this.code = null;
    this.remotes = new Map();      // id -> { view, tag, target, yaw, state, last, kind, num }
    this.sendT = 0; this.status = ''; this.onChange = null;
    this.myNum = 1;
    this.retry = 0;
  }
  get Peer() { return window.Peer || window.peerjs?.Peer; }
  get active() { return !!this.peer && !this.peer.destroyed; }
  get count() { return 1 + this.remotes.size; }
  _set(status) { this.status = status; this.onChange?.(); }

  // ---------- 방 만들기 / 들어가기 ----------
  createRoom(code = null) {
    if (!this.Peer) { this._set('연결 기능을 불러오지 못했어요 (인터넷 확인)'); return; }
    this.leave(true);
    this.host = true; this.myNum = 1;
    this.code = code || Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    this._set('방을 만드는 중…');
    const peer = new this.Peer(PREFIX + this.code);
    this.peer = peer;
    peer.on('open', () => { this.retry = 0; this._save(); this._set(`방 번호 ${this.code} — 친구에게 알려 주세요!`); });
    peer.on('connection', (conn) => {
      if (this.conns.size >= MAX_PLAYERS - 1) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this._wire(conn);
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { // 같은 방 번호가 아직 남아 있음 (스테이지 이동 직후) → 잠시 뒤 다시
        if (code && this.retry++ < 12) { this._set('방을 다시 여는 중…'); setTimeout(() => this.host && this.code === code && this.createRoom(code), 2500); }
        else this.createRoom(null);
        return;
      }
      this._set('연결 오류: ' + e.type);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }
  joinRoom(code) {
    if (!this.Peer) { this._set('연결 기능을 불러오지 못했어요 (인터넷 확인)'); return; }
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) { this._set('방 번호 4글자를 넣어 주세요'); return; }
    this.leave(true);
    this.host = false; this.code = code;
    this._set(`방 ${code}에 들어가는 중…`);
    const peer = new this.Peer();
    this.peer = peer;
    peer.on('open', () => this._connectHost());
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { // 방이 없거나 방장이 스테이지를 옮기는 중
        if (this.retry++ < 15) { this._set(`방 ${code}를 찾는 중… (${this.retry})`); setTimeout(() => this.code === code && !this.host && this._connectHost(), 2500); }
        else this._set(`방 ${code}를 찾을 수 없어요`);
        return;
      }
      this._set('연결 오류: ' + e.type);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }
  _connectHost() {
    if (!this.peer || this.peer.destroyed) return;
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
    this._wire(conn);
  }
  leave(silent = false) {
    for (const c of this.conns.values()) { try { c.close(); } catch (e) {} }
    this.conns.clear();
    for (const id of [...this.remotes.keys()]) this._remove(id);
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null;
    if (!silent) { this.code = null; this.host = false; try { sessionStorage.removeItem('sf-net'); } catch (e) {} this._set(''); }
  }
  _save() { try { sessionStorage.setItem('sf-net', JSON.stringify({ host: this.host, code: this.code })); } catch (e) {} }
  // 스테이지가 바뀌어 페이지가 다시 열리면 같은 방으로 자동 재연결
  resume() {
    let d = null; try { d = JSON.parse(sessionStorage.getItem('sf-net') || 'null'); } catch (e) {}
    if (!d?.code) return false;
    if (d.host) this.createRoom(d.code); else this.joinRoom(d.code);
    return true;
  }

  // ---------- 메시지 ----------
  _wire(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.retry = 0;
      if (!this.host) { this._save(); this._set(`방 ${this.code} 연결됨!`); }
      conn.send({ t: 'hello', id: this.peer.id, kind: this.game.player?.kind });
      if (this.host) { this._toast('👋 친구가 들어왔어요!'); this._roster(); }
    });
    conn.on('data', (m) => this._recv(conn, m));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      if (this.host) { this._remove(conn.peer); this._broadcast({ t: 'bye', id: conn.peer }); this._toast('👋 친구가 나갔어요'); this._roster(); }
      else { // 방장과 끊김 (스테이지 이동 등) → 다시 연결 시도
        for (const id of [...this.remotes.keys()]) this._remove(id);
        if (this.code && this.peer && !this.peer.destroyed) { this._set('방장과 연결이 끊겼어요. 다시 연결하는 중…'); setTimeout(() => this._connectHost(), 2500); }
      }
      this.onChange?.();
    });
    conn.on('error', () => {});
  }
  _broadcast(m, except = null) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(m); } catch (e) {} } }
  _roster() {
    const ids = [this.peer.id, ...this.conns.keys()];
    ids.forEach((id, i) => { const c = this.conns.get(id); if (c?.open) c.send({ t: 'num', num: i + 1 }); });
    this.onChange?.();
  }
  _recv(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'full') { this._set('방이 꽉 찼어요 (최대 4명)'); this.leave(); return; }
    if (m.t === 'num') { this.myNum = m.num; this.onChange?.(); return; }
    if (m.t === 'bye') { this._remove(m.id); this.onChange?.(); return; }
    if (m.t === 's' || m.t === 'hello') {
      if (typeof m.id !== 'string') return;
      if (this.host && m.t === 's') this._broadcast(m, conn.peer); // 방장이 다른 친구들에게 전달
      if (m.id === this.peer?.id) return;
      if (m.t === 's') this._apply(m);
      return;
    }
    if (m.t === 'toast' && typeof m.text === 'string') this._toast(m.text.slice(0, 60));
  }
  _toast(text) { this.game.hud?.toast(text); }

  // ---------- 다른 친구 캐릭터 ----------
  _apply(m) {
    const kind = NAMES.characters[m.k] ? m.k : 'speed';
    let r = this.remotes.get(m.id);
    if (r && r.kind !== kind) { this._remove(m.id); r = null; }
    if (!r) {
      const view = new CharacterView(kind);
      this.game.scene.add(view.root);
      const num = Math.min(4, Math.max(1, m.n | 0 || 2));
      const tag = nameTag(`P${num} ${NAMES.characters[kind]}`, COLORS[(num - 1) % 4]);
      this.game.scene.add(tag);
      r = { view, tag, kind, target: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), yaw: m.y, st: {}, last: 0, num };
      this.remotes.set(m.id, r);
      this.onChange?.();
    }
    r.target.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0);
    r.yawT = +m.y || 0;
    r.st = m.q || {};
    r.stage = m.g;
    r.last = performance.now();
    if (m.n && m.n !== r.num) { r.num = m.n; }
  }
  _remove(id) {
    const r = this.remotes.get(id); if (!r) return;
    this.game.scene.remove(r.view.root, r.tag);
    r.tag.material.map.dispose(); r.tag.material.dispose();
    this.remotes.delete(id);
  }

  update(dt) {
    const g = this.game, pl = g.player;
    if (!this.active || !pl) return;
    // 내 상태 보내기 (초당 15번)
    this.sendT -= dt;
    if (this.sendT <= 0 && this.conns.size) {
      this.sendT = 1 / SEND_HZ;
      const hs = pl.state === 'air' ? Math.hypot(pl.vel.x, pl.vel.z) : Math.abs(pl.s);
      this._broadcast({ t: 's', id: this.peer.id, k: pl.kind, n: this.myNum, g: g.stageIdx,
        p: [+pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)], y: +pl.yaw.toFixed(3),
        q: { s: +hs.toFixed(1), gr: pl.grounded ? 1 : 0, b: (pl.ball || pl.state === 'charge') && !pl.superFlight ? 1 : 0, ps: pl.pose(), su: pl.superOn ? 1 : 0, h: pl.hidden || !pl.alive ? 1 : 0, c: pl.state === 'charge' ? 1 : 0 } });
    }
    // 친구 캐릭터 부드럽게 움직이기
    const now = performance.now();
    for (const [id, r] of this.remotes) {
      if (now - r.last > 8000) { this._remove(id); this.onChange?.(); continue; }
      const same = r.stage === g.stageIdx;
      r.view.root.visible = same; r.tag.visible = same && !r.st.h;
      if (!same) continue;
      if (r.pos.distanceTo(r.target) > 30) r.pos.copy(r.target); else r.pos.lerp(r.target, Math.min(1, dt * 12));
      let dy = r.yawT - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.yaw += dy * Math.min(1, dt * 12);
      r.view.root.position.copy(r.pos);
      r.view.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
      const st = r.st;
      r.view.update(dt, { speed: st.s || 0, grounded: !!st.gr, ball: !!st.b, charging: !!st.c, chargeLevel: 3, hurt: false, pose: st.ps || 'run',
        superOn: !!st.su, auraReady: false, superCharge: 0, blink: false, time: g.time, flash: 0, hidden: !!st.h });
      r.tag.position.copy(r.pos).add(new THREE.Vector3(0, 2.9, 0));
    }
  }
}
