// 크리스탈 미션: 스테이지마다 아래 목록에서 3개를 랜덤으로 뽑음.
// 같이 할 때는 모두 같은 미션(같은 seed), 달성은 각자.
import { mulberry32 } from './world.js';

export const MISSION_POOL = [
  { id: 'kills', stat: 'kills', target: 15, text: (n) => `몬스터 ${n}마리 처치` },
  { id: 'rings', stat: 'ringsCollected', target: 150, text: (n) => `링 ${n}개 모으기` },
  { id: 'jumps', stat: 'jumps', target: 80, text: (n) => `점프 ${n}번 하기` },
  { id: 'secret', stat: 'secret', target: 1, text: () => `숨겨진 장소 찾기` },
  { id: 'slamMulti', stat: 'slamMulti', target: 1, text: () => `내려찍기 한 번에 몬스터 3마리 맞히기` },
  { id: 'loops', stat: 'loops', target: 3, text: (n) => `360도 루프 ${n}번 통과` },
  { id: 'walls', stat: 'walls', target: 5, text: (n) => `부서지는 벽 ${n}개 부수기`, needs: 'walls' },
  { id: 'maxSpin', stat: 'maxSpins', target: 3, text: (n) => `스핀 최대 충전(10회)으로 ${n}번 튀어나가기` },
  { id: 'springs', stat: 'springs', target: 8, text: (n) => `스프링으로 ${n}번 튀어오르기` },
  { id: 'noHit', stat: 'bestStreak', target: 8, text: (n) => `맞지 않고 몬스터 ${n}마리 연속 처치` },
];

export function newStats() {
  return { kills: 0, ringsCollected: 0, jumps: 0, secret: 0, slamMulti: 0, loops: 0, walls: 0, maxSpins: 0, springs: 0, streak: 0, bestStreak: 0 };
}

export class Missions {
  constructor(seed, features = {}) {
    const rnd = mulberry32(seed);
    const pool = MISSION_POOL.filter((m) => !m.needs || features[m.needs]);
    const picked = [];
    while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    this.list = picked.map((m) => ({ ...m, done: false }));
  }
  // 새로 달성한 미션들을 돌려줌
  check(stats) {
    const out = [];
    for (const m of this.list) {
      if (!m.done && stats[m.stat] >= m.target) { m.done = true; out.push(m); }
    }
    return out;
  }
  get crystals() { return this.list.filter((m) => m.done).length; }
}
