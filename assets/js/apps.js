import { icon, resourceIcon } from './icons.js';

const ACCENTS = {
  blue:   { hex: '#2F6BFF', soft: 'rgba(47,107,255,.10)' },
  teal:   { hex: '#12B8A6', soft: 'rgba(18,184,166,.12)' },
  purple: { hex: '#7C5CFC', soft: 'rgba(124,92,252,.11)' },
  pink:   { hex: '#E3458E', soft: 'rgba(227,69,142,.11)' },
  amber:  { hex: '#F4B740', soft: 'rgba(244,183,64,.16)' },
};
const RM_CLASS = { 'In development': 's-dev', 'Rolling out': 's-roll', 'Launched': 's-launch' };
const ROADMAP_HOME = 'https://www.microsoft.com/en-us/microsoft-365/roadmap?searchterms=Copilot';

let DATA = null;
const state = { q: '' };

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const accVars = (a) => {
  const c = ACCENTS[a.accent] || ACCENTS.blue;
  return `--acc:${c.hex};--acc-soft:${c.soft}`;
};
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const fmtDate = (d) => {
  const t = Date.parse(d);
  return isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/* ---------------------------------------------------------------- list view */

function appCard(a) {
  const total = a.roadmapTotal || a.roadmap.length;
  const bits = [];
  if (a.links.length) bits.push(`${a.links.length} guide${a.links.length === 1 ? '' : 's'}`);
  if (total) bits.push(`${total} roadmap item${total === 1 ? '' : 's'}`);
  if (a.blogs.length) bits.push(`${a.blogs.length} blog post${a.blogs.length === 1 ? '' : 's'}`);

  return `
    <a class="agent-card" href="#/${esc(a.id)}" style="${accVars(a)}">
      <div class="agent-card-top">
        <span class="agent-ico">${icon(a.icon)}</span>
        ${a.counts.rollingOut || a.counts.inDevelopment
          ? `<span class="badge badge-preview">${a.counts.inDevelopment + a.counts.rollingOut} in flight</span>` : ''}
      </div>
      <h3>${esc(a.name)}</h3>
      <p>${esc(a.blurb)}</p>
      <div class="agent-card-foot" style="margin-top:auto;padding-top:.6rem">
        <span>${bits.join(' &middot; ') || 'Reference'}</span>
        <span class="go">Explore &rarr;</span>
      </div>
    </a>`;
}

function matches(a) {
  if (!state.q) return true;
  const hay = [a.name, a.blurb, a.links.map((l) => l.label).join(' '),
    a.roadmap.map((r) => r.title).join(' '), a.blogs.map((b) => b.title).join(' ')]
    .join(' ').toLowerCase();
  return state.q.split(/\s+/).every((t) => hay.includes(t));
}

function renderList() {
  const list = DATA.apps.filter(matches);
  $('#resultCount').textContent = `${list.length} of ${DATA.apps.length} apps`;
  $('#appGrid').innerHTML = list.length
    ? list.map(appCard).join('')
    : `<div class="empty"><strong>No apps match that search.</strong>
        <p class="muted" style="margin-top:.4rem">Try a different term.</p></div>`;
}

function renderStats() {
  const rm = DATA.apps.reduce((n, a) => n + (a.roadmapTotal || 0), 0);
  $('#statRow').innerHTML = [
    [DATA.apps.length, 'Apps covered'],
    [DATA.totals.roadmapItems, 'Copilot features in flight'],
    [rm, 'Mapped to these apps'],
    [DATA.totals.blogPosts, 'Recent blog posts'],
  ].map(([v, l]) => `<div class="stat"><span class="stat-num">${v}</span><span class="stat-lbl">${l}</span></div>`).join('');

  $('#sourceNote').innerHTML =
    `Roadmap data from the public
     <a href="${ROADMAP_HOME}" target="_blank" rel="noopener noreferrer">Microsoft 365 Roadmap</a>,
     filtered to features in development or rolling out; blog posts from official Microsoft RSS
     feeds; guides from Microsoft Support and Learn.
     Refreshed ${esc(new Date(DATA.generated).toLocaleDateString(undefined,
       { year: 'numeric', month: 'long', day: 'numeric' }))}.`;
}

/* -------------------------------------------------------------- detail view */

function roadmapCard(r) {
  return `<article class="rm-card" data-s="${esc(r.status)}">
    <div class="rm-head">
      <h3 class="rm-title"><a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></h3>
      <span class="rm-status ${RM_CLASS[r.status] || 's-dev'}">${esc(r.status)}</span>
    </div>
    ${r.description ? `<p class="rm-desc">${esc(r.description)}</p>` : ''}
    <div class="rm-meta">
      ${r.availability ? `<span class="m">${esc(r.availability)}</span>` : ''}
      ${r.products.slice(0, 3).map((p) => `<span class="m">${esc(p)}</span>`).join('')}
      <span class="m">ID ${esc(r.id)}</span>
    </div>
  </article>`;
}

function renderDetail(a) {
  const about = a.detail ? `
    <h2 class="section-title">What Copilot does in ${esc(a.name)}</h2>
    <div class="prose"><p>${esc(a.detail)}</p></div>` : '';

  const scenarios = (a.scenarios && a.scenarios.length) ? `
    <h2 class="section-title">Example scenarios</h2>
    <ul class="hl-list" style="${accVars(a)}">
      ${a.scenarios.map((s) => `<li>${esc(s)}</li>`).join('')}
    </ul>` : '';

  const guides = a.links.length ? `
    <h2 class="section-title">Guides &amp; documentation</h2>
    <div class="res-grid">${a.links.map((l) => `
      <a class="res-card" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
        <span class="res-ico">${resourceIcon(l.label)}</span>
        <span class="res-body">
          <strong>${esc(l.label)}</strong>
          ${l.summary ? `<em>${esc(l.summary)}</em>` : ''}
          <span>${esc(hostOf(l.url))}</span>
        </span>
      </a>`).join('')}</div>` : '';

  const roadmap = a.roadmap.length ? `
    <h2 class="section-title">Coming next</h2>
    <div class="rm-meta-row">
      ${a.counts.inDevelopment ? `<span class="count-badge"><i class="dot-dev"></i>${a.counts.inDevelopment} in development</span>` : ''}
      ${a.counts.rollingOut ? `<span class="count-badge"><i class="dot-roll"></i>${a.counts.rollingOut} rolling out</span>` : ''}
      ${a.roadmapTotal > a.roadmap.length
        ? `<a class="count-badge" href="${ROADMAP_HOME}" target="_blank" rel="noopener noreferrer">
            showing ${a.roadmap.length} of ${a.roadmapTotal} &rarr;</a>` : ''}
    </div>
    <div class="roadmap-list">${a.roadmap.map(roadmapCard).join('')}</div>` : '';

  const blogs = a.blogs.length ? `
    <h2 class="section-title">Related Microsoft blog posts</h2>
    <div class="roadmap-list">${a.blogs.map((b) => `
      <article class="rm-card blog-card">
        <div class="rm-head">
          <h3 class="rm-title"><a href="${esc(b.link)}" target="_blank" rel="noopener noreferrer">${esc(b.title)}</a></h3>
          ${b.date ? `<span class="rm-date">${esc(fmtDate(b.date))}</span>` : ''}
        </div>
        ${b.description ? `<p class="rm-desc">${esc(b.description)}</p>` : ''}
        <div class="rm-meta"><span class="m">${esc(b.source)}</span></div>
      </article>`).join('')}</div>` : '';

  const nothing = (!a.links.length && !a.roadmap.length && !a.blogs.length)
    ? `<div class="empty"><strong>No public material found yet.</strong>
       <p class="muted" style="margin-top:.4rem">Microsoft hasn't published Copilot documentation or
       roadmap items for this app that we can verify. This page updates automatically.</p></div>` : '';

  $('#detailView').innerHTML = `
    <a class="back-link" href="#/">&larr; All apps</a>
    <div class="detail-hero" style="${accVars(a)}">
      <div class="detail-head">
        <span class="detail-ico">${icon(a.icon)}</span>
        <div class="detail-title">
          <h1>Copilot in ${esc(a.name)}</h1>
          <div class="detail-badges">
            ${a.roadmapTotal ? `<span class="badge">${a.roadmapTotal} roadmap items</span>` : ''}
            ${a.links.length ? `<span class="badge">${a.links.length} official guides</span>` : ''}
          </div>
        </div>
      </div>
      <p class="detail-desc">${esc(a.blurb)}</p>
    </div>
    ${nothing}
    ${about}
    ${scenarios}
    ${guides}
    ${roadmap}
    ${blogs}
    <p class="source-note">Roadmap items show work Microsoft has published as in development or
      rolling out; plans can change. Always confirm availability for your tenant in the
      Microsoft 365 admin center.</p>
  `;
}

/* ------------------------------------------------------------------ routing */

function route() {
  const id = (location.hash.match(/^#\/(.+)$/) || [])[1];
  const app = id ? DATA.apps.find((a) => a.id === decodeURIComponent(id)) : null;

  if (app) {
    $('#listView').hidden = true;
    $('#detailView').hidden = false;
    renderDetail(app);
    document.title = `Copilot in ${app.name} — Microsoft 1st Party Agents`;
  } else {
    $('#detailView').hidden = true;
    $('#listView').hidden = false;
    document.title = 'Copilot in Apps — Microsoft 1st Party Agents';
    if (id) location.replace('#/');
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* --------------------------------------------------------------------- init */

async function init() {
  try {
    const res = await fetch('data/apps.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    $('#appGrid').innerHTML =
      `<div class="empty"><strong>Couldn't load the app catalog.</strong>
       <p class="muted" style="margin-top:.4rem">${esc(err.message)}</p></div>`;
    return;
  }
  renderStats();
  renderList();

  let t;
  $('#appSearch').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); renderList(); }, 120);
  });

  window.addEventListener('hashchange', route);
  route();
}

init();
