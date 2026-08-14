function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameRegex(name) {
  return new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function mentionsEntity(text, citations, name, domain) {
  if (name && nameRegex(name).test(text)) return true;
  if (domain) {
    const host = domain.replace(/^www\./, '').toLowerCase();
    if (citations.some((c) => domainFromUrl(c.url).toLowerCase().includes(host))) return true;
  }
  return false;
}

const POSITIVE_WORDS = [
  'best', 'excellent', 'great', 'leading', 'top', 'trusted', 'innovative', 'reliable',
  'popular', 'recommended', 'outstanding', 'superior', 'favorite', 'love',
  'powerful', 'impressive', 'strong', 'affordable', 'easy to use',
];
const NEGATIVE_WORDS = [
  'worst', 'bad', 'poor', 'disappointing', 'unreliable', 'expensive', 'issue',
  'problem', 'complaint', 'lacking', 'limited', 'weak', 'buggy',
  'overpriced', 'difficult', 'confusing', 'avoid',
];

/** Cheap heuristic sentiment for the sentence(s) mentioning `name`, no extra API call. */
export function sentimentAround(text, name) {
  if (!name) return 'neutral';
  const sentences = text.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter((s) => nameRegex(name).test(s));
  const scope = relevant.length ? relevant.join(' ') : text;
  const lower = scope.toLowerCase();

  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 1;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 1;

  if (!relevant.length) return null;
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

export function analyzeRun({ text, citations }, brand) {
  const competitors = JSON.parse(brand.competitors || '[]');

  const brandMentioned = mentionsEntity(text, citations, brand.name, brand.domain);
  const competitorMentions = {};
  for (const c of competitors) {
    competitorMentions[c.name] = mentionsEntity(text, citations, c.name, c.domain);
  }
  const sentiment = brandMentioned ? sentimentAround(text, brand.name) : null;

  return { brandMentioned, competitorMentions, sentiment };
}

export function buildDashboard(brand, runs) {
  const competitors = JSON.parse(brand.competitors || '[]');
  const total = runs.length;
  const okRuns = runs.filter((r) => r.status === 'ok');

  const brandMentionCount = okRuns.filter((r) => r.brand_mentioned).length;
  const visibilityScore = okRuns.length ? Math.round((brandMentionCount / okRuns.length) * 100) : 0;

  const shareOfVoice = { [brand.name]: brandMentionCount };
  for (const c of competitors) shareOfVoice[c.name] = 0;
  for (const r of okRuns) {
    const cm = JSON.parse(r.competitor_mentions || '{}');
    for (const [name, mentioned] of Object.entries(cm)) {
      if (mentioned) shareOfVoice[name] = (shareOfVoice[name] || 0) + 1;
    }
  }

  const byProvider = {};
  for (const r of okRuns) {
    byProvider[r.provider] ??= { total: 0, mentioned: 0 };
    byProvider[r.provider].total += 1;
    if (r.brand_mentioned) byProvider[r.provider].mentioned += 1;
  }
  const providerBreakdown = Object.entries(byProvider).map(([provider, v]) => ({
    provider,
    visibilityScore: v.total ? Math.round((v.mentioned / v.total) * 100) : 0,
    runs: v.total,
  }));

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const r of okRuns) {
    if (r.sentiment && sentimentCounts[r.sentiment] !== undefined) sentimentCounts[r.sentiment] += 1;
  }

  const citationsSeen = new Map();
  for (const r of okRuns) {
    for (const c of JSON.parse(r.citations || '[]')) {
      if (!c.url) continue;
      const key = c.url;
      const entry = citationsSeen.get(key) || { ...c, count: 0 };
      entry.count += 1;
      citationsSeen.set(key, entry);
    }
  }
  const recentCitations = [...citationsSeen.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  const byDay = new Map();
  for (const r of okRuns) {
    const day = r.created_at.slice(0, 10);
    const entry = byDay.get(day) || { day, total: 0, mentioned: 0 };
    entry.total += 1;
    if (r.brand_mentioned) entry.mentioned += 1;
    byDay.set(day, entry);
  }
  const trend = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ day: d.day, visibilityScore: d.total ? Math.round((d.mentioned / d.total) * 100) : 0 }));

  return {
    totalRuns: total,
    visibilityScore,
    shareOfVoice,
    providerBreakdown,
    sentimentCounts,
    recentCitations,
    trend,
  };
}
