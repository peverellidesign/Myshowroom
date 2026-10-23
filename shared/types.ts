// Tipi condivisi tra frontend e backend — myshowroom by Peverelli Design

export type Currency = 'CHF' | 'EUR';
export type Role = 'admin' | 'manager' | 'consultant';
export const ROLES: Role[] = ['admin', 'manager', 'consultant'];
export const ROLE_LABEL: Record<Role, string> = { admin: 'Amministratore', manager: 'Responsabile showroom', consultant: 'Consulente' };

export const LOCATIONS = ['Como', 'Lugano', 'Milano', 'Dubai', 'Magazzino'] as const;
export const SHOWROOMS = ['Como', 'Lugano', 'Milano', 'Dubai'] as const;
export const CATEGORIES = ['Sedute', 'Tavoli', 'Contenitori', 'Tavolini', 'Letti', 'Illuminazione', 'Complementi', 'Outdoor'] as const;
export const STATUSES = ['Esposto', 'Disponibile', 'Riservato', 'Venduto', 'In trasferimento'] as const;
export const DOC_TYPES = ['Catalogo prodotto', 'Catalogo generale', 'Scheda tecnica', 'Listino prezzi', 'Materiali e finiture', 'Istruzioni di montaggio', 'Altro'] as const;
export const DOC_LANGS = ['Italiano', 'Inglese', 'Tedesco', 'Francese', 'Multilingua'] as const;
export const APPT_TYPES = ['Consulenza arredo', 'Progetto cucina', 'Interior design', 'Visita showroom', 'Presentazione preventivo', 'Appuntamento architetto'] as const;
export const APPT_TIMES = ['09:30', '10:00', '11:00', '12:00', '14:30', '15:30', '17:00'] as const;
export const APPT_DURATIONS = ['30', '60', '90', '120'] as const;

export type Config = { name: string; dims: string; price?: number };

export type User = { id: string; email: string; name: string; role: Role; site: string; active: boolean; createdAt: string };

export type Product = {
  id: string; brand: string; name: string; category: string; location: string; zone: string; status: string;
  price: number; currency: Currency; dims: string; description: string;
  images: string[]; materials: string[]; colors: string[]; configs: Config[];
  createdAt: string; updatedAt: string;
};

export type FileRecord = { id: string; fileName: string; mime: string; size: number; createdBy: string | null; createdAt: string };

export type DocumentRecord = {
  id: string; name: string; type: string; language: string;
  fileId: string | null; externalUrl: string | null; fileName: string | null; size: number | null;
  productIds: string[]; createdBy: string | null; createdAt: string;
};

export type Client = { id: string; name: string; email: string; phone: string; notes: string; ownerId: string | null; createdAt: string; updatedAt: string };

export type QuoteItem = {
  id: string; quoteId: string; productId: string; brand: string; productName: string;
  config: string; dims: string; material: string; color: string; price: number; currency: Currency; position: number;
};

export type Quote = {
  id: string; number: string | null; clientId: string | null; status: 'draft' | 'sent';
  currency: Currency; rate: number; showPrices: boolean; subject: string; body: string; total: number;
  pdfFileId: string | null; createdBy: string; createdAt: string; sentAt: string | null;
  items: QuoteItem[]; clientName?: string; createdByName?: string; emailStatus?: EmailStatus | null;
};

export type Appointment = {
  id: string; client: string; email: string; clientId: string | null; site: string; type: string;
  date: string; time: string; duration: string; notes: string; consultantId: string | null;
  source: 'interno' | 'online'; createdBy: string | null; createdAt: string;
};

export type Task = { id: string; name: string; done: boolean; assigneeId: string | null; dueDate: string | null; createdBy: string | null; createdAt: string };

export type Reservation = { id: string; productId: string; clientId: string | null; client: string; userId: string; createdAt: string };

export type EmailStatus = 'sent' | 'outbox' | 'failed';
export type EmailAttachment = { fileId: string; fileName: string; size: number };
export type EmailRecord = {
  id: string; to: string; subject: string; body: string; attachments: EmailAttachment[];
  status: EmailStatus; error: string | null; messageId: string | null; quoteId: string | null; appointmentId: string | null;
  sentBy: string | null; createdAt: string;
};

export type Bootstrap = {
  user: User; users: Pick<User, 'id' | 'name' | 'role' | 'site'>[];
  products: Product[]; documents: DocumentRecord[]; clients: Client[]; quote: Quote;
  appointments: Appointment[]; tasks: Task[]; reservations: Reservation[];
  config: { mailMode: 'smtp' | 'outbox'; storage: string; assistant: 'llm' | 'local'; maxUploadMb: number; demo: boolean };
};

export type AssistantAnswer = { answer: string; productIds: string[]; documentIds: string[]; mode: 'llm' | 'local' };

/** Conversione valuta identica al prototipo: rate = quanti EUR vale 1 CHF. */
export function convert(n: number, from: Currency, to: Currency, rate: number): number {
  const r = Math.max(0.01, Number(rate) || 0.93);
  return from === to ? n : from === 'CHF' ? n * r : n / r;
}
export function quoteTotal(items: Pick<QuoteItem, 'price' | 'currency'>[], currency: Currency, rate: number): number {
  return items.reduce((s, i) => s + convert(i.price, i.currency, currency, rate), 0);
}
export const formatMoney = (n: number, c: Currency) => `${c} ${Math.round(n).toLocaleString('it-IT')}`;
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
