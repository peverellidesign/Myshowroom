import Link from "next/link";
import { MapPin } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { INVENTORY_STATUS_LABELS, money } from "@/lib/format";
import { DemoBadge } from "./ui/misc";
import { cn } from "@/lib/utils";

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

/**
 * Photo that adapts to its frame: crops (cover) when the photo's proportions are close
 * to the frame's, otherwise shows the whole photo over a soft blurred copy of itself,
 * so wide sofas in portrait cards are never cut and nothing shows empty bands.
 */
export function ProductImg({
  storageKey,
  alt,
  className,
  eager,
  cover,
  w,
  h,
  frame,
}: {
  storageKey?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  cover?: boolean;
  w?: number | null;
  h?: number | null;
  /** Frame aspect ratio (width / height), e.g. 0.8 for a 4:5 card. */
  frame?: number;
}) {
  if (!storageKey) {
    return (
      <div className={cn("flex items-center justify-center bg-mist text-[11px] uppercase tracking-[0.2em] text-muted", className)}>
        Nessuna immagine
      </div>
    );
  }
  return <SmartPhoto src={fileUrl(storageKey)} alt={alt} className={className} eager={eager} cover={cover} w={w} h={h} frame={frame} />;
}

export function SmartPhoto({
  src,
  alt,
  className,
  eager,
  cover = true,
  w,
  h,
  frame,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  cover?: boolean;
  w?: number | null;
  h?: number | null;
  frame?: number;
}) {
  const fits = !frame || !w || !h || Math.abs(Math.log(w / h / frame)) <= Math.log(1.32);
  if (!cover || fits) {
    return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={cn(cover ? "object-cover" : "object-contain", className)} />;
  }
  return (
    <span className={cn("block overflow-hidden", className)}>
      <img src={src} alt="" aria-hidden loading={eager ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-80 blur-2xl saturate-[0.85]" />
      <span className="absolute inset-0 bg-white/10" />
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.12)]" />
    </span>
  );
}

/** Natural aspect ratio of a photo, kept within calm limits (portrait 3:4 … landscape 3:2). */
export function photoRatio(w?: number | null, h?: number | null, fallback = 0.8) {
  if (!w || !h) return fallback;
  return Math.min(1.5, Math.max(0.74, w / h));
}

const STATUS_TONE: Record<InventoryStatus, string> = {
  ESPOSTO: "text-ink",
  DISPONIBILE: "text-success",
  RISERVATO: "text-warning",
  VENDUTO: "text-muted",
  IN_TRASFERIMENTO: "text-info",
  NON_DISPONIBILE: "text-muted",
};

const STATUS_DOT: Record<InventoryStatus, string> = {
  ESPOSTO: "bg-ink",
  DISPONIBILE: "bg-[#3E8E5E]",
  RISERVATO: "bg-[#C08A2E]",
  VENDUTO: "bg-muted",
  IN_TRASFERIMENTO: "bg-info",
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
  image: { storageKey: string; width?: number | null; height?: number | null } | null;
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

export function ProductCard({ p, compact, height }: { p: CardProduct; compact?: boolean; /** Fixed photo height in px (carousels): width follows the photo. */ height?: number }) {
  const status = mainStatus(p);
  if (compact) {
    return (
      <Link href={`/prodotti/${p.id}`} className="pressable flex items-center gap-4 rounded-[20px] bg-white p-2.5 pr-4 shadow-soft">
        <ProductImg storageKey={p.image?.storageKey} alt={p.name} cover className="h-[84px] w-[84px] shrink-0 rounded-[14px] bg-mist" />
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
  const ratio = photoRatio(p.image?.width, p.image?.height);
  const frameStyle = height ? { height, width: Math.round(height * ratio) } : { aspectRatio: String(ratio) };
  return (
    <Link href={`/prodotti/${p.id}`} className="pressable group block break-inside-avoid" style={height ? { width: frameStyle.width } : undefined}>
      <div className="relative overflow-hidden rounded-[20px] bg-mist" style={frameStyle}>
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

/** Masonry layout: every card keeps its photo's proportions. */
export function ProductMasonry({ children }: { children: React.ReactNode }) {
  return <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 xl:columns-4 [&>*]:mb-7">{children}</div>;
}
