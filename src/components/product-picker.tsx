"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerProduct = { id: string; name: string; brand: string };

/** Multi-select of product models with optional per-product starting page. */
export function ProductPicker({
  products,
  defaultSelected = [],
  withStartPage = true,
  name = "productIds",
}: {
  products: PickerProduct[];
  defaultSelected?: string[];
  withStartPage?: boolean;
  name?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => products.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase())),
    [products, q],
  );
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="rounded-2xl border border-line bg-white">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtra prodotti…"
        className="w-full rounded-t-2xl border-b border-line bg-transparent px-4 py-2.5 text-sm outline-none"
      />
      <div className="max-h-56 overflow-y-auto">
        {filtered.map((p) => {
          const on = selected.includes(p.id);
          return (
            <div key={p.id} className={cn("flex items-center gap-3 px-4 py-2", on && "bg-[#FAFAF8]")}>
              <button type="button" onClick={() => toggle(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-charcoal bg-charcoal text-white" : "border-line")}>
                  {on && <Check size={13} />}
                </span>
                <span className="min-w-0 truncate text-sm">
                  <span className="text-soft">{p.brand}</span> · {p.name}
                </span>
              </button>
              {on && <input type="hidden" name={name} value={p.id} />}
              {on && withStartPage && (
                <input
                  name={`startPage_${p.id}`}
                  type="number"
                  min={1}
                  placeholder="Pag."
                  title="Pagina iniziale per questo prodotto (facoltativa)"
                  className="w-20 rounded-full border border-line px-3 py-1 text-sm outline-none"
                />
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nessun prodotto.</p>}
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        {selected.length} selezionat{selected.length === 1 ? "o" : "i"}
        {withStartPage && " · la pagina iniziale è facoltativa"}
      </p>
    </div>
  );
}
