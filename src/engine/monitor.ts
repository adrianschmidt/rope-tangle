import type { PhysCrossing, Signature } from "./types";

export interface FlagRecord {
  kind: "flip" | "illegal" | "link";
  step: number;
  pair: number;
  before: PhysCrossing[];
  after: PhysCrossing[];
}

export function legalEdit(O: readonly PhysCrossing[], N: readonly PhysCrossing[], ids: ReadonlySet<number>): boolean {
  const n = O.length, m = N.length, memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (i === n && j === m) return true;
    const key = i * 4096 + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let ok = false;
    if (i < n && j < m && O[i]!.over === N[j]!.over) ok = go(i + 1, j + 1);
    if (!ok && i < n && ids.has(O[i]!.over)) ok = go(i + 1, j);
    if (!ok && j < m && ids.has(N[j]!.over)) ok = go(i, j + 1);
    if (!ok && i + 1 < n && O[i]!.over === O[i + 1]!.over) ok = go(i + 2, j);
    if (!ok && j + 1 < m && N[j]!.over === N[j + 1]!.over) ok = go(i, j + 2);
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

const sum = (arr: readonly PhysCrossing[]) => arr.reduce((t, c) => t + c.sign, 0);
const byB = (arr: readonly PhysCrossing[]) => arr.slice().sort((p, q) => p.ub - q.ub);

export class Monitor {
  count = 0;
  readonly kinds = { flip: 0, illegal: 0, link: 0 };
  readonly log: FlagRecord[] = [];
  private prev: Signature | null = null;

  private flag(kind: FlagRecord["kind"], step: number, pair: number, before: PhysCrossing[], after: PhysCrossing[]): void {
    this.kinds[kind]++;
    this.count++;
    if (this.log.length < 20) this.log.push({ kind, step, pair, before, after });
  }

  observe(sig: Signature, free: ReadonlySet<number>, lastHeld: number, step: number): void {
    const prev = this.prev;
    this.prev = sig;
    if (!prev) return;
    const ids: ReadonlySet<number> = free.size > 0 ? free : new Set([lastHeld]);
    for (const key of new Set([...prev.keys(), ...sig.keys()])) {
      const O = prev.get(key) ?? [], N = sig.get(key) ?? [];
      if (!ids.has(Math.floor(key / 64)) && !ids.has(key % 64) && sum(O) !== sum(N)) this.flag("link", step, key, O, N);
      if (legalEdit(O, N, ids) || legalEdit(byB(O), byB(N), ids)) continue;
      this.flag(O.length === N.length ? "flip" : "illegal", step, key, O, N);
    }
  }
}
