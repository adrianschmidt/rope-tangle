import { normAngle } from "./geometry";
import { endPos } from "./order";
import type { Diagram } from "./types";

export type Label = "over" | "under";

function partnerOf(d: Diagram, ropeId: number, crossingId: number): number {
  const c = d.crossings.get(crossingId);
  if (!c) throw new Error(`unknown crossing ${crossingId}`);
  return c.a === ropeId ? c.b : c.a;
}

export function pairSequence(d: Diagram, a: number, b: number, fromEnd: 0 | 1 = 0): Label[] {
  const rope = d.ropes[a];
  if (!rope) throw new Error(`no rope ${a}`);
  const out: Label[] = [];
  const vs = fromEnd === 0 ? rope.vertices : rope.vertices.slice().reverse();
  for (const v of vs) {
    if (v.kind !== "crossing") continue;
    if (partnerOf(d, a, v.crossingId!) !== b) continue;
    out.push(v.overHere ? "over" : "under");
  }
  return out;
}

export function isHooked(d: Diagram, a: number, b: number): boolean {
  if (a === b) return false;
  const seq = pairSequence(d, a, b);
  return seq.includes("over") && seq.includes("under");
}

export function hookedRopes(d: Diagram): Set<number> {
  const out = new Set<number>();
  for (const c of d.crossings.values()) {
    if (c.a === c.b) continue;
    if (isHooked(d, c.a, c.b)) {
      out.add(c.a);
      out.add(c.b);
    }
  }
  return out;
}

export function crossingCount(d: Diagram, ropeId: number): number {
  const rope = d.ropes[ropeId];
  if (!rope) throw new Error(`no rope ${ropeId}`);
  let n = 0;
  for (const v of rope.vertices) {
    if (v.kind === "crossing" && partnerOf(d, ropeId, v.crossingId!) !== ropeId) n++;
  }
  return n;
}

export function alternate(d: Diagram, a: number, b: number): boolean {
  const a0 = endPos(d, { rope: a, end: 0 }).angle, a1 = endPos(d, { rope: a, end: 1 }).angle;
  const span = normAngle(a1 - a0);
  const inside = (x: number) => normAngle(x - a0) < span;
  return inside(endPos(d, { rope: b, end: 0 }).angle) !== inside(endPos(d, { rope: b, end: 1 }).angle);
}

export function checkConsistent(d: Diagram): void {
  const seen = new Map<number, { ropes: number[]; overs: number }>();
  for (const r of d.ropes) {
    for (const v of r.vertices) {
      if (v.kind !== "crossing") continue;
      const id = v.crossingId;
      if (id === undefined || !d.crossings.has(id)) throw new Error(`vertex refers to missing crossing ${id}`);
      let s = seen.get(id);
      if (!s) seen.set(id, (s = { ropes: [], overs: 0 }));
      s.ropes.push(r.id);
      if (v.overHere) s.overs++;
    }
  }
  for (const c of d.crossings.values()) {
    const s = seen.get(c.id);
    if (!s || s.ropes.length !== 2) throw new Error(`crossing ${c.id} has ${s?.ropes.length ?? 0} vertices`);
    const [x, y] = s.ropes;
    if (!((x === c.a && y === c.b) || (x === c.b && y === c.a))) throw new Error(`crossing ${c.id} ropes mismatch`);
    if (s.overs !== 1) throw new Error(`crossing ${c.id} has ${s.overs} over strands`);
    if (c.over !== c.a && c.over !== c.b) throw new Error(`crossing ${c.id} over is neither rope`);
  }
  if (seen.size !== d.crossings.size) throw new Error("vertex/crossing count mismatch");
}
