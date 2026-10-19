import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin:access");
  const items = [
    { href: "/admin", label: "Panoramica", show: true },
    { href: "/admin/utenti", label: "Utenti e ruoli", show: can(user.role, "admin:users") },
    { href: "/admin/sedi", label: "Sedi e disponibilità", show: can(user.role, "admin:settings") },
    { href: "/admin/catalogo", label: "Brand e materiali", show: can(user.role, "product:edit") },
    { href: "/admin/prenotazioni", label: "Prenotazioni", show: true },
    { href: "/admin/impostazioni", label: "Impostazioni", show: can(user.role, "admin:settings") },
    { href: "/admin/audit", label: "Registro attività", show: can(user.role, "audit:view") },
  ].filter((i) => i.show);
  return (
    <div className="animate-fadein">
      <p className="eyebrow mb-2">Amministrazione</p>
      <AdminNav items={items} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
