import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth";
import { getEmailSettings } from "./settings";
import { renderTemplate, TEMPLATE_LABELS, type TemplateKey } from "./email-templates";
import { lineTotal, quotationTotals } from "./quotations";
import { fmtDateTime, money } from "./format";

/** Loads client/quotation context and pre-renders every template for the composer. */
export async function composerContext(user: SessionUser, opts: { clientId?: string | null; quotationId?: string | null }) {
  const quotation = opts.quotationId
    ? await db.quotation.findUnique({ where: { id: opts.quotationId }, include: { items: { orderBy: { sortOrder: "asc" } }, client: true } })
    : opts.clientId
      ? await db.quotation.findFirst({ where: { clientId: opts.clientId, status: { not: "RIFIUTATO" } }, include: { items: { orderBy: { sortOrder: "asc" } }, client: true }, orderBy: { updatedAt: "desc" } })
      : null;
  const clientId = opts.clientId ?? quotation?.clientId ?? null;
  const client = clientId
    ? await db.client.findUnique({
        where: { id: clientId },
        include: {
          preferredLocation: true,
          visits: { orderBy: { date: "desc" }, take: 1, include: { location: true, products: { include: { productModel: { include: { brand: true } } } } } },
          appointments: { where: { status: "CONFERMATO", startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 1, include: { location: true } },
          interests: { include: { productModel: { include: { brand: true } } } },
        },
      })
    : null;
  const settings = await getEmailSettings();
  const totals = quotation ? quotationTotals(quotation) : null;
  const visit = client?.visits[0];
  const appt = client?.appointments[0];
  const productLines = quotation
    ? quotation.items.map((i) => `• ${i.brandName} ${i.modelName}${i.configLabel ? ` — ${i.configLabel}` : ""}`).join("\n")
    : visit?.products.length
      ? visit.products.map((p) => `• ${p.productModel.brand.name} ${p.productModel.name}`).join("\n")
      : client?.interests.map((i) => `• ${i.productModel.brand.name} ${i.productModel.name}`).join("\n");
  const vars = {
    cliente: client?.name ?? "Cliente",
    consulente: user.name,
    firma: settings.signature,
    numero: quotation?.number,
    totale: totals && quotation ? money(totals.total, quotation.currency) : undefined,
    showroom: appt?.location.name ?? visit?.location.name ?? client?.preferredLocation?.name,
    data: appt ? fmtDateTime(appt.startsAt) : undefined,
    prodotti: productLines || undefined,
  };
  const templates = (Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map((key) => ({ key, label: TEMPLATE_LABELS[key], ...renderTemplate(key, vars) }));
  return {
    client,
    templates,
    quotation: quotation
      ? {
          id: quotation.id,
          number: quotation.number,
          total: money(totals!.total, quotation.currency),
          lines: quotation.items.map((i) => `${i.brandName} ${i.modelName} × ${i.quantity} — ${money(lineTotal(i), quotation.currency)}`),
        }
      : null,
  };
}
