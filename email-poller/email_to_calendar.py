#!/usr/bin/env python3
"""
Familienkalender – Email-to-Calendar Poller
Läuft auf Home Assistant via shell_command alle 10 Minuten.
Pollt das in poller_config.json konfigurierte IMAP-Postfach, parst Emails
und legt Events in HA an.

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
import base64
from email.header import decode_header
from datetime import datetime, date, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    _LOCAL_TZ = ZoneInfo("Europe/Vienna")
except Exception:
    _LOCAL_TZ = None  # Fallback: OS-Zeitzone via astimezone()

# ── Konfiguration ────────────────────────────────────────────────────────────
# Zugangsdaten werden aus /config/scripts/poller_config.json gelesen, damit sie
# nach einem direkten wget/curl-Update dieses Skripts erhalten bleiben.
# Format: {"ha_url": "...", "ha_token": "...", "imap_user": "...",
#          "imap_pass": "...", "anthropic_api_key": "..."}
_CFG_FILE = "/config/scripts/poller_config.json"
try:
    with open(_CFG_FILE, encoding="utf-8") as _f:
        _cfg = json.load(_f)
except Exception:
    _cfg = {}

IMAP_HOST = _cfg.get("imap_host", "mail.infomaniak.com")
IMAP_PORT = _cfg.get("imap_port", 993)
IMAP_USER = _cfg.get("imap_user", "")
IMAP_PASS = _cfg.get("imap_pass", "")

HA_URL = _cfg.get("ha_url", "http://localhost:8123")
HA_TOKEN = _cfg.get("ha_token", "")
HA_CALENDAR = "calendar.bebos"  # Ziel-Kalender

ANTHROPIC_API_KEY = _cfg.get("anthropic_api_key", "")

if not IMAP_USER or not IMAP_PASS or not HA_TOKEN or not ANTHROPIC_API_KEY:
    print(
        "FEHLER: Zugangsdaten fehlen in /config/scripts/poller_config.json "
        "(benötigt: imap_user, imap_pass, ha_token, anthropic_api_key).",
        file=sys.stderr,
    )
    sys.exit(1)
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
    """Parst VCALENDAR/.ics direkt ohne externe Bibliothek.
    Gibt eine Liste aller VEVENTs zurück (z.B. Hin- und Rückflug)."""
    raw_events, current, in_ev = [], {}, False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == "BEGIN:VEVENT":
            in_ev, current = True, {}
        elif line == "END:VEVENT":
            if current:
                raw_events.append(current)
            in_ev = False
        elif in_ev and ":" in line:
            key, _, val = line.partition(":")
            current[key.split(";")[0]] = val

    if not raw_events:
        return []

    result = []
    for ev in raw_events:
        summary  = ev.get("SUMMARY", "Termin")
        dtstart  = ev.get("DTSTART", "")
        dtend    = ev.get("DTEND", "")
        location = ev.get("LOCATION", "")
        desc     = ev.get("DESCRIPTION", "").replace("\\n", "\n")

        if not dtstart:
            continue

        all_day = len(dtstart) == 8 or (len(dtstart) > 8 and "T" not in dtstart)

        if all_day:
            start = datetime.strptime(dtstart[:8], "%Y%m%d").date()
            end   = datetime.strptime(dtend[:8], "%Y%m%d").date() if dtend else start + timedelta(days=1)
            result.append({"summary": summary, "start": start.isoformat(),
                            "end": end.isoformat(), "all_day": True,
                            "location": location, "description": desc})
        else:
            try:
                dt  = datetime.strptime(dtstart[:15].rstrip("Z"), "%Y%m%dT%H%M%S")
                dte = datetime.strptime(dtend[:15].rstrip("Z"), "%Y%m%dT%H%M%S") if dtend else dt + timedelta(hours=1)
                # DTSTART/DTEND mit "Z" sind UTC — explizit markieren, sonst
                # würden sie später fälschlich als lokale Zeit behandelt.
                if dtstart.endswith("Z"):
                    dt = dt.replace(tzinfo=timezone.utc)
                if dtend.endswith("Z"):
                    dte = dte.replace(tzinfo=timezone.utc)
            except ValueError:
                dt  = datetime.now().replace(minute=0, second=0, microsecond=0)
                dte = dt + timedelta(hours=1)
            result.append({"summary": summary, "start": dt.isoformat(),
                            "end": dte.isoformat(), "all_day": False,
                            "location": location, "description": desc})

    return result


def parse_with_claude(text, pdf_bytes=None, image_parts=None):
    """Extrahiert alle Event-Details aus Text, PDF oder Bildern via Claude API.
    Gibt eine Liste von Events zurück (z.B. Hin- und Rückflug).
    image_parts: Liste von (media_type, bytes) Tupeln."""
    today = date.today().isoformat()
    instruction = (
        f"Today is {today}. Extract ALL calendar events from this content "
        "(e.g. outbound AND return flight, multiple appointments, etc.). "
        "Return ONLY a JSON array of objects, each with: "
        "summary (string), start (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS), "
        "end (same format), all_day (true/false), location (string or null), "
        "description (string or null). "
        'If no events are found return [{"error":"no event"}].'
    )

    if pdf_bytes:
        content = [
            {"type": "text", "text": instruction},
            {"type": "document", "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(pdf_bytes).decode(),
            }},
        ]
    elif image_parts:
        content = [{"type": "text", "text": instruction + (f"\n\nContext: {text[:2000]}" if text else "")}]
        for media_type, img_bytes in image_parts[:5]:
            content.append({"type": "image", "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.standard_b64encode(img_bytes).decode(),
            }})
    else:
        content = f"{instruction}\n\n{text[:8000]}"

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": content}],
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
        # Versuche zuerst ein Array zu parsen, dann ein einzelnes Objekt
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            parsed = json.loads(m.group())
            return parsed if isinstance(parsed, list) else [parsed]
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return [json.loads(m.group())]
        return None
    except Exception as exc:
        print(f"  Claude API error: {exc}", file=sys.stderr)
        return None


def _to_local_iso(s):
    """Zeitangabe ohne Zeitzone (von Claude/floating ICS) explizit auf die
    lokale HA-Zeitzone setzen. Sonst legt HA eine zeitzonenlose Angabe als UTC
    aus und der Termin landet um den Offset verschoben (z.B. 14:40 → 16:40).
    Bereits zeitzonenbehaftete Angaben (z.B. UTC aus ICS) bleiben unangetastet."""
    try:
        dt = datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return s
    if dt.tzinfo is None:
        # Naiv → als lokale Wanduhrzeit (Europe/Vienna) interpretieren und den
        # für dieses Datum korrekten Offset anhängen (DST-bewusst). Fällt auf die
        # OS-Zeitzone zurück, falls zoneinfo nicht verfügbar ist.
        dt = dt.replace(tzinfo=_LOCAL_TZ) if _LOCAL_TZ else dt.astimezone()
    return dt.isoformat()


def create_ha_event(ev):
    """Legt einen Termin in Home Assistant an."""
    start, end, all_day = ev["start"], ev["end"], ev.get("all_day", False)

    if all_day and "T" in start:
        start, end = start[:10], end[:10]

    payload = {"entity_id": HA_CALENDAR, "summary": ev["summary"]}
    if all_day:
        s = date.fromisoformat(start[:10])
        e = date.fromisoformat(end[:10]) if end else s + timedelta(days=1)
        if e <= s:
            e = s + timedelta(days=1)
        payload["start_date"] = s.isoformat()
        payload["end_date"]   = e.isoformat()
    else:
        start_iso = _to_local_iso(start)
        end_iso   = _to_local_iso(end)
        # Endzeit muss nach der Startzeit liegen — fehlt/deckt sie sich (Claude
        # liefert bei Terminen ohne Endzeit oft end == start), sonst lehnt HA ab.
        try:
            if datetime.fromisoformat(end_iso) <= datetime.fromisoformat(start_iso):
                end_iso = (datetime.fromisoformat(start_iso) + timedelta(hours=1)).isoformat()
        except (ValueError, TypeError):
            pass
        payload["start_date_time"] = start_iso
        payload["end_date_time"]   = end_iso
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
            # Roh-Zeit (wie geparst) → tatsächlich gesendete Zeit protokollieren,
            # damit Zeitzonen-Verschiebungen im HA-Log sofort sichtbar sind.
            when = payload.get("start_date_time") or payload.get("start_date")
            print(f"  ✓ Event erstellt: {ev['summary']} | roh={ev['start']} → gesendet={when}")
        return ok
    except urllib.error.HTTPError as exc:
        print(f"  HA API error {exc.code}: {exc.read()}", file=sys.stderr)
        return False


def process_message(msg):
    """Verarbeitet eine einzelne Email und erstellt einen HA-Event."""
    subject   = decode_str(msg.get("Subject", "Termin"))
    ics_parts = []   # alle ICS-Anhänge (z.B. Hin- UND Rückflug als separate Dateien)
    pdf_bytes = None
    image_parts = []  # (media_type, bytes) — Screenshots von Buchungen etc.
    body      = ""

    IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            fname = part.get_filename() or ""
            if ctype == "text/calendar" or fname.lower().endswith(".ics"):
                raw = part.get_payload(decode=True)
                if raw:
                    ics_parts.append(raw.decode("utf-8", errors="replace"))
            elif ctype == "application/pdf" or fname.lower().endswith(".pdf"):
                if not pdf_bytes:
                    pdf_bytes = part.get_payload(decode=True)
            elif ctype in IMAGE_TYPES:
                raw = part.get_payload(decode=True)
                # Claude API Limit: max. 5 MB pro Bild
                if raw and len(raw) <= 4_500_000:
                    image_parts.append((ctype, raw))
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

    created = 0
    seen = set()        # (summary_lower, YYYY-MM-DD) — exact dedup
    seen_times = set()  # YYYY-MM-DDTHH:MM — time-based dedup for PDF/Claude

    def key_of(ev):
        return (ev["summary"].strip().lower(), ev.get("start", "")[:10])

    def start_minute(ev):
        s = ev.get("start", "")
        return s[:16] if "T" in s else None  # None for all-day events

    # .ics zuerst (strukturiert, höchste Priorität)
    # Alle ICS-Anhänge verarbeiten — manche Buchungen haben je einen Anhang pro Segment.
    for ics_data in ics_parts:
        for ev in parse_ics(ics_data):
            k = key_of(ev)
            if k in seen:
                continue
            seen.add(k)
            t = start_minute(ev)
            if t:
                seen_times.add(t)
            print(f"  → ICS: {ev['summary']}")
            if create_ha_event(ev):
                created += 1

    # PDF IMMER parsen wenn vorhanden — Buchungs-PDFs enthalten oft Hin- UND
    # Rückflug, während die beigelegte .ics manchmal nur den Hinflug hat.
    # Doppelte werden per (summary+date) UND per exakter Startzeit gefiltert,
    # damit z.B. "Flight (Outbound)" bei 14:05 nicht zusätzlich zu
    # "Flight (Ryanair FR4167)" bei 14:05 aus dem ICS angelegt wird.
    if pdf_bytes:
        events = parse_with_claude("", pdf_bytes=pdf_bytes) or []
        for ev in events:
            if "error" in ev:
                continue
            k = key_of(ev)
            t = start_minute(ev)
            if k in seen or (t and t in seen_times):
                continue
            seen.add(k)
            if t:
                seen_times.add(t)
            print(f"  → PDF: {ev['summary']}")
            if create_ha_event(ev):
                created += 1

    # Bilder (Screenshots von Buchungsbestätigungen etc.), wenn ICS/PDF nichts lieferten
    if not created and image_parts:
        events = parse_with_claude(f"Subject: {subject}\n\n{body}", image_parts=image_parts) or []
        for ev in events:
            if "error" in ev:
                continue
            k = key_of(ev)
            t = start_minute(ev)
            if k in seen or (t and t in seen_times):
                continue
            seen.add(k)
            if t:
                seen_times.add(t)
            print(f"  → Bild: {ev['summary']}")
            if create_ha_event(ev):
                created += 1

    # Email-Text nur als Fallback, wenn weder ICS noch PDF noch Bilder Events lieferten
    if not created:
        full = f"Subject: {subject}\n\n{body}"
        events = parse_with_claude(full) or []
        for ev in events:
            if "error" in ev:
                continue
            k = key_of(ev)
            t = start_minute(ev)
            if k in seen or (t and t in seen_times):
                continue
            seen.add(k)
            if t:
                seen_times.add(t)
            print(f"  → Claude: {ev['summary']}")
            if create_ha_event(ev):
                created += 1

    if not created:
        print(f"  → Übersprungen (kein Event): {subject}")
    return created > 0


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
                _, raw = imap.fetch(mid, "(BODY.PEEK[])")
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
