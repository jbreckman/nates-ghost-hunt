import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  buildWallSegments,
  Grid,
  ROOMS,
  WALL_H,
  WALL_T,
  X0,
  Z0,
  ROOM_W,
  ROOM_D,
  HOUSE_W,
  HOUSE_D,
  ROWS,
  roomAt,
  type RoomDef,
  type WallSeg,
} from './layout';
import { Builder, furnish, makeMats, box, cyl, sph, pumpkin, type Haunted, type GlowPoint, type LightAnchor } from './props';
import * as T from './textures';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Box whose UVs are in world units / scale, so textures tile evenly on any size. */
function worldBox(w: number, h: number, d: number, scale: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
    }
  return g;
}

function explode(mesh: THREE.Mesh): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
  const g = mesh.geometry;
  if (!Array.isArray(mesh.material)) return [{ geo: g.clone(), mat: mesh.material }];
  const idx = g.getIndex()!;
  return g.groups.map((gr) => {
    const ng = g.clone();
    ng.setIndex(Array.from(idx.array.slice(gr.start, gr.start + gr.count)));
    ng.clearGroups();
    return { geo: ng, mat: (mesh.material as THREE.Material[])[gr.materialIndex!] };
  });
}

function normalizeGeo(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.getIndex()) {
    const n = g.getAttribute('position').count;
    const a = new Uint32Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    g.setIndex(new THREE.BufferAttribute(a, 1));
  }
  return g;
}

/** Merge every mesh under `root` into one mesh per material. Huge draw-call saver. */
function bake(root: THREE.Object3D, shadows: boolean): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const part of explode(m)) {
      part.geo.applyMatrix4(m.matrixWorld);
      normalizeGeo(part.geo);
      let list = buckets.get(part.mat);
      if (!list) buckets.set(part.mat, (list = []));
      list.push(part.geo);
    }
    m.geometry.dispose();
  });
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    const transparent = (mat as THREE.MeshBasicMaterial).transparent;
    mesh.castShadow = shadows && !mat.userData.noCast;
    mesh.receiveShadow = !transparent && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Glow sprites: every candle / pumpkin / fire glow in ONE draw call.
// ---------------------------------------------------------------------------
function makeGlowPoints(glows: GlowPoint[], tex: THREE.Texture) {
  const n = glows.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const flick = new Float32Array(n);
  glows.forEach((g, i) => {
    pos.set([g.x, g.y, g.z], i * 3);
    col.set([g.color.r, g.color.g, g.color.b], i * 3);
    size[i] = g.size;
    flick[i] = g.flicker;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('flicker', new THREE.BufferAttribute(flick, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTex: { value: tex }, uScale: { value: 400 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float flicker; attribute vec3 color;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float ph = position.x*3.1 + position.z*1.7;
        float f = 1.0 - flicker*0.18*(0.5+0.5*sin(uTime*11.0+ph)) - flicker*0.1*(0.5+0.5*sin(uTime*23.0+ph*2.0));
        vA = f;
        vColor = color;
        gl_PointSize = size * f * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uDim;
      varying vec3 vColor; varying float vA;
      void main(){
        float a = texture2D(uTex, gl_PointCoord).r;
        gl_FragColor = vec4(vColor * a * a * vA * 0.75 * uDim, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------
interface Lowerable {
  group: THREE.Group;
  /** returns true when this wall group should be lowered given player position */
  test: (px: number, pz: number) => boolean;
  h: number;
}

interface LightSlot {
  light: THREE.PointLight;
  anchor: LightAnchor | null;
  level: number;
  leaving: boolean;
}

export class House {
  grid = new Grid();
  group = new THREE.Group();
  mats = makeMats();
  haunted: Haunted[] = [];
  private lowerables: Lowerable[] = [];
  private updaters: ((t: number, dt: number) => void)[] = [];
  private anchors: LightAnchor[] = [];
  private slots: LightSlot[] = [];
  private glowPts!: THREE.Points;
  private slotTimer = 0;
  private pending: LightAnchor[] = [];
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  private flashAmt = 0;
  dim = 1; // 1 = normal, 0 = blackout
  private windowMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, shadows: boolean, lightCount: number) {
    scene.add(this.group);
    const m = this.mats;
    this.windowMat = m.window;

    const b = new Builder(this.grid, m);
    this.buildFloors(b);
    this.buildWalls(b);
    for (const r of ROOMS) furnish(b, r);
    this.buildYard(b);

    this.group.add(bake(b.root, shadows));
    this.group.add(b.dynamicRoot);
    b.dynamicRoot.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.castShadow = shadows;
        mm.receiveShadow = true;
      }
    });
    this.updaters = b.updaters;
    this.haunted = b.haunted;
    this.anchors = b.anchors;

    this.glowPts = makeGlowPoints(b.glows, T.glowTex());
    this.group.add(this.glowPts);

    // Lights ---------------------------------------------------------------
    this.hemi = new THREE.HemisphereLight('#8090d0', '#3a2a44', 1.5);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight('#8aa0ff', 0.9);
    this.moon.position.set(-10, 20, -8);
    scene.add(this.moon);

    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight('#ffa050', 0, 9, 1.6);
      light.position.set(0, -50, 0);
      scene.add(light);
      this.slots.push({ light, anchor: null, level: 0, leaving: false });
    }
  }

  private buildFloors(b: Builder) {
    const tex: Record<string, THREE.Texture> = {
      wood: T.woodFloor('#6b4428', 3),
      darkwood: T.woodFloor('#4a2c1a', 8),
      checker: T.checkerFloor('#d8cfe6', '#241c30'),
      marble: T.marbleFloor(),
      tile: T.kitchenTile(),
      stone: T.stoneFloor(),
    };
    const scales: Record<string, number> = { wood: 3, darkwood: 3, checker: 4, marble: 2.4, tile: 3, stone: 3.5, carpet: 2 };
    for (const r of ROOMS) {
      const key = r.floor === 'carpet' ? `carpet-${r.id}` : r.floor;
      let mat = b.m.floors[key];
      if (!mat) {
        const t = r.floor === 'carpet' ? T.carpet(r.carpet![0], r.carpet![1]) : tex[r.floor];
        mat = b.m.floors[key] = new THREE.MeshLambertMaterial({ map: t });
        mat.userData.noCast = true;
      }
      const s = scales[r.floor];
      const geo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * ROOM_W + r.x0) / s, (uv.getY(i) * ROOM_D - r.z0) / s);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.cx, 0, r.cz);
      b.root.add(mesh);
    }
  }

  private buildWalls(b: Builder) {
    const m = b.m;
    const papers = new Map<string, THREE.MeshLambertMaterial>();
    for (const r of ROOMS) papers.set(r.id, new THREE.MeshLambertMaterial({ map: T.wallpaper(r.wall[0], r.wall[1], r.wall[2]) }));
    const trim = m.woodDark;
    const outside = new THREE.MeshLambertMaterial({ map: T.stoneFloor() });
    const paperFor = (r: RoomDef | undefined) => (r ? papers.get(r.id)! : outside);

    // groups: 4 E-W lines + 3 rows of N-S walls
    const hLines: THREE.Group[] = [];
    for (let i = 0; i <= ROWS; i++) hLines.push(new THREE.Group());
    const vRows: THREE.Group[] = [];
    for (let i = 0; i < ROWS; i++) vRows.push(new THREE.Group());

    const segs = buildWallSegments();
    const addSeg = (s: WallSeg) => {
      const len = s.horizontal ? s.x1 - s.x0 : s.z1 - s.z0;
      if (len < 0.05) return;
      let mats: THREE.Material[];
      let geo: THREE.BufferGeometry;
      const mx = (s.x0 + s.x1) / 2,
        mz = (s.z0 + s.z1) / 2;
      if (s.horizontal) {
        const L = len + WALL_T; // overlap corners
        geo = worldBox(L, WALL_H, WALL_T, 1.5);
        const north = roomAt(mx, s.z0 - 0.5);
        const south = roomAt(mx, s.z0 + 0.5);
        mats = [trim, trim, trim, trim, paperFor(south), paperFor(north)];
      } else {
        geo = worldBox(WALL_T, WALL_H, len, 1.5);
        const west = roomAt(s.x0 - 0.5, mz);
        const east = roomAt(s.x0 + 0.5, mz);
        mats = [paperFor(east), paperFor(west), trim, trim, trim, trim];
      }
      geo.translate(0, WALL_H / 2, 0);
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(mx, 0, mz);
      if (s.horizontal) hLines[Math.round((s.z0 - Z0) / ROOM_D)].add(mesh);
      else vRows[Math.floor((mz - Z0) / ROOM_D)].add(mesh);
      // collision
      const t = WALL_T / 2 + 0.02;
      this.grid.fillRect(Math.min(s.x0, s.x1) - t, Math.min(s.z0, s.z1) - t, Math.max(s.x0, s.x1) + t, Math.max(s.z0, s.z1) + t, true);
      // skirting board
      if (s.horizontal) {
        for (const side of [-1, 1]) box(mesh, len, 0.18, 0.04, trim, 0, 0.09, side * (WALL_T / 2 + 0.02));
      } else {
        for (const side of [-1, 1]) box(mesh, 0.04, 0.18, len, trim, side * (WALL_T / 2 + 0.02), 0.09, 0);
      }
    };
    segs.forEach(addSeg);

    // door frames (posts + lintel) on interior openings
    for (const s of segs) {
      if (s.outer) continue;
      // each opening edge: the end of a segment that isn't a room corner
      const ends = s.horizontal ? [s.x0, s.x1] : [s.z0, s.z1];
      for (const e of ends) {
        const unit = s.horizontal ? (e - X0) / ROOM_W : (e - Z0) / ROOM_D;
        const cornerish = Math.abs(unit - Math.round(unit)) < 1e-3;
        if (cornerish) continue;
        const px = s.horizontal ? e : s.x0;
        const pz = s.horizontal ? s.z0 : e;
        const parent = s.horizontal ? hLines[Math.round((s.z0 - Z0) / ROOM_D)] : vRows[Math.floor((pz - Z0) / ROOM_D)];
        box(parent, s.horizontal ? 0.16 : WALL_T + 0.14, WALL_H, s.horizontal ? WALL_T + 0.14 : 0.16, m.woodLight, px, WALL_H / 2, pz);
      }
    }

    // windows on outer north / west / east walls (room-local positions chosen to avoid furniture)
    const winN: [string, number][] = [['ballroom', 0.8], ['ballroom', 4.0], ['conservatory', -3.4], ['conservatory', 0], ['conservatory', 3.6]];
    const winW: [string, number][] = [['dining', 0], ['kitchen', -2.8]];
    const winE: [string, number][] = [['conservatory', -3.0], ['conservatory', 1.2], ['bedroom', -3.2], ['bedroom', 3.2], ['nursery', 1.0], ['nursery', 3.6]];
    const room = (id: string) => ROOMS.find((r) => r.id === id)!;
    const addWindow = (parent: THREE.Object3D, x: number, z: number, rot: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      parent.add(g);
      const w = 1.2,
        h = 1.6,
        y = 1.65;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.windowMat);
      glass.position.set(0, y, 0.01);
      g.add(glass);
      box(g, w + 0.2, 0.12, 0.2, m.woodLight, 0, y - h / 2 - 0.02, 0.08);
      box(g, w + 0.2, 0.1, 0.1, m.woodLight, 0, y + h / 2 + 0.03, 0.04);
      box(g, 0.1, h, 0.1, m.woodLight, -w / 2 - 0.05, y, 0.04);
      box(g, 0.1, h, 0.1, m.woodLight, w / 2 + 0.05, y, 0.04);
      // curtains
      for (const sd of [-1, 1]) sph(g, 0.22, m.red, sd * (w / 2 + 0.2), y + 0.1, 0.12, 0.7, 4.2, 0.5, 8);
      b.glow(g, 0, y, 0.25, '#2a3a90', 1.4, 0);
    };
    const inner = WALL_T / 2 + 0.005;
    for (const [id, lx] of winN) addWindow(hLines[0], room(id).cx + lx, Z0 + inner, 0);
    for (const [id, lz] of winW) addWindow(vRows[room(id).row], X0 + inner, room(id).cz + lz, Math.PI / 2);
    for (const [id, lz] of winE) addWindow(vRows[room(id).row], X0 + HOUSE_W - inner, room(id).cz + lz, -Math.PI / 2);

    // front door (decorative, on the south outer wall of the foyer)
    {
      const f = room('foyer');
      const g = new THREE.Group();
      g.position.set(f.cx, 0, Z0 + HOUSE_D - inner);
      g.rotation.y = Math.PI;
      hLines[ROWS].add(g);
      box(g, 1.8, 2.5, 0.08, m.woodRed, 0, 1.25, 0.02);
      box(g, 2.1, 0.16, 0.16, m.woodLight, 0, 2.55, 0.05);
      sph(g, 0.06, m.brass, 0.6, 1.2, 0.1);
    }

    // bake each group separately so they can be lowered independently
    hLines.forEach((grp, i) => {
      const baked = bake(grp, true);
      this.group.add(baked);
      const z = Z0 + i * ROOM_D;
      this.lowerables.push({ group: baked, test: (_px, pz) => z > pz - 0.2, h: 1 });
    });
    vRows.forEach((grp, i) => {
      const baked = bake(grp, true);
      this.group.add(baked);
      const z0 = Z0 + i * ROOM_D;
      this.lowerables.push({ group: baked, test: (_px, pz) => z0 > pz + 0.5, h: 1 });
    });
  }

  private buildYard(b: Builder) {
    const m = b.m;
    const grassTex = T.carpet('#16241a', '#1c2e20');
    const grass = new THREE.MeshLambertMaterial({ map: grassTex });
    grass.userData.noCast = true;
    const geo = new THREE.PlaneGeometry(120, 100);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 40, uv.getY(i) * 33);
    const ground = new THREE.Mesh(geo, grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    b.root.add(ground);
    // front path
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 8), m.stone);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, -0.005, Z0 + HOUSE_D + 4);
    b.root.add(path);
    // gravestones and pumpkins in the yard
    const rand = (() => {
      let s = 99;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })();
    const stones: [number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 3;
      let x: number, z: number;
      if (side === 0) {
        x = (rand() - 0.5) * 44;
        z = Z0 + HOUSE_D + 2.5 + rand() * 9;
        if (Math.abs(x) < 2.2) x += 4 * Math.sign(x || 1);
      } else {
        x = (side === 1 ? -1 : 1) * (HOUSE_W / 2 + 2 + rand() * 7);
        z = (rand() - 0.5) * 36;
      }
      stones.push([x, z]);
    }
    stones.forEach(([x, z], i) => {
      const g = b.place(x, z, (rand() - 0.5) * 0.5);
      if (i % 5 === 4) {
        pumpkin(b, x, z, 1.2 + rand() * 0.4, rand());
        return;
      }
      const w = 0.6 + rand() * 0.3,
        h = 0.7 + rand() * 0.5;
      const tomb = box(g, w, h, 0.18, m.stone, 0, h / 2, 0);
      tomb.rotation.z = (rand() - 0.5) * 0.25;
      const top = cyl(g, w / 2, w / 2, 0.18, m.stone, 0, h, 0, 12);
      top.rotation.x = Math.PI / 2;
      top.rotation.z = tomb.rotation.z;
      box(g, w * 0.5, 0.05, 0.02, m.stoneDark, 0, h * 0.7, 0.1);
      box(g, w + 0.2, 0.08, 0.6, m.leafDark, 0, 0.04, 0.25);
    });
    // iron fence
    const fz = Z0 + HOUSE_D + 12.5;
    for (let x = -24; x <= 24; x += 0.5) {
      if (Math.abs(x) < 1.6) continue;
      cyl(b.root, 0.03, 0.03, 1.3, m.iron, x, 0.65, fz, 5);
    }
    box(b.root, 22.4, 0.06, 0.06, m.iron, -12.8, 1.1, fz);
    box(b.root, 22.4, 0.06, 0.06, m.iron, 12.8, 1.1, fz);
  }

  /** How lowered each wall group is, driven by player position. */
  update(t: number, dt: number, px: number, pz: number, camera: THREE.PerspectiveCamera, viewportH: number) {
    for (const lw of this.lowerables) {
      const target = lw.test(px, pz) ? 0.1 : 1;
      lw.h += (target - lw.h) * Math.min(1, dt * 7);
      lw.group.scale.y = lw.h;
      lw.group.visible = true;
    }
    for (const u of this.updaters) u(t, dt);

    const gm = this.glowPts.material as THREE.ShaderMaterial;
    gm.uniforms.uTime.value = t;
    gm.uniforms.uScale.value = viewportH * 0.5 * camera.projectionMatrix.elements[5];
    gm.uniforms.uDim.value = 0.25 + 0.75 * this.dim;

    // light pool: the nearest anchors get a real point light; lights fade out before moving
    this.slotTimer -= dt;
    if (this.slotTimer <= 0) {
      this.slotTimer = 0.3;
      const d2 = (a: LightAnchor) => (a.pos.x - px) ** 2 + (a.pos.z - pz) ** 2;
      const wanted = [...this.anchors].sort((a, c) => d2(a) - d2(c)).slice(0, this.slots.length);
      for (const s of this.slots) s.leaving = !!s.anchor && !wanted.includes(s.anchor);
      this.pending = wanted.filter((a) => !this.slots.some((s) => s.anchor === a));
    }
    for (const s of this.slots) {
      if (s.leaving && s.level < 0.03) {
        s.anchor = null;
        s.leaving = false;
      }
      if (!s.anchor && this.pending.length) {
        s.anchor = this.pending.shift()!;
        s.light.position.copy(s.anchor.pos);
        s.light.color.copy(s.anchor.color);
        s.level = 0;
      }
      const target = s.anchor && !s.leaving ? 1 : 0;
      s.level += (target - s.level) * Math.min(1, dt * 5);
      if (s.anchor) {
        const ph = s.anchor.pos.x * 1.3 + s.anchor.pos.z;
        const flick = 0.85 + Math.sin(t * 9 + ph) * 0.08 + Math.sin(t * 21 + ph * 2) * 0.07;
        s.light.intensity = 9 * s.anchor.intensity * s.level * flick * this.dim;
      } else s.light.intensity = 0;
    }

    // lightning flash
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.5);
    const f = this.flashAmt > 0.5 ? 1 : this.flashAmt * 2; // hold then decay
    this.hemi.intensity = (1.5 + f * 4) * (0.15 + 0.85 * this.dim);
    this.moon.intensity = (0.9 + f * 5) * (0.1 + 0.9 * this.dim);
    this.windowMat.color.setRGB(0.6 + f * 0.4, 0.66 + f * 0.34, 1);
  }

  flash() {
    this.flashAmt = 1;
  }

  randomPointInRoom(r: RoomDef, margin = 1.2) {
    return new THREE.Vector3(r.x0 + margin + Math.random() * (ROOM_W - margin * 2), 0, r.z0 + margin + Math.random() * (ROOM_D - margin * 2));
  }
}

export { ROOMS, roomAt };
