"""Extracts product photos from the Peverelli selection PDF into prisma/seed-data/images.

Each embedded photo is rendered at 4x, then the light, uniform padding bands that
many photos carry inside the PDF (grey or white letterboxing) are trimmed so only
the actual photograph remains.

usage: python3 scripts/extract-catalog-images.py [pdf] [out_dir]
"""
import json
import sys
import numpy as np
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else "prisma/seed-data/peverelli-opportunita-showroom.pdf"
OUT = sys.argv[2] if len(sys.argv) > 2 else "prisma/seed-data/images/"
SCALE = 4


def longest_run(flags):
    best, cur, start, best_span = 0, 0, 0, (0, len(flags))
    for i, f in enumerate(list(flags) + [False]):
        if f:
            if cur == 0:
                start = i
            cur += 1
        else:
            if cur > best:
                best, best_span = cur, (start, i)
            cur = 0
    return best_span


def trim(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    lum = a.mean(axis=2)
    chroma = a.max(axis=2) - a.min(axis=2)
    # "Background" = light and neutral (grey/white letterbox); everything else is photo.
    content = (lum < 226) | (chroma > 14)
    # Light-but-textured areas (white walls in the photo) still vary locally: keep them.
    local = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1])) > 6
    content |= local
    cols = content.mean(axis=0) > 0.12
    rows = content.mean(axis=1) > 0.12
    x0, x1 = longest_run(cols)
    y0, y1 = longest_run(rows)
    if (x1 - x0) < im.width * 0.2 or (y1 - y0) < im.height * 0.2:
        return im
    # Cut-out product shots on pure white: keep a generous white margin around the object.
    border = np.concatenate([a[0].reshape(-1, 3), a[-1].reshape(-1, 3), a[:, 0].reshape(-1, 3), a[:, -1].reshape(-1, 3)])
    if border.mean() > 236 and border.std() < 9 and (x1 - x0) * (y1 - y0) < im.width * im.height * 0.7:
        m = int(max(x1 - x0, y1 - y0) * 0.12)
        bx0, by0, bx1, by1 = x0 - m, y0 - m, x1 + m, y1 + m
        # Keep a calm, roughly 4:3 to 3:4 frame around thin objects.
        w, h = bx1 - bx0, by1 - by0
        if h < w * 0.75:
            grow = (w * 0.75 - h) / 2
            by0, by1 = by0 - grow, by1 + grow
        elif w < h * 0.75:
            grow = (h * 0.75 - w) / 2
            bx0, bx1 = bx0 - grow, bx1 + grow
        box = (int(max(0, bx0)), int(max(0, by0)), int(min(im.width, bx1)), int(min(im.height, by1)))
        return im.crop(box)
    pad = 2
    box = (max(0, x0 + pad), max(0, y0 + pad), min(im.width, x1 - pad), min(im.height, y1 - pad))
    return im.crop(box)


pl = pdfplumber.open(SRC)
doc = pdfium.PdfDocument(SRC)
count = 0
native = {}
for i, page in enumerate(pl.pages):
    placed = sorted(
        [m for m in page.images if (m["x1"] - m["x0"]) > 60 and m["x0"] < 220 and (m["bottom"] - m["top"]) > 60],
        key=lambda m: m["top"],
    )
    render = doc[i].render(scale=SCALE).to_pil().convert("RGB")
    for k, m in enumerate(placed):
        crop = render.crop((int(m["x0"] * SCALE) + 3, int(m["top"] * SCALE) + 3, int(m["x1"] * SCALE) - 3, int(m["bottom"] * SCALE) - 3))
        out = trim(crop).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
        name = f"p{i + 1:02d}-{k + 1}.jpg"
        out.save(f"{OUT}{name}", quality=88, optimize=True, progressive=True)
        # Real resolution of the photo inside the PDF (the render above is upscaled).
        px_per_pt = m["srcsize"][0] / (m["x1"] - m["x0"])
        native[name] = [round(out.width / SCALE * px_per_pt), round(out.height / SCALE * px_per_pt)]
        count += 1
with open(f"{OUT}sizes.json", "w") as f:
    json.dump(native, f, indent=0, sort_keys=True)
print(f"{count} immagini estratte in {OUT}")
