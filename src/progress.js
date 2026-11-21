// 진행 저장 (이 기기의 브라우저에 저장): 되찾은 대지의 크리스탈, 도전 모드 해금
const KEY = 'sf-progress-v1';

export const BIG_CRYSTALS = [
  { name: '숲의 크리스탈', color: '#3ddc5a', emoji: '🟢' },
  { name: '얼음의 크리스탈', color: '#4fb8ff', emoji: '🔵' },
  { name: '불꽃의 크리스탈', color: '#ff5a3a', emoji: '🔴' },
  { name: '하늘의 크리스탈', color: '#ffd23a', emoji: '🟡' },
  { name: '다섯째 크리스탈', color: '#b070ff', emoji: '🟣' },
  { name: '여섯째 크리스탈', color: '#ffffff', emoji: '⚪' },
];

export function loadProgress() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!p || !Array.isArray(p.crystals)) p = { crystals: [], hardUnlocked: false, hardCrystals: [] };
  for (const k of ['crystals', 'hardCrystals']) { if (!Array.isArray(p[k])) p[k] = []; while (p[k].length < BIG_CRYSTALS.length) p[k].push(false); }
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
