import type { Point } from "../util/point";

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Particle extends P3 {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface ERope {
  id: number;
  pts: Particle[];
  ends: [number | null, number | null];
  cleared: boolean;
  s: Float64Array;
  L: number;
  h: number;
  maxSeg: number;
  zeroN: number;
}

export interface HeldEnd {
  rope: number;
  end: 0 | 1;
  from: number;
  lifted: boolean;
}

export interface FlyingEnd extends HeldEnd {
  path: Point[];
  hole: number;
  top: P3;
}

export interface LandingEnd {
  p: Particle;
  hole: number;
  rope: number;
  wait: number;
  top: P3;
}

export interface PhysCrossing {
  a: number;
  b: number;
  over: number;
  sign: number;
  dz: number;
  x: number;
  y: number;
  ua: number;
  ub: number;
}

export type Signature = Map<number, PhysCrossing[]>;

export function pairKey(a: number, b: number): number {
  return a < b ? a * 64 + b : b * 64 + a;
}

export function particle(x: number, y: number, z: number): Particle {
  return { x, y, z, px: x, py: y, pz: z, rx: Number.NaN, ry: Number.NaN, rz: Number.NaN };
}
