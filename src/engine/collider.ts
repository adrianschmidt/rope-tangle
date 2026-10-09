import { CELL, MARGIN, SELF_GAP } from "./constants";
import { closestSegSeg, type ClosestOut } from "./geom3";
import type { ERope, P3 } from "./types";

export interface Seg {
  rope: ERope;
  k: number;
  a: P3;
  b: P3;
  ima: number;
  imb: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cy: number;
  cx1: number;
  cy1: number;
}

export class Collider {
  segs: Seg[] = [];
  n = 0;
  cand = new Int32Array(8192);
  candN = 0;
  private cellStart = new Int32Array(256);
  private cellFill = new Int32Array(256);
  private items = new Int32Array(4096);
  private hot = new Int32Array(4096);
  private hotN = 0;
  private warm = new Int32Array(4096);
  private warmN = 0;
  private readonly cp: ClosestOut = { s: 0, t: 0 };

  begin(): void {
    this.n = 0;
  }

  addRope(r: ERope): void {
    const p = r.pts, m = p.length, h = r.h;
    for (let k = 0; k < m - 1; k++) this.push(r, k, p[k]!, p[k + 1]!, k === 0 ? 0 : h, k === m - 2 ? 0 : h);
  }

  addBlocker(r: ERope, base: P3, top: P3): void {
    this.push(r, -1, base, top, 0, 0);
  }

  broadphase(M: number, useZ: boolean): void {
    const segs = this.segs, n = this.n;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!, a = s.a, b = s.b;
      if (a.x < b.x) {
        s.x0 = a.x - M;
        s.x1 = b.x + M;
      } else {
        s.x0 = b.x - M;
        s.x1 = a.x + M;
      }
      if (a.y < b.y) {
        s.y0 = a.y - M;
        s.y1 = b.y + M;
      } else {
        s.y0 = b.y - M;
        s.y1 = a.y + M;
      }
      if (a.z < b.z) {
        s.z0 = a.z - M;
        s.z1 = b.z + M;
      } else {
        s.z0 = b.z - M;
        s.z1 = a.z + M;
      }
      if (s.x0 < gx0) gx0 = s.x0;
      if (s.x1 > gx1) gx1 = s.x1;
      if (s.y0 < gy0) gy0 = s.y0;
      if (s.y1 > gy1) gy1 = s.y1;
    }
    this.candN = 0;
    if (n === 0) return;
    const nx = Math.floor((gx1 - gx0) / CELL) + 1, ny = Math.floor((gy1 - gy0) / CELL) + 1, nc = nx * ny;
    if (this.cellStart.length < nc + 1) {
      this.cellStart = new Int32Array(nc * 2 + 1);
      this.cellFill = new Int32Array(nc * 2 + 1);
    }
    const start = this.cellStart, fill = this.cellFill;
    start.fill(0, 0, nc + 1);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!;
      s.cx = Math.floor((s.x0 - gx0) / CELL);
      s.cx1 = Math.floor((s.x1 - gx0) / CELL);
      s.cy = Math.floor((s.y0 - gy0) / CELL);
      s.cy1 = Math.floor((s.y1 - gy0) / CELL);
      for (let cy = s.cy; cy <= s.cy1; cy++) {
        for (let cx = s.cx; cx <= s.cx1; cx++) {
          const c = cy * nx + cx + 1;
          start[c] = start[c]! + 1;
          total++;
        }
      }
    }
    for (let c = 0; c < nc; c++) {
      start[c + 1] = start[c + 1]! + start[c]!;
      fill[c] = start[c]!;
    }
    if (this.items.length < total) this.items = new Int32Array(total * 2);
    const items = this.items;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!;
      for (let cy = s.cy; cy <= s.cy1; cy++) {
        for (let cx = s.cx; cx <= s.cx1; cx++) {
          const c = cy * nx + cx, slot = fill[c]!;
          fill[c] = slot + 1;
          items[slot] = i;
        }
      }
    }
    let cand = this.cand, cn = 0;
    for (let c = 0; c < nc; c++) {
      const e = start[c + 1]!, cxc = c % nx, cyc = (c - cxc) / nx;
      for (let p = start[c]!; p < e; p++) {
        const i = items[p]!, si = segs[i]!;
        for (let q = p + 1; q < e; q++) {
          const j = items[q]!, sj = segs[j]!;
          if (si.rope === sj.rope && (si.k < 0 || sj.k < 0 || sj.k - si.k < SELF_GAP)) continue;
          if (si.x1 < sj.x0 || sj.x1 < si.x0 || si.y1 < sj.y0 || sj.y1 < si.y0) continue;
          if (useZ && (si.z1 < sj.z0 || sj.z1 < si.z0)) continue;
          if ((si.cx > sj.cx ? si.cx : sj.cx) !== cxc || (si.cy > sj.cy ? si.cy : sj.cy) !== cyc) continue;
          if (cn + 2 > cand.length) {
            const g = new Int32Array(cand.length * 2);
            g.set(cand);
            cand = this.cand = g;
          }
          cand[cn++] = i;
          cand[cn++] = j;
        }
      }
    }
    this.candN = cn;
  }

  activePairs(d: number): void {
    const segs = this.segs, cand = this.cand, cn = this.candN, cp = this.cp;
    const lim2 = (d + MARGIN) * (d + MARGIN), hot2 = (d + 1) * (d + 1);
    if (this.hot.length < cn) {
      this.hot = new Int32Array(cn * 2);
      this.warm = new Int32Array(cn * 2);
    }
    const hot = this.hot, warm = this.warm;
    let hn = 0, wn = 0;
    for (let i = 0; i < cn; i += 2) {
      const ia = cand[i]!, ib = cand[i + 1]!;
      const sa = segs[ia]!, sb = segs[ib]!;
      const a1 = sa.a, a2 = sa.b, b1 = sb.a, b2 = sb.b;
      closestSegSeg(a1, a2, b1, b2, cp);
      const s = cp.s, t = cp.t;
      const nx = a1.x + (a2.x - a1.x) * s - b1.x - (b2.x - b1.x) * t;
      const ny = a1.y + (a2.y - a1.y) * s - b1.y - (b2.y - b1.y) * t;
      const nz = a1.z + (a2.z - a1.z) * s - b1.z - (b2.z - b1.z) * t;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 < hot2) {
        hot[hn++] = ia;
        hot[hn++] = ib;
      } else if (d2 < lim2) {
        warm[wn++] = ia;
        warm[wn++] = ib;
      }
    }
    this.hotN = hn;
    this.warmN = wn;
  }

  solve(useWarm: boolean, d: number): number {
    const segs = this.segs, list = useWarm ? this.warm : this.hot, n = useWarm ? this.warmN : this.hotN, cp = this.cp;
    const dd = d * d;
    let minD = Infinity;
    for (let i = 0; i < n; i += 2) {
      const sa = segs[list[i]!]!, sb = segs[list[i + 1]!]!;
      const a1 = sa.a, a2 = sa.b, b1 = sb.a, b2 = sb.b;
      closestSegSeg(a1, a2, b1, b2, cp);
      const s = cp.s, t = cp.t;
      let nx = a1.x + (a2.x - a1.x) * s - b1.x - (b2.x - b1.x) * t;
      let ny = a1.y + (a2.y - a1.y) * s - b1.y - (b2.y - b1.y) * t;
      let nz = a1.z + (a2.z - a1.z) * s - b1.z - (b2.z - b1.z) * t;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 < minD) minD = d2;
      if (d2 >= dd) continue;
      const dist = Math.sqrt(d2);
      if (dist < 1e-6) {
        nx = 0;
        ny = 0;
        nz = a1.z + a2.z >= b1.z + b2.z ? 1 : -1;
      } else {
        nx /= dist;
        ny /= dist;
        nz /= dist;
      }
      const wa1 = (1 - s) * sa.ima, wa2 = s * sa.imb, wb1 = (1 - t) * sb.ima, wb2 = t * sb.imb;
      const den = wa1 * (1 - s) + wa2 * s + wb1 * (1 - t) + wb2 * t;
      if (den < 1e-12) continue;
      const lam = (d - dist) / den;
      a1.x += nx * lam * wa1;
      a1.y += ny * lam * wa1;
      a1.z += nz * lam * wa1;
      a2.x += nx * lam * wa2;
      a2.y += ny * lam * wa2;
      a2.z += nz * lam * wa2;
      b1.x -= nx * lam * wb1;
      b1.y -= ny * lam * wb1;
      b1.z -= nz * lam * wb1;
      b2.x -= nx * lam * wb2;
      b2.y -= ny * lam * wb2;
      b2.z -= nz * lam * wb2;
    }
    return Math.sqrt(minD);
  }

  private push(rope: ERope, k: number, a: P3, b: P3, ima: number, imb: number): void {
    const s = this.segs[this.n];
    if (s) {
      s.rope = rope;
      s.k = k;
      s.a = a;
      s.b = b;
      s.ima = ima;
      s.imb = imb;
    } else {
      this.segs.push({ rope, k, a, b, ima, imb, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, cx: 0, cy: 0, cx1: 0, cy1: 0 });
    }
    this.n++;
  }
}
