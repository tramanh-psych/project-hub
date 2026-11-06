#!/usr/bin/env python3
"""Convert a progress workbook (the "1-Progress / 2-Members / Lists" template)
into SQL that loads one project into Project Hub.

Usage:
    python3 -I scripts/import_xlsx.py WORKBOOK.xlsx --code FF2027 \
        --name "False Friend" --lead TA --lead-email you@example.com > seed.sql

Then paste seed.sql into Supabase -> SQL Editor -> Run (it is one atomic block).

Workbook layout expected:
    1-Progress  header row (first cell "ID"), data from row 6:
                ID, Phase, Task (EN), Task (other language), Category, Owner code, Owner,
                Start, Deadline, Hours, Status, Self-reported %, ..., Date completed,
                ..., Deliverable / notes
                The other-language column is detected from its header:
                "中文" -> Chinese title, "Việt" -> Vietnamese title.
    2-Members   header row, data from row 5: Code, Name, Role, Responsibilities
                (rows named "(reserve)" are skipped)
    Lists       column H = phases, column I = categories

The lead member is linked to your account through --lead-email: if the account
already exists they are linked at once, otherwise on first sign-up. Other members
are added without email; set theirs in the app (Members tab).
Seed files contain real names: keep them out of Git (see .gitignore).
"""
import argparse
import datetime as dt
import json
import sys

import openpyxl

STATUS = {
    "not started": "not_started",
    "in progress": "in_progress",
    "done": "done",
    "on hold": "on_hold",
    "submitted": "submitted",
}


def q(v):
    """SQL literal."""
    if v is None or v == "":
        return "null"
    if isinstance(v, (dt.datetime, dt.date)):
        return "'%s'" % (v.date() if isinstance(v, dt.datetime) else v).isoformat()
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).strip().replace("'", "''") + "'"


def arr(items):
    return "array[" + ",".join(q(i) for i in items) + "]::text[]" if items else "'{}'::text[]"


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        if v.startswith("="):  # formula cell, value not stored
            return None
        return v or None
    return v


def to_date(v):
    return v.date() if isinstance(v, dt.datetime) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook")
    ap.add_argument("--code", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--kind", default="led", choices=["led", "collab", "personal"])
    ap.add_argument("--lead", default="TA", help="member code that is you (the lead)")
    ap.add_argument("--lead-email", help="your account email; links the lead member to you")
    ap.add_argument("--description", default=None)
    ap.add_argument("--color", default="#2a78d6")
    ap.add_argument("--visibility", default="all", choices=["all", "own"])
    ap.add_argument("--link", action="append", default=[], help="label=url, repeatable")
    a = ap.parse_args()

    wb = openpyxl.load_workbook(a.workbook, data_only=False)

    lists = wb["Lists"]
    phases = [clean(r[7]) for r in lists.iter_rows(min_row=2, values_only=True) if clean(r[7])]
    cats = [clean(r[8]) for r in lists.iter_rows(min_row=2, values_only=True) if clean(r[8])]

    members = []
    for r in wb["2-Members"].iter_rows(min_row=5, values_only=True):
        code = clean(r[0])
        name = clean(r[1])
        if not code or len(code) > 8 or " " in code or "\n" in code:
            if members:
                break
            continue
        if not name or name.lower().startswith("(reserve"):
            continue
        members.append(dict(code=code, name=name, title=clean(r[2]), resp=clean(r[3])))

    prog = wb["1-Progress"]
    header_row = next((r for r in range(1, 8) if str(prog.cell(row=r, column=1).value or "").strip() == "ID"), 5)
    alt_header = str(prog.cell(row=header_row, column=4).value or "")
    alt_col = "title_zh" if "中文" in alt_header else "title_vi" if "Việt" in alt_header else None

    tasks = []
    for r in prog.iter_rows(min_row=6, values_only=True):
        if not clean(r[2]):
            continue
        status = STATUS.get(str(clean(r[10]) or "not started").lower(), "not_started")
        pct = clean(r[11])
        pct = int(round(float(pct) * 100)) if isinstance(pct, (int, float)) and pct <= 1 else (int(pct) if isinstance(pct, (int, float)) else 0)
        if status == "done":
            pct = 100
        tasks.append(dict(ref=clean(r[0]), phase=clean(r[1]), title=clean(r[2]), alt=clean(r[3]),
                          cat=clean(r[4]), owner=clean(r[5]), start=clean(r[7]), due=clean(r[8]),
                          hours=clean(r[9]) or 0, status=status, pct=pct, done=clean(r[13]),
                          deliv=clean(r[16])))

    codes = {m["code"] for m in members}
    for t in tasks:
        if t["owner"] and t["owner"] not in codes:
            sys.exit("Task %s is assigned to code %r, which is not an active member" % (t["ref"], t["owner"]))

    starts = [to_date(t["start"]) for t in tasks if t["start"]]
    ends = [to_date(t["due"]) for t in tasks if t["due"]]
    links = []
    for item in a.link:
        label, _, url = item.partition("=")
        links.append({"label": label, "url": url})

    out = []
    w = out.append
    w("-- Generated by scripts/import_xlsx.py from %s" % a.workbook.split("/")[-1])
    w("-- %d members, %d tasks%s" % (len(members), len(tasks), "" if alt_col else " (no other-language titles)"))
    w("do $$")
    w("declare pid uuid; m jsonb := '{}'::jsonb; mid uuid;")
    w("begin")
    w("  insert into public.projects(code, name, description, kind, color, start_date, end_date, phases, categories, task_visibility, links)")
    w("  values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb) returning id into pid;"
      % (q(a.code), q(a.name), q(a.description), q(a.kind), q(a.color),
         q(min(starts)) if starts else "null", q(max(ends)) if ends else "null",
         arr(phases), arr(cats), q(a.visibility), q(json.dumps(links, ensure_ascii=False))))
    for mb in members:
        is_lead = mb["code"] == a.lead
        w("  insert into public.project_members(project_id, code, display_name, role, title, responsibilities)")
        w("  values (pid, %s, %s, %s, %s, %s) returning id into mid;"
          % (q(mb["code"]), q(mb["name"]), q("lead" if is_lead else "member"), q(mb["title"]), q(mb["resp"])))
        w("  m := m || jsonb_build_object(%s, mid);" % q(mb["code"]))
        if is_lead and a.lead_email:
            w("  insert into public.member_emails(member_id, email) values (mid, %s);" % q(a.lead_email.lower()))
    if not any(mb["code"] == a.lead for mb in members):
        sys.exit("Lead code %r not found among members" % a.lead)
    cols = "project_id, ref, phase, category, title, %sassignee_id, start_date, due_date, est_hours, status, progress, completed_at, deliverable" % (alt_col + ", " if alt_col else "")
    w("  insert into public.tasks(%s) values" % cols)
    rows = []
    for t in tasks:
        assignee = "(m->>%s)::uuid" % q(t["owner"]) if t["owner"] else "null"
        rows.append("   (pid, %s, %s, %s, %s, %s%s, %s, %s, %s, %s, %s, %s, %s)" % (
            q(t["ref"]), q(t["phase"]), q(t["cat"]), q(t["title"]), (q(t["alt"]) + ", ") if alt_col else "",
            assignee, q(t["start"]), q(t["due"]), q(t["hours"]), q(t["status"]), q(t["pct"]), q(t["done"]), q(t["deliv"])))
    w(",\n".join(rows) + ";")
    w("end $$;")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
