/* Inline SVG icon set for the agent catalog.
   Hand-built stroke icons on a 24x24 grid — the source deck ships no per-agent
   artwork, so these give each agent a consistent, self-hosted glyph. */
const ICON_PATHS = {
  search:    '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
  chart:     '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="11" width="3" height="6" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>',
  meeting:   '<rect x="3" y="5" width="13" height="12" rx="2.5"/><path d="M16 10l5-3v10l-5-3z"/>',
  globe:     '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z"/>',
  handshake: '<path d="M8 12.5l3 3 5-5"/><path d="M2.5 9.5l4-4 3 2"/><path d="M21.5 9.5l-4-4-3.5 2.5H11"/><path d="M2.5 9.5v6l5 4 4-3"/><path d="M21.5 9.5v6l-5 4-3.5-2.8"/>',
  coin:      '<ellipse cx="12" cy="6.8" rx="7.5" ry="3.3"/><path d="M4.5 6.8v10.4c0 1.8 3.4 3.3 7.5 3.3s7.5-1.5 7.5-3.3V6.8"/><path d="M4.5 12c0 1.8 3.4 3.3 7.5 3.3s7.5-1.5 7.5-3.3"/>',
  doc:       '<path d="M6 2.8h7.5L19 8.3V21a.7.7 0 01-.7.7H6a.7.7 0 01-.7-.7V3.5A.7.7 0 016 2.8z"/><path d="M13.3 2.8v5.6H19"/><path d="M8.5 13h7"/><path d="M8.5 17h4.5"/>',
  grid:      '<rect x="3.3" y="3.8" width="17.4" height="16.4" rx="2"/><path d="M3.3 9.3h17.4"/><path d="M9.5 9.3v10.9"/><path d="M3.3 14.8h17.4"/>',
  slides:    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4"/><path d="M8.5 20h7"/><path d="M7.5 11.5l2.5-2.5 2 2 4.5-4"/>',
  checklist: '<rect x="4" y="3.3" width="16" height="17.4" rx="2.2"/><path d="M8 8.5l1.6 1.6L13 6.7"/><path d="M8 15.5l1.6 1.6L13 13.7"/><path d="M15.5 9h1.5"/><path d="M15.5 16h1.5"/>',
  poll:      '<rect x="3.3" y="3.8" width="17.4" height="16.4" rx="2"/><path d="M8 16.5v-4"/><path d="M12 16.5v-8"/><path d="M16 16.5v-2.5"/>',
  cap:       '<path d="M12 3.5L22 8.5l-10 5-10-5z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 8.5v6"/>',
  shield:    '<path d="M12 2.8l7.5 3v6c0 4.4-3 8.2-7.5 9.4-4.5-1.2-7.5-5-7.5-9.4v-6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  pen:       '<path d="M15.5 4.3l4.2 4.2"/><path d="M17.2 2.6a2.1 2.1 0 013 3L8.4 17.4l-4.4 1.2 1.2-4.4z"/><path d="M4 21.4h16"/>',
  compass:   '<circle cx="12" cy="12" r="8.7"/><path d="M15.6 8.4l-1.9 5.3-5.3 1.9 1.9-5.3z"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  people:    '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 20c0-3.4 2.8-5.7 6.2-5.7s6.2 2.3 6.2 5.7"/><path d="M16.2 5.6a3.3 3.3 0 010 6.3"/><path d="M17.6 14.7c2.2.7 3.6 2.6 3.6 5.3"/>',
  spark:     '<path d="M12 2.8l2.2 5.9 5.9 2.2-5.9 2.2L12 19l-2.2-5.9-5.9-2.2 5.9-2.2z"/><path d="M18.5 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  bulb:      '<path d="M9 17.5a6 6 0 116 0v1.2a1.4 1.4 0 01-1.4 1.4h-3.2A1.4 1.4 0 019 18.7z"/><path d="M9.8 21.5h4.4"/>',
  badge:     '<circle cx="12" cy="9" r="5.3"/><path d="M8.4 13.4L7 21.4l5-2.4 5 2.4-1.4-8"/>',
  flow:      '<rect x="2.8" y="3.5" width="6" height="5" rx="1.4"/><rect x="15.2" y="15.5" width="6" height="5" rx="1.4"/><rect x="9" y="9.5" width="6" height="5" rx="1.4"/><path d="M5.8 8.5v3.5H9"/><path d="M15 18h-3.2v-3.5"/>',
  pulse:     '<path d="M2.8 12.5h4L9 7l3.5 10 2.3-5h6.4"/>',
  scales:    '<path d="M12 3.3v17.4"/><path d="M7 20.7h10"/><path d="M4.5 6.5l15-1.6"/><path d="M4.5 6.5L2 13.2a3 3 0 005 0z"/><path d="M19.5 4.9L17 11.6a3 3 0 005 0z"/>',
  helmet:    '<path d="M3.5 15.5a8.5 8.5 0 0117 0z"/><path d="M2.5 15.5h19a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5z"/><path d="M9.3 7.6v7.9M14.7 7.6v7.9"/>',
  channel:   '<path d="M4.5 9.5h3l7-4v13l-7-4h-3a1.6 1.6 0 01-1.6-1.6v-1.8A1.6 1.6 0 014.5 9.5z"/><path d="M18.3 8.6a5 5 0 010 6.8"/><path d="M7.5 13.5V19"/>',
  book:      '<path d="M3.3 4.4A16 16 0 0112 6.3a16 16 0 018.7-1.9v13.2A16 16 0 0012 19.5a16 16 0 00-8.7-1.9z"/><path d="M12 6.3v13.2"/>',
  target:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4"/>',
  gauge:     '<path d="M3.5 17.5a9 9 0 1117 0"/><path d="M12 17.5l4-5.5"/><circle cx="12" cy="17.5" r="1.3"/>',
  ticket:    '<path d="M3 8.2A1.7 1.7 0 014.7 6.5h14.6A1.7 1.7 0 0121 8.2v1.9a2 2 0 000 3.8v1.9a1.7 1.7 0 01-1.7 1.7H4.7A1.7 1.7 0 013 15.8v-1.9a2 2 0 000-3.8z"/><path d="M14 6.5v11"/>',
  funnel:    '<path d="M3 4.5h18l-6.8 8v7l-4.4 2.4v-9.4z"/>',
  trend:     '<path d="M3 17.5l5.5-5.5 3.5 3.5 7-7"/><path d="M14.5 8.5H19v4.5"/><path d="M3 20.7h18"/>',
  rocket:    '<path d="M12 2.8c3.4 2.4 5.2 5.9 5.2 9.6l-2.4 3H9.2l-2.4-3c0-3.7 1.8-7.2 5.2-9.6z"/><circle cx="12" cy="10" r="1.9"/><path d="M9.2 15.4L6 18.6l2 .5.5 2 2.7-2.7"/><path d="M14.8 15.4l3.2 3.2-2 .5-.5 2-2.7-2.7"/>',
  trophy:    '<path d="M7 3.8h10v5.4a5 5 0 01-10 0z"/><path d="M7 5.5H4.3v1.6A3.4 3.4 0 007.4 10.5"/><path d="M17 5.5h2.7v1.6a3.4 3.4 0 01-3.1 3.4"/><path d="M12 14.2v3.4"/><path d="M8.3 20.2h7.4"/><path d="M9.6 17.6h4.8l1.3 2.6H8.3z"/>',
  truck:     '<path d="M2.8 6.5h10.4v10H2.8z"/><path d="M13.2 9.8h4l3 3.2v3.5h-7z"/><circle cx="7" cy="18.3" r="1.9"/><circle cx="17" cy="18.3" r="1.9"/>',
  ledger:    '<rect x="4" y="3.3" width="16" height="17.4" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/><path d="M4 7.5h2.5M4 12h2.5M4 16.5h2.5"/>',
  clock:     '<circle cx="12" cy="12" r="8.7"/><path d="M12 6.8V12l3.4 2.1"/>',
  receipt:   '<path d="M5.3 2.8h13.4v18.4l-2.7-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.2-1.6-1.9 1.6z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  approve:   '<path d="M20.8 6.5v12.2a1.7 1.7 0 01-1.7 1.7H4.9a1.7 1.7 0 01-1.7-1.7V5.3a1.7 1.7 0 011.7-1.7h9.3"/><path d="M8.5 11.5l3 3 8-8.5"/>',
  calendar:  '<rect x="3.3" y="5" width="17.4" height="15.7" rx="2"/><path d="M3.3 10h17.4"/><path d="M8 2.8v4.4M16 2.8v4.4"/><path d="M8 14h3"/>',
  link:      '<path d="M10 13.5a4 4 0 006 .5l2.5-2.5a4.2 4.2 0 00-6-6L11 7"/><path d="M14 10.5a4 4 0 00-6-.5L5.5 12.5a4.2 4.2 0 006 6L13 17"/>',
};

/* Link-label -> resource glyph, so a Resources tile hints at what it opens. */
const RES_ICONS = [
  [/video|watch|youtube/i, 'meeting'],
  [/blog|ignite/i,         'pen'],
  [/learn|support|readiness|article/i, 'book'],
  [/guide|deck|adoption/i, 'slides'],
  [/product|page|site/i,   'globe'],
];

export function icon(name, cls) {
  const d = ICON_PATHS[name] || ICON_PATHS.spark;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
}

export function resourceIcon(label) {
  for (const [re, name] of RES_ICONS) if (re.test(label)) return icon(name);
  return icon('link');
}

export { ICON_PATHS };
