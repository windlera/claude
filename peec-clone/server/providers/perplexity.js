const API_URL = 'https://api.perplexity.ai/chat/completions';

export const id = 'perplexity';
export const label = 'Perplexity';

export function isConfigured() {
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

export async function run(promptText) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Perplexity ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';

  const rawCitations = data.citations ?? data.search_results ?? [];
  const citations = rawCitations.map((c) =>
    typeof c === 'string' ? { url: c, title: c } : { url: c.url, title: c.title || c.url }
  );

  return { provider: id, text, citations, raw: data };
}
