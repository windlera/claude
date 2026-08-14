export const id = 'gemini';
export const label = 'Gemini';

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function run(promptText) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join('\n');

  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const citations = chunks
    .map((c) => c.web && { url: c.web.uri, title: c.web.title || c.web.uri })
    .filter(Boolean);

  return { provider: id, text, citations, raw: data };
}
