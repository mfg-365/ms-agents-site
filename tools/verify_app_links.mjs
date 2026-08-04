// Verify candidate "Copilot in <App>" URLs actually resolve (HTTP 200).
const CANDIDATES = {
  Word: ['https://support.microsoft.com/en-us/copilot-word', 'https://learn.microsoft.com/en-us/copilot/microsoft-365/wordexcelppt-agents'],
  Excel: ['https://support.microsoft.com/en-us/copilot-excel'],
  PowerPoint: ['https://support.microsoft.com/en-us/copilot-powerpoint'],
  Outlook: ['https://support.microsoft.com/en-us/copilot-outlook'],
  Teams: ['https://support.microsoft.com/en-us/copilot-teams'],
  OneNote: ['https://support.microsoft.com/en-us/copilot-onenote'],
  Loop: ['https://support.microsoft.com/en-us/copilot-loop'],
  OneDrive: ['https://support.microsoft.com/en-us/onedrive/get-started-with-copilot-in-onedrive'],
  SharePoint: ['https://support.microsoft.com/en-us/SharePoint/ai-copilot/microsoft-365-copilot-in-sharepoint-help-learning'],
  Planner: ['https://support.microsoft.com/en-us/Planner/copilot/create-a-new-plan-with-copilot-in-planner-preview'],
  Forms: ['https://support.microsoft.com/en-us/Forms/welcome-to-copilot-in-forms'],
  Viva: ['https://support.microsoft.com/en-us/viva/copilot-in-viva-help-learning'],
  Clipchamp: ['https://support.microsoft.com/en-us/clipchamp/stream-pages/ask-questions-get-summaries-of-any-video-with-microsoft-copilot-in-the-clipchamp-player'],
  // Still unknown — probe plausible shapes.
  Whiteboard: ['https://support.microsoft.com/en-us/whiteboard/copilot-in-microsoft-whiteboard',
               'https://support.microsoft.com/en-us/office/copilot-in-microsoft-whiteboard'],
  Designer: ['https://support.microsoft.com/en-us/designer', 'https://create.microsoft.com/en-us/designer'],
  Stream: ['https://support.microsoft.com/en-us/stream/copilot-in-microsoft-stream'],
  'Copilot Chat': ['https://support.microsoft.com/en-us/copilot', 'https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-chat'],
  'Copilot Pages': ['https://support.microsoft.com/en-us/topic/copilot-pages', 'https://learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-page'],
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

(async () => {
  for (const [app, urls] of Object.entries(CANDIDATES)) {
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
        const html = await r.text();
        const t = (html.match(/<meta[^>]+property="og:title"[^>]*content="([^"]+)/i)
                || html.match(/<title[^>]*>([^<]+)</i) || [])[1] || '';
        console.log(`${r.status} ${app.padEnd(14)} ${u.slice(0, 88)}`);
        console.log(`      title: ${t.slice(0, 95)}`);
      } catch (e) { console.log(`ERR ${app} ${u} ${e.message}`); }
    }
  }
})();
