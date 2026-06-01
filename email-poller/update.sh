#!/bin/sh
# Aktualisiert email_to_calendar.py von GitHub und übernimmt die Zugangsdaten.
set -e

SCRIPT="/config/scripts/email_to_calendar.py"
TMP="/tmp/email_to_calendar_new.py"
URL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/email_to_calendar.py"

if [ ! -f "$SCRIPT" ]; then
  echo "Fehler: $SCRIPT nicht gefunden." >&2
  exit 1
fi

# Zugangsdaten aus bestehendem Script auslesen
IMAP_PASS=$(grep 'IMAP_PASS\s*=' "$SCRIPT" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')
HA_TOKEN=$(grep 'HA_TOKEN\s*=' "$SCRIPT" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')
ANTHROPIC_API_KEY=$(grep 'ANTHROPIC_API_KEY\s*=' "$SCRIPT" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')

if [ -z "$IMAP_PASS" ] || [ -z "$HA_TOKEN" ] || [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Fehler: Zugangsdaten konnten nicht ausgelesen werden." >&2
  exit 1
fi

# Neue Version laden
curl -fsSL "$URL" -o "$TMP"

# Zugangsdaten einsetzen
sed -i "s|IMAP_PASS = \".*\"|IMAP_PASS = \"$IMAP_PASS\"|" "$TMP"
sed -i "s|HA_TOKEN = \".*\"|HA_TOKEN = \"$HA_TOKEN\"|" "$TMP"
sed -i "s|ANTHROPIC_API_KEY = \".*\"|ANTHROPIC_API_KEY = \"$ANTHROPIC_API_KEY\"|" "$TMP"

# Syntax prüfen bevor wir ersetzen
python3 -m py_compile "$TMP"

# Altes Script ersetzen
cp "$TMP" "$SCRIPT"
rm "$TMP"

echo "✓ email_to_calendar.py aktualisiert. Zugangsdaten übernommen."

# ── Reminder-Poller einrichten/aktualisieren ─────────────────────────────────
REMINDER="/config/scripts/reminder_poller.py"
RTMP="/tmp/reminder_poller_new.py"
RURL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/reminder_poller.py"

curl -fsSL "$RURL" -o "$RTMP"
sed -i "s|HA_TOKEN = \".*\"|HA_TOKEN = \"$HA_TOKEN\"|" "$RTMP"
python3 -m py_compile "$RTMP"
cp "$RTMP" "$REMINDER"
rm "$RTMP"

echo "✓ reminder_poller.py aktualisiert. HA-Token übernommen."
echo ""
echo "→ Noch nötig: shell_command + Automation aus ha_setup.yaml übernehmen,"
echo "  dann 'ha core restart' bzw. Konfiguration neu laden."
