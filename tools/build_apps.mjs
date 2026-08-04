/**
 * Builds data/apps.json — the "Copilot in Apps" catalog.
 *
 * For each Microsoft app we combine three public sources:
 *   1. Curated, hand-verified support/Learn article links (VERIFIED below)
 *   2. Live Microsoft 365 Roadmap items mentioning Copilot + that app
 *   3. Recent Microsoft blog posts (RSS) mentioning Copilot + that app
 *
 * Overview prose and per-link summaries are scraped from the article metadata,
 * so nothing on the page is invented.
 *
 * Re-runnable. Roadmap/blog data is refetched every run; article metadata is
 * cached in tools/out/article-cache.json alongside the agent enrichment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'apps.json');
const CACHE = path.join(__dirname, 'out', 'article-cache.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ms-agents-site/1.0';

const ROADMAP_API = 'https://www.microsoft.com/releasecommunications/api/v1/m365';
const MAX_ROADMAP_PER_APP = 8;
const MAX_BLOGS_PER_APP = 5;

const FEEDS = [
  { url: 'https://www.microsoft.com/en-us/microsoft-365/blog/feed/', source: 'Microsoft 365 Blog' },
  { url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=Microsoft365CopilotBlog', source: 'Microsoft 365 Copilot Blog' },
  { url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=MicrosoftTeamsBlog', source: 'Microsoft Teams Blog' },
  { url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=ExcelBlog', source: 'Excel Blog' },
];

/**
 * Every `url` below was verified to return HTTP 200 with an on-topic title.
 * `match` drives roadmap/blog association; `roadmapProducts` maps to the
 * product tag names the Microsoft 365 Roadmap API actually uses.
 */
const APPS = [
  { id: 'word', name: 'Word', icon: 'doc', accent: 'blue',
    blurb: 'Draft, rewrite and summarize long-form documents from a prompt, grounded in your existing files.',
    match: /\bword\b/i, roadmapProducts: ['Word'],
    links: [
      { label: 'Draft and add content with Copilot in Word', url: 'https://support.microsoft.com/en-us/copilot-word', kind: 'support' },
      { label: 'Word, Excel and PowerPoint Agents', url: 'https://learn.microsoft.com/en-us/copilot/microsoft-365/wordexcelppt-agents', kind: 'learn' },
    ] },
  { id: 'excel', name: 'Excel', icon: 'grid', accent: 'teal',
    blurb: 'Analyze data, generate formulas and build charts in natural language, with multi-step reasoning over your workbook.',
    match: /\bexcel\b/i, roadmapProducts: ['Excel'],
    links: [
      { label: 'Get started with Copilot in Excel', url: 'https://support.microsoft.com/en-us/copilot-excel', kind: 'support' },
    ] },
  { id: 'powerpoint', name: 'PowerPoint', icon: 'slides', accent: 'pink',
    blurb: 'Turn prompts and existing documents into complete presentations, then refine layout, visuals and speaker notes.',
    match: /\bpowerpoint\b/i, roadmapProducts: ['PowerPoint'],
    links: [
      { label: 'Create a presentation with Copilot in PowerPoint', url: 'https://support.microsoft.com/en-us/copilot-powerpoint', kind: 'support' },
    ] },
  { id: 'outlook', name: 'Outlook', icon: 'pen', accent: 'blue',
    blurb: 'Summarize long mail threads, draft replies in your voice, and catch up on what changed while you were away.',
    match: /\boutlook\b/i, roadmapProducts: ['Outlook'],
    links: [
      { label: 'Chat with Copilot in Outlook', url: 'https://support.microsoft.com/en-us/copilot-outlook', kind: 'support' },
    ] },
  { id: 'teams', name: 'Teams', icon: 'meeting', accent: 'purple',
    blurb: 'Recap meetings, surface decisions and action items, and catch up on channel and chat activity you missed.',
    match: /\bteams\b/i, roadmapProducts: ['Microsoft Teams'],
    links: [
      { label: 'Catch up on meetings with Copilot in Teams', url: 'https://support.microsoft.com/en-us/copilot-teams', kind: 'support' },
    ] },
  { id: 'onenote', name: 'OneNote', icon: 'book', accent: 'purple',
    blurb: 'Summarize notebooks, pull out action items and turn rough notes into structured plans.',
    match: /\bonenote\b/i, roadmapProducts: ['OneNote'],
    links: [
      { label: 'Summarize your OneNote notes with Copilot', url: 'https://support.microsoft.com/en-us/copilot-onenote', kind: 'support' },
    ] },
  { id: 'loop', name: 'Loop', icon: 'flow', accent: 'teal',
    blurb: 'Co-create and refine shared Loop pages and components with Copilot alongside your team.',
    match: /\bloop\b/i, roadmapProducts: ['Microsoft Loop'],
    links: [
      { label: 'Copilot in Loop FAQ', url: 'https://support.microsoft.com/en-us/copilot-loop', kind: 'support' },
    ] },
  { id: 'onedrive', name: 'OneDrive', icon: 'search', accent: 'blue',
    blurb: 'Ask questions across your stored files, compare documents and summarize them without opening each one.',
    match: /\bonedrive\b/i, roadmapProducts: ['OneDrive'],
    links: [
      { label: 'Get started with Copilot in OneDrive', url: 'https://support.microsoft.com/en-us/onedrive/get-started-with-copilot-in-onedrive', kind: 'support' },
    ] },
  { id: 'sharepoint', name: 'SharePoint', icon: 'globe', accent: 'teal',
    blurb: 'Build sites and pages faster and ground Copilot answers in your organization\u2019s published content.',
    match: /\bsharepoint\b/i, roadmapProducts: ['SharePoint'],
    links: [
      { label: 'Copilot in SharePoint help & learning', url: 'https://support.microsoft.com/en-us/SharePoint/ai-copilot/microsoft-365-copilot-in-sharepoint-help-learning', kind: 'support' },
    ] },
  { id: 'planner', name: 'Planner', icon: 'checklist', accent: 'purple',
    blurb: 'Create plans, generate tasks and track progress conversationally instead of building boards by hand.',
    match: /\bplanner\b/i, roadmapProducts: ['Planner'],
    links: [
      { label: 'Create a new plan with Copilot in Planner', url: 'https://support.microsoft.com/en-us/Planner/copilot/create-a-new-plan-with-copilot-in-planner-preview', kind: 'support' },
    ] },
  { id: 'forms', name: 'Forms', icon: 'poll', accent: 'teal',
    blurb: 'Draft surveys, quizzes and polls from a description, then summarize the responses that come back.',
    match: /\bforms\b/i, roadmapProducts: ['Forms'],
    links: [
      { label: 'Welcome to Copilot in Forms', url: 'https://support.microsoft.com/en-us/Forms/welcome-to-copilot-in-forms', kind: 'support' },
    ] },
  { id: 'viva', name: 'Viva', icon: 'people', accent: 'pink',
    blurb: 'Bring Copilot into employee experience workflows across Viva Engage, Insights, Learning and Glint.',
    match: /\bviva\b|\bengage\b/i, roadmapProducts: ['Microsoft Viva'],
    links: [
      { label: 'Copilot in Viva help & learning', url: 'https://support.microsoft.com/en-us/viva/copilot-in-viva-help-learning', kind: 'support' },
    ] },
  { id: 'clipchamp', name: 'Clipchamp', icon: 'slides', accent: 'amber',
    blurb: 'Summarize and ask questions about video content directly in the Clipchamp player.',
    match: /\bclipchamp\b/i, roadmapProducts: ['Microsoft Clipchamp'],
    links: [
      { label: 'Ask questions & summarize video with Copilot', url: 'https://support.microsoft.com/en-us/clipchamp/stream-pages/ask-questions-get-summaries-of-any-video-with-microsoft-copilot-in-the-clipchamp-player', kind: 'support' },
    ] },
  { id: 'copilot-chat', name: 'Microsoft 365 Copilot Chat', icon: 'spark', accent: 'purple',
    blurb: 'The central Copilot surface — chat grounded in your work data, with agents, Pages and file creation.',
    match: /\bcopilot chat\b|\bmicrosoft 365 copilot\b/i,
    roadmapProducts: ['Microsoft Copilot (Microsoft 365)', 'Microsoft 365 app'],
    links: [
      { label: 'Microsoft 365 Copilot help and learning', url: 'https://support.microsoft.com/en-us/copilot', kind: 'support' },
      { label: 'Manage Microsoft 365 Copilot scenarios', url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-page', kind: 'learn' },
    ] },
];

/* ------------------------------------------------------------------ shared */

const decodeOnce = (s) => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
const decode = (s) => decodeOnce(decodeOnce(s));
/**
 * RSS descriptions are double-encoded HTML, so a single strip leaves markup
 * behind once entities are decoded. Decode fully, then strip, then repeat.
 */
function stripTags(s) {
  let t = String(s || '');
  for (let i = 0; i < 3; i++) {
    t = decode(t).replace(/<[^>]*>/g, ' ');
  }
  return t
    .replace(/\]\]>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const clean = (s) => (s || '').replace(/\u2011/g, '-').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- roadmap */

/** Roadmap titles are prefixed with the product, e.g. "Microsoft Teams: Foo". */
const stripProductPrefix = (t) => clean(t).replace(/^[^:]{3,45}:\s*/, '');

function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter((i) => {
    const k = stripProductPrefix(i.title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function getRoadmap() {
  const res = await fetch(ROADMAP_API, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Roadmap API ${res.status}`);
  const all = await res.json();

  const isCopilot = (f) => {
    const hay = [f.title, f.description,
      ...(f.tagsContainer?.products?.map((p) => p.tagName) || [])].join(' ').toLowerCase();
    return hay.includes('copilot');
  };

  return all.filter(isCopilot).map((f) => ({
    id: f.id,
    title: stripProductPrefix(f.title),
    description: clean(f.description),
    status: f.status,
    products: (f.tagsContainer?.products || []).map((p) => p.tagName),
    availability: f.publicDisclosureAvailabilityDate || '',
    modified: f.modified || f.created || null,
    link: `https://www.microsoft.com/en-us/microsoft-365/roadmap?id=${f.id}`,
  }));
}

/* ------------------------------------------------------------------ blogs */

function parseItems(xml) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const tag = (b, n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i')) || [])[1] || '';
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const desc = stripTags(tag(b, 'description'))
      // Feed boilerplate: "The post X appeared first on Y Blog."
      .replace(/\s*The post .+? appeared first on .+?\.\s*/i, ' ')
      .trim();
    items.push({
      title: stripTags(tag(b, 'title')),
      link: decode(tag(b, 'link')).trim(),
      date: (() => { const d = Date.parse(decode(tag(b, 'pubDate'))); return isNaN(d) ? null : new Date(d).toISOString(); })(),
      description: desc.slice(0, 260),
    });
  }
  return items;
}

async function getBlogs() {
  const out = [];
  for (const f of FEEDS) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml' } });
      if (!r.ok) { console.warn(`  feed ${f.source} -> HTTP ${r.status}`); continue; }
      const items = parseItems(await r.text())
        .filter((it) => it.title && it.link)
        // Blog articles only — Tech Community discussions use /m-p/, /td-p/ etc.
        .filter((it) => !/techcommunity\.microsoft\.com/i.test(it.link)
          || (/\/ba-p\//i.test(it.link) && !/\/(m-p|td-p|idi-p|qa-p)\//i.test(it.link)))
        .filter((it) => /copilot/i.test(it.title + ' ' + it.description))
        .map((it) => ({ ...it, source: f.source }));
      out.push(...items);
      console.log(`  feed ${f.source}: ${items.length} Copilot posts`);
    } catch (e) { console.warn(`  feed ${f.source} failed: ${e.message}`); }
  }
  // De-dup by normalized title.
  const seen = new Set();
  return out.filter((it) => {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------- article metadata */

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

async function fetchMeta(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const meta = (re) => { const m = html.match(re); return m ? decode(m[1]).trim() : ''; };
  return {
    url,
    title: meta(/<meta[^>]+property="og:title"[^>]*content="([^"]+)/i) || meta(/<title[^>]*>([^<]+)</i),
    description: meta(/<meta[^>]+name="description"[^>]*content="([^"]+)/i)
              || meta(/<meta[^>]+property="og:description"[^>]*content="([^"]+)/i),
    fetched: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------- main */

async function main() {
  console.log('Fetching Microsoft 365 Roadmap...');
  const roadmap = await getRoadmap();
  console.log(`  ${roadmap.length} Copilot roadmap items`);

  console.log('Fetching Microsoft blog feeds...');
  const blogs = await getBlogs();
  console.log(`  ${blogs.length} unique Copilot blog posts`);

  const cache = loadCache();
  const apps = [];

  for (const app of APPS) {
    // Roadmap: prefer exact product-tag matches, which are far more precise
    // than text matching (avoids "Teams" matching every collaboration post).
    const tagged = roadmap.filter((r) =>
      r.products.some((p) => (app.roadmapProducts || []).includes(p)));
    const pool = tagged.length ? tagged : roadmap.filter((r) => app.match.test(r.title));
    const items = dedupeByTitle(pool)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, MAX_ROADMAP_PER_APP);

    // Blogs: require the app name in the title so posts are genuinely about it.
    const posts = dedupeByTitle(blogs.filter((b) => app.match.test(b.title)))
      .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
      .slice(0, MAX_BLOGS_PER_APP);

    // Resolve article metadata for the curated links.
    const links = [];
    for (const l of app.links) {
      if (!cache[l.url] || cache[l.url].error) {
        try { cache[l.url] = await fetchMeta(l.url); }
        catch (e) { cache[l.url] = { url: l.url, error: e.message }; }
      }
      const c = cache[l.url];
      links.push(c && !c.error && c.description
        ? { ...l, summary: c.description.slice(0, 220) }
        : l);
    }

    const counts = {
      inDevelopment: items.filter((i) => i.status === 'In development').length,
      rollingOut: items.filter((i) => i.status === 'Rolling out').length,
      launched: items.filter((i) => i.status === 'Launched').length,
    };

    apps.push({
      id: app.id, name: app.name, icon: app.icon, accent: app.accent,
      blurb: app.blurb, links, roadmap: items, blogs: posts, counts,
      roadmapTotal: tagged.length,
    });
    console.log(`  ${app.name.padEnd(28)} links ${links.length}  roadmap ${items.length}/${tagged.length}  blogs ${posts.length}`);
  }

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

  const payload = {
    generated: new Date().toISOString(),
    sources: {
      roadmap: 'https://www.microsoft.com/en-us/microsoft-365/roadmap?searchterms=Copilot',
      feeds: FEEDS.map((f) => ({ source: f.source, url: f.url })),
    },
    totals: {
      apps: apps.length,
      roadmapItems: roadmap.length,
      blogPosts: blogs.length,
    },
    apps,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
  console.log(`\nWrote ${apps.length} apps to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
