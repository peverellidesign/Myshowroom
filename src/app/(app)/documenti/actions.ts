"use server";

import { revalidatePath } from "next/cache";
import type { DocumentCategory, DocumentLanguage } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { deleteFile } from "@/lib/storage";
import { optStr, str } from "@/lib/utils";

function refresh(documentId?: string, productIds: string[] = []) {
  revalidatePath("/documenti");
  if (documentId) revalidatePath(`/documenti/${documentId}`);
  for (const p of productIds) revalidatePath(`/prodotti/${p}`);
}

export async function linkDocument(documentId: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("document:manage");
    const productIds = [...new Set(form.getAll("productIds").map(String).filter(Boolean))];
    if (!productIds.length) throw new AppError("Seleziona almeno un prodotto.");
    for (const productModelId of productIds) {
      const startPage = Number(str(form, `startPage_${productModelId}`)) || null;
      await db.productDocumentLink.upsert({
        where: { documentId_productModelId: { documentId, productModelId } },
        create: { documentId, productModelId, startPage },
        update: { startPage },
      });
    }
    await audit(user.id, "document.link", "Document", documentId, `Collegato a ${productIds.length} prodotti`);
    refresh(documentId, productIds);
  }, "Documento collegato.");
}

export async function unlinkDocument(documentId: string, productModelId: string) {
  return run(async () => {
    const user = await assertUser("document:manage");
    await db.productDocumentLink.delete({ where: { documentId_productModelId: { documentId, productModelId } } });
    await audit(user.id, "document.unlink", "Document", documentId, "Scollegato da un prodotto", { productModelId });
    refresh(documentId, [productModelId]);
  }, "Collegamento rimosso.");
}

export async function updateDocument(documentId: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("document:manage");
    const title = str(form, "title");
    if (!title) throw new AppError("Inserisci il titolo.");
    const category = str(form, "category") as DocumentCategory;
    const doc = await db.document.update({
      where: { id: documentId },
      data: {
        title,
        category,
        language: str(form, "language") as DocumentLanguage,
        brandId: optStr(form, "brandId"),
        description: optStr(form, "description"),
        confidential: str(form, "confidential") === "1" || category === "LISTINO_PREZZI",
      },
      include: { links: true },
    });
    await audit(user.id, "document.update", "Document", documentId, `Aggiornati metadati "${title}"`);
    refresh(documentId, doc.links.map((l) => l.productModelId));
  }, "Documento aggiornato.");
}

export async function restoreVersion(documentId: string, versionId: string) {
  return run(async () => {
    const user = await assertUser("document:manage");
    const v = await db.documentVersion.findFirstOrThrow({ where: { id: versionId, documentId } });
    await db.document.update({ where: { id: documentId }, data: { currentVersionId: v.id } });
    await audit(user.id, "document.restore", "Document", documentId, `Ripristinata versione v${v.version}`);
    refresh(documentId);
  }, "Versione ripristinata.");
}

export async function deleteDocument(documentId: string) {
  return run(async () => {
    const user = await assertUser("document:manage");
    const doc = await db.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true, links: true } });
    await db.document.update({ where: { id: documentId }, data: { currentVersionId: null } });
    await db.document.delete({ where: { id: documentId } });
    for (const v of doc.versions) await deleteFile(v.storageKey);
    await audit(user.id, "document.delete", "Document", documentId, `Eliminato "${doc.title}" (${doc.versions.length} versioni)`);
    refresh(undefined, doc.links.map((l) => l.productModelId));
  }, "Documento eliminato.");
}
