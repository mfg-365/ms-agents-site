/**
 * Weekly refresh for the Microsoft 1st Party Agents site.
 *
 * Rebuilds every data source, reports exactly what changed, and (unless run
 * with --dry-run) commits and pushes so GitHub Pages redeploys.
 *
 *   node tools/refresh.mjs              refresh, commit, push, report
 *   node tools/refresh.mjs --dry-run    show what would change, touch nothing
 *   node tools/refresh.mjs --deck path  also re-extract the source deck first
 *
 * What gets refreshed:
 *   - Microsoft 365 Roadmap items (live API, every run)
 *   - Microsoft blog posts (official RSS feeds, every run)
 *   - Support / Learn article text backing agent detail pages
 *     (re-fetched when older than --max-age days, default 7)
 *   - Optionally the agent catalog itself, when a new deck is supplied
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);
const AGENTS = path.join(ROOT, 'data', 'agents.json');
const APPS = path.join(ROOT, 'data', 'apps.json');

const DRY = process.argv.includes('--dry-run');
const deckIdx = process.argv.indexOf('--deck');
const DECK = deckIdx !== -1 ? process.argv[deckIdx + 1] : null;
const MAX_AGE = (() => {
  const i = process.argv.indexOf('--max-age');
  return i !== -1 ? process.argv[i + 1] : '7';
})();

const log = (...a) => console.log(...a);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024, ...opts,
  });
}

function git(...args) {
  try { return run('git', args).trim(); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

const SEISMIC_PY = String.raw`C:\Users\cowi\AppData\Local\seismic-mcp\.venv\Scripts\python.exe`;

/**
 * Ask Seismic whether the source deck moved since the last build.
 *
 * Metadata (version / size / publish date) is fully automatable through the
 * signed-in Edge session. Fetching the binary is not — Seismic serves content
 * via an async request + push-notification + signed-URL flow that doesn't
 * drive headless — so a change is reported with a link rather than guessed at.
 */
function checkDeck() {
  if (!fs.existsSync(SEISMIC_PY)) {
    return { ok: false, reason: 'seismic-mcp venv not found', skipped: true };
  }
  try {
    const out = run(SEISMIC_PY, [path.join('tools', 'seismic_check.py'), '--json']);
    return JSON.parse(out);
  } catch (e) {
    // Exit code 3 means "changed" — still valid JSON on stdout.
    const stdout = (e.stdout || '').trim();
    if (stdout) { try { return JSON.parse(stdout); } catch { /* fall through */ } }
    return { ok: false, reason: (e.stderr || e.message || '').trim().split('\n')[0] };
  }
}

/** Strip build timestamps so we can tell real content changes from noise. */
function contentOnly(obj) {
  if (!obj) return '';
  const clone = JSON.parse(JSON.stringify(obj));
  delete clone.generated;
  delete clone.enriched;
  // Per-article fetch times live in the cache, not here, but be safe.
  const strip = (o) => {
    if (Array.isArray(o)) return o.forEach(strip);
    if (o && typeof o === 'object') {
      delete o.fetched;
      Object.values(o).forEach(strip);
    }
  };
  strip(clone);
  return JSON.stringify(clone);
}

/* ------------------------------------------------------------- comparison */

/** Summarize what actually changed between two builds. */
function diffApps(before, after) {
  const out = [];
  if (!before || !after) return out;

  const b = Object.fromEntries((before.apps || []).map((a) => [a.id, a]));
  for (const app of after.apps || []) {
    const prev = b[app.id];
    if (!prev) { out.push(`+ new app: ${app.name}`); continue; }

    const prevIds = new Set((prev.roadmap || []).map((r) => r.id));
    const newItems = (app.roadmap || []).filter((r) => !prevIds.has(r.id));

    const prevStatus = Object.fromEntries((prev.roadmap || []).map((r) => [r.id, r.status]));
    const moved = (app.roadmap || []).filter((r) => prevStatus[r.id] && prevStatus[r.id] !== r.status);

    const prevBlogs = new Set((prev.blogs || []).map((x) => x.link));
    const newBlogs = (app.blogs || []).filter((x) => !prevBlogs.has(x.link));

    for (const r of newItems) out.push(`  ${app.name}: new roadmap item — ${r.title}`);
    for (const r of moved) out.push(`  ${app.name}: ${prevStatus[r.id]} → ${r.status} — ${r.title}`);
    for (const x of newBlogs) out.push(`  ${app.name}: new blog — ${x.title}`);

    if (prev.roadmapTotal !== app.roadmapTotal) {
      out.push(`  ${app.name}: roadmap total ${prev.roadmapTotal} → ${app.roadmapTotal}`);
    }
  }
  const t1 = before.totals || {}, t2 = after.totals || {};
  for (const k of ['roadmapItems', 'inDevelopment', 'rollingOut', 'blogPosts']) {
    if (t1[k] !== t2[k]) out.push(`  total ${k}: ${t1[k]} → ${t2[k]}`);
  }
  return out;
}

function diffAgents(before, after) {
  const out = [];
  if (!before || !after) return out;
  const b = Object.fromEntries((before.agents || []).map((a) => [a.id, a]));
  const a2 = Object.fromEntries((after.agents || []).map((a) => [a.id, a]));

  for (const id of Object.keys(a2)) {
    if (!b[id]) { out.push(`+ new agent: ${a2[id].name} (${a2[id].status})`); continue; }
    const p = b[id], n = a2[id];
    if (p.status !== n.status) out.push(`  ${n.name}: ${p.status} → ${n.status}`);
    const pl = new Set((p.links || []).map((l) => l.url));
    for (const l of n.links || []) if (!pl.has(l.url)) out.push(`  ${n.name}: new link — ${l.label}`);
    if ((p.overview || []).length !== (n.overview || []).length) {
      out.push(`  ${n.name}: overview ${(p.overview || []).length} → ${(n.overview || []).length} paragraphs`);
    }
  }
  for (const id of Object.keys(b)) if (!a2[id]) out.push(`- agent removed: ${b[id].name}`);
  return out;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const started = new Date();
  log(`Microsoft 1st Party Agents — refresh ${started.toISOString()}`);
  log(DRY ? 'MODE: dry run (no commit, no push)\n' : 'MODE: live\n');

  const beforeAgents = readJson(AGENTS);
  const beforeApps = readJson(APPS);

  // 1. Optional: re-extract the agent catalog from a refreshed source deck.
  let deck = null;
  if (DECK) {
    if (!fs.existsSync(DECK)) throw new Error(`Deck not found: ${DECK}`);
    log(`[1/4] Extracting agent catalog from deck…`);
    log(run('python', [path.join('tools', 'extract_pptx.py'), DECK]).trim());
    log(run('python', [path.join('tools', 'build_agents.py')]).trim());
    // A rebuilt catalog means the deck we just read is the new baseline.
    try {
      run(SEISMIC_PY, [path.join('tools', 'seismic_check.py'), '--set-baseline']);
      log('  Deck baseline updated.');
    } catch { log('  (could not update deck baseline — check Seismic sign-in)'); }
  } else {
    log('[1/4] Checking the source deck on Seismic…');
    deck = checkDeck();
    if (deck.skipped) {
      log('  Skipped: seismic-mcp is not installed here.');
    } else if (!deck.ok) {
      log(`  Could not check: ${deck.reason}`);
      log('  (Edge CDP on port 9222 must be running and signed in to Seismic.)');
    } else if (deck.changed) {
      log('  DECK CHANGED — the agent list may be out of date:');
      for (const c of deck.changes || []) log(`    ${c.field}: ${c.was} → ${c.now}`);
      log(`    ${deck.link}`);
      log('    Download it, then re-run with: --deck "<path to pptx>"');
    } else {
      log(`  Unchanged (v${deck.current?.version}, published ${deck.current?.publishedAt}).`);
    }
  }

  // 2. Refresh the support/Learn article text behind agent detail pages.
  log(`\n[2/4] Refreshing agent article content (re-fetching anything older than ${MAX_AGE} days)…`);
  log(run('node', [path.join('tools', 'enrich_agents.mjs'), '--max-age', String(MAX_AGE)]).trim());

  // 3. Rebuild the Copilot in Apps data (roadmap + blogs are always live).
  log('\n[3/4] Rebuilding Copilot in Apps data…');
  log(run('node', [path.join('tools', 'build_apps.mjs')]).trim());

  // 4. Report and publish.
  log('\n[4/4] Comparing against the previous build…');
  const afterAgents = readJson(AGENTS);
  const afterApps = readJson(APPS);
  const changes = [
    ...diffAgents(beforeAgents, afterAgents),
    ...diffApps(beforeApps, afterApps),
  ];

  // Every run rewrites the `generated` timestamp, so compare the content
  // itself — otherwise the site would get a pointless commit every week.
  const materiallyChanged =
    contentOnly(beforeAgents) !== contentOnly(afterAgents) ||
    contentOnly(beforeApps) !== contentOnly(afterApps);

  const status = git('status', '--porcelain', '--', 'data', 'assets', 'index.html', 'apps.html');
  const touched = status.split('\n').map((s) => s.trim()).filter(Boolean);

  if (!touched.length) {
    log('\nNo changes — the site is already up to date.');
    return { changed: false, changes: [], deck, started };
  }

  if (!materiallyChanged) {
    log('\nOnly build timestamps changed; no new roadmap items, blogs or article text.');
    log('Reverting so the repository stays clean.');
    git('checkout', '--', 'data');
    return { changed: false, changes: [], deck, started };
  }

  log(`\nFiles changed (${touched.length}):`);
  touched.forEach((f) => log(`  ${f}`));

  if (changes.length) {
    log(`\nWhat's new (${changes.length}):`);
    changes.slice(0, 40).forEach((c) => log(c));
    if (changes.length > 40) log(`  …and ${changes.length - 40} more`);
  } else {
    log('\nContent refreshed (article text updated).');
  }

  if (DRY) {
    log('\nDry run — stopping before commit.');
    return { changed: true, changes, deck, started };
  }

  // Bump the asset version so browsers pick up any JS/CSS change immediately.
  const stamp = started.toISOString().slice(0, 10).replace(/-/g, '');
  for (const page of ['index.html', 'apps.html']) {
    const p = path.join(ROOT, page);
    const html = fs.readFileSync(p, 'utf8').replace(/\?v=[\w.]+/g, `?v=${stamp}`);
    fs.writeFileSync(p, html);
  }

  const summary = changes.length
    ? changes.slice(0, 12).map((c) => c.trim()).join('\n')
    : 'Refreshed roadmap, blog and article content.';

  git('add', '-A');
  git('commit', '-m', `Weekly content refresh ${started.toISOString().slice(0, 10)}\n\n${summary}`);
  const push = git('push', 'origin', 'main');
  log(`\nPushed. ${push || 'ok'}`);

  // Ask GitHub Pages to rebuild so the change goes live promptly.
  try {
    run('gh', ['api', '-X', 'POST', 'repos/mfg-365/ms-agents-site/pages/builds']);
    log('GitHub Pages rebuild queued.');
  } catch (e) {
    log(`Could not queue a Pages build: ${(e.stderr || e.message || '').trim()}`);
  }

  return { changed: true, changes, deck, started };
}

main()
  .then((r) => {
    if (r.deck && r.deck.ok && r.deck.changed) {
      log('\nACTION NEEDED: a newer version of the source deck is published.');
      log(`  ${r.deck.link}`);
    }
    log(`\nDone in ${((Date.now() - r.started) / 1000).toFixed(0)}s.`);
    process.exit(0);
  })
  .catch((e) => { console.error('\nRefresh failed:', e.message); process.exit(1); });
