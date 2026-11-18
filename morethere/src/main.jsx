import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Phones keep the app open in the background for days, so a new version would
// never arrive. When morethere comes back to the screen (or every 30 minutes),
// compare our build with the one on the server and reload when it changed,
// unless something is being typed.
if (import.meta.env.PROD) {
  const mine = [...document.scripts].map(s => s.src).find(s => /\/assets\/index-[^/]+\.js$/.test(s)) || '';
  let lastCheck = Date.now();
  const typing = () => { const el = document.activeElement; return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value; };
  const check = async () => {
    if (!mine || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const latest = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
      if (latest && !mine.endsWith(latest) && !typing()) {
        navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
        window.location.reload();
      }
    } catch { /* offline: try next time */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30 * 60_000);
}
