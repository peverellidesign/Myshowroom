import "server-only";
import type { Currency } from "@prisma/client";
import { db } from "./db";

export type ExchangeRate = {
  /** 1 EUR = rate CHF */
  eurToChf: number;
  source: "MANUALE" | "BCE";
  updatedAt: string;
  /** Date of the reference rate when fetched live from the ECB. */
  referenceDate?: string;
};

export type EmailSettings = {
  signature: string;
  replyTo: string;
};

const DEFAULT_RATE: ExchangeRate = { eurToChf: 0.94, source: "MANUALE", updatedAt: new Date(0).toISOString() };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? ({ ...fallback, ...(row.value as object) } as T) : fallback;
}

export async function setSetting(key: string, value: object) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export const getExchangeRate = () => getSetting<ExchangeRate>("exchangeRate", DEFAULT_RATE);

export const getEmailSettings = () =>
  getSetting<EmailSettings>("email", {
    signature: "Peverelli Design\nmyshowroom — Your showroom. Everywhere.",
    replyTo: "",
  });

export function convert(amount: number, from: Currency, to: Currency, rate: ExchangeRate) {
  if (from === to) return amount;
  return from === "EUR" ? amount * rate.eurToChf : amount / rate.eurToChf;
}

/** Fetches the official ECB reference rate (via the open Frankfurter API). */
export async function fetchLiveRate(): Promise<ExchangeRate> {
  const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=CHF", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { date: string; rates: { CHF: number } };
  if (!json?.rates?.CHF) throw new Error("Risposta non valida");
  return { eurToChf: json.rates.CHF, source: "BCE", updatedAt: new Date().toISOString(), referenceDate: json.date };
}
