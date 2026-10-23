// Collegamento opzionale all'API Claude (Messages API). Attivo solo se ANTHROPIC_API_KEY è impostata.
// Riferimento: https://docs.claude.com/en/api/overview
import type { LanguageModel } from '../core/deps';

export class ClaudeModel implements LanguageModel {
  constructor(private apiKey: string, private model: string) {}
  async complete(system: string, user: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.model, max_tokens: 600, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json() as { content: { type: string; text?: string }[] };
      return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    } finally { clearTimeout(timer); }
  }
}
