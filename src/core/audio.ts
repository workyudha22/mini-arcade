const MUTE_KEY = 'mini-arcade:muted';

type Wave = OscillatorType;

class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = localStorage.getItem(MUTE_KEY) === '1';

  private ready(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!this.muted) this.tick();
    return this.muted;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0) {
    if (this.muted) return;
    const ctx = this.ready();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  private hiss(dur: number, vol: number, cutoff: number, delay = 0) {
    if (this.muted) return;
    const ctx = this.ready();
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.25), t0 + dur);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  tick() {
    this.tone(520, 0.045, 'sine', 0.045);
  }

  start() {
    this.tone(330, 0.12, 'triangle', 0.12);
    this.tone(495, 0.12, 'triangle', 0.11, undefined, 0.09);
    this.tone(660, 0.18, 'triangle', 0.1, undefined, 0.18);
  }

  gate() {
    this.tone(280, 0.08, 'sine', 0.07, 220);
  }

  perfect(combo: number) {
    const step = Math.min(combo, 10);
    this.tone(660 + step * 45, 0.12, 'triangle', 0.15);
    this.tone(990 + step * 60, 0.16, 'sine', 0.09, undefined, 0.05);
  }

  place() {
    this.tone(150, 0.09, 'triangle', 0.13, 90);
    this.hiss(0.05, 0.03, 1800);
  }

  cut() {
    this.hiss(0.12, 0.06, 1400);
  }

  smash(combo: number) {
    const step = Math.min(combo, 12);
    this.tone(200 + step * 32, 0.07, 'square', 0.11, 120);
    this.tone(880 + step * 40, 0.05, 'triangle', 0.05, undefined, 0.01);
  }

  laser() {
    this.tone(1180, 0.055, 'square', 0.035, 420);
  }

  clear(lines: number) {
    const notes = lines >= 4 ? [523, 659, 784, 1046] : lines >= 2 ? [523, 659, 784] : [523, 659];
    notes.forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.09, undefined, i * 0.05));
    if (lines >= 4) this.hiss(0.22, 0.05, 2600);
  }

  gold() {
    this.tone(880, 0.08, 'triangle', 0.14);
    this.tone(1320, 0.14, 'triangle', 0.11, undefined, 0.06);
    this.tone(1760, 0.2, 'sine', 0.08, undefined, 0.12);
  }

  bomb() {
    this.tone(120, 0.35, 'sawtooth', 0.2, 38);
    this.hiss(0.4, 0.16, 900);
  }

  died() {
    this.tone(220, 0.5, 'sawtooth', 0.16, 45);
    this.hiss(0.5, 0.12, 700);
  }

  timeUp() {
    this.tone(440, 0.16, 'square', 0.08, 220);
    this.tone(330, 0.3, 'square', 0.07, 130, 0.14);
  }

  newBest() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.1, undefined, i * 0.08));
  }
}

export const sfx = new AudioKit();
