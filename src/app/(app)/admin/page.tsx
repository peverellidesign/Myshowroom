import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { aiConfigured } from "@/lib/ai";
import { getExchangeRate } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Stat } from "@/components/ui/misc";

export const metadata = { title: "Amministrazione" };

export default async function AdminHome() {
  await requireUser("admin:access");
  const [users, products, items, docs, demoProducts, rate] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.productModel.count({ where: { active: true } }),
    db.inventoryItem.count({ where: { status: { not: "VENDUTO" } } }),
    db.document.count(),
    db.productModel.count({ where: { isDemo: true } }),
    getExchangeRate(),
  ]);
  const status = [
    ["Database", "Connesso", true],
    ["Archivio file", "Locale (STORAGE_DIR)", true],
    ["Server email (SMTP)", emailConfigured() ? "Configurato" : "Non configurato — invio disabilitato", emailConfigured()],
    ["Assistente AI", aiConfigured() ? "Configurato" : "Non configurato — ricerca strutturata", aiConfigured()],
    ["Cambio EUR/CHF", `${rate.eurToChf.toFixed(4)} · ${rate.source === "BCE" ? `BCE ${rate.referenceDate}` : `manuale (${fmtDateTime(rate.updatedAt)})`}`, true],
  ] as const;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Utenti attivi" value={users} href="/admin/utenti" />
        <Stat label="Modelli prodotto" value={products} href="/prodotti" />
        <Stat label="Pezzi in stock" value={items} href="/stock" />
        <Stat label="Documenti" value={docs} href="/documenti" />
      </div>
      {demoProducts > 0 && (
        <p className="rounded-2xl border border-line bg-white px-5 py-4 text-sm text-soft">
          Sono presenti {demoProducts} prodotti dimostrativi (badge «Demo»). Sostituiscili con l&apos;inventario reale Peverelli: crea i modelli in <Link href="/prodotti/nuovo" className="link-quiet">Prodotti</Link> e i pezzi fisici in <Link href="/stock/nuovo" className="link-quiet">Stock</Link>.
        </p>
      )}
      <section>
        <h2 className="eyebrow mb-3">Stato dei servizi</h2>
        <div className="card divide-y divide-line">
          {status.map(([k, v, ok]) => (
            <div key={k} className="flex items-center justify-between gap-4 p-4 text-[15px]">
              <span>{k}</span>
              <span className={ok ? "text-soft" : "text-warning"}>{v}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
