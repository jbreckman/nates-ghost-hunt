import * as THREE from 'three';
import { makeMatt, animateHumanoid, type MattModel } from './models';
import { roomAt, nextDoorToward, type Grid } from '../world/layout';
import type { Nate } from './nate';
import type { Ghost } from './ghost';

export const QUIPS = {
  idle: [
    "Nate... I think the painting just blinked.",
    'I have to go potty. Just kidding!',
    "I'm not scared. YOU'RE scared.",
    'Do ghosts eat cookies? Asking for me.',
    'This house smells like old socks.',
    'When I grow up I want to be a ghost. Or a dinosaur.',
    'Did you hear that?! ...Oh, it was my tummy.',
    "Mom said be home by dinner!",
    'Can we keep one as a pet? Please?',
    'I bet I can catch more than you!',
  ],
  catch: ['Nice one, Nate!', 'GOTCHA!', 'Woohoo!', 'Into the vacuum you go!', 'Bye-bye, ghostie!', "That's the best one yet!", 'Ha ha, it went SHLOOP!'],
  combo: ['Combo! Keep going!', "We're on fire!", 'Ghost-busting brothers!'],
  scared: ['AAAAAH!', 'Mommyyyy!', "I wasn't scared. That was a happy scream.", 'Nate, hold my hand!', 'NOPE NOPE NOPE'],
  prank: ['Hey! Give our time back!', 'That green one is SO rude!', "No fair! It's cheating!"],
  spot: ['I see one over there!', 'Nate! This way!', 'Ooh, a ghost went that way!', 'Follow the arrow!'],
  found: ['Over here, Nate!', 'I found one! Come quick!', 'NATE! Ghost! Right here!', "It's right here! Hurry!", 'Found it! Found it!'],
  hurry: ['Hurry Nate, the clock!', 'Faster! Faster!', 'Time is almost up!'],
  boo: ['BOO!!!', 'BOOOOOO!', 'RAAAWR! I mean BOO!', 'BOO! Ha ha!', 'Get dizzy, ghostie!'],
  hunt: ["I'll get that one!", 'Come back here, ghostie!', 'Me first! Me first!', "I'm gonna catch it!", 'Wait up, ghost!'],
  grabbed: ['NATE! HELP!!', 'AAAH! PUT ME DOWN!', "HEY! I'm not a ghost snack!", 'NATE!!! SHINE THE LIGHT!'],
  rescued: ['My hero!', 'Thanks Nate! That was kinda fun...', "I'm OK! I'm OK!", 'Again! Again! ...No wait.'],
  dropped: ['Whoaaa... dizzy...', "I'm fine... where's my hat?", 'That ghost tickled me!'],
  king: ["Whoa, it's the KING ghost!", "That one's HUGE!", 'It has a crown!'],
  lost: ['Wait for me!', 'Nate! Wait up!'],
};

export function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export class Matt {
  model: MattModel;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = Math.PI;
  phase = 0;
  trail: THREE.Vector3[] = [];
  netT = 0; // swing animation timer
  jumpT = 0;
  scaredT = 0;
  booCooldown = 3;
  netCooldown = 0;
  carriedBy: Ghost | null = null;
  dizzyT = 0;
  hunting = false;
  stuckT = 0;
  stepAcc = 0;
  onStep?: () => void;
  onPoof?: (p: THREE.Vector3) => void;
  headWorld = new THREE.Vector3();
  private waypoint = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.model = makeMatt();
    scene.add(this.model.root);
  }

  reset(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.trail = [];
    this.booCooldown = 3;
    this.netCooldown = 0;
    this.carriedBy = null;
    this.dizzyT = 0;
    this.scaredT = 0;
  }

  swingNet() {
    this.netT = 0.4;
  }

  update(dt: number, t: number, nate: Nate, grid: Grid, lookAt: Ghost | null, chase: THREE.Vector3 | null = null, standoff = 0.15) {
    this.booCooldown -= dt;
    this.netCooldown -= dt;
    const m0 = this.model;
    if (this.carriedBy) {
      // dangling under a ghost, legs kicking
      const g = this.carriedBy;
      this.pos.set(g.pos.x, 0, g.pos.z);
      this.vel.set(0, 0, 0);
      m0.root.position.set(g.pos.x, Math.max(0, g.y - 0.64 * g.model.root.scale.y - 1.2), g.pos.z);
      m0.root.rotation.y += dt * 1.5;
      m0.legL.rotation.x = Math.sin(t * 18) * 0.9;
      m0.legR.rotation.x = -Math.sin(t * 18) * 0.9;
      m0.armL.rotation.x = -2.9 + Math.sin(t * 14) * 0.3;
      m0.armR.rotation.x = -2.9 - Math.sin(t * 14) * 0.3;
      m0.body.position.set(0, 0, 0);
      m0.prop.rotation.y += dt * 20;
      this.trail = [];
      m0.head.getWorldPosition(this.headWorld);
      return;
    }
    if (this.dizzyT > 0) {
      this.dizzyT -= dt;
      chase = null;
    }
    // record Nate's path as breadcrumbs
    const last = this.trail[this.trail.length - 1];
    if (!last || last.distanceToSquared(nate.pos) > 0.09) {
      this.trail.push(nate.pos.clone());
      if (this.trail.length > 80) this.trail.shift();
    }
    // follow point ~1.5m behind along the trail
    let acc = 0;
    let target = this.trail[0] ?? nate.pos;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += this.trail[i].distanceTo(this.trail[i - 1]);
      if (acc > 1.5) {
        target = this.trail[i - 1];
        break;
      }
    }
    const distNate = this.pos.distanceTo(nate.pos);
    this.hunting = !!chase && distNate < 16;
    if (this.hunting) target = chase!;
    else if (!grid.lineOfSight(this.pos.x, this.pos.z, target.x, target.z)) {
      // walk back to Nate through the doorways instead of into a wall
      const from = roomAt(this.pos.x, this.pos.z);
      const to = roomAt(target.x, target.z);
      const door = from && to ? nextDoorToward(from, to) : null;
      if (door) target = this.waypoint.set(door.x, 0, door.z);
    }
    const tx = target.x - this.pos.x,
      tz = target.z - this.pos.z;
    const td = Math.hypot(tx, tz);
    let wantX = 0,
      wantZ = 0;
    const stop = this.hunting ? standoff : 0.15;
    if ((distNate > 1.3 || target === chase) && td > stop) {
      const sp = this.dizzyT > 0 ? 1.2 : this.scaredT > 0 ? 7.5 : this.hunting ? 4.3 : Math.min(6.8, td * 3 + 1.5);
      wantX = (tx / td) * sp;
      wantZ = (tz / td) * sp;
    }
    // too close to the ghost he's showing Nate? back off a little
    if (this.hunting && standoff > 1 && td < standoff * 0.75 && td > 1e-3) {
      wantX = (-tx / td) * 2.5;
      wantZ = (-tz / td) * 2.5;
    }
    this.vel.x += (wantX - this.vel.x) * Math.min(1, dt * 12);
    this.vel.z += (wantZ - this.vel.z) * Math.min(1, dt * 12);
    const moved = grid.move(this.pos, this.vel.x * dt, this.vel.z * dt, 0.25);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!moved && sp > 1) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (distNate > 20 || (this.stuckT > 1.2 && !this.hunting) || this.stuckT > 2.5) {
      // poof! teleport right behind Nate
      const behind = new THREE.Vector3(nate.pos.x - nate.dir.x * 1.2, 0, nate.pos.z - nate.dir.z * 1.2);
      const spot = grid.freeSpot(behind.x, behind.z, 0.3);
      this.onPoof?.(this.pos.clone());
      this.pos.set(spot.x, 0, spot.z);
      this.onPoof?.(this.pos.clone());
      this.stuckT = 0;
      this.trail = [];
    }

    // facing
    let want = this.facing;
    if (sp > 0.4) want = Math.atan2(this.vel.x, this.vel.z);
    else if (lookAt) want = Math.atan2(lookAt.pos.x - this.pos.x, lookAt.pos.z - this.pos.z);
    else want = Math.atan2(nate.pos.x - this.pos.x, nate.pos.z - this.pos.z);
    let diff = want - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * 10);

    this.phase += sp * dt * 3.2;
    this.stepAcc += sp * dt;
    if (this.stepAcc > 0.6) {
      this.stepAcc = 0;
      this.onStep?.();
    }

    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing + (this.dizzyT > 0 ? Math.sin(t * 8) * 0.6 : 0);
    animateHumanoid(m, this.phase, sp / 5, t, 0.6);
    // propeller spins faster when running
    m.prop.rotation.y += dt * (4 + sp * 6);
    // net swing
    if (this.netT > 0) {
      this.netT -= dt;
      const k = 1 - this.netT / 0.4;
      m.armR.rotation.x = -2.4 + Math.sin(k * Math.PI) * 2.2;
      m.armR.rotation.z = Math.sin(k * Math.PI) * -0.6;
    } else {
      m.armR.rotation.x = -0.5 + Math.sin(this.phase) * 0.2;
      m.armR.rotation.z = 0;
    }
    // when standing around, point at the ghost he's looking at
    if (sp < 0.6 && lookAt && this.dizzyT <= 0) m.armL.rotation.x = -1.6 + Math.sin(t * 5) * 0.08;
    // BOO jump / scared shake
    this.jumpT = Math.max(0, this.jumpT - dt);
    const jump = this.jumpT > 0 ? Math.sin((1 - this.jumpT / 0.5) * Math.PI) * 0.5 : 0;
    m.root.position.y = jump;
    if (this.jumpT > 0) {
      m.armL.rotation.x = -2.8;
      m.armR.rotation.x = -2.8;
    }
    this.scaredT = Math.max(0, this.scaredT - dt);
    if (this.scaredT > 0) {
      m.body.position.x = Math.sin(t * 60) * 0.03;
      m.armL.rotation.x = -2.9;
      m.armR.rotation.x = -2.9;
    } else m.body.position.x = 0;

    m.head.getWorldPosition(this.headWorld);
  }
}
