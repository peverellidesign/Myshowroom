// Invio email: SMTP via nodemailer (Microsoft 365, Google Workspace, Amazon SES, Resend, Postmark, ...).
// Senza SMTP configurato le email restano in "outbox": registrate ma NON consegnate (stato visibile nell'app).
import nodemailer from 'nodemailer';
import type { Mailer, MailMessage, MailResult } from '../core/deps';

export class SmtpMailer implements Mailer {
  readonly mode = 'smtp' as const;
  private t: nodemailer.Transporter;
  constructor(opts: { host: string; port: number; secure: boolean; user?: string; pass?: string }, private from: string) {
    this.t = nodemailer.createTransport({ host: opts.host, port: opts.port, secure: opts.secure, auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined, connectionTimeout: 15_000 });
  }
  async send(m: MailMessage): Promise<MailResult> {
    try {
      const info = await this.t.sendMail({
        from: this.from, to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html,
        attachments: m.attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
      });
      return { status: 'sent', messageId: info.messageId };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message.slice(0, 500) };
    }
  }
}

export class OutboxMailer implements Mailer {
  readonly mode = 'outbox' as const;
  async send(m: MailMessage): Promise<MailResult> {
    console.log(`[mail:outbox] non inviata (SMTP non configurato) → ${m.to} · "${m.subject}" · ${m.attachments.length} allegati`);
    return { status: 'outbox' };
  }
}

/**
 * Gateway email di GoDaddy Node.js Hosting (loopback 127.0.0.1:2525): l'unico canale email consentito
 * dalla piattaforma (niente SMTP esterno). Contratto: 10 allegati al massimo, 2 MB ciascuno.
 * Il mittente viene scelto dal gateway (dominio dell'app o dominio verificato).
 */
export class GoDaddyGatewayMailer implements Mailer {
  readonly mode = 'gateway' as const;
  readonly limits = { maxAttachments: 10, maxAttachmentBytes: 2 * 1024 * 1024, maxTotalBytes: 18 * 1024 * 1024 };
  constructor(private url = 'http://127.0.0.1:2525/api/email/send') {}
  async send(m: MailMessage): Promise<MailResult> {
    try {
      const r = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          to: [m.to], subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo || undefined,
          attachments: m.attachments.length ? m.attachments.map(a => ({ filename: a.filename.replace(/[\r\n"\\]/g, '_'), content: Buffer.from(a.content).toString('base64'), contentType: a.contentType.split(';')[0] })) : undefined,
        }),
      });
      const body = await r.json().catch(() => ({ success: false, error: `HTTP ${r.status}` })) as { success?: boolean; messageId?: string; error?: string };
      if (!r.ok || !body.success) return { status: 'failed', error: (body.error || `HTTP ${r.status}`).slice(0, 300) };
      return { status: 'sent', messageId: body.messageId };
    } catch (e) {
      return { status: 'failed', error: `Servizio email non raggiungibile: ${(e as Error).message}`.slice(0, 300) };
    }
  }
}

/**
 * Microsoft 365 / Outlook tramite Microsoft Graph (HTTPS, nessuna porta SMTP).
 * Autenticazione OAuth 2.0 "client credentials" con un'app registrata in Microsoft Entra ID
 * (permesso applicativo Mail.Send con consenso dell'amministratore).
 * Ogni email parte dalla casella dell'utente che la invia (la sua email di accesso all'app) e resta
 * nella sua "Posta inviata". Se quella casella non esiste o non è autorizzata, si usa MAIL_FROM
 * (casella condivisa dello showroom) con risposta all'utente.
 * Messaggi fino a ~2,5 MB: una sola chiamata sendMail; oltre: bozza + caricamento a blocchi + invio.
 */
export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string; from?: string; loginUrl?: string; graphUrl?: string };
type Mailbox = { address: string; name?: string };

class GraphError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
  /** Errore legato alla casella (inesistente, senza Exchange Online o esclusa dai permessi): si può riprovare con un'altra. */
  get mailbox() { return this.status === 403 || this.status === 404 || ['ErrorAccessDenied', 'ErrorInvalidUser', 'MailboxNotEnabledForRESTAPI', 'MailboxNotHostedInExchangeOnline', 'ResourceNotFound', 'ErrorSendAsDenied'].includes(this.code); }
}

export function parseAddress(s: string): Mailbox {
  const m = s.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  return { address: (m ? m[2] : s).trim(), name: (m?.[1] || '').trim() || undefined };
}

export class MicrosoftGraphMailer implements Mailer {
  readonly mode = 'microsoft' as const;
  readonly limits = { maxAttachments: 20, maxAttachmentBytes: 20 * 1024 * 1024, maxTotalBytes: 25 * 1024 * 1024 };
  private token: { value: string; until: number } | null = null;
  private fallback?: Mailbox;
  private graph: string;
  constructor(private c: GraphConfig) {
    this.fallback = c.from ? parseAddress(c.from) : undefined;
    this.graph = `${(c.graphUrl || 'https://graph.microsoft.com').replace(/\/$/, '')}/v1.0/users/`;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.until) return this.token.value;
    const r = await fetch(`${(this.c.loginUrl || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${encodeURIComponent(this.c.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20_000),
      body: new URLSearchParams({ client_id: this.c.clientId, client_secret: this.c.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    const b = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!r.ok || !b.access_token) throw new Error(`Accesso a Microsoft non riuscito (${b.error || r.status}): ${(b.error_description || '').split('\r')[0] || 'controllare MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET'}`);
    this.token = { value: b.access_token, until: Date.now() + Math.max(60, (b.expires_in || 3600) - 120) * 1000 };
    return b.access_token;
  }

  private async call(box: Mailbox, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(this.graph + encodeURIComponent(box.address) + path, {
      method, signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 202 || r.status === 204) return {};
    const b = await r.json().catch(() => ({})) as Record<string, unknown> & { error?: { code?: string; message?: string } };
    if (!r.ok) {
      const code = b.error?.code || `HTTP ${r.status}`;
      const hint = code === 'ErrorAccessDenied' || r.status === 403 ? ` — all’app manca il permesso Mail.Send (con consenso amministratore) o l’accesso alla casella ${box.address}`
        : r.status === 404 || code === 'ErrorInvalidUser' || code.startsWith('Mailbox') ? ` — la casella ${box.address} non esiste o non è una casella Exchange Online` : '';
      throw new GraphError(`Microsoft Graph ${code}: ${b.error?.message || ''}${hint}`.slice(0, 480), r.status, code);
    }
    return b;
  }

  private async sendFrom(box: Mailbox, m: MailMessage, replyTo?: string): Promise<string> {
    const fileAtt = (a: MailMessage['attachments'][number]) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType.split(';')[0], contentBytes: Buffer.from(a.content).toString('base64') });
    const message = {
      subject: m.subject,
      body: m.html ? { contentType: 'HTML', content: m.html } : { contentType: 'Text', content: m.text },
      toRecipients: [{ emailAddress: { address: m.to } }],
      ...(replyTo && replyTo.toLowerCase() !== box.address.toLowerCase() ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
      ...(box.name ? { from: { emailAddress: { address: box.address, name: box.name } } } : {}),
    };
    const total = m.attachments.reduce((s, a) => s + a.content.byteLength, 0);
    if (total <= 2.5 * 1024 * 1024) {
      await this.call(box, 'POST', '/sendMail', { message: { ...message, attachments: m.attachments.map(fileAtt) }, saveToSentItems: true });
      return `graph:${Date.now()}`;
    }
    const draftId = String((await this.call(box, 'POST', '/messages', message)).id);
    try {
      for (const a of m.attachments) {
        if (a.content.byteLength < 3 * 1024 * 1024) { await this.call(box, 'POST', `/messages/${draftId}/attachments`, fileAtt(a)); continue; }
        const s = await this.call(box, 'POST', `/messages/${draftId}/attachments/createUploadSession`, { AttachmentItem: { attachmentType: 'file', name: a.filename, size: a.content.byteLength, contentType: a.contentType.split(';')[0] } });
        const chunk = 10 * 320 * 1024; // 3,125 MB per blocco (massimo consentito 4 MB)
        for (let start = 0; start < a.content.byteLength; start += chunk) {
          const part = a.content.subarray(start, Math.min(start + chunk, a.content.byteLength));
          const r = await fetch(String(s.uploadUrl), { method: 'PUT', signal: AbortSignal.timeout(120_000), body: part as Uint8Array<ArrayBuffer>,
            headers: { 'content-type': 'application/octet-stream', 'content-range': `bytes ${start}-${start + part.byteLength - 1}/${a.content.byteLength}` } });
          if (!r.ok) throw new Error(`Microsoft Graph: caricamento allegato "${a.filename}" non riuscito (HTTP ${r.status})`);
        }
      }
      await this.call(box, 'POST', `/messages/${draftId}/send`);
      return `graph:${draftId}`;
    } catch (e) {
      await this.call(box, 'DELETE', `/messages/${draftId}`).catch(() => {});
      throw e;
    }
  }

  async send(m: MailMessage): Promise<MailResult> {
    const boxes: Mailbox[] = [];
    if (m.sender?.address) boxes.push({ address: m.sender.address, name: m.sender.name });
    if (this.fallback && !boxes.some(b => b.address.toLowerCase() === this.fallback!.address.toLowerCase())) boxes.push(this.fallback);
    if (!boxes.length) return { status: 'failed', error: 'Nessuna casella mittente: impostare MAIL_FROM (casella condivisa dello showroom).' };
    let first: Error | null = null;
    for (const box of boxes) {
      try {
        const messageId = await this.sendFrom(box, m, box === boxes[0] ? m.replyTo : m.sender?.address || m.replyTo);
        if (first) console.warn(`[mail:microsoft] ${m.sender?.address}: ${first.message} — inviata da ${box.address}`);
        return { status: 'sent', messageId, from: box.address };
      } catch (e) {
        first ??= e as Error;
        if (!(e instanceof GraphError && e.mailbox)) break;
      }
    }
    return { status: 'failed', error: first!.message.slice(0, 500) };
  }
}
