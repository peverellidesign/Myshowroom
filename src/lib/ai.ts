import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { InventoryStatus } from "@prisma/client";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { can } from "./permissions";
import { searchProducts, type ProductCardData, type ProductFilters } from "./products";
import { convert, getExchangeRate, type ExchangeRate } from "./settings";
import { money } from "./format";

/**
 * Ask myshowroom. Every product shown to the user comes from a real database
 * query; the model only decides which searches to run and writes the summary.
 * Without ANTHROPIC_API_KEY a deterministic Italian query parser is used.
 */

export type AskResult = {
  mode: "ai" | "fallback";
  answer: string;
  products: (ProductCardData & { priceLabel: string | null; firstStockId: string | null })[];
  interpreted?: string[];
};

export type AskTurn = { role: "user" | "assistant"; text: string };

type SearchArgs = {
  query?: string;
  category?: string;
  brand?: string;
  location?: string;
  availability?: "stock" | "esposto" | "magazzino" | "ordine" | "riservato";
  colors?: string[];
  material?: string;
  max_price_eur?: number;
  min_price_eur?: number;
};

const LIGHT = ["bianco", "latte", "avorio", "sabbia", "perla", "calacatta", "naturale", "crema", "beige", "chiaro"];
const DARK = ["nero", "grafite", "fumé", "cognac", "noce", "bronzo", "carnico", "scuro"];

async function catalogVocabulary() {
  const [categories, brands, locations, materials, finishes] = await Promise.all([
    db.category.findMany(),
    db.brand.findMany(),
    db.location.findMany({ where: { active: true } }),
    db.material.findMany(),
    db.finish.findMany({ select: { name: true } }),
  ]);
  return { categories, brands, locations, materials, finishes: [...new Set(finishes.map((f) => f.name))] };
}

/** Runs one structured search against the real inventory. */
async function runSearch(args: SearchArgs, rate: ExchangeRate, userId: string) {
  const vocab = await catalogVocabulary();
  const norm = (s?: string) => s?.toLowerCase().trim() ?? "";
  const filters: ProductFilters = {};
  if (args.query) filters.q = args.query;
  const cat = vocab.categories.find((c) => norm(c.name) === norm(args.category) || norm(c.slug) === norm(args.category));
  if (args.category && cat) filters.category = cat.id;
  const brand = vocab.brands.find((b) => norm(b.name) === norm(args.brand));
  if (args.brand && brand) filters.brand = brand.id;
  const loc = vocab.locations.find((l) => norm(l.name) === norm(args.location) || l.slug === norm(args.location));
  if (args.location && loc) filters.location = loc.id;
  if (args.availability) filters.availability = args.availability;
  const mat = vocab.materials.find((m) => norm(m.name).includes(norm(args.material)) || norm(m.type) === norm(args.material));
  if (args.material && mat) filters.material = mat.id;

  let results: ProductCardData[];
  if (args.colors?.length) {
    const runs = await Promise.all(args.colors.map((c) => searchProducts({ ...filters, color: c }, userId)));
    const map = new Map<string, ProductCardData>();
    runs.flat().forEach((r) => map.set(r.id, r));
    results = [...map.values()];
  } else {
    results = await searchProducts(filters, userId);
  }
  const eur = (p: ProductCardData) => (p.price ? convert(p.price.v, p.price.c as "EUR" | "CHF", "EUR", rate) : null);
  if (args.max_price_eur !== undefined) results = results.filter((p) => (eur(p) ?? Infinity) <= args.max_price_eur!);
  if (args.min_price_eur !== undefined) results = results.filter((p) => (eur(p) ?? -1) >= args.min_price_eur!);
  return results;
}

async function decorate(products: ProductCardData[], user: SessionUser) {
  const showPrice = can(user.role, "price:view");
  const stock = await db.inventoryItem.findMany({
    where: { productModelId: { in: products.map((p) => p.id) }, status: { in: ["ESPOSTO", "DISPONIBILE"] as InventoryStatus[] } },
    select: { id: true, productModelId: true },
  });
  return products.map((p) => ({
    ...p,
    price: showPrice ? p.price : null,
    priceLabel: showPrice && p.price ? money(p.price.v, p.price.c) : null,
    firstStockId: stock.find((s) => s.productModelId === p.id)?.id ?? null,
  }));
}

// ── Fallback: deterministic Italian parser ─────────────────

export async function parseItalianQuery(text: string): Promise<{ args: SearchArgs; notes: string[]; selection: boolean }> {
  const t = text.toLowerCase();
  const vocab = await catalogVocabulary();
  const args: SearchArgs = {};
  const notes: string[] = [];

  const catRules: [RegExp, string][] = [
    [/divan/, "Divani"],
    [/poltron/, "Poltrone"],
    [/tavolin/, "Tavolini"],
    [/tavol[oi]\b|tavoli /, "Tavoli"],
    [/contenitor|madi[ae]|secr[ée]taire|credenz|librer/, "Contenitori"],
    [/sedi[ae]\b/, "Sedie"],
    [/lamp|illumina/, "Illuminazione"],
  ];
  for (const [re, name] of catRules) {
    if (re.test(t) && vocab.categories.some((c) => c.name === name)) {
      args.category = name;
      notes.push(`categoria ${name}`);
      break;
    }
  }
  const brand = vocab.brands.find((b) => t.includes(b.name.toLowerCase()));
  if (brand) {
    args.brand = brand.name;
    notes.push(`brand ${brand.name}`);
  }
  // The generic word "magazzino" means every warehouse (handled as availability below), not the location named "Magazzino".
  const loc = [...vocab.locations]
    .sort((a, b) => b.name.length - a.name.length)
    .find((l) => new RegExp(`\\b${l.name.toLowerCase()}\\b`).test(t) && l.name.toLowerCase() !== "magazzino");
  if (loc) {
    args.location = loc.name;
    notes.push(`sede ${loc.name}`);
  }
  if (/espost/.test(t)) {
    args.availability = "esposto";
    notes.push("esposti in showroom");
  } else if (/magazzin/.test(t) && (!loc || loc.type !== "WAREHOUSE")) {
    args.availability = "magazzino";
    notes.push("disponibili in magazzino");
  } else if (/riservat/.test(t)) {
    args.availability = "riservato";
    notes.push("riservati");
  } else if (/ordin|produttore/.test(t)) {
    args.availability = "ordine";
    notes.push("solo su ordinazione");
  } else if (/disponibil|in stock|abbiamo/.test(t)) {
    args.availability = "stock";
    notes.push("disponibili in stock Peverelli");
  }
  if (/chiar/.test(t)) {
    args.colors = vocab.finishes.filter((f) => LIGHT.some((l) => f.toLowerCase().includes(l)));
    notes.push("toni chiari");
  } else if (/scur/.test(t)) {
    args.colors = vocab.finishes.filter((f) => DARK.some((l) => f.toLowerCase().includes(l)));
    notes.push("toni scuri");
  } else {
    const finish = vocab.finishes.find((f) => t.includes(f.toLowerCase()));
    if (finish) {
      args.colors = [finish];
      notes.push(`finitura ${finish}`);
    }
  }
  const mat = vocab.materials.find((m) => t.includes(m.type.toLowerCase()) || t.includes(m.name.toLowerCase()));
  if (mat) {
    args.material = mat.name;
    notes.push(`materiale ${mat.name}`);
  }
  const num = (s: string) => Number(s.replace(/[.'’\s]/g, "").replace(",", "."));
  const under = t.match(/(?:sotto|meno di|entro|massimo|max|fino a)\s*(?:i|ai|a)?\s*(?:€|eur|chf)?\s*([\d.'’ ]+(?:,\d+)?)\s*(k|mila)?/);
  if (under) {
    let v = num(under[1]);
    if (under[2]) v *= 1000;
    if (v > 0) {
      args.max_price_eur = v;
      notes.push(`prezzo fino a EUR ${v.toLocaleString("it-IT")}`);
    }
  }
  const over = t.match(/(?:sopra|oltre|più di|almeno)\s*(?:i|ai|a)?\s*(?:€|eur|chf)?\s*([\d.'’ ]+(?:,\d+)?)\s*(k|mila)?/);
  if (over) {
    let v = num(over[1]);
    if (over[2]) v *= 1000;
    if (v > 0) {
      args.min_price_eur = v;
      notes.push(`prezzo da EUR ${v.toLocaleString("it-IT")}`);
    }
  }
  const selection = /selezion|propost|suggeri|consigli/.test(t);
  if (selection && !args.availability) {
    args.availability = "stock";
    notes.push("disponibili in stock Peverelli");
  }
  if (!notes.length) {
    const stop = new Set(["quali", "quale", "mostrami", "trova", "cerca", "abbiamo", "che", "per", "un", "una", "il", "la", "i", "gli", "le", "di", "del", "dei", "delle", "in", "a", "e", "con", "prodotti", "prodotto"]);
    const words = t.replace(/[?!.,]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
    if (words.length) {
      args.query = words.join(" ");
      notes.push(`testo «${args.query}»`);
    }
  }
  return { args, notes, selection };
}

async function fallbackAsk(question: string, user: SessionUser, rate: ExchangeRate): Promise<AskResult> {
  const { args, notes, selection } = await parseItalianQuery(question);
  let products = await runSearch(args, rate, user.id);
  if (selection) {
    // A balanced selection: one piece per category, displayed pieces first.
    const byCat = new Map<string, ProductCardData>();
    for (const p of products.sort((a, b) => Number(b.statuses.includes("ESPOSTO")) - Number(a.statuses.includes("ESPOSTO")))) if (!byCat.has(p.category)) byCat.set(p.category, p);
    products = [...byCat.values()];
  }
  const decorated = await decorate(products.slice(0, 24), user);
  const answer = decorated.length
    ? `${selection ? "Ecco una selezione" : "Ho trovato"} ${decorated.length} prodott${decorated.length === 1 ? "o" : "i"}${notes.length ? ` (${notes.join(", ")})` : ""}. Disponibilità e prezzi provengono dall'inventario reale.`
    : `Nessun prodotto corrisponde${notes.length ? ` a: ${notes.join(", ")}` : ""}. Prova a riformulare o ad allargare i criteri.`;
  return { mode: "fallback", answer, products: decorated, interpreted: notes };
}

// ── AI mode (Claude tool use) ──────────────────────────────

const SEARCH_TOOL: Anthropic.Beta.BetaTool = {
  name: "search_inventory",
  description:
    "Cerca nel catalogo e nell'inventario reale Peverelli Design. Restituisce prodotti con brand, categoria, sedi, stati fisici (Esposto, Disponibile, Riservato…) e prezzo indicativo. Usa più ricerche se necessario. Tutti i parametri sono facoltativi.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Testo libero: modello, designer, materiale" },
      category: { type: "string", description: "Categoria esatta, es. Divani, Poltrone, Tavoli, Tavolini, Contenitori, Sedie, Illuminazione" },
      brand: { type: "string" },
      location: { type: "string", description: "Sede: Como, Lugano, Milano, Dubai, Magazzino…" },
      availability: { type: "string", enum: ["stock", "esposto", "magazzino", "ordine", "riservato"], description: "stock = esposto o disponibile in una sede Peverelli; ordine = nessun pezzo fisico" },
      colors: { type: "array", items: { type: "string" }, description: "Nomi di finiture/colori (es. Bianco latte, Sabbia)" },
      material: { type: "string" },
      max_price_eur: { type: "number" },
      min_price_eur: { type: "number" },
    },
    additionalProperties: false,
  },
};

async function aiAsk(question: string, history: AskTurn[], user: SessionUser, rate: ExchangeRate): Promise<AskResult> {
  const client = new Anthropic();
  const vocab = await catalogVocabulary();
  const showPrice = can(user.role, "price:view");
  const system = `Sei «Ask myshowroom», l'assistente dei consulenti di Peverelli Design (arredamento di lusso, sedi ${vocab.locations.map((l) => l.name).join(", ")}).
Rispondi sempre in italiano, in modo breve ed elegante.
Usa lo strumento search_inventory per ogni domanda su prodotti, disponibilità o prezzi: non inventare mai prodotti, prezzi, stock o composizioni.
Distingui sempre tra "disponibile in stock Peverelli" (pezzi fisici esposti o in magazzino) e "disponibile su ordinazione dal produttore".
${showPrice ? "Puoi citare i prezzi restituiti dallo strumento." : "L'utente non è autorizzato a vedere i prezzi: non citarli."}
Categorie: ${vocab.categories.map((c) => c.name).join(", ")}. Brand: ${vocab.brands.map((b) => b.name).join(", ")}. Finiture note: ${vocab.finishes.join(", ")}.
I prodotti trovati vengono mostrati all'utente come schede cliccabili sotto la tua risposta: non serve elencarli tutti, riassumi e consiglia.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: question },
  ];
  const found = new Map<string, ProductCardData>();

  for (let i = 0; i < 6; i++) {
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      system,
      tools: [SEARCH_TOOL],
      tool_choice: { type: "auto" },
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { mode: "ai", answer: "Non posso rispondere a questa richiesta. Prova a riformularla.", products: await decorate([...found.values()], user) };
    }
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { mode: "ai", answer: text || "Ecco i risultati.", products: await decorate([...found.values()].slice(0, 24), user) };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const args = (typeof block.input === "object" && block.input ? block.input : {}) as SearchArgs;
        const rows = await runSearch(args, rate, user.id);
        rows.forEach((r) => found.set(r.id, r));
        const payload = rows.slice(0, 20).map((r) => ({
          id: r.id,
          brand: r.brand,
          modello: r.name,
          categoria: r.category,
          in_stock_peverelli: r.inStock,
          pezzi_disponibili: r.stockCount,
          stati: r.statuses,
          sedi: r.locations.map((l) => l.name),
          prezzo: showPrice && r.price ? money(r.price.v, r.price.c) : undefined,
        }));
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ totale: rows.length, prodotti: payload }) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Errore di ricerca: ${(e as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { mode: "ai", answer: "Ecco i prodotti trovati.", products: await decorate([...found.values()].slice(0, 24), user) };
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askMyshowroom(question: string, history: AskTurn[], user: SessionUser): Promise<AskResult> {
  const rate = await getExchangeRate();
  if (!aiConfigured()) return fallbackAsk(question, user, rate);
  try {
    return await aiAsk(question, history, user, rate);
  } catch (e) {
    console.error("AI assistant error, using fallback", e);
    const res = await fallbackAsk(question, user, rate);
    return { ...res, answer: `Servizio AI momentaneamente non disponibile: uso la ricerca strutturata. ${res.answer}` };
  }
}
