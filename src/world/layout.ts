import type { WallStyle } from './textures';

export const COLS = 3;
export const ROWS = 3;
export const ROOM_W = 12;
export const ROOM_D = 10;
export const HOUSE_W = COLS * ROOM_W;
export const HOUSE_D = ROWS * ROOM_D;
export const X0 = -HOUSE_W / 2;
export const Z0 = -HOUSE_D / 2;
export const WALL_H = 3;
export const WALL_T = 0.3;
export const DOOR_W = 2.8;

export type FloorKind = 'wood' | 'darkwood' | 'checker' | 'marble' | 'carpet' | 'tile' | 'stone';

export interface RoomDef {
  id: string;
  name: string;
  col: number;
  row: number;
  floor: FloorKind;
  carpet?: [string, string];
  wall: [string, string, WallStyle];
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cx: number;
  cz: number;
}

const defs: Omit<RoomDef, 'x0' | 'z0' | 'x1' | 'z1' | 'cx' | 'cz'>[] = [
  { id: 'library', name: 'Library', col: 0, row: 0, floor: 'darkwood', wall: ['#1f3325', '#2c4a34', 'stripes'] },
  { id: 'ballroom', name: 'Ballroom', col: 1, row: 0, floor: 'checker', wall: ['#3a2350', '#4d3068', 'damask'] },
  { id: 'conservatory', name: 'Conservatory', col: 2, row: 0, floor: 'stone', wall: ['#29403f', '#35524f', 'diamonds'] },
  { id: 'dining', name: 'Dining Room', col: 0, row: 1, floor: 'wood', wall: ['#4a1820', '#5e2029', 'damask'] },
  { id: 'hall', name: 'Great Hall', col: 1, row: 1, floor: 'marble', wall: ['#2a3040', '#353c50', 'stripes'] },
  { id: 'bedroom', name: 'Bedroom', col: 2, row: 1, floor: 'carpet', carpet: ['#3d2440', '#553058'], wall: ['#4a3548', '#5a4258', 'dots'] },
  { id: 'kitchen', name: 'Kitchen', col: 0, row: 2, floor: 'tile', wall: ['#5a4a22', '#6a5a2c', 'stripes'] },
  { id: 'foyer', name: 'Foyer', col: 1, row: 2, floor: 'wood', wall: ['#3e1a22', '#52242e', 'diamonds'] },
  { id: 'nursery', name: 'Nursery', col: 2, row: 2, floor: 'carpet', carpet: ['#244446', '#2f5a5c'], wall: ['#4a3a44', '#5c4a56', 'stars'] },
];

export const ROOMS: RoomDef[] = defs.map((d) => {
  const x0 = X0 + d.col * ROOM_W;
  const z0 = Z0 + d.row * ROOM_D;
  return { ...d, x0, z0, x1: x0 + ROOM_W, z1: z0 + ROOM_D, cx: x0 + ROOM_W / 2, cz: z0 + ROOM_D / 2 };
});

export function roomAt(x: number, z: number): RoomDef | undefined {
  const c = Math.floor((x - X0) / ROOM_W);
  const r = Math.floor((z - Z0) / ROOM_D);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return undefined;
  return ROOMS[r * COLS + c];
}

// Door offset along the wall (0 = centered). Every interior neighbour pair gets a door.
export function vDoorOffset(line: number, row: number) {
  // vertical wall line x = X0 + line*ROOM_W between col line-1 and line
  return [[0, 0], [1.2, -1.2], [-1.4, 1.0]][row][line - 1] ?? 0;
}
export function hDoorOffset(line: number, col: number) {
  return [[0, 0, 0], [-2, 1.5, 2], [2, 0, -2]][line - 1]?.[col] ?? 0;
}

/**
 * Where to walk to get from room `a` toward room `b`: the doorway into the next
 * room on the way (every neighbouring pair of rooms has a door). Null if same room.
 */
export function nextDoorToward(a: RoomDef, b: RoomDef): { x: number; z: number } | null {
  if (a === b) return null;
  const past = 0.7; // aim a little beyond the doorway so we actually cross it
  if (a.col !== b.col) {
    const dir = b.col > a.col ? 1 : -1;
    const c = dir > 0 ? a.col + 1 : a.col; // vertical wall line index
    return { x: X0 + c * ROOM_W + dir * past, z: a.cz + vDoorOffset(c, a.row) };
  }
  const dir = b.row > a.row ? 1 : -1;
  const r = dir > 0 ? a.row + 1 : a.row; // horizontal wall line index
  return { x: a.cx + hDoorOffset(r, a.col), z: Z0 + r * ROOM_D + dir * past };
}

export interface WallSeg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  horizontal: boolean; // runs east-west
  outer: boolean;
}

export function buildWallSegments(): WallSeg[] {
  const segs: WallSeg[] = [];
  const half = DOOR_W / 2;
  // Vertical lines (N-S walls)
  for (let line = 0; line <= COLS; line++) {
    const x = X0 + line * ROOM_W;
    const outer = line === 0 || line === COLS;
    for (let r = 0; r < ROWS; r++) {
      const za = Z0 + r * ROOM_D;
      const zb = za + ROOM_D;
      if (outer) segs.push({ x0: x, z0: za, x1: x, z1: zb, horizontal: false, outer });
      else {
        const dc = (za + zb) / 2 + vDoorOffset(line, r);
        segs.push({ x0: x, z0: za, x1: x, z1: dc - half, horizontal: false, outer });
        segs.push({ x0: x, z0: dc + half, x1: x, z1: zb, horizontal: false, outer });
      }
    }
  }
  // Horizontal lines (E-W walls)
  for (let line = 0; line <= ROWS; line++) {
    const z = Z0 + line * ROOM_D;
    const outer = line === 0 || line === ROWS;
    for (let c = 0; c < COLS; c++) {
      const xa = X0 + c * ROOM_W;
      const xb = xa + ROOM_W;
      if (outer) segs.push({ x0: xa, z0: z, x1: xb, z1: z, horizontal: true, outer });
      else {
        const dc = (xa + xb) / 2 + hDoorOffset(line, c);
        segs.push({ x0: xa, z0: z, x1: dc - half, z1: z, horizontal: true, outer });
        segs.push({ x0: dc + half, z0: z, x1: xb, z1: z, horizontal: true, outer });
      }
    }
  }
  return segs;
}

// ---------------------------------------------------------------------------
// Collision grid
// ---------------------------------------------------------------------------
export const CELL = 0.25;
export const GW = Math.ceil(HOUSE_W / CELL);
export const GH = Math.ceil(HOUSE_D / CELL);

interface Box {
  x: number;
  z: number;
  hw: number; // half extents in the box's local frame
  hd: number;
  c: number; // cos/sin of rotation
  s: number;
  r: number; // bounding radius for quick rejection
}

/**
 * Collision world. Walls and furniture are (possibly rotated) boxes; characters
 * are circles that get pushed out of them, so they slide smoothly along walls
 * and round corners instead of snagging. A coarse wall grid is kept only for
 * cheap line-of-sight tests.
 */
export class Grid {
  walls = new Uint8Array(GW * GH); // walls only (for line of sight)
  private boxes: Box[] = [];
  // spatial hash of box indices, 2m buckets
  private buckets = new Map<number, number[]>();

  private key(i: number, j: number) {
    return j * 1000 + i;
  }

  addBox(x: number, z: number, hw: number, hd: number, rot = 0) {
    const b: Box = { x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), r: Math.hypot(hw, hd) };
    const idx = this.boxes.push(b) - 1;
    const reach = b.r + 0.5; // + max character radius
    const i0 = Math.floor((x - reach - X0) / 2),
      i1 = Math.floor((x + reach - X0) / 2);
    const j0 = Math.floor((z - reach - Z0) / 2),
      j1 = Math.floor((z + reach - Z0) / 2);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = this.key(i + 100, j + 100);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, (list = []));
        list.push(idx);
      }
  }

  fillRect(x0: number, z0: number, x1: number, z1: number, wall: boolean) {
    const ax = Math.min(x0, x1),
      bx = Math.max(x0, x1),
      az = Math.min(z0, z1),
      bz = Math.max(z0, z1);
    this.addBox((ax + bx) / 2, (az + bz) / 2, (bx - ax) / 2, (bz - az) / 2);
    if (!wall) return;
    const a = Math.max(0, Math.floor((ax - X0) / CELL));
    const b = Math.min(GW - 1, Math.floor((bx - X0) / CELL));
    const c = Math.max(0, Math.floor((az - Z0) / CELL));
    const d = Math.min(GH - 1, Math.floor((bz - Z0) / CELL));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) this.walls[j * GW + i] = 1;
  }

  private near(x: number, z: number): number[] {
    return this.buckets.get(this.key(Math.floor((x - X0) / 2) + 100, Math.floor((z - Z0) / 2) + 100)) ?? [];
  }

  /** Push a circle out of every overlapping box. Returns true if anything was hit. */
  private resolve(p: { x: number; z: number }, r: number) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (const idx of this.near(p.x, p.z)) {
        const b = this.boxes[idx];
        const dx = p.x - b.x,
          dz = p.z - b.z;
        if (dx * dx + dz * dz > (b.r + r) * (b.r + r)) continue;
        // into box-local space
        const lx = dx * b.c - dz * b.s;
        const lz = dx * b.s + dz * b.c;
        const qx = Math.max(-b.hw, Math.min(b.hw, lx));
        const qz = Math.max(-b.hd, Math.min(b.hd, lz));
        let ox = lx - qx,
          oz = lz - qz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        let nx: number, nz: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          nx = lx + (ox / d) * push;
          nz = lz + (oz / d) * push;
        } else {
          // centre is inside the box: leave by the nearest face
          const px = b.hw - Math.abs(lx),
            pz = b.hd - Math.abs(lz);
          if (px < pz) {
            nx = Math.sign(lx || 1) * (b.hw + r);
            nz = lz;
          } else {
            nx = lx;
            nz = Math.sign(lz || 1) * (b.hd + r);
          }
        }
        ox = nx;
        oz = nz;
        // back to world space
        p.x = b.x + ox * b.c + oz * b.s;
        p.z = b.z - ox * b.s + oz * b.c;
        any = hit = true;
      }
      if (!any) break;
    }
    return hit;
  }

  circleBlocked(x: number, z: number, r: number) {
    const p = { x, z };
    this.resolve(p, r);
    return Math.abs(p.x - x) > 1e-4 || Math.abs(p.z - z) > 1e-4;
  }

  /** Move a circle with sliding collision. Returns true if it moved at least half as far as asked. */
  move(p: { x: number; z: number }, dx: number, dz: number, r: number) {
    const want = Math.hypot(dx, dz);
    if (want < 1e-6) return true;
    const sx0 = p.x,
      sz0 = p.z;
    const steps = Math.max(1, Math.ceil(want / 0.12));
    for (let s = 0; s < steps; s++) {
      p.x += dx / steps;
      p.z += dz / steps;
      this.resolve(p, r);
    }
    return Math.hypot(p.x - sx0, p.z - sz0) > want * 0.5;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.15);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      const gi = Math.floor((x - X0) / CELL),
        gj = Math.floor((z - Z0) / CELL);
      if (gi < 0 || gj < 0 || gi >= GW || gj >= GH || this.walls[gj * GW + gi]) return false;
    }
    return true;
  }

  /** Find the nearest open spot for a circle (spiral search). */
  freeSpot(x: number, z: number, r: number) {
    if (!this.circleBlocked(x, z, r)) return { x, z };
    for (let rad = 0.25; rad < 4; rad += 0.25)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const nx = x + Math.cos(a) * rad,
          nz = z + Math.sin(a) * rad;
        if (!this.circleBlocked(nx, nz, r)) return { x: nx, z: nz };
      }
    return { x, z };
  }
}
