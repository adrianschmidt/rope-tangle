import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (size, rgba) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};

function icon(size, scale) {
  const img = Buffer.alloc(size * size * 4);
  const bg = hex("#eef1f8"), outline = hex("#1d2230");
  const ropes = [
    { a: [0.78, 0.22], b: [0.22, 0.78], color: hex("#e0453a") },
    { a: [0.22, 0.22], b: [0.78, 0.78], color: hex("#2f7fe0") },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size - 0.5) / scale + 0.5, v = ((y + 0.5) / size - 0.5) / scale + 0.5;
      const px = 1 / (size * scale);
      let c = [...bg];
      const paint = (col, cover) => {
        const a = Math.max(0, Math.min(1, cover));
        c = c.map((ch, i) => ch * (1 - a) + col[i] * a);
      };
      for (const r of ropes) {
        const d = segDist(u, v, r.a[0], r.a[1], r.b[0], r.b[1]);
        paint(outline, (0.075 - d) / px + 0.5);
        paint(r.color, (0.06 - d) / px + 0.5);
        for (const [ex, ey] of [r.a, r.b]) {
          const e = Math.hypot(u - ex, v - ey);
          paint(outline, (0.095 - e) / px + 0.5);
          paint(r.color, (0.08 - e) / px + 0.5);
        }
      }
      const o = (y * size + x) * 4;
      img[o] = Math.round(c[0]);
      img[o + 1] = Math.round(c[1]);
      img[o + 2] = Math.round(c[2]);
      img[o + 3] = 255;
    }
  }
  return png(size, img);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, 1));
writeFileSync("public/icons/icon-512.png", icon(512, 1));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, 0.75));
