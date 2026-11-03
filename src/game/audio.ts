// Tiny WebAudio synth — no assets needed.
class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = localStorage.getItem("tr-muted") === "1";
  private noiseBuf: AudioBuffer | null = null;

  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem("tr-muted", m ? "1" : "0");
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  coin(combo: number) {
    const base = 880 * Math.pow(1.0595, Math.min(combo, 24));
    this.tone(base, 0.08, "square", 0.12);
    this.tone(base * 1.5, 0.14, "square", 0.1, undefined, 0.05);
  }
  gem() {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.15, undefined, i * 0.04));
  }
  heart() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, "sine", 0.2, undefined, i * 0.06));
  }
  hit() {
    this.noise(0.35, 0.6, 400, 0.7);
    this.tone(160, 0.3, "sawtooth", 0.25, 40);
  }
  bump() {
    this.noise(0.15, 0.25, 900, 1.2);
  }
  boost() {
    this.tone(220, 0.4, "sawtooth", 0.12, 880);
    this.noise(0.4, 0.2, 2000, 0.5);
  }
  splash() {
    this.noise(0.2, 0.15, 1500, 0.8);
  }
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, "square", 0.12, undefined, i * 0.11));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.2, undefined, i * 0.16));
  }
  click() {
    this.tone(660, 0.06, "square", 0.08);
  }
}

export const sfx = new Sfx();
