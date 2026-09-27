import * as THREE from 'three';
import type { Game } from '../game';
import { audio } from '../audio/audio';
import { glowTex } from '../world/textures';
import { QUIPS, pick } from '../entities/matt';
import type { Haunted } from '../world/props';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Paces spooky moments: furniture that bursts open, blackouts full of glowing
 * eyes, lightning, and creepy ambient noises. Mild and cartoony, never gory.
 */
export class Scares {
  private cooldown = 20;
  private lightningT = rand(10, 18);
  private ambientT = rand(4, 8);
  private blackoutT = rand(50, 70);
  private active: { kind: 'closet' | 'blackout'; t: number; h?: Haunted; basePos?: THREE.Vector3 } | null = null;
  private eyes: THREE.Sprite[] = [];
  private eyeGroup = new THREE.Group();

  constructor(private game: Game) {
    const tex = glowTex();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 4 < 2 ? '#ffe040' : '#ff5040', depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
      s.scale.set(0.35, 0.28, 1);
      this.eyeGroup.add(s);
      this.eyes.push(s);
    }
    this.eyeGroup.visible = false;
    game.scene.add(this.eyeGroup);
  }

  reset() {
    this.cooldown = 20;
    this.lightningT = rand(8, 14);
    this.blackoutT = rand(50, 70);
    this.active = null;
    this.eyeGroup.visible = false;
    this.game.house.dim = 1;
    this.game.nate.flashlightPower = 1;
    for (const h of this.game.house.haunted) h.cooldown = 0;
  }

  update(dt: number, t: number) {
    const g = this.game;
    const enabled = g.scaresEnabled;
    this.cooldown -= dt;
    for (const h of g.house.haunted) h.cooldown -= dt;

    // lightning + thunder
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = rand(16, 32);
      g.house.flash();
      g.hud.flash(0.3);
      audio.thunder(rand(0.3, 1.2));
    }

    // ambient creaks / whispers / distant moans
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = rand(5, 11);
      const pan = rand(-0.9, 0.9);
      const r = Math.random();
      if (r < 0.35) audio.creak(pan);
      else if (r < 0.6) audio.whisper(pan);
      else if (r < 0.85) audio.whoo(0.5, pan, rand(0.7, 1.1));
      else audio.giggle(0.4, pan, rand(0.8, 1.2));
    }

    if (this.active) {
      this.runActive(dt, t);
      return;
    }
    if (g.state !== 'playing' || this.cooldown > 0) return;

    // furniture burst: triggered when Nate walks close to a haunted object
    for (const h of g.house.haunted) {
      if (h.cooldown > 0) continue;
      const d = Math.hypot(g.nate.pos.x - h.pos.x, g.nate.pos.z - h.pos.z);
      if (d < 2.6) {
        this.active = { kind: 'closet', t: 0, h, basePos: h.obj.position.clone() };
        h.cooldown = 80;
        audio.rattle();
        return;
      }
    }

    // blackout with eyes in the dark
    this.blackoutT -= dt;
    if (enabled && this.blackoutT <= 0 && g.elapsed > 40) {
      this.blackoutT = rand(55, 80);
      this.active = { kind: 'blackout', t: 0 };
      audio.thunder(0);
      g.house.flash();
      g.hud.flash(0.8);
      g.shake(0.3);
    }
  }

  private runActive(dt: number, t: number) {
    const g = this.game;
    const a = this.active!;
    a.t += dt;
    if (a.kind === 'closet') {
      const h = a.h!;
      if (a.t < 0.55) {
        // rattle
        h.obj.position.x = a.basePos!.x + Math.sin(t * 70) * 0.04;
        h.obj.position.z = a.basePos!.z + Math.cos(t * 55) * 0.03;
        h.obj.rotation.z = Math.sin(t * 60) * 0.02;
        return;
      }
      h.obj.position.copy(a.basePos!);
      h.obj.rotation.z = 0;
      // BURST!
      const fwd = new THREE.Vector3(Math.sin(h.obj.rotation.y), 0, Math.cos(h.obj.rotation.y));
      const p = h.pos.clone().addScaledVector(fwd, 0.7);
      const kind = g.elapsed > 30 && Math.random() < 0.4 ? 'prankster' : 'sheet';
      const ghost = g.spawnGhost(kind, p.x, p.z, true);
      ghost.y = 1.4;
      g.particles.burst(new THREE.Vector3(p.x, 1.3, p.z), '#c0ffe8', 40, 5, 0.5, 0.9, 0);
      if (g.scaresEnabled) {
        g.hud.jumpScare();
        audio.stinger();
        g.shake(0.7);
        g.vibrate([70, 40, 90]);
        g.matt.scaredT = 1.4;
        audio.scream();
        g.mattSay(pick(QUIPS.scared), 2.4, true);
      } else {
        audio.whoo(1, 0, 1.2);
        g.shake(0.25);
      }
      this.cooldown = rand(30, 45);
      this.active = null;
      return;
    }

    if (a.kind === 'blackout') {
      const T = a.t;
      const dur = 3.2;
      g.house.dim = T < 0.25 ? 1 - T / 0.25 : T > dur - 0.6 ? Math.min(1, (T - (dur - 0.6)) / 0.6) : 0.03;
      // flashlight sputters
      g.nate.flashlightPower = T < dur - 0.6 ? (Math.sin(T * 37) > 0.2 || Math.random() < 0.3 ? 0.08 : 0.9) : 1;
      if (T > 0.5 && !this.eyeGroup.visible) {
        this.eyeGroup.visible = true;
        const n = this.eyes.length / 2;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
          const r = rand(2.8, 5);
          const x = g.nate.pos.x + Math.cos(ang) * r,
            z = g.nate.pos.z + Math.sin(ang) * r,
            y = rand(0.9, 2.2);
          // face roughly toward camera: offset pair along camera right (x axis)
          this.eyes[i * 2].position.set(x - 0.14, y, z);
          this.eyes[i * 2 + 1].position.set(x + 0.14, y, z);
        }
        audio.giggle(0.8, -0.5, 0.9);
        setTimeout(() => audio.giggle(0.7, 0.6, 1.2), 500);
        g.matt.scaredT = 2.5;
        g.mattSay("Nate... I don't like this...", 2.4);
      }
      if (this.eyeGroup.visible) {
        // blink
        this.eyes.forEach((e, i) => {
          const blink = Math.sin(T * 3 + Math.floor(i / 2) * 1.7) > 0.93 ? 0.05 : 0.28;
          e.scale.set(0.35, blink, 1);
        });
      }
      if (T > dur - 0.5 && this.eyeGroup.visible) {
        this.eyeGroup.visible = false;
        // the eyes were wisps all along!
        for (let i = 0; i < 2; i++) {
          const e = this.eyes[Math.floor(Math.random() * this.eyes.length)];
          g.spawnGhost('wisp', e.position.x, e.position.z, false);
        }
      }
      if (T >= dur) {
        g.house.dim = 1;
        g.nate.flashlightPower = 1;
        this.active = null;
        this.cooldown = rand(25, 35);
      }
    }
  }
}
