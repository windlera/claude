# Visibly — AI Search Visibility Tracker

A working clone of the core idea behind [peec.ai](https://peec.ai): track how
often (and how) your brand shows up when people ask AI assistants — ChatGPT,
Perplexity, Gemini — questions relevant to your business.

You define a **brand** and its **competitors**, add **prompts** (questions
your customers might ask an AI assistant), run them, and the app calls the
real provider APIs, detects brand/competitor mentions and citations in the
answers, and builds a visibility dashboard: visibility score, share of voice,
trend over time, per-provider breakdown, sentiment, and cited sources.

This performs real, live API calls — you need your own API keys and calls
are billed by each provider.

## Structure

```
peec-clone/
  server/   Express + SQLite API that calls OpenAI / Perplexity / Gemini
  client/   React (Vite) dashboard
```

## Setup

### 1. Server

```bash
cd peec-clone/server
npm install
cp .env.example .env
# edit .env and add at least one of:
#   OPENAI_API_KEY=...
#   PERPLEXITY_API_KEY=...
#   GEMINI_API_KEY=...
npm run dev
```

Runs on `http://localhost:8787`. Data is stored in `server/data.sqlite`
(SQLite, created automatically).

- **OpenAI**: uses the Responses API with the `web_search_preview` tool
  (model `gpt-4.1` by default) so answers can include real citations.
- **Perplexity**: uses `sonar` via the Chat Completions API, which returns
  citations natively.
- **Gemini**: uses `gemini-2.0-flash` with Google Search grounding enabled,
  which returns grounded citations.

You only need to configure the providers you care about — prompts run
against whichever providers have a key set.

### 2. Client

```bash
cd peec-clone/client
npm install
npm run dev
```

Runs on `http://localhost:5174` and proxies `/api` requests to the server.

## How it works

1. **Brand setup** — name, domain, and a list of competitors (name + domain).
2. **Prompts** — add natural-language questions to track. Hit "Run" to send
   the prompt to every configured provider right now.
3. Each run is analyzed:
   - **Mention detection**: does the brand/competitor name appear in the
     answer text, or does a cited source's domain match?
   - **Sentiment**: a lightweight heuristic over the sentence(s) mentioning
     the brand (positive/neutral/negative word lists) — no extra API call.
   - **Citations**: URLs the provider's web search / grounding actually
     surfaced.
4. **Dashboard** aggregates all runs for a brand into a visibility score,
   share of voice vs. competitors, a trend line, per-provider scores,
   sentiment split, and the most-cited sources.

## Notes / limitations

- Sentiment analysis is a simple heuristic, not an LLM judgment — swap in a
  classification call to any provider if you want higher fidelity.
- Web-search/citation support depends on each provider's API; if a provider
  changes its API shape, adjust the corresponding file in
  `server/providers/`.
- No auth/multi-tenant support — this is a single-user local app, not a
  hosted SaaS.
