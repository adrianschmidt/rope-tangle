import { intersect, normAngle } from "../diagram";
import type { Point } from "../util/point";

export interface LNode {
  x: number;
  y: number;
  fixed: boolean;
}

export interface LRope {
  nodes: number[];
  labels: (boolean | null)[];
}

export interface Layout {
  nodes: LNode[];
  ropes: LRope[];
}

export interface Edge {
  a: number;
  b: number;
}

export function edges(L: Layout): Edge[] {
  const out: Edge[] = [];
  for (const r of L.ropes) for (let i = 0; i + 1 < r.nodes.length; i++) out.push({ a: r.nodes[i]!, b: r.nodes[i + 1]! });
  return out;
}

export function passes(L: Layout): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  for (const r of L.ropes) {
    for (let k = 1; k + 1 < r.nodes.length; k++) {
      if ((r.labels[k] ?? null) === null) continue;
      const n = r.nodes[k]!;
      let list = out.get(n);
      if (!list) out.set(n, (list = []));
      list.push([r.nodes[k - 1]!, r.nodes[k + 1]!]);
    }
  }
  return out;
}

function overlapAtShared(s: Point, p: Point, q: Point): boolean {
  const ux = p.x - s.x, uy = p.y - s.y, vx = q.x - s.x, vy = q.y - s.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < 1e-9 || lv < 1e-9) return true;
  return Math.abs(ux * vy - uy * vx) <= 1e-9 * lu * lv && ux * vx + uy * vy > 0;
}

export function edgePairOk(L: Layout, e: Edge, f: Edge): boolean {
  const N = L.nodes;
  const sharedA = e.a === f.a || e.a === f.b, sharedB = e.b === f.a || e.b === f.b;
  if (sharedA && sharedB) return false;
  if (sharedA || sharedB) {
    const s = sharedA ? e.a : e.b, p = sharedA ? e.b : e.a, q = f.a === s ? f.b : f.a;
    return !overlapAtShared(N[s]!, N[p]!, N[q]!);
  }
  return intersect(N[e.a]!, N[e.b]!, N[f.a]!, N[f.b]!).kind === "none";
}

export function rotationOk(L: Layout, node: number, list: readonly [number, number][]): boolean {
  if (list.length !== 2) return true;
  const c = L.nodes[node]!;
  const ang = (i: number): number => {
    const n = L.nodes[i]!;
    return Math.atan2(n.y - c.y, n.x - c.x);
  };
  const pa = list[0]!, pb = list[1]!;
  const a1 = ang(pa[0]), span = normAngle(ang(pa[1]) - a1);
  const inside = (i: number) => normAngle(ang(i) - a1) < span;
  return inside(pb[0]) !== inside(pb[1]);
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function boxOf(L: Layout, e: Edge): Box {
  const a = L.nodes[e.a]!, b = L.nodes[e.b]!;
  return { x0: Math.min(a.x, b.x) - 1e-9, x1: Math.max(a.x, b.x) + 1e-9, y0: Math.min(a.y, b.y) - 1e-9, y1: Math.max(a.y, b.y) + 1e-9 };
}

export function validLayout(L: Layout): boolean {
  const es = edges(L);
  const boxes = es.map((e) => boxOf(L, e));
  for (let i = 0; i < es.length; i++) {
    const bi = boxes[i]!;
    for (let j = i + 1; j < es.length; j++) {
      const bj = boxes[j]!;
      if (bi.x1 < bj.x0 || bj.x1 < bi.x0 || bi.y1 < bj.y0 || bj.y1 < bi.y0) continue;
      if (!edgePairOk(L, es[i]!, es[j]!)) return false;
    }
  }
  for (const [node, list] of passes(L)) if (!rotationOk(L, node, list)) return false;
  return true;
}
