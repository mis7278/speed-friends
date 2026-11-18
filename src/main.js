// 게임 시작점
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';
import { NAMES } from './names.js';
import { Input } from './input.js';
import { initSound as initAudio, SFX, SFX_INFO, BGM_INFO, playMusic, playVoice, stopVoice } from './audio.js';
import { World, ZONES } from './world.js';
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
import { Scientist, GearHologram, LINES, RADIO_FRIEND } from './story.js';
import { loadProgress, recoverCrystal, BIG_CRYSTALS } from './progress.js';
import { readSave, hasAnySave } from './save.js';
import { PauseMenu, showLoadList } from './menu.js';
import { Guardians } from './guardian.js';
import { Net } from './net.js';

function showError(msg) {
  let box = document.getElementById('err');
  if (!box) { box = document.createElement('div'); box.id = 'err'; document.body.appendChild(box); }
  box.textContent += msg + '\n';
}
window.addEventListener('error', (e) => showError('오류: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', (e) => showError('오류: ' + (e.reason && e.reason.message || e.reason)));

// ---- 스테이지 정보 ----
const STAGES = [
  { theme: 'forest', place: '숲', big: '녹슨 대공장' },
  { theme: 'ice', place: '얼음 나라', big: '얼어붙은 대공장' },
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
];
document.getElementById('loading-stage').textContent = `STAGE ${stageIdx + 1}`;
document.getElementById('loading-title').textContent = NAMES.stages[stageIdx];
document.getElementById('loading-tip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const loadSlot = parseInt(params.get('load') || '0', 10);
const LOAD = loadSlot ? readSave(loadSlot) : null;
const game = { time: 0, freezeT: 0, players: [], hard: LOAD ? !!LOAD.hard : !!(stageIdx > 0 && carry?.hard) };
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
  game.world = new World(scene, STAGE.theme, { mobile: isTouch });
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
  setCharacter(LOAD ? LOAD.char : carry?.char && stageIdx > 0 ? carry.char : 'speed');
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
  // ---- 같이 하기 ----
  const net = new Net(game); game.net = net; game.hud.friends = net.remotes;
  const coopPanel = document.getElementById('coop-panel'), coopStatus = document.getElementById('coop-status'), coopList = document.getElementById('coop-list');
  const coopBadge = document.getElementById('coop-badge'), coopLeave = document.getElementById('coop-leave'), coopCode = document.getElementById('coop-code');
  net.onChange = () => {
    coopStatus.textContent = net.status;
    coopLeave.style.display = net.code ? '' : 'none';
    coopList.textContent = net.code ? `지금 ${net.count}명` + (net.remotes.size ? ' — ' + [...net.remotes.values()].map((r) => `P${r.num} ${NAMES.characters[r.kind]}`).join(', ') : '') : '';
    coopBadge.classList.toggle('on', !!net.code);
    coopBadge.textContent = net.code ? `👥 방 ${net.code} · ${net.count}명` : '';
  };
  const openCoop = () => { coopPanel.classList.add('on'); net.onChange(); };
  document.getElementById('coop-btn').addEventListener('click', openCoop);
  document.getElementById('coop-close').addEventListener('click', () => coopPanel.classList.remove('on'));
  document.getElementById('coop-host').addEventListener('click', () => net.createRoom());
  document.getElementById('coop-join').addEventListener('click', () => net.joinRoom(coopCode.value));
  coopCode.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') net.joinRoom(coopCode.value); });
  coopLeave.addEventListener('click', () => net.leave());
  game.openCoop = openCoop;
  net.resume();
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
  const TREE = NAMES.heartTree, CRY = NAMES.bigCrystal, EMP = NAMES.empire;
  const nm = (k) => NAMES.characters[k];
  const friendKind = () => RADIO_FRIEND[pl.kind];
  const radio = () => `${nm(friendKind())} (무전):`;
  const me = () => `${nm(pl.kind)}:`;
  const STORY = stageIdx === 0 ? {
    intro: [
      `${NAMES.island} 숲 한가운데. ${TREE} 속 숲의 크리스탈이 숲에 풍요를 가져다주고 있었어요.`,
      `그런데 어느 날, ${VIL}의 로봇 군단이 숲을 빙 둘러쌌어요!`,
      `로봇들은 ${TREE}에 관을 꽂아 크리스탈의 힘을 빨아들이기 시작했어요.`,
      '숲의 동물 친구들은 붙잡혀서 로봇 안에 갇혀 버렸어요...',
      `와하하! 크리스탈의 힘은 이제 이 천재 ${VIL}님 거다! 이 숲은 위대한 ${EMP}의 첫 번째 땅이 될 것이다!`,
      '숲 한가운데에 로봇 군단에 명령을 보내는 로봇 기지가 생겼어요.',
      '로봇을 부수면 안에 갇힌 동물 친구들이 풀려나! 먼저 기지의 안테나 탑을 부수자!',
    ],
    q2: ['으앗, 안테나 탑이! 괘, 괜찮아! 공장에서 로봇은 얼마든지 다시 만들 수 있다고!', '저 공장에서 동물 친구들을 잡아다 로봇 안에 가두고 있어요!', '공장 안으로 들어가서 친구들을 다 구하고, 생산 기계를 멈추자!'],
    q3: ['렌치! 이 멍청이! 작은 공장 하나 지키지도 못하다니! 녹슨 대공장을 전부 가동해라!', '히익! 네, 넵! 기어님!', `대공장의 파이프가 ${TREE}까지 이어져 있어요. 크리스탈의 힘으로 더 강한 로봇을 만들고 있어요!`, '대공장을 멈추면 나무가 숨을 쉴 수 있어! 쳐들어가자!'],
    flee: ['으악! 내 대공장이...! 기어님께 혼나겠어~!', `${SCI}가 보라 늪 쪽으로 허둥지둥 도망쳐요!`],
    q4: '보라 늪 한가운데의 과학 연구소. 빼앗은 크리스탈의 힘이 저기 모이고 있어요.',
    boss: ['여기까지 쫓아오다니! 하지만 크리스탈의 힘을 가득 채운 내 최고 걸작을 보면 깜짝 놀랄걸?', '하늘에서 거대한 로봇이 내려왔어요!', `${NAMES.finalBoss}, 출동! 기어님께 칭찬받을 테다!`, '보스는 숲 어디든 쫓아와요! 충격파는 점프로 피하고, 주저앉아 핵이 빛날 때 공격!'],
    end: [`${NAMES.finalBoss}가 쓰러지자, 빼앗겼던 크리스탈의 힘이 ${TREE}로 돌아가요!`, `관이 모두 끊어지고 ${TREE}가 다시 환하게 빛나요. 숲에 풍요가 돌아왔어요!`, '으아앙! 기어님께 이를 거야~!', '숲을 둘러싼 기계들도 무너져 내려요!', '크윽...! 숲 하나쯤 줘 버리지! 얼음 나라의 크리스탈은 이미 내 손 안에 있다! 와하하!', '얼음 나라가 위험해! 숲 밖으로 나가서 얼음 나라로 가자!'],
  } : {
    intro: [
      '얼음 나라. 얼음의 크리스탈 덕분에 맑고 반짝이는 눈이 내리던 곳이에요.',
      `하지만 ${VIL}의 로봇 군단이 이곳도 둘러쌌어요!`,
      '빼앗긴 얼음의 크리스탈로 거대한 제설 기계가 돌아가고 있어요.',
      '얼음 나라의 동물 친구들도 로봇 안에 갇혀 버렸어요...',
      `와하하! 기계 눈으로 덮인 얼음 나라! ${EMP}에 딱 어울리는구나!`,
      '먼저 로봇 기지부터!',
      '여긴 정말 춥다... 그래도 힘내자! 기지의 안테나 탑부터 부수자!',
    ],
    q2: ['또 왔냐?! 공장은 또 만들면 그만이라고!', '저 공장에 동물 친구들이 갇혀 있어요!', '공장 안 친구들을 구하고 생산 기계를 멈추자!'],
    q3: ['렌치! 얼어붙은 대공장을 가동해라!', '네, 넵!', '대공장이 크리스탈의 힘을 빨아들이고 있어요!', '쳐들어가자!'],
    flee: ['으악! 또야?!', `${SCI}가 또 도망쳐요!`],
    q4: `${SCI}가 연구소로 숨었어요.`,
    boss: ['이번엔 다를걸?', '거대한 로봇이 내려왔어요!', '출동!', '충격파는 점프로 피하고, 핵이 빛날 때 공격!'],
    end: ['로봇이 쓰러지자 크리스탈의 힘이 돌아가요!', '얼어붙었던 나무가 다시 빛나요!', '으아앙~!', '포위하던 기계들이 무너져요!', '흥! 화산에서 기다리고 있으마! 와하하!', '다음 이야기는 아직 만드는 중이에요. 자유롭게 달려보세요!'],
  };

  // ---- 목소리 파일 이름표 (sounds/voice/아이디.mp3) ----
  const WHO = { intro: ['narr', 'narr', 'narr', 'narr', 'gear', 'narr', stageIdx === 0 ? 'friend' : 'player'], q2: ['wrench', 'narr', 'friend'], q3: ['gear', 'wrench', 'narr', 'friend'],
    flee: ['wrench', 'narr'], q4: ['narr'], boss: ['wrench', 'narr', 'wrench', 'narr'], end: ['narr', 'narr', 'wrench', 'narr', 'gear', stageIdx === 0 ? 'friend' : 'narr'] };
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
  const tree = Tq.heartTree;
  const treeShot = (text, who, extra = {}) => ({
    from: { pos: tree.clone().add(V(-38, 14, 30)), look: tree.clone().add(V(0, 18, 0)) },
    to: { pos: tree.clone().add(V(-20, 8, 36)), look: tree.clone().add(V(0, 14, 0)) }, dur: 4.5, text, who, ...extra });

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
      text: () => `${NAMES.finalBoss}를 물리쳐라! (주저앉아 핵이 빛날 때 공격)`,
      intro: () => {
        const pad = W.labPad;
        return [
          { from: { pos: pad.clone().add(V(0, 9, 16)), look: sci.pos.clone() }, to: { pos: pad.clone().add(V(4, 8, 13)), look: sci.pos.clone() }, dur: 3, who: `${SCI}:`, text: S.boss[0] },
          { from: { pos: pad.clone().add(V(0, 2, 34)), look: pad.clone().add(V(0, 40, 0)) }, to: { pos: pad.clone().add(V(8, 1.5, 28)), look: pad.clone().add(V(0, 8, 0)) }, dur: 3.5,
            text: S.boss[1],
            enter: () => { game.boss = new Boss(game, { hpScale: 1 + 0.75 * (playerCount - 1), name: NAMES.finalBoss }); game.boss.spawnNear(pad, 0.01); sci.flyTo(pad.clone().add(V(0, 7, 14)), 1.5); } },
          { from: () => ({ pos: game.boss.pos.clone().add(V(10, 3, 16)), look: game.boss.pos.clone().add(V(0, 2, 0)) }), dur: 3,
            who: `${SCI}:`, text: S.boss[2], enter: () => sci.flyTo(game.boss.pos.clone().add(V(0, 2.5, 0)), 1.6) },
          { from: () => ({ pos: game.boss.pos.clone().add(V(-14, 4, 18)), look: game.boss.pos.clone() }), dur: 3, text: S.boss[3], enter: () => sci.hide() },
        ];
      },
      introEnd: () => { holo.hide(); sci.hide(); if (!game.boss) { game.boss = new Boss(game, { name: NAMES.finalBoss }); game.boss.spawnNear(W.labPad, 0.01); } game.boss.opts.onDefeated = bossDefeated; },
      done: () => game.boss?.done,
      outro: () => {
        const ang = Math.atan2(pl.pos.x, pl.pos.z);
        const bp = game.boss.pos.clone();
        return [
          { from: { pos: bp.clone().add(V(16, 6, 16)), look: bp }, dur: 3, text: S.end[0], enter: () => { sci.show(bp.clone().add(V(0, 3, 0))); } },
          treeShot(S.end[1], null, { enter: () => { W.restoreTree(); SFX.crystal(); for (let i = 0; i < 4; i++) setTimeout(() => { game.fx.burst(tree.clone().add(V(0, 14 + i * 6, 0)), 0x9dff9a, 24, 12); game.fx.shockwave(tree.clone().add(V(0, 1, 0)), 14 + i * 6, 0x9dff9a); }, i * 350); } }),
          { from: () => ({ pos: sci.pos.clone().add(V(-10, 4, -10)), look: sci.pos.clone() }), dur: 3, who: `${SCI}:`, text: S.end[2],
            enter: () => { sci.show(bp.clone().add(V(0, 3, 0))); sci.flyTo(bp.clone().add(V(Math.sin(ang + Math.PI) * 300, 60, Math.cos(ang + Math.PI) * 300)), 4); } },
          { ...barrierShot(ang, S.end[3]), enter: () => { sci.hide(); W.removeBarrier(); } },
          gearShot(ang + 0.6, S.end[4]),
          hideHolo(playerShot(S.end[5], stageIdx === 0 ? radio() : null)),
        ];
      },
      outroEnd: () => {
        holo.hide(); sci.hide(); W.restoreTree();
        const r = recoverCrystal(stageIdx, game.hard);
        const C = BIG_CRYSTALS[stageIdx];
        SFX.crystal();
        game.hud.toast(`${C.emoji} ${C.name}을(를) 되찾았다! (${r.count}/5)`, 'gold');
        if (r.newlyUnlockedHard) setTimeout(() => game.hud.toast('⭐ 다섯 크리스탈을 모두 되찾았다! 시작 화면에서 "도전 모드"를 할 수 있어요!', 'gold'), 2600);
        showStageInfo();
      } },
    { title: '🎉 스테이지 클리어!', target: () => (stageIdx + 1 >= STAGES.length ? null : pl.pos.z < W.exitGate.z ? W.exitGate : V(0, 0, CFG.world.exitR + 40)),
      text: () => stageIdx + 1 < STAGES.length ? `북쪽 눈길을 따라 끝까지 달려가면 ${NAMES.stages[stageIdx + 1]}(으)로! ❄️` : '다음 이야기는 아직 만드는 중이에요! 자유롭게 달려보세요',
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
  function completeQuest() {
    const Q = quests[q.i];
    SFX.quest(); game.hud.toast('✅ 퀘스트 완료!', 'gold');
    q.i = -2; // 잠깐 멈춤
    const idx = quests.indexOf(Q);
    q.pending = idx + 1;
    const next = () => { Q.outroEnd?.(); startQuest(idx + 1); };
    if (Q.outro) setTimeout(() => playCine(Q.outro(), next), 900); else next();
  }
  game.quests = q; game.startQuest = startQuest;

  // 처음 이야기 (고른 캐릭터에 맞춰 시작할 때 만듦)
  const buildIntro = () => [
    { from: { pos: tree.clone().add(V(-90, 60, 110)), look: tree.clone().add(V(0, 20, 0)) }, to: { pos: tree.clone().add(V(-40, 30, 70)), look: tree.clone().add(V(0, 22, 0)) }, dur: 5, text: S.intro[0] },
    barrierShot(0.15, S.intro[1]),
    treeShot(S.intro[2]),
    orbit(rust, 160, 60, 0.6, 1.3, 4.5, S.intro[3]),
    gearShot(0.4, S.intro[4]),
    hideHolo(orbit(Tq.base, 60, 28, 3.6, 2.6, 4, S.intro[5])),
    playerShot(stageIdx === 0 ? LINES[pl.kind].start : S.intro[6], me()),
    { ...playerShot(stageIdx === 0 ? S.intro[6] : '', radio()), dur: 3.5 },
  ];

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
  const CRY_NAME = BIG_CRYSTALS[stageIdx].name;
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
  const showStageInfo = () => { const pr = loadProgress(); game.hud.setStageInfo(STAGE.place, game.hard ? pr.hardCrystals : pr.crystals, BIG_CRYSTALS.map((c) => c.color), game.hard); };
  showStageInfo();

  // ---- 아이템 버튼 ----
  const origUpdate = game.input.update.bind(game.input);
  game.input.update = (dt) => {
    origUpdate(dt);
    if (!started) return;
    if (game.input.buttons.item1.pressed) game.hud.toast(`💎 ${NAMES.crystal} ${game.missions.crystals}/3 — 오른쪽 위 시련 3개를 해내면 크리스탈이 보내줘요`);
    if (game.input.buttons.item2.pressed) pl.useHeart();
  };

  // ---- 다음 스테이지로 ----
  let leaving = false;
  function goNextStage() {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('sf-carry', JSON.stringify({ char: pl.kind, hearts: pl.storedHearts, hard: game.hard })); } catch (e) {}
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
    game.enemies.update(dt, game.time, game.players);
    game.rings.update(dt, game.time, game.players);
    game.pickups.update(dt, game.time, game.players, W);
    game.fx.update(dt);
    W.update(dt, game.time);
    game.boss?.update(dt, game.time);
    sci.update(dt, game.time);
    game.cam.update(dt, pl, input, W);
    W.stream(pl.pos, dt);
    game.gfx.update(dt, game.time, pl.pos);

    if (!game.hard) for (const m of game.missions.check(pl.stats)) giveSeed(m);
    let target = null;
    const Q = quests[q.i];
    if (Q) {
      target = Q.target();
      Q.tick?.();
      if (Q.done()) completeQuest();
      else { const t = questText(Q); if (game.hud.questText.textContent !== t) game.hud.questText.textContent = t; }
    }
    if (game.boss && game.boss.alive && game.boss.state !== 'enter') game.hud.setBoss(`🤖 ${game.boss.name}`, game.boss.hp / game.boss.maxHp);
    if (pl.alive && stageIdx + 1 < STAGES.length && pl.pos.z > CFG.world.exitR && Math.abs(pl.pos.x) < 140) {
      if (W.barrierUp && !leaving) game.hud.toast('🏃 기어 군단을 따돌렸다! 다음 대지로!', 'gold');
      goNextStage();
    }
    exploreTick(dt);
    net.update(dt);
    // 장벽을 몰래 넘어가면 기어 군단이 막음
    if (W.barrierUp && pl.alive && Math.hypot(pl.pos.x, pl.pos.z) > CFG.world.barrierR + 8) guardians.trigger();
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
    c.className = 'card' + (k === pl.kind ? ' sel' : '');
    c.innerHTML = `<div class="card-dot" style="background:#${d.body.toString(16).padStart(6, '0')}"></div><div class="card-name">${NAMES.characters[k]}</div><div class="card-type">${typeName[k]}</div><div class="card-desc">${d.desc}</div>`;
    c.addEventListener('click', () => {
      for (const el of cards.children) el.classList.remove('sel');
      c.classList.add('sel');
      setCharacter(k);
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
      v: 1, stage: stageIdx, hard: game.hard, char: pl.kind, quest: q.i >= 0 ? q.i : (q.pending ?? 0),
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
    // 이미 지나간 퀘스트의 결과를 맵에 반영
    const dead = (tag) => { const c = core(tag); if (c) { c.alive = false; c.mesh.visible = false; c.shielded = false; } };
    if (d.quest >= 1) dead('base');
    if (d.quest >= 2) dead('factory');
    if (d.quest === 3 || d.quest === 4) sci.show(W.labPad.clone().add(V(0, 7, 0)));
    if (d.quest >= 5) { W.removeBarrier(); W.barrierSink = 9; W.restoreTree(); }
    const cp = W.checkpoints[d.cp] || W.startCheckpoint;
    pl.spawnAt(cp.pos.clone().add(V(0, 0.3, 0)), 0);
  }
  game.pauseMenu = new PauseMenu({
    onPause: (v) => { paused = v; if (!v) clockReset = true; },
    getSaveData,
    onLoad: (slot) => { const d = readSave(slot); if (d) location.href = `?stage=${d.stage}&load=${slot}`; },
    onQuit: () => { net.leave(); location.href = location.pathname; },
    onCoop: () => openCoop(),
  });
  game.getSaveData = getSaveData;

  async function startGame() {
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
    playCine(buildIntro(), () => { startQuest(0); game.hud.toast(`${NAMES.characters[pl.kind]}(으)로 ${NAMES.stages[stageIdx]} 스테이지 시작!`); });
  }
  document.getElementById('start-btn').addEventListener('click', startGame);
  if (prog0.hardUnlocked && stageIdx === 0) {
    const box = document.getElementById('modes');
    box.style.display = '';
    for (const b of box.querySelectorAll('button')) b.addEventListener('click', () => {
      game.hard = b.dataset.mode === 'hard';
      for (const x of box.querySelectorAll('button')) x.classList.toggle('sel', x === b);
      showStageInfo(); initAudio(); SFX.jump();
    });
  }

  game.startGame = startGame;
  game.setCharacter = setCharacter;
  document.getElementById('loading').classList.add('hidden');
  // 시작 화면: 이어하기
  const contBtn = document.getElementById('continue-btn'), loadList = document.getElementById('load-list');
  if (hasAnySave() && !LOAD) {
    contBtn.style.display = '';
    contBtn.addEventListener('click', () => { loadList.style.display = loadList.style.display === 'none' ? '' : 'none'; showLoadList(loadList, (slot) => { const d = readSave(slot); location.href = `?stage=${d.stage}&load=${slot}`; }); });
  }
  if (LOAD) { // 저장한 곳에서 이어하기
    initAudio();
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
  } else if (stageIdx > 0 && carry) { sessionStorage.removeItem('sf-carry'); startGame(); }
  else document.getElementById('start').classList.remove('hidden');
  frame();
}
