import "server-only";
import type { InventoryStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { AVAILABLE_STATUSES, netPrice, toNum } from "./format";
import { convert, getExchangeRate } from "./settings";

export type ProductFilters = {
  q?: string;
  brand?: string;
  category?: string;
  location?: string;
  availability?: "stock" | "esposto" | "magazzino" | "ordine" | "riservato";
  status?: InventoryStatus;
  priceMin?: number;
  priceMax?: number;
  material?: string;
  color?: string;
  maxWidth?: number;
  favorites?: boolean;
  sort?: "nome" | "prezzo-asc" | "prezzo-desc" | "recenti" | "brand";
};

export function parseProductFilters(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const s = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const n = (k: string) => {
    const v = s(k);
    return v && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  return {
    q: s("q"),
    brand: s("brand"),
    category: s("categoria"),
    location: s("sede"),
    availability: s("disponibilita") as ProductFilters["availability"],
    status: s("stato") as InventoryStatus | undefined,
    priceMin: n("min"),
    priceMax: n("max"),
    material: s("materiale"),
    color: s("colore"),
    maxWidth: n("larghezza"),
    favorites: s("preferiti") === "1",
    sort: s("ordina") as ProductFilters["sort"],
  };
}

const productInclude = {
  brand: true,
  category: true,
  images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], take: 1 },
  inventory: {
    where: { status: { not: "VENDUTO" } },
    include: { location: true, finish: true, material: true },
  },
  configurations: { include: { compatibility: { include: { material: true, finish: true } } } },
} satisfies Prisma.ProductModelInclude;

export type ProductCardData = Awaited<ReturnType<typeof searchProducts>>[number];

export async function searchProducts(f: ProductFilters, userId?: string) {
  const where: Prisma.ProductModelWhereInput = { active: true, AND: [] };
  const and = where.AND as Prisma.ProductModelWhereInput[];

  if (f.q) {
    for (const term of f.q.split(/\s+/).filter(Boolean)) {
      and.push({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { code: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { designer: { contains: term, mode: "insensitive" } },
          { brand: { name: { contains: term, mode: "insensitive" } } },
          { category: { name: { contains: term, mode: "insensitive" } } },
          { inventory: { some: { materialsDescription: { contains: term, mode: "insensitive" } } } },
          { inventory: { some: { location: { name: { contains: term, mode: "insensitive" } } } } },
        ],
      });
    }
  }
  if (f.brand) and.push({ brandId: f.brand });
  if (f.category) and.push({ categoryId: f.category });
  if (f.favorites && userId) and.push({ favorites: { some: { userId } } });
  if (f.maxWidth) and.push({ OR: [{ widthCm: { lte: f.maxWidth } }, { configurations: { some: { widthCm: { lte: f.maxWidth } } } }] });

  const invWhere: Prisma.InventoryItemWhereInput = {};
  if (f.location) invWhere.locationId = f.location;
  if (f.status) invWhere.status = f.status;
  if (f.availability === "stock") invWhere.status = { in: AVAILABLE_STATUSES };
  if (f.availability === "esposto") invWhere.status = "ESPOSTO";
  if (f.availability === "riservato") invWhere.status = "RISERVATO";
  if (f.availability === "magazzino") {
    invWhere.status = { in: AVAILABLE_STATUSES };
    invWhere.location = { type: "WAREHOUSE" };
  }
  if (f.material) invWhere.materialId = f.material;
  if (f.color) invWhere.finish = { name: { contains: f.color, mode: "insensitive" } };

  if (f.availability === "ordine") {
    and.push({ inventory: { none: { status: { in: AVAILABLE_STATUSES } } } });
  } else if (Object.keys(invWhere).length) {
    and.push({ inventory: { some: { ...invWhere, status: invWhere.status ?? { not: "VENDUTO" } } } });
  }
  // Material / colour can also match manufacturer options (configurations), not only stock.
  if ((f.material || f.color) && !f.location && !f.availability && !f.status) {
    and.pop();
    and.push({
      OR: [
        { inventory: { some: invWhere } },
        {
          configurations: {
            some: {
              compatibility: {
                some: {
                  ...(f.material ? { materialId: f.material } : {}),
                  ...(f.color ? { finish: { name: { contains: f.color, mode: "insensitive" } } } : {}),
                },
              },
            },
          },
        },
      ],
    });
  }

  const orderBy: Prisma.ProductModelOrderByWithRelationInput[] =
    f.sort === "recenti" ? [{ createdAt: "desc" }] : f.sort === "brand" ? [{ brand: { name: "asc" } }, { name: "asc" }] : [{ name: "asc" }];

  const [rows, rate] = await Promise.all([db.productModel.findMany({ where, include: productInclude, orderBy, take: 300 }), getExchangeRate()]);

  let result = rows.map((p) => {
    const relevant = f.location ? p.inventory.filter((i) => i.locationId === f.location) : p.inventory;
    const available = relevant.filter((i) => AVAILABLE_STATUSES.includes(i.status));
    // Lowest net price among available pieces (compared in EUR), with its list price for strike-through.
    const prices = available
      .map((i) => ({ v: netPrice(i) ?? 0, list: toNum(i.price), c: i.currency }))
      .filter((x) => x.v > 0)
      .sort((a, b) => convert(a.v, a.c, "EUR", rate) - convert(b.v, b.c, "EUR", rate));
    const fromPrice = prices.length
      ? { v: prices[0].v, c: prices[0].c, list: prices[0].list > prices[0].v ? prices[0].list : null }
      : p.listPrice
        ? { v: toNum(p.listPrice), c: p.currency, list: null }
        : null;
    const locations = [...new Map(relevant.map((i) => [i.location.id, i.location])).values()];
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      brand: p.brand.name,
      category: p.category.name,
      isDemo: p.isDemo,
      image: p.images[0] ?? null,
      inStock: available.length > 0,
      stockCount: available.reduce((s, i) => s + i.quantity, 0),
      statuses: [...new Set(relevant.map((i) => i.status))],
      locations: locations.map((l) => ({ id: l.id, name: l.name, type: l.type })),
      price: fromPrice,
      materialsText: [p.description, ...relevant.map((i) => i.materialsDescription ?? "")].join(" ").toLowerCase(),
      createdAt: p.createdAt,
    };
  });

  const eur = (r: (typeof result)[number]) => (r.price ? convert(r.price.v, r.price.c, "EUR", rate) : null);
  if (f.priceMin !== undefined) result = result.filter((r) => (eur(r) ?? -1) >= f.priceMin!);
  if (f.priceMax !== undefined) result = result.filter((r) => (eur(r) ?? Infinity) <= f.priceMax!);
  if (f.sort === "prezzo-asc") result.sort((a, b) => (eur(a) ?? Infinity) - (eur(b) ?? Infinity));
  if (f.sort === "prezzo-desc") result.sort((a, b) => (eur(b) ?? -1) - (eur(a) ?? -1));
  return result;
}

export async function getFilterOptions() {
  const [brands, categories, locations, materials] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.material.findMany({ orderBy: { name: "asc" }, include: { brand: true, finishes: true } }),
  ]);
  return { brands, categories, locations, materials };
}
