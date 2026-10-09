import { endPos, gapContaining, normAngle, type Diagram, type EndRef, type Gap } from "../diagram";

export function flipGap(d: Diagram, moving: EndRef, partner: number): Gap {
  const p0 = endPos(d, { rope: partner, end: 0 }).angle;
  const p1 = endPos(d, { rope: partner, end: 1 }).angle;
  const cur = endPos(d, moving).angle;
  const span01 = normAngle(p1 - p0);
  const inFirst = normAngle(cur - p0) < span01;
  const start = inFirst ? p1 : p0;
  const span = inFirst ? normAngle(p0 - p1) : span01;
  return gapContaining(d, normAngle(start + span / 2), moving);
}
