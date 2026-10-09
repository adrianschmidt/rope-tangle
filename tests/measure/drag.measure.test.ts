import { Monitor } from "../../src/engine/monitor";
import { settle } from "../../src/engine/settle";
import { generateBoard } from "../../src/generate/generate";
import { mulberry32 } from "../../src/util/rng";

const BOARDS = Number(import.meta.env["BOARDS"] ?? 4);
const MOVES = 12, FRAMES = 15, PER_FRAME = 3;

describe("drag measurements", () => {
  it("catch-up and pass-throughs on 10-rope boards", () => {
    let moves = 0, catchUp = 0, worst = 0, link = 0, flip = 0, illegal = 0, minD = Infinity, ms = 0, steps = 0;
    for (let b = 1; b <= BOARDS; b++) {
      const E = generateBoard(b * 7919, 10, { monitor: false }).engine, rng = mulberry32(b);
      const m = new Monitor();
      E.attachMonitor(m);
      E.minDist = Infinity;
      for (let k = 0; k < MOVES; k++) {
        const cands = E.ropes.filter((r) => !r.cleared).flatMap((r) => ([0, 1] as const).map((end) => ({ rope: r.id, end })));
        if (cands.length === 0) break;
        const { rope, end } = cands[Math.floor(rng() * cands.length)]!;
        const occ = E.occupied(), free = E.board.holes.map((_, i) => i).filter((i) => !occ.has(i));
        const hole = free[Math.floor(rng() * free.length)]!;
        const A = E.hole(E.rope(rope).ends[end]!), B = E.hole(hole);
        E.grab(rope, end);
        const t0 = performance.now();
        let n = 0, frame = 0;
        for (; n < 2000; frame++) {
          const t = Math.min(1, frame / FRAMES), T = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
          for (let i = 0; i < PER_FRAME; i++, n++) E.substep(T);
          const c = E.endPoint(rope, end);
          if (t === 1 && E.held?.lifted && Math.hypot(T.x - c.x, T.y - c.y) < 1) break;
        }
        ms += performance.now() - t0;
        steps += n;
        catchUp += n;
        worst = Math.max(worst, n);
        moves++;
        E.release([{ x: B.x, y: B.y }], hole);
        settle(E, 800);
      }
      for (const f of m.log) console.log(JSON.stringify({ board: b, kind: f.kind, step: f.step, pair: [Math.floor(f.pair / 64), f.pair % 64], held: E.lastHeld, before: f.before.map((c) => [c.over, c.sign, +c.dz.toFixed(1), Math.round(c.x), Math.round(c.y)]), after: f.after.map((c) => [c.over, c.sign, +c.dz.toFixed(1), Math.round(c.x), Math.round(c.y)]) }));
      link += m.kinds.link;
      flip += m.kinds.flip;
      illegal += m.kinds.illegal;
      minD = Math.min(minD, E.minDist);
    }
    console.log(`boards ${BOARDS} · moves ${moves} · catchUp mean ${(catchUp / moves).toFixed(1)} (lag after finger stops ${(catchUp / moves - FRAMES * PER_FRAME).toFixed(1)}) max ${worst} substeps · link ${link} flip ${flip} illegal ${illegal} · minDist ${minD.toFixed(2)} · ms/substep held ${(ms / steps).toFixed(3)}`);
  }, 600_000);
});
