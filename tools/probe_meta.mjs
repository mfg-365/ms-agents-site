// Probe: can we pull a usable summary from the public articles linked in the deck?
const urls = [
  'https://learn.microsoft.com/en-us/MicrosoftTeams/facilitator-teams',
  'https://support.microsoft.com/en-us/office/facilitator-in-microsoft-teams-meetings-37657f91-39b5-40eb-9421-45141e3ce9f6',
  'https://www.microsoft.com/microsoft-365/blog/2025/03/25/introducing-researcher-and-analyst-in-microsoft-365-copilot/',
  'https://techcommunity.microsoft.com/blog/Microsoft365CopilotBlog/sales-agent---the-copilot-agent-that-speaks-sales/4476894',
  'https://learn.microsoft.com/en-us/copilot/microsoft-365/wordexcelppt-agents',
  'https://support.microsoft.com/en-us/topic/what-is-planner-agent-in-copilot-afdd030e-3f76-47ea-9178-29e57730fd5b',
];

const meta = (html, re) => (html.match(re) || [])[1];

(async () => {
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const h = await r.text();
      const d = meta(h, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)/i)
             || meta(h, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)/i);
      const t = meta(h, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i)
             || meta(h, /<title[^>]*>([^<]+)/i);
      console.log('---', r.status, u.slice(0, 78));
      console.log('   title:', (t || 'NONE').slice(0, 110));
      console.log('   desc :', (d || 'NONE').slice(0, 260));
    } catch (e) {
      console.log('ERR', u, e.message);
    }
  }
})();
