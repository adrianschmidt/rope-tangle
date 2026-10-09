import { boardForRopes } from "../../src/board";
import { RealizeFailed } from "../../src/realize/errors";
import type { Layout } from "../../src/realize/layout";
import { realize } from "../../src/realize/realize";
import { scrambleWithRetry } from "../../src/scramble/scramble";

const SEEDS = Number(import.meta.env["SEEDS"] ?? 20);

function medianNearestCrossing(L: Layout): number {
  const ids = new Set<number>();
  L.ropes.forEach((r) => r.labels.forEach((l, k) => {
    if (l !== null) ids.add(r.nodes[k]!);
  }));
  const pts = [...ids].map((i) => L.nodes[i]!);
  if (pts.length < 2) return Number.NaN;
  const near = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  near.sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)]!;
}

describe("realize measurements", () => {
  it("agreement per rope count", () => {
    const rows: Record<string, string | number>[] = [];
    for (let n = 4; n <= 10; n++) {
      const board = boardForRopes(n);
      let agree = 0, fitFail = 0, flags = 0, ms = 0, subMs = 0, spread = 0, realized = 0;
      for (let k = 1; k <= SEEDS; k++) {
        const s = scrambleWithRetry(k * 1000, n);
        const t0 = performance.now();
        try {
          const r = realize(s.diagram, board, s.seed, { monitor: true });
          ms += performance.now() - t0;
          realized++;
          if (r.agreement.ok) agree++;
          flags += r.inflationFlags;
          spread += medianNearestCrossing(r.layout);
          const t1 = performance.now();
          for (let i = 0; i < 100; i++) r.engine.substep(null);
          subMs += (performance.now() - t1) / 100;
        } catch (e) {
          if (!(e instanceof RealizeFailed)) throw e;
          fitFail++;
        }
      }
      const per = (v: number) => (realized > 0 ? v / realized : Number.NaN);
      rows.push({
        ropes: n,
        agree: `${agree}/${SEEDS}`,
        fitFail,
        flagsPerBoard: +per(flags).toFixed(2),
        spreadMedian: +per(spread).toFixed(1),
        msPerBoard: Math.round(per(ms)),
        msPerSubstep: +per(subMs).toFixed(3),
      });
    }
    for (const row of rows) console.log(Object.entries(row).map(([k, v]) => `${k} ${v}`).join(" · "));
  }, 3_600_000);
});
