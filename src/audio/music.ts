import { audio } from './audio';

// Procedural spooky music: a music-box melody in D harmonic minor over a
// dark pad and bass. Intensity 0 = title, 1 = playing, 2 = hurry up!

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const R = -1;

// 4 bars x 8 eighth notes
const MELODY_A = [69, 74, 77, 74, 69, 74, 77, 74, 70, 74, 77, 74, 70, 74, 76, 73, 69, 74, 77, 81, 80, 77, 74, 73, 74, R, 69, R, 62, R, R, R];
const MELODY_B = [81, R, 80, 81, 82, R, 81, 79, 77, R, 76, 77, 79, R, 77, 76, 74, 76, 77, 79, 81, 77, 73, 76, 74, R, R, 73, 74, R, R, R];
const BASS = [
  [38, 45],
  [34, 41],
  [33, 40],
  [38, 33],
];
const PAD = [
  [50, 53, 57],
  [46, 50, 53],
  [45, 49, 52],
  [50, 53, 57],
];

export class Music {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private bar = 0;
  intensity = 0;
  private playing = false;

  start() {
    if (!audio.ctx || this.playing) return;
    this.playing = true;
    this.nextTime = audio.now + 0.1;
    this.step = 0;
    this.bar = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private get stepDur() {
    const bpm = this.intensity === 0 ? 72 : this.intensity === 1 ? 92 : 124;
    return 60 / bpm / 2;
  }

  private schedule() {
    if (!audio.ctx) return;
    // don't pile up notes after a background pause
    if (this.nextTime < audio.now - 0.3) this.nextTime = audio.now + 0.05;
    while (this.nextTime < audio.now + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
      if (this.step % 32 === 0) this.bar++;
    }
  }

  private playStep(step: number, t: number) {
    const s = step % 32;
    const barIdx = Math.floor(s / 8);
    const phrase = Math.floor(step / 32) % 4;
    const mel = phrase === 2 ? MELODY_B : MELODY_A;
    const note = mel[s];
    const I = this.intensity;
    const sd = this.stepDur;

    // music box
    if (note !== R && !(I === 0 && phrase === 3 && s > 15)) {
      const f = mtof(note + (I === 2 ? 0 : 0));
      audio.tone({ type: 'sine', freq: f, dur: 1.1, vol: 0.13, bus: 'music', reverb: 0.55, when: t });
      audio.tone({ type: 'sine', freq: f * 4, dur: 0.12, vol: 0.035, bus: 'music', when: t });
      audio.tone({ type: 'triangle', freq: f * 2.005, dur: 0.4, vol: 0.03, bus: 'music', when: t, reverb: 0.4 });
    }

    // pad on each bar
    if (s % 8 === 0) {
      for (const n of PAD[barIdx]) {
        for (const det of [-8, 8])
          audio.tone({ type: 'sawtooth', freq: mtof(n), detune: det, dur: sd * 8, vol: 0.022, attack: sd * 3, release: 0.4, bus: 'music', filter: I === 2 ? 1400 : 800, reverb: 0.5, when: t });
      }
    }

    // bass
    if (I >= 1 && s % 4 === 0) {
      const b = BASS[barIdx][(s % 8) / 4];
      audio.tone({ type: 'triangle', freq: mtof(b), dur: sd * 3, vol: 0.2, bus: 'music', when: t, filter: 600 });
    }

    // clock tick percussion
    if (I >= 1) {
      if (s % 2 === 0) audio.noise({ dur: 0.03, vol: s % 4 === 0 ? 0.05 : 0.03, filterType: 'highpass', freq: 6000, bus: 'music', when: t });
    }

    // heartbeat when time is short
    if (I === 2 && s % 4 === 0) {
      audio.tone({ type: 'sine', freq: 70, freqEnd: 38, dur: 0.14, vol: 0.5, bus: 'music', when: t });
      audio.tone({ type: 'sine', freq: 60, freqEnd: 35, dur: 0.12, vol: 0.32, bus: 'music', when: t + 0.17 });
    }

    // occasional theremin swoop
    if (s === 0 && phrase === 1 && Math.random() < 0.6) {
      const f = mtof(74 + (Math.random() < 0.5 ? 0 : 5));
      audio.tone({ type: 'sine', freq: f * 0.75, freqEnd: f * 1.25, glide: 'lin', dur: sd * 12, vol: 0.05, attack: 0.6, bus: 'music', vibrato: 9, vibratoRate: 5.5, reverb: 0.8, when: t });
    }
  }
}

export const music = new Music();
