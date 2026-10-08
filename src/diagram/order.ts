import { TAU, normAngle } from "./geometry";
import type { Diagram, EndPos, EndRef, Gap } from "./types";

export function sameEnd(a: EndRef, b: EndRef): boolean {
  return a.rope === b.rope && a.end === b.end;
}

export function endPos(d: Diagram, ref: EndRef): EndPos {
  const e = d.ends[ref.rope * 2 + ref.end];
  if (!e) throw new Error(`no such end ${ref.rope}:${ref.end}`);
  return e;
}

export function cyclicOrder(d: Diagram, exclude?: EndRef): EndPos[] {
  return d.ends
    .filter((e) => !(exclude && sameEnd(e, exclude)))
    .slice()
    .sort((p, q) => p.angle - q.angle);
}

export function gapMidpoint(d: Diagram, gap: Gap): number {
  const a = endPos(d, gap.after).angle;
  const b = endPos(d, gap.before).angle;
  let span = normAngle(b - a);
  if (span === 0) span = TAU;
  return normAngle(a + span / 2);
}

export function gapContaining(d: Diagram, angle: number, exclude?: EndRef): Gap {
  const order = cyclicOrder(d, exclude);
  if (order.length === 0) throw new Error("gapContaining: no ends");
  const a = normAngle(angle);
  let i = order.length - 1;
  for (let k = 0; k < order.length; k++) {
    if (order[k]!.angle <= a) i = k;
    else break;
  }
  const after = order[i]!, before = order[(i + 1) % order.length]!;
  return { after: { rope: after.rope, end: after.end }, before: { rope: before.rope, end: before.end } };
}

export function gapOf(d: Diagram, ref: EndRef): Gap {
  return gapContaining(d, endPos(d, ref).angle, ref);
}
