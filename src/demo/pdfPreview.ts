// Anteprima PDF nella demo: il frame dell'artifact non mostra PDF incorporati, quindi le pagine si disegnano su canvas.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

let ready = false;
function setup() {
  if (ready) return;
  const url = URL.createObjectURL(new Blob([workerSource as unknown as string], { type: 'text/javascript' }));
  pdfjs.GlobalWorkerOptions.workerSrc = url;

  ready = true;
}

export async function renderPdf(src: string, container: HTMLElement) {
  setup();
  container.innerHTML = '';
  const data = new Uint8Array(await (await fetch(src)).arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const width = Math.max(280, container.clientWidth - 2);
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = '100%';
    container.appendChild(canvas);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
  }
}
(window as { __MS_PDF_RENDER__?: typeof renderPdf }).__MS_PDF_RENDER__ = renderPdf;
