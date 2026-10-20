/**
 * Imports the real Peverelli showroom selection (prisma/seed-data/catalog.json,
 * transcribed from the "Opportunità | Selezione showroom" PDF) with its photos
 * and the PDF itself, linked to every product at the right page.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

export const SEED_DATA_DIR = resolve(process.env.SEED_DATA_DIR || "prisma/seed-data");
export const hasCatalog = () => existsSync(join(SEED_DATA_DIR, "catalog.json"));

type Item = {
  page: number;
  images: string[];
  brand: string;
  model: string;
  category: string;
  designer?: string;
  year?: number;
  composition: string;
  description: string;
  materials?: string;
  dimensions?: string;
  w?: number;
  d?: number;
  h?: number;
  qty: number;
  perUnit?: boolean;
  currency: "EUR" | "CHF";
  list: number;
  sale: number;
  notes?: string;
};

type Catalog = { source: string; document: string; items: Item[] };

const BRAND_INFO: Record<string, { country: string; website?: string }> = {
  Flexform: { country: "Italia", website: "https://www.flexform.it" },
  Flou: { country: "Italia", website: "https://www.flou.it" },
  "Poltrona Frau": { country: "Italia", website: "https://www.poltronafrau.com" },
  Rimadesio: { country: "Italia", website: "https://www.rimadesio.it" },
  Valcucine: { country: "Italia", website: "https://www.valcucine.com" },
  "Molteni&C": { country: "Italia", website: "https://www.molteni.it" },
  Giorgetti: { country: "Italia", website: "https://www.giorgettimeda.com" },
  "Carl Hansen & Son": { country: "Danimarca", website: "https://www.carlhansen.com" },
  "B&B Italia": { country: "Italia", website: "https://www.bebitalia.com" },
  Maxalto: { country: "Italia", website: "https://www.bebitalia.com/it-it/maxalto" },
  Vitra: { country: "Svizzera", website: "https://www.vitra.com" },
  Brera: { country: "Italia" },
  "Riva 1920": { country: "Italia", website: "https://www.riva1920.it" },
  Emmemobili: { country: "Italia", website: "https://www.emmemobili.it" },
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function storeCopy(storageRoot: string, prefix: string, src: string) {
  const ext = src.split(".").pop()!.toLowerCase();
  const key = `${prefix}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
  const dest = join(storageRoot, key);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return key;
}

export async function importCatalog(
  db: PrismaClient,
  opts: { storageRoot: string; uploaderId: string; locations: { CHF: string; EUR: string }; locationNames: { CHF: string; EUR: string } },
) {
  const catalog = JSON.parse(await readFile(join(SEED_DATA_DIR, "catalog.json"), "utf8")) as Catalog;
  const imgDir = join(SEED_DATA_DIR, "images");

  // Brands and categories
  const brandIds = new Map<string, string>();
  for (const name of [...new Set(catalog.items.map((i) => i.brand))]) {
    const b = await db.brand.upsert({ where: { name }, create: { name, ...BRAND_INFO[name] }, update: {} });
    brandIds.set(name, b.id);
  }
  const catIds = new Map<string, string>();
  for (const name of [...new Set(catalog.items.map((i) => i.category))]) {
    const c = await db.category.upsert({ where: { name }, create: { name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-") }, update: {} });
    catIds.set(name, c.id);
  }

  // The source PDF becomes a shared document linked to every product.
  let documentId: string | null = null;
  const pdfPath = join(SEED_DATA_DIR, catalog.document);
  if (existsSync(pdfPath)) {
    const buf = await readFile(pdfPath);
    const key = await storeCopy(opts.storageRoot, "documents", pdfPath);
    const doc = await db.document.create({
      data: { title: "Opportunità — Selezione showroom", category: "CATALOGO_GENERALE", language: "IT", description: "Selezione di pezzi esposti con prezzo di listino e prezzo scontato." },
    });
    const v = await db.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        fileName: "Peverelli_Design_opportunita_selezione_showroom.pdf",
        mimeType: "application/pdf",
        sizeBytes: (await stat(pdfPath)).size,
        pageCount: (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length || null,
        checksum: createHash("sha256").update(buf).digest("hex"),
        uploadedById: opts.uploaderId,
      },
    });
    await db.document.update({ where: { id: doc.id }, data: { currentVersionId: v.id } });
    documentId = doc.id;
  }

  // Product models: one per brand + model; each listing becomes a physical piece.
  const products = new Map<string, { id: string; images: number }>();
  const seq: Record<string, number> = { CHF: 0, EUR: 0 };
  let pieces = 0;

  for (const it of catalog.items) {
    const key = `${it.brand}|${it.model}`;
    let product = products.get(key);
    if (!product) {
      const p = await db.productModel.create({
        data: {
          brandId: brandIds.get(it.brand)!,
          categoryId: catIds.get(it.category)!,
          name: it.model,
          code: `PD-${slug(it.brand).slice(0, 6)}-${slug(it.model).slice(0, 48)}`,
          designer: it.designer,
          year: it.year,
          description: it.description,
          dimensions: it.dimensions,
          widthCm: it.w,
          depthCm: it.d,
          heightCm: it.h,
          currency: it.currency,
        },
      });
      product = { id: p.id, images: 0 };
      products.set(key, product);
      if (documentId) await db.productDocumentLink.create({ data: { documentId, productModelId: p.id, startPage: it.page } });
    }

    for (const file of it.images) {
      const src = join(imgDir, file);
      if (!existsSync(src)) continue;
      const stored = await storeCopy(opts.storageRoot, "products", src);
      await db.productImage.create({
        data: { productModelId: product.id, storageKey: stored, mimeType: "image/jpeg", kind: "SHOWROOM", caption: it.composition, credit: "Foto Peverelli Design", isMain: product.images === 0, sortOrder: product.images },
      });
      product.images++;
    }

    seq[it.currency]++;
    const prefix = it.currency === "CHF" ? "PD-LUG-" : "PD-COM-";
    const discountPct = it.list > 0 ? Math.round((1 - it.sale / it.list) * 100 * 1e6) / 1e6 : 0;
    const notes = [
      it.notes,
      it.perUnit ? "Prezzi per singolo prodotto (cadauno)." : null,
      `Prezzo di listino ${it.currency} ${it.list.toLocaleString("it-IT")}, prezzo scontato ${it.currency} ${it.sale.toLocaleString("it-IT")} (fonte: ${catalog.source}, p. ${it.page}).`,
      `Sede assegnata in base alla valuta del listino (${opts.locationNames[it.currency]}): da verificare.`,
    ]
      .filter(Boolean)
      .join("\n");
    const item = await db.inventoryItem.create({
      data: {
        code: `${prefix}${String(seq[it.currency]).padStart(5, "0")}`,
        productModelId: product.id,
        composition: it.composition,
        materialsDescription: it.materials,
        dimensions: it.dimensions,
        quantity: it.qty,
        locationId: opts.locations[it.currency],
        status: "ESPOSTO",
        baseStatus: "ESPOSTO",
        price: it.list,
        currency: it.currency,
        discountPct,
        notes,
      },
    });
    const real = join(imgDir, it.images[0]);
    if (existsSync(real)) {
      const stored = await storeCopy(opts.storageRoot, "inventory", real);
      await db.inventoryImage.create({ data: { inventoryItemId: item.id, storageKey: stored, mimeType: "image/jpeg", caption: it.composition } });
    }
    pieces++;
  }

  // Cover image: a real showroom photograph from the selection.
  const heroSrc = join(imgDir, "p02-2.jpg");
  const heroKey = existsSync(heroSrc) ? await storeCopy(opts.storageRoot, "site", heroSrc) : null;
  return { products: products.size, pieces, brands: brandIds.size, documentId, heroKey };
}
