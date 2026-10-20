import Link from "next/link";
import { MapPin } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { INVENTORY_STATUS_LABELS, money } from "@/lib/format";
import { DemoBadge } from "./ui/misc";
import { cn } from "@/lib/utils";

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

export function ProductImg({ storageKey, alt, className, eager }: { storageKey?: string | null; alt: string; className?: string; eager?: boolean }) {
  if (!storageKey) {
    return (
      <div className={cn("flex items-center justify-center bg-[#F4F3F0] text-xs uppercase tracking-[0.2em] text-muted", className)}>
        Nessuna immagine
      </div>
    );
  }
  return <img src={fileUrl(storageKey)} alt={alt} loading={eager ? "eager" : "lazy"} className={cn("object-contain", className)} />;
}

export function StatusText({ status }: { status: InventoryStatus }) {
  const tone: Record<InventoryStatus, string> = {
    ESPOSTO: "text-ink",
    DISPONIBILE: "text-[#3F5A3A]",
    RISERVATO: "text-[#7A5B24]",
    VENDUTO: "text-muted",
    IN_TRASFERIMENTO: "text-[#4A5A7A]",
    NON_DISPONIBILE: "text-muted",
  };
  return <span className={tone[status]}>{INVENTORY_STATUS_LABELS[status]}</span>;
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

export function ProductCard({ p, compact }: { p: CardProduct; compact?: boolean }) {
  const status = p.statuses.includes("ESPOSTO") ? "ESPOSTO" : p.statuses.includes("DISPONIBILE") ? "DISPONIBILE" : p.statuses[0];
  if (compact) {
    return (
      <Link href={`/prodotti/${p.id}`} className="card flex items-center gap-4 p-3 transition hover:border-ink/25">
        <ProductImg storageKey={p.image?.storageKey} alt={p.name} className="h-20 w-24 shrink-0 rounded-xl bg-[#F7F7F5]" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{p.brand}</div>
          <div className="truncate text-[17px] text-ink">{p.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-soft">
            <span>{p.category}</span>
            {p.locations.length > 0 && <span>{p.locations.map((l) => l.name).join(" · ")}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-[15px]">
            {p.price?.list && <span className="mr-2 text-sm text-muted line-through">{money(p.price.list, p.price.c)}</span>}
            {p.price ? money(p.price.v, p.price.c) : "Su richiesta"}
          </div>
          <div className="text-sm">{status ? <StatusText status={status} /> : <span className="text-muted">Su ordinazione</span>}</div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/prodotti/${p.id}`} className="card group flex flex-col overflow-hidden transition hover:border-ink/25">
      <div className="relative aspect-[4/3] border-b border-line bg-[#F7F7F5]">
        <ProductImg storageKey={p.image?.storageKey} alt={p.name} className="absolute inset-0 h-full w-full p-4 transition duration-500 group-hover:scale-[1.02]" />
        {p.isDemo && <DemoBadge className="absolute right-3 top-3 bg-white/80" />}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="eyebrow">{p.brand}</div>
        <div className="mt-1 text-[19px] leading-tight text-ink">{p.name}</div>
        <div className="mt-2 flex items-center gap-1.5 text-[15px] text-soft">
          <MapPin size={15} strokeWidth={1.5} />
          {p.locations.length ? p.locations.map((l) => l.name).join(" · ") : "Non in stock"}
        </div>
        <div className="mt-1 text-[15px] text-soft">{status ? <StatusText status={status} /> : "Disponibile su ordinazione"}</div>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="text-[17px] text-ink">{p.price ? money(p.price.v, p.price.c) : "Prezzo su richiesta"}</span>
          {p.price?.list && <span className="text-sm text-muted line-through">{money(p.price.list, p.price.c)}</span>}
        </div>
      </div>
    </Link>
  );
}
