import * as THREE from 'three';
import type { Grid, RoomDef } from './layout';
import * as T from './textures';

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const L = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });
const Basic = (color: string) => new THREE.MeshBasicMaterial({ color });

export function makeMats() {
  const cobweb = new THREE.MeshBasicMaterial({
    map: T.cobwebTex(),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  cobweb.userData.noCast = true;
  const m = {
    woodDark: L('#3b2416'),
    wood: L('#6b4228'),
    woodLight: L('#9a6a3e'),
    woodRed: L('#5a2418'),
    black: L('#1c1a20'),
    white: L('#e6e0d0'),
    cream: L('#d8ceb0'),
    metal: L('#9aa0aa'),
    brass: L('#c09a40', { emissive: '#2a1a00' }),
    iron: L('#34343c'),
    red: L('#8a2230'),
    green: L('#2f6a3a'),
    purple: L('#5b3480'),
    blue: L('#2b4f8a'),
    teal: L('#2c7a7a'),
    pink: L('#c87a9a'),
    yellow: L('#d8b030'),
    wax: L('#f2ead4', { emissive: '#3a2a10' }),
    flame: Basic('#ffd070'),
    fire: Basic('#ff8a20'),
    fireCore: Basic('#ffe080'),
    slime: Basic('#7aff6a'),
    stone: L('#6a6a72'),
    stoneDark: L('#3e3e46'),
    leaf: L('#2e6f38'),
    leafDark: L('#1f4a26'),
    terracotta: L('#a8522e'),
    pumpkin: L('#f07a1c'),
    pumpkinGlow: Basic('#ffc040'),
    stem: L('#4a6a1a'),
    fur: L('#9a6a3a'),
    sheet: L('#e8e2d8'),
    blanket: L('#6a2a6a'),
    blanket2: L('#2a5a7a'),
    piano: L('#141218'),
    keys: L('#f4f0e8'),
    books: L('#ffffff', { map: T.booksTex() }),
    portraits: [0, 1, 2, 3].map((k) => L('#ffffff', { map: T.portraitTex(k) })),
    window: new THREE.MeshBasicMaterial({ map: T.windowTex(), color: '#9aa8ff' }),
    cobweb,
    rugs: [
      L('#ffffff', { map: T.rugTex('#6a1a22', '#2a1a3a', '#c8a040') }),
      L('#ffffff', { map: T.rugTex('#1f3a5a', '#6a1a22', '#d8c890') }),
      L('#ffffff', { map: T.rugTex('#3a2a4a', '#1f4a3a', '#c8a040') }),
    ],
    floors: {} as Record<string, THREE.MeshLambertMaterial>,
  };
  for (const r of m.rugs) r.userData.noCast = true;
  for (const k of ['flame', 'fire', 'fireCore', 'slime', 'pumpkinGlow'] as const) m[k].userData.noCast = true;
  m.window.userData.noCast = true;
  return m;
}
export type Mats = ReturnType<typeof makeMats>;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  size: number;
  flicker: number;
}
export interface LightAnchor {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}
export interface Haunted {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  name: string;
  cooldown: number;
}
export type Updater = (t: number, dt: number) => void;

export class Builder {
  root = new THREE.Group(); // static, gets baked
  dynamicRoot = new THREE.Group();
  updaters: Updater[] = [];
  glows: GlowPoint[] = [];
  anchors: LightAnchor[] = [];
  haunted: Haunted[] = [];
  constructor(public grid: Grid, public m: Mats) {}

  /** Create a prop group at world x,z; rot is radians (0 = front faces +z / south). */
  place(x: number, z: number, rot = 0, dynamic = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    (dynamic ? this.dynamicRoot : this.root).add(g);
    return g;
  }

  /** Mark a world-space rectangle (w along local x, d along local z) as solid. */
  block(x: number, z: number, w: number, d: number, rot = 0) {
    // slightly smaller than the visuals so you can squeeze past things
    this.grid.addBox(x, z, Math.max(0.1, w / 2 - 0.05), Math.max(0.1, d / 2 - 0.05), rot);
  }

  glow(parent: THREE.Object3D, lx: number, ly: number, lz: number, color: string, size: number, flicker = 1) {
    parent.updateMatrixWorld(true);
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(parent.matrixWorld);
    this.glows.push({ x: v.x, y: v.y, z: v.z, color: new THREE.Color(color), size, flicker });
    return v;
  }

  anchor(parent: THREE.Object3D, lx: number, ly: number, lz: number, color: string, intensity = 1) {
    parent.updateMatrixWorld(true);
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(parent.matrixWorld);
    this.anchors.push({ pos: v, color: new THREE.Color(color), intensity });
  }
}

// primitive helpers ---------------------------------------------------------
function add(p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  p.add(mesh);
  return mesh;
}
export const box = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) =>
  add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
export const cyl = (p: THREE.Object3D, rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 12) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
export const sph = (p: THREE.Object3D, r: number, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12) => {
  const s = add(p, new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 2) / 3)), mat, x, y, z);
  s.scale.set(sx, sy, sz);
  return s;
};

// ---------------------------------------------------------------------------
// Prop library. All props face local +z. y=0 is floor.
// ---------------------------------------------------------------------------
export function table(b: Builder, x: number, z: number, w: number, d: number, h = 0.8, rot = 0, mat = b.m.wood) {
  const g = b.place(x, z, rot);
  box(g, w, 0.08, d, mat, 0, h, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.08, h, 0.08, b.m.woodDark, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1));
  b.block(x, z, w, d, rot);
  return g;
}

export function roundTable(b: Builder, x: number, z: number, r = 0.6, h = 0.78) {
  const g = b.place(x, z);
  cyl(g, r, r, 0.06, b.m.wood, 0, h, 0, 20);
  cyl(g, 0.06, 0.08, h, b.m.woodDark, 0, h / 2, 0);
  cyl(g, 0.35, 0.4, 0.05, b.m.woodDark, 0, 0.03, 0);
  b.block(x, z, r * 1.6, r * 1.6);
  return g;
}

export function chair(b: Builder, x: number, z: number, rot = 0, mat = b.m.red) {
  const g = b.place(x, z, rot);
  box(g, 0.5, 0.08, 0.5, mat, 0, 0.48, 0);
  box(g, 0.5, 0.7, 0.08, b.m.woodDark, 0, 0.85, -0.22);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 0.48, 0.06, b.m.woodDark, sx * 0.2, 0.24, sz * 0.2);
  b.block(x, z, 0.5, 0.5, rot);
  return g;
}

export function armchair(b: Builder, x: number, z: number, rot = 0, mat = b.m.green) {
  const g = b.place(x, z, rot);
  box(g, 1.0, 0.45, 0.9, mat, 0, 0.3, 0);
  box(g, 1.0, 0.9, 0.22, mat, 0, 0.75, -0.36);
  box(g, 0.2, 0.35, 0.9, mat, -0.44, 0.65, 0);
  box(g, 0.2, 0.35, 0.9, mat, 0.44, 0.65, 0);
  sph(g, 0.14, mat, -0.44, 0.84, 0.35);
  sph(g, 0.14, mat, 0.44, 0.84, 0.35);
  b.block(x, z, 1.0, 0.9, rot);
  return g;
}

export function candle(b: Builder, g: THREE.Object3D, x: number, y: number, z: number, h = 0.25) {
  cyl(g, 0.04, 0.045, h, b.m.wax, x, y + h / 2, z, 8);
  const f = sph(g, 0.035, b.m.flame, x, y + h + 0.05, z, 1, 1.8, 1, 8);
  b.glow(g, x, y + h + 0.06, z, '#ffb050', 0.55);
  return f;
}

export function candelabra(b: Builder, x: number, z: number, onTable = false, anchor = true) {
  const g = b.place(x, z);
  const base = onTable ? 0.84 : 0;
  const stemH = onTable ? 0.35 : 1.35;
  cyl(g, 0.12, 0.18, 0.06, b.m.brass, 0, base + 0.03, 0);
  cyl(g, 0.03, 0.04, stemH, b.m.brass, 0, base + stemH / 2, 0, 8);
  const top = base + stemH;
  box(g, 0.5, 0.03, 0.03, b.m.brass, 0, top, 0);
  for (const dx of [-0.24, 0, 0.24]) {
    cyl(g, 0.05, 0.03, 0.05, b.m.brass, dx, top + 0.03, 0, 8);
    candle(b, g, dx, top + 0.05, 0, dx === 0 ? 0.28 : 0.22);
  }
  if (anchor) b.anchor(g, 0, top + 0.5, 0, '#ffa04a', 1);
  if (!onTable) b.block(x, z, 0.4, 0.4);
  return g;
}

export function bookshelf(b: Builder, x: number, z: number, rot = 0, w = 2.4, dynamic = false) {
  const g = b.place(x, z, rot, dynamic);
  const h = 2.5,
    d = 0.55;
  box(g, w, h, d, b.m.woodDark, 0, h / 2, 0);
  const front = add(g, new THREE.PlaneGeometry(w - 0.16, h - 0.2), b.m.books, 0, h / 2, d / 2 + 0.005);
  front.receiveShadow = true;
  box(g, w + 0.1, 0.1, d + 0.08, b.m.wood, 0, h + 0.05, 0);
  b.block(x, z, w, d, rot);
  return g;
}

export function portrait(b: Builder, x: number, z: number, rot: number, kind: number, w = 0.9, h = 1.15, y = 1.75) {
  const g = b.place(x, z, rot);
  box(g, w + 0.16, h + 0.16, 0.06, b.m.brass, 0, y, 0.03);
  add(g, new THREE.PlaneGeometry(w, h), b.m.portraits[kind % 4], 0, y, 0.065);
  return g;
}

export function cobweb(b: Builder, x: number, z: number, rot: number, s = 1.2) {
  const g = b.place(x, z, rot);
  add(g, new THREE.PlaneGeometry(s * 1.4, s), b.m.cobweb, 0, 2.95 - s / 2, 0);
  return g;
}

export function rug(b: Builder, x: number, z: number, w: number, d: number, kind: number, rot = 0) {
  const g = b.place(x, z, rot);
  const p = add(g, new THREE.PlaneGeometry(w, d), b.m.rugs[kind % 3], 0, 0.012, 0);
  p.rotation.x = -Math.PI / 2;
  return g;
}

export function pumpkin(b: Builder, x: number, z: number, s = 1, rot = 0, y = 0) {
  const g = b.place(x, z, rot);
  g.position.y = y;
  const r = 0.26 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    sph(g, r * 0.62, b.m.pumpkin, Math.cos(a) * r * 0.42, r * 0.8, Math.sin(a) * r * 0.42, 1, 1.1, 1, 10);
  }
  cyl(g, 0.03 * s, 0.045 * s, 0.14 * s, b.m.stem, 0, r * 1.62, 0, 6);
  // carved face (glowing)
  const fz = r * 0.98;
  const eyeL = box(g, 0.08 * s, 0.07 * s, 0.05, b.m.pumpkinGlow, -0.09 * s, r * 0.95, fz);
  eyeL.rotation.z = 0.785;
  const eyeR = box(g, 0.08 * s, 0.07 * s, 0.05, b.m.pumpkinGlow, 0.09 * s, r * 0.95, fz);
  eyeR.rotation.z = 0.785;
  box(g, 0.2 * s, 0.05 * s, 0.05, b.m.pumpkinGlow, 0, r * 0.62, fz - 0.01);
  b.glow(g, 0, r * 0.8, r * 1.1, '#ff9a30', 0.8 * s, 0.6);
  b.block(x, z, r * 1.8, r * 1.8);
  return g;
}

export function armor(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 0.5, 0.1, 0.4, b.m.stoneDark, 0, 0.05, 0);
  for (const s of [-1, 1]) {
    cyl(g, 0.08, 0.07, 0.8, b.m.metal, s * 0.12, 0.5, 0, 8);
    cyl(g, 0.065, 0.07, 0.65, b.m.metal, s * 0.3, 1.25, 0, 8);
  }
  cyl(g, 0.2, 0.24, 0.3, b.m.metal, 0, 1.0, 0, 10);
  cyl(g, 0.28, 0.2, 0.55, b.m.metal, 0, 1.4, 0, 10);
  sph(g, 0.14, b.m.metal, -0.3, 1.62, 0);
  sph(g, 0.14, b.m.metal, 0.3, 1.62, 0);
  sph(g, 0.17, b.m.metal, 0, 1.86, 0, 1, 1.15, 1);
  box(g, 0.2, 0.03, 0.05, b.m.black, 0, 1.88, 0.15);
  cyl(g, 0.02, 0.02, 0.18, b.m.red, 0, 2.08, 0, 6);
  // spear
  cyl(g, 0.025, 0.025, 2.3, b.m.woodDark, 0.38, 1.15, 0.08, 6);
  const tip = add(g, new THREE.ConeGeometry(0.06, 0.25, 6), b.m.metal, 0.38, 2.4, 0.08);
  tip.rotation.set(0, 0, 0);
  b.block(x, z, 0.6, 0.5, rot);
  return g;
}

export function grandfatherClock(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  box(g, 0.7, 2.3, 0.45, b.m.woodRed, 0, 1.15, 0);
  box(g, 0.82, 0.14, 0.52, b.m.woodDark, 0, 2.35, 0);
  const face = add(g, new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20), b.m.cream, 0, 1.9, 0.23);
  face.rotation.x = Math.PI / 2;
  const handA = box(g, 0.02, 0.18, 0.01, b.m.black, 0, 1.97, 0.26);
  const handB = box(g, 0.02, 0.13, 0.01, b.m.black, 0.03, 1.87, 0.26);
  handB.rotation.z = -1.1;
  box(g, 0.44, 1.0, 0.02, b.m.black, 0, 1.05, 0.225);
  const pend = new THREE.Group();
  pend.position.set(0, 1.5, 0.25);
  g.add(pend);
  box(pend, 0.02, 0.7, 0.01, b.m.brass, 0, -0.35, 0);
  const bob = add(pend, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), b.m.brass, 0, -0.72, 0);
  bob.rotation.x = Math.PI / 2;
  b.updaters.push((t) => {
    pend.rotation.z = Math.sin(t * 2.2) * 0.25;
    handA.rotation.z = -t * 0.3;
  });
  b.block(x, z, 0.7, 0.45, rot);
  b.haunted.push({ obj: g, pos: g.position.clone(), name: 'clock', cooldown: 0 });
  return g;
}

export function wardrobe(b: Builder, x: number, z: number, rot = 0, mat = b.m.wood) {
  const g = b.place(x, z, rot, true);
  box(g, 1.6, 2.3, 0.65, mat, 0, 1.2, 0);
  box(g, 1.7, 0.12, 0.72, b.m.woodDark, 0, 2.38, 0);
  box(g, 0.02, 2.0, 0.02, b.m.black, 0, 1.2, 0.33);
  for (const s of [-1, 1]) sph(g, 0.04, b.m.brass, s * 0.1, 1.2, 0.34);
  for (const s of [-1, 1]) box(g, 0.1, 0.1, 0.1, b.m.woodDark, s * 0.7, 0.05, 0.25);
  b.block(x, z, 1.6, 0.65, rot);
  b.haunted.push({ obj: g, pos: g.position.clone(), name: 'wardrobe', cooldown: 0 });
  return g;
}

export function fridge(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  box(g, 0.9, 1.9, 0.7, b.m.cream, 0, 0.95, 0);
  sph(g, 0.45, b.m.cream, 0, 1.9, 0, 1, 0.3, 0.78);
  box(g, 0.88, 0.02, 0.02, b.m.iron, 0, 1.3, 0.36);
  box(g, 0.05, 0.4, 0.06, b.m.metal, 0.33, 1.05, 0.38);
  b.block(x, z, 0.9, 0.7, rot);
  b.haunted.push({ obj: g, pos: g.position.clone(), name: 'fridge', cooldown: 0 });
  return g;
}

export function toyChest(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  box(g, 1.3, 0.6, 0.7, b.m.blue, 0, 0.3, 0);
  const lid = box(g, 1.34, 0.12, 0.74, b.m.red, 0, 0.66, 0);
  lid.name = 'lid';
  box(g, 0.2, 0.2, 0.04, b.m.yellow, 0, 0.45, 0.36);
  b.block(x, z, 1.3, 0.7, rot);
  b.haunted.push({ obj: g, pos: g.position.clone(), name: 'toychest', cooldown: 0 });
  return g;
}

export function fireplace(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 2.6, 1.6, 0.7, b.m.stone, 0, 0.8, 0);
  box(g, 2.9, 0.15, 0.85, b.m.woodDark, 0, 1.65, 0.05);
  box(g, 1.5, 1.0, 0.1, b.m.black, 0, 0.55, 0.31);
  box(g, 3.0, 0.08, 1.2, b.m.stoneDark, 0, 0.04, 0.4);
  // logs
  for (const s of [-1, 1]) {
    const l = cyl(g, 0.08, 0.08, 1.0, b.m.woodDark, 0, 0.18, 0.2 + s * 0.08, 8);
    l.rotation.z = Math.PI / 2 + s * 0.15;
  }
  candle(b, g, -1.0, 1.73, 0.05, 0.3);
  candle(b, g, 1.0, 1.73, 0.05, 0.3);
  b.glow(g, 0, 0.5, 0.45, '#ff7020', 3.2, 1.3);
  b.anchor(g, 0, 0.8, 1.2, '#ff7a30', 1.4);
  b.block(x, z, 2.9, 0.9, rot);
  // flickering flames (dynamic)
  const flames = b.place(x, z, rot, true);
  const fl: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = add(flames, new THREE.ConeGeometry(0.16 - i * 0.02, 0.6, 7), i === 1 ? b.m.fireCore : b.m.fire, (i - 1) * 0.22, 0.5, 0.22);
    fl.push(f);
  }
  b.updaters.push((t) => {
    fl.forEach((f, i) => {
      f.scale.y = 0.8 + Math.sin(t * (9 + i * 3) + i) * 0.2 + Math.sin(t * 23 + i) * 0.08;
      f.position.y = 0.3 + f.scale.y * 0.3;
    });
  });
  return g;
}

export function piano(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 1.6, 0.4, 2.0, b.m.piano, 0, 0.9, 0);
  sph(g, 0.8, b.m.piano, 0, 0.9, -1.0, 1, 0.25, 0.7);
  const lid = box(g, 1.5, 0.04, 1.8, b.m.piano, 0.2, 1.5, -0.3);
  lid.rotation.z = 0.5;
  box(g, 0.04, 0.6, 0.04, b.m.black, -0.5, 1.3, -0.3);
  box(g, 1.4, 0.06, 0.25, b.m.keys, 0, 0.98, 1.05);
  for (let i = 0; i < 9; i++) box(g, 0.05, 0.05, 0.13, b.m.black, -0.6 + i * 0.15, 1.03, 1.0);
  for (const [lx, lz] of [[-0.65, 0.8], [0.65, 0.8], [0, -1.4]]) cyl(g, 0.06, 0.05, 0.72, b.m.piano, lx, 0.36, lz, 8);
  box(g, 1.0, 0.45, 0.35, b.m.piano, 0, 0.23, 1.6); // bench
  b.block(x, z, 1.7, 2.6, rot);
  const cz = 0.3;
  b.block(x + Math.sin(rot) * 1.6, z + Math.cos(rot) * 1.6, 1.0, 0.4, rot);
  void cz;
  return g;
}

export function plant(b: Builder, x: number, z: number, s = 1) {
  const g = b.place(x, z);
  cyl(g, 0.28 * s, 0.2 * s, 0.45 * s, b.m.terracotta, 0, 0.225 * s, 0, 10);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    sph(g, 0.28 * s, i % 2 ? b.m.leaf : b.m.leafDark, Math.cos(a) * 0.18 * s, (0.7 + (i % 3) * 0.18) * s, Math.sin(a) * 0.18 * s);
  }
  b.block(x, z, 0.55 * s, 0.55 * s);
  return g;
}

export function deadTree(b: Builder, x: number, z: number) {
  const g = b.place(x, z);
  cyl(g, 1.1, 1.2, 0.45, b.m.stone, 0, 0.22, 0, 18);
  cyl(g, 1.0, 1.0, 0.02, b.m.woodDark, 0, 0.46, 0, 18);
  const branch = (parent: THREE.Object3D, len: number, r: number, depth: number) => {
    const seg = new THREE.Group();
    parent.add(seg);
    cyl(seg, r * 0.7, r, len, b.m.woodDark, 0, len / 2, 0, 6);
    if (depth > 0) {
      for (let i = 0; i < 2; i++) {
        const c = new THREE.Group();
        c.position.y = len * (0.75 + i * 0.2);
        c.rotation.set(0.6 * (i ? 1 : -1), i * 2.1 + depth, 0.5 * (i ? -1 : 1));
        seg.add(c);
        branch(c, len * 0.65, r * 0.6, depth - 1);
      }
    }
    return seg;
  };
  const trunk = new THREE.Group();
  trunk.position.y = 0.45;
  g.add(trunk);
  branch(trunk, 1.4, 0.2, 3);
  b.block(x, z, 2.2, 2.2);
  return g;
}

export function bench(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 1.8, 0.08, 0.5, b.m.woodLight, 0, 0.45, 0);
  box(g, 1.8, 0.4, 0.06, b.m.woodLight, 0, 0.75, -0.22);
  for (const s of [-1, 1]) box(g, 0.08, 0.45, 0.45, b.m.iron, s * 0.8, 0.22, 0);
  b.block(x, z, 1.8, 0.5, rot);
  return g;
}

export function bed(b: Builder, x: number, z: number, rot = 0) {
  // head at local -z
  const g = b.place(x, z, rot);
  box(g, 1.7, 0.35, 2.2, b.m.woodDark, 0, 0.25, 0);
  box(g, 1.6, 0.22, 2.1, b.m.sheet, 0, 0.53, 0);
  box(g, 1.64, 0.1, 1.4, b.m.blanket, 0, 0.66, 0.36);
  box(g, 0.6, 0.14, 0.35, b.m.white, -0.38, 0.72, -0.8);
  box(g, 0.6, 0.14, 0.35, b.m.white, 0.38, 0.72, -0.8);
  box(g, 1.7, 1.1, 0.1, b.m.woodDark, 0, 0.9, -1.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.05, 0.05, 2.2, b.m.woodDark, sx * 0.82, 1.1, sz * 1.08, 8);
  box(g, 1.7, 0.06, 0.06, b.m.woodDark, 0, 2.2, 1.08);
  box(g, 1.7, 0.06, 0.06, b.m.woodDark, 0, 2.2, -1.08);
  b.block(x, z, 1.75, 2.25, rot);
  return g;
}

export function rockingChair(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  const r = new THREE.Group();
  g.add(r);
  box(r, 0.55, 0.06, 0.55, b.m.wood, 0, 0.5, 0);
  box(r, 0.55, 0.85, 0.06, b.m.wood, 0, 0.95, -0.27);
  for (const s of [-1, 1]) {
    const rocker = add(r, new THREE.TorusGeometry(1.0, 0.03, 4, 16, 0.9), b.m.woodDark, s * 0.24, 1.08, 0);
    rocker.rotation.set(0, Math.PI / 2, Math.PI + Math.PI / 2 - 0.45);
    box(r, 0.04, 0.45, 0.04, b.m.woodDark, s * 0.24, 0.3, 0.2);
    box(r, 0.04, 0.45, 0.04, b.m.woodDark, s * 0.24, 0.3, -0.2);
  }
  b.updaters.push((t) => {
    r.rotation.x = Math.sin(t * 1.8) * 0.18;
  });
  b.block(x, z, 0.6, 0.8, rot);
  return g;
}

export function rockingHorse(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  const r = new THREE.Group();
  g.add(r);
  for (const s of [-1, 1]) {
    const rocker = add(r, new THREE.TorusGeometry(1.1, 0.035, 4, 16, 1.0), b.m.red, s * 0.18, 1.12, 0);
    rocker.rotation.set(0, Math.PI / 2, Math.PI + Math.PI / 2 - 0.5);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = box(r, 0.07, 0.45, 0.07, b.m.white, sx * 0.14, 0.3, sz * 0.3);
    leg.rotation.x = sz * 0.2;
  }
  sph(r, 0.25, b.m.white, 0, 0.62, 0, 0.8, 0.8, 1.6);
  const neck = cyl(r, 0.1, 0.13, 0.4, b.m.white, 0, 0.85, 0.3, 8);
  neck.rotation.x = 0.5;
  sph(r, 0.14, b.m.white, 0, 1.05, 0.44, 0.8, 0.9, 1.4);
  box(r, 0.05, 0.3, 0.25, b.m.red, 0, 0.95, 0.22);
  box(r, 0.3, 0.05, 0.3, b.m.red, 0, 0.82, 0);
  sph(r, 0.025, b.m.black, 0.08, 1.1, 0.52);
  sph(r, 0.025, b.m.black, -0.08, 1.1, 0.52);
  b.updaters.push((t) => {
    r.rotation.x = Math.sin(t * 2.4 + 1) * 0.16;
  });
  b.block(x, z, 0.5, 1.1, rot);
  return g;
}

export function crib(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 1.4, 0.1, 0.8, b.m.white, 0, 0.45, 0);
  box(g, 1.3, 0.12, 0.7, b.m.blanket2, 0, 0.55, 0);
  for (let i = 0; i <= 8; i++) {
    const lx = -0.68 + i * 0.17;
    box(g, 0.04, 0.9, 0.04, b.m.white, lx, 0.55, 0.38);
    box(g, 0.04, 0.9, 0.04, b.m.white, lx, 0.55, -0.38);
  }
  box(g, 1.44, 0.06, 0.06, b.m.white, 0, 1.0, 0.38);
  box(g, 1.44, 0.06, 0.06, b.m.white, 0, 1.0, -0.38);
  box(g, 0.06, 1.0, 0.8, b.m.white, 0.7, 0.5, 0);
  box(g, 0.06, 1.0, 0.8, b.m.white, -0.7, 0.5, 0);
  b.block(x, z, 1.45, 0.85, rot);
  return g;
}

export function teddy(b: Builder, x: number, z: number, rot = 0, y = 0) {
  const g = b.place(x, z, rot);
  g.position.y = y;
  sph(g, 0.18, b.m.fur, 0, 0.18, 0, 1, 1.1, 0.9);
  sph(g, 0.13, b.m.fur, 0, 0.44, 0);
  sph(g, 0.05, b.m.fur, -0.1, 0.55, 0);
  sph(g, 0.05, b.m.fur, 0.1, 0.55, 0);
  sph(g, 0.05, b.m.cream, 0, 0.42, 0.11);
  sph(g, 0.018, b.m.black, -0.05, 0.48, 0.11);
  sph(g, 0.022, b.m.black, 0.05, 0.47, 0.115, 1, 0.4, 1); // one sewn-shut eye
  for (const s of [-1, 1]) {
    sph(g, 0.06, b.m.fur, s * 0.1, 0.06, 0.12);
    sph(g, 0.05, b.m.fur, s * 0.18, 0.24, 0.02);
  }
  return g;
}

export function blocks(b: Builder, x: number, z: number) {
  const g = b.place(x, z);
  const mats = [b.m.red, b.m.blue, b.m.yellow, b.m.green];
  const spots = [[0, 0, 0], [0.3, 0, 0.1], [0.12, 0.25, 0.05], [-0.3, 0, 0.3], [0.5, 0, -0.35], [-0.1, 0, -0.4]];
  spots.forEach(([bx, by, bz], i) => {
    const m = box(g, 0.24, 0.24, 0.24, mats[i % 4], bx, by + 0.12, bz);
    m.rotation.y = i * 0.7;
  });
  return g;
}

export function counter(b: Builder, x: number, z: number, w: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, w, 0.85, 0.7, b.m.woodLight, 0, 0.425, 0);
  box(g, w + 0.04, 0.06, 0.74, b.m.stone, 0, 0.88, 0);
  const n = Math.max(1, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / n);
    box(g, w / n - 0.08, 0.6, 0.02, b.m.wood, lx, 0.45, 0.355);
    sph(g, 0.025, b.m.brass, lx, 0.62, 0.37);
  }
  b.block(x, z, w, 0.7, rot);
  return g;
}

export function stove(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 1.0, 0.85, 0.7, b.m.iron, 0, 0.425, 0);
  box(g, 1.0, 0.5, 0.1, b.m.iron, 0, 1.1, -0.3);
  for (const s of [-1, 1]) cyl(g, 0.16, 0.16, 0.03, b.m.black, s * 0.25, 0.87, 0.05, 12);
  cyl(g, 0.2, 0.18, 0.25, b.m.metal, 0.25, 1.0, 0.05, 12); // pot
  box(g, 0.7, 0.35, 0.02, b.m.black, 0, 0.4, 0.355);
  b.block(x, z, 1.0, 0.7, rot);
  return g;
}

export function cauldron(b: Builder, x: number, z: number) {
  const g = b.place(x, z);
  const body = sph(g, 0.6, b.m.black, 0, 0.55, 0, 1, 0.85, 1, 16);
  body.scale.y = 0.85;
  cyl(g, 0.52, 0.52, 0.04, b.m.slime, 0, 0.9, 0, 18);
  add(g, new THREE.TorusGeometry(0.52, 0.06, 6, 20), b.m.black, 0, 0.92, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(g, 0.05, 0.03, 0.3, b.m.black, Math.cos(a) * 0.4, 0.12, Math.sin(a) * 0.4, 6);
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
  }
  // embers under
  box(g, 0.5, 0.06, 0.5, b.m.fire, 0, 0.03, 0);
  b.glow(g, 0, 1.0, 0, '#6aff5a', 2.6, 0.5);
  b.anchor(g, 0, 1.6, 0, '#5aff6a', 1.2);
  b.block(x, z, 1.3, 1.3);
  // bubbles
  const dyn = b.place(x, z, 0, true);
  const bubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) bubbles.push(sph(dyn, 0.08, b.m.slime, 0, 0.9, 0, 1, 1, 1, 8));
  b.updaters.push((t) => {
    bubbles.forEach((m, i) => {
      const p = (t * 0.7 + i / 5) % 1;
      const a = i * 2.4;
      m.position.set(Math.cos(a) * 0.3, 0.9 + p * 0.25, Math.sin(a) * 0.3);
      const s = p < 0.85 ? 0.5 + p : (1 - p) * 8;
      m.scale.setScalar(s);
    });
  });
  return g;
}

export function coatRack(b: Builder, x: number, z: number) {
  const g = b.place(x, z);
  cyl(g, 0.04, 0.04, 1.9, b.m.woodDark, 0, 0.95, 0, 6);
  cyl(g, 0.25, 0.28, 0.05, b.m.woodDark, 0, 0.03, 0, 10);
  sph(g, 0.22, b.m.purple, 0.1, 1.55, 0, 0.8, 1.6, 0.6); // coat
  const hat = cyl(g, 0.12, 0.13, 0.22, b.m.black, -0.05, 1.95, 0, 12);
  hat.rotation.z = 0.2;
  cyl(g, 0.22, 0.22, 0.02, b.m.black, -0.07, 1.85, 0, 14).rotation.z = 0.2;
  b.block(x, z, 0.5, 0.5);
  return g;
}

export function globe(b: Builder, x: number, z: number) {
  const g = b.place(x, z);
  cyl(g, 0.25, 0.3, 0.06, b.m.woodDark, 0, 0.03, 0);
  cyl(g, 0.03, 0.03, 0.7, b.m.woodDark, 0, 0.38, 0, 6);
  sph(g, 0.28, b.m.teal, 0, 0.98, 0);
  sph(g, 0.12, b.m.green, 0.12, 1.08, 0.18, 1, 0.8, 0.5);
  add(g, new THREE.TorusGeometry(0.33, 0.02, 4, 20), b.m.brass, 0, 0.98, 0).rotation.y = 0.4;
  b.block(x, z, 0.6, 0.6);
  return g;
}

export function floatingBooks(b: Builder, x: number, z: number) {
  const g = b.place(x, z, 0, true);
  const mats = [b.m.red, b.m.blue, b.m.green, b.m.purple];
  const books: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const bk = new THREE.Group();
    g.add(bk);
    box(bk, 0.32, 0.07, 0.24, mats[i], 0, 0, 0);
    box(bk, 0.3, 0.05, 0.22, b.m.cream, 0.015, 0, 0);
    books.push(bk);
  }
  b.glow(g, 0, 1.4, 0, '#9ad0ff', 1.8, 0.3);
  b.updaters.push((t) => {
    books.forEach((bk, i) => {
      const a = t * 0.6 + (i / 4) * Math.PI * 2;
      bk.position.set(Math.cos(a) * 0.7, 1.3 + Math.sin(t * 1.3 + i) * 0.25, Math.sin(a) * 0.7);
      bk.rotation.set(Math.sin(t + i) * 0.4, -a, Math.cos(t * 1.1 + i) * 0.3);
    });
  });
  return g;
}

export function lantern(b: Builder, g: THREE.Object3D, x: number, y: number, z: number, color = '#ffb050') {
  cyl(g, 0.1, 0.12, 0.04, b.m.iron, x, y + 0.02, z, 8);
  cyl(g, 0.08, 0.08, 0.22, b.m.flame, x, y + 0.15, z, 8);
  cyl(g, 0.06, 0.12, 0.08, b.m.iron, x, y + 0.3, z, 8);
  b.glow(g, x, y + 0.15, z, color, 1.1, 0.7);
}

export function dresser(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot);
  box(g, 1.4, 1.0, 0.55, b.m.woodRed, 0, 0.5, 0);
  for (let i = 0; i < 3; i++) {
    box(g, 1.3, 0.26, 0.02, b.m.wood, 0, 0.2 + i * 0.3, 0.28);
    sph(g, 0.03, b.m.brass, -0.3, 0.2 + i * 0.3, 0.3);
    sph(g, 0.03, b.m.brass, 0.3, 0.2 + i * 0.3, 0.3);
  }
  b.block(x, z, 1.4, 0.55, rot);
  return g;
}

export function cabinet(b: Builder, x: number, z: number, rot = 0) {
  const g = b.place(x, z, rot, true);
  box(g, 1.4, 2.2, 0.5, b.m.woodRed, 0, 1.1, 0);
  box(g, 1.2, 0.9, 0.02, b.m.black, 0, 1.6, 0.25);
  for (let i = 0; i < 4; i++) cyl(g, 0.12, 0.12, 0.02, b.m.white, -0.4 + i * 0.27, 1.6, 0.22, 12).rotation.x = Math.PI / 2;
  box(g, 1.5, 0.1, 0.56, b.m.woodDark, 0, 2.25, 0);
  b.block(x, z, 1.4, 0.5, rot);
  b.haunted.push({ obj: g, pos: g.position.clone(), name: 'cabinet', cooldown: 0 });
  return g;
}

// ---------------------------------------------------------------------------
// Room furnishing. lx/lz are room-local coordinates (x in ±5.85, z in ±4.85).
// ---------------------------------------------------------------------------
const N = 0,
  S = Math.PI,
  E = -Math.PI / 2,
  W = Math.PI / 2; // rotations that make the prop FACE south/north/west/east... see usage
// Props are placed with their back against a wall; "rot" makes them face into the room:
// against north wall -> N (face +z), south wall -> S, west wall -> W (face +x), east wall -> E.

export function furnish(b: Builder, r: RoomDef) {
  const P = (lx: number, lz: number) => [r.cx + lx, r.cz + lz] as const;
  const at = <A extends unknown[]>(fn: (b: Builder, x: number, z: number, ...a: A) => unknown, lx: number, lz: number, ...a: A) => {
    const [x, z] = P(lx, lz);
    return fn(b, x, z, ...a);
  };
  const webs = (corners: [number, number][]) => {
    for (const [sx, sz] of corners) {
      const [x, z] = P(sx * 5.4, sz * 4.4);
      // plane diagonal across corner, facing into the room
      const rot = Math.atan2(-sx, -sz);
      cobweb(b, x, z, rot, 1.3);
    }
  };

  switch (r.id) {
    case 'library': {
      for (const lx of [-4.4, -1.8, 1.8, 4.4]) at(bookshelf, lx, -4.55, N);
      at(portrait, 0, -4.84, N, 1);
      at(bookshelf, -5.55, -2.6, W);
      at(bookshelf, -5.55, 2.6, W);
      at(rug, -1.0, 1.2, 4.2, 2.6, 2);
      at(table, -1.2, 1.0, 1.8, 0.9, 0.8);
      at(chair, -1.2, 1.8, S, b.m.green);
      {
        const [x, z] = P(-1.5, 0.9);
        const g = b.place(x, z);
        lantern(b, g, 0, 0.84, 0);
        b.anchor(g, 0, 1.6, 0.4, '#ffb060', 1);
      }
      at(armchair, 3.8, 3.1, -2.4);
      at(globe, 4.8, 1.2);
      at(floatingBooks, 2.2, -1.6);
      at(pumpkin, -5.2, 4.3, 0.9, 0.6);
      webs([[-1, -1], [1, -1]]);
      break;
    }
    case 'ballroom': {
      at(piano, 3.4, -2.2, -2.5);
      at(candelabra, -5.2, -4.2);
      at(candelabra, 5.3, 4.3, false, false);
      at(candelabra, -5.3, 4.3, false, false);
      for (const lx of [-3.6, -2.6, -1.6]) at(chair, lx, -4.4, N, b.m.purple);
      at(portrait, -3.0, -4.84, N, 3, 1.1, 1.3, 2.0);
      at(pumpkin, -4.6, 3.6, 1.2);
      at(pumpkin, -4.0, 4.2, 0.8, 0.5);
      at(pumpkin, 4.4, 3.4, 1.0, -0.4);
      at(rug, 0, 0.5, 4.5, 3.0, 2);
      webs([[-1, -1], [1, -1], [1, 1]]);
      break;
    }
    case 'conservatory': {
      for (const lx of [-4.6, -2.2, 2.4, 4.9]) at(plant, lx, -4.3, 1.2);
      at(plant, 5.2, -1.8, 1.0);
      at(plant, 5.2, 2.8, 1.3);
      at(deadTree, 0.6, 0.2);
      at(bench, -3.2, 3.4, S);
      {
        const [x, z] = P(-3.2, 2.6);
        const g = b.place(x, z);
        lantern(b, g, 0, 0, 0, '#9ad0ff');
        b.anchor(g, 0, 1.4, 0, '#8ab8ff', 0.9);
      }
      at(pumpkin, 3.6, 3.4, 1.3);
      at(pumpkin, 4.4, 4.0, 0.9, 0.8);
      at(pumpkin, 2.9, 4.2, 0.7, -0.5);
      webs([[-1, -1]]);
      break;
    }
    case 'dining': {
      at(rug, 0, -0.3, 6.2, 3.6, 0);
      at(table, 0, -0.3, 4.4, 1.5, 0.82, 0, b.m.woodRed);
      for (const lx of [-1.5, 0, 1.5]) {
        at(chair, lx, -1.45, N, b.m.red);
        at(chair, lx, 0.85, S, b.m.red);
      }
      at(chair, -2.6, -0.3, W, b.m.red);
      at(chair, 2.6, -0.3, E, b.m.red);
      at(candelabra, 0, -0.3, true);
      {
        const [x, z] = P(0, -0.3);
        const g = b.place(x, z);
        for (const lx of [-1.5, -0.8, 0.8, 1.5]) for (const s of [-1, 1]) cyl(g, 0.16, 0.12, 0.03, b.m.white, lx, 0.87, s * 0.45, 12);
        sph(g, 0.14, b.m.pumpkin, 1.15, 0.94, 0, 1.2, 0.8, 1.2); // a sad old pie
      }
      at(counter, -5.5, 0.2, 2.6, W);
      at(portrait, -5.84, -2.8, W, 0);
      at(portrait, -5.84, 2.8, W, 2);
      at(cabinet, 4.4, -4.5, N);
      webs([[-1, -1], [-1, 1]]);
      break;
    }
    case 'hall': {
      at(fireplace, -3.6, -4.45, N);
      at(armchair, -4.8, -1.7, 2.8, b.m.red);
      at(armchair, -2.4, -1.7, -2.8, b.m.red);
      at(rug, -0.2, 0.2, 5.0, 3.4, 1);
      at(armor, 4.5, -4.4, N);
      at(armor, 5.3, 3.8, E);
      at(armor, -5.3, -4.0, W);
      at(roundTable, 3.6, 1.8, 0.55);
      at(candelabra, 3.6, 1.8, true, false);
      at(portrait, 5.84, -3.6, E, 1);
      at(portrait, -5.84, 4.0, W, 3);
      at(pumpkin, -1.85, -4.3, 0.9);
      webs([[1, -1], [-1, 1]]);
      break;
    }
    case 'bedroom': {
      at(bed, 4.6, 0, E);
      at(table, 5.4, -1.55, 0.5, 0.5, 0.6, 0, b.m.woodRed);
      at(table, 5.4, 1.55, 0.5, 0.5, 0.6, 0, b.m.woodRed);
      {
        const [x, z] = P(5.4, 1.55);
        const g = b.place(x, z);
        candle(b, g, 0, 0.64, 0, 0.2);
        b.anchor(g, -0.5, 1.4, 0, '#ffa050', 1);
      }
      at(teddy, 4.3, 0.6, E, 0.76);
      at(wardrobe, -3.8, -4.5, N, b.m.woodRed);
      at(dresser, 3.6, -4.55, N);
      at(portrait, 3.6, -4.84, N, 0, 0.7, 0.9, 1.9);
      at(rockingChair, -3.8, 2.8, 2.4);
      at(rug, -0.8, 1.0, 3.6, 2.4, 0);
      webs([[1, -1], [1, 1], [-1, -1]]);
      break;
    }
    case 'kitchen': {
      at(counter, -5.5, -2.8, 2.6, W);
      at(stove, -5.5, -0.5, W);
      at(counter, -5.5, 1.6, 2.2, W);
      at(counter, 2.6, -4.5, 2.8, N);
      at(fridge, 5.0, -4.45, N);
      at(cauldron, 0.8, 1.6);
      at(table, -2.8, 3.2, 1.4, 1.0, 0.78);
      at(chair, -3.8, 3.2, W, b.m.green);
      at(chair, -1.8, 3.2, E, b.m.green);
      {
        const [x, z] = P(-5.5, 1.6);
        const g = b.place(x, z);
        cyl(g, 0.15, 0.12, 0.3, b.m.metal, 0, 1.05, 0.5, 10);
        cyl(g, 0.18, 0.16, 0.2, b.m.terracotta, 0, 1.0, -0.3, 10);
        const [x2, z2] = P(2.6, -4.5);
        const g2 = b.place(x2, z2);
        for (let i = 0; i < 3; i++) sph(g2, 0.1, [b.m.red, b.m.green, b.m.yellow][i], -0.8 + i * 0.25, 0.98, 0);
        cyl(g2, 0.12, 0.1, 0.4, b.m.white, 0.6, 1.1, 0, 10);
      }
      webs([[-1, -1], [1, -1]]);
      break;
    }
    case 'foyer': {
      at(grandfatherClock, -4.0, -4.55, N);
      at(coatRack, 5.2, -4.2);
      at(rug, 0.2, 0.5, 4.6, 3.0, 0);
      at(armor, -1.9, 4.3, S);
      at(armor, 1.9, 4.3, S);
      at(pumpkin, -1.0, 4.3, 0.9, 0.2);
      at(pumpkin, 1.0, 4.4, 1.1, -0.3);
      at(table, -4.8, 3.8, 1.2, 0.6, 0.82, W);
      at(candelabra, -4.8, 3.8, true);
      at(portrait, -2.3, -4.84, N, 1);
      at(portrait, 5.84, -2.8, E, 3, 0.7, 0.9);
      webs([[-1, -1], [1, -1]]);
      break;
    }
    case 'nursery': {
      at(crib, 5.3, -2.6, E);
      at(rockingHorse, -2.2, -1.4, 0.7);
      at(toyChest, -3.2, -4.45, N);
      at(blocks, 0.4, 2.4);
      at(teddy, -5.2, 4.2, 0.8);
      at(teddy, 5.1, -2.6, E, 0.6);
      at(table, 4.8, 3.8, 0.7, 0.7, 0.55, 0, b.m.white);
      {
        const [x, z] = P(4.8, 3.8);
        const g = b.place(x, z);
        lantern(b, g, 0, 0.58, 0, '#ff9ad0');
        b.anchor(g, -0.6, 1.4, -0.6, '#ff90c0', 1);
      }
      at(rug, 0, 0.5, 3.2, 3.2, 1);
      at(portrait, -5.84, -3.0, W, 2, 0.7, 0.9);
      at(pumpkin, -5.1, -1.8, 0.7);
      webs([[1, -1], [-1, 1]]);
      break;
    }
  }
}
