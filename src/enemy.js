import * as THREE from 'three';
import { circleCollides, lineBlocked } from './world.js';

const _muzzle = new THREE.Vector3();
const _target = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function raySphere(origin, dir, center, radius) {
  _tmp.copy(center).sub(origin);
  const tca = _tmp.dot(dir);
  if (tca < 0) return null;
  const d2 = _tmp.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  return Math.max(0, tca - thc);
}

/* ------------------------------------------------------------------ */

export class Enemy {
  constructor(scene, world, effects, audio, opts) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.id = opts.id;
    this.type = opts.type || 'grunt';
    this.elite = this.type === 'elite';
    this.maxHealth = this.elite ? 230 : 100;
    this.health = this.maxHealth;
    this.speed = this.elite ? 1.9 : 2.35;
    this.radius = 0.46;
    this.damage = this.elite ? 12 : 7;
    this.accuracy = this.elite ? 0.62 : 0.46;
    this.vision = this.elite ? 32 : 27;
    this.alive = true;
    this.active = false;
    this.alerted = false;
    this.state = 'patrol';
    this.patrol = (opts.patrol || []).map((p) => p.clone());
    this.patrolIndex = 0;
    this.waitTimer = 0;
    this.repathTimer = 0;
    this.aimTimer = 1 + Math.random() * 1.5;
    this.burst = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.lastSeen = new THREE.Vector3();
    this.seenTimer = 0;
    this.flash = 0;
    this.walkPhase = Math.random() * 10;
    this.deathT = 0;
    this.deathSide = Math.random() < 0.5 ? -1 : 1;
    this.shotCount = 0;
    this.onShoot = opts.onShoot;
    this.onDeath = opts.onDeath;
    this.onHit = opts.onHit;
    this.group = new THREE.Group();
    this.group.position.copy(opts.position);
    this.group.visible = false;
    scene.add(this.group);
    this.build();
  }

  build() {
    const dark = new THREE.MeshStandardMaterial({
      color: this.elite ? 0x342a2b : 0x424b4e, roughness: 0.46, metalness: 0.6,
      envMapIntensity: 1.5,
    });
    const mid = new THREE.MeshStandardMaterial({
      color: this.elite ? 0x67403a : 0x687376, roughness: 0.52, metalness: 0.5,
      envMapIntensity: 1.3,
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 0.9, metalness: 0.1 });
    const accentCol = this.elite ? 0xff5a2a : 0xff334d;
    const accent = new THREE.MeshStandardMaterial({
      color: 0x080202, emissive: accentCol, emissiveIntensity: 3.2, roughness: 0.35, metalness: 0.4,
    });
    const eye = new THREE.MeshBasicMaterial({ color: this.elite ? 0xff8a4a : 0xff4a5f, toneMapped: false });
    this.materials = [dark, mid, accent];
    this.baseAccent = accent.emissiveIntensity;
    this.eye = eye;
    const s = this.elite ? 1.16 : 1.0;
    this.group.scale.setScalar(s);

    const bodyRoot = new THREE.Group();
    this.bodyRoot = bodyRoot;
    this.group.add(bodyRoot);

    const hip = new THREE.Group();
    hip.position.y = 0.92;
    bodyRoot.add(hip);
    this.hip = hip;

    const legGeo = new THREE.BoxGeometry(0.22, 0.78, 0.26);
    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.18, 0, 0);
      const leg = new THREE.Mesh(legGeo, rubber);
      leg.position.y = -0.39;
      leg.castShadow = true;
      pivot.add(leg);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.19), dark);
      shin.position.set(0, -0.75, 0.02);
      shin.castShadow = true;
      pivot.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.38), dark);
      boot.position.set(0, -1.02, 0.08);
      boot.castShadow = true;
      pivot.add(boot);
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.15, 0.12), dark);
      knee.position.set(0, -0.57, 0.13);
      knee.castShadow = true;
      pivot.add(knee);
      hip.add(pivot);
      this.legs.push(pivot);
    }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.36), mid);
    torso.position.y = 1.35;
    torso.castShadow = true;
    bodyRoot.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.44, 0.42), dark);
    chest.position.y = 1.5;
    chest.castShadow = true;
    bodyRoot.add(chest);
    const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.01), accent);
    chestGlow.position.set(0, 1.5, 0.215);
    bodyRoot.add(chestGlow);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 0.4), rubber);
    belt.position.y = 1.0;
    bodyRoot.add(belt);

    // shoulder plates
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.42), dark);
      pad.position.set(side * 0.46, 1.62, 0);
      pad.rotation.z = side * -0.18;
      pad.castShadow = true;
      bodyRoot.add(pad);
    }

    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.45, 1.55, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.19), mid);
      upper.position.y = -0.25;
      upper.castShadow = true;
      pivot.add(upper);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.46, 0.16), rubber);
      fore.position.y = -0.69;
      fore.rotation.x = 0.18;
      fore.castShadow = true;
      pivot.add(fore);
      const elbow = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.17), dark);
      elbow.position.set(0, -0.43, 0.01);
      elbow.castShadow = true;
      pivot.add(elbow);
      bodyRoot.add(pivot);
      this.arms.push(pivot);
    }

    // head and helmet
    this.head = new THREE.Group();
    this.head.position.y = 1.95;
    bodyRoot.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 8), rubber);
    neck.position.y = -0.12;
    this.head.add(neck);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.29, 0.33), dark);
    helmet.castShadow = true;
    this.head.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.075, 0.02), eye);
    visor.position.set(0, 0.01, 0.172);
    this.head.add(visor);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.3), accent);
    crest.position.set(0, 0.17, 0);
    this.head.add(crest);
    if (this.elite) {
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.08), accent);
        horn.position.set(side * 0.18, 0.18, 0);
        horn.rotation.z = side * 0.28;
        this.head.add(horn);
      }
    }

    // glowing sensor bloom and armor accent strips read at distance
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: this.elite ? 0xff8a4a : 0xff334d,
      transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }));
    eyeGlow.position.set(0, 0.01, 0.22);
    eyeGlow.scale.set(0.34, 0.34, 1);
    this.head.add(eyeGlow);
    const chestCore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), accent);
    chestCore.rotation.x = Math.PI / 2;
    chestCore.position.set(0, 1.44, 0.225);
    bodyRoot.add(chestCore);
    const chestGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: this.elite ? 0xff7a42 : 0xff4052,
      transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }));
    chestGlowSprite.position.set(0, 1.44, 0.26);
    chestGlowSprite.scale.set(0.4, 0.4, 1);
    bodyRoot.add(chestGlowSprite);
    this.eyeGlow = eyeGlow;
    this.chestGlow = chestGlowSprite;

    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.4, 0.012), accent);
      rib.position.set(side * 0.33, 1.44, 0.208);
      bodyRoot.add(rib);
      const thighRib = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.26, 0.012), accent);
      thighRib.position.set(side * 0.23, 0.6, 0.135);
      bodyRoot.add(thighRib);
      const shinRib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.012), accent);
      shinRib.position.set(side * 0.22, 0.23, 0.13);
      bodyRoot.add(shinRib);
    }

    // backpack + antenna
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.45, 0.2), dark);
    pack.position.set(0, 1.4, -0.24);
    pack.castShadow = true;
    bodyRoot.add(pack);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.55, 5), dark);
    antenna.position.set(0.16, 1.82, -0.32);
    antenna.rotation.z = -0.22;
    bodyRoot.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), accent);
    antennaTip.position.set(0.22, 2.08, -0.32);
    bodyRoot.add(antennaTip);
    // backpack hose feeds into the helmet
    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 1.58, -0.3),
      new THREE.Vector3(-0.34, 1.76, -0.2),
      new THREE.Vector3(-0.22, 1.9, -0.02),
      new THREE.Vector3(-0.08, 1.92, 0.1),
    ]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 8, 0.02, 5, false), rubber);
    bodyRoot.add(hose);
    const shoulderLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), accent);
    shoulderLamp.position.set(0.5, 1.63, 0.16);
    bodyRoot.add(shoulderLamp);
    const shoulderGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.effects.glowTex, color: this.elite ? 0xff8a4a : 0xff3b4e,
      transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }));
    shoulderGlow.position.set(0.5, 1.63, 0.2);
    shoulderGlow.scale.set(0.24, 0.24, 1);
    bodyRoot.add(shoulderGlow);
    this.shoulderGlow = shoulderGlow;

    // rifle
    const gun = new THREE.Group();
    gun.position.set(0.28, 1.27, 0.3);
    bodyRoot.add(gun);
    this.gun = gun;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), dark);
    receiver.castShadow = true;
    gun.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.45, 8), rubber);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.48);
    gun.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.12), mid);
    mag.position.set(0, -0.16, 0.02);
    gun.add(mag);
    const gunLight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.1), accent);
    gunLight.position.set(0.08, 0.04, 0.2);
    gun.add(gunLight);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, 0.72);
    gun.add(this.muzzle);

    // laser painter (visible while tracking the player)
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({
      color: this.elite ? 0xff7a42 : 0xff3b4e, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.laser.renderOrder = 22;
    this.scene.add(this.laser);

    // small contact shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({
        map: this.effects ? this.effects.glowTex : null,
        color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    this.group.add(shadow);
    this.shadow = shadow;

    // health bar for elite (sprite)
    if (this.elite) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 12;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(10,10,12,0.8)';
      ctx.fillRect(0, 0, 128, 12);
      ctx.fillStyle = '#ff7a3d';
      ctx.fillRect(2, 2, 124, 8);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false });
      this.eliteBar = new THREE.Sprite(mat);
      this.eliteBar.position.set(0, 2.5, 0);
      this.eliteBar.scale.set(1.4, 0.13, 1);
      this.eliteBar.visible = false;
      this.group.add(this.eliteBar);
    }
  }

  spawn(position, patrol) {
    this.group.position.copy(position);
    if (patrol) this.patrol = patrol.map((p) => p.clone());
    this.patrolIndex = 0;
    this.active = true;
    this.alive = true;
    this.group.visible = true;
    this.health = this.maxHealth;
    this.state = 'patrol';
    this.alerted = false;
    this.laser.visible = false;
    this.lastHitHeadshot = false;
    this.aimTimer = 0.8 + Math.random() * 1.2;
    this.group.rotation.set(0, 0, 0);
    this.bodyRoot.rotation.set(0, 0, 0);
    this.bodyRoot.position.y = 0;
    this.hip.position.y = 0.92;
    this.deathT = 0;
    this.deathSign = Math.random() < 0.5 ? -1 : 1;
    this.group.scale.setScalar(this.elite ? 1.16 : 1.0);
    this.flash = 0;
    if (this.eliteBar) this.eliteBar.visible = false;
  }

  get eyePosition() {
    return this._eye || (this._eye = new THREE.Vector3());
  }

  headPos(out = _v2) {
    return out.set(this.group.position.x, 1.95 * (this.elite ? 1.16 : 1) - 0.02, this.group.position.z);
  }

  bodyPos(out = _v2) {
    return out.set(this.group.position.x, 1.25 * (this.elite ? 1.16 : 1), this.group.position.z);
  }

  muzzleWorld(out = _muzzle) {
    this.muzzle.getWorldPosition(out);
    return out;
  }

  alert(sourcePos) {
    if (!this.alive) return;
    this.alerted = true;
    if (this.state === 'patrol') this.state = 'combat';
    if (sourcePos) this.lastSeen.copy(sourcePos);
  }

  takeDamage(amount, headshot, point, fromDir) {
    if (!this.alive) return false;
    this.health -= amount;
    this.lastHitHeadshot = !!headshot;
    this.flash = 1;
    this.alerted = true;
    this.state = 'combat';
    if (this.onHit) this.onHit(this, headshot, point);
    if (this.health <= 0) {
      this.die(fromDir);
      return true;
    }
    // flinch
    this.bodyRoot.rotation.x = -0.06;
    return false;
  }

  die(fromDir) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.deathT = 0;
    this.deathFall = fromDir ? Math.atan2(fromDir.x, fromDir.z) : Math.random() * Math.PI * 2;
    this.deathSign = Math.random() < 0.5 ? -1 : 1;
    if (this.eliteBar) this.eliteBar.visible = false;
    this.effects.explosion(this.headPos(new THREE.Vector3()), 0xff6a3a, this.elite ? 0.8 : 0.45);
    this.audio.enemyDown();
    if (this.onDeath) this.onDeath(this);
  }

  hitTest(origin, dir, maxDist) {
    if (!this.alive || !this.active) return null;
    const scale = this.elite ? 1.16 : 1;
    const head = this.headPos(new THREE.Vector3());
    const body = this.bodyPos(new THREE.Vector3());
    let best = null;
    const th = raySphere(origin, dir, head, 0.22 * scale);
    if (th !== null && th <= maxDist) best = { dist: th, headshot: true, point: origin.clone().addScaledVector(dir, th) };
    const tb = raySphere(origin, dir, body, 0.48 * scale);
    if (tb !== null && tb <= maxDist && (!best || tb < best.dist)) best = { dist: tb, headshot: false, point: origin.clone().addScaledVector(dir, tb) };
    // legs
    const legs = new THREE.Vector3(this.group.position.x, 0.62 * scale, this.group.position.z);
    const tl = raySphere(origin, dir, legs, 0.34 * scale);
    if (tl !== null && tl <= maxDist && (!best || tl < best.dist)) best = { dist: tl, headshot: false, point: origin.clone().addScaledVector(dir, tl) };
    return best;
  }

  blockedByPlayer(x, z) {
    const pl = this.playerRef;
    if (!pl || !pl.alive) return false;
    const dx = x - pl.position.x;
    const dz = z - pl.position.z;
    const min = this.radius + 0.42;
    return dx * dx + dz * dz < min * min;
  }

  tryMove(dx, dz) {
    const p = this.group.position;
    const r = this.radius;
    if (dx !== 0) {
      if (!circleCollides(p.x + dx, p.z, r, this.world.colliders) && !this.blockedByPlayer(p.x + dx, p.z)) p.x += dx;
      else {
        // slide along wall
        const alt = this.strafeDir * 0.5;
        if (!circleCollides(p.x, p.z + alt, r, this.world.colliders)) p.z += alt;
      }
    }
    if (dz !== 0) {
      if (!circleCollides(p.x, p.z + dz, r, this.world.colliders) && !this.blockedByPlayer(p.x, p.z + dz)) p.z += dz;
      else {
        const alt = this.strafeDir * 0.5;
        if (!circleCollides(p.x + alt, p.z, r, this.world.colliders)) p.x += alt;
      }
    }
    p.x = Math.max(-34, Math.min(34, p.x));
    p.z = Math.max(-34, Math.min(34, p.z));
  }

  canSeePlayer(playerPos, colliders) {
    this.headPos(_eye);
    const dist = Math.hypot(playerPos.x - _eye.x, playerPos.z - _eye.z);
    if (dist > this.vision) return false;
    _target.set(playerPos.x, 1.5, playerPos.z);
    // cheap distance/FOV check, then exact line test
    const yawTo = Math.atan2(playerPos.x - _eye.x, playerPos.z - _eye.z);
    let dy = yawTo - this.group.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(dy) > 1.35 && !this.alerted) return false;
    return !lineBlocked(_eye, _target, colliders);
  }

  update(dt, ctx) {
    if (!this.active) return;
    if (!this.alive) {
      this.laser.visible = false;
      this.deathT += dt;
      const t = Math.min(1, this.deathT / 0.85);
      const e = easeOutCubic(t);
      this.group.rotation.x = -this.deathSign * e * Math.PI * 0.48;
      this.bodyRoot.position.y = -0.08 * e;
      if (this.deathT > 14) this.group.visible = false;
      return;
    }

    const player = ctx.player;
    const playerPos = player.position;
    const seen = this.canSeePlayer(playerPos, this.world.colliders);
    const dist = this.group.position.distanceTo(playerPos);

    if (seen) {
      this.lastSeen.copy(playerPos);
      this.seenTimer = 0;
      if (!this.alerted) {
        this.alerted = true;
        this.audio.radio();
      }
      this.state = 'combat';
    } else {
      this.seenTimer += dt;
      if (this.alerted && this.seenTimer > 7) {
        this.alerted = false;
        this.state = 'patrol';
      }
    }

    if (this.state === 'combat' || this.alerted) {
      this.updateCombat(dt, ctx, seen, dist);
    } else {
      this.updatePatrol(dt, ctx);
    }

    // animate legs / arms
    const moving = this.moveAmount || 0;
    this.walkPhase += dt * (4 + moving * 6);
    const swing = Math.sin(this.walkPhase) * 0.55 * moving;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.55 + (this.state === 'combat' ? -0.55 : 0);
    this.arms[1].rotation.x = swing * 0.55 + (this.state === 'combat' ? -0.75 : 0);
    this.head.rotation.y = this.state === 'combat' ? 0 : Math.sin(this.walkPhase * 0.22) * 0.25;
    this.bodyRoot.position.y = Math.abs(Math.sin(this.walkPhase * 1.1)) * 0.025 * moving;
    this.hip.position.y = 0.92 + Math.abs(Math.sin(this.walkPhase * 1.1)) * 0.02 * moving;
    const sensorPulse = 0.62 + Math.sin(this.walkPhase * 0.8 + this.id.length) * 0.2;
    if (this.eyeGlow) this.eyeGlow.material.opacity = sensorPulse;
    if (this.chestGlow) this.chestGlow.material.opacity = 0.32 + sensorPulse * 0.28;
    if (this.shoulderGlow) this.shoulderGlow.material.opacity = 0.38 + sensorPulse * 0.25;

    // flash decay
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const m of this.materials) {
        if (m.emissive) m.emissiveIntensity = 0.6 + this.flash * 4.0;
      }
      this.flashMatTimer = 0.16;
    } else if (this.flashMatTimer > 0) {
      this.flashMatTimer -= dt;
      for (const m of this.materials) {
        if (m.emissive && m !== this.materials[2]) m.emissiveIntensity = 0;
      }
      if (this.flashMatTimer <= 0) {
        this.materials[2].emissiveIntensity = this.baseAccent;
      }
    }

    if (this.eliteBar) {
      const d = this.group.position.distanceTo(ctx.player.position);
      this.eliteBar.visible = (this.alerted || this.health < this.maxHealth) && d > 7.5 && d < 38;
      this.eliteBar.material.opacity = Math.max(0.15, this.health / this.maxHealth);
    }

    // contact shadow + separation handled by main
    this.shadow.material.opacity = 0.42;
  }

  updatePatrol(dt, ctx) {
    this.moveAmount = 0;
    if (!this.patrol.length) {
      // idle scan
      this.group.rotation.y += dt * 0.25;
      return;
    }
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this.group.rotation.y += dt * 0.4;
      return;
    }
    const target = this.patrol[this.patrolIndex % this.patrol.length];
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      this.patrolIndex++;
      this.waitTimer = 0.8 + Math.random() * 2.0;
      return;
    }
    const speed = this.speed * 0.52;
    this.tryMove((dx / d) * speed * dt, (dz / d) * speed * dt);
    const targetYaw = Math.atan2(dx, dz);
    this.group.rotation.y = this.lerpAngle(this.group.rotation.y, targetYaw, dt * 4);
    this.moveAmount = Math.min(1, this.moveAmount + dt * 4);
  }

  updateCombat(dt, ctx, seen, dist) {
    this.moveAmount = 0;
    const playerPos = ctx.player.position;
    const dx = this.lastSeen.x - this.group.position.x;
    const dz = this.lastSeen.z - this.group.position.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const yaw = Math.atan2(dx, dz);
    this.group.rotation.y = this.lerpAngle(this.group.rotation.y, yaw, dt * (seen ? 7 : 3));

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = 1.4 + Math.random() * 2.6;
    }

    let moveX = 0, moveZ = 0;
    if (seen) {
      if (dist > 15) {
        moveX = dx / d * this.speed;
        moveZ = dz / d * this.speed;
      } else if (dist < 6.5) {
        moveX = -dx / d * this.speed * 0.8;
        moveZ = -dz / d * this.speed * 0.8;
      } else {
        // strafe around the player
        moveX = (dz / d) * this.strafeDir * this.speed * 0.6;
        moveZ = (-dx / d) * this.strafeDir * this.speed * 0.6;
      }
      // a little jitter to feel organic
      moveX += (Math.random() - 0.5) * 0.2;
      moveZ += (Math.random() - 0.5) * 0.2;
    } else if (this.seenTimer < 5) {
      // move toward last known position
      moveX = dx / d * this.speed * 0.8;
      moveZ = dz / d * this.speed * 0.8;
    }
    if (moveX || moveZ) {
      this.tryMove(moveX * dt, moveZ * dt);
      this.moveAmount = Math.min(1, this.moveAmount + dt * 2.5);
    }

    // separation from other enemies
    for (const other of ctx.enemies) {
      if (other === this || !other.active || !other.alive) continue;
      const ox = this.group.position.x - other.group.position.x;
      const oz = this.group.position.z - other.group.position.z;
      const o2 = ox * ox + oz * oz;
      if (o2 < 1.6 && o2 > 0.0001) {
        const oD = Math.sqrt(o2);
        this.tryMove((ox / oD) * dt * 1.5, (oz / oD) * dt * 1.5);
      }
    }

    if (!seen) {
      this.laser.visible = false;
      return;
    }
    this.muzzleWorld(_muzzle);
    const eye = ctx.player.eyePosition ? ctx.player.eyePosition(_target) : _target.set(ctx.player.position.x, 1.5, ctx.player.position.z);
    const pos = this.laser.geometry.attributes.position;
    pos.setXYZ(0, _muzzle.x, _muzzle.y, _muzzle.z);
    pos.setXYZ(1, eye.x, eye.y, eye.z);
    pos.needsUpdate = true;
    this.laser.visible = true;
    this.laser.material.opacity = 0.16 + Math.sin(this.walkPhase * 2) * 0.05 + (this.burst > 0 ? 0.22 : 0);
    this.aimTimer -= dt;
    if (this.aimTimer <= 0) {
      if (this.burst <= 0) {
        this.burst = this.elite ? 4 : 3;
        this.burstTimer = 0;
      }
      this.burstTimer -= dt;
      if (this.burst > 0 && this.burstTimer <= 0) {
        this.fire(ctx);
        this.burst--;
        this.burstTimer = this.elite ? 0.09 : 0.13;
        if (this.burst <= 0) this.aimTimer = (this.elite ? 1.25 : 1.5) + Math.random() * 1.1;
      }
    }
  }

  fire(ctx) {
    this.shotCount++;
    this.muzzleWorld(_muzzle);
    this.effects.muzzleFlash(_muzzle, this.elite ? 0xff7a42 : 0xffb15c);
    this.audio.enemyShot(this.group.position.distanceTo(ctx.player.position));
    if (this.onShoot) this.onShoot(this, _muzzle.clone(), this.accuracy, this.damage);
  }

  lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
  }
}
