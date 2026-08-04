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
const MAX_ROADMAP_PER_APP = 25;
const MAX_BLOGS_PER_APP = 5;
/** Only surface work that is still coming — shipped items belong in the docs. */
const ACTIVE_STATUSES = ['In development', 'Rolling out'];

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
    blurb: 'Draft, rewrite and summarize long-form documents from a prompt, grounded in files you already have.',
    detail: 'Copilot in Word turns a blank page into a working draft. Point it at existing documents, meeting notes or a short brief and it produces structured prose you can edit, then helps you tighten tone, shorten sections, or rewrite passages for a different audience. It can also summarize a long document into the key points and open questions.',
    scenarios: [
      'Draft a project proposal from a meeting recap and last quarter\u2019s status report.',
      'Summarize a 40-page contract into a one-page brief with the obligations called out.',
      'Rewrite a technical section in plain language for an executive audience.',
    ],
    match: /\bword\b/i, roadmapProducts: ['Word'],
    links: [
      { label: 'Draft and add content with Copilot in Word', url: 'https://support.microsoft.com/en-us/copilot-word', kind: 'support' },
      { label: 'Word, Excel and PowerPoint Agents', url: 'https://learn.microsoft.com/en-us/copilot/microsoft-365/wordexcelppt-agents', kind: 'learn' },
    ] },
  { id: 'excel', name: 'Excel', icon: 'grid', accent: 'teal',
    blurb: 'Analyze data, generate formulas and build charts in natural language, with multi-step reasoning over your workbook.',
    detail: 'Copilot in Excel works with your data the way an analyst would. Ask a question in plain language and it will suggest formulas, add calculated columns, highlight trends and outliers, and build the chart or PivotTable that answers it. Agent Mode can carry out multi-step tasks, showing its reasoning so you can check the work before applying it.',
    scenarios: [
      'Identify the key drivers behind this quarter\u2019s forecast variance.',
      'Add a column that flags every order shipped more than five days late.',
      'Summarize this survey export into themes and chart the top responses.',
    ],
    match: /\bexcel\b/i, roadmapProducts: ['Excel'],
    links: [
      { label: 'Get started with Copilot in Excel', url: 'https://support.microsoft.com/en-us/copilot-excel', kind: 'support' },
    ] },
  { id: 'powerpoint', name: 'PowerPoint', icon: 'slides', accent: 'pink',
    blurb: 'Turn prompts and existing documents into complete presentations, then refine layout, visuals and speaker notes.',
    detail: 'Copilot in PowerPoint builds a first-draft deck from a prompt, a Word document or a set of notes \u2014 choosing a structure, laying out slides and adding relevant imagery. From there you can ask it to reorganize sections, tighten wording, add speaker notes, or restyle the deck to match your template.',
    scenarios: [
      'Turn this project charter document into a 10-slide kickoff deck.',
      'Add speaker notes to every slide aimed at a non-technical audience.',
      'Condense this 30-slide deck into a five-minute executive summary.',
    ],
    match: /\bpowerpoint\b/i, roadmapProducts: ['PowerPoint'],
    links: [
      { label: 'Create a presentation with Copilot in PowerPoint', url: 'https://support.microsoft.com/en-us/copilot-powerpoint', kind: 'support' },
    ] },
  { id: 'outlook', name: 'Outlook', icon: 'pen', accent: 'blue',
    blurb: 'Summarize long mail threads, draft replies in your voice, and catch up on what changed while you were away.',
    detail: 'Copilot in Outlook cuts down inbox time. It summarizes long threads into the decisions and open items, drafts replies you can tune for length and tone, and surfaces the messages that actually need you. Coaching by Copilot reviews a draft before you send it and flags unclear or blunt phrasing.',
    scenarios: [
      'Summarize this 30-message thread and list what still needs a decision.',
      'Draft a reply declining the request but proposing two alternative dates.',
      'Show me what I missed in my inbox while I was out last week.',
    ],
    match: /\boutlook\b/i, roadmapProducts: ['Outlook'],
    links: [
      { label: 'Chat with Copilot in Outlook', url: 'https://support.microsoft.com/en-us/copilot-outlook', kind: 'support' },
    ] },
  { id: 'teams', name: 'Teams', icon: 'meeting', accent: 'purple',
    blurb: 'Recap meetings, surface decisions and action items, and catch up on channel and chat activity you missed.',
    detail: 'Copilot in Teams turns conversations into something you can act on. During or after a meeting it recaps what was discussed, who said what, which decisions were made and which follow-ups were assigned \u2014 whether or not you attended. In chats and channels it summarizes long back-and-forth threads so you can rejoin quickly.',
    scenarios: [
      'Recap the meeting I missed and list the action items assigned to my team.',
      'What questions were raised about the budget, and were they answered?',
      'Summarize the last two weeks of activity in this channel.',
    ],
    match: /\bteams\b/i, roadmapProducts: ['Microsoft Teams'],
    links: [
      { label: 'Catch up on meetings with Copilot in Teams', url: 'https://support.microsoft.com/en-us/copilot-teams', kind: 'support' },
    ] },
  { id: 'onenote', name: 'OneNote', icon: 'book', accent: 'purple',
    blurb: 'Summarize notebooks, pull out action items and turn rough notes into structured plans.',
    detail: 'Copilot in OneNote reads across your pages and sections to make sense of accumulated notes. It can summarize a sprawling notebook, extract the to-dos buried in it, and reshape raw meeting scribbles into an organized plan or checklist.',
    scenarios: [
      'Summarize this notebook section and pull out every action item.',
      'Turn these rough interview notes into a structured candidate summary.',
      'Create a checklist from the decisions captured across these pages.',
    ],
    match: /\bonenote\b/i, roadmapProducts: ['OneNote'],
    links: [
      { label: 'Summarize your OneNote notes with Copilot', url: 'https://support.microsoft.com/en-us/copilot-onenote', kind: 'support' },
    ] },
  { id: 'loop', name: 'Loop', icon: 'flow', accent: 'teal',
    blurb: 'Co-create and refine shared Loop pages and components with Copilot alongside your team.',
    detail: 'Copilot in Loop works inside the shared page rather than off to the side, so drafting is a group activity. It can generate a starting page from a prompt, restructure content as thinking evolves, and summarize where a collaborative document has landed \u2014 with everyone seeing the same changes in real time.',
    scenarios: [
      'Draft a project brief page the team can edit together.',
      'Summarize where this planning page has landed so far.',
      'Reorganize these scattered notes into a clear set of workstreams.',
    ],
    match: /\bloop\b/i, roadmapProducts: ['Microsoft Loop'],
    links: [
      { label: 'Copilot in Loop FAQ', url: 'https://support.microsoft.com/en-us/copilot-loop', kind: 'support' },
    ] },
  { id: 'onedrive', name: 'OneDrive', icon: 'search', accent: 'blue',
    blurb: 'Ask questions across your stored files, compare documents and summarize them without opening each one.',
    detail: 'Copilot in OneDrive answers questions about your files without making you open them. Select one or several documents and ask for a summary, a comparison, or a specific detail \u2014 useful when the answer is spread across versions, contracts or reports you only half remember.',
    scenarios: [
      'Summarize these five documents and tell me how they differ.',
      'Which version of this proposal has the updated pricing?',
      'Find the file where we documented the escalation process.',
    ],
    match: /\bonedrive\b/i, roadmapProducts: ['OneDrive'],
    links: [
      { label: 'Get started with Copilot in OneDrive', url: 'https://support.microsoft.com/en-us/onedrive/get-started-with-copilot-in-onedrive', kind: 'support' },
    ] },
  { id: 'sharepoint', name: 'SharePoint', icon: 'globe', accent: 'teal',
    blurb: 'Build sites and pages faster and ground Copilot answers in your organization\u2019s published content.',
    detail: 'SharePoint is both a place Copilot helps you build and a source it draws on. Copilot can draft pages and assemble sites from a description, while the content you publish there becomes grounding for answers across Microsoft 365 \u2014 so well-maintained sites make every other Copilot surface better.',
    scenarios: [
      'Create a project site with a home page, news section and document library.',
      'Draft a policy page summarizing our updated travel guidelines.',
      'What does our published documentation say about data retention?',
    ],
    match: /\bsharepoint\b/i, roadmapProducts: ['SharePoint'],
    links: [
      { label: 'Copilot in SharePoint help & learning', url: 'https://support.microsoft.com/en-us/SharePoint/ai-copilot/microsoft-365-copilot-in-sharepoint-help-learning', kind: 'support' },
    ] },
  { id: 'planner', name: 'Planner', icon: 'checklist', accent: 'purple',
    blurb: 'Create plans, generate tasks and track progress conversationally instead of building boards by hand.',
    detail: 'Copilot in Planner builds the plan for you. Describe a project and it generates a task breakdown with sensible buckets and sequencing, then keeps it current \u2014 adding tasks, adjusting assignments and answering questions about status without you clicking through the board.',
    scenarios: [
      'Create a plan for a product launch with phases and owners.',
      'What tasks are overdue and who owns them?',
      'Add follow-up tasks from this meeting recap to the existing plan.',
    ],
    match: /\bplanner\b/i, roadmapProducts: ['Planner'],
    links: [
      { label: 'Create a new plan with Copilot in Planner', url: 'https://support.microsoft.com/en-us/Planner/copilot/create-a-new-plan-with-copilot-in-planner-preview', kind: 'support' },
    ] },
  { id: 'forms', name: 'Forms', icon: 'poll', accent: 'teal',
    blurb: 'Draft surveys, quizzes and polls from a description, then summarize the responses that come back.',
    detail: 'Copilot in Forms handles both ends of a survey. Describe what you want to learn and it drafts the questions \u2014 with sensible response types and scales \u2014 then, once responses arrive, summarizes the themes and sentiment instead of leaving you to read every free-text answer.',
    scenarios: [
      'Create an employee engagement survey covering workload and recognition.',
      'Draft a post-event feedback form with a mix of ratings and open questions.',
      'Summarize the themes in the free-text responses to this survey.',
    ],
    match: /\bforms\b/i, roadmapProducts: ['Forms'],
    links: [
      { label: 'Welcome to Copilot in Forms', url: 'https://support.microsoft.com/en-us/Forms/welcome-to-copilot-in-forms', kind: 'support' },
    ] },
  { id: 'viva', name: 'Viva', icon: 'people', accent: 'pink',
    blurb: 'Bring Copilot into employee experience workflows across Viva Engage, Insights, Learning and Glint.',
    detail: 'Across the Viva suite, Copilot supports the people side of work: drafting and summarizing community conversations in Engage, interpreting collaboration patterns in Insights, recommending learning paths, and helping admins make sense of survey feedback in Glint.',
    scenarios: [
      'Summarize what my Engage communities discussed this week.',
      'Draft an announcement post for a company-wide policy change.',
      'What are the main themes in our latest engagement survey?',
    ],
    match: /\bviva\b|\bengage\b/i, roadmapProducts: ['Microsoft Viva'],
    links: [
      { label: 'Copilot in Viva help & learning', url: 'https://support.microsoft.com/en-us/viva/copilot-in-viva-help-learning', kind: 'support' },
    ] },
  { id: 'clipchamp', name: 'Clipchamp', icon: 'slides', accent: 'amber',
    blurb: 'Summarize and ask questions about video content directly in the Clipchamp player.',
    detail: 'Copilot in the Clipchamp player makes video searchable. Rather than scrubbing through a recording, you can ask what was covered, get a summary of the main points, and jump to the moment a specific topic came up.',
    scenarios: [
      'Summarize the main points covered in this recording.',
      'Where in this video does the speaker discuss pricing?',
      'List the questions asked during this recorded session.',
    ],
    match: /\bclipchamp\b/i, roadmapProducts: ['Microsoft Clipchamp'],
    links: [
      { label: 'Ask questions & summarize video with Copilot', url: 'https://support.microsoft.com/en-us/clipchamp/stream-pages/ask-questions-get-summaries-of-any-video-with-microsoft-copilot-in-the-clipchamp-player', kind: 'support' },
    ] },
  { id: 'copilot-chat', name: 'Microsoft 365 Copilot Chat', icon: 'spark', accent: 'purple',
    blurb: 'The central Copilot surface \u2014 chat grounded in your work data, with agents, Pages and file creation.',
    detail: 'Copilot Chat is the hub the rest of the experience hangs off. It answers questions grounded in your emails, files, meetings and chats, hosts the first-party agents, creates Word, Excel and PowerPoint files on request, and turns any answer into a shareable Copilot Page your team can build on.',
    scenarios: [
      'What did my team decide about the migration timeline?',
      'Create a status report from this week\u2019s meetings and email threads.',
      'Find everything related to this customer across my files and chats.',
    ],
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

  return all.filter(isCopilot)
    .filter((f) => ACTIVE_STATUSES.includes(f.status))
    .map((f) => ({
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

/** In development first, then Rolling out; newest first within each group. */
const STATUS_ORDER = { 'In development': 0, 'Rolling out': 1 };
function sortRoadmap(items) {
  return items.sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    return new Date(b.modified) - new Date(a.modified);
  });
}

/**
 * Take a page-sized slice that still represents both statuses. Sorting alone
 * would fill the slice with "In development" items and leave the "Rolling out"
 * filter showing nothing, so each status gets a guaranteed share and any
 * leftover capacity is topped up from whichever list still has items.
 */
function sliceRoadmap(items, max) {
  const sorted = sortRoadmap(items);
  if (sorted.length <= max) return sorted;

  const dev = sorted.filter((i) => i.status === 'In development');
  const roll = sorted.filter((i) => i.status === 'Rolling out');
  if (!dev.length || !roll.length) return sorted.slice(0, max);

  const rollQuota = Math.min(roll.length, Math.max(2, Math.round(max / 3)));
  let devTake = Math.min(dev.length, max - rollQuota);
  let rollTake = Math.min(roll.length, max - devTake);
  // Use any capacity the other status couldn't fill.
  devTake = Math.min(dev.length, max - rollTake);
  rollTake = Math.min(roll.length, max - devTake);

  return [...dev.slice(0, devTake), ...roll.slice(0, rollTake)];
}

async function main() {
  console.log('Fetching Microsoft 365 Roadmap...');
  const roadmap = await getRoadmap();
  console.log(`  ${roadmap.length} Copilot roadmap items`);

  console.log('Fetching Microsoft blog feeds...');
  const blogs = await getBlogs();
  console.log(`  ${blogs.length} unique Copilot blog posts`);

  const cache = loadCache();
  const apps = [];
  // A single roadmap item is often tagged with several products (an Office
  // feature lands in Word, Excel and PowerPoint at once). Keep one entry per
  // feature so headline counts describe distinct work, not tag combinations.
  const mappedById = new Map();

  for (const app of APPS) {
    // Roadmap: prefer exact product-tag matches, which are far more precise
    // than text matching (avoids "Teams" matching every collaboration post).
    const tagged = roadmap.filter((r) =>
      r.products.some((p) => (app.roadmapProducts || []).includes(p)));
    const pool = tagged.length ? tagged : roadmap.filter((r) => app.match.test(r.title));
    // The roadmap republishes one feature under several product prefixes, so
    // de-duplicate before counting or slicing.
    const unique = dedupeByTitle(pool);
    const items = sliceRoadmap(unique, MAX_ROADMAP_PER_APP);
    unique.forEach((r) => mappedById.set(r.id, r));

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
    };
    // Totals across everything mapped to this app, not just the page slice.
    const totals = {
      inDevelopment: unique.filter((i) => i.status === 'In development').length,
      rollingOut: unique.filter((i) => i.status === 'Rolling out').length,
    };

    apps.push({
      id: app.id, name: app.name, icon: app.icon, accent: app.accent,
      blurb: app.blurb, detail: app.detail, scenarios: app.scenarios || [],
      links, roadmap: items, blogs: posts, counts, totals,
      roadmapTotal: unique.length,
    });
    console.log(`  ${app.name.padEnd(28)} links ${links.length}  roadmap ${items.length}/${unique.length}  blogs ${posts.length}`);
  }

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

  // Headline figures describe features specific to the apps on this page,
  // counted once each even when a feature spans several of them.
  const mapped = [...mappedById.values()];
  const payload = {
    generated: new Date().toISOString(),
    sources: {
      roadmap: 'https://www.microsoft.com/en-us/microsoft-365/roadmap?searchterms=Copilot',
      feeds: FEEDS.map((f) => ({ source: f.source, url: f.url })),
    },
    totals: {
      apps: apps.length,
      // Unique, app-specific features in flight.
      roadmapItems: mapped.length,
      inDevelopment: mapped.filter((r) => r.status === 'In development').length,
      rollingOut: mapped.filter((r) => r.status === 'Rolling out').length,
      // Every active Copilot feature, including those outside these apps.
      allActiveCopilot: roadmap.length,
      blogPosts: blogs.length,
    },
    apps,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));

  const naiveSum = apps.reduce((n, a) => n + a.roadmapTotal, 0);
  console.log(`\nActive Copilot features (all):        ${roadmap.length}`);
  console.log(`Specific to these apps, de-duplicated: ${mapped.length}`);
  console.log(`  in development: ${payload.totals.inDevelopment}`);
  console.log(`  rolling out:    ${payload.totals.rollingOut}`);
  console.log(`  (${naiveSum} before removing features counted under several apps)`);
  console.log(`Wrote ${apps.length} apps to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
