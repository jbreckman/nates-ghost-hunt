// WebAudio engine: every sound in the game is synthesized here. No audio files.

type Bus = 'sfx' | 'music';

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  glide?: 'exp' | 'lin';
  dur: number;
  vol?: number;
  attack?: number;
  release?: number;
  bus?: Bus;
  reverb?: number;
  detune?: number;
  filter?: number;
  filterEnd?: number;
  filterType?: BiquadFilterType;
  q?: number;
  pan?: number;
  vibrato?: number;
  vibratoRate?: number;
  when?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  attack?: number;
  filterType?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  bus?: Bus;
  reverb?: number;
  pan?: number;
  when?: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  verbIn!: GainNode;
  noiseBuf!: AudioBuffer;
  muted = false;
  private vac: { src: AudioBufferSourceNode; motor: OscillatorNode; gain: GainNode; filt: BiquadFilterNode; motorGain: GainNode } | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.music.connect(this.master);

    // reverb
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.9;
    this.verbIn.connect(conv);
    conv.connect(this.master);

    const nlen = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    // iOS unlock: play a silent buffer inside the gesture
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    ctx.resume();

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private out(bus: Bus, pan: number, reverb: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let node: AudioNode = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    node.connect(bus === 'music' ? this.music : this.sfx);
    if (reverb > 0) {
      const rg = ctx.createGain();
      rg.gain.value = reverb;
      node.connect(rg);
      rg.connect(this.verbIn);
    }
    return g;
  }

  tone(o: ToneOpts) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = o.when ?? ctx.currentTime;
    const vol = o.vol ?? 0.3;
    const attack = o.attack ?? 0.005;
    const out = this.out(o.bus ?? 'sfx', o.pan ?? 0, o.reverb ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd !== undefined) {
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.freqEnd, t + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + o.dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibratoRate ?? 6;
      lg.gain.value = o.vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.1);
    }
    let src: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filterType ?? 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      if (o.filterEnd) f.frequency.exponentialRampToValueAtTime(o.filterEnd, t + o.dur);
      f.Q.value = o.q ?? 1;
      osc.connect(f);
      src = f;
    }
    src.connect(out);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + attack);
    out.gain.exponentialRampToValueAtTime(0.0001, t + o.dur + (o.release ?? 0));
    osc.start(t);
    osc.stop(t + o.dur + (o.release ?? 0) + 0.05);
  }

  noise(o: NoiseOpts) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = o.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filterType ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    f.Q.value = o.q ?? 1;
    const out = this.out(o.bus ?? 'sfx', o.pan ?? 0, o.reverb ?? 0);
    src.connect(f);
    f.connect(out);
    const vol = o.vol ?? 0.3;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.005));
    out.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  // -------------------------------------------------------------------------
  // Sound effects
  // -------------------------------------------------------------------------
  step(soft: boolean, small = false) {
    this.noise({ dur: 0.07, vol: small ? 0.05 : 0.08, freq: soft ? 400 : small ? 1500 : 900, q: 1.2 });
    if (!soft) this.tone({ freq: small ? 180 : 120, freqEnd: 60, dur: 0.06, vol: 0.05, type: 'sine' });
  }

  vacuum(on: boolean, pull = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.vac) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 500;
      filt.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filt);
      filt.connect(gain);
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 70;
      const mf = ctx.createBiquadFilter();
      mf.type = 'lowpass';
      mf.frequency.value = 400;
      const motorGain = ctx.createGain();
      motorGain.gain.value = 0.08;
      motor.connect(mf);
      mf.connect(motorGain);
      motorGain.connect(gain);
      gain.connect(this.sfx);
      src.start();
      motor.start();
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
      motor.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.3);
      this.vac = { src, motor, gain, filt, motorGain };
    }
    if (this.vac) {
      if (on) {
        this.vac.filt.frequency.setTargetAtTime(500 + pull * 1800, ctx.currentTime, 0.05);
        this.vac.motor.frequency.setTargetAtTime(110 + pull * 90, ctx.currentTime, 0.05);
      } else {
        const v = this.vac;
        this.vac = null;
        v.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        v.motor.frequency.setTargetAtTime(40, ctx.currentTime, 0.1);
        v.src.stop(ctx.currentTime + 0.3);
        v.motor.stop(ctx.currentTime + 0.3);
      }
    }
  }

  daze(pan = 0) {
    this.tone({ type: 'triangle', freq: 1400, freqEnd: 500, dur: 0.25, vol: 0.12, vibrato: 60, vibratoRate: 20, pan });
    this.tone({ type: 'sine', freq: 2100, freqEnd: 900, dur: 0.2, vol: 0.06, when: this.now + 0.05, pan });
  }

  capture(combo: number, big = false) {
    const t = this.now;
    this.tone({ type: 'sine', freq: 200, freqEnd: 1600, dur: 0.18, vol: 0.25 });
    this.noise({ dur: 0.15, vol: 0.15, freq: 3000, freqEnd: 600, q: 2 });
    const base = 72 + Math.min(combo, 6);
    const notes = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    notes.forEach((n, i) => {
      const f = 440 * Math.pow(2, (base + n - 69) / 12);
      this.tone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.12, when: t + 0.12 + i * 0.055, reverb: 0.3 });
      this.tone({ type: 'sine', freq: f * 2, dur: 0.12, vol: 0.05, when: t + 0.12 + i * 0.055 });
    });
  }

  suck(pan = 0) {
    this.tone({ type: 'sine', freq: 500, freqEnd: 1400, dur: 0.3, vol: 0.12, vibrato: 30, vibratoRate: 14, pan });
  }

  whoo(vol = 1, pan = 0, pitch = 1) {
    const f = (380 + Math.random() * 120) * pitch;
    this.tone({ type: 'sine', freq: f, freqEnd: f * 0.7, glide: 'lin', dur: 1.1, vol: 0.12 * vol, attack: 0.25, vibrato: 12, vibratoRate: 5, reverb: 0.7, pan, filter: 1200 });
    this.tone({ type: 'triangle', freq: f * 1.5, freqEnd: f * 1.1, glide: 'lin', dur: 1.0, vol: 0.03 * vol, attack: 0.3, vibrato: 16, vibratoRate: 5.5, reverb: 0.7, pan });
  }

  giggle(vol = 1, pan = 0, pitch = 1) {
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      const f = (900 - i * 60 + Math.random() * 40) * pitch;
      this.tone({ type: 'square', freq: f, freqEnd: f * 1.25, dur: 0.07, vol: 0.05 * vol, when: t + i * 0.11, filter: 2500, reverb: 0.4, pan });
      this.tone({ type: 'sine', freq: f * 0.5, dur: 0.07, vol: 0.06 * vol, when: t + i * 0.11, pan });
    }
  }

  thunder(delay = 0) {
    const t = this.now + delay;
    this.noise({ dur: 0.3, vol: 0.35, filterType: 'lowpass', freq: 3000, freqEnd: 400, when: t });
    this.noise({ dur: 2.8, vol: 0.5, filterType: 'lowpass', freq: 300, freqEnd: 60, attack: 0.1, when: t + 0.05, reverb: 0.5 });
    this.noise({ dur: 1.8, vol: 0.25, filterType: 'lowpass', freq: 150, freqEnd: 50, attack: 0.3, when: t + 0.6 });
  }

  stinger() {
    const t = this.now;
    [220, 233, 311, 330, 466].forEach((f, i) =>
      this.tone({ type: 'sawtooth', freq: f, freqEnd: f * 1.02, dur: 1.0, vol: 0.07, attack: 0.01, when: t + i * 0.005, filter: 3000, filterEnd: 600, reverb: 0.6 }),
    );
    this.noise({ dur: 0.5, vol: 0.3, freq: 2500, freqEnd: 800, q: 3, attack: 0.01 });
    this.tone({ type: 'sine', freq: 90, freqEnd: 40, dur: 0.5, vol: 0.4 });
    // cartoony "BOO!" voice
    this.tone({ type: 'sawtooth', freq: 180, freqEnd: 120, dur: 0.45, vol: 0.18, filter: 700, q: 6, vibrato: 8, vibratoRate: 7 });
  }

  boo() {
    // Matt's squeaky BOO!
    const t = this.now;
    this.tone({ type: 'sawtooth', freq: 420, freqEnd: 300, dur: 0.5, vol: 0.2, filter: 1100, q: 5, vibrato: 20, vibratoRate: 9, reverb: 0.5 });
    this.tone({ type: 'square', freq: 210, freqEnd: 150, dur: 0.5, vol: 0.05, filter: 800 });
    this.tone({ type: 'sine', freq: 80, freqEnd: 30, dur: 0.6, vol: 0.35, when: t + 0.05 });
    this.noise({ dur: 0.8, vol: 0.2, filterType: 'lowpass', freq: 1200, freqEnd: 200, when: t + 0.05, reverb: 0.5 });
  }

  prank() {
    const t = this.now;
    [392, 370, 349, 262].forEach((f, i) =>
      this.tone({ type: 'sawtooth', freq: f, freqEnd: i === 3 ? f * 0.9 : f, dur: i === 3 ? 0.6 : 0.22, vol: 0.09, when: t + i * 0.25, filter: 1200, vibrato: i === 3 ? 10 : 0, vibratoRate: 6 }),
    );
    this.giggle(1.2, 0, 1.2);
  }

  tick(urgent: boolean) {
    this.tone({ type: 'square', freq: urgent ? 1800 : 1200, dur: 0.03, vol: 0.06, filter: 4000 });
  }

  click() {
    this.tone({ type: 'triangle', freq: 900, freqEnd: 1300, dur: 0.06, vol: 0.12 });
  }

  bonus() {
    this.tone({ type: 'triangle', freq: 1046, dur: 0.1, vol: 0.08 });
    this.tone({ type: 'triangle', freq: 1568, dur: 0.14, vol: 0.08, when: this.now + 0.07 });
  }

  poof(pan = 0) {
    this.noise({ dur: 0.35, vol: 0.18, freq: 1200, freqEnd: 300, q: 0.8, pan, reverb: 0.3 });
  }

  creak(pan = 0) {
    const f = 90 + Math.random() * 60;
    this.tone({ type: 'sawtooth', freq: f, freqEnd: f * 1.6, glide: 'lin', dur: 0.9, vol: 0.05, filter: 900, q: 8, vibrato: 18, vibratoRate: 23, reverb: 0.5, pan });
  }

  rattle(pan = 0) {
    const t = this.now;
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.05, vol: 0.12, freq: 300 + Math.random() * 200, q: 3, when: t + i * 0.06, pan });
  }

  whisper(pan = 0) {
    this.noise({ dur: 1.4, vol: 0.05, freq: 3500, freqEnd: 2200, q: 4, attack: 0.4, reverb: 0.8, pan });
  }

  scream() {
    // Matt's little scream: "AAAH!"
    this.tone({ type: 'sawtooth', freq: 700, freqEnd: 900, dur: 0.6, vol: 0.09, filter: 2200, q: 4, vibrato: 30, vibratoRate: 11, reverb: 0.4 });
  }

  gameOver() {
    const t = this.now;
    [62, 58, 55, 50].forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      this.tone({ type: 'triangle', freq: f, dur: 0.7, vol: 0.14, when: t + i * 0.35, reverb: 0.6 });
      this.tone({ type: 'sine', freq: f / 2, dur: 0.7, vol: 0.1, when: t + i * 0.35 });
    });
  }

  fanfare() {
    const t = this.now;
    [60, 64, 67, 72, 67, 72].forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      this.tone({ type: 'square', freq: f, dur: i === 5 ? 0.6 : 0.14, vol: 0.06, when: t + i * 0.13, filter: 3000, reverb: 0.3 });
    });
  }
}

export const audio = new AudioEngine();
