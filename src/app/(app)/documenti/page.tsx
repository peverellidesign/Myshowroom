import Link from "next/link";
import { Lock } from "lucide-react";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { visibleDocuments } from "@/lib/documents";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_LANGUAGE_LABELS, fmtBytes, fmtDate } from "@/lib/format";
import { DocumentUpload } from "@/components/document-upload";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cataloghi & Documenti" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; carica?: string }> }) {
  const user = await requireUser("document:view");
  const { q, categoria, carica } = await searchParams;
  const where: Prisma.DocumentWhereInput = { ...visibleDocuments(user) };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }];
  if (categoria) where.category = categoria as DocumentCategory;
  const canManage = can(user.role, "document:manage");
  const [docs, products, brands] = await Promise.all([
    db.document.findMany({
      where,
      include: { brand: true, currentVersion: true, links: { include: { productModel: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    canManage ? db.productModel.findMany({ where: { active: true }, include: { brand: true }, orderBy: { name: "asc" } }) : [],
    canManage ? db.brand.findMany({ orderBy: { name: "asc" } }) : [],
  ]);

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="Cataloghi & Documenti"
        title="La biblioteca."
        subtitle="Cataloghi ufficiali, schede tecniche e listini, sempre con te."
        actions={
          canManage && (
            <DocumentUpload
              products={products.map((p) => ({ id: p.id, name: p.name, brand: p.brand.name }))}
              brands={brands}
              canConfidential={can(user.role, "document:confidential")}
              autoOpen={carica === "1"}
            />
          )
        }
      />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Cerca per titolo o brand…" className="field" type="search" />
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
      </form>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href="/documenti" className={cn("chip", !categoria && "chip-active")}>
          Tutti
        </Link>
        {Object.entries(DOCUMENT_CATEGORY_LABELS)
          .filter(([k]) => k !== "LISTINO_PREZZI" || can(user.role, "document:confidential"))
          .map(([k, v]) => (
            <Link key={k} href={`/documenti?categoria=${k}`} className={cn("chip", categoria === k && "chip-active")}>
              {v}
            </Link>
          ))}
      </div>
      {docs.length === 0 ? (
        <EmptyState title="Nessun documento" text={canManage ? "Carica il primo catalogo del produttore con «Carica documento»." : "Non ci sono documenti disponibili."} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <Link key={d.id} href={`/documenti/${d.id}`} className="card flex gap-4 p-5 transition hover:border-ink/25">
              <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-[#FBFBFA] text-[10px] font-medium tracking-wider text-soft">PDF</div>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] leading-snug">{d.title}</p>
                <p className="text-sm text-soft">{d.brand?.name ?? "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{DOCUMENT_CATEGORY_LABELS[d.category]}</Badge>
                  <Badge tone="outline">{DOCUMENT_LANGUAGE_LABELS[d.language]}</Badge>
                  {d.confidential && (
                    <Badge tone="warning">
                      <Lock size={11} /> Riservato
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {d.currentVersion && `v${d.currentVersion.version} · ${fmtBytes(d.currentVersion.sizeBytes)} · ${fmtDate(d.updatedAt)} · `}
                  {d.links.length} prodott{d.links.length === 1 ? "o" : "i"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
