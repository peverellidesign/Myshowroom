/* myshowroom — lettura dei biglietti da visita sul dispositivo.
 * Motore: Tesseract OCR (tesseract.js-core 7.0.0, Apache-2.0), modelli tessdata_fast italiano + inglese.
 * Le immagini restano nel browser: nessun dato viene inviato a servizi esterni. */
'use strict';
const BASE = self.location.href.replace(/[^/]*$/, '');
let engine = null;

// Rilevamento WebAssembly SIMD (stesso test di wasm-feature-detect)
const hasSimd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };

async function fetchBytes(name) {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`Impossibile scaricare ${name} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

async function init() {
  self.postMessage({ type: 'status', status: 'loading' });
  const data = Promise.all([fetchBytes('ita.traineddata'), fetchBytes('eng.traineddata')]);
  let M;
  try { importScripts(BASE + (hasSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js')); M = await self.TesseractCore(); }
  catch { importScripts(BASE + 'tesseract-core-lstm.wasm.js'); M = await self.TesseractCore(); }
  const [ita, eng] = await data;
  M.FS.writeFile('ita.traineddata', ita);
  M.FS.writeFile('eng.traineddata', eng);
  const api = new M.TessBaseAPI();
  if (api.Init(null, 'ita+eng', 1) !== 0) throw new Error('Inizializzazione del lettore non riuscita');
  api.SetVariable('tessedit_pageseg_mode', '3');
  api.SetVariable('user_defined_dpi', '300');
  self.postMessage({ type: 'status', status: 'ready' });
  return { M, api };
}

self.onmessage = async ({ data }) => {
  const { id, image } = data;
  try {
    engine = engine || init();
    const { M, api } = await engine;
    self.postMessage({ type: 'status', status: 'reading', id });
    M.FS.writeFile('/input', new Uint8Array(image));
    if (api.SetImageFile(1, 0) === 1) throw new Error("Impossibile leggere l'immagine");
    api.Recognize(null);
    const text = api.GetUTF8Text();
    const tsv = api.GetTSVText(0);
    const conf = api.MeanTextConf();
    api.Clear();
    self.postMessage({ type: 'result', id, text, tsv, conf });
  } catch (e) {
    engine = null;
    self.postMessage({ type: 'error', id, error: String(e && e.message || e) });
  }
};
