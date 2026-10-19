import "server-only";
import { db } from "./db";

export async function inventoryFormOptions() {
  const [products, locations, materials] = await Promise.all([
    db.productModel.findMany({ where: { active: true }, include: { brand: true, configurations: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { active: true }, include: { zones: { orderBy: { name: "asc" } } }, orderBy: { sortOrder: "asc" } }),
    db.material.findMany({ include: { finishes: true, brand: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, label: `${p.brand.name} — ${p.name}`, configurations: p.configurations.map((c) => ({ id: c.id, name: c.name, dimensions: c.dimensions })) })),
    locations: locations.map((l) => ({ id: l.id, name: l.name, zones: l.zones })),
    materials: materials.map((m) => ({ id: m.id, label: m.brand ? `${m.name} (${m.brand.name})` : m.name, finishes: m.finishes })),
  };
}
