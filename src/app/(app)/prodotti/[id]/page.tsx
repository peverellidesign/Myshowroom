import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Download, ExternalLink, Info, Lock, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { visibleDocuments } from "@/lib/documents";
import { expireReservations } from "@/lib/inventory";
import { getExchangeRate, convert } from "@/lib/settings";
import {
  AVAILABLE_STATUSES,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_LANGUAGE_LABELS,
  IMAGE_KIND_LABELS,
  fmtBytes,
  fmtDate,
  money,
  netPrice,
  pct,
  toNum,
} from "@/lib/format";
import { Gallery } from "@/components/gallery";
import { ProductActions } from "@/components/product-actions";
import { StatusText, fileUrl } from "@/components/product-card";
import { DocumentUpload } from "@/components/document-upload";
import { ProductForm } from "@/components/product-form";
import { ConfigurationForm } from "@/components/configuration-form";
import { ImageUploadForm } from "@/components/image-upload";
import { ReserveForm } from "@/components/reserve-form";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, EmptyState, KeyValue } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteConfiguration, deleteProductImage, saveConfiguration, setMainImage, updateProduct, uploadProductImages } from "../actions";
import { linkDocument, unlinkDocument } from "../../documenti/actions";

const TABS = [
  ["panoramica", "Panoramica"],
  ["galleria", "Galleria"],
  ["composizioni", "Composizioni"],
  ["materiali", "Materiali & Colori"],
  ["disponibilita", "Disponibilità"],
  ["prezzi", "Prezzi"],
  ["documenti", "Cataloghi & Documenti"],
] as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.productModel.findUnique({ where: { id }, select: { name: true } });
  return { title: p?.name ?? "Prodotto" };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("product:view");
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "panoramica";
  await expireReservations();

  const product = await db.productModel.findUnique({
    where: { id },
    include: {
      brand: true,
      category: true,
      images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], include: { configuration: true } },
      configurations: {
        orderBy: { sortOrder: "asc" },
        include: { images: true, compatibility: { include: { material: true, finish: true } }, inventory: { where: { status: { in: AVAILABLE_STATUSES } } } },
      },
      inventory: {
        include: {
          location: true,
          zone: true,
          finish: true,
          material: true,
          transferTo: true,
          images: true,
          reservations: { where: { status: "ACTIVE" }, include: { client: true, createdBy: true } },
        },
        orderBy: [{ location: { sortOrder: "asc" } }, { code: "asc" }],
      },
      documentLinks: {
        where: { document: visibleDocuments(user) },
        include: { document: { include: { currentVersion: true, versions: { orderBy: { version: "desc" } }, links: true } } },
        orderBy: { createdAt: "asc" },
      },
      favorites: { where: { userId: user.id } },
    },
  });
  if (!product || (!product.active && !can(user.role, "product:edit"))) notFound();

  const canEdit = can(user.role, "product:edit");
  const canDocs = can(user.role, "document:manage");
  const canPrices = can(user.role, "price:view");
  const [clients, allProducts, brands, categories, materials, rate] = await Promise.all([
    can(user.role, "inventory:reserve") ? db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    canDocs ? db.productModel.findMany({ where: { active: true }, include: { brand: true }, orderBy: { name: "asc" } }) : [],
    canEdit || canDocs ? db.brand.findMany({ orderBy: { name: "asc" } }) : [],
    canEdit ? db.category.findMany({ orderBy: { name: "asc" } }) : [],
    canEdit ? db.material.findMany({ include: { finishes: true, brand: true }, orderBy: { name: "asc" } }) : [],
    getExchangeRate(),
  ]);

  const visibleInventory = product.inventory.filter((i) => i.status !== "VENDUTO");
  const availableItems = visibleInventory.filter((i) => AVAILABLE_STATUSES.includes(i.status) || i.status === "RISERVATO");
  const inStock = visibleInventory.filter((i) => AVAILABLE_STATUSES.includes(i.status));
  const reservable = availableItems.map((i) => {
    const reserved = i.reservations.reduce((s, r) => s + r.quantity, 0);
    return {
      id: i.id,
      label: `${i.location.name} — ${i.composition ?? "Pezzo"} · ${i.materialsDescription ?? ""} (${i.code})`,
      available: i.quantity - reserved,
    };
  });
  const quoteOptions = [
    ...inStock.map((i) => ({
      value: `stock:${i.id}`,
      label: `${i.composition ?? product.name} · ${i.location.name}`,
      sub: `${i.materialsDescription ?? ""}${canPrices && i.price ? ` · ${money(netPrice(i), i.currency)}` : ""}`,
      kind: "stock" as const,
    })),
    ...product.configurations.map((c) => ({
      value: `config:${c.id}`,
      label: c.name,
      sub: `${c.dimensions ?? ""}${canPrices ? ` · ${c.price ? money(c.price, c.currency) : "prezzo su richiesta"}` : ""}`,
      kind: "config" as const,
    })),
    { value: "base:", label: product.name, sub: "Modello senza composizione specifica", kind: "base" as const },
  ];
  const firstDoc = product.documentLinks.find((l) => l.document.currentVersion);
  const catalogHref = firstDoc ? `/documenti/${firstDoc.documentId}${firstDoc.startPage ? `?pagina=${firstDoc.startPage}` : ""}` : null;

  const galleryImages = product.images.map((img) => ({
    id: img.id,
    src: fileUrl(img.storageKey),
    kind: img.kind,
    kindLabel: IMAGE_KIND_LABELS[img.kind],
    caption: img.caption,
    credit: img.credit,
    w: img.width,
    h: img.height,
  }));

  // Manufacturer options: union of compatibility across configurations.
  const optionMap = new Map<string, { material: { id: string; name: string; type: string }; finishes: Map<string, { name: string; hexColor: string }> }>();
  for (const c of product.configurations) {
    for (const comp of c.compatibility) {
      const entry = optionMap.get(comp.materialId) ?? { material: comp.material, finishes: new Map() };
      if (comp.finish) entry.finishes.set(comp.finish.id, comp.finish);
      optionMap.set(comp.materialId, entry);
    }
  }
  const productOptions = [...optionMap.values()];

  return (
    <div className="animate-fadein pb-28 lg:pb-0">
      <Link href="/prodotti" className="mb-5 hidden items-center gap-2 text-[15px] text-ink hover:text-soft lg:inline-flex">
        <ArrowLeft size={17} /> Torna ai prodotti
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="relative -mt-5 sm:-mt-7 lg:col-span-7 lg:mt-0">
          <Gallery images={galleryImages} name={product.name} />
          <Link href="/prodotti" className="pressable absolute left-0 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur lg:hidden" aria-label="Torna ai prodotti">
            <ArrowLeft size={18} />
          </Link>
        </div>
        <div className="lg:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{product.brand.name}</p>
              <h1 className="mt-1 text-[36px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[46px]">{product.name}</h1>
              <p className="text-[17px] text-soft">{product.category.name}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {product.isDemo && <DemoBadge />}
              {!product.active && <Badge tone="danger">Archiviato</Badge>}
              {canEdit && (
                <ModalButton label={<Pencil size={16} />} title="Modifica prodotto" className="rounded-full border border-line bg-white p-2.5 hover:border-ink/30" wide>
                  <ProductForm
                    action={updateProduct.bind(null, product.id)}
                    brands={brands}
                    categories={categories}
                    values={{
                      name: product.name,
                      code: product.code,
                      brandId: product.brandId,
                      categoryId: product.categoryId,
                      designer: product.designer,
                      year: product.year,
                      description: product.description,
                      dimensions: product.dimensions,
                      widthCm: product.widthCm,
                      depthCm: product.depthCm,
                      heightCm: product.heightCm,
                      listPrice: product.listPrice ? toNum(product.listPrice) : null,
                      currency: product.currency,
                    }}
                  />
                </ModalButton>
              )}
            </div>
          </div>

          {(() => {
            const piece = inStock[0] ?? visibleInventory[0];
            const facts = [
              ["Misure", piece?.dimensions ?? product.dimensions],
              ["Materiali", piece?.materialsDescription],
              ["Designer", product.designer],
            ].filter((f): f is [string, string] => !!f[1]);
            if (!facts.length) return null;
            return (
              <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {facts.map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-surface px-4 py-2.5">
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                    <dd className="mt-0.5 text-[14px] leading-snug text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            );
          })()}

          <div className="mt-5 rounded-[20px] bg-white p-4 shadow-soft">
            {inStock.length > 0 ? (
              <>
                <p className="text-[15px] text-ink">Disponibile in stock Peverelli</p>
                <p className="mt-0.5 text-sm text-soft">
                  {(() => { const n = inStock.reduce((s, i) => s + i.quantity, 0); return `${n} ${n === 1 ? "pezzo" : "pezzi"}`; })()} · {[...new Set(inStock.map((i) => i.location.name))].join(" · ")}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] text-ink">Disponibile su ordinazione dal produttore</p>
                <p className="mt-0.5 text-sm text-soft">Nessun pezzo fisico disponibile nelle sedi Peverelli.</p>
              </>
            )}
            {canPrices && (
              <p className="mt-3 border-t border-line pt-3 text-[17px]">
                {inStock.some((i) => i.price)
                  ? (() => {
                      const best = inStock.filter((i) => i.price).sort((a, b) => convert(netPrice(a)!, a.currency, "EUR", rate) - convert(netPrice(b)!, b.currency, "EUR", rate))[0];
                      const net = netPrice(best)!;
                      return (
                        <>
                          {inStock.filter((i) => i.price).length > 1 ? "da " : ""}
                          {money(net, best.currency)}
                          {toNum(best.discountPct) > 0 && <span className="ml-2 text-[15px] text-muted line-through">{money(best.price, best.currency)}</span>}
                        </>
                      );
                    })()
                  : product.listPrice
                    ? `Listino indicativo ${money(product.listPrice, product.currency)}`
                    : "Prezzo su richiesta"}
              </p>
            )}
          </div>

          <div className="mt-4">
            <ProductActions
              productId={product.id}
              name={`${product.brand.name} ${product.name}`}
              favorite={product.favorites.length > 0}
              quoteOptions={quoteOptions}
              reservable={reservable}
              clients={clients}
              catalogHref={catalogHref}
              canQuote={can(user.role, "quote:edit")}
              canReserve={can(user.role, "inventory:reserve")}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="no-scrollbar sticky top-[calc(60px+env(safe-area-inset-top))] z-20 -mx-4 mt-10 flex gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-16 lg:mx-0 lg:px-0" aria-label="Sezioni prodotto">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`?tab=${key}`}
            scroll={false}
            replace
            className={cn("whitespace-nowrap border-b-2 px-3 py-3.5 text-[15px] transition", tab === key ? "border-ink text-ink" : "border-transparent text-soft hover:text-ink")}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "panoramica" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="whitespace-pre-line text-[17px] leading-relaxed text-ink">{product.description || "Nessuna descrizione."}</p>
              {product.isDemo && (
                <p className="mt-4 flex gap-2 rounded-2xl bg-selected px-4 py-3 text-sm text-soft">
                  <Info size={16} className="mt-0.5 shrink-0" /> Dati dimostrativi: descrizione, dimensioni, composizioni e prezzi non provengono da fonti ufficiali e vanno verificati.
                </p>
              )}
            </div>
            <div className="card px-5 py-2">
              <KeyValue
                items={[
                  ["Brand", product.brand.name],
                  ["Categoria", product.category.name],
                  ["Codice", product.code],
                  ["Designer", product.designer],
                  ["Anno", product.year],
                  ["Dimensioni", product.dimensions],
                  ["Composizioni documentate", product.configurations.length],
                  ["Pezzi in stock", inStock.reduce((s, i) => s + i.quantity, 0)],
                  ["Documenti", product.documentLinks.length],
                ]}
              />
            </div>
          </div>
        )}

        {tab === "galleria" && (
          <div>
            {canEdit && (
              <div className="mb-4 flex justify-end">
                <ModalButton label={<><Upload size={15} /> Carica immagini</>} title="Carica immagini prodotto" className={buttonClass("primary", "sm")}>
                  <ImageUploadForm action={uploadProductImages.bind(null, product.id)} configurations={product.configurations} />
                </ModalButton>
              </div>
            )}
            {product.images.length === 0 ? (
              <EmptyState title="Nessuna immagine" text="Carica fotografie frontali, laterali, di dettaglio, d'ambiente o dello showroom." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {product.images.map((img) => (
                  <div key={img.id} className="card overflow-hidden">
                    <a href={fileUrl(img.storageKey)} target="_blank" className="block aspect-square bg-surface">
                      <img src={fileUrl(img.storageKey)} alt={img.caption ?? product.name} className="h-full w-full object-contain p-3" loading="lazy" />
                    </a>
                    <div className="border-t border-line p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>{IMAGE_KIND_LABELS[img.kind]}</span>
                        {img.isMain && <Badge>Principale</Badge>}
                      </div>
                      {(img.caption || img.configuration) && (
                        <p className="mt-0.5 truncate text-xs text-muted">{[img.configuration?.name, img.caption].filter(Boolean).join(" · ")}</p>
                      )}
                      {canEdit && (
                        <div className="mt-2 flex gap-1">
                          {!img.isMain && (
                            <ActionButton action={setMainImage.bind(null, img.id)} variant="ghost" size="icon" title="Imposta come principale">
                              <Star size={15} />
                            </ActionButton>
                          )}
                          <ActionButton action={deleteProductImage.bind(null, img.id)} variant="ghost" size="icon" confirm="Eliminare questa immagine?" title="Elimina">
                            <Trash2 size={15} />
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "composizioni" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-soft">Composizioni documentate dal produttore. Il badge indica se esiste un pezzo fisico in stock.</p>
              {canEdit && (
                <ModalButton label={<><Plus size={15} /> Nuova composizione</>} title="Nuova composizione" className={buttonClass("primary", "sm")} wide>
                  <ConfigurationForm action={saveConfiguration.bind(null, product.id, null)} materials={materials} />
                </ModalButton>
              )}
            </div>
            {product.configurations.length === 0 ? (
              <EmptyState title="Nessuna composizione documentata" text="Aggiungi le composizioni presenti nel catalogo ufficiale del produttore." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {product.configurations.map((c) => {
                  const mats = new Map<string, { name: string; finishes: { name: string; hexColor: string }[] }>();
                  for (const comp of c.compatibility) {
                    const e = mats.get(comp.materialId) ?? { name: comp.material.name, finishes: [] };
                    if (comp.finish) e.finishes.push(comp.finish);
                    mats.set(comp.materialId, e);
                  }
                  const stockQty = c.inventory.reduce((s, i) => s + i.quantity, 0);
                  const img = c.images[0];
                  return (
                    <div key={c.id} className="card overflow-hidden">
                      {img && (
                        <div className="aspect-[16/9] border-b border-line bg-surface">
                          <img src={fileUrl(img.storageKey)} alt={c.name} className="h-full w-full object-contain p-3" loading="lazy" />
                        </div>
                      )}
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl">{c.name}</h3>
                            <p className="text-sm text-soft">{c.dimensions ?? "Dimensioni non indicate"}</p>
                          </div>
                          {stockQty > 0 ? <Badge tone="success">In stock · {stockQty}</Badge> : <Badge tone="outline">Solo su ordinazione</Badge>}
                        </div>
                        {canPrices && <p className="mt-3 text-[17px]">{c.price ? money(c.price, c.currency) : "Prezzo su richiesta"}</p>}
                        <div className="mt-4 space-y-2">
                          {[...mats.values()].map((m) => (
                            <div key={m.name}>
                              <p className="text-sm text-soft">{m.name}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {m.finishes.map((f) => (
                                  <span key={f.name} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">
                                    <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: f.hexColor }} />
                                    {f.name}
                                  </span>
                                ))}
                                {m.finishes.length === 0 && <span className="text-xs text-muted">Finiture da catalogo</span>}
                              </div>
                            </div>
                          ))}
                          {mats.size === 0 && <p className="text-sm text-muted">Compatibilità non documentate.</p>}
                        </div>
                        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
                          <Info size={13} className="mt-px shrink-0" /> Fonte: {c.source ?? "non indicata"}
                        </p>
                        {canEdit && (
                          <div className="mt-4 flex gap-2 border-t border-line pt-4">
                            <ModalButton label={<><Pencil size={14} /> Modifica</>} title={`Modifica ${c.name}`} className={buttonClass("secondary", "sm")} wide>
                              <ConfigurationForm
                                action={saveConfiguration.bind(null, product.id, c.id)}
                                materials={materials.map((m) => ({ id: m.id, name: m.name, type: m.type, finishes: m.finishes.map((f) => ({ id: f.id, name: f.name, hexColor: f.hexColor })) }))}
                                values={{
                                  name: c.name,
                                  code: c.code,
                                  dimensions: c.dimensions,
                                  widthCm: c.widthCm,
                                  depthCm: c.depthCm,
                                  heightCm: c.heightCm,
                                  currency: c.currency,
                                  notes: c.notes,
                                  source: c.source,
                                  price: c.price ? toNum(c.price) : null,
                                  finishIds: c.compatibility.filter((x) => x.finishId).map((x) => x.finishId!),
                                  materialIds: [...new Set(c.compatibility.map((x) => x.materialId))],
                                }}
                              />
                            </ModalButton>
                            <ActionButton action={deleteConfiguration.bind(null, c.id)} variant="danger" confirm={`Eliminare la composizione "${c.name}"?`}>
                              <Trash2 size={14} />
                            </ActionButton>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "materiali" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-xl">Opzioni del produttore</h2>
              <p className="mb-4 text-sm text-soft">Materiali e finiture ordinabili, secondo le compatibilità documentate.</p>
              {productOptions.length === 0 ? (
                <p className="card p-5 text-sm text-soft">Nessuna opzione documentata.</p>
              ) : (
                <div className="space-y-3">
                  {productOptions.map((o) => (
                    <div key={o.material.id} className="card p-5">
                      <p className="text-[15px]">
                        {o.material.name} <span className="text-muted">· {o.material.type}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4">
                        {[...o.finishes.values()].map((f) => (
                          <div key={f.name} className="flex w-20 flex-col items-center gap-1.5 text-center">
                            <span className="h-14 w-14 rounded-full border border-black/10 shadow-inner" style={{ background: f.hexColor }} />
                            <span className="text-xs text-soft">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h2 className="text-xl">Finiture dei pezzi in stock</h2>
              <p className="mb-4 text-sm text-soft">Materiali reali dei pezzi fisici presenti nelle sedi Peverelli.</p>
              {visibleInventory.length === 0 ? (
                <p className="card p-5 text-sm text-soft">Nessun pezzo fisico in stock.</p>
              ) : (
                <div className="card divide-y divide-line">
                  {visibleInventory.map((i) => (
                    <Link key={i.id} href={`/stock/${i.id}`} className="flex items-center gap-4 p-4 hover:bg-surface">
                      <span className="h-11 w-11 shrink-0 rounded-full border border-black/10" style={{ background: i.finish?.hexColor ?? "#ECEDEF" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px]">{i.materialsDescription ?? [i.material?.name, i.finish?.name].filter(Boolean).join(" / ")}</p>
                        <p className="text-sm text-soft">
                          {i.location.name} · {i.composition}
                        </p>
                      </div>
                      <span className="text-sm">
                        <StatusText status={i.status} />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "disponibilita" && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-5">
                <p className="eyebrow">Disponibile in stock Peverelli</p>
                <p className="mt-2 text-3xl font-normal">{inStock.reduce((s, i) => s + i.quantity, 0)}</p>
                <p className="text-sm text-soft">pezzi fisici esposti o disponibili</p>
              </div>
              <div className="card p-5">
                <p className="eyebrow">Disponibile su ordinazione</p>
                <p className="mt-2 text-3xl font-normal">{product.configurations.length}</p>
                <p className="text-sm text-soft">composizioni ordinabili dal produttore</p>
              </div>
            </div>
            {visibleInventory.length === 0 ? (
              <EmptyState title="Nessun pezzo fisico" text="Questo modello non è presente nelle sedi Peverelli: è disponibile solo su ordinazione dal produttore." />
            ) : (
              <div className="card divide-y divide-line">
                {visibleInventory.map((i) => {
                  const reserved = i.reservations.reduce((s, r) => s + r.quantity, 0);
                  return (
                    <div key={i.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                      <Link href={`/stock/${i.id}`} className="min-w-0 flex-1">
                        <p className="text-[17px]">
                          {i.location.name} — <StatusText status={i.status} />
                          {i.status === "IN_TRASFERIMENTO" && i.transferTo && <span className="text-soft"> → {i.transferTo.name}</span>}
                        </p>
                        <p className="text-sm text-soft">
                          {[i.zone?.name, i.composition, i.materialsDescription].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-xs text-muted">
                          {i.code} · Quantità {i.quantity}
                          {reserved > 0 && ` · ${reserved} riservat${reserved === 1 ? "o" : "i"}`}
                          {i.isDemo && " · dato dimostrativo"}
                        </p>
                        {i.reservations.map((r) => (
                          <p key={r.id} className="mt-1 text-xs text-warning">
                            Riservato per {r.client.name} fino al {fmtDate(r.expiresAt)}
                          </p>
                        ))}
                      </Link>
                      <div className="flex items-center gap-3">
                        {canPrices && i.price && <span className="text-[15px]">{money(netPrice(i), i.currency)}</span>}
                        {can(user.role, "inventory:reserve") && (AVAILABLE_STATUSES.includes(i.status) || (i.status === "RISERVATO" && i.quantity > reserved)) && (
                          <ModalButton label="Riserva" title="Riserva prodotto" className={buttonClass("secondary", "sm")}>
                            <ReserveForm items={reservable} clients={clients} defaultItemId={i.id} />
                          </ModalButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "prezzi" &&
          (!canPrices ? (
            <EmptyState title="Prezzi non visibili" text="Il tuo ruolo non prevede l'accesso ai prezzi." />
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-soft">
                Cambio applicato: 1 EUR = {rate.eurToChf.toFixed(4)} CHF ·{" "}
                {rate.source === "BCE" ? `tasso di riferimento BCE verificato del ${rate.referenceDate}` : "tasso configurato manualmente"}
              </p>
              <div className="card divide-y divide-line">
                <PriceRow label="Listino indicativo (modello)" value={product.listPrice ? toNum(product.listPrice) : null} currency={product.currency} rate={rate} />
                {product.configurations.map((c) => (
                  <PriceRow key={c.id} label={`Composizione · ${c.name}`} value={c.price ? toNum(c.price) : null} currency={c.currency} rate={rate} />
                ))}
              </div>
              <div>
                <h3 className="eyebrow mb-3">Pezzi in stock</h3>
                <div className="card divide-y divide-line">
                  {visibleInventory.length === 0 && <p className="p-5 text-sm text-soft">Nessun pezzo in stock.</p>}
                  {visibleInventory.map((i) => {
                    const gross = i.price ? toNum(i.price) : null;
                    const net = gross !== null ? gross * (1 - toNum(i.discountPct) / 100) : null;
                    return (
                      <PriceRow
                        key={i.id}
                        label={`${i.location.name} · ${i.composition ?? ""} (${i.code})`}
                        value={net}
                        currency={i.currency}
                        rate={rate}
                        note={toNum(i.discountPct) > 0 && gross ? `Prezzo pieno ${money(gross, i.currency)} · sconto ${pct(i.discountPct)}` : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

        {tab === "documenti" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-soft">Cataloghi ufficiali, schede tecniche e documentazione del produttore.</p>
              {canDocs && (
                <div className="flex flex-wrap gap-2">
                  <ModalButton label={<>Collega esistente</>} title="Collega un documento esistente" className={buttonClass("secondary", "sm")}>
                    <LinkExisting productId={product.id} userIsManager={can(user.role, "document:confidential")} />
                  </ModalButton>
                  <DocumentUpload
                    products={allProducts.map((p) => ({ id: p.id, name: p.name, brand: p.brand.name }))}
                    brands={brands}
                    defaultProductIds={[product.id]}
                    defaultBrandId={product.brandId}
                    canConfidential={can(user.role, "document:confidential")}
                    trigger={
                      <span className={buttonClass("primary", "sm")}>
                        <Plus size={15} /> Carica documento
                      </span>
                    }
                  />
                </div>
              )}
            </div>
            {product.documentLinks.length === 0 ? (
              <EmptyState
                title="Nessun documento"
                text={canDocs ? "Carica il catalogo del produttore: sarà consultabile da tutti i consulenti." : "Non sono ancora stati caricati documenti per questo prodotto."}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {product.documentLinks.map((l) => {
                  const d = l.document;
                  const v = d.currentVersion;
                  return (
                    <div key={d.id} className="card p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-[10px] font-medium tracking-wider text-soft">PDF</div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/documenti/${d.id}${l.startPage ? `?pagina=${l.startPage}` : ""}`} className="text-[17px] leading-snug hover:underline">
                            {d.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge>{DOCUMENT_CATEGORY_LABELS[d.category]}</Badge>
                            <Badge tone="outline">{DOCUMENT_LANGUAGE_LABELS[d.language]}</Badge>
                            {d.confidential && (
                              <Badge tone="warning">
                                <Lock size={11} /> Riservato
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            {v ? `v${v.version} · ${fmtBytes(v.sizeBytes)}${v.pageCount ? ` · ${v.pageCount} pagine` : ""} · ${fmtDate(v.createdAt)}` : "Nessun file"}
                            {l.startPage && ` · da pag. ${l.startPage}`}
                            {d.links.length > 1 && ` · condiviso con ${d.links.length - 1} altri prodotti`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href={`/documenti/${d.id}${l.startPage ? `?pagina=${l.startPage}` : ""}`} className={buttonClass("primary", "sm")}>
                          <BookOpen size={14} /> Apri
                        </Link>
                        <a href={`/api/documents/${d.id}/file?download=1`} className={buttonClass("secondary", "sm")}>
                          <Download size={14} /> Scarica
                        </a>
                        {canDocs && (
                          <>
                            <Link href={`/documenti/${d.id}?gestisci=1`} className={buttonClass("ghost", "sm")}>
                              <ExternalLink size={14} /> Gestisci
                            </Link>
                            <ActionButton action={unlinkDocument.bind(null, d.id, product.id)} variant="ghost" confirm="Scollegare il documento da questo prodotto? Il file resta disponibile negli altri prodotti." title="Scollega">
                              <Trash2 size={14} />
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceRow({ label, value, currency, rate, note }: { label: string; value: number | null; currency: "EUR" | "CHF"; rate: Awaited<ReturnType<typeof getExchangeRate>>; note?: string }) {
  const other = currency === "EUR" ? "CHF" : "EUR";
  return (
    <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[15px]">{value === null ? "Su richiesta" : money(value, currency)}</p>
        {value !== null && <p className="text-xs text-muted">≈ {money(convert(value, currency, other, rate), other)}</p>}
      </div>
    </div>
  );
}

async function LinkExisting({ productId, userIsManager }: { productId: string; userIsManager: boolean }) {
  const docs = await db.document.findMany({
    where: { ...(userIsManager ? {} : { confidential: false }), links: { none: { productModelId: productId } } },
    include: { brand: true },
    orderBy: { title: "asc" },
  });
  if (!docs.length) return <p className="text-sm text-soft">Non ci sono altri documenti da collegare.</p>;
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <ActionForm key={d.id} action={linkDocument.bind(null, d.id)} className="flex items-center gap-2 rounded-2xl border border-line bg-white p-3">
          <input type="hidden" name="productIds" value={productId} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px]">{d.title}</p>
            <p className="text-xs text-muted">
              {DOCUMENT_CATEGORY_LABELS[d.category]} {d.brand && `· ${d.brand.name}`}
            </p>
          </div>
          <input name={`startPage_${productId}`} type="number" min={1} placeholder="Pag." className="w-20 rounded-full border border-line px-3 py-1.5 text-sm" />
          <SubmitButton size="sm">Collega</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}

