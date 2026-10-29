// Nuovo contatto da qualsiasi pagina: scansione del biglietto da visita, dati, informativa privacy e firma.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Eraser, FileText, Image as ImageIcon, PenLine, ScanLine, ShieldCheck, UserPlus, X } from 'lucide-react';
import { ApiError, get, openFile, patch, post, upload } from './api';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { scanBusinessCard, warmUpScanner, type ScanStatus } from './ocr';
import { CONSENT_MARKETING, CONSENT_SERVICE } from '../shared/privacy';
import { SHOWROOMS, isEmail, type Client, type EmailRecord, type PrivacySettings, type User } from '../shared/types';
import type { CardFields } from '../shared/cardParse';

type Draft = { name: string; company: string; role: string; email: string; mobile: string; phone: string; website: string; address: string; site: string; notes: string };
const FIELDS: { key: keyof Draft; label: string; type?: string; wide?: boolean }[] = [
  { key: 'name', label: 'Nome e cognome *' }, { key: 'company', label: 'Azienda' }, { key: 'role', label: 'Ruolo' }, { key: 'email', label: 'Email', type: 'email' },
  { key: 'mobile', label: 'Cellulare', type: 'tel' }, { key: 'phone', label: 'Telefono', type: 'tel' }, { key: 'website', label: 'Sito web' }, { key: 'address', label: 'Indirizzo', wide: true },
];
const SCAN_TEXT: Record<ScanStatus, string> = { prepare: 'Preparazione della foto…', loading: 'Avvio del lettore (solo la prima volta, circa 5 MB)…', reading: 'Lettura del biglietto…', retry: 'Lettura difficile: provo a ruotare la foto…' };

export type ContactWizardProps = {
  me: User; clients: Client[]; initial?: Client; startAt?: 'data' | 'privacy';
  onSaved: (c: Client) => void; onClose: () => void; notify: (msg: string, error?: boolean) => void; onOpenClient?: (id: string) => void;
};

export function ContactWizard({ me, clients, initial, startAt = 'data', onSaved, onClose, notify, onOpenClient }: ContactWizardProps) {
  const [step, setStep] = useState<'data' | 'privacy' | 'done'>(initial && startAt === 'privacy' ? 'privacy' : 'data');
  const [client, setClient] = useState<Client | null>(initial ?? null);
  const [d, setD] = useState<Draft>(() => initial
    ? { name: initial.name, company: initial.company, role: initial.role, email: initial.email, mobile: initial.mobile, phone: initial.phone, website: initial.website, address: initial.address, site: initial.site || me.site, notes: initial.notes }
    : { name: '', company: '', role: '', email: '', mobile: '', phone: '', website: '', address: '', site: (SHOWROOMS as readonly string[]).includes(me.site) ? me.site : 'Como', notes: '' });
  const [scanned, setScanned] = useState<Set<keyof Draft>>(new Set());
  const [scan, setScan] = useState<{ status: ScanStatus | 'done' | 'error'; text?: string; preview?: string; error?: string } | null>(null);
  const photo = useRef<Blob | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [read, setRead] = useState(false);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [signed, setSigned] = useState(false);
  const [sendCopy, setSendCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mailResult, setMailResult] = useState<EmailRecord | null>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step === 'privacy' && !privacy) get<PrivacySettings>('/api/settings/privacy').then(setPrivacy).catch(() => setError('Informativa non disponibile: riprova.')); }, [step]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [busy]);
  useEffect(() => () => { if (scan?.preview) URL.revokeObjectURL(scan.preview); }, [scan?.preview]);

  const set = (k: keyof Draft, v: string) => { setD(x => ({ ...x, [k]: v })); setScanned(s => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; }); };
  const duplicate = clients.find(c => c.id !== client?.id && ((d.email && c.email.toLowerCase() === d.email.trim().toLowerCase()) || (d.name.trim().length > 4 && c.name.trim().toLowerCase() === d.name.trim().toLowerCase())));
  const valid = d.name.trim().length > 0 && (!d.email.trim() || isEmail(d.email.trim()));

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setScan({ status: 'prepare', preview }); setError('');
    try {
      const r = await scanBusinessCard(file, s => setScan(x => ({ ...x!, status: s })));
      photo.current = r.photo;
      const found = new Set<keyof Draft>();
      setD(x => { const n = { ...x }; for (const [k, v] of Object.entries(r.fields) as [keyof CardFields, string][]) if (v && !x[k].trim()) { n[k] = v; found.add(k); } return n; });
      setScanned(found);
      setScan({ status: 'done', preview, text: r.text });
      if (!found.size) setError('Non sono riuscito a riconoscere i campi: controlla la foto (luce, messa a fuoco) o inserisci i dati a mano.');
    } catch (e) {
      setScan({ status: 'error', preview, error: (e as Error).message });
      setError('Scansione non riuscita: ' + (e as Error).message);
    }
  }

  async function saveData(): Promise<Client> {
    let cardFileId: string | undefined;
    if (photo.current) { const f = await upload(new File([photo.current], `Biglietto ${d.name.trim() || 'contatto'}.jpg`, { type: 'image/jpeg' })); cardFileId = f.id; photo.current = null; }
    const body = { ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])), ...(cardFileId ? { cardFileId } : {}) };
    const c = client ? await patch<Client>(`/api/clients/${client.id}`, body) : await post<Client>('/api/clients', { ...body, source: cardFileId || scanned.size ? 'biglietto' : 'manuale' });
    setClient(c); onSaved(c); return c;
  }
  const guard = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Operazione non riuscita: controlla la connessione e riprova.'); } finally { setBusy(false); } };

  const next = () => guard(async () => { await saveData(); setStep('privacy'); });
  const saveOnly = () => guard(async () => { await saveData(); notify(client ? 'Contatto aggiornato' : 'Contatto salvato — privacy da firmare'); onClose(); });
  const sign = () => guard(async () => {
    const c = client ?? await saveData();
    const r = await post<{ client: Client; email: EmailRecord | null }>(`/api/clients/${c.id}/consent`, { readAccepted: read, marketing, signature: pad.current!.toDataURL(), sendCopy: sendCopy && !!c.email, site: d.site || undefined });
    setClient(r.client); onSaved(r.client); setMailResult(r.email); setStep('done');
  });

  const placeholders = privacy && /\[[A-Z .]+\]/.test(privacy.text);
  return <div className="modalBackdrop" onClick={() => !busy && onClose()}>
    <div className="modal wide contactWizard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nuovo contatto">
      <div className="modalHeader"><h2>{initial ? (startAt === 'privacy' ? 'Modulo privacy' : 'Modifica contatto') : 'Nuovo contatto'}</h2><button className="iconBtn" onClick={onClose} disabled={busy} aria-label="Chiudi"><X /></button></div>
      <ol className="wizardSteps"><li className={step === 'data' ? 'chosen' : 'done'}>1 · Dati</li><li className={step === 'privacy' ? 'chosen' : step === 'done' ? 'done' : ''}>2 · Privacy e firma</li><li className={step === 'done' ? 'chosen' : ''}>3 · Fatto</li></ol>

      {step === 'data' && <>
        <div className="scanBox">
          {scan?.preview ? <img src={scan.preview} alt="Biglietto da visita" /> : <ScanLine size={28} />}
          <div>
            <strong>{scan ? (scan.status === 'done' ? 'Biglietto letto' : scan.status === 'error' ? 'Scansione non riuscita' : SCAN_TEXT[scan.status]) : 'Scansiona un biglietto da visita'}</strong>
            <small>{scan?.status === 'done' ? (scanned.size ? `${scanned.size} campi compilati: verificali prima di salvare.` : 'Nessun campo riconosciuto.') : 'Inquadra il biglietto su un fondo uniforme, con buona luce. Il testo viene letto sul dispositivo.'}</small>
            {scan && !['done', 'error'].includes(scan.status) && <span className="scanProgress" />}
            <div className="actionRow">
              <button type="button" className="btn" disabled={busy || (!!scan && !['done', 'error'].includes(scan.status))} onClick={() => { warmUpScanner(); camera.current?.click(); }}><Camera size={15} /> {scan ? 'Nuova foto' : 'Fotografa'}</button>
              <button type="button" className="btn secondary" disabled={busy || (!!scan && !['done', 'error'].includes(scan.status))} onClick={() => { warmUpScanner(); gallery.current?.click(); }}><ImageIcon size={15} /> Da foto</button>
            </div>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={gallery} type="file" accept="image/*" hidden onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        {scan?.text && <details className="scanText"><summary>Testo letto dal biglietto</summary><pre>{scan.text}</pre></details>}
        <div className="contactGrid">
          {FIELDS.map(f => <label key={f.key} className={'field' + (f.wide ? ' wide' : '') + (scanned.has(f.key) ? ' scanned' : '')}><span>{f.label}{scanned.has(f.key) && <em>dal biglietto</em>}</span><input type={f.type || 'text'} value={d[f.key]} autoComplete="off" onChange={e => set(f.key, e.target.value)} /></label>)}
          <label className="field"><span>Showroom di riferimento</span><select value={d.site} onChange={e => set('site', e.target.value)}>{SHOWROOMS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="field wide"><span>Note</span><textarea rows={2} value={d.notes} onChange={e => set('notes', e.target.value)} placeholder="Interessi, progetto, come ci ha conosciuto…" /></label>
        </div>
        {duplicate && <p className="hint warn">Esiste già un contatto simile: <strong>{duplicate.name}</strong>{duplicate.company ? ` · ${duplicate.company}` : ''}.{onOpenClient && <> <button type="button" className="linkBtn" onClick={() => { onOpenClient(duplicate.id); onClose(); }}>Apri quello esistente</button></>}</p>}
        {d.email.trim() && !isEmail(d.email.trim()) && <p className="hint warn">L’email non sembra valida.</p>}
        {error && <p className="formError">{error}</p>}
        <div className="actionRow">
          <button type="button" className="btn" disabled={!valid || busy} onClick={next}><PenLine size={15} /> {busy ? 'Attendere…' : initial?.privacySignedAt ? 'Salva e aggiorna privacy' : 'Avanti: privacy e firma'}</button>
          <button type="button" className="btn secondary" disabled={!valid || busy} onClick={saveOnly}>{initial ? 'Salva modifiche' : 'Salva senza firma'}</button>
        </div>
      </>}

      {step === 'privacy' && <>
        <p className="hint">Consegna il dispositivo a <strong>{d.name || client?.name}</strong>: legga l’informativa, scelga sul consenso facoltativo e firmi.</p>
        {placeholders && me.role === 'admin' && <p className="hint warn">L’informativa contiene ancora campi da completare tra [parentesi quadre]: aggiornala in Clienti → Informativa privacy.</p>}
        <div className="privacyText" tabIndex={0}>{privacy ? privacy.text : 'Caricamento informativa…'}</div>
        <label className="checkline strong"><input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} /> {CONSENT_SERVICE}</label>
        <div className="consentChoice"><span>{CONSENT_MARKETING}</span><div className="segmented"><button type="button" className={marketing === true ? 'chosen' : ''} onClick={() => setMarketing(true)}>Acconsento</button><button type="button" className={marketing === false ? 'chosen' : ''} onClick={() => setMarketing(false)}>Non acconsento</button></div></div>
        <SignaturePad ref={pad} onChange={empty => setSigned(!empty)} />
        <div className="signatureTools"><button type="button" className="linkBtn" onClick={() => pad.current?.clear()}><Eraser size={14} /> Cancella firma</button><span className="hint">{d.site} · {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        {(client?.email || d.email) && <label className="checkline"><input type="checkbox" checked={sendCopy} onChange={e => setSendCopy(e.target.checked)} /> Invia una copia firmata a {client?.email || d.email}</label>}
        {error && <p className="formError">{error}</p>}
        <div className="actionRow">
          <button type="button" className="btn" disabled={!read || marketing === null || !signed || !privacy || busy} onClick={sign}><ShieldCheck size={15} /> {busy ? 'Attendere…' : 'Firma e salva'}</button>
          {!(initial && startAt === 'privacy') && <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('data')}><ArrowLeft size={15} /> Dati</button>}
          <button type="button" className="btn secondary" disabled={busy} onClick={() => { notify('Contatto salvato — privacy da firmare'); onClose(); }}>Firma più tardi</button>
        </div>
      </>}

      {step === 'done' && client && <div className="wizardDone">
        <Check size={34} />
        <h3>{client.name}</h3>
        <p>{[client.company, client.role].filter(Boolean).join(' · ') || client.email}</p>
        <p className="hint">Modulo privacy firmato · consenso marketing: <strong>{client.marketingConsent ? 'dato' : 'negato'}</strong>.{mailResult ? ` Copia ${mailResult.status === 'sent' ? `inviata a ${mailResult.to}` : mailResult.status === 'outbox' ? 'registrata ma non inviata (email non configurata)' : 'non inviata: ' + (mailResult.error || '')}.` : ''}</p>
        <div className="actionRow">
          {client.consentFileId && <button type="button" className="btn secondary" onClick={() => openFile(client.consentFileId!, `Privacy ${client.name}.pdf`)}><FileText size={15} /> Apri modulo firmato</button>}
          {!initial && <button type="button" className="btn secondary" onClick={() => { setClient(null); setD(x => ({ name: '', company: '', role: '', email: '', mobile: '', phone: '', website: '', address: '', site: x.site, notes: '' })); setScan(null); setScanned(new Set()); setRead(false); setMarketing(null); setSigned(false); setMailResult(null); setStep('data'); }}><UserPlus size={15} /> Altro contatto</button>}
          <button type="button" className="btn" onClick={onClose}>Fine</button>
        </div>
      </div>}
    </div>
  </div>;
}
