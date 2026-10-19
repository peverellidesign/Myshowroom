import "server-only";
import nodemailer from "nodemailer";

/** SMTP credentials come only from environment variables (never stored in the database). */
export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

export function emailStatus() {
  return {
    configured: emailConfigured(),
    host: process.env.SMTP_HOST || null,
    from: process.env.EMAIL_FROM || null,
  };
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}) {
  if (!emailConfigured()) throw new Error("EMAIL_NOT_CONFIGURED");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:600px">${input.text
    .split("\n")
    .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .join("<br>")}</div>`;
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: input.to,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    text: input.text,
    html,
    attachments: input.attachments,
  });
  return info.messageId as string;
}
