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
