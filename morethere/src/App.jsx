import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UsersRound, Camera, Search, ArrowLeft, Plus, Heart, KeyRound, Sparkles, Trash2, ExternalLink, Copy,
  FolderHeart, Send, Check, Bookmark, PenLine, X, Link2, UserRoundPlus, ChevronRight,
  ShieldCheck, Download, LogOut, Inbox, UserRoundCheck, ImagePlus, Pencil, UserRound, ArrowRight,
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
  const [screen, setScreenRaw] = useState('home');
  // Navigation trail: the back arrow goes one step back, not straight home.
  // Going to a screen already in the trail returns to it; `replace` swaps the
  // current screen (after finishing a form, so back does not reopen it).
  const [trail, setTrail] = useState([]);
  const screenRef = useRef('home');
  const setScreen = (next, { replace = false } = {}) => {
    const cur = screenRef.current;
    if (next === cur) return;
    setTrail(t => {
      if (next === 'home') return [];
      const i = t.lastIndexOf(next);
      if (i >= 0) return t.slice(0, i);
      return replace ? t : [...t, cur];
    });
    screenRef.current = next;
    setScreenRaw(next);
  };
  const [exportText, setExportText] = useState('');
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
  const [spaceMembers, setSpaceMembers] = useState([]); // people for a new shared space
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [worldInvitee, setWorldInvitee] = useState(''); // eslint-disable-line no-unused-vars
  const [spaceTab, setSpaceTab] = useState('items');
  // Guided flows: one question at a time.
  const [meStep, setMeStep] = useState(1); const [meDone, setMeDone] = useState(false);
  const [forStep, setForStep] = useState(1); const [forDone, setForDone] = useState(false); const [forSearch, setForSearch] = useState('');
  const [usStep, setUsStep] = useState(1); const [usCreating, setUsCreating] = useState(false);
  const [showSpaceAdd, setShowSpaceAdd] = useState(false);
  const [spaceSearch, setSpaceSearch] = useState('');
  const [spaceItem, setSpaceItem] = useState(null);
  const [renameSpace, setRenameSpace] = useState(null);
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
    ...worlds.flatMap(w => w.covers || []),
    // faces
    profile?.avatar_path, friend?.avatar_path,
    ...circle.connections.map(c => c.other?.avatar_path),
    ...worlds.flatMap(w => [w.owner?.avatar_path, ...w.others.map(m => m.profile?.avatar_path)]),
    ...(worldData?.members || []).map(m => m.profile?.avatar_path),
    ...thoughts.received.map(t => t.sender?.avatar_path),
  ].filter(Boolean), [items, friendData, thoughts, worldData, worlds, profile, friend, circle]);
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
  const back = () => { setTrail([]); screenRef.current = 'home'; setScreenRaw('home'); setSelected(null); setFriend(null); setFriendData(null); setWorldData(null); setEdit(null); };
  const goBack = () => {
    const prev = trail[trail.length - 1];
    if (!prev || prev === 'home') return back();
    setTrail(t => t.slice(0, -1));
    setEdit(null);
    if (prev === 'worlds' || prev === 'circle') setWorldData(null);
    screenRef.current = prev;
    setScreenRaw(prev);
  };

  // ---- AI Context Builder ----------------------------------------------------------
  const deliverAI = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Contesto copiato. Incollalo nel tuo assistente AI.'); } catch { setExportText(text); setScreen('export'); }
  };
  const exportAI = async (data = items) => deliverAI(buildAIContext(data));
  const exportShared = async (rows, heading, source) => {
    if (!rows?.length) return toast('Nessun contenuto disponibile per l\'AI.');
    return deliverAI(buildAIContext(fromExportRows(rows), { heading, source }));
  };

  // ---- thought of you ---------------------------------------------------------
  const startMoreForYou = ({ item = null, personId = '' } = {}) => {
    setSelected(item); setMessage(''); setRecipient(''); setForSearch('');
    setRecipientId(personId || accepted[0]?.other.id || ''); setThoughtAi(false);
    setForStep(item ? 2 : 1); setForDone(false); setScreen('thought');
  };
  const share = (item) => startMoreForYou({ item });
  const sendThought = async () => {
    if (!selected) return;
    if (social && recipientId && recipientId !== '__external') {
      const ok = await run(() => api.sendThought({ recipientId, itemId: selected.id, message: message.trim(), allowAi: thoughtAi }));
      if (ok) { await refreshThoughts(); setForDone(true); }
      return;
    }
    if (!recipient.trim()) return toast('Inserisci il destinatario');
    const n = { id: crypto.randomUUID(), recipient: recipient.trim(), message: message.trim(), item: { title: selected.title, url: selected.url, note: selected.note }, created: Date.now() };
    setNotes(v => [n, ...v]);
    const payload = `${message || 'Ho pensato a te.'}\n\n${selected.title}\n${selected.url || selected.note}\n\nShared via morethere`;
    if (navigator.share) navigator.share({ title: 'Thought of you · morethere', text: payload }).catch(() => {});
    else navigator.clipboard?.writeText(payload).then(() => toast('Messaggio copiato per la condivisione'));
    setForDone(true);
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
    if (!worldName.trim()) return toast('Dai un nome al vostro spazio');
    if (!social) return toast('Accedi per creare uno spazio condiviso');
    const w = await run(() => api.createWorld(worldName.trim()));
    if (!w) return;
    for (const id of spaceMembers) await run(() => api.inviteToWorld(w.id, id));
    setWorldName(''); setSpaceMembers([]); setUsCreating(false); await refreshWorlds();
    toast(spaceMembers.length ? 'Lo spazio è pronto: abbiamo mandato gli inviti' : 'Il tuo spazio è pronto');
    openWorld(w);
  };
  const startMoreOfMe = (personId = '') => { pickShareTarget(personId); setMeStep(personId ? 2 : 1); setMeDone(false); setScreen('settings'); };
  const startMoreOfUs = (memberIds = []) => { setSpaceMembers(memberIds); setWorldName(''); setUsStep(memberIds.length ? 2 : 1); setUsCreating(memberIds.length > 0 || !worlds.length); setScreen('worlds'); };
  const openWorld = (w) => { setSelected(w); setWorldData(null); setSpaceTab('items'); setShowSpaceAdd(false); setSpaceItem(null); setScreen('world'); };
  const reloadWorld = useCallback(async (id) => setWorldData(await api.loadWorld(id)), [api]);
  useEffect(() => {
    if (screen !== 'world' || !selected?.id || !social) return;
    reloadWorld(selected.id).catch(e => { toast(friendlyError(e)); goBack(); });
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
    const ok = await run(() => api.setShare({ granteeId: shareTarget, scope: shareMode === 'all' ? 'all' : 'collections', canSave: permission === 'save', allowAi: shareAi, collectionIds: shareCollections }));
    if (ok !== undefined) { await refreshCircle(); setMeDone(true); }
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
    setInviteLink(link);
    await refreshCircle();
  };

  // ---- circle actions --------------------------------------------------------------
  const requestConnection = async () => {
    const h = handleInput.trim(); if (!h) return toast('Scrivi un nome utente');
    const r = await run(() => api.requestConnection(h));
    if (r) { setHandleInput(''); setShowAddPerson(false); toast(r === 'accepted' ? 'Ora siete connessi' : 'Richiesta inviata: la vedrai qui finché non accetta'); await refreshCircle(); }
  };
  const respond = async (id, yes) => { await run(() => api.respondConnection(id, yes), yes ? 'Ora siete connessi' : 'Richiesta rifiutata'); await refreshCircle(); };
  const acceptInvite = async () => {
    const r = await run(() => api.acceptInvitation(invite.token), 'Ora siete connessi');
    setInvite(null); onInviteHandled?.();
    if (r) { await refreshCircle(); setScreen('circle', { replace: true }); }
  };

  // ---- local data import (explicit consent) -----------------------------------------
  const importLegacy = async () => {
    const n = await run(() => api.importLegacy(legacy));
    if (n !== undefined) { clearLegacy(); setLegacy(null); await Promise.all([refreshArchive(), refreshWorlds()]); toast(`${n} ${n === 1 ? 'scoperta importata' : 'scoperte importate'} nel tuo account`); }
  };

  // ---- account ----------------------------------------------------------------------
  const avatarInput = useRef();
  const onAvatarChosen = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const ok = await run(() => api.setAvatar(file), 'Foto profilo aggiornata');
    if (ok !== undefined) { await refreshProfile(); refreshCircle(); refreshWorlds(); }
  };
  const removeAvatar = async () => {
    if (!window.confirm('Togliere la foto profilo?')) return;
    const ok = await run(() => api.removeAvatar(), 'Foto profilo tolta');
    if (ok !== undefined) { await refreshProfile(); refreshCircle(); refreshWorlds(); }
  };
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
  const pendingInvites = circle.invitations.filter(i => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now());
  const initial = p => (nameOf(p)[0] || '?').toUpperCase();
  // A person's face: their profile photo if they have one, else their initial.
  const face = p => (photoUrls[p?.avatar_path] ? <img className="faceImg" src={photoUrls[p.avatar_path]} alt="" loading="lazy" /> : initial(p));
  // Pick people by tapping their avatar. `single`: exactly one; otherwise toggles.
  const peoplePicker = (selectedIds, onPick, { external = false } = {}) => (
    <div className="pickRow" role="group" aria-label="Persone">
      {accepted.map(c => { const on = selectedIds.includes(c.other.id); return <button key={c.other.id} type="button" className={'pick' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onPick(c.other.id)}><span className="av" aria-hidden="true">{face(c.other)}{on && <span className="avCheck"><Check size={13} /></span>}</span><span className="pn">{nameOf(c.other)}</span></button>; })}
      {external && <button type="button" className={'pick' + (selectedIds.includes('__external') ? ' on' : '')} aria-pressed={selectedIds.includes('__external')} onClick={() => onPick('__external')}><span className="av" aria-hidden="true"><Send size={16} /></span><span className="pn">Fuori app</span></button>}
      <button type="button" className="pick add" onClick={() => setShowAddPerson(true)}><span className="av" aria-hidden="true"><Plus size={20} /></span><span className="pn">Aggiungi</span></button>
    </div>
  );
  const wizard = ({ n, total, question, hint, children, canNext = true, onNext, nextLabel = 'Avanti', onBack }) => (
    <div className="wiz">
      <div className="wizTop"><span className="wizCount">{n} di {total}</span><span className="wizBar" aria-hidden="true">{Array.from({ length: total }, (_, k) => <i key={k} className={k < n ? 'on' : ''} />)}</span></div>
      <h2 className="wizQ">{question}</h2>{hint && <p className="wizHint">{hint}</p>}
      <div className="wizBody">{children}</div>
      <div className="wizNav">{onBack ? <button type="button" className="textlink wizBack" onClick={onBack}><ArrowLeft size={15} /> Indietro</button> : <span />}<button type="button" className="pill dark wizNext" disabled={!canNext || busy} onClick={onNext}>{nextLabel}{nextLabel === 'Avanti' && <ArrowRight size={16} />}</button></div>
    </div>
  );
  const option = ({ on, title, desc, onClick, multi = false, key }) => <button key={key} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} className={'opt' + (on ? ' on' : '') + (multi ? ' multi' : '')} onClick={onClick}><span className="optMark" aria-hidden="true">{on && (multi ? <Check size={13} /> : <i />)}</span><span className="optText"><strong>{title}</strong>{desc && <small>{desc}</small>}</span></button>;
  const doneView = ({ title, text, actions }) => <div className="wizDone"><span className="doneMark" aria-hidden="true"><Check size={28} /></span><h2>{title}</h2><p className="muted">{text}</p><div className="doneActions">{actions}</div></div>;
  const step = (n, label) => <div className="step"><span className="stepNum">{n}</span><span className="stepLabel">{label}</span></div>;
  const shareSummary = sh => `${sh.scope === 'all' ? 'tutto il tuo archivio' : `${sh.collection_ids.length} ${sh.collection_ids.length === 1 ? 'raccolta' : 'raccolte'}`} · ${sh.can_save ? 'lettura e copia' : 'solo lettura'}${sh.allow_ai_export ? ' · AI' : ''}`;
  const spacesWith = id => worlds.filter(w => w.myStatus === 'active' && w.others.some(m => m.user_id === id));
  const activeSpaces = worlds.filter(w => w.myStatus === 'active');
  const cover = (paths, cls = 'mosaic') => { const urls = (paths || []).map(x => photoUrls[x]).filter(Boolean).slice(0, 4); return <span className={`${cls} n${urls.length}`} aria-hidden="true">{urls.length ? urls.map(u => <img key={u} src={u} alt="" loading="lazy" />) : <FolderHeart size={22} />}</span>; };
  const memberStack = (profiles, max = 4) => <span className="memberStack" aria-hidden="true">{profiles.slice(0, max).map((p, k) => <span key={k} className="mav">{face(p)}</span>)}{profiles.length > max && <span className="mav more">+{profiles.length - max}</span>}</span>;
  const spaceRow = w => { const others = w.others.filter(m => m.status === 'active'); const waiting = w.others.filter(m => m.status === 'invited'); return <button key={w.id} className="spaceCard" onClick={() => openWorld(w)}>{cover(w.covers)}<span className="scBody"><strong>{w.name}</strong><small>{others.length ? 'Con ' + others.map(m => nameOf(m.profile)).join(', ') : 'Solo tu, per ora'}{waiting.length ? ` · ${waiting.length} ${waiting.length === 1 ? 'invito' : 'inviti'} in attesa` : ''}</small><span className="scMeta">{memberStack([profile, ...others.map(m => m.profile)].filter(Boolean))}<span>{w.count} {w.count === 1 ? 'scoperta' : 'scoperte'}</span></span></span><ChevronRight size={18} /></button>; };
  const title = { home: 'morethere', circle: 'Your Circle', friend: nameOf(friend), worlds: 'More of us', world: 'Spazio condiviso', thought: 'More for you', detail: 'La tua scoperta', settings: 'More of me', export: 'Use with AI', profile: 'Il mio profilo' }[screen] || 'morethere';
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

  return <div className="app"><header><div><button className="brand" aria-label={screen === 'home' ? 'morethere' : `Indietro · ${title}`} onClick={screen === 'home' ? back : goBack}>{screen === 'home' ? 'morethere' : <><ArrowLeft size={19} />{title}</>}</button>{screen === 'home' && <div className="subtitle">{loaded ? <>{items.length} {items.length === 1 ? 'scoperta' : 'scoperte'}</> : 'Sincronizzazione…'}</div>}</div>{screen === 'home' ? <div className="headActions"><button className="round" aria-label={attention ? `Apri Your Circle, ${attention} novità` : 'Apri Your Circle'} onClick={() => setScreen('circle')}><UsersRound size={22} />{attention > 0 && <span className="badge">{attention}</span>}</button>{social && <button className="round me" aria-label="Il mio profilo" onClick={openProfile}>{profile ? face(profile) : <UserRound size={22} />}</button>}</div> : <button className="pill dark" onClick={back}>CHIUDI</button>}</header>

    {screen === 'home' && <main>
      {legacy && <div className="panel"><strong>Hai {legacy.items.length} {legacy.items.length === 1 ? 'scoperta salvata' : 'scoperte salvate'} su questo dispositivo</strong><small>Vuoi portarle nel tuo account privato? Resteranno visibili solo a te. Dopo l'importazione verranno rimosse da questo dispositivo.</small><div className="choices"><button className="chosen" disabled={busy} onClick={importLegacy}>Importa</button><button onClick={() => setLegacy(null)}>Non ora</button></div></div>}
      <div className="eyebrow">NUOVO INGRESSO</div><div className="entry"><input value={entry} onChange={e => setEntry(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Incolla un link o scrivi..." /><button className="square" title={entry ? 'Salva una nota o un link' : 'Aggiungi una foto'} aria-label={entry ? 'Salva' : 'Aggiungi una foto'} disabled={busy} onClick={() => (entry ? add() : pickPhoto())}>{entry ? <Plus /> : <Camera />}</button><input ref={fileInput} type="file" accept="image/*" hidden aria-hidden="true" onChange={onPhotoChosen} /></div><div className="search"><Search size={21} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nell'archivio..." /></div><div className="chips">{cats.map(c => <button key={c} className={'chip ' + (filter === c ? 'active' : '')} onClick={() => setFilter(c)}>{c}</button>)}<button className="chip" aria-label="Nuova raccolta" onClick={() => setShowAddCollection(true)}><Plus size={15} /></button></div>{activeCollection && <div className="collectionTools"><button className="textlink" onClick={() => setCollectionDialog({ id: activeCollection.id, name: activeCollection.name })}><Pencil size={13} /> Rinomina</button><button className="textlink danger" onClick={deleteCollection}><Trash2 size={13} /> Elimina raccolta</button></div>}<div className="sectionRow"><div className="sectionLabel">{activeCollection ? activeCollection.name : 'La tua raccolta'}</div><div className="viewToggle" role="group" aria-label="Ordina"><button className={view === 'recent' ? 'on' : ''} aria-pressed={view === 'recent'} onClick={() => chooseView('recent')}>Recenti</button><button className={view === 'date' ? 'on' : ''} aria-pressed={view === 'date'} onClick={() => chooseView('date')}>Per data</button></div></div>{view === 'date' ? byMonth.map(g => <section key={g.key} className="monthGroup"><h3 className="monthLabel">{g.label}</h3><div className="cards">{g.items.map(renderCard)}</div></section>) : <div className="cards">{sorted.map(renderCard)}</div>}{loaded && !filtered.length && <div className="empty">Il tuo mondo comincia da una scoperta. Salva qualcosa che vale la pena ricordare.</div>}<button className="socialCta" onClick={() => setScreen('circle')}><div><strong>Le persone di cui ti fidi</strong><small>{social ? (accepted.length ? `${accepted.length} ${accepted.length === 1 ? 'persona' : 'persone'} nel tuo Circle` : 'Scopri le loro raccolte condivise') : 'Scopri le loro raccolte condivise'}</small></div><ChevronRight /></button><div className="homeactions"><button onClick={() => { setShowAddPerson(true); setScreen('circle'); }}><UserRoundPlus size={18} /> Invita un amico</button><button onClick={() => setScreen('circle')}><FolderHeart size={18} /> Condivise con te</button></div></main>}

    {screen === 'circle' && <main><div className="eyebrow brandEyebrow">morethere.</div><h1>There's more to us.</h1><p className="muted">Scopri qualcosa in più delle persone che contano per te.</p>
      {!social && signInHint}
      {social && <section className="block"><div className="blockHead"><h2>Le tue persone</h2>{accepted.length > 0 && <span className="count">{accepted.length}</span>}</div>
        {incoming.map(c => <div key={c.id} className="requestCard"><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rq"><strong>{nameOf(c.other)} vuole aggiungerti</strong><small>@{c.other.handle}</small></span><button className="pill light small" disabled={busy} onClick={() => respond(c.id, true)}>Accetta</button><button className="iconbtn onDark" aria-label="Rifiuta" disabled={busy} onClick={() => respond(c.id, false)}><X size={18} /></button></div>)}
        <div className="peopleRail">
          <button className="railItem add" onClick={() => setShowAddPerson(true)}><span className="av" aria-hidden="true"><Plus size={22} /></span><span className="rn">Aggiungi</span></button>
          {accepted.map(c => { const sh = circle.sharesIn.some(x => x.owner_id === c.other.id); return <button key={c.id} className={'railItem' + (sh ? ' shares' : '')} aria-label={`${nameOf(c.other)}${sh ? ', condivide qualcosa con te' : ''}`} onClick={() => openFriend(c.other)}><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rn">{nameOf(c.other)}</span></button>; })}
          {outgoing.map(c => <button key={c.id} className="railItem pending" aria-label={`${nameOf(c.other)}, richiesta in attesa`} onClick={async () => { if (!window.confirm(`Annullare la richiesta a ${nameOf(c.other)}?`)) return; await run(() => api.removeConnection(c.other.id), 'Richiesta annullata'); refreshCircle(); }}><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rn">In attesa</span></button>)}
        </div>
        {!accepted.length && !outgoing.length ? <p className="hint railHint">Comincia da qui: tocca <strong>Aggiungi</strong> e invita le persone di cui ti fidi.</p>
          : accepted.some(c => circle.sharesIn.some(x => x.owner_id === c.other.id)) && <p className="hint railHint"><span className="ringDot" aria-hidden="true" /> condivide qualcosa con te · tocca una persona per vedere tutto ciò che vi riguarda</p>}
      </section>}
      <section className="block"><div className="ixCap">COSA VUOI FARE</div><div className="ix">
        <button className="ixr" onClick={() => startMoreOfMe()}><span className="ixn">01</span><span className="ixb"><span className="ixt">More <b>of me.</b></span><span className="ixs">Le cose che amo raccontano qualcosa in più di me.</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
        <button className="ixr" onClick={() => startMoreForYou()}><span className="ixn">02</span><span className="ixb"><span className="ixt">More <b>for you.</b></span><span className="ixs">Ho trovato qualcosa che vorrei condividere proprio con te.</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
        <button className="ixr us" onClick={() => startMoreOfUs()}><span className="ixn">03</span><span className="ixb"><span className="ixt">More <b>of us.</b></span><span className="ixs">Le nostre scoperte, i nostri gusti, le cose che ci uniscono.</span>{(worldInvites.length > 0 || activeSpaces.length > 0) && <span className="ixmeta">{[activeSpaces.length ? `${activeSpaces.length} ${activeSpaces.length === 1 ? 'spazio' : 'spazi'}` : '', worldInvites.length ? `${worldInvites.length} ${worldInvites.length === 1 ? 'invito' : 'inviti'} da accettare` : ''].filter(Boolean).join(' · ')}</span>}</span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
      </div></section>
      {social && thoughts.received.length > 0 && <><h2>Scoperte per te</h2>{thoughts.received.map(t => <div className={'note' + (t.read_at ? '' : ' unread')} key={t.id}><strong>Da {nameOf(t.sender)}</strong><p>{t.message || 'Ho pensato a te.'}</p>{photoUrls[t.item_image_path] && <Photo className="notephoto" url={photoUrls[t.item_image_path]} alt={t.item_title} />}<small>{t.item_title}</small><div className="noteactions">{safeUrl(t.item_url || '') && <a className="textlink" href={t.item_url} target="_blank" rel="noopener noreferrer" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Apri <ExternalLink size={12} /></a>}<button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveThought(t), 'Salvato nel tuo archivio'); if (r) { refreshArchive(); refreshThoughts(); } }}>+ Salva nel mio archivio</button>{!t.read_at && <button className="textlink" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Segna come letto</button>}{t.allow_ai_export && <button className="textlink" onClick={() => exportShared([{ title: t.item_title, url: t.item_url, note: t.message ? `${t.item_note}\nDedication: ${t.message}` : t.item_note, category: t.item_category, collection: 'More for you', added_by_name: nameOf(t.sender) }], 'MORETHERE — SHARED CONTEXT', nameOf(t.sender))}>Use with AI</button>}</div></div>)}</>}
      {(thoughts.sent.length > 0 || notes.length > 0) && <><h2>Scoperte che hai mandato</h2>{thoughts.sent.map(n => <div className="note" key={n.id}><strong>Per {nameOf(n.recipient)}</strong><p>{n.message || 'Ho pensato a te.'}</p><small>{n.item_title} · {n.read_at ? 'Visto' : 'Inviato'} {fmtDate(n.created_at)}</small><div className="noteactions"><button className="textlink" onClick={async () => { await run(() => api.deleteThought(n.id), 'Pensiero ritirato'); refreshThoughts(); }}>Ritira</button></div></div>)}{notes.map(n => <div className="note" key={n.id}><strong>Per {n.recipient}</strong><p>{n.message || 'Ho pensato a te.'}</p><small>{n.item?.title} · condiviso fuori da morethere</small></div>)}</>}
      {social && profile && <p className="hint usernameHint">Il tuo nome utente è <strong>@{profile.handle}</strong>: dallo a chi vuoi che ti aggiunga.</p>}</main>}

    {screen === 'friend' && friend && <main><div className="personHero"><span className="av big" aria-hidden="true">{face(friend)}</span><div><h1>{nameOf(friend)}</h1><p className="muted">@{friend.handle}{friend.subtitle ? ` · ${friend.subtitle}` : ''}</p></div></div>
      {(() => { const mine = circle.sharesOut.find(x => x.grantee_id === friend.id); const sp = spacesWith(friend.id); return <>
        <div className="ix">
          <button className="ixr" onClick={() => startMoreOfMe(friend.id)}><span className="ixn">01</span><span className="ixb"><span className="ixt">More <b>of me.</b></span><span className="ixs">{mine ? (mine.scope === 'all' ? `${nameOf(friend)} vede tutto il tuo archivio` : `${nameOf(friend)} vede ${mine.collection_ids.length} ${mine.collection_ids.length === 1 ? 'raccolta' : 'raccolte'}`) : `${nameOf(friend)} non vede ancora nulla di te`}</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
          <button className="ixr" onClick={() => startMoreForYou({ personId: friend.id })}><span className="ixn">02</span><span className="ixb"><span className="ixt">More <b>for you.</b></span><span className="ixs">Manda una scoperta a {nameOf(friend)}</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
          <button className="ixr us" onClick={() => startMoreOfUs([friend.id])}><span className="ixn">03</span><span className="ixb"><span className="ixt">More <b>of us.</b></span><span className="ixs">Crea un nuovo spazio con {nameOf(friend)}</span></span><span className="ixgo" aria-hidden="true"><Plus size={17} strokeWidth={1.5} /></span></button>
        </div>
        <section className="block"><div className="blockHead"><h2>I vostri spazi</h2>{sp.length > 0 && <span className="count">{sp.length}</span>}</div>{sp.length ? <div className="stack">{sp.map(spaceRow)}</div> : <div className="empty compact">Nessuno spazio insieme, per ora. Creane uno con <strong>More of us.</strong></div>}</section></>; })()}
      <section className="block"><h2>Cosa condivide con te</h2>
      {!friendData ? <div className="empty compact">Caricamento…</div> : !friendShare ? <div className="empty compact">{nameOf(friend)} non condivide ancora nulla con te.</div> : <>
        <div className="cards">{friendGroups.map(c => { const cover = photoUrls[c.items.find(i => i.image_path && photoUrls[i.image_path])?.image_path]; return <article className="item" key={c.id}><div className={'preview' + (cover ? ' hasphoto' : '')}>{cover ? <Photo url={cover} /> : <span><FolderHeart size={26} /></span>}</div><div className="itembody"><div className="eyebrow">COLLECTION</div><strong>{c.name}</strong><small>{c.items.length} {c.items.length === 1 ? 'elemento' : 'elementi'}</small>{c.items.map(i => <div key={i.id} className="shared">{photoUrls[i.image_path] && <Photo className="thumb" url={photoUrls[i.image_path]} alt={i.title} />}{friendShare.can_save ? <button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveSharedItem(i, collectionId('Idee')), 'Salvato nel tuo archivio'); if (r) refreshArchive(); }}>+ Save {i.title}</button> : (safeUrl(i.url) ? <a className="textlink" href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : <span className="textlink">{i.title}</span>)}</div>)}</div></article>; })}</div>
        {!friendGroups.length && <div className="empty compact">Nessun elemento condiviso per ora.</div>}
        {friendShare.allow_ai_export && <button className="pill dark wide" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportShared(friend.id)), 'MORETHERE — SHARED CONTEXT', nameOf(friend))}><Sparkles size={18} /> Use with AI</button>}
        <p className="hint"><ShieldCheck size={13} className="inline" /> {friendShare.can_save ? 'Lettura e copia' : 'Solo lettura'} · {friendShare.allow_ai_export ? 'Uso con AI consentito' : 'Uso con AI non consentito'}. {nameOf(friend)} può modificare o revocare questo accesso in qualsiasi momento.</p></>}</section>
      <button className="textlink danger" onClick={async () => { if (!window.confirm(`Rimuovere ${nameOf(friend)} dal tuo Circle? Gli accessi tra voi verranno revocati.`)) return; await run(() => api.removeConnection(friend.id), 'Connessione rimossa'); await refreshCircle(); setScreen('circle', { replace: true }); }}>Rimuovi dal mio Circle</button></main>}

    {screen === 'worlds' && <main><div className="eyebrow">03 — RACCOLTA CONDIVISA</div><h1>More of us.</h1>
      {!social && signInHint}
      {social && (usCreating ? <>
        {usStep === 1 && wizard({ n: 1, total: 2, question: 'Con chi?', hint: 'Puoi scegliere più persone, oppure nessuna e invitarle dopo.', onBack: activeSpaces.length ? () => setUsCreating(false) : undefined, onNext: () => setUsStep(2), children: peoplePicker(spaceMembers, id => setSpaceMembers(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]))) })}
        {usStep === 2 && wizard({ n: 2, total: 2, question: 'Come lo chiamate?', hint: spaceMembers.length ? `Con ${accepted.filter(c => spaceMembers.includes(c.other.id)).map(c => nameOf(c.other)).join(', ')}. Riceveranno un invito.` : 'Per ora solo tu: potrai invitare qualcuno quando vuoi.', canNext: !!worldName.trim(), onBack: () => setUsStep(1), onNext: createWorld, nextLabel: 'Crea lo spazio', children: <>
          <input id="wname" aria-label="COME LO CHIAMIAMO?" placeholder="Il nostro prossimo viaggio, Posti da provare…" value={worldName} onChange={e => setWorldName(e.target.value)} />
          <div className="chips wrap suggest">{['Viaggi insieme', 'Ristoranti da provare', 'Libri da leggere', 'Idee regalo', 'Casa'].map(x => <button key={x} type="button" className={'chip ' + (worldName === x ? 'active' : '')} onClick={() => setWorldName(x)}>{x}</button>)}</div></> })}
      </> : <>
        <p className="muted">Le nostre scoperte, i nostri gusti, le cose che ci uniscono. Uno spazio per ogni persona o gruppo: quanti ne vuoi.</p>
        <button className="pill dark wide newSpace" onClick={() => { setSpaceMembers([]); setWorldName(''); setUsStep(1); setUsCreating(true); }}><Plus size={18} /> Nuovo spazio</button>
      </>)}
      {!usCreating && <>{worldInvites.length > 0 && <><h2>Ti hanno invitato</h2><div className="people">{worldInvites.map(w => <div key={w.id} className="person"><div className="avatar"><FolderHeart size={20} /></div><span><strong>{w.name}</strong><small>Da {nameOf(w.owner)}</small></span><button className="pill dark small" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, true), 'Benvenuto nel vostro spazio'); refreshWorlds(); }}>Entra</button><button className="iconbtn" aria-label="Rifiuta" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, false)); refreshWorlds(); }}><X size={18} /></button></div>)}</div></>}
      <div className="blockHead"><h2>I vostri spazi</h2>{activeSpaces.length > 0 && <span className="count">{activeSpaces.length}</span>}</div>{activeSpaces.length ? <div className="stack">{activeSpaces.map(spaceRow)}</div> : <div className="empty compact">Ancora nessuno spazio. Create un posto per le cose che volete fare, vedere e ricordare insieme.</div>}</>}</main>}

    {screen === 'world' && selected && <main className="spacePage">
      {!worldData ? <div className="empty compact">Caricamento…</div> : (() => {
        const active = worldData.members.filter(m => m.status === 'active');
        const others = active.filter(m => m.user_id !== api.me);
        const invited = worldData.members.filter(m => m.status === 'invited');
        const heroPaths = worldData.items.map(i => i.image_path).filter(x => photoUrls[x]).slice(0, 4);
        const eligible = accepted.filter(c => !memberIds.has(c.other.id));
        const q = spaceSearch.trim().toLowerCase();
        const pickable = items.filter(i => !q || [i.title, i.note, i.url].join(' ').toLowerCase().includes(q));
        return <>
          <div className={'spaceHero' + (heroPaths.length ? ' withPhotos' : '')}>
            {heroPaths.length > 0 && cover(heroPaths, 'heroMosaic')}
            <div className="spaceHeroText"><span className="heroEyebrow">03 — SPAZIO CONDIVISO</span>
              <div className="heroTitle"><h1>{worldData.world.name}</h1>{isWorldOwner && <button className="iconbtn onDark" aria-label="Rinomina lo spazio" onClick={() => setRenameSpace(worldData.world.name)}><Pencil size={16} /></button>}</div>
              <div className="heroMembers">{memberStack(active.map(m => m.profile).filter(Boolean), 5)}<span>{others.length ? 'Tu e ' + others.map(m => nameOf(m.profile)).join(', ') : 'Solo tu, per ora'}{invited.length ? ` · ${invited.length} ${invited.length === 1 ? 'invito' : 'inviti'} in attesa` : ''}</span></div></div>
          </div>
          <div className="spaceActions"><button className="pill dark" onClick={() => { setSpaceSearch(''); setShowSpaceAdd(true); }}><Plus size={18} /> Aggiungi</button><button className="pill outline" onClick={() => setSpaceTab('people')}><UserRoundPlus size={18} /> Invita</button><button className="pill outline iconOnly" aria-label="Use with AI" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportWorld(selected.id)), 'MORETHERE — SHARED SPACE CONTEXT', worldData.world.name)}><Sparkles size={18} /></button></div>
          <div className="viewToggle tabs" role="tablist"><button role="tab" aria-selected={spaceTab === 'items'} className={spaceTab === 'items' ? 'on' : ''} onClick={() => setSpaceTab('items')}>Scoperte · {worldData.items.length}</button><button role="tab" aria-selected={spaceTab === 'people'} className={spaceTab === 'people' ? 'on' : ''} onClick={() => setSpaceTab('people')}>Persone · {active.length}</button></div>

          {spaceTab === 'items' && (worldData.items.length ? <div className="cards">{worldData.items.map(i => <article className="item" key={i.id}><button className={'preview' + (photoUrls[i.image_path] ? ' hasphoto' : '')} aria-label={`Apri ${i.title}`} onClick={() => setSpaceItem(i)}>{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : <span>{i.url ? <Link2 size={26} /> : <PenLine size={26} />}</span>}</button><div className="itembody"><div className="eyebrow">{i.category}{i.memory_date ? <> · {fmtMemory(i.memory_date, true)}</> : null}</div><button className="itemtitle" onClick={() => setSpaceItem(i)}>{i.title}</button><small className="byline">{i.added_by === api.me ? 'Aggiunto da te' : 'Aggiunto da ' + nameOf(i.adder)}</small></div></article>)}</div>
            : <div className="spaceEmpty"><FolderHeart size={28} /><strong>Lo spazio è ancora vuoto</strong><small>Aggiungete la prima scoperta: un posto, un link, una foto, un'idea.</small><button className="pill dark" onClick={() => { setSpaceSearch(''); setShowSpaceAdd(true); }}><Plus size={18} /> Aggiungi dal tuo archivio</button></div>)}

          {spaceTab === 'people' && <>
            <div className="people">{worldData.members.map(m => <div key={m.user_id} className="person"><div className="avatar">{face(m.profile)}</div><span><strong>{m.user_id === api.me ? 'Tu' : nameOf(m.profile)}</strong><small>{m.role === 'owner' ? 'Ha creato questo spazio' : m.status === 'invited' ? 'Invito in attesa' : 'Partecipa'}{m.status === 'active' ? (m.allow_ai_export ? ' · AI consentita' : ' · AI non consentita') : ''}</small></span>{isWorldOwner && m.role !== 'owner' && <button className="iconbtn" aria-label="Rimuovi persona" onClick={async () => { if (!window.confirm('Rimuovere questa persona dallo spazio?')) return; await run(() => api.removeWorldMember(selected.id, m.user_id)); reloadWorld(selected.id); }}><X size={18} /></button>}</div>)}</div>
            <div className="panel stepped"><div className="stepLabel">Invita qualcuno</div>{eligible.length ? <div className="pickRow">{eligible.map(c => <button key={c.other.id} type="button" className="pick" aria-label={`Invita ${nameOf(c.other)}`} disabled={busy} onClick={async () => { await run(() => api.inviteToWorld(selected.id, c.other.id), `Invito mandato a ${nameOf(c.other)}`); reloadWorld(selected.id); refreshWorlds(); }}><span className="av" aria-hidden="true">{face(c.other)}</span><span className="pn">{nameOf(c.other)}</span></button>)}<button type="button" className="pick add" onClick={() => setShowAddPerson(true)}><span className="av" aria-hidden="true"><Plus size={20} /></span><span className="pn">Aggiungi</span></button></div> : <small>Tutte le tue persone sono già qui. <button className="textlink inlineLink" onClick={() => setShowAddPerson(true)}>Aggiungi una persona</button></small>}</div>
            {myMembership && <div className="panel"><Toggle checked={myMembership.allow_ai_export} onChange={async v => { await run(() => api.setWorldAiConsent(selected.id, v)); reloadWorld(selected.id); }} label="I miei contributi con AI" hint="Consenti agli altri di includere ciò che aggiungi quando usano questo spazio con un assistente AI." /></div>}
            <p className="hint">Il pulsante <Sparkles size={12} className="inline" /> include i tuoi contributi e quelli di chi lo ha consentito.</p>
            {isWorldOwner ? <button className="textlink danger" onClick={async () => { if (!window.confirm('Eliminare questo spazio per tutti?')) return; await run(() => api.deleteWorld(selected.id), 'Spazio eliminato'); await refreshWorlds(); setScreen('worlds', { replace: true }); }}>Elimina questo spazio</button> : <button className="textlink danger" onClick={async () => { if (!window.confirm('Lasciare questo spazio?')) return; await run(() => api.removeWorldMember(selected.id, api.me), 'Hai lasciato lo spazio'); await refreshWorlds(); setScreen('worlds', { replace: true }); }}>Lascia questo spazio</button>}
          </>}

          {showSpaceAdd && <div className="overlay" role="presentation" onClick={() => setShowSpaceAdd(false)}><div className="modal sheet tall" role="dialog" aria-modal="true" aria-label="Aggiungi allo spazio" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowSpaceAdd(false)}><X /></button><h2>Aggiungi a {worldData.world.name}</h2><div className="search"><Search size={19} /><input aria-label="Cerca nel tuo archivio" placeholder="Cerca nel tuo archivio..." value={spaceSearch} onChange={e => setSpaceSearch(e.target.value)} /></div>
            <div className="pickGrid">{pickable.map(i => { const added = worldSourceIds.has(i.id); return <button key={i.id} className={'pickTile' + (added ? ' added' : '')} disabled={busy || added} aria-label={`${added ? 'Già aggiunto: ' : 'Aggiungi '}${i.title}`} onClick={async () => { const r = await run(() => api.addItemToWorld(selected.id, i.id), 'Aggiunto al vostro spazio'); if (r !== undefined) { reloadWorld(selected.id); refreshWorlds(); } }}><span className="ptImg">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={20} /> : <PenLine size={20} />)}{added && <span className="ptCheck"><Check size={14} /></span>}</span><span className="ptTitle">{i.title}</span></button>; })}</div>
            {!pickable.length && <div className="empty compact">{items.length ? 'Nessun risultato.' : 'Il tuo archivio è vuoto: salva prima qualcosa dalla home.'}</div>}
            <button className="pill dark wide" onClick={() => setShowSpaceAdd(false)}>Fatto</button></div></div>}

          {spaceItem && <div className="overlay" role="presentation" onClick={() => setSpaceItem(null)}><div className="modal sheet" role="dialog" aria-modal="true" aria-label={spaceItem.title} onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setSpaceItem(null)}><X /></button>{photoUrls[spaceItem.image_path] && <Photo className="hero" url={photoUrls[spaceItem.image_path]} alt={spaceItem.title} />}<div className="eyebrow">{spaceItem.category}{spaceItem.memory_date ? <> · {fmtMemory(spaceItem.memory_date)}</> : null}</div><h2>{spaceItem.title}</h2>{spaceItem.note && <p className="notebody">{spaceItem.note}</p>}{safeUrl(spaceItem.url || '') && <a className="outlink" href={spaceItem.url} target="_blank" rel="noopener noreferrer">Apri la fonte <ExternalLink size={17} /></a>}<small className="byline">{spaceItem.added_by === api.me ? 'Aggiunto da te' : 'Aggiunto da ' + nameOf(spaceItem.adder)} · {fmtDate(spaceItem.created_at)}</small>{(spaceItem.added_by === api.me || isWorldOwner) && <button className="textlink danger" onClick={async () => { await run(() => api.removeWorldItem(spaceItem.id), 'Tolto dallo spazio'); setSpaceItem(null); reloadWorld(selected.id); refreshWorlds(); }}>Togli dallo spazio</button>}</div></div>}

          {renameSpace !== null && <div className="overlay" role="presentation" onClick={() => setRenameSpace(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Rinomina lo spazio" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setRenameSpace(null)}><X /></button><h2>Rinomina lo spazio</h2><input aria-label="Nome dello spazio" maxLength={80} value={renameSpace} onChange={e => setRenameSpace(e.target.value)} /><button className="pill dark wide" disabled={busy || !renameSpace.trim()} onClick={async () => { const ok = await run(() => api.renameWorld(selected.id, renameSpace.trim()), 'Spazio rinominato'); if (ok !== undefined) { setRenameSpace(null); reloadWorld(selected.id); refreshWorlds(); } }}>Salva</button></div></div>}
        </>; })()}</main>}

    {screen === 'detail' && selected && <main><div className="eyebrow">{selected.category}{selected.memory_date && !edit ? <> · {fmtMemory(selected.memory_date)}</> : null}</div>
      {photoUrls[selected.image_path] && <Photo className="hero" url={photoUrls[selected.image_path]} alt={selected.title} />}
      {edit ? <div className="panel"><label htmlFor="e-title">TITOLO</label><input id="e-title" maxLength={300} autoFocus={!!edit.fresh} onFocus={e => edit.fresh && e.target.select()} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /><label htmlFor="e-url">LINK</label><input id="e-url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} /><label htmlFor="e-note">NOTA</label><textarea id="e-note" rows="5" maxLength={10000} placeholder={edit.fresh ? 'Dove eravate, con chi, cosa ricordi…' : ''} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /><label htmlFor="e-date">DATA DEL RICORDO</label><div className="dateRow"><input id="e-date" type="date" min="1800-01-01" max="2200-12-31" value={edit.memory_date || ''} onChange={e => setEdit({ ...edit, memory_date: e.target.value })} />{edit.memory_date ? <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: '' })}>Togli</button> : <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: todayIso() })}>Oggi</button>}</div><button className="pill dark wide" disabled={busy} onClick={saveEdit}><Check size={18} /> Salva</button><button className="pill outline wide" onClick={() => setEdit(null)}>Annulla</button></div>
        : <><h1>{selected.title}</h1>{safeUrl(selected.url || '') && <a className="outlink" href={selected.url} target="_blank" rel="noopener noreferrer">Apri la fonte <ExternalLink size={17} /></a>}{selected.note && <p className="notebody">{selected.note}</p>}
          <div className="detailtools"><button className="textlink" onClick={() => setEdit({ title: selected.title, url: selected.url || '', note: selected.note || '', memory_date: selected.memory_date || '' })}><Pencil size={14} /> Modifica</button><button className="textlink" disabled={busy} onClick={() => pickPhoto(selected.id)}><ImagePlus size={14} /> {selected.image_path ? 'Cambia foto' : 'Aggiungi foto'}</button>{social && safeUrl(selected.url || '') && !selected.image_path && <button className="textlink" disabled={busy} onClick={async () => { setBusy(true); const ok = await enrichLink(selected); setBusy(false); toast(ok ? 'Anteprima aggiornata' : 'Questa pagina non offre un\'anteprima'); if (ok) refreshArchive(); }}><Link2 size={14} /> Aggiorna anteprima</button>}<button className="textlink danger" onClick={async () => { if (!window.confirm(`Eliminare "${selected.title}"?`)) return; await removeItem(selected); goBack(); }}><Trash2 size={14} /> Elimina</button></div></>}
      <div className="panel"><label htmlFor="col">RACCOLTA</label><select id="col" value={selected.collection || ''} onChange={async e => { const v = e.target.value; const id = collectionId(v); setItems(arr => arr.map(i => i.id === selected.id ? { ...i, collection: v, collection_id: id } : i)); setSelected({ ...selected, collection: v, collection_id: id }); try { await api.updateItem(selected.id, { collection_id: id, collection: v }); } catch (err) { toast(friendlyError(err)); refreshArchive(); } }}>{!selected.collection && <option value="">—</option>}{collections.map(c => <option key={c}>{c}</option>)}</select></div><div className="stack"><button className="feature" onClick={() => share(selected)}><Heart /><span><strong>More for you.</strong><small>Mandala a qualcuno, con una dedica</small></span><ChevronRight /></button><button className="feature" onClick={() => exportAI([selected])}><Sparkles /><span><strong>Use with AI</strong><small>Copia il contesto</small></span><ChevronRight /></button></div></main>}

    {screen === 'thought' && <main><div className="eyebrow">02 — SCOPERTA PERSONALE</div><h1>More for you.</h1>
      {(() => {
        const external = !social || !accepted.length || recipientId === '__external';
        const to = accepted.find(c => c.other.id === recipientId)?.other;
        const who = external ? (recipient.trim() || 'questa persona') : nameOf(to);
        if (forDone) return doneView({ title: external ? 'Pronta da mandare.' : 'Mandata.', text: external ? 'Abbiamo preparato il messaggio con il menu di condivisione del telefono.' : `${who} la troverà nel suo Your Circle, tra le scoperte per lei. Riceve una copia, non l'accesso al tuo archivio.`, actions: <><button className="pill dark wide" onClick={() => startMoreForYou()}>Manda un'altra scoperta</button><button className="pill outline wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button></> });
        const q = forSearch.trim().toLowerCase();
        const pickable = items.filter(i => !q || [i.title, i.note, i.url].join(' ').toLowerCase().includes(q));
        return <>
          {forStep === 1 && wizard({ n: 1, total: 3, question: 'Cosa vuoi mandare?', hint: 'Scegli una scoperta dal tuo archivio.', canNext: !!selected, onNext: () => setForStep(2), children: <>
            <div className="search"><Search size={19} /><input aria-label="Cerca nel tuo archivio" placeholder="Cerca nel tuo archivio..." value={forSearch} onChange={e => setForSearch(e.target.value)} /></div>
            <div className="pickGrid">{pickable.map(i => <button key={i.id} type="button" role="radio" aria-checked={selected?.id === i.id} aria-label={i.title} className={'pickTile' + (selected?.id === i.id ? ' added' : '')} onClick={() => setSelected(i)}><span className="ptImg">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={20} /> : <PenLine size={20} />)}{selected?.id === i.id && <span className="ptCheck"><Check size={14} /></span>}</span><span className="ptTitle">{i.title}</span></button>)}</div>
            {!pickable.length && <div className="empty compact">{items.length ? 'Nessun risultato.' : 'Il tuo archivio è vuoto: salva prima qualcosa dalla home.'}</div>}</> })}
          {forStep === 2 && wizard({ n: 2, total: 3, question: 'A chi la mandi?', hint: social && accepted.length ? 'Tocca una persona del tuo Circle, oppure mandala fuori da morethere.' : 'Aggiungi una persona per mandarla dentro morethere, oppure condividila con i messaggi del telefono.', canNext: external ? !!recipient.trim() : !!recipientId, onBack: () => setForStep(1), onNext: () => setForStep(3), children: <>
            {selected && <div className="chosenItem">{photoUrls[selected.image_path] ? <Photo className="rowthumb" url={photoUrls[selected.image_path]} alt="" /> : <span className="chosenIcon">{selected.url ? <Link2 size={18} /> : <PenLine size={18} />}</span>}<span><strong>{selected.title}</strong><small>{selected.url || selected.note}</small></span><button className="textlink" onClick={() => setForStep(1)}>Cambia</button></div>}
            {social && peoplePicker([recipientId], id => setRecipientId(id), { external: true })}
            {external && <input id="to" aria-label="PER CHI?" placeholder="Nome o contatto" value={recipient} onChange={e => setRecipient(e.target.value)} />}</> })}
          {forStep === 3 && wizard({ n: 3, total: 3, question: 'Vuoi aggiungere una dedica?', hint: 'Due parole bastano. Puoi anche lasciarla vuota.', onBack: () => setForStep(2), onNext: sendThought, nextLabel: external ? 'Prepara il messaggio' : `Invia a ${who}`, children: <>
            <textarea id="msg" aria-label="LA TUA DEDICA" rows="4" maxLength={1000} placeholder="Ho visto questo e ho pensato subito a te..." value={message} onChange={e => setMessage(e.target.value)} />
            {!external && <div className="wizToggle"><Toggle checked={thoughtAi} onChange={setThoughtAi} label="Può usarla con l'AI" hint={`${who} potrà includerla nel suo contesto per un assistente AI.`} /></div>}</> })}
        </>;
      })()}</main>}

    {screen === 'settings' && <main><div className="eyebrow">01 — ACCESSO ALLA COLLEZIONE</div><h1>More of me.</h1>
      {social ? (() => {
        const target = accepted.find(c => c.other.id === shareTarget)?.other;
        const who = nameOf(target);
        const existing = circle.sharesOut.find(x => x.grantee_id === shareTarget);
        const chosenNames = collectionRows.filter(c => shareCollections.includes(c.id)).map(c => c.name);
        if (meDone) return doneView({ title: 'Fatto.', text: `${who} ora vede ${shareMode === 'all' ? 'tutto il tuo archivio' : chosenNames.join(', ')}. Puoi cambiare o togliere l'accesso quando vuoi.`, actions: <><button className="pill dark wide" onClick={() => target && openFriend(target)}>Vai alla pagina di {who}</button><button className="pill outline wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button></> });
        return <>
          {meStep === 1 && wizard({ n: 1, total: 4, question: 'Con chi vuoi condividere?', hint: 'Il tuo archivio è privato: vedrà solo ciò che scegli tu, e puoi cambiare idea quando vuoi.', canNext: !!shareTarget, onNext: () => setMeStep(2), children: <>{peoplePicker([shareTarget], id => pickShareTarget(id))}{!accepted.length && <p className="panelLead">Per prima cosa aggiungi la persona a cui vuoi mostrare qualcosa di te.</p>}{existing && <p className="wizNote">{who} vede già {shareSummary(existing)}: puoi cambiarlo nei prossimi passi.</p>}</> })}
          {meStep === 2 && wizard({ n: 2, total: 4, question: `Cosa può vedere ${who}?`, canNext: shareMode === 'all' || shareCollections.length > 0, onBack: () => setMeStep(1), onNext: () => setMeStep(3), children: <>
            <div className="opts" role="radiogroup">{option({ on: shareMode === 'item', title: 'Alcune raccolte', desc: 'Scegli tu quali, una per una.', onClick: () => setShareMode('item') })}{option({ on: shareMode === 'all', title: 'Tutto il mio archivio', desc: 'Anche quello che salverai in futuro.', onClick: () => setShareMode('all') })}</div>
            {shareMode === 'item' && <><div className="ixCap subCap">QUALI RACCOLTE?</div><div className="opts">{collectionRows.map(c => { const n = items.filter(i => i.collection_id === c.id).length; return option({ key: c.id, multi: true, on: shareCollections.includes(c.id), title: c.name, desc: `${n} ${n === 1 ? 'scoperta' : 'scoperte'}`, onClick: () => setShareCollections(v => (v.includes(c.id) ? v.filter(x => x !== c.id) : [...v, c.id])) }); })}</div></>}</> })}
          {meStep === 3 && wizard({ n: 3, total: 4, question: `Cosa può farne ${who}?`, onBack: () => setMeStep(2), onNext: () => setMeStep(4), children: <>
            <div className="opts" role="radiogroup">{option({ on: permission === 'view', title: 'Solo guardare', desc: 'Vede le tue scoperte, ma non può salvarle.', onClick: () => setPermission('view') })}{option({ on: permission === 'save', title: 'Guardare e salvare una copia', desc: 'Può tenere una copia nel suo archivio.', onClick: () => setPermission('save') })}</div>
            <div className="wizToggle"><Toggle checked={shareAi} onChange={setShareAi} label="Può usarle con l'AI" hint={`${who} potrà includere ciò che condividi nel suo contesto per un assistente AI.`} /></div></> })}
          {meStep === 4 && wizard({ n: 4, total: 4, question: 'Tutto giusto?', hint: 'Controlla e conferma.', onBack: () => setMeStep(3), onNext: saveShare, nextLabel: `Condividi con ${who}`, children: <dl className="summary">
            <div><dt>Con</dt><dd><span className="mav">{face(target)}</span>{who}</dd></div>
            <div><dt>Vedrà</dt><dd>{shareMode === 'all' ? 'Tutto il tuo archivio' : chosenNames.join(', ')}</dd></div>
            <div><dt>Potrà</dt><dd>{permission === 'save' ? 'Guardare e salvare una copia' : 'Solo guardare'}</dd></div>
            <div><dt>AI</dt><dd>{shareAi ? 'Sì, può usarle con l\'AI' : 'No'}</dd></div></dl> })}
          {meStep === 1 && circle.sharesOut.length > 0 && <><div className="blockHead"><h2>Chi vede già qualcosa di te</h2><span className="count">{circle.sharesOut.length}</span></div><div className="people">{circle.sharesOut.map(sh => { const c = accepted.find(x => x.other.id === sh.grantee_id); return <div key={sh.id} className="person"><div className="avatar">{face(c?.other)}</div><span><strong>{nameOf(c?.other)}</strong><small>{shareSummary(sh).replace(/^./, m => m.toUpperCase())}</small></span><button className="pill outline small" disabled={busy} onClick={() => revokeShare(sh.grantee_id)}>Revoca</button></div>; })}</div></>}
          <p className="hint"><ShieldCheck size={13} className="inline" /> Ogni accesso è verificato dal server e puoi revocarlo in qualsiasi momento.</p></>;
      })()
        : <div className="panel"><label>ACCESSO</label><div className="choices"><button className={shareMode === 'item' ? 'chosen' : ''} onClick={() => setShareMode('item')}>Alcune raccolte</button><button className={shareMode === 'all' ? 'chosen' : ''} onClick={() => setShareMode('all')}>Tutto il mio archivio</button></div>{signInHint}<button className="pill dark wide" onClick={copyInvite}><Copy size={18} /> Copia riepilogo</button></div>}</main>}

    {screen === 'profile' && profileDraft && <main><div className="eyebrow">IL MIO PROFILO</div>
      <div className="profileHero"><button className="avatarEdit" aria-label={profile?.avatar_path ? 'Cambia foto profilo' : 'Aggiungi una foto profilo'} disabled={busy} onClick={() => avatarInput.current?.click()}><span className="av big" aria-hidden="true">{face(profile)}</span><span className="avatarBadge" aria-hidden="true"><Camera size={15} /></span></button><input ref={avatarInput} type="file" accept="image/*" hidden aria-hidden="true" data-testid="avatar-input" onChange={onAvatarChosen} />
        <div><h1>{profile?.display_name}</h1><p className="muted">@{profile?.handle}</p><div className="avatarLinks"><button className="textlink" disabled={busy} onClick={() => avatarInput.current?.click()}>{profile?.avatar_path ? 'Cambia foto' : 'Aggiungi una foto'}</button>{profile?.avatar_path && <button className="textlink danger" disabled={busy} onClick={removeAvatar}>Togli</button>}</div></div></div>
      <p className="hint">La tua foto la vedono solo le persone del tuo Circle e chi condivide uno spazio con te.</p>
      <div className="panel"><label htmlFor="pn">NOME</label><input id="pn" maxLength={60} value={profileDraft.display_name} onChange={e => setProfileDraft({ ...profileDraft, display_name: e.target.value })} /><label htmlFor="ph">NOME UTENTE</label><input id="ph" maxLength={31} autoCapitalize="none" autoCorrect="off" value={profileDraft.handle} onChange={e => setProfileDraft({ ...profileDraft, handle: e.target.value })} /><label htmlFor="ps">DI COSA TI OCCUPI</label><input id="ps" maxLength={120} placeholder="Travel · Food · Architecture" value={profileDraft.subtitle} onChange={e => setProfileDraft({ ...profileDraft, subtitle: e.target.value })} /><button className="pill dark wide" disabled={busy} onClick={saveProfile}><Check size={18} /> Salva</button></div>
      <p className="hint">Il tuo nome e la descrizione sono visibili solo alle persone del tuo Circle e dei mondi condivisi.</p>
      <div className="stack"><button className="feature" onClick={() => exportAI(items)}><Sparkles /><span><strong>Use with AI</strong><small>Copia tutto il tuo archivio come contesto</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportThoughts()), 'MORETHERE — THOUGHTS SHARED WITH ME')}><Inbox /><span><strong>Pensieri con AI</strong><small>I pensieri ricevuti che puoi usare con AI</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={downloadData}><Download /><span><strong>Esporta i miei dati</strong><small>Scarica tutto in formato JSON</small></span><ChevronRight /></button></div>
      <button className="pill outline wide" onClick={() => api.signOut()}><LogOut size={18} /> Esci</button>
      <button className="textlink danger" onClick={deleteAccount}>Elimina il mio account</button></main>}

    {screen === 'export' && <main><h1>AI Context</h1><textarea readOnly rows="16" value={exportText} /><button className="pill dark wide" onClick={() => navigator.clipboard?.writeText(exportText).then(() => toast('Copiato'))}><Copy size={18} /> Copia</button></main>}

    {showAddCollection && <div className="overlay" role="presentation" onClick={() => setShowAddCollection(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Nuova raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowAddCollection(false)}><X /></button><h2>Nuova raccolta</h2><input placeholder="Nome della raccolta" maxLength={60} value={newCollection} onChange={e => setNewCollection(e.target.value)} /><button className="pill dark wide" disabled={busy} onClick={async () => { const n = newCollection.trim(); if (n && !collections.some(c => c.toLowerCase() === n.toLowerCase())) { const r = await run(() => api.addCollection(n, collectionRows.length)); if (r) await refreshArchive(); } setNewCollection(''); setShowAddCollection(false); }}>Crea</button></div></div>}

    {showAddPerson && social && <div className="overlay" role="presentation" onClick={() => setShowAddPerson(false)}><div className="modal sheet" role="dialog" aria-modal="true" aria-label="Aggiungi una persona" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowAddPerson(false)}><X /></button><h2>Aggiungi una persona</h2><p className="muted">Entra tra le tue persone quando accetta. Nessuno vede nulla di te finché non lo decidi tu.</p>
      <label htmlFor="handle">SE È GIÀ SU MORETHERE</label><input id="handle" placeholder="@nomeutente" autoCapitalize="none" autoCorrect="off" value={handleInput} onChange={e => setHandleInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && requestConnection()} /><button className="pill dark wide" disabled={busy} onClick={requestConnection}><UserRoundPlus size={18} /> Invia richiesta</button>
      <div className="orLine"><span>oppure</span></div>
      <label>SE NON C'È ANCORA</label><button className="pill outline wide" disabled={busy} onClick={copyInvite}><Link2 size={18} /> Invita con un link</button>{inviteLink && <input readOnly aria-label="Link d'invito" value={inviteLink} onFocus={e => e.target.select()} />}<small className="sheetNote">Il link è personale, vale una volta e scade dopo 7 giorni.{profile ? <> Il tuo nome utente è <strong>@{profile.handle}</strong>.</> : null}</small>
      {pendingInvites.map(i => <div key={i.id} className="inviteRow"><span>Invito del {fmtDate(i.created_at)} · scade il {fmtDate(i.expires_at)}</span><button className="textlink" onClick={async () => { await run(() => api.revokeInvitation(i.id), 'Invito revocato'); refreshCircle(); }}>Revoca</button></div>)}</div></div>}

    {collectionDialog && <div className="overlay" role="presentation" onClick={() => setCollectionDialog(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Rinomina raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setCollectionDialog(null)}><X /></button><h2>Rinomina raccolta</h2><input aria-label="Nuovo nome" maxLength={60} value={collectionDialog.name} onChange={e => setCollectionDialog({ ...collectionDialog, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && renameCollection()} /><button className="pill dark wide" disabled={busy} onClick={renameCollection}>Salva</button></div></div>}

    {invite && <div className="overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label="Invito"><UserRoundCheck size={28} />{invite.invalid ? <><h2>Invito non disponibile</h2><p className="muted">Questo link non è valido, è scaduto o è già stato usato. Chiedi un nuovo invito.</p><button className="pill dark wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Ok</button></> : <><h2>{invite.inviter_name} ti invita nel suo Circle</h2><p className="muted">Accettando diventerete connessi. Nessuno dei due vedrà nulla dell'altro finché non sceglierete di condividerlo.</p><button className="pill dark wide" disabled={busy} onClick={acceptInvite}>Accetta</button><button className="pill outline wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Non ora</button></>}</div></div>}

    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
  </div>;
}
