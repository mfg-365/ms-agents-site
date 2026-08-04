"""deck.json -> data/agents.json

Normalizes the ABS Out-of-Box Agents deck into a stable, site-ready catalog.
Re-runnable: safe to invoke every time the Seismic deck changes.
"""
import json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DECK = os.path.join(HERE, "out", "deck.json")
OUT = os.path.join(ROOT, "data", "agents.json")

# Header row -> (group label, group id, default status, license)
GROUPS = [
    (r"Microsoft 365 Copilot license.*Generally Available",
     "Microsoft 365 Copilot", "m365-copilot", "GA", "Microsoft 365 Copilot license"),
    (r"all Copilot eligible users.*Generally Available",
     "All Copilot Eligible Users", "copilot-eligible", "GA", "No additional license — included for Copilot Chat users"),
    (r"Custom Template available with Copilot Studio license",
     "Copilot Studio Templates", "copilot-studio", "GA", "Copilot Studio license"),
    (r"Microsoft 365 Copilot license.*Frontier",
     "Microsoft 365 Copilot — Frontier", "m365-frontier", "Frontier", "Microsoft 365 Copilot license + Frontier program"),
    (r"Microsoft 365 Copilot license.*Public Preview",
     "Microsoft 365 Copilot — Preview", "m365-preview", "Public Preview", "Microsoft 365 Copilot license"),
    (r"Dynamics 365 Customer Service.*Contact Center",
     "Dynamics 365 Customer Service & Contact Center", "d365-service", "GA", "Dynamics 365 Customer Service / Contact Center"),
    (r"Microsoft Agents in Dynamics 365 Sales",
     "Dynamics 365 Sales", "d365-sales", "GA", "Dynamics 365 Sales"),
    (r"D365 Supply Chain.*Finance.*Project Operations",
     "Dynamics 365 Supply Chain, Finance & Operations", "d365-ops", "Public Preview", "Dynamics 365 Supply Chain / Finance & Ops / Project Operations"),
]

# Surface strings are jammed together in the deck cells; split on known products.
SURFACE_TOKENS = [
    "Microsoft Admin Center (MAC)", "Viva Engage (Yammer Communities)",
    "D365 Customer Service (Agent workspace)", "D365 Supply Chain (Procurement)",
    "Within D365 Finance (Finance modules)", "Agent Menu Tools drop-down in Chat",
    "Email drafts in Outlook", "Teams chat rail", "D365 Project Operations",
    "D365 Customer Service", "D365 Contact Center", "D365 Field Service",
    "Teams meetings", "Teams channels", "Teams chat", "Copilot Chat",
    "M365 Copilot", "D365 Sales", "D365 Finance", "Outlook", "Excel",
    "Forms", "Teams", "Word",
]

# Icon glyph + accent per agent id (accent keys map to CSS palette vars).
ICONS = {
    "researcher": ("search", "blue"), "analyst": ("chart", "teal"),
    "facilitator": ("meeting", "purple"), "interpreter": ("globe", "pink"),
    "sales-agent": ("handshake", "blue"), "finance-agent": ("coin", "teal"),
    "word-agent": ("doc", "blue"), "excel-agent": ("grid", "teal"),
    "powerpoint-agent": ("slides", "pink"), "planner-agent": ("checklist", "purple"),
    "surveys-agent": ("poll", "teal"), "learning-agent": ("cap", "purple"),
    "microsoft-365-admin-agent": ("shield", "blue"), "writing-coach": ("pen", "pink"),
    "career-coach": ("compass", "purple"), "plan-my-day": ("sun", "amber"),
    "sme-finder": ("people", "teal"), "prompt-coach": ("spark", "purple"),
    "ideas-coach": ("bulb", "amber"), "ai-learning-advisor": ("cap", "blue"),
    "employee-self-service": ("badge", "teal"), "workflows-agent": ("flow", "purple"),
    "workforce-insights-agent": ("pulse", "blue"), "legal-agent": ("scales", "pink"),
    "frontline-agent": ("helmet", "amber"), "agents-in-channels": ("channel", "purple"),
    "agents-in-communities": ("people", "pink"),
    "knowledge-management-agent": ("book", "blue"), "customer-intent-agent": ("target", "purple"),
    "quality-evaluation-agent": ("gauge", "teal"), "case-management-agent": ("ticket", "blue"),
    "sales-qualification-agent": ("funnel", "teal"), "sales-research-agent": ("search", "purple"),
    "sales-opportunity-agent": ("trend", "blue"), "sales-development-agent": ("rocket", "pink"),
    "sales-close-agent": ("trophy", "amber"),
    "supplier-communications": ("truck", "blue"), "account-reconciliations": ("ledger", "teal"),
    "time-entry-agent": ("clock", "purple"), "expense-agent": ("receipt", "pink"),
    "activity-approvals-agent": ("approve", "teal"), "scheduling-operations-agent": ("calendar", "blue"),
}


def slug(name):
    s = re.sub(r"\(.*?\)", " ", name)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s


def split_surfaces(text):
    if not text:
        return []
    found, rest = [], text
    for tok in SURFACE_TOKENS:
        idx = rest.find(tok)
        while idx != -1:
            found.append((idx, tok))
            rest = rest[:idx] + "\u0000" * len(tok) + rest[idx + len(tok):]
            idx = rest.find(tok)
    # Keep original reading order, drop tokens swallowed by a longer match.
    found.sort()
    out = []
    for _, tok in found:
        if tok not in out:
            out.append(tok)
    return out or [text.strip()]


def pull_status(name, group_status):
    """Per-agent status suffix, e.g. 'Sales Close Agent (Public Preview)'."""
    m = re.search(r"\(([^)]*)\)\s*$", name.strip())
    status, clean = group_status, name.strip()
    if m:
        tag = m.group(1)
        low = tag.lower()
        if "public preview" in low:
            status, clean = "Public Preview", name[: m.start()].strip()
        elif "frontier" in low:
            status, clean = "Frontier", name[: m.start()].strip()
        elif low.strip() in ("ga", "generally available"):
            status, clean = "GA", name[: m.start()].strip()
    return clean, status


def split_notes(desc):
    """Pull licensing / prerequisite sentences out of the description."""
    notes = []
    patterns = [
        r"Licensing:.*$",
        r"Requires [^.]*\.",
        r"Integration needed[^.]*\.",
        r"Setup needed[^.]*\.",
        r"Currently available only[^.]*\.",
    ]
    for p in patterns:
        for m in re.finditer(p, desc):
            t = m.group(0).strip()
            if t and t not in notes:
                notes.append(t)
    for n in notes:
        desc = desc.replace(n, " ")
    return re.sub(r"\s+", " ", desc).strip(" .;") + ".", notes


def dedupe_links(links):
    seen, out = set(), []
    for l in links:
        url = l["url"].strip()
        label = re.sub(r"\s+", " ", l["label"]).strip(" ,")
        if not url or url in seen or not label:
            continue
        seen.add(url)
        out.append({"label": label, "url": url})
    return out


def main():
    deck = json.load(open(DECK, encoding="utf-8"))

    updated = ""
    for s in deck["slides"]:
        for t in s["texts"]:
            m = re.search(r"Last updated\s+(.+)", t["text"])
            if m and not updated:
                updated = m.group(1).strip()

    agents, groups_seen, order = [], {}, 0
    for slide in deck["slides"]:
        for table in slide["tables"]:
            rows = table["rows"]
            if len(rows) < 3:
                continue
            header = rows[0][0]["text"]
            match = next(((g) for g in GROUPS if re.search(g[0], header, re.I)), None)
            if not match:
                print("  ! unmatched group header:", header[:80])
                continue
            _, glabel, gid, gstatus, glicense = match
            if gid not in groups_seen:
                order += 1
                groups_seen[gid] = {"id": gid, "label": glabel, "license": glicense,
                                    "order": order, "header": header}
            for row in rows[2:]:
                raw_name = row[0]["text"].strip()
                if not raw_name or raw_name.lower() == "agent":
                    continue
                name, status = pull_status(raw_name, gstatus)
                desc, notes = split_notes(row[1]["text"].strip())
                aid = slug(name)
                icon, accent = ICONS.get(aid, ("spark", "blue"))
                agents.append({
                    "id": aid,
                    "name": name,
                    "status": status,
                    "group": gid,
                    "groupLabel": glabel,
                    "license": glicense,
                    "description": desc,
                    "notes": notes,
                    "surfaces": split_surfaces(row[2]["text"].strip()),
                    "links": dedupe_links(row[3]["links"]),
                    "icon": icon,
                    "accent": accent,
                })

    # Merge duplicates (an agent can legitimately appear on more than one slide).
    merged = {}
    for a in agents:
        if a["id"] in merged:
            m = merged[a["id"]]
            m["links"] = dedupe_links(m["links"] + a["links"])
            for s in a["surfaces"]:
                if s not in m["surfaces"]:
                    m["surfaces"].append(s)
        else:
            merged[a["id"]] = a
    agents = list(merged.values())

    missing = [a["id"] for a in agents if a["id"] not in ICONS]
    if missing:
        print("  ! no icon mapping for:", ", ".join(missing))

    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "sourceUpdated": updated,
        "source": {
            "title": "ABS Out-of-Box Agents - Customer ready",
            "url": "https://microsoft.seismic.com/Link/Content/DCVbJbD8mp3dD82CWXCfXWqTG2PP",
        },
        "statuses": ["GA", "Public Preview", "Frontier"],
        "groups": sorted(groups_seen.values(), key=lambda g: g["order"]),
        "agents": agents,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)

    print(f"agents: {len(agents)}  groups: {len(groups_seen)}  sourceUpdated: {updated}")
    for g in payload["groups"]:
        n = sum(1 for a in agents if a["group"] == g["id"])
        print(f"  {g['label']}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
