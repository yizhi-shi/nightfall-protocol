import * as THREE from 'three';
import {
  softParticleTexture, smokeTexture, decalTexture, mulberry32,
} from './textures.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ */
/*  GPU rain                                                           */
/* ------------------------------------------------------------------ */

class Rain {
  constructor(scene, count = 5200) {
    const positions = new Float32Array(count * 2 * 3);
    const speeds = new Float32Array(count * 2);
    const ends = new Float32Array(count * 2);
    const rng = mulberry32(31337);
    for (let i = 0; i < count; i++) {
      const x = rng() * 80;
      const y = rng() * 30;
      const z = rng() * 80;
      const speed = 13 + rng() * 15;
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        positions[j * 3] = x;
        positions[j * 3 + 1] = y;
        positions[j * 3 + 2] = z;
        speeds[j] = speed;
        ends[j] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uOpacity: { value: 0.4 },
        uDry: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uDryCount: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec4 uDry[4];
        uniform int uDryCount;
        attribute float aSpeed;
        attribute float aEnd;
        varying float vA;
        void main() {
          vec3 p = position;
          float fall = mod(p.y - uTime * aSpeed, 30.0);
          p.y = fall - aEnd * (0.55 + aSpeed * 0.045);
          p.x = mod(p.x - uCam.x + 40.0, 80.0) - 40.0 + uCam.x + aEnd * 0.10;
          p.z = mod(p.z - uCam.z + 40.0, 80.0) - 40.0 + uCam.z;
          float dry = 0.0;
          for (int i = 0; i < 4; i++) {
            if (i < uDryCount) {
              vec4 r = uDry[i];
              if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) dry = 1.0;
            }
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = length(mv.xyz);
          vA = smoothstep(0.7, 4.0, d) * (1.0 - smoothstep(20.0, 46.0, d)) * (1.0 - dry);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying float vA;
        void main() {
          gl_FragColor = vec4(0.67, 0.79, 0.86, vA * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  setDryAreas(areas) {
    const n = Math.min(4, areas.length);
    for (let i = 0; i < 4; i++) {
      const a = areas[i];
      if (a) this.material.uniforms.uDry.value[i].set(a[0], a[1], a[2], a[3]);
    }
    this.material.uniforms.uDryCount.value = n;
  }

  update(dt, camera) {
    this.material.uniforms.uTime.value += dt;
    this.material.uniforms.uCam.value.copy(camera.position);
  }
}

/* ------------------------------------------------------------------ */
/*  Splash rings on the wet ground                                     */
/* ------------------------------------------------------------------ */

class GroundSplashes {
  constructor(scene, count = 900) {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const rng = mulberry32(1912);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rng() * 64;
      positions[i * 3 + 1] = 0.025 + rng() * 0.01;
      positions[i * 3 + 2] = rng() * 64;
      phases[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
        uDry: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uDryCount: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec4 uDry[4];
        uniform int uDryCount;
        attribute float aPhase;
        varying float vLife;
        varying float vFade;
        void main() {
          float t = fract(uTime * 0.85 + aPhase);
          vec3 p = position;
          p.x = mod(p.x - uCam.x + 32.0, 64.0) - 32.0 + uCam.x;
          p.z = mod(p.z - uCam.z + 32.0, 64.0) - 32.0 + uCam.z;
          float dry = 0.0;
          for (int i = 0; i < 4; i++) {
            if (i < uDryCount) {
              vec4 r = uDry[i];
              if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) dry = 1.0;
            }
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = length(mv.xyz);
          gl_PointSize = mix(1.6, 9.0, t) * (5.0 / max(3.0, d)) * (1.0 - dry);
          gl_Position = projectionMatrix * mv;
          vLife = t;
          vFade = (1.0 - smoothstep(16.0, 34.0, d)) * smoothstep(0.4, 2.0, d) * (1.0 - dry);
        }
      `,
      fragmentShader: /* glsl */`
        varying float vLife;
        varying float vFade;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv) * 2.0;
          float ring = smoothstep(0.72, 0.92, d) * (1.0 - smoothstep(0.94, 1.0, d));
          float a = ring * (1.0 - vLife) * vFade * 0.2;
          if (a < 0.003) discard;
          gl_FragColor = vec4(0.65, 0.82, 0.9, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  setDryAreas(areas) {
    const n = Math.min(4, areas.length);
    for (let i = 0; i < 4; i++) {
      const a = areas[i];
      if (a) this.mat.uniforms.uDry.value[i].set(a[0], a[1], a[2], a[3]);
    }
    this.mat.uniforms.uDryCount.value = n;
  }

  update(dt, camera) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uCam.value.copy(camera.position);
  }
}

/* ------------------------------------------------------------------ */
/*  Generic pooled particles (sparks, smoke)                            */
/* ------------------------------------------------------------------ */

class ParticlePool {
  constructor(scene, max, texture, blending, additive = true) {
    this.max = max;
    this.particles = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture } },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vCol;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (340.0 / max(0.25, -mv.z));
          gl_Position = projectionMatrix * mv;
          vCol = color;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying vec3 vCol;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          float a = t.a * vAlpha;
          if (a < 0.004) discard;
          if (${additive ? 'true' : 'false'}) {
            gl_FragColor = vec4(vCol * a, a);
          } else {
            gl_FragColor = vec4(vCol, a);
          }
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.tex = texture;
  }

  spawn(x, y, z, vx, vy, vz, color, size0, size1, life, gravity = 0, drag = 0) {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push({
      x, y, z, vx, vy, vz, color: color.clone(),
      size0, size1, life, maxLife: life, gravity, drag,
    });
  }

  update(dt) {
    const arr = this.particles;
    let w = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03 && p.gravity < 0) {
        p.y = 0.03;
        p.vy *= -0.25;
        p.vx *= 0.7; p.vz *= 0.7;
      }
    }
    for (const p of arr) {
      const t = 1 - p.life / p.maxLife;
      const i3 = w * 3;
      this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
      this.col[i3] = p.color.r; this.col[i3 + 1] = p.color.g; this.col[i3 + 2] = p.color.b;
      this.size[w] = p.size0 + (p.size1 - p.size0) * t;
      this.alpha[w] = Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.95;
      w++;
    }
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Tracers, muzzle flashes, decals, steam                             */
/* ------------------------------------------------------------------ */

class Tracer {
  constructor(scene, from, to, color, width = 0.018, life = 0.075) {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(width, width * 0.6, Math.max(0.01, len), 4, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    _v.copy(to).sub(from).normalize();
    mesh.quaternion.setFromUnitVectors(_up, _v);
    mesh.renderOrder = 20;
    scene.add(mesh);
    this.mesh = mesh;
    this.life = life;
    this.maxLife = life;
    this.scene = scene;
  }

  update(dt) {
    this.life -= dt;
    this.mesh.material.opacity = Math.max(0, this.life / this.maxLife) * 0.95;
    if (this.life <= 0) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      return false;
    }
    return true;
  }
}

export class Effects {
  constructor(scene, camera, renderer, audio, lowQuality = false) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.audio = audio;
    this.time = 0;
    this.indoor = false;
    this.rainEnabled = true;
    this.rainIntensity = 1;
    this.lightningEnabled = true;
    this.rain = new Rain(scene, lowQuality ? 2100 : 3800);
    this.splashes = new GroundSplashes(scene, lowQuality ? 240 : 500);
    this.softTex = softParticleTexture();
    const dustPos = new Float32Array(340 * 3);
    const dustRng = mulberry32(4242);
    for (let i = 0; i < 340; i++) {
      dustPos[i * 3] = -34 + dustRng() * 68;
      dustPos[i * 3 + 1] = 0.4 + dustRng() * 7.2;
      dustPos[i * 3 + 2] = -34 + dustRng() * 68;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: this.softTex, color: 0xffcf9a, size: 0.075, transparent: true, opacity: 0.34,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
    }));
    this.dust.visible = false;
    this.scene.add(this.dust);
    this.smokeTex = smokeTexture();
    this.decalTex = decalTexture();
    this.sparks = new ParticlePool(scene, lowQuality ? 240 : 420, this.softTex, THREE.AdditiveBlending, true);
    this.smoke = new ParticlePool(scene, lowQuality ? 130 : 220, this.smokeTex, THREE.NormalBlending, false);
    this.tracers = [];
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, opacity: 0.9, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      toneMapped: false,
    });
    this.muzzleSprites = [];
    this.muzzleLight = new THREE.PointLight(0xffb36b, 0, 5, 2);
    this.scene.add(this.muzzleLight);
    this.muzzleLightLife = 0;
    this.shells = [];
    this.shellGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.045, 6);
    this.shellMat = new THREE.MeshBasicMaterial({
      color: 0x9f7c39, toneMapped: true,
    });
    this.shellMesh = new THREE.InstancedMesh(this.shellGeo, this.shellMat, 24);
    this.shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shellMesh.count = 0;
    this.shellMesh.frustumCulled = false;
    this.scene.add(this.shellMesh);
    this.shellDummy = new THREE.Object3D();
    this.steamVents = [];
    this.steamTimers = [];
    this.shake = 0;
    this.flash = 0;
    this.lightningTimer = 15;
    this.lightningPhase = 0;
    this.lightningBolt = 0;
    this.lightningQueue = [];
    this.cooldown = 0;
    this.rng = mulberry32(888);

    this.muzzleTex = this.makeFlashTexture();
    this.glowTex = this.makeGlowTexture();
    this.addSteamVent(new THREE.Vector3(-9, 0.12, 16), 1.0);
    this.addSteamVent(new THREE.Vector3(12, 0.12, -12), 0.8);
    this.addSteamVent(new THREE.Vector3(-24, 0.12, -18), 0.7);
    this.addSteamVent(new THREE.Vector3(27, 0.12, 17), 0.6);
    this.addSteamVent(new THREE.Vector3(8.5, 0.12, 4.0), 0.8);
    this.addSteamVent(new THREE.Vector3(-12.0, 0.12, -8.0), 0.7);
  }

  applyRainVisibility() {
    const visible = this.rainEnabled && !this.indoor;
    this.rain.mesh.visible = visible;
    this.splashes.mesh.visible = visible;
    this.rain.material.uniforms.uOpacity.value = 0.4 * this.rainIntensity;
  }

  setRain(enabled, intensity = 1) {
    this.rainEnabled = !!enabled;
    this.rainIntensity = Math.max(0, Math.min(1.4, intensity));
    this.applyRainVisibility();
    if (this.audio && this.audio.setRain) this.audio.setRain(this.rainEnabled, this.rainIntensity);
  }

  setIndoor(indoor, dustColor = 0xffcf9a) {
    this.indoor = !!indoor;
    this.applyRainVisibility();
    if (this.dust) {
      this.dust.visible = this.indoor;
      this.dust.material.color.setHex(dustColor);
    }
    if (this.audio && this.audio.setIndoor) this.audio.setIndoor(this.indoor);
  }

  setLightningEnabled(enabled) {
    this.lightningEnabled = !!enabled;
    if (!this.lightningEnabled) {
      this.lightningQueue = [];
      this.lightningBolt = 0;
      this.flash = 0;
      this.lightningTimer = 999;
    } else if (this.lightningTimer > 900) {
      this.lightningTimer = 14 + Math.random() * 18;
    }
  }

  setDryAreas(areas) {
    const list = areas || [];
    this.rain.setDryAreas(list);
    this.splashes.setDryAreas(list);
  }

  makeFlashTexture() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,235,170,0.95)');
    g.addColorStop(0.42, 'rgba(255,160,60,0.25)');
    g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,245,210,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, S * 0.45); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  makeGlowTexture() {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(160,240,255,0.5)');
    g.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  addSteamVent(pos, strength = 1) {
    this.steamVents.push({ pos: pos.clone(), strength });
    this.steamTimers.push(Math.random());
  }

  addTracer(from, to, color = 0xffd28a, width = 0.014, life = 0.07) {
    if (this.tracers.length > 48) {
      const old = this.tracers.shift();
      old.mesh.removeFromParent();
    }
    this.tracers.push(new Tracer(this.scene, from.clone(), to.clone(), color, width, life));
  }

  muzzleFlash(pos, color = 0xffd28a) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.muzzleTex, color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    spr.position.copy(pos);
    const s = 0.26 + Math.random() * 0.12;
    spr.scale.set(s, s, s);
    spr.renderOrder = 30;
    this.scene.add(spr);
    this.muzzleSprites.push({ spr, life: 0.075, maxLife: 0.075 });
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.color.set(color);
    this.muzzleLight.intensity = 8;
    this.muzzleLightLife = 0.075;
    this.smoke.spawn(
      pos.x, pos.y, pos.z,
      (Math.random() - 0.5) * 0.35, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.35,
      new THREE.Color(0x49545a), 0.35, 1.0, 0.6, 0.12, 1.1,
    );
  }

  impact(point, normal, color = 0xffb35c, count = 9) {
    const n = normal || _up;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 0.9;
      const sp = 1.5 + Math.random() * 5;
      this.sparks.spawn(
        point.x + n.x * 0.03, point.y + n.y * 0.03, point.z + n.z * 0.03,
        n.x * sp * 0.35 + Math.cos(a) * Math.cos(b) * sp,
        n.y * sp * 0.35 + Math.sin(b) * sp + 0.7,
        n.z * sp * 0.35 + Math.sin(a) * Math.cos(b) * sp,
        c, 0.035, 0.01, 0.25 + Math.random() * 0.4, -9, 1.2,
      );
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.spawn(
        point.x + n.x * 0.05, point.y + n.y * 0.05, point.z + n.z * 0.05,
        n.x * 0.3 + (Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.35, n.z * 0.3 + (Math.random() - 0.5) * 0.4,
        new THREE.Color(0x738087), 0.25, 1.1, 0.7, 0.2, 1.2,
      );
    }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffc27a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    spr.position.copy(point).addScaledVector(n, 0.05);
    spr.scale.setScalar(0.55);
    this.scene.add(spr);
    this.muzzleSprites.push({ spr, life: 0.07, maxLife: 0.07 });
  }

  addDecal(point, normal) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.lookAt(_v.copy(point).add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.08 + Math.random() * 0.06;
    m.scale.set(s, s, s);
    m.renderOrder = 8;
    this.scene.add(m);
    this.decals.push({ m, life: 35 });
    if (this.decals.length > 40) {
      const old = this.decals.shift();
      old.m.removeFromParent();
    }
  }

  ejectShell(origin, right, up, forward) {
    if (this.shells.length >= 24) this.shells.shift();
    const pos = origin.clone()
      .addScaledVector(right, 0.25 + Math.random() * 0.06)
      .addScaledVector(up, -0.13 + Math.random() * 0.03)
      .addScaledVector(forward, 0.46);
    const vel = right.clone().multiplyScalar(1.25 + Math.random() * 0.9)
      .addScaledVector(up, 1.0 + Math.random() * 0.55)
      .addScaledVector(forward, 0.15);
    this.shells.push({
      pos, vel,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      angVel: new THREE.Vector3(9 + Math.random() * 14, 5 + Math.random() * 12, 8 + Math.random() * 16),
      life: 2.4,
    });
  }

  updateShells(dt) {
    let n = 0;
    for (const sh of this.shells) {
      sh.life -= dt;
      if (sh.life <= 0) continue;
      sh.vel.y -= 9.8 * dt;
      sh.pos.addScaledVector(sh.vel, dt);
      if (sh.pos.y < 0.025) {
        sh.pos.y = 0.025;
        sh.vel.y *= -0.28;
        sh.vel.x *= 0.7;
        sh.vel.z *= 0.7;
        sh.angVel.multiplyScalar(0.75);
      }
      sh.rot.x += sh.angVel.x * dt;
      sh.rot.y += sh.angVel.y * dt;
      sh.rot.z += sh.angVel.z * dt;
      this.shellDummy.position.copy(sh.pos);
      this.shellDummy.rotation.copy(sh.rot);
      this.shellDummy.scale.setScalar(0.7);
      this.shellDummy.updateMatrix();
      this.shellMesh.setMatrixAt(n++, this.shellDummy.matrix);
    }
    if (n !== this.shells.length) this.shells = this.shells.filter((s) => s.life > 0);
    this.shellMesh.count = n;
    this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  enemyHit(point, color = 0xff9d55) {
    for (let i = 0; i < 7; i++) {
      this.sparks.spawn(
        point.x, point.y, point.z,
        (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5,
        new THREE.Color(color), 0.025, 0.008, 0.22 + Math.random() * 0.25, -11, 1.5,
      );
    }
  }

  explosion(pos, color = 0xff8a3d, big = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 46 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = (2 + Math.random() * 9) * big;
      this.sparks.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp,
        i % 5 === 0 ? new THREE.Color(0xfff2c8) : c, 0.05 + Math.random() * 0.05, 0.01, 0.35 + Math.random() * 0.7, -7, 1.1,
      );
    }
    for (let i = 0; i < 12 * big; i++) {
      this.smoke.spawn(
        pos.x, pos.y + 0.2, pos.z,
        (Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4,
        new THREE.Color(0x344248), 0.8, 3.4 * big, 1.4 + Math.random() * 1.2, 0.18, 0.8,
      );
    }
    this.shake = Math.max(this.shake, 0.25 * big);
  }

  lightningStrike(force = false) {
    if (!this.lightningEnabled) return;
    this.lightningQueue = force ? [0] : [0, 0.12, 0.22];
    this.lightningTimer = 14 + Math.random() * 18;
  }

  update(dt) {
    this.time += dt;
    this.rain.update(dt, this.camera);
    this.splashes.update(dt, this.camera);
    if (this.dust && this.dust.visible) this.dust.rotation.y += dt * 0.006;
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.updateShells(dt);
    if (this.muzzleLightLife > 0) {
      this.muzzleLightLife -= dt;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLightLife / 0.075) * 8;
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (!this.tracers[i].update(dt)) this.tracers.splice(i, 1);
    }
    for (let i = this.muzzleSprites.length - 1; i >= 0; i--) {
      const s = this.muzzleSprites[i];
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      s.spr.material.opacity = t;
      s.spr.scale.multiplyScalar(1 + dt * 3);
      if (s.life <= 0) {
        s.spr.removeFromParent();
        s.spr.material.dispose();
        this.muzzleSprites.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].life -= dt;
      if (this.decals[i].life <= 0) {
        const d = this.decals[i];
        d.m.removeFromParent();
        this.decals.splice(i, 1);
      }
    }

    // steam vents
    for (let i = 0; i < this.steamVents.length; i++) {
      const v = this.steamVents[i];
      this.steamTimers[i] -= dt;
      if (this.steamTimers[i] <= 0) {
        this.steamTimers[i] = 0.09 / v.strength;
        this.smoke.spawn(
          v.pos.x + (Math.random() - 0.5) * 0.7,
          v.pos.y + Math.random() * 0.2,
          v.pos.z + (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.25, 0.65 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25,
          new THREE.Color(0x6e8994), 0.35, 2.6 * v.strength, 2.2 + Math.random() * 1.4, 0.02, 0.25,
        );
      }
    }

    // lightning scheduler
    if (this.lightningEnabled) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) this.lightningStrike();
      this.lightningBolt = Math.max(0, this.lightningBolt - dt * 7);
      if (this.lightningQueue.length && this.lightningQueue[0] <= 0) {
        this.lightningQueue = [];
        this.lightningBolt = 1;
        this.audio.thunder(0.4 + Math.random() * 1.5);
      } else if (this.lightningQueue.length) {
        this.lightningQueue[0] -= dt;
      }
    } else {
      this.lightningBolt = 0;
    }
    this.flash = this.lightningBolt;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
    return this.flash;
  }
}
