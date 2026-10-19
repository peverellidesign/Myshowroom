"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ImageKind } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { deleteFile, storeImage } from "@/lib/storage";
import { optStr, str } from "@/lib/utils";

const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable());
const optMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).nullable());

const productSchema = z.object({
  name: z.string().min(1, "Inserisci il nome del modello."),
  code: z.string().min(1, "Inserisci il codice prodotto."),
  brandId: z.string().min(1, "Seleziona il brand."),
  categoryId: z.string().min(1, "Seleziona la categoria."),
  designer: z.string().nullable(),
  year: optInt,
  description: z.string(),
  dimensions: z.string().nullable(),
  widthCm: optInt,
  depthCm: optInt,
  heightCm: optInt,
  listPrice: optMoney,
  currency: z.enum(["EUR", "CHF"]),
});

function parseProduct(form: FormData) {
  return productSchema.parse({
    name: str(form, "name"),
    code: str(form, "code"),
    brandId: str(form, "brandId"),
    categoryId: str(form, "categoryId"),
    designer: optStr(form, "designer"),
    year: str(form, "year"),
    description: str(form, "description"),
    dimensions: optStr(form, "dimensions"),
    widthCm: str(form, "widthCm"),
    depthCm: str(form, "depthCm"),
    heightCm: str(form, "heightCm"),
    listPrice: str(form, "listPrice"),
    currency: str(form, "currency") || "EUR",
  });
}

export async function createProduct(form: FormData) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const data = parseProduct(form);
    const p = await db.productModel.create({ data });
    await audit(user.id, "product.create", "ProductModel", p.id, `Creato prodotto ${p.name}`);
    revalidatePath("/prodotti");
    return { id: p.id };
  }, "Prodotto creato.");
}

export async function updateProduct(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const data = parseProduct(form);
    await db.productModel.update({ where: { id }, data });
    await audit(user.id, "product.update", "ProductModel", id, `Aggiornato prodotto ${data.name}`);
    revalidatePath(`/prodotti/${id}`);
  }, "Prodotto aggiornato.");
}

export async function archiveProduct(id: string) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const p = await db.productModel.update({ where: { id }, data: { active: false } });
    await audit(user.id, "product.archive", "ProductModel", id, `Archiviato prodotto ${p.name}`);
    revalidatePath("/prodotti");
  }, "Prodotto archiviato.");
}

export async function toggleFavorite(productModelId: string) {
  return run(async () => {
    const user = await assertUser("product:view");
    const key = { userId_productModelId: { userId: user.id, productModelId } };
    const existing = await db.favorite.findUnique({ where: key });
    if (existing) await db.favorite.delete({ where: key });
    else await db.favorite.create({ data: { userId: user.id, productModelId } });
    revalidatePath(`/prodotti/${productModelId}`);
    return { favorite: !existing };
  });
}

// ── Images ─────────────────────────────────────────────────

export async function uploadProductImages(productModelId: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError("Seleziona almeno un'immagine.");
    const kind = (str(form, "kind") || "FRONTALE") as ImageKind;
    const configurationId = optStr(form, "configurationId");
    const caption = optStr(form, "caption");
    const credit = optStr(form, "credit");
    const count = await db.productImage.count({ where: { productModelId } });
    let order = count;
    for (const file of files) {
      const stored = await storeImage(file, "products");
      await db.productImage.create({
        data: { productModelId, configurationId, storageKey: stored.key, mimeType: stored.mime, kind, caption, credit, sortOrder: order++, isMain: count === 0 && order === 1 },
      });
    }
    await audit(user.id, "product.images.upload", "ProductModel", productModelId, `Caricate ${files.length} immagini`);
    revalidatePath(`/prodotti/${productModelId}`);
  }, "Immagini caricate.");
}

export async function setMainImage(imageId: string) {
  return run(async () => {
    await assertUser("product:edit");
    const img = await db.productImage.findUniqueOrThrow({ where: { id: imageId } });
    await db.$transaction([
      db.productImage.updateMany({ where: { productModelId: img.productModelId }, data: { isMain: false } }),
      db.productImage.update({ where: { id: imageId }, data: { isMain: true } }),
    ]);
    revalidatePath(`/prodotti/${img.productModelId}`);
  }, "Immagine principale aggiornata.");
}

export async function deleteProductImage(imageId: string) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const img = await db.productImage.delete({ where: { id: imageId } });
    await deleteFile(img.storageKey);
    await audit(user.id, "product.images.delete", "ProductModel", img.productModelId, "Eliminata immagine");
    revalidatePath(`/prodotti/${img.productModelId}`);
  }, "Immagine eliminata.");
}

// ── Configurations ─────────────────────────────────────────

const configSchema = z.object({
  name: z.string().min(1, "Inserisci il nome della composizione."),
  code: z.string().nullable(),
  dimensions: z.string().nullable(),
  widthCm: optInt,
  depthCm: optInt,
  heightCm: optInt,
  price: optMoney,
  currency: z.enum(["EUR", "CHF"]),
  notes: z.string().nullable(),
  source: z.string().min(1, "Indica la fonte ufficiale (es. catalogo e pagina)."),
});

export async function saveConfiguration(productModelId: string, configurationId: string | null, form: FormData) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const data = configSchema.parse({
      name: str(form, "name"),
      code: optStr(form, "code"),
      dimensions: optStr(form, "dimensions"),
      widthCm: str(form, "widthCm"),
      depthCm: str(form, "depthCm"),
      heightCm: str(form, "heightCm"),
      price: str(form, "price"),
      currency: str(form, "currency") || "EUR",
      notes: optStr(form, "notes"),
      source: str(form, "source"),
    });
    const finishIds = form.getAll("finishIds").map(String);
    const materialIds = form.getAll("materialIds").map(String);
    await db.$transaction(async (tx) => {
      const conf = configurationId
        ? await tx.productConfiguration.update({ where: { id: configurationId }, data: { ...data, isDemo: false } })
        : await tx.productConfiguration.create({ data: { ...data, productModelId } });
      await tx.configurationCompatibility.deleteMany({ where: { configurationId: conf.id } });
      const finishes = await tx.finish.findMany({ where: { id: { in: finishIds } } });
      const coveredMaterials = new Set(finishes.map((f) => f.materialId));
      for (const f of finishes) {
        await tx.configurationCompatibility.create({ data: { configurationId: conf.id, materialId: f.materialId, finishId: f.id } });
      }
      for (const m of materialIds.filter((m) => !coveredMaterials.has(m))) {
        await tx.configurationCompatibility.create({ data: { configurationId: conf.id, materialId: m } });
      }
      await audit(user.id, configurationId ? "configuration.update" : "configuration.create", "ProductModel", productModelId, `Composizione ${conf.name}`, undefined, tx);
    });
    revalidatePath(`/prodotti/${productModelId}`);
  }, "Composizione salvata.");
}

export async function deleteConfiguration(configurationId: string) {
  return run(async () => {
    const user = await assertUser("product:edit");
    const c = await db.productConfiguration.delete({ where: { id: configurationId } });
    await audit(user.id, "configuration.delete", "ProductModel", c.productModelId, `Eliminata composizione ${c.name}`);
    revalidatePath(`/prodotti/${c.productModelId}`);
  }, "Composizione eliminata.");
}
