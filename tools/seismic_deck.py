"""Thin CLI over seismic-mcp so the refresh pipeline can talk to Seismic.

seismic-mcp speaks MCP over stdio; this calls its tool functions directly so a
plain script (or a scheduled automation) can resolve, inspect and download the
source deck without a chat client in the loop.

Usage:
    python tools/seismic_deck.py status
    python tools/seismic_deck.py resolve <seismic-link-url>
    python tools/seismic_deck.py meta    <content_id>
    python tools/seismic_deck.py download <content_id> [dest_dir]
"""
import asyncio
import json
import os
import sys

SEISMIC_SRC = r"C:\Users\cowi\DEV\seismic-mcp\src"
if SEISMIC_SRC not in sys.path:
    sys.path.insert(0, SEISMIC_SRC)


def _out(obj):
    print(json.dumps(obj, indent=1, default=str))


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    try:
        from seismic_mcp import server
    except Exception as e:  # noqa: BLE001
        _out({"ok": False, "error": f"cannot import seismic_mcp: {e}"})
        return 1

    cmd = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        if cmd == "status":
            _out(await server.tool_status({}))
        elif cmd == "resolve":
            _out(await server.tool_resolve_link({"link": arg}))
        elif cmd == "meta":
            _out(await server.tool_get_content({"content_ids": [arg]}))
        elif cmd == "search":
            _out(await server.tool_search({"query": arg, "limit": 10}))
        elif cmd == "download":
            dest = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
                os.path.expanduser("~"), "Downloads", "seismic")
            _out(await server.tool_download({"content_id": arg, "dest_dir": dest}))
        else:
            _out({"ok": False, "error": f"unknown command: {cmd}"})
            return 2
    except Exception as e:  # noqa: BLE001
        _out({"ok": False, "error": f"{type(e).__name__}: {e}"})
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
