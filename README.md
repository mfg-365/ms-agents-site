# Microsoft 1st Party Agents

Catalog site for Microsoft's first-party AI agents — availability status (GA, Public Preview,
Frontier), surfaces, and resource links. Part of the mfg-365.com global nav.

Live: https://www.mfg-365.com/agents/
Preview: https://mfg-365.github.io/ms-agents-site/

Published as a subsite of www.mfg-365.com. The combined bundle is built by
C:\Users\cowi\Downloads\mfg365-swa-deploy\scripts\deploy-all.ps1, which pulls this
repo and injects the shared mfg-365 top bar. A GitHub push alone does not update
www.mfg-365.com - the deploy script has to run (daily at 10am, or immediately
after the weekly content refresh).

## Data pipeline

Source of truth is the internal Microsoft "ABS Out-of-Box Agents - Customer ready" deck,
monitored for updates.

    tools/extract_pptx.py    PPTX  -> tools/out/deck.json   (text, hyperlinks, media)
    tools/build_agents.py    deck.json -> data/agents.json  (normalized catalog)

Regenerate the catalog after a deck refresh:

    python tools/extract_pptx.py "<path to deck.pptx>"
    python tools/build_agents.py

## Site

Static, no build step. `index.html` + `assets/` + `data/agents.json`.
Agent detail pages are hash-routed (`#/<agent-id>`).
