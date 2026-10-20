"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, Loader2, MapPin, Plus, Sparkles } from "lucide-react";
import { ask } from "./actions";
import type { AskResult } from "@/lib/ai";
import { addToQuotation } from "../preventivi/actions";
import { useToast } from "@/components/ui/toast";
import { StatusText } from "@/components/product-card";
import { useRouter } from "next/navigation";

type Msg = { role: "user"; text: string } | { role: "assistant"; text: string; result: AskResult };

const EXAMPLES = [
  "Quali divani chiari abbiamo disponibili?",
  "Mostrami i tavoli esposti a Como.",
  "Quali prodotti Maxalto sono disponibili in magazzino?",
  "Trova prodotti sotto i 5.000 euro.",
  "Preparami una selezione per un cliente.",
];

export function AskChat({ aiEnabled, canQuote }: { aiEnabled: boolean; canQuote: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, pending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    start(async () => {
      const res = await ask(q, history);
      if (!res.ok) {
        toast(res.error, true);
        return;
      }
      setMsgs((m) => [...m, { role: "assistant", text: res.result.answer, result: res.result }]);
    });
  }

  async function quote(productModelId: string, inventoryItemId: string | null) {
    const res = await addToQuotation({ productModelId, inventoryItemId });
    if (!res.ok) return toast(res.error, true);
    toast(`Aggiunto al preventivo ${res.data?.number ?? ""}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="mb-4 flex items-center gap-2 text-sm text-soft">
        <Sparkles size={15} />
        {aiEnabled ? "Assistente AI attivo · risultati dall'inventario reale" : "Ricerca strutturata (assistente AI non configurato) · risultati dall'inventario reale"}
      </div>

      {msgs.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => send(e)} className="card p-4 text-left text-[15px] transition hover:border-ink/25">
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-6">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[22px] bg-charcoal px-5 py-3 text-[15px] text-white">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <p className="max-w-3xl whitespace-pre-line text-[16px] leading-relaxed">{m.text}</p>
              {m.result.mode === "fallback" && m.result.interpreted && m.result.interpreted.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.result.interpreted.map((n) => (
                    <span key={n} className="rounded-full bg-selected px-3 py-1 text-xs text-soft">
                      {n}
                    </span>
                  ))}
                </div>
              )}
              {m.result.products.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {m.result.products.map((p) => {
                    const status = p.statuses.includes("ESPOSTO") ? "ESPOSTO" : p.statuses.includes("DISPONIBILE") ? "DISPONIBILE" : p.statuses[0];
                    return (
                      <div key={p.id} className="card flex gap-3 p-3">
                        <Link href={`/prodotti/${p.id}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F7F7F5]">
                          {p.image && <img src={`/api/files/${p.image.storageKey}`} alt={p.name} className="h-full w-full object-contain p-1.5" />}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/prodotti/${p.id}`} className="block">
                            <p className="eyebrow">{p.brand}</p>
                            <p className="truncate text-[15px]">{p.name}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-soft">
                              <MapPin size={12} /> {p.locations.length ? p.locations.map((l) => l.name).join(" · ") : "Su ordinazione"}
                            </p>
                            <p className="text-xs">{status ? <StatusText status={status} /> : <span className="text-muted">Su ordinazione</span>}</p>
                          </Link>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-sm">{p.priceLabel ?? ""}</span>
                            {canQuote && (
                              <button onClick={() => quote(p.id, p.firstStockId)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs hover:border-ink/30">
                                <Plus size={12} /> Aggiungi al preventivo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-soft">
            <Loader2 size={15} className="animate-spin" /> Sto cercando nell&apos;inventario…
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] mt-6 flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] lg:bottom-6"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Chiedi a myshowroom…" className="flex-1 bg-transparent py-2 text-[16px] outline-none" aria-label="Domanda" />
        <button type="submit" disabled={pending || !input.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-white disabled:bg-[#ccc]" aria-label="Invia">
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
