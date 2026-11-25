import React, { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Mail, MailCheck } from 'lucide-react';
import App from './App.jsx';
import { supabase, isConfigured, emailLink } from './lib/supabase.js';
import { createRemoteApi } from './lib/api.js';
import { createLocalApi } from './lib/local.js';

// Invitation tokens travel in the URL fragment so they are never sent to a server.
// They are kept in localStorage, so the invite survives the trip through the
// confirmation email (which opens a new tab). After confirming on another
// device the token comes back as ?invite= in the redirect address.
const TOKEN = /^[A-Za-z0-9_-]{20,}$/;
const keep = { get: () => { try { return localStorage.getItem('mt_invite'); } catch { return null; } },
  set: t => { try { localStorage.setItem('mt_invite', t); } catch { /* ignore */ } },
  del: () => { try { localStorage.removeItem('mt_invite'); sessionStorage.removeItem('mt_invite'); } catch { /* ignore */ } } };
function captureInvite() {
  const fromHash = window.location.hash.match(/invite=([A-Za-z0-9_-]{20,})/)?.[1];
  const q = new URLSearchParams(window.location.search);
  const fromQuery = TOKEN.test(q.get('invite') || '') ? q.get('invite') : null;
  if (fromQuery || q.has('invite')) {
    q.delete('invite');
    const rest = q.toString();
    history.replaceState(null, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
  }
  if (fromHash) history.replaceState(null, '', window.location.pathname + window.location.search);
  const token = fromHash || fromQuery;
  if (token) keep.set(token);
  return keep.get();
}

// Where links in emails bring people back, carrying the invite if there is one.
const returnUrl = () => { const t = keep.get(); return window.location.origin + '/' + (t ? '?invite=' + t : ''); };

// Something shared to morethere: from the Android share sheet (?share=1&title&text&url[&media])
// or from an iPhone Shortcut / any link (?add=<link or text>). Kept until signed in.
function captureShare() {
  const q = new URLSearchParams(window.location.search);
  let found = null;
  if (q.get('share') === '1') found = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '', media: q.get('media') === '1' };
  else if (q.get('add')) found = { title: '', text: q.get('add'), url: '', media: false };
  if (found) {
    try { sessionStorage.setItem('mt_share', JSON.stringify(found)); } catch { /* ignore */ }
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  try { return JSON.parse(sessionStorage.getItem('mt_share') || 'null'); } catch { return null; }
}

const AUTH_ERRORS = [
  [/Invalid login credentials/i, 'Email o password non corretti.'],
  [/Email not confirmed/i, 'Conferma prima la tua email: controlla la posta.'],
  [/User already registered/i, 'Esiste già un account con questa email. Accedi con la tua password o tocca "Password dimenticata?".'],
  [/Password should be at least/i, 'La password deve avere almeno 8 caratteri.'],
  [/rate limit|too many/i, 'Troppi tentativi. Riprova tra qualche minuto.'],
  [/valid email|invalid format/i, 'Inserisci un indirizzo email valido.'],
];
const authError = (e) => AUTH_ERRORS.find(([re]) => re.test(e?.message || ''))?.[1] || 'Accesso non riuscito. Riprova.';

const LINK_ERROR = 'Il link non è più valido: è scaduto o è già stato usato. Chiedine uno nuovo qui sotto.';

function AuthScreen({ hasInvite, recovery, linkError, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'recover' : linkError ? 'reset' : hasInvite ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(linkError ? LINK_ERROR : '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const go = (m) => { setMode(m); setError(''); setInfo(''); setUnconfirmed(false); };

  const resend = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: returnUrl() } });
      if (err) throw err;
      setInfo('Email inviata di nuovo. Guarda anche nello spam.');
    } catch (err) { setError(authError(err)); } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) { if (/not confirmed/i.test(err.message)) setUnconfirmed(true); throw err; }
      } else if (mode === 'signup') {
        if (!name.trim()) throw new Error('name');
        if (password.length < 8) throw new Error('Password should be at least 8');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: returnUrl() },
        });
        if (err) throw err;
        // An address that already has an account: Supabase sends nothing and
        // returns a user without identities. Say so instead of waiting for an email.
        if (!data.session && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { setMode('signin'); setPassword(''); throw new Error('User already registered'); }
        if (!data.session) setMode('check');
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
        if (err) throw err;
        setInfo('Se esiste un account con questa email, riceverai un link per scegliere una nuova password. Guarda anche nello spam.');
      } else if (mode === 'recover') {
        if (password.length < 8) throw new Error('Password should be at least 8');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        onRecovered();
      }
    } catch (err) {
      setError(err?.message === 'name' ? 'Scrivi il tuo nome: è così che ti vedranno i tuoi amici.' : authError(err));
    } finally {
      setBusy(false);
    }
  };

  const header = <header className="authHead"><div className="headTitle"><span className="brand authBrand"><img src="/icon.svg" alt="" width="30" height="30" />morethere</span><div className="subtitle">Your world. Your people. Your intelligence.</div></div></header>;

  if (mode === 'check') return (
    <div className="app">
      {header}
      <main>
        <div className="eyebrow">ULTIMO PASSO</div>
        <h1>Controlla la tua email.</h1>
        <p className="muted">Ti abbiamo scritto a <strong>{email.trim()}</strong>. Apri il link nell'email per attivare l'account{hasInvite ? ' e accettare l\'invito' : ''}.</p>
        <div className="panel">
          <MailCheck size={28} />
          <small>Non la trovi? Guarda nello spam o nelle promozioni. Il link funziona anche se lo apri da un altro telefono o computer.</small>
          {error && <p className="formerror" role="alert">{error}</p>}
          {info && <p className="forminfo" role="status"><Check size={15} className="inline" /> {info}</p>}
          <button className="pill outline wide" type="button" disabled={busy} onClick={resend}><Mail size={18} /> Invia di nuovo</button>
        </div>
        <div className="authlinks">
          <button className="textlink" onClick={() => go('signin')}>Ho già confermato: accedi</button>
          <button className="textlink" onClick={() => go('signup')}>Email sbagliata? Torna indietro</button>
        </div>
      </main>
    </div>
  );

  const heading = { signin: 'Bentornato nel tuo mondo.', signup: hasInvite ? 'Ti stanno aspettando.' : 'Il tuo mondo comincia qui.', reset: 'Reimposta la password.', recover: 'Scegli una nuova password.' }[mode];
  const intro = mode === 'reset' ? 'Scrivi l\'email con cui ti sei registrato: ti mandiamo un link per scegliere una nuova password.'
    : mode === 'recover' ? 'Almeno 8 caratteri. Dopo entri subito.'
    : hasInvite ? (mode === 'signup' ? 'Qualcuno ti ha invitato nel suo Circle. Crea il tuo account: ci vuole un minuto.' : 'Qualcuno ti ha invitato nel suo Circle. Accedi per accettare.')
    : 'Un luogo per raccogliere ciò che conta, scoprire attraverso le persone di cui ti fidi e trasformare ciò che sai in azione con l\'AI.';

  return (
    <div className="app">
      {header}
      <main>
        <div className="eyebrow">{mode === 'signup' ? 'CREA IL TUO ACCOUNT' : mode === 'signin' ? 'ACCEDI' : 'PASSWORD'}</div>
        <h1>{heading}</h1>
        <p className="muted">{intro}</p>
        <form className="panel authForm" onSubmit={submit} noValidate>
          {mode === 'signup' && <><label htmlFor="a-name">COME TI CHIAMI?</label><input id="a-name" autoComplete="name" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></>}
          {mode !== 'recover' && <><label htmlFor="a-email">EMAIL</label><input id="a-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} /></>}
          {mode !== 'reset' && <><label htmlFor="a-pass">{mode === 'recover' ? 'NUOVA PASSWORD' : 'PASSWORD'}</label><input id="a-pass" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />{(mode === 'signup' || mode === 'recover') && <small>Almeno 8 caratteri.</small>}</>}
          {error && <p className="formerror" role="alert">{error}</p>}
          {unconfirmed && <button type="button" className="textlink" disabled={busy} onClick={resend}>Invia di nuovo l'email di conferma</button>}
          {info && <p className="forminfo" role="status"><Check size={15} className="inline" /> {info}</p>}
          <button className="pill dark wide" type="submit" disabled={busy}>
            {mode === 'reset' ? <><Mail size={18} /> Invia link</> : <><KeyRound size={18} /> {mode === 'signup' ? 'Crea account' : mode === 'recover' ? 'Salva password' : 'Entra'}</>}
          </button>
        </form>
        <div className="authlinks">
          {mode === 'signin' && <><button className="textlink" onClick={() => go('reset')}>Password dimenticata?</button><div className="authOr"><span>Sei nuovo?</span></div><button className="pill outline wide" onClick={() => go('signup')}>Crea un account</button></>}
          {(mode === 'signup' || mode === 'reset') && <button className="textlink" onClick={() => go('signin')}>Hai già un account? Accedi</button>}
        </div>
        <p className="hint">Il tuo archivio è privato per impostazione predefinita. Nessuno può vederlo finché non scegli tu cosa condividere e con chi.</p>
      </main>
    </div>
  );
}

export default function Root() {
  const [invite, setInvite] = useState(() => captureInvite());
  const [incoming, setIncoming] = useState(() => captureShare());
  const clearIncoming = () => { try { sessionStorage.removeItem('mt_share'); } catch { /* ignore */ } setIncoming(null); };
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(emailLink.recovery);
  const linkError = Boolean(emailLink.error);
  useEffect(() => { if (emailLink.error) history.replaceState(null, '', window.location.pathname + window.location.search); }, []);
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
  const clearInvite = () => { keep.del(); setInvite(null); };

  if (!isConfigured) return <App api={localApi} pendingShare={incoming} onShareHandled={clearIncoming} />;
  if (session === undefined) return <div className="app"><header><div><span className="brand">morethere</span><div className="subtitle">Sincronizzazione…</div></div></header></div>;
  if (!session || recovery) return <AuthScreen hasInvite={Boolean(invite)} recovery={recovery} linkError={linkError} onRecovered={() => setRecovery(false)} />;
  return <App key={userId} api={api} pendingInvite={invite} onInviteHandled={clearInvite} pendingShare={incoming} onShareHandled={clearIncoming} />;
}
