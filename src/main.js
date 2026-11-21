// 게임 시작점
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { NAMES } from './names.js';
import { Input } from './input.js';
import { initSound as initAudio, SFX, SFX_INFO, BGM_INFO, playMusic, playVoice, stopVoice } from './audio.js';
import { World, ZONES, ICE_PEAK, SKY_HOLES } from './world.js';
import { Graphics, createRenderer } from './graphics.js';
import { Rings } from './rings.js';
import { Enemies, Pickups } from './enemies.js';
import { Effects } from './fx.js';
import { HUD } from './hud.js';
import { Missions } from './missions.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Boss } from './boss.js';
import { CHARACTER_DEFS } from './character.js';
import { Cinematic, V } from './cinematic.js';
import { Scientist, GearHologram, LINES, RADIO_FRIEND, makeShuttle, makeGearPod, makeBattleship } from './story.js';
import { loadProgress, recoverCrystal, BIG_CRYSTALS, markReached, addHullHole, resetForNewGamePlus, markFinalClear } from './progress.js';
import { readSave, hasAnySave, makeNewGamePlusSlot } from './save.js';
import { Shmup } from './shmup.js';
import { robotMesh } from './enemies.js';
import { PauseMenu, showLoadList } from './menu.js';
import { Guardians } from './guardian.js';
import { Net, P_COLORS } from './net.js';

function showError(msg) {
  let box = document.getElementById('err');
  if (!box) { box = document.createElement('div'); box.id = 'err'; document.body.appendChild(box); }
  box.textContent += msg + '\n';
}
window.addEventListener('error', (e) => showError('오류: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', (e) => showError('오류: ' + (e.reason && e.reason.message || e.reason)));

// ---- 스테이지 정보 ----
const STAGES = [ // 6스테이지까지 예정 (5·6은 준비 중)
  { theme: 'forest', place: '숲', big: '녹슨 대공장' },
  { theme: 'ice', place: '얼음 나라', big: '얼어붙은 대공장' },
  { theme: 'lava', place: '용암 섬', big: '불타는 대공장' },
  { theme: 'sky', place: '하늘 도시', big: '구름 위 대공장' },
  { theme: 'ship', place: '우주 요새', big: '중앙 동력실' },
  { theme: 'space', place: '최후의 결전', big: '' },
];
const params = new URLSearchParams(location.search);
const stageIdx = Math.min(STAGES.length - 1, Math.max(0, parseInt(params.get('stage') || '0', 10) || 0));
const STAGE = STAGES[stageIdx];
let carry = null;
try { carry = JSON.parse(sessionStorage.getItem('sf-carry') || 'null'); } catch (e) {}
const TIPS = [
  '방향키를 계속 누르고 달리면 1단 → 2단 → 3단으로 점점 빨라져요!',
  '스핀으로 튀어나간 뒤 방향키를 계속 누르면 그 속도 그대로 달려요.',
  '360도 루프는 3단 속도나 스핀 대시로 똑바로 들어가야 돌 수 있어요.',
  '빠르게 달리면 물 위도 달릴 수 있어요!',
  '노란 별 장판을 밟으면 체크포인트가 저장돼요.',
  '금 간 벽은 파워형이나 슈퍼 상태일 때 부술 수 있어요.',
  '보스가 주저앉아 핵이 빛날 때 공격하세요!',
  '얼음 나라에서는 슈퍼 상태로 땅을 내리치면 눈이 녹아요!',
  '용암 섬: 용암에 빠지면 링의 30%를 잃고 체크포인트에서 다시 시작해요.',
  '하늘 도시: 구멍 아래 구름을 세 번 연달아 밟으면 땅 위까지 높이 튀어 올라요!',
];
document.getElementById('loading-stage').textContent = `STAGE ${stageIdx + 1}`;
document.getElementById('loading-title').textContent = NAMES.stages[stageIdx];
document.getElementById('loading-tip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const loadSlot = parseInt(params.get('load') || '0', 10);
const LOAD = loadSlot ? readSave(loadSlot) : null;
const game = { time: 0, freezeT: 0, players: [], hard: LOAD ? !!LOAD.hard : !!(stageIdx > 0 && carry?.hard) };
game.ngplus = LOAD ? !!LOAD.ngplus : !!(stageIdx > 0 && carry?.ngplus); // 새게임+: 크리스탈을 모두 가진 채, 훨씬 어렵게
if (LOAD?.ngFresh) resetForNewGamePlus(); // 새게임+를 처음 시작: 우주선 외벽 구멍 등 완전 초기화
if (game.ngplus) for (const k of ['enemyHp', 'enemySpeed', 'damage', 'bossHp', 'bossSpeed']) CFG.hard[k] *= 1.25;
window.__game = game; // 테스트용

setTimeout(boot, 60); // 로딩 화면이 먼저 보이도록

function boot() {
  const renderer = createRenderer(isTouch);
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5200);
  game.scene = scene; game.camera = camera; game.renderer = renderer;

  const playerCount = 1; // 같이 하기는 4단계에서
  const scaleCount = (base) => Math.round(base * (1 + 0.75 * (playerCount - 1)));

  game.input = new Input(renderer.domElement);
  game.world = new World(scene, STAGE.theme, { mobile: isTouch, hullHoles: loadProgress().hullHoles });
  game.world.stream(game.world.spawn.pos, 0, true); // 시작 지점 주변 미리 만들기
  game.gfx = new Graphics(renderer, scene, camera, game.world, isTouch);
  game.fx = new Effects(scene, game);
  game.pickups = new Pickups(scene);
  game.enemies = new Enemies(scene, game.world, game.world.enemySpots, game.fx, game.pickups, game);
  game.rings = new Rings(scene, game.world, game.world.ringSpots);
  const missionSeed = LOAD ? LOAD.seed : 1001 + Math.floor(Math.random() * 100000);
  const makeMissions = (kind) => new Missions(missionSeed, { walls: kind === 'power' });
  game.missions = makeMissions(LOAD ? LOAD.char : 'speed');
  game.hud = new HUD(game.input);
  game.cam = new CameraRig(camera);
  const cine = new Cinematic();
  game.cine = cine;
  const sci = new Scientist(scene);
  const holo = new GearHologram(scene);
  const guardians = new Guardians(game);
  const W = game.world;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    game.gfx.resize(window.innerWidth, window.innerHeight);
  });

  // ---- 캐릭터 ----
  let pl = null;
  function setCharacter(kind) {
    if (pl) pl.dispose();
    pl = new Player(game, kind);
    pl.spawnAt(W.spawn.pos, W.spawn.yaw);
    game.player = pl; game.players = [pl];
    if (carry && stageIdx > 0) pl.storedHearts = carry.hearts || 0;
  }
  setCharacter(LOAD ? LOAD.char : carry?.char || 'speed');
  game.cam.yaw = W.spawn.yaw;
  playMusic('title');

  // ---- 시네마틱 도우미 ----
  const P = STAGE.place, VIL = NAMES.villain, SCI = NAMES.scientist;
  function playCine(shots, then) {
    game.hud.hide(true); game.pauseMenu?.enable(false);
    cine.play(shots, camera, () => {
      holo.hide();
      game.hud.hide(false); game.pauseMenu?.enable(true);
      game.cam.first = true; game.cam.yaw = pl.yaw;
      clockReset = true;
      then?.();
    });
  }
  // 한 지점 주위를 빙 돌며 보여주는 장면
  game.playCine = playCine;
  game.stageIdx = stageIdx;
  // ---- 월드 선택 (가 본 대지는 언제든 다시 갈 수 있음) ----
  const reached = markReached(stageIdx);
  let stageSel = stageIdx;
  const goStage = (i, stay = false) => { // stay: 그 대지의 시작 화면에서 멈춤 / 아니면 바로 시작
    try { sessionStorage.setItem('sf-carry', JSON.stringify({ char: pl.kind, hearts: pl.storedHearts, hard: game.hard, ngplus: game.ngplus, pick: stay })); if (!stay) sessionStorage.setItem('sf-autostart', '1'); } catch (e) {}
    location.href = `?stage=${i}`;
  };
  // ---- 같이 하기: 방 만들기 → 대기실(들어온 친구 보기, 캐릭터 고르기) → 방장이 시작 ----
  const $id = (id) => document.getElementById(id);
  const coopPanel = $id('coop-panel'), coopBadge = $id('coop-badge'), coopCode = $id('coop-code');
  const net = new Net(game, {
    getKind: () => pl.kind, isStarted: () => started, getStage: () => stageSel,
    getQuest: () => (q.i >= 0 ? q.i : (q.pending ?? 0)),
    onStart: (stage) => coopStart(stage), onQuest: (n, fromFriend) => syncQuest(n, fromFriend), onChange: () => renderCoop(),
    onGame: (m) => onNetGame(m),
  });
  game.net = net; game.hud.friends = net.remotes;
  game.rings.net = net;
  // 친구 쪽에서 온 몬스터·링·보스 소식
  function onNetGame(m) {
    const E = game.enemies;
    if (m.t === 'eh') { const e = E.list[m.i | 0]; if (e && Array.isArray(m.f)) E.hit(e, +m.d || 1, new THREE.Vector3(+m.f[0] || 0, +m.f[1] || 0, +m.f[2] || 0), +m.k || 10, !!m.l, true); }
    else if (m.t === 'rg') game.rings.takeRemote(m.i | 0);
    else if (m.t === 'tb') { // 친구가 부순 나무·바위
      const set = W.trees[m.k]; const ref = set && W.breakables.find((r) => r.set === set && r.idx === (m.i | 0));
      if (ref?.collider && W.breakTree(ref.collider)) { const t = ref.collider; game.fx.burst(new THREE.Vector3(t.x, t.y + 2, t.z), ref.kind === 'rock' ? 0x8f8b80 : 0x8b5a2b, 14, 8); }
    }
    else if (m.t === 'gd') { if (W.barrierUp) guardians.trigger(new THREE.Vector3(+m.x || 0, 0, +m.z || 0), false); } // 친구가 장벽을 넘음 → 모두에게 로봇 군단
    else if (m.t === 'go') { if (net.host && (m.stage | 0) === stageIdx + 1) net.startAll(stageIdx + 1); }       // 친구가 다음 대지 입구에 도착
    else if (m.t === 'wb') { const w = W.walls[m.i | 0]; if (w && !w.dead) pl.breakWall(w, true); }
    else if (m.t === 'ch') { const c = W.chests[m.i | 0]; if (c && !c.opened) { c.opened = true; const b = W.beacons.find((x) => x.name === c.name); if (b) b.found = true; game.hud.toast(`🎁 친구가 「${c.name}」 보물 상자를 열었어요!`); } }
    else if (m.t === 'bh') game.boss?.damage(+m.n || 1, null, true);
    else if (m.t === 'sn') W.meltSnow(new THREE.Vector3(+m.x || 0, 0, +m.z || 0), Math.min(40, +m.r || 0)); // 친구가 녹인 눈
    else if (m.t === 'ex') launchExit(true);
    else if (m.t === 'hh') { const h = W.breakHull?.(+m.a || 0, +m.y || 0); if (h) { addHullHole(h); game.fx.explosion(V(Math.cos(h.a) * CFG.world.barrierR, h.y + 1.5, Math.sin(h.a) * CFG.world.barrierR), 1.5); } }
    else if ((m.t === 'sx' || m.t === 'sd' || m.t === 'sh') && game.shmup) { if (m.t === 'sx' && !game.shmup.active && started) { if (cine.active) cine.skip(); game.shmup.start(+m.tm || 0); } game.shmup.onNet(m); }                                                               // 친구가 대포·분출구를 탐 → 다 같이
    else if (m.t === 'ep' && !net.host && Array.isArray(m.a)) {
      for (let k = 0; k + 4 < m.a.length; k += 5) {
        const e = E.list[m.a[k] | 0]; if (!e || e.T.static) continue;
        if (!e.alive && e.dying <= 0) { e.alive = true; e.hp = e.maxHp; if (e.mesh) { e.mesh.visible = true; e.mesh.rotation.set(0, 0, 0); e.mesh.scale.setScalar(1); } e.pos.set(m.a[k + 1], m.a[k + 2], m.a[k + 3]); }
        (e.netPos ??= new THREE.Vector3()).set(m.a[k + 1], m.a[k + 2], m.a[k + 3]); e.netYaw = m.a[k + 4];
        if (e.pos.distanceTo(e.netPos) > 25 || e.asleep) { e.pos.copy(e.netPos); e.yaw = e.netYaw; } // 멀리 있던 몬스터는 바로 그 자리로
      }
    } else if (m.t === 'bp' && !net.host && game.boss && Array.isArray(m.p)) {
      game.boss.netPos = new THREE.Vector3(+m.p[0], +m.p[1], +m.p[2]); game.boss.netYaw = +m.y;
    }
  }
  function pickChar(k) {
    for (const el of $id('cards').children) el.classList.toggle('sel', el.dataset.kind === k);
    if (k !== pl.kind) { setCharacter(k); if (started) { pl.spawnAt(W.nearestCheckpoint(game.player.pos).pos.clone().add(V(0, 0.3, 0)), 0); } }
    net.pick(k); renderCoop();
  }
  function renderCoop() {
    const inRoom = !!net.code;
    $id('coop-entry').style.display = inRoom ? 'none' : '';
    $id('coop-lobby').style.display = inRoom ? '' : 'none';
    $id('coop-leave').style.display = inRoom ? '' : 'none';
    $id('coop-status').textContent = net.status;
    coopBadge.classList.toggle('on', inRoom);
    coopBadge.textContent = inRoom ? `👥 방 ${net.code} · ${net.count}명` : '';
    if (!inRoom) return;
    $id('coop-roomcode').textContent = net.code;
    const mem = net.members, myId = net.peer?.id;
    $id('coop-members').innerHTML = [0, 1, 2, 3].map((i) => {
      const m = mem[i];
      if (!m) return `<div class="coop-mem empty">P${i + 1} · 빈 자리</div>`;
      return `<div class="coop-mem${m.id === myId ? ' me' : ''}" style="color:${P_COLORS[i]}">P${m.num} ${m.host ? '👑 ' : ''}${NAMES.characters[m.kind]}${m.id === myId ? ' (나)' : ''}</div>`;
    }).join('');
    $id('coop-chars').innerHTML = '';
    for (const k of kinds) { const b = document.createElement('button'); b.textContent = NAMES.characters[k]; b.className = k === pl.kind ? 'sel' : ''; b.onclick = () => pickChar(k); $id('coop-chars').appendChild(b); }
    $id('coop-stage-box').style.display = net.host && !started ? '' : 'none';
    $id('coop-stages').innerHTML = '';
    for (let i = 0; i < NAMES.stages.length; i++) { const b = document.createElement('button'); b.textContent = `${i + 1}. ${NAMES.stages[i]}`; b.disabled = i > reached; b.className = i === stageSel ? 'sel' : ''; b.onclick = () => { stageSel = i; net._roster(); renderCoop(); }; $id('coop-stages').appendChild(b); }
    $id('coop-start').style.display = net.host && !started ? '' : 'none';
    $id('coop-start').textContent = `▶ 다 같이 시작! (${net.count}명)`;
    $id('coop-wait').textContent = started ? '🎮 게임 중 — 닫기를 누르고 같이 놀아요!' : net.host ? '' : '방장이 시작하기를 기다리는 중… 그동안 캐릭터를 골라요!';
  }
  function coopStart(stage) {
    coopPanel.classList.remove('on');
    if (stage !== stageIdx) { goStage(stage); return; }
    if (!started) startGame().then(() => setTimeout(() => { if (net.lastQuest) syncQuest(net.lastQuest, true); }, 600));
  }
  const openCoop = () => { coopPanel.classList.add('on'); renderCoop(); };
  $id('coop-btn').addEventListener('click', openCoop);
  $id('coop-close').addEventListener('click', () => coopPanel.classList.remove('on'));
  $id('coop-host').addEventListener('click', () => net.createRoom());
  $id('coop-join').addEventListener('click', () => net.joinRoom(coopCode.value));
  $id('coop-start').addEventListener('click', () => net.startAll(stageSel));
  coopCode.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') net.joinRoom(coopCode.value); });
  $id('coop-leave').addEventListener('click', () => { net.leave(); renderCoop(); });
  game.openCoop = openCoop;
  const orbit = (c, dist, h, a0, a1, dur, text, who, extra = {}) => ({
    from: { pos: V(c.x + Math.sin(a0) * dist, c.y + h, c.z + Math.cos(a0) * dist), look: c.clone().add(V(0, 3, 0)) },
    to: { pos: V(c.x + Math.sin(a1) * dist, c.y + h * 0.85, c.z + Math.cos(a1) * dist), look: c.clone().add(V(0, 3, 0)) },
    dur, text, who, ...extra,
  });
  const playerShot = (text, who) => ({
    from: () => ({ pos: pl.pos.clone().add(V(Math.sin(pl.yaw) * 4.5, 1.8, Math.cos(pl.yaw) * 4.5)), look: pl.pos.clone().add(V(0, 1.3, 0)) }),
    to: () => ({ pos: pl.pos.clone().add(V(Math.sin(pl.yaw + 0.4) * 3.6, 1.6, Math.cos(pl.yaw + 0.4) * 3.6)), look: pl.pos.clone().add(V(0, 1.3, 0)) }),
    dur: 3, text, who,
  });
  const barrierShot = (ang, text, who, closer = false) => {
    const bx = Math.sin(ang) * CFG.world.barrierR, bz = Math.cos(ang) * CFG.world.barrierR, k = closer ? 0.94 : 0.85;
    return { from: { pos: V(bx * k - Math.cos(ang) * 40, closer ? 10 : 30, bz * k + Math.sin(ang) * 40), look: V(bx, closer ? 40 : 22, bz) },
      to: { pos: V(bx * k + Math.cos(ang) * 40, closer ? 8 : 24, bz * k - Math.sin(ang) * 40), look: V(bx * 1.08, closer ? 45 : 26, bz * 1.08) }, dur: 4, text, who };
  };
  const Tq = W.questTargets;
  const rust = V(ZONES.rust.x, W.groundAt(ZONES.rust.x, ZONES.rust.z), ZONES.rust.z);

  // ---- 이야기 대사 (docs/스토리.md 기준) ----
  // 대지의 크리스탈은 각 대지 한가운데 땅속 깊이 잠들어 있음 → 기어 군단이 굴착기로 파내서 관을 꽂아 힘을 뽑아 감
  const CRY = BIG_CRYSTALS[Math.min(stageIdx, BIG_CRYSTALS.length - 1)].name, EMP = NAMES.empire;
  const nm = (k) => NAMES.characters[k];
  const friendKind = () => RADIO_FRIEND[pl.kind];
  const radio = () => `${nm(friendKind())} (무전):`;
  const me = () => `${nm(pl.kind)}:`;
  const COMMON_CER = ['그때, 거대한 크리스탈이 환하게 빛나며 점점 작아지기 시작해요...', '자격이 있는 자여... 그대에게 크리스탈 수호자의 직분을 맡기노라. 이제 그대가 나를 지켜 다오.', `${CRY}이(가) 작은 보석이 되어 손에 내려앉았어요. 이제 ${CRY}의 수호자예요!`];
  const COMMON = { // 2스테이지부터 퀘스트 2~5 공통 대사 (장소 이름만 바뀜)
    q2: ['또 왔냐?! 공장은 또 만들면 그만이라고!', '저 공장에 동물 친구들이 갇혀 있어요!', '공장 안 친구들을 구하고 생산 기계를 멈추자!'],
    q3: [`렌치! ${STAGE.big}을 가동해라!`, '네, 넵! 기어님!', `${STAGE.big}이 빼앗은 크리스탈의 힘으로 더 강한 로봇을 만들고 있어요!`, '쳐들어가자!'],
    flee: ['으악! 또야?! 기어님께 혼나겠어~!', `${SCI}가 또 도망쳐요!`],
    q4: `${SCI}가 연구소로 숨었어요.`,
    // 크리스탈 수호자: 스테이지를 깨면 거대한 크리스탈이 작은 보석이 되어 주인공에게
    cer: ['그때, 거대한 크리스탈이 환하게 빛나며 점점 작아지기 시작해요...', '자격이 있는 자여... 그대에게 크리스탈 수호자의 직분을 맡기노라. 이제 그대가 나를 지켜 다오.', `${CRY}이(가) 작은 보석이 되어 손에 내려앉았어요. 이제 ${CRY}의 수호자예요!`],
    boss: ['이번엔 다를걸? 크리스탈의 힘을 가득 채웠다고!', '하늘에서 거대한 로봇이 내려왔어요!', `${NAMES.finalBoss}, 출동!`, '충격파는 점프로 피하고, 주저앉아 핵이 빛날 때 공격!'],
  };
  const ME = nm(pl.kind);
  const STORY = [
    { // 1. 숲
      intro: [
        `${NAMES.island} 숲 한가운데, 땅속 깊은 곳에는 숲에 풍요를 주는 ${CRY}이(가) 잠들어 있었어요.`,
        `그런데 어느 날, ${VIL}의 로봇 군단이 숲을 빙 둘러쌌어요!`,
        '거대한 굴착기가 숲 한가운데 땅을 파헤치기 시작했어요! 쿠르르릉...!',
        `땅속에서 ${CRY}이(가) 드러나자, 로봇들이 관을 꽂아 크리스탈의 힘을 쭉쭉 뽑아 가요!`,
        '숲의 동물 친구들은 붙잡혀서 로봇 안에 갇혀 버렸어요...',
        `와하하! 크리스탈의 힘은 이제 이 천재 ${VIL}님 거다! 이 숲은 위대한 ${EMP}의 첫 번째 땅이 될 것이다!`,
        '숲 한가운데에 로봇 군단에 명령을 보내는 로봇 기지가 생겼어요.',
        '로봇을 부수면 안에 갇힌 동물 친구들이 풀려나! 먼저 기지의 안테나 탑을 부수자!',
      ],
      q2: ['으앗, 안테나 탑이! 괘, 괜찮아! 공장에서 로봇은 얼마든지 다시 만들 수 있다고!', '저 공장에서 동물 친구들을 잡아다 로봇 안에 가두고 있어요!', '공장 안으로 들어가서 친구들을 다 구하고, 생산 기계를 멈추자!'],
      q3: ['렌치! 이 멍청이! 작은 공장 하나 지키지도 못하다니! 녹슨 대공장을 전부 가동해라!', '히익! 네, 넵! 기어님!', '대공장의 파이프가 크리스탈 구덩이까지 이어져 있어요. 빼앗은 크리스탈의 힘으로 더 강한 로봇을 만들고 있어요!', '대공장을 멈추면 크리스탈의 힘이 덜 빠져나가! 쳐들어가자!'],
      flee: ['으악! 내 대공장이...! 기어님께 혼나겠어~!', `${SCI}가 보라 늪 쪽으로 허둥지둥 도망쳐요!`],
      q4: '보라 늪 한가운데의 과학 연구소. 빼앗은 크리스탈의 힘이 저기 모이고 있어요.',
      boss: ['여기까지 쫓아오다니! 하지만 크리스탈의 힘을 가득 채운 내 최고 걸작을 보면 깜짝 놀랄걸?', '하늘에서 거대한 로봇이 내려왔어요!', `${NAMES.finalBoss}, 출동! 기어님께 칭찬받을 테다!`, '보스는 숲 어디든 쫓아와요! 충격파는 점프로 피하고, 주저앉아 핵이 빛날 때 공격!'],
      cer: COMMON_CER,
      end: [`${NAMES.finalBoss}가 쓰러지자, 빼앗겼던 크리스탈의 힘이 ${CRY}(으)로 돌아가요!`, `관이 모두 끊어지고 ${CRY}이(가) 다시 환하게 빛나요. 숲에 풍요가 돌아왔어요!`, '으아앙! 기어님께 이를 거야~!', '숲을 둘러싼 기계들도 무너져 내려요!', '크윽...! 숲 하나쯤 줘 버리지! 얼음 나라의 크리스탈은 이미 내 손 안에 있다! 와하하!', '얼음 나라가 위험해! 북쪽 눈길을 따라 얼음 나라로 가자!'],
    },
    { // 2. 얼음 나라: 장벽보다 높은 얼음산 꼭대기에서 뛰어내리며 시작
      intro: [
        '북쪽 눈길 끝까지 달려왔더니... 구름까지 닿는 거대한 얼음산 꼭대기예요!',
        '아래를 내려다보니, 높은 장벽에 빙 둘러싸인 얼음 나라가 보여요!',
        `얼음 나라 한가운데에서도 굴착기가 땅을 파헤쳐 ${CRY}을(를) 꺼내고 있어요!`,
        `와하하! 여기까지 왔구나! 하지만 장벽 밖으로 나가면 내 기어 군단이 가만두지 않을 거다!`,
        '좋아, 여기서 아래로 뛰어내려서 바로 쳐들어가자!',
        '조심해! 얼음산은 장벽보다 높아서 엉뚱한 쪽으로 뛰면 장벽 밖으로 떨어질 수 있어!',
      ],
      ...COMMON,
      boss: ['이번엔 다를걸? 내 거대 대포 맛 좀 봐라!', '하늘에서 거대 대포를 등에 멘 로봇이 내려왔어요!', `${NAMES.finalBoss}, 대포 발사 준비!`, '빨간 원이 보이면 포탄이 떨어져요! 원 밖으로 피하고, 주저앉아 핵이 빛날 때 공격!'],
      end: [`${NAMES.finalBoss}가 쓰러지자, 빼앗겼던 힘이 ${CRY}(으)로 돌아가요!`, '', '으아앙~! 내 대포까지 두고 가야 하다니!', '얼음 나라를 둘러싼 기계들이 무너져요!', '흥! 다음은 용암 섬이다! 끝없는 용암 바다 한가운데라서 아무도 못 올걸? 와하하!', ''],
      collapse: ['쿠구구궁...! 크리스탈이 떠나자 얼음 나라가 무너지기 시작해요!', `렌치 박사가 쓰던 거대 대포가 남아 있어! 저걸 타고 탈출하자!`],
    },
    { // 3. 용암 섬: 대포를 타고 날아와 떨어지며 시작 (벽 없음, 용암에 빠지면 링 30% 잃음)
      intro: [
        '무너지는 얼음 나라에서 거대 대포로 슝~! 하늘을 가로질러 날아간 곳은...',
        '끝없는 용암 바다 한가운데에 떠 있는 용암 섬! 살아 있는 것은 아무것도 없는 뜨거운 땅이에요. 벽이 없는 대신, 섬 밖은 온통 용암!',
        `섬 한가운데에는 모든 것을 부술 수 있는 힘을 가진 ${CRY}이(가) 잠들어 있었어요. 굴착기가 그것을 파내고 있어요!`,
        `와하하! ${CRY}의 힘만 있으면 무엇이든 부숴 버릴 수 있다! 용암에 빠지면 링을 잃고 처음부터다!`,
        '앗 뜨거! 용암은 조심조심 피해서 달리자!',
        '먼저 로봇 기지의 안테나 탑부터 부수자!',
      ],
      ...COMMON,
      end: [`${NAMES.finalBoss}가 쓰러지자, 빼앗겼던 힘이 ${CRY}(으)로 돌아가요!`, '', '으아앙~! 뜨거워! 기어님~!', '', '크으윽! 하지만 하늘 기지는 절대 못 올 거다! 구름 위에 있으니까! 와하하!', ''],
      escape: ['콰르르릉!!! 크리스탈이 떠나자 용암 섬이 폭발하기 시작해요!', '로봇 군단이 모두 하늘로 도망쳐요!', `${'${ME}'}이(가) 날아오르는 로봇을 꽉 붙잡았어요!`, '꽉 잡아! 이대로 저 로봇들의 하늘 기지까지 따라가자!'],
    },
    { // 4. 하늘 도시: 분출구를 타고 구름을 뚫고 솟아오르며 시작 (구멍 아래 구름은 푹신, 끝 너머는 낭떠러지)
      intro: [
        '도망치는 로봇에 매달려 구름을 뚫고 올라가자... 하늘 위에 떠 있는 기어 군단의 하늘 기지가 나타났어요!',
        '땅 곳곳에 구멍이 뚫려 있어요. 떨어져도 푹신한 구름이 튕겨 줘요. 세 번 연달아 밟으면 땅 위까지 높이 튀어 올라요!',
        '하지만 도시 끝 너머로 나가면 끝없이 떨어져 버려요! 끝은 거인 로봇들이 지키고 있어요.',
        `도시 한가운데에서도 굴착기가 ${CRY}을(를) 파내고 있어요!`,
        `와하하! 여기까지 오다니! 하지만 이 하늘 도시는 ${EMP}의 수도다!`,
        '높은 곳이라고 겁먹을 줄 알고? 가자!',
        '먼저 로봇 기지의 안테나 탑부터 부수자!',
      ],
      ...COMMON,
      end: [`${NAMES.finalBoss}가 쓰러지자, 빼앗겼던 힘이 ${CRY}(으)로 돌아가요!`, '', '으아앙~! 기어님~!', '', '크윽...! 진짜 본거지에서 보자! 우주에서 기다리마! 와하하!', ''],
      escape: [`${VIL}이(가) 작은 비행접시를 타고 하늘 위로 도망쳐요!`, `${'${ME}'}이(가) 기지에 있던 작은 우주선에 뛰어올랐어요!`, '놓칠 줄 알고? 우주까지 쫓아가자!'],
    },
    { // 5. 우주 요새: 맵 전체가 닥터 기어의 거대 우주선 (진짜 본거지)
      intro: [
        '작은 우주선을 타고 하늘 너머 우주로... 그곳엔 상상도 못 할 만큼 거대한 우주선이 떠 있었어요!',
        '작은 우주선이 거대 우주선의 격납고에 철컥! 도킹했어요. 여기가 바로 기어 제국의 진짜 본거지!',
        `이 우주선의 한가운데에는 우주를 만드는 힘을 가진 ${CRY}이(가) 있어요. 기어는 이미 그것을 훔쳐 우주선의 동력으로 쓰고 있어요!`,
        `와하하! 여기까지 오다니! 하지만 이곳은 내 본거지! 가장 크고 강한 로봇들이 기다리고 있다!`,
        '벽 너머는 우주야... 그래도 겁 안 나! 가자!',
        '조심해! 우주선 외벽에 구멍을 뚫으면 바깥은 진짜 우주야. 떨어지면 지구까지 떨어져!',
      ],
      ...COMMON,
      end: [`${NAMES.finalBoss}가 쓰러지자, 우주선의 동력이 꺼지고 ${CRY}이(가) 풀려나요!`, '', '으아앙~! 본거지가...!', '', '와하하! 아직 끝나지 않았다! 내 최종 전함이 남아 있다!', ''],
      escape: [`${VIL}이(가) 최종 전함을 타고 우주 저편으로 도망쳐요!`, '다섯 크리스탈의 힘이 모두 모였어요! 이제 언제든 슈퍼로 변신할 수 있어요!', '놓칠 줄 알고? 슈퍼 변신! 쫓아가자!'],
    },
    { // 6. 최후의 결전: 슈퍼 상태로 우주를 날며 싸움
      intro: [
        '슈퍼 상태로 빛나며 우주를 날아, 닥터 기어의 최종 전함을 쫓아가요!',
        `와하하! 여기까지 쫓아오다니! 내 함대가 너희를 기다리고 있다!`,
        '날아오는 미사일을 피하면서 함대를 모두 물리치자! (A 대시 · B 오로라 · C 궁극기)',
      ],
      ending: [
        '닥터 기어의 최종 전함이 불꽃을 내뿜으며 떨어지기 시작해요!',
        '슈퍼 상태의 빛을 내며, 지구로 안전하게 돌아가요...',
        '무사히 지구에 내려왔어요. 하늘을 올려다보니...',
        '저 멀리 하늘에서 닥터 기어의 우주선이 연기를 내뿜으며 떨어지고 있어요!',
        '으아아아~! 기억해라~! 다음엔 꼭... 꼬오옥...!',
        '다섯 크리스탈의 수호자 덕분에, 세상에 다시 평화가 찾아왔어요. 끝!',
      ],
    },
  ][stageIdx];

  // ---- 목소리 파일 이름표 (sounds/voice/아이디.mp3) ----
  const WHO = { intro: [['narr', 'narr', 'narr', 'narr', 'narr', 'gear', 'narr', 'friend'], ['narr', 'narr', 'narr', 'gear', 'player', 'friend'], ['narr', 'narr', 'narr', 'gear', 'player', 'friend'], ['narr', 'narr', 'narr', 'narr', 'gear', 'player', 'friend'], ['narr', 'narr', 'narr', 'gear', 'player', 'friend'], ['narr', 'gear', 'friend']][stageIdx],
    cer: ['narr', 'crystal', 'narr'], collapse: ['narr', 'friend'], escape: ['narr', 'narr', 'narr', 'player'], ending: ['narr', 'narr', 'narr', 'narr', 'gear', 'narr'],
    q2: ['wrench', 'narr', 'friend'], q3: ['gear', 'wrench', 'narr', 'friend'],
    flee: ['wrench', 'narr'], q4: ['narr'], boss: ['wrench', 'narr', 'wrench', 'narr'], end: ['narr', 'narr', 'wrench', 'narr', 'gear', 'friend'] };
  const VOICE = new Map(), voiceList = [];
  const regVoice = (id, who, text) => { if (!VOICE.has(text)) { VOICE.set(text, { id, who }); voiceList.push({ id, who, text }); } };
  for (const [k, arr] of Object.entries(STORY)) (Array.isArray(arr) ? arr : [arr]).forEach((t, i) => regVoice(`s${stageIdx + 1}_${k}_${i + 1}`, (WHO[k] || [])[i] || 'narr', t));
  for (const [kind, o] of Object.entries(LINES)) for (const [k, t] of Object.entries(o)) regVoice(`char_${kind}_${k}`, kind, t);
  const SEED_LINE = `이 땅을 아끼는 친구야... 내 힘을 빌려줄게! (링 ${CFG.super.ringsNeeded}개를 모으고 땅에서 점프를 꾹!)`;
  regVoice(`s${stageIdx + 1}_crystal`, 'crystal', SEED_LINE);
  cine.onLine = (text) => {
    const v = VOICE.get(text);
    if (!v) { stopVoice(); return; }
    const id = v.who === 'friend' ? `${v.id}_${RADIO_FRIEND[pl.kind]}` : v.who === 'player' ? `${v.id}_${pl.kind}` : v.id;
    playVoice(id);
  };
  cine.onStop = () => stopVoice();
  window.__soundCatalog = () => ({ sfx: SFX_INFO, bgm: BGM_INFO, voice: voiceList, friendKinds: [...new Set(Object.values(RADIO_FRIEND))], stage: stageIdx });

  // 하늘에 뜬 닥터 기어 홀로그램을 보여주는 장면
  const gearShot = (ang, text, extra = {}) => {
    const R = CFG.world.barrierR * 0.8;
    const hp = V(Math.sin(ang) * R, 30, Math.cos(ang) * R);
    const cam = V(Math.sin(ang) * (R - 70), 14, Math.cos(ang) * (R - 70));
    return { from: { pos: cam.clone().add(V(Math.cos(ang) * 12, 0, -Math.sin(ang) * 12)), look: hp.clone().add(V(0, 30, 0)) },
      to: { pos: cam.clone().add(V(-Math.cos(ang) * 6, -4, Math.sin(ang) * 6)), look: hp.clone().add(V(0, 36, 0)) },
      dur: 4, text, who: `${VIL}:`, ...extra,
      enter: () => { holo.show(hp, 9, V(0, 0, 0)); extra.enter?.(); } };
  };
  const hideHolo = (s) => ({ ...s, enter: () => { holo.hide(); s.enter?.(); } });
  const tree = Tq.crystal; // 크리스탈 구덩이
  const treeShot = (text, who, extra = {}) => ({
    from: { pos: tree.clone().add(V(-34, 18, 30)), look: tree.clone().add(V(0, 5, 0)) },
    to: { pos: tree.clone().add(V(-20, 11, 30)), look: tree.clone().add(V(0, 4, 0)) }, dur: 4.5, text, who, ...extra });
  // 굴착기가 땅을 파는 장면 (흙이 튀고 땅이 흔들림)
  const digShot = (text) => ({
    from: { pos: tree.clone().add(V(-70, 40, 58)), look: tree.clone().add(V(0, 8, 0)) }, to: { pos: tree.clone().add(V(-52, 30, 50)), look: tree.clone().add(V(0, 5, 0)) }, dur: 4.5, text,
    enter: () => { W.crystalState(1); SFX.explosion(); },
    tick: (dt, t) => { if (Math.random() < 0.5) game.fx.burst(tree.clone().add(V((Math.random() - 0.5) * 8, 3.5, (Math.random() - 0.5) * 8)), Math.random() < 0.5 ? STAGE_DIRT : 0x5a4a3a, 4, 9); camera.position.x += (Math.random() - 0.5) * 0.3; },
  });
  const crystalOut = (text) => ({ ...treeShot(text), enter: () => { W.crystalState(2); SFX.crystal(); for (let i = 0; i < 3; i++) setTimeout(() => game.fx.burst(tree.clone().add(V(0, 6 + i * 3, 0)), BIG_CRYSTAL_HEX, 18, 10), i * 250); } });

  const STAGE_DIRT = W.T.dirt, BIG_CRYSTAL_HEX = parseInt(BIG_CRYSTALS[Math.min(stageIdx, BIG_CRYSTALS.length - 1)].color.slice(1), 16);
  const peak = V(ICE_PEAK.x, W.spawn.pos.y, ICE_PEAK.z);
  // ---- 퀘스트 (스토리 순서) ----
  const kills = {};
  game.onEnemyDeath = (e) => { if (e.tag && !e.T.static) kills[e.tag] = (kills[e.tag] || 0) + 1; };
  const core = (tag) => game.enemies.list.find((e) => e.tag === tag && e.T.static);
  const tagCount = (tag) => game.enemies.list.filter((e) => e.tag === tag && !e.T.static).length;
  const q = { i: -1 };
  for (const e of game.enemies.list) if (e.T.static) e.shielded = true; // 퀘스트에서 주변 로봇을 물리치면 꺼짐
  const coreQuest = (tag, need, before, after) => ({
    start() { q.need = Math.min(scaleCount(need), tagCount(tag)); q.unshielded = false; },
    text: () => (kills[tag] || 0) < q.need ? `${before} (${Math.min(kills[tag] || 0, q.need)}/${q.need})` : after,
    tick() {
      const c = core(tag);
      if (!q.unshielded && (kills[tag] || 0) >= q.need) { q.unshielded = true; if (c) c.shielded = false; SFX.superReady(); game.hud.toast('🛡️ 보호막이 꺼졌다! 지금 부숴라!', 'gold'); }
    },
    done: () => { const c = core(tag); return !c || !c.alive; },
  });
  const S = STORY;
  const quests = [
    { ...coreQuest('base', 6, '기지를 지키는 로봇 물리치기', '안테나 탑을 부숴라! 💥'), title: '로봇 기지를 박살내자!', target: () => Tq.base },
    { ...coreQuest('factory', 9, '공장 안의 로봇 물리치기', '생산 기계를 부숴라! 💥'), title: '로봇 생산 공장 파괴', target: () => Tq.factory,
      intro: () => [
        { ...barrierShot(2.2, S.q2[0], `${SCI} (무전):`, true) },
        orbit(Tq.factory, 55, 26, 2.6, 3.6, 4, S.q2[1]),
        orbit(Tq.factory, 30, 10, 3.4, 3.0, 3.5, S.q2[2], radio()),
      ] },
    { title: `${STAGE.big}으로 쳐들어가자!`, target: () => Tq.camp,
      start() { q.need = Math.min(scaleCount(10), tagCount('big')); },
      text: () => `더 크고 강한 로봇 물리치기 (${Math.min(kills.big || 0, q.need)}/${q.need})`,
      done: () => (kills.big || 0) >= q.need,
      intro: () => [
        gearShot(0.9, S.q3[0]),
        hideHolo({ ...barrierShot(1.4, S.q3[1], `${SCI} (무전):`, true) }),
        orbit(rust, 150, 70, 0.4, 1.2, 4.5, S.q3[2]),
        orbit(rust, 60, 18, 1.2, 1.7, 3.5, S.q3[3], radio()),
      ],
      outro: () => {
        const spot = rust.clone().add(V(0, 6, 0));
        const dest = W.labPad.clone().add(V(0, 7, 0));
        return [
          { from: { pos: spot.clone().add(V(10, 2, 10)), look: spot }, to: { pos: spot.clone().add(V(7, 1, 7)), look: spot }, dur: 2.5,
            who: `${SCI}:`, text: S.flee[0], enter: () => sci.show(spot) },
          { from: () => ({ pos: sci.pos.clone().add(V(-12, 6, -12)), look: sci.pos.clone() }), dur: 5, hold: 0.5, text: S.flee[1], enter: () => sci.flyTo(dest, 5) },
          playerShot(LINES[pl.kind].chase, me()),
        ];
      },
      outroEnd: () => { sci.flight = null; sci.show(W.labPad.clone().add(V(0, 7, 0))); } },
    { title: `${SCI}를 쫓아라!`, target: () => Tq.lab,
      start() { q.need = Math.min(scaleCount(8), tagCount('lab')); },
      text: () => (kills.lab || 0) < q.need ? `연구소로 가면서 로봇 물리치기 (${Math.min(kills.lab || 0, q.need)}/${q.need})` : '과학 연구소 마당으로 들어가자!',
      done: () => (kills.lab || 0) >= q.need && Math.hypot(pl.pos.x - Tq.lab.x, pl.pos.z - Tq.lab.z) < 30,
      intro: () => [orbit(Tq.lab, 70, 30, 3.0, 2.2, 4.5, S.q4)] },
    { title: `최종 보스: ${NAMES.finalBoss}`, target: () => (game.boss?.alive ? game.boss.pos : null),
      text: () => stageIdx === 1 ? `${NAMES.finalBoss}를 물리쳐라! (빨간 원 = 포탄! 피하고, 핵이 빛날 때 공격)` : `${NAMES.finalBoss}를 물리쳐라! (주저앉아 핵이 빛날 때 공격)`,
      intro: () => {
        const pad = W.labPad;
        return [
          { from: { pos: pad.clone().add(V(0, 9, 16)), look: sci.pos.clone() }, to: { pos: pad.clone().add(V(4, 8, 13)), look: sci.pos.clone() }, dur: 3, who: `${SCI}:`, text: S.boss[0] },
          { from: { pos: pad.clone().add(V(0, 2, 34)), look: pad.clone().add(V(0, 40, 0)) }, to: { pos: pad.clone().add(V(8, 1.5, 28)), look: pad.clone().add(V(0, 8, 0)) }, dur: 3.5,
            text: S.boss[1],
            enter: () => { game.boss = new Boss(game, { hpScale: 1 + 0.75 * (playerCount - 1), name: NAMES.finalBoss, variant: stageIdx === 1 ? 'cannon' : null }); game.boss.spawnNear(pad, 0.01); sci.flyTo(pad.clone().add(V(0, 7, 14)), 1.5); } },
          { from: () => ({ pos: game.boss.pos.clone().add(V(10, 3, 16)), look: game.boss.pos.clone().add(V(0, 2, 0)) }), dur: 3,
            who: `${SCI}:`, text: S.boss[2], enter: () => sci.flyTo(game.boss.pos.clone().add(V(0, 2.5, 0)), 1.6) },
          { from: () => ({ pos: game.boss.pos.clone().add(V(-14, 4, 18)), look: game.boss.pos.clone() }), dur: 3, text: S.boss[3], enter: () => sci.hide() },
        ];
      },
      introEnd: () => { holo.hide(); sci.hide(); if (!game.boss) { game.boss = new Boss(game, { name: NAMES.finalBoss, variant: stageIdx === 1 ? 'cannon' : null }); game.boss.spawnNear(W.labPad, 0.01); } game.boss.opts.onDefeated = bossDefeated; },
      done: () => game.boss?.done,
      outro: () => {
        const ang = Math.atan2(pl.pos.x, pl.pos.z);
        const bp = game.boss.pos.clone();
        const head = [
          { from: { pos: bp.clone().add(V(16, 6, 16)), look: bp }, dur: 3, text: S.end[0], enter: () => { sci.show(bp.clone().add(V(0, 3, 0))); } },
          { from: () => ({ pos: sci.pos.clone().add(V(-10, 4, -10)), look: sci.pos.clone() }), dur: 3, who: `${SCI}:`, text: S.end[2],
            enter: () => { sci.show(bp.clone().add(V(0, 3, 0))); sci.flyTo(bp.clone().add(V(Math.sin(ang + Math.PI) * 300, 60, Math.cos(ang + Math.PI) * 300)), 4); } },
          ...ceremony(),
        ];
        if (stageIdx <= 1) return [...head, // 장벽이 있는 대지: 장벽이 무너짐
          { ...barrierShot(ang, S.end[3]), enter: () => { sci.hide(); W.removeBarrier(); } },
          gearShot(ang + 0.6, S.end[4]),
          ...(stageIdx === 0 ? [hideHolo(playerShot(S.end[5], radio()))] : collapseShots()),
        ];
        return [...head, hideHolo({ ...gearShot(ang + 0.6, S.end[4]), enter: () => { sci.hide(); holo.show(V(Math.sin(ang + 0.6) * CFG.world.barrierR * 0.8, 30, Math.cos(ang + 0.6) * CFG.world.barrierR * 0.8), 9, V(0, 0, 0)); } }), ...escapeShots()];
      },
      outroEnd: () => {
        holo.hide(); sci.hide(); W.crystalState(4); clearScene();
        const r = recoverCrystal(stageIdx, game.hard);
        const C = BIG_CRYSTALS[Math.min(stageIdx, BIG_CRYSTALS.length - 1)];
        SFX.crystal();
        game.hud.toast(`${C.emoji} ${C.name}을(를) 되찾았다! (${r.count}/${BIG_CRYSTALS.length})`, 'gold');
        if (r.newlyUnlockedHard) setTimeout(() => game.hud.toast('⭐ 모든 크리스탈을 되찾았다! 시작 화면에서 "도전 모드"를 할 수 있어요!', 'gold'), 2600);
        showStageInfo();
        if (stageIdx === 1) { W.revealExit(); game.collapse = true; }
        if (stageIdx >= 2) leaveTogether(); // 용암 섬·하늘 도시·우주 요새: 탈출 장면 뒤 바로 다음 대지로
      } },
    { title: '🎉 스테이지 클리어!',
      target: () => (stageIdx + 1 >= STAGES.length ? null : W.exitDevice ? (W.exitDevice.hidden ? null : W.exitDevice.pos) : !W.exitGate ? null : pl.pos.z < W.exitGate.z ? W.exitGate : V(0, 0, CFG.world.exitR + 40)),
      text: () => stageIdx + 1 >= STAGES.length ? '다음 이야기는 아직 만드는 중이에요! 자유롭게 달려보세요'
        : W.exitDevice?.kind === 'cannon' ? `얼음 나라가 무너진다! 렌치 박사의 거대 대포 속으로! ${NAMES.stages[stageIdx + 1]}까지 슝~ 🚀`
        : W.exitDevice?.kind === 'geyser' ? `섬 한가운데의 용암 분출구 위로! ${NAMES.stages[stageIdx + 1]}까지 솟구쳐요 🌋`
        : `북쪽 눈길을 따라 끝까지 달려가면 ${NAMES.stages[stageIdx + 1]}(으)로! ❄️`,
      done: () => false },
  ];
  function bossDefeated() { game.musicHold = 9; SFX.quest(); game.hud.setBoss(null); for (const p of game.players) p.shake = 1.2; }
  const questText = (Q) => (typeof Q.text === 'function' ? Q.text() : Q.text);
  function startQuest(i, skipIntro = false) {
    q.i = i;
    const Q = quests[i];
    const go = () => { Q.introEnd?.(); Q.start?.(); game.hud.setQuest(i < 5 ? `퀘스트 ${i + 1} / 5 — ${Q.title}` : Q.title, questText(Q)); SFX.quest(); };
    if (Q.intro && !skipIntro) playCine(Q.intro(), go); else go();
  }
  function completeQuest(byFriend = false) {
    const Q = quests[q.i];
    if (cine.active) cine.skip();
    SFX.quest(); game.hud.toast(byFriend ? '🤝 친구가 퀘스트를 깼어요! ✅ 퀘스트 완료!' : '✅ 퀘스트 완료!', 'gold');
    q.i = -2; // 잠깐 멈춤
    const idx = quests.indexOf(Q);
    q.pending = idx + 1;
    if (!byFriend) net.sendQuest(idx + 1); // 같이 하는 친구들도 같은 장면을 보고 다 같이 다음 퀘스트로
    const next = () => { Q.outroEnd?.(); if (byFriend) applyQuestEffects(idx + 1); if (q.i === -2) startQuest(idx + 1); };
    if (Q.outro) setTimeout(() => playCine(Q.outro(), next), 900); else next();
  }
  game.quests = q; game.startQuest = startQuest; game.completeQuest = completeQuest;
  // 이미 지나간 퀘스트의 결과를 맵에 반영 (불러오기·친구가 퀘스트를 깼을 때)
  // 크리스탈 수호자 장면: 크리스탈이 빛나며 작아져 작은 보석이 되어 주인공 손에
  function ceremony() {
    const C = S.cer || COMMON_CER, cg = W.crystalGroup, home = tree.clone();
    let gem = null;
    return [
      { ...treeShot(C[0]), enter: () => { W.crystalState(3); W.crystalState(5); SFX.crystal(); for (let i = 0; i < 3; i++) setTimeout(() => game.fx.shockwave(home.clone().add(V(0, 1, 0)), 12 + i * 6, BIG_CRYSTAL_HEX), i * 300); },
        tick: (dt, t) => { const k = Math.max(0.12, 1 - t / 4); cg.scale.setScalar(k); cg.position.y = 2.5 + (1 - k) * 6; if (Math.random() < 0.5) game.fx.burst(home.clone().add(V(0, 6 + (1 - k) * 6, 0)), BIG_CRYSTAL_HEX, 2, 6); } },
      { from: () => ({ pos: pl.pos.clone().add(V(7, 3, 6)), look: home.clone().lerp(pl.pos, 0.65).add(V(0, 2.4, 0)) }), dur: 5, hold: 1.2, who: `${CRY}:`, text: C[1],
        enter: () => { cg.visible = false; pl.pos.copy(home).add(V(0, 0.4, 9)); pl.yaw = Math.PI; pl.state = 'ground'; pl.updateView(0);
          gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: BIG_CRYSTAL_HEX, toneMapped: false })); gem.position.copy(home).add(V(0, 9, 0)); scene.add(gem); },
        tick: (dt, t) => { if (!gem) return; const to = pl.pos.clone().add(V(0, 1.6, 0)); gem.position.lerp(to, Math.min(1, dt * 1.6)); gem.rotation.y += dt * 4; if (Math.random() < 0.4) game.fx.burst(gem.position.clone(), BIG_CRYSTAL_HEX, 1, 2); } },
      { ...playerShot(C[2], null), dur: 3.5, enter: () => { if (gem) { scene.remove(gem); gem = null; } game.fx.burst(pl.pos.clone().add(V(0, 1.4, 0)), BIG_CRYSTAL_HEX, 30, 8); game.fx.shockwave(pl.pos.clone(), 6, 0xffffff); SFX.superReady(); W.crystalState(4); } },
    ];
  }
  // 얼음 나라: 크리스탈이 떠나자 무너지기 시작 → 대포로 탈출
  function collapseShots() {
    const X = W.exitDevice, cpos = X ? X.pos.clone() : tree.clone();
    return [
      { from: { pos: V(0, 140, -260), look: V(0, 0, 200) }, to: { pos: V(30, 120, -220), look: V(0, -10, 260) }, dur: 4, text: S.collapse[0],
        enter: () => { game.hud.flash('rgba(255,255,255,0.4)'); SFX.explosion(); }, tick: () => { if (Math.random() < 0.15) game.fx.explosion(V((Math.random() - 0.5) * 600, 10, (Math.random() - 0.5) * 600 + 200), 3); } },
      hideHolo({ from: { pos: cpos.clone().add(V(40, 22, 40)), look: cpos.clone().add(V(0, 8, 0)) }, to: { pos: cpos.clone().add(V(28, 14, 30)), look: cpos.clone().add(V(0, 8, 0)) }, dur: 4, who: radio(), text: S.collapse[1], enter: () => W.revealExit() }),
    ];
  }
  // 용암 섬 / 하늘 도시 / 우주 요새를 떠나는 장면
  const tmpProps = [];
  function clearScene() { for (const o of tmpProps) scene.remove(o); tmpProps.length = 0; pl._cv = null; pl.view.root.visible = true; }
  function escapeShots() {
    const E = S.escape, up = V(0, 1, 0);
    if (stageIdx === 2) { // 섬 폭발 → 로봇들이 하늘로 → 하나를 붙잡고 같이 날아감
      const bots = [];
      let grab = null;
      return [
        { from: { pos: V(0, 260, -520), look: V(0, 0, 0) }, to: { pos: V(60, 220, -460), look: V(0, 20, 0) }, dur: 4, text: E[0],
          enter: () => { game.hud.flash('rgba(255,140,60,0.6)'); SFX.explosion(); },
          tick: () => { if (Math.random() < 0.3) game.fx.explosion(V((Math.random() - 0.5) * 900, 5, (Math.random() - 0.5) * 900), 4); } },
        { from: () => ({ pos: pl.pos.clone().add(V(30, 8, 30)), look: pl.pos.clone().add(V(0, 20, 0)) }), dur: 4, text: E[1],
          enter: () => { for (let i = 0; i < 14; i++) { const b = new THREE.Group(), r = robotMesh(i % 3 ? 'wasp' : 'brute'); r.scale.setScalar(i % 3 ? 1.6 : 1.8); b.add(r); b.position.copy(pl.pos).add(V((Math.random() - 0.5) * 60, Math.random() * 10, (Math.random() - 0.5) * 60)); b.userData.v = 10 + Math.random() * 14; scene.add(b); tmpProps.push(b); bots.push(b); } },
          tick: (dt) => { for (const b of bots) { b.position.y += b.userData.v * dt; b.rotation.y += dt; if (Math.random() < 0.2) game.fx.burst(b.position.clone(), 0xff8a30, 1, 3); } } },
        { from: () => ({ pos: pl.pos.clone().add(V(10, -4, 12)), look: pl.pos.clone().add(V(0, 2, 0)) }), dur: 4, hold: 0.8, text: E[2].replace('${ME}', nm(pl.kind)),
          enter: () => { grab = new THREE.Group(); const r = robotMesh('brute'); r.scale.setScalar(1.8); grab.add(r); const f = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 8), new THREE.MeshBasicMaterial({ color: 0x66ccff, toneMapped: false })); f.rotation.x = Math.PI; f.position.y = -0.5; grab.add(f); grab.position.copy(pl.pos).add(V(0, 3.2, 0)); scene.add(grab); tmpProps.push(grab); pl._cv = V(0, 14, 0); },
          tick: (dt) => { if (!pl._cv) return; pl.pos.addScaledVector(pl._cv, dt); grab.position.copy(pl.pos).add(V(0, 3.2, 0)); pl.updateView(dt); for (const b of bots) b.position.y += b.userData.v * dt; } },
        { ...playerShot(E[3], radio()), from: () => ({ pos: pl.pos.clone().add(V(14, -10, 14)), look: pl.pos.clone() }), dur: 3.5,
          tick: (dt) => { if (!pl._cv) return; pl._cv.y = Math.min(60, pl._cv.y + 30 * dt); pl.pos.addScaledVector(pl._cv, dt); grab.position.copy(pl.pos).add(V(0, 3.2, 0)); pl.updateView(dt); game.fx.burst(grab.position.clone(), 0x66ccff, 1, 3); } },
      ];
    }
    if (stageIdx === 3) { // 기어는 비행접시로 도망 → 주인공은 작은 우주선을 타고 쫓아감
      const pod = makeGearPod(), ship = makeShuttle();
      const pad = W.labPad.clone();
      return [
        { from: { pos: pad.clone().add(V(40, 12, 40)), look: pad.clone().add(V(0, 20, 0)) }, dur: 4, text: E[0],
          enter: () => { holo.hide(); pod.position.copy(pad).add(V(0, 10, 0)); scene.add(pod); tmpProps.push(pod); SFX.boost(); },
          tick: (dt, t) => { pod.position.y += (8 + t * 30) * dt; pod.rotation.y += dt * 3; } },
        { from: () => ({ pos: pl.pos.clone().add(V(14, 6, 14)), look: ship.position.clone() }), dur: 3.5, text: E[1].replace('${ME}', nm(pl.kind)),
          enter: () => { ship.position.copy(pl.pos).add(V(0, 1.6, 6)); scene.add(ship); tmpProps.push(ship); } },
        { from: () => ({ pos: ship.position.clone().add(V(16, -6, -16)), look: ship.position.clone() }), dur: 3.5, who: me(), text: E[2],
          enter: () => { pl.view.root.visible = false; SFX.boost(); }, tick: (dt, t) => { ship.position.y += (6 + t * 40) * dt; ship.rotation.x = -0.9; ship.userData.flame.scale.y = 1.5 + Math.random(); game.fx.burst(ship.position.clone().add(V(0, -3, 0)), 0x66ccff, 2, 4); } },
      ];
    }
    // 우주 요새: 최종 전함으로 도망 → 슈퍼 변신으로 쫓아감
    const bs = makeBattleship();
    return [
      { from: { pos: V(0, 120, -300), look: V(0, 60, 0) }, dur: 4.5, text: E[0],
        enter: () => { holo.hide(); bs.position.set(0, 40, 0); scene.add(bs); tmpProps.push(bs); SFX.bossRoar(); },
        tick: (dt, t) => { bs.position.y += (10 + t * 25) * dt; bs.position.z += t * 20 * dt; } },
      { ...playerShot(E[1], null), dur: 4, enter: () => { SFX.superReady(); game.fx.burst(pl.pos.clone().add(V(0, 1, 0)), 0xffe14d, 40, 10); for (let i = 0; i < 3; i++) setTimeout(() => game.fx.shockwave(pl.pos.clone(), 6 + i * 5, 0xffe14d), i * 250); pl.superOn = true; } },
      { from: () => ({ pos: pl.pos.clone().add(V(12, -8, 12)), look: pl.pos.clone() }), dur: 3.5, who: me(), text: E[2],
        enter: () => { pl._cv = V(0, 30, 0); }, tick: (dt) => { if (!pl._cv) return; pl._cv.y += 40 * dt; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); game.fx.burst(pl.pos.clone(), 0xffe14d, 2, 4); } },
    ];
  }
  // 다 같이 다음 대지로 (같이 하기 중이면 방장이 모두를 이동)
  function leaveTogether() {
    if (net.shared) { if (net.host) net.startAll(stageIdx + 1); }
    else goNextStage();
  }
  function applyQuestEffects(n) {
    const dead = (tag) => { const c = core(tag); if (c) { c.alive = false; if (c.mesh) c.mesh.visible = false; c.shielded = false; } };
    if (n >= 1) dead('base');
    if (n >= 2) dead('factory');
    if (n === 3 || n === 4) sci.show(W.labPad.clone().add(V(0, 7, 0)));
    if (n >= 5) { sci.hide?.(); if (W.barrierUp) { W.removeBarrier(); W.barrierSink = 9; } W.restoreTree(); if (game.boss) { game.boss.dispose?.(); game.boss = null; } }
  }
  function syncQuest(n, fromFriend) {
    const cur = q.i >= 0 ? q.i : (q.pending ?? 0);
    if (!started || n <= cur || n >= quests.length + 1) return;
    // 바로 다음 퀘스트면: 깬 친구와 똑같이 끝 장면(시네마) → 다음 퀘스트 시작 장면까지 모두 같이
    if (n === cur + 1 && q.i === cur && quests[cur]) { completeQuest(true); return; }
    // 한참 뒤에 들어온 경우만 결과를 바로 맞춤
    applyQuestEffects(n);
    if (cine.active) cine.skip();
    q.pending = n;
    startQuest(Math.min(n, quests.length - 1), true);
    if (fromFriend) game.hud.toast('🤝 친구가 퀘스트를 깼어요! 다 같이 다음 퀘스트로!', 'gold');
  }

  // 처음 이야기 (고른 캐릭터에 맞춰 시작할 때 만듦)
  // 캐릭터가 하늘에서 날아오거나 아래에서 솟구치는 장면용
  const flyShot = (text, who, startPos, vel, grav, cam, dur = 4) => ({
    from: () => ({ pos: pl.pos.clone().add(cam), look: pl.pos.clone() }), dur, text, who, hold: 0.6,
    enter: () => { pl.pos.copy(startPos); pl._cv = vel.clone(); pl.view.root.visible = true; },
    tick: (dt) => { if (!pl._cv) return; pl._cv.y -= grav * dt; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); if (Math.random() < 0.7) game.fx.burst(pl.pos.clone(), stageIdx === 2 ? 0xffa030 : 0xffffff, 2, 3); },
  });
  const buildIntro = () => {
    const I = S.intro, crystalPit = tree;
    if (stageIdx === 0) return [
      { from: { pos: crystalPit.clone().add(V(-90, 60, 110)), look: crystalPit.clone().add(V(0, 4, 0)) }, to: { pos: crystalPit.clone().add(V(-40, 30, 70)), look: crystalPit.clone().add(V(0, 2, 0)) }, dur: 5, text: I[0], enter: () => W.crystalState(0) },
      barrierShot(0.15, I[1]),
      digShot(I[2]),
      crystalOut(I[3]),
      orbit(rust, 160, 60, 0.6, 1.3, 4.5, I[4]),
      gearShot(0.4, I[5]),
      hideHolo(orbit(Tq.base, 60, 28, 3.6, 2.6, 4, I[6])),
      playerShot(LINES[pl.kind].start, me()),
      { ...playerShot(I[7], radio()), dur: 3.5 },
    ];
    if (stageIdx === 1) return [ // 얼음산 꼭대기 → 아래로 장벽에 둘러싸인 얼음 나라
      { from: { pos: peak.clone().add(V(60, 30, 70)), look: peak.clone().add(V(0, 2, 0)) }, to: { pos: peak.clone().add(V(20, 8, 26)), look: peak.clone() }, dur: 4.5, text: I[0] },
      { from: { pos: peak.clone().add(V(0, 6, -10)), look: V(0, 0, 400) }, to: { pos: peak.clone().add(V(0, 12, -30)), look: V(0, 0, -300) }, dur: 5, text: I[1] },
      digShot(I[2]), crystalOut(''),
      gearShot(Math.PI - 0.3, I[3]),
      hideHolo(playerShot(I[4], me())),
      { ...playerShot(I[5], radio()), dur: 3.5 },
    ];
    if (stageIdx === 2) return [ // 대포에서 날아와 섬에 떨어짐
      flyShot(I[0], null, V(-400, 260, 900), V(70, 10, -150), 18, V(-10, 6, 22), 4),
      { from: { pos: V(0, 420, 2000), look: V(0, 0, 0) }, to: { pos: V(0, 260, 1500), look: V(0, 0, 200) }, dur: 5, text: I[1], enter: () => { pl.view.root.visible = false; } },
      digShot(I[2]), crystalOut(''),
      gearShot(0.4, I[3]),
      hideHolo(flyShot(I[4], me(), V(0, 120, 90), V(0, -6, -14), 30, V(6, 3, 12), 3)),
      { ...playerShot(I[5], radio()), dur: 3.5 },
    ];
    if (stageIdx === 4) { // 5. 거대 우주선에 도킹
      const sh = makeShuttle(), R = CFG.world.barrierR;
      return [
        { from: { pos: V(0, 900, -R - 1400), look: V(0, 0, 0) }, to: { pos: V(0, 600, -R - 900), look: V(0, 0, 0) }, dur: 5, text: I[0],
          enter: () => { pl.view.root.visible = false; sh.position.set(0, 200, -R - 700); sh.scale.setScalar(4); scene.add(sh); tmpProps.push(sh); },
          tick: (dt) => { sh.position.lerp(V(0, 30, -R - 20), Math.min(1, dt * 0.6)); sh.lookAt(0, 30, 0); } },
        { from: { pos: V(60, 60, -R - 120), look: V(0, 25, -R) }, dur: 4.5, text: I[1],
          enter: () => { SFX.store(); }, tick: (dt) => { sh.position.lerp(V(0, 25, -R + 30), Math.min(1, dt * 1.2)); sh.userData.flame.scale.y = 0.5 + Math.random() * 0.5; } },
        { ...crystalOut(I[2]), enter: () => { clearScene(); W.crystalState(2); SFX.crystal(); } },
        gearShot(0.4, I[3]),
        hideHolo(playerShot(I[4], me())),
        { ...playerShot(I[5], radio()), dur: 3.5 },
      ];
    }
    if (stageIdx === 5) return [ // 6. 최후의 결전
      flyShot(I[0], null, V(0, 0, -60), V(0, 0, 40), 0, V(10, 4, -16), 4.5),
      { from: { pos: V(0, 30, 120), look: V(0, 0, 300) }, dur: 4, who: `${VIL}:`, text: I[1], enter: () => { const b = makeBattleship(); b.position.set(0, 0, 420); b.rotation.y = Math.PI; scene.add(b); tmpProps.push(b); } },
      { ...playerShot(I[2], radio()), dur: 4 },
    ];
    const H = SKY_HOLES[0] || { x: 300, z: 300, r: 20 }, hp = V(H.x, 0, H.z), E = CFG.sky.edge;
    let bot = null;
    return [ // 4. 도망치는 로봇에 매달려 구름을 뚫고 하늘 기지에 도착
      { ...flyShot(I[0], null, V(0, -70, 60), V(0, 75, -4), 30, V(14, -4, 18), 4.5),
        enter: () => { pl.pos.set(0, -70, 60); pl._cv = V(0, 75, -4); pl.view.root.visible = true; bot = new THREE.Group(); const r = robotMesh('brute'); r.scale.setScalar(1.8); bot.add(r); scene.add(bot); tmpProps.push(bot); },
        tick: (dt) => { if (!pl._cv) return; pl._cv.y -= 30 * dt; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); bot.position.copy(pl.pos).add(V(0, 3.2, 0)); game.fx.burst(bot.position.clone(), 0x66ccff, 1, 3); } },
      { from: { pos: hp.clone().add(V(H.r + 14, 30, 10)), look: hp.clone().add(V(0, -40, 0)) }, to: { pos: hp.clone().add(V(H.r + 6, 18, 4)), look: hp.clone().add(V(0, -40, 0)) }, dur: 5, text: I[1], enter: () => { pl.view.root.visible = false; } },
      { from: { pos: V(30, 40, E - 160), look: V(0, -30, E + 300) }, to: { pos: V(-30, 26, E - 90), look: V(0, -45, E + 300) }, dur: 5, text: I[2] },
      digShot(I[3]), crystalOut(''),
      gearShot(0.4, I[4]),
      hideHolo(playerShot(I[5], me())),
      { ...playerShot(I[6], radio()), dur: 3.5 },
    ];
  };
  // 이야기가 끝난 뒤 시작 자세: 대포로 날아온 3스테이지는 하늘에서 떨어지고, 4스테이지는 구름 아래에서 솟구쳐 착지
  function afterIntro() {
    clearScene();
    if (stageIdx === 5) { pl.view.root.visible = true; game.shmup.pl = pl; game.shmup.start(); return; }
    W.crystalState(2);
    if (stageIdx === 2) { pl.pos.set(0, 70, 40); pl.state = 'air'; pl.vel.set(0, -8, -8); }
    else if (stageIdx === 3) { pl.pos.set(0, 26, 28); pl.state = 'air'; pl.vel.set(0, 16, -4); }
    else if (stageIdx === 1) game.hud.toast('⬇️ 얼음산 아래로 뛰어내려 얼음 나라로! (장벽 밖으로 떨어지면 기어 군단이 나타나요)', 'gold');
  }

  // ---- 다음 대지로 가는 장치 (얼음 나라 = 거대 대포, 용암 섬 = 용암 분출구): 한 명이 타면 다 같이 ----
  let exitWarnT = 0, exiting = false;
  function launchExit(fromFriend = false) {
    const X = W.exitDevice; if (!X || exiting || leaving) return;
    exiting = true;
    if (!fromFriend && net.shared) net.sendGame({ t: 'ex' });
    const c = X.pos.clone(), up = V(0, 1, 0), dir = X.kind === 'cannon' ? V(Math.sin(X.yaw) * Math.cos(0.75), Math.sin(0.75), Math.cos(X.yaw) * Math.cos(0.75)) : up;
    const mouth = X.kind === 'cannon' ? c.clone().add(V(0, 7.5, 0)).addScaledVector(dir, 22) : c.clone().add(V(0, 8, 0));
    const side = V(Math.cos(X.yaw), 0, -Math.sin(X.yaw));
    const friend = fromFriend ? '친구가' : `${nm(pl.kind)}이(가)`;
    const shots = X.kind === 'cannon' ? [
      { from: { pos: c.clone().addScaledVector(side, 34).add(V(0, 14, 0)), look: c.clone().add(V(0, 8, 0)) }, to: { pos: c.clone().addScaledVector(side, 28).add(V(0, 12, 0)), look: c.clone().add(V(0, 9, 0)) }, dur: 2.6, hold: 0.4,
        text: `${friend} 거대 대포 속으로 쏙! 모두 함께 출발!`, enter: () => { pl.view.root.visible = false; SFX.store(); } },
      { from: { pos: c.clone().addScaledVector(side, 40).add(V(0, 10, 0)), look: mouth }, dur: 1.8, hold: 0.2, text: '3, 2, 1... 발사!!!',
        enter: () => { game.fx.explosion(mouth, 3); game.fx.shockwave(mouth, 14, 0xffd040); game.fx.burst(mouth, 0xffffff, 30, 20); SFX.explosion(); game.hud.flash('rgba(255,220,140,0.6)'); pl.pos.copy(mouth); pl._cv = dir.clone().multiplyScalar(90); pl.view.root.visible = true; },
        tick: (dt) => { if (!pl._cv) return; pl._cv.y -= 12 * dt; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); game.fx.burst(pl.pos.clone(), 0xffa030, 2, 3); } },
      { from: () => ({ pos: pl.pos.clone().addScaledVector(dir, -30).add(V(0, 8, 0)), look: pl.pos.clone() }), dur: 2.6, hold: 0.3, text: `${NAMES.stages[stageIdx + 1]}까지 날아가요~!`,
        tick: (dt) => { if (!pl._cv) return; pl._cv.y -= 12 * dt; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); game.fx.burst(pl.pos.clone(), 0xffa030, 2, 3); } },
    ] : [
      { from: { pos: c.clone().add(V(30, 12, 30)), look: c.clone().add(V(0, 7, 0)) }, to: { pos: c.clone().add(V(24, 10, 24)), look: c.clone().add(V(0, 8, 0)) }, dur: 2.6, hold: 0.4,
        text: `${friend} 용암 분출구 위에 올라섰어요! 부글부글...`, enter: () => { pl.pos.copy(mouth); pl.vel.set(0, 0, 0); pl.updateView(0); } },
      { from: { pos: c.clone().add(V(36, 6, 36)), look: c.clone().add(V(0, 30, 0)) }, dur: 1.8, hold: 0.2, text: '콰아아앙!!!',
        enter: () => { game.fx.explosion(mouth, 3.5); game.fx.shockwave(mouth, 16, 0xff6a20); game.fx.burst(mouth, 0xff6a20, 40, 26); SFX.explosion(); game.hud.flash('rgba(255,140,60,0.6)'); pl._cv = V(0, 95, 0); },
        tick: (dt) => { if (!pl._cv) return; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); game.fx.burst(pl.pos.clone().add(V(0, -1, 0)), Math.random() < 0.5 ? 0xff6a20 : 0xffd040, 3, 5); } },
      { from: () => ({ pos: pl.pos.clone().add(V(20, -30, 20)), look: pl.pos.clone() }), dur: 2.6, hold: 0.3, text: `구름을 뚫고 ${NAMES.stages[stageIdx + 1]}까지!`,
        tick: (dt) => { if (!pl._cv) return; pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); game.fx.burst(pl.pos.clone().add(V(0, -1, 0)), 0xff6a20, 2, 5); } },
    ];
    playCine(shots, () => {
      pl._cv = null;
      if (net.shared) { if (net.host) net.startAll(stageIdx + 1); else { game.hud.toast('방장과 함께 다음 대지로 가는 중...'); setTimeout(() => { if (!leaving) net.sendGame({ t: 'go', stage: stageIdx + 1 }); }, 1500); } }
      else goNextStage();
    });
  }
  function exitTick(dt) {
    const X = W.exitDevice; if (!X || !pl.alive || exiting) return;
    exitWarnT = Math.max(0, exitWarnT - dt);
    if (Math.hypot(pl.pos.x - X.pos.x, pl.pos.z - X.pos.z) > X.r || pl.pos.y > X.top + 6) return;
    if (q.i === quests.length - 1) launchExit();
    else if (exitWarnT <= 0) { exitWarnT = 4; game.hud.toast(X.kind === 'cannon' ? '🚀 거대 대포는 보스를 물리친 뒤에 탈 수 있어요!' : '🌋 용암 분출구는 보스를 물리친 뒤에 탈 수 있어요!'); }
  }
  // 얼음 나라: 슈퍼 공격으로 녹인 눈 (같이 하기 중이면 친구 화면에서도 녹음)
  game.melt = (p, r) => { if (W.meltSnow(p, r) && net.shared) net.sendGame({ t: 'sn', x: +p.x.toFixed(1), z: +p.z.toFixed(1), r: +r.toFixed(1) }); };
  // 하늘 도시 끝 너머로 떨어짐: "아아악!!!" 장면 뒤 체크포인트에서 다시 시작 (링 30% 잃음)
  game.breakHull = (a, y) => {
    const h = W.breakHull(a, y); if (!h) return;
    addHullHole(h);
    const at = V(Math.cos(h.a) * CFG.world.barrierR, h.y + 1.5, Math.sin(h.a) * CFG.world.barrierR);
    game.fx.explosion(at, 1.8); game.fx.burst(at, 0xff8a30, 24, 10); SFX.explosion(); pl.shake = 0.5;
    game.hud.toast('💥 우주선 외벽에 구멍이 뚫렸다! 밖은... 우주!', 'gold');
    if (net.shared) net.sendGame({ t: 'hh', a: h.a, y: h.y });
  };
  game.onVoidFall = (keep, lost) => {
    const space = W.mode === 'ship';
    pl._cv = pl.vel.clone(); pl._cv.y = Math.min(pl._cv.y, -10); pl._cv.x *= 0.4; pl._cv.z *= 0.4;
    playCine([{ from: () => ({ pos: pl.pos.clone().add(space ? V(6, 22, 6) : V(4, 16, 4)), look: pl.pos.clone().add(space ? V(0, -40, 0) : V(0, 0, 0)) }), dur: 2.6, hold: 0.3, who: me(), text: space ? '으아아아악~~! 지구로 떨어진다~~!' : '아아아아악!!!!',
      enter: () => SFX.hurt(),
      tick: (dt) => { pl._cv.y = Math.max(-45, pl._cv.y - 40 * dt); pl.pos.addScaledVector(pl._cv, dt); pl.updateView(dt); if (Math.random() < 0.4) game.fx.burst(pl.pos.clone().add(V(0, 2, 0)), 0xffffff, 2, 2); } }],
    () => { pl._cv = null; pl.die(keep); if (lost) game.hud.toast(`☁️ 구름 아래로 떨어졌어요... (링 -${lost})`); });
  };

  const bigStar = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false }));
  bigStar.position.copy(Tq.bigStar);
  scene.add(bigStar);
  const arrow = new THREE.Group();
  {
    const s = new THREE.Shape();
    s.moveTo(0, 0.9); s.lineTo(0.65, 0.1); s.lineTo(0.25, 0.1); s.lineTo(0.25, -0.7);
    s.lineTo(-0.25, -0.7); s.lineTo(-0.25, 0.1); s.lineTo(-0.65, 0.1); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); geo.rotateX(-0.35);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe600, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    m.renderOrder = 10;
    arrow.add(m);
  }
  scene.add(arrow);

  // ---- 시련을 해내면 크리스탈이 씨앗을 보내줌 ----
  const CRY_NAME = BIG_CRYSTALS[Math.min(stageIdx, BIG_CRYSTALS.length - 1)].name;
  function giveSeed(m) {
    const n = game.missions.crystals;
    SFX.superReady();
    game.hud.toast(`🌱 ${NAMES.trial} 완료! <small>${m.text(m.target)}</small>`, 'gold');
    game.fx.seedBeam(Tq.heartTree.clone().add(V(0, 22, 0)), () => pl.pos, () => {
      SFX.crystal();
      game.hud.toast(`🌱 ${CRY_NAME}이(가) 씨앗을 보내줬어요! (${n}/3)`, 'gold');
      if (n >= 3) {
        const line = { ...playerShot(SEED_LINE, `${CRY_NAME}:`), dur: 3.5 };
        if (!cine.active && !(game.boss && game.boss.alive && game.boss.spawned)) setTimeout(() => { if (!cine.active) playCine([line]); }, 400);
        else game.hud.toast(`✨ ${CRY_NAME}: 내 힘을 빌려줄게! 링 ${CFG.super.ringsNeeded}개 + 땅에서 점프 꾹!`, 'gold');
      }
    });
  }
  // 되찾은 대지의 크리스탈 표시
  const prog0 = loadProgress();
  game.allClear = prog0.crystals.every(Boolean); // 모든 대지를 되찾으면 링 없이 슈퍼 변신 (5분, 쿨타임 1분)
  const showStageInfo = () => { const pr = loadProgress(); game.hud.setStageInfo(STAGE.place, game.hard && !game.ngplus ? pr.hardCrystals : pr.crystals, BIG_CRYSTALS.map((c) => c.color), game.hard); };
  showStageInfo();

  // ---- 아이템 버튼 ----
  const origUpdate = game.input.update.bind(game.input);
  game.input.update = (dt) => {
    origUpdate(dt);
    if (!started) return;
    if (game.input.buttons.item2.pressed) pl.useHeart();
  };

  // ---- 다음 스테이지로 ----
  let leaving = false;
  function goNextStage() {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('sf-carry', JSON.stringify({ char: pl.kind, hearts: pl.storedHearts, hard: game.hard, ngplus: game.ngplus })); } catch (e) {}
    const L = document.getElementById('loading');
    document.getElementById('loading-stage').textContent = `STAGE ${stageIdx + 2}`;
    document.getElementById('loading-title').textContent = NAMES.stages[stageIdx + 1];
    document.getElementById('loading-tip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];
    L.classList.remove('hidden');
    setTimeout(() => { location.href = `?stage=${stageIdx + 1}`; }, 900);
  }

  // ---- 게임 진행 (한 프레임) ----
  let acc = 0, started = false, clockReset = false, paused = false;
  const STEP = 1 / 60;
  function tick(dt) {
    const input = game.input;
    if (game.shmup?.active && !cine.active) { // 6스테이지: 비행 슈팅
      input.update(dt);
      game.time += dt;
      game.shmup.update(Math.min(dt, 1 / 20), input);
      for (const b of Object.values(input.buttons)) { b.pressed = false; b.released = false; }
      game.fx.update(dt); net.update(dt);
      game.gfx.update(dt, game.time, pl.pos);
      game.hud.update(pl, game.missions, null, pl.stats);
      playMusic(game.shmup.boss ? 'boss' : 'super');
      return;
    }
    game.musicHold = Math.max(0, (game.musicHold || 0) - dt);
    playMusic(game.musicHold > 0 ? 'clear' : cine.active ? 'story' : (game.boss && game.boss.alive && game.boss.spawned) ? 'boss' : pl.superOn ? 'super' : `stage${stageIdx + 1}`);
    if (cine.active) { // 이야기 장면 중에는 플레이어·몬스터 정지
      game.time += dt;
      cine.update(dt);
      W.update(dt, game.time);
      if (game.boss && game.boss.state === 'enter') game.boss.update(dt, game.time);
      guardians.update(dt, true);
      sci.update(dt, game.time);
      holo.update(dt, game.time);
      game.fx.update(dt);
      W.stream(camera.position, dt);
      game.gfx.update(dt, game.time, pl.pos);
      input.update(dt);
      for (const b of Object.values(input.buttons)) { b.pressed = false; b.released = false; }
      return;
    }
    input.update(dt);
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.time += STEP;
      pl.update(STEP, input, game.cam.yaw);
      for (const b of Object.values(input.buttons)) { b.pressed = false; b.released = false; }
      acc -= STEP; steps++;
    }
    if (steps === 5) acc = 0;
    game.freezeT = Math.max(0, game.freezeT - dt);
    game.enemies.netClient = net.shared && !net.host;
    game.rings.players = net.shared ? net.count : 1; // 인원이 많을수록 링이 더 빨리 다시 생김
    game.enemies.update(dt, game.time, net.shared && net.host ? [...game.players, ...net.proxies()] : game.players);
    game.rings.update(dt, game.time, game.players);
    game.pickups.update(dt, game.time, game.players, W);
    game.fx.update(dt);
    W.update(dt, game.time);
    game.boss?.update(dt, game.time);
    if (game.boss?.netPos && net.shared && !net.host) { // 보스 위치는 방장 기준
      const b = game.boss; b.pos.lerp(b.netPos, Math.min(1, dt * 8));
      let dy = b.netYaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * Math.min(1, dt * 8);
      b.mesh.position.copy(b.pos); b.mesh.rotation.y = b.yaw;
    }
    sci.update(dt, game.time);
    game.cam.update(dt, pl, input, W);
    W.stream(pl.pos, dt);
    game.gfx.update(dt, game.time, pl.pos);

    let target = null;
    const Q = quests[q.i];
    if (Q) {
      target = Q.target();
      Q.tick?.();
      if (Q.done()) completeQuest();
      else { const t = questText(Q); if (game.hud.questText.textContent !== t) game.hud.questText.textContent = t; }
    }
    if (game.boss && game.boss.alive && game.boss.state !== 'enter') game.hud.setBoss(`🤖 ${game.boss.name}`, game.boss.hp / game.boss.maxHp);
    exitTick(dt);
    if (game.collapse && !cine.active) { // 얼음 나라 붕괴: 땅이 흔들리고 얼음 덩어리가 떨어짐
      if (Math.random() < dt * 1.2) { const p = pl.pos.clone().add(V((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80)); p.y = W.groundAt(p.x, p.z) + 1; game.fx.explosion(p, 1.2); game.fx.burst(p, 0xdff4ff, 14, 10); SFX.explosion(); }
      pl.shake = Math.max(pl.shake, 0.08 + Math.random() * 0.06);
    }
    if (pl.alive && stageIdx === 0 && pl.pos.z > CFG.world.exitR && Math.abs(pl.pos.x) < 140) {
      if (W.barrierUp && !leaving && !game.wentNext) game.hud.toast('🏃 기어 군단을 따돌렸다! 다음 대지로!', 'gold');
      if (net.shared) { // 같이 하기: 한 명이 도착하면 모두 함께 다음 대지로
        if (!game.wentNext) { game.wentNext = true; if (net.host) net.startAll(stageIdx + 1); else net.sendGame({ t: 'go', stage: stageIdx + 1 }); }
      } else goNextStage();
    }
    exploreTick(dt);
    net.update(dt);
    // 장벽을 몰래 넘어가면 기어 군단이 막음
    if (W.barrierUp && pl.alive && Math.hypot(pl.pos.x, pl.pos.z) > CFG.world.barrierR + 8) guardians.trigger(pl.pos, true);
    guardians.update(dt);

    bigStar.rotation.y = game.time * 1.5;
    let dist = null;
    if (target && pl.alive) {
      dist = Math.hypot(target.x - pl.pos.x, target.z - pl.pos.z);
      arrow.visible = dist > 8;
      arrow.position.set(pl.pos.x, pl.pos.y + 2.9 + Math.sin(game.time * 4) * 0.15, pl.pos.z);
      arrow.rotation.y = Math.atan2(target.x - pl.pos.x, target.z - pl.pos.z);
    } else arrow.visible = false;
    game.hud.update(pl, game.missions, dist, pl.stats);
    game.hud.drawMinimap(pl, W, game.enemies, target, game.cam.yaw, game.boss);
  }
  // 테스트용: 화면을 그리지 않고 빠르게 진행
  game.tickN = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { tick(dt); game.input.endFrame(); } };

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, clock.getDelta());
    if (clockReset) { clockReset = false; dt = Math.min(dt, 1 / 30); }
    if (!started) { // 캐릭터 선택 화면: 캐릭터 주위를 도는 카메라
      game.time += dt;
      const t = game.time * 0.35;
      pl.updateView(dt);
      pl.view.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), game.time * 0.6);
      camera.up.set(0, 1, 0);
      camera.position.set(pl.pos.x + Math.sin(t) * 5.5, pl.pos.y + 1.0, pl.pos.z + Math.cos(t) * 5.5);
      camera.lookAt(pl.pos.x, pl.pos.y - 0.6, pl.pos.z);
      W.stream(pl.pos, dt);
      game.gfx.update(dt, game.time, pl.pos);
      W.update(dt, game.time);
      game.gfx.render();
      return;
    }
    if (!paused) tick(dt);
    game.gfx.render();
    game.input.endFrame();
  }

  // ---- 시작 화면 (캐릭터 선택) ----
  const kinds = ['speed', 'flyer', 'power', 'blink'];
  const typeName = { speed: '스피드형', flyer: '비행형', power: '파워형', blink: '순간이동형' };
  const cards = document.getElementById('cards');
  for (const k of kinds) {
    const d = CHARACTER_DEFS[k];
    const c = document.createElement('button');
    c.className = 'card' + (k === pl.kind ? ' sel' : ''); c.dataset.kind = k;
    c.innerHTML = `<div class="card-dot" style="background:#${d.body.toString(16).padStart(6, '0')}"></div><div class="card-name">${NAMES.characters[k]}</div><div class="card-type">${typeName[k]}</div><div class="card-desc">${d.desc}</div>`;
    c.addEventListener('click', () => {
      for (const el of cards.children) el.classList.remove('sel');
      c.classList.add('sel');
      setCharacter(k); net.pick(k);
      initAudio(); SFX.jump();
    });
    cards.appendChild(c);
  }
  document.getElementById('title').textContent = NAMES.gameTitle;
  if (isTouch) document.getElementById('help-pc').style.display = 'none';
  else document.getElementById('help-touch').style.display = 'none';

  // ---- 저장하기 / 불러오기 ----
  // ---- 탐험: 새로운 장소 발견 · 보물 상자 · 폭포 물보라 · 물 속 화면 ----
  const chestTotal = W.chests.length, placeTotal = W.discoveries.length;
  function openChest(ch) {
    ch.opened = true;
    if (net.shared) net.sendGame({ t: 'ch', i: W.chests.indexOf(ch) });
    const n = 40;
    pl.collectRing(n);
    if (Math.random() < 0.35) game.pickups.spawnHeart(ch.pos.clone().add(V(0, 2, 0)));
    game.fx.burst(ch.pos.clone().add(V(0, 1.2, 0)), 0xffd23a, 26, 8);
    game.fx.shockwave(ch.pos, 4, 0xffd23a);
    SFX.crystal();
    const got = W.chests.filter((c) => c.opened).length;
    game.hud.toast(`🎁 보물 상자! 링 +${n} (${got}/${chestTotal})`, 'gold');
    const b = W.beacons.find((x) => x.name === ch.name); if (b) b.found = true;
  }
  function exploreTick(dt) {
    if (!pl.alive) return;
    for (const ch of W.chests) {
      if (ch.opened || Math.abs(ch.pos.x - pl.pos.x) > 2.8 || Math.abs(ch.pos.z - pl.pos.z) > 2.8 || Math.abs(ch.pos.y - pl.pos.y) > 2.6) continue;
      openChest(ch);
    }
    for (const d of W.discoveries) {
      if (d.found || Math.hypot(d.pos.x - pl.pos.x, d.pos.z - pl.pos.z) > d.r) continue;
      d.found = true;
      const k = W.discoveries.filter((x) => x.found).length;
      SFX.checkpoint();
      game.hud.toast(`🗺️ 새로운 장소 발견! 「${d.name}」 (${k}/${placeTotal})`, 'gold');
    }
    for (const w of W.waterfalls) if (Math.random() < 0.35 && Math.abs(w.pos.x - pl.pos.x) < 160 && Math.abs(w.pos.z - pl.pos.z) < 160) game.fx.burst(w.pos.clone().add(V(Math.random() * 3, 0.5, (Math.random() - 0.5) * 9)), 0xf4fbff, 2, 3);
    game.hud.underwaterOn = camera.position.y < -0.08 && W.isWater(camera.position.x, camera.position.z);
  }

  function getSaveData() {
    const cps = W.checkpoints.map((c, i) => (c.active ? i : -1)).filter((i) => i >= 0);
    const near = W.nearestCheckpoint(pl.pos);
    return {
      v: 1, stage: stageIdx, hard: game.hard, ngplus: game.ngplus, char: pl.kind, quest: q.i >= 0 ? q.i : (q.pending ?? 0),
      rings: pl.rings, health: Math.max(1, Math.round(pl.health)), hearts: pl.storedHearts,
      seed: missionSeed, missionsDone: game.missions.list.map((m) => m.done), stats: pl.stats, kills,
      checkpoints: cps, cp: W.checkpoints.indexOf(near), secret: pl.secretFound,
      chests: W.chests.map((c, i) => (c.opened ? i : -1)).filter((i) => i >= 0),
      places: W.discoveries.map((c, i) => (c.found ? i : -1)).filter((i) => i >= 0),
    };
  }
  function applySave(d) {
    pl.rings = d.rings || 0; pl.health = d.health || 100; pl.storedHearts = d.hearts || 0;
    Object.assign(pl.stats, d.stats || {}); pl.secretFound = !!d.secret;
    if (pl.secretFound && W.secret) W.secret.mesh.visible = false;
    (d.missionsDone || []).forEach((done, i) => { if (game.missions.list[i]) game.missions.list[i].done = done; });
    Object.assign(kills, d.kills || {});
    for (const i of d.checkpoints || []) if (W.checkpoints[i]) { W.activateCheckpoint(W.checkpoints[i]); W.checkpoints[i].flash = 0; }
    for (const i of d.chests || []) { const c = W.chests[i]; if (c) { c.opened = true; c.lid.rotation.x = -1.9; const b = W.beacons.find((x) => x.name === c.name); if (b) b.found = true; } }
    for (const i of d.places || []) if (W.discoveries[i]) W.discoveries[i].found = true;
    applyQuestEffects(d.quest || 0);
    const cp = W.checkpoints[d.cp] || W.startCheckpoint;
    pl.spawnAt(cp.pos.clone().add(V(0, 0.3, 0)), 0);
  }
  game.pauseMenu = new PauseMenu({
    onPause: (v) => { paused = v; if (!v) clockReset = true; },
    getSaveData,
    onLoad: (slot) => { const d = readSave(slot); if (d) location.href = `?stage=${d.stage}&load=${slot}`; },
    onQuit: () => { net.leave(); location.href = location.pathname; },
    onCoop: () => openCoop(),
    getWorlds: () => NAMES.stages.map((name, i) => ({ i, name, locked: i > reached, cur: i === stageIdx })),
    onWorld: (i) => {
      if (net.code && !net.host) { game.hud.toast('같이 하는 중에는 방장이 대지를 골라요'); return; }
      if (net.code && net.host) { net.startAll(i); return; }
      goStage(i);
    },
  });
  game.getSaveData = getSaveData;

  async function startGame() {
    document.activeElement?.blur?.(); // 버튼에 남은 포커스 때문에 스페이스가 버튼을 누르지 않게
    document.body.classList.add('playing'); // 세로로 들고 있으면 '가로로 돌려 주세요'
    initAudio();
    document.getElementById('start').classList.add('hidden');
    if (isTouch) {
      try { await document.documentElement.requestFullscreen?.(); } catch (e) {}
      try { await screen.orientation?.lock?.('landscape'); } catch (e) {}
    }
    pl.spawnAt(W.spawn.pos, W.spawn.yaw);
    game.cam.yaw = W.spawn.yaw; game.cam.first = true;
    game.missions = makeMissions(pl.kind); // 파워형이 아니면 '벽 부수기' 시련은 안 나옴
    if (game.hard) for (const e of game.enemies.list) { e.maxHp = Math.round(e.T.hp * CFG.hard.enemyHp); e.hp = e.maxHp; }
    showStageInfo();
    started = true;
    clock.getDelta();
    playCine(buildIntro(), () => { afterIntro(); if (stageIdx < 5) startQuest(0); game.hud.toast(`${NAMES.characters[pl.kind]}(으)로 ${NAMES.stages[stageIdx]} 스테이지 시작!`); });
  }
  document.getElementById('start-btn').addEventListener('click', () => {
    if (net.code && net.host) { net.startAll(stageSel); return; }       // 방장: 다 같이 시작
    if (net.code && !net.host) { openCoop(); return; }                  // 친구: 방장이 시작할 때까지 대기
    startGame();
  });
  // 월드 선택 (시작 화면)
  {
    const box = document.getElementById('stage-pick');
    NAMES.stages.forEach((name, i) => {
      const b = document.createElement('button');
      b.innerHTML = `${i > reached ? '🔒' : ''}${i + 1}. ${name}`; b.disabled = i > reached; if (i === stageIdx) b.classList.add('sel');
      b.addEventListener('click', () => { if (i !== stageIdx) goStage(i, true); });
      box.appendChild(b);
    });
    if (reached === 0) box.style.display = 'none';
  }
  net.resume();
  if (prog0.hardUnlocked && stageIdx === 0) {
    const box = document.getElementById('modes');
    box.style.display = '';
    for (const b of box.querySelectorAll('button')) b.addEventListener('click', () => {
      game.hard = b.dataset.mode === 'hard';
      for (const x of box.querySelectorAll('button')) x.classList.toggle('sel', x === b);
      showStageInfo(); initAudio(); SFX.jump();
    });
  }

  // ---- 엔딩: 지구로 돌아와 하늘에서 떨어지는 기어의 우주선을 바라봄 → 새게임+ 칸 ----
  function playEnding() {
    const E = S.ending, gfx = game.gfx;
    const G = new THREE.Group(), base = V(0, 0, 60000); G.position.copy(base); scene.add(G);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshLambertMaterial({ color: 0x5fbf4a })); ground.rotation.x = -Math.PI / 2; G.add(ground);
    for (let i = 0; i < 80; i++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 300, t = new THREE.Group(); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3, 6), new THREE.MeshLambertMaterial({ color: 0x8b5a2b })); tr.position.y = 1.5; t.add(tr);
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshLambertMaterial({ color: [0x3fae3a, 0x5cc444, 0x2f9e44][i % 3], flatShading: true })); lf.position.y = 4.4; t.add(lf); G.add(t); }
    const fallShip = makeBattleship(); fallShip.scale.setScalar(1.4); G.add(fallShip);
    const day = () => { const U = gfx.skyMat.uniforms; U.top.value.set(0x2a74ee); U.horizon.value.set(0xc4e6ff); U.bottom.value.set(0xa7c9e4); U.cloudAmt.value = 1; scene.fog.color.set(0xcbe6ff); scene.fog.density = 0.0012; if (gfx.stars) gfx.stars.visible = false; if (gfx.earth) gfx.earth.visible = false; };
    const spot = base.clone().add(V(0, 0, 0));
    const shots = [
      { from: { pos: V(0, 60, pl.pos.z - 60), look: V(0, 0, pl.pos.z + 60) }, dur: 4, text: E[0] },
      { from: () => ({ pos: pl.pos.clone().add(V(8, 10, -14)), look: pl.pos.clone().add(V(0, -20, 0)) }), dur: 4, text: E[1],
        enter: () => { game.shmup.stop(); pl._cv = V(0, -40, 0); pl.superOn = true; pl.view.root.visible = true; gfx.earthOffset.y = -1800; },
        tick: (dt) => { pl._cv.y -= 30 * dt; pl.pos.addScaledVector(pl._cv, dt); pl.view.root.position.copy(pl.pos); game.fx.burst(pl.pos.clone(), 0xffe14d, 2, 4); } },
      { from: () => ({ pos: spot.clone().add(V(6, 2.2, 8)), look: spot.clone().add(V(0, 1.4, 0)) }), dur: 4, text: E[2],
        enter: () => { day(); pl._cv = null; pl.superOn = false; pl.pos.copy(spot); pl.state = 'ground'; pl.yaw = Math.PI; pl.view.root.scale.setScalar(1); pl.updateView(0.1); pl.view.root.visible = true; } },
      { from: { pos: spot.clone().add(V(-4, 1.0, -6)), look: spot.clone().add(V(30, 110, 300)) }, dur: 6, hold: 1, text: E[3],
        enter: () => { fallShip.position.set(-60, 230, 380); }, tick: (dt) => { fallShip.position.add(V(18 * dt, -28 * dt, 0)); fallShip.rotation.z += dt * 0.3; game.fx.burst(base.clone().add(fallShip.position), 0x555555, 2, 4); } },
      { from: { pos: spot.clone().add(V(-4, 1.0, -6)), look: spot.clone().add(V(60, 70, 300)) }, dur: 4, who: `${VIL}:`, text: E[4], tick: (dt) => { fallShip.position.add(V(18 * dt, -28 * dt, 0)); fallShip.rotation.z += dt * 0.3; game.fx.burst(base.clone().add(fallShip.position), 0x555555, 2, 4); } },
      { ...playerShot(LINES[pl.kind].win, me()), from: () => ({ pos: spot.clone().add(V(0, 1.8, 5)), look: spot.clone().add(V(0, 1.4, 0)) }), dur: 3.5 },
      { from: { pos: spot.clone().add(V(30, 40, 60)), look: spot.clone() }, to: { pos: spot.clone().add(V(80, 120, 160)), look: spot.clone() }, dur: 6, hold: 1.5, text: E[5] },
    ];
    playCine(shots, () => {
      markFinalClear();
      const slot = makeNewGamePlusSlot(pl.kind);
      const el = document.getElementById('ending');
      el.innerHTML = `<h1>🎉 스피드 프렌즈 — 엔딩!</h1>
        <p>다섯 크리스탈의 수호자 <b>${nm(pl.kind)}</b>와 친구들 덕분에 세상에 평화가 돌아왔어요!</p>
        <p>💾 <b>${slot}번 칸에 '새게임+'</b>가 만들어졌어요.<br>크리스탈을 모두 가진 채 1스테이지부터 다시, 훨씬 어렵게!</p>
        <p style="opacity:.8">만든 사람: 아빠와 아들 · 함께 해 줘서 고마워요!</p>
        <button id="ending-ok">처음 화면으로</button>`;
      el.classList.add('on');
      document.getElementById('ending-ok').onclick = () => { net.leave(); location.href = location.pathname; };
      playMusic('clear');
    });
  }
  if (stageIdx === 5) game.shmup = new Shmup(game, { net, pl, myName: () => NAMES.characters[pl.kind], onToast: (t) => game.hud.toast(t, 'gold'), onWin: () => playEnding() });
  game.startGame = startGame;
  game.setCharacter = setCharacter;
  document.getElementById('loading').classList.add('hidden');
  // 시작 화면: 이어하기
  const contBtn = document.getElementById('continue-btn'), loadList = document.getElementById('load-list');
  if (hasAnySave() && !LOAD) {
    contBtn.style.display = '';
    contBtn.addEventListener('click', () => { loadList.style.display = loadList.style.display === 'none' ? '' : 'none'; showLoadList(loadList, (slot) => { const d = readSave(slot); location.href = `?stage=${d.stage}&load=${slot}`; }); });
  }
  if (LOAD?.ngFresh) { // 새게임+ 처음 시작: 1스테이지 이야기부터 (크리스탈은 모두 가진 채, 어렵게)
    document.getElementById('start').classList.add('hidden');
    startGame().then(() => game.hud.toast('⭐ 새게임+! 크리스탈을 모두 가진 채, 훨씬 어려운 모험이 시작돼요!', 'gold'));
  } else if (LOAD) { // 저장한 곳에서 이어하기
    initAudio();
    document.body.classList.add('playing');
    document.getElementById('start').classList.add('hidden');
    applySave(LOAD);
    W.stream(pl.pos, 0, true);
    game.cam.yaw = pl.yaw; game.cam.first = true;
    if (game.hard) for (const e of game.enemies.list) { e.maxHp = Math.round(e.T.hp * CFG.hard.enemyHp); e.hp = Math.min(e.hp, e.maxHp) || e.maxHp; }
    showStageInfo();
    started = true; clock.getDelta();
    game.hud.hide(false); game.pauseMenu.enable(true);
    startQuest(Math.min(LOAD.quest || 0, quests.length - 1), true);
    game.hud.toast(`📂 ${loadSlot}번 칸에서 이어하기!`, 'gold');
  } else if (sessionStorage.getItem('sf-autostart')) { sessionStorage.removeItem('sf-autostart'); sessionStorage.removeItem('sf-carry'); startGame(); }
  else if (stageIdx > 0 && carry && !carry.pick) { sessionStorage.removeItem('sf-carry'); startGame(); }
  else document.getElementById('start').classList.remove('hidden');
  frame();
}
