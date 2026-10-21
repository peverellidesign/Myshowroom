"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, Loader2, Minimize, Minus, Plus, ScanLine } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { cn } from "@/lib/utils";

/** Embedded, mobile-friendly PDF viewer (pdf.js): page navigation, zoom, full screen, download. */
export function PdfViewer({ src, downloadHref, initialPage = 1, title }: { src: string; downloadHref: string; initialPage?: number; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [effectiveScale, setEffectiveScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: src, withCredentials: true }).promise;
        if (cancelled) return doc.destroy();
        setPdf(doc);
        setPage((p) => Math.min(Math.max(1, p), doc!.numPages));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Impossibile aprire il PDF. Prova a scaricarlo.");
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [src]);

  const render = useCallback(async () => {
    if (!pdf || !canvasRef.current || !scrollRef.current) return;
    setRendering(true);
    try {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const available = scrollRef.current.clientWidth - 24;
      const scale = zoom === "fit" ? Math.max(0.2, available / base.width) : zoom;
      setEffectiveScale(scale);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = p.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      renderTask.current?.cancel();
      const task = p.render({ canvasContext: canvas.getContext("2d")!, viewport });
      renderTask.current = task;
      await task.promise;
    } catch (e) {
      if ((e as Error)?.name !== "RenderingCancelledException") console.error(e);
    } finally {
      setRendering(false);
    }
  }, [pdf, page, zoom]);

  useEffect(() => {
    render();
  }, [render, full]);

  useEffect(() => {
    const onResize = () => zoom === "fit" && render();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [render, zoom]);

  useEffect(() => setPageInput(String(page)), [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape" && full) toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setFull(false);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const total = pdf?.numPages ?? 0;
  const go = (d: number) => setPage((p) => Math.min(Math.max(1, p + d), total || 1));

  function toggleFull() {
    const el = containerRef.current;
    if (!full) {
      // Native full screen where supported (desktop, iPad); CSS overlay fallback (iPhone).
      el?.requestFullscreen?.().catch(() => {});
      setFull(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setFull(false);
    }
  }

  const setZoomStep = (dir: 1 | -1) => setZoom(Math.min(4, Math.max(0.3, Math.round((effectiveScale + dir * 0.25) * 100) / 100)));

  return (
    <div ref={containerRef} className={cn("flex flex-col overflow-hidden rounded-2xl border border-line bg-mist", full && "fixed inset-0 z-[95] rounded-none border-0")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => go(-1)} disabled={page <= 1} className="rounded-full p-2 hover:bg-selected disabled:opacity-30" aria-label="Pagina precedente">
            <ChevronLeft size={18} />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(pageInput);
              if (n >= 1 && n <= total) setPage(n);
              else setPageInput(String(page));
            }}
            className="flex items-center gap-1 text-sm text-soft"
          >
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value)} inputMode="numeric" className="w-12 rounded-full border border-line px-2 py-1 text-center text-ink outline-none" aria-label="Pagina" />
            <span>/ {total || "…"}</span>
          </form>
          <button onClick={() => go(1)} disabled={page >= total} className="rounded-full p-2 hover:bg-selected disabled:opacity-30" aria-label="Pagina successiva">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="hidden min-w-0 flex-1 truncate px-2 text-center text-sm text-soft md:block">{title}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoomStep(-1)} className="rounded-full p-2 hover:bg-selected" aria-label="Riduci">
            <Minus size={17} />
          </button>
          <span className="w-12 text-center text-xs text-soft">{Math.round(effectiveScale * 100)}%</span>
          <button onClick={() => setZoomStep(1)} className="rounded-full p-2 hover:bg-selected" aria-label="Ingrandisci">
            <Plus size={17} />
          </button>
          <button onClick={() => setZoom("fit")} className={cn("rounded-full p-2 hover:bg-selected", zoom === "fit" && "bg-selected")} aria-label="Adatta alla larghezza" title="Adatta alla larghezza">
            <ScanLine size={17} />
          </button>
          <button onClick={toggleFull} className="rounded-full p-2 hover:bg-selected" aria-label="Schermo intero" title="Schermo intero">
            {full ? <Minimize size={17} /> : <Expand size={17} />}
          </button>
          <a href={downloadHref} className="rounded-full p-2 hover:bg-selected" aria-label="Scarica" title="Scarica">
            <Download size={17} />
          </a>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn("relative overflow-auto p-3", full ? "flex-1" : "h-[72dvh] min-h-[420px]")}
        onTouchStart={(e) => ((e.currentTarget as HTMLDivElement).dataset.x = String(e.touches[0].clientX))}
        onTouchEnd={(e) => {
          if (zoom !== "fit") return;
          const start = Number((e.currentTarget as HTMLDivElement).dataset.x);
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
        }}
      >
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-soft">
            {error}
            <a href={downloadHref} className="chip">
              <Download size={14} /> Scarica PDF
            </a>
          </div>
        ) : (
          <>
            {(!pdf || rendering) && (
              <div className="absolute right-5 top-5 z-10 rounded-full bg-white/90 p-2 shadow">
                <Loader2 size={16} className="animate-spin text-soft" />
              </div>
            )}
            <canvas ref={canvasRef} className="mx-auto block bg-white shadow-[0_2px_16px_rgba(0,0,0,0.08)]" />
          </>
        )}
      </div>
    </div>
  );
}
