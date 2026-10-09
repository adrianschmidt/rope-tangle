import { fromSnapshot, snapshotTransfer, toSnapshot } from "../src/engine/snapshot";
import type { Engine } from "../src/engine/engine";
import { generateBoard } from "../src/generate/generate";

const state = (E: Engine) => E.ropes.map((r) => r.pts.map((p) => [p.x, p.y, p.z, p.px, p.py, p.pz]));

describe("engine snapshots", () => {
  it("round-trips a realized board and keeps simulating identically", () => {
    const E = generateBoard(1, 4).engine;
    const s = toSnapshot(E);
    const F = fromSnapshot(s);
    expect(F.board).toEqual(E.board);
    expect(F.ropes.map((r) => r.ends)).toEqual(E.ropes.map((r) => r.ends));
    expect(state(F)).toEqual(state(E));
    for (let i = 0; i < 50; i++) {
      E.substep(null);
      F.substep(null);
    }
    expect(state(F)).toEqual(state(E));
  });

  it("lists one transferable buffer per rope", () => {
    const s = toSnapshot(generateBoard(2, 4).engine);
    expect(snapshotTransfer(s)).toHaveLength(4);
    expect(s.ropes[0]!.pts.length % 6).toBe(0);
  });

  it("refuses an engine with an end out of its hole", () => {
    const E = generateBoard(1, 4).engine;
    E.grab(0, 0);
    expect(() => toSnapshot(E)).toThrow();
  });
});
