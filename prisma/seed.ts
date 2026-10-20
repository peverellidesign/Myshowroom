/**
 * Demonstration seed for myshowroom.
 *
 * ALL catalogue, inventory, price and client data created here is illustrative
 * ("DEMO") and flagged with isDemo = true. It is not taken from Peverelli records
 * nor from official manufacturer catalogues, and no official catalogue PDF is bundled.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type ImageKind, type RoleKey } from "@prisma/client";
import { DEMO_ART, HERO_ART } from "./demo-art";
import { hasCatalog, importCatalog } from "./import-catalog";

const db = new PrismaClient();
const STORAGE = resolve(process.env.STORAGE_DIR || "./storage");
const DEMO_SOURCE = "Dato dimostrativo — da verificare sul catalogo ufficiale del produttore";

async function storeSvg(prefix: string, svg: string) {
  const key = `${prefix}/demo/${randomUUID()}.svg`;
  const p = join(STORAGE, key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, svg);
  return key;
}

function password(envValue: string | undefined) {
  return envValue && envValue.length >= 8 ? { value: envValue, generated: false } : { value: randomBytes(9).toString("base64url"), generated: true };
}

async function main() {
  const existing = await db.user.count();
  if (existing > 0) {
    console.log("Il database contiene già dati: seed saltato. Usa `npm run db:reset` per ricominciare.");
    return;
  }

  // ── Roles ────────────────────────────────────────────────
  const roles: { key: RoleKey; name: string; description: string }[] = [
    { key: "ADMIN", name: "Amministratore", description: "Accesso completo, utenti e impostazioni." },
    { key: "MANAGER", name: "Manager", description: "Gestione catalogo, documenti, prezzi e stock." },
    { key: "SALES", name: "Consulente vendite", description: "Clienti, preventivi, prenotazioni e agenda." },
    { key: "WAREHOUSE", name: "Magazzino", description: "Gestione e movimentazione dello stock." },
  ];
  for (const r of roles) await db.role.upsert({ where: { key: r.key }, create: r, update: r });

  // ── Locations ────────────────────────────────────────────
  const loc = async (data: Parameters<typeof db.location.create>[0]["data"]) => db.location.create({ data });
  const como = await loc({ name: "Como", slug: "como", type: "SHOWROOM", city: "Como", country: "Italia", address: "Showroom Como (indirizzo da configurare)", bookingEnabled: true, sortOrder: 1 });
  const lugano = await loc({ name: "Lugano", slug: "lugano", type: "SHOWROOM", city: "Lugano", country: "Svizzera", address: "Showroom Lugano (indirizzo da configurare)", bookingEnabled: true, sortOrder: 2 });
  const milano = await loc({ name: "Milano", slug: "milano", type: "SHOWROOM", city: "Milano", country: "Italia", address: "Showroom Milano (indirizzo da configurare)", bookingEnabled: true, sortOrder: 3 });
  await loc({ name: "Dubai", slug: "dubai", type: "SHOWROOM", city: "Dubai", country: "Emirati Arabi Uniti", timezone: "Asia/Dubai", bookingEnabled: false, sortOrder: 4 });
  const magazzino = await loc({ name: "Magazzino", slug: "magazzino", type: "WAREHOUSE", city: "Como", country: "Italia", sortOrder: 5 });
  const magazzinoTi = await loc({ name: "Magazzino Ticino", slug: "magazzino-ticino", type: "WAREHOUSE", city: "Mendrisio", country: "Svizzera", sortOrder: 6 });

  const zone = async (locationId: string, name: string) => db.zone.create({ data: { locationId, name } });
  const zComoLiving = await zone(como.id, "Zona living");
  const zComoDining = await zone(como.id, "Zona dining");
  const zLuganoPiano = await zone(lugano.id, "Piano terra");
  await zone(lugano.id, "Primo piano");
  await zone(milano.id, "Sala principale");
  const zMagA = await zone(magazzino.id, "Corsia A");
  const zMagB = await zone(magazzino.id, "Corsia B");
  await zone(magazzinoTi.id, "Area 1");

  // ── Users ────────────────────────────────────────────────
  const adminPw = password(process.env.SEED_ADMIN_PASSWORD);
  const demoPw = password(process.env.SEED_DEMO_PASSWORD);
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@peverellidesign.com";
  const mkUser = async (email: string, name: string, roleKey: RoleKey, pw: string, defaultLocationId?: string) =>
    db.user.create({ data: { email, name, roleKey, passwordHash: await bcrypt.hash(pw, 12), defaultLocationId } });

  const admin = await mkUser(adminEmail, "Amministratore", "ADMIN", adminPw.value, como.id);
  const manager = await mkUser("manager@peverellidesign.com", "Giulia Manager (demo)", "MANAGER", demoPw.value, como.id);
  const sales = await mkUser("consulente@peverellidesign.com", "Luca Consulente (demo)", "SALES", demoPw.value, lugano.id);
  const sales2 = await mkUser("consulente.como@peverellidesign.com", "Sara Consulente (demo)", "SALES", demoPw.value, como.id);
  await mkUser("magazzino@peverellidesign.com", "Marco Magazzino (demo)", "WAREHOUSE", demoPw.value, magazzino.id);

  // Weekly availability (Mon–Sat 10:00–18:30) for booking.
  for (const [user, location] of [
    [sales2, como],
    [manager, como],
    [sales, lugano],
    [admin, milano],
  ] as const) {
    for (let wd = 1; wd <= 6; wd++) {
      await db.consultantAvailability.create({
        data: { userId: user.id, locationId: location.id, weekday: wd, startMinute: 10 * 60, endMinute: wd === 6 ? 17 * 60 : 18 * 60 + 30 },
      });
    }
  }

  // ── Real Peverelli catalogue (when the data folder is present) ──
  if (hasCatalog()) {
    const res = await importCatalog(db, {
      storageRoot: STORAGE,
      uploaderId: manager.id,
      locations: { CHF: lugano.id, EUR: como.id },
      locationNames: { CHF: "Lugano", EUR: "Como" },
    });
    await db.client.create({
      data: { name: "Cliente esempio", notes: "Cliente dimostrativo per provare preventivi e prenotazioni.", preferredLocationId: lugano.id, consultantId: sales.id, isDemo: true },
    });
    await db.client.create({
      data: { name: "Studio Architettura Demo", email: "studio.demo@example.com", city: "Como", notes: "Cliente dimostrativo.", preferredLocationId: como.id, consultantId: sales2.id, isDemo: true },
    });
    await db.task.create({ data: { title: "Verificare la sede dei pezzi importati dal PDF", priority: "ALTA", assigneeId: manager.id, createdById: admin.id } });
    await db.setting.create({ data: { key: "site", value: { heroImageKey: res.heroKey, heroCredit: "Showroom Peverelli Design" } } });
    await db.setting.create({ data: { key: "exchangeRate", value: { eurToChf: 0.94, source: "MANUALE", updatedAt: new Date().toISOString() } } });
    await db.auditLog.create({ data: { userId: admin.id, action: "seed", entity: "System", summary: `Importato catalogo Peverelli: ${res.products} modelli, ${res.pieces} pezzi` } });
    console.log(`\n✓ Catalogo Peverelli importato: ${res.brands} brand, ${res.products} modelli, ${res.pieces} pezzi in esposizione.\n`);
    console.log(`  Amministratore: ${adminEmail}  password: ${adminPw.generated ? adminPw.value + "  (generata)" : "(da SEED_ADMIN_PASSWORD)"}`);
    console.log(`  Utenti demo (manager@, consulente@, consulente.como@, magazzino@peverellidesign.com) password: ${demoPw.generated ? demoPw.value + "  (generata)" : "(da SEED_DEMO_PASSWORD)"}\n`);
    return;
  }

  // ── Brands & categories ──────────────────────────────────
  const bb = await db.brand.create({ data: { name: "B&B Italia", country: "Italia", website: "https://www.bebitalia.com" } });
  const maxalto = await db.brand.create({ data: { name: "Maxalto", country: "Italia", website: "https://www.bebitalia.com/it-it/maxalto" } });
  const vitra = await db.brand.create({ data: { name: "Vitra", country: "Svizzera", website: "https://www.vitra.com" } });
  await db.brand.create({ data: { name: "Molteni&C", country: "Italia", website: "https://www.molteni.it" } });

  const cat = async (name: string) => db.category.create({ data: { name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-") } });
  const cPoltrone = await cat("Poltrone");
  const cTavoli = await cat("Tavoli");
  const cContenitori = await cat("Contenitori");
  const cTavolini = await cat("Tavolini");
  await cat("Divani");
  await cat("Sedie");
  await cat("Illuminazione");

  // ── Materials & finishes (demo palette) ──────────────────
  const material = async (name: string, type: string, brandId: string | null, finishes: [string, string][]) => {
    const m = await db.material.create({ data: { name, type, brandId } });
    const fs = [];
    for (const [fname, hex] of finishes) fs.push(await db.finish.create({ data: { materialId: m.id, name: fname, hexColor: hex } }));
    return { m, fs };
  };
  const tessuto = await material("Tessuto bouclé", "Tessuto", bb.id, [["Bianco latte", "#EFEBE3"], ["Grigio perla", "#B9B6B0"], ["Sabbia", "#D6C7AE"]]);
  const pelle = await material("Pelle", "Pelle", bb.id, [["Cognac", "#8A5634"], ["Nero", "#202020"]]);
  const rovere = await material("Rovere massello", "Legno", vitra.id, [["Naturale oliato", "#C9A57A"], ["Fumé", "#6B5444"]]);
  const metalloV = await material("Metallo verniciato", "Metallo", vitra.id, [["Avorio", "#ECE6D6"], ["Nero intenso", "#1F1F1F"]]);
  const legnoMx = await material("Legno laccato", "Laccato", maxalto.id, [["Grigio grafite", "#4A4A4A"], ["Noce Canaletto", "#5B4636"]]);
  const metalloMx = await material("Metallo", "Metallo", maxalto.id, [["Naturale", "#8E8A84"], ["Bronzo", "#6E5A43"]]);
  const marmo = await material("Marmo", "Marmo", maxalto.id, [["Calacatta", "#E7E2D9"], ["Grigio Carnico", "#6E6C69"]]);

  // ── Products ─────────────────────────────────────────────
  type ConfigSeed = { name: string; dimensions: string; w?: number; d?: number; h?: number; price?: number; compat: { m: string; f?: string[] }[] };
  type ProductSeed = {
    slug: string;
    brandId: string;
    categoryId: string;
    name: string;
    code: string;
    designer?: string;
    year?: number;
    description: string;
    dimensions: string;
    w: number;
    d: number;
    h: number;
    listPrice: number;
    currency: "EUR" | "CHF";
    configs: ConfigSeed[];
  };
  const mats: Record<string, { m: { id: string }; fs: { id: string; name: string }[] }> = { tessuto, pelle, rovere, metalloV, legnoMx, metalloMx, marmo };

  const products: ProductSeed[] = [
    {
      slug: "le-bambole", brandId: bb.id, categoryId: cPoltrone.id, name: "Le Bambole", code: "DEMO-BB-LEBAMBOLE",
      designer: "Mario Bellini", year: 1972,
      description: "Poltrona dalle forme morbide e avvolgenti, un'icona del design italiano. Descrizione e dati a scopo dimostrativo.",
      dimensions: "L 103 × P 91 × H 73 cm (dimostrativo)", w: 103, d: 91, h: 73, listPrice: 2350, currency: "CHF",
      configs: [
        { name: "Poltrona", dimensions: "L 103 × P 91 × H 73 cm", w: 103, d: 91, h: 73, price: 2350, compat: [{ m: "tessuto" }, { m: "pelle" }] },
        { name: "Divano 2 posti", dimensions: "L 140 × P 91 × H 73 cm", w: 140, d: 91, h: 73, price: 4200, compat: [{ m: "tessuto" }, { m: "pelle" }] },
      ],
    },
    {
      slug: "em-table", brandId: vitra.id, categoryId: cTavoli.id, name: "EM Table", code: "DEMO-VI-EMTABLE",
      designer: "Jean Prouvé", year: 1950,
      description: "Tavolo dalla struttura ingegneristica, con piano in legno e gambe in metallo. Descrizione e dati a scopo dimostrativo.",
      dimensions: "L 200 × P 90 × H 73 cm (dimostrativo)", w: 200, d: 90, h: 73, listPrice: 3800, currency: "EUR",
      configs: [
        { name: "Piano 180 × 90", dimensions: "L 180 × P 90 × H 73 cm", w: 180, d: 90, h: 73, price: 3500, compat: [{ m: "rovere" }, { m: "metalloV" }] },
        { name: "Piano 200 × 90", dimensions: "L 200 × P 90 × H 73 cm", w: 200, d: 90, h: 73, price: 3800, compat: [{ m: "rovere" }, { m: "metalloV" }] },
        { name: "Piano 240 × 90", dimensions: "L 240 × P 90 × H 73 cm", w: 240, d: 90, h: 73, compat: [{ m: "rovere" }, { m: "metalloV" }] },
      ],
    },
    {
      slug: "artemone", brandId: maxalto.id, categoryId: cContenitori.id, name: "Artemone", code: "DEMO-MX-ARTEMONE",
      designer: "Antonio Citterio",
      description: "Secrétaire dalle proporzioni architettoniche con vano a ribalta, cassetti e ante su base in metallo. Descrizione e dati a scopo dimostrativo.",
      dimensions: "L 110 × P 45 × H 140 cm (dimostrativo)", w: 110, d: 45, h: 140, listPrice: 12400, currency: "CHF",
      configs: [
        { name: "Secrétaire", dimensions: "L 110 × P 45 × H 140 cm", w: 110, d: 45, h: 140, price: 12400, compat: [{ m: "legnoMx" }, { m: "metalloMx" }] },
        { name: "Madia bassa", dimensions: "L 220 × P 50 × H 75 cm", w: 220, d: 50, h: 75, compat: [{ m: "legnoMx" }, { m: "metalloMx" }] },
      ],
    },
    {
      slug: "lithos", brandId: maxalto.id, categoryId: cTavolini.id, name: "Lithos", code: "DEMO-MX-LITHOS",
      designer: "Antonio Citterio",
      description: "Tavolino con piano in pietra naturale e base scultorea. Descrizione e dati a scopo dimostrativo.",
      dimensions: "Ø 120 × H 32 cm (dimostrativo)", w: 120, d: 120, h: 32, listPrice: 6900, currency: "EUR",
      configs: [
        { name: "Tavolino Ø 120", dimensions: "Ø 120 × H 32 cm", w: 120, d: 120, h: 32, price: 6900, compat: [{ m: "marmo" }, { m: "metalloMx" }] },
        { name: "Tavolino Ø 80", dimensions: "Ø 80 × H 38 cm", w: 80, d: 80, h: 38, price: 4600, compat: [{ m: "marmo" }, { m: "metalloMx" }] },
      ],
    },
  ];

  const created: Record<string, { id: string; configs: Record<string, string> }> = {};
  for (const p of products) {
    const product = await db.productModel.create({
      data: {
        brandId: p.brandId, categoryId: p.categoryId, name: p.name, code: p.code, designer: p.designer, year: p.year,
        description: p.description, dimensions: p.dimensions, widthCm: p.w, depthCm: p.d, heightCm: p.h,
        listPrice: p.listPrice, currency: p.currency, isDemo: true,
      },
    });
    const art = DEMO_ART[p.slug];
    let order = 0;
    for (const kind of ["FRONTALE", "LATERALE", "DETTAGLIO", "AMBIENTE"] as ImageKind[]) {
      const key = await storeSvg("products", art[kind]);
      await db.productImage.create({
        data: { productModelId: product.id, storageKey: key, mimeType: "image/svg+xml", kind, isMain: kind === "FRONTALE", sortOrder: order++, caption: "Illustrazione dimostrativa" },
      });
    }
    const configs: Record<string, string> = {};
    let ci = 0;
    for (const c of p.configs) {
      const conf = await db.productConfiguration.create({
        data: {
          productModelId: product.id, name: c.name, dimensions: `${c.dimensions} (dimostrativo)`, widthCm: c.w, depthCm: c.d, heightCm: c.h,
          price: c.price, currency: p.currency, source: DEMO_SOURCE, isDemo: true, sortOrder: ci++,
        },
      });
      configs[c.name] = conf.id;
      for (const comp of c.compat) {
        const mat = mats[comp.m];
        for (const f of mat.fs) {
          await db.configurationCompatibility.create({ data: { configurationId: conf.id, materialId: mat.m.id, finishId: f.id } });
        }
      }
    }
    created[p.slug] = { id: product.id, configs };
  }

  // ── Physical inventory (demo) ────────────────────────────
  let seq = 0;
  const inv = async (d: {
    product: string; config: string; location: { id: string; slug: string }; zoneId?: string; status: "ESPOSTO" | "DISPONIBILE" | "VENDUTO";
    material: { m: { id: string }; fs: { id: string; name: string }[] }; finish: number; materialsDescription: string; price: number; currency: "EUR" | "CHF"; quantity?: number; discountPct?: number; notes?: string;
  }) => {
    seq++;
    return db.inventoryItem.create({
      data: {
        code: `DEMO-${d.location.slug.slice(0, 3).toUpperCase()}-${String(seq).padStart(4, "0")}`,
        productModelId: created[d.product].id,
        configurationId: created[d.product].configs[d.config],
        composition: d.config,
        materialId: d.material.m.id,
        finishId: d.material.fs[d.finish].id,
        materialsDescription: d.materialsDescription,
        locationId: d.location.id,
        zoneId: d.zoneId,
        status: d.status,
        baseStatus: d.status === "VENDUTO" ? "DISPONIBILE" : d.status,
        price: d.price,
        currency: d.currency,
        quantity: d.quantity ?? 1,
        discountPct: d.discountPct ?? 0,
        notes: `${d.notes ? d.notes + " — " : ""}Record dimostrativo, non verificato su dati Peverelli.`,
        isDemo: true,
      },
    });
  };

  const bambLugano = await inv({ product: "le-bambole", config: "Poltrona", location: lugano, zoneId: zLuganoPiano.id, status: "ESPOSTO", material: tessuto, finish: 1, materialsDescription: "Tessuto bouclé / Grigio perla", price: 2350, currency: "CHF" });
  await inv({ product: "le-bambole", config: "Divano 2 posti", location: como, zoneId: zComoLiving.id, status: "ESPOSTO", material: tessuto, finish: 0, materialsDescription: "Tessuto bouclé / Bianco latte", price: 4200, currency: "EUR", discountPct: 15, notes: "Pezzo da esposizione" });
  const bambMag = await inv({ product: "le-bambole", config: "Poltrona", location: magazzino, zoneId: zMagA.id, status: "DISPONIBILE", material: pelle, finish: 0, materialsDescription: "Pelle / Cognac", price: 2600, currency: "EUR", quantity: 2 });
  await inv({ product: "em-table", config: "Piano 200 × 90", location: como, zoneId: zComoDining.id, status: "ESPOSTO", material: rovere, finish: 0, materialsDescription: "Rovere naturale oliato / Metallo avorio", price: 3800, currency: "EUR" });
  await inv({ product: "em-table", config: "Piano 180 × 90", location: magazzino, zoneId: zMagB.id, status: "DISPONIBILE", material: rovere, finish: 1, materialsDescription: "Rovere fumé / Metallo nero", price: 3500, currency: "EUR" });
  const artemoneMag = await inv({ product: "artemone", config: "Secrétaire", location: magazzino, zoneId: zMagA.id, status: "DISPONIBILE", material: legnoMx, finish: 0, materialsDescription: "Laccato grigio grafite / Metallo naturale", price: 12400, currency: "CHF", notes: "Esemplare in stock" });
  await inv({ product: "artemone", config: "Secrétaire", location: lugano, zoneId: zLuganoPiano.id, status: "ESPOSTO", material: legnoMx, finish: 1, materialsDescription: "Noce Canaletto / Metallo bronzo", price: 12900, currency: "CHF" });
  await inv({ product: "lithos", config: "Tavolino Ø 120", location: como, zoneId: zComoLiving.id, status: "ESPOSTO", material: marmo, finish: 0, materialsDescription: "Marmo Calacatta / Base bronzo", price: 6900, currency: "EUR" });
  await inv({ product: "lithos", config: "Tavolino Ø 80", location: magazzinoTi, status: "DISPONIBILE", material: marmo, finish: 1, materialsDescription: "Marmo Grigio Carnico", price: 4600, currency: "CHF" });

  // ── Clients (demo) ───────────────────────────────────────
  const c1 = await db.client.create({
    data: { name: "Cliente esempio", email: null, phone: null, notes: "Visita showroom. Record dimostrativo.", preferredLocationId: lugano.id, consultantId: sales.id, isDemo: true },
  });
  await db.client.create({
    data: { name: "Studio Architettura Demo", email: "studio.demo@example.com", phone: "+41 91 000 00 00", company: "Studio Demo SA", city: "Lugano", notes: "Architetto: progetto residenziale (demo).", preferredLocationId: lugano.id, consultantId: sales.id, isDemo: true },
  });
  const c3 = await db.client.create({
    data: { name: "Famiglia Rossi (demo)", email: "rossi.demo@example.com", phone: "+39 031 000 000", city: "Como", notes: "Ristrutturazione villa sul lago (demo).", preferredLocationId: como.id, consultantId: sales2.id, isDemo: true },
  });
  await db.clientInterest.createMany({
    data: [
      { clientId: c1.id, productModelId: created["le-bambole"].id },
      { clientId: c1.id, productModelId: created["artemone"].id },
      { clientId: c3.id, productModelId: created["em-table"].id },
      { clientId: c3.id, productModelId: created["lithos"].id },
    ],
  });

  const visit = await db.showroomVisit.create({
    data: {
      clientId: c1.id, date: new Date(Date.now() - 3 * 86400_000), locationId: lugano.id, consultantId: sales.id,
      budget: "CHF 15.000 – 20.000", projectType: "Living e studio", timeline: "Entro 3 mesi", preferences: "Toni chiari, materiali naturali",
      notes: "Interessato a poltrone e contenitori.", nextAction: "Inviare proposta",
    },
  });
  await db.visitProduct.createMany({ data: [{ visitId: visit.id, productModelId: created["le-bambole"].id }, { visitId: visit.id, productModelId: created["artemone"].id }] });

  // Reservation on the warehouse leather armchair (1 of 2).
  await db.reservation.create({
    data: { inventoryItemId: bambMag.id, clientId: c3.id, quantity: 1, expiresAt: new Date(Date.now() + 10 * 86400_000), notes: "In attesa di conferma (demo)", createdById: sales2.id },
  });

  // Quotation (demo) matching the reference screens.
  const quotation = await db.quotation.create({
    data: {
      number: `PD-${new Date().getFullYear()}-0001`, title: "Proposta living e studio", clientId: c1.id, visitId: visit.id, status: "BOZZA", currency: "CHF",
      exchangeRate: 0.94, exchangeSource: "MANUALE", createdById: sales.id, notes: "Prezzi indicativi a scopo dimostrativo.",
      validUntil: new Date(Date.now() + 30 * 86400_000),
      items: {
        create: [
          { productModelId: created["le-bambole"].id, inventoryItemId: bambLugano.id, configurationId: created["le-bambole"].configs["Poltrona"], brandName: "B&B Italia", modelName: "Le Bambole", description: "Poltrona showroom", configLabel: "Poltrona", materials: "Tessuto / Grigio", dimensions: "L 103 × P 91 × H 73 cm", quantity: 1, unitPrice: 2350, sortOrder: 0 },
          { productModelId: created["artemone"].id, inventoryItemId: artemoneMag.id, configurationId: created["artemone"].configs["Secrétaire"], brandName: "Maxalto", modelName: "Artemone", description: "Esemplare in stock", configLabel: "Secrétaire", materials: "Metallo / Naturale", dimensions: "L 110 × P 45 × H 140 cm", quantity: 1, unitPrice: 12400, sortOrder: 1 },
        ],
      },
    },
  });
  await db.user.update({ where: { id: sales.id }, data: { activeQuotationId: quotation.id } });

  // Appointments (demo) — next days at 11:00 / 15:00 local.
  const at = (days: number, hour: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour - 1, 0, 0, 0); // ≈ local CET
    return d;
  };
  let dayOffset = 1;
  while ([0, 6].includes(at(dayOffset, 11).getUTCDay())) dayOffset++;
  await db.appointment.create({ data: { clientId: c1.id, locationId: lugano.id, consultantId: sales.id, type: "PRESENTAZIONE_PREVENTIVO", startsAt: at(dayOffset, 11), endsAt: at(dayOffset, 12), notes: "Presentazione proposta living (demo)" } });
  await db.appointment.create({ data: { clientId: c3.id, locationId: como.id, consultantId: sales2.id, type: "CONSULENZA_ARREDO", startsAt: at(dayOffset + 1, 15), endsAt: at(dayOffset + 1, 16), notes: "Scelta tavolo da pranzo (demo)" } });

  // Tasks (demo).
  await db.task.createMany({
    data: [
      { title: "Verificare disponibilità prodotti", completed: true, completedAt: new Date(), priority: "MEDIA", assigneeId: sales.id, createdById: sales.id, clientId: c1.id },
      { title: "Preparare selezione per visita showroom", priority: "ALTA", dueDate: at(dayOffset, 9), assigneeId: sales.id, createdById: sales.id, clientId: c1.id, quotationId: quotation.id },
      { title: "Richiamare cliente per conferma tavolo", priority: "MEDIA", dueDate: at(2, 10), assigneeId: sales2.id, createdById: sales2.id, clientId: c3.id },
      { title: "Contattare fornitore per tempi di consegna", priority: "BASSA", dueDate: at(5, 10), assigneeId: manager.id, createdById: manager.id },
    ],
  });

  // Settings.
  const heroKey = await storeSvg("site", HERO_ART);
  await db.setting.create({ data: { key: "site", value: { heroImageKey: heroKey, heroCredit: "Illustrazione dimostrativa" } } });
  await db.setting.create({ data: { key: "exchangeRate", value: { eurToChf: 0.94, source: "MANUALE", updatedAt: new Date().toISOString() } } });

  await db.auditLog.create({ data: { userId: admin.id, action: "seed", entity: "System", summary: "Dati dimostrativi caricati" } });

  console.log("\n✓ Dati dimostrativi creati.\n");
  console.log(`  Amministratore: ${adminEmail}  password: ${adminPw.generated ? adminPw.value + "  (generata)" : "(da SEED_ADMIN_PASSWORD)"}`);
  console.log(`  Utenti demo (manager@, consulente@, consulente.como@, magazzino@peverellidesign.com) password: ${demoPw.generated ? demoPw.value + "  (generata)" : "(da SEED_DEMO_PASSWORD)"}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
