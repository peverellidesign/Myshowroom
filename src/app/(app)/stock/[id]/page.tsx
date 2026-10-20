import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Bookmark, Camera, Pencil, Plus, Trash2 } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { inventoryFormOptions } from "@/lib/inventory-options";
import { IMAGE_KIND_LABELS, INVENTORY_STATUS_LABELS, fmtDate, fmtDateTime, money, pct, toNum } from "@/lib/format";
import { Gallery } from "@/components/gallery";
import { StatusText, fileUrl } from "@/components/product-card";
import { InventoryForm } from "@/components/inventory-form";
import { ReserveForm } from "@/components/reserve-form";
import { ImageUploadForm } from "@/components/image-upload";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, KeyValue } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { addToQuotation } from "../../preventivi/actions";
import { confirmArrival, deleteInventoryImage, markSold, release, setInventoryStatus, startTransfer, updateInventoryItem, uploadInventoryImages } from "../actions";

export const metadata = { title: "Pezzo in stock" };

const RESERVATION_LABELS = { ACTIVE: "Attiva", RELEASED: "Rilasciata", EXPIRED: "Scaduta", CONVERTED: "Venduto" } as const;

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("inventory:view");
  const { id } = await params;
  await expireReservations();
  const item = await db.inventoryItem.findUnique({
    where: { id },
    include: {
      productModel: { include: { brand: true, category: true, images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }] } } },
      configuration: true,
      location: true,
      zone: true,
      material: true,
      finish: true,
      transferTo: true,
      images: { orderBy: { sortOrder: "asc" } },
      reservations: { include: { client: true, createdBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) notFound();
  const canEdit = can(user.role, "inventory:edit");
  const canReserve = can(user.role, "inventory:reserve");
  const canPrices = can(user.role, "price:view");
  const [opts, clients, locations, history] = await Promise.all([
    canEdit ? inventoryFormOptions() : null,
    canReserve ? db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.location.findMany({ where: { active: true, id: { not: item.locationId } }, include: { zones: true }, orderBy: { sortOrder: "asc" } }),
    db.auditLog.findMany({ where: { entity: "InventoryItem", entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const active = item.reservations.filter((r) => r.status === "ACTIVE");
  const reserved = active.reduce((s, r) => s + r.quantity, 0);
  const available = ["ESPOSTO", "DISPONIBILE", "RISERVATO"].includes(item.status) ? item.quantity - reserved : 0;
  const images = [
    ...item.images.map((img) => ({ id: img.id, src: fileUrl(img.storageKey), kind: "REALE", kindLabel: "Foto reale", caption: img.caption, w: img.width, h: img.height })),
    ...item.productModel.images.map((img) => ({ id: img.id, src: fileUrl(img.storageKey), kind: img.kind, kindLabel: IMAGE_KIND_LABELS[img.kind], caption: img.caption, credit: img.credit, w: img.width, h: img.height })),
  ];
  const net = item.price ? toNum(item.price) * (1 - toNum(item.discountPct) / 100) : null;
  const manualStatuses: InventoryStatus[] = ["ESPOSTO", "DISPONIBILE", "VENDUTO", "NON_DISPONIBILE"];

  return (
    <div className="animate-fadein">
      <Link href={`/stock?sede=${item.locationId}`} className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> {item.location.name}
      </Link>
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <Gallery images={images} name={item.productModel.name} showKinds={false} />
          {canEdit && item.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.images.map((img) => (
                <ActionButton key={img.id} action={deleteInventoryImage.bind(null, img.id)} confirm="Eliminare questa foto?" variant="ghost">
                  <Trash2 size={13} /> Foto {img.sortOrder + 1}
                </ActionButton>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{item.productModel.brand.name}</p>
              <h1 className="mt-1 text-[36px] leading-tight tracking-[-0.02em]">{item.productModel.name}</h1>
              <p className="text-[17px] text-soft">{item.composition ?? item.configuration?.name ?? item.productModel.category.name}</p>
            </div>
            {item.isDemo && <DemoBadge />}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white p-4">
            <p className="text-[17px]">
              {item.location.name} — <StatusText status={item.status} />
              {item.transferTo && <span className="text-soft"> → {item.transferTo.name}</span>}
            </p>
            <p className="text-sm text-soft">
              {available > 0 ? `${available} di ${item.quantity} disponibil${available === 1 ? "e" : "i"}` : item.status === "VENDUTO" ? "Venduto" : "Nessun pezzo libero"}
            </p>
            {canPrices && net !== null && (
              <p className="mt-3 border-t border-line pt-3 text-xl">
                {money(net, item.currency)}
                {toNum(item.discountPct) > 0 && (
                  <span className="ml-2 text-sm text-muted line-through">{money(item.price, item.currency)}</span>
                )}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {canReserve && available > 0 && (
              <ModalButton label={<><Bookmark size={16} /> Riserva</>} title="Riserva prodotto" className={buttonClass("primary", "md", "col-span-2 sm:col-span-1")}>
                <ReserveForm items={[{ id: item.id, label: `${item.location.name} — ${item.code}`, available }]} clients={clients} defaultItemId={item.id} />
              </ModalButton>
            )}
            {can(user.role, "quote:edit") && item.status !== "VENDUTO" && (
              <ActionButton action={addToQuotation.bind(null, { productModelId: item.productModelId, inventoryItemId: item.id })} variant="secondary" size="md" className="col-span-2 sm:col-span-1">
                <Plus size={16} /> Aggiungi al preventivo
              </ActionButton>
            )}
            {canEdit && opts && (
              <ModalButton label={<><Pencil size={15} /> Modifica</>} title="Modifica pezzo" className={buttonClass("secondary", "md")} wide>
                <InventoryForm
                  action={updateInventoryItem.bind(null, item.id)}
                  {...opts}
                  values={{
                    productModelId: item.productModelId,
                    configurationId: item.configurationId,
                    composition: item.composition,
                    materialId: item.materialId,
                    finishId: item.finishId,
                    materialsDescription: item.materialsDescription,
                    dimensions: item.dimensions,
                    quantity: item.quantity,
                    locationId: item.locationId,
                    zoneId: item.zoneId,
                    baseStatus: item.baseStatus,
                    currency: item.currency,
                    notes: item.notes,
                    price: item.price ? toNum(item.price) : null,
                    discountPct: toNum(item.discountPct),
                  }}
                />
              </ModalButton>
            )}
            {canEdit && ["ESPOSTO", "DISPONIBILE", "RISERVATO"].includes(item.status) && (
              <ModalButton label={<><ArrowRightLeft size={15} /> Trasferisci</>} title="Trasferisci pezzo" className={buttonClass("secondary", "md")}>
                <ActionForm action={startTransfer.bind(null, item.id)} className="space-y-4">
                  <label className="block">
                    <span className="label">Destinazione</span>
                    <select name="transferToId" className="field" required defaultValue="">
                      <option value="" disabled>
                        Seleziona sede…
                      </option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-start gap-3 text-[15px]">
                    <input type="checkbox" name="immediate" value="1" className="mt-1 h-5 w-5 accent-[#222]" />
                    <span>
                      Spostamento immediato
                      <span className="block text-sm text-soft">Altrimenti il pezzo resta «In trasferimento» fino alla conferma di arrivo.</span>
                    </span>
                  </label>
                  <SubmitButton className="w-full">Registra trasferimento</SubmitButton>
                </ActionForm>
              </ModalButton>
            )}
            {canEdit && item.status === "IN_TRASFERIMENTO" && (
              <ActionButton action={confirmArrival.bind(null, item.id)} variant="primary" size="md">
                Conferma arrivo
              </ActionButton>
            )}
            {canEdit && (
              <ModalButton label={<><Camera size={15} /> Foto reali</>} title="Carica foto reali" className={buttonClass("secondary", "md")}>
                <ImageUploadForm action={uploadInventoryImages.bind(null, item.id)} withKind={false} />
              </ModalButton>
            )}
          </div>
          {canEdit && active.length === 0 && item.status !== "IN_TRASFERIMENTO" && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Cambia stato</p>
              <div className="flex flex-wrap gap-2">
                {manualStatuses
                  .filter((s) => s !== item.status)
                  .map((s) => (
                    <ActionButton key={s} action={setInventoryStatus.bind(null, item.id, s)} confirm={`Impostare lo stato «${INVENTORY_STATUS_LABELS[s]}»?`}>
                      {INVENTORY_STATUS_LABELS[s]}
                    </ActionButton>
                  ))}
              </div>
            </div>
          )}

          <div className="card mt-5 px-5 py-2">
            <KeyValue
              items={[
                ["Codice inventario", item.code],
                ["Composizione", item.composition ?? item.configuration?.name],
                ["Materiali e finiture", item.materialsDescription ?? [item.material?.name, item.finish?.name].filter(Boolean).join(" / ")],
                ["Dimensioni", item.dimensions ?? item.configuration?.dimensions],
                ["Quantità", item.quantity],
                ["Sede", item.location.name],
                ["Zona", item.zone?.name],
                ...(canPrices ? ([["Sconto", pct(item.discountPct)]] as [string, string][]) : []),
                ["Modello", <Link key="m" href={`/prodotti/${item.productModelId}`} className="link-quiet">Scheda prodotto</Link>],
              ]}
            />
          </div>
          {item.notes && <p className="mt-4 whitespace-pre-line rounded-2xl bg-selected px-4 py-3 text-sm text-soft">{item.notes}</p>}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="eyebrow mb-3">Prenotazioni</h2>
          <div className="card divide-y divide-line">
            {item.reservations.length === 0 && <p className="p-5 text-sm text-soft">Nessuna prenotazione.</p>}
            {item.reservations.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/clienti/${r.clientId}`} className="text-[15px] hover:underline">
                    {r.client.name}
                  </Link>
                  <Badge tone={r.status === "ACTIVE" ? "warning" : "outline"}>{RESERVATION_LABELS[r.status]}</Badge>
                </div>
                <p className="text-sm text-soft">
                  {r.quantity} pz · scadenza {fmtDate(r.expiresAt)} · {r.createdBy.name}
                </p>
                {r.notes && <p className="text-sm text-muted">{r.notes}</p>}
                {r.status === "ACTIVE" && (
                  <div className="mt-2 flex gap-2">
                    {canReserve && (
                      <ActionButton action={release.bind(null, r.id)} confirm="Rilasciare la prenotazione?">
                        Rilascia
                      </ActionButton>
                    )}
                    {canEdit && (
                      <ActionButton action={markSold.bind(null, r.id)} confirm="Registrare la vendita al cliente?" variant="primary">
                        Segna venduto
                      </ActionButton>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="eyebrow mb-3">Movimenti</h2>
          <div className="card divide-y divide-line">
            {history.length === 0 && <p className="p-5 text-sm text-soft">Nessun movimento registrato.</p>}
            {history.map((h) => (
              <div key={h.id} className="p-4">
                <p className="text-[15px]">{h.summary}</p>
                <p className="text-xs text-muted">
                  {fmtDateTime(h.createdAt)} · {h.user?.name ?? "Sistema"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
