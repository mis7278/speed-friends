// 화면 표시 (체력, 링, 속도 단계, 미니맵, 미션, 퀘스트, 아이템 칸, 보스 체력, 터치 조작)
import { NAMES } from './names.js';
import { CFG } from './config.js';

const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

export class HUD {
  constructor(input) {
    this.input = input;
    const root = $('div', 'hud', document.body);
    this.root = root;

    // 왼쪽 위: 체력 + 링
    const tl = $('div', 'hud-tl', root);
    const hp = $('div', 'hp', tl);
    $('div', 'hp-label', hp, '체력');
    const bar = $('div', 'hp-bar', hp);
    this.hpFill = $('div', 'hp-fill', bar);
    this.hpText = $('div', 'hp-text', bar, '100%');
    const rings = $('div', 'rings', tl);
    $('div', 'ring-icon', rings, '★');
    this.ringText = $('div', 'ring-text', rings, '0');
    this.superText = $('div', 'super-text', tl, '');
    this.bigCry = $('div', 'big-cry', tl, '');
    this.gauge = $('div', 'gauge', tl, '<div class="gauge-label">비행</div><div class="gauge-bar"><div class="gauge-fill"></div></div>');
    this.gaugeFill = this.gauge.querySelector('.gauge-fill');
    this.gaugeLabel = this.gauge.querySelector('.gauge-label');

    // 왼쪽 아래: 속도 단계
    this.speedo = $('div', 'speedo', root);
    this.gearCells = [1, 2, 3].map((g) => $('div', 'gear-cell', this.speedo, String(g)));
    this.speedText = $('div', 'speed-text', this.speedo, '0');

    // 오른쪽 위: 미니맵 + 크리스탈 미션
    const tr = $('div', 'hud-tr', root);
    this.mapCanvas = $('canvas', 'minimap', tr);
    this.mapCanvas.width = 180; this.mapCanvas.height = 180;
    this.mapCtx = this.mapCanvas.getContext('2d');
    // 큰 지도 (미니맵을 누르거나 M 키)
    this.mapCanvas.style.pointerEvents = 'auto'; this.mapCanvas.style.cursor = 'pointer';
    this.big = $('div', 'bigmap', document.body); this.bigCv = $('canvas', '', this.big); this.bigCv.width = this.bigCv.height = 640;
    $('div', 'bigmap-hint', this.big, '지도를 누르면 닫혀요');
    const toggle = (e) => { e?.preventDefault?.(); this.bigOpen = !this.bigOpen; this.big.classList.toggle('on', this.bigOpen); };
    this.mapCanvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); toggle(e); });
    this.big.addEventListener('pointerdown', toggle);
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat && e.target.tagName !== 'INPUT') toggle(); });
    const ms = $('div', 'missions', tr);
    this.missionsBox = ms; ms.style.display = 'none'; // 시련 제도 없앰 (링 50개면 누구나 변신)
    this.missionsTitle = $('div', 'missions-title', ms, `🌱 ${NAMES.trial}`);
    this.missionRows = [0, 1, 2].map(() => $('div', 'mission-row', ms, ''));

    // 가운데 위: 퀘스트 + 보스 체력
    this.quest = $('div', 'quest', root);
    this.questTitle = $('div', 'quest-title', this.quest, '');
    this.questText = $('div', 'quest-text', this.quest, '');
    this.questDist = $('div', 'quest-dist', this.quest, '');
    this.boss = $('div', 'boss', root, `<div class="boss-name"></div><div class="boss-bar"><div class="boss-fill"></div></div>`);
    this.bossName = this.boss.querySelector('.boss-name'); this.bossFill = this.boss.querySelector('.boss-fill');

    this.toastBox = $('div', 'toast-box', root);

    // 아래 가운데: 스핀 게이지 + 아이템 칸
    this.charge = $('div', 'charge', root);
    this.chargeCells = [];
    for (let i = 0; i < CFG.player.spinMaxTaps; i++) this.chargeCells.push($('div', 'charge-cell', this.charge));
    const items = $('div', 'items', root);
    this.slotCrystal = $('div', 'slot', items, `<div class="slot-key">1</div><div class="slot-icon">🌱</div><div class="slot-count">0/3</div>`);
    this.slotHeart = $('div', 'slot', items, `<div class="slot-key">2</div><div class="slot-icon">❤️</div><div class="slot-count">0</div>`);
    this.slotCrystal.style.display = 'none';
    this.slotCrystal.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressTouch('item1'); setTimeout(() => input.releaseTouch('item1'), 50); });
    this.slotHeart.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressTouch('item2'); setTimeout(() => input.releaseTouch('item2'), 50); });

    this.underEl = $('div', 'underwater', root); // 물 속 화면 (파랗게)
    this.flashEl = $('div', 'flash', root);
    this.fade = $('div', 'fade', root);
    if (input.isTouch) this._touchControls();
    this.hide(true);
  }

  hide(v) { this.root.style.display = v ? 'none' : ''; }
  // 땅 이름, 되찾은 대지의 크리스탈 5칸, 도전 모드 표시
  setStageInfo(place, crystals, colors, hard) {
    this.missionsTitle.textContent = hard ? '⭐ 도전 모드 — 씨앗 없이 슈퍼 변신 가능!' : `🌱 ${place}의 ${NAMES.trial} (씨앗을 모아 슈퍼 변신)`;
    this.missionRows.forEach((r) => (r.style.display = hard ? 'none' : ''));
    this.bigCry.innerHTML = crystals.map((c, i) => `<span class="${c ? 'on' : ''}" style="--c:${colors[i]}"></span>`).join('');
    this.hard = hard;
  }

  _touchControls() {
    const input = this.input;
    document.body.classList.add('touch');
    const layer = $('div', 'touch-layer', this.root);
    const joyBase = $('div', 'joy-base', layer);
    const joyKnob = $('div', 'joy-knob', joyBase);
    let joyId = null, joyCx = 0, joyCy = 0, camId = null, camX = 0, camY = 0;
    let pinchId = null, pinX = 0, pinY = 0, pinD = 0; // 두 손가락 벌리기/오므리기 = 확대·축소
    const R = 55;
    layer.addEventListener('pointerdown', (e) => {
      if (e.clientX < window.innerWidth * 0.45 && joyId === null) {
        joyId = e.pointerId; joyCx = e.clientX; joyCy = e.clientY;
        joyBase.style.left = (joyCx - R) + 'px'; joyBase.style.top = (joyCy - R) + 'px';
        joyBase.classList.add('on');
        input.touchMove.active = true; input.touchMove.x = 0; input.touchMove.y = 0;
      } else if (camId === null) { camId = e.pointerId; camX = e.clientX; camY = e.clientY; }
      else if (pinchId === null && e.clientX >= window.innerWidth * 0.45) { pinchId = e.pointerId; pinX = e.clientX; pinY = e.clientY; pinD = Math.hypot(pinX - camX, pinY - camY); }
      layer.setPointerCapture(e.pointerId);
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) {
        let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.touchMove.x = dx / R; input.touchMove.y = -dy / R;
      } else if (e.pointerId === camId || e.pointerId === pinchId) {
        if (pinchId !== null) { // 두 손가락: 확대·축소만
          if (e.pointerId === camId) { camX = e.clientX; camY = e.clientY; } else { pinX = e.clientX; pinY = e.clientY; }
          const d = Math.hypot(pinX - camX, pinY - camY);
          if (pinD > 10 && d > 10) { input.zoomSteps += Math.log(pinD / d) / Math.log(1.15) * 1.3; pinD = d; }
        } else {
          input.touchCamera(e.clientX - camX, e.clientY - camY);
          camX = e.clientX; camY = e.clientY;
        }
      }
    });
    const end = (e) => {
      if (e.pointerId === joyId) {
        joyId = null; input.touchMove.active = false; input.touchMove.x = 0; input.touchMove.y = 0;
        joyKnob.style.transform = ''; joyBase.classList.remove('on');
      }
      if (e.pointerId === camId) { camId = pinchId; camX = pinX; camY = pinY; pinchId = null; }
      else if (e.pointerId === pinchId) pinchId = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    layer.addEventListener('lostpointercapture', end);
    // 화면에 손가락이 하나도 없으면 전부 초기화 (iOS에서 손가락 떼는 신호를 놓치는 경우 대비)
    const resetAll = (e) => {
      const ids = new Set([...(e.touches || [])].map((t) => t.identifier));
      if (ids.size === 0) {
        if (joyId !== null) { joyId = null; input.touchMove.active = false; input.touchMove.x = 0; input.touchMove.y = 0; joyKnob.style.transform = ''; joyBase.classList.remove('on'); }
        camId = null; pinchId = null;
      } else if (ids.size === 1) pinchId = null; // 한 손가락만 남으면 확대·축소 끝
    };
    window.addEventListener('touchend', resetAll, true);
    window.addEventListener('touchcancel', resetAll, true);
    const mk = (name, label, cls) => {
      const b = $('div', 'tbtn ' + cls, this.root, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down'); input.pressTouch(name); });
      const up = () => { b.classList.remove('down'); input.releaseTouch(name); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      return b;
    };
    mk('a', 'A<small>점프</small>', 'tbtn-a');
    mk('b', 'B<small>스핀</small>', 'tbtn-b');
    mk('c', 'C<small>구르기</small>', 'tbtn-c');
  }

  toast(text, cls = '') {
    const t = $('div', 'toast ' + cls, this.toastBox, text);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 3000);
  }
  flash(color) {
    this.flashEl.style.transition = 'none'; this.flashEl.style.background = color; this.flashEl.style.opacity = 1;
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity 1.2s'; this.flashEl.style.opacity = 0;
  }
  setQuest(title, text) {
    this.questTitle.textContent = title;
    this.questText.textContent = text;
    this.quest.classList.remove('pop'); void this.quest.offsetWidth; this.quest.classList.add('pop');
  }
  setBoss(name, frac) {
    if (name == null) { this.boss.classList.remove('on'); return; }
    this.boss.classList.add('on');
    this.bossName.textContent = name;
    this.bossFill.style.width = Math.max(0, frac * 100) + '%';
  }

  update(p, missions, questDist, stats) {
    const hp = Math.max(0, Math.round(p.health));
    this.hpFill.style.width = hp + '%';
    this.hpFill.style.background = hp > 50 ? '#3ddc5a' : hp > 25 ? '#ffc233' : '#ff4040';
    this.hpText.textContent = hp + '%';
    this.ringText.textContent = p.rings;
    this.ringText.parentElement.classList.toggle('zero', p.rings === 0);
    let st = '';
    if (p.superOn) st = `✨ ${NAMES.superForm} 변신 중! (속도 ×${CFG.super.speedMul})`;
    else if (p.canTransform()) st = `✨ 점프를 꾹 눌러 ${NAMES.superForm} 변신!`;
    if (p.superOn) st += ' (점프 꾹: 변신 풀기)';
    if (!p.superOn && p.superCD > 0) st = `✨ 다시 변신까지 ${Math.ceil(p.superCD)}초`;
    if (p.kind === 'blink' && p.superOn) st += p.ultCD > 0 ? ` 🌑 ${Math.ceil(p.ultCD)}초` : ' 🌑 C 꾹: 블랙홀!';
    if (p.kind === 'flyer' && p.superOn && p.tornadoCD > 0) st += ` 🌪 ${Math.ceil(p.tornadoCD)}초`;
    this.superText.textContent = st;
    const showGauge = p.kind === 'flyer' && !p.superOn && (p.flying || p.flyGauge < CFG.flyer.gaugeMax);
    this.gauge.classList.toggle('on', showGauge);
    if (showGauge) {
      this.gaugeFill.style.width = (p.flyGauge / CFG.flyer.gaugeMax * 100) + '%';
      const left = p.flying ? Math.max(0, Math.ceil(CFG.flyer.maxTime - (p.flyTime || 0))) : null;
      const label = left === null ? '비행' : left > 0 ? `비행 ${left}초` : '비행 끝';
      if (this.gaugeLabel.textContent !== label) this.gaugeLabel.textContent = label;
    }
    const under = !!this.underwaterOn;
    if (this.underEl.classList.contains('on') !== under) this.underEl.classList.toggle('on', under);
    // 속도 단계
    this.gearCells.forEach((c, i) => { c.classList.toggle('lit', i < p.gear && p.s > 0.5); c.classList.toggle('max', p.gear === 3 && i === 2 && p.s > 0.5); });
    const sp = p.state === 'air' ? Math.hypot(p.vel.x, p.vel.z) : Math.abs(p.s);
    this.speedText.textContent = Math.round(sp * 3.6) + ' km/h';
    this.speedo.classList.toggle('super', p.superOn);

    this.slotHeart.querySelector('.slot-count').textContent = p.storedHearts;
    this.slotHeart.classList.toggle('empty', p.storedHearts === 0);
    this.questDist.textContent = questDist != null ? `${Math.round(questDist)}m` : '';
  }

  // 큰 지도: 맵 전체 + 랜드마크 이름 + 나와 친구 위치
  drawBigMap(player, world, questTarget) {
    const ctx = this.bigCv.getContext('2d'), Wd = 640, half = world.mapHalf || 1800, k = Wd / (half * 2);
    const M = (x, z) => [Wd / 2 - x * k, Wd / 2 - z * k]; // 미니맵과 같은 방향 (처음 출발 방향이 위쪽)
    ctx.clearRect(0, 0, Wd, Wd);
    if (world.mapCanvas) { ctx.save(); ctx.translate(Wd, Wd); ctx.rotate(Math.PI); ctx.drawImage(world.mapCanvas, 0, 0, Wd, Wd); ctx.restore(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of world.landmarks || []) {
      const [x, y] = M(L.x, L.z);
      ctx.font = '22px sans-serif'; ctx.fillText(L.icon, x, y);
      ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(L.name, x, y + 17); ctx.fillStyle = '#fff'; ctx.fillText(L.name, x, y + 17);
    }
    const dot = (x, z, color, label, r = 7) => { const [px, py] = M(x, z); ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); ctx.stroke(); if (label) { ctx.font = 'bold 13px sans-serif'; ctx.lineWidth = 3; ctx.strokeText(label, px, py - 15); ctx.fillStyle = '#fff'; ctx.fillText(label, px, py - 15); } };
    if (questTarget) dot(questTarget.x, questTarget.z, '#ffe600', '목표', 7);
    if (this.friends) for (const r of this.friends.values()) if (r.view.root.visible) dot(r.pos.x, r.pos.z, '#7df0ff', 'P' + r.num);
    dot(player.pos.x, player.pos.z, '#ff4d4d', '나', 8);
  }
  drawMinimap(player, world, enemies, questTarget, camYaw, boss) {
    if (this.bigOpen) this.drawBigMap(player, world, questTarget);
    const ctx = this.mapCtx, W = 180, H = 180, scale = 0.38;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2d4a30'; ctx.fillRect(0, 0, W, H);
    const cs = Math.cos(camYaw), sn = Math.sin(camYaw);
    const S = (x, z) => { const dx = x - player.pos.x, dz = z - player.pos.z; return [W / 2 + (-dx * cs + dz * sn) * scale, H / 2 - (dx * sn + dz * cs) * scale]; };
    // 지형 그림 (카메라 방향이 위로 오도록 돌려서)
    if (world.mapCanvas) {
      const half = world.mapHalf, k = half * 2 / world.mapCanvas.width;
      const X0 = -half - player.pos.x, Z0 = -half - player.pos.z;
      ctx.save();
      ctx.setTransform(-cs * scale * k, -sn * scale * k, sn * scale * k, -cs * scale * k, W / 2 + scale * (-cs * X0 + sn * Z0), H / 2 + scale * (-sn * X0 - cs * Z0));
      ctx.globalAlpha = 0.9;
      ctx.drawImage(world.mapCanvas, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = '#ffb02e';
    for (const L of world.loops) { const [px, pz] = S(L.base.x, L.base.z); ctx.beginPath(); ctx.arc(px, pz, 4, 0, 7); ctx.fill(); }
    for (const c of world.checkpoints) { const [px, pz] = S(c.pos.x, c.pos.z); ctx.fillStyle = c.active ? '#ffe14d' : '#9a8a40'; ctx.fillRect(px - 3, pz - 3, 6, 6); }
    ctx.fillStyle = '#ff3030';
    for (const e of enemies.list) { if (!e.alive || e.asleep) continue; const [px, pz] = S(e.pos.x, e.pos.z); ctx.beginPath(); ctx.arc(px, pz, 2.2, 0, 7); ctx.fill(); }
    if (this.friends) { ctx.save(); ctx.fillStyle = '#7df0ff'; ctx.strokeStyle = '#003'; ctx.lineWidth = 1.5; for (const r of this.friends.values()) { if (!r.view.root.visible) continue; const [px, pz] = S(r.pos.x, r.pos.z); ctx.beginPath(); ctx.arc(px, pz, 4, 0, 7); ctx.fill(); ctx.stroke(); } ctx.restore(); }
    const pin = (x, z, color, r) => {
      let [px, pz] = S(x, z);
      const dx = px - W / 2, dz = pz - H / 2, l = Math.hypot(dx, dz), max = W / 2 - 10;
      if (l > max) { px = W / 2 + dx / l * max; pz = H / 2 + dz / l * max; }
      ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, pz, r, 0, 7); ctx.fill(); ctx.stroke();
    };
    // 랜드마크 그림
    ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const L of world.landmarks || []) { const [px, pz] = S(L.x, L.z); if (Math.hypot(px - W / 2, pz - H / 2) < W / 2 - 8) ctx.fillText(L.icon, px, pz); }
    // 같이 하는 친구: 멀리 있으면 가장자리에 방향 + 거리
    if (this.friends) for (const r of this.friends.values()) {
      if (!r.view.root.visible) continue;
      let [px, pz] = S(r.pos.x, r.pos.z);
      const dx = px - W / 2, dz = pz - H / 2, l = Math.hypot(dx, dz), max = W / 2 - 12;
      const far = l > max; if (far) { px = W / 2 + dx / l * max; pz = H / 2 + dz / l * max; }
      ctx.fillStyle = '#7df0ff'; ctx.strokeStyle = '#003'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, pz, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#003'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('P' + r.num, px, pz + 0.5);
      if (far) { const d = Math.round(Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z)); ctx.font = 'bold 10px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(d + 'm', px - dx / l * 16, pz - dz / l * 16); ctx.fillStyle = '#fff'; ctx.fillText(d + 'm', px - dx / l * 16, pz - dz / l * 16); }
    }
    if (questTarget) pin(questTarget.x, questTarget.z, '#ffe600', 6);
    if (boss && boss.spawned && boss.alive) pin(boss.pos.x, boss.pos.z, '#ff2020', 8);
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-(player.yaw - camYaw));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  setFade(v) { this.fade.style.opacity = v; }
}
