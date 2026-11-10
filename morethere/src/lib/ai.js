// AI Context Builder — same output format as the original prototype, extended
// with the source of each entry so the assistant can tell whose it is.

export function buildAIContext(data, { heading = 'MORETHERE — PERSONAL CONTEXT', source } = {}) {
  const lines = [
    heading,
    'Use these references to answer my next request. Distinguish notes from external sources. Do not assume links were verified.',
  ];
  if (source) lines.push(`Shared with permission by: ${source}`);
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
  return lines.join('\n');
}

export function fromExportRows(rows) {
  return rows.map(r => ({
    title: r.title, url: r.url, note: r.note, category: r.category,
    collection: r.collection, from: r.added_by_name,
  }));
}
