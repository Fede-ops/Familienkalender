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

# ── Konfiguration ────────────────────────────────────────────────────────────
# Token und URL werden aus /config/scripts/poller_config.json gelesen,
# damit sie nach einem curl-Update des Skripts nicht neu eingetragen werden müssen.
# Format: {"ha_url": "http://homeassistant:8123", "ha_token": "eyJ..."}
_CFG_FILE = "/config/scripts/poller_config.json"
try:
    with open(_CFG_FILE, encoding="utf-8") as _f:
        _cfg = json.load(_f)
    HA_URL   = _cfg.get("ha_url",   "http://homeassistant:8123")
    HA_TOKEN = _cfg.get("ha_token", "")
except Exception:
    # Fallback: direkt im Skript eintragen (nur wenn poller_config.json fehlt)
    HA_URL   = "http://homeassistant:8123"
    HA_TOKEN = "DEIN_HA_LONG_LIVED_TOKEN"

if not HA_TOKEN or HA_TOKEN == "DEIN_HA_LONG_LIVED_TOKEN":
    print("FEHLER: Kein HA-Token konfiguriert. Bitte /config/scripts/poller_config.json anlegen.", file=sys.stderr)
    sys.exit(1)

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

SENT_FILE         = "/config/scripts/reminder_sent.json"
NOTIF_CACHE       = "/config/scripts/notif_config_cache.json"
BIRTHDAY_DATA_FILE = "/config/scripts/birthday_data.json"
TODO_DATA_FILE     = "/config/scripts/todo_data.json"
SHOPPING_DATA_FILE = "/config/scripts/shopping_data.json"
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


def extract_birth_year(description, occ_month, occ_day):
    """Liest das echte Geburtsjahr aus dem DESCRIPTION-Feld.

    Birthday-Apps (z.B. BirthdaysPro) kodieren das volle Geburtsdatum im
    Notizen-/Beschreibungsfeld, z.B.:
        tech=oad1432|20250923104456+0200|19910601|birthday|1|Ferdi|Solar
    Der Token 19910601 = YYYYMMDD ist das Geburtsdatum. DTSTART enthält nur
    das nächste Vorkommen (aktuelles/nächstes Jahr), nicht das Geburtsjahr.
    """
    if not description:
        return None
    desc = description.replace("\\n", "\n").replace("\\,", ",").replace("\\\\", "\\")
    cur_year = datetime.now().year
    tokens = re.split(r"[|;,\s]+", desc)
    # Bevorzugt: reiner 8-stelliger YYYYMMDD-Token, dessen Monat/Tag exakt zum
    # Vorkommen passt — so treffen wir das Geburtsdatum, nicht einen Zeitstempel.
    for token in tokens:
        m = re.match(r"^(\d{4})(\d{2})(\d{2})$", token)
        if not m:
            continue
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1900 <= y <= cur_year and mo - 1 == occ_month and d == occ_day:
            return y
    # Fallback: erster plausible YYYYMMDD-Token mit Jahr < aktuelles Jahr.
    for token in tokens:
        m = re.match(r"^(\d{4})(\d{2})(\d{2})$", token)
        if not m:
            continue
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1900 <= y < cur_year and 1 <= mo <= 12 and 1 <= d <= 31:
            return y
    return None


def parse_birthday_ics(raw_bytes):
    """Parst iCloud-Geburtstags-ICS; gibt Liste von {name, month, day, year?} zurück."""
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Gefaltete Fortsetzungszeilen (Zeile beginnt mit Space/Tab) zusammenführen.
    text = re.sub(r"\n[ \t]", "", text)

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
            m = re.match(r"(\d{4})(\d{2})(\d{2})$", dtstart)
            if not m:
                continue
            ics_year, month, day = int(m.group(1)), int(m.group(2)) - 1, int(m.group(3))
            name = props["SUMMARY"].replace("\\n", "\n").replace("\\,", ",").replace("\\\\", "\\")
            name = re.sub(r"\s*\([^)]*\)", "", name)
            name = re.sub(r"\s*[-–]\s*(Geburtstag|Birthday|Cumpleaños|Anniversaire).*", "", name, flags=re.IGNORECASE).strip()
            key = f"{name}|{month}|{day}"
            if key not in seen:
                seen.add(key)
                entry: dict = {"name": name, "month": month, "day": day}
                # Geburtsjahr: 1. aus DESCRIPTION (volles Geburtsdatum), 2. aus
                # DTSTART falls historisch plausibel (manche Feeds nutzen das).
                cur_year = datetime.now().year
                year = extract_birth_year(props.get("DESCRIPTION", ""), month, day)
                if year is None and 1900 <= ics_year < cur_year:
                    year = ics_year
                if year is not None:
                    entry["year"] = year
                results.append(entry)
        elif in_event:
            ci = line.find(":")
            if ci == -1:
                continue
            name_params, value = line[:ci], line[ci + 1:]
            si = name_params.find(";")
            base = (name_params[:si] if si != -1 else name_params).upper()
            props[base] = value
    return results


def _write_birthdays(birthdays):
    """Schreibt Geburtstage in HA-Sensor UND als persistente Datei auf Disk."""
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
                print(f"  Geburtstage: {len(birthdays)} Einträge im Sensor gespeichert.")
    except Exception as exc:
        print(f"  Geburtstage: Sensor-Update fehlgeschlagen: {exc}", file=sys.stderr)
    # Persistent backup — survives HA restarts.
    try:
        with open(BIRTHDAY_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(birthdays, f)
    except Exception as exc:
        print(f"  Geburtstage: Datei-Backup fehlgeschlagen: {exc}", file=sys.stderr)


def sync_birthday_persistence():
    """Sichert Geburtstage auf Disk; stellt sie nach HA-Neustart wieder her.

    Läuft jede Minute:
    - Sensor hat das birthdays-Attribut (auch leere Liste)  → auf Disk sichern.
    - Sensor-Attribut fehlt ganz (nach HA-Neustart verschwindet der per
      /api/states erzeugte Sensor)  → aus Disk-Datei wiederherstellen.

    WICHTIG: Eine leere Liste [] ist ein GÜLTIGER Zustand (User hat alle
    Geburtstage gelöscht) und darf NICHT als "muss wiederhergestellt werden"
    interpretiert werden — sonst macht der Poller jede Löschung jede Minute
    wieder rückgängig. Wir unterscheiden daher zwischen "Attribut vorhanden,
    aber leer" (= behalten) und "Attribut fehlt komplett" (= Restore).
    """
    st = ha_state("sensor.familienkalender_birthdays")
    current = (st.get("attributes") or {}).get("birthdays") if st else None

    if isinstance(current, list):
        # Sensor ist maßgeblich (auch wenn leer) → Backup auf Disk aktualisieren.
        try:
            with open(BIRTHDAY_DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(current, f)
        except Exception:
            pass
        return

    # Sensor-Attribut fehlt komplett (z.B. nach HA-Neustart) → aus Datei
    # wiederherstellen. Eine leere Disk-Sicherung bedeutet "keine Geburtstage"
    # und löst keinen Restore aus.
    try:
        with open(BIRTHDAY_DATA_FILE, encoding="utf-8") as f:
            saved = json.load(f)
    except Exception:
        return
    if not isinstance(saved, list) or not saved:
        return

    payload = json.dumps({
        "state": str(len(saved)),
        "attributes": {"birthdays": saved, "ts": datetime.now().isoformat()},
    }).encode()
    req = urllib.request.Request(
        f"{HA_URL}/api/states/sensor.familienkalender_birthdays",
        data=payload,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201):
                print(f"  Geburtstage: {len(saved)} Einträge nach HA-Neustart wiederhergestellt.")
    except Exception as exc:
        print(f"  Geburtstage: Wiederherstellung fehlgeschlagen: {exc}", file=sys.stderr)


def sync_list_persistence(label, entity, data_file):
    """Sichert Todo-/Einkaufs-Listen auf Disk; stellt sie nach HA-Neustart wieder her.

    Diese Listen liegen sonst nur im HA-Sensor und gehen bei jedem HA-Neustart
    verloren. Läuft jede Minute:
    - Sensor hat Daten  → auf Disk sichern (Backup, Teil des HA-Backups).
    - Sensor leer       → aus Disk-Datei in Sensor laden (Restore nach Neustart).
    """
    st = ha_state(entity)
    attrs = (st.get("attributes") or {}) if st else {}
    current = attrs.get("items")
    ts = attrs.get("ts")

    if isinstance(current, list) and current:
        # Sensor OK → Backup auf Disk aktualisieren (inkl. Zeitstempel).
        try:
            with open(data_file, "w", encoding="utf-8") as f:
                json.dump({"items": current, "ts": ts}, f)
        except Exception:
            pass
        return

    # Sensor leer (z.B. nach HA-Neustart) → aus Datei wiederherstellen.
    try:
        with open(data_file, encoding="utf-8") as f:
            saved = json.load(f)
    except Exception:
        return
    items = saved.get("items") if isinstance(saved, dict) else saved
    if not isinstance(items, list) or not items:
        return
    saved_ts = saved.get("ts") if isinstance(saved, dict) else None

    payload = json.dumps({
        "state": str(saved_ts or datetime.now().isoformat()),
        "attributes": {"items": items, "ts": saved_ts or int(datetime.now().timestamp() * 1000)},
    }).encode()
    req = urllib.request.Request(
        f"{HA_URL}/api/states/{entity}",
        data=payload,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201):
                print(f"  {label}: {len(items)} Einträge nach HA-Neustart wiederhergestellt.")
    except Exception as exc:
        print(f"  {label}: Wiederherstellung fehlgeschlagen: {exc}", file=sys.stderr)


def sync_birthdays():
    """Importiert Geburtstage von ICS-URL — nur wenn die App einen neuen Import ausgelöst hat.

    Der Sensor sensor.familienkalender_birthday_ics_url wird von der App auf die
    URL gesetzt, wenn der User "Aktualisieren via iCloud" drückt. Nach erfolgreichem
    Import setzt der Poller den Sensor auf "imported", damit er nicht jede Minute
    erneut die gesamte URL lädt und manuelle Bereinigungen überschreibt.
    """
    st = ha_state("sensor.familienkalender_birthday_ics_url")
    if not st:
        return
    url = st.get("state", "")
    # "imported" = bereits verarbeitet; leer/unbekannt = nie konfiguriert.
    if not url or url in ("unknown", "unavailable", "", "imported"):
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

    _write_birthdays(birthdays)

    # URL-Sensor auf "imported" setzen → kein erneuter Import beim nächsten Minuten-Lauf.
    # Die Original-URL liegt im localStorage der App und bleibt für künftige
    # manuelle Re-Importe ("Aktualisieren via iCloud") erhalten.
    done = json.dumps({"state": "imported"}).encode()
    done_req = urllib.request.Request(
        f"{HA_URL}/api/states/sensor.familienkalender_birthday_ics_url",
        data=done,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(done_req, timeout=10)
    except Exception:
        pass


def check_birthday_reminders(now, member_services, sent):
    """Prüft ob heute jemand Geburtstag hat und schickt um 12:00 eine Push-Benachrichtigung."""
    if now.hour < 12:
        return 0

    birthdays = None
    st = ha_state("sensor.familienkalender_birthdays")
    if st:
        birthdays = (st.get("attributes") or {}).get("birthdays")
    if not isinstance(birthdays, list) or not birthdays:
        try:
            with open(BIRTHDAY_DATA_FILE, encoding="utf-8") as f:
                birthdays = json.load(f)
        except Exception:
            return 0
    if not birthdays:
        return 0

    all_services = set()
    for svcs in member_services.values():
        all_services.update(svcs)
    if not all_services:
        return 0

    today_month = now.month - 1  # birthday data uses 0-indexed months
    today_day = now.day
    today_str = now.strftime("%Y-%m-%d")
    fired = 0

    for bd in birthdays:
        if bd.get("month") != today_month or bd.get("day") != today_day:
            continue

        name = bd.get("name", "?")
        key = f"birthday-{name}-{today_str}"
        if key in sent:
            continue

        year = bd.get("year")
        if year:
            age = now.year - year
            title = f"🎂 {name} wird heute {age}!"
        else:
            title = f"🎂 {name} hat heute Geburtstag!"
        message = "Alles Gute zum Geburtstag!"

        ok_any = False
        for svc in all_services:
            if notify(svc, title, message):
                ok_any = True
        if ok_any:
            sent[key] = now.isoformat()
            fired += 1
            print(f"  → Geburtstag: {name}")

    return fired


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

    # Geburtstags-Benachrichtigungen (täglich um 12:00).
    fired += check_birthday_reminders(now, member_services, sent)

    # Alte Einträge (> 2 Tage) aufräumen.
    cutoff = now - timedelta(days=2)
    sent = {
        k: v for k, v in sent.items()
        if (parse_dt(v) or now) > cutoff
    }
    save_sent(sent)

    if fired:
        print(f"Familienkalender Reminder: {fired} Benachrichtigung(en) gesendet.")

    # Geburtstage: zuerst Persistenz sichern/wiederherstellen, dann ggf. neu von ICS laden.
    sync_birthday_persistence()
    sync_birthdays()

    # Todos + Einkaufsliste: Disk-Backup, überlebt HA-Neustarts (Teil des HA-Backups).
    sync_list_persistence("Todos", "sensor.familienkalender_todos", TODO_DATA_FILE)
    sync_list_persistence("Einkauf", "sensor.familienkalender_shopping", SHOPPING_DATA_FILE)


if __name__ == "__main__":
    main()
