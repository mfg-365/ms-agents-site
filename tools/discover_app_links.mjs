// Discover real "Copilot in <App>" support/learn hub URLs by following the
// known-good ones and harvesting in-page links, rather than guessing patterns.
const SEEDS = [
  'https://support.microsoft.com/en-us/copilot-word',
  'https://support.microsoft.com/en-us/copilot-excel',
  'https://support.microsoft.com/en-us/copilot-teams',
  'https://support.microsoft.com/en-us/copilot',
  'https://support.microsoft.com/en-us/office',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

const APPS = ['word','excel','powerpoint','outlook','teams','onenote','loop','onedrive',
  'sharepoint','planner','forms','whiteboard','engage','stream','designer','clipchamp','viva'];

(async () => {
  const found = new Map();
  for (const seed of SEEDS) {
    try {
      const r = await fetch(seed, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      const html = await r.text();
      const re = /href="(\/en-us\/[^"#?]*copilot[^"#?]*)"/gi;
      let m;
      while ((m = re.exec(html))) {
        const u = 'https://support.microsoft.com' + m[1];
        const low = u.toLowerCase();
        const app = APPS.find((a) => low.includes('/' + a + '/') || low.includes('copilot-' + a));
        if (app && !found.has(u)) found.set(u, app);
      }
      console.log(`seed ok: ${seed} (${r.status}) -> total candidates ${found.size}`);
    } catch (e) { console.log('seed fail', seed, e.message); }
  }
  const byApp = {};
  for (const [u, app] of found) (byApp[app] ||= []).push(u);
  for (const app of Object.keys(byApp).sort()) {
    console.log('\n##', app);
    byApp[app].slice(0, 6).forEach((u) => console.log('   ', u));
  }
  console.log('\nApps with no candidates:', APPS.filter((a) => !byApp[a]).join(', '));
})();
