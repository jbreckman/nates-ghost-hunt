import * as THREE from 'three';

// All textures are drawn procedurally onto canvases at startup: no asset downloads.

let maxAniso = 4;
export function setMaxAnisotropy(n: number) {
  maxAniso = Math.min(8, n);
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Small deterministic RNG so the house looks the same every time.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number, seed = 1) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function woodFloor(base = '#6b4428', seed = 3) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  const plankH = S / 8;
  const col = new THREE.Color(base);
  for (let i = 0; i < 8; i++) {
    const v = 0.8 + r() * 0.35;
    const cc = col.clone().multiplyScalar(v);
    ctx.fillStyle = `#${cc.getHexString()}`;
    ctx.fillRect(0, i * plankH, S, plankH);
    // grain
    ctx.strokeStyle = 'rgba(30,15,5,0.25)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 7; g++) {
      ctx.beginPath();
      const y = i * plankH + r() * plankH;
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + g) * 2.5);
      ctx.stroke();
    }
    // plank seams
    ctx.fillStyle = 'rgba(15,6,2,0.8)';
    ctx.fillRect(0, i * plankH, S, 3);
    const off = r() * S;
    ctx.fillRect(off, i * plankH, 3, plankH);
    ctx.fillRect((off + S / 2) % S, i * plankH, 3, plankH);
  }
  noise(ctx, S, S, 18, seed);
  return toTex(c);
}

export function checkerFloor(a = '#e8e0f0', b = '#1c1826', tiles = 4) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const t = S / tiles;
  for (let y = 0; y < tiles; y++)
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x * t, y * t, t, t);
    }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * t, 0);
    ctx.lineTo(i * t, S);
    ctx.moveTo(0, i * t);
    ctx.lineTo(S, i * t);
    ctx.stroke();
  }
  noise(ctx, S, S, 14, 9);
  return toTex(c);
}

export function marbleFloor() {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(7);
  const t = S / 2;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#bfb8b0' : '#8d8680';
      ctx.fillRect(x * t, y * t, t, t);
    }
  for (let v = 0; v < 22; v++) {
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '255,255,255' : '40,35,35'},${0.15 + r() * 0.2})`;
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    let x = r() * S,
      y = r() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (r() - 0.5) * 70;
      y += (r() - 0.3) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, t, t);
  ctx.strokeRect(t, t, t, t);
  ctx.strokeRect(t, 0, t, t);
  ctx.strokeRect(0, t, t, t);
  noise(ctx, S, S, 10, 7);
  return toTex(c);
}

export function carpet(base: string, accent: string) {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = accent;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const cx = x * 64 + 32 + (y % 2) * 32,
        cy = y * 64 + 32;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx, cy + 10);
      ctx.lineTo(cx - 10, cy);
      ctx.fill();
    }
  noise(ctx, S, S, 30, 4);
  return toTex(c);
}

export function kitchenTile() {
  const S = 256;
  const { c, ctx } = canvas(S);
  const t = S / 8;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#d8d2b8' : '#4f7a5a';
      ctx.fillRect(x * t, y * t, t, t);
    }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * t, 0);
    ctx.lineTo(i * t, S);
    ctx.moveTo(0, i * t);
    ctx.lineTo(S, i * t);
    ctx.stroke();
  }
  noise(ctx, S, S, 16, 5);
  return toTex(c);
}

export function stoneFloor() {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(11);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, S, S);
  const rows = 6;
  const h = S / rows;
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -h / 2 : 0;
    while (x < S) {
      const w = h * (0.8 + r() * 0.8);
      const g = 90 + r() * 40;
      ctx.fillStyle = `rgb(${g * 0.9},${g},${g * 0.92})`;
      ctx.fillRect(x + 3, y * h + 3, w - 6, h - 6);
      x += w;
    }
  }
  noise(ctx, S, S, 22, 11);
  return toTex(c);
}

export type WallStyle = 'damask' | 'stripes' | 'dots' | 'diamonds' | 'stars';
export function wallpaper(base: string, accent: string, style: WallStyle) {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  if (style === 'stripes') {
    for (let x = 0; x < S; x += 32) {
      ctx.fillRect(x, 0, 12, S);
      ctx.fillRect(x + 18, 0, 3, S);
    }
  } else if (style === 'dots') {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.beginPath();
        ctx.arc(x * 32 + 16 + (y % 2) * 16, y * 32 + 16, 4, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (style === 'diamonds') {
    ctx.lineWidth = 3;
    for (let i = -S; i < S * 2; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + S, S);
      ctx.moveTo(i, S);
      ctx.lineTo(i + S, 0);
      ctx.stroke();
    }
  } else if (style === 'stars') {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cx = x * 64 + 32 + (y % 2) * 32,
          cy = y * 64 + 32;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? 5 : 12;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.fill();
      }
  } else {
    // damask-ish fleur shapes
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const cx = x * 128 + 64 + (y % 2) * 64,
          cy = y * 128 + 64;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 16, 34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - 22, cy + 10, 10, 18, -0.6, 0, Math.PI * 2);
        ctx.ellipse(cx + 22, cy + 10, 10, 18, 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
      }
  }
  // wainscot-ish darker bottom band (texture v=0 is bottom)
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 16, 2);
  return toTex(c);
}

export function rugTex(a: string, b: string, trim: string) {
  const S = 256;
  const { c, ctx } = canvas(S, S / 2);
  const W = S,
    H = S / 2;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 50, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = b;
    const x = i < 2 ? 50 : W - 50,
      y = i % 2 ? 42 : H - 42;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, W, H, 24, 8);
  return toTex(c, false);
}

export function booksTex() {
  const W = 256,
    H = 256;
  const { c, ctx } = canvas(W, H);
  const r = rng(21);
  ctx.fillStyle = '#2a170c';
  ctx.fillRect(0, 0, W, H);
  const shelves = 4;
  const sh = H / shelves;
  const colors = ['#7a1f2b', '#2f5a3a', '#2b3f73', '#6b4a1f', '#4b2a6a', '#8a6a2a', '#1f4f55', '#5a2a1a'];
  for (let s = 0; s < shelves; s++) {
    let x = 4;
    while (x < W - 6) {
      const bw = 6 + r() * 10;
      const bh = sh * (0.6 + r() * 0.32);
      if (r() < 0.07) {
        x += bw;
        continue;
      }
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.fillRect(x, s * sh + sh - bh - 6, bw - 1, bh);
      ctx.fillStyle = 'rgba(230,200,120,0.6)';
      ctx.fillRect(x + 1, s * sh + sh - bh + 4, bw - 3, 2);
      x += bw;
    }
    ctx.fillStyle = '#4a2e1c';
    ctx.fillRect(0, s * sh + sh - 6, W, 6);
  }
  noise(ctx, W, H, 14, 21);
  return toTex(c, false);
}

export function portraitTex(kind: number) {
  const W = 128,
    H = 160;
  const { c, ctx } = canvas(W, H);
  const bgs = ['#2c3a2a', '#3a2433', '#23303f', '#3a3020'];
  ctx.fillStyle = bgs[kind % bgs.length];
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 90);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (kind === 2) {
    // a spooky black cat
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(64, 110, 36, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 64, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(42, 52);
    ctx.lineTo(46, 26);
    ctx.lineTo(58, 42);
    ctx.moveTo(86, 52);
    ctx.lineTo(82, 26);
    ctx.lineTo(70, 42);
    ctx.fill();
    ctx.fillStyle = '#e8e040';
    ctx.beginPath();
    ctx.ellipse(54, 62, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(74, 62, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(53, 58, 2, 8);
    ctx.fillRect(73, 58, 2, 8);
  } else {
    // stern old-timey person
    const coat = ['#1a1a22', '#3a0f18', '#1f2a1a', '#222'][kind % 4];
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(64, 150, 50, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.moveTo(52, 108);
    ctx.lineTo(64, 132);
    ctx.lineTo(76, 108);
    ctx.fill();
    ctx.fillStyle = '#c8a888';
    ctx.beginPath();
    ctx.ellipse(64, 72, 24, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = kind === 1 ? '#6a6a6a' : '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(64, 50, 26, 14, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (kind === 1) {
      ctx.beginPath();
      ctx.ellipse(40, 80, 8, 26, 0, 0, Math.PI * 2);
      ctx.ellipse(88, 80, 8, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // eyes: creepy, looking sideways
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(54, 70, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(74, 70, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(56.5, 70, 2.2, 0, Math.PI * 2);
    ctx.arc(76.5, 70, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6a3a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 88);
    ctx.lineTo(72, 88);
    ctx.stroke();
    if (kind === 0 || kind === 3) {
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(58, 83, 8, 3, 0.2, 0, Math.PI * 2);
      ctx.ellipse(70, 83, 8, 3, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  noise(ctx, W, H, 20, kind + 30);
  return toTex(c, false);
}

export function cobwebTex() {
  const W = 256,
    H = 180;
  const { c, ctx } = canvas(W, H);
  ctx.strokeStyle = 'rgba(235,235,245,0.85)';
  ctx.lineWidth = 1.5;
  const cx = W / 2;
  const spokes = 9;
  const ang = (i: number) => (i / (spokes - 1)) * Math.PI;
  for (let i = 0; i < spokes; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx + Math.cos(ang(i)) * W, Math.sin(ang(i)) * W);
    ctx.stroke();
  }
  for (let r = 18; r < H * 1.1; r += 20) {
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const x = cx + Math.cos(ang(i)) * r,
        y = Math.sin(ang(i)) * r;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const pa = ang(i - 0.5);
        ctx.quadraticCurveTo(cx + Math.cos(pa) * r * 0.88, Math.sin(pa) * r * 0.88, x, y);
      }
    }
    ctx.stroke();
  }
  // fade out toward the bottom so the web edge isn't a hard line
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return toTex(c, false);
}

export function windowTex() {
  const W = 128,
    H = 192;
  const { c, ctx } = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2a5a');
  g.addColorStop(1, '#3a4a7a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const r = rng(4);
  for (let i = 0; i < 20; i++) ctx.fillRect(r() * W, r() * H * 0.6, 1.5, 1.5);
  ctx.fillStyle = '#f4f0d0';
  ctx.beginPath();
  ctx.arc(88, 44, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2a5a';
  ctx.beginPath();
  ctx.arc(80, 40, 14, 0, Math.PI * 2);
  ctx.fill();
  // spooky tree silhouette
  ctx.strokeStyle = '#0a0a14';
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, l: number, w: number) => {
    if (l < 6) return;
    const x2 = x + Math.cos(a) * l,
      y2 = y + Math.sin(a) * l;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    branch(x2, y2, a - 0.5, l * 0.7, w * 0.65);
    branch(x2, y2, a + 0.45, l * 0.65, w * 0.65);
  };
  branch(30, H, -Math.PI / 2, 60, 8);
  // frame bars
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 8, W, 8);
  ctx.fillRect(0, 0, 8, H);
  ctx.fillRect(W - 8, 0, 8, H);
  ctx.fillRect(W / 2 - 3, 0, 6, H);
  ctx.fillRect(0, H / 2 - 3, W, 6);
  return toTex(c, false);
}

export function glowTex() {
  const S = 64;
  const { c, ctx } = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function starTex() {
  const S = 64;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? 11 : 28;
    ctx.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr);
  }
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export function faceTex(kind: 'pumpkin') {
  const S = 128;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  if (kind === 'pumpkin') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(30, 50);
    ctx.lineTo(48, 50);
    ctx.lineTo(39, 32);
    ctx.moveTo(80, 50);
    ctx.lineTo(98, 50);
    ctx.lineTo(89, 32);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 70);
    for (let i = 0; i <= 8; i++) ctx.lineTo(26 + i * 9.5, i % 2 ? 82 : 72);
    ctx.lineTo(102, 70);
    ctx.quadraticCurveTo(64, 112, 26, 70);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}
