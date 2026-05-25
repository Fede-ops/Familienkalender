#!/usr/bin/env python3
"""
Familienkalender – Cleanup Test Events
Löscht Test-Serien-Events aus HA-Kalendern.
Läuft direkt auf dem HA-Server (localhost) um Proxy-Probleme zu umgehen.

Ausführen:
    python3 cleanup_test_events.py             # Dry-Run (nur anzeigen)
    python3 cleanup_test_events.py --delete    # Wirklich löschen
"""

import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta

# ── Konfiguration ─────────────────────────────────────────────────────────────
HA_URL   = "http://localhost:8123"         # direkt, kein Proxy
HA_TOKEN = "DEIN_HA_LONG_LIVED_TOKEN"

# Alle Kalender-Entities die durchsucht werden sollen
CALENDARS = [
    "calendar.bebos",
    "calendar.santi",
    "calendar.fede",
    "calendar.fede_trabajo",
]

# Events die DIESE Wörter im Titel enthalten, werden als Test markiert
# (Groß-/Kleinschreibung egal)
TEST_KEYWORDS = [
    "test",
    "weekly test",
    "test serie",
    "test series",
    "santi weekly",
    "weekly series",
]
# ─────────────────────────────────────────────────────────────────────────────

DRY_RUN = "--delete" not in sys.argv

ctx = ssl.create_default_context()

RANGE_START = datetime.now() - timedelta(days=180)
RANGE_END   = datetime.now() + timedelta(days=4 * 365)


def ha_get(path: str):
    req = urllib.request.Request(
        f"{HA_URL}{path}",
        headers={"Authorization": f"Bearer {HA_TOKEN}"},
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read())


def ha_post(path: str, body: dict) -> tuple[int, str]:
    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{HA_URL}{path}",
        data=payload,
        headers={
            "Authorization": f"Bearer {HA_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()


def is_test_event(summary: str) -> bool:
    s = summary.lower()
    return any(kw in s for kw in TEST_KEYWORDS)


def main():
    if DRY_RUN:
        print("▸ DRY-RUN — nichts wird gelöscht. Mit --delete wirklich löschen.\n")
    else:
        print("▸ DELETE-Modus — Events werden aus HA gelöscht.\n")

    total_found = 0
    total_deleted = 0
    total_failed = 0

    start_iso = RANGE_START.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_iso   = RANGE_END.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    for cal in CALENDARS:
        print(f"── {cal}")
        try:
            events = ha_get(
                f"/api/calendars/{cal}?start={start_iso}&end={end_iso}"
            )
        except Exception as exc:
            print(f"   FEHLER beim Laden: {exc}")
            continue

        test_events = [e for e in events if is_test_event(e.get("summary", ""))]
        if not test_events:
            print("   (keine Test-Events)\n")
            continue

        for ev in test_events:
            summary = ev.get("summary", "(kein Titel)")
            uid     = ev.get("uid", "")
            start   = (ev.get("start") or {}).get("dateTime") or (ev.get("start") or {}).get("date", "")
            total_found += 1

            if not uid:
                print(f"   ✗ {summary} [{start}] — keine UID, übersprungen")
                total_failed += 1
                continue

            if DRY_RUN:
                print(f"   • {summary} [{start}]  uid={uid}")
                continue

            code, body = ha_post("/api/services/calendar/delete_event", {
                "entity_id": cal,
                "uid": uid,
            })
            if code in (200, 201):
                print(f"   ✓ gelöscht: {summary} [{start}]")
                total_deleted += 1
            else:
                # Versuche es mit recurrence_id falls vorhanden (manche Backends brauchen das)
                rec_id = ev.get("recurrence_id", "")
                if rec_id:
                    code2, body2 = ha_post("/api/services/calendar/delete_event", {
                        "entity_id": cal,
                        "uid": uid,
                        "recurrence_id": rec_id,
                        "range": "all",
                    })
                    if code2 in (200, 201):
                        print(f"   ✓ gelöscht (via recurrence_id): {summary} [{start}]")
                        total_deleted += 1
                        continue
                print(f"   ✗ FEHLER {code}: {summary} [{start}]")
                print(f"       uid={uid}")
                print(f"       HA-Antwort: {body[:200]}")
                total_failed += 1

        print()

    print("─" * 60)
    print(f"Gefunden: {total_found}  |  ", end="")
    if DRY_RUN:
        print("(Dry-Run, nichts gelöscht)")
    else:
        print(f"Gelöscht: {total_deleted}  |  Fehlgeschlagen: {total_failed}")

    if total_failed > 0 and not DRY_RUN:
        print("\n⚠ Fehlgeschlagene Events: Möglicherweise iCloud/CalDAV-Kalender.")
        print("  → Diese Events bitte direkt in der iOS Kalender-App löschen.")
        print("    Änderungen synchronisieren dann automatisch zu HA.")


if __name__ == "__main__":
    main()
