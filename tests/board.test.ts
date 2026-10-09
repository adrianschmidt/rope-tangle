import { boardForRopes, PITCH, rimBoard, rimPoint } from "../src/board";

describe("rim board", () => {
  it("puts holes on the perimeter in clockwise order from the top-left corner", () => {
    const b = rimBoard(4, 5);
    expect(b.width).toBe(3 * PITCH);
    expect(b.height).toBe(4 * PITCH);
    expect(b.holes).toHaveLength(14);
    expect(b.holes[0]).toMatchObject({ x: 0, y: 0, rim: 0 });
    expect(b.holes[3]).toMatchObject({ x: 192, y: 0, rim: 192 });
    expect(b.holes[4]).toMatchObject({ x: 192, y: 64, rim: 256 });
    expect(b.holes[13]).toMatchObject({ x: 0, y: 64, rim: 832 });
    for (let i = 1; i < b.holes.length; i++) expect(b.holes[i]!.rim).toBeGreaterThan(b.holes[i - 1]!.rim);
    expect(b.rimLength).toBe(2 * (192 + 256));
  });

  it("has outward normals, diagonal at corners", () => {
    const b = rimBoard(4, 5);
    expect(b.holes[0]!.ox).toBeCloseTo(-Math.SQRT1_2);
    expect(b.holes[0]!.oy).toBeCloseTo(-Math.SQRT1_2);
    expect(b.holes[1]).toMatchObject({ ox: 0, oy: -1 });
    expect(b.holes[4]).toMatchObject({ ox: 1, oy: 0 });
  });

  it("maps rim parameters back to hole positions", () => {
    const b = rimBoard(5, 6);
    for (const h of b.holes) {
      const p = rimPoint(b, h.rim);
      expect(p.x).toBeCloseTo(h.x);
      expect(p.y).toBeCloseTo(h.y);
    }
    expect(rimPoint(b, b.rimLength + 10)).toEqual(rimPoint(b, 10));
    expect(rimPoint(b, -10)).toEqual(rimPoint(b, b.rimLength - 10));
  });

  it("sizes boards by rope count with room to spare", () => {
    for (let n = 4; n <= 10; n++) expect(boardForRopes(n).holes.length).toBeGreaterThanOrEqual(2 * n + 4);
    expect(boardForRopes(10).width).toBe(6 * PITCH);
    expect(() => boardForRopes(3)).toThrow();
    expect(() => boardForRopes(11)).toThrow();
  });
});
