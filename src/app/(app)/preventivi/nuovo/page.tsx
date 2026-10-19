import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/misc";
import { createQuotation } from "../actions";

export const metadata = { title: "Nuovo preventivo" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requireUser("quote:edit");
  const { cliente } = await searchParams;
  const clients = await db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="mx-auto max-w-xl animate-fadein">
      <PageHeader eyebrow="Preventivi" title="Nuova proposta." subtitle="I prodotti aggiunti dalle schede confluiranno qui." />
      <div className="card p-6">
        <NewForm clients={clients} clientId={cliente} />
      </div>
    </div>
  );
}

function NewForm({ clients, clientId }: { clients: { id: string; name: string }[]; clientId?: string }) {
  return (
    <ActionForm action={createQuotation} redirectPattern="/preventivi/{id}" className="space-y-4">
      <label className="block">
        <span className="label">Cliente</span>
        <select name="clientId" defaultValue={clientId ?? ""} className="field">
          <option value="">Nessun cliente (da associare)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Titolo</span>
        <input name="title" placeholder="Es. Proposta zona living" className="field" />
      </label>
      <label className="block">
        <span className="label">Valuta</span>
        <select name="currency" defaultValue="CHF" className="field">
          <option>CHF</option>
          <option>EUR</option>
        </select>
      </label>
      <SubmitButton className="w-full">Crea preventivo</SubmitButton>
    </ActionForm>
  );
}
