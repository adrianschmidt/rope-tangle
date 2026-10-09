import { cyclicOrder, linking, pairSequence, type Diagram, type Label } from "../diagram";
import type { Engine } from "../engine/engine";
import { pairKey, type Signature } from "../engine/types";

export interface PairComparison {
  a: number;
  b: number;
  diagram: Label[];
  physical: Label[];
  linkDiagram: number;
  linkPhysical: number;
  ok: boolean;
}

export interface Agreement {
  ok: boolean;
  orderOk: boolean;
  pairs: PairComparison[];
}

export function physicalSequence(sig: Signature, a: number, b: number): Label[] {
  const arr = sig.get(pairKey(a, b)) ?? [];
  const along = a < b ? arr : arr.slice().sort((p, q) => p.ub - q.ub);
  return along.map((c) => (c.over === a ? "over" : "under"));
}

export function physicalLinking(sig: Signature, a: number, b: number): number {
  let sum = 0;
  for (const c of sig.get(pairKey(a, b)) ?? []) sum += c.sign;
  return sum;
}

function endOrderOk(d: Diagram, E: Engine): boolean {
  const diag = cyclicOrder(d).map((e) => e.rope * 2 + e.end);
  const phys: { key: number; rim: number }[] = [];
  for (const r of E.ropes) {
    for (const end of [0, 1] as const) {
      const h = r.ends[end];
      if (h === null) return false;
      phys.push({ key: r.id * 2 + end, rim: E.hole(h).rim });
    }
  }
  const keys = phys.sort((p, q) => p.rim - q.rim).map((p) => p.key);
  const start = keys.indexOf(diag[0]!);
  return start >= 0 && diag.every((k, i) => keys[(start + i) % keys.length] === k);
}

export function compare(d: Diagram, E: Engine): Agreement {
  const sig = E.signature();
  const pairs: PairComparison[] = [];
  for (let a = 0; a < d.ropes.length; a++) {
    for (let b = a + 1; b < d.ropes.length; b++) {
      const linkDiagram = linking(d, a, b), linkPhysical = physicalLinking(sig, a, b);
      pairs.push({
        a,
        b,
        diagram: pairSequence(d, a, b),
        physical: physicalSequence(sig, a, b),
        linkDiagram,
        linkPhysical,
        ok: linkDiagram === linkPhysical,
      });
    }
  }
  const orderOk = endOrderOk(d, E);
  return { ok: orderOk && pairs.every((p) => p.ok), orderOk, pairs };
}
