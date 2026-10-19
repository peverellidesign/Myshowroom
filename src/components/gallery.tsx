"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryImage = { id: string; src: string; kind: string; kindLabel: string; caption?: string | null; credit?: string | null };

export function Gallery({ images, name, showKinds = true }: { images: GalleryImage[]; name: string; showKinds?: boolean }) {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const current = images[index];
  const kinds = [...new Map(images.map((img, i) => [img.kind, { label: img.kindLabel, index: i }])).values()];

  if (!images.length) {
    return (
      <div className="card flex aspect-[4/3] items-center justify-center text-sm uppercase tracking-[0.2em] text-muted">Nessuna immagine</div>
    );
  }

  return (
    <div>
      <div className="card group relative aspect-[4/3] overflow-hidden bg-[#FBFBFA]">
        <button onClick={() => setFull(true)} className="block h-full w-full cursor-zoom-in" aria-label="Apri a schermo intero">
          <img src={current.src} alt={`${name} — ${current.kindLabel}`} className="h-full w-full object-contain p-4 sm:p-8" />
        </button>
        {current.credit && <span className="absolute bottom-3 left-3 rounded-full bg-black/30 px-3 py-1 text-xs text-white">{current.credit}</span>}
        <button onClick={() => setFull(true)} className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-ink shadow-sm" aria-label="Schermo intero">
          <Expand size={16} />
        </button>
        {images.length > 1 && (
          <>
            <button
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 opacity-0 shadow-sm transition group-hover:opacity-100"
              aria-label="Precedente"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 opacity-0 shadow-sm transition group-hover:opacity-100"
              aria-label="Successiva"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      {showKinds && kinds.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kinds.map((k) => (
            <button
              key={k.label}
              onClick={() => setIndex(k.index)}
              className={cn(
                "rounded-xl border bg-white py-2.5 text-sm transition",
                current.kindLabel === k.label ? "border-2 border-ink bg-selected" : "border-line hover:border-ink/30",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      {images.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setIndex(i)}
              className={cn("h-16 w-20 shrink-0 overflow-hidden rounded-lg border bg-white", i === index ? "border-ink" : "border-line")}
              aria-label={`Immagine ${i + 1}`}
            >
              <img src={img.src} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {full && <Lightbox images={images} start={index} onClose={(i) => (setIndex(i), setFull(false))} name={name} />}
    </div>
  );
}

function Lightbox({ images, start, onClose, name }: { images: GalleryImage[]; start: number; onClose: (i: number) => void; name: string }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [touchX, setTouchX] = useState<number | null>(null);
  const go = (d: number) => {
    setZoom(1);
    setI((x) => (x + d + images.length) % images.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(i);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#FAFAF8]" role="dialog" aria-label="Galleria a schermo intero">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-soft">
          {name} · {images[i].kindLabel} · {i + 1}/{images.length}
        </span>
        <div className="flex gap-1">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="rounded-full p-2.5 hover:bg-selected" aria-label="Riduci">
            <ZoomOut size={19} />
          </button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="rounded-full p-2.5 hover:bg-selected" aria-label="Ingrandisci">
            <ZoomIn size={19} />
          </button>
          <button onClick={() => onClose(i)} className="rounded-full p-2.5 hover:bg-selected" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-auto"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null || zoom > 1) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        <div className="flex min-h-full items-center justify-center" style={{ width: `${zoom * 100}%`, height: zoom > 1 ? `${zoom * 100}%` : "100%" }}>
          <img
            src={images[i].src}
            alt={images[i].caption ?? name}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
            className={cn("max-h-full max-w-full object-contain p-4", zoom > 1 ? "h-full w-full cursor-zoom-out" : "cursor-zoom-in")}
          />
        </div>
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="fixed left-3 top-1/2 rounded-full bg-white p-3 shadow" aria-label="Precedente">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => go(1)} className="fixed right-3 top-1/2 rounded-full bg-white p-3 shadow" aria-label="Successiva">
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      {images[i].caption && <p className="pb-safe px-4 pt-2 text-center text-sm text-soft">{images[i].caption}</p>}
    </div>,
    document.body,
  );
}
