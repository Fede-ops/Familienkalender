#!/usr/bin/env python3
"""
Familienkalender – Duplikat-/Lösch-Diagnose
Zeigt den TATSÄCHLICHEN Zustand, damit wir nicht raten müssen, warum ein in
der App gelöschter/verschobener Termin im HA-Kalender bleibt.

Ausgabe:
  1. sensor.familienkalender_hidden_uids  (uids/restored/fps) — was die App zum
     Löschen vorgemerkt hat.
  2. sensor.familienkalender_calendar_ops (ausstehende Updates).
  3. Für jeden Kalender: alle Termine der nächsten ~60 Tage mit UID/Start/Titel.
  4. Abgleich: welche vorgemerkten UIDs im Kalender GEFUNDEN werden (= Poller
     kann sie löschen) und welche NICHT (= UID-Mismatch, echte Ursache).

Einmalig ausführen:
    python3 /config/scripts/diag.py
"""

import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta

_CFG_FILE = "/config/scripts/poller_config.json"
try:
    with open(_CFG_FILE, encoding="utf-8") as _f:
        _cfg = json.load(_f)
    HA_URL = _cfg.get("ha_url", "http://homeassistant:8123")
    HA_TOKEN = _cfg.get("ha_token", "")
except Exception as exc:
    print(f"FEHLER: poller_config.json nicht lesbar: {exc}", file=sys.stderr)
    sys.exit(1)

if not HA_TOKEN:
    print("FEHLER: ha_token fehlt in poller_config.json", file=sys.stderr)
    sys.exit(1)

_ctx = ssl.create_default_context()


def ha_get(path):
    req = urllib.request.Request(f"{HA_URL}{path}",
                                 headers={"Authorization": f"Bearer {HA_TOKEN}"})
    with urllib.request.urlopen(req, timeout=20, context=_ctx) as resp:
        return json.loads(resp.read())


def ha_state(entity_id):
    try:
        return ha_get(f"/api/states/{entity_id}")
    except Exception:
        return None


def main():
    print("=" * 70)
    print("FAMILIENKALENDER DIAGNOSE")
    print("=" * 70)

    # 1. hidden_uids
    hu = ha_state("sensor.familienkalender_hidden_uids")
    attrs = (hu.get("attributes") if hu else {}) or {}
    hidden = attrs.get("uids") or []
    restored = attrs.get("restored") or []
    fps = attrs.get("fps") or []
    print(f"\n[1] hidden_uids: {len(hidden)} vorgemerkt, {len(restored)} restored, {len(fps)} fps")
    for u in hidden[-20:]:
        print(f"      LÖSCHEN: {u}")
    if restored:
        for u in restored[-10:]:
            print(f"      RESTORED (nicht löschen): {u}")

    # 2. calendar_ops
    co = ha_state("sensor.familienkalender_calendar_ops")
    ops = ((co.get("attributes") if co else {}) or {}).get("ops") or []
    print(f"\n[2] calendar_ops: {len(ops)} ausstehende Update(s)")
    for o in ops[-10:]:
        ev = o.get("event") or {}
        print(f"      UPDATE {o.get('entity_id')} uid={o.get('uid')} → "
              f"{ev.get('summary')} @ {ev.get('dtstart')}")

    # 3. Kalender + Termine
    ent = ha_state("sensor.familienkalender_entities")
    cals = ((ent.get("attributes") if ent else {}) or {}).get("entities") or []
    if not cals:
        print("\n[3] WARNUNG: sensor.familienkalender_entities leer — nutze /api/calendars")
        try:
            cals = [c["entity_id"] for c in ha_get("/api/calendars")]
        except Exception as exc:
            print(f"      Konnte Kalenderliste nicht laden: {exc}")
            cals = []
    print(f"\n[3] Kalender ({len(cals)}): {', '.join(cals)}")

    now = datetime.now()
    start = (now - timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%S")
    end = (now + timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%S")

    hidden_set = set(hidden)
    found_hidden = {}
    all_by_uid = {}
    for cal in cals:
        try:
            evs = ha_get(f"/api/calendars/{cal}?start={start}&end={end}")
        except Exception as exc:
            print(f"\n    {cal}: FEHLER beim Abruf: {exc}")
            continue
        print(f"\n    {cal}: {len(evs)} Termin(e)")
        for ev in evs:
            uid = ev.get("uid", "?")
            s = (ev.get("start") or {})
            when = s.get("dateTime") or s.get("date") or "?"
            summ = ev.get("summary", "?")
            mark = "  ← VORGEMERKT ZUM LÖSCHEN" if uid in hidden_set else ""
            print(f"        {when}  {summ}  [uid={uid}]{mark}")
            all_by_uid[uid] = cal
            if uid in hidden_set:
                found_hidden.setdefault(uid, cal)

    # 4. Abgleich
    print("\n" + "=" * 70)
    print("[4] ERGEBNIS")
    not_found = hidden_set - set(found_hidden.keys())
    if hidden_set and found_hidden:
        print(f"    {len(found_hidden)} vorgemerkte UID(s) im Kalender GEFUNDEN "
              f"→ der Poller KANN sie löschen:")
        for u, c in found_hidden.items():
            print(f"        {c}: {u}")
    if not_found:
        print(f"    {len(not_found)} vorgemerkte UID(s) im Kalender NICHT gefunden "
              f"(bereits gelöscht ODER UID-Mismatch):")
        for u in list(not_found)[-20:]:
            print(f"        {u}")
    if not hidden_set:
        print("    Es sind AKTUELL keine UIDs zum Löschen vorgemerkt.")
        print("    → D.h. die App hat den alten Termin NICHT zum Löschen gemeldet")
        print("      (PWA evtl. nicht auf neuester Version, oder Member-Wechsel")
        print("       lief nicht über den Lösch-Pfad).")
    print("=" * 70)

    birthday_diag()


def birthday_diag():
    """Zeigt, warum (keine) Geburtstags-Erinnerungen kommen."""
    from datetime import datetime
    print("\n" + "=" * 70)
    print("[5] GEBURTSTAGE")
    now = datetime.now()
    print(f"    Jetzt: {now.isoformat(timespec='minutes')}  "
          f"(Erinnerungen feuern erst ab 12:00 — aktuelle Stunde: {now.hour})")

    # 5a. member_services — leer ⇒ main() bricht GANZ AM ANFANG ab (keine
    # Erinnerungen jeglicher Art).
    nc = ha_state("sensor.familienkalender_notif_config")
    ms = ((nc.get("attributes") if nc else {}) or {}).get("memberServices")
    if isinstance(ms, dict) and ms:
        svcs = sorted({s for v in ms.values() if isinstance(v, list) for s in v})
        print(f"    memberServices: {len(ms)} Zuordnung(en), Dienste: {', '.join(svcs) or '—'}")
        if not svcs:
            print("      ⚠️  KEINE notify-Dienste hinterlegt → es kann niemand benachrichtigt werden!")
    else:
        print("    ⚠️  memberServices LEER/fehlt → main() bricht sofort ab, es kommen")
        print("        GAR KEINE Erinnerungen (Geburtstag, To-Do, Termin).")
        print("        Ursache meist: HA-Neustart, notif_config-Sensor weg, App hat")
        print("        die Konfiguration noch nicht neu gepusht. Fix: App öffnen (pusht")
        print("        die Zuordnung neu) ODER Cache /config/scripts/notif_config_cache.json.")

    # 5b. Geburtstagsdaten
    bd_st = ha_state("sensor.familienkalender_birthdays")
    birthdays = ((bd_st.get("attributes") if bd_st else {}) or {}).get("birthdays")
    src = "Sensor"
    if not isinstance(birthdays, list) or not birthdays:
        try:
            with open("/config/scripts/birthday_data.json", encoding="utf-8") as f:
                birthdays = json.load(f)
            src = "Disk-Backup"
        except Exception:
            birthdays = []
    print(f"    Geburtstage geladen: {len(birthdays)} (Quelle: {src})")

    # 5c. Blockliste
    del_st = ha_state("sensor.familienkalender_deleted_birthdays")
    blocked = ((del_st.get("attributes") if del_st else {}) or {}).get("keys") or []
    blocked_set = set(blocked)
    print(f"    Blockliste (gelöschte Geburtstage): {len(blocked_set)}")

    # 5d. Heutige Geburtstage (Monat 0-indexiert!)
    tm, td = now.month - 1, now.day
    todays = [b for b in birthdays if isinstance(b, dict)
              and b.get("month") == tm and b.get("day") == td]
    print(f"    Heute ({now.strftime('%d.%m.')}): {len(todays)} Geburtstag(e)")
    for b in todays:
        key = f"{b.get('name')}|{b.get('month')}|{b.get('day')}"
        state = "BLOCKIERT (gelöscht)" if key in blocked_set else "würde feuern"
        print(f"        {b.get('name')}  → {state}")

    # 5e. Nächste 14 Tage (zur Kontrolle, dass überhaupt welche kommen)
    from datetime import timedelta
    upcoming = []
    for i in range(1, 15):
        d = now + timedelta(days=i)
        for b in birthdays:
            if isinstance(b, dict) and b.get("month") == d.month - 1 and b.get("day") == d.day:
                key = f"{b.get('name')}|{b.get('month')}|{b.get('day')}"
                if key not in blocked_set:
                    upcoming.append(f"{d.strftime('%d.%m.')} {b.get('name')}")
    print(f"    Nächste 14 Tage: {', '.join(upcoming) if upcoming else 'keine'}")

    # 5f. Bereits gesendete Geburtstags-Keys (zeigt, ob schon mal gefeuert wurde)
    try:
        with open("/config/scripts/reminder_sent.json", encoding="utf-8") as f:
            sent = json.load(f)
        bkeys = [k for k in sent if k.startswith("birthday-")]
        print(f"    Bereits gesendet (reminder_sent.json): {len(bkeys)} Geburtstags-Key(s)")
        for k in bkeys[-6:]:
            print(f"        {k}")
    except Exception:
        print("    reminder_sent.json nicht lesbar (Poller lief evtl. noch nie durch).")
    print("=" * 70)


if __name__ == "__main__":
    main()
