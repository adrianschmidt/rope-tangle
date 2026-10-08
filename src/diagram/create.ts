import { TAU, circlePoint } from "./geometry";
import type { Diagram, EndPos, RopeD } from "./types";

export function createDiagram(ropeCount: number): Diagram {
  if (ropeCount < 1) throw new Error("createDiagram: need at least one rope");
  const ropes: RopeD[] = [];
  const ends: EndPos[] = [];
  const step = TAU / (2 * ropeCount);
  for (let i = 0; i < ropeCount; i++) {
    const a0 = 2 * i * step, a1 = (2 * i + 1) * step;
    const p0 = circlePoint(a0), p1 = circlePoint(a1);
    ropes.push({ id: i, vertices: [{ x: p0.x, y: p0.y, kind: "end" }, { x: p1.x, y: p1.y, kind: "end" }] });
    ends.push({ rope: i, end: 0, angle: a0 }, { rope: i, end: 1, angle: a1 });
  }
  return { ropes, crossings: new Map(), ends, nextCrossingId: 1 };
}

export function cloneDiagram(d: Diagram): Diagram {
  return {
    ropes: d.ropes.map((r) => ({ id: r.id, vertices: r.vertices.map((v) => ({ ...v })) })),
    crossings: new Map([...d.crossings].map(([id, c]) => [id, { ...c }])),
    ends: d.ends.map((e) => ({ ...e })),
    nextCrossingId: d.nextCrossingId,
  };
}
