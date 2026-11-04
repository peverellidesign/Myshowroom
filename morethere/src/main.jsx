import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
