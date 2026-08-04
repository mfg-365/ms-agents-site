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

/** Step-by-step UI instructions and marketing CTAs aren't capability bullets. */
const PROCEDURAL = [
  /\s>\s/,                                    // "Settings > Interpreter > Turn on"
  /^(select|click|tap|choose|go to|open|under|from the|in|on the|navigate|enter|type|have)\b/i,
  /^(visit|review|discover|assign|start using|search for|download|install|sign up)\b/i,
  /\bsearch box\b|\bdropdown menu\b|\bapps list\b/i,
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
    if (t.length >= 80 && t.length <= 600 && !isNoise(t) && /[.!?]$/.test(t) && (t.match(/\s/g) || []).length >= 12) {
      paras.push(t);
    }
    if (paras.length >= 12) break;
  }

  const bullets = [];
  const li = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = li.exec(scope))) {
    const t = stripTags(m[1]);
    // Real capability bullets are sentence-like, not nav labels or link lists.
    if (t.length >= 40 && t.length <= 220 && !isNoise(t) && (t.match(/\s/g) || []).length >= 5) {
      bullets.push(t);
    }
    if (bullets.length >= 25) break;
  }

  return { paras, bullets };
}

async function fetchArticle(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
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

  const { paras, bullets } = extractBody(html);
  return { url, title, description, paras, bullets, fetched: new Date().toISOString() };
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
function buildOverview(agent, articles) {
  const out = [];
  const seen = new Set();
  const deckKey = agent.description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);

  const push = (raw) => {
    const t = trimCta(raw);
    if (!t || t.length < 60 || isNoise(t)) return;
    const key = t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!key || seen.has(key) || key === deckKey) return;
    seen.add(key);
    out.push(t);
  };

  // Prefer official docs (support/learn) over blog marketing prose.
  const rank = (a) => (/support\.microsoft\.com/.test(a.url) ? 0
    : /learn\.microsoft\.com/.test(a.url) ? 1 : 2);
  const ordered = [...articles].sort((a, b) => rank(a) - rank(b));

  for (const a of ordered) {
    if (a.description) push(a.description);
    for (const p of a.paras.slice(0, 3)) push(p);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
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

  // Unique URL set across all agents.
  const urls = [...new Set(data.agents.flatMap((a) => a.links.map((l) => l.url)))];
  console.log(`Articles to resolve: ${urls.length} (cached: ${urls.filter((u) => cache[u]).length})`);

  let ok = 0, failed = 0, skipped = 0;
  for (const url of urls) {
    if (cache[url] && !cache[url].error) { skipped++; continue; }
    // PPTX/PDF assets aren't scrapable prose.
    if (/\.(pptx|pdf|docx)(\?|$)/i.test(url) || /view\.officeapps\.live\.com/i.test(url)) {
      cache[url] = { url, skip: 'binary' };
      skipped++;
      continue;
    }
    try {
      cache[url] = await fetchArticle(url);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      cache[url] = { url, error: e.message };
      failed++;
      process.stdout.write('x');
    }
    await new Promise((r) => setTimeout(r, 220)); // be polite
  }
  process.stdout.write('\n');
  console.log(`fetched ${ok}, failed ${failed}, skipped ${skipped}`);

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

  // Enrich each agent.
  let enriched = 0;
  for (const agent of data.agents) {
    const articles = agent.links
      .map((l) => cache[l.url])
      .filter((a) => a && !a.error && !a.skip && (a.description || a.paras?.length));

    agent.overview = buildOverview(agent, articles);
    const { highlights, limitations } = buildHighlights(agent, articles);
    agent.highlights = highlights;
    agent.limitations = limitations;

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
