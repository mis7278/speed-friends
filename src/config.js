// =====================================================
//  게임 수치 설정 (여기 숫자만 바꾸면 게임 느낌이 바뀝니다)
// =====================================================
export const CFG = {
  player: {
    radius: 0.6,          // 몸 두께
    height: 1.6,          // 키
    decel: 26,            // 방향키를 뗐을 때 감속
    brake: 55,            // 반대 방향을 눌렀을 때 브레이크
    turnRate: 8,          // 방향 전환 빠르기
    airControl: 0.55,     // 공중 조작 비율
    gravity: 40,          // 중력
    jumpVel: 26.8,        // 점프 힘 (높이는 힘의 제곱에 비례: 15.5 → 26.8 이면 약 3배 높이)
    dashSpeed: 34,        // 2단 점프 돌진 속도
    dashLift: 3,          // 돌진할 때 살짝 떠오르는 힘
    spinMaxTaps: 10,      // 스핀 최대 연타 횟수
    spinLaunchBase: 26,   // 스핀 1회 눌렀을 때 튀어나가는 속도
    spinLaunchPerTap: 3.2,// 연타 1회당 추가 속도 (10회 = 약 55)
    rollToRun: 0.9,       // 스핀으로 구르다가 방향키를 누르고 있으면 이 시간(초) 뒤 달리기로 바뀜 (속도 유지)
    overDecay: 2.0,       // 3단 최고 속도보다 빠를 때 초당 줄어드는 속도 (작을수록 오래 빠름)
    rollMinSpeed: 7,      // 이 속도 아래로 떨어지면 구르기 끝
    slamSpeed: 48,        // 내려찍기 낙하 속도
    slamRadius: 6.5,      // 내려찍기 범위
    bounceVel: 15,        // 몬스터 밟고 튀어오르는 힘 (약 2.8m)
    bigBounce: 31,
    rollBounce: 10,       // 땅에서 굴러서 몬스터를 맞히면 튕겨 오르는 힘        // 맞히는 순간 점프를 맞춰 누르면 (약 12m)
    hurtInvuln: 1.8,      // 맞은 뒤 무적 시간(초)
    hurtKnockback: 15,    // 맞으면 뒤로 날아가는 힘
    hurtLift: 10,         // 맞으면 위로 튀는 힘
    maxHealth: 100,
    damage: 20,           // 몬스터에게 맞을 때 데미지(%)
    ringLoss: 10,         // 맞으면 떨어지는 링 개수
    zeroRingExtra: 0.10,  // 링이 0개일 때 추가 데미지 비율 (10%)
    respawnDelay: 1.2,    // 쓰러진 후 부활까지(초)
    maxClimb: 1.2,        // 이보다 가파른 절벽은 못 올라감 (1m 갈 때 오를 수 있는 높이)
  },
  // 자동차처럼 단계별 속도 (1단 → 2단 → 3단)
  gears: [
    { cap: 11, accel: 20 },   // 1단: 막 달리기 시작
    { cap: 19, accel: 16 },   // 2단: (예전 최고 속도)
    { cap: 32, accel: 12 },   // 3단: (예전 돌진 속도 정도)
  ],
  gearUpTime: 0.35,        // 그 단계 최고 속도로 이만큼(초) 달리면 다음 단계로
  characters: {           // 캐릭터별 속도·점프 배율
    // gearCap: 1단·2단·3단 최고속도 배율 (스피드형 외에는 1·2단이 살짝 더 빠르고 가속이 빠름 → 3단 최고속도는 스피드형이 제일)
    speed: { speed: 1.0, jump: 1.0, gearCap: [1, 1, 1.12], accel: 1.1, gearUp: 0.85 }, // 3단 최고속도 = 약 36 (가장 빠름)
    flyer: { speed: 0.95, jump: 1.05, gearCap: [1.12, 1.08, 0.95], accel: 1.25, gearUp: 0.7 },
    power: { speed: 0.93, jump: 0.95, gearCap: [1.1, 1.06, 0.93], accel: 1.22, gearUp: 0.7 },
    blink: { speed: 0.96, jump: 1.0, gearCap: [1.12, 1.08, 0.96], accel: 1.25, gearUp: 0.7 },
  },
  // 비행형: 점프 연타할수록 헬리콥터처럼 더 빠르게 올라감, 안 누르면 천천히 내려오며 게이지 회복, 한 번에 최대 maxTime초
  flyer: { flapAdd: 6.5, maxRise: 26, gaugeMax: 100, flapCost: 4, regenPerSec: 14, maxTime: 20, fallSpeed: 3.2, gravityMul: 0.35, tornadoCooldown: 3, tornadoSpeed: 34 },
  power: { glideFall: 3.5, glideSpeed: 16, punchRange: 3.4,
    superPunchRange: 70, superPunchAngle: 0.6, superPunchDamage: 12, superPunchCooldown: 0.9, // 슈퍼 펀치: 앞쪽 넓은 부채꼴(약 ±35도) 70m
    superGlideSpeed: 62, superGlideFall: 7.5, superGlideRadius: 18, superGlideDamage: 10 }, // 슈퍼 활강: 아주 빠르게, 지나가는 곳 아래 13m 범위 공격
  blink: { range: 30, energyRadius: 5.5, returnInvuln: 1.0, ultHold: 0.8, ultPullRange: 70, ultDamage: 14, ultCooldown: 10, ultRange: 80, ultRingCost: 0.1 },
  rings: {
    respawn: 30,          // 먹은 링이 다시 생기는 시간(초)
    scatterMax: 30,       // 맞았을 때 흩어지는 링 최대 표시 개수
    scatterLife: 6,       // 흩어진 링이 사라지기까지(초)
    pickupRadius: 1.6,
  },
  enemies: {
    respawn: 60,          // 일반 몬스터 다시 생기는 시간(초)
    speed: 5.5,
    chaseRange: 20,
    dropChance: 0.3,      // 체력 아이템 떨어뜨릴 확률
    sleepRange: 140,      // 이 거리보다 멀면 멈춤(시간 정지)
  },
  // 도전 모드 (5개 크리스탈을 모두 되찾은 뒤 열리는 새게임 플러스)
  hard: {
    enemyHp: 2,           // 몬스터 체력 배율
    enemySpeed: 1.4,      // 몬스터 속도 배율
    chaseRange: 1.6,      // 몬스터가 쫓아오는 거리 배율
    damage: 1.5,          // 받는 데미지 배율
    bossHp: 1.75,         // 보스 체력 배율
    bossSpeed: 1.3,       // 보스 속도·공격 빈도 배율
    superRingsNeeded: 50, // 도전 모드에서 슈퍼 변신에 필요한 링 (씨앗은 필요 없음, 0으로 하면 언제든 변신)
  },
  boss: { hp: 8, chaseSpeed: 16, stunTime: 3.5, missileSpeed: 17 },
  items: {
    healAmount: 30,       // 체력 아이템 회복량(%)
    ringBagChance: 0.08,  // 나무·바위를 부쉈을 때 '링 주머니(+30)'가 나올 확률
    ringBag: 30,
    maxStored: 9,         // 아이템 칸에 보관 가능한 개수
  },
  super: {
    ringsNeeded: 50,      // 변신에 필요한 링
    crystalsNeeded: 3,
    holdTime: 1.5,        // 점프 꾹 누르는 시간(초)
    drainPerSec: 1,       // 변신 중 초당 줄어드는 링
    speedMul: 2.5,        // 변신 중 모든 속도 배율
    jumpMul: 1.3,         // 변신 중 점프 배율
    floatHop: 9,          // 스피드형 슈퍼 2단 점프: 살짝 더 뛰어오른 뒤
    floatGravity: 0.25,   //   천천히 내려옴 (중력 비율)
    floatMinFall: -4.5,   //   가장 빨리 떨어지는 속도
    slamRadiusMul: 4,
    freeTime: 300,        // 5개 대지를 모두 되찾은 뒤: 링 없이 변신하면 5분 뒤 풀림
    freeCooldown: 60,     //   다시 변신까지 1분     // 슈퍼 내려찍기 범위 배율 (보통의 4배)
  },
  loop: {
    radius: 14,           // 루프 크기 (반지름)
    width: 7.5,           // 루프 트랙 폭 (벗어나면 떨어짐)
    gravityScale: 0.4,    // 루프 안에서 중력 비율 (클수록 더 빨라야 돌 수 있음)
    push: 5,              // 루프 안에서 앞 방향키를 누르고 있을 때 가속
    sideAccel: 16,        // 루프 안에서 옆으로 움직이는 힘
    accelMul: 0.5,        // 트랙 위 달리기 가속 비율 (중력보다 약해서 느리면 못 올라감)
    thickness: 1.2,       // 트랙 두께 (바깥쪽 면에도 부딪히고, 꼭대기 위에 설 수 있음)
  },
  water: { runSpeed: 20, swimDepth: -1.0, swimAt: 1.5, slow: 0.55,
    drag: 2.2, dragQuad: 0.03, swimAccel: 20, stroke: 9, burst: 26, buoyancy: 12, floatY: -1.0, groundDragQuad: 0.03 }, // 물: 깊이 swimAt(m) 넘으면 헤엄. 강한 힘은 잠깐 빠르지만 저항(drag)으로 금방 느려짐
  boostPad: { speed: 40 },
  cannon: { speed: 85, flightTime: 2.6 }, // 하늘 섬 대포: 발사 속도, 멀리 날아가는 시간(초)
  spring: { power: 27 },
  world: { barrierR: 1680, exitR: 2150, terrainHalf: 2600 },
  guardian: { count: 12, near: 5, speed: 41, hardSpeed: 50, startDist: 95, laserEvery: 2.6, laserWarn: 0.8, laserRadius: 4.5, stompRange: 26, damage: 3 }, // 장벽 너머 기어 군단: 아주 빠르고 강함 (슈퍼면 겨우 도망칠 수 있음)
  camera: {
    distance: 9.5,
    minPitch: -0.25,
    maxPitch: 1.1,
    defaultPitch: 0.32,
    keyRotateSpeed: 2.4,  // Q/E 회전 속도
    mouseSensitivity: 0.005,
    touchSensitivity: 0.008,
    autoFollowDelay: 1.2, // 직접 돌린 뒤 자동으로 뒤를 따라가기까지(초)
    zoomMin: 0.3, zoomMax: 2.8, zoomStep: 1.15, // 마우스 휠·두 손가락: 거리 배율 (zoomMin보다 가까우면 1인칭)
  },
};
