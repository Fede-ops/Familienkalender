#!/bin/sh
# Aktualisiert email_to_calendar.py und reminder_poller.py von GitHub.
#
# Zugangsdaten liegen NICHT mehr im Skript, sondern in
# /config/scripts/poller_config.json — daher ist dieses Update jetzt ein
# einfacher Download, der die Credentials nie berührt.
#
# Einmaliges Setup von poller_config.json (falls noch nicht vorhanden):
#   {
#     "ha_url": "http://homeassistant:8123",
#     "ha_token": "DEIN_HA_LONG_LIVED_TOKEN",
#     "imap_user": "familienkalender@gugg.tech",
#     "imap_pass": "DEIN_EMAIL_PASSWORT",
#     "anthropic_api_key": "DEIN_ANTHROPIC_API_KEY"
#   }
set -e

CFG="/config/scripts/poller_config.json"
if [ ! -f "$CFG" ]; then
  echo "Fehler: $CFG nicht gefunden. Siehe Kommentar in diesem Skript für das Format." >&2
  exit 1
fi

SCRIPT="/config/scripts/email_to_calendar.py"
TMP="/tmp/email_to_calendar_new.py"
URL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/email_to_calendar.py"

curl -fsSL "$URL" -o "$TMP"
python3 -m py_compile "$TMP"
cp "$TMP" "$SCRIPT"
rm "$TMP"
echo "✓ email_to_calendar.py aktualisiert."

REMINDER="/config/scripts/reminder_poller.py"
RTMP="/tmp/reminder_poller_new.py"
RURL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/reminder_poller.py"

curl -fsSL "$RURL" -o "$RTMP"
python3 -m py_compile "$RTMP"
cp "$RTMP" "$REMINDER"
rm "$RTMP"
echo "✓ reminder_poller.py aktualisiert."
echo ""
echo "→ Noch nötig (nur beim allerersten Setup): shell_command + Automation"
echo "  aus ha_setup.yaml übernehmen, dann 'ha core restart'."
