import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_LANGUAGE_LABELS, fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import { PdfViewer } from "@/components/pdf-viewer";
import { DocumentVersionUpload } from "@/components/document-upload";
import { ProductPicker } from "@/components/product-picker";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ModalButton } from "@/components/ui/modal";
import { Badge, KeyValue } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { deleteDocument, linkDocument, restoreVersion, unlinkDocument, updateDocument } from "../actions";

export const metadata = { title: "Documento" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string; v?: string }> }) {
  const user = await requireUser("document:view");
  const { id } = await params;
  const { pagina, v } = await searchParams;
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      brand: true,
      currentVersion: { include: { uploadedBy: true } },
      versions: { orderBy: { version: "desc" }, include: { uploadedBy: true } },
      links: { include: { productModel: { include: { brand: true } } } },
    },
  });
  if (!doc) notFound();
  if (doc.confidential && !can(user.role, "document:confidential")) notFound();
  const canManage = can(user.role, "document:manage");
  const version = v ? doc.versions.find((x) => x.id === v) ?? doc.currentVersion : doc.currentVersion;
  const [products, brands] = canManage
    ? await Promise.all([db.productModel.findMany({ where: { active: true }, include: { brand: true }, orderBy: { name: "asc" } }), db.brand.findMany({ orderBy: { name: "asc" } })])
    : [[], []];

  const src = `/api/documents/${doc.id}/file${version && version.id !== doc.currentVersionId ? `?v=${version.id}` : ""}`;
  const dl = `/api/documents/${doc.id}/file?download=1${version && version.id !== doc.currentVersionId ? `&v=${version.id}` : ""}`;

  return (
    <div className="animate-fadein">
      <Link href="/documenti" className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Tutti i documenti
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{doc.brand?.name ?? DOCUMENT_CATEGORY_LABELS[doc.category]}</p>
          <h1 className="mt-1 text-3xl tracking-[-0.02em] sm:text-4xl">{doc.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
            <Badge tone="outline">{DOCUMENT_LANGUAGE_LABELS[doc.language]}</Badge>
            {doc.confidential && (
              <Badge tone="warning">
                <Lock size={11} /> Riservato
              </Badge>
            )}
            {version && version.id !== doc.currentVersionId && <Badge tone="danger">Versione storica v{version.version}</Badge>}
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <DocumentVersionUpload documentId={doc.id} />
            <ModalButton label="Modifica dati" title="Modifica documento" className={buttonClass("secondary", "sm")}>
              <ActionForm action={updateDocument.bind(null, doc.id)} className="space-y-4">
                <label className="block">
                  <span className="label">Titolo</span>
                  <input name="title" defaultValue={doc.title} className="field" required />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Categoria</span>
                    <select name="category" defaultValue={doc.category} className="field">
                      {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Lingua</span>
                    <select name="language" defaultValue={doc.language} className="field">
                      {Object.entries(DOCUMENT_LANGUAGE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="label">Brand</span>
                  <select name="brandId" defaultValue={doc.brandId ?? ""} className="field">
                    <option value="">—</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Note</span>
                  <textarea name="description" defaultValue={doc.description ?? ""} className="field" />
                </label>
                {can(user.role, "document:confidential") && (
                  <label className="flex items-center gap-3 text-[15px]">
                    <input type="checkbox" name="confidential" value="1" defaultChecked={doc.confidential} className="h-5 w-5 accent-[#222]" /> Riservato
                  </label>
                )}
                <SubmitButton className="w-full">Salva</SubmitButton>
              </ActionForm>
            </ModalButton>
            <ActionButton action={deleteDocument.bind(null, doc.id)} variant="danger" confirm="Eliminare definitivamente il documento e tutte le sue versioni?" redirectTo="/documenti">
              <Trash2 size={14} /> Elimina
            </ActionButton>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {version ? (
            <PdfViewer key={version.id} src={src} downloadHref={dl} initialPage={Number(pagina) || 1} title={doc.title} />
          ) : (
            <div className="card p-10 text-center text-soft">Nessun file disponibile.</div>
          )}
        </div>
        <aside className="space-y-5">
          <div className="card px-5 py-2">
            <KeyValue
              items={[
                ["File", version?.fileName],
                ["Dimensione", version ? fmtBytes(version.sizeBytes) : null],
                ["Pagine", version?.pageCount ?? "—"],
                ["Versione", version ? `v${version.version}` : null],
                ["Caricato da", version?.uploadedBy.name],
                ["Data", version ? fmtDate(version.createdAt) : null],
              ]}
            />
          </div>
          {doc.description && <p className="text-sm text-soft">{doc.description}</p>}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="eyebrow">Prodotti collegati</h2>
              {canManage && (
                <ModalButton label="+ Collega" title="Collega ad altri prodotti" className="text-sm link-quiet">
                  <ActionForm action={linkDocument.bind(null, doc.id)} className="space-y-4">
                    <p className="text-sm text-soft">Lo stesso file viene condiviso, senza caricare copie duplicate.</p>
                    <ProductPicker products={products.filter((p) => !doc.links.some((l) => l.productModelId === p.id)).map((p) => ({ id: p.id, name: p.name, brand: p.brand.name }))} />
                    <SubmitButton className="w-full">Collega</SubmitButton>
                  </ActionForm>
                </ModalButton>
              )}
            </div>
            <div className="card divide-y divide-line">
              {doc.links.length === 0 && <p className="p-4 text-sm text-soft">Nessun prodotto collegato.</p>}
              {doc.links.map((l) => (
                <div key={l.productModelId} className="flex items-center gap-2 p-3.5">
                  <Link href={`/prodotti/${l.productModelId}?tab=documenti`} className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{l.productModel.name}</p>
                    <p className="text-xs text-muted">
                      {l.productModel.brand.name}
                      {l.startPage && ` · da pag. ${l.startPage}`}
                    </p>
                  </Link>
                  {l.startPage && (
                    <Link href={`?pagina=${l.startPage}`} className="text-xs link-quiet">
                      Vai a p. {l.startPage}
                    </Link>
                  )}
                  {canManage && (
                    <ActionButton action={unlinkDocument.bind(null, doc.id, l.productModelId)} variant="ghost" size="icon" title="Scollega">
                      <Trash2 size={14} />
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="eyebrow mb-2">Storico versioni</h2>
            <div className="card divide-y divide-line">
              {doc.versions.map((ver) => (
                <div key={ver.id} className="p-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`?v=${ver.id}`} className="text-[15px] hover:underline">
                      v{ver.version} {ver.id === doc.currentVersionId && <Badge className="ml-1">Attuale</Badge>}
                    </Link>
                    {canManage && ver.id !== doc.currentVersionId && (
                      <ActionButton action={restoreVersion.bind(null, doc.id, ver.id)} variant="ghost">
                        Ripristina
                      </ActionButton>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {fmtDateTime(ver.createdAt)} · {ver.uploadedBy.name} · {fmtBytes(ver.sizeBytes)}
                  </p>
                  {ver.note && <p className="mt-1 text-xs text-soft">{ver.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
