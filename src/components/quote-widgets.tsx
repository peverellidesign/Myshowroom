"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { useToast } from "./ui/toast";
import { setQuotationClient } from "@/app/(app)/preventivi/actions";

export function ClientSelect({ quotationId, clientId, clients, disabled }: { quotationId: string; clientId: string | null; clients: { id: string; name: string }[]; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <select
      className="field"
      defaultValue={clientId ?? ""}
      disabled={disabled || pending}
      aria-label="Cliente"
      onChange={(e) =>
        start(async () => {
          const res = await setQuotationClient(quotationId, e.target.value || null);
          if (!res.ok) toast(res.error, true);
          else router.refresh();
        })
      }
    >
      <option value="">Seleziona cliente…</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

type ProductOpt = {
  id: string;
  label: string;
  configurations: { id: string; name: string }[];
  stock: { id: string; label: string }[];
};

export function AddItemForm({ action, products }: { action: (fd: FormData) => Promise<import("@/lib/action").ActionResult<unknown>>; products: ProductOpt[] }) {
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.id === productId);
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="flex gap-1 rounded-full bg-selected p-1 text-sm">
        <button type="button" onClick={() => setMode("catalog")} className={`flex-1 rounded-full py-2 ${mode === "catalog" ? "bg-white shadow-sm" : "text-soft"}`}>
          Dal catalogo
        </button>
        <button type="button" onClick={() => setMode("custom")} className={`flex-1 rounded-full py-2 ${mode === "custom" ? "bg-white shadow-sm" : "text-soft"}`}>
          Voce libera
        </button>
      </div>
      {mode === "catalog" ? (
        <>
          <select name="productModelId" value={productId} onChange={(e) => setProductId(e.target.value)} className="field" required>
            <option value="" disabled>
              Seleziona prodotto…
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {product && product.stock.length > 0 && (
            <label className="block">
              <span className="label">Pezzo in stock Peverelli</span>
              <select name="inventoryItemId" className="field" defaultValue="">
                <option value="">— Nessuno (su ordinazione)</option>
                {product.stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {product && product.configurations.length > 0 && (
            <label className="block">
              <span className="label">Composizione dal produttore</span>
              <select name="configurationId" className="field" defaultValue="">
                <option value="">—</option>
                {product.configurations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <input name="brandName" placeholder="Brand" className="field" />
            <input name="modelName" placeholder="Voce / modello" className="field" required />
          </div>
          <input name="description" placeholder="Descrizione" className="field" />
          <input name="unitPrice" type="number" min={0} step="0.01" placeholder="Prezzo unitario" className="field" />
        </>
      )}
      <label className="block">
        <span className="label">Quantità</span>
        <input name="quantity" type="number" min={1} defaultValue={1} className="field" />
      </label>
      <SubmitButton className="w-full">Aggiungi riga</SubmitButton>
    </ActionForm>
  );
}

export function CopyQuote({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("Preventivo copiato negli appunti.");
        } catch {
          toast("Copia non riuscita.", true);
        }
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white text-[15px] hover:border-ink/30"
    >
      Copia preventivo
    </button>
  );
}

