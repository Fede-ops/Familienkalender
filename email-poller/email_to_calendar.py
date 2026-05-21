#!/usr/bin/env python3
"""
Familienkalender – Email-to-Calendar Poller
Läuft auf Home Assistant via shell_command alle 10 Minuten.
Pollt familienkalender@gugg.tech, parst Emails und legt Events in HA an.

Setup: siehe README im selben Ordner.
"""

import imaplib
import email
import json
import urllib.request
import urllib.error
import re
import ssl
import sys
from email.header import decode_header
from datetime import datetime, date, timedelta

# ── Konfiguration — vom Benutzer ausfüllen ────────────────────────────────────
IMAP_HOST = "mail.infomaniak.com"
IMAP_PORT = 993
IMAP_USER = "familienkalender@gugg.tech"
IMAP_PASS = "DEIN_EMAIL_PASSWORT"

HA_URL = "http://localhost:8123"
HA_TOKEN = "DEIN_HA_LONG_LIVED_TOKEN"
HA_CALENDAR = "calendar.bebos"  # Ziel-Kalender

ANTHROPIC_API_KEY = "DEIN_ANTHROPIC_API_KEY"
# ─────────────────────────────────────────────────────────────────────────────


def decode_str(s):
    if not s:
        return ""
    parts = decode_header(s)
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(part)
    return "".join(out)


def parse_ics(text):
    """Parst VCALENDAR/.ics direkt ohne externe Bibliothek."""
    events, current, in_ev = [], {}, False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == "BEGIN:VEVENT":
            in_ev, current = True, {}
        elif line == "END:VEVENT":
            if current:
                events.append(current)
            in_ev = False
        elif in_ev and ":" in line:
            key, _, val = line.partition(":")
            events and None  # noqa
            current[key.split(";")[0]] = val

    if not events:
        return None

    ev = events[0]
    summary  = ev.get("SUMMARY", "Termin")
    dtstart  = ev.get("DTSTART", "")
    dtend    = ev.get("DTEND", "")
    location = ev.get("LOCATION", "")
    desc     = ev.get("DESCRIPTION", "").replace("\\n", "\n")

    all_day = len(dtstart) == 8 or (len(dtstart) > 8 and "T" not in dtstart)

    if all_day:
        start = datetime.strptime(dtstart[:8], "%Y%m%d").date()
        end   = datetime.strptime(dtend[:8],   "%Y%m%d").date() if dtend else start + timedelta(days=1)
        return {"summary": summary, "start": start.isoformat(),
                "end": end.isoformat(), "all_day": True,
                "location": location, "description": desc}

    try:
        fmt = "%Y%m%dT%H%M%SZ" if dtstart.endswith("Z") else "%Y%m%dT%H%M%S"
        dt  = datetime.strptime(dtstart[:15].rstrip("Z"), "%Y%m%dT%H%M%S")
        dte = datetime.strptime(dtend[:15].rstrip("Z"),   "%Y%m%dT%H%M%S") if dtend else dt + timedelta(hours=1)
    except ValueError:
        dt  = datetime.now().replace(minute=0, second=0, microsecond=0)
        dte = dt + timedelta(hours=1)

    return {"summary": summary, "start": dt.isoformat(),
            "end": dte.isoformat(), "all_day": False,
            "location": location, "description": desc}


def parse_with_claude(text):
    """Extrahiert Event-Details aus unstrukturiertem Text via Claude API."""
    today = date.today().isoformat()
    prompt = (
        f"Today is {today}. Extract the calendar event from this email. "
        "Return ONLY a JSON object with: "
        "summary (string), start (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS), "
        "end (same format), all_day (true/false), location (string or null), "
        "description (string or null). "
        'If no event is found return {"error":"no event"}.\n\n'
        f"{text[:3000]}"
    )

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 512,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )

    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            result = json.loads(resp.read())
        raw = result["content"][0]["text"]
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return json.loads(m.group()) if m else None
    except Exception as exc:
        print(f"  Claude API error: {exc}", file=sys.stderr)
        return None


def create_ha_event(ev):
    """Legt einen Termin in Home Assistant an."""
    start, end, all_day = ev["start"], ev["end"], ev.get("all_day", False)

    if all_day and "T" in start:
        start, end = start[:10], end[:10]

    payload = {"entity_id": HA_CALENDAR, "summary": ev["summary"]}
    if all_day:
        payload["start_date"] = start
        payload["end_date"]   = end
    else:
        payload["start_date_time"] = start
        payload["end_date_time"]   = end
    if ev.get("location"):
        payload["location"] = ev["location"]
    if ev.get("description"):
        payload["description"] = ev["description"]

    req = urllib.request.Request(
        f"{HA_URL}/api/services/calendar/create_event",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {HA_TOKEN}",
        },
    )

    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            ok = resp.status in (200, 201)
        if ok:
            print(f"  ✓ Event erstellt: {ev['summary']}")
        return ok
    except urllib.error.HTTPError as exc:
        print(f"  HA API error {exc.code}: {exc.read()}", file=sys.stderr)
        return False


def process_message(msg):
    """Verarbeitet eine einzelne Email und erstellt einen HA-Event."""
    subject  = decode_str(msg.get("Subject", "Termin"))
    ics_data = None
    body     = ""

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            fname = part.get_filename() or ""
            if ctype == "text/calendar" or fname.lower().endswith(".ics"):
                raw = part.get_payload(decode=True)
                if raw:
                    ics_data = raw.decode("utf-8", errors="replace")
            elif ctype == "text/plain" and not body:
                raw = part.get_payload(decode=True)
                if raw:
                    body = raw.decode("utf-8", errors="replace")
            elif ctype == "text/html" and not body:
                raw = part.get_payload(decode=True)
                if raw:
                    body = re.sub(r"<[^>]+>", " ", raw.decode("utf-8", errors="replace"))
    else:
        raw = msg.get_payload(decode=True)
        if raw:
            body = raw.decode("utf-8", errors="replace")

    # .ics Anhang hat Vorrang
    if ics_data:
        ev = parse_ics(ics_data)
        if ev:
            print(f"  → ICS: {ev['summary']}")
            return create_ha_event(ev)

    # Sonst Claude fragen
    full = f"Subject: {subject}\n\n{body}"
    ev = parse_with_claude(full)
    if ev and "error" not in ev:
        print(f"  → Claude: {ev['summary']}")
        return create_ha_event(ev)

    print(f"  → Übersprungen (kein Event): {subject}")
    return False


def main():
    print("Familienkalender Email-Poller — Start")

    ctx = ssl.create_default_context()
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx) as imap:
            imap.login(IMAP_USER, IMAP_PASS)
            imap.select("INBOX")

            _, data = imap.search(None, "UNSEEN")
            ids = data[0].split()

            if not ids:
                print("Keine neuen Emails.")
                return

            print(f"{len(ids)} neue Email(s).")
            for mid in ids:
                _, raw = imap.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(raw[0][1])
                subj = decode_str(msg.get("Subject", "(kein Betreff)"))
                print(f"Verarbeite: {subj}")
                ok = process_message(msg)
                if ok:
                    imap.store(mid, "+FLAGS", "\\Seen")

    except imaplib.IMAP4.error as exc:
        print(f"IMAP Fehler: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
