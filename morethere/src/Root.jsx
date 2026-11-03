import React, { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Mail } from 'lucide-react';
import App from './App.jsx';
import { supabase, isConfigured } from './lib/supabase.js';
import { createRemoteApi } from './lib/api.js';
import { createLocalApi } from './lib/local.js';

// Invitation tokens travel in the URL fragment so they are never sent to a server.
function captureInvite() {
  const m = window.location.hash.match(/invite=([A-Za-z0-9_-]{20,})/);
  if (m) {
    try { sessionStorage.setItem('mt_invite', m[1]); } catch { /* ignore */ }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  try { return sessionStorage.getItem('mt_invite'); } catch { return null; }
}

const AUTH_ERRORS = [
  [/Invalid login credentials/i, 'Email o password non corretti.'],
  [/Email not confirmed/i, 'Conferma prima la tua email: controlla la posta.'],
  [/User already registered/i, 'Esiste già un account con questa email.'],
  [/Password should be at least/i, 'La password deve avere almeno 8 caratteri.'],
  [/rate limit|too many/i, 'Troppi tentativi. Riprova tra qualche minuto.'],
  [/valid email|invalid format/i, 'Inserisci un indirizzo email valido.'],
];
const authError = (e) => AUTH_ERRORS.find(([re]) => re.test(e?.message || ''))?.[1] || 'Accesso non riuscito. Riprova.';

function AuthScreen({ hasInvite, recovery, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'recover' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectTo = window.location.origin + window.location.pathname;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password should be at least 8');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirectTo },
        });
        if (err) throw err;
        if (!data.session) setInfo('Ti abbiamo inviato un\'email per confermare l\'account.');
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (err) throw err;
        setInfo('Se esiste un account con questa email, riceverai un link per reimpostare la password.');
      } else if (mode === 'recover') {
        if (password.length < 8) throw new Error('Password should be at least 8');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        onRecovered();
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  };

  const heading = { signin: 'Bentornato nel tuo mondo.', signup: 'Il tuo mondo comincia qui.', reset: 'Reimposta la password.', recover: 'Scegli una nuova password.' }[mode];

  return (
    <div className="app">
      <header><div><span className="brand">morethere</span><div className="subtitle">Your world. Your people. Your intelligence.</div></div></header>
      <main>
        <div className="eyebrow">{mode === 'signup' ? 'CREA IL TUO ACCOUNT' : mode === 'signin' ? 'ACCEDI' : 'PASSWORD'}</div>
        <h1>{heading}</h1>
        <p className="muted">
          {hasInvite
            ? 'Qualcuno ti ha invitato nel suo Circle. Accedi o crea un account per accettare.'
            : 'Un luogo per raccogliere ciò che conta, scoprire attraverso le persone di cui ti fidi e trasformare ciò che sai in azione con l\'AI.'}
        </p>
        <form className="panel" onSubmit={submit} noValidate>
          {mode === 'signup' && <><label htmlFor="a-name">COME TI CHIAMI?</label><input id="a-name" autoComplete="name" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></>}
          {mode !== 'recover' && <><label htmlFor="a-email">EMAIL</label><input id="a-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} /></>}
          {mode !== 'reset' && <><label htmlFor="a-pass">{mode === 'recover' ? 'NUOVA PASSWORD' : 'PASSWORD'}</label><input id="a-pass" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></>}
          {error && <p className="formerror" role="alert">{error}</p>}
          {info && <p className="forminfo" role="status"><Check size={15} className="inline" /> {info}</p>}
          <button className="pill dark wide" type="submit" disabled={busy}>
            {mode === 'reset' ? <><Mail size={18} /> Invia link</> : <><KeyRound size={18} /> {mode === 'signup' ? 'Crea account' : mode === 'recover' ? 'Salva password' : 'Entra'}</>}
          </button>
        </form>
        <div className="authlinks">
          {mode === 'signin' && <><button className="textlink" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>Non hai un account? Creane uno</button><button className="textlink" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}>Password dimenticata?</button></>}
          {(mode === 'signup' || mode === 'reset') && <button className="textlink" onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>Hai già un account? Accedi</button>}
        </div>
        <p className="hint">Il tuo archivio è privato per impostazione predefinita. Nessuno può vederlo finché non scegli tu cosa condividere e con chi.</p>
      </main>
    </div>
  );
}

export default function Root() {
  const [invite, setInvite] = useState(() => captureInvite());
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  const localApi = useMemo(() => (isConfigured ? null : createLocalApi()), []);

  // An invitation link opened in a tab where the app is already running.
  useEffect(() => {
    const onHash = () => { const t = captureInvite(); if (t) setInvite(t); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!isConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Only swap the API when the signed-in user actually changes.
      setSession(prev => (prev?.user?.id === s?.user?.id && prev ? prev : s));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const api = useMemo(() => (userId ? createRemoteApi({ id: userId }) : null), [userId]);
  const clearInvite = () => { try { sessionStorage.removeItem('mt_invite'); } catch { /* ignore */ } setInvite(null); };

  if (!isConfigured) return <App api={localApi} />;
  if (session === undefined) return <div className="app"><header><div><span className="brand">morethere</span><div className="subtitle">Sincronizzazione…</div></div></header></div>;
  if (!session || recovery) return <AuthScreen hasInvite={Boolean(invite)} recovery={recovery} onRecovered={() => setRecovery(false)} />;
  return <App key={userId} api={api} pendingInvite={invite} onInviteHandled={clearInvite} />;
}
