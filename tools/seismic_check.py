"""Check whether the source deck on Seismic has changed.

Reads live metadata (version, modified date, size) for the ABS Out-of-Box
Agents deck straight from Seismic using the signed-in Edge session, and
compares it against the baseline captured the last time the site was built.

This is the automated half of deck monitoring. Downloading the binary still
needs a human click — Seismic delivers content through an async request /
push-notification / signed-URL flow that doesn't drive reliably headless — so
when a change is detected we surface the deep link instead of guessing.

Usage:
    python tools/seismic_check.py             # compare against baseline
    python tools/seismic_check.py --set-baseline   # accept current as current
    python tools/seismic_check.py --json      # machine-readable only

Exit codes: 0 unchanged, 3 changed, 4 could not check (auth/network).
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

SEISMIC_SRC = r"C:\Users\cowi\DEV\seismic-mcp\src"
if SEISMIC_SRC not in sys.path:
    sys.path.insert(0, SEISMIC_SRC)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASELINE = os.path.join(ROOT, "data", "deck-baseline.json")

# The "ABS Out-of-Box Agents - Customer ready" deck backing the Agents page.
CONTENT_ID = "53618d65-86be-4705-85ae-0e5cdfac8f42"
DECK_NAME = "ABS Out-of-Box Agents - Customer ready"
DECK_LINK = "https://microsoft.seismic.com/Link/Content/DCVbJbD8mp3dD82CWXCfXWqTG2PP"

JSON_ONLY = "--json" in sys.argv
SET_BASELINE = "--set-baseline" in sys.argv

# Fields that mean the deck's *content* moved, not just a metadata touch.
TRACKED = ("version", "size_bytes", "pages", "published_at")


def say(*a):
    if not JSON_ONLY:
        print(*a)


def load_baseline():
    """Returns (baseline_or_None, error_or_None).

    A missing file is fine — we create one. A file that exists but won't parse
    is NOT fine: silently re-baselining there would mask a real deck change.
    """
    if not os.path.exists(BASELINE):
        return None, None
    try:
        # utf-8-sig tolerates a BOM, which some editors and PowerShell add.
        with open(BASELINE, encoding="utf-8-sig") as f:
            return json.load(f), None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}"


def save_baseline(meta):
    os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
    payload = {
        "contentId": CONTENT_ID,
        "name": meta.get("name", DECK_NAME),
        "link": DECK_LINK,
        "version": meta.get("version"),
        "sizeBytes": meta.get("size_bytes"),
        "pages": meta.get("pages"),
        "publishedAt": meta.get("published_at"),
        "modifiedAt": meta.get("modified_at"),
        "capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(BASELINE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1)
    return payload


async def fetch_meta():
    from seismic_mcp import server
    res = await server.tool_search({"query": DECK_NAME, "limit": 25})
    for item in res.get("items", []):
        if item.get("id") == CONTENT_ID:
            return item
    # Fall back to an exact name match if the id ever changes.
    for item in res.get("items", []):
        if item.get("name", "").strip().lower() == DECK_NAME.lower():
            return item
    return None


async def main():
    try:
        meta = await fetch_meta()
    except Exception as e:  # noqa: BLE001
        out = {"ok": False, "reason": f"{type(e).__name__}: {e}",
               "hint": "Edge CDP on port 9222 must be running and signed in to "
                       "microsoft.seismic.com. Run seismic-mcp\\start-edge-cdp.ps1."}
        print(json.dumps(out, indent=1))
        return 4

    if not meta:
        out = {"ok": False, "reason": "deck not found in Seismic search results",
               "contentId": CONTENT_ID}
        print(json.dumps(out, indent=1))
        return 4

    prior, prior_err = load_baseline()

    if prior_err and not SET_BASELINE:
        out = {"ok": False, "reason": f"baseline file unreadable ({prior_err})",
               "path": BASELINE,
               "hint": "Fix or delete the file, then re-run with --set-baseline."}
        print(json.dumps(out, indent=1))
        return 4

    if SET_BASELINE or not prior:
        saved = save_baseline(meta)
        say(f"Baseline {'updated' if prior else 'created'}: "
            f"v{saved['version']}, {saved['sizeBytes']:,} bytes, "
            f"published {saved['publishedAt']}")
        if JSON_ONLY:
            print(json.dumps({"ok": True, "changed": False, "baseline": saved}, indent=1))
        return 0

    changes = []
    for key in TRACKED:
        camel = {"size_bytes": "sizeBytes", "published_at": "publishedAt"}.get(key, key)
        was, now = prior.get(camel), meta.get(key)
        if was != now:
            changes.append({"field": camel, "was": was, "now": now})

    result = {
        "ok": True,
        "changed": bool(changes),
        "name": meta.get("name"),
        "link": DECK_LINK,
        "contentId": CONTENT_ID,
        "current": {
            "version": meta.get("version"),
            "sizeBytes": meta.get("size_bytes"),
            "pages": meta.get("pages"),
            "publishedAt": meta.get("published_at"),
            "modifiedAt": meta.get("modified_at"),
        },
        "baseline": {
            "version": prior.get("version"),
            "sizeBytes": prior.get("sizeBytes"),
            "pages": prior.get("pages"),
            "publishedAt": prior.get("publishedAt"),
            "capturedAt": prior.get("capturedAt"),
        },
        "changes": changes,
    }

    if changes:
        result["action"] = (
            "Open the deck in Seismic, download it, then rebuild the agent "
            'catalog: node tools/refresh.mjs --deck "<path to downloaded pptx>". '
            "Afterwards run: python tools/seismic_check.py --set-baseline"
        )

    print(json.dumps(result, indent=1))

    if not JSON_ONLY:
        if changes:
            say("\nDeck CHANGED since the site was last built:")
            for c in changes:
                say(f"  {c['field']}: {c['was']} -> {c['now']}")
            say(f"\n  {DECK_LINK}")
        else:
            say(f"\nDeck unchanged (v{meta.get('version')}, "
                f"published {meta.get('published_at')}).")

    return 3 if changes else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
