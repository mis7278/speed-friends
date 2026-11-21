// 3인칭 카메라 (로블록스 방식: 직접 돌릴 수 있고, 가만히 두면 진행 방향 뒤로 따라감)
// 마우스 휠 / 두 손가락: 멀리 ↔ 가까이 (가장 가까이 = 1인칭)
// 건물 안: 카메라와 캐릭터 사이의 벽은 반투명해짐
import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _hit = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = CFG.camera.defaultPitch;
    this.target = new THREE.Vector3();
    this.first = true;
    this.zoom = 1;           // 거리 배율 (0 = 1인칭)
    this.zoomK = 1;          // 실제로 쓰는 값 (부드럽게 따라감)
    this.fp = false;
  }

  update(dt, player, input, world) {
    const C = CFG.camera, cam = this.camera;
    this.yaw -= input.cam.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.cam.dy, C.minPitch, C.maxPitch);
    this.yaw -= input.camKey * C.keyRotateSpeed * dt;
    // 확대·축소
    if (input.zoomSteps) {
      let z = this.zoom === 0 ? C.zoomMin * 0.999 : this.zoom;
      z *= Math.pow(C.zoomStep, input.zoomSteps);
      this.zoom = z < C.zoomMin ? 0 : Math.min(C.zoomMax, Math.max(C.zoomMin, z));
      input.zoomSteps = 0;
    }
    this.zoomK += (this.zoom - this.zoomK) * Math.min(1, dt * 10);
    const fp = this.zoom === 0 && this.zoomK < 0.15 && player.alive && player.state !== 'cannon';
    this.fp = fp; player.firstPerson = fp;

    const speed = player.state === 'air' ? Math.hypot(player.vel.x, player.vel.z) : player.s;
    // 자동으로 뒤 따라가기 (캐릭터가 카메라 쪽으로 달려올 때는 따라 돌지 않음 → 정면을 보며 뒤로 이동)
    if (input.manualCamTime > C.autoFollowDelay && player.alive) {
      const towardCam = Math.abs(angDiff(player.yaw, this.yaw)) > 2.0;
      let want = null, rate = 0;
      if (player.state === 'loop' && Math.abs(player.loopVt || 0) > 2) { want = player.yaw; rate = 3; }
      else if (towardCam) want = null;
      else if ((player.state === 'ground' || player.state === 'swim') && speed > 4) { want = player.yaw; rate = 0.6 + speed * 0.06; }
      else if (player.state === 'air' && speed > 12) { want = player.yaw; rate = 0.8; }
      if (want !== null) this.yaw += angDiff(want, this.yaw) * Math.min(1, rate * dt);
    }

    const want = new THREE.Vector3(), tgt = new THREE.Vector3();
    if (player.state === 'cannon' && player.cannon) { // 대포 조준: 대포 뒤에서
      const c = player.cannon, m = c.mouth();
      this.yaw = c.yaw;
      tgt.copy(m).add(new THREE.Vector3(Math.sin(c.yaw) * 10, 4 + Math.sin(c.pitch) * 8, Math.cos(c.yaw) * 10));
      want.copy(m).add(new THREE.Vector3(-Math.sin(c.yaw) * 9, 4.5, -Math.cos(c.yaw) * 9));
      this.target.lerp(tgt, Math.min(1, dt * 8));
      cam.position.lerp(want, Math.min(1, dt * 6));
    } else if (fp) { // 1인칭: 눈 위치에서 바라보는 방향으로
      const eye = player.pos.clone().add(new THREE.Vector3(0, player.state === 'swim' ? 1.2 : 1.45, 0));
      if (player.state === 'loop' && player.loop) eye.copy(player.pos).addScaledVector(player.loop.centerAt(player.loopT).sub(player.loop.pathAt(player.loopT)).normalize(), 1.45);
      cam.position.copy(eye);
      const lp = this.pitch - 0.25, cp = Math.cos(lp);
      this.target.copy(eye).add(new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(lp), Math.cos(this.yaw) * cp));
    } else {
      tgt.copy(player.pos).add(new THREE.Vector3(0, 1.4, 0));
      if (this.first) { this.target.copy(tgt); this.first = false; }
      this.target.lerp(tgt, Math.min(1, dt * (12 + speed * 0.15)));
      const indoor = world.indoors.some((b) => player.pos.x > b.min.x && player.pos.x < b.max.x && player.pos.z > b.min.z && player.pos.z < b.max.z && player.pos.y < b.max.y);
      let dist = (C.distance + Math.min(8, speed * 0.07) + (player.state === 'loop' ? 4 : 0)) * Math.max(0.15, this.zoomK);
      if (indoor) dist = Math.min(dist, 7.5);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      want.set(this.target.x - Math.sin(this.yaw) * cp * dist, this.target.y + sp * dist, this.target.z - Math.cos(this.yaw) * cp * dist);
      // 벽·건물에 가리면 카메라를 앞으로 당김 (반투명해지는 벽은 통과)
      const dir = want.clone().sub(this.target), len = dir.length();
      if (len > 0.01) {
        dir.divideScalar(len);
        const p = new THREE.Vector3();
        for (let d = 1.2; d < len; d += 0.5) {
          p.copy(this.target).addScaledVector(dir, d);
          if (world.solidAt(p, true) || world.loopSolidAt(p)) { want.copy(this.target).addScaledVector(dir, Math.max(1, d - 0.7)); break; }
        }
      }
      cam.position.copy(want);
      const g = world.groundAt(cam.position.x, cam.position.z, cam.position.y + 50) + 0.8;
      if (cam.position.y < g && player.state !== 'swim') cam.position.y = g;
    }
    this._fadeWalls(dt, world, cam.position, this.target, fp);
    if (player.shake > 0) {
      const k = player.shake * 1.2;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k;
    }
    cam.up.copy(WORLD_UP);
    cam.lookAt(this.target);
    const fov = (fp ? 75 : 65) + Math.min(18, Math.max(0, speed - 15) * 0.3);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }

  // 카메라와 캐릭터 사이에 있는 벽은 반투명하게
  _fadeWalls(dt, world, camPos, target, fp) {
    const dir = target.clone().sub(camPos), len = dir.length();
    if (len > 0.001) dir.divideScalar(len);
    _ray.set(camPos, dir);
    for (const b of world.fadeBoxes) {
      const m = b.fade;
      if (Math.abs(m.position.x - target.x) > 80 || Math.abs(m.position.z - target.z) > 80) { if (m.material.opacity < 1) { m.material.opacity = 1; m.material.depthWrite = true; } continue; }
      _box.min.copy(b.min).subScalar(0.2); _box.max.copy(b.max).addScalar(0.2);
      const inside = _box.containsPoint(camPos);
      const hit = !fp && (inside || (_ray.intersectBox(_box, _hit) && _hit.distanceTo(camPos) < len - 0.3));
      const goal = hit ? 0.18 : 1;
      m.material.opacity += (goal - m.material.opacity) * Math.min(1, dt * 10);
      m.material.depthWrite = m.material.opacity > 0.95;
    }
  }
}
