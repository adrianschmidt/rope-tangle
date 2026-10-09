import { cyclicOrder, pairSequence, type Diagram, type Label } from "../diagram";
import type { Engine } from "../engine/engine";
import { pairKey, type Signature } from "../engine/types";

export interface PairComparison {
  a: number;
  b: number;
  diagram: Label[];
  physical: Label[];
  ok: boolean;
}

export interface Agreement {
  ok: boolean;
  orderOk: boolean;
  pairs: PairComparison[];
}

export function reduceLabels(seq: readonly Label[]): Label[] {
  const out: Label[] = [];
  for (const l of seq) {
    if (out[out.length - 1] === l) out.pop();
    else out.push(l);
  }
  return out;
}

export function physicalSequence(sig: Signature, a: number, b: number): Label[] {
  const arr = sig.get(pairKey(a, b)) ?? [];
  const along = a < b ? arr : arr.slice().sort((p, q) => p.ub - q.ub);
  return along.map((c) => (c.over === a ? "over" : "under"));
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
      const diagram = pairSequence(d, a, b), physical = physicalSequence(sig, a, b);
      const rd = reduceLabels(diagram), rp = reduceLabels(physical);
      pairs.push({ a, b, diagram, physical, ok: rd.length === rp.length && rd.every((l, i) => l === rp[i]) });
    }
  }
  const orderOk = endOrderOk(d, E);
  return { ok: orderOk && pairs.every((p) => p.ok), orderOk, pairs };
}
