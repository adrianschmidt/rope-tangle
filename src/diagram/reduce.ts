import { cloneDiagram } from "./create";
import type { Diagram } from "./types";

function findBigon(d: Diagram, orders: number[][]): [number, number] | null {
  for (let r = 0; r < orders.length; r++) {
    const order = orders[r]!;
    for (let i = 0; i + 1 < order.length; i++) {
      const p = d.crossings.get(order[i]!)!, q = d.crossings.get(order[i + 1]!)!;
      if (p.a === p.b || p.over !== q.over) continue;
      const other = p.a === r ? p.b : p.a;
      if (!((q.a === r && q.b === other) || (q.b === r && q.a === other))) continue;
      const o = orders[other]!;
      if (Math.abs(o.indexOf(p.id) - o.indexOf(q.id)) === 1) return [p.id, q.id];
    }
  }
  return null;
}

export function reduce(d: Diagram): Diagram {
  const out = cloneDiagram(d);
  const orders = out.ropes.map((r) => r.vertices.flatMap((v) => (v.kind === "crossing" ? [v.crossingId!] : [])));
  const removed = new Set<number>();
  for (let bigon = findBigon(out, orders); bigon; bigon = findBigon(out, orders)) {
    for (const id of bigon) {
      removed.add(id);
      out.crossings.delete(id);
    }
    for (let r = 0; r < orders.length; r++) orders[r] = orders[r]!.filter((id) => !bigon.includes(id));
  }
  for (const rope of out.ropes) {
    rope.vertices = rope.vertices.filter((v) => !(v.kind === "crossing" && removed.has(v.crossingId!)));
  }
  return out;
}
