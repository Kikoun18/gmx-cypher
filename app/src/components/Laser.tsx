import { useEffect, useRef } from 'react';

export const LASER_COLORS = [
  { v: '#ff2a1a', label: 'red' }, { v: '#22e07a', label: 'green' }, { v: '#3d8bff', label: 'blue' },
  { v: '#ffb020', label: 'amber' }, { v: '#ff3dc8', label: 'pink' },
];
const RADIUS = { s: 5, m: 7.5, l: 11 };
const TRAIL_MS = 900;

type Pt = { x: number; y: number; t: number };

/** Catmull-Rom through the raw pointer samples, so a fast stroke stays a curve instead of a polyline. */
function smooth(ps: Pt[]): Pt[] {
  if (ps.length < 3) return ps;
  const out: Pt[] = [];
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
    const n = Math.max(1, Math.min(12, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4)));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), t: p1.t + (p2.t - p1.t) * t });
    }
  }
  out.push(ps[ps.length - 1]);
  return out;
}

/** "k" → "K", " " → "Space"; how a key is written in the UI. */
export const keyLabel = (k: string) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
export const sameKey = (a: string, b: string) => (a.length === 1 ? a.toLowerCase() : a) === (b.length === 1 ? b.toLowerCase() : b);

function rgba(hex: string, a: number) {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

/**
 * Presenter's laser pointer: a glowing dot that follows the mouse with a short
 * fading trail, drawn on a full-screen canvas that never takes clicks. The real
 * cursor hides while it is on.
 */
export function Laser({ on, color, size, trail }: { on: boolean; color: string; size: 's' | 'm' | 'l'; trail: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pos = useRef<{ x: number; y: number } | null>(null);
  const pts = useRef<Pt[]>([]);
  const live = useRef(on);

  // The pointer is tracked even while off, so the dot appears where the mouse already is.
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (!live.current) return;
      // Coalesced events carry the samples between frames: more points, smoother line.
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const now = performance.now();
      for (const c of evs.length ? evs : [e]) {
        const last = pts.current[pts.current.length - 1];
        if (!last || Math.hypot(c.clientX - last.x, c.clientY - last.y) > 1.5) pts.current.push({ x: c.clientX, y: c.clientY, t: now });
      }
    };
    const out = () => { pos.current = null; };
    const root = document.documentElement;
    window.addEventListener('pointermove', mv, { passive: true });
    root.addEventListener('mouseleave', out);
    return () => { window.removeEventListener('pointermove', mv); root.removeEventListener('mouseleave', out); };
  }, []);

  useEffect(() => {
    live.current = on;
    const c = cv.current;
    if (!on || !c) return;
    const ctx = c.getContext('2d')!;
    const root = document.documentElement;
    root.classList.add('laser-on');
    const fit = () => {
      const d = window.devicePixelRatio || 1;
      c.width = Math.round(window.innerWidth * d); c.height = Math.round(window.innerHeight * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
    const r = RADIUS[size];
    let raf = 0;
    const draw = () => {
      const now = performance.now();
      const ps = pts.current = pts.current.filter(p => now - p.t < TRAIL_MS);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      // The trail is one filled, tapering ribbon (no overlapping segments, so no beads),
      // ending at the dot, fading toward its tail.
      const p0 = pos.current;
      const sp = smooth(p0 ? ps.concat({ x: p0.x, y: p0.y, t: now }) : ps);
      if (trail && sp.length > 2) {
        const L: [number, number][] = [], R: [number, number][] = [];
        for (let i = 0; i < sp.length; i++) {
          const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
          let nx = -(b.y - a.y), ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
          const k = Math.max(0, 1 - (now - sp[i].t) / TRAIL_MS);
          const w = r * 0.9 * Math.pow(k, 0.7) * Math.min(1, (i + 1) / 6 + k * 0.5);
          L.push([sp[i].x + nx * w, sp[i].y + ny * w]); R.push([sp[i].x - nx * w, sp[i].y - ny * w]);
        }
        const tail = sp[0], head = sp[sp.length - 1];
        const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.55, rgba(color, 0.32)); g.addColorStop(1, rgba(color, 0.7));
        ctx.save();
        ctx.shadowColor = rgba(color, 0.55); ctx.shadowBlur = r * 1.6;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(L[0][0], L[0][1]);
        for (let i = 1; i < L.length; i++) { const m = [(L[i - 1][0] + L[i][0]) / 2, (L[i - 1][1] + L[i][1]) / 2]; ctx.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]); }
        ctx.lineTo(L[L.length - 1][0], L[L.length - 1][1]);
        ctx.lineTo(R[R.length - 1][0], R[R.length - 1][1]);
        for (let i = R.length - 2; i >= 0; i--) { const m = [(R[i + 1][0] + R[i][0]) / 2, (R[i + 1][1] + R[i][1]) / 2]; ctx.quadraticCurveTo(R[i + 1][0], R[i + 1][1], m[0], m[1]); }
        ctx.lineTo(R[0][0], R[0][1]);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const p = pos.current;
      if (p) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
        g.addColorStop(0, rgba(color, 0.95)); g.addColorStop(0.3, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(color, 1);
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.32, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      root.classList.remove('laser-on');
      pts.current = [];
      ctx.clearRect(0, 0, c.width, c.height);
    };
  }, [on, color, size, trail]);

  return <canvas ref={cv} aria-hidden style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 1000, display: on ? 'block' : 'none' }} />;
}
