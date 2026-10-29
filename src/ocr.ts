// Scansione biglietti da visita: prepara la foto nel browser, la legge con Tesseract in un Web Worker
// e riconosce i campi. Nessun dato lascia il dispositivo.
import { parseBusinessCard, tsvToLines, type CardFields } from '../shared/cardParse';

const OCR_BASE = '/ocr/7.0.0/';
type Reply = { type: 'status'; status: 'loading' | 'ready' | 'reading'; id?: number } | { type: 'result'; id: number; text: string; tsv: string; conf: number } | { type: 'error'; id: number; error: string };
export type ScanStatus = 'prepare' | 'loading' | 'reading' | 'retry';
export type ScanResult = { fields: CardFields; text: string; confidence: number; photo: Blob };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (r: { text: string; tsv: string; conf: number }) => void; reject: (e: Error) => void }>();
let statusListener: ((s: ScanStatus) => void) | null = null;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(OCR_BASE + 'ocr-worker.js');
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    if (data.type === 'status') { if (data.status === 'loading') statusListener?.('loading'); if (data.status === 'reading') statusListener?.('reading'); return; }
    const w = waiting.get(data.id); if (!w) return; waiting.delete(data.id);
    if (data.type === 'error') w.reject(new Error(data.error)); else w.resolve(data);
  };
  worker.onerror = e => { for (const w of waiting.values()) w.reject(new Error(e.message || 'Lettore non disponibile')); waiting.clear(); worker?.terminate(); worker = null; };
  return worker;
}

/** Avvia in anticipo il download del lettore (es. quando l'utente apre la fotocamera). */
export function warmUpScanner() { try { getWorker(); } catch { /* il lettore verrà avviato alla scansione */ } }

function recognize(image: ArrayBuffer) {
  const id = ++seq;
  return new Promise<{ text: string; tsv: string; conf: number }>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, image }, [image]);
  });
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { /* fallback */ } }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function draw(src: ImageBitmap | HTMLImageElement, max: number, rotate = 0, enhance = false) {
  const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas');
  [c.width, c.height] = rotate % 180 ? [h, w] : [w, h];
  const g = c.getContext('2d')!;
  if (enhance) g.filter = 'grayscale(1) contrast(1.35)';
  g.translate(c.width / 2, c.height / 2); g.rotate(rotate * Math.PI / 180); g.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Conversione immagine non riuscita')), type, q));

export async function scanBusinessCard(file: File, onStatus: (s: ScanStatus) => void): Promise<ScanResult> {
  statusListener = onStatus;
  try {
    onStatus('prepare');
    const bmp = await loadBitmap(file);
    const photo = await toBlob(draw(bmp, 1600), 'image/jpeg', 0.85);
    let best: { text: string; tsv: string; conf: number } | null = null;
    // foto dritta; se la lettura è scarsa riprova ruotando (biglietto fotografato in verticale o capovolto)
    // 1) foto così com'è; 2) in scala di grigi e più contrasto; 3) ruotata (biglietto in verticale o capovolto)
    for (const [angle, enhance] of [[0, false], [0, true], [90, true], [270, true], [180, true]] as const) {
      if (best) onStatus('retry');
      const r = await recognize(await (await toBlob(draw(bmp, 2000, angle, enhance), 'image/png')).arrayBuffer());
      if (!best || r.conf > best.conf) best = r;
      if (best.conf >= 62 && best.text.replace(/\W/g, '').length > 12) break;
    }
    if ('close' in bmp) bmp.close();
    const lines = tsvToLines(best!.tsv);
    return { fields: parseBusinessCard(lines.length ? lines : best!.text), text: best!.text.trim(), confidence: best!.conf, photo };
  } finally { statusListener = null; }
}
