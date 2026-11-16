// 3인칭 카메라 (로블록스 방식: 직접 돌릴 수 있고, 가만히 두면 진행 방향 뒤로 따라감)
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = CFG.camera.defaultPitch;
    this.target = new THREE.Vector3();
    this.first = true;
  }

  update(dt, player, input, world) {
    const C = CFG.camera;
    this.yaw -= input.cam.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.cam.dy, C.minPitch, C.maxPitch);
    this.yaw -= input.camKey * C.keyRotateSpeed * dt;

    const speed = player.state === 'air' ? Math.hypot(player.vel.x, player.vel.z) : player.s;
    // 자동으로 뒤 따라가기
    if (input.manualCamTime > C.autoFollowDelay && player.alive) {
      let want = null, rate = 0;
      if (player.state === 'loop' && player.loop) { want = Math.atan2(player.loop.fwd.x, player.loop.fwd.z); rate = 4; }
      else if (player.state === 'ground' && speed > 4) { want = player.yaw; rate = 0.6 + speed * 0.06; }
      else if (player.state === 'air' && speed > 12) { want = player.yaw; rate = player.superFlight ? 2.5 : 0.8; }
      if (want !== null) this.yaw += angDiff(want, this.yaw) * Math.min(1, rate * dt);
    }

    const inLoop = player.state === 'loop' && player.loop;
    const tgt = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    if (inLoop) tgt.copy(player.loop.centerAt(player.loopT)); // 루프 중심을 바라봄
    if (this.first) { this.target.copy(tgt); this.first = false; }
    this.target.lerp(tgt, Math.min(1, dt * (inLoop ? 6 : 12 + speed * 0.15)));

    const cam = this.camera;
    const want = new THREE.Vector3();
    if (inLoop) {
      // 루프 옆에서 한 바퀴 도는 모습을 보여줌
      const L = player.loop;
      want.copy(L.centerAt(player.loopT)).addScaledVector(L.side, -L.R * 2.6).addScaledVector(L.fwd, -L.R * 0.6);
      want.y = L.R * 1.2;
      this.loopBlend = 1;
    } else {
      const dist = C.distance + Math.min(8, speed * 0.07) + (player.superFlight ? 3 : 0);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      want.set(
        this.target.x - Math.sin(this.yaw) * cp * dist,
        this.target.y + sp * dist,
        this.target.z - Math.cos(this.yaw) * cp * dist,
      );
    }
    if (!inLoop) { // 벽·건물에 가리면 카메라를 앞으로 당김
      const dir = want.clone().sub(this.target), len = dir.length();
      dir.divideScalar(len);
      const p = new THREE.Vector3();
      for (let d = 1.2; d < len; d += 0.5) {
        p.copy(this.target).addScaledVector(dir, d);
        if (world.solidAt(p)) { want.copy(this.target).addScaledVector(dir, Math.max(1, d - 0.7)); break; }
      }
    }
    // 루프에 들어가고 나올 때는 부드럽게 이동, 평소에는 바로 따라감
    this.loopBlend = Math.max(0, (this.loopBlend || 0) - dt * 1.5);
    if (this.loopBlend > 0) cam.position.lerp(want, Math.min(1, dt * 5));
    else cam.position.copy(want);
    const g = world.groundAt(cam.position.x, cam.position.z, cam.position.y + 50) + 0.8;
    if (cam.position.y < g) cam.position.y = g;
    if (player.shake > 0) {
      const k = player.shake * 1.2;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k;
    }
    cam.lookAt(this.target);
    const fov = 65 + Math.min(18, Math.max(0, speed - 15) * 0.3);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
}
