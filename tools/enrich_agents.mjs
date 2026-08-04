/**
 * Enriches data/agents.json with richer detail pulled from each agent's own
 * public Microsoft articles (support.microsoft.com, learn.microsoft.com, blogs).
 *
 * For every agent we fetch its linked articles and extract:
 *   - a longer overview paragraph (article intro prose)
 *   - "What you can do" highlight bullets
 *   - per-link summaries so Resource tiles can describe themselves
 *
 * Everything written is quoted/derived from Microsoft's own published pages —
 * nothing is invented. Results are cached in tools/out/article-cache.json so
 * repeat runs are cheap and resilient to transient network failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AGENTS = path.join(ROOT, 'data', 'agents.json');
const CACHE = path.join(__dirname, 'out', 'article-cache.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ms-agents-site/1.0';

const FORCE = process.argv.includes('--force');

/**
 * Extra agent-specific documentation, hand-verified to return HTTP 200.
 *
 * Some deck links are shared between agents (Researcher and Analyst both point
 * at one launch blog), which otherwise yields identical overviews. Sources
 * listed here are read first so each agent gets its own voice, and are also
 * surfaced as resources when the deck doesn't already link them.
 */
const SUPPLEMENTAL = {
  researcher: [
    { label: 'Get started with Researcher', url: 'https://support.microsoft.com/en-us/Microsoft-365-Copilot/get-started-with-researcher-in-microsoft-365-copilot' },
    { label: 'Learn article', url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/researcher-agent' },
  ],
  analyst: [
    { label: 'Get started with Analyst', url: 'https://support.microsoft.com/en-us/Microsoft-365-Copilot/get-started-with-analyst-in-microsoft-365-copilot' },
  ],
  'workflows-agent': [
    { label: 'Get started with Workflows', url: 'https://support.microsoft.com/en-us/Microsoft-365-Copilot/get-started-with-workflows-in-microsoft-365-copilot' },
  ],
  'workforce-insights-agent': [
    { label: 'Learn article', url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/workforce-insights-agent' },
  ],
};

/* ----------------------------------------------------------------- helpers */

const decodeEntities = (s) =>
  (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

// Run twice: Tech Community double-encodes (&amp;nbsp;).
const decode = (s) => decodeEntities(decodeEntities(s));

const stripTags = (s) => normalizeQuotes(decode(String(s || '').replace(/<[^>]+>/g, ' '))).replace(/\s+/g, ' ').trim();

/** Curly quotes defeat plain-ASCII pattern matching, so fold them early. */
function normalizeQuotes(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2011/g, '-');
}

const meta = (html, re) => {
  const m = html.match(re);
  return m ? decode(m[1]).trim() : '';
};

/** Drop nav chrome, boilerplate, teaser cards and other non-prose noise. */
const NOISE = [
  /cookie|newsletter|sign in|feedback|table of contents|skip to main/i,
  /this browser is no longer|was this page helpful|^\s*(share|print|save)\s*$/i,
  /link copied to clipboard/i,
  /access to this page requires authorization/i,
  /^\s*tags\b|audience\s+enterprise|content types\s+products/i,
  /available on desktop and mobile/i,
  /\btry microsoft 365 copilot\b/i,
  // Blog teaser cards: "July 30 10 min read The next measure of AI momentum"
  /^[A-Z][a-z]+ \d{1,2}\s+\d+\s*min read/i,
  /\b\d+\s*min read\b/i,
  // Link-list bullets lifted from "related articles" rails
  /\|\s*Microsoft (Learn|Support)\s*$/i,
  // Customer testimonial pull-quotes
  /[–—-]\s*(Director|Senior|Manager|Head|VP|Chief|Lead)\b[^.]{0,40}$/i,
  /^\s*["'\u201c]/,
  // Marketing CTA fragments
  /^(learn more|read more|get started|watch the video)\b/i,
  /^\s*(visit|search for|download)\b.{0,60}$/i,
];

const isNoise = (t) => NOISE.some((re) => re.test(t));

/**
 * Admin, licensing and troubleshooting prose is accurate but makes a poor
 * "About this agent" opener, so it's excluded from the overview specifically.
 */
const NOT_OVERVIEW = [
  /^if the .{0,40}(agent )?is not available/i,
  /administrator has not enabled|managing agents in|admin center/i,
  /is currently available to .{0,60}subscribers|add-on license/i,
  /\blicense is required\b|\brequires a .{0,40}license\b/i,
  /^to (prompt|use|enable|turn on)\b.{0,60}\bmake sure\b/i,
  // "Learn about how X..." is doc-summary phrasing aimed at the reader, not a
  // description of the agent itself.
  /^learn (about|how|what|more)\b/i,
  /^(these|the following) .{0,40}(features|distinctions) are/i,
  /public preview program and might undergo/i,
];
const isOverviewNoise = (t) => NOT_OVERVIEW.some((re) => re.test(t));

/** Step-by-step UI instructions and marketing CTAs aren't capability bullets. */
const PROCEDURAL = [
  /\s>\s/,                                    // "Settings > Interpreter > Turn on"
  /^(select|click|tap|choose|go to|open|under|from the|in|on the|navigate|enter|type|have)\b/i,
  /^(visit|review|discover|assign|start using|search for|download|install|sign up)\b/i,
  /^you (will |'ll )?see\b|^you can (also )?(search|upload|attach)\b/i,
  /\bsearch box\b|\bdropdown menu\b|\bapps list\b|\bicon and then\b/i,
];
const isProcedural = (t) => PROCEDURAL.some((re) => re.test(t));

/** Title-case fragments are headings/link text, not real sentences. */
function isHeading(t) {
  const words = t.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length < 3) return true;
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
  return capped / words.length > 0.6 && !/[.!?]$/.test(t);
}

/** Constraint/limitation statements — surfaced separately as caveats. */
const LIMITATION = /\b(isn't|is not|aren't|are not|can't|cannot|doesn't|does not|not (yet )?(currently )?(supported|available))\b|\bonly (available|supported)\b|\bnot supported\b|\brequires?\b.*\blicense\b/i;
const isLimitation = (t) => LIMITATION.test(t);

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z"'\u201c])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pull the main article prose, skipping headers/nav. */
function extractBody(html) {
  // Prefer the semantic article container used by Learn/Support.
  const scope =
    (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [])[1] ||
    (html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [])[1] ||
    html;

  const paras = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(scope))) {
    const t = stripTags(m[1]);
    // Real prose: sentence-length, ends like a sentence, not a nav fragment.
    if (t.length >= 80 && t.length <= 700 && !isNoise(t) && /[.!?]$/.test(t) && (t.match(/\s/g) || []).length >= 12) {
      paras.push(t);
    }
    if (paras.length >= 16) break;
  }

  const bullets = [];
  const li = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = li.exec(scope))) {
    const t = stripTags(m[1]);
    // Real capability bullets are sentence-like, not nav labels or link lists.
    if (t.length >= 40 && t.length <= 240 && !isNoise(t) && (t.match(/\s/g) || []).length >= 5) {
      bullets.push(t);
    }
    if (bullets.length >= 30) break;
  }

  // Section-aware pass: keep each h2/h3 with the text that follows it, so we can
  // find scenario/example/"why use" content specifically.
  const sections = [];
  const hre = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const marks = [];
  while ((m = hre.exec(scope))) {
    marks.push({ title: stripTags(m[2]), start: m.index + m[0].length });
  }
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : scope.length;
    const chunk = scope.slice(mk.start, end);
    const items = [];
    let mm;
    const lre = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    while ((mm = lre.exec(chunk))) {
      const t = stripTags(mm[1]);
      if (t.length >= 30 && t.length <= 240 && !isNoise(t)) items.push(t);
    }
    const ps = [];
    const pre = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((mm = pre.exec(chunk))) {
      const t = stripTags(mm[1]);
      if (t.length >= 60 && t.length <= 700 && !isNoise(t)) ps.push(t);
    }
    if (mk.title && (items.length || ps.length)) {
      sections.push({ title: mk.title, items: items.slice(0, 10), paras: ps.slice(0, 6) });
    }
  });

  return { paras, bullets, sections };
}

async function fetchArticle(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });

  // learn/support throttle aggressively on bulk reads — back off and retry.
  if (res.status === 429 || res.status === 503) {
    if (attempt >= 4) throw new Error(`HTTP ${res.status} after retries`);
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 2000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait));
    return fetchArticle(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!/text\/html/i.test(ct)) throw new Error(`non-HTML (${ct.split(';')[0]})`);
  const html = await res.text();

  const title =
    meta(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i) ||
    meta(html, /<title[^>]*>([^<]+)</i);
  const description =
    meta(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)/i) ||
    meta(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)/i);

  const { paras, bullets, sections } = extractBody(html);
  return { url, title, description, paras, bullets, sections, fetched: new Date().toISOString() };
}

/* -------------------------------------------------------------------- main */

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

/** Tokens that signal a sentence is actually about THIS agent. */
function agentTerms(agent) {
  const base = agent.name.toLowerCase()
    .replace(/\bagent\b|\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !['the', 'and', 'for', 'microsoft', 'copilot'].includes(t));
  return [...new Set(base)];
}

const trimCta = (t) => dropSelfRename(t)
  .replace(/\s*(Learn more|Read more|Find out more)\.?\s*$/i, '')
  .trim();

/** Drop a self-referential rename artifact: "Foo, previously known as Foo." */
function dropSelfRename(t) {
  return String(t).replace(
    /\b([A-Z][\w ]{2,40}?),?\s*(?:previously|formerly) known as \1\b/gi, '$1');
}

/** Build a fuller overview: meta description + best intro paragraphs. */
function buildOverview(agent, articles, siblingNames, genericUrls) {
  const out = [];
  const seen = new Set();
  const deckKey = agent.description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
  const terms = agentTerms(agent);
  const isGeneric = (a) => genericUrls && genericUrls.has(a.url);

  const push = (raw) => {
    const t = trimCta(raw);
    if (!t || t.length < 60 || isNoise(t) || isOverviewNoise(t)) return;
    // Step-by-step UI instructions describe the how, not the what.
    if (isProcedural(t)) return;
    const key = t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!key || seen.has(key) || key === deckKey) return;
    seen.add(key);
    out.push(t);
  };

  // Read agent-specific sources first, then official docs, then blogs — so an
  // agent that shares a launch blog with a sibling still gets its own voice.
  const rank = (a) => (a.supplemental ? -1
    : /support\.microsoft\.com/.test(a.url) ? 0
    : /learn\.microsoft\.com/.test(a.url) ? 1 : 2);
  const ordered = [...articles].sort((a, b) => rank(a) - rank(b));

  // Prefer paragraphs that actually name this agent.
  const namesAgent = (t) => {
    const low = t.toLowerCase();
    return terms.some((x) => low.includes(x));
  };

  // When we have a dedicated article for this agent, prefer it. Falling
  // straight through to a shared launch blog would otherwise reintroduce the
  // generic "Researcher and Analyst" prose on both siblings' pages.
  const dedicated = ordered.filter((a) => a.supplemental);
  const sources = dedicated.length ? dedicated : ordered;

  // An article's own meta description is a curated summary — take it first,
  // unless the article is a hub page many agents share.
  for (const a of sources) if (a.description && !isGeneric(a)) push(a.description);

  for (const pass of [true, false]) {
    for (const a of sources) {
      if (isGeneric(a)) continue;
      for (const p of a.paras.slice(0, 8)) {
        if (!pass || namesAgent(p)) push(p);
      }
      if (out.length >= 4) break;
    }
    if (out.length >= 4) break;
  }

  // Dedicated sources can be thin; top up from the rest, but skip prose that
  // covers a sibling agent too (shared announcement blogs).
  if (out.length < 3) {
    const others = ordered.filter((a) => !a.supplemental && !isGeneric(a));
    const otherAgentNames = (siblingNames || []).filter((n) => !terms.includes(n));
    const mentionsSibling = (t) => {
      const low = t.toLowerCase();
      return otherAgentNames.some((n) => low.includes(n));
    };
    for (const a of others) {
      if (a.description && namesAgent(a.description) && !mentionsSibling(a.description)) push(a.description);
      for (const p of a.paras.slice(0, 8)) {
        if (namesAgent(p) && !mentionsSibling(p)) push(p);
      }
      if (out.length >= 3) break;
    }
  }

  // Last resort: some agents (Word/Excel/PowerPoint) are only ever documented
  // together, so a shared article is the sole accurate source. Allow it only
  // when this agent has no dedicated page of its own — otherwise we'd undo the
  // whole point and put sibling prose back on the page.
  if (out.length < 2 && !dedicated.length) {
    for (const a of ordered) {
      if (a.description) push(a.description);
      for (const p of a.paras.slice(0, 6)) push(p);
      if (out.length >= 3) break;
    }
  }
  return out.slice(0, 4);
}

/** Example prompts and use-case scenarios lifted from scenario-ish sections. */
const SCENARIO_HEAD = /example|scenario|use case|why use|how (do|to) you use|how to use|what can|try (it|these)|get the best|prompt|capabilit|what you can|ways to start|getting started/i;

function buildScenarios(agent, articles) {
  const terms = agentTerms(agent);
  const out = [];
  const seen = new Set();

  const push = (raw) => {
    let t = trimCta(raw)
      // Drop conversational lead-ins: "Wondering what it looks like? Researcher..."
      .replace(/^[^.?!]{0,70}\?\s+/, '')
      .replace(/\s*\.\s*$/, '')
      .trim();
    if (!t || t.length < 45 || t.length > 240) return;
    if (isNoise(t) || isHeading(t)) return;
    // Navigation steps and admin troubleshooting aren't scenarios.
    if (isProcedural(t) || isOverviewNoise(t)) return;
    // Fragments that trail off into a list ("...can include:") read badly alone.
    if (/[:：]$/.test(t)) return;
    const key = t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  // Quoted prompts ("Identify the key drivers for forecast variances") are the
  // clearest scenarios, so take those first wherever they appear.
  for (const a of articles) {
    for (const t of [...(a.bullets || []), ...(a.paras || [])]) {
      const q = t.match(/["\u201c]([^"\u201d]{35,200})["\u201d]/);
      if (q) push(q[1]);
    }
  }

  // Then scenario-flavoured sections, preferring agent-specific sources.
  const ordered = [...articles].sort((a, b) => (b.supplemental ? 1 : 0) - (a.supplemental ? 1 : 0));
  for (const a of ordered) {
    for (const s of a.sections || []) {
      if (!SCENARIO_HEAD.test(s.title)) continue;
      for (const item of s.items) push(item);
      for (const p of s.paras) if (p.length <= 240) push(p);
    }
  }

  // Rank agent-specific scenarios first.
  return out
    .map((t) => ({ t, score: terms.reduce((n, x) => n + (t.toLowerCase().includes(x) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.t);
}

/** Capability bullets and limitation caveats, cleaned and ranked by relevance. */
function buildHighlights(agent, articles) {
  const terms = agentTerms(agent);
  const caps = [];
  const limits = [];
  const seen = new Set();

  for (const a of articles) {
    for (let b of a.bullets) {
      b = trimCta(b).replace(/\s*\.\s*$/, '');
      if (b.length < 40 || b.length > 200 || isNoise(b)) continue;
      const key = b.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
      if (seen.has(key)) continue;
      seen.add(key);

      const low = b.toLowerCase();
      // Sentences naming this agent rank above generic shared-article bullets.
      const score = terms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);

      if (isLimitation(b)) limits.push({ b, score });
      else if (!isProcedural(b) && !isHeading(b)) caps.push({ b, score });
    }
  }

  const top = (arr, n) => arr.sort((x, y) => y.score - x.score).slice(0, n).map((s) => s.b);
  return { highlights: top(caps, 6), limitations: top(limits, 4) };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(AGENTS, 'utf8'));
  const cache = FORCE ? {} : loadCache();

  // Unique URL set across all agents, including supplemental docs.
  const urls = [...new Set([
    ...data.agents.flatMap((a) => a.links.map((l) => l.url)),
    ...Object.values(SUPPLEMENTAL).flat().map((l) => l.url),
  ])];
  console.log(`Articles to resolve: ${urls.length} (cached: ${urls.filter((u) => cache[u]).length})`);

  let ok = 0, failed = 0, skipped = 0, repaired = 0;
  for (const url of urls) {
    const prior = cache[url];
    if (prior && !prior.error) { skipped++; continue; }
    // PPTX/PDF assets aren't scrapable prose.
    if (/\.(pptx|pdf|docx)(\?|$)/i.test(url) || /view\.officeapps\.live\.com/i.test(url)) {
      cache[url] = { url, skip: 'binary' };
      skipped++;
      continue;
    }
    try {
      cache[url] = await fetchArticle(url);
      if (prior && prior.error) repaired++;
      ok++;
      process.stdout.write('.');
    } catch (e) {
      cache[url] = { url, error: e.message };
      failed++;
      process.stdout.write('x');
    }
    await new Promise((r) => setTimeout(r, 700)); // be polite; avoids throttling
  }
  process.stdout.write('\n');
  console.log(`fetched ${ok}${repaired ? ` (${repaired} repaired)` : ''}, failed ${failed}, skipped ${skipped}`);

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

  // Enrich each agent.
  let enriched = 0;
  // Distinctive name tokens across the catalog, used to spot prose that covers
  // a sibling agent rather than this one.
  const allNameTerms = data.agents.map((a) => ({ id: a.id, terms: agentTerms(a) }));

  // Hub pages linked by several agents (e.g. the Microsoft Adoption agents page)
  // describe the whole family, so their prose isn't specific to any one agent.
  const urlUse = {};
  data.agents.forEach((a) => a.links.forEach((l) => { urlUse[l.url] = (urlUse[l.url] || 0) + 1; }));
  const genericUrls = new Set(Object.keys(urlUse).filter((u) => urlUse[u] >= 3));
  if (genericUrls.size) {
    console.log(`Treating ${genericUrls.size} shared hub page(s) as generic:`);
    genericUrls.forEach((u) => console.log(`  ${urlUse[u]}x ${u}`));
  }

  for (const agent of data.agents) {
    const siblingNames = allNameTerms
      .filter((x) => x.id !== agent.id)
      .flatMap((x) => x.terms);
    const extra = SUPPLEMENTAL[agent.id] || [];

    // Surface supplemental docs as resources when the deck doesn't link them.
    for (const l of extra) {
      if (!agent.links.some((x) => x.url === l.url)) agent.links.push({ ...l });
    }

    const usable = (u, supplemental) => {
      const a = cache[u];
      if (!a || a.error || a.skip) return null;
      if (!a.description && !(a.paras && a.paras.length)) return null;
      return { ...a, supplemental };
    };

    const articles = [
      ...extra.map((l) => usable(l.url, true)),
      ...agent.links
        .filter((l) => !extra.some((e) => e.url === l.url))
        .map((l) => usable(l.url, false)),
    ].filter(Boolean);

    agent.overview = buildOverview(agent, articles, siblingNames, genericUrls);
    const { highlights, limitations } = buildHighlights(agent, articles);
    agent.highlights = highlights;
    agent.limitations = limitations;
    // Scenarios and highlights draw from the same articles, so drop any
    // scenario already shown under "What you can do".
    const shown = new Set(highlights.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45)));
    agent.scenarios = buildScenarios(agent, articles)
      .filter((s) => !shown.has(s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45)));

    // Give each resource tile a one-line summary.
    agent.links = agent.links.map((l) => {
      const a = cache[l.url];
      const raw = a && !a.error && !a.skip ? trimCta(a.description || '') : '';
      const summary = raw && !isNoise(raw) ? raw.slice(0, 220) : '';
      return summary ? { ...l, summary } : l;
    });

    if (agent.overview.length || agent.highlights.length) enriched++;
  }

  data.enriched = new Date().toISOString();
  fs.writeFileSync(AGENTS, JSON.stringify(data, null, 1));
  console.log(`Enriched ${enriched}/${data.agents.length} agents with article detail.`);

  const thin = data.agents.filter((a) => !a.overview.length).map((a) => a.name);
  if (thin.length) console.log('No extra detail found for:', thin.join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
