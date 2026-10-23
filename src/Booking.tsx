import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle } from 'lucide-react';
import { APPT_TYPES, SHOWROOMS, isEmail } from '../shared/types';
import { ApiError, get, post } from './api';

/** Pagina pubblica di prenotazione: /book/como, /book/lugano, /book/milano, /book/dubai */
export function Booking({ siteSlug }: { siteSlug: string }) {
  const initial = SHOWROOMS.find(s => s.toLowerCase() === siteSlug.toLowerCase()) || 'Como';
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ client: '', email: '', site: initial as string, type: 'Visita showroom', date: tomorrow, time: '', duration: '60', notes: '', website: '' });
  const [times, setTimes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ date: string; time: string; site: string } | null>(null);
  useEffect(() => {
    setTimes(null);
    get<{ times: string[] }>(`/api/public/slots?site=${f.site}&date=${f.date}`).then(r => { setTimes(r.times); setF(x => ({ ...x, time: r.times.includes(x.time) ? x.time : '' })); }).catch(e => setError(e.message));
  }, [f.site, f.date]);
  const submit = async () => {
    setError(''); setBusy(true);
    try { const r = await post<{ appointment: { date: string; time: string; site: string } }>('/api/public/book', f); setDone(r.appointment); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Prenotazione non riuscita.'); }
    finally { setBusy(false); }
  };
  return <div className="bookShell">
    <header className="bookHeader"><div className="brand"><strong>myshowroom</strong><small>by Peverelli Design</small></div><span className="topTag">BOOK A SHOWROOM VISIT</span></header>
    <main className="content">
      <div className="pageHeading"><span className="eyebrow">PEVERELLI DESIGN / {f.site.toUpperCase()}</span><h1>Time well spent.</h1><p>Prenota una visita nel nostro showroom: un consulente sarà dedicato a te.</p></div>
      {done ? <section className="panel narrow"><div className="empty"><CheckCircle /><p><strong>Visita confermata</strong></p><p>{done.site} · {done.date.split('-').reverse().join('/')} · ore {done.time}</p><p className="hint">Riceverai un’email di conferma con l’invito per il tuo calendario.</p></div></section> :
        <section className="panel narrow">
          <label className="field"><span>Nome e cognome</span><input value={f.client} onChange={e => setF({ ...f, client: e.target.value })} autoComplete="name" /></label>
          <label className="field"><span>Email</span><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
          <label className="field"><span>Showroom</span><select value={f.site} onChange={e => setF({ ...f, site: e.target.value })}>{SHOWROOMS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="field"><span>Motivo della visita</span><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{APPT_TYPES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="field"><span>Data</span><input type="date" min={tomorrow} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
          <div className="filterLabel">ORARI DISPONIBILI</div>
          <div className="chips">{times === null ? <span className="hint">Caricamento…</span> : times.length === 0 ? <span className="hint">Nessun orario libero in questa data.</span> : times.map(t => <button key={t} className={f.time === t ? 'chosen' : ''} onClick={() => setF({ ...f, time: t })}>{t}</button>)}</div>
          <label className="field"><span>Note (facoltative)</span><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
          <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} aria-hidden="true" />
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={busy || !f.client.trim() || !isEmail(f.email) || !f.time} onClick={submit}><CalendarDays size={16} /> {busy ? 'Invio…' : 'Prenota la visita'}</button>
          <p className="hint">I dati sono usati esclusivamente per gestire l’appuntamento.</p>
        </section>}
    </main>
    <footer className="footer"><span>© PEVERELLI DESIGN</span><span>COMO · MILANO BRERA · LUGANO · DUBAI</span></footer>
  </div>;
}
