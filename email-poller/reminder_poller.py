#!/usr/bin/env python3
"""
Familienkalender – Reminder Poller
Läuft auf Home Assistant via shell_command jede Minute.
Liest alle Kalender-Events, findet [remind:X]-Tags in der Beschreibung
und schickt X Minuten vor Beginn eine Push-Benachrichtigung über die
notify.mobile_app_* Dienste der zugeordneten Person.

Die Zuordnung Person → Gerät kommt aus dem Sensor
`sensor.familienkalender_notif_config`, den die PWA befüllt.

Setup: siehe ha_setup.yaml im selben Ordner.
"""

import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta

# ── Konfiguration — vom Benutzer ausfüllen ────────────────────────────────────
HA_URL   = "http://homeassistant:8123"
HA_TOKEN = "DEIN_HA_LONG_LIVED_TOKEN"

# Fallback-Kalenderliste, falls sensor.familienkalender_entities fehlt.
DEFAULT_CALENDARS = [
    "calendar.fede",
    "calendar.pita",
    "calendar.bebos",
    "calendar.santi",
    "calendar.fede_trabajo",
    "calendar.pita_trabajo",
]
# ─────────────────────────────────────────────────────────────────────────────

SENT_FILE   = "/config/scripts/reminder_sent.json"
NOTIF_CACHE = "/config/scripts/notif_config_cache.json"
ctx = ssl.create_default_context()

REMIND_RE = re.compile(r"\[remind:(\d+)\]")


def ha_get(path):
    req = urllib.request.Request(
        f"{HA_URL}{path}",
        headers={"Authorization": f"Bearer {HA_TOKEN}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def ha_state(entity_id):
    """Holt einen einzelnen State; gibt None zurück wenn nicht vorhanden."""
    try:
        return ha_get(f"/api/states/{entity_id}")
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def notify(service, title, message):
    payload = json.dumps({"title": title, "message": message}).encode()
    req = urllib.request.Request(
        f"{HA_URL}/api/services/notify/{service}",
        data=payload,
        headers={
            "Authorization": f"Bearer {HA_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as exc:
        print(f"  notify.{service} Fehler: {exc}", file=sys.stderr)
        return False


def load_sent():
    try:
        with open(SENT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_sent(sent):
    try:
        with open(SENT_FILE, "w", encoding="utf-8") as f:
            json.dump(sent, f)
    except Exception as exc:
        print(f"  Konnte {SENT_FILE} nicht schreiben: {exc}", file=sys.stderr)


def parse_dt(value):
    """Parst HA-Datumsformate (dateTime ISO oder date) zu naivem datetime."""
    if not value:
        return None
    # Ganztägig: nur Datum → Mitternacht
    if len(value) == 10:
        return datetime.strptime(value, "%Y-%m-%d")
    # dateTime mit evtl. Zeitzone — Zeitzonenoffset abschneiden, lokal annehmen.
    v = value.replace("Z", "")
    v = re.sub(r"[+-]\d{2}:\d{2}$", "", v)
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(v[:19], fmt)
        except ValueError:
            continue
    return None


def get_calendars():
    st = ha_state("sensor.familienkalender_entities")
    if st:
        ents = (st.get("attributes") or {}).get("entities")
        if isinstance(ents, list) and ents:
            return ents
    return DEFAULT_CALENDARS


def get_member_services():
    st = ha_state("sensor.familienkalender_notif_config")
    if st:
        ms = (st.get("attributes") or {}).get("memberServices")
        if isinstance(ms, dict) and ms:
            # Persist to local cache so it survives HA restarts.
            try:
                with open(NOTIF_CACHE, "w", encoding="utf-8") as f:
                    json.dump(ms, f)
            except Exception:
                pass
            return ms
    # Sensor missing (e.g. after HA restart) — fall back to local cache.
    try:
        with open(NOTIF_CACHE, encoding="utf-8") as f:
            ms = json.load(f)
        if isinstance(ms, dict) and ms:
            print("  Hinweis: Sensor nicht erreichbar, nutze lokalen Cache.", file=sys.stderr)
            return ms
    except Exception:
        pass
    return {}


def get_hidden_uids():
    st = ha_state("sensor.familienkalender_hidden_uids")
    if not st:
        return set()
    uids = (st.get("attributes") or {}).get("uids")
    return set(uids) if isinstance(uids, list) else set()


def parse_birthday_ics(raw_bytes):
    """Parst iCloud-Geburtstags-ICS; gibt Liste von {name, month, day} zurück."""
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")
    text = re.sub(r"\r\n[ \t]", "", text).replace("\r\n", "\n").replace("\r", "\n")

    results, seen, in_event, props = [], set(), False, {}
    for line in text.split("\n"):
        line = line.rstrip()
        if line == "BEGIN:VEVENT":
            in_event, props = True, {}
        elif line == "END:VEVENT":
            in_event = False
            if "SUMMARY" not in props or "DTSTART" not in props:
                continue
            # Accept events with RRULE:FREQ=YEARLY OR plain all-day events (8-digit date)
            dtstart = props["DTSTART"].strip()
            m = re.match(r"\d{4}(\d{2})(\d{2})$", dtstart)
            if not m:
                continue
            month, day = int(m.group(1)) - 1, int(m.group(2))
            name = props["SUMMARY"].replace("\\n", "\n").replace("\\,", ",").replace("\\\\", "\\")
            key = f"{name}|{month}|{day}"
            if key not in seen:
                seen.add(key)
                results.append({"name": name, "month": month, "day": day})
        elif in_event:
            ci = line.find(":")
            if ci == -1:
                continue
            name_params, value = line[:ci], line[ci + 1:]
            si = name_params.find(";")
            base = (name_params[:si] if si != -1 else name_params).upper()
            props[base] = value
    return results


def sync_birthdays():
    """Liest webcal-URL aus HA-Sensor, fetcht ICS und speichert Geburtstage."""
    st = ha_state("sensor.familienkalender_birthday_ics_url")
    if not st:
        return
    url = st.get("state", "")
    if not url or url in ("unknown", "unavailable", ""):
        return
    url = re.sub(r"^webcal://", "https://", url, flags=re.IGNORECASE)

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Familienkalender/1.0"})
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            raw = resp.read()
    except Exception as exc:
        print(f"  Geburtstage-ICS Abruf fehlgeschlagen: {exc}", file=sys.stderr)
        return

    birthdays = parse_birthday_ics(raw)
    if not birthdays:
        print("  Geburtstage: keine Einträge gefunden.", file=sys.stderr)
        return

    payload = json.dumps({
        "state": str(len(birthdays)),
        "attributes": {"birthdays": birthdays, "ts": datetime.now().isoformat()},
    }).encode()
    req = urllib.request.Request(
        f"{HA_URL}/api/states/sensor.familienkalender_birthdays",
        data=payload,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201):
                print(f"  Geburtstage: {len(birthdays)} Einträge aktualisiert.")
    except Exception as exc:
        print(f"  Geburtstage: Sensor-Update fehlgeschlagen: {exc}", file=sys.stderr)


def main():
    now = datetime.now()
    member_services = get_member_services()
    if not member_services:
        # Ohne Zuordnung können wir niemanden benachrichtigen.
        return

    calendars = get_calendars()
    hidden = get_hidden_uids()
    sent = load_sent()

    # Events der nächsten 24 h abfragen (Reminder bis 2 h vorher gedeckt).
    start_iso = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
    end_iso   = (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")

    fired = 0

    for cal in calendars:
        services = member_services.get(cal, [])
        if not services:
            continue
        try:
            events = ha_get(f"/api/calendars/{cal}?start={start_iso}&end={end_iso}")
        except Exception as exc:
            print(f"  {cal}: Abruf fehlgeschlagen: {exc}", file=sys.stderr)
            continue

        for ev in events:
            desc = ev.get("description") or ""
            m = REMIND_RE.search(desc)
            if not m:
                continue
            minutes = int(m.group(1))
            if minutes <= 0:
                continue

            uid = ev.get("uid", "")
            if uid in hidden:
                continue

            start = (ev.get("start") or {})
            start_val = start.get("dateTime") or start.get("date")
            start_dt = parse_dt(start_val)
            if not start_dt:
                continue

            fire_at = start_dt - timedelta(minutes=minutes)
            # Reminder-Zeit erreicht, Event aber noch nicht begonnen?
            if not (fire_at <= now < start_dt):
                continue

            key = f"{uid}-{minutes}-{start_dt.isoformat()}"
            if key in sent:
                continue

            summary = ev.get("summary", "Termin")
            remaining = max(1, round((start_dt - now).total_seconds() / 60))
            is_all_day = bool(start.get("date") and not start.get("dateTime"))
            when = "" if is_all_day else f" · {start_dt.strftime('%H:%M')} Uhr"
            message = f"In {remaining} Min.{when}"

            ok_any = False
            for svc in services:
                if notify(svc, summary, message):
                    ok_any = True
            if ok_any:
                sent[key] = now.isoformat()
                fired += 1
                print(f"  → Erinnerung: {summary} ({cal}, {remaining} Min.)")

    # Alte Einträge (> 2 Tage) aufräumen.
    cutoff = now - timedelta(days=2)
    sent = {
        k: v for k, v in sent.items()
        if (parse_dt(v) or now) > cutoff
    }
    save_sent(sent)

    if fired:
        print(f"Familienkalender Reminder: {fired} Benachrichtigung(en) gesendet.")

    sync_birthdays()


if __name__ == "__main__":
    main()
