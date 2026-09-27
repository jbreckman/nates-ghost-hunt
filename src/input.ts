// Unified input: floating touch joystick + buttons, keyboard, and gamepad.

export class Input {
  moveX = 0;
  moveZ = 0;
  vacuum = false;
  private pauseQueued = false;
  touchMode = false;
  enabled = false;

  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private vacPointers = new Set<number>();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private radius = 56;
  private padVacuum = false;
  private padStartPrev = false;

  constructor(private layer: HTMLElement, vacBtn: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    layer.appendChild(this.base);

    layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setTouchMode(true);
      if (this.joyId !== null || !this.enabled) return;
      if ((e.target as HTMLElement).closest('button, .btn, .no-joy')) return;
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this.showJoy(true);
      this.updateJoyVisual();
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius) {
        // drag the base along so direction changes stay snappy
        const k = (d - this.radius) / d;
        this.joyOrigin.x += dx * k;
        this.joyOrigin.y += dy * k;
        dx = e.clientX - this.joyOrigin.x;
        dy = e.clientY - this.joyOrigin.y;
      }
      this.joyVec = { x: dx / this.radius, y: dy / this.radius };
      this.updateJoyVisual();
      e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.showJoy(false);
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    const vacDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'touch') this.setTouchMode(true);
      this.vacPointers.add(e.pointerId);
      vacBtn.classList.add('down');
      try {
        vacBtn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const vacUp = (e: PointerEvent) => {
      this.vacPointers.delete(e.pointerId);
      if (!this.vacPointers.size) vacBtn.classList.remove('down');
    };
    vacBtn.addEventListener('pointerdown', vacDown);
    vacBtn.addEventListener('pointerup', vacUp);
    vacBtn.addEventListener('pointercancel', vacUp);
    vacBtn.addEventListener('lostpointercapture', vacUp);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQueued = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.vacPointers.clear();
      vacBtn.classList.remove('down');
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.showJoy(false);
    });

    this.setTouchMode(matchMedia('(pointer: coarse)').matches);
  }

  private setTouchMode(on: boolean) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  private showJoy(on: boolean) {
    this.base.style.opacity = on ? '1' : '0';
  }

  private updateJoyVisual() {
    this.base.style.transform = `translate(${this.joyOrigin.x}px, ${this.joyOrigin.y}px)`;
    this.knob.style.transform = `translate(${this.joyVec.x * this.radius}px, ${this.joyVec.y * this.radius}px)`;
  }

  update() {
    let x = 0,
      z = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (x || z) {
      const d = Math.hypot(x, z);
      x /= d;
      z /= d;
    }
    if (this.joyId !== null) {
      const d = Math.hypot(this.joyVec.x, this.joyVec.y);
      if (d > 0.15) {
        const m = Math.min(1, (d - 0.15) / 0.6); // quick ramp to full speed
        x = (this.joyVec.x / d) * m;
        z = (this.joyVec.y / d) * m;
      }
    }

    // gamepad
    this.padVacuum = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0,
        az = p.axes[1] ?? 0;
      if (Math.hypot(ax, az) > 0.2) {
        x = ax;
        z = az;
      }
      const btn = (i: number) => !!p.buttons[i]?.pressed;
      this.padVacuum = btn(0) || btn(7) || btn(5);
      const st = btn(9);
      if (st && !this.padStartPrev) this.pauseQueued = true;
      this.padStartPrev = st;
      break;
    }

    this.moveX = x;
    this.moveZ = z;
    this.vacuum = this.vacPointers.size > 0 || k.has('Space') || k.has('KeyJ') || k.has('Enter') || this.padVacuum;
  }

  consumePause() {
    const p = this.pauseQueued;
    this.pauseQueued = false;
    return p;
  }
  reset() {
    this.pauseQueued = false;
  }
}
