import type { Engine } from "../../src/engine/engine";
import { Monitor, type FlagRecord } from "../../src/engine/monitor";
import { settle } from "../../src/engine/settle";
import type { Point } from "../../src/util/point";
import { generateBoard } from "../../src/generate/generate";
import { mulberry32 } from "../../src/util/rng";

const BOARDS = Number(import.meta.env["BOARDS"] ?? 4);
const MOVES = 12, PER_FRAME = 3;

type Path = (A: Point, B: Point, frame: number) => { T: Point; done: boolean };

const lerp = (A: Point, B: Point, t: number): Point => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });

const steady: Path = (A, B, f) => ({ T: lerp(A, B, Math.min(1, f / 15)), done: f >= 15 });

const swipe: Path = (A, B, f) => {
  const mid = { x: (A.x + B.x) / 2 + (B.y - A.y) / 3, y: (A.y + B.y) / 2 - (B.x - A.x) / 3 };
  if (f < 3) return { T: lerp(A, B, f / 3), done: false };
  if (f < 6) return { T: lerp(B, mid, (f - 3) / 3), done: false };
  return { T: lerp(mid, B, Math.min(1, (f - 6) / 3)), done: f >= 9 };
};

function swaps(log: readonly FlagRecord[]): number {
  let n = 0;
  for (const f of log) {
    for (const c of f.after) {
      const o = f.before.find((b) => Math.hypot(b.x - c.x, b.y - c.y) < 4 && Math.abs(b.dz) > 16);
      if (o && Math.abs(c.dz) > 16 && o.over !== c.over) n++;
    }
  }
  return n;
}

function run(name: string, path: Path, offset: number): void {
  let moves = 0, lag = 0, worst = 0, link = 0, flip = 0, illegal = 0, swapped = 0, minD = Infinity;
  for (let b = 1; b <= BOARDS; b++) {
    const E: Engine = generateBoard(b * 7919, 10, { monitor: false }).engine, rng = mulberry32(b);
    E.minDist = Infinity;
    for (let k = 0; k < MOVES; k++) {
      const cands = E.ropes.filter((r) => !r.cleared).flatMap((r) => ([0, 1] as const).map((end) => ({ rope: r.id, end })));
      if (cands.length === 0) break;
      const { rope, end } = cands[Math.floor(rng() * cands.length)]!;
      const occ = E.occupied(), free = E.board.holes.map((_, i) => i).filter((i) => !occ.has(i));
      const hole = free[Math.floor(rng() * free.length)]!;
      const A = E.hole(E.rope(rope).ends[end]!), H = E.hole(hole);
      const B = { x: H.x + (E.board.width / 2 - H.x) * offset, y: H.y + (E.board.height / 2 - H.y) * offset };
      const m = new Monitor();
      E.grab(rope, end);
      E.attachMonitor(m);
      let n = 0, stopped = 0;
      for (let frame = 0; n < 3000; frame++) {
        const { T, done } = path(A, B, frame);
        if (done && stopped === 0) stopped = n;
        for (let i = 0; i < PER_FRAME; i++, n++) E.substep(T);
        const c = E.endPoint(rope, end);
        if (done && E.held?.lifted && Math.hypot(T.x - c.x, T.y - c.y) < 1) break;
      }
      lag += n - stopped;
      worst = Math.max(worst, n - stopped);
      moves++;
      E.release([B, { x: H.x, y: H.y }], hole);
      settle(E, 800);
      link += m.kinds.link;
      flip += m.kinds.flip;
      illegal += m.kinds.illegal;
      swapped += swaps(m.log);
      E.attachMonitor(null);
    }
    minD = Math.min(minD, E.minDist);
  }
  console.log(`${name} · boards ${BOARDS} · moves ${moves} · lag after finger stops mean ${(lag / moves).toFixed(1)} max ${worst} substeps · link ${link} flip ${flip} illegal ${illegal} · over/under swaps ${swapped} · minDist ${minD.toFixed(2)}`);
}

describe("drag measurements on 10-rope boards", () => {
  it("steady drag to the hole", () => run("steady", steady, 0), 600_000);
  it("fast swipe with a detour, released short of the hole", () => run("swipe", swipe, 0.15), 600_000);
});
