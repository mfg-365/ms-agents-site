# Microsoft 1st Party Agents

Catalog site for Microsoft's first-party AI agents — availability status (GA, Public Preview,
Frontier), surfaces, and resource links. Part of the mfg-365.com global nav.

Live preview: https://mfg-365.github.io/ms-agents-site/

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
