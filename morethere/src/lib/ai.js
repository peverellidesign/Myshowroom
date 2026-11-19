// AI Context Builder — same output format as the original prototype, extended
// with the source of each entry so the assistant can tell whose it is.

export function buildAIContext(data, { heading = 'MORETHERE — PERSONAL CONTEXT', source, scope, request } = {}) {
  const lines = [
    heading,
    'Use these references to answer my next request. Distinguish notes from external sources. Do not assume links were verified.',
  ];
  if (source) lines.push(`Shared with permission by: ${source}`);
  if (scope) lines.push(`Scope: ${scope}`);
  lines.push('');
  data.forEach((i, n) => {
    const parts = [
      `${n + 1}. ${i.title}`,
      `Category: ${i.category}`,
      ...(i.memory_date ? [`Date: ${i.memory_date}`] : []),
      `Collection: ${i.collection || '—'}`,
      `URL: ${i.url || '—'}`,
      `Note: ${i.note || '—'}`,
    ];
    if (i.from) parts.push(`From: ${i.from}`);
    lines.push(parts.join('\n'));
  });
  if (request) lines.push('', `My request: ${request}`);
  return lines.join('\n');
}

export function fromExportRows(rows) {
  return rows.map(r => ({
    title: r.title, url: r.url, note: r.note, category: r.category,
    collection: r.collection, from: r.added_by_name,
  }));
}

// A link can carry about 14,000 characters (Claude and ChatGPT sit behind proxies
// that refuse longer addresses). To make a whole archive fit, the text for the link
// drops empty fields, morethere's own lines and tracking parameters, and shortens
// long notes; the clipboard still holds everything.
export const LINK_LIMIT = 14000;
export const encodeForLink = t => encodeURIComponent(t).replace(/%20/g, '+');
export function compactForLink(text, noteMax = 280) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let l = raw.trim() ? raw : '';
    if (/^(Collection|URL|Note): —$/.test(l)) continue;
    if (/^(Perché ti interessa:|Contesto:|— )/.test(l.trim())) continue;
    l = l.replace(/^URL: (\S+?)[?#]\S*$/, 'URL: $1').replace(/^•\s*/, '- ').replace(/^Category: /, 'Type: ');
    if (l.length > noteMax) l = l.slice(0, l.lastIndexOf(' ', noteMax) > 0 ? l.lastIndexOf(' ', noteMax) : noteMax) + ' […]';
    if (!l && !out[out.length - 1]) continue;
    out.push(l);
  }
  return out.join('\n');
}
/** The longest version of `text` that fits in a link, or '' when even the shortest does not. */
export function textForLink(text) {
  // Last resort: titles and links only (plus the request), the full notes stay in the clipboard.
  const bare = String(text).split('\n').filter(l => !l.trim() || /^(\d+\. |URL: |MORETHERE|Use these|Scope: |Shared with|My request: )/.test(l)).join('\n').replace(/^URL: —$/gm, '');
  for (const t of [text, compactForLink(text, 280), compactForLink(text, 120), compactForLink(text, 60), compactForLink(bare, 200)]) {
    if (encodeForLink(t).length <= LINK_LIMIT) return t;
  }
  return '';
}
