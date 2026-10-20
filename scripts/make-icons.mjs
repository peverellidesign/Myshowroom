// Generates the web-app icons in public/icons (run: node scripts/make-icons.mjs).
import sharp from "sharp";
const out = new URL("../public/icons/", import.meta.url).pathname;
// Geometric lowercase "m" drawn as strokes (font independent), on charcoal.
const glyph = (s, cx, cy) => {
  const w = 220 * s, h = 150 * s, sw = 26 * s, r = (w / 2 - sw / 2) / 2 + sw / 4;
  const x0 = cx - w / 2 + sw / 2, x2 = cx + w / 2 - sw / 2, x1 = (x0 + x2) / 2, top = cy - h / 2 + r, bot = cy + h / 2;
  return `<path d="M${x0} ${bot} V${cy - h / 2 + sw / 2} M${x0} ${top} a${(x1 - x0) / 2} ${(x1 - x0) / 2} 0 0 1 ${x1 - x0} 0 V${bot} M${x1} ${top} a${(x2 - x1) / 2} ${(x2 - x1) / 2} 0 0 1 ${x2 - x1} 0 V${bot}" fill="none" stroke="#FAFAF8" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const svg = (scale, withRule) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#222222"/>${glyph(scale, 256, withRule ? 236 : 256)}${withRule ? `<rect x="${256 - 60 * scale}" y="${340 + 20 * (scale - 1)}" width="${120 * scale}" height="${4 * scale}" fill="#B9B6B0"/>` : ""}</svg>`;
await sharp(Buffer.from(svg(1, true))).resize(192).png().toFile(out + "icon-192.png");
await sharp(Buffer.from(svg(1, true))).resize(512).png().toFile(out + "icon-512.png");
await sharp(Buffer.from(svg(0.78, true))).resize(512).png().toFile(out + "icon-maskable-512.png");
await sharp(Buffer.from(svg(1, true))).resize(180).png().toFile(out + "apple-touch-icon.png");
await sharp(Buffer.from(svg(1, true))).resize(32).png().toFile(out + "favicon-32.png");
