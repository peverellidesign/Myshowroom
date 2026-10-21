"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookOpen, GitCompareArrows, Heart, Plus, Share2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { useToast } from "./ui/toast";
import { buttonClass } from "./ui/button";
import { AddToQuoteForm, type QuoteOption } from "./add-to-quote";
import { ReserveForm, type ReservableItem } from "./reserve-form";
import { toggleFavorite } from "@/app/(app)/prodotti/actions";
import { cn } from "@/lib/utils";

export const COMPARE_KEY = "myshowroom.compare";

export function readCompare(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COMPARE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ProductActions({
  productId,
  name,
  favorite,
  quoteOptions,
  reservable,
  clients,
  catalogHref,
  canQuote,
  canReserve,
}: {
  productId: string;
  name: string;
  favorite: boolean;
  quoteOptions: QuoteOption[];
  reservable: ReservableItem[];
  clients: { id: string; name: string }[];
  catalogHref: string | null;
  canQuote: boolean;
  canReserve: boolean;
}) {
  const [modal, setModal] = useState<"quote" | "reserve" | null>(null);
  const [fav, setFav] = useState(favorite);
  const [inCompare, setInCompare] = useState(false);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => setInCompare(readCompare().includes(productId)), [productId]);

  function compare() {
    let list = readCompare();
    if (list.includes(productId)) {
      router.push(`/prodotti/confronta?ids=${list.join(",")}`);
      return;
    }
    list = [...list, productId].slice(-4);
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
    } catch {}
    setInCompare(true);
    toast(`Aggiunto al confronto (${list.length}/4).`);
  }

  async function share() {
    const url = window.location.href.split("?")[0];
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copiato negli appunti.");
      }
    } catch {}
  }

  const secondary = "flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-2 py-3 text-[12.5px] text-ink transition hover:border-ink/30";

  return (
    <>
      {/* Sticky on mobile, inline on desktop */}
      <div className="fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom))] z-30 border-t border-black/[0.06] bg-white/90 px-4 py-2.5 backdrop-blur-xl lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-xl gap-2 lg:max-w-none">
          {canQuote && (
            <button onClick={() => setModal("quote")} className={buttonClass("primary", "lg", "min-w-0 flex-1 px-4 text-[15px] sm:text-base")}>
              <Plus size={17} className="shrink-0" />
              <span className="truncate">Aggiungi al preventivo</span>
            </button>
          )}
          {canReserve && (
            <button
              onClick={() => setModal("reserve")}
              className={buttonClass("secondary", "lg", "w-[52px] shrink-0 px-0 text-[15px] min-[380px]:w-auto min-[380px]:px-5 sm:text-base lg:flex-1")}
              disabled={!reservable.length}
              title={reservable.length ? "Riserva prodotto" : "Nessun pezzo in stock"}
              aria-label="Riserva prodotto"
            >
              <Bookmark size={17} className="shrink-0" />
              <span className="hidden min-[380px]:inline sm:hidden">Riserva</span>
              <span className="hidden sm:inline">Riserva prodotto</span>
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button onClick={compare} className={cn(secondary, inCompare && "border-ink")}>
          <GitCompareArrows size={18} strokeWidth={1.5} />
          {inCompare ? "Vedi confronto" : "Confronta"}
        </button>
        <button
          onClick={() =>
            start(async () => {
              setFav((f) => !f);
              const res = await toggleFavorite(productId);
              if (!res.ok) {
                setFav((f) => !f);
                toast(res.error, true);
              }
            })
          }
          className={secondary}
          aria-pressed={fav}
        >
          <Heart size={18} strokeWidth={1.5} className={fav ? "fill-ink" : ""} />
          {fav ? "Preferito" : "Preferiti"}
        </button>
        <button onClick={share} className={secondary}>
          <Share2 size={18} strokeWidth={1.5} />
          Condividi
        </button>
        {catalogHref ? (
          <a href={catalogHref} className={secondary}>
            <BookOpen size={18} strokeWidth={1.5} />
            Catalogo
          </a>
        ) : (
          <a href="?tab=documenti" className={cn(secondary, "text-muted")}>
            <BookOpen size={18} strokeWidth={1.5} />
            Catalogo
          </a>
        )}
      </div>

      <Modal open={modal === "quote"} onClose={() => setModal(null)} title="Aggiungi al preventivo">
        <AddToQuoteForm productModelId={productId} options={quoteOptions} onDone={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "reserve"} onClose={() => setModal(null)} title="Riserva prodotto">
        <ReserveForm items={reservable} clients={clients} onDone={() => setModal(null)} />
      </Modal>
    </>
  );
}
