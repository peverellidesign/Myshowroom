// Riconoscimento dei campi di un biglietto da visita a partire dal testo letto (OCR sul dispositivo).
// Regole pensate per biglietti italiani, svizzeri, emiratini e internazionali; ogni campo resta modificabile.

export type CardLine = { text: string; height?: number };
export type CardFields = { name: string; company: string; role: string; email: string; phone: string; mobile: string; website: string; address: string };

const ROLE = /\b(architett[oaie]|arch\.|designer|interior|ceo|cfo|coo|cto|founder|co-?founder|fondat(ore|rice)|titolare|owner|propriet|direttor[ei]|direttrice|director|manager|responsabile|partner|soci[oa]|presidente|president|consulente|consultant|sales|commerciale|buyer|project|ingegner[ei]|engineer|geometra|amministrat|head of|chief|vice|assistant|assistente|specialist|developer|agente|agent|account|contractor|decorat|stylist|curator|curatore|marketing|purchas|acquisti|procurement|ufficio|office)\b/i;
const COMPANY = /(\bs\.?\s?r\.?\s?l\.?(?=\s|$)|\bs\.?\s?p\.?\s?a\.?(?=\s|$)|\bsagl\b|\bs\.?a\.?(?=\s|$)|\bgmbh\b|\bag\b|\bltd\.?|\bllc\b|\binc\.?|\bs\.?n\.?c\.?(?=\s|$)|\bs\.?a\.?s\.?(?=\s|$)|\bfz-?(co|e|llc)\b|\bstudio\b|\bgroup\b|\bgruppo\b|\barchitects?\b|\barchitetti\b|\bassociati\b|\b&\s?c\.?|\bholding\b|\binteriors?\b|\batelier\b|\bdesign\b|\bimmobiliare\b|\bcostruzioni\b|\bhotel\b|\bproperties\b|\breal estate\b|\bdevelopments?\b)/i;
const STREET = /\b(via|viale|v\.le|piazza|p\.zza|p\.za|piazzale|corso|c\.so|largo|vicolo|strada|str\.|località|loc\.|frazione|street|st\.|road|rd\.|avenue|ave\.?|boulevard|blvd|rue|strasse|straße|str\b|platz|weg|gasse|quai|lungolago|riva|tower|building|floor|p\.o\.? box|office \d)/i;
const POSTAL_CITY = /\b(\d{4,5}|[A-Z]{1,2}-?\d{4,5})\s+[A-ZÀ-Ý][\p{L}' .-]{2,}/u;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const WEB = /\b((?:https?:\/\/)?(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?|(?:https?:\/\/)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?|[a-z0-9-]{2,}\.(?:it|ch|com|net|org|eu|ae|de|fr|uk|co\.uk|design|studio|archi|info|biz)(?:\/\S*)?)\b/i;
const PHONE = /(?:\+|00)?\d[\d\s().\/-]{5,}\d/g;
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|icloud|me|libero|yahoo|virgilio|tiscali|alice|tin|fastwebnet|bluewin|gmx|proton|protonmail|aol)\./i;

const digits = (s: string) => s.replace(/\D/g, '');
const clean = (s: string) => s.replace(/[|•·]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const stripLabel = (s: string) => s.replace(/^\s*(tel(efono)?|phone|ph|t|mob(ile)?|cell(ulare)?|cel|m|mobile|fax|f|e-?mail|email|mail|e|web|w|sito|site|www)\s*[.:]?\s+/i, '').trim();

function isMobile(raw: string, label: string): boolean {
  if (/\b(mob|mobile|cell|cel|handy|natel|m)\b\.?/i.test(label)) return true;
  if (/\b(tel|phone|ph|t|ufficio|office|fisso|fax|f)\b\.?/i.test(label)) return false;
  const d = digits(raw).replace(/^00/, '');
  return /^(39)?3\d{8,9}$/.test(d) || /^(41)?7[5-9]\d{7}$/.test(d) || /^(971)?5\d{8}$/.test(d) || /^(44)?7\d{9}$/.test(d) || /^(49)?1[5-7]\d{8,9}$/.test(d) || /^(33)?[67]\d{8}$/.test(d);
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export function parseBusinessCard(input: CardLine[] | string): CardFields {
  const lines: CardLine[] = (typeof input === 'string' ? input.split(/\r?\n/).map(text => ({ text })) : input)
    .map(l => ({ ...l, text: clean(l.text) })).filter(l => l.text.length > 1);
  const out: CardFields = { name: '', company: '', role: '', email: '', phone: '', mobile: '', website: '', address: '' };
  const used = new Set<number>();

  // email (corregge errori tipici di lettura: spazi attorno a @, punto letto come spazio o virgola prima del dominio)
  const fixMail = (t: string) => t.replace(/\s*@\s*/g, '@').replace(/(@[a-z0-9-]+(?:\.[a-z0-9-]+)*)[\s,]+(it|ch|com|net|org|eu|ae|de|fr|uk|info|design|studio|archi)\b/gi, '$1.$2');
  lines.forEach((l, i) => { const m = fixMail(l.text).match(EMAIL); if (m && !out.email) { out.email = m[0].toLowerCase(); if (stripLabel(fixMail(l.text).replace(m[0], '')).length < 3) used.add(i); } });
  // sito
  lines.forEach((l, i) => {
    if (out.website || EMAIL.test(fixMail(l.text))) return;
    const m = l.text.match(WEB); if (!m) return;
    out.website = m[1].replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
    if (stripLabel(l.text.replace(m[0], '')).length < 3) used.add(i);
  });
  if (!out.website && out.email && !FREE_MAIL.test(out.email.split('@')[1])) out.website = out.email.split('@')[1];
  // telefoni
  lines.forEach((l, i) => {
    if (EMAIL.test(l.text)) return;
    const segments = l.text.split(/(?=\b(?:tel|phone|ph|t|mob|mobile|cell|cel|m|fax|f)\b\.?\s*[:.]?\s*[+\d(])/i);
    let found = false;
    for (const seg of segments) {
      if (/^\s*(fax|f)\b/i.test(seg)) { found = true; continue; }
      for (const m of seg.match(PHONE) || []) {
        const n = digits(m).length, label = seg.slice(0, seg.indexOf(m));
        if (n > 15 || n < 7 || (n === 7 && !/\b(tel|telefono|t|phone|ph)\b/i.test(label))) continue;
        if (POSTAL_CITY.test(l.text) && STREET.test(l.text) && !/[+]/.test(m)) continue;
        found = true;
        const value = m.trim().replace(/\s{2,}/g, ' ');
        if (isMobile(m, label)) { if (!out.mobile) out.mobile = value; else if (!out.phone) out.phone = value; }
        else if (!out.phone) out.phone = value; else if (!out.mobile) out.mobile = value;
      }
    }
    if (found && digits(l.text).length >= 7) used.add(i);
  });
  // indirizzo (via + CAP/città, anche su due righe)
  const addr: number[] = [];
  lines.forEach((l, i) => { if (used.has(i)) return; if (STREET.test(l.text) || (POSTAL_CITY.test(l.text) && !ROLE.test(l.text))) addr.push(i); });
  if (addr.length) {
    const first = addr[0]; const group = addr.filter(i => i - first <= 2).slice(0, 3);
    out.address = group.map(i => stripLabel(lines[i].text)).join(', ').replace(/,\s*,/g, ',');
    group.forEach(i => used.add(i));
  }
  // ruolo
  lines.forEach((l, i) => { if (!out.role && !used.has(i) && ROLE.test(l.text) && !/\d{3,}/.test(l.text) && l.text.split(/\s+/).length <= 7 && !COMPANY.test(l.text.replace(ROLE, ''))) { out.role = l.text; used.add(i); } });

  // nome: 2-4 parole senza cifre; preferisce la riga che corrisponde all'email e quella più grande
  const local = out.email.split('@')[0].toLowerCase().split(/[._-]+/).filter(t => t.length > 2);
  const maxH = Math.max(1, ...lines.map(l => l.height || 0));
  let best = -1, bestScore = -Infinity;
  lines.forEach((l, i) => {
    if (used.has(i)) return;
    const words = l.text.replace(/[,;:]/g, '').split(/\s+/);
    if (words.length < 2 || words.length > 4 || /\d|@/.test(l.text)) return;
    if (!words.every(w => /^\p{Lu}/u.test(w) || /^(de|di|da|del|della|van|von|der|la|le|el|al|bin)$/i.test(w))) return;
    let score = 0;
    if (COMPANY.test(l.text)) score -= 4;
    if (local.some(t => l.text.toLowerCase().includes(t))) score += 4;
    if (local.length === 1 && local[0].length > 2 && words.some(w => w.toLowerCase().startsWith(local[0][0])) ) score += 0.5;
    if (words.every(w => /^\p{Lu}\p{Ll}/u.test(w) || w.length <= 3)) score += 1.5; // "Mario Rossi" più di "MARIO ROSSI"
    score += 2 * ((l.height || 0) / maxH);
    score -= i * 0.05;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) { out.name = /^[\p{Lu}\s'-]+$/u.test(lines[best].text) ? titleCase(lines[best].text) : lines[best].text; used.add(best); }

  // azienda: riga con forma societaria o parola chiave; altrimenti la più grande rimasta; altrimenti dal dominio
  let comp = lines.findIndex((l, i) => !used.has(i) && COMPANY.test(l.text) && !/@/.test(l.text));
  if (comp < 0) {
    const rest = lines.map((l, i) => ({ l, i })).filter(({ l, i }) => !used.has(i) && !/\d{4,}|@/.test(l.text) && l.text.length >= 2);
    rest.sort((a, b) => (b.l.height || 0) - (a.l.height || 0) || a.i - b.i);
    if (rest[0] && (rest[0].l.height || 0) >= maxH * 0.6) comp = rest[0].i;
  }
  if (out.role) out.role = out.role.charAt(0).toUpperCase() + out.role.slice(1);
  if (comp >= 0) { out.company = lines[comp].text; used.add(comp); }
  else if (out.website) { const host = out.website.split('/')[0].replace(/^www\./, '').split('.')[0]; if (host.length > 2) out.company = host.charAt(0).toUpperCase() + host.slice(1); }
  return out;
}

/** Converte l'uscita TSV di Tesseract in righe con altezza (per distinguere nome/azienda in grande). */
export function tsvToLines(tsv: string): CardLine[] {
  const lines = new Map<string, { words: string[]; height: number; top: number }>();
  for (const row of tsv.split('\n')) {
    const c = row.split('\t'); if (c.length < 12) continue;
    const key = `${c[1]}.${c[2]}.${c[3]}.${c[4]}`;
    if (c[0] === '4') lines.set(key, { words: [], height: Number(c[9]), top: Number(c[7]) });
    else if (c[0] === '5' && c[11]?.trim() && Number(c[10]) >= 0) lines.get(key)?.words.push(c[11].trim());
  }
  return [...lines.values()].filter(l => l.words.length).sort((a, b) => a.top - b.top).map(l => ({ text: l.words.join(' '), height: l.height }));
}
