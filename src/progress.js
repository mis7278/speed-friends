// 진행 저장 (이 기기의 브라우저에 저장): 되찾은 대지의 크리스탈, 도전 모드 해금
const KEY = 'sf-progress-v1';

export const BIG_CRYSTALS = [
  { name: '숲의 크리스탈', color: '#3ddc5a', emoji: '🟢' },
  { name: '얼음의 크리스탈', color: '#4fb8ff', emoji: '🔵' },
  { name: '파괴의 크리스탈', color: '#ff5a3a', emoji: '🔴' }, // 모든 것을 부술 수 있는 힘
  { name: '하늘의 크리스탈', color: '#ffd23a', emoji: '🟡' },
  { name: '우주의 크리스탈', color: '#b070ff', emoji: '🟣' }, // 우주를 만드는 힘 (마지막 크리스탈)
];
// 6스테이지(최후의 결전)에는 크리스탈이 없음. 5개를 다 모으면 언제든 슈퍼 변신.

export function loadProgress() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!p || !Array.isArray(p.crystals)) p = { crystals: [], hardUnlocked: false, hardCrystals: [] };
  for (const k of ['crystals', 'hardCrystals']) { if (!Array.isArray(p[k])) p[k] = []; p[k] = p[k].slice(0, BIG_CRYSTALS.length); while (p[k].length < BIG_CRYSTALS.length) p[k].push(false); }
  if (!Array.isArray(p.hullHoles)) p.hullHoles = [];
  return p;
}
// 가 본 대지 (월드 선택에서 고를 수 있음)
export function markReached(stageIdx) {
  const p = loadProgress();
  if ((p.reached || 0) < stageIdx) { p.reached = stageIdx; saveProgress(p); }
  return p.reached || 0;
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
}
// 스테이지를 깨서 크리스탈을 되찾음. 돌려주는 값: { count, newlyUnlockedHard }
export function recoverCrystal(stageIdx, hard) {
  const p = loadProgress();
  const list = hard ? p.hardCrystals : p.crystals;
  list[stageIdx] = true;
  let newlyUnlockedHard = false;
  if (!hard && !p.hardUnlocked && p.crystals.every(Boolean)) { p.hardUnlocked = true; newlyUnlockedHard = true; }
  saveProgress(p);
  return { count: list.filter(Boolean).length, newlyUnlockedHard };
}

// 5스테이지 우주선 외벽에 뚫은 구멍 (다시 메워지지 않음, 새게임+를 처음 시작할 때만 초기화)
export function addHullHole(h) { const p = loadProgress(); if (!p.hullHoles.some((q) => Math.abs(q.a - h.a) < 1e-4)) { p.hullHoles.push(h); saveProgress(p); } }
export function resetForNewGamePlus() { const p = loadProgress(); p.hullHoles = []; p.ngplus = true; p.crystals = BIG_CRYSTALS.map(() => true); saveProgress(p); } // 크리스탈은 모두 가진 채
export function markFinalClear() { const p = loadProgress(); p.finalCleared = true; p.reached = Math.max(p.reached || 0, 5); saveProgress(p); }
