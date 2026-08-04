import { icon, resourceIcon } from './icons.js';

const ACCENTS = {
  blue:   { hex: '#2F6BFF', soft: 'rgba(47,107,255,.10)' },
  teal:   { hex: '#12B8A6', soft: 'rgba(18,184,166,.12)' },
  purple: { hex: '#7C5CFC', soft: 'rgba(124,92,252,.11)' },
  pink:   { hex: '#E3458E', soft: 'rgba(227,69,142,.11)' },
  amber:  { hex: '#F4B740', soft: 'rgba(244,183,64,.16)' },
};
const STATUS_CLASS = { 'GA': 'badge-ga', 'Public Preview': 'badge-preview', 'Frontier': 'badge-frontier' };
const STATUS_DOT   = { 'GA': '#12B8A6', 'Public Preview': '#F4B740', 'Frontier': '#7C5CFC' };
const STATUS_BLURB = {
  'GA': 'Generally available — ready for production rollout.',
  'Public Preview': 'In public preview — available to try, still evolving.',
  'Frontier': 'Frontier program — early access to the newest AI innovations.',
};
const FRONTIER_URL = 'https://adoption.microsoft.com/en-us/copilot/frontier-program/';

let DATA = null;
const state = { q: '', status: 'all', group: 'all' };

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const accVars = (a) => {
  const c = ACCENTS[a.accent] || ACCENTS.blue;
  return `--acc:${c.hex};--acc-soft:${c.soft}`;
};
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/* ---------------------------------------------------------------- rendering */

function statusBadge(status) {
  return `<span class="badge ${STATUS_CLASS[status] || 'badge-ga'}">${esc(status)}</span>`;
}

function agentCard(a) {
  const surfaces = a.surfaces.slice(0, 3).map((s) => `<span class="surface">${esc(s)}</span>`).join('');
  const more = a.surfaces.length > 3 ? `<span class="surface">+${a.surfaces.length - 3}</span>` : '';
  return `
    <a class="agent-card" href="#/${esc(a.id)}" style="${accVars(a)}">
      <div class="agent-card-top">
        <span class="agent-ico">${icon(a.icon)}</span>
        ${statusBadge(a.status)}
      </div>
      <h3>${esc(a.name)}</h3>
      <p>${esc(a.description)}</p>
      <div class="surface-row">${surfaces}${more}</div>
      <div class="agent-card-foot">
        <span>${a.links.length} resource${a.links.length === 1 ? '' : 's'}${
          a.highlights && a.highlights.length ? ` &middot; ${a.highlights.length} capabilities` : ''}</span>
        <span class="go">View details &rarr;</span>
      </div>
    </a>`;
}

const qOk = (a) => {
  if (!state.q) return true;
  const hay = [a.name, a.description, a.groupLabel, a.status, a.license,
    a.surfaces.join(' '), a.notes.join(' ')].join(' ').toLowerCase();
  return state.q.split(/\s+/).every((t) => hay.includes(t));
};

function matches(a) {
  if (state.status !== 'all' && a.status !== state.status) return false;
  if (state.group !== 'all' && a.group !== state.group) return false;
  return qOk(a);
}

function renderList() {
  const list = DATA.agents.filter(matches);
  $('#resultCount').textContent = `${list.length} of ${DATA.agents.length} agents`;

  // Chip counts reflect the *other* active filters, so they preview the result
  // of clicking that chip rather than the current selection.
  document.querySelectorAll('.chip[data-status]').forEach((c) => {
    const v = c.dataset.status;
    const n = DATA.agents.filter((a) => qOk(a) &&
      (state.group === 'all' || a.group === state.group) &&
      (v === 'all' || a.status === v)).length;
    const el = c.querySelector('.chip-n');
    if (el) el.textContent = n;
  });
  document.querySelectorAll('.chip[data-group]').forEach((c) => {
    const v = c.dataset.group;
    const n = DATA.agents.filter((a) => qOk(a) &&
      (state.status === 'all' || a.status === state.status) &&
      (v === 'all' || a.group === v)).length;
    const el = c.querySelector('.chip-n');
    if (el) el.textContent = n;
  });

  const container = $('#agentGroups');
  if (!list.length) {
    container.innerHTML = `<div class="empty"><strong>No agents match those filters.</strong>
      <p class="muted" style="margin-top:.4rem">Try clearing the search box or picking a different availability.</p></div>`;
    return;
  }
  container.innerHTML = DATA.groups.map((g) => {
    const items = list.filter((a) => a.group === g.id);
    if (!items.length) return '';
    return `<section class="group-block">
      <div class="group-head">
        <h2>${esc(g.label)}</h2>
        <span class="group-lic">${esc(g.license)}</span>
      </div>
      <div class="agent-grid">${items.map(agentCard).join('')}</div>
    </section>`;
  }).join('');
}

function renderDetail(a) {
  const group = DATA.groups.find((g) => g.id === a.group);
  const related = DATA.agents.filter((x) => x.group === a.group && x.id !== a.id).slice(0, 6);

  const resources = a.links.length
    ? `<div class="res-grid">${a.links.map((l) => `
        <a class="res-card" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
          <span class="res-ico">${resourceIcon(l.label)}</span>
          <span class="res-body">
            <strong>${esc(l.label)}</strong>
            ${l.summary ? `<em>${esc(l.summary)}</em>` : ''}
            <span>${esc(host(l.url))}</span>
          </span>
        </a>`).join('')}</div>`
    : `<div class="empty"><strong>No published links yet.</strong>
        <p class="muted" style="margin-top:.4rem">Microsoft hasn't shared public documentation for this
        agent in the source deck. Check back after the next refresh.</p></div>`;

  const overview = (a.overview && a.overview.length) ? `
    <section class="detail-section">
      <h2 class="section-title">About this agent</h2>
      <div class="prose">${a.overview.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    </section>` : '';

  const highlights = (a.highlights && a.highlights.length) ? `
    <section class="detail-section">
      <h2 class="section-title">What you can do</h2>
      <ul class="hl-list" style="${accVars(a)}">
        ${a.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}
      </ul>
    </section>` : '';

  const scenarios = (a.scenarios && a.scenarios.length) ? `
    <section class="detail-section">
      <h2 class="section-title">Example scenarios</h2>
      <ul class="hl-list" style="${accVars(a)}">
        ${a.scenarios.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
    </section>` : '';

  const limitations = (a.limitations && a.limitations.length) ? `
    <section class="detail-section">
      <h2 class="section-title">Good to know</h2>
      <ul class="lim-list">${a.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    </section>` : '';

  const sourced = (a.overview && a.overview.length) ? `
    <p class="source-note">Details on this page are drawn from the Microsoft support, Learn and blog
    articles linked above. Always confirm current behavior against that documentation.</p>` : '';

  const notes = a.notes.length ? `
    <div class="callout">
      <span class="callout-mark">!</span>
      <div><h3 style="font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem">Before you roll this out</h3>
      <ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
    </div>` : '';

  const frontierNote = a.status === 'Frontier' ? `
    <p class="source-note">Frontier is Microsoft's early access program for the latest AI innovations —
    <a href="${FRONTIER_URL}" target="_blank" rel="noopener noreferrer">learn about the Frontier program</a>.</p>` : '';

  $('#detailView').innerHTML = `
    <a class="back-link" href="#/">&larr; All agents</a>
    <div class="detail-hero" style="${accVars(a)}">
      <div class="detail-head">
        <span class="detail-ico">${icon(a.icon)}</span>
        <div class="detail-title">
          <h1>${esc(a.name)}</h1>
          <div class="detail-badges">
            ${statusBadge(a.status)}
            <span class="detail-group">${esc(group ? group.label : a.groupLabel)}</span>
          </div>
        </div>
      </div>
      <p class="detail-desc">${esc(a.description)}</p>
    </div>

    <div class="detail-grid" style="${accVars(a)}">
      <div class="info-card">
        <h3>Where you use it</h3>
        <ul>${a.surfaces.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      <div class="info-card">
        <h3>Licensing</h3>
        <ul><li>${esc(a.license)}</li></ul>
      </div>
      <div class="info-card">
        <h3>Availability</h3>
        <ul><li>${esc(STATUS_BLURB[a.status] || a.status)}</li></ul>
      </div>
    </div>
    ${notes}
    ${overview}
    ${highlights}
    ${scenarios}
    ${limitations}

    <h2 class="section-title">Resources</h2>
    ${resources}
    ${sourced}
    ${frontierNote}

    ${related.length ? `<h2 class="section-title">More in ${esc(group ? group.label : a.groupLabel)}</h2>
      <div class="related-row">${related.map((r) => `
        <a class="related-pill" href="#/${esc(r.id)}" style="${accVars(r)}">${icon(r.icon)}${esc(r.name)}</a>`).join('')}</div>` : ''}
  `;
}

/* ------------------------------------------------------------------ routing */

function route() {
  const id = (location.hash.match(/^#\/(.+)$/) || [])[1];
  const agent = id ? DATA.agents.find((a) => a.id === decodeURIComponent(id)) : null;

  if (agent) {
    $('#listView').hidden = true;
    $('#detailView').hidden = false;
    renderDetail(agent);
    document.title = `${agent.name} — Microsoft 1st Party Agents`;
  } else {
    $('#detailView').hidden = true;
    $('#listView').hidden = false;
    document.title = 'Microsoft 1st Party Agents';
    if (id) location.replace('#/');
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* --------------------------------------------------------------------- init */

function buildFilters() {
  const counts = (fn) => DATA.agents.filter(fn).length;

  $('#statusChips').innerHTML =
    [['all', 'All']].concat(DATA.statuses.map((s) => [s, s]))
      .map(([v, label]) => `
        <button class="chip${v === 'all' ? ' is-active' : ''}" data-status="${esc(v)}">
          ${v === 'all' ? '' : `<i style="background:${STATUS_DOT[v]}"></i>`}${esc(label)}
          <span class="chip-n">${v === 'all' ? DATA.agents.length : counts((a) => a.status === v)}</span>
        </button>`).join('');

  $('#groupChips').innerHTML =
    [['all', 'All products']].concat(DATA.groups.map((g) => [g.id, g.label]))
      .map(([v, label]) => `
        <button class="chip${v === 'all' ? ' is-active' : ''}" data-group="${esc(v)}">${esc(label)}
          <span class="chip-n">${v === 'all' ? DATA.agents.length : counts((a) => a.group === v)}</span>
        </button>`).join('');

  const bind = (sel, key) => $(sel).addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    state[key] = btn.dataset[key];
    $(sel).querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
    renderList();
  });
  bind('#statusChips', 'status');
  bind('#groupChips', 'group');

  let t;
  $('#agentSearch').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); renderList(); }, 120);
  });
}

function renderStats() {
  const n = (s) => DATA.agents.filter((a) => a.status === s).length;
  $('#statRow').innerHTML = [
    [DATA.agents.length, 'Agents catalogued'],
    [n('GA'), 'Generally available'],
    [n('Public Preview'), 'In public preview'],
    [n('Frontier'), 'Frontier early access'],
  ].map(([v, l]) => `<div class="stat"><span class="stat-num">${v}</span><span class="stat-lbl">${l}</span></div>`).join('');

  if (DATA.sourceUpdated) {
    $('#sourceNote').innerHTML =
      `Source: ${esc(DATA.source.title)} &middot; deck last updated ${esc(DATA.sourceUpdated)}
       &middot; site data refreshed
       ${esc(new Date(DATA.generated).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}.`;
  }
}

async function init() {
  try {
    const res = await fetch('data/agents.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    $('#agentGroups').innerHTML =
      `<div class="empty"><strong>Couldn't load the agent catalog.</strong>
       <p class="muted" style="margin-top:.4rem">${esc(err.message)}</p></div>`;
    return;
  }
  DATA.agents.sort((a, b) => a.name.localeCompare(b.name));
  renderStats();
  buildFilters();
  renderList();
  window.addEventListener('hashchange', route);
  route();
}

init();
