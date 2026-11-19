// What a discovery is about, and whether that is one of your interests — no AI.
//
// Each theme has a list of word stems; a discovery belongs to the theme with
// the most hits (title and key points, its field from Wikipedia, its kind).
// Your interests are the themes you save most often, or the ones you wrote in
// your profile. The reason (shown after "Perché ti interessa:") is given only when the two meet.

const fold = s => ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, ' ')} `;

export const THEMES = [
  { id: 'economy', to: 'ai temi economici', phrase: 'i temi economici', profile: ['economia', 'finanza', 'finance', 'business', 'investimenti', 'borsa', 'impresa', 'imprese', 'lavoro'],
    words: [' economi', ' finanz', ' borsa', ' mercat', ' azion', ' investiment', ' banca', ' banche', ' ricavi', ' fatturat', ' utile ', ' bilanci', ' impres', ' aziend', ' attivita commercial', ' attivita storiche', ' negozi', ' botteg', ' commerc', ' marchio', ' fisco', ' tasse', ' pil ', ' inflazion', ' lavoro', ' occupazion', ' export', ' dazi', ' ipo ', ' quotazion', ' startup', ' manovra', ' legge di bilancio', ' euro ', ' dollari'] },
  { id: 'tech', to: 'alla tecnologia', phrase: 'la tecnologia', profile: ['tech', 'tecnologia', 'technology', 'ai', 'innovazione', 'digitale'],
    words: [' tecnolog', ' nvidia', ' apple', ' google', ' microsoft', ' meta ', ' zuckerberg', ' anthropic', ' openai', ' chip', ' semicondutt', ' software', ' intelligenza artificiale', ' smartphone', ' app ', ' digital', ' algoritm', ' robot', ' silicon valley', ' processori'] },
  { id: 'sport', to: 'allo sport', phrase: 'lo sport', profile: ['sport', 'calcio', 'fitness', 'running', 'tennis', 'bici'],
    words: [' partita', ' serie a', ' campionat', ' giornata', ' stadio', ' gol ', ' allenator', ' attaccant', ' fantacalcio', ' squadra', ' calcio', ' tennis', ' record di velocita', ' skate', ' atleta', ' olimpi', ' formula 1', ' motogp', ' sfida', ' match'] },
  { id: 'design', to: 'al design e all’arredamento', phrase: 'il design e l’arredamento', profile: ['design', 'architettura', 'architecture', 'interior', 'arredamento', 'casa'],
    words: [' design', ' architett', ' arred', ' mobili', ' divan', ' poltron', ' lampad', ' interni', ' furniture', ' mid-century', ' midcentury', ' flexform', ' cassina', ' biancheria', ' tessuti', ' progettist'] },
  { id: 'travel', to: 'ai viaggi', phrase: 'i viaggi', profile: ['travel', 'viaggi', 'viaggio', 'turismo', 'trip'], kinds: ['stay', 'visit'],
    words: [' viaggi', ' hotel', ' relais', ' resort', ' villa ', ' ville ', ' lago ', ' spiaggia', ' isola', ' volo ', ' voli ', ' itinerari', ' weekend', ' vacanz', ' turist', ' gstaad', ' b&b'] },
  { id: 'food', to: 'al buon cibo e ai ristoranti', phrase: 'il buon cibo e i ristoranti', profile: ['food', 'cibo', 'cucina', 'ristoranti', 'vino', 'gastronomia'], kinds: ['eat', 'cook'],
    words: [' ristorant', ' trattoria', ' osteria', ' cucina', ' ricett', ' chef', ' pizza', ' gelat', ' vino', ' cantina', ' piatto', ' menu ', ' food'] },
  { id: 'art', to: 'all’arte e alla cultura', phrase: 'l’arte e la cultura', profile: ['arte', 'art', 'cultura', 'mostre', 'musei'],
    words: [' mostra', ' museo', ' musei', ' artista', ' galleria', ' pittura', ' scultura', ' biennale', ' libro', ' scrittore', ' teatro', ' cinema'] },
  { id: 'fashion', to: 'alla moda', phrase: 'la moda', profile: ['moda', 'fashion', 'stile'], kinds: ['shop'],
    words: [' moda', ' fashion', ' stilista', ' sfilata', ' collezione', ' abito', ' scarpe', ' mocassin', ' prada', ' gucci', ' armani'] },
  { id: 'world', to: 'alla politica e all’attualità internazionale', phrase: 'la politica e l’attualità internazionale', profile: ['politica', 'esteri', 'attualita', 'news'],
    words: [' president', ' governo', ' vertice', ' ministr', ' elezion', ' parlament', ' trump', ' putin', ' xi ', ' guerra', ' ucraina', ' russia', ' cina ', ' ue ', ' nato'] },
];

const scores = (text, { kind = '', sector = '' } = {}) => {
  const t = fold(`${text} ${sector}`);
  return THEMES.map(th => ({ th, s: th.words.filter(w => t.includes(w)).length + (th.kinds?.includes(kind) ? 2 : 0) }));
};
/** The theme a text is mostly about, or null. */
export function themeOf(text, opts = {}) {
  const best = scores(text, opts).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 1 ? best.th : null;
}
/** Every theme a text clearly touches: its main one, plus any with two or more hits
 *  (news on Nvidia's results is technology and economy at once). */
export function themesOf(text, opts = {}) {
  const all = scores(text, opts).sort((a, b) => b.s - a.s);
  return all.filter((x, i) => x.s >= 2 || (i === 0 && x.s >= 1)).map(x => x.th.id);
}

/**
 * "Ti interessa perché…", when this discovery's theme is one of yours.
 * @param text   title and key points of the discovery
 * @param items  your other discoveries ({ id, title, note, url })
 * @param profile  { subtitle: "Design · Viaggi" } or null
 */
export function interestReason({ text, kind = '', sector = '', items = [], profile = null, selfId = '' }) {
  const theme = themeOf(text, { kind, sector });
  if (!theme) return '';
  // Declared in the profile.
  const declared = (profile?.subtitle || '').split(/[·,|/•]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (declared.some(d => theme.profile.includes(d))) return `Hai indicato ${theme.phrase} tra i tuoi interessi.`;
  // Shown by what you save (copies of the same link count once).
  const seen = new Set();
  let n = 0;
  for (const o of items) {
    if (o.id === selfId) continue;
    const key = String(o.url || o.title).replace(/[?#].*$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (themesOf(`${o.title} ${o.note || ''}`).includes(theme.id)) n += 1;
  }
  if (n >= 3) return `Segui spesso ${theme.phrase}.`;
  if (n >= 1) return `Ti stai avvicinando ${theme.to}.`;
  return '';
}

/** Every theme a text mentions at all (for comparing two discoveries). */
export function themesTouched(text, opts = {}) {
  return scores(text, opts).filter(x => x.s >= 1).map(x => x.th.id);
}
