// From Icona (icona.works, MIT): its particle layer, with one change: the
// constructor parameter property became a field (erasableSyntaxOnly).
export type ParticlePresetId =
  | "confetti"
  | "stars"
  | "sparkle"
  | "dust"
  | "smoke"
  | "flame"
  | "bubbles"
  | "shards"
  | "shockwave"
  | "electric"
  | "attract"
  | "orbit"
  | "hearts"
  | "notes"
  | "zzz"
  | "rain"
  | "splash"
  | "steam"
  | "embers"
  | "leaves"
  | "coins"
  | "ripple"
  | "streaks"
  | "firework"
  | "pixel-confetti"
  | "pixel-smoke"
  | "dust-drift";

/**
 * Tiny canvas particle system for hover effects.
 *
 *  - One `ParticleField` per animated icon stage. The <canvas> is created
 *    lazily on the first burst and removed from the DOM as soon as the last
 *    particle dies - idle icons cost nothing.
 *  - One requestAnimationFrame loop per field, stopped when idle.
 *  - Hard cap on live particles; device-pixel-ratio aware; pixel presets snap
 *    to a square grid so 8-bit particles stay crisp.
 */

const PAD = 64; // canvas overflow around the stage, px
const MAX_PARTICLES = 220;
const TAU = Math.PI * 2;

export const CONFETTI = ["#5bdc67", "#3d7bfa", "#ff6b4a", "#ffc93c", "#b04dff", "#ff4d9e", "#22d3ee"];
const GOLD = ["#ffc93c", "#ffb020", "#ffe08a"];
const FIRE = ["#ffd166", "#ff9f1c", "#ff6b4a", "#e63946"];

type Kind =
  | "rect"
  | "square"
  | "circle"
  | "ring"
  | "spark"
  | "star"
  | "streak"
  | "bolt"
  | "heart"
  | "note"
  | "text"
  | "drop"
  | "leaf"
  | "coin"
  | "bubble";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  /** Exponential velocity damping per second. */
  drag: number;
  age: number;
  life: number;
  /** Seconds before the particle appears. */
  delay: number;
  size: number;
  /** Size multiplier reached at end of life. */
  grow: number;
  rot: number;
  vr: number;
  color: string;
  alpha: number;
  twinkle?: number;
  wobble?: { amp: number; freq: number; phase: number };
  /** Lives until the field is released (orbiters). */
  persist?: boolean;
  orbit?: { cx: number; cy: number; rx: number; ry: number; a: number; va: number };
  target?: { x: number; y: number };
  /** Pixel grid size (px) - position and size snap to it. */
  grid?: number;
  text?: string;
}

export interface SpawnOptions {
  /** Origin in host px. */
  x: number;
  y: number;
  /** px per icon-grid unit. */
  u: number;
  /** Icon colour (resolved currentColor). */
  ink: string;
  angle?: number;
  spread?: number;
  count?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const rad = (deg: number) => (deg * Math.PI) / 180;

function base(kind: Kind, o: SpawnOptions, extra: Partial<Particle>): Particle {
  return {
    kind,
    x: o.x,
    y: o.y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    drag: 0,
    age: 0,
    life: 1,
    delay: 0,
    size: 2 * o.u,
    grow: 1,
    rot: 0,
    vr: 0,
    color: o.ink,
    alpha: 1,
    ...extra,
  };
}

/** Velocity in a cone around `angle` (degrees). */
function aim(o: SpawnOptions, speed: number, fallbackAngle = -90, fallbackSpread = 360): [number, number] {
  const a = rad((o.angle ?? fallbackAngle) + rand(-0.5, 0.5) * (o.spread ?? fallbackSpread));
  return [Math.cos(a) * speed, Math.sin(a) * speed];
}

type Preset = (o: SpawnOptions) => Particle[];

const times = (n: number, make: (i: number) => Particle) => Array.from({ length: n }, (_, i) => make(i));

export const PRESETS: Record<ParticlePresetId, Preset> = {
  confetti: (o) =>
    times(o.count ?? 26, () => {
      const [vx, vy] = aim(o, rand(110, 260) * o.u, -90, 130);
      return base("rect", o, {
        vx,
        vy,
        ay: 520 * o.u,
        drag: 2.2,
        life: rand(0.9, 1.5),
        size: rand(2.4, 3.6) * o.u,
        rot: rand(0, TAU),
        vr: rand(-14, 14),
        color: pick(CONFETTI),
        wobble: { amp: rand(10, 30) * o.u, freq: rand(6, 10), phase: rand(0, TAU) },
      });
    }),

  stars: (o) =>
    times(o.count ?? 10, () => {
      const [vx, vy] = aim(o, rand(60, 150) * o.u);
      return base("star", o, { vx, vy, drag: 3, life: rand(0.6, 0.9), size: rand(2, 3.4) * o.u, vr: rand(-6, 6), grow: 0.2, color: pick(GOLD) });
    }),

  sparkle: (o) =>
    times(o.count ?? 7, (i) => {
      const a = rand(0, TAU);
      const r = rand(9, 15) * o.u;
      return base("spark", o, {
        x: o.x + Math.cos(a) * r,
        y: o.y + Math.sin(a) * r,
        vy: -8 * o.u,
        life: rand(0.55, 0.85),
        delay: i * 0.07,
        size: rand(2, 3.6) * o.u,
        twinkle: 1,
        color: i % 3 === 0 ? pick(GOLD) : o.ink,
      });
    }),

  dust: (o) =>
    times(o.count ?? 6, () => {
      const [vx, vy] = aim(o, rand(18, 50) * o.u, 180, 50);
      return base("circle", o, { vx, vy: vy - 10 * o.u, drag: 3, life: rand(0.45, 0.7), size: rand(1, 1.8) * o.u, grow: 2.4, alpha: 0.35, color: "#9a9ea3" });
    }),

  smoke: (o) =>
    times(o.count ?? 10, () => {
      const [vx, vy] = aim(o, rand(20, 60) * o.u, 90, 140);
      return base("circle", o, { vx, vy, ay: -40 * o.u, drag: 2.5, life: rand(0.7, 1.2), size: rand(1.4, 2.4) * o.u, grow: 2.6, alpha: 0.32, color: "#a6aaaf" });
    }),

  flame: (o) =>
    times(o.count ?? 2, () => {
      const [vx, vy] = aim(o, rand(50, 110) * o.u, 90, 30);
      return base("circle", o, { vx, vy, drag: 4, life: rand(0.18, 0.32), size: rand(1.2, 2) * o.u, grow: 0.2, color: pick(FIRE) });
    }),

  bubbles: (o) =>
    times(o.count ?? 1, () =>
      base("bubble", o, {
        x: o.x + rand(-5, 5) * o.u,
        vy: -rand(14, 26) * o.u,
        life: rand(0.9, 1.5),
        size: rand(0.8, 1.6) * o.u,
        grow: 1.4,
        alpha: 0.8,
        wobble: { amp: 6 * o.u, freq: rand(4, 7), phase: rand(0, TAU) },
      }),
    ),

  shards: (o) =>
    times(o.count ?? 20, () => {
      const [vx, vy] = aim(o, rand(80, 220) * o.u);
      return base(Math.random() > 0.5 ? "rect" : "streak", o, {
        vx,
        vy,
        ay: 260 * o.u,
        drag: 2.6,
        life: rand(0.5, 0.9),
        size: rand(1.6, 2.6) * o.u,
        rot: rand(0, TAU),
        vr: rand(-10, 10),
      });
    }),

  shockwave: (o) => [base("ring", o, { life: 0.45, size: 2 * o.u, grow: 8, alpha: 0.5 })],

  electric: (o) =>
    times(o.count ?? 3, () => {
      const a = rand(0, TAU);
      return base("bolt", o, {
        x: o.x + Math.cos(a) * 5 * o.u,
        y: o.y + Math.sin(a) * 5 * o.u,
        rot: a,
        life: rand(0.12, 0.24),
        size: rand(5, 8) * o.u,
        color: Math.random() > 0.4 ? "#ffc93c" : o.ink,
      });
    }),

  attract: (o) =>
    times(o.count ?? 2, () => {
      const a = rand(0, TAU);
      const r = rand(18, 26) * o.u;
      return base("circle", o, {
        x: o.x + Math.cos(a) * r,
        y: o.y + Math.sin(a) * r,
        target: { x: o.x, y: o.y },
        life: 1.2,
        size: rand(0.7, 1.2) * o.u,
        alpha: 0.9,
      });
    }),

  orbit: (o) =>
    times(o.count ?? 3, (i) =>
      base("circle", o, {
        persist: true,
        life: 0.35,
        size: (i === 0 ? 1.4 : 1) * o.u,
        orbit: { cx: o.x, cy: o.y, rx: (13 + i * 2) * o.u, ry: (5 + i) * o.u, a: (i * TAU) / 3, va: 3.2 - i * 0.6 },
        color: i === 0 ? "#3d7bfa" : o.ink,
      }),
    ),

  hearts: (o) =>
    times(o.count ?? 1, () =>
      base("heart", o, {
        x: o.x + rand(-4, 4) * o.u,
        vy: -rand(22, 36) * o.u,
        life: rand(0.9, 1.3),
        size: rand(2.2, 3.2) * o.u,
        grow: 1.3,
        color: pick(["#ff4d6d", "#ff7096", "#ff2e63"]),
        wobble: { amp: 8 * o.u, freq: rand(3, 5), phase: rand(0, TAU) },
      }),
    ),

  notes: (o) =>
    times(o.count ?? 1, () =>
      base("note", o, {
        vx: rand(6, 16) * o.u,
        vy: -rand(18, 28) * o.u,
        life: rand(1, 1.4),
        size: rand(2.6, 3.4) * o.u,
        rot: rand(-0.3, 0.3),
        wobble: { amp: 5 * o.u, freq: 4, phase: rand(0, TAU) },
      }),
    ),

  zzz: (o) =>
    times(o.count ?? 1, () =>
      base("text", o, { text: "z", vx: 8 * o.u, vy: -16 * o.u, life: 1.5, size: 3.4 * o.u, grow: 1.8, wobble: { amp: 4 * o.u, freq: 3, phase: rand(0, TAU) } }),
    ),

  rain: (o) =>
    times(o.count ?? 2, () =>
      base("drop", o, { x: o.x + rand(-6, 6) * o.u, vy: rand(90, 130) * o.u, ay: 200 * o.u, life: rand(0.25, 0.4), size: 2.2 * o.u, color: "#3d7bfa", alpha: 0.85 }),
    ),

  splash: (o) =>
    times(o.count ?? 10, () => {
      const [vx, vy] = aim(o, rand(50, 120) * o.u, -90, 150);
      return base("circle", o, { vx, vy, ay: 420 * o.u, life: rand(0.4, 0.65), size: rand(0.6, 1.1) * o.u, color: "#3d7bfa" });
    }),

  steam: (o) =>
    times(o.count ?? 1, () =>
      base("circle", o, {
        x: o.x + rand(-3, 3) * o.u,
        vy: -rand(12, 20) * o.u,
        life: rand(1, 1.5),
        size: rand(1, 1.6) * o.u,
        grow: 2.6,
        alpha: 0.28,
        color: "#a6aaaf",
        wobble: { amp: 5 * o.u, freq: 3, phase: rand(0, TAU) },
      }),
    ),

  embers: (o) =>
    times(o.count ?? 1, () =>
      base("circle", o, {
        x: o.x + rand(-4, 4) * o.u,
        vy: -rand(26, 48) * o.u,
        life: rand(0.5, 0.9),
        size: rand(0.5, 0.9) * o.u,
        twinkle: 1,
        color: pick(FIRE),
        wobble: { amp: 6 * o.u, freq: rand(5, 9), phase: rand(0, TAU) },
      }),
    ),

  leaves: (o) =>
    times(o.count ?? 5, (i) =>
      base("leaf", o, {
        x: o.x + rand(-8, 8) * o.u,
        y: o.y + rand(-6, 0) * o.u,
        vy: rand(14, 24) * o.u,
        delay: i * 0.08,
        life: rand(1.1, 1.6),
        size: rand(2, 2.8) * o.u,
        rot: rand(0, TAU),
        vr: rand(-3, 3),
        color: pick(["#5bdc67", "#3fb950", "#a3d977"]),
        wobble: { amp: 18 * o.u, freq: rand(2.5, 4), phase: rand(0, TAU) },
      }),
    ),

  coins: (o) =>
    times(o.count ?? 7, (i) => {
      const [vx, vy] = aim(o, rand(110, 170) * o.u, -90, 70);
      return base("coin", o, { vx, vy, ay: 480 * o.u, delay: i * 0.04, life: rand(0.7, 0.95), size: 1.8 * o.u, vr: rand(10, 16) });
    }),

  ripple: (o) => [base("ring", o, { life: 0.9, size: 5 * o.u, grow: 3.4, alpha: 0.45 })],

  streaks: (o) =>
    times(o.count ?? 4, (i) => {
      const [vx, vy] = aim(o, rand(60, 110) * o.u, 180, 10);
      return base("streak", o, { y: o.y + (i - 1.5) * 3 * o.u, vx, vy, drag: 4, life: 0.35, size: rand(3, 5) * o.u, alpha: 0.6 });
    }),

  firework: (o) =>
    times(o.count ?? 18, (i) => {
      const a = (i / (o.count ?? 18)) * TAU;
      const s = rand(80, 120) * o.u;
      return base("streak", o, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        ay: 140 * o.u,
        drag: 2.4,
        life: rand(0.6, 0.85),
        size: 2.4 * o.u,
        color: pick(CONFETTI),
      });
    }),

  "pixel-confetti": (o) =>
    times(o.count ?? 24, () => {
      const [vx, vy] = aim(o, rand(110, 240) * o.u, -90, 140);
      return base("square", o, { vx, vy, ay: 560 * o.u, drag: 1.8, life: rand(0.8, 1.3), size: 2 * o.u, grid: 2 * o.u, color: pick(CONFETTI) });
    }),

  "pixel-smoke": (o) =>
    times(o.count ?? 8, () => {
      const [vx, vy] = aim(o, rand(20, 60) * o.u, 90, 160);
      return base("square", o, { vx, vy, ay: -30 * o.u, drag: 2.5, life: rand(0.5, 0.9), size: 2 * o.u, grid: 2 * o.u, alpha: 0.5, color: "#9a9ea3" });
    }),

  "dust-drift": (o) =>
    times(o.count ?? 2, () =>
      base("square", o, {
        y: o.y + rand(-8, 8) * o.u,
        vx: rand(20, 50) * o.u,
        vy: -rand(5, 25) * o.u,
        drag: 0.8,
        life: rand(0.5, 0.9),
        size: rand(0.8, 1.4) * o.u,
        grow: 0.3,
      }),
    ),
};

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

function drawShape(ctx: CanvasRenderingContext2D, p: Particle, size: number) {
  switch (p.kind) {
    case "rect":
      ctx.fillRect(-size / 2, -size * 0.28, size, size * 0.56);
      break;
    case "square":
      ctx.fillRect(0, 0, size, size);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, TAU);
      ctx.fill();
      break;
    case "bubble":
      ctx.lineWidth = Math.max(1, size * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-size * 0.35, -size * 0.35, size * 0.22, 0, TAU);
      ctx.fill();
      break;
    case "ring":
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.stroke();
      break;
    case "spark": {
      const s = size / 2;
      const w = s * 0.28;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(w, -w, s, 0);
      ctx.quadraticCurveTo(w, w, 0, s);
      ctx.quadraticCurveTo(-w, w, -s, 0);
      ctx.quadraticCurveTo(-w, -w, 0, -s);
      ctx.fill();
      break;
    }
    case "star": {
      const R = size / 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? R * 0.45 : R;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "streak": {
      ctx.lineWidth = Math.max(1, size * 0.3);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-size / 2, 0);
      ctx.lineTo(size / 2, 0);
      ctx.stroke();
      break;
    }
    case "drop":
      ctx.lineWidth = Math.max(1, size * 0.4);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(0, 0);
      ctx.stroke();
      break;
    case "bolt": {
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const steps = 4;
      for (let i = 1; i <= steps; i++) ctx.lineTo((size * i) / steps, (Math.random() - 0.5) * size * 0.45);
      ctx.stroke();
      break;
    }
    case "heart": {
      const s = size / 2;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.2, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.6, -s * 1.2, s * 1.4, -s * 0.1, 0, s * 0.9);
      ctx.fill();
      break;
    }
    case "note": {
      const s = size / 2;
      ctx.beginPath();
      ctx.ellipse(-s * 0.3, s * 0.6, s * 0.42, s * 0.32, -0.4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.22);
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.55);
      ctx.lineTo(s * 0.08, -s * 0.9);
      ctx.quadraticCurveTo(s * 0.6, -s * 0.5, s * 0.75, -s * 0.1);
      ctx.stroke();
      break;
    }
    case "text":
      ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text ?? "", 0, 0);
      break;
    case "leaf": {
      ctx.beginPath();
      ctx.ellipse(0, 0, size / 2, size / 4.5, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case "coin": {
      ctx.save();
      ctx.scale(Math.max(0.15, Math.abs(Math.cos(p.rot))), 1);
      ctx.fillStyle = "#ffc93c";
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                  */
/* -------------------------------------------------------------------------- */

interface Emitter {
  id: number;
  preset: ParticlePresetId;
  rate: number;
  carry: number;
  until: number;
  origin: (t: number) => SpawnOptions;
  started: number;
}

/**
 * Particle state, physics and drawing - no DOM, no timers. `ParticleField`
 * drives it from requestAnimationFrame; the exporter drives it with fixed time
 * steps to record GIF / APNG frames.
 */
export class ParticleSim {
  private particles: Particle[] = [];
  private emitters: Emitter[] = [];
  private now = 0;
  private nextId = 1;

  /** True while anything is alive or still emitting. */
  get active() {
    return this.particles.length > 0 || this.emitters.length > 0;
  }

  /** Spawn a one-shot burst. */
  burst(preset: ParticlePresetId, o: SpawnOptions) {
    const room = MAX_PARTICLES - this.particles.length;
    if (room <= 0) return;
    this.particles.push(...PRESETS[preset](o).slice(0, room));
  }

  /** Continuous emission; returns an id for `stop`. `origin(t)` gets seconds since start. */
  emit(preset: ParticlePresetId, rate: number, origin: (t: number) => SpawnOptions, duration = Infinity): number {
    const id = this.nextId++;
    this.emitters.push({ id, preset, rate, carry: 1, until: duration, origin, started: -1 });
    return id;
  }

  stop(id: number) {
    this.emitters = this.emitters.filter((e) => e.id !== id);
  }

  /** Stop all emitters and let persistent particles (orbiters) fade out. */
  release() {
    this.emitters = [];
    for (const p of this.particles) {
      if (p.persist) {
        p.persist = false;
        p.age = 0;
      }
    }
  }

  /** Remove everything immediately. */
  clear() {
    this.emitters = [];
    this.particles = [];
  }

  /** Advance the simulation by `dt` seconds. */
  advance(dt: number) {
    this.now += dt;

    for (const e of this.emitters) {
      if (e.started < 0) e.started = this.now;
      const t = this.now - e.started;
      e.carry += e.rate * dt;
      while (e.carry >= 1 && this.particles.length < MAX_PARTICLES) {
        e.carry -= 1;
        this.particles.push(...PRESETS[e.preset](e.origin(t)));
      }
    }
    this.emitters = this.emitters.filter((e) => this.now - e.started < e.until);

    this.particles = this.particles.filter((p) => this.step(p, dt));
  }

  private step(p: Particle, dt: number): boolean {
    if (p.delay > 0) {
      p.delay -= dt;
      return true;
    }
    p.age += dt;
    if (!p.persist && p.age >= p.life) return false;

    if (p.orbit) {
      p.orbit.a += p.orbit.va * dt;
      p.x = p.orbit.cx + Math.cos(p.orbit.a) * p.orbit.rx;
      p.y = p.orbit.cy + Math.sin(p.orbit.a) * p.orbit.ry;
      return true;
    }
    if (p.target) {
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) return false;
      const pull = 900 / Math.max(d, 8);
      p.vx += (dx / d) * pull * 60 * dt;
      p.vy += (dy / d) * pull * 60 * dt;
      p.vx *= Math.exp(-3 * dt);
      p.vy *= Math.exp(-3 * dt);
    }
    p.vx += p.ax * dt;
    p.vy += p.ay * dt;
    if (p.drag) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    return true;
  }

  /** Clear the canvas and draw every live particle. Host-px coordinates start `pad` px inside the canvas. */
  draw(ctx: CanvasRenderingContext2D, scale = 1, pad = PAD) {
    const canvas = ctx.canvas;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pad, pad);

    for (const p of this.particles) {
      if (p.delay > 0) continue;
      const k = p.persist ? 0 : Math.min(1, p.age / p.life);
      // Fade in quickly, out over the last 40% of life (persistent orbiters fade only when released).
      let alpha = p.alpha * Math.min(1, p.age / 0.06) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      if (p.twinkle) alpha *= 0.55 + 0.45 * Math.sin(p.age * 28);
      if (alpha <= 0.01) continue;
      let size = p.size * (1 + (p.grow - 1) * k);
      if (p.kind === "spark") size *= Math.sin(Math.min(1, k) * Math.PI);

      let x = p.x;
      let y = p.y;
      if (p.wobble) x += Math.sin(p.age * p.wobble.freq + p.wobble.phase) * p.wobble.amp * Math.min(1, p.age * 2) * 0.15;
      if (p.grid) {
        x = Math.round(x / p.grid) * p.grid;
        y = Math.round(y / p.grid) * p.grid;
        size = p.grid;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.translate(x, y);
      if (p.kind === "streak") ctx.rotate(Math.atan2(p.vy, p.vx) || p.rot);
      else if (p.kind === "bolt") ctx.rotate(p.rot);
      else if (p.kind !== "square" && p.kind !== "coin") ctx.rotate(p.rot);
      drawShape(ctx, p, size);
      ctx.restore();
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

export class ParticleField {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly sim = new ParticleSim();
  private raf = 0;
  private last = 0;
  private dpr = 1;

  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Spawn a one-shot burst. */
  burst(preset: ParticlePresetId, o: SpawnOptions) {
    this.sim.burst(preset, o);
    if (this.sim.active) this.start();
  }

  /** Continuous emission; returns an id for `stop`. `origin(t)` gets seconds since start. */
  emit(preset: ParticlePresetId, rate: number, origin: (t: number) => SpawnOptions, duration = Infinity): number {
    const id = this.sim.emit(preset, rate, origin, duration);
    this.start();
    return id;
  }

  stop(id: number) {
    this.sim.stop(id);
  }

  /** Stop all emitters and let persistent particles (orbiters) fade out. */
  release() {
    this.sim.release();
  }

  /** Remove everything immediately (unmount). */
  destroy() {
    this.sim.clear();
    this.teardown();
  }

  private start() {
    if (!this.canvas) this.mount();
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private mount() {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const { width, height } = this.host.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round((width + PAD * 2) * this.dpr);
    canvas.height = Math.round((height + PAD * 2) * this.dpr);
    Object.assign(canvas.style, {
      position: "absolute",
      left: `${-PAD}px`,
      top: `${-PAD}px`,
      width: `${width + PAD * 2}px`,
      height: `${height + PAD * 2}px`,
      pointerEvents: "none",
      zIndex: "30",
    });
    this.host.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  private teardown() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }

  private tick = (time: number) => {
    const dt = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;
    this.sim.advance(dt);
    if (this.ctx) this.sim.draw(this.ctx, this.dpr);

    if (!this.sim.active) {
      this.teardown();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}

/* -------------------------------------------------------------------------- */
/* Scripts - particle cues as plain data (used by exported components)         */
/* -------------------------------------------------------------------------- */

/** A one-shot burst. Coordinates are on the 24px icon grid; `follow` emits from the icon's moved position. */
export interface BurstCue {
  at: number;
  preset: ParticlePresetId;
  x?: number;
  y?: number;
  angle?: number;
  spread?: number;
  count?: number;
  follow?: boolean;
}

/** A continuous emitter. `path` is the sampled origin (grid units) over `duration`. */
export interface EmitCue {
  at: number;
  preset: ParticlePresetId;
  rate: number;
  x?: number;
  y?: number;
  angle?: number;
  spread?: number;
  duration?: number;
  follow?: boolean;
  path?: [number, number][];
}

export interface ParticleScript {
  bursts: BurstCue[];
  emitters: EmitCue[];
}

const along = (path: [number, number][], p: number): [number, number] => {
  const f = Math.max(0, Math.min(1, p)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const k = f - i;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i + 1][1] + (path[i + 1][1] - path[i][1]) * k];
};

export interface PlayOptions {
  /** Rendered icon size in px (the host box is `size` × `size`). */
  size: number;
  /** Particle colour for "ink" particles. */
  ink: string;
  /** Playback speed multiplier. */
  speed?: number;
  /** Element whose on-screen position `follow` cues track (the moving icon layer). */
  follow?: Element | null;
}

/**
 * Play a particle script on a `ParticleField` attached to `host` (a positioned
 * box the size of the icon). Returns a stop function that cancels pending cues
 * and lets live particles fade out.
 */
export function playParticleScript(field: ParticleField, host: HTMLElement, script: ParticleScript, { size, ink, speed = 1, follow }: PlayOptions): () => void {
  const u = size / 24;
  const timers: number[] = [];
  const ids: number[] = [];
  const origin = (gx: number, gy: number, moved?: boolean) => {
    let x = gx * u;
    let y = gy * u;
    if (moved && follow) {
      const h = host.getBoundingClientRect();
      const r = follow.getBoundingClientRect();
      x += r.left + r.width / 2 - (h.left + h.width / 2);
      y += r.top + r.height / 2 - (h.top + h.height / 2);
    }
    return { x, y };
  };

  for (const c of script.bursts) {
    timers.push(
      window.setTimeout(() => field.burst(c.preset, { ...origin(c.x ?? 12, c.y ?? 12, c.follow), u, ink, angle: c.angle, spread: c.spread, count: c.count }), (c.at / speed) * 1000),
    );
  }
  for (const e of script.emitters) {
    const duration = e.duration === undefined ? undefined : e.duration / speed;
    timers.push(
      window.setTimeout(() => {
        ids.push(
          field.emit(
            e.preset,
            e.rate * speed,
            (t) => {
              const [gx, gy] = e.path ? along(e.path, t / (duration ?? 1)) : [e.x ?? 12, e.y ?? 12];
              return { ...origin(gx, gy, e.follow), u, ink, angle: e.angle, spread: e.spread };
            },
            duration,
          ),
        );
      }, (e.at / speed) * 1000),
    );
  }

  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    ids.forEach((id) => field.stop(id));
    field.release();
  };
}
