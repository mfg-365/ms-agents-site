# Weekly refresh

The site rebuilds itself from public Microsoft sources.

    node tools/refresh.mjs              # check deck, refresh, commit, push, redeploy
    node tools/refresh.mjs --dry-run    # report what would change, touch nothing
    node tools/refresh.mjs --deck "<path to pptx>"   # also rebuild the agent catalog

Runs weekly on Friday at 8pm via the "Microsoft Agents Site Weekly Refresh"
automation.

## What refreshes automatically

| Source | Where it lands | Cadence |
| --- | --- | --- |
| Seismic deck metadata (version/size/date) | change detection only | every run |
| Microsoft 365 Roadmap API | Copilot in Apps -> Coming next | every run |
| Microsoft blog RSS feeds | Copilot in Apps -> Related blog posts | every run |
| Support / Learn article text | Agent detail pages | re-fetched when older than 7 days |

The refresh skips the commit entirely when only build timestamps changed, so a
quiet week leaves no noise in the history.

## The source deck

The agent catalog comes from "ABS Out-of-Box Agents - Customer ready" on
Seismic. Version changes ARE detected automatically via `tools/seismic_check.py`,
which reads live metadata through the signed-in Edge CDP session:

    python tools/seismic_check.py                # 0 unchanged, 3 changed, 4 cannot check
    python tools/seismic_check.py --set-baseline # accept current version as current

Downloading the file still needs one human click. Seismic serves binaries
through an async request -> push-notification -> signed-URL flow that does not
drive reliably headless (seismic-mcp's own `seismic_download` was tried and
times out). So when a change is detected the refresh reports it with a deep
link rather than silently continuing on stale data.

To apply a new deck:

1. Open https://microsoft.seismic.com/Link/Content/DCVbJbD8mp3dD82CWXCfXWqTG2PP
2. Download the PPTX
3. `node tools/refresh.mjs --deck "<path to the downloaded pptx>"`

Step 3 rebuilds the agent catalog and re-baselines the deck automatically.

## Prerequisites

Deck checking needs an Edge window on debug port 9222 signed in to Seismic:

    powershell -ExecutionPolicy Bypass -File C:\Users\cowi\DEV\seismic-mcp\start-edge-cdp.ps1

If that session expires the refresh still runs; it just reports that the deck
could not be checked.
