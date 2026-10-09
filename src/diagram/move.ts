import { cloneDiagram } from "./create";
import { circlePoint, intersect, normAngle, TAU, type Point } from "./geometry";
import { endPos, gapMidpoint } from "./order";
import { DiagramDegenerate, type Crossing, type Diagram, type Gap, type Vertex } from "./types";

const NUDGE = 1e-3;

interface Hit {
  ropeId: number;
  segIndex: number;
  t: number;
  u: number;
  x: number;
  y: number;
}

function oriented(d: Diagram, ropeId: number, end: 0 | 1): Vertex[] {
  const rope = d.ropes[ropeId];
  if (!rope) throw new Error(`no rope ${ropeId}`);
  return end === 1 ? rope.vertices.slice() : rope.vertices.slice().reverse();
}

function holdDownIndex(d: Diagram, verts: Vertex[]): number {
  for (let i = verts.length - 1; i > 0; i--) {
    const v = verts[i]!;
    if (v.kind !== "crossing" || v.overHere) continue;
    const c = d.crossings.get(v.crossingId!)!;
    if (c.a === c.b) {
      const j = verts.findIndex((w, k) => k !== i && w.kind === "crossing" && w.crossingId === v.crossingId);
      if (j > i) continue;
    }
    return i;
  }
  return 0;
}

export function liftedStretch(d: Diagram, ropeId: number, end: 0 | 1): number[] {
  const verts = oriented(d, ropeId, end);
  const h = holdDownIndex(d, verts);
  const ids: number[] = [];
  for (let i = h + 1; i < verts.length; i++) {
    const v = verts[i]!;
    if (v.kind === "crossing" && !ids.includes(v.crossingId!)) ids.push(v.crossingId!);
  }
  return ids;
}

function restore(d: Diagram, snap: Diagram): void {
  d.ropes = snap.ropes;
  d.crossings = snap.crossings;
  d.ends = snap.ends;
  d.nextCrossingId = snap.nextCrossingId;
}

export function moveEnd(d: Diagram, ropeId: number, end: 0 | 1, gap: Gap): void {
  const mid = gapMidpoint(d, gap);
  let span = normAngle(endPos(d, gap.before).angle - endPos(d, gap.after).angle);
  if (span === 0) span = TAU;
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (const k of offsets) {
    const snap = cloneDiagram(d);
    try {
      applyMove(d, ropeId, end, normAngle(mid + k * NUDGE * span));
      return;
    } catch (e) {
      restore(d, snap);
      if (!(e instanceof DiagramDegenerate)) throw e;
    }
  }
  throw new DiagramDegenerate(`moveEnd: rope ${ropeId} end ${end} cannot be placed`);
}

function applyMove(d: Diagram, ropeId: number, end: 0 | 1, angle: number): void {
  const verts = oriented(d, ropeId, end);
  const h = holdDownIndex(d, verts);
  const lifted = new Set<number>();
  for (let i = h + 1; i < verts.length; i++) {
    const v = verts[i]!;
    if (v.kind === "crossing") lifted.add(v.crossingId!);
  }
  const X = verts[h]!;
  const next = verts[h + 1]!;
  if (h > 0 && Math.hypot(next.x - X.x, next.y - X.y) < 1e-12) throw new DiagramDegenerate("zero-length stub");

  for (const id of lifted) d.crossings.delete(id);
  const strip = (vs: Vertex[]) => vs.filter((v) => !(v.kind === "crossing" && lifted.has(v.crossingId!)));
  for (const o of d.ropes) if (o.id !== ropeId) o.vertices = strip(o.vertices);
  const retained = strip(verts.slice(0, h + 1));

  const P = circlePoint(angle);
  const stub: Vertex | null = h > 0 ? { x: (X.x + next.x) / 2, y: (X.y + next.y) / 2, kind: "fold" } : null;
  const start: Point = stub ?? X;

  const hits: Hit[] = [];
  for (const o of d.ropes) {
    const vs = o.id === ropeId ? retained : o.vertices;
    for (let k = 0; k + 1 < vs.length; k++) {
      const r = intersect(start, P, vs[k]!, vs[k + 1]!);
      if (r.kind === "degenerate") throw new DiagramDegenerate("segment touches a vertex");
      if (r.kind === "hit") hits.push({ ropeId: o.id, segIndex: k, t: r.t, u: r.u, x: r.x, y: r.y });
    }
  }
  hits.sort((p, q) => p.t - q.t);

  const alongNew: Vertex[] = [];
  const byRope = new Map<number, { hit: Hit; id: number }[]>();
  for (const hit of hits) {
    const id = d.nextCrossingId++;
    const c: Crossing = { id, a: ropeId, b: hit.ropeId, over: ropeId };
    d.crossings.set(id, c);
    alongNew.push({ x: hit.x, y: hit.y, kind: "crossing", crossingId: id, overHere: true });
    let list = byRope.get(hit.ropeId);
    if (!list) byRope.set(hit.ropeId, (list = []));
    list.push({ hit, id });
  }

  const insertInto = (vs: Vertex[], list: { hit: Hit; id: number }[]) => {
    const bySeg = new Map<number, { hit: Hit; id: number }[]>();
    for (const e of list) {
      let l = bySeg.get(e.hit.segIndex);
      if (!l) bySeg.set(e.hit.segIndex, (l = []));
      l.push(e);
    }
    const segs = [...bySeg.keys()].sort((p, q) => q - p);
    for (const seg of segs) {
      const l = bySeg.get(seg)!.sort((p, q) => p.hit.u - q.hit.u);
      vs.splice(seg + 1, 0, ...l.map((e) => ({ x: e.hit.x, y: e.hit.y, kind: "crossing" as const, crossingId: e.id, overHere: false })));
    }
  };
  for (const [oid, list] of byRope) {
    if (oid === ropeId) insertInto(retained, list);
    else insertInto(d.ropes[oid]!.vertices, list);
  }

  const final = retained.concat(stub ? [stub] : [], alongNew, [{ x: P.x, y: P.y, kind: "end" }]);
  d.ropes[ropeId]!.vertices = end === 1 ? final : final.reverse();
  const e = endPos(d, { rope: ropeId, end });
  e.angle = angle;
}
