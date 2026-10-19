import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Streams a document PDF after checking authentication and confidentiality. ?v=<versionId>, ?download=1 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "document:view")) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const doc = await db.document.findUnique({ where: { id }, include: { currentVersion: true } });
  if (!doc) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (doc.confidential && !can(user.role, "document:confidential")) return NextResponse.json({ error: "Documento riservato" }, { status: 403 });
  const versionId = url.searchParams.get("v");
  const version = versionId ? await db.documentVersion.findFirst({ where: { id: versionId, documentId: id } }) : doc.currentVersion;
  if (!version) return NextResponse.json({ error: "Nessun file" }, { status: 404 });
  const data = await getFile(version.storageKey);
  const download = url.searchParams.get("download") === "1";
  if (download) await audit(user.id, "document.download", "Document", id, `Scaricato "${doc.title}" v${version.version}`);
  const safeName = version.fileName.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
