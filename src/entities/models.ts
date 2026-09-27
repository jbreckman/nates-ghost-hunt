import * as THREE from 'three';
import { glowTex, starTex } from '../world/textures';

// ---------------------------------------------------------------------------
// Toon materials for the kids
// ---------------------------------------------------------------------------
let gradient: THREE.DataTexture | null = null;
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: string, emissive?: string) {
  const key = color + (emissive ?? '');
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
    if (emissive) m.emissive = new THREE.Color(emissive);
    toonCache.set(key, m);
  }
  return m;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const sphere = (r: number, seg = 14) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);

export interface Humanoid {
  root: THREE.Group;
  body: THREE.Group; // bobs
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Object3D[];
  scale: number;
}

function limb(parent: THREE.Object3D, x: number, y: number, len: number, r: number, mat: THREE.Material, endMat: THREE.Material, endGeo: THREE.BufferGeometry, endOffset = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  parent.add(pivot);
  part(pivot, capsule(r, len - r * 2), mat, 0, -len / 2, 0);
  part(pivot, endGeo, endMat, 0, -len + endOffset, 0);
  return pivot;
}

function face(head: THREE.Group, r: number, eyeScale = 1) {
  const eyes: THREE.Object3D[] = [];
  const black = toon('#1a1420');
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * r * 0.36, r * 0.12, r * 0.9);
    head.add(e);
    const eg = part(e, sphere(r * 0.16 * eyeScale, 10), black);
    eg.scale.set(0.85, 1.15, 0.6);
    part(e, sphere(r * 0.055 * eyeScale, 6), white, r * 0.05, r * 0.07, r * 0.08);
    eyes.push(e);
    const brow = part(head, new THREE.BoxGeometry(r * 0.32, r * 0.06, r * 0.06), black, s * r * 0.36, r * 0.42, r * 0.86);
    brow.rotation.z = s * -0.15;
  }
  // smile
  const smile = part(head, new THREE.TorusGeometry(r * 0.18, r * 0.03, 4, 10, Math.PI), black, 0, -r * 0.28, r * 0.93);
  smile.rotation.z = Math.PI;
  return eyes;
}

// ---------------------------------------------------------------------------
// Nate: 10yo ghost hunter with a backwards cap, red hoodie and a ghost-vac
// ---------------------------------------------------------------------------
export function makeNate() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = toon('#f2c49c');
  const hoodie = toon('#d23a2e');
  const jeans = toon('#34508a');
  const shoe = toon('#f2f2f2');

  const legL = limb(body, -0.11, 0.7, 0.66, 0.085, jeans, shoe, new THREE.BoxGeometry(0.15, 0.1, 0.26), 0.02);
  const legR = limb(body, 0.11, 0.7, 0.66, 0.085, jeans, shoe, new THREE.BoxGeometry(0.15, 0.1, 0.26), 0.02);
  legL.children[1].position.z = legR.children[1].position.z = 0.05;

  part(body, capsule(0.22, 0.28), hoodie, 0, 1.0, 0).scale.set(1, 1, 0.8);
  part(body, new THREE.TorusGeometry(0.15, 0.06, 6, 12), hoodie, 0, 1.23, -0.05).rotation.x = Math.PI / 2;
  // hoodie pocket + strings
  part(body, new THREE.BoxGeometry(0.26, 0.1, 0.05), toon('#a82a22'), 0, 0.9, 0.17);
  const armL = limb(body, -0.29, 1.2, 0.5, 0.075, hoodie, skin, sphere(0.07, 8));
  const armR = limb(body, 0.29, 1.2, 0.5, 0.075, hoodie, skin, sphere(0.07, 8));

  const head = new THREE.Group();
  head.position.set(0, 1.46, 0);
  body.add(head);
  part(head, sphere(0.22, 18), skin);
  part(head, sphere(0.05, 8), skin, -0.21, 0, 0).scale.set(0.6, 1, 1);
  part(head, sphere(0.05, 8), skin, 0.21, 0, 0).scale.set(0.6, 1, 1);
  const eyes = face(head, 0.22);
  // brown hair tufts + backwards cap
  const hair = toon('#5a3620');
  part(head, sphere(0.225, 14), hair, 0, 0.03, -0.03).scale.set(1, 0.9, 1);
  const cap = toon('#2a64c8');
  const capTop = part(head, new THREE.SphereGeometry(0.235, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.06, -0.01);
  capTop.scale.set(1, 0.8, 1);
  part(head, new THREE.BoxGeometry(0.26, 0.03, 0.2), cap, 0, 0.08, -0.28).rotation.x = -0.25;
  part(head, sphere(0.035, 8), toon('#ffffff'), 0, 0.25, 0);
  for (let i = 0; i < 3; i++) {
    const tuft = part(head, new THREE.ConeGeometry(0.05, 0.14, 5), hair, -0.08 + i * 0.08, 0.02, 0.2);
    tuft.rotation.x = 1.9;
  }

  // Ghost-vac tank backpack
  const tankMat = toon('#4f8a78');
  const pack = new THREE.Group();
  pack.position.set(0, 1.02, -0.26);
  body.add(pack);
  part(pack, new THREE.CylinderGeometry(0.15, 0.15, 0.55, 12), tankMat);
  part(pack, sphere(0.15, 12), tankMat, 0, 0.27, 0).scale.y = 0.6;
  part(pack, new THREE.CylinderGeometry(0.155, 0.155, 0.06, 12), toon('#f0c020'), 0, 0.1, 0);
  part(pack, new THREE.CylinderGeometry(0.155, 0.155, 0.06, 12), toon('#f0c020'), 0, -0.14, 0);
  const gaugeMat = new THREE.MeshBasicMaterial({ color: '#50ff90' });
  const gauge = part(pack, new THREE.BoxGeometry(0.08, 0.3, 0.02), gaugeMat, 0, 0, -0.15);
  gauge.castShadow = false;

  // Right arm holds the vacuum wand forward
  const wand = new THREE.Group();
  wand.position.set(0, -0.48, 0.02);
  armR.add(wand);
  const wandMat = toon('#8a9098');
  part(wand, new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), wandMat, 0, 0, 0.18).rotation.x = Math.PI / 2;
  part(wand, new THREE.CylinderGeometry(0.09, 0.06, 0.16, 12), toon('#2a2a30'), 0, 0, 0.48).rotation.x = Math.PI / 2;
  const lensMat = new THREE.MeshBasicMaterial({ color: '#fff4c0' });
  const lens = part(wand, new THREE.CircleGeometry(0.075, 12), lensMat, 0, 0, 0.565);
  lens.castShadow = false;
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, 0, 0.6);
  wand.add(nozzle);
  // hose from pack to wand (static curve in body space)
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1, 0.8, -0.3),
    new THREE.Vector3(0.3, 0.7, -0.2),
    new THREE.Vector3(0.36, 0.72, 0.1),
    new THREE.Vector3(0.3, 0.75, 0.3),
  ]);
  part(body, new THREE.TubeGeometry(hoseCurve, 12, 0.035, 6), toon('#3a3a42'));

  const h: Humanoid = { root, body, legL, legR, armL, armR, head, eyes, scale: 1 };
  return { ...h, nozzle, wand, gaugeMat, lensMat };
}
export type NateModel = ReturnType<typeof makeNate>;

// ---------------------------------------------------------------------------
// Matt: 6yo little brother, propeller beanie, butterfly net
// ---------------------------------------------------------------------------
export function makeMatt() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = toon('#f5cba6');
  const shirt = toon('#5cc04a');
  const shorts = toon('#3a5aa8');
  const shoe = toon('#f0a020');

  const legL = limb(body, -0.08, 0.44, 0.42, 0.07, skin, shoe, new THREE.BoxGeometry(0.12, 0.09, 0.2), 0.02);
  const legR = limb(body, 0.08, 0.44, 0.42, 0.07, skin, shoe, new THREE.BoxGeometry(0.12, 0.09, 0.2), 0.02);
  part(body, new THREE.CylinderGeometry(0.17, 0.19, 0.18, 12), shorts, 0, 0.46, 0);
  part(body, capsule(0.18, 0.14), shirt, 0, 0.66, 0).scale.set(1, 1, 0.85);
  part(body, new THREE.CylinderGeometry(0.185, 0.185, 0.05, 12), toon('#f0e040'), 0, 0.62, 0);
  part(body, new THREE.CylinderGeometry(0.185, 0.185, 0.05, 12), toon('#f0e040'), 0, 0.72, 0);
  const armL = limb(body, -0.22, 0.8, 0.36, 0.06, shirt, skin, sphere(0.06, 8));
  const armR = limb(body, 0.22, 0.8, 0.36, 0.06, shirt, skin, sphere(0.06, 8));

  const head = new THREE.Group();
  head.position.set(0, 1.08, 0);
  body.add(head);
  part(head, sphere(0.25, 18), skin);
  part(head, sphere(0.06, 8), skin, -0.24, 0, 0).scale.set(0.6, 1, 1);
  part(head, sphere(0.06, 8), skin, 0.24, 0, 0).scale.set(0.6, 1, 1);
  const eyes = face(head, 0.25, 1.25);
  // freckles / cheeks
  const blush = new THREE.MeshBasicMaterial({ color: '#f59a8a' });
  for (const s of [-1, 1]) part(head, sphere(0.04, 6), blush, s * 0.15, -0.06, 0.2).scale.set(1, 0.6, 0.4);
  const hair = toon('#f0c860');
  part(head, sphere(0.255, 14), hair, 0, 0.05, -0.04).scale.set(1, 0.85, 1);
  for (let i = 0; i < 4; i++) {
    const tuft = part(head, new THREE.ConeGeometry(0.05, 0.14, 5), hair, -0.12 + i * 0.08, 0.1, 0.2);
    tuft.rotation.x = 1.7;
  }
  // propeller beanie
  const beanie = new THREE.Group();
  beanie.position.y = 0.1;
  head.add(beanie);
  const segs = ['#e03030', '#f0d020', '#3070e0', '#40c040'];
  for (let i = 0; i < 4; i++)
    part(beanie, new THREE.SphereGeometry(0.245, 8, 6, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), toon(segs[i]));
  part(beanie, new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), toon('#888'), 0, 0.27, 0);
  const prop = new THREE.Group();
  prop.position.y = 0.32;
  beanie.add(prop);
  for (const s of [-1, 1]) {
    const blade = part(prop, new THREE.BoxGeometry(0.22, 0.012, 0.05), toon(s > 0 ? '#e03030' : '#3070e0'), s * 0.11, 0, 0);
    blade.rotation.x = s * 0.25;
  }

  // butterfly net in right hand
  const net = new THREE.Group();
  net.position.set(0, -0.34, 0.04);
  armR.add(net);
  const stick = part(net, new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), toon('#b07a40'), 0, 0.2, 0.25);
  stick.rotation.x = 1.0;
  const ringHolder = new THREE.Group();
  ringHolder.position.set(0, 0.58, 0.55);
  ringHolder.rotation.x = 1.0;
  net.add(ringHolder);
  const ring = part(ringHolder, new THREE.TorusGeometry(0.17, 0.015, 5, 16), toon('#e0e0e0'), 0, 0.17, 0);
  ring.rotation.y = Math.PI / 2;
  const netMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const bag = part(ringHolder, new THREE.ConeGeometry(0.17, 0.35, 12, 1, true), netMat, 0.15, 0.17, 0);
  bag.rotation.z = Math.PI / 2;
  bag.castShadow = false;

  const h: Humanoid = { root, body, legL, legR, armL, armR, head, eyes, scale: 1 };
  return { ...h, prop, net, netMat };
}
export type MattModel = ReturnType<typeof makeMatt>;

/** Procedural walk / idle animation. speed01: 0 idle .. 1 full run. */
export function animateHumanoid(h: Humanoid, phase: number, speed01: number, t: number, legLen: number) {
  const s = Math.min(1, speed01);
  const swing = Math.sin(phase) * 0.75 * s;
  h.legL.rotation.x = swing;
  h.legR.rotation.x = -swing;
  h.armL.rotation.x = -swing * 0.9;
  h.armR.rotation.x = swing * 0.9;
  const bob = Math.abs(Math.cos(phase)) * 0.06 * s * legLen;
  const idle = Math.sin(t * 2.2) * 0.012 * (1 - s);
  h.body.position.y = bob + idle;
  h.body.rotation.x = s * 0.12;
  h.head.rotation.x = -s * 0.08;
}

// ---------------------------------------------------------------------------
// Ghosts
// ---------------------------------------------------------------------------
export type GhostKind = 'wisp' | 'sheet' | 'sneaky' | 'prankster' | 'king';

const ghostVert = /* glsl */ `
  uniform float uTime; uniform float uWob;
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){
    vec3 p = position;
    float bottom = smoothstep(0.1, -0.7, p.y);
    float ang = atan(p.z, p.x);
    p.y += sin(ang*6.0 + uTime*6.0) * 0.07 * bottom;
    p.xz *= 1.0 + sin(uTime*3.0 + p.y*5.0) * 0.05 * bottom * uWob;
    p.x += sin(uTime*2.5 + p.y*2.0) * 0.1 * bottom * uWob;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const ghostFrag = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uRim; uniform float uOpacity; uniform float uFlash;
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float fres = pow(1.0 - ndv, 2.2);
    vec3 c = uColor * (0.7 + 0.45 * smoothstep(-0.7, 0.7, vY));
    c += uRim * fres * 1.3;
    c = mix(c, vec3(1.0), uFlash);
    float a = uOpacity * (0.72 + 0.28 * fres) * smoothstep(-0.85, -0.45, vY - 0.0) ;
    a = max(a, uOpacity * 0.35);
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }`;

let sheetGeo: THREE.BufferGeometry | null = null;
let wispGeo: THREE.BufferGeometry | null = null;
function ghostGeos() {
  if (!sheetGeo) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * 0.5, 0.25 + Math.cos(a) * 0.5));
    }
    pts.push(new THREE.Vector2(0.52, 0.0), new THREE.Vector2(0.56, -0.3), new THREE.Vector2(0.64, -0.62), new THREE.Vector2(0.56, -0.64));
    sheetGeo = new THREE.LatheGeometry(pts, 28);
    const wp: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 0.75;
      wp.push(new THREE.Vector2(Math.sin(a) * 0.42, 0.2 + Math.cos(a) * 0.42));
    }
    wp.push(new THREE.Vector2(0.2, -0.35), new THREE.Vector2(0.08, -0.6), new THREE.Vector2(0.0, -0.72));
    wispGeo = new THREE.LatheGeometry(wp, 20);
  }
  return { sheet: sheetGeo!, wisp: wispGeo! };
}

const eyeMat = new THREE.MeshBasicMaterial({ color: '#120a1c' });
const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
const shineGeo = new THREE.SphereGeometry(0.03, 6, 4);
const glowTexture = { t: null as THREE.Texture | null };
const starTexture = { t: null as THREE.Texture | null };

export const GHOST_STYLE: Record<GhostKind, { color: string; rim: string; scale: number; floorGlow: string }> = {
  wisp: { color: '#9af0ff', rim: '#e0ffff', scale: 0.55, floorGlow: '#60d8ff' },
  sheet: { color: '#d8fff0', rim: '#a0ffd8', scale: 1, floorGlow: '#80ffc0' },
  sneaky: { color: '#b89aff', rim: '#e8d0ff', scale: 0.9, floorGlow: '#a080ff' },
  prankster: { color: '#b0ff6a', rim: '#f0ff90', scale: 0.95, floorGlow: '#a0ff50' },
  king: { color: '#fff0f4', rim: '#ffd0e0', scale: 2.0, floorGlow: '#ffb0d0' },
};

export function makeGhost(kind: GhostKind) {
  const geos = ghostGeos();
  const style = GHOST_STYLE[kind];
  const root = new THREE.Group();
  const inner = new THREE.Group(); // bobbing / stretching
  root.add(inner);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: Math.random() * 10 },
      uWob: { value: 1 },
      uColor: { value: new THREE.Color(style.color) },
      uRim: { value: new THREE.Color(style.rim) },
      uOpacity: { value: 0.9 },
      uFlash: { value: 0 },
    },
    vertexShader: ghostVert,
    fragmentShader: ghostFrag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const body = new THREE.Mesh(kind === 'wisp' ? geos.wisp : geos.sheet, mat);
  body.renderOrder = 2;
  inner.add(body);

  // face
  const faceG = new THREE.Group();
  inner.add(faceG);
  const eyes: THREE.Mesh[] = [];
  const eyeY = kind === 'wisp' ? 0.25 : 0.32;
  const eyeZ = kind === 'wisp' ? 0.4 : 0.47;
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.15, eyeY, eyeZ);
    e.scale.set(0.8, kind === 'sneaky' ? 0.7 : 1.25, 0.5);
    e.renderOrder = 3;
    faceG.add(e);
    const sh = new THREE.Mesh(shineGeo, eyeShine);
    sh.position.set(0.03, 0.05, 0.05);
    e.add(sh);
    eyes.push(e);
  }
  const mouth = new THREE.Mesh(eyeGeo, eyeMat);
  mouth.position.set(0, eyeY - 0.2, eyeZ + 0.03);
  mouth.scale.set(0.6, 0.45, 0.3);
  mouth.renderOrder = 3;
  faceG.add(mouth);
  if (kind === 'wisp') mouth.scale.set(0.3, 0.3, 0.3);
  if (kind === 'prankster') {
    mouth.scale.set(1.5, 0.5, 0.3);
    const tongue = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: '#ff5a8a' }));
    tongue.position.set(0.05, -0.06, 0.03);
    tongue.scale.set(0.35, 0.5, 0.4);
    mouth.add(tongue);
  }
  if (kind === 'sneaky') {
    const mask = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 24, Math.PI * 0.8), eyeMat);
    mask.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
    mask.position.set(0, eyeY, 0);
    faceG.add(mask);
    eyes.forEach((e) => (e.material = new THREE.MeshBasicMaterial({ color: '#fff8d0' })));
  }
  if (kind === 'king') {
    const gold = new THREE.MeshBasicMaterial({ color: '#ffd040' });
    const crown = new THREE.Group();
    crown.position.set(0, 0.68, 0);
    crown.rotation.x = -0.15;
    inner.add(crown);
    crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 14, 1, true), gold));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), gold);
      c.position.set(Math.cos(a) * 0.24, 0.12, Math.sin(a) * 0.24);
      crown.add(c);
      const gem = new THREE.Mesh(shineGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff3060' : '#40a0ff' }));
      gem.position.set(Math.cos(a) * 0.255, 0, Math.sin(a) * 0.255);
      crown.add(gem);
    }
    const blush = new THREE.MeshBasicMaterial({ color: '#ff8aa8', transparent: true, opacity: 0.8 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(eyeGeo, blush);
      b.position.set(s * 0.28, eyeY - 0.12, eyeZ - 0.04);
      b.scale.set(0.6, 0.3, 0.2);
      faceG.add(b);
    }
    mouth.scale.set(0.9, 0.35, 0.3);
    // arms
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat);
      arm.position.set(s * 0.58, 0.0, 0.1);
      arm.scale.set(1.4, 0.7, 0.7);
      inner.add(arm);
    }
  } else if (kind !== 'wisp') {
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat);
      arm.position.set(s * 0.52, 0.05, 0.05);
      arm.scale.set(1.3, 0.65, 0.65);
      inner.add(arm);
    }
  }

  // floor glow
  if (!glowTexture.t) glowTexture.t = glowTex();
  const floorMat = new THREE.MeshBasicMaterial({
    map: glowTexture.t,
    color: style.floorGlow,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.03;
  floor.renderOrder = 1;

  // daze stars
  if (!starTexture.t) starTexture.t = starTex();
  const stars = new THREE.Group();
  stars.position.y = 0.85;
  inner.add(stars);
  const starMat = new THREE.SpriteMaterial({ map: starTexture.t, color: '#ffe040', depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(starMat);
    sp.scale.setScalar(0.22);
    const a = (i / 3) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    stars.add(sp);
  }
  stars.visible = false;

  root.scale.setScalar(style.scale);
  return { root, inner, body, mat, eyes, mouth, faceG, floor, floorMat, stars };
}
export type GhostModel = ReturnType<typeof makeGhost>;
