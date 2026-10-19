import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Registro attività" };

const ENTITY_LINKS: Record<string, string> = {
  InventoryItem: "/stock/",
  ProductModel: "/prodotti/",
  Quotation: "/preventivi/",
  Client: "/clienti/",
  Document: "/documenti/",
  EmailMessage: "/email/",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await requireUser("audit:view");
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const logs = await db.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 100, skip: (page - 1) * 100 });
  return (
    <div>
      <div className="card divide-y divide-line">
        {logs.map((l) => (
          <div key={l.id} className="flex flex-col gap-0.5 p-3.5 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-36 shrink-0 text-xs text-muted">{fmtDateTime(l.createdAt)}</span>
            <span className="min-w-0 flex-1 text-[15px]">
              {l.entityId && ENTITY_LINKS[l.entity] ? (
                <Link href={ENTITY_LINKS[l.entity] + l.entityId} className="hover:underline">
                  {l.summary}
                </Link>
              ) : (
                l.summary
              )}
            </span>
            <span className="shrink-0 text-sm text-soft">{l.user?.name ?? "Sistema"}</span>
            <code className="shrink-0 text-xs text-muted">{l.action}</code>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link href={`?pagina=${page - 1}`} className="link-quiet">← Più recenti</Link> : <span />}
        {logs.length === 100 && <Link href={`?pagina=${page + 1}`} className="link-quiet">Meno recenti →</Link>}
      </div>
    </div>
  );
}
