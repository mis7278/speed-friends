// 같이 하기 (온라인): 방장이 방을 만들면 4글자 방 번호가 나오고, 친구가 그 번호로 들어옴 (최대 4명).
// 대기실에서 서로 들어온 것을 확인하고 각자 캐릭터를 고른 뒤, 방장이 '시작'을 누르면 다 같이 시작.
// 메인 퀘스트는 공통: 누가 깨든 모두 다음 퀘스트로.
// 연결: PeerJS (무료 공개 중계 서버로 처음 만남만 연결 → 그다음은 기기끼리 직접 WebRTC).
import * as THREE from '../vendor/three.module.js';
import { CharacterView } from './character.js';
import { NAMES } from './names.js';

const PREFIX = 'speedfriends-room-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEND_HZ = 15;
export const MAX_PLAYERS = 4;
const KINDS = ['speed', 'flyer', 'power', 'blink'];

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
export const P_COLORS = ['#ffe14d', '#7df0ff', '#ff9ad5', '#9dff8a'];

export class Net {
  // hooks: getKind(), isStarted(), getStage(), getQuest(), onStart(stage), onQuest(n), onChange()
  constructor(game, hooks = {}) {
    this.game = game; this.h = hooks;
    this.peer = null; this.conns = new Map(); this.host = false; this.code = null;
    this.remotes = new Map();      // 다른 친구 캐릭터 (게임 안)
    this.members = [];             // 대기실 명단 [{id, num, kind, host}]
    this.sendT = 0; this.status = '';
    this.myNum = 1; this.retry = 0; this.stage = 0; this.started = false;
  }
  get Peer() { return window.Peer || window.peerjs?.Peer; }
  get active() { return !!this.peer && !this.peer.destroyed; }
  get inRoom() { return !!this.code && (this.host ? this.active : this.conns.size > 0); }
  get shared() { return this.inRoom && this.started; } // 몬스터·링·보스를 같이 씀
  // 몬스터·링·보스 같은 게임 소식 보내기 (방장을 거쳐 모두에게)
  sendGame(m) { if (!this.conns.size) return; if (this.host) this._broadcast(m); else this._sendHost(m); }
  // 방장 쪽 몬스터가 쫓아갈 친구 위치
  proxies() { return [...this.remotes.values()].filter((r) => r.view.root.visible && !r.st.h).map((r) => ({ pos: r.pos, alive: true })); }
  get count() { return Math.max(1, this.members.length || 1 + this.remotes.size); }
  _set(status) { this.status = status; this.h.onChange?.(); }
  _changed() { this.h.onChange?.(); }

  // ---------- 방 만들기 / 들어가기 ----------
  createRoom(code = null) {
    if (!this.Peer) { this._set('연결 기능을 불러오지 못했어요 (인터넷 확인)'); return; }
    this.leave(true);
    this.host = true; this.myNum = 1;
    this.code = code || Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    this._set('방을 만드는 중…');
    const peer = new this.Peer(PREFIX + this.code);
    this.peer = peer;
    peer.on('open', () => { this.retry = 0; this._save(); this._roster(); this._set('친구에게 방 번호를 알려 주세요!'); });
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
    this._wire(this.peer.connect(PREFIX + this.code, { reliable: true }));
  }
  leave(silent = false) {
    for (const c of this.conns.values()) { try { c.close(); } catch (e) {} }
    this.conns.clear();
    for (const id of [...this.remotes.keys()]) this._remove(id);
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null; this.members = [];
    if (!silent) { this.code = null; this.host = false; this.started = false; try { sessionStorage.removeItem('sf-net'); } catch (e) {} this._set(''); }
  }
  _save() { try { sessionStorage.setItem('sf-net', JSON.stringify({ host: this.host, code: this.code })); } catch (e) {} }
  // 스테이지가 바뀌어 페이지가 다시 열리면 같은 방으로 자동 재연결
  resume() {
    let d = null; try { d = JSON.parse(sessionStorage.getItem('sf-net') || 'null'); } catch (e) {}
    if (!d?.code) return false;
    if (d.host) this.createRoom(d.code); else this.joinRoom(d.code);
    return true;
  }

  // ---------- 대기실 ----------
  pick(kind) { // 내 캐릭터 고르기
    if (!KINDS.includes(kind)) return;
    if (this.host) this._roster();
    else this._sendHost({ t: 'pick', kind });
  }
  // 방장: 다 같이 시작 (stage = 어느 대지)
  startAll(stage) {
    if (!this.host) return;
    this.started = true; this.stage = stage;
    this._roster();
    this._broadcast({ t: 'start', stage });
    this.h.onStart?.(stage);
  }
  // 퀘스트를 깼다고 알리기 (방장을 거쳐 모두에게)
  sendQuest(n) {
    if (!this.inRoom) return;
    if (this.host) { this._broadcast({ t: 'quest', n }); this._roster(); }
    else this._sendHost({ t: 'quest', n });
  }
  _sendHost(m) { for (const c of this.conns.values()) if (c.open) { try { c.send(m); } catch (e) {} } }

  // ---------- 메시지 ----------
  _wire(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.retry = 0;
      if (!this.host) { this._save(); this._set(`방 ${this.code}에 들어왔어요!`); }
      conn.send({ t: 'hello', id: this.peer.id, kind: this.h.getKind?.() });
      if (this.host) { SFXping(); this._toast('👋 친구가 들어왔어요!'); }
    });
    conn.on('data', (m) => this._recv(conn, m));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      if (this.host) {
        this._remove(conn.peer); this._broadcast({ t: 'bye', id: conn.peer });
        this.kinds?.delete(conn.peer);
        this._toast('👋 친구가 나갔어요'); this._roster();
      } else { // 방장과 끊김 (스테이지 이동 등) → 다시 연결 시도
        for (const id of [...this.remotes.keys()]) this._remove(id);
        this.members = [];
        if (this.code && this.peer && !this.peer.destroyed) { this._set('방장과 연결이 끊겼어요. 다시 연결하는 중…'); setTimeout(() => this._connectHost(), 2500); }
      }
      this._changed();
    });
    conn.on('error', () => {});
  }
  _broadcast(m, except = null) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(m); } catch (e) {} } }
  // 방장: 명단·진행 상황을 모두에게
  _roster() {
    if (!this.host || !this.peer) return;
    this.kinds = this.kinds || new Map();
    const ids = [this.peer.id, ...this.conns.keys()];
    this.members = ids.map((id, i) => ({ id, num: i + 1, kind: id === this.peer.id ? this.h.getKind?.() : (this.kinds.get(id) || 'speed'), host: i === 0 }));
    const msg = { t: 'lobby', members: this.members, started: this.started || !!this.h.isStarted?.(), stage: this.h.getStage?.() ?? this.stage, quest: this.h.getQuest?.() ?? 0 };
    ids.forEach((id, i) => { const c = this.conns.get(id); if (c?.open) c.send({ ...msg, you: i + 1 }); });
    this._changed();
  }
  _recv(conn, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'full': this._set('방이 꽉 찼어요 (최대 4명)'); this.leave(); return;
      case 'hello':
        if (this.host && typeof m.id === 'string') { this.kinds = this.kinds || new Map(); if (KINDS.includes(m.kind)) this.kinds.set(conn.peer, m.kind); this._roster(); }
        return;
      case 'pick':
        if (this.host && KINDS.includes(m.kind)) { this.kinds = this.kinds || new Map(); this.kinds.set(conn.peer, m.kind); this._roster(); }
        return;
      case 'lobby':
        if (this.host || !Array.isArray(m.members)) return;
        this.members = m.members.slice(0, MAX_PLAYERS).map((x) => ({ id: String(x.id), num: x.num | 0, kind: KINDS.includes(x.kind) ? x.kind : 'speed', host: !!x.host }));
        this.myNum = m.you | 0 || this.myNum;
        this.stage = m.stage | 0;
        if (typeof m.quest === 'number') { this.lastQuest = m.quest; this.h.onQuest?.(m.quest); }
        if (m.started && !this.h.isStarted?.()) { this.started = true; this.h.onStart?.(this.stage); } // 이미 시작한 방에 들어옴
        this._changed();
        return;
      case 'start':
        if (this.host) return;
        this.started = true; this.stage = m.stage | 0;
        this.h.onStart?.(this.stage);
        return;
      case 'quest':
        if (typeof m.n !== 'number') return;
        if (this.host) { this._broadcast(m, conn.peer); }
        this.h.onQuest?.(m.n, true);
        if (this.host) this._roster();
        return;
      case 'bye': this._remove(m.id); this._changed(); return;
      case 'eh': case 'rg': case 'bh': case 'ep': case 'bp': case 'tb': case 'wb': case 'ch': case 'gd': case 'go':
        if (this.host && m.t !== 'ep' && m.t !== 'bp') this._broadcast(m, conn.peer);
        this.h.onGame?.(m);
        return;
      case 's':
        if (typeof m.id !== 'string') return;
        if (this.host) this._broadcast(m, conn.peer); // 방장이 다른 친구들에게 전달
        if (m.id !== this.peer?.id) this._apply(m);
        return;
    }
  }
  _toast(text) { this.game.hud?.toast(text); }

  // ---------- 다른 친구 캐릭터 ----------
  _apply(m) {
    const kind = KINDS.includes(m.k) ? m.k : 'speed';
    let r = this.remotes.get(m.id);
    const num = Math.min(4, Math.max(1, m.n | 0 || 2));
    if (r && (r.kind !== kind || r.num !== num)) { this._remove(m.id); r = null; }
    if (!r) {
      const view = new CharacterView(kind);
      this.game.scene.add(view.root);
      const tag = nameTag(`P${num} ${NAMES.characters[kind]}`, P_COLORS[(num - 1) % 4]);
      this.game.scene.add(tag);
      r = { view, tag, kind, target: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), yaw: m.y, yawT: m.y, st: {}, last: 0, num };
      this.remotes.set(m.id, r);
      this._changed();
    }
    r.target.set(+m.p[0] || 0, +m.p[1] || 0, +m.p[2] || 0);
    r.yawT = +m.y || 0;
    r.st = m.q || {};
    r.stage = m.g;
    r.last = performance.now();
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
    // 방장: 몬스터·보스 위치를 친구들에게 (초당 10번)
    if (this.host && this.shared && this.conns.size) {
      this.epT = (this.epT || 0) - dt;
      if (this.epT <= 0) {
        this.epT = 0.1;
        const who = [pl.pos, ...[...this.remotes.values()].map((r) => r.pos)], a = [];
        for (const e of g.enemies.list) {
          if (!e.alive || e.dying > 0 || e.T.static || e.asleep) continue;
          if (!who.some((p) => Math.abs(p.x - e.pos.x) < 170 && Math.abs(p.z - e.pos.z) < 170)) continue;
          a.push(e.idx, +e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1), +e.yaw.toFixed(2));
        }
        if (a.length) this._broadcast({ t: 'ep', a });
        const b = g.boss;
        if (b && b.alive && b.spawned) this._broadcast({ t: 'bp', p: [+b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2)], y: +b.yaw.toFixed(3), s: b.state });
      }
    }
    // 친구 캐릭터 부드럽게 움직이기
    const now = performance.now();
    for (const [id, r] of this.remotes) {
      if (now - r.last > 8000) { this._remove(id); this._changed(); continue; }
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
function SFXping() {}
