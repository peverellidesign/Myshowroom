import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { fmtDate } from "@/lib/format";
import { ActionButton } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/misc";
import { release } from "../../stock/actions";

export const metadata = { title: "Prenotazioni" };

export default async function ReservationsAdmin() {
  const user = await requireUser("admin:access");
  await expireReservations();
  const reservations = await db.reservation.findMany({
    where: { status: "ACTIVE" },
    include: { client: true, createdBy: true, inventoryItem: { include: { productModel: { include: { brand: true } }, location: true } } },
    orderBy: { expiresAt: "asc" },
  });
  if (!reservations.length) return <EmptyState title="Nessuna prenotazione attiva" />;
  return (
    <div className="card divide-y divide-line">
      {reservations.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Link href={`/stock/${r.inventoryItemId}`} className="text-[15px] hover:underline">
              {r.inventoryItem.productModel.brand.name} {r.inventoryItem.productModel.name} · {r.inventoryItem.location.name}
            </Link>
            <p className="text-sm text-soft">
              <Link href={`/clienti/${r.clientId}`} className="link-quiet">{r.client.name}</Link> · {r.quantity} pz · scade {fmtDate(r.expiresAt)} · {r.createdBy.name}
            </p>
          </div>
          {can(user.role, "inventory:reserve") && (
            <ActionButton action={release.bind(null, r.id)} confirm="Rilasciare la prenotazione?">Rilascia</ActionButton>
          )}
        </div>
      ))}
    </div>
  );
}
