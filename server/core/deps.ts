import type { Store } from './store';

/** Archivio file (PDF cataloghi, immagini, preventivi). Disco locale, S3/R2 compatibile, o IndexedDB nella demo. */
export interface BlobStorage {
  readonly kind: string;
  put(key: string, data: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string };
/** sender: utente che invia; i fornitori che lo supportano (Microsoft 365) spediscono dalla sua casella. */
export type MailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string; sender?: { address: string; name?: string }; attachments: MailAttachment[] };
export type MailResult = { status: 'sent' | 'outbox' | 'failed'; messageId?: string; error?: string; from?: string };

export interface Mailer {
  readonly mode: 'smtp' | 'outbox' | 'gateway' | 'microsoft';
  /** Limiti allegati del fornitore (es. gateway GoDaddy: 10 allegati, 2 MB ciascuno). */
  readonly limits?: { maxAttachments: number; maxAttachmentBytes: number; maxTotalBytes: number };
  send(msg: MailMessage): Promise<MailResult>;
}

/** Interfaccia opzionale verso un modello linguistico; riceve solo dati verificati dall'inventario. */
export interface LanguageModel {
  complete(system: string, user: string): Promise<string>;
}

export type AppConfig = {
  publicUrl: string;
  secureCookies: boolean;
  maxUploadMb: number;
  companyName: string;
  demo: boolean;
  /** Permette la prenotazione pubblica (/book/:sede) senza login */
  publicBooking: boolean;
  /** Segreto per firmare i link temporanei di download dei file inviati per email. */
  linkSecret: string;
};

export type Deps = {
  store: Store;
  storage: BlobStorage;
  mailer: Mailer;
  llm: LanguageModel | null;
  config: AppConfig;
  fetchImage?: (url: string) => Promise<{ data: Uint8Array; mime: string } | null>;
  now?: () => Date;
};
