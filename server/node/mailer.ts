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
