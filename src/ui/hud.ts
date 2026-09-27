import * as THREE from 'three';
import './ui.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const proj = new THREE.Vector3();

export class Hud {
  hud = $('hud');
  timer = $('timer');
  ghosts = $('ghosts');
  ghostPill = $('ghost-count');
  score = $('score');
  combo = $('combo');
  roomName = $('room-name');
  timePops = $('time-pops');
  controls = $('controls');
  keyHint = $('key-hint');
  tip = $('tip');
  bubble = $('bubble');
  floaters = $('floaters');
  vacBtn = $('btn-vac');
  flashEl = $('flash');
  jump = $('jumpscare');
  fps = $('fps');
  screens = { title: $('title'), pause: $('pause'), over: $('over'), loading: $('loading') };

  private bubbleT = 0;
  private bubbleAnchor: THREE.Vector3 | null = null;
  private lastTimeShown = -1;
  private roomT = 0;
  private tipT = 0;
  private flashV = 0;

  constructor() {
    this.drawBooFace();
  }

  show(which: 'title' | 'pause' | 'over' | 'none') {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== which);
    const playing = which === 'none' || which === 'pause';
    this.hud.classList.toggle('hidden', !playing);
    this.controls.classList.toggle('hidden', which !== 'none');
    this.keyHint.classList.toggle('hidden', which !== 'none');
  }

  setTime(t: number) {
    const s = Math.max(0, Math.ceil(t));
    if (s !== this.lastTimeShown) {
      this.lastTimeShown = s;
      const m = Math.floor(s / 60);
      this.timer.textContent = m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : String(s);
    }
    document.body.classList.toggle('urgent', t > 0 && t <= 10);
  }

  timePop(delta: number) {
    const el = document.createElement('div');
    el.className = 'time-pop' + (delta < 0 ? ' neg' : '');
    el.textContent = `${delta > 0 ? '+' : ''}${delta}s`;
    this.timePops.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    this.restartAnim(this.timer, delta > 0 ? 'plus' : 'minus');
  }

  setGhosts(n: number, score: number) {
    this.ghosts.textContent = String(n);
    this.score.textContent = score.toLocaleString();
    this.restartAnim(this.ghostPill, 'bump');
  }

  showCombo(n: number) {
    this.combo.textContent = n >= 5 ? `SUPER COMBO x${n}!` : `COMBO x${n}!`;
    this.restartAnim(this.combo, 'show');
  }

  showRoom(name: string) {
    this.roomName.textContent = name;
    this.roomName.classList.add('show');
    this.roomT = 2.2;
  }

  showTip(text: string, dur = 3.5) {
    this.tip.innerHTML = text;
    this.tip.classList.add('show');
    this.tipT = dur;
  }


  say(text: string, anchor: THREE.Vector3, dur = 2.6, shout = false) {
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    this.bubble.classList.toggle('shout', shout);
    this.bubbleT = dur;
    this.bubbleAnchor = anchor;
  }
  get talking() {
    return this.bubbleT > 0;
  }

  floatText(world: THREE.Vector3, text: string, color: string, camera: THREE.Camera, size = 26) {
    proj.copy(world).project(camera);
    if (proj.z > 1) return;
    const x = (proj.x * 0.5 + 0.5) * innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * innerHeight;
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  flash(v = 1) {
    this.flashV = Math.max(this.flashV, v);
  }

  jumpScare() {
    this.jump.classList.remove('show');
    void this.jump.offsetWidth;
    this.jump.classList.add('show');
    setTimeout(() => this.jump.classList.remove('show'), 900);
  }

  update(dt: number, camera: THREE.Camera) {
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble.classList.remove('show');
      if (this.bubbleAnchor) {
        proj.copy(this.bubbleAnchor).project(camera);
        const x = (proj.x * 0.5 + 0.5) * innerWidth;
        const y = (-proj.y * 0.5 + 0.5) * innerHeight;
        const w = this.bubble.offsetWidth;
        const cx = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, x));
        this.bubble.style.transform = `translate(${cx - w / 2}px, ${Math.max(70, y - 30) - this.bubble.offsetHeight}px)`;
      }
    }
    if (this.roomT > 0) {
      this.roomT -= dt;
      if (this.roomT <= 0) this.roomName.classList.remove('show');
    }
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) this.tip.classList.remove('show');
    }
    this.flashV = Math.max(0, this.flashV - dt * 3);
    this.flashEl.style.opacity = String(Math.min(0.9, this.flashV));
  }

  private restartAnim(el: HTMLElement, cls: string) {
    el.classList.remove('plus', 'minus', cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  private drawBooFace() {
    const c = $('boo-face') as unknown as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(256, 230, 40, 256, 256, 250);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#d8fff0');
    g.addColorStop(1, 'rgba(160,255,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(40, 470);
    ctx.bezierCurveTo(30, 150, 120, 30, 256, 30);
    ctx.bezierCurveTo(392, 30, 482, 150, 472, 470);
    for (let i = 0; i < 6; i++) {
      const x0 = 472 - i * 72;
      ctx.quadraticCurveTo(x0 - 18, 420, x0 - 36, 470);
      ctx.quadraticCurveTo(x0 - 54, 510, x0 - 72, 470);
    }
    ctx.fill();
    ctx.fillStyle = '#140820';
    // angry-silly eyes
    ctx.beginPath();
    ctx.ellipse(180, 200, 42, 62, -0.2, 0, Math.PI * 2);
    ctx.ellipse(332, 200, 42, 62, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(192, 180, 12, 0, Math.PI * 2);
    ctx.arc(344, 180, 12, 0, Math.PI * 2);
    ctx.fill();
    // big open mouth
    ctx.fillStyle = '#140820';
    ctx.beginPath();
    ctx.ellipse(256, 340, 74, 88, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5a8a';
    ctx.beginPath();
    ctx.ellipse(256, 392, 42, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
