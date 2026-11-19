// "Perché ti interessa" as a judgment, without AI.
//
// Reads which way the facts point (records and growth, or losses, resignations
// and investigations) in this discovery and in what you saved on the same
// subject before, and the subject's field from Wikipedia; then states, in one
// or two sentences, what the moment is and why it matters to someone like you.
// For places, events, products and recipes the judgment comes from their data.

const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Signals: pattern -> the noun phrase used in the sentence.
const UP = [
  [/\brecord\b/, 'risultati record'],
  [/batte le attese|sopra le attese|supera (le )?attese|meglio del previsto/, 'attese superate'],
  [/(ricavi|fatturato|utile|vendite)[^.]{0,60}(\+\s?\d|aumento|crescit|raddopp)|(\+\s?\d+[,.]?\d*\s?%)/, 'conti in forte crescita'],
  [/\bipo\b|quotazion|debutto in borsa/, 'un debutto in Borsa'],
  [/accordo|partnership|acquisizion|investimento da/, 'nuovi accordi'],
  [/premi[oa]t|\bpremia\b|riconosciment|vince|vittoria|conquista/, 'un riconoscimento'],
  [/imbattut|mai perso|serie positiva|striscia positiva/, 'una serie positiva'],
  [/lancia|presenta|nuovo modello|novità/, 'una novità importante'],
];
const DOWN = [
  [/ribass|crollo|crolla|in calo|cala\b|perdit[ae] settimanal|scende|giù del/, 'un titolo in calo'],
  [/dimission|lascia l'incarico|si dimette|addio del ceo/, 'un cambio al vertice'],
  [/indag|inchiesta|sec indaga|procura|accusa|sotto inchiesta/, "un'indagine in corso"],
  [/tagli|licenzia|esuberi/, 'tagli al personale'],
  [/crisi|difficolt|allarme|rischio/, 'segnali di difficoltà'],
  [/limita|vieta|bando|stretta (su|sul|sull|sulle|sugli|contro)|sanzion|dazi/, 'nuove restrizioni'],
  [/condannat|processo|tribunale/, 'una vicenda giudiziaria'],
  [/infortun|stop|fermo ai box|slitta/, 'uno stop forzato'],
];
const found = (text, list) => list.filter(([re]) => re.test(text)).map(([, label]) => label);
const unique = a => [...new Set(a)];
const list2 = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}` : a[0] || '');
const fact = (points, label) => points.find(p => p.startsWith(label))?.slice(label.length).replace(/^:\s*/, '').trim() || '';

// Only the parts of the text about the subject count: "IPO da record di Anthropic,
// mentre Nvidia segna ribassi" says nothing good about Nvidia.
const CLAUSES = /[.;!?]\s+|,?\s+(?:mentre|invece|ma|però|tuttavia|whereas|while)\s+/i;
function about(text, subject, title = '', strict = false) {
  const key = fold(subject).split(/\s+/)[0];
  if (!key || key.length < 3) return strict ? '' : fold(text);
  // Earlier articles: only their sentences that name the subject.
  if (strict) return String(text).split(CLAUSES).map(fold).filter(p => p.includes(key)).join(' . ');
  // Other subjects named in the title ("Anthropic" in "IPO di Anthropic mentre Nvidia…"):
  // a clause about one of them, and not about ours, is left out.
  const rivals = (String(title).match(/\b\p{Lu}[\p{L}\p{N}]{2,}/gu) || []).map(fold).filter(n => n !== key && n.length >= 4 && !/^(il|lo|la|le|gli|un|una|per|con|come|dopo|ecco|oggi)$/.test(n));
  const parts = String(text).split(CLAUSES).map(fold).filter(p => p.includes(key) || !rivals.some(r => p.includes(r)));
  return parts.length ? parts.join(' . ') : fold(text);
}

/**
 * @param subject   main subject ("Nvidia"), or ''
 * @param sector    its field from Wikipedia ("semiconduttori"), or ''
 * @param kind      eat, stay, visit, buy, event, cook, read, watch…
 * @param title, points  this discovery
 * @param before    titles and key points of what you saved on the same subject (strings)
 * @param follows   how many things you have saved on the subject, this one included
 * @param interest  an interest of yours it belongs to ("tecnologia"), or ''
 * @returns a judgment, or '' when there is nothing sound to say
 */
export function judge({ subject = '', sector = '', kind = '', title = '', points = [], before = [], follows = 0, interest = '', withYou = true }) {
  const now = about([title, ...points].join('. '), subject, title);
  const then = about(before.join('. '), subject, title, true);
  const S = subject || 'Il tema';
  const field = sector || interest;
  // Why it matters to you, said once and plainly.
  const forYou = follows >= 3 ? `Per chi, come te, lo segue da vicino, è un passaggio da non perdere.`
    : field ? `È un segnale da tenere d'occhio per chi si interessa di ${field}.`
    : '';

  // Places, events, products, recipes: judged on their own data.
  if (kind === 'eat' || kind === 'stay' || kind === 'visit') {
    const rating = Number((fact(points, 'Valutazione').match(/[\d,.]+/) || ['0'])[0].replace(',', '.'));
    const where = fact(points, 'Indirizzo').split(',').pop()?.trim();
    const cuisine = fact(points, 'Cucina').toLowerCase();
    const what = kind === 'eat' ? `Un indirizzo${cuisine ? ` di cucina ${cuisine}` : ''}` : kind === 'stay' ? 'Un posto dove dormire' : 'Un posto da vedere';
    const quality = rating >= 4.5 ? ' molto apprezzato' : rating >= 4 ? ' ben recensito' : '';
    return `${what}${quality}${where ? ` a ${where}` : ''}: ${rating >= 4.5 ? 'vale la deviazione' : 'da provare'}${where ? ` la prossima volta che ci passi` : ' quando capita l’occasione'}.`;
  }
  if (kind === 'event') {
    const when = fact(points, 'Quando'); const where = fact(points, 'Dove');
    return `Un appuntamento${where ? ` a ${where}` : ''}${when ? ` il ${when}` : ''}: ${interest ? `in linea con il tuo interesse per ${interest}, ` : ''}conviene decidere per tempo.`;
  }
  if (kind === 'buy') {
    const price = fact(points, 'Prezzo'); const brand = fact(points, 'Marca');
    return `${brand ? `Un pezzo di ${brand}` : 'Un acquisto'}${price ? ` da ${price}` : ''}: ${/non disponibile/i.test(points.join(' ')) ? 'ora non è disponibile, ma vale la pena tenerlo d’occhio' : 'da valutare con calma, confrontando le alternative'}.`;
  }
  if (kind === 'cook') {
    const time = fact(points, 'Tempo');
    return `Una ricetta${time ? ` da ${time}` : ''}: ${/\d+\s?min/.test(time) && !/h/.test(time) ? 'alla portata di una sera qualunque' : 'da tenere per quando hai tempo'}.`;
  }

  // News and stories: which way the facts point, now and before. Only for a named
  // subject (a company, a person, a team): "the topic is doing well" says nothing.
  if (!subject) return '';
  const up = unique(found(now, UP)); const down = unique(found(now, DOWN));
  const upBefore = unique(found(then, UP)); const downBefore = unique(found(then, DOWN));
  let judgment = '';
  if (up.length && down.length) judgment = `${S} vive una fase contrastata: ${list2(up.slice(0, 2))}, ma anche ${list2(down.slice(0, 2))}.`;
  else if (down.length && upBefore.length) judgment = `Il quadro su ${S} sta cambiando: dopo ${list2(upBefore.slice(0, 1))}, ora ${list2(down.slice(0, 2))}.`;
  else if (up.length && downBefore.length) judgment = `${S} sta reagendo: dopo ${list2(downBefore.slice(0, 1))}, ${up.length > 1 ? 'arrivano' : 'arriva'} ${list2(up.slice(0, 2))}.`;
  else if (down.length) judgment = `Per ${S} è un momento delicato: ${list2(down.slice(0, 2))}.`;
  else if (up.length) judgment = `${S} è in una fase favorevole: ${list2(up.slice(0, 2))}.`;
  if (!judgment) return '';
  return [judgment, withYou ? forYou : ''].filter(Boolean).join(' ');
}
