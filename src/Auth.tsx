import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { User } from '../shared/types';
import { ApiError, isDemo, post } from './api';

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(isDemo() ? 'admin@peverelli.demo' : '');
  const [password, setPassword] = useState(isDemo() ? 'myshowroom-demo' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { onLogin((await post<{ user: User }>('/api/auth/login', { email, password })).user); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Connessione non riuscita.'); }
    finally { setBusy(false); }
  };
  return <div className="authShell">
    <div className="authHero homeHero"><div className="heroOverlay"><span className="eyebrow">YOUR SHOWROOM. EVERYWHERE.</span><h1>Tutto a portata<br />di mano.</h1><p>Prodotti, disponibilità e persone. In un unico spazio.</p></div></div>
    <form className="authPanel" onSubmit={submit}>
      <div className="brand"><strong>myshowroom</strong><small>by Peverelli Design</small></div>
      <span className="eyebrow">ACCESSO RISERVATO</span>
      <h1>Bentornato.</h1>
      <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !email || !password}>{busy ? 'Accesso…' : <>Accedi <ArrowRight size={16} /></>}</button>
      {isDemo() && <p className="hint">Demo: credenziali precompilate. Consulente: giulia@peverelli.demo · myshowroom-demo</p>}
      <p className="hint authFoot">© PEVERELLI DESIGN · COMO · MILANO BRERA · LUGANO · DUBAI</p>
    </form>
  </div>;
}
