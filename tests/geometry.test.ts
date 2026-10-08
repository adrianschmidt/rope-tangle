import { TAU, circlePoint, intersect, normAngle } from "../src/diagram/geometry";

describe("normAngle", () => {
  it("wraps into [0, TAU)", () => {
    expect(normAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normAngle(TAU + 0.5)).toBeCloseTo(0.5);
    expect(normAngle(TAU)).toBe(0);
  });
});

describe("circlePoint", () => {
  it("lies on the unit circle", () => {
    const p = circlePoint(1.2);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1);
    expect(circlePoint(0)).toEqual({ x: 1, y: 0 });
  });
});

describe("intersect", () => {
  const P = (x: number, y: number) => ({ x, y });

  it("finds a proper crossing with parameters", () => {
    const r = intersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0));
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") {
      expect(r.t).toBeCloseTo(0.5);
      expect(r.u).toBeCloseTo(0.5);
      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(1);
    }
  });

  it("reports none for separated, parallel and non-overlapping collinear segments", () => {
    expect(intersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 1), P(3, 0), P(4, 1)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 0), P(2, 0), P(3, 0)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 1), P(2, 0), P(2, 1)).kind).toBe("none");
  });

  it("reports degenerate when they touch at an endpoint or overlap collinearly", () => {
    expect(intersect(P(0, 0), P(2, 0), P(1, 0), P(1, 1)).kind).toBe("degenerate");
    expect(intersect(P(0, 0), P(2, 0), P(2, -1), P(2, 1)).kind).toBe("degenerate");
    expect(intersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0)).kind).toBe("degenerate");
  });
});
