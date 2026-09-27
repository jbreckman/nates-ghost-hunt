import * as THREE from 'three';
import { makeGhost, GHOST_STYLE, type GhostKind, type GhostModel } from './models';
import { HOUSE_W, HOUSE_D, X0, Z0, roomAt, ROOMS, ROOM_W, ROOM_D } from '../world/layout';

export interface GhostStats {
  speed: number;
  flee: number;
  time: number;
  points: number;
  resist: number; // seconds of vacuuming to capture
  dazeNeed: number; // seconds in the beam to get dazed
  dazeTime: number;
  height: number;
  name: string;
}

export const STATS: Record<GhostKind, GhostStats> = {
  wisp: { speed: 3.2, flee: 4.6, time: 2, points: 50, resist: 0.5, dazeNeed: 0.25, dazeTime: 1.2, height: 1.2, name: 'Wisp' },
  sheet: { speed: 1.9, flee: 3.8, time: 3, points: 100, resist: 0.95, dazeNeed: 0.38, dazeTime: 1.4, height: 1.15, name: 'Sheet Ghost' },
  sneaky: { speed: 2.1, flee: 4.0, time: 4, points: 150, resist: 1.05, dazeNeed: 0.45, dazeTime: 1.3, height: 1.15, name: 'Sneaky Ghost' },
  prankster: { speed: 2.3, flee: 4.0, time: 4, points: 200, resist: 1.2, dazeNeed: 0.4, dazeTime: 1.3, height: 1.1, name: 'Prankster' },
  king: { speed: 1.3, flee: 2.1, time: 10, points: 500, resist: 2.8, dazeNeed: 0.8, dazeTime: 1.2, height: 1.75, name: 'King Boo' },
};

export type GhostState = 'spawning' | 'roam' | 'flee' | 'dazed' | 'charge' | 'gloat' | 'captured' | 'burst' | 'kidnap';

const tmp = new THREE.Vector3();

export class Ghost {
  /** title screen: show every ghost regardless of distance */
  static fullVis = true;
  model: GhostModel;
  stats: GhostStats;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  y = 0;
  state: GhostState = 'spawning';
  stateT = 0;
  age = 0;
  dazeT = 0;
  exposure = 0;
  inBeam = false;
  suck = 0; // capture progress 0..1
  beingSucked = false;
  reveal = 0;
  target = new THREE.Vector3();
  prankCooldown = 4;
  alive = true;
  captured = false;
  private seed = Math.random() * 100;
  private wasDazed = false;
  onDazed?: (g: Ghost) => void;

  constructor(public kind: GhostKind, scene: THREE.Scene, x: number, z: number) {
    this.model = makeGhost(kind);
    this.stats = STATS[kind];
    this.pos.set(x, 0, z);
    this.y = -0.8;
    scene.add(this.model.root);
    scene.add(this.model.floor);
    this.pickTarget();
    this.syncModel(0, new THREE.Vector3());
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.model.root);
    scene.remove(this.model.floor);
    this.model.mat.dispose();
    this.model.floorMat.dispose();
  }

  get dazed() {
    return this.state === 'dazed';
  }
  get catchable() {
    return this.alive && !this.captured && this.state !== 'spawning';
  }

  pickTarget() {
    // wander within the current room or a neighbouring one (ghosts drift through walls!)
    const cur = roomAt(this.pos.x, this.pos.z) ?? ROOMS[4];
    let room = cur;
    if (Math.random() < 0.35) {
      const nbrs = ROOMS.filter((r) => Math.abs(r.col - cur.col) + Math.abs(r.row - cur.row) === 1);
      room = nbrs[Math.floor(Math.random() * nbrs.length)] ?? cur;
    }
    this.target.set(room.x0 + 1.2 + Math.random() * (ROOM_W - 2.4), 0, room.z0 + 1.2 + Math.random() * (ROOM_D - 2.4));
  }

  daze(time: number) {
    if (this.captured || this.state === 'spawning') return;
    if (this.state !== 'dazed') {
      this.state = 'dazed';
      this.stateT = 0;
    }
    this.dazeT = Math.max(this.dazeT, time);
  }

  /** Main AI update. natePos: Nate, beamHit: set by capture system before this call. */
  update(dt: number, t: number, natePos: THREE.Vector3, difficulty: number, onPrank: (g: Ghost) => void) {
    this.age += dt;
    this.stateT += dt;
    const s = this.stats;
    const speedMul = 1 + difficulty * 0.35;
    const dx = this.pos.x - natePos.x,
      dz = this.pos.z - natePos.z;
    const distNate = Math.hypot(dx, dz);

    // beam exposure -> daze
    if (this.inBeam && this.state !== 'spawning' && !this.captured) {
      this.exposure += dt;
      this.reveal = 1;
      if (this.exposure >= s.dazeNeed) this.daze(s.dazeTime);
      if (this.state === 'dazed') this.dazeT = Math.max(this.dazeT, 0.6);
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 0.5);
      this.reveal = Math.max(0, this.reveal - dt * 0.5);
    }

    const desired = tmp.set(0, 0, 0);
    switch (this.state) {
      case 'spawning': {
        this.y += (this.stats.height - this.y) * Math.min(1, dt * 3);
        if (this.stateT > 0.9) this.state = 'roam';
        break;
      }
      case 'burst': {
        // burst out of furniture toward the player, then roam
        desired.set(-dx, 0, -dz).normalize().multiplyScalar(5.5);
        this.y += (this.stats.height + 0.3 - this.y) * Math.min(1, dt * 5);
        if (this.stateT > 0.6 || distNate < 1.2) {
          this.state = 'flee';
          this.stateT = 0;
        }
        break;
      }
      case 'roam': {
        tmp.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
        const d = tmp.length();
        if (d < 0.5 || this.stateT > 9) {
          this.pickTarget();
          this.stateT = 0;
        }
        desired.copy(tmp).normalize().multiplyScalar(s.speed * speedMul);
        if (this.kind === 'wisp') {
          desired.x += Math.sin(t * 3 + this.seed) * 2.2;
          desired.z += Math.cos(t * 2.3 + this.seed) * 2.2;
        }
        const fleeR = this.kind === 'king' ? 3 : 4.5;
        if (distNate < fleeR) {
          this.state = 'flee';
          this.stateT = 0;
        }
        if (this.kind === 'prankster') {
          this.prankCooldown -= dt;
          if (this.prankCooldown <= 0 && distNate < 7.5) {
            this.state = 'charge';
            this.stateT = 0;
          }
        }
        break;
      }
      case 'flee': {
        desired.set(dx, 0, dz).normalize().multiplyScalar(s.flee * speedMul);
        // swerve so ghosts don't just run in a straight line into a corner
        const sw = Math.sin(t * 1.7 + this.seed) * 0.8;
        desired.x += -desired.z * sw * 0.5;
        desired.z += desired.x * sw * 0.5;
        if (this.kind === 'wisp') {
          desired.x += Math.sin(t * 7 + this.seed) * 3;
          desired.z += Math.cos(t * 6 + this.seed) * 3;
        }
        if (distNate > 7 || this.stateT > 3.5) {
          this.state = 'roam';
          this.stateT = 0;
          this.pickTarget();
        }
        break;
      }
      case 'charge': {
        desired.set(-dx, 0, -dz).normalize().multiplyScalar(4.1 + difficulty * 0.5);
        if (distNate < 0.85) {
          onPrank(this);
          this.state = 'gloat';
          this.stateT = 0;
          this.prankCooldown = 8;
        } else if (this.stateT > 3.2 || distNate > 11) {
          this.state = 'roam';
          this.stateT = 0;
          this.prankCooldown = 4;
        }
        break;
      }
      case 'gloat': {
        desired.set(dx, 0, dz).normalize().multiplyScalar(5.5);
        if (this.stateT > 2.2) {
          this.state = 'roam';
          this.stateT = 0;
          this.pickTarget();
        }
        break;
      }
      case 'dazed': {
        this.dazeT -= dt;
        if (!this.beingSucked && this.dazeT <= 0) {
          this.state = 'flee';
          this.stateT = 0;
          this.suck = 0;
        }
        break;
      }
      case 'kidnap': {
        // float away from Nate, carrying Matt (slowly, so Nate can catch up)
        desired.set(dx, 0, dz).normalize().multiplyScalar(1.5);
        desired.x += Math.sin(t * 1.3 + this.seed) * 1.2;
        desired.z += Math.cos(t * 1.1 + this.seed) * 1.2;
        break;
      }
      case 'captured':
        break;
    }

    if (!this.beingSucked) this.suck = Math.max(0, this.suck - dt * 0.7);

    if (this.state !== 'dazed' && this.state !== 'captured') {
      const acc = this.kind === 'wisp' ? 6 : 3;
      this.vel.x += (desired.x - this.vel.x) * Math.min(1, dt * acc);
      this.vel.z += (desired.z - this.vel.z) * Math.min(1, dt * acc);
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // stay inside the house
    const m = 0.8;
    this.pos.x = Math.min(X0 + HOUSE_W - m, Math.max(X0 + m, this.pos.x));
    this.pos.z = Math.min(Z0 + HOUSE_D - m, Math.max(Z0 + m, this.pos.z));

    if (this.state !== 'spawning' && this.state !== 'burst' && this.state !== 'captured')
      this.y += (s.height + (this.state === 'kidnap' ? 1.1 : 0) + Math.sin(t * 2 + this.seed) * 0.15 - this.y) * Math.min(1, dt * 4);

    if (this.dazed && !this.wasDazed) this.onDazed?.(this);
    this.wasDazed = this.dazed;
    this.syncModel(t, natePos);
  }

  /** Pull toward the nozzle. Returns true when captured. */
  pull(dt: number, t: number, nozzle: THREE.Vector3) {
    let rate = 1 / this.stats.resist;
    if (this.kind === 'king' && Math.sin(t * 4 + this.seed) > 0.55) rate = -0.35; // fights back!
    this.suck = Math.min(1, Math.max(0, this.suck + dt * rate));
    this.dazeT = Math.max(this.dazeT, 0.6);
    tmp.set(nozzle.x - this.pos.x, 0, nozzle.z - this.pos.z);
    const d = tmp.length();
    const sp = (0.6 + this.suck * 7) * dt;
    if (rate > 0 && d > 0.01) {
      this.pos.x += (tmp.x / d) * Math.min(d, sp);
      this.pos.z += (tmp.z / d) * Math.min(d, sp);
    }
    this.y += (nozzle.y + 0.2 - this.y) * Math.min(1, dt * this.suck * 4);
    return this.suck >= 1 || (d < 0.45 && this.suck > 0.5);
  }

  syncModel(t: number, natePos: THREE.Vector3) {
    const m = this.model;
    m.root.position.set(this.pos.x, this.y, this.pos.z);
    // face Nate (creepy!) unless fleeing
    const lookX = this.state === 'flee' || this.state === 'gloat' || this.state === 'kidnap' ? this.vel.x : natePos.x - this.pos.x;
    const lookZ = this.state === 'flee' || this.state === 'gloat' || this.state === 'kidnap' ? this.vel.z : natePos.z - this.pos.z;
    const want = Math.atan2(lookX, lookZ);
    let diff = want - m.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    m.root.rotation.y += diff * 0.15;

    const u = m.mat.uniforms;
    u.uTime.value = t + this.seed;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    m.inner.rotation.x = Math.min(0.4, sp * 0.08);
    const dz = this.dazed;
    m.stars.visible = dz;
    if (dz) m.stars.rotation.y = t * 5;
    const sucked = this.suck > 0.02;
    m.inner.rotation.z = dz ? Math.sin(t * 9 + this.seed) * (0.15 + this.suck * 0.4) : 0;
    const stretch = 1 + this.suck * 0.6;
    m.inner.scale.set(1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch), stretch);
    // eyes: squint when dazed, wide when being sucked
    for (const e of m.eyes) {
      const base = this.kind === 'sneaky' ? 0.7 : 1.25;
      e.scale.y = sucked ? base * 1.3 : dz ? 0.25 : base;
    }
    m.mouth.scale.y = sucked ? 0.9 : this.kind === 'prankster' ? 0.5 : this.state === 'charge' ? 0.7 : 0.45;
    u.uFlash.value = dz ? 0.25 + 0.2 * Math.sin(t * 20) : this.state === 'charge' ? 0.15 : 0;

    let op = 0.9;
    // hidden in the dark unless close to Nate or lit by the flashlight
    if (!Ghost.fullVis) {
      const d = Math.hypot(this.pos.x - natePos.x, this.pos.z - natePos.z);
      // solid up close, fading to a faint shimmer at 7m, gone past ~10m
      const k = Math.min(1, Math.max(0, (d - 2) / 5));
      const near = (1 - 0.92 * Math.pow(k, 0.8)) * Math.min(1, Math.max(0, (10 - d) / 3));
      const lit = this.dazed || this.state === 'kidnap' ? 1 : this.reveal;
      op *= Math.max(near, lit);
    }
    if (this.state === 'spawning') op *= Math.min(1, this.stateT / 0.8);
    if (this.kind === 'sneaky') op *= Math.max(0.08, Math.max(this.reveal, dz ? 1 : 0));
    if (this.captured) op *= Math.max(0, 1 - this.stateT * 4);
    u.uOpacity.value = op;
    m.faceG.visible = op > 0.3;
    m.root.visible = op > 0.01;
    m.floor.visible = op > 0.01;

    m.floor.position.set(this.pos.x, 0.03, this.pos.z);
    const style = GHOST_STYLE[this.kind];
    m.floor.scale.setScalar(style.scale * 1.1);
    m.floorMat.opacity = op * 0.55;
  }
}
