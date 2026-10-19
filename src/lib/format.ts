import type {
  AppointmentStatus,
  AppointmentType,
  Currency,
  DocumentCategory,
  DocumentLanguage,
  ImageKind,
  InventoryStatus,
  QuotationStatus,
  TaskPriority,
} from "@prisma/client";

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  ESPOSTO: "Esposto",
  DISPONIBILE: "Disponibile",
  RISERVATO: "Riservato",
  VENDUTO: "Venduto",
  IN_TRASFERIMENTO: "In trasferimento",
  NON_DISPONIBILE: "Non disponibile",
};

/** Statuses that count as "physically available in Peverelli stock". */
export const AVAILABLE_STATUSES: InventoryStatus[] = ["ESPOSTO", "DISPONIBILE"];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  BOZZA: "Bozza",
  INVIATO: "Inviato",
  IN_TRATTATIVA: "In trattativa",
  ACCETTATO: "Accettato",
  RIFIUTATO: "Rifiutato",
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  CATALOGO_PRODOTTO: "Catalogo prodotto",
  CATALOGO_GENERALE: "Catalogo generale",
  SCHEDA_TECNICA: "Scheda tecnica",
  LISTINO_PREZZI: "Listino prezzi",
  MATERIALI_FINITURE: "Materiali e finiture",
  ISTRUZIONI_MONTAGGIO: "Istruzioni di montaggio",
  ALTRO: "Altro",
};

export const DOCUMENT_LANGUAGE_LABELS: Record<DocumentLanguage, string> = {
  IT: "Italiano",
  EN: "Inglese",
  DE: "Tedesco",
  FR: "Francese",
  MULTI: "Multilingua",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  CONSULENZA_ARREDO: "Consulenza arredo",
  PROGETTO_CUCINA: "Progetto cucina",
  INTERIOR_DESIGN: "Interior design",
  VISITA_SHOWROOM: "Visita showroom",
  PRESENTAZIONE_PREVENTIVO: "Presentazione preventivo",
  APPUNTAMENTO_ARCHITETTO: "Appuntamento architetto",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFERMATO: "Confermato",
  ANNULLATO: "Annullato",
  COMPLETATO: "Completato",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  BASSA: "Bassa",
  MEDIA: "Media",
  ALTA: "Alta",
};

export const IMAGE_KIND_LABELS: Record<ImageKind, string> = {
  FRONTALE: "Frontale",
  LATERALE: "Laterale",
  DETTAGLIO: "Dettaglio",
  AMBIENTE: "Ambiente",
  SHOWROOM: "Showroom",
};

type Num = number | string | { toString(): string } | null | undefined;

export function toNum(v: Num): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

export function money(value: Num, currency: Currency | string = "EUR", decimals = 0) {
  if (value === null || value === undefined) return "Su richiesta";
  const n = toNum(value);
  return `${currency} ${n.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
}

const TZ = "Europe/Zurich";

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts });
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
