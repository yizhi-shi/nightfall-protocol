import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { AudioSystem } from './audio.js';
import { World, circleCollides } from './world.js';
import { Effects } from './effects.js';
import { Enemy } from './enemy.js';
import { Hud } from './hud.js';
import { LEVELS } from './levels.js';

const CAMERA_BASE_FOV = 72;
const EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.42;
const SPAWN = new THREE.Vector3(0, 0, 32);
const _weaponFwd = new THREE.Vector3();

const DIFFICULTY_DATA = {
  easy: {
    key: 'easy', label: '简单',
    enemyHp: 0.74, enemyDamage: 0.6, enemyAccuracy: 0.72, enemySpeed: 0.92,
    armor: 75, reserve: 180, regen: 10, regenDelay: 5, holdTime: 1.9,
  },
  normal: {
    key: 'normal', label: '普通',
    enemyHp: 1.0, enemyDamage: 1.0, enemyAccuracy: 1.0, enemySpeed: 1.0,
    armor: 50, reserve: 150, regen: 7.5, regenDelay: 7.5, holdTime: 2.35,
  },
  hard: {
    key: 'hard', label: '困难',
    enemyHp: 1.32, enemyDamage: 1.35, enemyAccuracy: 1.24, enemySpeed: 1.06,
    armor: 25, reserve: 120, regen: 4, regenDelay: 10, holdTime: 2.9,
  },
};
const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uSpeed: { value: 0 },
    uVignette: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDamage;
    uniform float uFlash;
    uniform float uSpeed;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      // subtle lens distortion
      uv = 0.5 + centered * (1.0 - 0.018 * r2);

      // chromatic aberration toward the edges
      float ca = (0.00055 + uDamage * 0.0014) * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + centered * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - centered * ca).b;

      // filmic grade: cool shadows, warm highlights
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(-0.004, 0.008, 0.014);
      vec3 highTint = vec3(0.018, 0.007, -0.006);
      col += mix(shadowTint, highTint, smoothstep(0.15, 0.8, lum));
      col = mix(vec3(lum), col, 1.075);
      col = pow(max(col, 0.0), vec3(0.96, 0.98, 1.015));

      // bloom haze toward top of frame
      float haze = smoothstep(0.5, 1.0, vUv.y) * 0.008;
      col += vec3(0.18, 0.28, 0.32) * haze;

      // grain
      // subtle unsharp mask keeps the upscaled PBR detail crisp
      vec2 texel = 1.0 / uResolution;
      vec3 blur = (
        texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb +
        texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb
      ) * 0.25;
      col += (col - blur) * 0.18;

      float grain = hash(vUv * uResolution * 0.7 + uTime * 60.0) - 0.5;
      col += grain * (0.014 + uDamage * 0.01);

      // scanline / display texture
      col *= 1.0 - 0.018 * sin(vUv.y * uResolution.y * 1.3);

      // vignette
      float vig = smoothstep(0.86, 0.18, length(centered) * 1.35);
      col *= mix(0.55, 1.0, vig * uVignette);
      col = mix(col, vec3(0.33, 0.02, 0.025), uDamage * (1.0 - vig) * 0.55);
      col += uFlash * vec3(0.5, 0.62, 0.75);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/* ------------------------------------------------------------------ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    const params = new URLSearchParams(window.location.search);
    this.qualityMode = params.get('quality') || 'auto';
    this.lowQuality = this.qualityMode === 'low';
    this.testMode = params.get('test') === '1';
    this.levels = LEVELS;
    const levelParam = parseInt(params.get('level') || '1', 10);
    this.levelIndex = Number.isFinite(levelParam)
      ? Math.max(0, Math.min(LEVELS.length - 1, levelParam - 1))
      : 0;
    this.level = LEVELS[this.levelIndex];
    const diffParam = params.get('difficulty') || 'easy';
    this.difficultyKey = DIFFICULTY_DATA[diffParam] ? diffParam : 'easy';
    this.diff = DIFFICULTY_DATA[this.difficultyKey];
    this.audio = new AudioSystem();
    this.state = 'boot';
    this.missionTime = 0;
    this.menuTime = 0;
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.lastDamageTime = -99;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.relaysDone = 0;
    this.hold = 0;
    this.currentRelay = null;
    this.extractionTimer = 0;
    this.wavesSpawned = new Set();
    this.invulnerable = false;
    this.deathTimer = 0;
    this.menuEntered = false;
    this.lockGraceUntil = 0;
    this.suppressLockPause = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;

    this.keys = Object.create(null);
    this.mouseDown = false;
    this.adsHeld = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.sway = { x: 0, y: 0 };
    this.recoil = { x: 0, y: 0 };
    this.shake = 0;
    this.deathRoll = 0;
    this.weaponBlock = 0;

    this.initRenderer();
    this.initPlayer();
    this.initScene();
    this.initWeapon();
    this.initPost();
    this.initEnemies();
    this.initInput();
    this.initUI();
    this.resize();
    this.clock = new THREE.Clock();
    this.menuClock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    // static shadow map + a warm-up render keep the first playable frames smooth
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    try {
      const weaponWasVisible = this.weaponGroup.visible;
      this.weaponGroup.visible = true;
      this.renderer.compile(this.scene, this.camera);
      this.composer.render();
      this.weaponGroup.visible = weaponWasVisible;
    } catch (e) {
      // compilation is an optimization; never let it block startup
    }
    requestAnimationFrame(this.animate);
    requestAnimationFrame(() => this.enterMenu());
    window.__NF = this.makeDebugApi();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.pixelRatio = this.lowQuality ? (this.softwareRenderer ? 0.5 : 0.65) : this.qualityMode === 'high' ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 1.15);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.lowQuality ? 1.48 : 1.36;
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x040809, 1);
    // Software rasterizers can't sustain the full pipeline; start in the lean mode.
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      this.softwareRenderer = /swiftshader|llvmpipe|software|softpipe/i.test(String(name));
    } catch (e) {
      this.softwareRenderer = false;
    }
    if (this.softwareRenderer && this.qualityMode === 'auto') {
      this.qualityMode = 'low';
      this.lowQuality = true;
      this.pixelRatio = 0.5;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMappingExposure = 1.42;
    }
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA_BASE_FOV, 1, 0.045, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = new World(this.scene, this.renderer, this.audio, this.level);
    this.world.camera = this.camera;
    this.world.captureEnvironment();
    this.effects = new Effects(this.scene, this.camera, this.renderer, this.audio, this.lowQuality);
    this.hud = new Hud(this.world, this.player);
    this.hud.setLevel(this.level, this.levelIndex, this.levels.length);
    this.camera.position.set(10, 6.3, 18);
    this.camera.lookAt(-2, 2.2, -4);
  }

  initPlayer() {
    this.player = {
      position: new THREE.Vector3(this.level.spawn.x, 0, this.level.spawn.z),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      health: 100,
      armor: 50,
      maxHealth: 100,
      maxArmor: 100,
      eye: EYE_HEIGHT,
      bob: 0,
      bobPhase: 0,
      moving: 0,
      sprinting: false,
      crouch: 0,
      grounded: true,
      vy: 0,
      alive: true,
      fov: CAMERA_BASE_FOV,
    };
    this.footTimer = 0;
    this.stepSide = 0;
  }

  initWeapon() {
    this.weapon = {
      mag: 30,
      magSize: 30,
      reserve: 150,
      damage: 24,
      headMult: 3.1,
      rpm: 760,
      fireTimer: 0,
      reloading: false,
      reloadTime: 1.48,
      reloadT: 0,
      reloadProgress: 0,
      spread: 0.008,
      bloom: 0,
      recoil: 0,
      ads: 0,
      shots: 0,
    };
    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup);
    this.buildViewmodel();
  }

  buildViewmodel() {
    const g = this.weaponGroup;
    g.position.set(0.205, -0.175, -0.44);
    g.rotation.set(0.015, 0.02, 0);
    g.scale.setScalar(0.8);
    // a soft fill light keeps the procedural viewmodel readable against the night
    const fill = new THREE.PointLight(0xbfd5d1, 0.8, 2.4, 2);
    fill.position.set(0.18, 0.2, 0.25);
    this.camera.add(fill);
    this.viewmodelFill = fill;

    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x424b4c, metalness: 0.58, roughness: 0.42, envMapIntensity: 2.0,
    });
    const polymer = new THREE.MeshStandardMaterial({
      color: 0x242a29, metalness: 0.12, roughness: 0.68, envMapIntensity: 0.85,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x8b9696, metalness: 0.8, roughness: 0.28, envMapIntensity: 2.2,
    });
    const glove = new THREE.MeshStandardMaterial({
      color: 0x2a2e28, metalness: 0.05, roughness: 0.88,
    });
    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x1b2422, metalness: 0.05, roughness: 0.95,
    });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x7dffe2, toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffb25f, toneMapped: false });
    this.weaponParts = { gunMat, polymer, steel, cyan, amber };

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };

    // receiver + handguard
    add(new THREE.BoxGeometry(0.075, 0.09, 0.36), gunMat, 0, 0, 0.01);
    add(new THREE.BoxGeometry(0.062, 0.068, 0.22), polymer, 0, 0.002, -0.265);
    add(new THREE.BoxGeometry(0.078, 0.014, 0.33), steel, 0, 0.056, -0.06);
    // top rail teeth
    for (let i = 0; i < 8; i++) {
      add(new THREE.BoxGeometry(0.085, 0.012, 0.014), gunMat, 0, 0.066, -0.22 + i * 0.034);
    }
    // barrel / suppressor
    const barrel = add(new THREE.CylinderGeometry(0.016, 0.018, 0.25, 10), steel, 0, 0.005, -0.46, Math.PI / 2);
    const suppressor = add(new THREE.CylinderGeometry(0.031, 0.034, 0.13, 12), gunMat, 0, 0.005, -0.61, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      add(new THREE.TorusGeometry(0.033, 0.003, 4, 12), steel, 0, 0.005, -0.56 - i * 0.027, 0);
    }
    // magazine
    this.magMesh = add(new THREE.BoxGeometry(0.05, 0.17, 0.075), polymer, 0, -0.115, -0.06, 0.13);
    this.magBaseY = -0.115;
    this.magBaseRotX = 0.13;
    add(new THREE.BoxGeometry(0.052, 0.05, 0.08), gunMat, 0, -0.04, -0.06);
    // grip / trigger guard
    add(new THREE.BoxGeometry(0.048, 0.13, 0.065), polymer, 0, -0.09, 0.105, -0.25);
    add(new THREE.TorusGeometry(0.05, 0.007, 5, 12, Math.PI), steel, 0, -0.055, 0.02, 0, 0, Math.PI);
    // stock
    add(new THREE.BoxGeometry(0.054, 0.062, 0.2), polymer, 0, -0.005, 0.27);
    add(new THREE.BoxGeometry(0.062, 0.11, 0.035), polymer, 0, -0.02, 0.38);
    // sight
    add(new THREE.BoxGeometry(0.052, 0.035, 0.07), gunMat, 0, 0.087, -0.06);
    add(new THREE.BoxGeometry(0.006, 0.022, 0.006), gunMat, -0.02, 0.105, -0.06);
    add(new THREE.BoxGeometry(0.006, 0.022, 0.006), gunMat, 0.02, 0.105, -0.06);
    add(new THREE.PlaneGeometry(0.016, 0.014), cyan, 0, 0.104, -0.024);
    // accent strips
    add(new THREE.BoxGeometry(0.008, 0.012, 0.18), cyan, 0.042, -0.01, -0.26);
    add(new THREE.BoxGeometry(0.03, 0.01, 0.06), amber, 0.045, 0.025, 0.04);
    // charging handle
    add(new THREE.BoxGeometry(0.018, 0.018, 0.06), steel, -0.05, 0.012, 0.08);

    // hands / forearms
    const limb = (a, b, r, mat) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(r, r * 1.12, len, 8);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(m);
      return m;
    };
    limb(new THREE.Vector3(0.11, -0.27, 0.26), new THREE.Vector3(0.01, -0.1, 0.11), 0.045, sleeve);
    limb(new THREE.Vector3(-0.1, -0.3, 0.06), new THREE.Vector3(0, -0.11, -0.17), 0.042, sleeve);
    add(new THREE.BoxGeometry(0.07, 0.08, 0.09), glove, 0, -0.095, 0.1, -0.2);
    add(new THREE.BoxGeometry(0.075, 0.065, 0.09), glove, 0, -0.085, -0.19);
    // knuckle pads
    for (let i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.018, 0.015, 0.025), gunMat, -0.035 + i * 0.03, -0.06, -0.235);
    }

    // muzzle object and flash
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.005, -0.69);
    g.add(this.muzzle);
    this.viewFlash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.muzzleTex, color: 0xffdca8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    this.viewFlash.position.copy(this.muzzle.position);
    this.viewFlash.scale.set(0.18, 0.18, 1);
    this.viewFlash.renderOrder = 60;
    this.viewFlash.visible = false;
    g.add(this.viewFlash);
    this.flashLife = 0;

    // base transform values
    this.weaponBase = new THREE.Vector3(0.205, -0.175, -0.44);
    this.weaponAds = new THREE.Vector3(0, -0.062, -0.405);
    this.weaponSprint = new THREE.Vector3(0.26, -0.25, -0.34);
    this.weaponReload = new THREE.Vector3(0.22, -0.27, -0.4);
  }

  initPost() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.58, 0.72, 0.82);
    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.uniforms.uResolution.value.set(w, h);
    this.outputPass = new OutputPass();
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    if (!this.lowQuality) this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    if (!this.lowQuality) this.composer.addPass(this.fxaaPass);
    this.updateFxaaResolution(w, h);
  }

  updateFxaaResolution(w, h) {
    if (!this.fxaaPass) return;
    const pr = this.pixelRatio || 1;
    this.fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  initEnemies() {
    const source = this.level.enemies || [];
    const defs = source.map((d, i) => ({
      id: i === 6 ? '禁卫' : `哨兵-${String(i + 1).padStart(2, '0')}`,
      type: i === 6 ? 'elite' : 'grunt',
      pos: new THREE.Vector3(d.x, 0, d.z),
      patrol: (d.patrol || [[d.x, d.z + 3], [d.x + 3, d.z], [d.x, d.z - 3]]).map(([x, z]) => new THREE.Vector3(x, 0, z)),
    }));
    this.enemies = defs.map((d) => new Enemy(this.scene, this.world, this.effects, this.audio, {
      id: d.id,
      type: d.type,
      position: d.pos,
      patrol: d.patrol,
      onShoot: (enemy, muzzle, accuracy, damage) => this.handleEnemyShot(enemy, muzzle, accuracy, damage),
      onDeath: (enemy) => this.handleEnemyDeath(enemy),
    }));
    for (const e of this.enemies) e.playerRef = this.player;
    this.enemyDefs = defs;
  }

  initInput() {
    const keyBlock = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyC', 'ShiftLeft', 'ControlLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'KeyQ']);
    window.addEventListener('keydown', (e) => {
      if (this.state === 'playing' && keyBlock.has(e.code)) e.preventDefault();
      if (e.repeat) {
        if (e.code === 'KeyE') this.keys.KeyE = true;
        return;
      }
      this.keys[e.code] = true;
      if (this.state === 'menu') {
        const idx = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
        if (idx >= 0) {
          this.selectDifficulty(DIFFICULTY_ORDER[idx % 3]);
          return;
        }
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          const delta = e.code === 'BracketLeft' ? -1 : 1;
          const next = (this.levelIndex + delta + this.levels.length) % this.levels.length + 1;
          this.loadLevel(next);
          return;
        }
      }
      if (e.code === 'Enter') {
        const focused = document.activeElement;
        if (this.state === 'menu' && focused && focused.classList && (focused.classList.contains('level-btn') || focused.classList.contains('difficulty-btn'))) {
          return;
        }
        if (this.state === 'menu') { this.startGame(); return; }
        if (this.state === 'paused') { this.resumeGame(); return; }
        if (this.state === 'won') { this.advanceLevel(); return; }
        if (this.state === 'dead') { this.loadLevel(this.levelIndex + 1); return; }
      }
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pauseGame();
        else if (this.state === 'paused') this.resumeGame();
        return;
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyM') {
        const m = this.audio.toggleMute();
        this.hud.toast(m ? '音频已静音' : '音频已开启');
      }
      if (e.code === 'KeyC') {
        this.player.crouch = this.player.crouch > 0.2 ? 0 : 1;
      }
      if (e.code === 'Space' && this.player.grounded) {
        this.player.vy = 4.4;
        this.player.grounded = false;
        this.audio.footstep();
      }
      if (e.code === 'KeyE') this.audio.uiClick();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== this.canvas) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.adsHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.adsHeld = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || document.pointerLockElement !== this.canvas) return;
      const sens = 0.00205 * (this.weapon.ads > 0.55 ? 0.58 : 1);
      this.player.yaw -= e.movementX * sens;
      this.player.pitch -= e.movementY * sens;
      this.player.pitch = Math.max(-1.36, Math.min(1.36, this.player.pitch));
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && document.pointerLockElement !== this.canvas && performance.now() > this.lockGraceUntil) {
        this.pauseGame();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.hud.toast('鼠标指针锁定失败——点击画面以瞄准');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pauseGame();
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pauseGame();
    });
    window.addEventListener('resize', () => this.resize());
  }

  initUI() {
    const levelSelect = document.getElementById('level-select');
    if (levelSelect) {
      levelSelect.innerHTML = '';
      this.levels.forEach((lv, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'level-btn' + (i === this.levelIndex ? ' active' : '');
        b.dataset.level = String(i + 1);
        b.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span>${lv.short}</span>`;
        b.addEventListener('click', () => this.loadLevel(i + 1));
        levelSelect.appendChild(b);
      });
    }
    for (const b of document.querySelectorAll('.difficulty-btn')) {
      b.addEventListener('click', () => this.selectDifficulty(b.dataset.difficulty));
    }
    document.getElementById('start-btn').addEventListener('click', () => {
      this.audio.uiClick();
      this.startGame();
    });
    document.getElementById('resume-btn').addEventListener('click', () => {
      this.audio.uiClick();
      this.resumeGame();
    });
    document.getElementById('abort-btn').addEventListener('click', () => {
      this.audio.uiClick();
      window.location.reload();
    });
    document.getElementById('restart-btn').addEventListener('click', () => {
      this.audio.uiClick();
      this.loadLevel(this.levelIndex + 1);
    });
    document.getElementById('next-btn').addEventListener('click', () => {
      this.audio.uiClick();
      this.advanceLevel();
    });
    for (const b of document.querySelectorAll('button')) {
      b.addEventListener('mouseenter', () => this.audio.uiClick());
    }
    this.applyMenuLevelUI();
  }

  buildLevelUrl(levelNumber) {
    const url = new URL(window.location.href);
    url.searchParams.set('level', String(levelNumber));
    url.searchParams.set('difficulty', this.difficultyKey);
    return url;
  }

  loadLevel(levelNumber) {
    const n = Math.max(1, Math.min(this.levels.length, levelNumber));
    window.location.href = this.buildLevelUrl(n).toString();
  }

  advanceLevel() {
    if (this.levelIndex < this.levels.length - 1) this.loadLevel(this.levelIndex + 2);
    else this.loadLevel(1);
  }

  applyMenuLevelUI() {
    const lv = this.level;
    const idx = this.levelIndex + 1;
    const total = this.levels.length;
    document.title = `夜幕协议 — ${lv.name}`;
    const tag = document.getElementById('level-tag');
    if (tag) tag.textContent = `任务 ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${lv.name}`;
    const tagline = document.getElementById('level-tagline');
    if (tagline) tagline.textContent = lv.tagline;
    const brief = document.getElementById('level-brief');
    if (brief) brief.textContent = lv.brief;
    for (const b of document.querySelectorAll('.level-btn')) {
      b.classList.toggle('active', Number(b.dataset.level) === idx);
    }
    for (const b of document.querySelectorAll('.difficulty-btn')) {
      const on = b.dataset.difficulty === this.difficultyKey;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    this.hud.setLevel(lv, this.levelIndex, total);
    this.hud.setDifficulty(this.diff.label);
  }

  setupEndUI(win) {
    const next = document.getElementById('next-btn');
    const restart = document.getElementById('restart-btn');
    const last = this.levelIndex >= this.levels.length - 1;
    if (next) {
      next.hidden = !win;
      if (win) {
        const idx = next.querySelector('.cta-index');
        const label = next.querySelector('.cta-label');
        if (idx) idx.textContent = last ? '↩' : String(this.levelIndex + 2).padStart(2, '0');
        if (label) label.textContent = last ? '返回关卡选择' : '下一关';
      }
    }
    if (restart) {
      if (win) {
        restart.className = 'ghost-btn';
        restart.textContent = '重玩本关';
      } else {
        restart.className = 'cta';
        restart.innerHTML = '<span class="cta-index">↻</span><span class="cta-label">重新部署</span><span class="cta-arrow">↗</span>';
      }
    }
    const enterNote = document.getElementById('end-enter-note');
    if (enterNote) enterNote.textContent = win ? (last ? '按 ENTER 返回关卡选择' : '按 ENTER 进入下一关') : '按 ENTER 重新部署';
    if (win && last) {
      const st = document.getElementById('end-status');
      const title = document.getElementById('end-title');
      const copy = document.getElementById('end-copy');
      if (st) st.textContent = '战役完成';
      if (title) title.innerHTML = '夜幕<span>终章</span>';
      if (copy) copy.textContent = '六处行动区全部肃清。中继塔的信号重新亮起，撤离航线已经打开。雨还在下，但这一次，你可以离开了。';
    }
  }

  selectDifficulty(key) {
    if (!DIFFICULTY_DATA[key]) return;
    this.difficultyKey = key;
    this.diff = DIFFICULTY_DATA[key];
    for (const b of document.querySelectorAll('.difficulty-btn')) {
      const on = b.dataset.difficulty === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (this.hud) this.hud.setDifficulty(this.diff.label);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('difficulty', key);
      window.history.replaceState(null, '', url);
    } catch (e) { /* file:// history can be restricted */ }
  }

  applyDifficulty() {
    this.diff = DIFFICULTY_DATA[this.difficultyKey] || DIFFICULTY_DATA.easy;
    if (this.hud) this.hud.setDifficulty(this.diff.label);
    this.player.armor = this.diff.armor;
    this.weapon.mag = this.weapon.magSize;
    this.weapon.reserve = this.diff.reserve;
    this.weapon.reloading = false;
    for (const e of this.enemies) {
      const baseHp = e.elite ? 230 : 100;
      e.maxHealth = Math.round(baseHp * this.diff.enemyHp);
      e.health = e.maxHealth;
      e.damage = (e.elite ? 12 : 7) * this.diff.enemyDamage;
      e.accuracy = Math.min(0.85, Math.max(0.2, (e.elite ? 0.62 : 0.46) * this.diff.enemyAccuracy));
      e.speed = (e.elite ? 1.9 : 2.35) * this.diff.enemySpeed;
    }
  }

  enterMenu() {
    if (this.state !== 'boot') return;
    this.state = 'menu';
    this.hud.setState('menu');
    this.weaponGroup.visible = false;
    this.menuTime = 0;
    this.menuEntered = true;
    this.scheduleQualityChecks();
  }

  startGame() {
    if (this.state === 'playing') return;
    this.audio.init();
    this.audio.resume();
    this.applyDifficulty();
    this.state = 'playing';
    this.keys = Object.create(null);
    this.weaponGroup.visible = true;
    this.player.position.copy(this.world.spawn);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.alive = true;
    this.player.health = 100;
    this.player.armor = this.diff.armor;
    this.player.vy = 0;
    this.player.crouch = 0;
    this.player.fov = CAMERA_BASE_FOV;
    this.camera.fov = CAMERA_BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.camera.rotation.set(0, 0, 0);
    this.camera.position.set(this.world.spawn.x, EYE_HEIGHT, this.world.spawn.z);
    this.hud.setState('playing');
    this.hud.message(`${this.level.name}。难度：${this.diff.label}。鼠标左键或 F 开火，右键或 Q 开镜，R 装弹。先完成三处目标，再前往北门撤离。`, '通讯', 10, true);
    this.hud.toast('任务开始 // 07 号区');
    this.lockGraceUntil = performance.now() + 1200;
    this.requestLock();
    this.clock.getDelta();
    if (this.testMode) this.startTestLoop();
    this.scheduleQualityChecks();
  }

  startTestLoop() {
    if (this._testTimer) return;
    let last = performance.now();
    this._testTimer = setInterval(() => {
      if (this.state !== 'playing') { last = performance.now(); return; }
      const now = performance.now();
      let elapsed = Math.min(0.2, (now - last) / 1000);
      last = now;
      this._testAccum = (this._testAccum || 0) + elapsed;
      let steps = 0;
      while (this._testAccum >= 1 / 60 && steps < 8) {
        this.update(1 / 60);
        this._testAccum -= 1 / 60;
        steps++;
        if (this.state !== 'playing') break;
      }
    }, 4);
  }

  scheduleQualityChecks() {
    if (this.qualityMode !== 'auto') return;
    clearTimeout(this.qTimerA);
    clearTimeout(this.qTimerB);
    this.qTimerA = setTimeout(() => {
      if (this.fps < 45) this.applyPerformanceMode(1);
    }, 4500);
    this.qTimerB = setTimeout(() => {
      if (this.fps < 32) this.applyPerformanceMode(2);
    }, 9000);
  }

  applyPerformanceMode(stage = 2) {
    if (this.qualityMode === 'high') return;
    if ((this._perfStage || 0) >= stage) return;
    this._perfStage = stage;
    if (stage >= 1) {
      if (this.fxaaPass) this.fxaaPass.enabled = false;
      this.pixelRatio = Math.min(this.pixelRatio, 0.85);
    }
    if (stage >= 2) {
      if (this.bloomPass) this.bloomPass.enabled = false;
      this.pixelRatio = Math.min(this.pixelRatio, 0.7);
    }
    this.resize();
    if (this.state === 'playing') this.hud.toast('自适应画质 // 性能模式', 3);
  }

  requestLock() {
    if (!this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      // browser may reject without a direct gesture; the game still runs with click-to-lock
    }
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys = Object.create(null);
    this.mouseDown = false;
    this.adsHeld = false;
    this.hud.showPause(this);
    this.hud.setState('paused');
    this.hud.hidePrompt();
    if (document.pointerLockElement) this.suppressLockPause = true;
    if (document.exitPointerLock) document.exitPointerLock();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.setState('playing');
    this.lockGraceUntil = performance.now() + 900;
    this.requestLock();
    this.clock.getDelta();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1);
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio || 1);
      this.composer.setSize(w, h);
      this.gradePass.uniforms.uResolution.value.set(w, h);
      if (this.fxaaPass && this.fxaaPass.enabled) this.updateFxaaResolution(w, h);
      this.bloomPass.setSize(w, h);
    }
  }

  /* -------------------------------------------------------------- */
  /*  Player                                                        */
  /* -------------------------------------------------------------- */

  eyePosition(out = new THREE.Vector3()) {
    const craw = this.player.crouch * 0.52;
    return out.set(this.player.position.x, this.player.position.y + EYE_HEIGHT - craw + this.player.bob, this.player.position.z);
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    const k = this.keys;
    // Keyboard turn fallback: arrows rotate the full 360° view as well as pitch.
    const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0);
    const pitchTurn = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
    if (turn) p.yaw += turn * 1.65 * dt;
    if (pitchTurn) {
      p.pitch = Math.max(-1.36, Math.min(1.36, p.pitch + pitchTurn * 1.15 * dt));
    }
    const adsing = this.weapon.ads > 0.55;
    const forward = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    let mx = 0, mz = 0;
    if (k.KeyW) { mx += forward.x; mz += forward.z; }
    if (k.KeyS) { mx -= forward.x; mz -= forward.z; }
    if (k.KeyD) { mx += right.x; mz += right.z; }
    if (k.KeyA) { mx -= right.x; mz -= right.z; }
    const moving = Math.hypot(mx, mz);
    if (moving > 0) { mx /= moving; mz /= moving; }

    const sprinting = !!k.ShiftLeft && moving > 0 && !adsing && p.crouch < 0.2;
    p.sprinting = sprinting;
    let speed = 4.9;
    if (sprinting) speed = 7.3;
    if (adsing) speed = 3.1;
    if (p.crouch > 0.2) speed = 2.65;
    const accel = p.grounded ? 11 : 4.2;
    const desiredX = mx * speed;
    const desiredZ = mz * speed;
    p.velocity.x += (desiredX - p.velocity.x) * Math.min(1, accel * dt);
    p.velocity.z += (desiredZ - p.velocity.z) * Math.min(1, accel * dt);

    const r = PLAYER_RADIUS;
    const nx = p.position.x + p.velocity.x * dt;
    if (!circleCollides(nx, p.position.z, r, this.world.colliders) && !this.enemyAt(nx, p.position.z, r)) p.position.x = nx;
    else p.velocity.x *= 0.15;
    const nz = p.position.z + p.velocity.z * dt;
    if (!circleCollides(p.position.x, nz, r, this.world.colliders) && !this.enemyAt(p.position.x, nz, r)) p.position.z = nz;
    else p.velocity.z *= 0.15;
    this.resolvePlayerEnemyOverlap();
    p.position.x = Math.max(-34.2, Math.min(34.2, p.position.x));
    p.position.z = Math.max(-35.0, Math.min(34.2, p.position.z));

    if (!p.grounded) {
      p.vy -= 12.2 * dt;
      p.position.y += p.vy * dt;
      if (p.position.y <= 0) { p.position.y = 0; p.vy = 0; p.grounded = true; }
    }

    const realSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    p.moving = Math.min(1, realSpeed / 5.4);
    p.bobPhase += dt * (5.2 + realSpeed * 1.25);
    const bobAmt = (p.grounded ? 1 : 0.25) * p.moving * (sprinting ? 0.028 : 0.019);
    p.bob = Math.sin(p.bobPhase * 2) * bobAmt;
    this.strafeRoll = THREE.MathUtils.damp(this.strafeRoll || 0, ((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)) * 0.012, 7, dt);

    // crouch is a toggle, handled on keydown
    const targetFov = adsing ? 55 : sprinting ? 76 : CAMERA_BASE_FOV;
    p.fov = THREE.MathUtils.damp(p.fov, targetFov, 9, dt);
    if (Math.abs(this.camera.fov - p.fov) > 0.02) {
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
    }

    this.recoil.x = THREE.MathUtils.damp(this.recoil.x, 0, 11, dt);
    this.recoil.y = THREE.MathUtils.damp(this.recoil.y, 0, 11, dt);
    this.shake = Math.max(0, this.shake - dt * 2.0);

    const shake = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * shake * 0.06;
    const sy = (Math.random() - 0.5) * shake * 0.06;
    this.camera.position.set(p.position.x + sx, p.position.y + EYE_HEIGHT - p.crouch * 0.52 + p.bob, p.position.z + sy);
    this.camera.rotation.set(
      p.pitch + this.recoil.x + sx * 0.07,
      p.yaw + this.recoil.y + sy * 0.07,
      this.strafeRoll + (this.landDip || 0) + sx * 0.02,
    );

    // footsteps
    if (realSpeed > 0.8 && p.grounded) {
      this.footTimer -= dt;
      if (this.footTimer <= 0) {
        this.footTimer = sprinting ? 0.29 : p.crouch > 0.2 ? 0.62 : 0.42;
        this.audio.footstep();
        this.landDip = (this.landDip || 0) * 0.9 + (Math.random() - 0.5) * 0.002;
        this.stepSide ^= 1;
      }
    } else {
      this.footTimer = Math.max(0, this.footTimer - dt);
    }

    // health regeneration
    if (this.missionTime - this.lastDamageTime > this.diff.regenDelay && p.health < 100) {
      p.health = Math.min(100, p.health + this.diff.regen * dt);
    }
    if (p.health < 30 && this.missionTime - (this.lastHeart || 0) > 1.4) {
      this.lastHeart = this.missionTime;
      this.audio.heartbeatSound(1 - p.health / 30);
    }
  }

  updateDeathCamera(dt) {
    this.deathTimer += dt;
    this.deathRoll += dt * 0.55;
    const p = this.player;
    const fall = Math.min(1, this.deathTimer * 1.35);
    this.camera.position.set(
      p.position.x,
      Math.max(0.34, EYE_HEIGHT - fall * 1.25),
      p.position.z,
    );
    this.camera.rotation.set(p.pitch - fall * 0.28, p.yaw, p.yaw * 0.0 + this.deathRoll * fall * 0.55);
    if (this.deathTimer > 2.1 && this.state === 'playing') {
      this.state = 'dead';
      this.hud.showEnd(false, this);
      this.setupEndUI(false);
      this.audio.death();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  damagePlayer(amount, source) {
    if (!this.player.alive || this.invulnerable) return;
    const p = this.player;
    const armorPart = Math.min(p.armor, amount * 0.68);
    p.armor -= armorPart;
    p.health -= amount - armorPart;
    this.lastDamageTime = this.missionTime;
    this.shake = Math.min(1.4, this.shake + 0.42 + amount * 0.014);
    this.hud.damage(amount);
    if (source && source.group) {
      const dx = source.group.position.x - p.position.x;
      const dz = source.group.position.z - p.position.z;
      this.hud.damageDirection(Math.atan2(dx, -dz) + p.yaw);
    }
    this.audio.hurt();
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      this.deathTimer = 0;
      this.deathRoll = 0;
      this.hud.message('信号中断。干员阵亡。', '医疗', 8, true);
      this.mouseDown = false;
    } else if (p.health < 30 && !this.lowHealthNotified) {
      this.lowHealthNotified = true;
      this.hud.message('生命体征危急。脱离交火，寻找掩体。', '医疗', 5);
    }
  }

  enemyAt(x, z, radius = PLAYER_RADIUS, ignore = null) {
    for (const e of this.enemies) {
      if (e === ignore || !e.active || !e.alive) continue;
      const dx = x - e.group.position.x;
      const dz = z - e.group.position.z;
      const min = radius + e.radius;
      if (dx * dx + dz * dz < min * min) return e;
    }
    return null;
  }

  resolvePlayerEnemyOverlap() {
    const p = this.player;
    if (!p.alive) return;
    for (const e of this.enemies) {
      if (!e.active || !e.alive) continue;
      let dx = p.position.x - e.group.position.x;
      let dz = p.position.z - e.group.position.z;
      let d2 = dx * dx + dz * dz;
      const min = PLAYER_RADIUS + e.radius + 0.015;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 0.0001) { dx = 1; dz = 0; d = 1; }
      const ux = dx / d, uz = dz / d;
      const px = e.group.position.x + ux * min;
      const pz = e.group.position.z + uz * min;
      if (!circleCollides(px, pz, PLAYER_RADIUS, this.world.colliders)) {
        p.position.x = px;
        p.position.z = pz;
        this.camera.position.x = px;
        this.camera.position.z = pz;
      } else {
        const ex = e.group.position.x - ux * (min - d + 0.02);
        const ez = e.group.position.z - uz * (min - d + 0.02);
        if (!circleCollides(ex, ez, e.radius, this.world.colliders)) {
          e.group.position.x = ex;
          e.group.position.z = ez;
        }
      }
    }
  }

  /* -------------------------------------------------------------- */
  /*  Weapon                                                        */
  /* -------------------------------------------------------------- */

  startReload() {
    const w = this.weapon;
    if (w.reloading || w.mag >= w.magSize || w.reserve <= 0 || !this.player.alive) return;
    w.reloading = true;
    w.reloadT = 0;
    w.reloadProgress = 0;
    this.audio.reloadStart();
  }

  finishReload() {
    const w = this.weapon;
    const need = Math.min(w.magSize - w.mag, w.reserve);
    w.mag += need;
    w.reserve -= need;
    w.reloading = false;
    w.reloadProgress = 0;
    this.audio.reloadEnd();
  }

  updateWeapon(dt) {
    const w = this.weapon;
    if (w.reloading) {
      w.reloadT += dt;
      w.reloadProgress = Math.min(1, w.reloadT / w.reloadTime);
      if (w.reloadT >= w.reloadTime) this.finishReload();
    }
    w.fireTimer -= dt;
    const adsing = (this.adsHeld || !!this.keys.KeyQ) && !w.reloading && this.player.alive && !this.player.sprinting;
    w.ads = THREE.MathUtils.damp(w.ads, adsing ? 1 : 0, 11, dt);
    document.body.classList.toggle('ads', w.ads > 0.55);

    w.bloom = THREE.MathUtils.damp(w.bloom, 0, 5.5, dt);
    w.recoil = THREE.MathUtils.damp(w.recoil, 0, 13, dt);
    const baseSpread = 0.0055 + (w.ads > 0.5 ? 0.001 : 0.005) + (this.player.moving * 0.006) + (this.player.sprinting ? 0.004 : 0);
    w.spread = THREE.MathUtils.damp(w.spread, baseSpread + w.bloom, 8, dt);

    // weapon transform
    const sprint = this.player.sprinting ? 1 : 0;
    const reloadPose = w.reloading ? Math.sin(Math.min(1, w.reloadT / 0.28) * Math.PI / 2) : 0;
    const target = new THREE.Vector3();
    if (w.ads > 0.01) target.lerpVectors(this.weaponBase, this.weaponAds, w.ads);
    else target.copy(this.weaponBase);
    target.lerp(this.weaponSprint, sprint * 0.85);
    target.lerp(this.weaponReload, reloadPose * 0.9);

    this.mouseDX = THREE.MathUtils.damp(this.mouseDX, 0, 12, dt);
    this.mouseDY = THREE.MathUtils.damp(this.mouseDY, 0, 12, dt);
    const swayX = Math.max(-0.018, Math.min(0.018, this.mouseDX * 0.0008));
    const swayY = Math.max(-0.014, Math.min(0.014, this.mouseDY * 0.0007));
    const bobX = Math.sin(this.player.bobPhase) * 0.005 * this.player.moving;
    const bobY = Math.cos(this.player.bobPhase * 2) * 0.004 * this.player.moving;
    // pull the gun down when the muzzle would intersect a wall or a nearby enemy
    const fwd = this.camera.getWorldDirection(_weaponFwd);
    let blocked = !!circleCollides(
      this.player.position.x + fwd.x * 0.78,
      this.player.position.z + fwd.z * 0.78,
      0.2, this.world.colliders,
    );
    if (!blocked) {
      for (const e of this.enemies) {
        if (!e.active || !e.alive) continue;
        const dx = e.group.position.x - this.player.position.x;
        const dz = e.group.position.z - this.player.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.25 && (dx * fwd.x + dz * fwd.z) / Math.max(0.001, Math.sqrt(d2)) > 0.25) {
          blocked = true;
          break;
        }
      }
    }
    this.weaponBlock = THREE.MathUtils.damp(this.weaponBlock, blocked ? 1 : 0, 10, dt);
    target.x += swayX + bobX;
    target.y += swayY + bobY - Math.abs(this.recoil.x) * 0.12 - this.weaponBlock * 0.2;
    target.z += w.recoil * 0.045 + this.weaponBlock * 0.18;

    this.weaponGroup.position.lerp(target, Math.min(1, dt * 13));
    const ts = sprint * 0.75 + reloadPose * 0.4;
    this.weaponGroup.rotation.x = THREE.MathUtils.damp(this.weaponGroup.rotation.x, sprint * 0.17 + reloadPose * 0.1 + w.recoil * 0.12, 10, dt);
    this.weaponGroup.rotation.y = THREE.MathUtils.damp(this.weaponGroup.rotation.y, -swayX * 2 - sprint * 0.24 + 0.02, 10, dt);
    this.weaponGroup.rotation.z = THREE.MathUtils.damp(this.weaponGroup.rotation.z, -swayX * 1.4 - ts * 0.55, 10, dt);

    // magazine drop / reinsert during reload
    if (this.magMesh) {
      let magDrop = 0;
      if (w.reloading) {
        const rt = Math.min(1, w.reloadT / w.reloadTime);
        if (rt < 0.22) magDrop = rt / 0.22;
        else if (rt < 0.6) magDrop = 1;
        else if (rt < 0.84) magDrop = 1 - (rt - 0.6) / 0.24;
      }
      this.magMesh.position.y = THREE.MathUtils.damp(this.magMesh.position.y, this.magBaseY - magDrop * 0.2, 16, dt);
      this.magMesh.rotation.x = THREE.MathUtils.damp(this.magMesh.rotation.x, this.magBaseRotX + magDrop * 0.32, 14, dt);
    }

    // view muzzle flash decay
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const a = Math.max(0, this.flashLife / 0.075);
      this.viewFlash.material.opacity = a;
      this.viewFlash.visible = a > 0.01;
      this.viewFlash.scale.setScalar(0.16 + (1 - a) * 0.12);

    }

    if (!this.player.alive) return;

    const firing = this.mouseDown || !!this.keys.KeyF;
    if (firing && !w.reloading) {
      if (w.mag <= 0) {
        if (w.reserve > 0) this.startReload();
        else if (w.fireTimer <= 0) {
          this.audio.empty();
          w.fireTimer = 0.25;
        }
      } else if (w.fireTimer <= 0) {
        this.fireWeapon();
        w.fireTimer = 60 / w.rpm;
      }
    }
  }

  fireWeapon() {
    const w = this.weapon;
    if (w.mag <= 0 || w.reloading || !this.player.alive) return;
    w.mag--;
    this.shots++;
    this.audio.gunshot();
    this.shake = Math.min(1, this.shake + 0.055);
    w.recoil = Math.min(1.4, w.recoil + 0.34);
    w.bloom = Math.min(0.022, w.bloom + 0.0032);
    this.recoil.x += 0.0046 + Math.random() * 0.0034;
    this.recoil.y += (Math.random() - 0.5) * 0.0045;
    this.flashLife = 0.075;
    this.viewFlash.visible = true;
    this.viewFlash.material.opacity = 1;
    this.viewFlash.material.rotation = Math.random() * Math.PI * 2;
    this.viewFlash.scale.setScalar(0.18 + Math.random() * 0.08);

    this.camera.updateMatrixWorld(true);
    const origin = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    this.effects.ejectShell(origin, right, up, dir.clone());
    const spread = w.spread;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

    this.raycaster.set(origin, dir);
    const walls = this.raycaster.intersectObjects(this.world.rayMeshes, false);
    let wallDist = 120;
    let wallHit = null;
    if (walls.length) {
      wallDist = walls[0].distance;
      wallHit = walls[0];
    }
    let best = null;
    for (const e of this.enemies) {
      if (!e.active || !e.alive) continue;
      const h = e.hitTest(origin, dir, Math.min(wallDist, 90));
      if (h && (!best || h.dist < best.dist)) best = { ...h, enemy: e };
    }

    let end;
    if (best) {
      const head = best.headshot;
      const dmg = w.damage * (head ? w.headMult : 1);
      const killed = best.enemy.takeDamage(dmg, head, best.point, dir);
      this.hits++;
      this.audio.hitmarker(head);
      this.hud.hitmarker(head);
      best.enemy.alert(this.player.position);
      this.effects.enemyHit(best.point, head ? 0xffe08a : 0xff9d55);
      end = best.point;
      if (killed) {
        // kill bookkeeping is in onDeath
      }
      if (head) this.hud.toast('爆头', 0.55);
    } else if (wallHit) {
      const normal = wallHit.face
        ? wallHit.face.normal.clone().transformDirection(wallHit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0);
      this.effects.impact(wallHit.point, normal, 0xffb35c, 9);
      this.effects.addDecal(wallHit.point, normal);
      this.audio.impact((Math.random() - 0.5) * 0.4);
      end = wallHit.point;
    } else {
      end = origin.clone().addScaledVector(dir, 80);
    }

    this.weaponGroup.updateMatrixWorld(true);
    const muzzleWorld = this.muzzle.getWorldPosition(new THREE.Vector3());
    this.effects.addTracer(muzzleWorld, end, 0xffd08a, 0.018, 0.08);
    this.effects.muzzleFlash(muzzleWorld, 0xffd28a);

    // gunfire draws attention
    for (const e of this.enemies) {
      if (!e.active || !e.alive) continue;
      if (e.group.position.distanceTo(this.player.position) < 36) e.alert(this.player.position);
    }
  }

  handleEnemyShot(enemy, muzzle, accuracy, damage) {
    if (!this.player.alive) return;
    const eye = this.eyePosition(new THREE.Vector3());
    const dist = muzzle.distanceTo(eye);
    const chance = accuracy * Math.max(0.52, 1 - dist / 44) * (this.player.moving > 0.6 ? 0.86 : 1) * (this.player.crouch > 0.2 ? 0.9 : 1);
    const hit = Math.random() < chance;
    const target = eye.clone();
    if (!hit) {
      target.x += (Math.random() - 0.5) * 1.5;
      target.y += (Math.random() - 0.5) * 0.8;
      target.z += (Math.random() - 0.5) * 1.5;
    }
    this.effects.addTracer(muzzle, target, 0xff5b48, 0.011, 0.09);
    if (hit) {
      this.damagePlayer(damage, enemy);
      this.effects.enemyHit(eye, 0xff5b48);
    } else {
      this.shake = Math.min(1, this.shake + 0.025);
    }
  }

  handleEnemyDeath(enemy) {
    this.kills++;
    this.weapon.reserve = Math.min(320, this.weapon.reserve + (enemy.elite ? 60 : 20));
    this.player.armor = Math.min(this.player.maxArmor, this.player.armor + 7);
    this.hud.kill(enemy.id, !!enemy.lastHitHeadshot);
    this.hud.toast(enemy.elite ? '禁卫已击倒' : '哨兵已清除', 1.4);
    this.hud.message(enemy.elite ? '禁卫已倒下。战场归你了——继续前进。' : '哨兵已清除。保持间距。', '通讯', 3.5);
    if (this.aliveEnemies() === 0 && this.relaysDone < 3) {
      this.hud.message('暂时安全。去启动下一座继电器。', '通讯', 5);
    }
  }

  aliveEnemies() {
    let n = 0;
    for (const e of this.enemies) if (e.active && e.alive) n++;
    return n;
  }

  /* -------------------------------------------------------------- */
  /*  Objectives and waves                                          */
  /* -------------------------------------------------------------- */

  updateObjectives(dt) {
    const p = this.player;
    if (!p.alive) { this.hud.hidePrompt(); return; }

    // relay interaction
    let relay = null;
    let bestD = 3.15;
    for (const r of this.world.relays) {
      if (r.active) continue;
      const d = Math.hypot(r.pos.x - p.position.x, r.pos.z - p.position.z);
      if (d < bestD) { bestD = d; relay = r; }
    }

    if (relay) {
      if (this.currentRelay !== relay) this.hold = 0;
      this.currentRelay = relay;
      const held = !!this.keys.KeyE;
      if (held && !this.holdAudio) {
        this.holdAudio = true;
        this.audio.relayStart();
      }
      if (held) this.hold = Math.min(1, this.hold + dt / this.diff.holdTime);
      else this.hold = Math.max(0, this.hold - dt * 1.5);
      if (this.hold >= 1) {
        this.completeRelay(relay);
        this.hold = 0;
        this.holdAudio = false;
        this.hud.hidePrompt();
      } else {
        this.hud.setPrompt(
          `按住 [E] —— 覆盖${relay.name}`,
          `正在破解硬锁 // 剩余 ${(this.diff.holdTime * (1 - this.hold)).toFixed(1)} 秒`,
          this.hold,
        );
      }
    } else {
      this.currentRelay = null;
      this.hold = Math.max(0, this.hold - dt * 2.5);
      this.holdAudio = false;
      this.hud.hidePrompt();
    }

    // extraction
    if (this.world.gate.isOpen && p.alive) {
      const d = Math.hypot(p.position.x - 0, p.position.z + 33.7);
      if (d < 2.9) {
        this.extractionTimer += dt;
        this.hud.setPrompt('正在撤离', '留在撤离平台 // 不要离开', Math.min(1, this.extractionTimer / 1.15));
        if (this.extractionTimer >= 1.15) this.winGame();
      } else {
        this.extractionTimer = Math.max(0, this.extractionTimer - dt * 2);
      }
    }

    // waves
    if (!this.wavesSpawned.has('initial') && (p.position.z < 19.2 || this.missionTime > 14)) {
      this.spawnWave('initial', [0, 1], this.level.messages.initial);
    }
    if (this.wavesSpawned.has('initial') && this.wavesSpawned.has('relayA') === false && this.relayA) {
      // handled in completeRelay
    }
  }

  completeRelay(relay) {
    if (relay.active) return;
    relay.activate();
    this.relaysDone = this.world.relays.filter((r) => r.active).length;
    this.hud.objectiveDone(relay.id);
    this.audio.relayComplete();
    this.effects.explosion(new THREE.Vector3(relay.pos.x, 1.6, relay.pos.z), 0x5affb5, 0.7);
    this.hud.message(`${relay.name}已上线。闸门锁定率 ${Math.round((this.relaysDone / 3) * 100)}%。`, '通讯', 5);
    this.hud.toast(`${relay.name}在线 // ${this.relaysDone}/3`, 2.2);

    if (relay.id === 'A') this.spawnWave('relayA', [2, 3], this.level.messages.waveA);
    if (relay.id === 'B') this.spawnWave('relayB', [4, 5], this.level.messages.waveB);
    if (this.relaysDone >= 3) {
      this.world.gate.open();
      this.world.activateExtraction();
      this.hud.extractionOpen();
      this.hud.toast('撤离闸门已开启', 3);
      this.hud.message('三座继电器全部在线。闸门已开——敌方精锐正在接近。立刻前往撤离平台。', '通讯', 8, true);
      this.spawnWave('final', [6, 7], this.level.messages.final);
    }
  }

  spawnWave(name, indices, message) {
    if (this.wavesSpawned.has(name)) return;
    this.wavesSpawned.add(name);
    const p = this.player.position;
    for (const i of indices) {
      const e = this.enemies[i];
      if (!e || e.active) continue;
      const d = this.enemyDefs[i];
      e.spawn(d.pos, d.patrol);
      if (name !== 'initial') {
        e.alert(p);
      }
      this.effects.explosion(new THREE.Vector3(d.pos.x, 0.8, d.pos.z), 0xff3b2e, 0.28);
      this.audio.radio();
    }
    this.hud.message(message, '通讯', 5.5);
    this.hud.toast(name === 'final' ? '最终波次 // 撤离点争夺' : '敌军来袭', 1.8);
  }

  winGame() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    this.hud.showEnd(true, this);
    this.setupEndUI(true);
    this.audio.victory();
    this.mouseDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /* -------------------------------------------------------------- */
  /*  Loop                                                          */
  /* -------------------------------------------------------------- */

  updateMenu(dt) {
    this.menuTime += dt;
    const t = this.menuTime * 0.06;
    this.camera.position.x = 10.0 + Math.sin(t) * 1.6;
    this.camera.position.y = 6.2 + Math.sin(t * 0.7) * 0.22;
    this.camera.position.z = 18.0 + Math.cos(t * 0.8) * 1.0;
    this.camera.lookAt(-2.5, 2.3, -4.0);
    this.world.update(dt);
    const flash = this.effects.update(dt);
    this.world.setLightning(flash);
    this.hud.setFlash(flash);
    this.gradePass.uniforms.uTime.value = this.menuTime;
    this.gradePass.uniforms.uDamage.value = 0;
    this.gradePass.uniforms.uFlash.value = flash;
    this.gradePass.uniforms.uSpeed.value = 0;
  }

  update(dt) {
    this.missionTime += dt;
    if (!this.player.alive) {
      this.updateDeathCamera(dt);
      if (this.state === 'playing') {
        for (const e of this.enemies) e.update(dt, { player: this.player, enemies: this.enemies });
      }
      this.world.update(dt);
      const flash = this.effects.update(dt);
      this.world.setLightning(flash);
      this.hud.setFlash(flash);
      this.updatePost(dt, flash);
      this.hud.update(dt, this);
      return;
    }

    this.updatePlayer(dt);
    this.updateWeapon(dt);
    this.updateObjectives(dt);
    for (const e of this.enemies) e.update(dt, { player: this.player, enemies: this.enemies });

    this.world.update(dt);
    const flash = this.effects.update(dt);
    this.world.setLightning(flash);
    this.hud.setFlash(flash);
    this.hudAccum = (this.hudAccum || 0) + dt;
    if (this.hudAccum >= 1 / 30) {
      this.hud.update(this.hudAccum, this);
      this.hudAccum = 0;
    }
    this.updatePost(dt, flash);

    if (this.missionTime - this.lastDamageTime > 8 && this.player.health < 100 && !this.lowHealthNotified) {
      this.lowHealthNotified = false;
    }
  }

  updatePost(dt, flash) {
    const low = 1 - this.player.health / 100;
    this.gradePass.uniforms.uTime.value = this.missionTime;
    this.gradePass.uniforms.uDamage.value = Math.max(low * 0.65, this.shake * 0.4);
    this.gradePass.uniforms.uFlash.value = flash * 0.55;
    this.gradePass.uniforms.uSpeed.value = this.player.moving;
  }

  animate() {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    let dt = this.clock.getDelta();
    if (!Number.isFinite(dt) || dt > 0.1) dt = 0.033;
    const realDt = this._lastFrameAt ? Math.min(0.5, (now - this._lastFrameAt) / 1000) : 0.016;
    this._lastFrameAt = now;
    this._fpsAccum += realDt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    if (this.state === 'menu' || this.state === 'boot') {
      this.updateMenu(dt);
    } else if (this.state === 'playing') {
      if (!this.testMode) this.update(dt);
    } else if (this.state === 'paused') {
      // freeze simulation, keep the last frame composited
      this.gradePass.uniforms.uTime.value += dt;
    }
    this.composer.render();
  }

  /* -------------------------------------------------------------- */
  /*  Debug API for automated verification                          */
  /* -------------------------------------------------------------- */

  makeDebugApi() {
    return {
      game: this,
      start: () => this.startGame(),
      getState: () => ({
        state: this.state,
        testMode: this.testMode,
        missionTime: this.missionTime,
        player: {
          x: this.player.position.x, y: this.player.position.y, z: this.player.position.z,
          yaw: this.player.yaw, pitch: this.player.pitch, health: this.player.health,
          armor: this.player.armor, alive: this.player.alive,
        },
        weapon: {
          mag: this.weapon.mag, reserve: this.weapon.reserve,
          reloading: this.weapon.reloading, ads: this.weapon.ads,
        },
        relays: this.world.relays.map((r) => ({ id: r.id, active: r.active })),
        gateOpen: this.world.gate.isOpen,
        extractionActive: this.world.extractionActive,
        kills: this.kills,
        shots: this.shots,
        hits: this.hits,
        enemies: this.enemies.map((e) => ({
          id: e.id, active: e.active, alive: e.alive, health: e.health,
          state: e.state, x: e.group.position.x, z: e.group.position.z,
        })),
      }),
      teleport: (x, z, yaw = this.player.yaw) => {
        this.player.position.set(x, 0, z);
        this.player.yaw = yaw;
        this.player.pitch = 0;
        this.player.y = 0;
        this.player.vy = 0;
        this.camera.position.set(x, EYE_HEIGHT, z);
        this.camera.rotation.set(0, yaw, 0);
      },
      aimAt: (x, y, z) => {
        const eye = this.eyePosition(new THREE.Vector3());
        const dx = x - eye.x;
        const dy = y - eye.y;
        const dz = z - eye.z;
        this.player.yaw = Math.atan2(-dx, -dz);
        this.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
      },
      fire: () => this.fireWeapon(),
      reload: () => this.startReload(),
      setInvulnerable: (v) => { this.invulnerable = !!v; },
      damagePlayer: (n) => this.damagePlayer(n),
      completeRelay: (id) => {
        const r = this.world.relays.find((r) => r.id === id);
        if (r) this.completeRelay(r);
      },
      openGate: () => {
        for (const r of this.world.relays) { if (!r.active) { r.activate(); this.relaysDone = this.world.relays.filter((x) => x.active).length; } }
        this.hud.extractionOpen();
        this.world.gate.open();
        this.world.activateExtraction();
      },
      killAll: () => {
        for (const e of this.enemies) {
          if (e.active && e.alive) e.takeDamage(9999, false, e.bodyPos(new THREE.Vector3()), new THREE.Vector3(1, 0, 0));
        }
      },
      getEnemy: (id) => {
        const e = this.enemies.find((x) => x.id === id);
        return e ? { x: e.group.position.x, z: e.group.position.z, active: e.active, alive: e.alive, y: 1.2 } : null;
      },
    };
  }
}

/* ------------------------------------------------------------------ */

function boot() {
  const canvas = document.getElementById('scene');
  try {
    const game = new Game(canvas);
    window.__nightfall = game;
  } catch (err) {
    console.error(err);
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#040708;color:#e7efeb;font-family:monospace;padding:40px;text-align:center;z-index:999;line-height:1.7';
    msg.innerHTML = '<div style="font-family:\'Noto Sans CJK SC\',\'Microsoft YaHei\',sans-serif"><div style="color:#ff4052;letter-spacing:.3em;font-size:11px;margin-bottom:16px">渲染失败</div>夜幕协议无法初始化 WebGL。<br>请使用支持硬件加速的现代桌面浏览器。<br><br><span style="color:#6f8480;font-size:10px">' + String(err.message || err).replace(/</g, '&lt;') + '</span></div>';
    document.body.appendChild(msg);
  }
}

function scheduleBoot() {
  // Let the boot frame paint before the synchronous procedural generation begins.
  requestAnimationFrame(() => setTimeout(boot, 30));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleBoot);
else scheduleBoot();
