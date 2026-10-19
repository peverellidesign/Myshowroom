"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { addToQuotation } from "@/app/(app)/preventivi/actions";
import { useToast } from "./ui/toast";
import { buttonClass } from "./ui/button";
import { cn } from "@/lib/utils";

export type QuoteOption = { value: string; label: string; sub: string; kind: "stock" | "config" | "base" };

/** Lets the consultant choose what to quote: a physical piece, a manufacturer configuration, or the base model. */
export function AddToQuoteForm({ productModelId, options, onDone }: { productModelId: string; options: QuoteOption[]; onDone?: () => void }) {
  const [choice, setChoice] = useState(options[0]?.value ?? "base:");
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function submit() {
    const [kind, id] = choice.split(":");
    start(async () => {
      const res = await addToQuotation({
        productModelId,
        inventoryItemId: kind === "stock" ? id : null,
        configurationId: kind === "config" ? id : null,
        quantity: qty,
      });
      if (!res.ok) return toast(res.error, true);
      toast(`Aggiunto al preventivo ${res.data?.number ?? ""}`);
      onDone?.();
      router.refresh();
    });
  }

  const groups: [QuoteOption["kind"], string][] = [
    ["stock", "Disponibile in stock Peverelli"],
    ["config", "Su ordinazione dal produttore"],
    ["base", "Modello base"],
  ];

  return (
    <div className="space-y-4">
      {groups.map(([kind, title]) => {
        const opts = options.filter((o) => o.kind === kind);
        if (!opts.length) return null;
        return (
          <div key={kind}>
            <p className="eyebrow mb-2">{title}</p>
            <div className="space-y-2">
              {opts.map((o) => (
                <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3.5", choice === o.value ? "border-ink" : "border-line")}>
                  <input type="radio" name="choice" checked={choice === o.value} onChange={() => setChoice(o.value)} className="mt-1 accent-[#222]" />
                  <span>
                    <span className="block text-[15px]">{o.label}</span>
                    <span className="block text-sm text-soft">{o.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <label className="block">
        <span className="label">Quantità</span>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="field" />
      </label>
      <button onClick={submit} disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        Aggiungi al preventivo
      </button>
    </div>
  );
}
