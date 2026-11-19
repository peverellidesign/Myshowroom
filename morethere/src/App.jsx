import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UsersRound, Camera, Search, ArrowLeft, Plus, KeyRound, Sparkles, Trash2, ExternalLink, Copy,
  FolderHeart, Send, Check, Bookmark, PenLine, X, Link2, UserRoundPlus, ChevronRight,
  ShieldCheck, Download, LogOut, Share, Compass, MapPin, Inbox, UserRoundCheck, ImagePlus, Pencil, UserRound, ArrowRight,
} from 'lucide-react';
import { explainWhy, relatedItems, ownWords } from './lib/why.js';
import { judge } from './lib/judge.js';
import { interestReason, themesOf, sourceOf, themeLabel } from './lib/interests.js';
import { watermark } from './lib/watermark.js';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// One discovery that can be dragged to a new place in the grid.
function Sortable({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({
    ref: setNodeRef,
    dragging: isDragging,
    style: { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 3 : undefined },
    // The keyboard picks up the card only when the card itself has focus, not a button inside it.
    props: { ...attributes, ...listeners, onKeyDown: e => { if (e.target === e.currentTarget) listeners?.onKeyDown?.(e); }, role: undefined, 'aria-roledescription': 'scoperta trascinabile' },
  });
}

// The three gestures of morethere, drawn as icons so they read at a glance.
// More of me: a friend steps into your collection. More for you: one memory,
// sent to one friend (a paper plane). More of us: two worlds overlapping into a shared space.
const MoreOfMeIcon = ({ size = 22 }) => <UserRoundPlus size={size} strokeWidth={1.5} />;
const MoreForYouIcon = ({ size = 22 }) => <Send size={size} strokeWidth={1.5} />;
const AskIcon = ({ size = 22 }) => <Compass size={size} strokeWidth={1.5} />;
const MoreOfUsIcon = ({ size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="12" r="6.25" /><circle cx="15" cy="12" r="6.25" /></svg>;
import { buildAIContext, fromExportRows } from './lib/ai.js';
import { friendlyError, photoTakenDate } from './lib/api.js';
import { readLegacy, clearLegacy } from './lib/local.js';

const safeUrl = (s) => { try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const readNotes = () => { try { return JSON.parse(localStorage.getItem('mt_notes')) ?? []; } catch { return []; } };
const writeNotes = (v) => { try { localStorage.setItem('mt_notes', JSON.stringify(v)); } catch { /* ignore */ } };
const nameOf = (p) => p?.display_name || 'Qualcuno';
// A link waiting for its preview gets a readable name: "Post su Facebook", not "facebook.com".
const SOCIAL_LINKS = [[/(^|\.)facebook\.com$|^fb\.watch$|^fb\.me$/, 'Post su Facebook'], [/(^|\.)instagram\.com$/, 'Post su Instagram'], [/(^|\.)threads\.(net|com)$/, 'Post su Threads'], [/(^|\.)tiktok\.com$/, 'Video su TikTok'], [/(^|\.)youtube\.com$|^youtu\.be$/, 'Video su YouTube']];
const linkHost = url => new URL(url).hostname.replace(/^(www|m|web)\./, '');
const linkLabel = url => SOCIAL_LINKS.find(([re]) => re.test(linkHost(url)))?.[1] || linkHost(url);
const isVideoLink = url => /\/(share\/[vr]|reel|reels|videos?|watch)\b|youtu\.be|tiktok\.com/i.test(url);
const firstName = (p) => nameOf(p).trim().split(/\s+/)[0];
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

export default function App({ api, pendingInvite, onInviteHandled, pendingShare, onShareHandled }) {
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
  const [asks, setAsks] = useState({ mine: [], incoming: [] }); // Chiedi consigli
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
  const [thoughtSave, setThoughtSave] = useState(false);
  const [extFile, setExtFile] = useState(null);
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
  const [spaceFilter, setSpaceFilter] = useState('all'); // 'all' | 'cat:<category>' | 'by:<user id>'
  const [spaceView, setSpaceView] = useState('recent');
  const [spaceItem, setSpaceItem] = useState(null);
  // Chiedi consigli: your request (askNew), an answer to a friend (answer), the answers you got (ask).
  const [askStep, setAskStep] = useState(1); const [askDone, setAskDone] = useState(null);
  const [askTitle, setAskTitle] = useState(''); const [askNote, setAskNote] = useState(''); const [askPeople, setAskPeople] = useState([]);
  const [showSent, setShowSent] = useState(false);
  const [bigFace, setBigFace] = useState(null); // a profile photo, enlarged
  const [digesting, setDigesting] = useState(null); // id of the discovery being summarised
  // Use with AI: what to give the assistant (everything, collections, a place or theme, or a hand-picked set).
  const [aiMode, setAiMode] = useState('all'); const [aiCols, setAiCols] = useState([]); const [aiQuery, setAiQuery] = useState('');
  const [aiPicked, setAiPicked] = useState([]); const [aiSkip, setAiSkip] = useState([]); const [aiAsk, setAiAsk] = useState('');
  const [askPlace, setAskPlace] = useState(''); const [hereBusy, setHereBusy] = useState(false);
  const [openAskId, setOpenAskId] = useState(null);
  const [answering, setAnswering] = useState(null);
  const [ansStep, setAnsStep] = useState(1); const [ansItems, setAnsItems] = useState([]); const [ansSave, setAnsSave] = useState(true);
  const [ansAi, setAnsAi] = useState(false); const [ansMsg, setAnsMsg] = useState(''); const [ansDone, setAnsDone] = useState(0); const [ansSearch, setAnsSearch] = useState('');
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
  const refreshAsks = useCallback(async () => { if (social) setAsks(await api.loadAsks()); }, [api, social]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await Promise.all([refreshArchive(), refreshCircle(), refreshThoughts(), refreshWorlds(), refreshProfile(), refreshAsks()]);
      } catch (e) { console.error(e); toast(friendlyError(e)); }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [refreshArchive, refreshCircle, refreshThoughts, refreshWorlds, refreshProfile, refreshAsks]);

  useEffect(() => {
    const pending = new Set();
    let timer;
    const areas = {
      items: ['archive'], collections: ['archive'], connections: ['circle'], world_shares: ['circle'],
      world_share_collections: ['circle'], thoughts: ['thoughts'], worlds: ['worlds'], world_members: ['worlds', 'circle'],
      world_items: ['worlds'], profiles: ['circle', 'profile', 'thoughts', 'asks'], asks: ['asks'], ask_recipients: ['asks'],
    };
    const flush = async () => {
      const todo = [...pending]; pending.clear();
      try {
        await Promise.all(todo.map(a => ({
          archive: refreshArchive, circle: refreshCircle, thoughts: refreshThoughts, worlds: refreshWorlds, profile: refreshProfile, asks: refreshAsks,
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
    const onVisible = () => { if (document.visibilityState === 'visible') { ['archive', 'circle', 'thoughts', 'worlds', 'asks'].forEach(a => pending.add(a)); flush(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { unsubscribe(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [api, refreshArchive, refreshCircle, refreshThoughts, refreshWorlds, refreshProfile, refreshAsks]);

  useEffect(() => writeNotes(notes), [notes]);

  // Signed, short-lived URLs for every photo currently on screen.
  const visiblePhotos = useMemo(() => [
    ...items.map(i => i.image_path),
    ...(friendData?.items || []).map(i => i.image_path),
    ...thoughts.received.map(t => t.item?.image_path || t.item_image_path),
    ...thoughts.sent.map(t => t.item_image_path),
    ...(worldData?.items || []).map(i => i.image_path),
    ...worlds.flatMap(w => [w.cover_path, ...(w.covers || [])]),
    worldData?.world?.cover_path,
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
  const answeredBy = id => thoughts.sent.filter(t => t.ask_id === id);
  const askAnswers = id => thoughts.received.filter(t => t.ask_id === id);
  const asksToAnswer = asks.incoming.filter(a => !answeredBy(a.id).length);
  const attention = incoming.length + unread + worldInvites.length + asksToAnswer.length;
  const collectionId = name => collectionRows.find(c => c.name === name)?.id || null;

  // ---- archive actions (same behaviour as the prototype) -------------------------
  const add = async () => {
    const raw = entry.trim(); if (!raw) return;
    const url = safeUrl(raw);
    const draft = { title: url ? linkLabel(url) : raw.slice(0, 70), url: url || '', note: url ? '' : raw, category: url ? (isVideoLink(url) ? 'Video' : 'Pagine') : 'Appunti', collection: 'Idee', collection_id: collectionId('Idee') };
    const saved = await run(() => api.addItem(draft), 'Salvato nella tua raccolta');
    if (!saved) return;
    setEntry(''); await refreshArchive();
    // Enrich links with the real page title and cover image, in the background.
    if (url) { const done = await enrichLink({ ...draft, id: saved.id, image_path: null }); await refreshArchive(); summarize(done || { ...draft, id: saved.id }, { fresh: true }); }
  };
  // Title, description and cover image from the page. Never overwrites what
  // the person wrote: the title only while it is still the bare hostname,
  // the note only while empty, the photo only while there is none.
  // "In breve": a few key facts and why it may matter, at the top of the note.
  // On a fresh save it replaces the page's own description; on request it is
  // added above what you wrote.
  const digestText = d => [...d.points.map(p => `• ${p}`), d.why ? `\nPerché ti interessa: ${d.why}` : ''].filter(Boolean).join('\n');
  const summarize = async (item, { fresh = false } = {}) => {
    const url = safeUrl(item.url || '');
    if (!url || digesting === item.id) return false;
    setDigesting(item.id);
    try {
      const d = await api.digest({ url, title: item.title, description: (item.note || '').split('\n').filter(l => !/^— |^• |^Perché ti interessa|^Contesto:/.test(l)).join('\n'), interests: collections });
      if (!d?.points?.length) { if (!fresh) toast('Non riesco a riassumere questa pagina.'); return false; }
      // "Perché ti interessa", argued from what morethere knows about you (on this device).
      // "Perché ti interessa" is a judgment: which way the facts point, here and in what you
      // saved on the subject, in the light of its field (from Wikipedia) and your interests.
      const res = explainWhy({ item, points: d.points, kind: d.kind, base: d.base, fallback: d.why,
        me: { items, profile, asks: asks.mine, spaces: worlds, received: thoughts.received } });
      const ctx = res.topic ? await api.context(res.topic).catch(() => null) : null;
      // Earlier saves on the subject, but only of the same kind of theme (Como the club is not Como the town).
      const mineThemes = themesOf([item.title, ...d.points].join(' '), { kind: d.kind, sector: ctx?.sector || '' });
      const before = res.related.filter(o => themesOf(`${o.title} ${ownWords(o.note)}`).some(t => mineThemes.includes(t)))
        .flatMap(o => [o.title, ...(o.note || '').split('\n').filter(l => l.startsWith('• ')).map(l => l.slice(2))]);
      // First why it is yours ("Ti interessa perché segui spesso i temi economici"),
      // then the judgment on the subject, if the facts allow one.
      const reason = interestReason({ text: [item.title, ...d.points].join(' '), kind: d.kind, sector: ctx?.sector || '', items, profile, selfId: item.id });
      // Places (a town, a region) do not have "good or bad moments": no judgment on them.
      const isPlace = /^(comune|citt|capoluogo|frazione|regione|provincia|stato|paese|nazione|capitale|isola|lago|fiume|monte)/i.test(ctx?.description || '');
      const verdict = judge({ subject: isPlace ? '' : res.topic, sector: ctx?.sector || '', kind: d.kind, title: item.title, points: d.points, before, follows: res.count, interest: res.interest, withYou: !reason });
      const dup = res.duplicate ? `L'avevi già salvato il ${fmtDate(res.duplicate.created)}. ` : '';
      d.why = `${dup}${[reason, verdict].filter(Boolean).join(' ') || d.base || d.why}`;
      const byline = (item.note || '').split('\n').filter(l => /^— /.test(l)).join('\n');
      // Asked again: the new summary replaces the old one, what you wrote stays.
      const yours = (item.note || '').split('\n').filter(l => !/^— |^• |^Perché ti interessa|^Contesto:/.test(l)).join('\n').trim();
      const note = fresh ? [digestText(d), byline].filter(Boolean).join('\n\n') : [digestText(d), yours, byline].filter(Boolean).join('\n\n');
      await api.updateItem(item.id, { note: note.slice(0, 10000) });
      setItems(arr => arr.map(i => (i.id === item.id ? { ...i, note } : i)));
      setSelected(sel => (sel?.id === item.id ? { ...sel, note } : sel));
      return true;
    } catch { return false; } finally { setDigesting(null); }
  };
  // One preview per link at a time (saving a link and the background pass could both ask).
  const enrichingIds = useRef(new Set());
  const enrichLink = async (item) => {
    const url = safeUrl(item.url || '');
    if (!url || enrichingIds.current.has(item.id)) return false;
    enrichingIds.current.add(item.id);
    try {
      try { const t = JSON.parse(localStorage.getItem('mt_enriched') || '[]'); if (!t.includes(item.id)) localStorage.setItem('mt_enriched', JSON.stringify([...t, item.id].slice(-500))); } catch { /* ignore */ }
      const p = await api.linkPreview(url);
      if (!p) return false;
      const patch = {};
      const host = new URL(url).hostname.replace(/^www\./, '');
      const placeholder = !item.title || item.title === host || item.title === linkHost(url) || item.title === linkLabel(url);
      if (p.title && placeholder) patch.title = p.title.slice(0, 300);
      // The post's text, then who posted it ("— Adam Glyn su Facebook").
      const by = p.author ? `— ${p.author}${p.site ? ` su ${p.site}` : ''}` : '';
      const note = [p.description, by].filter(Boolean).join('\n\n');
      if (note && !item.note) patch.note = note.slice(0, 1200);
      if (p.image && !item.image_path && api.photosEnabled !== false) {
        const blob = await api.previewImage(p.image);
        if (blob) patch.image_path = await api.uploadPhoto(blob);
      }
      if (!Object.keys(patch).length) return false;
      await api.updateItem(item.id, patch);
      setSelected(sel => (sel?.id === item.id ? { ...sel, ...patch } : sel));
      return { ...item, ...patch };
    } catch { return false; } // previews are best effort
    finally { enrichingIds.current.delete(item.id); }
  };
  useEffect(() => {
    setExtFile(null);
    const url = screen === 'thought' ? photoUrls[selected?.image_path] : null;
    if (!url) return;
    let alive = true;
    // The copy that travels outside carries the morethere mark.
    fetch(url).then(r => r.blob()).then(b => watermark(b).catch(() => b)).then(b => alive && setExtFile(new File([b], 'morethere.jpg', { type: b.type || 'image/jpeg' }))).catch(() => {});
    return () => { alive = false; };
  }, [screen, selected?.image_path, photoUrls]);

  // Something shared to morethere from another app (Instagram, browser, photos…).
  const handledShare = useRef(false);
  useEffect(() => {
    if (!loaded || !pendingShare || handledShare.current) return;
    handledShare.current = true;
    const s = pendingShare; onShareHandled?.();
    (async () => {
      let file = null;
      if (s.media && 'caches' in window) {
        try {
          const cache = await caches.open('mt-share');
          const r = await cache.match('/__shared-media');
          if (r) { const b = await r.blob(); file = new File([b], 'condiviso.jpg', { type: b.type || 'image/jpeg' }); await cache.delete('/__shared-media'); }
        } catch { /* no shared file */ }
      }
      const all = [s.url, s.text, s.title].filter(Boolean).join(' ');
      const url = safeUrl((all.match(/https?:\/\/[^\s<>"']+/) || [])[0] || '');
      const words = [s.title, s.text].filter(Boolean).join('\n').replace(/https?:\/\/[^\s<>"']+/g, '').replace(/\s+\n/g, '\n').trim();
      await run(async () => {
        let draft;
        if (file) {
          const taken = (await photoTakenDate(file)) || todayIso();
          const image_path = await api.uploadPhoto(file);
          draft = { title: (s.title || words.split('\n')[0] || `Foto del ${fmtMemory(taken)}`).slice(0, 300), url: url || '', note: s.title ? words : '', category: 'Foto', image_path, memory_date: taken };
        } else if (url) {
          draft = { title: linkLabel(url), url, note: words.slice(0, 10000), category: isVideoLink(url) ? 'Video' : 'Pagine' };
        } else if (words) {
          draft = { title: words.slice(0, 70), url: '', note: words.slice(0, 10000), category: 'Appunti' };
        } else return;
        const saved = await api.addItem({ ...draft, collection: 'Idee', collection_id: collectionId('Idee') });
        let item = { ...draft, id: saved.id, collection: 'Idee', collection_id: collectionId('Idee'), created: Date.now(), image_path: draft.image_path || null };
        // Saved and shown at once; the cover, title and "In breve" follow in the background.
        if (url && !file) enrichLink({ ...item, note: '' }).then(done => { refreshArchive(); summarize(done || item, { fresh: !item.note }); });
        await refreshArchive();
        setSelected(sel => (sel?.id === item.id ? sel : item));
        setScreen('detail');
      }, 'Salvato nella tua raccolta');
    })();
  }, [loaded, pendingShare]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Dynamic filters: the themes and sources your discoveries actually have, worked out
  // from what each one says (not morethere's own lines), plus your collections.
  const facets = useMemo(() => new Map(items.map(i => [i.id, { themes: themesOf(`${i.title} ${ownWords(i.note)}`, { kind: '' }), source: sourceOf(i)?.id || '' }])), [items]);
  const matches = (i, f) => {
    if (f === 'Tutti') return true;
    if (f.startsWith('tema:')) return facets.get(i.id)?.themes.includes(f.slice(5));
    if (f.startsWith('fonte:')) return facets.get(i.id)?.source === f.slice(6);
    return i.collection === f;
  };
  const filtered = useMemo(() => items.filter(i => matches(i, filter) && [i.title, i.note, i.url].join(' ').toLowerCase().includes(search.toLowerCase())), [items, filter, search, facets]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Per data": by the date of the memory (or when it was saved), grouped by month.
  const posOf = i => i.position ?? -i.created;
  // Mouse: drag after a few pixels. Touch: long press, so scrolling still works.
  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const whenOf = i => i.memory_date || new Date(i.created).toISOString().slice(0, 10);
  const sorted = useMemo(() => (view === 'date' ? [...filtered].sort((a, b) => whenOf(b).localeCompare(whenOf(a)) || b.created - a.created) : [...filtered].sort((a, b) => posOf(a) - posOf(b))), [filtered, view]); // eslint-disable-line react-hooks/exhaustive-deps
  // Drag and drop: the moved discovery lands halfway between its new neighbours.
  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = sorted.findIndex(i => i.id === active.id), to = sorted.findIndex(i => i.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(sorted, from, to);
    const prev = moved[to - 1], next = moved[to + 1];
    const position = prev && next ? (posOf(prev) + posOf(next)) / 2 : prev ? posOf(prev) + 1000 : posOf(next) - 1000;
    const before = items;
    setItems(v => v.map(i => (i.id === active.id ? { ...i, position } : i)));
    try { await api.moveItem(active.id, position); } catch (e) { setItems(before); toast(e?.message === 'order-unsupported' ? 'Spostamento non ancora disponibile' : friendlyError(e)); }
  };
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
  const count = (list, key) => list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const themeCounts = [...count([...facets.values()].flatMap(f => f.themes)).entries()].sort((a, b) => b[1] - a[1]);
  const sourceCounts = [...count([...facets.values()].map(f => f.source).filter(Boolean)).entries()].sort((a, b) => b[1] - a[1]);
  const SOURCE_LABEL = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest', photo: 'Foto', note: 'Note' };
  const chips = [
    { key: 'Tutti', label: 'Tutti' },
    ...themeCounts.map(([id, n]) => ({ key: `tema:${id}`, label: themeLabel(id), n, aria: `Tema: ${themeLabel(id)}` })),
    ...sourceCounts.map(([id, n]) => ({ key: `fonte:${id}`, label: SOURCE_LABEL[id] || id, n, aria: `Fonte: ${SOURCE_LABEL[id] || id}`, source: true })),
    ...collections.map(c => ({ key: c, label: c, collection: true })),
  ];
  // A filter that no longer applies (its last discovery was removed) falls back to all.
  useEffect(() => { if (/^(tema|fonte):/.test(filter) && loaded && !chips.some(c => c.key === filter)) setFilter('Tutti'); }, [filter, chips.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const startAI = () => { setAiMode('all'); setAiCols([]); setAiQuery(''); setAiPicked([]); setAiSkip([]); setAiAsk(''); setScreen('ai'); };
  const foldText = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const aiFound = useMemo(() => {
    const words = foldText(aiQuery).split(/[\s,]+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter(i => { const t = foldText([i.title, i.note, i.url, i.collection, i.category].join(' ')); return words.every(w => t.includes(w)); });
  }, [items, aiQuery]); // eslint-disable-line react-hooks/exhaustive-deps
  const aiItems = aiMode === 'all' ? items
    : aiMode === 'collection' ? items.filter(i => aiCols.includes(i.collection))
    : aiMode === 'search' ? aiFound.filter(i => !aiSkip.includes(i.id))
    : items.filter(i => aiPicked.includes(i.id));
  const aiScope = aiMode === 'all' ? 'my whole collection' : aiMode === 'collection' ? `collections ${aiCols.map(c => `"${c}"`).join(', ')}` : aiMode === 'search' ? `everything about "${aiQuery.trim()}"` : 'discoveries I chose';
  const copyForAI = () => (aiItems.length ? deliverAI(buildAIContext(aiItems, { scope: aiScope, request: aiAsk.trim() })) : toast('Scegli almeno una scoperta.'));
  const exportShared = async (rows, heading, source) => {
    if (!rows?.length) return toast('Nessun contenuto disponibile per l\'AI.');
    return deliverAI(buildAIContext(fromExportRows(rows), { heading, source }));
  };

  // ---- thought of you ---------------------------------------------------------
  const startMoreForYou = ({ item = null, personId = '' } = {}) => {
    setSelected(item); setMessage(''); setRecipient(''); setForSearch('');
    setRecipientId(personId || accepted[0]?.other.id || ''); setThoughtAi(false); setThoughtSave(false);
    setForStep(item ? 2 : 1); setForDone(false); setScreen('thought');
  };
  const share = (item) => startMoreForYou({ item });
  const sendThought = async () => {
    if (!selected) return;
    if (social && recipientId && recipientId !== '__external') {
      const ok = await run(() => api.sendThought({ recipientId, itemId: selected.id, message: message.trim(), allowAi: thoughtAi, allowSave: thoughtSave }));
      if (ok) { await refreshThoughts(); setForDone(true); }
      return;
    }
    return shareOut();
  };
  // Outside morethere: hand it to the phone's share sheet (WhatsApp, Instagram, Mail…).
  // Called directly from the tap, so the phone allows the share sheet to open.
  const shareOut = async () => {
    if (!selected) return toast('Scegli prima un ricordo');
    const text = [message.trim(), selected.title, selected.url || selected.note, '— da morethere'].filter(Boolean).join('\n\n');
    const data = { title: selected.title, text };
    if (extFile && navigator.canShare?.({ files: [extFile] })) data.files = [extFile];
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(text); toast('Testo copiato: incollalo nell\'app che preferisci'); }
    } catch (e) {
      if (e?.name === 'AbortError') return; // closed the share sheet: stay here
      try { await navigator.clipboard.writeText(text); toast('Testo copiato: incollalo nell\'app che preferisci'); } catch { return toast('Condivisione non riuscita'); }
    }
    setNotes(v => [{ id: crypto.randomUUID(), recipient: recipient.trim() || 'Fuori da morethere', message: message.trim(), item: { title: selected.title, url: selected.url, note: selected.note }, created: Date.now() }, ...v]);
    setForDone('out');
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
  // ---- Chiedi consigli ----------------------------------------------------------
  const startAsk = (personIds = []) => { setAskStep(1); setAskDone(null); setAskTitle(''); setAskNote(''); setAskPlace(''); setAskPeople(personIds); setScreen('askNew'); };
  // "Sono qui": read the position once and write the city; only the name is kept.
  const locateMe = async () => {
    setHereBusy(true);
    try {
      const w = await api.whereAmI();
      setAskPlace(w.place);
      setAskTitle(t => (!t.trim() || /^A .+, adesso$/.test(t) ? `A ${w.place}, adesso` : t));
    } catch (e) { toast(friendlyError(e)); } finally { setHereBusy(false); }
  };
  const sendAsk = async () => {
    const id = await run(() => api.createAsk({ title: askTitle.trim(), note: askNote.trim(), recipientIds: askPeople, place: askPlace }));
    if (id) { setAskDone(id); refreshAsks(); }
  };
  const openAsk = a => { setOpenAskId(a.id); setScreen('ask'); };
  const startAnswer = a => { setAnswering(a); setAnsStep(1); setAnsItems([]); setAnsSave(true); setAnsAi(false); setAnsMsg(''); setAnsDone(0); setAnsSearch(''); setScreen('answer'); };
  const sendAnswer = async () => {
    const n = await run(() => api.answerAsk({ askId: answering.id, itemIds: ansItems, message: ansMsg.trim(), allowSave: ansSave, allowAi: ansAi }));
    if (n) { setAnsDone(n); refreshThoughts(); }
  };
  const startMoreOfUs = (memberIds = []) => { setSpaceMembers(memberIds); setWorldName(''); setUsStep(memberIds.length ? 2 : 1); setUsCreating(memberIds.length > 0 || !worlds.length); setScreen('worlds'); };
  const openWorld = (w) => { setSelected(w); setWorldData(null); setSpaceTab('items'); setSpaceFilter('all'); setShowSpaceAdd(false); setSpaceItem(null); setScreen('world'); };
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
    await run(() => api.revokeShare(granteeId), 'Tolto dalla tua raccolta');
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
  const coverInput = useRef();
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
  const draftFromProfile = p => ({ display_name: p?.display_name || '', handle: p?.handle || '', subtitle: p?.subtitle || '', loaded: Boolean(p) });
  const openProfile = () => { setProfileDraft(draftFromProfile(profile)); setScreen('profile'); };
  // Profile opened before it finished loading: fill the form once it arrives, keeping anything typed.
  useEffect(() => {
    if (!profile || !profileDraft || profileDraft.loaded) return;
    setProfileDraft(d => { const f = draftFromProfile(profile); return { display_name: d.display_name || f.display_name, handle: d.handle || f.handle, subtitle: d.subtitle || f.subtitle, loaded: true }; });
  }, [profile, profileDraft]);
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

  const renderCard = (i, d) => (<article className={'item' + (d?.dragging ? ' dragging' : '')} key={i.id} ref={d?.ref} style={d?.style} {...(d?.props || {})}><button className={'preview' + (photoUrls[i.image_path] ? ' hasphoto' : '')} aria-label={`Apri ${i.title}`} onClick={() => { setSelected(i); setEdit(null); setScreen('detail'); }}>{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : <span>{i.image_path ? <Camera size={26} /> : i.url ? <Link2 size={26} /> : <PenLine size={26} />}</span>}</button><div className="itembody"><div className="eyebrow">{i.category}{i.memory_date ? <> · {fmtMemory(i.memory_date, true)}</> : null}</div><button className="itemtitle" onClick={() => { setSelected(i); setEdit(null); setScreen('detail'); }}>{i.title}</button><div className="itemactions"><button className="mfy" onClick={() => share(i)} aria-label={`More for you: apri ${i.title} a un amico`}><MoreForYouIcon size={16} /></button><button onClick={() => exportAI([i])} aria-label="Usa con AI"><Sparkles size={17} /></button><button onClick={() => { if (window.confirm(`Eliminare "${i.title}"?`)) removeItem(i); }} aria-label="Elimina"><Trash2 size={17} /></button></div></div></article>);
  const pendingInvites = circle.invitations.filter(i => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now());
  const initial = p => (nameOf(p)[0] || '?').toUpperCase();
  // A person's face: their profile photo if they have one, else their initial.
  const face = p => (photoUrls[p?.avatar_path] ? <img className="faceImg" src={photoUrls[p.avatar_path]} alt="" loading="lazy" /> : initial(p));
  // Tap a profile photo to see it large.
  const enlargeable = p => Boolean(photoUrls[p?.avatar_path]);
  const enlarge = p => enlargeable(p) && setBigFace({ url: photoUrls[p.avatar_path], name: nameOf(p) });
  // Pick people by tapping their avatar. `single`: exactly one; otherwise toggles.
  const peoplePicker = (selectedIds, onPick, { external = false, add = true } = {}) => (
    <div className="pickRow" role="group" aria-label="Persone">
      {accepted.map(c => { const on = selectedIds.includes(c.other.id); return <button key={c.other.id} type="button" className={'pick' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onPick(c.other.id)}><span className="av" aria-hidden="true">{face(c.other)}{on && <span className="avCheck"><Check size={13} /></span>}</span><span className="pn">{nameOf(c.other)}</span></button>; })}
      {external && <button type="button" className={'pick' + (selectedIds.includes('__external') ? ' on' : '')} aria-pressed={selectedIds.includes('__external')} onClick={() => onPick('__external')}><span className="av" aria-hidden="true"><Share size={17} /></span><span className="pn">Fuori app</span></button>}
      {add && <button type="button" className="pick add" onClick={() => setShowAddPerson(true)}><span className="av" aria-hidden="true"><Plus size={20} /></span><span className="pn">Aggiungi</span></button>}
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
  const spaceRow = w => { const others = w.others.filter(m => m.status === 'active'); const waiting = w.others.filter(m => m.status === 'invited'); return <button key={w.id} className="spaceCard" onClick={() => openWorld(w)}>{cover(w.cover_path ? [w.cover_path] : w.covers)}<span className="scBody"><strong>{w.name}</strong><small>{others.length ? 'Con ' + others.map(m => nameOf(m.profile)).join(', ') : 'Solo tu, per ora'}{waiting.length ? ` · ${waiting.length} ${waiting.length === 1 ? 'invito' : 'inviti'} in attesa` : ''}</small><span className="scMeta">{memberStack([profile, ...others.map(m => m.profile)].filter(Boolean))}<span>{w.count} {w.count === 1 ? 'scoperta' : 'scoperte'}</span></span></span><ChevronRight size={18} /></button>; };
  const title = { home: 'morethere', circle: 'Your Circle', friend: firstName(friend), worlds: 'More of us', world: 'Spazio condiviso', thought: 'More for you', detail: 'La tua scoperta', settings: 'More of me', export: 'Use with AI', profile: 'Il mio profilo', askNew: 'Chiedi consigli', answer: 'Consiglia', ask: 'I tuoi consigli', ai: 'Use with AI' }[screen] || 'morethere';
  const signInHint = <p className="hint">Questa versione funziona solo su questo dispositivo. Configura il backend Supabase e accedi per connetterti alle persone di cui ti fidi.</p>;

  // A memory a friend opened to you (also used for answers to your requests).
  const receivedCard = (t, { grouped = false, compact = false } = {}) => { const it = t.item; const img = photoUrls[it?.image_path || t.item_image_path]; const url = it ? it.url : t.item_url; return <div className={'note' + (t.read_at ? '' : ' unread')} key={t.id}>{!grouped && <><strong>Da {nameOf(t.sender)}</strong>{t.message && <p>{t.message}</p>}</>}{it ? <>{img && <Photo className="notephoto" url={img} alt={it.title} />}<span className="openedTitle">{it.title}</span>{!compact && it.note && <small className="openedNote">{it.note.slice(0, 160)}</small>}</> : <small>{t.item_title} · non è più disponibile</small>}
          {it && <div className="noteactions">{safeUrl(url || '') && <a className="textlink" href={url} target="_blank" rel="noopener noreferrer" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Apri <ExternalLink size={12} /></a>}{t.allow_save && <button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveThought(t), 'Salvato nel tuo archivio'); if (r) { refreshArchive(); refreshThoughts(); } }}>+ Salva nel mio archivio</button>}{!t.read_at && <button className="textlink" onClick={() => api.markThoughtRead(t.id).then(refreshThoughts).catch(() => {})}>Segna come visto</button>}{t.allow_ai_export && <button className="textlink" onClick={() => exportShared([{ title: it.title, url: it.url, note: t.message ? `${it.note}\nDedication: ${t.message}` : it.note, category: it.category, collection: 'More for you', added_by_name: nameOf(t.sender) }], 'MORETHERE — SHARED CONTEXT', nameOf(t.sender))}>Use with AI</button>}</div>}</div>; };
  // Opening your request marks its answers as seen.
  useEffect(() => {
    if (screen !== 'ask' || !openAskId) return;
    const unseen = thoughts.received.filter(t => t.ask_id === openAskId && !t.read_at);
    if (unseen.length) Promise.all(unseen.map(t => api.markThoughtRead(t.id))).then(refreshThoughts).catch(() => {});
  }, [screen, openAskId, thoughts.received, api, refreshThoughts]);

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

  return <div className="app"><header><div><button className="brand" aria-label={screen === 'home' ? 'morethere' : `Indietro · ${title}`} onClick={screen === 'home' ? back : goBack}>{screen === 'home' ? 'morethere' : <><ArrowLeft size={19} /><span className="brandText">{title}</span></>}</button>{screen === 'home' && <div className="subtitle">{loaded ? <>{items.length} {items.length === 1 ? 'scoperta' : 'scoperte'}</> : 'Sincronizzazione…'}</div>}</div>{screen === 'home' ? <div className="headActions"><button className="round" aria-label={attention ? `Apri Your Circle, ${attention} novità` : 'Apri Your Circle'} onClick={() => setScreen('circle')}><UsersRound size={22} />{attention > 0 && <span className="badge">{attention}</span>}</button>{social && <button className="round me" aria-label="Il mio profilo" onClick={openProfile}>{profile ? face(profile) : <UserRound size={22} />}</button>}</div> : <button className="pill dark" onClick={back}>CHIUDI</button>}</header>

    {screen === 'home' && <main>
      {legacy && <div className="panel"><strong>Hai {legacy.items.length} {legacy.items.length === 1 ? 'scoperta salvata' : 'scoperte salvate'} su questo dispositivo</strong><small>Vuoi portarle nel tuo account privato? Resteranno visibili solo a te. Dopo l'importazione verranno rimosse da questo dispositivo.</small><div className="choices"><button className="chosen" disabled={busy} onClick={importLegacy}>Importa</button><button onClick={() => setLegacy(null)}>Non ora</button></div></div>}
      <div className="eyebrow">NUOVO INGRESSO</div><div className="entry"><input value={entry} onChange={e => setEntry(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Incolla un link o scrivi..." /><button className="square" title={entry ? 'Salva una nota o un link' : 'Aggiungi una foto'} aria-label={entry ? 'Salva' : 'Aggiungi una foto'} disabled={busy} onClick={() => (entry ? add() : pickPhoto())}>{entry ? <Plus /> : <Camera />}</button><input ref={fileInput} type="file" accept="image/*" hidden aria-hidden="true" onChange={onPhotoChosen} /></div><div className="search"><Search size={21} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nell'archivio..." /></div><div className="chips">{chips.map((c, k) => <React.Fragment key={c.key}>{k > 0 && chips[k - 1].collection !== c.collection && c.collection && <span className="chipSep" aria-hidden="true" />}{k > 0 && !chips[k - 1].source && c.source && <span className="chipSep" aria-hidden="true" />}<button className={'chip ' + (filter === c.key ? 'active' : '') + (c.collection ? ' collection' : '')} aria-label={c.aria} aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>{c.label}{c.n ? <span className="chipN" aria-hidden="true">{c.n}</span> : null}</button></React.Fragment>)}<button className="chip" aria-label="Nuova raccolta" onClick={() => setShowAddCollection(true)}><Plus size={15} /></button></div>{activeCollection && <div className="collectionTools"><button className="textlink" onClick={() => setCollectionDialog({ id: activeCollection.id, name: activeCollection.name })}><Pencil size={13} /> Rinomina</button><button className="textlink danger" onClick={deleteCollection}><Trash2 size={13} /> Elimina raccolta</button></div>}<div className="sectionRow"><div className="sectionLabel">{activeCollection ? activeCollection.name : 'La tua raccolta'}</div><div className="viewToggle" role="group" aria-label="Ordina"><button className={view === 'recent' ? 'on' : ''} aria-pressed={view === 'recent'} onClick={() => chooseView('recent')}>Recenti</button><button className={view === 'date' ? 'on' : ''} aria-pressed={view === 'date'} onClick={() => chooseView('date')}>Per data</button></div></div>{view === 'date' ? byMonth.map(g => <section key={g.key} className="monthGroup"><h3 className="monthLabel">{g.label}</h3><div className="cards">{g.items.map(renderCard)}</div></section>) : <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={sorted.map(i => i.id)} strategy={rectSortingStrategy}><div className="cards">{sorted.map(i => <Sortable key={i.id} id={i.id}>{d => renderCard(i, d)}</Sortable>)}</div></SortableContext></DndContext>}{view === 'recent' && sorted.length > 1 && <p className="hint dragHint">Tieni premuta una scoperta e trascinala per cambiare l'ordine.</p>}{loaded && !filtered.length && <div className="empty">Il tuo mondo comincia da una scoperta. Salva qualcosa che vale la pena ricordare.</div>}</main>}

    {screen === 'circle' && <main className="circlePage">
      {!social && signInHint}
      {social && incoming.length > 0 && <section className="block first">{incoming.map(c => <div key={c.id} className="requestCard"><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rq"><strong>{nameOf(c.other)} vuole aggiungerti</strong><small>@{c.other.handle}</small></span><button className="pill light small" disabled={busy} onClick={() => respond(c.id, true)}>Accetta</button><button className="iconbtn onDark" aria-label="Rifiuta" disabled={busy} onClick={() => respond(c.id, false)}><X size={18} /></button></div>)}</section>}
      <section className={'block' + (social && incoming.length ? '' : ' first')}><div className="ix">
        <button className="ixr" onClick={() => startMoreOfMe()}><span className="ixi" aria-hidden="true"><MoreOfMeIcon /></span><span className="ixb"><span className="ixt">More <b>of me.</b></span><span className="ixs">Aggiungi un amico</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
        <button className="ixr" onClick={() => startAsk()}><span className="ixi" aria-hidden="true"><AskIcon /></span><span className="ixb"><span className="ixt">Chiedi <b>consigli.</b></span><span className="ixs">I posti dei tuoi amici</span></span>{asksToAnswer.length > 0 && <span className="ixbadge" aria-label={`${asksToAnswer.length} da rispondere`}>{asksToAnswer.length}</span>}<span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
        <button className="ixr us" onClick={() => startMoreOfUs()}><span className="ixi" aria-hidden="true"><MoreOfUsIcon /></span><span className="ixb"><span className="ixt">More <b>of us.</b></span><span className="ixs">{activeSpaces.length ? `${activeSpaces.length} ${activeSpaces.length === 1 ? 'spazio condiviso' : 'spazi condivisi'}` : 'Spazi condivisi'}</span></span>{worldInvites.length > 0 && <span className="ixbadge" aria-label={`${worldInvites.length} inviti`}>{worldInvites.length}</span>}<span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
      </div></section>
      {social && asks.incoming.length > 0 && <section className="block"><div className="blockHead"><h2>Ti chiedono un consiglio</h2></div>{asks.incoming.map(a => { const given = answeredBy(a.id).length; return <div key={a.id} className="askCard"><span className="av" aria-hidden="true">{face(a.owner)}</span><span className="askBody"><small>{a.place ? <><MapPin size={12} className="inline" /> {firstName(a.owner)} è a {a.place}</> : `${firstName(a.owner)} chiede`}</small><strong>{a.title}</strong>{given > 0 && <small className="askGiven"><Check size={12} className="inline" /> {given} {given === 1 ? 'consiglio mandato' : 'consigli mandati'}</small>}</span><button className={'pill small ' + (given ? 'outline' : 'dark')} onClick={() => startAnswer(a)}>{given ? 'Ancora' : 'Consiglia'}</button></div>; })}</section>}
      {social && asks.mine.length > 0 && <section className="block"><div className="blockHead"><h2>Le tue richieste</h2></div><div className="ix">{asks.mine.map(a => { const got = askAnswers(a.id); const fresh = got.filter(t => !t.read_at).length; const people = new Set(got.map(t => t.sender_id)).size; return <button key={a.id} className="ixr askRow" onClick={() => openAsk(a)}><span className="ixi" aria-hidden="true"><AskIcon size={20} /></span><span className="ixb"><span className="ixt small">{a.title}</span><span className="ixs">{got.length ? `${got.length} ${got.length === 1 ? 'consiglio' : 'consigli'}` : 'In attesa'}{fresh ? ` · ${fresh} ${fresh === 1 ? 'nuovo' : 'nuovi'}` : ''}</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>; })}</div></section>}
      {social && <section className="block"><div className="blockHead"><h2>I tuoi amici</h2>{accepted.length > 0 && <span className="count">{accepted.length}</span>}</div>
        {accepted.length || outgoing.length ? <><div className="peopleRail">
          {accepted.map(c => { const sh = circle.sharesIn.some(x => x.owner_id === c.other.id); return <button key={c.id} className={'railItem' + (sh ? ' shares' : '')} aria-label={`${nameOf(c.other)}${sh ? ', condivide qualcosa con te' : ''}`} onClick={() => openFriend(c.other)}><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rn">{nameOf(c.other)}</span></button>; })}
          {outgoing.map(c => <button key={c.id} className="railItem pending" aria-label={`${nameOf(c.other)}, richiesta in attesa`} onClick={async () => { if (!window.confirm(`Annullare la richiesta a ${nameOf(c.other)}?`)) return; await run(() => api.removeConnection(c.other.id), 'Richiesta annullata'); refreshCircle(); }}><span className="av" aria-hidden="true">{face(c.other)}</span><span className="rn">In attesa</span></button>)}
        </div></>
          : <div className="empty compact">Ancora nessun amico.</div>}
        {thoughts.received.some(t => !t.ask_id) && <><h3 className="subHead">Ricordi aperti per te</h3>{thoughts.received.filter(t => !t.ask_id).map(t => receivedCard(t, { compact: true }))}</>}
      </section>}
      {(thoughts.sent.length > 0 || notes.length > 0) && <section className="block"><button className="sentToggle" aria-expanded={showSent} onClick={() => setShowSent(v => !v)}><span>Ricordi che hai aperto</span><span className="count">{thoughts.sent.length + notes.length}</span><ChevronRight size={18} className={showSent ? 'turned' : ''} /></button>{showSent && <div>{thoughts.sent.map(n => <div className="note" key={n.id}><strong>A {nameOf(n.recipient)}</strong><span className="openedTitle">{n.item?.title || n.item_title}</span><small>{n.allow_save ? 'Può guardare e salvare' : 'Può solo guardare'}{n.allow_ai_export ? ' · AI' : ''} · {n.read_at ? 'Visto' : 'Non ancora visto'} · {fmtDate(n.created_at)}</small>{n.message && <p className="dedication">“{n.message}”</p>}<div className="noteactions"><button className="textlink" onClick={async () => { if (!window.confirm(`Togliere a ${nameOf(n.recipient)} l'accesso a questo ricordo?`)) return; await run(() => api.deleteThought(n.id), 'Accesso tolto'); refreshThoughts(); }}>Togli</button></div></div>)}{notes.map(n => <div className="note" key={n.id}><strong>A {n.recipient}</strong><span className="openedTitle">{n.item?.title}</span><small>Condiviso fuori da morethere, con un messaggio</small></div>)}</div>}</section>}
      </main>}

    {screen === 'friend' && friend && <main><div className="personHero">{enlargeable(friend) ? <button className="faceBtn" aria-label={`Ingrandisci la foto di ${nameOf(friend)}`} onClick={() => enlarge(friend)}><span className="av big" aria-hidden="true">{face(friend)}</span></button> : <span className="av big" aria-hidden="true">{face(friend)}</span>}<div><h1>{nameOf(friend)}</h1><p className="muted">@{friend.handle}{friend.subtitle ? ` · ${friend.subtitle}` : ''}</p></div></div>
      {(() => { const mine = circle.sharesOut.find(x => x.grantee_id === friend.id); const sp = spacesWith(friend.id); return <>
        <div className="ix">
          <button className="ixr" onClick={() => startMoreOfMe(friend.id)}><span className="ixi" aria-hidden="true"><MoreOfMeIcon /></span><span className="ixb"><span className="ixt">More <b>of me.</b></span><span className="ixs">{mine ? (mine.scope === 'all' ? `${nameOf(friend)} è nella tua raccolta e vede tutto` : `${nameOf(friend)} è nella tua raccolta e vede ${mine.collection_ids.length} ${mine.collection_ids.length === 1 ? 'raccolta' : 'raccolte'}`) : `Aggiungi ${nameOf(friend)} alla tua raccolta`}</span></span><span className="ixgo" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.5} /></span></button>
          <button className="ixr us" onClick={() => startMoreOfUs([friend.id])}><span className="ixi" aria-hidden="true"><MoreOfUsIcon /></span><span className="ixb"><span className="ixt">More <b>of us.</b></span><span className="ixs">Crea un nuovo spazio con {nameOf(friend)}</span></span><span className="ixgo" aria-hidden="true"><Plus size={17} strokeWidth={1.5} /></span></button>
        </div>
        <section className="block"><div className="blockHead"><h2>I vostri spazi</h2>{sp.length > 0 && <span className="count">{sp.length}</span>}</div>{sp.length ? <div className="stack">{sp.map(spaceRow)}</div> : <div className="empty compact">Nessuno spazio insieme, per ora. Creane uno con <strong>More of us.</strong></div>}</section></>; })()}
      <section className="block"><h2>Cosa condivide con te</h2>
      {!friendData ? <div className="empty compact">Caricamento…</div> : !friendShare ? <div className="empty compact">{nameOf(friend)} non condivide ancora nulla con te.</div> : <>
        <div className="cards">{friendGroups.map(c => { const cover = photoUrls[c.items.find(i => i.image_path && photoUrls[i.image_path])?.image_path]; return <article className="item" key={c.id}><div className={'preview' + (cover ? ' hasphoto' : '')}>{cover ? <Photo url={cover} /> : <span><FolderHeart size={26} /></span>}</div><div className="itembody"><div className="eyebrow">COLLECTION</div><strong>{c.name}</strong><small>{c.items.length} {c.items.length === 1 ? 'elemento' : 'elementi'}</small>{c.items.map(i => <div key={i.id} className="shared">{photoUrls[i.image_path] && <Photo className="thumb" url={photoUrls[i.image_path]} alt={i.title} />}{friendShare.can_save ? <button className="textlink" disabled={busy} onClick={async () => { const r = await run(() => api.saveSharedItem(i, collectionId('Idee')), 'Salvato nel tuo archivio'); if (r) refreshArchive(); }}>+ Save {i.title}</button> : (safeUrl(i.url) ? <a className="textlink" href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : <span className="textlink">{i.title}</span>)}</div>)}</div></article>; })}</div>
        {!friendGroups.length && <div className="empty compact">Nessun elemento condiviso per ora.</div>}
        {friendShare.allow_ai_export && <button className="pill dark wide" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportShared(friend.id)), 'MORETHERE — SHARED CONTEXT', nameOf(friend))}><Sparkles size={18} /> Use with AI</button>}
        <p className="hint"><ShieldCheck size={13} className="inline" /> {friendShare.can_save ? 'Lettura e copia' : 'Solo lettura'} · {friendShare.allow_ai_export ? 'Uso con AI consentito' : 'Uso con AI non consentito'}. {nameOf(friend)} può modificare o revocare questo accesso in qualsiasi momento.</p></>}</section>
      <button className="textlink danger" onClick={async () => { if (!window.confirm(`Rimuovere ${nameOf(friend)} dal tuo Circle? Gli accessi tra voi verranno revocati.`)) return; await run(() => api.removeConnection(friend.id), 'Connessione rimossa'); await refreshCircle(); setScreen('circle', { replace: true }); }}>Rimuovi dal mio Circle</button></main>}

    {screen === 'worlds' && <main>
      {!social && signInHint}
      {social && (usCreating ? <>
        {usStep === 1 && wizard({ n: 1, total: 2, question: 'Con chi?', hint: 'Puoi scegliere più persone, oppure nessuna e invitarle dopo.', onBack: activeSpaces.length ? () => setUsCreating(false) : undefined, onNext: () => setUsStep(2), children: peoplePicker(spaceMembers, id => setSpaceMembers(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]))) })}
        {usStep === 2 && wizard({ n: 2, total: 2, question: 'Come lo chiamate?', hint: spaceMembers.length ? `Con ${accepted.filter(c => spaceMembers.includes(c.other.id)).map(c => nameOf(c.other)).join(', ')}. Riceveranno un invito.` : 'Per ora solo tu: potrai invitare qualcuno quando vuoi.', canNext: !!worldName.trim(), onBack: () => setUsStep(1), onNext: createWorld, nextLabel: 'Crea lo spazio', children: <>
          <input id="wname" aria-label="COME LO CHIAMIAMO?" placeholder="Il nostro prossimo viaggio, Posti da provare…" value={worldName} onChange={e => setWorldName(e.target.value)} />
          <div className="chips wrap suggest">{['Viaggi insieme', 'Ristoranti da provare', 'Libri da leggere', 'Idee regalo', 'Casa'].map(x => <button key={x} type="button" className={'chip ' + (worldName === x ? 'active' : '')} onClick={() => setWorldName(x)}>{x}</button>)}</div></> })}
      </> : <>
        <p className="muted">Le nostre scoperte, i nostri gusti, le cose che ci uniscono.</p>
        <button className="pill dark wide newSpace" onClick={() => { setSpaceMembers([]); setWorldName(''); setUsStep(1); setUsCreating(true); }}><Plus size={18} /> Nuovo spazio</button>
      </>)}
      {!usCreating && <>{worldInvites.length > 0 && <><h2>Ti hanno invitato</h2><div className="people">{worldInvites.map(w => <div key={w.id} className="person"><div className="avatar"><FolderHeart size={20} /></div><span><strong>{w.name}</strong><small>Da {nameOf(w.owner)}</small></span><button className="pill dark small" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, true), 'Benvenuto nel vostro spazio'); refreshWorlds(); }}>Entra</button><button className="iconbtn" aria-label="Rifiuta" disabled={busy} onClick={async () => { await run(() => api.respondWorldInvite(w.id, false)); refreshWorlds(); }}><X size={18} /></button></div>)}</div></>}
      <div className="blockHead"><h2>I vostri spazi</h2>{activeSpaces.length > 0 && <span className="count">{activeSpaces.length}</span>}</div>{activeSpaces.length ? <div className="stack">{activeSpaces.map(spaceRow)}</div> : <div className="empty compact">Ancora nessuno spazio. Create un posto per le cose che volete fare, vedere e ricordare insieme.</div>}</>}</main>}

    {screen === 'world' && selected && <main className="spacePage">
      {!worldData ? <div className="empty compact">Caricamento…</div> : (() => {
        const active = worldData.members.filter(m => m.status === 'active');
        const others = active.filter(m => m.user_id !== api.me);
        const invited = worldData.members.filter(m => m.status === 'invited');
        const custom = worldData.world.cover_path && photoUrls[worldData.world.cover_path] ? [worldData.world.cover_path] : null;
        const heroPaths = custom || worldData.items.map(i => i.image_path).filter(x => photoUrls[x]).slice(0, 4);
        const eligible = accepted.filter(c => !memberIds.has(c.other.id));
        const q = spaceSearch.trim().toLowerCase();
        const pickable = items.filter(i => !q || [i.title, i.note, i.url].join(' ').toLowerCase().includes(q));
        return <>
          <div className={'spaceHero' + (heroPaths.length ? ' withPhotos' : '')}>
            {heroPaths.length > 0 && cover(heroPaths, 'heroMosaic')}
            {myMembership?.status === 'active' && <div className="coverTools"><button className="coverBtn" disabled={busy} aria-label={worldData.world.cover_path ? 'Cambia copertina' : 'Aggiungi una copertina'} onClick={() => coverInput.current?.click()}><Camera size={16} /><span>{worldData.world.cover_path ? 'Cambia copertina' : 'Copertina'}</span></button>{worldData.world.cover_path && <button className="coverBtn iconOnly" disabled={busy} aria-label="Togli la copertina" onClick={async () => { if (!window.confirm('Togliere la copertina? Tornerà il mosaico con le foto dello spazio.')) return; const ok = await run(() => api.removeWorldCover(selected.id, worldData.world.cover_path), 'Copertina tolta'); if (ok !== undefined) { reloadWorld(selected.id); refreshWorlds(); } }}><X size={16} /></button>}<input ref={coverInput} type="file" accept="image/*" hidden aria-hidden="true" data-testid="cover-input" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const ok = await run(() => api.setWorldCover(selected.id, file, worldData.world.cover_path), 'Copertina aggiornata'); if (ok !== undefined) { reloadWorld(selected.id); refreshWorlds(); } }} /></div>}
            <div className="spaceHeroText"><span className="heroEyebrow">SPAZIO CONDIVISO</span>
              <div className="heroTitle"><h1>{worldData.world.name}</h1>{isWorldOwner && <button className="iconbtn onDark" aria-label="Rinomina lo spazio" onClick={() => setRenameSpace(worldData.world.name)}><Pencil size={16} /></button>}</div>
              <div className="heroMembers">{memberStack(active.map(m => m.profile).filter(Boolean), 5)}<span>{others.length ? 'Tu e ' + others.map(m => nameOf(m.profile)).join(', ') : 'Solo tu, per ora'}{invited.length ? ` · ${invited.length} ${invited.length === 1 ? 'invito' : 'inviti'} in attesa` : ''}</span></div></div>
          </div>
          <div className="spaceActions"><button className="pill dark" onClick={() => { setSpaceSearch(''); setShowSpaceAdd(true); }}><Plus size={18} /> Aggiungi</button><button className="pill outline" onClick={() => setSpaceTab('people')}><UserRoundPlus size={18} /> Invita</button><button className="pill outline iconOnly" aria-label="Use with AI" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportWorld(selected.id)), 'MORETHERE — SHARED SPACE CONTEXT', worldData.world.name)}><Sparkles size={18} /></button></div>
          <div className="viewToggle tabs" role="tablist"><button role="tab" aria-selected={spaceTab === 'items'} className={spaceTab === 'items' ? 'on' : ''} onClick={() => setSpaceTab('items')}>Scoperte · {worldData.items.length}</button><button role="tab" aria-selected={spaceTab === 'people'} className={spaceTab === 'people' ? 'on' : ''} onClick={() => setSpaceTab('people')}>Persone · {active.length}</button></div>

          {spaceTab === 'items' && (worldData.items.length ? (() => {
            // Filter by category or by who added it; order by recency or by the date of the memory.
            const cats = [...new Set(worldData.items.map(i => i.category))];
            const adders = [...new Map(worldData.items.map(i => [i.added_by, i.adder])).entries()];
            const kindOf = i => (i.image_path ? 'photo' : i.url ? 'link' : 'note');
            const kinds = [['photo', 'Foto'], ['link', 'Link'], ['note', 'Note']].map(([k, label]) => [k, label, worldData.items.filter(i => kindOf(i) === k).length]).filter(([, , n]) => n > 0);
            const matches = (i, f) => f === 'all' || (f.startsWith('cat:') ? i.category === f.slice(4) : f.startsWith('kind:') ? kindOf(i) === f.slice(5) : i.added_by === f.slice(3));
            const shown = worldData.items.filter(i => matches(i, spaceFilter));
            const when = i => i.memory_date || String(i.created_at).slice(0, 10);
            const ordered = spaceView === 'date' ? [...shown].sort((x, y) => when(y).localeCompare(when(x)) || String(y.created_at).localeCompare(String(x.created_at))) : shown;
            const groups = [];
            if (spaceView === 'date') for (const i of ordered) { const key = when(i).slice(0, 7); if (groups[groups.length - 1]?.key !== key) { const [y, m] = key.split('-').map(Number); const label = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] }); } groups[groups.length - 1].items.push(i); }
            const spaceCard = i => (<article className="item" key={i.id}><button className={'preview' + (photoUrls[i.image_path] ? ' hasphoto' : '')} aria-label={`Apri ${i.title}`} onClick={() => setSpaceItem(i)}>{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : <span>{i.url ? <Link2 size={26} /> : <PenLine size={26} />}</span>}</button><div className="itembody"><div className="eyebrow">{i.category}{i.memory_date ? <> · {fmtMemory(i.memory_date, true)}</> : null}</div><button className="itemtitle" onClick={() => setSpaceItem(i)}>{i.title}</button><small className="byline">{i.added_by === api.me ? 'Aggiunto da te' : 'Aggiunto da ' + nameOf(i.adder)}</small></div></article>);
            return <>
              <div className="chips spaceChips"><button className={'chip ' + (spaceFilter === 'all' ? 'active' : '')} onClick={() => setSpaceFilter('all')}>Tutti <span className="chipN">{worldData.items.length}</span></button>{kinds.map(([k, label, n]) => <button key={k} className={'chip ' + (spaceFilter === 'kind:' + k ? 'active' : '')} onClick={() => setSpaceFilter('kind:' + k)}>{label} <span className="chipN">{n}</span></button>)}{adders.length > 1 && adders.map(([id, p]) => <button key={id} className={'chip ' + (spaceFilter === 'by:' + id ? 'active' : '')} onClick={() => setSpaceFilter('by:' + id)}>{id === api.me ? 'Da te' : 'Da ' + nameOf(p)}</button>)}{cats.length > 1 && cats.filter(c => !['Foto', 'Pagine', 'Appunti'].includes(c)).map(c => <button key={c} className={'chip ' + (spaceFilter === 'cat:' + c ? 'active' : '')} onClick={() => setSpaceFilter('cat:' + c)}>{c}</button>)}</div>
              <div className="sectionRow"><div className="sectionLabel">{shown.length} {shown.length === 1 ? 'scoperta' : 'scoperte'}</div><div className="viewToggle" role="group" aria-label="Ordina"><button className={spaceView === 'recent' ? 'on' : ''} aria-pressed={spaceView === 'recent'} onClick={() => setSpaceView('recent')}>Recenti</button><button className={spaceView === 'date' ? 'on' : ''} aria-pressed={spaceView === 'date'} onClick={() => setSpaceView('date')}>Per data</button></div></div>
              {!shown.length ? <div className="empty compact">Nessuna scoperta con questo filtro.</div>
                : spaceView === 'date' ? groups.map(g => <section key={g.key} className="monthGroup"><h3 className="monthLabel">{g.label}</h3><div className="cards">{g.items.map(spaceCard)}</div></section>)
                : <div className="cards">{ordered.map(spaceCard)}</div>}
            </>;
          })()
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
      {edit ? <div className="panel"><label htmlFor="e-title">TITOLO</label><input id="e-title" maxLength={300} autoFocus={!!edit.fresh} onFocus={e => edit.fresh && e.target.select()} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /><label htmlFor="e-url">LINK</label><input id="e-url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} /><label htmlFor="e-note">NOTA</label><textarea id="e-note" rows="5" maxLength={10000} placeholder={edit.fresh ? 'Dove eravate, con chi, cosa ricordi…' : ''} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /><label htmlFor="e-date">DATA DEL RICORDO</label><div className="dateRow"><input id="e-date" type="date" className={edit.memory_date ? '' : 'empty'} aria-describedby="e-date-hint" min="1800-01-01" max="2200-12-31" value={edit.memory_date || ''} onChange={e => setEdit({ ...edit, memory_date: e.target.value })} />{edit.memory_date ? <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: '' })}>Togli</button> : <button type="button" className="textlink" onClick={() => setEdit({ ...edit, memory_date: todayIso() })}>Oggi</button>}</div><button className="pill dark wide" disabled={busy} onClick={saveEdit}><Check size={18} /> Salva</button><button className="pill outline wide" onClick={() => setEdit(null)}>Annulla</button></div>
        : <><h1>{selected.title}</h1>{safeUrl(selected.url || '') && <a className="outlink" href={selected.url} target="_blank" rel="noopener noreferrer">Apri la fonte <ExternalLink size={17} /></a>}{digesting === selected.id && <p className="digestWait"><Sparkles size={14} className="inline" /> Sto scrivendo i punti salienti…</p>}{selected.note && <p className="notebody">{selected.note.split(/(Perché ti interessa:|Contesto:)/).map((part, k) => (part === 'Perché ti interessa:' || part === 'Contesto:' ? <strong key={k}>{part}</strong> : part))}</p>}{(() => { const rel = relatedItems(selected, items); return rel.length > 0 && <div className="related"><div className="relatedHead">Collegati</div>{rel.map(o => <button key={o.id} className="relatedRow" onClick={() => { setSelected(o); setEdit(null); window.scrollTo(0, 0); }}><span className="relatedThumb">{photoUrls[o.image_path] ? <Photo url={photoUrls[o.image_path]} /> : (o.url ? <Link2 size={16} /> : <PenLine size={16} />)}</span><span className="relatedText"><strong>{o.title}</strong><small>{fmtDate(o.created)}{o.collection ? ` · ${o.collection}` : ''}</small></span><ChevronRight size={16} /></button>)}</div>; })()}
          <div className="detailtools"><button className="textlink" onClick={() => setEdit({ title: selected.title, url: selected.url || '', note: selected.note || '', memory_date: selected.memory_date || '' })}><Pencil size={14} /> Modifica</button><button className="textlink" disabled={busy} onClick={() => pickPhoto(selected.id)}><ImagePlus size={14} /> {selected.image_path ? 'Cambia foto' : 'Aggiungi foto'}</button>{social && safeUrl(selected.url || '') && !selected.image_path && <button className="textlink" disabled={busy} onClick={async () => { setBusy(true); const ok = await enrichLink(selected); setBusy(false); toast(ok ? 'Anteprima aggiornata' : 'Questa pagina non offre un\'anteprima'); if (ok) refreshArchive(); }}><Link2 size={14} /> Aggiorna anteprima</button>}{safeUrl(selected.url || '') && <button className="textlink" disabled={digesting === selected.id} onClick={() => summarize(selected)}><Sparkles size={14} /> {digesting === selected.id ? 'Riassumo…' : 'In breve'}</button>}<button className="textlink danger" onClick={async () => { if (!window.confirm(`Eliminare "${selected.title}"?`)) return; await removeItem(selected); goBack(); }}><Trash2 size={14} /> Elimina</button></div></>}
      <div className="panel"><label htmlFor="col">RACCOLTA</label><select id="col" value={selected.collection || ''} onChange={async e => { const v = e.target.value; const id = collectionId(v); setItems(arr => arr.map(i => i.id === selected.id ? { ...i, collection: v, collection_id: id } : i)); setSelected({ ...selected, collection: v, collection_id: id }); try { await api.updateItem(selected.id, { collection_id: id, collection: v }); } catch (err) { toast(friendlyError(err)); refreshArchive(); } }}>{!selected.collection && <option value="">—</option>}{collections.map(c => <option key={c}>{c}</option>)}</select></div><div className="stack"><button className="feature mfyFeature" onClick={() => share(selected)}><span className="ixi" aria-hidden="true"><MoreForYouIcon /></span><span><strong>More for you.</strong><small>Apri questo ricordo a un amico, con una dedica</small></span><ChevronRight /></button><button className="feature" onClick={() => exportAI([selected])}><Sparkles /><span><strong>Use with AI</strong><small>Copia il contesto</small></span><ChevronRight /></button></div></main>}

    {screen === 'askNew' && <main>
      {askDone ? doneView({ title: 'Chiesto.', text: `Quando i tuoi amici rispondono, trovi i loro posti e le loro foto in Your Circle, sotto “${askTitle.trim()}”.`, actions: <><button className="pill dark wide" onClick={() => { setOpenAskId(askDone); setScreen('ask', { replace: true }); }}>Apri la richiesta</button><button className="pill outline wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button></> }) : <>
        {askStep === 1 && wizard({ n: 1, total: 2, question: 'Dove vai, o cosa cerchi?', hint: 'Per esempio: Firenze, a maggio.', canNext: !!askTitle.trim(), onNext: () => setAskStep(2), children: <>
          {social && <div className="hereRow"><button type="button" className={'hereBtn' + (askPlace ? ' on' : '')} disabled={hereBusy} onClick={locateMe}><MapPin size={17} /> {hereBusy ? 'Cerco dove sei…' : askPlace ? `Sei a ${askPlace}` : 'Sono qui'}</button>{askPlace ? <button type="button" className="textlink" onClick={() => { setAskPlace(''); setAskTitle(t => (/^A .+, adesso$/.test(t) ? '' : t)); }}>Togli</button> : <small>Legge la posizione una volta e scrive la città. Non la salviamo.</small>}</div>}
          <input className="wizInput" aria-label="LA TUA RICHIESTA" maxLength={120} autoFocus placeholder="Firenze, a maggio" value={askTitle} onChange={e => setAskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && askTitle.trim() && setAskStep(2)} />
          <textarea aria-label="DETTAGLI" rows="3" maxLength={1000} placeholder="Cosa ti piacerebbe? Ristoranti, musei, posti tranquilli…" value={askNote} onChange={e => setAskNote(e.target.value)} /></> })}
        {askStep === 2 && wizard({ n: 2, total: 2, question: 'A chi lo chiedi?', hint: accepted.length ? 'Solo loro vedranno la tua richiesta.' : 'Non hai ancora amici su morethere: aggiungine uno con More of me.', canNext: askPeople.length > 0, onBack: () => setAskStep(1), onNext: sendAsk, nextLabel: askPeople.length > 1 ? `Chiedi a ${askPeople.length} amici` : 'Chiedi', children: <>
          {accepted.length ? <>{peoplePicker(askPeople, id => setAskPeople(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id])), { add: false })}{accepted.length > 1 && <button type="button" className="textlink" onClick={() => setAskPeople(askPeople.length === accepted.length ? [] : accepted.map(c => c.other.id))}>{askPeople.length === accepted.length ? 'Togli tutti' : 'Tutti i miei amici'}</button>}</> : <button type="button" className="pill outline wide" onClick={() => startMoreOfMe()}><MoreOfMeIcon size={18} /> Aggiungi un amico</button>}</> })}
      </>}</main>}

    {screen === 'answer' && answering && <main>
      <div className="askCard quiet"><span className="av" aria-hidden="true">{face(answering.owner)}</span><span className="askBody"><small>{answering.place ? `${firstName(answering.owner)} è a ${answering.place}` : `${firstName(answering.owner)} chiede`}</small><strong>{answering.title}</strong>{answering.note && <span className="askNote">{answering.note}</span>}</span></div>
      {ansDone ? doneView({ title: 'Fatto.', text: `${firstName(answering.owner)} ora vede ${ansDone} ${ansDone === 1 ? 'tuo consiglio' : 'tuoi consigli'}. Restano nella tua raccolta: puoi toglierli quando vuoi da Your Circle.`, actions: <button className="pill dark wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button> }) : (() => {
        const q = ansSearch.trim().toLowerCase();
        const pickable = items.filter(i => !q || [i.title, i.note, i.url, i.category, i.collection].join(' ').toLowerCase().includes(q));
        const who = firstName(answering.owner); const n = ansItems.length;
        // Your places in the city your friend is in come first.
        const fold = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const at = answering.place ? fold(answering.place) : '';
        const isHere = i => at && fold([i.title, i.note, i.url, i.collection].join(' ')).includes(at);
        const here = pickable.filter(isHere); const rest = pickable.filter(i => !isHere(i));
        const tile = i => { const on = ansItems.includes(i.id); return <button key={i.id} type="button" role="checkbox" aria-checked={on} aria-label={i.title} className={'pickTile' + (on ? ' added' : '')} onClick={() => setAnsItems(v => (on ? v.filter(x => x !== i.id) : [...v, i.id]))}><span className="ptImg">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={20} /> : <PenLine size={20} />)}{on && <span className="ptCheck"><Check size={14} /></span>}</span><span className="ptTitle">{i.title}</span></button>; };
        return <>
          {ansStep === 1 && wizard({ n: 1, total: 3, question: `Cosa consigli a ${who}?`, hint: here.length ? `I tuoi posti a ${answering.place} sono in cima.` : 'Scegli uno o più posti e foto dalla tua raccolta.', canNext: n > 0, onNext: () => setAnsStep(2), nextLabel: n ? `Avanti · ${n}` : 'Avanti', children: <>
            <div className="search"><Search size={19} /><input aria-label="Cerca nel tuo archivio" placeholder="Cerca: Firenze, ristorante…" value={ansSearch} onChange={e => setAnsSearch(e.target.value)} /></div>
            {here.length > 0 && <><div className="pickLabel"><MapPin size={13} /> A {answering.place}</div><div className="pickGrid">{here.map(tile)}</div>{rest.length > 0 && <div className="pickLabel">Tutto il resto</div>}</>}
            <div className="pickGrid">{rest.map(tile)}</div>
            {!pickable.length && <div className="empty compact">{items.length ? 'Nessun risultato.' : 'La tua raccolta è vuota: salva prima qualcosa dalla home.'}</div>}</> })}
          {ansStep === 2 && wizard({ n: 2, total: 3, question: `Cosa può fare ${who}?`, onBack: () => setAnsStep(1), onNext: () => setAnsStep(3), children: <>
            <div className="opts" role="radiogroup">{option({ on: ansSave, title: 'Guardare e salvare', desc: 'Può tenersi una copia per il suo viaggio.', onClick: () => setAnsSave(true) })}{option({ on: !ansSave, title: 'Solo guardare', desc: 'Li vede nella tua raccolta, sempre aggiornati.', onClick: () => setAnsSave(false) })}</div>
            <div className="wizToggle"><Toggle checked={ansAi} onChange={setAnsAi} label="Può usarli con l'AI" hint="Per esempio per farsi preparare un itinerario." /></div></> })}
          {ansStep === 3 && wizard({ n: 3, total: 3, question: 'Vuoi aggiungere due parole?', hint: 'Puoi anche lasciarlo vuoto.', onBack: () => setAnsStep(2), onNext: sendAnswer, nextLabel: `Manda ${n} ${n === 1 ? 'consiglio' : 'consigli'}`, children: <>
            <textarea aria-label="IL TUO MESSAGGIO" rows="4" maxLength={1000} placeholder="Da non perdere: chiedi del tavolo in giardino." value={ansMsg} onChange={e => setAnsMsg(e.target.value)} /></> })}
        </>;
      })()}</main>}

    {screen === 'ask' && (() => {
      const a = asks.mine.find(x => x.id === openAskId);
      if (!a) return <main><div className="empty">Questa richiesta non c'è più.</div></main>;
      const got = askAnswers(a.id);
      return <main><h1 className="first">{a.title}</h1>{a.note && <p className="muted">{a.note}</p>}
        <div className="askedTo">{memberStack(a.recipients, 6)}<span>Chiesto a {a.recipients.map(nameOf).join(', ')}</span></div>
        {a.recipients.map(r => { const mine = got.filter(t => t.sender_id === r.id); return <section key={r.id} className="block"><div className="blockHead askFrom"><span className="av small" aria-hidden="true">{face(r)}</span><h2>{nameOf(r)}</h2>{mine.length > 0 && <span className="count">{mine.length}</span>}</div>{mine.length ? <>{[...new Set(mine.map(t => t.message).filter(Boolean))].map(m => <p key={m} className="dedication">“{m}”</p>)}{mine.map(t => receivedCard(t, { grouped: true }))}</> : <div className="empty compact">Non ha ancora risposto.</div>}</section>; })}
        <button className="textlink danger" onClick={async () => { if (!window.confirm('Eliminare questa richiesta? I consigli ricevuti restano finché i tuoi amici non li tolgono.')) return; const r = await run(() => api.deleteAsk(a.id), 'Richiesta eliminata'); if (r) { await refreshAsks(); goBack(); } }}><Trash2 size={13} /> Elimina la richiesta</button></main>;
    })()}

    {screen === 'thought' && <main>
      {(() => {
        const external = !social || !accepted.length || recipientId === '__external';
        const to = accepted.find(c => c.other.id === recipientId)?.other;
        const who = external ? (recipient.trim() || 'questa persona') : nameOf(to);
        if (forDone) return doneView({ title: forDone === 'out' ? 'Condiviso.' : 'Fatto.', text: forDone === 'out' ? `Hai condiviso “${selected?.title || 'il tuo ricordo'}” con un'altra app.` : `${who} ora può vedere “${selected?.title || 'il tuo ricordo'}”. Resta nella tua raccolta: puoi toglierglielo quando vuoi.`, actions: <><button className="pill dark wide" onClick={() => startMoreForYou()}>Apri un altro ricordo</button><button className="pill outline wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button></> });
        const q = forSearch.trim().toLowerCase();
        const pickable = items.filter(i => !q || [i.title, i.note, i.url].join(' ').toLowerCase().includes(q));
        const total = external ? 3 : 4;
        return <>
          {forStep === 1 && wizard({ n: 1, total, question: 'Quale ricordo vuoi aprire?', hint: 'Scegli un ricordo della tua raccolta.', canNext: !!selected, onNext: () => setForStep(2), children: <>
            <div className="search"><Search size={19} /><input aria-label="Cerca nel tuo archivio" placeholder="Cerca nella tua raccolta..." value={forSearch} onChange={e => setForSearch(e.target.value)} /></div>
            <div className="pickGrid">{pickable.map(i => <button key={i.id} type="button" role="radio" aria-checked={selected?.id === i.id} aria-label={i.title} className={'pickTile' + (selected?.id === i.id ? ' added' : '')} onClick={() => setSelected(i)}><span className="ptImg">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={20} /> : <PenLine size={20} />)}{selected?.id === i.id && <span className="ptCheck"><Check size={14} /></span>}</span><span className="ptTitle">{i.title}</span></button>)}</div>
            {!pickable.length && <div className="empty compact">{items.length ? 'Nessun risultato.' : 'La tua raccolta è vuota: salva prima qualcosa dalla home.'}</div>}</> })}
          {forStep === 2 && wizard({ n: 2, total, question: 'A quale amico?', hint: social && accepted.length ? 'Solo lui potrà vederlo, finché vuoi tu.' : 'Non hai ancora amici su morethere: per ora puoi mandarlo con un\'altra app. Gli amici si aggiungono da Your Circle.', canNext: external ? true : !!recipientId, onBack: () => setForStep(1), onNext: () => setForStep(3), children: <>
            {selected && <div className="chosenItem">{photoUrls[selected.image_path] ? <Photo className="rowthumb" url={photoUrls[selected.image_path]} alt="" /> : <span className="chosenIcon">{selected.url ? <Link2 size={18} /> : <PenLine size={18} />}</span>}<span><strong>{selected.title}</strong><small>{selected.url || selected.note}</small></span><button className="textlink" onClick={() => setForStep(1)}>Cambia</button></div>}
            {social && peoplePicker([recipientId], id => (id === '__external' ? shareOut() : setRecipientId(id)), { external: true, add: false })}
            <p className="wizNote">Tocca <strong>Fuori app</strong> per mandarlo con WhatsApp, Instagram, Mail o qualsiasi altra app.</p></> })}
          {forStep === 3 && !external && wizard({ n: 3, total, question: `Cosa può fare ${who}?`, onBack: () => setForStep(2), onNext: () => setForStep(4), children: <>
            <div className="opts" role="radiogroup">{option({ on: !thoughtSave, title: 'Solo guardare', desc: 'Lo vede nella tua raccolta, sempre aggiornato.', onClick: () => setThoughtSave(false) })}{option({ on: thoughtSave, title: 'Guardare e salvare', desc: 'Può tenersi una copia.', onClick: () => setThoughtSave(true) })}</div>
            <div className="wizToggle"><Toggle checked={thoughtAi} onChange={setThoughtAi} label="Può usarlo con l'AI" hint="Per esempio per chiedere consigli a un assistente AI." /></div></> })}
          {((forStep === 4 && !external) || (forStep === 3 && external)) && wizard({ n: total, total, question: 'Vuoi aggiungere una dedica?', hint: 'Due parole bastano. Puoi anche lasciarla vuota.', onBack: () => setForStep(external ? 2 : 3), onNext: sendThought, nextLabel: external ? 'Condividi con un\'altra app' : `Apri a ${who}`, children: <>
            <textarea id="msg" aria-label="LA TUA DEDICA" rows="4" maxLength={1000} placeholder="Ho visto questo e ho pensato subito a te..." value={message} onChange={e => setMessage(e.target.value)} /></> })}
        </>;
      })()}</main>}

    {screen === 'settings' && <main>
      {social ? (() => {
        const target = accepted.find(c => c.other.id === shareTarget)?.other;
        const who = nameOf(target);
        const existing = circle.sharesOut.find(x => x.grantee_id === shareTarget);
        const chosenNames = collectionRows.filter(c => shareCollections.includes(c.id)).map(c => c.name);
        if (meDone) return doneView({ title: 'Fatto.', text: `${who} è nella tua raccolta: vede ${shareMode === 'all' ? 'tutto' : chosenNames.join(', ')}. Puoi toglierlo quando vuoi.`, actions: <><button className="pill dark wide" onClick={() => target && openFriend(target)}>Vai alla pagina di {who}</button><button className="pill outline wide" onClick={() => setScreen('circle')}>Torna a Your Circle</button></> });
        return <>
          {meStep === 1 && wizard({ n: 1, total: 4, question: 'Chi vuoi aggiungere alla tua raccolta?', hint: 'Scegli un amico. Vedrà solo quello che decidi tu.', canNext: !!shareTarget, onNext: () => setMeStep(2), children: <>{peoplePicker([shareTarget], id => pickShareTarget(id))}{!accepted.length && <p className="panelLead">Prima aggiungi un amico: tocca Aggiungi.</p>}{existing && <p className="wizNote">{who} è già nella tua raccolta. Puoi cambiare cosa vede.</p>}</> })}
          {meStep === 2 && wizard({ n: 2, total: 4, question: `Cosa può vedere ${who}?`, canNext: shareMode === 'all' || shareCollections.length > 0, onBack: () => setMeStep(1), onNext: () => setMeStep(3), children: <>
            <div className="opts" role="radiogroup">{option({ on: shareMode === 'item', title: 'Solo alcune raccolte', desc: 'Scegli tu quali.', onClick: () => setShareMode('item') })}{option({ on: shareMode === 'all', title: 'Tutto', desc: 'Tutte le tue raccolte, anche quelle nuove.', onClick: () => setShareMode('all') })}</div>
            {shareMode === 'item' && <><div className="ixCap subCap">QUALI?</div><div className="opts">{collectionRows.map(c => { const n = items.filter(i => i.collection_id === c.id).length; return option({ key: c.id, multi: true, on: shareCollections.includes(c.id), title: c.name, desc: `${n} ${n === 1 ? 'scoperta' : 'scoperte'}`, onClick: () => setShareCollections(v => (v.includes(c.id) ? v.filter(x => x !== c.id) : [...v, c.id])) }); })}</div></>}</> })}
          {meStep === 3 && wizard({ n: 3, total: 4, question: `Cosa può fare ${who}?`, onBack: () => setMeStep(2), onNext: () => setMeStep(4), children: <>
            <div className="opts" role="radiogroup">{option({ on: permission === 'view', title: 'Solo guardare', desc: 'Non può salvare niente.', onClick: () => setPermission('view') })}{option({ on: permission === 'save', title: 'Guardare e salvare', desc: 'Può tenersi una copia.', onClick: () => setPermission('save') })}</div>
            <div className="wizToggle"><Toggle checked={shareAi} onChange={setShareAi} label="Può usarle con l'AI" hint="Per esempio per chiedere consigli a un assistente AI." /></div></> })}
          {meStep === 4 && wizard({ n: 4, total: 4, question: 'Va bene così?', onBack: () => setMeStep(3), onNext: saveShare, nextLabel: existing ? 'Salva le modifiche' : `Aggiungi ${who}`, children: <dl className="summary">
            <div><dt>Amico</dt><dd><span className="mav">{face(target)}</span>{who}</dd></div>
            <div><dt>Vede</dt><dd>{shareMode === 'all' ? 'Tutto' : chosenNames.join(', ')}</dd></div>
            <div><dt>Può</dt><dd>{permission === 'save' ? 'Guardare e salvare' : 'Solo guardare'}</dd></div>
            <div><dt>AI</dt><dd>{shareAi ? 'Sì' : 'No'}</dd></div></dl> })}
          {meStep === 1 && circle.sharesOut.length > 0 && <><div className="blockHead"><h2>Amici nella tua raccolta</h2><span className="count">{circle.sharesOut.length}</span></div><div className="people">{circle.sharesOut.map(sh => { const c = accepted.find(x => x.other.id === sh.grantee_id); return <div key={sh.id} className="person"><div className="avatar">{face(c?.other)}</div><span><strong>{nameOf(c?.other)}</strong><small>{sh.scope === 'all' ? 'Vede tutto' : `Vede ${collectionRows.filter(c => sh.collection_ids.includes(c.id)).map(c => c.name).join(', ')}`} · {sh.can_save ? 'guarda e salva' : 'solo guarda'}</small></span><button className="pill outline small" disabled={busy} onClick={() => revokeShare(sh.grantee_id)}>Togli</button></div>; })}</div></>}
          <p className="hint"><ShieldCheck size={13} className="inline" /> Solo gli amici che aggiungi vedono le tue raccolte. Puoi toglierli quando vuoi.</p></>;
      })()
        : <div className="panel"><label>ACCESSO</label><div className="choices"><button className={shareMode === 'item' ? 'chosen' : ''} onClick={() => setShareMode('item')}>Alcune raccolte</button><button className={shareMode === 'all' ? 'chosen' : ''} onClick={() => setShareMode('all')}>Tutto il mio archivio</button></div>{signInHint}<button className="pill dark wide" onClick={copyInvite}><Copy size={18} /> Copia riepilogo</button></div>}</main>}

    {screen === 'profile' && profileDraft && <main>
      <div className="profileHero"><span className="avatarEdit">{enlargeable(profile) ? <button className="faceBtn" aria-label="Ingrandisci la tua foto" onClick={() => enlarge(profile)}><span className="av big" aria-hidden="true">{face(profile)}</span></button> : <button className="faceBtn" aria-label="Aggiungi una foto profilo" disabled={busy} onClick={() => avatarInput.current?.click()}><span className="av big" aria-hidden="true">{face(profile)}</span></button>}<button className="avatarBadge" aria-label={profile?.avatar_path ? 'Cambia foto profilo' : 'Aggiungi una foto profilo'} disabled={busy} onClick={() => avatarInput.current?.click()}><Camera size={15} /></button></span><input ref={avatarInput} type="file" accept="image/*" hidden aria-hidden="true" data-testid="avatar-input" onChange={onAvatarChosen} />
        <div><h1>{profile?.display_name}</h1><p className="muted">@{profile?.handle}</p><div className="avatarLinks"><button className="textlink" disabled={busy} onClick={() => avatarInput.current?.click()}>{profile?.avatar_path ? 'Cambia foto' : 'Aggiungi una foto'}</button>{profile?.avatar_path && <button className="textlink danger" disabled={busy} onClick={removeAvatar}>Togli</button>}</div></div></div>
      <p className="hint">La tua foto la vedono solo le persone del tuo Circle e chi condivide uno spazio con te.</p>
      <div className="panel"><label htmlFor="pn">NOME</label><input id="pn" maxLength={60} value={profileDraft.display_name} onChange={e => setProfileDraft({ ...profileDraft, display_name: e.target.value })} /><label htmlFor="ph">NOME UTENTE</label><input id="ph" maxLength={31} autoCapitalize="none" autoCorrect="off" value={profileDraft.handle} onChange={e => setProfileDraft({ ...profileDraft, handle: e.target.value })} /><label htmlFor="ps">DI COSA TI OCCUPI</label><input id="ps" maxLength={120} placeholder="Travel · Food · Architecture" value={profileDraft.subtitle} onChange={e => setProfileDraft({ ...profileDraft, subtitle: e.target.value })} /><button className="pill dark wide" disabled={busy} onClick={saveProfile}><Check size={18} /> Salva</button></div>
      <p className="hint">Il tuo nome e la descrizione sono visibili solo alle persone del tuo Circle e degli spazi condivisi.</p>
      <div className="stack"><button className="feature" onClick={startAI}><Sparkles /><span><strong>Use with AI</strong><small>Scegli cosa dare all'AI: tutto, un viaggio, i ristoranti…</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={async () => exportShared(await run(() => api.aiExportThoughts()), 'MORETHERE — THOUGHTS SHARED WITH ME')}><Inbox /><span><strong>Pensieri con AI</strong><small>I pensieri ricevuti che puoi usare con AI</small></span><ChevronRight /></button><button className="feature" disabled={busy} onClick={downloadData}><Download /><span><strong>Esporta i miei dati</strong><small>Scarica tutto in formato JSON</small></span><ChevronRight /></button></div>
      <button className="pill outline wide" onClick={() => api.signOut()}><LogOut size={18} /> Esci</button>
      <button className="textlink danger" onClick={deleteAccount}>Elimina il mio account</button></main>}

    {screen === 'ai' && <main>
      <h2 className="wizQ">Su cosa vuoi chiedere all'AI?</h2><p className="wizHint">Copi solo quello che scegli e lo incolli nel tuo assistente (ChatGPT, Claude, Gemini…).</p>
      <div className="opts" role="radiogroup" aria-label="Cosa copiare">
        {option({ on: aiMode === 'all', title: 'Tutto', desc: `${items.length} ${items.length === 1 ? 'scoperta' : 'scoperte'}`, onClick: () => setAiMode('all') })}
        {option({ on: aiMode === 'collection', title: 'Una raccolta', desc: collections.slice(0, 3).join(', ') + (collections.length > 3 ? '…' : ''), onClick: () => setAiMode('collection') })}
        {option({ on: aiMode === 'search', title: 'Un luogo o un tema', desc: 'Firenze, ristoranti, Giappone…', onClick: () => setAiMode('search') })}
        {option({ on: aiMode === 'pick', title: 'Scelgo io', desc: 'Una per una', onClick: () => setAiMode('pick') })}
      </div>
      {aiMode === 'collection' && <div className="chips aiChips">{collections.map(c => { const on = aiCols.includes(c); const n = items.filter(i => i.collection === c).length; return <button key={c} className={'chip' + (on ? ' active' : '')} aria-pressed={on} onClick={() => setAiCols(v => (on ? v.filter(x => x !== c) : [...v, c]))}>{c} · {n}</button>; })}</div>}
      {aiMode === 'search' && <>
        <div className="search aiSearch"><Search size={19} /><input aria-label="Luogo o tema" autoFocus placeholder="Firenze, ristoranti…" value={aiQuery} onChange={e => { setAiQuery(e.target.value); setAiSkip([]); }} /></div>
        {aiQuery.trim() && (aiFound.length ? <div className="aiList">{aiFound.map(i => { const on = !aiSkip.includes(i.id); return <button key={i.id} type="button" role="checkbox" aria-checked={on} className={'aiRow' + (on ? ' on' : '')} onClick={() => setAiSkip(v => (on ? [...v, i.id] : v.filter(x => x !== i.id)))}><span className="optMark" aria-hidden="true">{on && <Check size={13} />}</span><span className="aiThumb">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={16} /> : <PenLine size={16} />)}</span><span className="aiTitle">{i.title}</span></button>; })}</div> : <div className="empty compact">Niente su “{aiQuery.trim()}” nella tua raccolta.</div>)}
      </>}
      {aiMode === 'pick' && <div className="pickGrid">{items.map(i => { const on = aiPicked.includes(i.id); return <button key={i.id} type="button" role="checkbox" aria-checked={on} aria-label={i.title} className={'pickTile' + (on ? ' added' : '')} onClick={() => setAiPicked(v => (on ? v.filter(x => x !== i.id) : [...v, i.id]))}><span className="ptImg">{photoUrls[i.image_path] ? <Photo url={photoUrls[i.image_path]} /> : (i.url ? <Link2 size={20} /> : <PenLine size={20} />)}{on && <span className="ptCheck"><Check size={14} /></span>}</span><span className="ptTitle">{i.title}</span></button>; })}</div>}
      <label className="aiAskLabel" htmlFor="ai-ask">COSA VUOI CHIEDERE? <span>(facoltativo)</span></label>
      <div className="chips aiSuggest">{['Organizzami un itinerario', 'Dove mangio?', 'Riassumi', 'Cosa mi piace davvero?'].map(t => <button key={t} className={'chip' + (aiAsk === t ? ' active' : '')} onClick={() => setAiAsk(aiAsk === t ? '' : t)}>{t}</button>)}</div>
      <textarea id="ai-ask" className="aiAsk" rows="2" maxLength={500} placeholder="Per esempio: un weekend a Firenze a maggio, con i posti che ho salvato." value={aiAsk} onChange={e => setAiAsk(e.target.value)} />
      <button className="pill dark wide aiCopy" disabled={!aiItems.length} onClick={copyForAI}><Copy size={18} /> Copia per l'AI · {aiItems.length} {aiItems.length === 1 ? 'scoperta' : 'scoperte'}</button>
    </main>}

    {screen === 'export' && <main><h1>AI Context</h1><textarea readOnly rows="16" value={exportText} /><button className="pill dark wide" onClick={() => navigator.clipboard?.writeText(exportText).then(() => toast('Copiato'))}><Copy size={18} /> Copia</button></main>}

    {showAddCollection && <div className="overlay" role="presentation" onClick={() => setShowAddCollection(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Nuova raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowAddCollection(false)}><X /></button><h2>Nuova raccolta</h2><input placeholder="Nome della raccolta" maxLength={60} value={newCollection} onChange={e => setNewCollection(e.target.value)} /><button className="pill dark wide" disabled={busy} onClick={async () => { const n = newCollection.trim(); if (n && !collections.some(c => c.toLowerCase() === n.toLowerCase())) { const r = await run(() => api.addCollection(n, collectionRows.length)); if (r) await refreshArchive(); } setNewCollection(''); setShowAddCollection(false); }}>Crea</button></div></div>}

    {showAddPerson && social && <div className="overlay" role="presentation" onClick={() => setShowAddPerson(false)}><div className="modal sheet" role="dialog" aria-modal="true" aria-label="Aggiungi una persona" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setShowAddPerson(false)}><X /></button><h2>Aggiungi una persona</h2><p className="muted">Entra tra le tue persone quando accetta. Nessuno vede nulla di te finché non lo decidi tu.</p>
      <label htmlFor="handle">SE È GIÀ SU MORETHERE</label><input id="handle" placeholder="@nomeutente" autoCapitalize="none" autoCorrect="off" value={handleInput} onChange={e => setHandleInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && requestConnection()} /><button className="pill dark wide" disabled={busy} onClick={requestConnection}><UserRoundPlus size={18} /> Invia richiesta</button>
      <div className="orLine"><span>oppure</span></div>
      <label>SE NON C'È ANCORA</label><button className="pill outline wide" disabled={busy} onClick={copyInvite}><Link2 size={18} /> Invita con un link</button>{inviteLink && <input readOnly aria-label="Link d'invito" value={inviteLink} onFocus={e => e.target.select()} />}<small className="sheetNote">Il link è personale, vale una volta e scade dopo 7 giorni.{profile ? <> Il tuo nome utente è <strong>@{profile.handle}</strong>.</> : null}</small>
      {pendingInvites.map(i => <div key={i.id} className="inviteRow"><span>Invito del {fmtDate(i.created_at)} · scade il {fmtDate(i.expires_at)}</span><button className="textlink" onClick={async () => { await run(() => api.revokeInvitation(i.id), 'Invito revocato'); refreshCircle(); }}>Revoca</button></div>)}</div></div>}

    {collectionDialog && <div className="overlay" role="presentation" onClick={() => setCollectionDialog(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Rinomina raccolta" onClick={e => e.stopPropagation()}><button className="close" aria-label="Chiudi" onClick={() => setCollectionDialog(null)}><X /></button><h2>Rinomina raccolta</h2><input aria-label="Nuovo nome" maxLength={60} value={collectionDialog.name} onChange={e => setCollectionDialog({ ...collectionDialog, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && renameCollection()} /><button className="pill dark wide" disabled={busy} onClick={renameCollection}>Salva</button></div></div>}

    {bigFace && <div className="overlay faceView" role="dialog" aria-modal="true" aria-label={`Foto di ${bigFace.name}`} onClick={() => setBigFace(null)} onKeyDown={e => e.key === 'Escape' && setBigFace(null)}><img src={bigFace.url} alt={`Foto di ${bigFace.name}`} /><span className="faceName">{bigFace.name}</span><button className="faceClose" aria-label="Chiudi" autoFocus onClick={() => setBigFace(null)}><X size={20} /></button></div>}
    {invite && <div className="overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label="Invito"><UserRoundCheck size={28} />{invite.invalid ? <><h2>Invito non disponibile</h2><p className="muted">Questo link non è valido, è scaduto o è già stato usato. Chiedi un nuovo invito.</p><button className="pill dark wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Ok</button></> : <><h2>{invite.inviter_name} ti invita nel suo Circle</h2><p className="muted">Accettando diventerete connessi. Nessuno dei due vedrà nulla dell'altro finché non sceglierete di condividerlo.</p><button className="pill dark wide" disabled={busy} onClick={acceptInvite}>Accetta</button><button className="pill outline wide" onClick={() => { setInvite(null); onInviteHandled?.(); }}>Non ora</button></>}</div></div>}

    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
  </div>;
}
