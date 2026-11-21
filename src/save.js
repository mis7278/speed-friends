// 저장 슬롯 8개 (이 기기의 브라우저에 저장)
const KEY = 'sf-save-slot-';
export const SLOT_COUNT = 8;

export function readSave(slot) {
  try { return JSON.parse(localStorage.getItem(KEY + slot) || 'null'); } catch (e) { return null; }
}
export function writeSave(slot, data) {
  try { localStorage.setItem(KEY + slot, JSON.stringify({ ...data, date: Date.now() })); return true; } catch (e) { return false; }
}
export function listSaves() {
  const out = [];
  for (let i = 1; i <= SLOT_COUNT; i++) out.push({ slot: i, data: readSave(i) });
  return out;
}
export function hasAnySave() { return listSaves().some((s) => s.data); }
// 엔딩을 보면 새게임+ 칸을 자동으로 만듦 (빈 칸 우선, 없으면 8번 칸)
export function makeNewGamePlusSlot(char) {
  const list = listSaves();
  const free = list.find((s) => !s.data) || list.find((s) => s.data?.ngplus) || list[list.length - 1];
  writeSave(free.slot, { v: 1, stage: 0, hard: true, ngplus: true, ngFresh: true, char: char || 'speed', quest: 0, rings: 0, health: 100, hearts: 0, missionsDone: [], stats: {}, kills: {}, checkpoints: [], cp: -1, chests: [], places: [] });
  return free.slot;
}
