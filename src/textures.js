import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Procedural texture factory — every pixel is generated in code.     */
/* ------------------------------------------------------------------ */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ANISO = 8;

function tex(canvas, repeatX = 1, repeatY = 1, srgb = true, clamp = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = MAX_ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function addGrain(ctx, w, h, amount, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function normalFromHeight(height, w, h, strength = 2.2) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = at(x - 1, y), r = at(x + 1, y);
      const u = at(x, y - 1), dn = at(x, y + 1);
      let nx = (l - r) * strength;
      let ny = (u - dn) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function blob(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.55, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */

export function asphaltTextures() {
  const S = 1024;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(7734);

  ctx.fillStyle = '#20272a';
  ctx.fillRect(0, 0, S, S);

  // coarse aggregate
  for (let i = 0; i < 25000; i++) {
    const x = rng() * S, y = rng() * S;
    const v = 18 + rng() * 55;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 5},${0.16 + rng() * 0.25})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  // tar seams
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(7,10,11,${0.35 + rng() * 0.3})`;
    ctx.lineWidth = 1.5 + rng() * 4;
    ctx.beginPath();
    let x = rng() * S, y = 0;
    ctx.moveTo(x, y);
    while (y < S) {
      x += (rng() - 0.5) * 34;
      y += 18 + rng() * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // wet sheen variations
  for (let i = 0; i < 26; i++) {
    blob(ctx, rng() * S, rng() * S, 34 + rng() * 150, 'rgba(78,101,110,0.22)', 0.5);
  }
  // oil stains
  for (let i = 0; i < 7; i++) {
    blob(ctx, rng() * S, rng() * S, 24 + rng() * 70, 'rgba(2,4,5,0.55)', 0.6);
  }
  addGrain(ctx, S, S, 16, 99);

  // roughness map — wet asphalt with dark glassy puddle patches
  const rc = makeCanvas(S);
  const rctx = rc.getContext('2d', { willReadFrequently: true });
  rctx.fillStyle = '#858585';
  rctx.fillRect(0, 0, S, S);
  const prng = mulberry32(5521);
  for (let i = 0; i < 34; i++) {
    blob(rctx, prng() * S, prng() * S, 24 + prng() * 120, 'rgba(18,18,18,0.9)', 0.8);
  }
  for (let i = 0; i < 4800; i++) {
    const v = 90 + prng() * 100;
    rctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
    rctx.fillRect(prng() * S, prng() * S, 2, 2);
  }

  // height / normal map
  const height = new Float32Array(S * S);
  const hc = makeCanvas(S);
  const hctx = hc.getContext('2d', { willReadFrequently: true });
  hctx.fillStyle = '#777';
  hctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 18000; i++) {
    const v = 80 + rng() * 90;
    hctx.fillStyle = `rgb(${v},${v},${v})`;
    hctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
  const hdata = hctx.getImageData(0, 0, S, S).data;
  for (let i = 0; i < height.length; i++) height[i] = hdata[i * 4] / 255;

  return {
    map: tex(c, 12, 12),
    roughnessMap: tex(rc, 12, 12, false),
    normalMap: tex(normalFromHeight(height, S, S, 2.4), 12, 12, false),
  };
}

export function concreteTextures(tint = '#5a6162', repeat = 2) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(tint.length * 1789 + 42);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4800; i++) {
    const v = 65 + rng() * 75;
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 3},${0.06 + rng() * 0.12})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 3);
  }
  for (let i = 0; i < 20; i++) {
    blob(ctx, rng() * S, rng() * S, 26 + rng() * 110, 'rgba(8,11,12,0.25)', 0.5);
  }
  // damp streaks
  for (let i = 0; i < 24; i++) {
    const x = rng() * S;
    const grad = ctx.createLinearGradient(x, 0, x, S);
    grad.addColorStop(0, 'rgba(5,8,9,0)');
    grad.addColorStop(0.35, `rgba(5,8,9,${0.08 + rng() * 0.15})`);
    grad.addColorStop(1, 'rgba(5,8,9,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 3 + rng() * 14, S);
  }
  // panel grooves
  ctx.strokeStyle = 'rgba(15,18,19,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();

  const rc = makeCanvas(S);
  const rctx = rc.getContext('2d', { willReadFrequently: true });
  rctx.fillStyle = '#bcbcbc';
  rctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    blob(rctx, rng() * S, rng() * S, 20 + rng() * 90, 'rgba(55,55,55,0.7)', 0.7);
  }

  const height = new Float32Array(S * S);
  const hc = makeCanvas(S);
  const hctx = hc.getContext('2d', { willReadFrequently: true });
  const hdata = ctx.getImageData(0, 0, S, S).data;
  for (let i = 0; i < height.length; i++) height[i] = hdata[i * 4] / 255;

  return {
    map: tex(c, repeat, repeat),
    roughnessMap: tex(rc, repeat, repeat, false),
    normalMap: tex(normalFromHeight(height, S, S, 1.5), repeat, repeat, false),
  };
}

export function metalTextures(base = '#4b5254', repeat = 2) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(base.length * 991 + 8);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // brushed streaks
  for (let i = 0; i < 3200; i++) {
    const y = rng() * S;
    const v = 40 + rng() * 100;
    ctx.strokeStyle = `rgba(${v},${v + 3},${v + 4},${0.06 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(rng() * S, y);
    ctx.lineTo(rng() * S, y + (rng() - 0.5) * 1.5);
    ctx.stroke();
  }
  // rust blooms
  for (let i = 0; i < 20; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${90 + rng() * 40},${38 + rng() * 20},${18},0.45)`);
    g.addColorStop(1, 'rgba(60,25,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // rivets
  for (let x = 16; x < S; x += 64) {
    for (let y = 16; y < S; y += 64) {
      ctx.fillStyle = 'rgba(20,24,25,0.9)';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(130,140,140,0.55)';
      ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  addGrain(ctx, S, S, 10, 29);

  const rc = makeCanvas(S);
  const rctx = rc.getContext('2d', { willReadFrequently: true });
  rctx.fillStyle = '#8d8d8d';
  rctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) {
    blob(rctx, rng() * S, rng() * S, 12 + rng() * 50, 'rgba(40,40,40,0.8)', 0.6);
  }
  const data = ctx.getImageData(0, 0, S, S).data;
  const height = new Float32Array(S * S);
  for (let i = 0; i < height.length; i++) height[i] = data[i * 4] / 255;

  return {
    map: tex(c, repeat, repeat),
    roughnessMap: tex(rc, repeat, repeat, false),
    normalMap: tex(normalFromHeight(height, S, S, 0.9), repeat, repeat, false),
  };
}

export function containerTexture(rgb = '54,72,76', repeatX = 3, repeatY = 1) {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(rgb.charCodeAt(0) * 313 + 17);
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.fillRect(0, 0, W, H);

  // corrugated ribs
  for (let x = 0; x < W; x += 18) {
    const g = ctx.createLinearGradient(x, 0, x + 18, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.32)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 18, H);
  }
  // grime and rust
  for (let i = 0; i < 90; i++) {
    const x = rng() * W, y = rng() * H;
    const r = 2 + rng() * 26;
    blob(ctx, x, y, r, `rgba(${60 + rng() * 40},${30 + rng() * 25},${15},0.3)`, 0.5);
  }
  for (let i = 0; i < 30; i++) {
    const x = rng() * W;
    const g = ctx.createLinearGradient(x, 0, x, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(x, rng() * H * 0.3, 1 + rng() * 5, H);
  }
  // stencilled code
  ctx.save();
  ctx.translate(W * 0.64, H * 0.46);
  ctx.rotate(-0.02);
  const cjkFont = '"Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
  ctx.font = `700 30px ${cjkFont}`;
  ctx.fillStyle = 'rgba(195,205,195,0.48)';
  ctx.fillText('货柜 ' + (100 + Math.floor(rng() * 899)), 0, 0);
  ctx.font = `500 15px ${cjkFont}`;
  ctx.fillStyle = 'rgba(195,205,195,0.35)';
  ctx.fillText('载重 // 24.7 吨', 2, 25);
  ctx.restore();
  // door seams
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.beginPath();
  ctx.moveTo(W * 0.5, 6); ctx.lineTo(W * 0.5, H - 6);
  ctx.stroke();
  addGrain(ctx, W, H, 12, 17);

  const data = ctx.getImageData(0, 0, W, H).data;
  const height = new Float32Array(W * H);
  for (let i = 0; i < height.length; i++) height[i] = data[i * 4] / 255;

  return {
    map: tex(c, repeatX, repeatY),
    normalMap: tex(normalFromHeight(height, W, H, 1.2), repeatX, repeatY, false),
    roughnessMap: tex(c, repeatX, repeatY, false),
  };
}

export function hazardTexture(repeatX = 2, repeatY = 2) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#b78c19';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#111413';
  for (let i = -S; i < S * 2; i += 46) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + 23, 0);
    ctx.lineTo(i + 23 + S, S); ctx.lineTo(i + S, S);
    ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const v = 20 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  return tex(c, repeatX, repeatY);
}

export function softParticleTexture() {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, 1, 1, true, true);
}

export function smokeTexture() {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(9182);
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.45, 'rgba(230,240,245,0.18)');
  g.addColorStop(1, 'rgba(220,235,245,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rng() * S, y = rng() * S, r = 3 + rng() * 18;
    blob(ctx, x, y, r, 'rgba(235,245,250,0.12)', 0.6);
  }
  return tex(c, 1, 1, true, true);
}

export function decalTexture() {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(4004);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(4,5,6,1)');
  g.addColorStop(0.2, 'rgba(5,6,7,0.95)');
  g.addColorStop(0.45, 'rgba(8,9,10,0.55)');
  g.addColorStop(1, 'rgba(10,12,13,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(160,175,180,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * 6, S / 2 + Math.sin(a) * 6);
    ctx.lineTo(S / 2 + Math.cos(a) * (18 + rng() * 30), S / 2 + Math.sin(a) * (18 + rng() * 30));
    ctx.stroke();
  }
  return tex(c, 1, 1, true, true);
}

export function rippleNormalTexture() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const rng = mulberry32(6123);
  const drops = [];
  for (let i = 0; i < 12; i++) drops.push([rng() * S, rng() * S, 16 + rng() * 46]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let nx = 0, ny = 0;
      for (const [dx, dy, r] of drops) {
        const vx = ((x - dx + S * 1.5) % S) - S / 2;
        const vy = ((y - dy + S * 1.5) % S) - S / 2;
        const dist = Math.hypot(vx, vy);
        const ring = Math.sin(dist * 0.55) * Math.exp(-dist / r) * 0.5;
        nx += (vx / (dist + 0.001)) * ring;
        ny += (vy / (dist + 0.001)) * ring;
      }
      const len = Math.hypot(nx, ny, 1) || 1;
      const i = (y * S + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, 2, 2, false);
}

export function neonSignTexture(text, sub, color, w = 512, h = 1024) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.min(h * 0.24, (w * 1.8) / Math.max(text.length, 4));
  ctx.font = `700 ${size}px "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif`;
  ctx.shadowColor = color;
  ctx.shadowBlur = 42;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, -size * 0.1);
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.7;
  ctx.fillText(text, 0, -size * 0.1);
  ctx.globalAlpha = 1;
  if (sub) {
    ctx.font = `500 ${size * 0.22}px "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowBlur = 18;
    ctx.fillText(sub, 0, size * 0.72);
  }
  ctx.restore();

  // frame glow
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.strokeRect(13, 13, w - 26, h - 26);
  ctx.globalAlpha = 1;
  return tex(c, 1, 1, true, true);
}

export function screenTexture(title, color = '#72f5d1') {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#03090a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  for (let y = 0; y < H; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  const cjk = '"Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
  ctx.font = `700 27px ${cjk}`;
  ctx.shadowColor = color; ctx.shadowBlur = 16;
  ctx.fillText(title, 28, 54);
  ctx.font = `500 15px ${cjk}`;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 6; i++) {
    ctx.fillText(`${['系统', '电源', '网络', '辅助', '电网', '锁定'][i]}  ${['正常', '87%', '连接', '待机', '故障', '开启'][i]}`, 28, 96 + i * 23);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W - 100, 40); ctx.lineTo(W - 40, 40); ctx.lineTo(W - 40, 100); ctx.stroke();
  return tex(c, 1, 1, true, true);
}

export function glowSpriteTexture(color = 'rgba(130,240,255,1)') {
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.25)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, 1, 1, true, true);
}

export function markerTexture(letter, color = '#a8ffe8') {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = '700 100px "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(letter, S / 2, S / 2 + 4);
  return tex(c, 1, 1, true, true);
}

export function extractionSignTexture() {
  const W = 512, H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#06110e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#5cffb2';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.font = '700 62px "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7dffbe';
  ctx.shadowColor = '#5cffb2';
  ctx.shadowBlur = 24;
  ctx.fillText('撤 离 点', W / 2, H / 2 - 4);
  return tex(c, 1, 1, true, true);
}

export function ventGrateTexture() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#1a2021';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#050707';
  for (let y = 12; y < S; y += 28) ctx.fillRect(10, y, S - 20, 15);
  ctx.strokeStyle = '#4d5658';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, S - 8, S - 8);
  return tex(c, 1, 1, true);
}

export function chainlinkTexture() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(150,165,168,0.7)';
  ctx.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 22) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + S, 0); ctx.lineTo(i, S); ctx.stroke();
  }
  return tex(c, 1, 1, true);
}

export function wetReflectionTexture(color = 'rgba(255,90,190,1)', w = 128, h = 512) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color.replace(/[\d.]+\)$/, '0.0)'));
  g.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(0.7, color.replace(/[\d.]+\)$/, '0.2)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0.0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = mulberry32(221);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = color.replace(/[\d.]+\)$/, `${0.04 + rng() * 0.14})`);
    const x = rng() * w;
    const y = rng() * h;
    ctx.fillRect(x, y, 1 + rng() * 4, 8 + rng() * 90);
  }
  return tex(c, 1, 1, true, true);
}

export function cityWindowsTexture(seed = 44) {
  const W = 128, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(seed);
  ctx.fillStyle = '#020507';
  ctx.fillRect(0, 0, W, H);
  const cols = 8, rows = 24;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rng() < 0.26) {
        const warm = rng() < 0.55;
        const a = 0.12 + rng() * 0.5;
        ctx.fillStyle = warm ? `rgba(255,190,110,${a})` : `rgba(120,200,220,${a})`;
        const w = 10 + rng() * 5, h = 8 + rng() * 5;
        ctx.fillRect(x * (W / cols) + 8, y * (H / rows) + 5, w, h);
      }
    }
  }
  // vertical grime
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.15})`;
    ctx.fillRect(rng() * W, 0, 1 + rng() * 8, H);
  }
  return tex(c, 2, 4, true);
}

export function puddleAlphaTexture(seed = 3021) {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  const rng = mulberry32(seed);
  // overlapping soft blobs make an irregular, non-circular water shape
  for (let i = 0; i < 9; i++) {
    const x = S * 0.28 + rng() * S * 0.44;
    const y = S * 0.28 + rng() * S * 0.44;
    const r = S * (0.14 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.96)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c, 1, 1, false, true);
}

export function stencilTexture(text, sub = '', color = '#d8503f', w = 512, h = 256, seed = 1) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const rng = mulberry32(seed * 419 + 17);
  ctx.clearRect(0, 0, w, h);
  const family = '"Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';
  const size = sub ? h * 0.43 : h * 0.64;
  ctx.save();
  ctx.translate(w / 2, h * 0.46);
  ctx.rotate((rng() - 0.5) * 0.045);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${family}`;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(12,16,15,0.55)';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.globalAlpha = 0.82;
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = `500 ${Math.round(h * 0.11)}px ${family}`;
    ctx.globalAlpha = 0.68;
    ctx.fillText(sub, 0, h * 0.29);
  }
  ctx.restore();
  // paint speckle, drips and scratches
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    const x = rng() * w, y = rng() * h;
    ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }
  for (let i = 0; i < 9; i++) {
    const x = w * 0.2 + rng() * w * 0.6;
    const y = h * 0.55 + rng() * h * 0.1;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 + rng() * 0.2;
    ctx.fillRect(x, y, 1 + rng() * 2, 5 + rng() * 24);
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.15 + rng() * 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 8, 1 + rng() * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return tex(c, 1, 1, true, true);
}
