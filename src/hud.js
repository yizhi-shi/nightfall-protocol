const $ = (sel) => document.querySelector(sel);

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class Hud {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.el = {
      missionKicker: $('#mission-kicker'),
      missionTitle: $('#mission-title'),
      objectives: $('#objective-list'),
      diffBadge: $('#difficulty-badge'),
      pauseDiff: $('#pause-diff'),
      endDiff: $('#end-diff'),
      timer: $('#timer'),
      comms: $('#comms'),
      commsText: $('#comms-text'),
      commsTag: $('#comms-tag'),
      healthFill: $('#health-fill'),
      healthGhost: $('#health-ghost'),
      healthNum: $('#health-num'),
      armorFill: $('#armor-fill'),
      armorNum: $('#armor-num'),
      pulse: $('#pulse'),
      ammo: $('#ammo'),
      reserve: $('#reserve'),
      ammoPanel: $('.ammo-panel'),
      reloadBar: $('#reload-bar'),
      reloadLabel: $('#reload-label'),
      crosshair: $('#crosshair'),
      hitmarker: $('#hitmarker'),
      interact: $('#interact'),
      interactTitle: $('#interact-title'),
      interactSub: $('#interact-sub'),
      interactProgress: $('#interact-progress'),
      damage: $('#damage-vignette'),
      damageDir: $('#damage-dir'),
      flash: $('#flash'),
      killfeed: $('#killfeed'),
      hostiles: $('#hostiles'),
      fps: $('#fps'),
      map: $('#minimap'),
      toast: $('#toast'),
      pauseTime: $('#pause-time'),
      pauseKills: $('#pause-kills'),
      pauseRelays: $('#pause-relays'),
      endStatus: $('#end-status'),
      endTitle: $('#end-title'),
      endCopy: $('#end-copy'),
      endTime: $('#end-time'),
      endKills: $('#end-kills'),
      endAcc: $('#end-acc'),
      endRelays: $('#end-relays'),
      endSeed: $('#end-seed'),
    };
    this.ctx = this.el.map.getContext('2d');
    this.mapTimer = 0;
    this.damageTimer = 0;
    this.commsQueue = [];
    this.commsTimer = 0;
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.flashFade = 0;
    this.objectiveState = { A: false, B: false, C: false, extract: false };
    this.updateObjectives();
  }

  setState(state) {
    document.body.dataset.state = state;
  }

  setDifficulty(label) {
    if (this.el.diffBadge) this.el.diffBadge.textContent = label;
  }

  setLevel(level, index = 0, total = 1) {
    if (!level) return;
    const pad = (n) => String(n).padStart(2, '0');
    if (this.el.missionKicker) {
      this.el.missionKicker.textContent = `任务 ${pad(index + 1)} / ${pad(total)} · 夜幕行动`;
    }
    if (this.el.missionTitle) {
      this.el.missionTitle.innerHTML = `${level.name} <em>·</em> ${level.area}`;
    }
    const rows = [...this.el.objectives.querySelectorAll('[data-obj]')];
    const byId = { A: rows.find((r) => r.dataset.obj === 'A'), B: rows.find((r) => r.dataset.obj === 'B'), C: rows.find((r) => r.dataset.obj === 'C') };
    for (let i = 0; i < 3; i++) {
      const r = byId[['A', 'B', 'C'][i]];
      if (!r) continue;
      const title = level.relays?.[i]?.name || '';
      const desc = level.objectives?.[i] || '';
      if (title) r.querySelector('.obj-text b').textContent = title;
      if (desc) r.querySelector('.obj-text small').textContent = desc;
    }
    const ext = rows.find((r) => r.dataset.obj === 'extract');
    if (ext && level.extract) ext.querySelector('.obj-text small').textContent = level.extract;
  }

  message(text, tag = '通讯', duration = 6, immediate = false) {
    if (immediate) {
      this.commsQueue.length = 0;
      this.showComms(text, tag, duration);
    } else {
      this.commsQueue.push({ text, tag, duration });
    }
  }

  showComms(text, tag, duration) {
    this.el.commsText.textContent = text;
    this.el.commsTag.textContent = tag;
    this.el.comms.classList.add('visible');
    this.commsTimer = duration;
    this.commsActive = true;
  }

  toast(text, duration = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = duration;
  }

  hitmarker(head = false) {
    const h = this.el.hitmarker;
    h.classList.remove('active', 'head');
    void h.offsetWidth;
    h.classList.add('active');
    if (head) h.classList.add('head');
    this.hitTimer = 0.22;
  }

  damage(amount) {
    this.el.damage.classList.add('active');
    this.damageTimer = 0.14 + Math.min(0.3, amount * 0.008);
  }

  damageDirection(angle) {
    const el = this.el.damageDir;
    if (!el) return;
    el.style.setProperty('--dmg-angle', `${angle}rad`);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.dmgDirTimer);
    this.dmgDirTimer = setTimeout(() => el.classList.remove('show'), 800);
  }

  kill(name, headshot = false) {
    const div = document.createElement('div');
    div.className = 'kill-item';
    div.innerHTML = headshot
      ? `<b>爆头</b> // ${name}`
      : `<b>击毙</b> // ${name}`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 4) this.el.killfeed.lastChild.remove();
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .4s'; }, 3400);
    setTimeout(() => div.remove(), 3900);
  }

  objectiveDone(id) {
    this.objectiveState[id] = true;
    const row = this.el.objectives.querySelector(`[data-obj="${id}"]`);
    if (row) {
      row.classList.add('done');
      row.classList.remove('active');
      row.classList.remove('locked');
    }
    this.updateObjectives();
  }

  updateObjectives() {
    const locked = this.el.objectives.querySelector('[data-obj="extract"]');
    if (this.objectiveState.extract) {
      locked.classList.add('done');
      locked.classList.remove('locked', 'active');
    }
    // active highlight next incomplete relay
    const rows = [...this.el.objectives.querySelectorAll('[data-obj]')];
    const next = rows.find((r) => !r.classList.contains('done') && !r.classList.contains('locked'));
    rows.forEach((r) => {
      if (r !== next) r.classList.remove('active');
    });
    if (next) next.classList.add('active');
  }

  extractionOpen() {
    const row = this.el.objectives.querySelector('[data-obj="extract"]');
    row.classList.remove('locked');
    row.classList.add('active');
    const dist = row.querySelector('[data-dist]');
    if (dist) dist.textContent = '开启';
    this.updateObjectives();
  }

  setPrompt(title, sub = '', progress = 0) {
    this.el.interactTitle.textContent = title;
    this.el.interactSub.textContent = sub;
    this.el.interactProgress.style.width = `${Math.round(progress * 100)}%`;
    this.el.interact.classList.add('visible');
    if (progress >= 1) this.el.interact.classList.add('complete');
    else this.el.interact.classList.remove('complete');
  }

  hidePrompt() {
    this.el.interact.classList.remove('visible', 'complete');
  }

  setFlash(v) {
    this.flashFade = v;
    this.el.flash.style.opacity = (v * 0.3).toFixed(3);
  }

  update(dt, game) {
    const p = game.player;
    const w = game.weapon;

    const hp = Math.max(0, Math.ceil(p.health));
    this.el.healthNum.textContent = String(hp).padStart(3, '0');
    this.el.armorNum.textContent = String(Math.max(0, Math.ceil(p.armor))).padStart(2, '0');
    this.el.healthFill.style.width = `${Math.max(0, p.health)}%`;
    this.el.armorFill.style.width = `${Math.min(100, Math.max(0, (p.armor / p.maxArmor) * 100))}%`;
    this.el.healthGhost.style.transform = `scaleX(${Math.max(0, p.health / 100)})`;
    const low = p.health < 35;
    document.body.classList.toggle('low-health', low);
    this.el.pulse.textContent = p.health > 65 ? '稳定' : p.health > 30 ? '偏高' : '危急';
    this.el.pulse.style.color = low ? 'var(--red)' : p.health > 65 ? 'var(--cyan)' : 'var(--amber)';

    this.el.ammo.textContent = String(w.mag).padStart(2, '0');
    this.el.reserve.textContent = String(w.reserve);
    this.el.ammoPanel.classList.toggle('low', w.mag <= 6);
    this.el.reloadBar.style.width = `${w.reloading ? w.reloadProgress * 100 : 0}%`;
    this.el.reloadLabel.textContent = w.reloading ? '装填中' : w.mag === 0 ? '空仓' : '就绪';
    this.el.reloadBar.classList.toggle('active', w.reloading);

    this.el.crosshair.style.setProperty('--gap', `${(8 + w.spread * 180).toFixed(1)}px`);

    this.el.timer.textContent = fmtTime(game.missionTime);
    this.el.hostiles.textContent = `敌人 ${game.aliveEnemies()}`;

    // objective distances
    for (const r of this.world.relays) {
      const dist = this.el.objectives.querySelector(`[data-dist="${r.id}"]`);
      if (dist) dist.textContent = r.active ? '在线' : `${Math.round(Math.hypot(r.pos.x - p.position.x, r.pos.z - p.position.z))} 米`;
    }
    const ext = this.el.objectives.querySelector('[data-dist="extract"]');
    if (ext && this.el.objectives.querySelector('[data-obj="extract"]').classList.contains('locked') === false) {
      const d = Math.hypot(-0 - p.position.x, -33.7 - p.position.z);
      ext.textContent = d < 4 ? '到达' : `${Math.round(d)} 米`;
    }

    // damage vignette timer
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) this.el.damage.classList.remove('active');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('active', 'head');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this.commsActive) {
      this.commsTimer -= dt;
      if (this.commsTimer <= 0) {
        this.commsActive = false;
        this.el.comms.classList.remove('visible');
        this.commsGap = 0.55;
      }
    } else if (this.commsQueue.length) {
      this.commsGap = (this.commsGap || 0) - dt;
      if (this.commsGap <= 0) {
        const m = this.commsQueue.shift();
        this.showComms(m.text, m.tag, m.duration);
      }
    }

    if (this.flashFade > 0) {
      this.flashFade = Math.max(0, this.flashFade - dt * 3.5);
      this.el.flash.style.opacity = (this.flashFade * 0.3).toFixed(3);
    }

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 12;
      this.drawMinimap(game);
    }
  }

  drawMinimap(game) {
    const c = this.ctx;
    const S = 360, C = S / 2;
    const p = game.player;
    const yaw = p.yaw;
    const scale = 5.2;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#020708';
    c.fillRect(0, 0, S, S);

    const g = c.createRadialGradient(C, C, 10, C, C, C);
    g.addColorStop(0, 'rgb(13,30,31)');
    g.addColorStop(0.72, 'rgb(5,14,15)');
    g.addColorStop(1, 'rgb(2,7,8)');
    c.fillStyle = g;
    c.beginPath(); c.arc(C, C, C - 4, 0, Math.PI * 2); c.fill();

    c.save();
    c.beginPath(); c.arc(C, C, C - 8, 0, Math.PI * 2); c.clip();

    // grid
    c.strokeStyle = 'rgba(120,200,190,0.055)';
    c.lineWidth = 1;
    for (let r = 40; r < C; r += 44) {
      c.beginPath(); c.arc(C, C, r, 0, Math.PI * 2); c.stroke();
    }
    c.beginPath(); c.moveTo(C, 0); c.lineTo(C, S); c.moveTo(0, C); c.lineTo(S, C); c.stroke();

    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toMap = (wx, wz) => {
      const dx = wx - p.position.x;
      const dz = wz - p.position.z;
      return [C + (dx * cos - dz * sin) * scale, C + (dx * sin + dz * cos) * scale];
    };

    // structures
    for (const box of this.world.mapBoxes) {
      if (box.tag === 'gate' && this.world.gate.isOpen) continue;
      if (box.tag === 'relay') continue;
      const w = box.maxX - box.minX;
      const d = box.maxZ - box.minZ;
      if (w < 0.4 && d < 0.4) continue;
      if (Math.abs((box.minX + box.maxX) / 2 - p.position.x) > 42) continue;
      if (Math.abs((box.minZ + box.maxZ) / 2 - p.position.z) > 42) continue;
      const pts = [
        toMap(box.minX, box.minZ), toMap(box.maxX, box.minZ),
        toMap(box.maxX, box.maxZ), toMap(box.minX, box.maxZ),
      ];
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
      if (box.tag === 'cover' || box.tag === 'container') {
        c.fillStyle = 'rgba(150,190,188,0.11)';
        c.strokeStyle = 'rgba(160,205,200,0.18)';
      } else if (box.tag === 'building') {
        c.fillStyle = 'rgba(125,170,167,0.24)';
        c.strokeStyle = 'rgba(165,215,205,0.34)';
      } else {
        c.fillStyle = 'rgba(120,160,160,0.16)';
        c.strokeStyle = 'rgba(160,205,200,0.28)';
      }
      c.fill(); c.lineWidth = 1; c.stroke();
    }

    // objective markers
    for (const r of this.world.relays) {
      if (r.active) continue;
      const [x, y] = toMap(r.pos.x, r.pos.z);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.fillStyle = '#ffb25f';
      c.shadowColor = '#ffb25f';
      c.shadowBlur = 10;
      c.fillRect(-5, -5, 10, 10);
      c.restore();
    }
    if (this.world.gate.isOpen) {
      const [x, y] = toMap(0, -33.7);
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2);
      c.strokeStyle = '#64ffb2'; c.lineWidth = 2; c.shadowColor = '#64ffb2'; c.shadowBlur = 10; c.stroke();
      c.shadowBlur = 0;
    }

    // enemies
    for (const e of game.enemies) {
      if (!e.active || !e.alive) continue;
      const dx = e.group.position.x - p.position.x;
      const dz = e.group.position.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 32) continue;
      if (!e.alerted && dist > 18) continue;
      const [x, y] = toMap(e.group.position.x, e.group.position.z);
      c.beginPath();
      c.arc(x, y, dist > 20 ? 2.2 : 3.2, 0, Math.PI * 2);
      c.fillStyle = e.elite ? '#ff7a42' : '#ff4052';
      c.shadowColor = c.fillStyle; c.shadowBlur = 8;
      c.fill();
      c.shadowBlur = 0;
    }

    // player arrow
    c.save();
    c.translate(C, C);
    c.fillStyle = '#a8ffe9';
    c.shadowColor = '#5cffd9';
    c.shadowBlur = 12;
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(7, 8);
    c.lineTo(0, 4);
    c.lineTo(-7, 8);
    c.closePath();
    c.fill();
    c.restore();

    c.restore();

    // outer tick marks
    c.strokeStyle = 'rgba(150,230,215,0.28)';
    c.lineWidth = 1;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r0 = C - 12;
      const r1 = C - (i % 4 === 0 ? 20 : 16);
      c.beginPath();
      c.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      c.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
      c.stroke();
    }
  }

  showPause(game) {
    this.el.pauseTime.textContent = fmtTime(game.missionTime);
    this.el.pauseKills.textContent = String(game.kills);
    this.el.pauseRelays.textContent = `${game.relaysDone} / 3`;
    if (this.el.pauseDiff) this.el.pauseDiff.textContent = game.diff.label;
  }

  showEnd(win, game) {
    document.body.classList.remove('low-health');
    this.el.damage.classList.remove('active');
    this.el.hitmarker.classList.remove('active', 'head');
    this.hidePrompt();
    this.el.endStatus.textContent = win ? '撤离完成' : '信号中断';
    this.el.endTitle.innerHTML = win ? '区域<span>肃清</span>' : '干员<span>阵亡</span>';
    this.el.endCopy.textContent = win
      ? '闸门已开。07 号区留在身后。雨还没有停，但任务已经结束。'
      : '哨兵守住了主泵区。07 号区仍旧一片黑暗，撤离闸门也没有打开。';
    this.el.endTime.textContent = fmtTime(game.missionTime);
    this.el.endKills.textContent = String(game.kills);
    this.el.endAcc.textContent = `${game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0}%`;
    this.el.endRelays.textContent = `${game.relaysDone} / 3`;
    if (this.el.endDiff) this.el.endDiff.textContent = game.diff.label;
    this.el.endSeed.textContent = win ? '模拟完成' : '行动终止';
    this.setState(win ? 'won' : 'dead');
  }
}
