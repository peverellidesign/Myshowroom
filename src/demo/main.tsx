// Demo autonoma di myshowroom: lo stesso codice API del server gira nel browser.
// Dati e PDF restano nell'IndexedDB di questo browser; le email vengono registrate ma non consegnate.
import './flag';
import { createApp } from '../../server/core/app';
import { ensureSeed } from '../../server/core/seed';
import type { BlobStorage, Mailer } from '../../server/core/deps';
import { createMemoryStore, idbDel, idbGet, idbSet } from './memoryStore';
import { mount } from '../main';
import { illustration } from './illustrations';
import './pdfPreview';
import type { Product } from '../../shared/types';

const blobs = new Map<string, Uint8Array>();
const storage: BlobStorage = {
  kind: 'browser',
  async put(key, data) { blobs.set(key, data); await idbSet('blob:' + key, data); },
  async get(key) { return blobs.get(key) ?? (await idbGet<Uint8Array>('blob:' + key)) ?? null; },
  async delete(key) { blobs.delete(key); await idbDel('blob:' + key); },
};
const mailer: Mailer = { mode: 'outbox', async send() { return { status: 'outbox' }; } };

let session = '';
try { session = localStorage.getItem('ms_demo_session') || ''; } catch { /* storage non disponibile */ }

async function boot() {
  const store = await createMemoryStore();
  await ensureSeed(store, {
    admin: { email: 'admin@peverelli.demo', password: 'myshowroom-demo', name: 'Direzione Peverelli' },
    demoData: true,
    extraUsers: [{ email: 'giulia@peverelli.demo', password: 'myshowroom-demo', name: 'Giulia Consulente', role: 'consultant', site: 'Lugano' }],
  });
  // sostituisce le foto esterne (non caricabili nell'artifact) con illustrazioni locali
  for (const p of await store.all<Product>('products')) {
    if (!p.images.some(u => u.includes('unsplash.com'))) continue;
    const images: string[] = [];
    for (let i = 0; i < p.images.length; i++) {
      const id = crypto.randomUUID(), key = `demo/${id}.svg`, data = illustration(p.category, i);
      await storage.put(key, data, 'image/svg+xml');
      await store.insert('files', { id, storageKey: key, fileName: `${p.id}-${i + 1}.svg`, mime: 'image/svg+xml', size: data.byteLength, createdBy: null, createdAt: new Date().toISOString() });
      images.push(`/api/files/${id}`);
    }
    await store.update('products', p.id, { images });
  }
  const app = createApp({ store, storage, mailer, llm: null, config: { publicUrl: location.origin, secureCookies: false, maxUploadMb: 25, companyName: 'Peverelli Design', demo: true, publicBooking: true, linkSecret: crypto.randomUUID() } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== new URL(location.href).origin || !url.pathname.startsWith('/api/')) return realFetch(input, init); // location.origin vale "null" nei frame isolati
    const req = new Request(new URL(url.pathname + url.search, 'https://myshowroom.demo'), init);
    return app.fetch(req, {
      cookies: session ? { ms_session: session } : {},
      onSetCookie: list => { for (const c of list) { const v = c.split(';')[0].split('=')[1] || ''; session = v; try { localStorage.setItem('ms_demo_session', v); } catch { /* ignore */ } } },
    });
  };
  // fotografia della hero sostituita da un'illustrazione locale (le immagini esterne sono bloccate nell'artifact)
  const hero = URL.createObjectURL(new Blob([illustration('Sedute', 0) as Uint8Array<ArrayBuffer>], { type: 'image/svg+xml' }));
  const st = document.createElement('style');
  st.textContent = `.homeHero{background:linear-gradient(90deg,rgba(24,24,22,.6),rgba(24,24,22,.05)),url(${hero}) center/cover}`;
  document.head.appendChild(st);
  mount();
}
boot();
