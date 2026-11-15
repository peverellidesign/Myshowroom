// Adds the morethere mark (two interlocking circles + wordmark) to a photo that
// leaves the app. Drawn in the browser on a copy: the photo stored in the
// archive stays untouched.

export async function watermark(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();

  const short = Math.min(canvas.width, canvas.height);
  const size = Math.max(13, Math.round(short * 0.034)); // wordmark height
  const pad = Math.round(short * 0.035);
  try { await document.fonts?.load(`700 ${size}px Roboto`); } catch { /* fallback font */ }
  ctx.font = `700 ${size}px Roboto, Arial, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${-size * 0.035}px`;
  const text = 'morethere';
  const textW = ctx.measureText(text).width;
  const r = size * 0.42; // circle radius
  const markW = r * 2 + r * 0.95; // two circles, overlapping
  const gap = size * 0.4;
  const x = canvas.width - pad - textW - gap - markW;
  const cy = canvas.height - pad - size * 0.5;

  // White on dark photos, charcoal on light ones: read the corner first.
  const bx = Math.max(0, Math.floor(x - gap)), by = Math.max(0, Math.floor(cy - size));
  const px = ctx.getImageData(bx, by, Math.max(1, canvas.width - bx), Math.max(1, canvas.height - by)).data;
  let lum = 0;
  for (let i = 0; i < px.length; i += 4) lum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  const light = lum / (px.length / 4) > 165;
  const ink = light ? '#252525' : '#fff';

  ctx.save();
  ctx.globalAlpha = light ? 0.85 : 0.92;
  ctx.shadowColor = light ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.35;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  for (const cx of [x + r, x + r + r * 0.95]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + markW + gap, cy + size * 0.04);
  ctx.restore();

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('watermark'))), 'image/jpeg', 0.9));
}
