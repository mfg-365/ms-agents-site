# Weekly refresh

The site rebuilds itself from public Microsoft sources.

    node tools/refresh.mjs              # refresh, commit, push, redeploy
    node tools/refresh.mjs --dry-run    # report what would change, touch nothing
    node tools/refresh.mjs --deck "C:\path\to\ABS Out-of-Box Agents.pptx"

Runs weekly on Friday at 8pm via the "Microsoft Agents Site Weekly Refresh"
automation.

## What refreshes automatically

| Source | Where it lands | Cadence |
| --- | --- | --- |
| Microsoft 365 Roadmap API | Copilot in Apps -> Coming next | every run |
| Microsoft blog RSS feeds | Copilot in Apps -> Related blog posts | every run |
| Support / Learn article text | Agent detail pages | re-fetched when older than 7 days |
| Agent catalog (source deck) | Agents page | only when --deck is supplied |

## What needs a human

The agent catalog comes from the internal "ABS Out-of-Box Agents" deck, which
sits behind sign-in and can't be fetched unattended. When a new version is
published, download it and re-run with `--deck <path>`.

The refresh skips the commit entirely when only build timestamps changed, so a
quiet week leaves no noise in the history.
