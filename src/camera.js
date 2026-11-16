// 3인칭 카메라 (로블록스 방식: 직접 돌릴 수 있고, 가만히 두면 진행 방향 뒤로 따라감)
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = CFG.camera.defaultPitch;
    this.target = new THREE.Vector3();
    this.first = true;
    this.blend = 0;          // 루프에 들어가고 나올 때 부드럽게
    this.wasLoop = false;
  }

  update(dt, player, input, world) {
    const C = CFG.camera, cam = this.camera;
    this.yaw -= input.cam.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.cam.dy, C.minPitch, C.maxPitch);
    this.yaw -= input.camKey * C.keyRotateSpeed * dt;

    const speed = player.state === 'air' ? Math.hypot(player.vel.x, player.vel.z) : player.s;
    const inLoop = player.state === 'loop' && player.loop;
    if (inLoop !== this.wasLoop) { this.blend = 1; if (!inLoop) this.yaw = player.yaw; this.wasLoop = inLoop; }
    this.blend = Math.max(0, this.blend - dt * 2.5);

    // 자동으로 뒤 따라가기 (캐릭터가 카메라 쪽으로 달려올 때는 따라 돌지 않음 → 정면을 보며 뒤로 이동)
    if (!inLoop && input.manualCamTime > C.autoFollowDelay && player.alive) {
      const towardCam = Math.abs(angDiff(player.yaw, this.yaw)) > 2.0;
      let want = null, rate = 0;
      if (towardCam) want = null;
      else if (player.state === 'ground' && speed > 4) { want = player.yaw; rate = 0.6 + speed * 0.06; }
      else if (player.state === 'air' && speed > 12) { want = player.yaw; rate = player.superFlight ? 2.5 : 0.8; }
      if (want !== null) this.yaw += angDiff(want, this.yaw) * Math.min(1, rate * dt);
    }

    const want = new THREE.Vector3(), tgt = new THREE.Vector3(), upWant = WORLD_UP.clone();
    if (inLoop) {
      // 루프 안: 캐릭터 바로 뒤에서, 트랙과 함께 뒤집히며 따라감
      const L = player.loop, t = Math.min(1, Math.max(0, player.loopT));
      const T = L.tangentAt(t), N = L.centerAt(t).sub(L.pathAt(t)).normalize();
      tgt.copy(player.pos).addScaledVector(N, 1.3).addScaledVector(T, 3);
      want.copy(player.pos).addScaledVector(T, -8.5).addScaledVector(N, 3.6);
      upWant.copy(N);
      this.target.lerp(tgt, Math.min(1, dt * 14));
    } else {
      tgt.copy(player.pos).add(new THREE.Vector3(0, 1.4, 0));
      if (this.first) { this.target.copy(tgt); this.first = false; }
      this.target.lerp(tgt, Math.min(1, dt * (12 + speed * 0.15)));
      const dist = C.distance + Math.min(8, speed * 0.07) + (player.superFlight ? 3 : 0);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      want.set(this.target.x - Math.sin(this.yaw) * cp * dist, this.target.y + sp * dist, this.target.z - Math.cos(this.yaw) * cp * dist);
      // 벽·건물에 가리면 카메라를 앞으로 당김
      const dir = want.clone().sub(this.target), len = dir.length();
      dir.divideScalar(len);
      const p = new THREE.Vector3();
      for (let d = 1.2; d < len; d += 0.5) {
        p.copy(this.target).addScaledVector(dir, d);
        if (world.solidAt(p)) { want.copy(this.target).addScaledVector(dir, Math.max(1, d - 0.7)); break; }
      }
    }
    if (this.blend > 0 || inLoop) cam.position.lerp(want, Math.min(1, dt * (inLoop ? 12 : 6)));
    else cam.position.copy(want);
    if (!inLoop) {
      const g = world.groundAt(cam.position.x, cam.position.z, cam.position.y + 50) + 0.8;
      if (cam.position.y < g) cam.position.y = g;
    }
    if (player.shake > 0) {
      const k = player.shake * 1.2;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k;
    }
    cam.up.lerp(upWant, Math.min(1, dt * (inLoop ? 10 : 6))).normalize();
    cam.lookAt(this.target);
    const fov = 65 + Math.min(18, Math.max(0, speed - 15) * 0.3);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
}
