import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABELS } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  let quoteCount = 0;
  let quoteHref = "/preventivi";
  if (user.activeQuotationId) {
    const q = await db.quotation.findFirst({
      where: { id: user.activeQuotationId, status: { in: ["BOZZA", "IN_TRATTATIVA"] } },
      select: { id: true, _count: { select: { items: true } } },
    });
    if (q) {
      quoteCount = q._count.items;
      quoteHref = `/preventivi/${q.id}`;
    }
  }
  return (
    <Shell
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
      quoteCount={quoteCount}
      quoteHref={quoteHref}
      perms={{
        clients: can(user.role, "client:view"),
        quotes: can(user.role, "quote:view"),
        admin: can(user.role, "admin:access"),
        appointments: can(user.role, "appointment:view"),
      }}
    >
      {children}
    </Shell>
  );
}
