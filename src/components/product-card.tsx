import Link from "next/link";
import { MapPin } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { INVENTORY_STATUS_LABELS, money } from "@/lib/format";
import { DemoBadge } from "./ui/misc";
import { cn } from "@/lib/utils";

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

export function ProductImg({
  storageKey,
  alt,
  className,
  eager,
  cover,
}: {
  storageKey?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  cover?: boolean;
}) {
  if (!storageKey) {
    return (
      <div className={cn("flex items-center justify-center bg-[#EFEDE8] text-[11px] uppercase tracking-[0.2em] text-muted", className)}>
        Nessuna immagine
      </div>
    );
  }
  return <img src={fileUrl(storageKey)} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={cn(cover ? "object-cover" : "object-contain", className)} />;
}

const STATUS_TONE: Record<InventoryStatus, string> = {
  ESPOSTO: "text-ink",
  DISPONIBILE: "text-[#3F5A3A]",
  RISERVATO: "text-[#7A5B24]",
  VENDUTO: "text-muted",
  IN_TRASFERIMENTO: "text-[#4A5A7A]",
  NON_DISPONIBILE: "text-muted",
};

const STATUS_DOT: Record<InventoryStatus, string> = {
  ESPOSTO: "bg-ink",
  DISPONIBILE: "bg-[#5E8A55]",
  RISERVATO: "bg-[#C09040]",
  VENDUTO: "bg-muted",
  IN_TRASFERIMENTO: "bg-[#6A7FA8]",
  NON_DISPONIBILE: "bg-muted",
};

export function StatusText({ status }: { status: InventoryStatus }) {
  return <span className={STATUS_TONE[status]}>{INVENTORY_STATUS_LABELS[status]}</span>;
}

export function StatusPill({ status, className }: { status: InventoryStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm backdrop-blur", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {INVENTORY_STATUS_LABELS[status]}
    </span>
  );
}

export type CardProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  isDemo: boolean;
  image: { storageKey: string } | null;
  inStock: boolean;
  statuses: InventoryStatus[];
  locations: { id: string; name: string }[];
  price: { v: number; c: string; list?: number | null } | null;
};

function mainStatus(p: CardProduct) {
  return p.statuses.includes("ESPOSTO") ? "ESPOSTO" : p.statuses.includes("DISPONIBILE") ? "DISPONIBILE" : p.statuses[0];
}

function Price({ p, large }: { p: CardProduct; large?: boolean }) {
  if (!p.price) return <span className="text-[14px] text-soft">Prezzo su richiesta</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={cn("text-ink", large ? "text-[17px]" : "text-[15px]")}>{money(p.price.v, p.price.c)}</span>
      {p.price.list && <span className="text-[12.5px] text-muted line-through">{money(p.price.list, p.price.c)}</span>}
    </span>
  );
}

export function ProductCard({ p, compact, width }: { p: CardProduct; compact?: boolean; width?: string }) {
  const status = mainStatus(p);
  if (compact) {
    return (
      <Link href={`/prodotti/${p.id}`} className="pressable flex items-center gap-4 rounded-[20px] bg-white p-2.5 pr-4 shadow-soft">
        <ProductImg storageKey={p.image?.storageKey} alt={p.name} cover className="h-[84px] w-[84px] shrink-0 rounded-[14px] bg-[#EFEDE8]" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow truncate">{p.brand}</div>
          <div className="truncate text-[16px] text-ink">{p.name}</div>
          <div className="mt-0.5 truncate text-[13px] text-soft">
            {status ? <StatusText status={status} /> : "Su ordinazione"}
            {p.locations.length > 0 && ` · ${p.locations.map((l) => l.name).join(", ")}`}
          </div>
          <div className="mt-0.5">
            <Price p={p} />
          </div>
        </div>
      </Link>
    );
  }
  const discount = p.price?.list ? Math.round((1 - p.price.v / p.price.list) * 100) : 0;
  return (
    <Link href={`/prodotti/${p.id}`} className={cn("pressable group block", width)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[#EFEDE8]">
        <ProductImg storageKey={p.image?.storageKey} alt={p.name} cover className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.03]" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          {status ? <StatusPill status={status} /> : <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-soft shadow-sm">Su ordinazione</span>}
          <div className="flex flex-col items-end gap-1">
            {discount >= 5 && <span className="rounded-full bg-charcoal px-2 py-1 text-[11px] font-medium text-white">−{discount}%</span>}
            {p.isDemo && <DemoBadge className="bg-white/85" />}
          </div>
        </div>
      </div>
      <div className="px-1 pt-3">
        <div className="eyebrow truncate">{p.brand}</div>
        <div className="mt-0.5 truncate text-[16px] leading-snug text-ink sm:text-[17px]">{p.name}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-soft">
          <MapPin size={12} strokeWidth={1.6} className="shrink-0" />
          <span className="truncate">{p.locations.length ? p.locations.map((l) => l.name).join(" · ") : "Ordinabile dal produttore"}</span>
        </div>
        <div className="mt-1.5">
          <Price p={p} large />
        </div>
      </div>
    </Link>
  );
}
