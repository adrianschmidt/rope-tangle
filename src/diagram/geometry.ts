export interface Point {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
const EPS = 1e-9;

export function normAngle(a: number): number {
  const r = a % TAU;
  const n = (r < 0 ? r + TAU : r) + 0;
  return n >= TAU ? 0 : n;
}

export function circlePoint(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export type IntersectResult =
  | { kind: "none" }
  | { kind: "degenerate" }
  | { kind: "hit"; t: number; u: number; x: number; y: number };

export function intersect(p1: Point, p2: Point, p3: Point, p4: Point): IntersectResult {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const ex = p3.x - p1.x, ey = p3.y - p1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < EPS) {
    if (Math.abs(ex * d1y - ey * d1x) > EPS) return { kind: "none" };
    const l2 = d1x * d1x + d1y * d1y;
    const s3 = (ex * d1x + ey * d1y) / l2;
    const s4 = ((p4.x - p1.x) * d1x + (p4.y - p1.y) * d1y) / l2;
    const lo = Math.min(s3, s4), hi = Math.max(s3, s4);
    return hi < -EPS || lo > 1 + EPS ? { kind: "none" } : { kind: "degenerate" };
  }
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return { kind: "none" };
  if (t < EPS || t > 1 - EPS || u < EPS || u > 1 - EPS) return { kind: "degenerate" };
  return { kind: "hit", t, u, x: p1.x + d1x * t, y: p1.y + d1y * t };
}
