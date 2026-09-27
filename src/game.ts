import * as THREE from 'three';
import { House } from './world/house';
import { roomAt, ROOMS, nextDoorToward, type RoomDef } from './world/layout';
import { Nate, BEAM_RANGE, BEAM_HALF_ANGLE } from './entities/nate';
import { Matt, QUIPS, pick } from './entities/matt';
import { Ghost, STATS } from './entities/ghost';
import { GHOST_STYLE, type GhostKind } from './entities/models';
import { Particles } from './fx/particles';
import { Hud } from './ui/hud';
import { Input } from './input';
import { Scares } from './systems/scares';
import { audio } from './audio/audio';
import { music } from './audio/music';

export type GameState = 'title' | 'playing' | 'paused' | 'over';

export interface Quality {
  shadows: boolean;
  shadowSize: number;
  lights: number;
}

const START_TIME = 60;
const COMBO_WINDOW = 4.5;
const RANKS: [number, string][] = [
  [0, 'Scaredy Cat'],
  [5, 'Ghost Rookie'],
  [10, 'Spook Snatcher'],
  [18, 'Phantom Hunter'],
  [28, 'Poltergeist Pro'],
  [40, 'Master Ghost Hunter'],
  [55, 'LEGENDARY Ghost Buster'],
];

const tmpV = new THREE.Vector3();

export class Game {
  state: GameState = 'title';
  house: House;
  nate: Nate;
  matt: Matt;
  ghosts: Ghost[] = [];
  particles: Particles;
  hud = new Hud();
  input: Input;
  scares: Scares;
  scaresEnabled = true;

  time = START_TIME;
  elapsed = 0;
  score = 0;
  caught = 0;
  byKind: Record<GhostKind, number> = { wisp: 0, sheet: 0, sneaky: 0, prankster: 0, king: 0 };
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  private spawnT = 0;
  private shakeAmt = 0;
  private camFocus = new THREE.Vector3(0, 0, 10);
  private titleAngle = 0;
  private lastRoom: RoomDef | undefined;
  private quipT = 12;
  private noGhostT = 0;
  private spotCooldown = 6;
  private arrow: THREE.Mesh;
  private lastTick = -1;
  private whooT = new WeakMap<Ghost, number>();
  private tips = { daze: false, vac: false, caught: false, grabbed: false };
  private kidnapCooldown = 0;
  private mattWaypoint = new THREE.Vector3();
  private mattFound: Ghost | null = null;
  private lastFound: Ghost | null = null;
  private overT = 0;
  private sucking = 0;
  private suckSoundT = 0;
  private kingAnnounced = new WeakSet<Ghost>();

  constructor(
    public scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
    quality: Quality,
  ) {
    this.house = new House(scene, quality.shadows, quality.lights);
    this.nate = new Nate(scene, quality.shadows, quality.shadowSize);
    this.matt = new Matt(scene);
    this.particles = new Particles(scene);
    this.input = new Input(document.getElementById('ui')!, this.hud.vacBtn);
    this.scares = new Scares(this);

    // ghost-finder arrow on the floor
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55);
    shape.lineTo(0.38, 0);
    shape.lineTo(0.14, 0);
    shape.lineTo(0.14, -0.4);
    shape.lineTo(-0.14, -0.4);
    shape.lineTo(-0.14, 0);
    shape.lineTo(-0.38, 0);
    shape.closePath();
    const ag = new THREE.ShapeGeometry(shape);
    ag.rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(
      ag,
      new THREE.MeshBasicMaterial({ color: '#8affc8', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.arrow.renderOrder = 4;
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.nate.onStep = () => {
      const r = roomAt(this.nate.pos.x, this.nate.pos.z);
      if (this.state === 'playing') audio.step(r?.floor === 'carpet');
    };
    this.matt.onStep = () => {
      if (this.state === 'playing') audio.step(true, true);
    };
    this.matt.onPoof = (p) => {
      this.particles.burst(tmpV.set(p.x, 0.7, p.z), '#e0d8ff', 18, 2.5, 0.5, 0.6, 0);
      audio.poof();
      if (this.state === 'playing' && !this.hud.talking && Math.random() < 0.5) this.mattSay(pick(QUIPS.lost), 1.6);
    };

    this.nate.reset(0, 12);
    this.matt.reset(-1, 13.5);
    // a few ghosts floating around the title screen
    for (let i = 0; i < 5; i++) this.spawnRandom(true);

    this.bindButtons();
  }

  // -------------------------------------------------------------------------
  private bindButtons() {
    const $ = (id: string) => document.getElementById(id)!;
    const optScares = $('opt-scares') as HTMLInputElement;
    try {
      const s = localStorage.getItem('ngh_scares');
      if (s !== null) optScares.checked = s === '1';
    } catch {
      /* private mode */
    }
    this.scaresEnabled = optScares.checked;
    optScares.addEventListener('change', () => {
      this.scaresEnabled = optScares.checked;
      try {
        localStorage.setItem('ngh_scares', optScares.checked ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    const start = () => {
      audio.init();
      audio.click();
      this.startRound();
    };
    $('btn-start').addEventListener('click', start);
    $('btn-again').addEventListener('click', start);
    $('btn-resume').addEventListener('click', () => this.setPaused(false));
    $('btn-quit').addEventListener('click', () => this.toTitle());
    $('btn-pause').addEventListener('click', () => this.setPaused(true));
    const mute = $('btn-mute');
    const applyMute = (m: boolean) => {
      audio.setMuted(m);
      mute.textContent = m ? '🔇' : '🔊';
    };
    try {
      applyMute(localStorage.getItem('ngh_muted') === '1');
    } catch {
      /* ignore */
    }
    mute.addEventListener('click', () => {
      applyMute(!audio.muted);
      try {
        localStorage.setItem('ngh_muted', audio.muted ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setPaused(true);
    });
    this.showBest();
  }

  private showBest() {
    const best = this.loadBest();
    document.getElementById('best')!.textContent = best.ghosts > 0 ? `Best: ${best.ghosts} ghosts · ${best.score.toLocaleString()} pts` : '';
  }

  private loadBest(): { ghosts: number; score: number } {
    try {
      return JSON.parse(localStorage.getItem('ngh_best') || '') || { ghosts: 0, score: 0 };
    } catch {
      return { ghosts: 0, score: 0 };
    }
  }

  // -------------------------------------------------------------------------
  startRound() {
    for (const g of this.ghosts) g.dispose(this.scene);
    this.ghosts = [];
    this.time = START_TIME;
    this.elapsed = 0;
    this.score = 0;
    this.caught = 0;
    this.byKind = { wisp: 0, sheet: 0, sneaky: 0, prankster: 0, king: 0 };
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.spawnT = 2;
    this.quipT = 14;
    this.noGhostT = 0;
    this.spotCooldown = 8;
    this.lastRoom = undefined;
    this.lastTick = -1;
    this.kidnapCooldown = 12;
    this.nate.reset(0, 12);
    this.matt.reset(-1, 13.5);
    this.camFocus.set(0, 0, 12);
    this.scares.reset();
    this.input.reset();
    this.input.enabled = true;

    // a tutorial ghost right in the foyer, plus some in other rooms
    const g = this.spawnGhost('sheet', -3, 7.5, false);
    g.stateT = 0;
    for (let i = 0; i < 2; i++) this.spawnRandom(false);

    this.state = 'playing';
    Ghost.fullVis = false;
    this.hud.show('none');
    this.hud.setGhosts(0, 0);
    this.hud.setTime(this.time);
    music.intensity = 1;
    music.start();
    const touch = this.input.touchMode;
    this.hud.showTip(touch ? 'Drag anywhere to walk.<br>Point your flashlight at a ghost!' : 'Use WASD or arrow keys to walk.<br>Point your flashlight at a ghost!', 4.5);
    setTimeout(() => this.state === 'playing' && this.mattSay("Let's catch some ghosts, Nate!", 2.5), 600);
  }

  endRound() {
    if (this.matt.carriedBy) this.releaseMatt(false);
    this.state = 'over';
    this.overT = 0;
    this.input.enabled = false;
    this.nate.vacuuming = false;
    audio.vacuum(false);
    audio.gameOver();
    music.intensity = 0;
    document.body.classList.remove('urgent');
    this.hud.controls.classList.add('hidden');
    this.mattSay('Aww, already?! One more time!', 3);
    for (const g of this.ghosts) if (!g.captured) g.state = 'gloat';
    setTimeout(() => audio.giggle(1, 0, 0.9), 400);

    const best = this.loadBest();
    const isBest = this.caught > best.ghosts || (this.caught === best.ghosts && this.score > best.score);
    if (isBest && this.caught > 0) {
      try {
        localStorage.setItem('ngh_best', JSON.stringify({ ghosts: this.caught, score: this.score }));
      } catch {
        /* ignore */
      }
    }
    const $ = (id: string) => document.getElementById(id)!;
    $('final-ghosts').textContent = String(this.caught);
    let rank = RANKS[0][1];
    for (const [n, r] of RANKS) if (this.caught >= n) rank = r;
    $('final-rank').textContent = rank;
    $('final-score').textContent = `${this.score.toLocaleString()} points`;
    const bd = $('final-breakdown');
    bd.innerHTML = '';
    (Object.keys(this.byKind) as GhostKind[]).forEach((k) => {
      if (!this.byKind[k]) return;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = GHOST_STYLE[k].color;
      chip.textContent = `${STATS[k].name} × ${this.byKind[k]}`;
      bd.appendChild(chip);
    });
    $('final-extra').textContent = `Best combo: x${this.bestCombo} · Hunted for ${Math.round(this.elapsed)} seconds`;
    $('new-best').classList.toggle('hidden', !(isBest && this.caught > 0));
    setTimeout(() => {
      if (this.state !== 'over') return;
      this.hud.show('over');
      if (isBest && this.caught > 0) audio.fanfare();
    }, 1800);
  }

  toTitle() {
    this.state = 'title';
    Ghost.fullVis = true;
    this.input.enabled = false;
    audio.vacuum(false);
    music.intensity = 0;
    document.body.classList.remove('urgent');
    this.hud.show('title');
    this.showBest();
  }

  setPaused(p: boolean) {
    if (p && this.state === 'playing') {
      this.state = 'paused';
      this.input.enabled = false;
      audio.vacuum(false);
      this.hud.show('pause');
    } else if (!p && this.state === 'paused') {
      this.state = 'playing';
      this.input.enabled = true;
      this.input.reset();
      audio.init();
      this.hud.show('none');
    }
  }

  // -------------------------------------------------------------------------
  spawnGhost(kind: GhostKind, x: number, z: number, burst: boolean) {
    const g = new Ghost(kind, this.scene, x, z);
    if (burst) {
      g.state = 'burst';
      g.stateT = 0;
    }
    g.onDazed = (gg) => {
      if (this.state !== 'playing') return;
      audio.daze(this.panFor(gg.pos));
      if (!this.tips.daze) {
        this.tips.daze = true;
        this.hud.showTip(this.input.touchMode ? "It's dizzy! Now HOLD the <b>VACUUM</b> button!" : "It's dizzy! Now HOLD <b>SPACE</b> to vacuum!", 4);
      }
    };
    this.whooT.set(g, 2 + Math.random() * 6);
    this.ghosts.push(g);
    return g;
  }

  private chooseKind(): GhostKind {
    const e = this.elapsed;
    const hasKing = this.ghosts.some((g) => g.kind === 'king' && !g.captured);
    const w: [GhostKind, number][] = [
      ['wisp', 28],
      ['sheet', 40],
      ['sneaky', e > 15 ? 14 : 0],
      ['prankster', e > 25 ? Math.min(24, 10 + e / 10) : 0],
      ['king', e > 40 && !hasKing ? 7 : 0],
    ];
    const total = w.reduce((a, [, n]) => a + n, 0);
    let r = Math.random() * total;
    for (const [k, n] of w) {
      r -= n;
      if (r <= 0) return k;
    }
    return 'sheet';
  }

  private spawnRandom(anywhere: boolean) {
    const nateRoom = roomAt(this.nate.pos.x, this.nate.pos.z);
    const crowd = (r: RoomDef) => this.ghosts.filter((g) => !g.captured && roomAt(g.pos.x, g.pos.z) === r).length;
    let rooms = ROOMS.filter((r) => anywhere || (r !== nateRoom && Math.hypot(r.cx - this.nate.pos.x, r.cz - this.nate.pos.z) > 7 && crowd(r) < 2));
    if (!rooms.length) rooms = ROOMS.filter((r) => r !== nateRoom);
    const room = rooms[Math.floor(Math.random() * rooms.length)] ?? ROOMS[0];
    const kind = anywhere ? (['sheet', 'wisp', 'sheet', 'sneaky', 'king'] as GhostKind[])[this.ghosts.length % 5] : this.chooseKind();
    const p = this.house.randomPointInRoom(room);
    const g = this.spawnGhost(kind, p.x, p.z, false);
    this.particles.burst(tmpV.set(p.x, 0.3, p.z), GHOST_STYLE[kind].color, 14, 1.5, 0.4, 0.8, 1);
    return g;
  }

  mattSay(text: string, dur = 2.6, shout = false) {
    this.hud.say(text, this.matt.headWorld, dur, shout);
  }

  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  vibrate(p: number | number[]) {
    try {
      navigator.vibrate?.(p);
    } catch {
      /* ignore */
    }
  }

  private panFor(p: THREE.Vector3) {
    return Math.max(-1, Math.min(1, (p.x - this.nate.pos.x) / 8));
  }

  // -------------------------------------------------------------------------
  private capture(g: Ghost) {
    g.captured = true;
    g.state = 'captured';
    g.stateT = 0;
    g.beingSucked = false;
    const s = g.stats;
    this.caught++;
    this.byKind[g.kind]++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = COMBO_WINDOW;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    // time bonus shrinks as the round goes on, so the clock always wins eventually
    const bonus = Math.max(1, Math.round(s.time * Math.max(0.34, 1 - this.elapsed / 180)));
    const pts = s.points * this.combo;
    if (this.state === 'playing') {
      this.time += bonus;
      this.score += pts;
      this.hud.timePop(bonus);
      this.hud.setGhosts(this.caught, this.score);
      if (this.combo >= 2) this.hud.showCombo(this.combo);
    }
    const gp = tmpV.set(g.pos.x, g.y, g.pos.z);
    const col = new THREE.Color(GHOST_STYLE[g.kind].color);
    this.particles.burst(gp, col, g.kind === 'king' ? 70 : 32, g.kind === 'king' ? 6 : 4, 0.45, 0.9, -1);
    this.particles.burst(gp, '#ffe060', 14, 3, 0.3, 0.7, -3);
    this.hud.floatText(gp.clone().setY(gp.y + 0.8), `+${pts}`, '#ffe38a', this.camera, g.kind === 'king' ? 36 : 26);
    audio.capture(this.combo, g.kind === 'king');
    this.vibrate(g.kind === 'king' ? [40, 30, 80] : 35);
    this.shake(g.kind === 'king' ? 0.4 : 0.12);

    if (!this.tips.caught) {
      this.tips.caught = true;
      this.hud.showTip('GOTCHA! Every ghost adds a little time ⏱️', 3);
    }
    if (this.combo >= 3 && Math.random() < 0.6) this.mattSay(pick(QUIPS.combo), 2);
    else if (Math.random() < 0.3) this.mattSay(pick(QUIPS.catch), 2);
  }

  private onPrank(g: Ghost) {
    if (this.state !== 'playing') return;
    const steal = 5;
    this.time = Math.max(0.5, this.time - steal);
    this.hud.timePop(-steal);
    audio.prank();
    this.nate.stunT = 0.55;
    this.shake(0.4);
    this.vibrate([30, 30, 30]);
    this.particles.burst(tmpV.set(this.nate.pos.x, 1.2, this.nate.pos.z), '#b0ff6a', 30, 4, 0.4, 0.8, 0);
    this.hud.floatText(tmpV.set(this.nate.pos.x, 2.2, this.nate.pos.z), 'HEE HEE!', '#b0ff6a', this.camera, 30);
    this.mattSay(pick(QUIPS.prank), 2.2);
    void g;
  }

  // -------------------------------------------------------------------------
  // Matt hunts the nearest ghost he can see... and sometimes gets grabbed.
  private updateMatt(dt: number, t: number, playing: boolean) {
    const m = this.matt;
    if (m.carriedBy) {
      const k = m.carriedBy;
      if (k.state !== 'kidnap' || !k.alive || k.captured) this.releaseMatt(true);
      else if (k.stateT > 6.5) this.releaseMatt(false);
    }
    let lookAt: Ghost | null = null;
    let prey: Ghost | null = null;
    let nearest = Infinity;
    let preyD = Infinity;
    const canHunt = playing && !m.carriedBy && m.dizzyT <= 0 && m.scaredT <= 0;
    for (const g of this.ghosts) {
      if (!g.catchable) continue;
      const d = g.pos.distanceTo(m.pos);
      if (d < nearest && (g.kind !== 'sneaky' || g.reveal > 0.3 || g.dazed)) {
        nearest = d;
        lookAt = g;
      }
      // Matt can sniff out any ghost, even hidden ones
      if (!canHunt || g.beingSucked || g.state === 'kidnap' || d > 14 || d >= preyD) continue;
      if (g.pos.distanceTo(this.nate.pos) > 16) continue;
      prey = g;
      preyD = d;
    }
    const wasHunting = m.hunting;
    // head for the ghost directly if he can see it, otherwise through the doorway toward its room
    let chase: THREE.Vector3 | null = null;
    let standoff = 0.15;
    let found: Ghost | null = null;
    if (prey) {
      chase = prey.pos;
      if (!this.house.grid.lineOfSight(m.pos.x, m.pos.z, prey.pos.x, prey.pos.z)) {
        const from = roomAt(m.pos.x, m.pos.z);
        const to = roomAt(prey.pos.x, prey.pos.z);
        const door = from && to ? nextDoorToward(from, to) : null;
        if (door) chase = this.mattWaypoint.set(door.x, 0, door.z);
      } else {
        // stand next to the ghost, not inside it
        standoff = 1.8;
        if (preyD < 2.8) found = prey;
      }
    }
    m.update(dt, t, this.nate, this.house.grid, found ?? (playing ? this.pointerTarget() ?? lookAt : lookAt), chase, standoff);
    if (playing && m.hunting && !wasHunting && !this.hud.talking && Math.random() < 0.35) this.mattSay(pick(QUIPS.hunt), 1.8);
    this.kidnapCooldown -= dt;

    // Matt found a ghost: keep it a bit visible, hop and shout for Nate
    this.mattFound = playing ? found : null;
    if (found) {
      found.reveal = Math.max(found.reveal, 0.6);
      if (m.jumpT <= 0 && Math.sin(t * 4) > 0.97) m.jumpT = 0.5;
      if (found !== this.lastFound && found.pos.distanceTo(this.nate.pos) > 4 && !this.hud.talking) this.mattSay(pick(QUIPS.found), 2.2, true);
    }
    this.lastFound = found ?? this.lastFound;
    if (!playing || m.carriedBy || m.dizzyT > 0) return;

    for (const g of this.ghosts) {
      if (!g.catchable || g.beingSucked || g.state === 'kidnap') continue;
      const dx = m.pos.x - g.pos.x,
        dz = m.pos.z - g.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 3.5) continue;
      // pranksters and King Boo swoop in and grab him! Sheet ghosts too, if his BOO isn't ready
      const grabber = g.kind === 'prankster' || g.kind === 'king' || (g.kind === 'sheet' && m.booCooldown > 0 && this.elapsed > 40);
      if (grabber && !g.dazed && this.kidnapCooldown <= 0 && this.elapsed > 12) {
        if (d < 1.0) {
          this.kidnap(g);
          return;
        }
        g.pos.x += (dx / d) * 3.2 * dt;
        g.pos.z += (dz / d) * 3.2 * dt;
        continue;
      }
      // little BOO! makes regular ghosts dizzy so Nate can vacuum them
      if (d < 2.4 && !grabber && !g.dazed && m.booCooldown <= 0 && g.kind !== 'king') {
        m.booCooldown = 6;
        m.jumpT = 0.5;
        audio.boo();
        this.particles.ring(m.pos, '#ffb03a', 2.6, 0.5);
        this.particles.burst(tmpV.set(g.pos.x, g.y, g.pos.z), '#ffc050', 16, 3, 0.35, 0.6, 0);
        g.daze(g.stats.dazeTime + 1.5);
        g.reveal = 1;
        if (Math.random() < 0.6) this.mattSay(pick(QUIPS.boo), 1.4, true);
        return;
      }
    }
  }

  private kidnap(g: Ghost) {
    const m = this.matt;
    g.state = 'kidnap';
    g.stateT = 0;
    m.carriedBy = g;
    m.netT = 0;
    this.kidnapCooldown = 18;
    audio.scream();
    audio.giggle(1, this.panFor(g.pos), g.kind === 'king' ? 0.7 : 1);
    this.vibrate([50, 30, 50]);
    this.mattSay(pick(QUIPS.grabbed), 3, true);
    if (!this.tips.grabbed) {
      this.tips.grabbed = true;
      this.hud.showTip('A ghost grabbed Matt! Shine your flashlight on it to rescue him!', 4);
    }
  }

  private releaseMatt(rescued: boolean) {
    const m = this.matt;
    const k = m.carriedBy;
    m.carriedBy = null;
    const spot = this.house.grid.freeSpot(m.pos.x, m.pos.z, 0.3);
    m.pos.set(spot.x, 0, spot.z);
    m.dizzyT = rescued ? 0.8 : 1.8;
    this.particles.burst(tmpV.set(m.pos.x, 0.6, m.pos.z), '#e0d8ff', 20, 2.5, 0.45, 0.6, 0);
    audio.poof();
    if (this.state !== 'playing') return;
    if (rescued) {
      this.time += 2;
      this.score += 250;
      this.hud.timePop(2);
      this.hud.setGhosts(this.caught, this.score);
      this.hud.floatText(tmpV.set(m.pos.x, 2, m.pos.z), 'RESCUED!', '#8affc8', this.camera, 30);
      this.mattSay(pick(QUIPS.rescued), 2.4);
      audio.bonus();
    } else {
      this.time = Math.max(0.5, this.time - 3);
      this.hud.timePop(-3);
      this.mattSay(pick(QUIPS.dropped), 2.4);
      if (k && k.state === 'kidnap') {
        k.state = 'gloat';
        k.stateT = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  update(dt: number, t: number, viewportH: number) {
    const playing = this.state === 'playing';
    const paused = this.state === 'paused';
    if (this.input.consumePause()) {
      if (playing) this.setPaused(true);
      else if (paused) this.setPaused(false);
    }
    if (paused) {
      this.hud.update(dt, this.camera);
      return;
    }
    this.input.update();
    const input = playing ? this.input : null;

    // aim assist: nearest catchable ghost roughly in front
    let aim: THREE.Vector3 | null = null;
    if (playing) {
      let best = Infinity;
      const mx = this.input.moveX,
        mz = this.input.moveZ;
      const moving = Math.hypot(mx, mz) > 0.2;
      const fx = moving ? mx : this.nate.dir.x,
        fz = moving ? mz : this.nate.dir.z;
      const fl = Math.hypot(fx, fz) || 1;
      for (const g of this.ghosts) {
        if (!g.catchable || !g.model.root.visible || g.model.mat.uniforms.uOpacity.value < 0.25) continue;
        const dx = g.pos.x - this.nate.pos.x,
          dz = g.pos.z - this.nate.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 8 || d < 0.3) continue;
        const cos = (dx * fx + dz * fz) / (d * fl);
        if (cos < 0.72) continue;
        const score = d * (2 - cos) * (g.dazed ? 0.6 : 1);
        if (score < best && this.house.grid.lineOfSight(this.nate.pos.x, this.nate.pos.z, g.pos.x, g.pos.z)) {
          best = score;
          aim = g.pos;
        }
      }
    }

    this.nate.vacuuming = playing && this.input.vacuum;
    this.nate.update(dt, t, input, this.house.grid, aim);
    if (playing && this.nate.vacuuming && !this.tips.vac) this.tips.vac = true;

    // beam test
    for (const g of this.ghosts) {
      g.inBeam =
        playing &&
        g.catchable &&
        this.nate.flashlightPower > 0.5 &&
        this.nate.inCone(g.pos.x, g.pos.z) &&
        this.house.grid.lineOfSight(this.nate.pos.x, this.nate.pos.z, g.pos.x, g.pos.z);
    }

    // ghosts
    const diff = Math.min(1.5, this.elapsed / 120);
    let maxSuck = 0;
    const onPrank = (g: Ghost) => this.onPrank(g);
    // the vacuum pulls ONE dizzy ghost at a time: the one closest to being caught, else the nearest
    let vacTarget: Ghost | null = null;
    if (this.nate.vacuuming) {
      let best = -Infinity;
      for (const g of this.ghosts) {
        if (!g.catchable || !g.dazed) continue;
        if (!this.nate.inCone(g.pos.x, g.pos.z, BEAM_RANGE, BEAM_HALF_ANGLE * 1.35)) continue;
        if (!this.house.grid.lineOfSight(this.nate.pos.x, this.nate.pos.z, g.pos.x, g.pos.z)) continue;
        const score = g.suck * 100 - g.pos.distanceTo(this.nate.pos);
        if (score > best) {
          best = score;
          vacTarget = g;
        }
      }
    }
    for (const g of this.ghosts) {
      if (g.captured) {
        g.stateT += dt;
        const to = this.nate.nozzleWorld;
        g.pos.lerp(tmpV.set(to.x, 0, to.z), Math.min(1, dt * 14));
        g.y += (to.y - g.y) * Math.min(1, dt * 14);
        const k = Math.max(0.01, 1 - g.stateT * 3.5);
        g.model.root.scale.setScalar(GHOST_STYLE[g.kind].scale * k);
        g.model.root.rotation.y += dt * 20;
        g.syncModel(t, this.nate.pos);
        if (g.stateT > 0.3) g.alive = false;
        continue;
      }
      g.update(dt, t, this.nate.pos, diff, onPrank);
      g.beingSucked = g === vacTarget && g.dazed;
      if (g.beingSucked) {
        maxSuck = Math.max(maxSuck, g.suck);
        if (g.pull(dt, t, this.nate.nozzleWorld)) this.capture(g);
        // ectoplasm streaming into the nozzle
        if (Math.random() < 0.6) {
          const from = tmpV.set(g.pos.x + (Math.random() - 0.5) * 0.6, g.y + (Math.random() - 0.5) * 0.6, g.pos.z + (Math.random() - 0.5) * 0.6);
          this.particles.stream(from, this.nate.nozzleWorld, new THREE.Color(GHOST_STYLE[g.kind].color), 0.25, 0.25);
        }
      }
      // spooky noises from nearby ghosts
      let wt = (this.whooT.get(g) ?? 5) - dt;
      if (wt <= 0) {
        wt = 5 + Math.random() * 8;
        const d = g.pos.distanceTo(this.nate.pos);
        if (d < 12 && this.state !== 'title') {
          const v = 1 - d / 12;
          if (g.kind === 'prankster' || (g.kind === 'wisp' && Math.random() < 0.5)) audio.giggle(v * 0.8, this.panFor(g.pos), g.kind === 'wisp' ? 1.4 : 1);
          else audio.whoo(v, this.panFor(g.pos), g.kind === 'king' ? 0.6 : g.kind === 'wisp' ? 1.5 : 1);
        }
      }
      this.whooT.set(g, wt);
      if (g.kind === 'king' && playing && !this.kingAnnounced.has(g) && g.pos.distanceTo(this.nate.pos) < 8) {
        this.kingAnnounced.add(g);
        this.mattSay(pick(QUIPS.king), 2.4);
      }
    }
    // remove dead
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (!this.ghosts[i].alive) {
        this.ghosts[i].dispose(this.scene);
        this.ghosts.splice(i, 1);
      }
    }

    // vacuum sound & particles
    if (playing) {
      audio.vacuum(this.nate.vacuuming, maxSuck);
      if (this.nate.vacuuming) {
        // air swirling into the nozzle
        for (let i = 0; i < 2; i++) {
          const r = 1.5 + Math.random() * 5;
          const a = (Math.random() - 0.5) * 0.7;
          const c = Math.cos(a),
            s = Math.sin(a);
          const dx = this.nate.dir.x * c - this.nate.dir.z * s;
          const dz = this.nate.dir.x * s + this.nate.dir.z * c;
          const from = tmpV.set(this.nate.pos.x + dx * r, 0.3 + Math.random() * 1.4, this.nate.pos.z + dz * r);
          this.particles.stream(from, this.nate.nozzleWorld, new THREE.Color('#a8f8ff'), 0.12, 0.35);
        }
        if (maxSuck > 0) {
          this.suckSoundT -= dt;
          if (this.suckSoundT <= 0) {
            audio.suck();
            this.suckSoundT = 0.35;
          }
        }
      }
      this.sucking = maxSuck;
    }

    this.updateMatt(dt, t, playing);

    if (playing) this.updateRound(dt);
    if (this.state === 'over') {
      this.overT += dt;
    }

    this.scares.update(dt, t);
    this.updateArrow(dt, t);
    this.updateCamera(dt);

    // walls lower around the player; on title, everything is a dollhouse
    const wallZ = this.state === 'title' ? -1000 : this.nate.pos.z;
    this.house.update(t, dt, this.nate.pos.x, wallZ, this.camera, viewportH);
    this.particles.update(dt, this.camera, viewportH);
    this.hud.update(dt, this.camera);
  }

  private updateRound(dt: number) {
    this.elapsed += dt;
    this.time -= dt;
    this.hud.setTime(this.time);
    const urgent = this.time <= 10;
    music.intensity = urgent ? 2 : 1;
    const sec = Math.ceil(this.time);
    if (urgent && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      audio.tick(sec <= 5);
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // spawning
    const alive = this.ghosts.filter((g) => !g.captured).length;
    const maxG = Math.min(6, 3 + Math.floor(this.elapsed / 30));
    this.spawnT -= dt;
    if (this.spawnT <= 0 && alive < maxG) {
      this.spawnRandom(false);
      this.spawnT = Math.max(1.8, 3.5 - this.elapsed / 80);
    }

    // entering a new room
    const room = roomAt(this.nate.pos.x, this.nate.pos.z);
    if (room && room !== this.lastRoom) {
      if (this.lastRoom) this.hud.showRoom(room.name);
      this.lastRoom = room;
    }

    // Matt chatter
    this.quipT -= dt;
    if (this.quipT <= 0 && !this.hud.talking) {
      this.quipT = 14 + Math.random() * 12;
      this.mattSay(this.time < 12 ? pick(QUIPS.hurry) : pick(QUIPS.idle), 3);
    }

    if (this.time <= 0) {
      this.time = 0;
      this.hud.setTime(0);
      this.endRound();
    }
  }

  /** The ghost Matt is pointing Nate toward: whoever grabbed Matt, else the closest ghost. */
  private pointerTarget(): Ghost | null {
    if (this.matt.carriedBy) return this.matt.carriedBy;
    if (this.mattFound && this.mattFound.catchable) return this.mattFound;
    let best: Ghost | null = null;
    let bd = Infinity;
    for (const g of this.ghosts) {
      if (!g.catchable) continue;
      const d = g.pos.distanceTo(this.nate.pos);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  private updateArrow(dt: number, t: number) {
    const playing = this.state === 'playing';
    const target = this.pointerTarget();
    const nd = target ? target.pos.distanceTo(this.nate.pos) : Infinity;
    if (nd > 7) this.noGhostT += dt;
    else this.noGhostT = 0;
    this.spotCooldown -= dt;
    if (playing && this.noGhostT > 4 && this.spotCooldown <= 0 && target && !this.hud.talking) {
      this.spotCooldown = 14;
      this.mattSay(pick(QUIPS.spot), 2.2);
    }
    // always point at the closest ghost, unless it's right in front of you
    // Matt points the way only when nothing is close by (or when he's been grabbed)
    const show = playing && !!target && (nd > 7 || target === this.matt.carriedBy || (target === this.mattFound && nd > 4));
    this.arrow.visible = show;
    if (show && target) {
      const a = Math.atan2(target.pos.x - this.nate.pos.x, target.pos.z - this.nate.pos.z);
      const r = 1.3 + Math.sin(t * 6) * 0.12;
      this.arrow.position.set(this.nate.pos.x + Math.sin(a) * r, 0.06, this.nate.pos.z + Math.cos(a) * r);
      // shape points along local -z after rotateX; rotate to face the ghost
      this.arrow.rotation.y = a + Math.PI;
      const mat = this.arrow.material as THREE.MeshBasicMaterial;
      mat.color.set(target === this.matt.carriedBy ? '#ff7a6a' : '#8affc8');
      mat.opacity = 0.55 + Math.sin(t * 6) * 0.25;
      const sc = nd > 10 ? 1.25 : 1;
      this.arrow.scale.setScalar(sc);
    }
  }

  private updateCamera(dt: number) {
    const cam = this.camera;
    if (this.state === 'title') {
      this.titleAngle += dt * 0.07;
      const r = 17;
      const cx = 0,
        cz = 2;
      cam.position.set(cx + Math.sin(this.titleAngle) * r, 16, cz + Math.cos(this.titleAngle) * r);
      cam.lookAt(cx, 0, cz);
      return;
    }
    const aspect = cam.aspect;
    // keep a similar amount of house visible in portrait and landscape
    const dist = THREE.MathUtils.clamp(Math.max(13, 15 / aspect), 13, 26);
    const pitch = 0.98;
    const lead = this.nate.vacuuming ? 1.2 : 0.35;
    // look ahead where Nate is walking, and frame him above center so your thumb
    // (on the lower half of a phone) doesn't cover what's in front of him
    const portrait = aspect < 1;
    const below = portrait ? 2.4 : 1.2;
    const fx = this.nate.pos.x + this.nate.vel.x * 0.5 + this.nate.dir.x * lead;
    const fz = this.nate.pos.z + this.nate.vel.z * 0.5 + this.nate.dir.z * lead + below;
    const k = 1 - Math.exp(-dt * 5);
    this.camFocus.x += (fx - this.camFocus.x) * k;
    this.camFocus.z += (fz - this.camFocus.z) * k;
    const over = this.state === 'over' ? Math.min(1, this.overT * 0.5) : 0;
    const d = dist * (1 - over * 0.35);
    cam.position.set(this.camFocus.x, Math.sin(pitch) * d, this.camFocus.z + Math.cos(pitch) * d);
    cam.lookAt(this.camFocus.x, 0.6, this.camFocus.z);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s * 0.5;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    }
  }
}
