import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { AppError } from "./errors";

/**
 * Private file storage. Files live outside /public and are only ever served
 * through authorised route handlers (/api/files, /api/documents).
 * The interface is intentionally small so an S3-compatible backend can be
 * swapped in without touching callers.
 */
const ROOT = resolve(process.env.STORAGE_DIR || "./storage");

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BYTES = 80 * 1024 * 1024;

function pathFor(key: string) {
  const full = normalize(join(ROOT, key));
  if (!full.startsWith(ROOT)) throw new AppError("Percorso file non valido.");
  return full;
}

export async function putFile(prefix: string, ext: string, data: Buffer) {
  const key = `${prefix}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
  const p = pathFor(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data);
  return { key, checksum: createHash("sha256").update(data).digest("hex"), size: data.length };
}

export async function getFile(key: string) {
  return readFile(pathFor(key));
}

export async function fileExists(key: string) {
  try {
    await stat(pathFor(key));
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(key: string) {
  await rm(pathFor(key), { force: true });
}

function sniffImage(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  const head = buf.subarray(0, 512).toString("utf8").trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Validates an uploaded image by its magic bytes (never trusts the client MIME type). */
export async function storeImage(file: File, prefix: string) {
  if (!file || file.size === 0) throw new AppError("Seleziona un'immagine.");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("Immagine troppo grande (max 15 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(buf);
  if (!mime) throw new AppError("Formato immagine non supportato. Usa JPG, PNG o WebP.");
  if (mime === "image/svg+xml" && /<script|on\w+=/i.test(buf.toString("utf8"))) {
    throw new AppError("SVG non consentito.");
  }
  const stored = await putFile(prefix, EXT[mime], buf);
  return { ...stored, mime };
}

/** Validates an uploaded PDF by its header. */
export async function storePdf(file: File) {
  if (!file || file.size === 0) throw new AppError("Seleziona un file PDF.");
  if (file.size > MAX_PDF_BYTES) throw new AppError("PDF troppo grande (max 80 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== "%PDF-") throw new AppError("Il file selezionato non è un PDF valido.");
  const pageCount = countPdfPages(buf);
  const stored = await putFile("documents", "pdf", buf);
  return { ...stored, pageCount };
}

function countPdfPages(buf: Buffer): number | null {
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : null;
}
