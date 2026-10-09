import type { Diagram } from "../diagram";
import { ROPE_COLORS } from "../render/ropes";

export function drawDiagram(ctx: CanvasRenderingContext2D, d: Diagram, size: number): void {
  const c = size / 2, r = size * 0.46;
  const X = (x: number) => c + x * r, Y = (y: number) => c + y * r;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ccd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const rope of d.ropes) {
    ctx.strokeStyle = ROPE_COLORS[rope.id % ROPE_COLORS.length]!;
    ctx.lineWidth = 3;
    ctx.beginPath();
    rope.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(X(v.x), Y(v.y)) : ctx.lineTo(X(v.x), Y(v.y))));
    ctx.stroke();
    for (const e of [rope.vertices[0]!, rope.vertices[rope.vertices.length - 1]!]) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(X(e.x), Y(e.y), 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const rope of d.ropes) {
    for (const v of rope.vertices) {
      if (v.kind !== "crossing" || !v.overHere) continue;
      ctx.fillStyle = ROPE_COLORS[rope.id % ROPE_COLORS.length]!;
      ctx.beginPath();
      ctx.arc(X(v.x), Y(v.y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
