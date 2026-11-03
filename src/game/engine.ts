import { sfx } from "./audio";

export const W = 480;
export const GOAL = 100;
const MAXV = 390;
const BOAT_R = 12;

export type Mode = "menu" | "playing" | "paused" | "dying" | "winning" | "over" | "won";

export interface EndStats {
  score: number;
  coins: number;
  time: number;
  won: boolean;
  hearts: number;
  bonus: number;
  maxCombo: number;
}

type Kind = "coin" | "gem" | "rock" | "log" | "boost" | "heart" | "chest";

interface Ent {
  k: Kind;
  x: number;
  y: number;
  r: number;
  ph: number;
  dead?: boolean;
  x2?: number;
  y2?: number;
  pts?: number[];
}

// particle kinds
const P_CIRCLE = 0,
  P_SPARK = 1,
  P_RING = 2,
  P_DEBRIS = 3,
  P_WAKE = 4,
  P_STAR = 5;

interface Particle {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  drag: number;
  rot: number;
  vr: number;
}

interface FText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[(Math.random() * arr.length) | 0];

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  onEnd: (s: EndStats) => void;

  // view
  H = 800;
  scale = 1;
  dpr = 1;
  boatY = 600;
  waterGrad: CanvasGradient | null = null;
  vignette: CanvasGradient | null = null;

  // state
  mode: Mode = "menu";
  phase = 0;
  t = 0; // total time (for animation)
  elapsed = 0; // play time
  dist = 0;
  speed = 220;
  bx = W / 2;
  vx = 0;
  tilt = 0;
  hearts = 3;
  coins = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  comboTimer = 0;
  invuln = 0;
  boostTimer = 0;
  slowTimer = 0;
  bumpCd = 0;
  hitStop = 0;
  trauma = 0;
  flash = 0;
  flashColor = "255,255,255";
  timeScale = 1;
  endTimer = 0;
  chestSpawned = false;
  banner = 0;
  bannerMax = 1;
  bannerText = "";
  scorePulse = 0;
  coinPulse = 0;
  heartPulse = 0;
  wakeAcc = 0;
  bonus = 0;
  sinkT = 0;

  ents: Ent[] = [];
  parts: Particle[] = [];
  texts: FText[] = [];
  spawnY = 0;
  forced: string[] = [];

  // input
  keyL = false;
  keyR = false;
  pointerActive = false;
  pointerId = -1;
  targetX = W / 2;

  raf = 0;
  last = 0;

  constructor(canvas: HTMLCanvasElement, onEnd: (s: EndStats) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.onEnd = onEnd;
    this.phase = Math.random() * 100;
    this.bindInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPDown);
    window.removeEventListener("pointermove", this.onPMove);
    window.removeEventListener("pointerup", this.onPUp);
    window.removeEventListener("pointercancel", this.onPUp);
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = cssW / W;
    this.H = cssH / this.scale;
    this.boatY = this.H * 0.76;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#14a3a0");
    g.addColorStop(1, "#0c7480");
    this.waterGrad = g;
    const v = ctx.createRadialGradient(W / 2, this.H / 2, this.H * 0.3, W / 2, this.H / 2, this.H * 0.75);
    v.addColorStop(0, "rgba(0,20,20,0)");
    v.addColorStop(1, "rgba(0,20,20,0.45)");
    this.vignette = v;
    if (this.mode !== "playing") this.render();
  }

  // ---------- input ----------
  bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointerdown", this.onPDown);
    window.addEventListener("pointermove", this.onPMove);
    window.addEventListener("pointerup", this.onPUp);
    window.addEventListener("pointercancel", this.onPUp);
  }
  onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      this.keyL = true;
      this.pointerActive = false;
      e.preventDefault();
    } else if (k === "ArrowRight" || k === "d" || k === "D") {
      this.keyR = true;
      this.pointerActive = false;
      e.preventDefault();
    }
  };
  onKeyUp = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") this.keyL = false;
    else if (k === "ArrowRight" || k === "d" || k === "D") this.keyR = false;
  };
  onBlur = () => {
    this.keyL = this.keyR = false;
    this.pointerActive = false;
  };
  toVirtualX(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    return (clientX - rect.left) / this.scale;
  }
  onPDown = (e: PointerEvent) => {
    sfx.ensure();
    this.pointerActive = true;
    this.pointerId = e.pointerId;
    this.targetX = this.toVirtualX(e.clientX);
    e.preventDefault();
  };
  onPMove = (e: PointerEvent) => {
    if (!this.pointerActive || e.pointerId !== this.pointerId) return;
    this.targetX = this.toVirtualX(e.clientX);
  };
  onPUp = (e: PointerEvent) => {
    if (e.pointerId === this.pointerId) this.pointerActive = false;
  };

  // ---------- river ----------
  center(y: number) {
    const p = this.phase;
    const s = clamp((y - 300) / 900, 0, 1);
    return W / 2 + s * (Math.sin(y * 0.0019 + p) * 64 + Math.sin(y * 0.00071 + p * 2.3) * 46);
  }
  half(y: number) {
    const s = clamp((y - 300) / 900, 0, 1);
    return 150 - s * 12 + s * (Math.sin(y * 0.0013 + this.phase * 1.7) * 30 + Math.sin(y * 0.0041) * 7);
  }
  lane(y: number, t: number) {
    return this.center(y) + t * (this.half(y) - 24);
  }
  sy(wy: number) {
    return this.boatY - (wy - this.dist);
  }

  // ---------- lifecycle ----------
  start() {
    sfx.ensure();
    this.mode = "playing";
    this.phase = Math.random() * 100;
    this.elapsed = 0;
    this.dist = 0;
    this.speed = 260;
    this.bx = W / 2;
    this.vx = 0;
    this.tilt = 0;
    this.hearts = 3;
    this.coins = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.invuln = 0;
    this.boostTimer = 0;
    this.slowTimer = 0;
    this.hitStop = 0;
    this.trauma = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.endTimer = 0;
    this.chestSpawned = false;
    this.showBanner(`COLLECT ${GOAL} COINS!`, 2.2);
    this.bonus = 0;
    this.sinkT = 0;
    this.ents = [];
    this.parts = [];
    this.texts = [];
    this.spawnY = 140;
    this.forced = ["line0", "wave", "boost", "rocks"];
    this.pointerActive = false;
  }
  pause() {
    if (this.mode === "playing") this.mode = "paused";
  }
  resume() {
    if (this.mode === "paused") {
      this.mode = "playing";
      this.last = performance.now();
    }
  }
  toMenu() {
    this.mode = "menu";
    this.ents = [];
    this.texts = [];
    this.timeScale = 1;
    this.sinkT = 0;
  }

  get difficulty() {
    return clamp(this.elapsed / 75 + (this.coins / GOAL) * 0.5, 0, 1);
  }
  get displayScore() {
    return this.score + Math.floor(this.dist / 25);
  }
  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.combo / 5));
  }

  // ---------- spawning ----------
  addCoin(x: number, y: number) {
    this.ents.push({ k: "coin", x, y, r: 11, ph: Math.random() * 6 });
  }
  addRock(x: number, y: number, r: number) {
    const pts: number[] = [];
    const n = 9;
    for (let i = 0; i < n; i++) pts.push(r * rand(0.82, 1.12));
    this.ents.push({ k: "rock", x, y, r, ph: Math.random() * 6, pts });
  }

  spawnPattern() {
    const y = this.spawnY;
    const d = this.difficulty;
    let type = this.forced.shift();
    if (!type) {
      const table: [string, number][] = [
        ["line", 2.2],
        ["wave", 1.4],
        ["rocks", 2.4 + d * 3],
        ["log", 1.4 + d * 3],
        ["boost", 0.9],
        ["gem", 0.6],
        ["heart", this.hearts < 3 ? 0.45 : 0],
        ["slalom", d > 0.35 ? 1.2 * d : 0],
      ];
      let sum = 0;
      for (const [, w] of table) sum += w;
      let r = Math.random() * sum;
      type = table[0][0];
      for (const [n, w] of table) {
        r -= w;
        if (r <= 0) {
          type = n;
          break;
        }
      }
    }
    let len = 0;
    switch (type) {
      case "line0":
      case "line": {
        const t0 = type === "line0" ? 0 : rand(-0.6, 0.6);
        const n = type === "line0" ? 6 : 4 + ((Math.random() * 3) | 0);
        const drift = type === "line0" ? 0 : rand(-0.06, 0.06);
        for (let i = 0; i < n; i++) this.addCoin(this.lane(y + i * 44, clamp(t0 + drift * i, -0.85, 0.85)), y + i * 44);
        len = n * 44;
        break;
      }
      case "wave": {
        const n = 7;
        const ph = Math.random() * 6;
        for (let i = 0; i < n; i++) this.addCoin(this.lane(y + i * 42, Math.sin(i * 0.55 + ph) * 0.6), y + i * 42);
        len = n * 42;
        break;
      }
      case "rocks": {
        const rows = 2 + Math.round(d * 2);
        let safe = rand(-0.4, 0.4);
        for (let row = 0; row < rows; row++) {
          const ry = y + row * 140;
          safe = clamp(safe + rand(-0.5, 0.5), -0.65, 0.65);
          const count = 1 + (Math.random() < 0.4 + d * 0.5 ? 1 : 0) + (d > 0.6 && Math.random() < 0.4 ? 1 : 0);
          const placed: number[] = [];
          for (let c = 0; c < count * 4 && placed.length < count; c++) {
            const t = rand(-0.95, 0.95);
            if (Math.abs(t - safe) < 0.62) continue;
            if (placed.some((p) => Math.abs(p - t) < 0.35)) continue;
            placed.push(t);
            this.addRock(this.lane(ry, t), ry + rand(-15, 15), rand(16, 22));
          }
          if (row % 2 === 0) this.addCoin(this.lane(ry, safe), ry);
        }
        len = rows * 140;
        break;
      }
      case "log": {
        const side = Math.random() < 0.5 ? -1 : 1;
        const c = this.center(y);
        const h = this.half(y);
        const L = h * 2 * rand(0.45, 0.6);
        const ax = c + side * (h + 20);
        const bxp = ax - side * (L + 20);
        const by = y + rand(-50, 50);
        this.ents.push({ k: "log", x: ax, y: y, x2: bxp, y2: by, r: 11, ph: Math.random() * 6 });
        // coins on the open side
        const ot = -side * 0.62;
        for (let i = -1; i <= 1; i++) this.addCoin(this.lane(y + i * 40, ot), y + i * 40);
        len = 200;
        break;
      }
      case "slalom": {
        for (let j = 0; j < 2; j++) {
          const ly = y + j * 200;
          const side = j === 0 ? -1 : 1;
          const c = this.center(ly);
          const h = this.half(ly);
          const L = h * 2 * 0.55;
          const ax = c + side * (h + 20);
          this.ents.push({ k: "log", x: ax, y: ly, x2: ax - side * (L + 20), y2: ly + rand(-30, 30), r: 11, ph: 0 });
          this.addCoin(this.lane(ly, -side * 0.65), ly);
        }
        len = 420;
        break;
      }
      case "boost": {
        const t = rand(-0.35, 0.35);
        this.ents.push({ k: "boost", x: this.lane(y, t), y, r: 30, ph: 0 });
        for (let i = 0; i < 6; i++) this.addCoin(this.lane(y + 120 + i * 50, t), y + 120 + i * 50);
        len = 120 + 6 * 50;
        break;
      }
      case "gem": {
        const t = rand(-0.4, 0.4);
        this.addRock(this.lane(y, t - 0.6), y, 18);
        this.addRock(this.lane(y, t + 0.6), y, 18);
        this.ents.push({ k: "gem", x: this.lane(y + 30, t), y: y + 30, r: 13, ph: 0 });
        len = 120;
        break;
      }
      case "heart": {
        const t = rand(-0.5, 0.5);
        this.ents.push({ k: "heart", x: this.lane(y, t), y, r: 14, ph: 0 });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          this.addCoin(this.lane(y, t) + Math.cos(a) * 42, y + Math.sin(a) * 42);
        }
        len = 100;
        break;
      }
    }
    const gap = 230 - d * 70 + rand(0, 130);
    this.spawnY += len + gap;
  }

  // ---------- effects ----------
  emit(kind: number, x: number, y: number, n: number, opts: Partial<Particle> & { spread?: number; spd?: [number, number]; dir?: number }) {
    const spread = opts.spread ?? Math.PI * 2;
    const dir = opts.dir ?? 0;
    const spd = opts.spd ?? [60, 200];
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 800) this.parts.shift();
      const a = dir + (Math.random() - 0.5) * spread;
      const s = rand(spd[0], spd[1]);
      const life = (opts.max ?? 0.6) * rand(0.7, 1.2);
      this.parts.push({
        kind,
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: (opts.size ?? 4) * rand(0.7, 1.3),
        grow: opts.grow ?? 0,
        color: opts.color ?? "#fff",
        drag: opts.drag ?? 3,
        rot: Math.random() * 6,
        vr: rand(-10, 10),
      });
    }
  }
  text(x: number, y: number, text: string, color: string, size = 22) {
    this.texts.push({ x, y, text, color, life: 0.9, max: 0.9, size });
  }
  showBanner(text: string, dur: number) {
    this.bannerText = text;
    this.banner = dur;
    this.bannerMax = dur;
  }
  shake(a: number) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  collectCoin(e: Ent) {
    e.dead = true;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = 1.7;
    const m = this.multiplier;
    const isGem = e.k === "gem";
    const val = (isGem ? 100 : 10) * m;
    this.coins += isGem ? 5 : 1;
    this.score += val;
    this.scorePulse = 1;
    this.coinPulse = 1;
    if (isGem) {
      sfx.gem();
      this.emit(P_STAR, e.x, e.y, 18, { color: "#ff7be5", spd: [80, 260], size: 6, max: 0.8 });
      this.emit(P_RING, e.x, e.y, 1, { color: "#ffb3f2", spd: [0, 0], size: 10, grow: 140, max: 0.45 });
      this.text(e.x, e.y, `+5 COINS!`, "#ffb3f2", 26);
      this.shake(0.15);
    } else {
      sfx.coin(this.combo);
      this.emit(P_SPARK, e.x, e.y, 8, { color: "#ffe066", spd: [90, 240], size: 3, max: 0.4, drag: 5 });
      this.emit(P_RING, e.x, e.y, 1, { color: "#fff3b0", spd: [0, 0], size: 8, grow: 90, max: 0.3 });
      this.text(e.x, e.y, m > 1 ? `+${val} x${m}` : `+${val}`, m > 1 ? "#ffd166" : "#ffffff", m > 1 ? 22 : 18);
    }
    if (this.combo > 0 && this.combo % 10 === 0) {
      this.showBanner(`${this.combo} COMBO!`, 1.1);
    }
  }

  damage(x: number, y: number) {
    this.hearts--;
    this.heartPulse = 1;
    this.invuln = 1.7;
    this.combo = 0;
    this.slowTimer = 1;
    this.hitStop = 0.09;
    this.shake(0.75);
    this.flash = 0.5;
    this.flashColor = "255,60,60";
    sfx.hit();
    this.emit(P_DEBRIS, x, y, 14, { color: "#8b4a22", spd: [120, 320], size: 6, max: 0.9, drag: 2 });
    this.emit(P_CIRCLE, x, y, 16, { color: "#e6fbff", spd: [80, 260], size: 5, max: 0.6 });
    this.emit(P_RING, x, y, 1, { color: "#ffffff", spd: [0, 0], size: 14, grow: 160, max: 0.4 });
    if (this.hearts <= 0) {
      this.mode = "dying";
      this.endTimer = 1.5;
      this.timeScale = 0.35;
      sfx.lose();
      this.emit(P_DEBRIS, this.bx, this.dist, 26, { color: "#c98a4b", spd: [150, 420], size: 7, max: 1.4, drag: 1.5 });
      this.emit(P_CIRCLE, this.bx, this.dist, 30, { color: "#ffffff", spd: [100, 380], size: 6, max: 1 });
      this.shake(1);
    }
  }

  smash(e: Ent) {
    e.dead = true;
    const x = e.k === "log" ? (e.x + e.x2!) / 2 : e.x;
    const y = e.k === "log" ? (e.y + e.y2!) / 2 : e.y;
    this.score += 50;
    this.scorePulse = 1;
    this.hitStop = 0.05;
    this.shake(0.4);
    sfx.hit();
    this.emit(P_DEBRIS, x, y, 16, { color: e.k === "log" ? "#8e5a2c" : "#7d8890", spd: [150, 380], size: 7, max: 0.9, drag: 2 });
    this.emit(P_CIRCLE, x, y, 14, { color: "#e6fbff", spd: [60, 240], size: 5, max: 0.6 });
    this.text(x, y, "SMASH! +50", "#7ff7ff", 24);
  }

  // ---------- update ----------
  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;
    if (this.mode !== "paused") {
      if (this.hitStop > 0) {
        this.hitStop -= dt;
        this.trauma = Math.max(0, this.trauma - dt * 0.5);
      } else {
        this.update(dt);
      }
    }
    this.render();
  };

  update(rdt: number) {
    // slow-mo eases back
    if (this.mode === "playing") this.timeScale += (1 - this.timeScale) * Math.min(1, rdt * 4);
    const dt = rdt * this.timeScale;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - rdt * 1.6);
    this.flash = Math.max(0, this.flash - rdt * 2.2);
    this.scorePulse = Math.max(0, this.scorePulse - rdt * 5);
    this.coinPulse = Math.max(0, this.coinPulse - rdt * 5);
    this.heartPulse = Math.max(0, this.heartPulse - rdt * 3);
    this.banner = Math.max(0, this.banner - rdt);

    const playing = this.mode === "playing";
    const alive = playing || this.mode === "winning" || this.mode === "won" || this.mode === "menu";

    if (playing) {
      this.elapsed += dt;
      this.invuln = Math.max(0, this.invuln - dt);
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      this.bumpCd = Math.max(0, this.bumpCd - dt);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
    }

    // ---- speed
    let target: number;
    if (this.mode === "menu" || this.mode === "won") target = 200;
    else if (this.mode === "winning") target = 120;
    else if (this.mode === "dying" || this.mode === "over") target = 40;
    else {
      target = 270 + this.difficulty * 150;
      if (this.boostTimer > 0) target += 300 * Math.min(1, this.boostTimer / 0.5);
      if (this.slowTimer > 0) target *= 1 - 0.45 * this.slowTimer;
    }
    this.speed += (target - this.speed) * Math.min(1, dt * (this.boostTimer > 0 ? 8 : 3));
    this.dist += this.speed * dt;

    // ---- steering
    if (alive) {
      let desired = 0;
      let rate = 9;
      if (playing) {
        if (this.pointerActive) {
          desired = clamp((this.targetX - this.bx) * 9, -MAXV, MAXV);
          rate = 18;
        } else {
          const dir = (this.keyR ? 1 : 0) - (this.keyL ? 1 : 0);
          desired = dir * MAXV;
          rate = dir === 0 ? 10 : 15;
        }
      } else {
        // autopilot
        desired = clamp((this.center(this.dist + 140) - this.bx) * 3, -200, 200);
        rate = 4;
      }
      this.vx += (desired - this.vx) * Math.min(1, rate * dt);
      this.bx += this.vx * dt;
      const tt = (this.vx / MAXV) * 0.38;
      this.tilt += (tt - this.tilt) * Math.min(1, dt * 12);

      // banks
      const y0 = this.dist,
        y1 = this.dist + 24;
      const L = Math.max(this.center(y0) - this.half(y0), this.center(y1) - this.half(y1)) + 15;
      const R = Math.min(this.center(y0) + this.half(y0), this.center(y1) + this.half(y1)) - 15;
      let bumped = 0;
      if (this.bx < L) {
        this.bx = L;
        if (this.vx < 0) this.vx = -this.vx * 0.5 + 60;
        bumped = -1;
      } else if (this.bx > R) {
        this.bx = R;
        if (this.vx > 0) this.vx = -this.vx * 0.5 - 60;
        bumped = 1;
      }
      if (bumped && playing && this.bumpCd <= 0) {
        this.bumpCd = 0.35;
        this.slowTimer = Math.max(this.slowTimer, 0.45);
        this.shake(0.28);
        sfx.bump();
        if (this.combo >= 3) this.text(this.bx, this.dist + 30, "COMBO LOST", "#ffb3a7", 16);
        this.combo = 0;
        this.emit(P_CIRCLE, this.bx + bumped * 14, this.dist + 10, 10, { color: "#f1e2b0", spd: [60, 200], size: 4, max: 0.5, dir: bumped > 0 ? Math.PI : 0, spread: 2.2 });
      }
    }

    // ---- wake
    if (alive || this.mode === "dying") {
      this.wakeAcc += dt;
      const sternY = this.dist - 24;
      while (this.wakeAcc > 0.016) {
        this.wakeAcc -= 0.016;
        if (this.mode === "dying") break;
        for (const s of [-1, 1]) {
          if (this.parts.length > 800) this.parts.shift();
          const life = 0.9;
          this.parts.push({
            kind: P_WAKE,
            x: this.bx + s * 9 - Math.sin(this.tilt) * 20,
            y: sternY,
            vx: s * rand(20, 50),
            vy: rand(-10, 10),
            life,
            max: life,
            size: rand(3, 5),
            grow: 14,
            color: "#fff",
            drag: 1.5,
            rot: 0,
            vr: 0,
          });
        }
        if (this.boostTimer > 0) {
          this.emit(P_SPARK, this.bx + rand(-6, 6), sternY - 4, 1, { color: pick(["#ffd166", "#ff8a3d", "#fff"]), spd: [120, 260], dir: -Math.PI / 2, spread: 0.6, size: 3, max: 0.35 });
        }
        if (Math.abs(this.vx) > 220 && Math.random() < 0.6) {
          const s = Math.sign(this.vx);
          this.emit(P_CIRCLE, this.bx + s * 12, this.dist + 18, 1, { color: "#e9fdff", spd: [80, 160], dir: s > 0 ? 0 : Math.PI, spread: 1, size: 3, max: 0.4 });
        }
      }
    }

    // ---- spawn
    if (playing && !this.chestSpawned) {
      while (this.spawnY < this.dist + this.H + 150) this.spawnPattern();
    }
    if (playing && !this.chestSpawned && this.coins >= GOAL) {
      this.chestSpawned = true;
      const cy = Math.max(this.dist + this.H * 0.85, this.spawnY + 60);
      this.ents.push({ k: "chest", x: this.center(cy), y: cy, r: 34, ph: 0 });
      this.showBanner("TREASURE AHEAD!", 2.5);
      sfx.heart();
    }

    // ---- entities
    const by = this.dist;
    const bottom = this.dist - (this.H - this.boatY) - 100;
    for (const e of this.ents) {
      if (e.dead) continue;
      if ((e.k === "log" ? Math.max(e.y, e.y2!) : e.y) < bottom) {
        e.dead = true;
        if (e.k === "chest") {
          this.chestSpawned = false; // missed it — it will come around again
          this.spawnY = this.dist + this.H;
        }
        continue;
      }
      if (!playing) continue;
      if (e.k === "coin" || e.k === "gem" || e.k === "heart") {
        const dx = this.bx - e.x,
          dy = by + 4 - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 58 && d > 0.01) {
          const pull = (1 - d / 58) * 480 * dt + 50 * dt;
          e.x += (dx / d) * pull;
          e.y += (dy / d) * pull;
        }
        if (d < 26) {
          if (e.k === "heart") {
            e.dead = true;
            this.hearts = Math.min(3, this.hearts + 1);
            this.heartPulse = 1;
            sfx.heart();
            this.flash = 0.25;
            this.flashColor = "255,120,160";
            this.emit(P_STAR, e.x, e.y, 14, { color: "#ff5c8a", spd: [80, 220], size: 6, max: 0.7 });
            this.text(e.x, e.y, "+1 HEART", "#ff8fb0", 22);
          } else this.collectCoin(e);
        }
      } else if (e.k === "rock") {
        if (this.hitCircle(e.x, e.y, e.r - 2)) this.onObstacle(e);
      } else if (e.k === "log") {
        if (this.hitSeg(e.x, e.y, e.x2!, e.y2!, e.r)) this.onObstacle(e);
      } else if (e.k === "boost") {
        if (Math.abs(this.bx - e.x) < 34 && Math.abs(by - e.y) < 46) {
          e.dead = true;
          if (this.boostTimer <= 0) sfx.boost();
          this.boostTimer = 1.9;
          this.shake(0.25);
          this.flash = 0.2;
          this.flashColor = "120,255,250";
          this.text(this.bx, by + 40, "BOOST!", "#7ff7ff", 28);
          this.emit(P_SPARK, e.x, e.y, 16, { color: "#7ff7ff", spd: [100, 300], size: 3, max: 0.5 });
        }
      } else if (e.k === "chest") {
        const dx = this.bx - e.x,
          dy = by - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) e.x += (dx / d) * 160 * dt;
        if (d < 48) this.winGame(e);
      }
    }
    let w = 0;
    for (let i = 0; i < this.ents.length; i++) if (!this.ents[i].dead) this.ents[w++] = this.ents[i];
    this.ents.length = w;

    // ---- particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr;
      p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.life -= dt;
      tx.y += (this.speed + 70) * dt; // rise on screen
      if (tx.life <= 0) this.texts.splice(i, 1);
    }

    // ---- end-state timers
    if (this.mode === "dying") {
      this.sinkT += dt;
      this.endTimer -= rdt;
      if (this.endTimer <= 0) {
        this.mode = "over";
        this.timeScale = 1;
        this.onEnd(this.stats(false));
      }
    } else if (this.mode === "winning") {
      this.endTimer -= rdt;
      this.timeScale += (1 - this.timeScale) * Math.min(1, rdt * 1.2);
      if (Math.random() < 0.5) {
        this.emit(P_DEBRIS, rand(0, W), this.dist + this.H - this.boatY + 20, 2, {
          color: pick(["#ffd166", "#ff5c8a", "#7ff7ff", "#a0ff7f", "#ffffff"]),
          spd: [40, 120],
          dir: -Math.PI / 2,
          spread: 1.2,
          size: 6,
          max: 3,
          drag: 0.3,
        });
      }
      if (this.endTimer <= 0) {
        this.mode = "won";
        this.timeScale = 1;
        this.onEnd(this.stats(true));
      }
    } else if (this.mode === "won" && Math.random() < 0.25) {
      this.emit(P_DEBRIS, rand(0, W), this.dist + this.H - this.boatY + 20, 1, {
        color: pick(["#ffd166", "#ff5c8a", "#7ff7ff", "#a0ff7f"]),
        spd: [40, 100],
        dir: -Math.PI / 2,
        spread: 1.2,
        size: 6,
        max: 3,
        drag: 0.3,
      });
    }
  }

  hitCircle(x: number, y: number, r: number) {
    const rr = r + BOAT_R;
    for (const oy of [14, -10]) {
      const dx = this.bx + Math.sin(this.tilt) * oy - x;
      const dy = this.dist + oy - y;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }
  hitSeg(x1: number, y1: number, x2: number, y2: number, r: number) {
    const rr = r + BOAT_R;
    for (const oy of [14, -10]) {
      const px = this.bx + Math.sin(this.tilt) * oy,
        py = this.dist + oy;
      const dx = x2 - x1,
        dy = y2 - y1;
      const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
      const cx = x1 + dx * t - px,
        cy = y1 + dy * t - py;
      if (cx * cx + cy * cy < rr * rr) return true;
    }
    return false;
  }
  onObstacle(e: Ent) {
    if (this.boostTimer > 0) {
      this.smash(e);
      return;
    }
    if (this.invuln > 0) return;
    // knock boat away
    const cx = e.k === "log" ? this.bx : e.x;
    const dir = this.bx >= cx ? 1 : -1;
    this.vx = dir * 260;
    this.damage(this.bx, this.dist + 16);
  }

  winGame(e: Ent) {
    e.dead = true;
    this.mode = "winning";
    this.timeScale = 0.3;
    this.endTimer = 2.4;
    this.hitStop = 0.12;
    this.shake(0.8);
    this.flash = 0.8;
    this.flashColor = "255,230,120";
    this.bonus = this.hearts * 1000 + Math.max(0, Math.round((160 - this.elapsed) * 25));
    this.score += this.bonus;
    sfx.win();
    this.emit(P_STAR, e.x, e.y, 40, { color: "#ffd166", spd: [120, 420], size: 7, max: 1.4, drag: 1.5 });
    this.emit(P_SPARK, e.x, e.y, 30, { color: "#fff3b0", spd: [150, 450], size: 4, max: 1, drag: 2 });
    this.emit(P_RING, e.x, e.y, 1, { color: "#ffe066", spd: [0, 0], size: 20, grow: 400, max: 0.7 });
    this.text(e.x, e.y, `TREASURE! +${this.bonus}`, "#ffe066", 30);
    this.showBanner("YOU FOUND IT!", 2.4);
  }

  stats(won: boolean): EndStats {
    return {
      score: this.displayScore,
      coins: this.coins,
      time: this.elapsed,
      won,
      hearts: this.hearts,
      bonus: won ? this.bonus : 0,
      maxCombo: this.maxCombo,
    };
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx;
    const H = this.H;
    const k = this.dpr * this.scale;
    const tr = this.trauma * this.trauma;
    const sx = tr * 16 * (Math.random() * 2 - 1);
    const sy = tr * 16 * (Math.random() * 2 - 1);
    const rot = tr * 0.035 * (Math.random() * 2 - 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.rotate(rot);
    ctx.translate(-W / 2, -H / 2);

    // grass
    ctx.fillStyle = "#2d7a3a";
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // sample river edges
    const step = 14;
    const n = Math.ceil((H + 60) / step) + 1;
    const Ls: number[] = new Array(n);
    const Rs: number[] = new Array(n);
    const Ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = -30 + i * step;
      const wy = this.dist + (this.boatY - s);
      const c = this.center(wy);
      const h = this.half(wy);
      Ls[i] = c - h;
      Rs[i] = c + h;
      Ys[i] = s;
    }
    const poly = (ex: number, fill: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(Ls[0] - ex, Ys[0]);
      for (let i = 1; i < n; i++) ctx.lineTo(Ls[i] - ex, Ys[i]);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(Rs[i] + ex, Ys[i]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // grass darker band near shore + sand
    poly(26, "#256b31");
    poly(16, "#ecd391");
    poly(6, "#c8ad6b");
    poly(0, this.waterGrad || "#14a3a0");

    // deep channel
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const c = (Ls[i] + Rs[i]) / 2,
        h = (Rs[i] - Ls[i]) * 0.22;
      if (i === 0) ctx.moveTo(c - h, Ys[i]);
      else ctx.lineTo(c - h, Ys[i]);
    }
    for (let i = n - 1; i >= 0; i--) {
      const c = (Ls[i] + Rs[i]) / 2,
        h = (Rs[i] - Ls[i]) * 0.22;
      ctx.lineTo(c + h, Ys[i]);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(4,60,80,0.18)";
    ctx.fill();

    // ripples (flowing downstream)
    const flow = this.t * 50;
    const band = 34;
    const shift = Math.floor(flow / band);
    const off = flow % band;
    const k0 = Math.floor((this.dist - (H - this.boatY) - 40) / band);
    const k1 = Math.ceil((this.dist + this.boatY + 40) / band);
    ctx.strokeStyle = "rgba(220,255,250,0.22)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let kk = k0; kk <= k1; kk++) {
      const id = kk + shift;
      const wy = kk * band - off;
      const s = this.sy(wy);
      const c = this.center(wy),
        h = this.half(wy) - 20;
      for (let j = 0; j < 2; j++) {
        const x = c + (hash(id * 3.1 + j * 17.7) * 2 - 1) * h;
        const len = 6 + hash(id + j * 9.3) * 10;
        ctx.moveTo(x - len, s);
        ctx.quadraticCurveTo(x, s - 4, x + len, s);
      }
    }
    ctx.stroke();

    // foam edges
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -this.dist * 0.98 - this.t * 30;
    ctx.beginPath();
    ctx.moveTo(Ls[0] + 2, Ys[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(Ls[i] + 2, Ys[i]);
    ctx.moveTo(Rs[0] - 2, Ys[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(Rs[i] - 2, Ys[i]);
    ctx.stroke();
    ctx.setLineDash([]);

    // wake particles
    for (const p of this.parts) {
      if (p.kind !== P_WAKE) continue;
      const a = p.life / p.max;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, this.sy(p.y), p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // entities
    for (const e of this.ents) if (!e.dead && (e.k === "boost" || e.k === "log" || e.k === "rock")) this.drawEnt(e);
    for (const e of this.ents) if (!e.dead && !(e.k === "boost" || e.k === "log" || e.k === "rock")) this.drawEnt(e);

    // boat
    if (this.mode !== "over") this.drawBoat();

    // particles
    for (const p of this.parts) {
      if (p.kind === P_WAKE) continue;
      const a = p.life / p.max;
      const px = p.x,
        py = this.sy(p.y);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case P_CIRCLE:
          ctx.beginPath();
          ctx.arc(px, py, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        case P_SPARK: {
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - p.vx * 0.05, py + p.vy * 0.05);
          ctx.stroke();
          break;
        }
        case P_RING:
          ctx.globalAlpha = a;
          ctx.lineWidth = 3 * a + 1;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case P_DEBRIS:
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case P_STAR:
          this.star(px, py, p.size * (0.4 + a * 0.6), p.rot);
          break;
      }
    }
    ctx.globalAlpha = 1;

    // trees on banks (overhang)
    this.drawTrees();

    // floating texts
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const tx of this.texts) {
      const a = tx.life / tx.max;
      const pop = a > 0.8 ? 1 + (a - 0.8) * 3 : 1;
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.font = `${Math.round(tx.size * pop)}px "Lilita One", sans-serif`;
      const y = this.sy(tx.y);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,40,40,0.85)";
      ctx.strokeText(tx.text, tx.x, y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, y);
    }
    ctx.globalAlpha = 1;

    // ---- screen space
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // speed lines when boosting
    if (this.boostTimer > 0 && this.mode === "playing") {
      const a = Math.min(1, this.boostTimer / 0.6) * 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const x = hash(i * 7.7 + Math.floor(this.t * 20)) * W;
        const y = hash(i * 3.3 + Math.floor(this.t * 20)) * H;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 60);
      }
      ctx.stroke();
    }
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.mode !== "menu") this.drawHUD();
  }

  star(x: number, y: number, r: number, rot: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? r : r * 0.4;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  heartPath(x: number, y: number, s: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.3, x - s * 0.5, y - s * 1.0, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 1.0, x + s * 1.1, y - s * 0.3, x, y + s * 0.35);
    ctx.closePath();
  }

  drawEnt(e: Ent) {
    const ctx = this.ctx;
    const t = this.t;
    const y = this.sy(e.y);
    if (y < -80 || y > this.H + 80) {
      if (e.k !== "log") return;
    }
    switch (e.k) {
      case "coin": {
        const by = y + Math.sin(t * 4 + e.ph) * 2;
        const s = Math.max(0.18, Math.abs(Math.cos(t * 4.5 + e.ph)));
        ctx.fillStyle = "rgba(255,220,90,0.22)";
        ctx.beginPath();
        ctx.arc(e.x, by, e.r * 1.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,50,60,0.25)";
        ctx.beginPath();
        ctx.ellipse(e.x + 3, by + 5, e.r * s, e.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e69b00";
        ctx.beginPath();
        ctx.ellipse(e.x, by, e.r * s, e.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath();
        ctx.ellipse(e.x, by, e.r * s * 0.78, e.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff4b8";
        ctx.beginPath();
        ctx.ellipse(e.x - e.r * s * 0.3, by - e.r * 0.35, e.r * s * 0.22, e.r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "gem": {
        const by = y + Math.sin(t * 3) * 3;
        const r = e.r * (1 + Math.sin(t * 6) * 0.06);
        ctx.fillStyle = "rgba(255,120,230,0.25)";
        ctx.beginPath();
        ctx.arc(e.x, by, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c2189b";
        ctx.beginPath();
        ctx.moveTo(e.x, by - r * 1.2);
        ctx.lineTo(e.x + r, by - r * 0.2);
        ctx.lineTo(e.x, by + r * 1.2);
        ctx.lineTo(e.x - r, by - r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ff7be5";
        ctx.beginPath();
        ctx.moveTo(e.x, by - r * 1.2);
        ctx.lineTo(e.x + r, by - r * 0.2);
        ctx.lineTo(e.x, by + r * 0.2);
        ctx.lineTo(e.x - r, by - r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        this.star(e.x + r * 0.7, by - r * 0.9, 4 + Math.sin(t * 8) * 2, t);
        break;
      }
      case "heart": {
        const by = y + Math.sin(t * 3) * 3;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, by, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const s = 13 * (1 + Math.sin(t * 7) * 0.08);
        this.heartPath(e.x, by + 3, s);
        ctx.fillStyle = "#ff3d6e";
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(e.x - 5, by - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "rock": {
        const pts = e.pts!;
        const nn = pts.length;
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(t * 5 + e.ph) * 0.12})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, y, e.r + 6 + Math.sin(t * 4 + e.ph) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        const shape = (ox: number, oy: number, sc: number) => {
          ctx.beginPath();
          for (let i = 0; i < nn; i++) {
            const a = (i / nn) * Math.PI * 2 + e.ph;
            const px = e.x + ox + Math.cos(a) * pts[i] * sc;
            const py = y + oy + Math.sin(a) * pts[i] * sc;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        };
        ctx.fillStyle = "rgba(0,40,50,0.35)";
        shape(4, 5, 1);
        ctx.fillStyle = "#5d6870";
        shape(0, 0, 1);
        ctx.fillStyle = "#87939b";
        shape(-3, -3, 0.68);
        ctx.fillStyle = "#a9b4ba";
        shape(-5, -6, 0.3);
        break;
      }
      case "log": {
        const y2 = this.sy(e.y2!);
        const bob = Math.sin(t * 2 + e.ph) * 1.5;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = e.r * 2 + 12;
        ctx.beginPath();
        ctx.moveTo(e.x, y + bob);
        ctx.lineTo(e.x2!, y2 + bob);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,40,50,0.35)";
        ctx.lineWidth = e.r * 2;
        ctx.beginPath();
        ctx.moveTo(e.x + 4, y + 6 + bob);
        ctx.lineTo(e.x2! + 4, y2 + 6 + bob);
        ctx.stroke();
        ctx.strokeStyle = "#5a3417";
        ctx.lineWidth = e.r * 2;
        ctx.beginPath();
        ctx.moveTo(e.x, y + bob);
        ctx.lineTo(e.x2!, y2 + bob);
        ctx.stroke();
        ctx.strokeStyle = "#8e5a2c";
        ctx.lineWidth = e.r * 1.2;
        ctx.beginPath();
        ctx.moveTo(e.x, y - 2 + bob);
        ctx.lineTo(e.x2!, y2 - 2 + bob);
        ctx.stroke();
        ctx.fillStyle = "#d8a96b";
        ctx.beginPath();
        ctx.arc(e.x2!, y2 + bob, e.r - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8e5a2c";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x2!, y2 + bob, e.r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineCap = "butt";
        break;
      }
      case "boost": {
        const w = 56,
          h = 88;
        ctx.fillStyle = "rgba(90,255,245,0.18)";
        ctx.strokeStyle = "rgba(160,255,250,0.85)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(e.x - w / 2, y - h / 2, w, h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const ph = (t * 2.2 + i / 3) % 1;
          const cy = y + h / 2 - 14 - ph * (h - 24);
          ctx.strokeStyle = `rgba(200,255,255,${Math.sin(ph * Math.PI)})`;
          ctx.beginPath();
          ctx.moveTo(e.x - 14, cy + 8);
          ctx.lineTo(e.x, cy - 4);
          ctx.lineTo(e.x + 14, cy + 8);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
        break;
      }
      case "chest": {
        const by = y + Math.sin(t * 2.5) * 4;
        // rays
        ctx.save();
        ctx.translate(e.x, by);
        ctx.rotate(t * 0.6);
        ctx.fillStyle = "rgba(255,225,110,0.22)";
        for (let i = 0; i < 12; i++) {
          ctx.rotate(Math.PI / 6);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-12, 110);
          ctx.lineTo(12, 110);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        // island
        ctx.fillStyle = "#ecd391";
        ctx.beginPath();
        ctx.ellipse(e.x, by + 10, 52, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();
        // chest
        ctx.fillStyle = "#6b3a17";
        ctx.fillRect(e.x - 26, by - 8, 52, 30);
        ctx.fillStyle = "#8e5a2c";
        ctx.beginPath();
        ctx.ellipse(e.x, by - 8, 26, 14, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(e.x - 26, by - 9, 52, 5);
        ctx.fillRect(e.x - 18, by - 20, 5, 42);
        ctx.fillRect(e.x + 13, by - 20, 5, 42);
        ctx.fillStyle = "#fff4b8";
        ctx.fillRect(e.x - 5, by - 6, 10, 12);
        ctx.fillStyle = "#fff";
        this.star(e.x + 22, by - 22, 5 + Math.sin(t * 7) * 2, t * 2);
        this.star(e.x - 26, by + 14, 4 + Math.cos(t * 6) * 2, -t * 2);
        break;
      }
    }
  }

  drawBoat() {
    const ctx = this.ctx;
    let x = this.bx;
    let y = this.boatY;
    let alpha = 1;
    let sc = 1;
    if (this.mode === "dying") {
      sc = Math.max(0.3, 1 - this.sinkT * 0.9);
      alpha = Math.max(0, 1 - this.sinkT * 1.1);
      x += Math.sin(this.sinkT * 30) * 3;
    }
    if (this.mode === "playing" && this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) alpha = 0.35;
    const bob = Math.sin(this.t * 6) * 1.2;
    y += bob;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(this.tilt + (this.mode === "dying" ? this.sinkT * 2 : 0));
    ctx.scale(sc, sc);

    // boost flame
    if (this.boostTimer > 0 && this.mode === "playing") {
      const f = 14 + Math.random() * 14;
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath();
      ctx.moveTo(-7, 28);
      ctx.lineTo(0, 30 + f);
      ctx.lineTo(7, 28);
      ctx.fill();
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.moveTo(-4, 28);
      ctx.lineTo(0, 28 + f * 0.6);
      ctx.lineTo(4, 28);
      ctx.fill();
    }
    // shadow
    ctx.fillStyle = "rgba(0,40,50,0.35)";
    ctx.beginPath();
    ctx.ellipse(5, 7, 16, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    // bow foam
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(0, -30, 9 + Math.sin(this.t * 20) * 1.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // hull
    const hull = (s: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -34 * s);
      ctx.quadraticCurveTo(17 * s, -20 * s, 16 * s, 4 * s);
      ctx.lineTo(14 * s, 24 * s);
      ctx.quadraticCurveTo(0, 30 * s, -14 * s, 24 * s);
      ctx.lineTo(-16 * s, 4 * s);
      ctx.quadraticCurveTo(-17 * s, -20 * s, 0, -34 * s);
      ctx.closePath();
    };
    hull(1);
    ctx.fillStyle = "#e8483b";
    ctx.fill();
    ctx.strokeStyle = "#7a1f17";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    hull(0.78);
    ctx.fillStyle = "#d39a5a";
    ctx.fill();
    // planks
    ctx.strokeStyle = "rgba(110,60,20,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      ctx.moveTo(i * 4, -20);
      ctx.lineTo(i * 4, 20);
    }
    ctx.stroke();
    // seat
    ctx.fillStyle = "#8b4a22";
    ctx.fillRect(-12, -4, 24, 5);
    // engine
    ctx.fillStyle = "#3b4a52";
    ctx.beginPath();
    ctx.roundRect(-6, 20, 12, 10, 3);
    ctx.fill();
    // captain
    ctx.fillStyle = "#1d6f8c";
    ctx.beginPath();
    ctx.ellipse(0, 10, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c094";
    ctx.beginPath();
    ctx.arc(0, 8, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath();
    ctx.ellipse(0, 8, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b3b3b";
    ctx.beginPath();
    ctx.arc(0, 7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(-1.5, 3, 3, 2);
    // flag
    ctx.fillStyle = "#5a3417";
    ctx.fillRect(-1, -24, 2, 10);
    ctx.fillStyle = "#ffd23f";
    const wave = Math.sin(this.t * 14) * 2;
    ctx.beginPath();
    ctx.moveTo(1, -24);
    ctx.lineTo(10 - this.tilt * 10, -21 + wave);
    ctx.lineTo(1, -18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawTrees() {
    const ctx = this.ctx;
    const band = 44;
    const k0 = Math.floor((this.dist - (this.H - this.boatY) - 80) / band);
    const k1 = Math.ceil((this.dist + this.boatY + 80) / band);
    for (let kk = k0; kk <= k1; kk++) {
      const wy = kk * band;
      const s = this.sy(wy);
      const c = this.center(wy),
        h = this.half(wy);
      for (let side = -1; side <= 1; side += 2) {
        const hv = hash(kk * 2.37 + side * 91.1);
        if (hv < 0.18) continue;
        const r = 16 + hash(kk * 5.1 + side) * 14;
        const edge = c + side * (h + 20 + r * 0.6);
        const x = edge + side * hash(kk * 1.7 + side * 3) * 40;
        if (x < -40 || x > W + 40) continue;
        if (hv < 0.3) {
          // bush / rock on shore
          ctx.fillStyle = hv < 0.24 ? "#7c8790" : "#3f9b4a";
          ctx.beginPath();
          ctx.arc(x, s, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
          if (hv >= 0.24) {
            ctx.fillStyle = "#ff6fa3";
            ctx.beginPath();
            ctx.arc(x - 3, s - 2, 2.5, 0, Math.PI * 2);
            ctx.arc(x + 4, s + 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }
        const sway = Math.sin(this.t * 1.5 + kk) * 1.5;
        ctx.fillStyle = "rgba(0,30,10,0.35)";
        ctx.beginPath();
        ctx.arc(x + 7, s + 8, r, 0, Math.PI * 2);
        ctx.fill();
        if (hv > 0.75) {
          // palm: star of leaves
          ctx.fillStyle = "#2f8f3e";
          ctx.save();
          ctx.translate(x + sway, s);
          ctx.rotate(hv * 6);
          for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.ellipse(r * 0.55, 0, r * 0.6, r * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#57b85a";
          for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.ellipse(r * 0.45, 0, r * 0.4, r * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#7a4a22";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = "#1f6a2d";
          ctx.beginPath();
          ctx.arc(x + sway, s, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#2f8a3b";
          ctx.beginPath();
          ctx.arc(x - r * 0.15 + sway, s - r * 0.15, r * 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#4fae4f";
          ctx.beginPath();
          ctx.arc(x - r * 0.3 + sway, s - r * 0.32, r * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawHUD() {
    const ctx = this.ctx;
    ctx.textBaseline = "middle";
    // hearts
    for (let i = 0; i < 3; i++) {
      const full = i < this.hearts;
      const p = full && i === this.hearts - 1 ? this.heartPulse : 0;
      const lost = !full && i === this.hearts ? this.heartPulse : 0;
      const s = 12 * (1 + p * 0.4 + lost * 0.5);
      const x = 26 + i * 32;
      const y = 32;
      this.heartPath(x, y + 3, s);
      ctx.fillStyle = full ? "#ff3d6e" : "rgba(0,0,0,0.35)";
      ctx.fill();
      ctx.strokeStyle = full ? "#7a0f2b" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // score
    ctx.textAlign = "center";
    const sp = 1 + this.scorePulse * 0.18;
    ctx.font = `${Math.round(34 * sp)}px "Lilita One", sans-serif`;
    const sc = this.displayScore.toLocaleString();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(8,40,40,0.8)";
    ctx.strokeText(sc, W / 2, 32);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(sc, W / 2, 32);

    // progress bar
    const bx = 46,
      bw = W - 100,
      by = 64,
      bh = 16;
    const prog = Math.min(1, this.coins / GOAL);
    ctx.fillStyle = "rgba(5,35,35,0.6)";
    ctx.beginPath();
    ctx.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 11);
    ctx.fill();
    if (prog > 0) {
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, "#ffe680");
      g.addColorStop(1, "#f0a500");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(bh, bw * prog), bh, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(bx + 6, by + 3, Math.max(0, bw * prog - 12), 3);
    }
    ctx.font = `13px "Lilita One", sans-serif`;
    ctx.fillStyle = "#3a2500";
    ctx.textAlign = "center";
    const label = `${Math.min(this.coins, GOAL)} / ${GOAL}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.strokeText(label, bx + bw / 2, by + bh / 2 + 1);
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);
    // coin icon
    const cs = 1 + this.coinPulse * 0.35;
    ctx.fillStyle = "#e69b00";
    ctx.beginPath();
    ctx.arc(bx - 14, by + bh / 2, 13 * cs, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(bx - 14, by + bh / 2, 10 * cs, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e69b00";
    ctx.font = `${Math.round(13 * cs)}px "Lilita One", sans-serif`;
    ctx.fillText("$", bx - 14, by + bh / 2 + 1);
    // chest icon
    const cx = bx + bw + 20,
      cy = by + bh / 2;
    const wob = prog >= 1 ? Math.sin(this.t * 10) * 0.15 : 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wob);
    ctx.fillStyle = "#6b3a17";
    ctx.fillRect(-12, -5, 24, 14);
    ctx.fillStyle = "#8e5a2c";
    ctx.beginPath();
    ctx.ellipse(0, -5, 12, 7, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(-12, -6, 24, 3);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();

    // combo
    if (this.multiplier > 1 && this.mode === "playing") {
      const m = this.multiplier;
      ctx.font = `${20 + m * 2}px "Lilita One", sans-serif`;
      ctx.textAlign = "center";
      const txt = `COMBO x${m}`;
      const wob2 = Math.sin(this.t * 12) * 0.04 * m;
      ctx.save();
      ctx.translate(W / 2, 104);
      ctx.rotate(wob2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(8,40,40,0.8)";
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = ["#fff", "#fff", "#ffe066", "#ffb13d", "#ff7a3d", "#ff3d6e"][m];
      ctx.fillText(txt, 0, 0);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(W / 2 - 40, 118, 80 * Math.max(0, this.comboTimer / 1.7), 3);
    }

    // banner
    if (this.banner > 0) {
      const a = Math.min(1, this.banner * 2.5);
      const intro = Math.min(1, (this.bannerMax - this.banner) * 7);
      const s = intro < 1 ? 0.5 + intro * 0.7 : 1.2 - Math.min(0.2, (this.bannerMax - this.banner - 1 / 7) * 1.5);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, this.H * 0.36);
      ctx.scale(s, s);
      ctx.font = `40px "Lilita One", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(8,40,40,0.85)";
      ctx.strokeText(this.bannerText, 0, 0);
      ctx.fillStyle = "#ffe066";
      ctx.fillText(this.bannerText, 0, 0);
      ctx.restore();
    }

    // controls hint
    if (this.mode === "playing" && this.elapsed < 4) {
      ctx.globalAlpha = Math.min(1, (4 - this.elapsed) * 1.5);
      ctx.font = `18px "Lilita One", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(8,40,40,0.8)";
      const hint = "◀ ▶  or drag to steer";
      ctx.strokeText(hint, W / 2, this.boatY + 70);
      ctx.fillStyle = "#fff";
      ctx.fillText(hint, W / 2, this.boatY + 70);
      ctx.globalAlpha = 1;
    }
  }
}
