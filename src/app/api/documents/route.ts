import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { errorMessage } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { storePdf, deleteFile } from "@/lib/storage";

const schema = z.object({
  title: z.string().min(1, "Inserisci il titolo del documento.").max(200),
  category: z.enum(["CATALOGO_PRODOTTO", "CATALOGO_GENERALE", "SCHEDA_TECNICA", "LISTINO_PREZZI", "MATERIALI_FINITURE", "ISTRUZIONI_MONTAGGIO", "ALTRO"]),
  language: z.enum(["IT", "EN", "DE", "FR", "MULTI"]),
  brandId: z.string().nullable(),
  confidential: z.boolean(),
  description: z.string().nullable(),
});

/**
 * Multipart upload of a manufacturer document.
 *  - new document: file + metadata + productIds[] (+ startPage_<productId>)
 *  - new version:  file + documentId (+ note)
 */
export async function POST(req: Request) {
  let storedKey: string | null = null;
  try {
    const user = await assertUser("document:manage");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Seleziona un file PDF.");
    const documentId = (form.get("documentId") as string) || null;

    if (documentId) {
      const doc = await db.document.findUnique({ where: { id: documentId } });
      if (!doc) throw new AppError("Documento non trovato.", 404);
      const stored = await storePdf(file);
      storedKey = stored.key;
      const result = await db.$transaction(async (tx) => {
        const last = await tx.documentVersion.aggregate({ where: { documentId }, _max: { version: true } });
        const v = await tx.documentVersion.create({
          data: {
            documentId,
            version: (last._max.version ?? 0) + 1,
            storageKey: stored.key,
            fileName: file.name.slice(0, 200),
            mimeType: "application/pdf",
            sizeBytes: stored.size,
            pageCount: stored.pageCount,
            checksum: stored.checksum,
            note: ((form.get("note") as string) || "").slice(0, 500) || null,
            uploadedById: user.id,
          },
        });
        await tx.document.update({ where: { id: documentId }, data: { currentVersionId: v.id } });
        await audit(user.id, "document.version", "Document", documentId, `Nuova versione v${v.version} di "${doc.title}"`, undefined, tx);
        return v;
      });
      return NextResponse.json({ ok: true, documentId, version: result.version });
    }

    const brandId = (form.get("brandId") as string) || null;
    const meta = schema.parse({
      title: ((form.get("title") as string) || "").trim(),
      category: form.get("category"),
      language: form.get("language"),
      brandId,
      confidential: form.get("confidential") === "1" || form.get("category") === "LISTINO_PREZZI",
      description: ((form.get("description") as string) || "").trim() || null,
    });
    if (meta.confidential && !(user.role === "ADMIN" || user.role === "MANAGER")) throw new AppError("Non puoi caricare documenti riservati.", 403);
    const productIds = [...new Set(form.getAll("productIds").map(String).filter(Boolean))];
    const products = await db.productModel.findMany({ where: { id: { in: productIds } }, select: { id: true } });

    // Duplicate guard: the same PDF already stored → link instead of uploading a copy.
    const stored = await storePdf(file);
    storedKey = stored.key;
    const dup = await db.documentVersion.findFirst({ where: { checksum: stored.checksum }, include: { document: true } });
    if (dup && dup.document.currentVersionId === dup.id) {
      await deleteFile(stored.key);
      storedKey = null;
      for (const p of products) {
        const sp = Number(form.get(`startPage_${p.id}`)) || null;
        await db.productDocumentLink.upsert({
          where: { documentId_productModelId: { documentId: dup.documentId, productModelId: p.id } },
          create: { documentId: dup.documentId, productModelId: p.id, startPage: sp },
          update: {},
        });
      }
      await audit(user.id, "document.link", "Document", dup.documentId, `PDF già presente: collegato "${dup.document.title}" a ${products.length} prodotti`);
      return NextResponse.json({ ok: true, documentId: dup.documentId, duplicate: true });
    }

    const doc = await db.$transaction(async (tx) => {
      const d = await tx.document.create({ data: meta });
      const v = await tx.documentVersion.create({
        data: {
          documentId: d.id,
          version: 1,
          storageKey: stored.key,
          fileName: file.name.slice(0, 200),
          mimeType: "application/pdf",
          sizeBytes: stored.size,
          pageCount: stored.pageCount,
          checksum: stored.checksum,
          uploadedById: user.id,
        },
      });
      await tx.document.update({ where: { id: d.id }, data: { currentVersionId: v.id } });
      for (const p of products) {
        const sp = Number(form.get(`startPage_${p.id}`)) || null;
        await tx.productDocumentLink.create({ data: { documentId: d.id, productModelId: p.id, startPage: sp } });
      }
      await audit(user.id, "document.upload", "Document", d.id, `Caricato "${d.title}" (${products.length} prodotti collegati)`, undefined, tx);
      return d;
    });
    return NextResponse.json({ ok: true, documentId: doc.id });
  } catch (e) {
    if (storedKey) await deleteFile(storedKey).catch(() => {});
    const status = e instanceof AppError ? e.status : 400;
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status });
  }
}
