import type { Diagram } from "../diagram";

export const COLORS = ["#2e9e3a", "#2f7fe0", "#e0453a", "#f0a020", "#8e44d0", "#18b3b3", "#e05fa8", "#8a5a33", "#b8a800", "#5c6b7a"];

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
    ctx.strokeStyle = COLORS[rope.id % COLORS.length]!;
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
      ctx.fillStyle = COLORS[rope.id % COLORS.length]!;
      ctx.beginPath();
      ctx.arc(X(v.x), Y(v.y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
