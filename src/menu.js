// 멈춤 메뉴: 계속하기 / 저장하기 / 불러오기 / 처음 화면으로
import { listSaves, writeSave } from './save.js';
import { NAMES } from './names.js';

const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

function slotLabel(s) {
  if (!s.data) return `<b>${s.slot}번</b> <span class="slot-empty">비어 있음</span>`;
  const d = s.data, dt = new Date(d.date);
  const when = `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return `<b>${s.slot}번</b> ${d.ngplus ? '<span class="ngp">새게임+</span> ' : ''}${NAMES.stages[d.stage] || ''} · 퀘스트 ${Math.min(5, (d.quest || 0) + 1)}/5 · ${NAMES.characters[d.char] || ''}${d.hard ? ' · ⭐어려움' : ''} <small>${when}</small>`;
}

export class PauseMenu {
  // opts: { onPause(bool), getSaveData(), onLoad(slot), onQuit() }
  constructor(opts) {
    this.opts = opts;
    this.open = false;
    this.btn = $('button', 'pause-btn', document.body, '⏸');
    this.btn.title = '메뉴 (Esc)';
    this.btn.style.display = 'none';
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this.box = $('div', 'pmenu', document.body);
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.enabled) { e.preventDefault(); this.toggle(); }
    });
  }
  enable(v) { this.enabled = v; this.btn.style.display = v ? '' : 'none'; if (!v) this.close(); }
  toggle() { this.open ? this.close() : this.show(); }
  show() { this.open = true; this.opts.onPause(true); this.main(); this.box.classList.add('on'); }
  close() { if (!this.open) return; this.open = false; this.box.classList.remove('on'); this.opts.onPause(false); }

  page(title, buttons) {
    this.box.innerHTML = '';
    const panel = $('div', 'pmenu-panel', this.box);
    $('div', 'pmenu-title', panel, title);
    for (const [label, fn, cls] of buttons) { const b = $('button', 'pmenu-btn ' + (cls || ''), panel, label); b.addEventListener('click', fn); }
  }
  worlds() {
    const list = this.opts.getWorlds?.() || [];
    this.page('🗺️ 어느 대지로 갈까요?', [
      ...list.map((w) => [`${w.locked ? '🔒' : w.cur ? '📍' : '🌍'} ${w.i + 1}. ${w.name}${w.cur ? ' (지금 여기)' : ''}`, () => { if (!w.locked && !w.cur) this.opts.onWorld(w.i); }, w.locked ? 'empty' : '']),
      ['← 돌아가기', () => this.main()],
    ]);
  }
  main() {
    this.page('⏸ 멈춤', [
      ['▶ 계속하기', () => this.close(), 'big'],
      ['💾 저장하기', () => this.slots('save')],
      ['📂 불러오기', () => this.slots('load')],
      ['🗺️ 월드 선택', () => this.worlds()],
      ['👥 같이 하기', () => this.opts.onCoop?.()],
      ['🏠 처음 화면으로', () => this.confirm('처음 화면으로 갈까요?<br><small>저장하지 않은 진행은 사라져요</small>', () => this.opts.onQuit())],
    ]);
  }
  slots(mode) {
    const saves = listSaves();
    const btns = saves.map((s) => [slotLabel(s), () => {
      if (mode === 'save') {
        const doSave = () => { writeSave(s.slot, this.opts.getSaveData()); this.toast(`${s.slot}번 칸에 저장했어요! 💾`); this.slots('save'); };
        const warn = s.data?.ngplus ? `⚠️ ${s.slot}번 칸은 <b>새게임+</b> 칸이에요!<br>덮어쓰면 원래 새게임+ 시작 기록이 사라져요. 정말 덮어쓸까요?` : `⚠️ ${s.slot}번 칸에 이미 저장된 기록이 있어요.<br>덮어쓰면 원래 기록은 사라져요. 덮어쓸까요?`;
        s.data ? this.confirm(warn, doSave, () => this.slots('save')) : doSave();
      } else if (s.data) this.confirm(`${s.slot}번 칸을 불러올까요?<br><small>지금 진행은 저장하지 않으면 사라져요</small>`, () => this.opts.onLoad(s.slot), () => this.slots('load'));
    }, 'pslot' + (s.data ? '' : ' empty')]);
    btns.push(['← 뒤로', () => this.main(), 'back']);
    this.page(mode === 'save' ? '💾 저장하기' : '📂 불러오기', btns);
  }
  confirm(text, yes, no = () => this.main()) {
    this.page(text, [['네', yes, 'big'], ['아니요', no, 'back']]);
  }
  toast(text) { const t = $('div', 'pmenu-toast', this.box, text); setTimeout(() => t.remove(), 1600); }
}

// 시작 화면의 "이어하기" 목록
export function showLoadList(container, onLoad) {
  container.innerHTML = '';
  for (const s of listSaves()) {
    const b = $('button', 'pmenu-btn pslot' + (s.data ? '' : ' empty'), container, slotLabel(s));
    if (s.data) b.addEventListener('click', () => onLoad(s.slot));
  }
}
