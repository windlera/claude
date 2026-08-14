const API_URL = 'https://api.openai.com/v1/responses';

export const id = 'openai';
export const label = 'ChatGPT';

export function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function run(promptText) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      input: promptText,
      tools: [{ type: 'web_search_preview' }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();

  const text = data.output_text ?? extractTextFallback(data);

  const citations = [];
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && ann.url) {
          citations.push({ url: ann.url, title: ann.title || ann.url });
        }
      }
    }
  }

  return { provider: id, text, citations, raw: data };
}

function extractTextFallback(data) {
  try {
    return (data.output ?? [])
      .filter((i) => i.type === 'message')
      .flatMap((i) => i.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text)
      .join('\n');
  } catch {
    return '';
  }
}
