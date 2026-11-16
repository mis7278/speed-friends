// 저장 슬롯 3개 (이 기기의 브라우저에 저장)
const KEY = 'sf-save-slot-';
export const SLOT_COUNT = 3;

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
