import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Login } from './Auth';
import { Booking } from './Booking';
import { get, setUnauthorizedHandler } from './api';
import type { Bootstrap } from '../shared/types';
import './style.css';

function bookingSlug() {
  const m = (window.location.pathname + window.location.hash).match(/\/book\/([a-z]+)/i);
  return m ? m[1] : null;
}

export function Root() {
  const [state, setState] = useState<'loading' | 'login' | 'ready' | 'offline'>('loading');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [slug, setSlug] = useState(bookingSlug());
  useEffect(() => { const h = () => setSlug(bookingSlug()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const load = useCallback(async () => {
    try { setData(await get<Bootstrap>('/api/bootstrap')); setState('ready'); }
    catch (e) { setState((e as { status?: number }).status === 401 ? 'login' : 'offline'); }
  }, []);
  useEffect(() => { if (!slug) { setUnauthorizedHandler(() => setState('login')); load(); } }, [load, slug]);
  if (slug) return <Booking siteSlug={slug} />;
  if (state === 'loading') return <div className="splash"><div className="brand"><strong>myshowroom</strong><small>by Peverelli Design</small></div></div>;
  if (state === 'offline') return <div className="splash"><div className="brand"><strong>myshowroom</strong><small>by Peverelli Design</small></div><p className="hint">Server non raggiungibile.</p><button className="btn secondary" onClick={() => { setState('loading'); load(); }}>Riprova</button></div>;
  if (state === 'login' || !data) return <Login onLogin={() => { setState('loading'); load(); }} />;
  return <App key={data.user.id} initial={data} onLogout={() => { setData(null); setState('login'); }} />;
}

export function mount() {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
}

if (!(window as { __MS_DEMO__?: boolean }).__MS_DEMO__) mount();
