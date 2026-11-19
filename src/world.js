import * as THREE from 'three';
import {
  asphaltTextures, concreteTextures, metalTextures, containerTexture,
  hazardTexture, neonSignTexture, screenTexture, markerTexture,
  extractionSignTexture, wetReflectionTexture, chainlinkTexture,
  cityWindowsTexture, rippleNormalTexture, ventGrateTexture, mulberry32,
  glowSpriteTexture, puddleAlphaTexture, stencilTexture,
} from './textures.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/* ------------------------------------------------------------------ */
/*  Collision helpers                                                  */
/* ------------------------------------------------------------------ */

export function circleCollides(x, z, radius, colliders) {
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return c;
  }
  return null;
}

export function lineBlocked(a, b, colliders) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let tmin = 0, tmax = 1;
  for (const c of colliders) {
    if (c.maxY !== undefined && c.maxY < 1.4) continue;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dz, dz];
    const q = [a.x - c.minX, c.maxX - a.x, a.z - c.minZ, c.maxZ - a.z];
    let blocked = true;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-8) {
        if (q[i] < 0) { blocked = false; break; }
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) { blocked = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { blocked = false; break; } if (r < t1) t1 = r; }
      }
    }
    if (blocked && t0 <= t1) return true;
  }
  return false;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(220, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uLightning: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uLightning;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 horizon = vec3(0.095, 0.145, 0.16);
        vec3 zenith  = vec3(0.008, 0.016, 0.026);
        vec3 col = mix(horizon, zenith, pow(clamp(d.y,0.0,1.0), 0.55));
        vec2 uv = d.xz / (abs(d.y) + 0.24);
        float c = fbm(uv * 1.45 + vec2(uTime*0.0025, uTime*0.0012));
        float c2 = fbm(uv * 3.6 - vec2(uTime*0.006, 0.0));
        float clouds = smoothstep(0.38, 0.79, c*0.82 + c2*0.35);
        col = mix(col, vec3(0.019,0.029,0.036), clouds * 0.82);
        float moon = pow(max(dot(d, normalize(vec3(-0.38,0.58,0.32))), 0.0), 320.0);
        col += vec3(0.62,0.74,0.85) * moon * 0.6;
        float glow = pow(max(dot(d, normalize(vec3(-0.38,0.58,0.32))), 0.0), 18.0);
        col += vec3(0.05,0.075,0.1) * glow;
        col += vec3(0.6,0.78,1.0) * uLightning * (0.45 + clouds*0.9);
        // distant city glow on the horizon
        float city = pow(max(0.0, 1.0 - abs(d.y)*4.2), 3.0);
        col += vec3(0.16,0.075,0.028) * city * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

function coneLightMaterial(color, opacity = 0.065) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vWorld;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main(){
        float edge = pow(abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.65);
        float top = smoothstep(0.0, 0.16, vUv.y);
        float bottom = 1.0 - smoothstep(0.62, 1.0, vUv.y);
        float dust = 0.72 + 0.28 * noise(vec2(vUv.x*7.0, vUv.y*18.0 - uTime*0.25));
        float a = uOpacity * (0.22 + edge*0.78) * top * bottom * dust;
        gl_FragColor = vec4(uColor * a * 1.8, a);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function addCone(scene, source, target, radius, color, opacity = 0.06) {
  const dir = new THREE.Vector3().subVectors(target, source);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius * 0.06, radius, len, 32, 1, true);
  const mat = coneLightMaterial(color, opacity);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(source).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
  mesh.renderOrder = 6;
  scene.add(mesh);
  return { mesh, mat };
}

function forceFieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xff2a3d) },
      uOpen: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpen;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(27.1,113.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main(){
        vec2 uv = vUv;
        float scan = smoothstep(0.45, 0.5, abs(fract(uv.y*22.0 - uTime*0.55) - 0.5));
        float n = noise(vec2(uv.x*5.0, uv.y*9.0 + uTime*0.4));
        float edge = smoothstep(0.0, 0.06, uv.x) * smoothstep(0.0, 0.06, 1.0-uv.x) * smoothstep(0.0, 0.04, uv.y);
        float a = (0.1 + scan*0.3 + n*0.08) * edge * (1.0-uOpen);
        vec3 col = uColor * (1.1 + scan*1.6 + n*0.35);
        gl_FragColor = vec4(col, a);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ------------------------------------------------------------------ */

export class World {
  constructor(scene, renderer, audio, level) {
    this.scene = scene;
    this.renderer = renderer;
    this.audio = audio;
    this.level = level;
    this.colliders = [];
    this.rayMeshes = [];
    this.mapBoxes = [];
    this.relays = [];
    this.time = 0;
    this.lampLights = [];
    this.animLights = [];
    this.cones = [];
    this.cityLights = [];
    this.puddleMats = [];
    this.extractionActive = false;
    this.search = null;
    this.rng = mulberry32(90210);
    this.bounds = { minX: -35, maxX: 35, minZ: -35, maxZ: 35 };
    this.spawn = new THREE.Vector3(level?.spawn?.x || 0, 0, level?.spawn?.z || 32);
    this.sin = 0;

    this.buildMaterials();
    this.buildAtmosphere();
    this.buildGround();
    if (this.level?.preset === 'pump') {
      this.buildArchitecture();
      this.buildProps();
      this.buildLighting();
      this.buildSignage();
      this.buildDetails();
      this.buildDecals();
    } else {
      this.buildVariantArchitecture();
      this.buildVariantProps();
      this.buildVariantLighting();
      this.buildVariantSignage();
      this.buildVariantDetails();
      this.buildVariantDecals();
    }
    this.buildRelays();
    this.buildGate();
    this.buildCity();
  }

  addCollider(x, y, z, w, h, d, tag = 'solid') {
    const c = {
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      minY: y, maxY: y + h, tag,
    };
    this.colliders.push(c);
    this.mapBoxes.push(c);
    return c;
  }

  box(x, y, z, w, h, d, mat, { collide = true, ray = true, shadow = true, rotY = 0, tag = 'solid' } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const bottom = y - h / 2;
    if (collide && bottom < 0.45) {
      const c = Math.abs(Math.cos(rotY)), sn = Math.abs(Math.sin(rotY));
      const bx = rotY ? w * c + d * sn : w;
      const bz = rotY ? w * sn + d * c : d;
      this.addCollider(x, Math.max(0, bottom), z, bx, h, bz, tag);
    }
    if (ray) this.rayMeshes.push(mesh);
    return mesh;
  }

  buildMaterials() {
    const asphalt = asphaltTextures();
    this.asphalt = new THREE.MeshStandardMaterial({
      map: asphalt.map,
      normalMap: asphalt.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: asphalt.roughnessMap,
      roughness: 0.72,
      metalness: 0.52,
      envMapIntensity: 1.55,
      color: 0xbfc9cd,
    });

    const concrete = concreteTextures('#636a6a', 3);
    this.concrete = new THREE.MeshStandardMaterial({
      map: concrete.map, normalMap: concrete.normalMap, roughnessMap: concrete.roughnessMap,
      roughness: 0.94, metalness: 0.05, envMapIntensity: 0.5, color: 0x8c9494,
    });
    const darkConcrete = concreteTextures('#394242', 4);
    this.darkConcrete = new THREE.MeshStandardMaterial({
      map: darkConcrete.map, normalMap: darkConcrete.normalMap, roughnessMap: darkConcrete.roughnessMap,
      roughness: 0.86, metalness: 0.1, envMapIntensity: 0.8, color: 0x727a7b,
    });
    const metal = metalTextures('#525b5d', 3);
    this.metal = new THREE.MeshStandardMaterial({
      map: metal.map, normalMap: metal.normalMap, roughnessMap: metal.roughnessMap,
      roughness: 0.58, metalness: 0.8, envMapIntensity: 1.2, color: 0x9ba3a3,
    });
    const metalDark = metalTextures('#272e30', 4);
    this.metalDark = new THREE.MeshStandardMaterial({
      map: metalDark.map, normalMap: metalDark.normalMap, roughnessMap: metalDark.roughnessMap,
      roughness: 0.62, metalness: 0.85, envMapIntensity: 1.0, color: 0x737c7e,
    });
    this.rubber = new THREE.MeshStandardMaterial({ color: 0x0c0f10, roughness: 0.95, metalness: 0.05 });
    this.rust = new THREE.MeshStandardMaterial({
      map: metalDark.map, normalMap: metalDark.normalMap, roughness: 0.95, metalness: 0.45,
      color: 0x8e513a, envMapIntensity: 0.7,
    });
    this.hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(2, 1), roughness: 0.62, metalness: 0.35 });
    this.glowWarm = new THREE.MeshStandardMaterial({
      color: 0x0a0703, emissive: 0xffb066, emissiveIntensity: 5.5, roughness: 0.3, metalness: 0.2, toneMapped: true,
    });
    this.glowCyan = new THREE.MeshStandardMaterial({
      color: 0x021012, emissive: 0x54e9ff, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.2,
    });
    this.glowRed = new THREE.MeshStandardMaterial({
      color: 0x160203, emissive: 0xff273f, emissiveIntensity: 5.0, roughness: 0.3, metalness: 0.2,
    });
    this.glowGreen = new THREE.MeshStandardMaterial({
      color: 0x03140c, emissive: 0x58ffab, emissiveIntensity: 4.4, roughness: 0.3, metalness: 0.2,
    });
    this.rippleNormal = rippleNormalTexture();
    this.puddleAlpha = puddleAlphaTexture();
    this.puddleMat = new THREE.MeshStandardMaterial({
      color: 0x081113,
      metalness: 0.88,
      roughness: 0.105,
      transparent: true,
      opacity: 0.43,
      alphaMap: this.puddleAlpha,
      envMapIntensity: 1.8,
      normalMap: this.rippleNormal,
      normalScale: new THREE.Vector2(0.13, 0.13),
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.chainlink = new THREE.MeshStandardMaterial({
      map: chainlinkTexture(), transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      metalness: 0.7, roughness: 0.5, depthWrite: false,
    });
    this.grate = new THREE.MeshStandardMaterial({ map: ventGrateTexture(), roughness: 0.5, metalness: 0.75 });
    this.containerMats = [
      new THREE.MeshStandardMaterial({ ...containerTexture('46,64,70'), roughness: 0.68, metalness: 0.55, envMapIntensity: 1.0 }),
      new THREE.MeshStandardMaterial({ ...containerTexture('76,54,44'), roughness: 0.7, metalness: 0.5, envMapIntensity: 1.0 }),
      new THREE.MeshStandardMaterial({ ...containerTexture('38,58,51'), roughness: 0.66, metalness: 0.5, envMapIntensity: 1.0 }),
      new THREE.MeshStandardMaterial({ ...containerTexture('58,46,63'), roughness: 0.7, metalness: 0.5, envMapIntensity: 1.0 }),
    ];
  }

  buildAtmosphere() {
    const lv = this.level || {};
    this.fogColor = lv.fog?.color ?? 0x0c1a21;
    this.fogDensity = lv.fog?.density ?? 0.0215;
    this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(lv.hemi?.sky ?? 0x587a93, lv.hemi?.ground ?? 0x080d10, lv.hemi?.intensity ?? 0.82);
    this.scene.add(this.hemi);
    this.baseHemi = this.hemi.intensity;
    this.moon = new THREE.DirectionalLight(lv.moon?.color ?? 0xc2dcfa, lv.moon?.intensity ?? 1.42);
    this.baseMoon = this.moon.intensity;
    this.moon.position.set(-24, 36, 18);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    this.moon.shadow.camera.left = -45;
    this.moon.shadow.camera.right = 45;
    this.moon.shadow.camera.top = 45;
    this.moon.shadow.camera.bottom = -45;
    this.moon.shadow.camera.near = 1;
    this.moon.shadow.camera.far = 90;
    this.moon.shadow.bias = -0.0007;
    this.moon.shadow.normalBias = 0.025;
    this.scene.add(this.moon);
    this.moon.target.position.set(0, 0, 0);
    this.scene.add(this.moon.target);
  }

  buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(82, 82, 1, 1), this.asphalt);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.rayMeshes.push(ground);

    // painted lane markings
    const paint = new THREE.MeshStandardMaterial({
      color: 0xd5b449, roughness: 0.75, metalness: 0.1, transparent: true, opacity: 0.55,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    for (const z of [16, 10, -12]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4.4), paint);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-23, 0.012, z);
      line.receiveShadow = true;
      this.scene.add(line);
    }
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.8); arrowShape.lineTo(0.5, 0.1); arrowShape.lineTo(0.18, 0.1);
    arrowShape.lineTo(0.18, -0.8); arrowShape.lineTo(-0.18, -0.8); arrowShape.lineTo(-0.18, 0.1);
    arrowShape.lineTo(-0.5, 0.1); arrowShape.closePath();
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8f9c9e, roughness: 0.8, transparent: true, opacity: 0.32 });
    for (const p of [[-3, 24, 0], [0, 24, 0], [3, 24, 0]]) {
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(p[0], 0.013, p[1]);
      this.scene.add(arrow);
    }

    // grates
    for (const [x, z, w, d] of [[-7.2, 19, 1.6, 3.2], [7.2, 19, 1.6, 3.2], [-19, 2, 2.2, 2.2], [20, -16, 2.4, 2.4]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.grate);
      g.rotation.x = -Math.PI / 2;
      g.position.set(x, 0.015, z);
      this.scene.add(g);
    }

    // puddles / wet reflection pools
    const rng = mulberry32(8071);
    for (let i = 0; i < 16; i++) {
      const x = -30 + rng() * 60;
      const z = -29 + rng() * 58;
      if (Math.abs(x) < 9.8 && z > -9.5 && z < 3.5) continue;
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.puddleMat.clone());
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rng() * Math.PI;
      p.scale.set(1.2 + rng() * 3.4, 0.55 + rng() * 1.4, 1);
      p.position.set(x, 0.018 + rng() * 0.005, z);
      p.material.normalMap = this.rippleNormal.clone();
      p.material.normalMap.needsUpdate = true;
      p.material.alphaMap = this.puddleAlpha;
      p.material.normalMap.offset.set(rng(), rng());
      this.puddleMats.push(p.material);
      this.scene.add(p);
    }

    // steam vent collars
    for (const [x, z] of [[-9, 16], [12, -12], [-24, -18], [27, 17]]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.14, 12), this.metalDark);
      ring.position.set(x, 0.07, z);
      ring.castShadow = true;
      this.scene.add(ring);
    }
  }

  buildArchitecture() {
    // main outer walls
    this.box(0, 5.5, 36.2, 72, 11, 2, this.darkConcrete, { tag: 'wall' });
    this.box(0, 5.5, -36.2, 72, 11, 2, this.darkConcrete, { tag: 'wall' });
    this.box(-36.2, 5.5, 0, 2, 11, 72, this.darkConcrete, { tag: 'wall' });
    this.box(36.2, 5.5, 0, 2, 11, 72, this.darkConcrete, { tag: 'wall' });

    // alley entrance walls
    this.box(-8.2, 3.5, 28, 1.4, 7, 16, this.concrete, { tag: 'wall' });
    this.box(8.2, 3.5, 28, 1.4, 7, 16, this.concrete, { tag: 'wall' });
    // alley gantry and pipes
    this.box(0, 7.15, 19.8, 18, 1.1, 1.5, this.metalDark, { tag: 'wall' });
    this.box(0, 6.3, 19.8, 8, 0.65, 0.9, this.metal, { collide: false });
    for (let i = 0; i < 4; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 17.4, 8), this.rust);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 6.25 + i * 0.23, 18.4 - i * 0.34);
      pipe.castShadow = true;
      this.scene.add(pipe);
    }

    // central processing block
    this.box(0, 3.7, -3, 18, 7.4, 12, this.concrete, { tag: 'building' });
    this.box(0, 7.55, -3, 18.6, 0.3, 12.6, this.metalDark, { tag: 'roof' });
    this.box(0, 7.9, -3, 4.4, 0.5, 3.2, this.metal, { collide: false });
    // building ribs
    for (const x of [-8.9, -5.4, -1.8, 1.8, 5.4, 8.9]) {
      this.box(x, 3.6, 3.06, 0.22, 7.1, 0.22, this.metalDark, { collide: false });
    }
    // doorway alcove
    this.box(-2.5, 1.7, 3.22, 4.2, 3.4, 0.22, this.metalDark, { collide: false });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.9), this.metalDark);
    door.position.set(-2.5, 1.55, 3.35);
    this.scene.add(door);
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.8, 0.08), this.hazard);
      bar.position.set(-3.7 + i * 2.4, 1.55, 3.42);
      this.scene.add(bar);
    }

    // rolling service doors, vents, signage and pipework break up the facade
    for (const x of [-5.6, 5.6]) {
      this.box(x, 2.05, 3.07, 3.5, 4.1, 0.16, this.metalDark, { collide: false });
      for (let i = 0; i < 9; i++) {
        this.box(x, 0.18 + i * 0.46, 3.16, 3.3, 0.055, 0.05, this.metal, { collide: false });
      }
      this.box(x, 0.12, 3.18, 3.5, 0.22, 0.05, this.hazard, { collide: false });
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), this.grate);
      fan.position.set(x, 4.8, 3.17);
      this.scene.add(fan);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.05, 6, 24), this.metalDark);
      ring.position.set(x, 4.8, 3.19);
      this.scene.add(ring);
    }
    const stationTex = this.makeTextSignTexture('07 号泵站', '主继电器控制', '#ffbb6e', 900, 160);
    const stationMat = new THREE.MeshStandardMaterial({
      map: stationTex, emissive: 0xffffff, emissiveMap: stationTex, emissiveIntensity: 1.7,
      color: 0x050505, transparent: true,
    });
    const stationSign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.0), stationMat);
    stationSign.position.set(-2.5, 4.55, 3.35);
    this.scene.add(stationSign);
    // facade pipe runs
    for (let i = 0; i < 2; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 15.2, 8), this.rust);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 6.9 - i * 0.23, 3.36);
      this.scene.add(pipe);
    }
    // an emissive wash carves the entrance out of the gloom (no extra dynamic light)
    const entryGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,180,105,1)'), color: 0xffb066, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.7,
    }));
    entryGlow.position.set(-2.5, 4.75, 3.4);
    entryGlow.scale.set(2.6, 2.6, 1);
    this.scene.add(entryGlow);

    // roof vents and antenna
    for (const [x, z, s] of [[-6, -7, 1.2], [2, -6, 0.8], [6.4, -1, 1.0]]) {
      this.box(x, 8.2, z, 1.9 * s, 0.8, 1.5 * s, this.metal, { collide: false });
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 5, 6), this.metalDark);
    mast.position.set(7, 10.2, -7.4);
    this.scene.add(mast);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,60,60,1)'), color: 0xff3040, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    beacon.position.set(7, 12.8, -7.4);
    beacon.scale.set(0.8, 0.8, 0.8);
    this.scene.add(beacon);
    this.cityLights.push({ sprite: beacon, phase: 0.3, speed: 1.1 });

    // loading dock canopy on west side
    this.box(-11.2, 4.2, 1.5, 5.4, 0.28, 8.5, this.metalDark, { collide: false });
    for (const z of [-1.7, 4.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.2, 0.24), this.metalDark);
      post.position.set(-13.5, 2.1, z);
      post.castShadow = true;
      this.scene.add(post);
    }

    // extraction tunnel
    this.box(-5.9, 4.0, -33.8, 1.6, 8, 5.2, this.concrete, { tag: 'wall' });
    this.box(5.9, 4.0, -33.8, 1.6, 8, 5.2, this.concrete, { tag: 'wall' });
    this.box(0, 8.0, -34.1, 13.4, 0.7, 6.2, this.metalDark, { tag: 'wall' });
    this.box(0, 0.15, -34.0, 10, 0.3, 5.6, this.metal, { collide: false });
    // hazard strips on tunnel floor
    for (const x of [-3.5, 0, 3.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4.8), this.hazard);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.32, -34.0);
      this.scene.add(strip);
    }
  }

  buildProps() {
    // shipping containers
    const containers = [
      [-19, 12, 7, 0, 0], [19, 12, 7, 0, 1],
      [-26, -8, 6.2, 0, 2], [26, -8, 6.2, 0, 3],
      [-17, -17, 6.2, 0, 1], [17, -17, 6.2, 0, 0],
      [-30, 21, 5.4, Math.PI / 2, 3],
    ];
    for (const [x, z, len, ry, mi] of containers) {
      const c = this.box(x, 1.32, z, len, 2.64, 2.75, this.containerMats[mi], { rotY: ry, tag: 'container' });
      // container feet
      for (const sx of [-len / 2 + 0.3, len / 2 - 0.3]) {
        this.box(x + sx, 0.09, z, 0.35, 0.18, 2.5, this.metalDark, { collide: false });
      }
    }

    // low concrete barriers
    const barrierPos = [
      [-5, 14, 4.8, 1.15, 1.0], [5, 14, 4.8, 1.15, 1.0],
      [-14, 6, 3.6, 1.1, 0.9], [14, 6, 3.6, 1.1, 0.9],
      [-11, -12, 3.6, 1.0, 0.9], [11, -12, 3.6, 1.0, 0.9],
      [-3, -24, 3.8, 1.1, 0.9], [3, -24, 3.8, 1.1, 0.9],
    ];
    for (const [x, z, w, h, d] of barrierPos) {
      this.box(x, h / 2, z, w, h, d, this.concrete, { tag: 'cover' });
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.22), this.hazard);
      stripe.position.set(x, h * 0.78, z + d / 2 + 0.006);
      this.scene.add(stripe);
    }

    // crates
    const crateMat = new THREE.MeshStandardMaterial({
      map: concreteTextures('#4b4940', 2).map, roughness: 0.9, metalness: 0.1, color: 0x8b846d,
    });
    const rng = mulberry32(313);
    const crateSpots = [
      [-13.5, 15], [13.8, 16.2], [-29, 2.5], [30, -2], [-7, -18], [7, -19], [-22, 19.4], [23, 20],
    ];
    for (const [x, z] of crateSpots) {
      const s = 0.9 + rng() * 0.6;
      this.box(x, s / 2, z, s, s, s, crateMat, { tag: 'cover' });
      if (rng() < 0.6) this.box(x + s * 0.12, s * 1.5, z - s * 0.05, s * 0.8, s * 0.8, s * 0.8, crateMat, { tag: 'cover' });
    }

    // barrels
    for (const [x, z, c] of [[-23, 14, 0x8a3d24], [-21.7, 14.6, 0x3f5d54], [24, 18, 0x6d5a2d], [25.2, 17.4, 0x283f43]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 14), this.metalDark.clone());
      b.material.color.setHex(c);
      b.position.set(x, 0.475, z);
      b.castShadow = true; b.receiveShadow = true;
      this.scene.add(b);
      this.rayMeshes.push(b);
      this.addCollider(x, 0, z, 0.72, 0.95, 0.72, 'prop');
    }

    // chain-link fence sections around west service area
    for (const [x, z, w, ry] of [[-22, 5, 8, 0], [-22, -1, 8, 0]]) {
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), this.chainlink);
      fence.position.set(x, 1.2, z);
      fence.rotation.y = ry;
      this.scene.add(fence);
      this.addCollider(x, 0, z, w, 2.4, 0.12, 'fence');
    }
    for (const z of [-20, -24, -28]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.5, 0.09), this.metalDark);
      post.position.set(-22, 1.25, z);
      this.scene.add(post);
    }

    // electrical boxes and pipes along walls
    for (const [x, z, ry] of [[-35, 15, Math.PI / 2], [35, -16, -Math.PI / 2], [-35, -18, Math.PI / 2], [35, 20, -Math.PI / 2]]) {
      const b = this.box(x, 0.9, z, 1.1, 1.8, 0.55, this.metal, { collide: false, rotY: ry });
      for (let i = 0; i < 3; i++) {
        const led = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.05), i === 0 ? this.glowGreen : this.glowRed);
        led.position.set(x + (ry > 0 ? 0.29 : -0.29), 1.35 - i * 0.18, z + 0.1);
        led.rotation.y = ry;
        this.scene.add(led);
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 26, 10), this.rust);
      p.rotation.x = Math.PI / 2;
      p.position.set(-35.1, 3.2 + i * 0.42, -2);
      p.castShadow = true;
      this.scene.add(p);
    }

    // tarped stack
    const tarp = new THREE.MeshStandardMaterial({ color: 0x202a28, roughness: 0.92, metalness: 0.05 });
    this.box(-15.5, 0.45, -24.4, 3.2, 0.9, 2.2, tarp, { tag: 'cover' });

    // cables across alley
    for (const [y, z, sag] of [[6.8, 24, 1.2], [6.1, 28.5, 1.4], [5.5, 33, 0.9]]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-8, y, z),
        new THREE.Vector3(0, y - sag, z + 0.4),
        new THREE.Vector3(8, y, z),
      );
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.035, 5, false), this.rubber);
      this.scene.add(tube);
    }

    // foreground street clutter
    for (const [x, z, w, h, d, ry] of [[-5.7, 31, 1.6, 1.25, 2.2, 0.12], [5.6, 29, 1.3, 1.0, 1.8, -0.08]]) {
      this.box(x, h / 2, z, w, h, d, this.metalDark, { rotY: ry, tag: 'cover' });
    }
  }

  buildLighting() {
    const lampPositions = [
      [-13, 17.5, true], [13, 17.5, true], [-13, -21.5, false], [13, -21.5, false],
    ];
    for (const [x, z, lit] of lampPositions) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6.6, 8), this.metalDark);
      pole.position.set(x, 3.3, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), this.metalDark);
      arm.position.set(x + (x < 0 ? 0.8 : -0.8), 6.45, z);
      this.scene.add(arm);
      const headX = x + (x < 0 ? 1.72 : -1.72);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.42), this.metal);
      head.position.set(headX, 6.34, z);
      head.castShadow = true;
      this.scene.add(head);
      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.28), this.glowWarm);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(headX, 6.23, z);
      this.scene.add(bulb);

      if (lit) {
        const light = new THREE.PointLight(0xffb36b, 105, 26, 2);
        light.position.set(headX, 6.1, z);
        this.scene.add(light);
        this.lampLights.push({ light, base: 105, phase: Math.random() * 10, broken: Math.random() < 0.25 });
      }
      const cone = addCone(this.scene, new THREE.Vector3(headX, 6.2, z), new THREE.Vector3(headX, 0, z), 4.8, 0xffab62, 0.055);
      this.cones.push(cone);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowSpriteTexture('rgba(255,180,100,1)'), color: 0xffb066, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.7,
      }));
      glow.position.set(headX, 6.2, z);
      glow.scale.set(2.4, 2.4, 1);
      this.scene.add(glow);
    }

    // hanging work lamp over the yard approach
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 4.0, 5), this.rubber);
    cable.position.set(0, 6.9, 9.5);
    this.scene.add(cable);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.46, 16, 1, true), this.metalDark);
    shade.position.set(0, 4.82, 9.5);
    shade.rotation.x = Math.PI;
    this.scene.add(shade);
    const workBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.glowWarm);
    workBulb.position.set(0, 4.62, 9.5);
    this.scene.add(workBulb);
    const workLight = new THREE.PointLight(0xffb066, 72, 20, 2);
    workLight.position.set(0, 4.55, 9.5);
    this.scene.add(workLight);
    this.lampLights.push({ light: workLight, base: 72, phase: 2.1, broken: false });
    this.cones.push(addCone(this.scene, new THREE.Vector3(0, 4.5, 9.5), new THREE.Vector3(0, 0, 9.5), 3.4, 0xffab62, 0.05));
    const workGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,180,105,1)'), color: 0xffb066, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.65,
    }));
    workGlow.position.set(0, 4.62, 9.5);
    workGlow.scale.set(2.1, 2.1, 1);
    this.scene.add(workGlow);

    // cool work light over the extraction gate
    const gateLight = new THREE.PointLight(0x58ffb0, 30, 16, 2);
    gateLight.position.set(0, 5.6, -29);
    this.scene.add(gateLight);
    this.gateLight = gateLight;

    // sweeping searchlight tower on the east wall
    const tower = new THREE.Group();
    tower.position.set(29, 11, 24);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8), this.metalDark);
    tower.add(base);
    this.scene.add(tower);
    const beamSource = new THREE.Vector3(29, 12.6, 24);
    this.searchPivot = new THREE.Group();
    this.searchPivot.position.copy(beamSource);
    this.scene.add(this.searchPivot);
    const searchGeo = new THREE.CylinderGeometry(0.4, 7.5, 34, 32, 1, true);
    searchGeo.rotateX(Math.PI / 2);
    this.searchCone = new THREE.Mesh(searchGeo, coneLightMaterial(0x8cd9ff, 0.032));
    this.searchCone.position.z = 17;
    this.searchPivot.add(this.searchCone);
    this.cones.push({ mesh: this.searchCone, mat: this.searchCone.material });

    this.searchTarget = new THREE.Object3D();
    this.scene.add(this.searchTarget);

    // warm practicals behind the big signs
    const neonWest = new THREE.PointLight(0xff4fa3, 60, 22, 2);
    neonWest.position.set(-32, 6.5, 10);
    this.scene.add(neonWest);
    this.animLights.push({ light: neonWest, base: 60, phase: 1.4, speed: 0.7 });
  }

  makeTextSignTexture(text, sub, color, w = 512, h = 160) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(3,7,8,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const family = '"Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
    let mainSize = Math.round(h * 0.46);
    ctx.font = `700 ${mainSize}px ${family}`;
    const measured = ctx.measureText(text).width;
    if (measured > w * 0.86) mainSize = Math.max(18, Math.floor(mainSize * (w * 0.86) / measured));
    ctx.font = `700 ${mainSize}px ${family}`;
    ctx.fillStyle = color;
    ctx.shadowBlur = 24;
    ctx.fillText(text, w / 2, h * 0.43);
    ctx.font = `500 ${Math.round(h * 0.115)}px ${family}`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(220,240,240,0.8)';
    ctx.fillText(sub, w / 2, h * 0.78);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  buildSignage() {
    // overhead alley sign
    const signTex = this.makeTextSignTexture('07 号区', '夜间作业 // 仅限授权', '#ffbf66', 768, 180);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 2.7,
      color: 0x050505, transparent: true, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide,
    });
    const overhead = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.2), signMat);
    overhead.position.set(0, 5.4, 20.15);
    this.scene.add(overhead);
    const back = this.box(0, 5.4, 20.3, 9.8, 2.4, 0.18, this.metalDark, { collide: false });
    back.castShadow = true;

    // vertical neon signs
    const addNeon = (x, y, z, ry, text, sub, color, w, h, reflection) => {
      const t = neonSignTexture(text, sub, color, 512, 1024);
      const mat = new THREE.MeshStandardMaterial({
        map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.9,
        color: 0x020202, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide,
        roughness: 0.25, metalness: 0.15, toneMapped: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      this.scene.add(mesh);
      // frame
      const frame = this.box(x + (ry > 0 ? -0.18 : 0.18), y, z, 0.25, h + 0.6, w + 0.4, this.metalDark, { collide: false });
      frame.rotation.y = 0;
      if (reflection) {
        const rt = wetReflectionTexture(reflection, 128, 512);
        const rm = new THREE.MeshBasicMaterial({
          map: rt, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending,
          depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        });
        const rp = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.45, h * 1.1), rm);
        rp.rotation.x = -Math.PI / 2;
        rp.rotation.z = ry > 0 ? Math.PI / 2 : -Math.PI / 2;
        rp.position.set(x + (x < 0 ? w * 1.4 : -w * 1.4), 0.022, z + 1.7);
        rp.renderOrder = 4;
        this.scene.add(rp);
      }
      return mesh;
    };
    addNeon(-35.2, 8.5, 10, Math.PI / 2, '拉面', '通宵营业', '#ff4fa3', 3.2, 7.4, 'rgba(255,80,170,1)');
    addNeon(35.2, 8.0, -9, -Math.PI / 2, '虚空', '信号 // 09', '#43e8ff', 2.9, 6.8, 'rgba(60,225,255,1)');
    addNeon(9.2, 6.0, -3.1, Math.PI / 2, '极光', '重型工业', '#ffb45c', 1.7, 4.0, 'rgba(255,175,80,1)');

    // lit windows on the central block
    const winWarm = new THREE.MeshStandardMaterial({
      color: 0x130d06, emissive: 0xffa45c, emissiveIntensity: 1.05, roughness: 0.32, metalness: 0.25,
    });
    const winCyan = new THREE.MeshStandardMaterial({
      color: 0x041012, emissive: 0x7edbe4, emissiveIntensity: 0.9, roughness: 0.32, metalness: 0.25,
    });
    for (let i = 0; i < 4; i++) {
      const x = -6.6 + i * 4.4;
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.48), i % 2 ? winCyan : winWarm);
      lamp.position.set(x, 5.6, 3.08);
      this.scene.add(lamp);
      this.box(x, 5.88, 3.1, 1.12, 0.07, 0.1, this.metalDark, { collide: false });
      this.box(x, 5.32, 3.1, 1.12, 0.07, 0.1, this.metalDark, { collide: false });
      this.box(x - 0.56, 5.6, 3.1, 0.07, 0.62, 0.1, this.metalDark, { collide: false });
      this.box(x + 0.56, 5.6, 3.1, 0.07, 0.62, 0.1, this.metalDark, { collide: false });
    }

    // gate warning signage
    const gateTex = this.makeTextSignTexture('04 号闸门', '需要授权', '#ff4a55', 512, 160);
    const gateSignMat = new THREE.MeshStandardMaterial({
      map: gateTex, emissive: 0xffffff, emissiveMap: gateTex, emissiveIntensity: 2.4,
      color: 0x050505, side: THREE.DoubleSide, transparent: true,
    });
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.55), gateSignMat);
    gateSign.position.set(-7.5, 5.1, -28.2);
    gateSign.rotation.y = 0.15;
    this.scene.add(gateSign);

    // extraction sign inside tunnel
    const extTex = extractionSignTexture();
    const extMat = new THREE.MeshStandardMaterial({
      map: extTex, emissive: 0xffffff, emissiveMap: extTex, emissiveIntensity: 1.8,
      color: 0x030303, side: THREE.DoubleSide,
    });
    const ext = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), extMat);
    ext.position.set(0, 6.4, -35.18);
    this.scene.add(ext);

    // distant signage / decals on walls
    const stripeTex = this.makeTextSignTexture('警告', '高压危险', '#d8b24f', 512, 100);
    for (const [x, z, ry] of [[-35.15, -4, Math.PI / 2], [35.15, 12, -Math.PI / 2]]) {
      const mat = new THREE.MeshStandardMaterial({ map: stripeTex, emissive: 0xffffff, emissiveMap: stripeTex, emissiveIntensity: 0.8, color: 0x333333 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), mat);
      m.position.set(x, 2.8, z);
      m.rotation.y = ry;
      this.scene.add(m);
    }
  }

  buildDetails() {
    const rail = this.metalDark;
    // rooftop railing silhouette
    for (let x = -8; x <= 8; x += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), rail);
      post.position.set(x, 7.95, 3.08);
      this.scene.add(post);
    }
    for (const y of [8.34, 8.06]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.055, 0.055), rail);
      bar.position.set(0, y, 3.08);
      this.scene.add(bar);
    }

    // side pipework and service conduits
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 5.4, 8), this.rust);
        pipe.position.set(side * 9.18, 3.1, -5.6 + i * 2.3);
        pipe.castShadow = true;
        this.scene.add(pipe);
      }
      for (const z of [-5.6, -3.3, -1.0]) {
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), rail);
        clamp.position.set(side * 9.08, 3.1, z);
        this.scene.add(clamp);
      }
    }
    this.box(0, 4.2, 3.19, 17.4, 0.09, 0.09, rail, { collide: false });
    this.box(0, 6.15, 3.19, 17.4, 0.055, 0.055, rail, { collide: false });

    // service ducts under the canopy
    for (const [x, z, len] of [[-10.9, 1.6, 6.4], [10.9, -3.2, 5.0]]) {
      const duct = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, len), this.metalDark);
      duct.position.set(x, 3.85, z);
      duct.rotation.x = 0;
      duct.castShadow = true;
      this.scene.add(duct);
      for (let i = 0; i < 5; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.46, 0.06), this.metal);
        band.position.set(x, 3.85, z - len / 2 + (i + 0.5) * (len / 5));
        this.scene.add(band);
      }
    }

    // warm fluorescent tubes under the loading canopy
    for (const z of [0.4, 3.1]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 0.11), this.glowWarm);
      tube.position.set(-11.0, 4.02, z);
      this.scene.add(tube);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowSpriteTexture('rgba(255,180,100,1)'), color: 0xffb066, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.36,
      }));
      glow.position.set(-11.0, 4.0, z);
      glow.scale.set(3.2, 1.2, 1);
      this.scene.add(glow);
    }

    // security cameras and red status lamps
    for (const [x, y, z, ry] of [[8.7, 4.6, 3.25, 0], [-8.7, 4.6, 3.25, 0], [35.1, 4.2, -4, -Math.PI/2], [-35.1, 4.2, 14, Math.PI/2]]) {
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), this.metalDark);
      cam.position.set(x, y, z);
      cam.rotation.y = ry;
      this.scene.add(cam);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.08, 8), this.glowRed);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(x + Math.sin(ry) * 0.23, y, z + Math.cos(ry) * 0.23);
      lens.rotation.y = ry;
      this.scene.add(lens);
    }

    // antenna array on the main roof
    for (const [x, h] of [[-6.0, 3.0], [5.2, 2.2]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, h, 6), this.metalDark);
      mast.position.set(x, 7.8 + h / 2, -7.7);
      this.scene.add(mast);
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8 - i * 0.2, 0.025, 0.025), this.metal);
        bar.position.set(x, 8.3 + i * 0.55, -7.7);
        bar.rotation.y = i * 0.7;
        this.scene.add(bar);
      }
    }
  }

  addStencil(text, sub, color, x, y, z, w, h, ry = 0, rx = 0, rz = 0, seed = 1) {
    const t = stencilTexture(text, sub, color, 512, 256, seed);
    const mat = new THREE.MeshStandardMaterial({
      map: t, transparent: true, roughness: 0.86, metalness: 0.05,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    this.scene.add(mesh);
    return mesh;
  }

  buildDecals() {
    this.addStencil('禁区', '授权人员除外', '#d54838', 9.08, 2.6, -1.2, 2.4, 1.2, Math.PI / 2, 0, 0, 2);
    this.addStencil('高压', '危险 // 请勿靠近', '#d9b04a', -9.08, 3.3, -4.4, 2.2, 1.1, -Math.PI / 2, 0, 0, 3);
    this.addStencil('07', '泵站货区', '#a8d8ce', -19, 1.35, 13.432, 2.1, 1.05, 0, 0, 0, 4);
    this.addStencil('禁止入内', '', '#d54838', 35.05, 2.6, 3.4, 2.8, 1.4, -Math.PI / 2, 0, 0, 5);
    this.addStencil('撤离', '前往 04 号闸门', '#69e6b2', 5.08, 2.4, -33.2, 1.7, 0.85, -Math.PI / 2, 0, 0, 6);
    this.addStencil('雨夜', '保持清醒', '#3bd3e6', -7.48, 3.2, 27.2, 1.9, 0.95, Math.PI / 2, 0, 0, 7);
  }


  /* ------------------------------------------------------------------ */
  /*  Campaign variants                                                  */
  /* ------------------------------------------------------------------ */

  buildVariantArchitecture() {
    const lv = this.level || {};
    // perimeter
    this.box(0, 5.5, 36.2, 72, 11, 2, this.darkConcrete, { tag: 'wall' });
    this.box(0, 5.5, -36.2, 72, 11, 2, this.darkConcrete, { tag: 'wall' });
    this.box(-36.2, 5.5, 0, 2, 11, 72, this.darkConcrete, { tag: 'wall' });
    this.box(36.2, 5.5, 0, 2, 11, 72, this.darkConcrete, { tag: 'wall' });

    // extraction tunnel
    this.box(-5.9, 4.0, -33.8, 1.6, 8, 5.2, this.concrete, { tag: 'wall' });
    this.box(5.9, 4.0, -33.8, 1.6, 8, 5.2, this.concrete, { tag: 'wall' });
    this.box(0, 8.0, -34.1, 13.4, 0.7, 6.2, this.metalDark, { tag: 'wall' });
    this.box(0, 0.15, -34.0, 10, 0.3, 5.6, this.metal, { collide: false });
    for (const x of [-3.5, 0, 3.5]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4.8), this.hazard);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.32, -34.0);
      this.scene.add(strip);
    }

    if (lv.key === 'yard') {
      // freight office and a loading gantry framing the south approach
      this.box(-30, 2.2, -25.5, 7.5, 4.4, 6.5, this.concrete, { tag: 'building' });
      this.box(-30, 4.6, -25.5, 8.1, 0.3, 7.1, this.metalDark, { collide: false });
      for (const z of [-27.8, -23.2]) {
        this.box(-30, 4.0, z, 7.8, 0.16, 0.18, this.metal, { collide: false });
      }
      // stacked containers on the east edge
      this.box(31, 1.32, -27, 6.2, 2.64, 2.75, this.containerMats[2], { tag: 'container' });
      this.box(31, 3.98, -27, 6.2, 2.64, 2.75, this.containerMats[1], { tag: 'container' });
      // light poles / gantry at the south entrance
      this.box(-6.4, 3.0, 24, 0.28, 6, 0.28, this.metalDark, { tag: 'wall' });
      this.box(6.4, 3.0, 24, 0.28, 6, 0.28, this.metalDark, { tag: 'wall' });
      this.box(0, 6.1, 24, 13.2, 0.35, 0.35, this.metalDark, { collide: false });
    }

    if (lv.key === 'substation') {
      for (const [x, z, w, h, d] of lv.transformers || []) {
        this.box(x, h / 2, z, w, h, d, this.metalDark, { tag: 'building' });
        // cooling fins
        for (let i = 0; i < 5; i++) {
          this.box(x - w / 2 - 0.35, 1.0 + i * 0.56, z, 0.22, 0.36, d * 0.85, this.metal, { collide: false });
          this.box(x + w / 2 + 0.35, 1.0 + i * 0.56, z, 0.22, 0.36, d * 0.85, this.metal, { collide: false });
        }
        // ceramic insulators
        for (const ox of [-1.9, 0, 1.9]) {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 7), this.metal);
          ins.position.set(x + ox, h + 0.55, z);
          this.scene.add(ins);
        }
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.05, 0.06), this.glowCyan);
        glow.position.set(x, h * 0.72, z + d / 2 + 0.04);
        this.scene.add(glow);
      }
      for (const [x, z] of lv.pylons || []) {
        const base = this.box(x, 0.45, z, 3.2, 0.9, 3.2, this.concrete, { tag: 'building' });
        for (const sx of [-1.1, 1.1]) {
          for (const sz of [-1.1, 1.1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 14, 0.22), this.metalDark);
            leg.position.set(x + sx, 7.45, z + sz);
            this.scene.add(leg);
          }
        }
        for (let i = 1; i <= 4; i++) {
          const y = 2.2 + i * 2.7;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 2.8), this.metalDark);
          bar.position.set(x, y, z);
          this.scene.add(bar);
        }
        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowSpriteTexture('rgba(255,55,70,1)'), color: 0xff3040, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        beacon.position.set(x, 15.2, z);
        beacon.scale.set(1.1, 1.1, 1);
        this.scene.add(beacon);
        this.cityLights.push({ sprite: beacon, phase: Math.random() * 5, speed: 0.8 });
      }
      // control shed
      this.box(29, 2.0, -25, 8, 4, 6, this.concrete, { tag: 'building' });
      this.box(29, 4.1, -25, 8.5, 0.3, 6.5, this.metalDark, { collide: false });
      // cable raceways
      for (const x of [-17, 17]) {
        this.box(x, 0.1, 0, 0.45, 0.16, 44, this.metalDark, { collide: false });
      }
    }

    if (lv.key === 'foundry') {
      // main furnace
      const furnaceBase = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 1.2, 32), this.metalDark);
      furnaceBase.position.set(0, 0.6, -4);
      furnaceBase.castShadow = true; furnaceBase.receiveShadow = true;
      this.scene.add(furnaceBase);
      const furnace = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.7, 6.8, 32), this.rust);
      furnace.position.set(0, 4.5, -4);
      furnace.castShadow = true; furnace.receiveShadow = true;
      this.scene.add(furnace);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.1, 3.2, 24), this.glowWarm);
      core.position.set(0, 3.2, -4);
      this.scene.add(core);
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.5, 12, 16), this.metalDark);
      chimney.position.set(0, 12.8, -7.2);
      chimney.castShadow = true;
      this.scene.add(chimney);
      for (const y of [8.2, 11.5]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.06, 5, 24), this.rust);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, y, -7.2);
        this.scene.add(ring);
      }
      this.addCollider(0, 0, -4, 10.4, 7.8, 10.4, 'building');
      // foundry canopy
      this.box(0, 9.8, -4, 36, 0.5, 25, this.metalDark, { collide: false, shadow: true });
      for (const x of [-16, 16]) {
        for (const z of [-14, 6]) {
          this.box(x, 4.7, z, 0.55, 9.4, 0.55, this.metalDark, { tag: 'wall' });
        }
      }
      // overhead crane rail
      this.box(0, 8.5, -4, 35, 0.3, 0.5, this.metalDark, { collide: false });
      this.box(0, 8.2, 2, 0.25, 0.6, 22, this.metalDark, { collide: false });
      // molten channels
      for (const [x, z, w, d] of [[-9, -4, 7, 0.55], [9, -4, 7, 0.55], [0, 5.5, 0.55, 9]]) {
        const molten = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.glowWarm);
        molten.rotation.x = -Math.PI / 2;
        molten.position.set(x, 0.025, z);
        this.scene.add(molten);
      }
      // side exhaust pipes
      for (const x of [-23, 23]) {
        for (let i = 0; i < 3; i++) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8, 8), this.rust);
          pipe.position.set(x + i * 0.3, 4, 9);
          pipe.castShadow = true;
          this.scene.add(pipe);
        }
      }
    }

    if (lv.key === 'docks') {
      // water to the east of the quay
      this.quayX = 20.5;
      this.box(20.5, 0.45, 0, 1.0, 0.9, 70, this.concrete, { tag: 'wall' });
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x031018, metalness: 0.9, roughness: 0.07, transparent: true, opacity: 0.9,
        envMapIntensity: 2.2, normalMap: this.rippleNormal.clone(), normalScale: new THREE.Vector2(0.25, 0.25),
      });
      waterMat.normalMap.needsUpdate = true;
      this.waterMat = waterMat;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(15, 70), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(28, 0.035, 0);
      water.receiveShadow = false;
      this.scene.add(water);
      // bollards along the quay
      for (let z = -28; z <= 28; z += 7) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 10), this.metalDark);
        b.position.set(19.35, 0.4, z);
        b.castShadow = true;
        this.scene.add(b);
        this.addCollider(19.35, 0, z, 0.55, 0.8, 0.55, 'prop');
      }
      // harbour cranes
      for (const [x, z] of [[24, -14], [24, 10]]) {
        for (const sx of [-1.2, 1.2]) {
          for (const sz of [-1.2, 1.2]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 17, 0.28), this.metalDark);
            leg.position.set(x + sx, 8.5, z + sz);
            this.scene.add(leg);
          }
        }
        const boom = new THREE.Mesh(new THREE.BoxGeometry(20, 0.55, 0.7), this.metalDark);
        boom.position.set(x - 8, 16.5, z);
        this.scene.add(boom);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.8, 2), this.glass || this.metal);
        cabin.position.set(x - 2, 15.4, z);
        this.scene.add(cabin);
        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowSpriteTexture('rgba(255,55,70,1)'), color: 0xff3040, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        beacon.position.set(x, 17.5, z);
        beacon.scale.set(0.9, 0.9, 1);
        this.scene.add(beacon);
      }
      // dock office
      this.box(-29, 2.3, -22, 9, 4.6, 7, this.concrete, { tag: 'building' });
      this.box(-29, 4.8, -22, 9.6, 0.3, 7.6, this.metalDark, { collide: false });
    }

    if (lv.key === 'tower') {
      // central communications tower
      this.box(0, 10.8, -3, 12, 21.6, 12, this.darkConcrete, { tag: 'building' });
      this.box(0, 22.2, -3, 13, 0.6, 13, this.metalDark, { collide: false });
      // ribs and service bands
      for (const y of [4, 9, 14, 19]) {
        this.box(0, y, 3.06, 12.3, 0.28, 0.3, this.metal, { collide: false });
      }
      for (const [x, z] of [[-5.8, 3], [5.8, 3], [-5.8, -9], [5.8, -9]]) {
        this.box(x, 12, z, 0.35, 24, 0.35, this.metalDark, { collide: false });
      }
      // antenna mast and dishes
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 12, 8), this.metalDark);
      mast.position.set(0, 28.5, -3);
      this.scene.add(mast);
      for (const [x, y] of [[0, 24.5], [0, 30.5], [0, 34.5]]) {
        const dish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.metal);
        dish.scale.y = 0.25;
        dish.position.set(x + 2.4, y, -3);
        dish.rotation.z = -0.5;
        this.scene.add(dish);
      }
      // parapets / cable anchors (center stays open for the extraction route)
      for (const [x, z, w, d] of [[-23, 3, 1.2, 20], [23, 3, 1.2, 20], [-10, -20, 8, 1.2], [10, -20, 8, 1.2]]) {
        this.box(x, 0.7, z, w, 1.4, d, this.concrete, { tag: 'cover' });
      }
      // generator blocks
      for (const [x, z] of [[-18, -12], [18, -12]]) {
        this.box(x, 1.2, z, 4.5, 2.4, 3.2, this.metalDark, { tag: 'building' });
        this.box(x, 2.55, z, 4.7, 0.25, 3.4, this.metal, { collide: false });
      }
      // tower identity panel and vertical warning strips
      const towerTex = this.makeTextSignTexture('06 中继塔', '通信重地 // 授权人员除外', '#ff4052', 900, 160);
      const towerMat = new THREE.MeshStandardMaterial({
        map: towerTex, emissive: 0xffffff, emissiveMap: towerTex, emissiveIntensity: 2.1,
        color: 0x040404, transparent: true, side: THREE.DoubleSide,
      });
      const towerSign = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.3), towerMat);
      towerSign.position.set(0, 7.0, 3.12);
      this.scene.add(towerSign);
      for (const x of [-5.9, 5.9]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.5, 0.06), this.glowRed);
        strip.position.set(x, 4.2, 3.1);
        this.scene.add(strip);
      }
    }
  }

  buildVariantProps() {
    const lv = this.level || {};
    const rng = mulberry32(2201 + (lv.id || 1) * 91);
    for (const [x, z, len, ry, mi] of lv.containers || []) {
      this.box(x, 1.32, z, len, 2.64, 2.75, this.containerMats[(mi || 0) % this.containerMats.length], { rotY: ry || 0, tag: 'container' });
    }
    for (const [x, z, w, h, d] of lv.barriers || []) {
      this.box(x, h / 2, z, w, h, d, this.concrete, { tag: 'cover' });
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.22), this.hazard);
      stripe.position.set(x, h * 0.78, z + d / 2 + 0.006);
      this.scene.add(stripe);
    }
    const crateMat = new THREE.MeshStandardMaterial({
      map: concreteTextures('#4b4940', 2).map, roughness: 0.9, metalness: 0.1, color: 0x8b846d,
    });
    for (const [x, z] of lv.crates || []) {
      const s = 0.9 + rng() * 0.45;
      this.box(x, s / 2, z, s, s, s, crateMat, { tag: 'cover' });
      if (rng() < 0.55) this.box(x + s * 0.1, s * 1.48, z - s * 0.08, s * 0.75, s * 0.75, s * 0.75, crateMat, { tag: 'cover' });
    }
    for (const [x, z, color] of lv.barrels || []) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 14), this.metalDark.clone());
      b.material.color.setHex(color);
      b.position.set(x, 0.475, z);
      b.castShadow = true; b.receiveShadow = true;
      this.scene.add(b);
      this.rayMeshes.push(b);
      this.addCollider(x, 0, z, 0.72, 0.95, 0.72, 'prop');
    }
  }

  buildVariantLighting() {
    const lv = this.level || {};
    const lampColor = lv.lampColor ?? 0xffb36b;
    const accentColor = lv.accentColor ?? 0xff4fa3;

    const gateLight = new THREE.PointLight(0x58ffb0, 30, 16, 2);
    gateLight.position.set(0, 5.6, -29);
    this.scene.add(gateLight);
    this.gateLight = gateLight;

    const positions = lv.lamps || [[-13, 17.5], [13, 17.5], [-13, -21.5], [13, -21.5]];
    positions.forEach(([x, z], idx) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6.6, 8), this.metalDark);
      pole.position.set(x, 3.3, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const headX = x + (x < 0 ? 1.72 : -1.72);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), this.metalDark);
      arm.position.set(x + (x < 0 ? 0.8 : -0.8), 6.45, z);
      this.scene.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.42), this.metal);
      head.position.set(headX, 6.34, z);
      head.castShadow = true;
      this.scene.add(head);
      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.28), this.glowWarm);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(headX, 6.23, z);
      this.scene.add(bulb);
      if (idx < 2) {
        const light = new THREE.PointLight(lampColor, 110, 25, 2);
        light.position.set(headX, 6.1, z);
        this.scene.add(light);
        this.lampLights.push({ light, base: 110, phase: Math.random() * 10, broken: false });
      }
      this.cones.push(addCone(this.scene, new THREE.Vector3(headX, 6.2, z), new THREE.Vector3(headX, 0, z), 4.8, lampColor, 0.055));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowSpriteTexture('rgba(255,180,100,1)'), color: lampColor, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6,
      }));
      glow.position.set(headX, 6.2, z);
      glow.scale.set(2.2, 2.2, 1);
      this.scene.add(glow);
    });

    const work = new THREE.PointLight(lampColor, 75, 20, 2);
    work.position.set(0, 5.0, 8);
    this.scene.add(work);
    this.lampLights.push({ light: work, base: 75, phase: 2.2, broken: false });
    this.cones.push(addCone(this.scene, new THREE.Vector3(0, 4.9, 8), new THREE.Vector3(0, 0, 8), 3.4, lampColor, 0.05));

    const accent = new THREE.PointLight(accentColor, 48, 20, 2);
    accent.position.set(-32, 6.5, 4);
    this.scene.add(accent);
    this.animLights.push({ light: accent, base: 48, phase: 1.2, speed: 0.6 });

    // moving searchlight cone for silhouette and atmosphere
    const beamSource = new THREE.Vector3(29, 12.6, 24);
    this.searchPivot = new THREE.Group();
    this.searchPivot.position.copy(beamSource);
    this.scene.add(this.searchPivot);
    const searchGeo = new THREE.CylinderGeometry(0.4, 7.5, 34, 32, 1, true);
    searchGeo.rotateX(Math.PI / 2);
    this.searchCone = new THREE.Mesh(searchGeo, coneLightMaterial(accentColor, 0.028));
    this.searchCone.position.z = 17;
    this.searchPivot.add(this.searchCone);
    this.cones.push({ mesh: this.searchCone, mat: this.searchCone.material });
    this.searchTarget = new THREE.Object3D();
    this.scene.add(this.searchTarget);
  }

  buildVariantSignage() {
    const lv = this.level || {};
    const accent = lv.neon?.color || '#ffb45c';
    // south checkpoint gantry with the level name
    this.box(-6.4, 3.0, 20.5, 0.3, 6, 0.3, this.metalDark, { tag: 'wall' });
    this.box(6.4, 3.0, 20.5, 0.3, 6, 0.3, this.metalDark, { tag: 'wall' });
    this.box(0, 6.15, 20.5, 13.2, 0.35, 0.35, this.metalDark, { collide: false });
    const tex = this.makeTextSignTexture(lv.name || '夜幕协议', `${lv.area || ''} // 撤离行动`, accent, 900, 160);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.7,
      color: 0x050505, transparent: true, side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.45), mat);
    sign.position.set(0, 5.45, 20.32);
    this.scene.add(sign);
    this.box(0, 5.45, 20.52, 8.8, 1.65, 0.16, this.metalDark, { collide: false });

    // neon marker on one wall
    const n = lv.neon;
    if (n) {
      const t = neonSignTexture(n.text, n.sub, n.color, 512, 1024);
      const nm = new THREE.MeshStandardMaterial({
        map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.8,
        color: 0x020202, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5.8), nm);
      mesh.position.set(n.x, 6.2, n.z);
      mesh.rotation.y = n.ry;
      this.scene.add(mesh);
      this.box(n.x + (n.ry > 0 ? -0.16 : 0.16), 6.2, n.z, 0.22, 6.1, 2.8, this.metalDark, { collide: false });
    }

    // hazard placards
    for (const [x, z, ry] of [[35.05, -5, -Math.PI / 2], [-35.05, 14, Math.PI / 2]]) {
      const p = this.makeTextSignTexture('警告', '高压危险 // 禁止靠近', '#d8b24f', 512, 110);
      const pm = new THREE.MeshStandardMaterial({ map: p, emissive: 0xffffff, emissiveMap: p, emissiveIntensity: 0.7, color: 0x333333 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.72), pm);
      mesh.position.set(x, 2.8, z);
      mesh.rotation.y = ry;
      this.scene.add(mesh);
    }
  }

  buildVariantDetails() {
    const lv = this.level || {};
    // wall conduits and fixtures common to the variant maps
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 28, 8), this.rust);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(side * 35.1, 4.1 + i * 0.32, 0);
        this.scene.add(pipe);
      }
      for (let z = -22; z <= 22; z += 11) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.5), this.metalDark);
        box.position.set(side * 34.85, 4.1, z);
        this.scene.add(box);
      }
    }
    // security cameras
    for (const [x, y, z, ry] of [[8.7, 5.0, 4, 0], [-8.7, 5.0, 4, 0], [35.1, 4.5, -10, -Math.PI / 2], [-35.1, 4.5, 12, Math.PI / 2]]) {
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), this.metalDark);
      cam.position.set(x, y, z);
      cam.rotation.y = ry;
      this.scene.add(cam);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.08, 8), this.glowRed);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(x, y, z);
      this.scene.add(lens);
    }
    // themed foreground cable / pipe silhouettes
    if (lv.key === 'docks') {
      for (let i = 0; i < 3; i++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 18, 8), this.rust);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(19.5, 1.4 + i * 0.28, 4 + i * 2);
        this.scene.add(pipe);
      }
    }
    if (lv.key === 'substation') {
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 16, 8), this.rust);
        p.rotation.z = Math.PI / 2;
        p.position.set(0, 0.8 + i * 0.22, 14);
        this.scene.add(p);
      }
    }
  }

  buildVariantDecals() {
    const lv = this.level || {};
    const palette = {
      yard: ['货区 02', '禁止吸烟', '#ffb45c'],
      substation: ['高压危险', '禁止靠近', '#54dfff'],
      foundry: ['高温', '熔炉作业', '#ff7a3d'],
      docks: ['深水', '注意坠落', '#69e6b2'],
      tower: ['通信重地', '禁止入内', '#ff4052'],
    }[lv.key] || ['危险', '授权人员除外', '#ffb45c'];
    this.addStencil(palette[0], palette[1], palette[2], -35.05, 3.0, 8, 3.0, 1.5, Math.PI / 2, 0, 0, (lv.id || 2) * 7);
    this.addStencil('撤离', '前往北门', '#69e6b2', 35.05, 2.8, -12, 2.2, 1.1, -Math.PI / 2, 0, 0, (lv.id || 2) * 7 + 1);
  }

  buildRelays() {
    const data = (this.level?.relays || [
      { id: 'A', label: '甲', x: -29, z: 7, face: Math.PI / 2, name: '西区继电器' },
      { id: 'B', label: '乙', x: 29, z: 7, face: -Math.PI / 2, name: '东区继电器' },
      { id: 'C', label: '丙', x: 0, z: -21.5, face: 0, name: '闸门继电器' },
    ]).map((r) => (r.pos ? r : { ...r, pos: new THREE.Vector3(r.x, 0, r.z) }));
    for (const d of data) {
      const r = new Relay(this, d.id, d.label, d.pos, d.face, d.name);
      this.relays.push(r);
    }
  }

  buildGate() {
    // frame pillars
    this.box(-5.8, 3.4, -30.2, 1.4, 6.8, 1.8, this.metalDark, { tag: 'wall' });
    this.box(5.8, 3.4, -30.2, 1.4, 6.8, 1.8, this.metalDark, { tag: 'wall' });
    this.box(0, 6.8, -30.2, 13, 1.0, 1.8, this.metalDark, { collide: false });
    this.box(0, 0.15, -30.2, 10.4, 0.3, 1.9, this.hazard, { collide: false });

    const mat = forceFieldMaterial();
    const field = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 6.1), mat);
    field.position.set(0, 3.35, -30.2);
    this.scene.add(field);
    const collider = this.addCollider(0, 0, -30.2, 9.8, 6.2, 0.7, 'gate');

    // red status lamps
    const redLights = [];
    for (const x of [-4.7, 4.7]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.12), this.glowRed);
      lamp.position.set(x, 5.9, -29.2);
      this.scene.add(lamp);
      redLights.push(lamp);
    }

    // extraction pad and beam
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0a1411, roughness: 0.5, metalness: 0.6, emissive: 0x0d3b27, emissiveIntensity: 0.5 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 0.18, 40), padMat);
    pad.position.set(0, 0.14, -33.7);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x58ffab, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.05, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.25, -33.7);
    this.scene.add(ring);

    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uOpacity; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(13.1,71.7)))*43758.5); }
        void main(){
          float scan = smoothstep(0.4,0.5,abs(fract(vUv.y*16.0 - uTime*0.18)-0.5));
          float edge = smoothstep(0.0,0.15,vUv.x)*smoothstep(0.0,0.15,1.0-vUv.x);
          float a = uOpacity * edge * (0.08 + scan*0.18);
          gl_FragColor = vec4(0.32,1.0,0.65, a);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 3.05, 19, 32, 1, true), beamMat);
    beam.position.set(0, 9.7, -33.7);
    this.scene.add(beam);

    this.gate = {
      mat, field, collider, redLights, ring, ringMat, beam, beamMat, padMat,
      isOpen: false, openAmount: 0, openedAt: 0,
      open: () => {
        if (this.gate.isOpen) return;
        this.gate.isOpen = true;
        this.gate.openedAt = this.time;
        const i = this.colliders.indexOf(collider);
        if (i >= 0) this.colliders.splice(i, 1);
        for (const l of redLights) l.material = this.glowGreen;
        this.gateLight.color.setHex(0x58ffb0);
        this.gateLight.intensity = 36;
        this.audio.gateOpen();
      },
    };
    // beacon
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(90,255,170,1)'), color: 0x58ffab, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.8,
    }));
    beacon.position.set(0, 7.7, -30.2);
    beacon.scale.set(2, 2, 1);
    this.scene.add(beacon);
    this.gate.beacon = beacon;
  }

  buildCity() {
    const rng = mulberry32(6611);
    const winTex = cityWindowsTexture(77);
    const cityMat = new THREE.MeshStandardMaterial({
      color: 0x0a1115, roughness: 0.85, metalness: 0.25,
      emissive: 0x4f6470, emissiveMap: winTex, emissiveIntensity: 0.22,
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 24) * Math.PI * 2 + rng() * 0.18;
      const r = 48 + rng() * 46;
      const w = 5 + rng() * 10;
      const d = 5 + rng() * 10;
      const h = 14 + rng() * 42;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = rng() * Math.PI;
      this.scene.add(m);
      if (rng() < 0.5) {
        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowSpriteTexture('rgba(255,55,55,1)'), color: 0xff3b3b, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        beacon.position.set(x, h + 0.6, z);
        beacon.scale.set(1.6, 1.6, 1);
        this.scene.add(beacon);
        this.cityLights.push({ sprite: beacon, phase: rng() * 6, speed: 0.5 + rng() });
      }
    }
    // faint ground haze glow beyond walls
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0xff8e4b, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    for (const [x, z, w, h, ry] of [[0, -60, 70, 22, 0], [-62, 0, 70, 18, Math.PI / 2], [64, 8, 80, 20, Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hazeMat);
      p.position.set(x, h / 2, z);
      p.rotation.y = ry;
      this.scene.add(p);
    }
  }

  captureEnvironment() {
    const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.5, 320, cubeRT);
    cubeCam.position.set(0, 2.4, 14);
    cubeCam.update(this.renderer, this.scene);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromCubemap(cubeRT.texture).texture;
    this.scene.environment = env;
    pmrem.dispose();
    cubeRT.dispose();
    for (const m of this.puddleMats) m.envMap = env;
    const mats = [this.asphalt, this.metal, this.metalDark, this.concrete, this.darkConcrete, this.rust, ...this.containerMats];
    for (const m of mats) { m.envMap = env; m.needsUpdate = true; }
  }

  setLightning(v) {
    this.sky.material.uniforms.uLightning.value = v;
    this.moon.intensity = (this.baseMoon ?? 1.4) + v * 5.2;
    this.hemi.intensity = (this.baseHemi ?? 0.8) + v * 1.8;
    this.scene.fog.color.set(this.fogColor || 0x0c1a21).lerp(new THREE.Color(0.62, 0.72, 0.8), v * 0.55);
  }

  activateExtraction() {
    this.extractionActive = true;
    this.gate.beamMat.uniforms.uOpacity.value = 0.55;
    this.gate.padMat.emissiveIntensity = 1.55;
    this.gate.beacon.material.opacity = 1;
  }

  update(dt) {
    this.time += dt;
    this.sky.material.uniforms.uTime.value = this.time;
    this.gate.mat.uniforms.uTime.value = this.time;
    if (!this.gate.isOpen) {
      this.gate.field.material.uniforms.uOpen.value = 0;
    } else {
      this.gate.openAmount = Math.min(1, this.gate.openAmount + dt * 0.55);
      this.gate.field.material.uniforms.uOpen.value = this.gate.openAmount;
      this.gate.field.material.opacity = 1 - this.gate.openAmount;
      this.gate.field.visible = this.gate.openAmount < 1;
      this.gate.ringMat.opacity = 0.28 + Math.sin(this.time * 3) * 0.08;
      this.gate.beamMat.uniforms.uTime.value = this.time;
    }

    for (const c of this.cones) c.mat.uniforms.uTime.value = this.time;
    for (const l of this.lampLights) {
      let flicker = 1;
      if (l.broken) {
        const n = Math.sin(this.time * 17 + l.phase) * Math.sin(this.time * 3.7 + l.phase * 2);
        flicker = n > 0.82 ? 0.25 : 0.92 + Math.sin(this.time * 41) * 0.08;
      }
      l.light.intensity = l.base * flicker;
    }
    for (const l of this.animLights) {
      l.light.intensity = l.base * (0.82 + Math.sin(this.time * l.speed + l.phase) * 0.12);
    }
    for (const c of this.cityLights) {
      c.sprite.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * c.speed + c.phase));
    }
    for (const m of this.puddleMats) {
      if (m.normalMap) {
        m.normalMap.offset.x += dt * 0.006;
        m.normalMap.offset.y += dt * 0.0035;
      }
    }

    // searchlight sweep
    const a = this.time * 0.14;
    this.searchTarget.position.set(Math.cos(a) * 22, 0, -3 + Math.sin(a) * 16);
    this.searchPivot.lookAt(this.searchTarget.position);
    this.searchCone.material.uniforms.uTime.value = this.time;

    for (const r of this.relays) r.update(dt, this.time);
    if (this.gate.isOpen) {
      this.gate.beam.rotation.y += dt * 0.1;
      this.gate.ring.rotation.z += dt * 0.3;
    }
    if (this.gate.beacon) {
      this.gate.beacon.material.opacity = this.gate.isOpen
        ? 0.6 + Math.sin(this.time * 4) * 0.25
        : 0.22;
      this.gate.beacon.material.color.setHex(this.gate.isOpen ? 0x58ffab : 0xff3040);
    }
  }
}

/* ------------------------------------------------------------------ */

class Relay {
  constructor(world, id, label, pos, face, name) {
    this.world = world;
    this.id = id;
    this.label = label;
    this.pos = pos.clone();
    this.name = name;
    this.face = face;
    this.active = false;
    this.progress = 0;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.rotation.y = face;
    const s = world.scene;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.28, 24), world.metalDark);
    base.position.y = 0.14;
    base.castShadow = true; base.receiveShadow = true;
    this.group.add(base);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.5), world.metal);
    plinth.position.set(0, 0.5, 0);
    plinth.castShadow = true;
    this.group.add(plinth);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.4, 0.85), world.metalDark);
    body.position.set(0, 1.25, 0);
    body.castShadow = true;
    this.group.add(body);

    this.screenTex = screenTexture(`继电器 ${label}`, '#72f5d1');
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshBasicMaterial({
      map: this.screenTex, toneMapped: false, transparent: true,
    }));
    this.screen.position.set(0, 1.55, 0.431);
    this.group.add(this.screen);

    const topGlow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.04), world.glowCyan);
    topGlow.position.set(0, 1.98, 0.42);
    this.group.add(topGlow);
    this.topGlow = topGlow;

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.032, 8, 48), new THREE.MeshBasicMaterial({
      color: 0x63f3ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.ring.position.set(0, 2.08, -0.3);
    this.group.add(this.ring);

    this.pylons = [];
    for (const x of [-0.88, 0.88]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.5, 8), world.metalDark);
      p.position.set(x, 1.55, -0.36);
      this.group.add(p);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), world.glowCyan);
      glow.position.set(x, 1.65, -0.28);
      this.group.add(glow);
      this.pylons.push(glow);
    }

    const poolTex = glowSpriteTexture('rgba(80,235,255,1)');
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({
      map: poolTex, color: 0x59eaff, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.03;
    this.pool.renderOrder = 5;
    this.group.add(this.pool);

    const markerTex = markerTexture(label, '#9bffe6');
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: markerTex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.9,
    }));
    this.marker.position.set(0, 3.3, 0);
    this.marker.scale.set(0.72, 0.72, 1);
    this.marker.renderOrder = 50;
    this.group.add(this.marker);

    s.add(this.group);
    world.addCollider(pos.x, 0, pos.z, 2.1, 1.8, 1.8, 'relay');
    this.greenScreen = screenTexture(`继电器 ${label} 在线`, '#7dffbe');
    this.interactPos = pos.clone().add(new THREE.Vector3(Math.sin(face) * 1.8, 0, Math.cos(face) * 1.8));
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.screen.material.map = this.greenScreen;
    this.screen.material.needsUpdate = true;
    this.topGlow.material = this.world.glowGreen;
    for (const p of this.pylons) p.material = this.world.glowGreen;
    this.pool.material.color.setHex(0x58ffab);
    this.pool.material.opacity = 0.4;
    this.ring.material.color.setHex(0x58ffab);
    this.marker.visible = false;
  }

  update(dt, t) {
    this.ring.rotation.z += dt * (this.active ? 0.35 : 1.1);
    const pulse = 0.8 + Math.sin(t * 2.4 + this.pos.x) * 0.2;
    this.ring.material.opacity = this.active ? 0.35 : pulse;
    if (!this.active) {
      this.topGlow.material.emissiveIntensity = 2.4 + Math.sin(t * 5 + this.pos.z) * 0.55;
      this.marker.position.y = 3.3 + Math.sin(t * 1.8 + this.pos.x) * 0.08;
      this.marker.material.opacity = 0.72 + Math.sin(t * 3) * 0.18;
      const cam = this.world.camera;
      const dist = cam ? cam.position.distanceTo(this.pos) : 99;
      this.marker.visible = dist > 6.5;
    }
  }
}
