"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { Modal } from "./ui/modal";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

export function ProductFilters({
  brands,
  categories,
  locations,
  materials,
  colors,
  count,
}: {
  brands: Opt[];
  categories: Opt[];
  locations: (Opt & { type: string })[];
  materials: Opt[];
  colors: string[];
  count: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);

  function set(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = sp.get("vista") ?? "griglia";
  const sede = sp.get("sede") ?? "";
  const advancedKeys = ["brand", "disponibilita", "min", "max", "materiale", "colore", "larghezza", "preferiti"];
  const activeAdvanced = advancedKeys.filter((k) => sp.get(k)).length;

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca modello, brand o categoria…" className="field" type="search" aria-label="Cerca prodotti" />

      <div>
        <p className="eyebrow mb-2">Sede</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button onClick={() => set({ sede: null })} className={cn("chip", !sede && "chip-active")}>
            Tutte
          </button>
          {locations.map((l) => (
            <button key={l.id} onClick={() => set({ sede: l.id })} className={cn("chip", sede === l.id && "chip-active")}>
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select className="field" value={sp.get("categoria") ?? ""} onChange={(e) => set({ categoria: e.target.value })} aria-label="Categoria">
          <option value="">Tutte le categorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="field" value={sp.get("stato") ?? ""} onChange={(e) => set({ stato: e.target.value })} aria-label="Stato">
          <option value="">Tutti gli stati</option>
          <option value="ESPOSTO">Esposto</option>
          <option value="DISPONIBILE">Disponibile</option>
          <option value="RISERVATO">Riservato</option>
          <option value="IN_TRASFERIMENTO">In trasferimento</option>
        </select>
        <select className="field col-span-2 lg:col-span-1" value={sp.get("ordina") ?? ""} onChange={(e) => set({ ordina: e.target.value })} aria-label="Ordina">
          <option value="">Ordina: nome</option>
          <option value="brand">Ordina: brand</option>
          <option value="prezzo-asc">Prezzo crescente</option>
          <option value="prezzo-desc">Prezzo decrescente</option>
          <option value="recenti">Più recenti</option>
        </select>
        <button onClick={() => setOpen(true)} className="chip col-span-2 justify-center py-3 lg:col-span-1">
          <SlidersHorizontal size={15} /> Filtri {activeAdvanced > 0 && `(${activeAdvanced})`}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[15px] text-soft">
          {count} prodott{count === 1 ? "o" : "i"}
          {(activeAdvanced > 0 || sede || sp.get("categoria") || sp.get("stato") || sp.get("q")) && (
            <button
              onClick={() => {
                setQ("");
                start(() => router.replace(pathname));
              }}
              className="flex items-center gap-1 text-sm text-ink link-quiet"
            >
              <X size={14} /> Azzera
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-full bg-selected p-1">
          <button onClick={() => set({ vista: null })} className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm", view === "griglia" ? "bg-white shadow-sm" : "text-soft")}>
            <LayoutGrid size={14} /> Griglia
          </button>
          <button onClick={() => set({ vista: "lista" })} className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm", view === "lista" ? "bg-white shadow-sm" : "text-soft")}>
            <List size={14} /> Lista
          </button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Filtri avanzati">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const u: Record<string, string | null> = {};
            for (const k of advancedKeys) u[k] = (fd.get(k) as string) || null;
            set(u);
            setOpen(false);
          }}
        >
          <label className="block">
            <span className="label">Brand</span>
            <select name="brand" defaultValue={sp.get("brand") ?? ""} className="field">
              <option value="">Tutti i brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Disponibilità</span>
            <select name="disponibilita" defaultValue={sp.get("disponibilita") ?? ""} className="field">
              <option value="">Qualsiasi</option>
              <option value="stock">Disponibile in stock Peverelli</option>
              <option value="esposto">Esposto in showroom</option>
              <option value="magazzino">Disponibile in magazzino</option>
              <option value="riservato">Riservato</option>
              <option value="ordine">Solo su ordinazione dal produttore</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Prezzo min</span>
              <input name="min" type="number" min={0} defaultValue={sp.get("min") ?? ""} className="field" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="label">Prezzo max</span>
              <input name="max" type="number" min={0} defaultValue={sp.get("max") ?? ""} className="field" inputMode="numeric" />
            </label>
          </div>
          <label className="block">
            <span className="label">Materiale</span>
            <select name="materiale" defaultValue={sp.get("materiale") ?? ""} className="field">
              <option value="">Tutti i materiali</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Colore / finitura</span>
            <select name="colore" defaultValue={sp.get("colore") ?? ""} className="field">
              <option value="">Tutti i colori</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Larghezza massima (cm)</span>
            <input name="larghezza" type="number" min={0} defaultValue={sp.get("larghezza") ?? ""} className="field" inputMode="numeric" />
          </label>
          <label className="flex items-center gap-3 px-1 text-[15px]">
            <input type="checkbox" name="preferiti" value="1" defaultChecked={sp.get("preferiti") === "1"} className="h-5 w-5 accent-[#222]" />
            Solo preferiti
          </label>
          <p className="px-1 text-xs text-muted">I prezzi filtrano il prezzo del pezzo in stock o, in assenza, il prezzo di listino indicativo.</p>
          <button type="submit" className="h-12 w-full rounded-full bg-charcoal text-white">
            Applica filtri
          </button>
        </form>
      </Modal>
    </div>
  );
}
