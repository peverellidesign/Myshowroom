// Client API del frontend. In produzione parla con il server Node; nella demo il server gira nel browser.
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

declare global { interface Window { __MS_DEMO__?: boolean } }
export const isDemo = () => !!window.__MS_DEMO__;

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'X-Requested-With': 'myshowroom', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiError(r.status, data?.error || `Errore ${r.status}`);
  }
  return data as T;
}
export const get = <T>(p: string) => api<T>('GET', p);
export const post = <T>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const del = <T>(p: string) => api<T>('DELETE', p);

export async function upload(file: File): Promise<{ id: string; fileName: string; size: number; mime: string }> {
  const r = await fetch('/api/files', {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'X-Requested-With': 'myshowroom', 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || (r.status === 413 ? 'File troppo grande' : `Errore ${r.status}`));
  return data;
}

export const fileHref = (id: string, download = false) => `/api/files/${id}${download ? '?download=1' : ''}`;

/** Nella demo i file vivono nel browser: si convertono in URL blob. */
const blobCache = new Map<string, string>();
export async function blobUrl(src: string): Promise<string> {
  if (blobCache.has(src)) return blobCache.get(src)!;
  const r = await fetch(src, { credentials: 'same-origin' });
  if (!r.ok) throw new ApiError(r.status, 'File non disponibile');
  const u = URL.createObjectURL(await r.blob());
  blobCache.set(src, u);
  return u;
}

/** Apre/scarica un file: link diretto in produzione (compatibile con Safari iOS), blob nella demo. */
export async function openFile(id: string, fileName: string, download = false) {
  if (!isDemo()) {
    const a = document.createElement('a');
    a.href = fileHref(id, download); a.target = '_blank'; a.rel = 'noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  // Demo: il frame dell'artifact blocca popup e download, quindi il PDF si mostra in anteprima nella pagina
  const u = await blobUrl(fileHref(id));
  window.dispatchEvent(new CustomEvent('ms:preview', { detail: { name: fileName, url: u } }));
}

export const formatSize = (n: number | null | undefined) => !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
