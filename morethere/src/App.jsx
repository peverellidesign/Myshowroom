import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UsersRound, Camera, Search, ArrowLeft, Plus, Heart, KeyRound, Sparkles, Trash2, ExternalLink, Copy,
  FolderHeart, Send, Settings2, Check, Bookmark, PenLine, X, Link2, UserRoundPlus, ChevronRight,
  ShieldCheck, Download, LogOut, Inbox, UserRoundCheck, ImagePlus, Pencil,
} from 'lucide-react';
import { buildAIContext, fromExportRows } from './lib/ai.js';
import { friendlyError, photoTakenDate } from './lib/api.js';
import { readLegacy, clearLegacy } from './lib/local.js';

const safeUrl = (s) => { try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const readNotes = () => { try { return JSON.parse(localStorage.getItem('mt_notes')) ?? []; } catch { return []; } };
const writeNotes = (v) => { try { localStorage.setItem('mt_notes', JSON.stringify(v)); } catch { /* ignore */ } };
const nameOf = (p) => p?.display_name || 'Qualcuno';
const fmtDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
// memory_date is a calendar date (YYYY-MM-DD): format it without timezone shifts.
const fmtMemory = (iso, short = false) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', short ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
};
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function Photo({ url, alt = '', className = '' }) {
  if (!url) return null;
  return <img className={className} src={url} alt={alt} loading="lazy" decoding="async" />;
}

export default function App({ api, pendingInvite, onInviteHandled }) {
  const social = api.social;

  // ---- personal archive ----------------------------------------------------
  const [items, setItems] = useState([]);
  const [collectionRows, setCollectionRows] = useState([]);
  const collections = useMemo(() => collectionRows.map(c => c.name), [collectionRows]);
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // ---- social --------------------------------------------------------------
  const [circle, setCircle] = useState({ connections: [], sharesOut: [], sharesIn: [], invitations: [] });
  const [thoughts, setThoughts] = useState({ sent: [], received: [] });
  const [worlds, setWorlds] = useState([]);
  const [notes, setNotes] = useState(readNotes); // thoughts shared outside morethere (device only)
  const [syncTick, setSyncTick] = useState(0);

  // ---- ui ------------------------------------------------------------------
  const [screen, setScreen] = useState('home');
  const [entry, setEntry] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Tutti');
  const [selected, setSelected] = useState(null);
  const [friend, setFriend] = useState(null);
  const [friendData, setFriendData] = useState(null);
  const [worldData, setWorldData] = useState(null);
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [thoughtAi, setThoughtAi] = useState(false);
  const [worldName, setWorldName] = useState('');
  const [worldMember, setWorldMember] = useState('');
  const [worldInvitee, setWorldInvitee] = useState('');
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [newCollection, setNewCollection] = useState('');
  const [notice, setNotice] = useState('');
  const [shareMode, setShareMode] = useState('item');
  const [permission, setPermission] = useState('view');
  const [shareTarget, setShareTarget] = useState('');
  const [shareCollections, setShareCollections] = useState([]);
  const [shareAi, setShareAi] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [profileDraft, setProfileDraft] = useState(null);
  const [legacy, setLegacy] = useState(() => (social ? readLegacy() : null));
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({});
  const [view, setView] = useState(() => { try { return localStorage.getItem('mt_view') === 'date' ? 'date' : 'recent'; } catch { return 'recent'; } });
  const chooseView = v => { setView(v); try { localStorage.setItem('mt_view', v); } catch { /* ignore */ } };
  const [edit, setEdit] = useState(null); // detail edit draft
  const [collectionDialog, setCollectionDialog] = useState(null); // { mode: 'rename', id, name }
  const fileInput = useRef();
  const photoTarget = useRef(null); // item id when replacing a photo, else null

  const toastTimer = useRef();
  const toast = t => { setNotice(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setNotice(''), 3200); };
  const run = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); return r === undefined ? true : r; } catch (e) { console.error(e); toast(friendlyError(e)); return undefined; } finally { setBusy(false); }
  };

  // ---- loading & synchronisation ----------------------------------------------
  const refreshArchive = useCallback(async () => {
    const a = await api.loadArchive();
    setCollectionRows(a.collections);
    setItems(a.items);
  }, [api]);
  const refreshCircle = useCallback(async () => { if (social) setCircle(await api.loadCircle()); }, [api, social]);
  const refreshThoughts = useCallback(async () => { if (social) setThoughts(await api.loadThoughts()); }, [api, social]);
  const refreshWorlds = useCallback(async () => { if (social) setWorlds(await api.loadWorlds()); }, [api, social]);
  const refreshProfile = useCallback(async () => { if (social) setProfile(await api.loadProfile()); }, [api, social]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Promise.all([refreshArchive(), refreshCircle(), refreshThoughts(), refreshWorlds(), refreshProfile()]);
      } catch (e) { console.error(e); toast(friendlyError(e)); }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [refreshArchive, refreshCircle, refreshThoughts, refreshWorlds, refreshProfile]);

  useEffect(() => {
    const pending = new Set();
    let timer;
    const areas = {
      items: ['archive'], collections: ['archive'], connections: ['circle'], world_shares: ['circle'],
      world_share_collections: ['circle'], thoughts: ['thoughts'], worlds: ['worlds'], world_members: ['worlds', 'circle'],
      world_items: ['worlds'], profiles: ['circle', 'profile', 'thoughts'],
    };
    const flush = async () => {
      const todo = [...pending]; pending.clear();
      try {
        await Promise.all(todo.map(a => ({
          archive: refreshArchive, circle: refreshCircle, thoughts: refreshThoughts, worlds: refreshWorlds, profile: refreshProfile,
        })[a]()));
      } catch (e) { console.error(e); }
      setSyncTick(t => t + 1);
    };
    const unsubscribe = api.subscribe(table => {
      (areas[table] || []).forEach(a => pending.add(a));
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    });
    // Catch up after the tab was in the background or the device went offline.
    const onVisible = () => { if (document.visibilityState === 'visible') { ['archive', 'circle', 'thoughts', 'worlds'].forEach(a => pending.add(a)); flush(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { unsubscribe(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [api, refreshArchive, refreshCircle, refreshThoughts, refreshWorlds, refreshProfile]);

  useEffect(() => writeNotes(notes), [notes]);

  // Signed, short-lived URLs for every photo currently on screen.
  const visiblePhotos = useMemo(() => [
    ...items.map(i => i.image_path),
    ...(friendData?.items || []).map(i => i.image_path),
    ...thoughts.received.map(t => t.item_image_path),
    ...thoughts.sent.map(t => t.item_image_path),
    ...(worldData?.items || []).map(i => i.image_path),
  ].filter(Boolean), [items, friendData, thoughts, worldData]);
  useEffect(() => {
    if (!visiblePhotos.length || !api.photoUrls) return;
    let alive = true;
    api.photoUrls(visiblePhotos).then(m => alive && setPhotoUrls(prev => ({ ...prev, ...m }))).catch(() => {});
    return () => { alive = false; };
  }, [api, visiblePhotos]);

  // Complete links saved before cover images existed (a few per visit, once each).
  const enriching = useRef(false);
  useEffect(() => {
    if (!social || !loaded || enriching.current) return;
    let tried = [];
    try { tried = JSON.parse(localStorage.getItem('mt_enriched') || '[]'); } catch { /* ignore */ }
    const todo = items.filter(i => i.url && !i.image_path && !tried.includes(i.id)).slice(0, 5);
    if (!todo.length) return;
    enriching.current = true;
    (async () => {
      let changed = false;
      for (const it of todo) {
        changed = (await enrichLink(it)) || changed;
        tried.push(it.id);
        try { localStorage.setItem('mt_enriched', JSON.stringify(tried.slice(-500))); } catch { /* ignore */ }
      }
      enriching.current = false;
      if (changed) refreshArchive();
    })();
  }, [social, loaded, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invitation link opened before/while signing in.
  useEffect(() => {
    if (!social || !pendingInvite) return;
    api.previewInvitation(pendingInvite)
      .then(p => setInvite(p ? { token: pendingInvite, ...p } : { token: pendingInvite, invalid: true }))
      .catch(() => setInvite({ token: pendingInvite, invalid: true }));
  }, [api, social, pendingInvite]);

  const accepted = circle.connections.filter(c => c.status === 'accepted');
  const incoming = circle.connections.filter(c => c.status === 'pending' && c.incoming);
  const outgoing = circle.connections.filter(c => c.status === 'pending' && !c.incoming);
  const unread = thoughts.received.filter(t => !t.read_at).length;
  const worldInvites = worlds.filter(w => w.myStatus === 'invited');
  const attention = incoming.length + unread + worldInvites.length;
  const collectionId = name => collectionRows.find(c => c.name === name)?.id || null;

  // ---- archive actions (same behaviour as the prototype) -------------------------
  const add = async () => {
    const raw = entry.trim(); if (!raw) return;
    const url = safeUrl(raw);
    const draft = { title: url ? new URL(url).hostname.replace(/^www\./, '') : raw.slice(0, 70), url: url || '', note: url ? '' : raw, category: url ? 'Pagine' : 'Appunti', collection: 'Idee', collection_id: collectionId('Idee') };
    const saved = await run(() => api.addItem(draft), 'Salvato nel tuo mondo');
    if (!saved) return;
    setEntry(''); await refreshArchive();
    // Enrich links with the real page title and cover image, in the background.
    if (url) { await enrichLink({ ...draft, id: saved.id, image_path: null }); await refreshArchive(); }
  };
  // Title, description and cover image from the page. Never overwrites what
  // the person wrote: the title only while it is still the bare hostname,
  // the note only while empty, the photo only while there is none.
  const enrichLink = async (item) => {
    const url = safeUrl(item.url || '');
    if (!url) return false;
    try {
      const p = await api.linkPreview(url);
      if (!p) return false;
      const patch = {};
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (p.title && (!item.title || item.title === host)) patch.title = p.title.slice(0, 300);
      if (p.description && !item.note) patch.note = p.description.slice(0, 600);
      if (p.image && !item.image_path && api.photosEnabled !== false) {
        const blob = await api.previewImage(p.image);
        if (blob) patch.image_path = await api.uploadPhoto(blob);
      }
      if (!Object.keys(patch).length) return false;
      await api.updateItem(item.id, patch);
      setSelected(sel => (sel?.id === item.id ? { ...sel, ...patch } : sel));
      return true;
    } catch { return false; } // previews are best effort
  };
  const pickPhoto = (itemId = null) => { photoTarget.current = itemId; fileInput.current?.click(); };
  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const targetId = photoTarget.current; photoTarget.current = null;
    await run(async () => {
      const path = await api.uploadPhoto(file);
      if (targetId) {
        const old = items.find(i => i.id === targetId)?.image_path;
        await api.updateItem(targetId, { image_path: path });
        if (old && api.releasePhoto) await api.releasePhoto(old);
        setSelected(sel => (sel?.id === targetId ? { ...sel, image_path: path } : sel));
        await refreshArchive();
      } else {
        // Saved right away (nothing is lost), then opened so it can be described.
        const taken = (await photoTakenDate(file)) || todayIso();
        const title = entry.trim().slice(0, 70) || `Foto del ${fmtMemory(taken)}`;
        const saved = await api.addItem({ title, url: '', note: '', category: 'Foto', collection: 'Idee', collection_id: collectionId('Idee'), image_path: path, memory_date: taken });
        setEntry('');
        await refreshArchive();
        const item = { id: saved.id, title, url: '', note: '', category: 'Foto', collection: 'Idee', collection_id: collectionId('Idee'), image_path: path, memory_date: taken, created: Date.now() };
        setSelected(item);
        setEdit({ title, url: '', note: '', memory_date: taken, fresh: true });
        setScreen('detail');
      }
    }, targetId ? 'Foto aggiornata' : 'Foto salvata. Raccontala con un titolo e una nota.');
  };
  const removeItem = async (item) => {
    const prev = items; setItems(v => v.filter(x => x.id !== item.id));
    try { await api.deleteItem(item); } catch (e) { setItems(prev); toast(friendlyError(e)); }
  };
  const saveEdit = async () => {
    const title = edit.title.trim();
    if (!title) return toast('Dai un titolo a questa scoperta');
    const url = edit.url.trim() ? safeUrl(edit.url.trim()) : '';
    if (edit.url.trim() && !url) return toast('Il link deve iniziare con http:// o https://');
    const patch = { title: title.slice(0, 300), note: edit.note.slice(0, 10000), url: url || '', memory_date: edit.memory_date || null };
    const ok = await run(() => api.updateItem(selected.id, patch), 'Modifiche salvate');
    if (ok !== undefined) { setSelected({ ...selected, ...patch }); setEdit(null); refreshArchive(); }
  };
  const activeCollection = collectionRows.find(c => c.name === filter);
  const renameCollection = async () => {
    const name = collectionDialog.name.trim();
    if (!name) return;
    const ok = await run(() => api.renameCollection(collectionDialog.id, name), 'Raccolta rinominata');
    if (ok !== undefined) { setCollectionDialog(null); setFilter(name); refreshArchive(); }
  };
  const deleteCollection = async () => {
    if (!activeCollection) return;
    const n = items.filter(i => i.collection_id === activeCollection.id).length;
    if (!window.confirm(`Eliminare la raccolta "${activeCollection.name}"?${n ? ` Le ${n} scoperte che contiene restano nel tuo archivio, senza raccolta.` : ''}`)) return;
    const ok = await run(() => api.deleteCollection(activeCollection.id), 'Raccolta eliminata');
    if (ok !== undefined) { setFilter('Tutti'); refreshArchive(); }
  };
  const filtered = useMemo(() => items.filter(i => (filter === 'Tutti' || i.category === filter || i.collection === filter) && [i.title, i.note, i.url].join(' ').toLowerCase().includes(search.toLowerCase())), [items, filter, search]);
  // "Per data": by the date of the memory (or when it was saved), grouped by month.
  const whenOf = i => i.memory_date || new Date(i.created).toISOString().slice(0, 10);
  const sorted = useMemo(() => (view === 'date' ? [...filtered].sort((a, b) => whenOf(b).localeCompare(whenOf(a)) || b.created - a.created) : filtered), [filtered, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const byMonth = useMemo(() => {
    if (view !== 'date') return [];
    const groups = [];
    for (const i of sorted) {
      const key = whenOf(i).slice(0, 7);
      if (groups[groups.length - 1]?.key !== key) {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] });
      }
      groups[groups.length - 1].items.push(i);
    }
    return groups;
  }, [sorted, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = ['Tutti', ...new Set([...items.map(i => i.category), ...collections])];
  const back = () => { setScreen('home'); setSelected(null); setFriend(null); setFriendData(null); setWorldData(null); };

  // ---- AI Context Builder ----------------------------------------------------------
  const deliverAI = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Contesto copiato. Incollalo nel tuo assistente AI.'); } catch { setSelected({ type: 'export', text }); setScreen('export'); }
  };
  const exportAI = async (data = items) => deliverAI(buildAIContext(data));
  const exportShared = async (rows, heading, source) => {
    if (!rows?.length) return toast('Nessun contenuto disponibile per l\'AI.');
    return deliverAI(buildAIContext(fromExportRows(rows), { heading, source }));
  };

  // ---- thought of you ---------------------------------------------------------
  const share = (item) => { setSelected(item); setMessage(''); setRecipient(''); setRecipientId(accepted[0]?.other.id || ''); setThoughtAi(false); setScreen('thought'); };
  const sendThought = async () => {
    if (!selected) return;
    if (social && recipientId && recipientId !== '__external') {
      const ok = await run(() => api.sendThought({ recipientId, itemId: selected.id, message: message.trim(), allowAi: thoughtAi }), 'Pensiero inviato');
      if (ok) { await refreshThoughts(); setScreen('circle'); }
      return;
    }
    if (!recipient.trim()) return toast('Inserisci il destinatario');
    const n = { id: crypto.randomUUID(), recipient: recipient.trim(), message: message.trim(), item: { title: selected.title, url: selected.url, note: selected.note }, created: Date.now() };
    setNotes(v => [n, ...v]);
    const payload = `${message || 'Ho pensato a te.'}\n\n${selected.title}\n${selected.url || selected.note}\n\nShared via morethere`;
    if (navigator.share) navigator.share({ title: 'Thought of you · morethere', text: payload }).catch(() => {});
    else navigator.clipboard?.writeText(payload).then(() => toast('Messaggio copiato per la condivisione'));
    setScreen('circle');
  };

  // ---- their worlds -------------------------------------------------------------
  const openFriend = async (person) => {
    setFriend(person); setFriendData(null); setScreen('friend');
  };
  useEffect(() => {
    if (screen !== 'friend' || !friend || !social) return;
    let alive = true;
    api.loadFriendWorld(friend.id).then(d => alive && setFriendData(d)).catch(e => toast(friendlyError(e)));
    return () => { alive = false; };
  }, [screen, friend, api, social, syncTick]);

  // ---- our little worlds -----------------------------------------------------
  const createWorld = async () => {
    if (!worldName.trim()) return toast('Dai un nome al vostro mondo');
    if (!social) return toast('Accedi per creare un mondo condiviso');
    const w = await run(() => api.createWorld(worldName.trim()));
    if (!w) return;
    if (worldMember) await run(() => api.inviteToWorld(w.id, worldMember));
    setWorldName(''); setWorldMember(''); await refreshWorlds(); setScreen('worlds'); toast('Il vostro mondo è pronto');
  };
  const openWorld = (w) => { setSelected(w); setWorldData(null); setScreen('world'); };
  const reloadWorld = useCallback(async (id) => setWorldData(await api.loadWorld(id)), [api]);
  useEffect(() => {
    if (screen !== 'world' || !selected?.id || !social) return;
    reloadWorld(selected.id).catch(e => { toast(friendlyError(e)); back(); });
  }, [screen, selected?.id, social, syncTick, reloadWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- enter my world ------------------------------------------------------------
  const pickShareTarget = (id) => {
    setShareTarget(id);
    const s = circle.sharesOut.find(x => x.grantee_id === id);
    setShareMode(s?.scope === 'all' ? 'all' : 'item');
    setPermission(s?.can_save ? 'save' : 'view');
    setShareAi(Boolean(s?.allow_ai_export));
    setShareCollections(s?.collection_ids || []);
  };
  const saveShare = async () => {
    if (!shareTarget) return toast('Scegli con chi condividere');
    if (shareMode === 'item' && !shareCollections.length) return toast('Scegli almeno una raccolta');
    const ok = await run(() => api.setShare({ granteeId: shareTarget, scope: shareMode === 'all' ? 'all' : 'collections', canSave: permission === 'save', allowAi: shareAi, collectionIds: shareCollections }), 'Il tuo mondo è aperto per questa persona');
    if (ok !== undefined) await refreshCircle();
  };
  const revokeShare = async (granteeId) => {
    await run(() => api.revokeShare(granteeId), 'Accesso revocato');
    if (shareTarget === granteeId) pickShareTarget(granteeId);
    await refreshCircle();
  };
  const copyInvite = async () => {
    if (!social) {
      const t = `Ti apro una parte del mio mondo su morethere.\n\n${items.map(i => '- ' + i.title + (i.url ? ' ' + i.url : '')).join('\n')}\n\nQuesto è un riepilogo condiviso, non un accesso permanente.`;
      await navigator.clipboard?.writeText(t); return toast('Riepilogo copiato');
    }
    const inv = await run(() => api.createInvitation());
    if (!inv) return;
    const link = `${window.location.origin}${window.location.pathname}#invite=${inv.token}`;
    const text = `${nameOf(profile)} ti invita su morethere.\n${link}\n\nIl link è personale, vale una sola volta e scade tra 7 giorni.`;
    try {
      if (navigator.share) await navigator.share({ title: 'morethere', text });
      else { await navigator.clipboard.writeText(text); toast('Link d\'invito copiato'); }
    } catch { /* share sheet dismissed */ }
    setSelected({ type: 'invite', link });
    await refreshCircle();
  };

  // ---- circle actions --------------------------------------------------------------
  const requestConnection = async () => {
    const h = handleInput.trim(); if (!h) return toast('Scrivi un nome utente');
    const r = await run(() => api.requestConnection(h));
    if (r) { setHandleInput(''); toast(r === 'accepted' ? 'Ora siete connessi' : 'Richiesta inviata'); await refreshCircle(); }
  };
  const respond = async (id, yes) => { await run(() => api.respondConnection(id, yes), yes ? 'Ora siete connessi' : 'Richiesta rifiutata'); await refreshCircle(); };
  const acceptInvite = async () => {
    const r = await run(() => api.acceptInvitation(invite.token), 'Ora siete connessi');
    setInvite(null); onInviteHandled?.();
    if (r) { await refreshCircle(); setScreen('circle'); }
  };

  // ---- local data import (explicit consent) -----------------------------------------
  const importLegacy = async () => {
    const n = await run(() => api.importLegacy(legacy));
    if (n !== undefined) { clearLegacy(); setLegacy(null); await Promise.all([refreshArchive(), refreshWorlds()]); toast(`${n} ${n === 1 ? 'scoperta importata' : 'scoperte importate'} nel tuo account`); }
  };

  // ---- account ----------------------------------------------------------------------
  const openProfile = () => { setProfileDraft({ display_name: profile?.display_name || '', handle: profile?.handle || '', subtitle: profile?.subtitle || '' }); setScreen('profile'); };
  const saveProfile = async () => {
    const p = await run(() => api.updateProfile(profileDraft), 'Profilo aggiornato');
    if (p) setProfile(p);
  };
  const downloadData = async () => {
    const data = await run(() => api.exportMyData());
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `morethere-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const deleteAccount = async () => {
    const answer = window.prompt('Questa azione elimina definitivamente il tuo archivio, i tuoi mondi e le tue connessioni. Scrivi ELIMINA per confermare.');
    if (answer !== 'ELIMINA') return;
    await run(() => api.deleteAccount());
  };

  const renderCard = i => (<article className="item" key={i.id}><button className={'preview' + (photoUrls[i.image_path] ? ' hasphoto' : '')} aria-label={`Apri ${i.title}`} onClick={() => { setSelected(i); setEdit(null); setScreen('detail'); }}>{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : <span>{i.image_path ? <Camera size={26} /> : i.url ? <Link2 size={26} /> : <PenLine size={26} />}</span>}</button><div className="itembody"><div className="eyebrow">{i.category}{i.memory_date ? <> · {fmtMemory(i.memory_date, true)}</> : null}</div><button className="itemtitle" onClick={() => { setSelected(i); setEdit(null); setScreen('detail'); }}>{i.title}</button><div className="itemactions"><button onClick={() => share(i)} aria-label="Condividi"><Heart size={17} /></button><button onClick={() => exportAI([i])} aria-label="Usa con AI"><Sparkles size={17} /></button><button onClick={() => { if (window.confirm(`Eliminare "${i.title}"?`)) removeItem(i); }} aria-label="Elimina"><Trash2 size={17} /></button></div></div></article>);
  const title = { home: 'morethere', circle: 'Your Circle', friend: nameOf(friend) + "'s world", worlds: 'Our little worlds', world: 'Our little world', thought: 'Thought of you', detail: 'La tua scoperta', settings: 'Il mio mondo', export: 'Use with AI', profile: 'Il mio profilo' }[screen] || 'morethere';
  const signInHint = <p className="hint">Questa versione funziona solo su questo dispositivo. Configura il backend Supabase e accedi per connetterti alle persone di cui ti fidi.</p>;

  const friendShare = friendData?.share;
  const friendGroups = useMemo(() => {
    if (!friendData) return [];
    const groups = friendData.collections.map(c => ({ id: c.id, name: c.name, items: friendData.items.filter(i => i.collection_id === c.id) }));
    const loose = friendData.items.filter(i => !i.collection_id);
    if (loose.length) groups.push({ id: 'loose', name: 'Senza raccolta', items: loose });
    return groups.filter(g => g.items.length);
  }, [friendData]);

  const myMembership = worldData?.members.find(m => m.user_id === api.me);
  const isWorldOwner = worldData?.world.owner_id === api.me;
  const worldSourceIds = new Set((worldData?.items || []).map(i => i.source_item_id));
  const memberIds = new Set((worldData?.members || []).map(m => m.user_id));

  return <div className="app"><header><div><button className="brand" onClick={back}>{screen === 'home' ? 'morethere' : <><ArrowLeft size={19} />{title}</>}</button>{screen === 'home' && <div className="subtitle">{loaded ? <>{items.length} {items.length === 1 ? 'scoperta' : 'scoperte'}</> : 'Sincronizzazione…'}</div>}</div>{screen === 'home' ? <button className="round" aria-label={attention ? `Apri Your Circle, ${attention} novità` : 'Apri Your Circle'} onClick={() => setScreen('circle')}><UsersRound size={22} />{attention > 0 && <span className="badge">{attention}</span>}</button> : <button className="pill dark" onClick={back}>CHIUDI</button>}</header>

    {screen === 'home' && <main>
      {legacy && <div className="panel"><strong>Hai {legacy.items.length} {legacy.items.length === 1 ? 'scoperta salvata' : 'scoperte salvate'} su questo dispositivo</strong><small>Vuoi portarle nel tuo account privato? Resteranno visibili solo a te. Dopo l'importazione verranno rimosse da questo dispositivo.</small><div className="choices"><button className="chosen" disabled={busy} onClick={importLegacy}>Importa</button><button onClick={() => setLegacy(null)}>Non ora</button></div></div>}
      <div className="eyebrow">NUOVO INGRESSO</div><div className="entry"><input value={entry} onChange={e => setEntry(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Incolla un link o scrivi..." /><button className="square" title={entry ? 'Salva una nota o un link' : 'Aggiungi una foto'} aria-label={entry ? 'Salva' : 'Aggiungi una foto'} disabled={busy} onClick={() => (entry ? add() : pickPhoto())}>{entry ? <Plus /> : <Camera />}</button><input ref={fileInput} type="file" accept="image/*" hidden aria-hidden="true" onChange={onPhotoChosen} /></div><div className="search"><Search size={21} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nell'archivio..." /></div><div className="chips">{cats.map(c => <button key={c} className={'chip ' + (filter === c ? 'active' : '')} onClick={() => setFilter(c)}>{c}</button>)}<button className="chip" aria-label="Nuova raccolta" onClick={() => setShowAddCollection(true)}><Plus size={15} /></button></div>{activeCollection && <div className="collectionTools"><button className="textlink" onClick={() => setCollectionDialog({ id: activeCollection.id, name: activeCollection.name })}><Pencil size={13} /> Rinomina</button><button className="textlink danger" onClick={deleteCollection}><Trash2 size={13} /> Elimina raccolta</button></div>}<div className="sectionRow"><div className="sectionLabel">{activeCollection ? activeCollection.name : 'La tua raccolta'}</div><div className="viewToggle" role="group" aria-label="Ordina"><button className={view === 'recent' ? 'on' : ''} aria-pressed={view === 'recent'} onClick={() => chooseView('recent')}>Recenti</button><button className={view === 'date' ? 'on' : ''} aria-pressed={view === 'date'} onClick={() => chooseView('date')}>Per data</button></div></div>{view === 'date' ? byMonth.map(g => <section key={g.key} className="monthGroup"><h3 className="monthLabel">{g.label}</h3><div className="cards">{g.items.map(renderCard)}</div></section>) : <div className="cards">{sorted.map(renderCard)}</div>}{loaded && !filtered.length && <div className="empty">Il tuo mondo comincia da una scoperta. Salva qualcosa che vale la pena ricordare.</div>}<button className="socialCta" onClick={() => setScreen('circle')}><div><strong>Le persone di cui ti fidi</strong><small>{social ? (accepted.length ? `${accepted.length} ${accepted.length === 1 ? 'persona' : 'persone'} nel tuo Circle` : 'Scopri le loro raccolte condivise') : 'Scopri le loro raccolte condivise'}</small></div><ChevronRight /></button><div className="homeactions"><button onClick={() => setScreen('settings')}><UserRoundPlus size={18} /> Invita un amico</button><button onClick={() => setScreen('circle')}><FolderHeart size={18} /> Condivise con te</button></div></main>}

    {screen === 'circle' && <main><div className="eyebrow brandEyebrow">morethere.</div><h1>There's more to us.</h1><p className="muted">Scopri qualcosa in più delle persone che contano per te.</p>
      <div className="stack"><button className="feature" onClick={() => setScreen('settings')}><KeyRound /><span><em className="featureEyebrow">01 — ACCESSO ALLA COLLEZIONE</em><strong>More of me.</strong><small>Le cose che amo raccontano qualcosa in più di me.</small></span><ChevronRight /></button><button className="feature" onClick={() => { setSelected(null); setRecipientId(accepted[0]?.other.id || ''); setThoughtAi(false); setScreen('thought'); }}><Heart /><span><em className="featureEyebrow">02 — SCOPERTA PERSONALE</em><strong>More for you.</strong><small>Ho trovato qualcosa che vorrei condividere proprio con te.</small></span><ChevronRight /></button><button className="feature" onClick={() => setScreen('worlds')}><UsersRound /><span><em className="featureEyebrow">03 — RACCOLTA CONDIVISA</em><strong>More of us.</strong><small>Le nostre scoperte, i nostri gusti, le cose che ci uniscono.</small>{worldInvites.length > 0 && <small className="pendingNote">{worldInvites.length} {worldInvites.length === 1 ? 'invito' : 'inviti'} da accettare</small>}</span><ChevronRight /></button>{social && <button className="feature" onClick={openProfile}><Settings2 /><span><strong>Il mio profilo</strong><small>{profile ? '@' + profile.handle : 'Nome, esportazione, account'}</small></span><ChevronRight /></button>}</div>
      {!social && signInHint}
      {social && incoming.length > 0 && <><h2>Vogliono entrare nel tuo Circle</h2><div className="people">{incoming.map(c => <div key={c.id} className="person"><div className="avatar">{nameOf(c.other)[0]}</div><span><strong>{nameOf(c.other)}</strong><small>@{c.other.handle}</small></span><button className="pill dark small" disabled={busy} onClick={() => respond(c.id, true)}>Accetta</button><button className="iconbtn" aria-label="Rifiuta" disabled={busy} onClick={() => respond(c.id, false)}><X size={18} /></button></div>)}</div></>}
      {social && thoughts.received.length > 0 && <><h2>Thoughts for you</h2>{thoughts.received.map(t => <div className={'note' + (t.read_at ? '' : ' unread')} key={t.id}><strong>Da {nameOf(t.sender)}</strong><p>{t.message || 'Ho pensato a te.'}</p>{photoUrls[t.item_image_path] && <Photo className="notephoto" url={photoUrls[t.item_image_path]} alt={t.item_title} />}<small>{t.item_title}</small><div className="noteactions">{safeUrl(t.item_url || '') && <a className="textlink" href={t.item_url} target="_blank" rel="noopener noreferrer" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Apri <ExternalLink size={12} /></a>}<button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveThought(t), 'Salvato nel tuo mondo'); if (r) { refreshArchive(); refreshThoughts(); } }}>+ Salva nel mio mondo</button>{!t.read_at && <button className="textlink" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Segna come letto</button>}{t.allow_ai_export && <button className="textlink" onClick={() => exportShared([{ title: t.item_title, url: t.item_url, note: t.message ? `${t.item_note}\nDedication: ${t.message}` : t.item_note, category: t.item_category, collection: 'Thought of you', added_by_name: nameOf(t.sender) }], 'MORETHERE — SHARED CONTEXT', nameOf(t.sender))}>Use with AI</button>}</div></div>)}</>}
      <h2>Their worlds</h2>
      {social ? <>{accepted.length ? <div className="people">{accepted.map(c => { const s = circle.sharesIn.find(x => x.owner_id === c.other.id); return <button key={c.id} className="person" onClick={() => openFriend(c.other)}><div className="avatar">{nameOf(c.other)[0]}</div><span><strong>{nameOf(c.other)}</strong><small>{s ? (c.other.subtitle || 'Ha aperto il suo mondo con te') : 'Non ha ancora aperto il suo mondo con te'}</small></span><ChevronRight size={18} /></button>; })}</div> : <div className="empty compact">Il tuo Circle è ancora vuoto. Invita qualcuno di cui ti fidi.</div>}
        {outgoing.length > 0 && <div className="people pendinglist">{outgoing.map(c => <div key={c.id} className="person muted-row"><div className="avatar">{nameOf(c.other)[0]}</div><span><strong>{nameOf(c.other)}</strong><small>Richiesta in attesa</small></span><button className="iconbtn" aria-label="Annulla richiesta" onClick={async () => { await run(() => api.removeConnection(c.other.id), 'Richiesta annullata'); refreshCircle(); }}><X size={18} /></button></div>)}</div>}
        <div className="panel"><label htmlFor="handle">AGGIUNGI UNA PERSONA</label><input id="handle" placeholder="@nomeutente" autoCapitalize="none" autoCorrect="off" value={handleInput} onChange={e => setHandleInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && requestConnection()} /><button className="pill dark wide" disabled={busy} onClick={requestConnection}><UserRoundPlus size={18} /> Invia richiesta</button><button className="pill outline wide" disabled={busy} onClick={copyInvite}><Link2 size={18} /> Crea un link d'invito</button></div>
        <p className="hint">Vedi solo ciò che ognuno ha scelto di condividere con te.{profile && <> Il tuo nome utente è <strong>@{profile.handle}</strong>.</>}</p></> : <div className="empty compact">Accedi per vedere i mondi delle persone di cui ti fidi.</div>}
      <h2>Thoughts you've sent</h2>{thoughts.sent.length || notes.length ? <>{thoughts.sent.map(n => <div className="note" key={n.id}><strong>Per {nameOf(n.recipient)}</strong><p>{n.message || 'Ho pensato a te.'}</p><small>{n.item_title} · {n.read_at ? 'Visto' : 'Inviato'} {fmtDate(n.created_at)}</small><div className="noteactions"><button className="textlink" onClick={async () => { await run(() => api.deleteThought(n.id), 'Pensiero ritirato'); refreshThoughts(); }}>Ritira</button></div></div>)}{notes.map(n => <div className="note" key={n.id}><strong>Per {n.recipient}</strong><p>{n.message || 'Ho pensato a te.'}</p><small>{n.item?.title} · condiviso fuori da morethere</small></div>)}</> : <div className="empty compact">Non hai ancora lasciato pensieri.</div>}</main>}

    {screen === 'friend' && friend && <main><div className="eyebrow">THEIR WORLD</div><h1>{nameOf(friend)}'s world</h1><p className="muted">A little part of what {nameOf(friend)} loves, collects and dreams about.</p>
      {!friendData ? <div className="empty compact">Caricamento…</div> : !friendShare ? <div className="empty">{nameOf(friend)} non ha ancora aperto il suo mondo con te.</div> : <>
        <div className="cards">{friendGroups.map(c => { const cover = photoUrls[c.items.find(i => i.image_path && photoUrls[i.image_path])?.image_path]; return <article className="item" key={c.id}><div className={'preview' + (cover ? ' hasphoto' : '')}>{cover ? <Photo url={cover} /> : <span><FolderHeart size={26} /></span>}</div><div className="itembody"><div className="eyebrow">COLLECTION</div><strong>{c.name}</strong><small>{c.items.length} {c.items.length === 1 ? 'elemento' : 'elementi'}</small>{c.items.map(i => <div key={i.id} className="shared">{photoUrls[i.image_path] && <Photo className="thumb" url={photoUrls[i.image_path]} alt={i.title} />}{friendShare.can_save ? <button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveSharedItem(i, collectionId('Idee')), 'Salvato nel tuo mondo'); if (r) refreshArchive(); }}>+ Save {i.title}</button> : (safeUrl(i.url) ? <a className="textlink" href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : <span className="textlink">{i.title}</span>)}</div>)}</div></article>; })}</div>
        {!friendGroups.length && <div className="empty compact">Nessun elemento condiviso per ora.</div>}
        {friendShare.allow_ai_export && <button className="pill dark wide" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportShared(friend.id)), 'MORETHERE — SHARED CONTEXT', nameOf(friend))}><Sparkles size={18} /> Use with AI</button>}
        <p className="hint"><ShieldCheck size={13} className="inline" /> {friendShare.can_save ? 'Lettura e copia' : 'Solo lettura'} · {friendShare.allow_ai_export ? 'Uso con AI consentito' : 'Uso con AI non consentito'}. {nameOf(friend)} può modificare o revocare questo accesso in qualsiasi momento.</p></>}
      <button className="textlink danger" onClick={async () => { if (!window.confirm(`Rimuovere ${nameOf(friend)} dal tuo Circle? Gli accessi tra voi verranno revocati.`)) return; await run(() => api.removeConnection(friend.id), 'Connessione rimossa'); await refreshCircle(); setScreen('circle'); }}>Rimuovi dal mio Circle</button></main>}

    {screen === 'worlds' && <main><div className="eyebrow">OUR LITTLE WORLDS</div><h1>Things we want to remember together.</h1><div className="panel"><label htmlFor="wname">COME LO CHIAMIAMO?</label><input id="wname" placeholder="Our next trip, Places to try..." value={worldName} onChange={e => setWorldName(e.target.value)} /><label htmlFor="wwho">CON CHI?</label>{social && accepted.length ? <select id="wwho" value={worldMember} onChange={e => setWorldMember(e.target.value)}><option value="">Solo tu, per ora</option>{accepted.map(c => <option key={c.other.id} value={c.other.id}>{nameOf(c.other)}</option>)}</select> : <input id="wwho" disabled placeholder={social ? 'Prima aggiungi qualcuno al tuo Circle' : 'Accedi per invitare qualcuno'} />}<button className="pill dark wide" disabled={busy} onClick={createWorld}><Plus size={18} /> Crea un mondo</button></div>
      {!social && signInHint}
      {worldInvites.length > 0 && <><h2>Inviti</h2><div className="people">{worldInvites.map(w => <div key={w.id} className="person"><div className="avatar"><FolderHeart size={20} /></div><span><strong>{w.name}</strong><small>Da {nameOf(w.owner)}</small></span><button className="pill dark small" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, true), 'Benvenuto nel vostro mondo'); refreshWorlds(); }}>Entra</button><button className="iconbtn" aria-label="Rifiuta" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, false)); refreshWorlds(); }}><X size={18} /></button></div>)}</div></>}
      <h2>I vostri mondi</h2>{worlds.filter(w => w.myStatus === 'active').map(w => { const others = w.others.filter(m => m.status === 'active'); return <button key={w.id} className="feature" onClick={() => openWorld(w)}><FolderHeart /><span><strong>{w.name}</strong><small>{others.length ? 'Con ' + others.map(m => nameOf(m.profile)).join(', ') : 'Solo tu'} · {w.count} {w.count === 1 ? 'elemento' : 'elementi'}</small></span><ChevronRight /></button>; })}{!worlds.some(w => w.myStatus === 'active') && <div className="empty compact">Create uno spazio per le cose che volete fare, vedere e ricordare.</div>}</main>}

    {screen === 'world' && selected && <main><div className="eyebrow">OUR LITTLE WORLD</div><h1>{worldData?.world.name || selected.name}</h1>
      {!worldData ? <div className="empty compact">Caricamento…</div> : <>
        <p className="muted">{worldData.members.filter(m => m.status === 'active' && m.user_id !== api.me).length ? 'Con ' + worldData.members.filter(m => m.status === 'active' && m.user_id !== api.me).map(m => nameOf(m.profile)).join(', ') : 'Il tuo mondo'} · {worldData.items.length} {worldData.items.length === 1 ? 'elemento' : 'elementi'}</p>
        <h2>Nel vostro mondo</h2>{worldData.items.length ? <div className="stack">{worldData.items.map(i => <div key={i.id} className="feature">{photoUrls[i.image_path] ? <Photo className="rowthumb" url={photoUrls[i.image_path]} alt="" /> : <Bookmark />}<span><strong>{safeUrl(i.url) ? <a href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title}</strong><small>{i.note ? i.note.slice(0, 90) + ' · ' : ''}{i.added_by === api.me ? 'Aggiunto da te' : 'Aggiunto da ' + nameOf(i.adder)}</small></span>{(i.added_by === api.me || isWorldOwner) && <button className="iconbtn" aria-label="Rimuovi dal mondo" onClick={async () => { await run(() => api.removeWorldItem(i.id)); reloadWorld(selected.id); refreshWorlds(); }}><X size={18} /></button>}</div>)}</div> : <div className="empty compact">Ancora vuoto. Aggiungete la prima scoperta.</div>}
        <h2>Aggiungi dal tuo archivio</h2><div className="stack">{items.map(i => { const added = worldSourceIds.has(i.id); return <button key={i.id} className="feature" disabled={busy} onClick={async () => { if (added) return; const r = await run(() => api.addItemToWorld(selected.id, i.id), 'Aggiunto al vostro mondo'); if (r !== undefined) { reloadWorld(selected.id); refreshWorlds(); } }}><Bookmark /><span><strong>{i.title}</strong><small>{added ? 'Già aggiunto' : 'Aggiungi'}</small></span>{added ? <Check /> : <Plus />}</button>; })}</div>
        <h2>Persone</h2><div className="people">{worldData.members.map(m => <div key={m.user_id} className="person"><div className="avatar">{nameOf(m.profile)[0]}</div><span><strong>{m.user_id === api.me ? 'Tu' : nameOf(m.profile)}</strong><small>{m.role === 'owner' ? 'Ha creato questo mondo' : m.status === 'invited' ? 'Invito in attesa' : 'Partecipa'}{m.status === 'active' ? (m.allow_ai_export ? ' · AI consentita' : ' · AI non consentita') : ''}</small></span>{isWorldOwner && m.role !== 'owner' && <button className="iconbtn" aria-label="Rimuovi persona" onClick={async () => { if (!window.confirm('Rimuovere questa persona dal mondo?')) return; await run(() => api.removeWorldMember(selected.id, m.user_id)); reloadWorld(selected.id); }}><X size={18} /></button>}</div>)}</div>
        {accepted.some(c => !memberIds.has(c.other.id)) && <div className="panel"><label htmlFor="winv">INVITA QUALCUNO</label><select id="winv" value={worldInvitee} onChange={e => setWorldInvitee(e.target.value)}><option value="">Scegli dal tuo Circle...</option>{accepted.filter(c => !memberIds.has(c.other.id)).map(c => <option key={c.other.id} value={c.other.id}>{nameOf(c.other)}</option>)}</select><button className="pill dark wide" disabled={busy || !worldInvitee} onClick={async () => { await run(() => api.inviteToWorld(selected.id, worldInvitee), 'Invito inviato'); setWorldInvitee(''); reloadWorld(selected.id); }}><Send size={18} /> Invita</button></div>}
        {myMembership && <div className="panel"><Toggle checked={myMembership.allow_ai_export} onChange={async v => { await run(() => api.setWorldAiConsent(selected.id, v)); reloadWorld(selected.id); }} label="I miei contributi con AI" hint="Consenti agli altri di includere ciò che aggiungi quando usano questo mondo con un assistente AI." /></div>}
        <button className="pill dark wide" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportWorld(selected.id)), 'MORETHERE — SHARED WORLD CONTEXT', worldData.world.name)}><Sparkles size={18} /> Use with AI</button>
        <p className="hint">L'esportazione include i tuoi contributi e quelli di chi lo ha consentito.</p>
        {isWorldOwner ? <button className="textlink danger" onClick={async () => { if (!window.confirm('Eliminare questo mondo per tutti?')) return; await run(() => api.deleteWorld(selected.id), 'Mondo eliminato'); await refreshWorlds(); setScreen('worlds'); }}>Elimina questo mondo</button> : <button className="textlink danger" onClick={async () => { if (!window.confirm('Lasciare questo mondo?')) return; await run(() => api.removeWorldMember(selected.id, api.me), 'Hai lasciato il mondo'); await refreshWorlds(); setScreen('worlds'); }}>Lascia questo mondo</button>}</>}</main>}

    {screen === 'detail' && selected && <main><div className="eyebrow">{selected.category}{selected.memory_date && !edit ? <> · {fmtMemory(selected.memory_date)}</> : null}</div>
      {photoUrls[selected.image_path] && <Photo className="hero" url={photoUrls[selected.image_path]} alt={selected.title} />}
      {edit ? <div className="panel"><label htmlFor="e-title">TITOLO</label><input id="e-title" maxLength={300} autoFocus={!!edit.fresh} onFocus={e => edit.fresh && e.target.select()} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /><label htmlFor="e-url">LINK</label><input id="e-url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} /><label htmlFor="e-note">NOTA</label><textarea id="e-note" rows="5" maxLength={10000} placeholder={edit.fresh ? 'Dove eravate, con chi, cosa ricordi…' : ''} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /><label htmlFor="e-date">DATA DEL RICORDO</label><div className="dateRow"><input id="e-date" type="date" min="1800-01-01" max="2200-12-31" value={edit.memory_date || ''} onChange={e => setEdit({ ...edit, memory_date: e.target.value })} />{edit.memory_date ? <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: '' })}>Togli</button> : <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: todayIso() })}>Oggi</button>}</div><button className="pill dark wide" disabled={busy} onClick={saveEdit}><Check size={18} /> Salva</button><button className="pill outline wide" onClick={() => setEdit(null)}>Annulla</button></div>
        : <><h1>{selected.title}</h1>{safeUrl(selected.url || '') && <a className="outlink" href={selected.url} target="_blank" rel="noopener noreferrer">Apri la fonte <ExternalLink size={17} /></a>}{selected.note && <p className="notebody">{selected.note}</p>}
          <div className="detailtools"><button className="textlink" onClick={() => setEdit({ title: selected.title, url: selected.url || '', note: selected.note || '', memory_date: selected.memory_date || '' })}><Pencil size={14} /> Modifica</button><button className="textlink" disabled={busy} onClick={() => pickPhoto(selected.id)}><ImagePlus size={14} /> {selected.image_path ? 'Cambia foto' : 'Aggiungi foto'}</button>{social && safeUrl(selected.url || '') && !selected.image_path && <button className="textlink" disabled={busy} onClick={async () => { setBusy(true); const ok = await enrichLink(selected); setBusy(false); toast(ok ? 'Anteprima aggiornata' : 'Questa pagina non offre un\'anteprima'); if (ok) refreshArchive(); }}><Link2 size={14} /> Aggiorna anteprima</button>}<button className="textlink danger" onClick={async () => { if (!window.confirm(`Eliminare "${selected.title}"?`)) return; await removeItem(selected); back(); }}><Trash2 size={14} /> Elimina</button></div></>}
      <div className="panel"><label htmlFor="col">RACCOLTA</label><select id="col" value={selected.collection || ''} onChange={async e => { const v = e.target.value; const id = collectionId(v); setItems(arr => arr.map(i => i.id === selected.id ? { ...i, collection: v, collection_id: id } : i)); setSelected({ ...selected, collection: v, collection_id: id }); try { await api.updateItem(selected.id, { collection_id: id, collection: v }); } catch (err) { toast(friendlyError(err)); refreshArchive(); } }}>{!selected.collection && <option value="">—</option>}{collections.map(c => <option key={c}>{c}</option>)}</select></div><div className="stack"><button className="feature" onClick={() => share(selected)}><Heart /><span><strong>Thought of you</strong><small>Condividi con una dedica</small></span><ChevronRight /></button><button className="feature" onClick={() => exportAI([selected])}><Sparkles /><span><strong>Use with AI</strong><small>Copia il contesto</small></span><ChevronRight /></button></div></main>}

    {screen === 'thought' && <main><div className="eyebrow">A LITTLE SOMETHING FOR SOMEONE</div><h1>Who are you thinking of?</h1><p className="muted">Lascia un piccolo pensiero a qualcuno.</p>{!selected && <div className="panel"><label htmlFor="pick">SCEGLI UNA SCOPERTA</label><select id="pick" value="" onChange={e => setSelected(items.find(i => i.id === e.target.value) || null)}><option value="">Seleziona un elemento...</option>{items.map(i => <option value={i.id} key={i.id}>{i.title}</option>)}</select></div>}{selected && <div className="panel"><strong>{selected.title}</strong><small>{selected.url || selected.note}</small></div>}
      <div className="panel"><label htmlFor="to">PER CHI?</label>{social && accepted.length > 0 && <select id="to" value={recipientId} onChange={e => setRecipientId(e.target.value)}>{accepted.map(c => <option key={c.other.id} value={c.other.id}>{nameOf(c.other)}</option>)}<option value="__external">Qualcun altro, fuori da morethere</option></select>}{(!social || !accepted.length || recipientId === '__external') && <input id={social && accepted.length ? 'to-ext' : 'to'} placeholder="Nome o contatto" value={recipient} onChange={e => setRecipient(e.target.value)} />}<label htmlFor="msg">LA TUA DEDICA</label><textarea id="msg" rows="4" maxLength={1000} placeholder="Ho visto questo e ho pensato subito a te..." value={message} onChange={e => setMessage(e.target.value)} />{social && accepted.length > 0 && recipientId !== '__external' && <Toggle checked={thoughtAi} onChange={setThoughtAi} label="Può usarlo con AI" hint="Consenti di includere questo pensiero nel suo contesto AI." />}<button className="pill dark wide" disabled={!selected || busy} onClick={sendThought}><Send size={18} /> Send a thought</button></div>
      <p className="hint">{social && accepted.length > 0 && recipientId !== '__external' ? 'Arriverà nel suo Your Circle. Riceve una copia di questa scoperta, non l\'accesso al tuo archivio.' : 'Il messaggio viene preparato tramite il menu di condivisione del dispositivo o gli appunti.'}</p></main>}

    {screen === 'settings' && <main><div className="eyebrow">ENTER MY WORLD</div><h1>Some things are worth sharing with just a few people.</h1><p className="muted">Scegli cosa mostrare e a chi. Il tuo archivio resta privato per impostazione predefinita.</p>
      {social ? <>{accepted.length ? <div className="panel"><label htmlFor="who">CON CHI?</label><select id="who" value={shareTarget} onChange={e => pickShareTarget(e.target.value)}><option value="">Scegli dal tuo Circle...</option>{accepted.map(c => <option key={c.other.id} value={c.other.id}>{nameOf(c.other)}</option>)}</select>
        {shareTarget && <><label>ACCESSO</label><div className="choices"><button className={shareMode === 'item' ? 'chosen' : ''} onClick={() => setShareMode('item')}>Selected collections</button><button className={shareMode === 'all' ? 'chosen' : ''} onClick={() => setShareMode('all')}>My entire world</button></div>
          {shareMode === 'item' && <><label>RACCOLTE</label><div className="chips wrap">{collectionRows.map(c => <button key={c.id} className={'chip ' + (shareCollections.includes(c.id) ? 'active' : '')} aria-pressed={shareCollections.includes(c.id)} onClick={() => setShareCollections(v => v.includes(c.id) ? v.filter(x => x !== c.id) : [...v, c.id])}>{c.name}</button>)}</div></>}
          <label htmlFor="perm">PERMESSO</label><select id="perm" value={permission} onChange={e => setPermission(e.target.value)}><option value="view">Solo lettura</option><option value="save">Lettura e copia</option></select>
          <Toggle checked={shareAi} onChange={setShareAi} label="Uso con AI" hint="Consenti a questa persona di includere ciò che condividi nel suo contesto AI." />
          <button className="pill dark wide" disabled={busy} onClick={saveShare}><KeyRound size={18} /> {circle.sharesOut.some(s => s.grantee_id === shareTarget) ? 'Aggiorna accesso' : 'Apri il mio mondo'}</button></>}</div> : <div className="empty compact">Aggiungi prima qualcuno al tuo Circle.</div>}
        {circle.sharesOut.length > 0 && <><h2>Chi può entrare</h2><div className="people">{circle.sharesOut.map(s => { const c = accepted.find(x => x.other.id === s.grantee_id); return <div key={s.id} className="person"><div className="avatar">{nameOf(c?.other)[0]}</div><span><strong>{nameOf(c?.other)}</strong><small>{s.scope === 'all' ? 'Tutto il tuo mondo' : `${s.collection_ids.length} ${s.collection_ids.length === 1 ? 'raccolta' : 'raccolte'}`} · {s.can_save ? 'Lettura e copia' : 'Solo lettura'}{s.allow_ai_export ? ' · AI' : ''}</small></span><button className="pill outline small" disabled={busy} onClick={() => revokeShare(s.grantee_id)}>Revoca</button></div>; })}</div></>}
        <div className="panel"><label>INVITA QUALCUNO</label><small>Crea un link personale: vale una sola volta e scade dopo 7 giorni. Chi lo accetta entra nel tuo Circle, ma non vede nulla finché non apri il tuo mondo.</small><button className="pill dark wide" disabled={busy} onClick={copyInvite}><Copy size={18} /> Crea e copia invito</button>{selected?.type === 'invite' && <input readOnly aria-label="Link d'invito" value={selected.link} onFocus={e => e.target.select()} />}
          {circle.invitations.filter(i => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now()).map(i => <div key={i.id} className="inviteRow"><span>Invito del {fmtDate(i.created_at)} · scade il {fmtDate(i.expires_at)}</span><button className="textlink" onClick={async () => { await run(() => api.revokeInvitation(i.id), 'Invito revocato'); refreshCircle(); }}>Revoca</button></div>)}</div>
        <p className="hint"><ShieldCheck size={13} className="inline" /> Ogni accesso è verificato dal server e puoi revocarlo in qualsiasi momento.</p></>
        : <div className="panel"><label>ACCESSO</label><div className="choices"><button className={shareMode === 'item' ? 'chosen' : ''} onClick={() => setShareMode('item')}>Selected collections</button><button className={shareMode === 'all' ? 'chosen' : ''} onClick={() => setShareMode('all')}>My entire world</button></div>{signInHint}<button className="pill dark wide" onClick={copyInvite}><Copy size={18} /> Copia riepilogo</button></div>}</main>}

    {screen === 'profile' && profileDraft && <main><div className="eyebrow">IL MIO PROFILO</div><h1>{profile?.display_name}</h1><p className="muted">@{profile?.handle}</p>
      <div className="panel"><label htmlFor="pn">NOME</label><input id="pn" maxLength={60} value={profileDraft.display_name} onChange={e => setProfileDraft({ ...profileDraft, display_name: e.target.value })} /><label htmlFor="ph">NOME UTENTE</label><input id="ph" maxLength={31} autoCapitalize="none" autoCorrect="off" value={profileDraft.handle} onChange={e => setProfileDraft({ ...profileDraft, handle: e.target.value })} /><label htmlFor="ps">DI COSA TI OCCUPI</label><input id="ps" maxLength={120} placeholder="Travel · Food · Architecture" value={profileDraft.subtitle} onChange={e => setProfileDraft({ ...profileDraft, subtitle: e.target.value })} /><button className="pill dark wide" disabled={busy} onClick={saveProfile}><Check size={18} /> Salva</button></div>
      <p className="hint">Il tuo nome e la descrizione sono visibili solo alle persone del tuo Circle e dei mondi condivisi.</p>
      <div className="stack"><button className="feature" onClick={() => exportAI(items)}><Sparkles /><span><strong>Use with AI</strong><small>Copia tutto il tuo archivio come contesto</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportThoughts()), 'MORETHERE — THOUGHTS SHARED WITH ME')}><Inbox /><span><strong>Pensieri con AI</strong><small>I pensieri ricevuti che puoi usare con AI</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={downloadData}><Download /><span><strong>Esporta i miei dati</strong><small>Scarica tutto in formato JSON</small></span><ChevronRight /></button></div>
      <button className="pill outline wide" onClick={() => api.signOut()}><LogOut size={18} /> Esci</button>
      <button className="textlink danger" onClick={deleteAccount}>Elimina il mio account</button></main>}

    {screen === 'export' && <main><h1>AI Context</h1><textarea readOnly rows="16" value={selected?.text || ''} /><button className="pill dark wide" onClick={() => navigator.clipboard?.writeText(selected.text).then(() => toast('Copiato'))}><Copy size={18} /> Copia</button></main>}

    {showAddCollection && <div className="overlay" role="presentation" onClick={() => setShowAddCollection(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Nuova raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowAddCollection(false)}><X /></button><h2>Nuova raccolta</h2><input placeholder="Nome della raccolta" maxLength={60} value={newCollection} onChange={e => setNewCollection(e.target.value)} /><button className="pill dark wide" disabled={busy} onClick={async () => { const n = newCollection.trim(); if (n && !collections.some(c => c.toLowerCase() === n.toLowerCase())) { const r = await run(() => api.addCollection(n, collectionRows.length)); if (r) await refreshArchive(); } setNewCollection(''); setShowAddCollection(false); }}>Crea</button></div></div>}

    {collectionDialog && <div className="overlay" role="presentation" onClick={() => setCollectionDialog(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Rinomina raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setCollectionDialog(null)}><X /></button><h2>Rinomina raccolta</h2><input aria-label="Nuovo nome" maxLength={60} value={collectionDialog.name} onChange={e => setCollectionDialog({ ...collectionDialog, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && renameCollection()} /><button className="pill dark wide" disabled={busy} onClick={renameCollection}>Salva</button></div></div>}

    {invite && <div className="overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label="Invito"><UserRoundCheck size={28} />{invite.invalid ? <><h2>Invito non disponibile</h2><p className="muted">Questo link non è valido, è scaduto o è già stato usato. Chiedi un nuovo invito.</p><button className="pill dark wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Ok</button></> : <><h2>{invite.inviter_name} ti invita nel suo Circle</h2><p className="muted">Accettando diventerete connessi. Nessuno dei due vedrà nulla dell'altro finché non sceglierete di condividerlo.</p><button className="pill dark wide" disabled={busy} onClick={acceptInvite}>Accetta</button><button className="pill outline wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Non ora</button></>}</div></div>}

    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
  </div>;
}
