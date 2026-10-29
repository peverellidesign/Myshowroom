// Riquadro firma con dito, penna (Apple Pencil) o mouse. Restituisce un PNG a sfondo trasparente.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type SignaturePadHandle = { clear: () => void; isEmpty: () => boolean; toDataURL: () => string };

export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  const setup = () => {
    const c = canvas.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#171717';
    strokes.current = 0; setEmpty(true); onChange?.(true);
  };
  useEffect(() => { setup(); const ro = new ResizeObserver(() => { if (!strokes.current) setup(); }); if (canvas.current) ro.observe(canvas.current); return () => ro.disconnect(); }, []);

  useEffect(() => {
    const c = canvas.current!; const g = c.getContext('2d')!;
    let last: { x: number; y: number; w: number } | null = null;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: e.pointerType === 'pen' ? 1 + 2.4 * (e.pressure || 0.5) : 2.4 }; };
    const down = (e: PointerEvent) => { e.preventDefault(); c.setPointerCapture(e.pointerId); last = pos(e); g.beginPath(); g.arc(last.x, last.y, last.w / 2, 0, Math.PI * 2); g.fillStyle = '#171717'; g.fill(); };
    const move = (e: PointerEvent) => {
      if (!last) return; e.preventDefault();
      const evs = e.getCoalescedEvents?.() ?? []; for (const ev of (evs.length ? evs : [e])) { const p = pos(ev); g.lineWidth = (last.w + p.w) / 2; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; }
    };
    const up = () => { if (!last) return; last = null; strokes.current++; if (strokes.current === 1) { setEmpty(false); onChange?.(false); } };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: setup,
    isEmpty: () => strokes.current === 0,
    toDataURL: () => {
      // ritaglia lo spazio vuoto attorno alla firma
      const c = canvas.current!; const g = c.getContext('2d')!; const { width: w, height: h } = c; const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 <= x0) return c.toDataURL('image/png');
      const pad = 12, out = document.createElement('canvas');
      out.width = Math.min(w, x1 - x0 + 2 * pad); out.height = Math.min(h, y1 - y0 + 2 * pad);
      out.getContext('2d')!.drawImage(c, Math.max(0, x0 - pad), Math.max(0, y0 - pad), out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }));

  return <div className={'signaturePad' + (empty ? ' empty' : '')}><canvas ref={canvas} aria-label="Riquadro firma" /><span className="signatureLine" /><span className="signatureHint">Firmi qui con il dito o la penna</span></div>;
});
