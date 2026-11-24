// 그래픽: 하늘, 구름, 햇빛과 그림자, 물, 바람에 흔들리는 풀, 연기, 빛 번짐 효과
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { terrainHeight, zoneWeights, roadDist, ZONES, ROAD, SITES, snowAmount, vnoise, skyEdgeAt, seaHeight } from './world.js';
import { CFG } from './config.js';

const NOISE_GLSL = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), u.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
`;

export function createRenderer(isTouch) {
  const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.25 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function cloudTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 30 + Math.random() * 68, y = 38 + Math.random() * 50, r = 16 + Math.random() * 24;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); return t;
}

// 카메라를 향하는 판 여러 개 (구름, 연기) — 한 번에 그림
class Billboards {
  constructor(count, tex, { fog = false, shade = true, additive = false } = {}) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(count * 4);   // x y z size
    this.col = new Float32Array(count * 4);    // r g b alpha
    this.aData = new THREE.InstancedBufferAttribute(this.data, 4); this.aData.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iData', this.aData); geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, shadeCol: { value: new THREE.Color(0xb8c8e0) }, ...THREE.UniformsLib.fog },
      vertexShader: `
        attribute vec4 iData; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv; vCol = iCol;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = iData.xyz + (right * position.x + up * position.y * 0.62) * iData.w;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 shadeCol; varying vec2 vUv; varying vec4 vCol;
        #include <fog_pars_fragment>
        void main(){
          vec4 t = texture2D(map, vUv);
          vec3 c = vCol.rgb * ${shade ? 'mix(shadeCol, vec3(1.0), smoothstep(0.15, 0.85, vUv.y))' : 'vec3(1.0)'};
          gl_FragColor = vec4(c, t.a * vCol.a);
          if (gl_FragColor.a < 0.01) discard;
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  set(i, x, y, z, s, r, g, b, a) {
    const d = this.data, c = this.col, k = i * 4;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = s;
    c[k] = r; c[k + 1] = g; c[k + 2] = b; c[k + 3] = a;
  }
  flush() { this.aData.needsUpdate = true; this.aCol.needsUpdate = true; }
}

export class Graphics {
  constructor(renderer, scene, camera, world, mobile) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.world = world; this.mobile = mobile;
    const T = world.T;
    this.T = T;
    scene.background = new THREE.Color(T.skyHorizon);
    scene.fog = new THREE.FogExp2(T.fog, T.fogDensity);
    this.sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();

    // ---- 빛 ----
    this.hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemiInt);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(T.sun, T.sunInt);
    this.sun.castShadow = true;
    const S = mobile ? 45 : 70;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 600 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this._sky();
    if (T.space) this._space(); else this._clouds();
    if (T.skyLand) this._lowClouds();
    this._water();
    if (T.grass) this._grass();
    this._smoke();

    // ---- 빛 번짐 (PC만) ----
    if (!mobile) {
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.5, 0.88);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  resize(w, h) { this.composer?.setSize(w, h); }

  _sky() {
    const T = this.T;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(T.skyTop) }, horizon: { value: new THREE.Color(T.skyHorizon) }, bottom: { value: new THREE.Color(T.skyBottom) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(T.sun) }, time: { value: 0 }, cloudAmt: { value: T.space ? 0 : 1 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 top, horizon, bottom, sunDir, sunCol; uniform float time, cloudAmt; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.65));
          col = mix(col, bottom, smoothstep(0.0, -0.25, h));
          float sd = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.25 + pow(sd, 4.0) * 0.12);
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(time * 0.004, time * 0.002);
            float n = fbm(uv * 2.0);
            float c = smoothstep(0.52, 0.85, n) * smoothstep(0.0, 0.3, h);
            col = mix(col, vec3(1.0, 0.99, 0.97) + sunCol * pow(sd, 6.0) * 0.3, c * 0.75 * cloudAmt);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _clouds() {
    const N = this.mobile ? 200 : 420;
    this.clouds = new Billboards(N, cloudTexture(), { fog: false, shade: true });
    this.clouds.mat.uniforms.shadeCol.value.set(this.T.skyBottom).lerp(new THREE.Color(0x8090b0), 0.4);
    this.cloudBase = [];
    let i = 0;
    while (i < N) {
      const a = Math.random() * Math.PI * 2, r = 300 + Math.random() * 3200;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 210 + Math.random() * 120;
      const n = 5 + Math.floor(Math.random() * 6), w = 60 + Math.random() * 80;
      for (let k = 0; k < n && i < N; k++, i++) {
        this.cloudBase.push([cx + (Math.random() - 0.5) * w, cy + (Math.random() - 0.3) * 18, cz + (Math.random() - 0.5) * w * 0.6, 60 + Math.random() * 70]);
      }
    }
    this.scene.add(this.clouds.mesh);
  }

  _water() {
    const T = this.T, sw = ZONES.swamp;
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, deep: { value: new THREE.Color(T.waterDeep) }, shallow: { value: new THREE.Color(T.waterShallow) },
        swampCol: { value: new THREE.Color(T.swampWater) }, swamp: { value: new THREE.Vector3(sw.x, sw.z, sw.r) },
        sunDir: { value: this.sunDir }, skyCol: { value: new THREE.Color(T.skyHorizon) }, frozen: { value: T.frozen ? 1 : 0 }, lava: { value: T.lava ? 1 : 0 },
      }]),
      vertexShader: `
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float time, frozen, lava; uniform vec3 deep, shallow, swampCol, swamp, sunDir, skyCol; varying vec3 vW;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main(){
          vec2 p = vW.xz;
          float sw = 1.0 - smoothstep(swamp.z * 0.5, swamp.z * 0.9, length(p - swamp.xy));
          vec3 base = mix(mix(deep, shallow, 0.35 + 0.3 * vn(p * 0.02)), swampCol, sw);
          vec3 V = normalize(cameraPosition - vW);
          float t = time * (1.0 - frozen);
          vec2 g = vec2(vn(p * 0.25 + t * 0.6) - vn(p * 0.25 + vec2(3.1) - t * 0.5), vn(p * 0.31 + vec2(7.0) - t * 0.4) - vn(p * 0.31 + vec2(1.7) + t * 0.55));
          vec3 N = normalize(vec3(g.x * 0.35, 1.0, g.y * 0.35));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 R = reflect(-V, N);
          float spec = pow(max(dot(R, sunDir), 0.0), 120.0) * 2.5;
          vec3 col = mix(base, skyCol, fres * 0.6) + vec3(spec);
          float alpha = mix(0.62, 0.93, fres);
          if (!gl_FrontFacing) { col = mix(base, vec3(0.75, 0.92, 1.0), 0.35); alpha = 0.55; }
          if (lava > 0.5) { // 용암: 검게 굳은 껍질 사이로 끓어오르는 불빛
            float n1 = vn(p * 0.045 + vec2(time * 0.04, -time * 0.03));
            float n2 = vn(p * 0.19 - vec2(time * 0.11, time * 0.07));
            float hot = smoothstep(0.45, 0.78, n1 * 0.55 + n2 * 0.45);
            col = mix(vec3(0.16, 0.02, 0.01), mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.62, 0.12), n2), hot) + vec3(0.12, 0.02, 0.0) + vec3(spec * 0.1);
            alpha = 1.0;
          }
          if (frozen > 0.5) { float cr = smoothstep(0.48, 0.5, vn(p * 0.15)) * (1.0 - smoothstep(0.5, 0.52, vn(p * 0.15))); col = mix(base, vec3(1.0), 0.25 + fres * 0.4) - cr * 0.15 + spec * 0.3; alpha = 1.0; }
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: !T.frozen && !T.lava, fog: true, depthWrite: !!T.frozen || !!T.lava, side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1), this.waterMat);
    water.rotation.x = -Math.PI / 2; water.position.y = T.frozen ? 0.02 : T.lava ? CFG.lava.level - 0.05 : -0.05;
    water.visible = !T.skyLand && !T.space; // 하늘 도시·우주에는 물이 없음
    water.receiveShadow = false;
    this.scene.add(water);
    this.water = water;
  }

  // 우주: 별과 저 아래 지구 (거대 우주선·최후의 결전)
  _space() {
    const N = 2500, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); pos[i * 3] = Math.cos(a) * r * 90; pos[i * 3 + 1] = u * 90; pos[i * 3 + 2] = Math.sin(a) * r * 90; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false, toneMapped: false }));
    this.stars.renderOrder = -9; this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    // 지구: 바다·대륙·구름을 그림으로 만든 큰 공
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const c2 = cv.getContext('2d'), img = c2.createImageData(512, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 512; i++) {
      const lon = i / 512 * 16, lat = j / 256 * 8, n = vnoise(lon, lat) * 0.6 + vnoise(lon * 2.3 + 5, lat * 2.3) * 0.4, cl = vnoise(lon * 3 + 9, lat * 4 - 3);
      const pole = Math.abs(j / 256 - 0.5) > 0.42;
      let r = 30, gg = 90, b = 200;
      if (n > 0.55) { r = 70 + n * 60; gg = 140 + n * 40; b = 60; if (n > 0.72) { r = 160; gg = 140; b = 90; } }
      if (pole) { r = gg = b = 240; }
      if (cl > 0.62) { const k = Math.min(1, (cl - 0.62) * 4); r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
      const k = (j * 512 + i) * 4; img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), new THREE.MeshLambertMaterial({ map: tex, fog: false, emissive: 0x0a1a40 }));
    const atm = new THREE.Mesh(new THREE.SphereGeometry(2480, 48, 24), new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: 0.18, fog: false, side: THREE.BackSide, depthWrite: false }));
    this.earth.add(atm);
    this.earthOffset = new THREE.Vector3(0, this.T.shipLand ? -3700 : -4400, 0);
    this.scene.add(this.earth);
  }

  // 하늘 도시: 구멍 아래와 땅 끝 너머에 깔린 푹신한 구름 (움직이지 않음)
  _lowClouds() {
    const N = this.mobile ? 220 : 480, Y = CFG.sky.cloudY;
    this.lowClouds = new Billboards(N, cloudTexture(), { fog: true, shade: true });
    this.lowClouds.mat.uniforms.shadeCol.value.set(0xc8d6ea);
    let i = 0;
    for (let k = 0; k < 40000 && i < N; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 2500, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const far = r > CFG.sky.edge + 80;
      if (far) { if (Math.random() < 0.993) continue; this.lowClouds.set(i++, x, -260 - Math.random() * 500, z, 90 + Math.random() * 120, 1, 1, 1, 0.8); continue; } // 끝 너머: 저 아래 흩어진 구름 (그림일 뿐)
      const h = terrainHeight(x, z); if (h > -20 || h < -100) continue;
      this.lowClouds.set(i++, x, seaHeight(x, z) + 3 + Math.random() * 5, z, 22 + Math.random() * 26, 1, 1, 1, 0.95);
    }
    for (; i < N; i++) this.lowClouds.set(i, 0, -999, 0, 0, 0, 0, 0, 0);
    this.lowClouds.flush();
    this.scene.add(this.lowClouds.mesh);
    // 구름 덩어리 가장자리를 몽글몽글하게: 빈틈 바로 옆에 구름 뭉치
    const M = this.mobile ? 2200 + 3500 : 4400 + 5200;
    this.rimPuffs = new Billboards(M, cloudTexture(), { fog: true, shade: true });
    this.rimPuffs.mat.uniforms.shadeCol.value.set(0xd8e4f4);
    let j = 0;
    const off = [[7, 0], [-7, 0], [0, 7], [0, -7]];
    for (let k = 0; k < (this.mobile ? 40000 : 70000) && j < M - 5200; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (CFG.sky.edge - 70), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z); if (h < -4) continue;
      const o = off.find(([dx, dz]) => terrainHeight(x + dx, z + dz) < -20); if (!o) continue;
      const s = 16 + Math.random() * 16;
      this.rimPuffs.set(j++, x + o[0] * 0.6, h - s * 0.15, z + o[1] * 0.6, s, 1, 1, 1, 1);               // 가장자리 위로 몽실
      this.rimPuffs.set(j++, x + o[0] * 0.9, -6 - s * 0.35, z + o[1] * 0.9, s * 1.15, 1, 1, 1, 1);        // 밑으로 주렁주렁
      if (Math.random() < 0.5) this.rimPuffs.set(j++, x - o[0] * 1.5, -8 - s * 0.4, z - o[1] * 1.5, s * 1.3, 1, 1, 1, 1);
    }
    // 맵 끝: 위 구름 땅의 둥근 가장자리 아래와 아래 구름 바다의 둥근 밑면 (옆에서 보면 하늘에 떠 있는 구름 덩어리)
    const step = this.mobile ? 16 : 11;
    for (let a = 0; a < Math.PI * 2 && j < M - 6; a += step / 1700 * 1.25) {
      const cx = Math.cos(a), cz = Math.sin(a), E = skyEdgeAt(cx * 1700, cz * 1700);
      const lay = [[E + 2, -4, 26], [E + 5, -16, 34], [E + 4, -30, 40], [E - 4, -44, 42], [E - 18, -52, 36]];
      for (const [r, y, s] of lay) { const w = (Math.random() - 0.5) * 6; this.rimPuffs.set(j++, cx * (r + w), y + (Math.random() - 0.5) * 6, cz * (r + w), s * (0.8 + Math.random() * 0.4), 1, 1, 1, 1); }
    }
    for (; j < M; j++) this.rimPuffs.set(j, 0, -999, 0, 0, 0, 0, 0, 0);
    this.rimPuffs.flush();
    // 구름 땅 전체의 밑면: 아래에서 올려다보면 빈틈없는 구름 덩어리 바닥 (그 아래는 뻥 뚫린 하늘)
    const SEG = 360, pos = [0, -45, 0], idx = [];
    for (let i = 0; i < SEG; i++) { const a = i / SEG * Math.PI * 2, R = skyEdgeAt(Math.cos(a) * 1700, Math.sin(a) * 1700) - 6; pos.push(Math.cos(a) * R, -45, Math.sin(a) * R); }
    for (let i = 0; i < SEG; i++) idx.push(0, 1 + i, 1 + (i + 1) % SEG);
    const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ug.setIndex(idx); ug.computeVertexNormals();
    this.underside = new THREE.Mesh(ug, new THREE.MeshLambertMaterial({ color: 0xeef4fc, emissive: 0x5a6a80, side: THREE.DoubleSide }));
    this.scene.add(this.underside);
    // 아래 구름 바다: 위 구름 덩어리들 밑까지 빈틈없이 깔린 한 장 (떨어지면 여기서 튕김)
    const ST = this.mobile ? 22 : 13, HS = 1760, NS = Math.round(HS * 2 / ST) + 1, sp = [], sc = [], si = [], inside = [], cc = new THREE.Color(), lo = new THREE.Color(0xa9c2e6), hi = new THREE.Color(0xffffff);
    for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) {
      const x = -HS + i * ST, z = -HS + j * ST, y = seaHeight(x, z);
      sp.push(x, y, z);
      cc.copy(lo).lerp(hi, Math.min(1, (y - Y) / 13)); sc.push(cc.r, cc.g, cc.b);       // 솟은 곳은 하얗게, 골은 푸르게
      inside.push(Math.hypot(x, z) < skyEdgeAt(x, z) - 40);
    }
    for (let j = 0; j < NS - 1; j++) for (let i = 0; i < NS - 1; i++) {
      const a = j * NS + i, b = a + 1, d = a + NS, e = d + 1;
      if (inside[a] || inside[b] || inside[d] || inside[e]) si.push(a, d, b, b, d, e);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.setIndex(new THREE.Uint32BufferAttribute(si, 1)); sg.computeVertexNormals();
    this.cloudSea = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x24344e }));
    this.cloudSea.receiveShadow = true;
    this.scene.add(this.cloudSea);
    // 위 구름 덩어리들의 밑면 (높이 -6m): 덩어리가 있는 곳만 (빈틈은 뚫려 있음) → 덩어리 사이로 아래 구름 바다가 보이는 '빈 공간'
    const NM = this.mobile ? 320 : 400, HM = 1800, mask = new Uint8Array(NM * NM * 4);
    for (let jz = 0; jz < NM; jz++) for (let ix = 0; ix < NM; ix++) {
      const x = -HM + (ix + 0.5) / NM * HM * 2, z = -HM + (jz + 0.5) / NM * HM * 2, k = (jz * NM + ix) * 4;
      const v = terrainHeight(x, z) > -10 ? 255 : 0;
      mask[k] = mask[k + 1] = mask[k + 2] = mask[k + 3] = v;
    }
    const mt = new THREE.DataTexture(mask, NM, NM, THREE.RGBAFormat); mt.magFilter = THREE.LinearFilter; mt.minFilter = THREE.LinearFilter; mt.needsUpdate = true;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute([-HM, -6, -HM, HM, -6, -HM, HM, -6, HM, -HM, -6, HM], 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    cg.setAttribute('normal', new THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
    cg.setIndex([0, 1, 2, 0, 2, 3]);
    this.cloudBottom = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0xf0f5fc, emissive: 0x8a9ab4, alphaMap: mt, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.scene.add(this.cloudBottom);
    this.scene.add(this.rimPuffs.mesh);
  }

  // 풀: 플레이어 주변에서 계속 돌려쓰는 풀밭 (지형 높이를 그림으로 만들어서 읽음)
  // 풀 높이 정보: 플레이어 주변만 (움직이면 조금씩 다시 계산)
  _grassCell(x, z) {
    const h = terrainHeight(x, z);
    const w = zoneWeights(x, z);
    let dens = 1, tint = 0;
    if (h < 0.5) dens = 0;
    dens *= 1 - Math.max(0, Math.min(1, (w[0] - 0.15) * 3));
    if (w[1] > 0.4) { tint = 2; dens *= 0.6; }
    if (w[2] > 0.4) { tint = 1; dens *= 0.55; }
    if (h > 60) dens *= Math.max(0, 1 - (h - 60) / 50);
    const sn = snowAmount(x, z); if (sn > 0) dens *= 1 - sn;
    const rd = roadDist(x, z);
    if (rd < ROAD.width + 2) dens = 0; else if (rd < ROAD.width + 5) dens *= (rd - ROAD.width - 2) / 3;
    if (Math.hypot(x, z) < 31) dens = 0;
    for (const k in SITES) { const F = SITES[k]; if (Math.hypot(x - F.x, z - F.z) < F.r * 0.8) dens = 0; }
    return [h, dens, tint];
  }
  _grassWindow(cx, cz, rows) { // rows줄만 계산하고, 다 끝나면 텍스처 교체
    const G = this.gw, N = G.N, toH = THREE.DataUtils.toHalfFloat;
    if (!G.job) G.job = { cx, cz, j: 0, data: new Uint16Array(N * N * 4) };
    const J = G.job;
    for (let r = 0; r < rows && J.j < N; r++, J.j++) {
      for (let i = 0; i < N; i++) {
        const x = J.cx - G.HS + (i + 0.5) / N * G.HS * 2, z = J.cz - G.HS + (J.j + 0.5) / N * G.HS * 2;
        const [h, d, t] = this._grassCell(x, z), k = (J.j * N + i) * 4;
        J.data[k] = toH(h); J.data[k + 1] = toH(d); J.data[k + 2] = toH(t); J.data[k + 3] = toH(1);
      }
    }
    if (J.j >= N) {
      G.tex.image.data.set(J.data); G.tex.needsUpdate = true;
      G.center.set(J.cx, J.cz); G.job = null;
    }
  }
  _grass() {
    const HS = this.mobile ? 200 : 260, N = this.mobile ? 160 : 256;
    const tex = new THREE.DataTexture(new Uint16Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    this.gw = { HS, N, tex, center: new THREE.Vector2(1e9, 1e9), job: null };
    this._grassWindow(this.world.spawn?.pos.x || 0, this.world.spawn?.pos.z || 0, N);

    const T = this.T;
    this.grassMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        hm: { value: null }, hs: { value: HS }, hmC: { value: this.gw.center }, tile: { value: 84 }, inner: { value: 0 }, bscale: { value: 1 }, center: { value: new THREE.Vector2() }, player: { value: new THREE.Vector3() }, time: { value: 0 },
        cA: { value: new THREE.Color(T.grassB).multiplyScalar(0.75) }, cB: { value: new THREE.Color(T.grassA).lerp(new THREE.Color(0xeaff9a), 0.25) },
        dryA: { value: new THREE.Color(0x9a8a3a) }, dryB: { value: new THREE.Color(0xe8d27a) },
        purA: { value: new THREE.Color(0x3a4a3a) }, purB: { value: new THREE.Color(0x9a7ac8) },
        sunDir: { value: this.sunDir },
      }]),
      vertexShader: `
        uniform sampler2D hm; uniform float hs, tile, time, inner, bscale; uniform vec2 center, hmC; uniform vec3 player;
        attribute vec3 aOff; varying float vY; varying vec3 vTint; varying float vFlower; varying float vRand;
        #include <fog_pars_vertex>
        void main(){
          vec2 rel = mod(aOff.xy - center + tile * 0.5, tile) - tile * 0.5;
          vec2 wp = center + rel;
          vec2 huv = (wp - hmC + hs) / (2.0 * hs);
          vec4 h = texture2D(hm, huv);
          if (huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0) h.g = 0.0;
          float r = aOff.z;
          float keep = step(r, h.g);
          float fade = (1.0 - smoothstep(tile * 0.36, tile * 0.5, length(rel))) * smoothstep(inner, inner + 10.0, length(rel));
          float flower = step(0.975, fract(r * 91.7)) * step(h.b, 0.5);
          float height = (0.45 + fract(r * 13.7) * 0.7) * keep * fade * (1.0 + flower * 0.3) * bscale;
          float ang = r * 40.0;
          vec2 dir = vec2(cos(ang), sin(ang));
          float y = position.y;
          vec3 p = vec3(dir * position.x * (0.6 + bscale * 0.4), 0.0).xzy;
          p.y = y * height;
          // 바람 + 플레이어가 지나가면 눕기
          float wind = sin(time * 1.8 + wp.x * 0.12 + wp.y * 0.09) * 0.22 + sin(time * 3.1 + wp.x * 0.5) * 0.06;
          vec2 away = wp - player.xz; float pd = length(away);
          float trmp = (1.0 - smoothstep(0.6, 2.6, pd)) * step(abs(player.y - h.r), 2.5); // 캐릭터 주변 풀은 눌려서 다리가 보이게
          vec2 push = pd > 0.01 ? away / pd * trmp : vec2(0.0);
          vec2 bend = (vec2(wind, wind * 0.4) + push * 1.3) * y * y * height;
          vec3 world = vec3(wp.x + p.x + bend.x, h.r + p.y * (1.0 - trmp * 0.75), wp.y + p.z + bend.y);
          vY = y; vRand = r; vFlower = flower;
          vTint = h.bbb;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform vec3 cA, cB, dryA, dryB, purA, purB; varying float vY; varying vec3 vTint; varying float vFlower; varying float vRand;
        #include <fog_pars_fragment>
        void main(){
          float t = vTint.x;
          vec3 a = cA, b = cB;
          if (t > 1.5) { a = purA; b = purB; } else if (t > 0.5) { a = dryA; b = dryB; }
          vec3 col = mix(a, b, vY) * (0.85 + fract(vRand * 7.3) * 0.3);
          if (vFlower > 0.5 && vY > 0.8) col = fract(vRand * 3.1) > 0.5 ? vec3(1.0, 0.95, 0.4) : vec3(1.0, 0.55, 0.8);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true, side: THREE.DoubleSide,
    });
    this.grassMat.uniforms.hm.value = tex;
    const makeLayer = (count, tile, inner, bscale) => {
      const base = new THREE.InstancedBufferGeometry();
      const pos = [-0.07, 0, 0, 0.07, 0, 0, -0.055, 0.35, 0, 0.055, 0.35, 0, -0.03, 0.7, 0, 0.03, 0.7, 0, 0, 1, 0];
      base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      base.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
      const off = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { off[i * 3] = Math.random() * tile; off[i * 3 + 1] = Math.random() * tile; off[i * 3 + 2] = Math.random(); }
      base.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
      base.instanceCount = count;
      const mat = this.grassMat.clone();
      mat.uniforms.hm.value = tex; mat.uniforms.hmC.value = this.gw.center; mat.uniforms.tile.value = tile; mat.uniforms.inner.value = inner; mat.uniforms.bscale.value = bscale;
      const mesh = new THREE.Mesh(base, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    // 가까운 풀(촘촘) + 먼 풀(크고 듬성듬성, 시야 끝까지)
    this.grassLayers = this.mobile
      ? [makeLayer(14000, 56, 0, 1), makeLayer(26000, 230, 20, 1.7)]
      : [makeLayer(60000, 84, 0, 1), makeLayer(90000, 440, 30, 1.8)];
    this.grass = this.grassLayers[0];
  }

  _smoke() {
    const N = this.mobile ? 120 : 260;
    const tex = cloudTexture();
    this.smoke = new Billboards(N, tex, { fog: true, shade: false });
    this.smokeParts = [];
    for (let i = 0; i < N; i++) this.smokeParts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 1, dark: true });
    this.scene.add(this.smoke.mesh);
    this.smokeAcc = new Map();
  }

  update(dt, time, focus) {
    // 해와 그림자가 플레이어를 따라감
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 250);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(this.camera.position);
    if (this.stars) this.stars.position.copy(this.camera.position);
    if (this.earth) { this.earth.position.set(this.camera.position.x, 0, this.camera.position.z).add(this.earthOffset); this.earth.rotation.y = time * 0.004; }
    this.skyMat.uniforms.time.value = time;
    this.waterMat.uniforms.time.value = time;
    // 구름
    const drift = time * 3;
    if (this.cloudBase) 
    this.cloudBase.forEach((c, i) => {
      let x = c[0] + drift; x = ((x + 3600) % 7200 + 7200) % 7200 - 3600;
      this.clouds.set(i, x, c[1], c[2], c[3], 1, 1, 1, 0.9);
    });
    if (this.clouds) this.clouds.flush();
    if (this.gw) {
      const G = this.gw;
      if (G.job) this._grassWindow(0, 0, this.mobile ? 10 : 16);
      else if (Math.hypot(focus.x - G.center.x, focus.z - G.center.z) > G.HS * 0.3) this._grassWindow(focus.x, focus.z, this.mobile ? 10 : 16);
    }
    if (this.grassLayers) for (const g of this.grassLayers) {
      const u = g.material.uniforms;
      u.time.value = time; u.center.value.set(focus.x, focus.z); u.player.value.copy(focus);
    }
    // 연기 (가까운 굴뚝만)
    for (const e of this.world.smokeEmitters) {
      if (!e.rate) continue;
      const d = e.pos.distanceTo(focus);
      if (d > 700) continue;
      let acc = (this.smokeAcc.get(e) || 0) + dt * e.rate * (d < 300 ? 1 : 0.4);
      while (acc >= 1) {
        acc -= 1;
        const p = this.smokeParts.find((q) => !q.alive);
        if (!p) break;
        p.alive = true; p.max = p.life = 5 + Math.random() * 3; p.size = 3 + Math.random() * 3;
        p.pos.copy(e.pos); p.vel.set((Math.random() - 0.5) * 1.5 + 2, 4 + Math.random() * 2, (Math.random() - 0.5) * 1.5); p.dark = e.dark;
      }
      this.smokeAcc.set(e, acc);
    }
    this.smokeParts.forEach((p, i) => {
      if (!p.alive) { this.smoke.set(i, 0, -999, 0, 0, 0, 0, 0, 0); return; }
      p.life -= dt; if (p.life <= 0) { p.alive = false; return; }
      p.pos.addScaledVector(p.vel, dt); p.vel.y *= 0.995;
      const k = 1 - p.life / p.max;
      const c = p.dark ? 0.32 + k * 0.3 : 0.9;
      this.smoke.set(i, p.pos.x, p.pos.y, p.pos.z, p.size * (1 + k * 3), c, c, c * 1.03, (1 - k) * 0.55);
    });
    this.smoke.flush();
  }

  render() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
