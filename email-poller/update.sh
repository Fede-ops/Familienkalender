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
#     "imap_user": "DEINE_EMAIL_ADRESSE",
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

# Diagnose-Skript (Duplikate/Löschungen) — zum manuellen Ausführen.
DIAG="/config/scripts/diag.py"
DTMP="/tmp/diag_new.py"
DURL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/diag.py"

curl -fsSL "$DURL" -o "$DTMP"
python3 -m py_compile "$DTMP"
cp "$DTMP" "$DIAG"
rm "$DTMP"
echo "✓ diag.py aktualisiert (Ausführen: python3 /config/scripts/diag.py)."

# python_script: erlaubt der PWA (Nicht-Admin-Benutzer) das Schreiben der
# Familienkalender-Sensoren über einen Service-Aufruf mit Allowlist.
PYS="/config/python_scripts/familienkalender_set_state.py"
PTMP="/tmp/familienkalender_set_state_new.py"
PURL="https://raw.githubusercontent.com/fede-ops/familienkalender/main/email-poller/familienkalender_set_state.py"

mkdir -p /config/python_scripts
curl -fsSL "$PURL" -o "$PTMP"
python3 -m py_compile "$PTMP"
cp "$PTMP" "$PYS"
rm "$PTMP"
echo "✓ familienkalender_set_state.py aktualisiert."

if ! grep -q "^python_script:" /config/configuration.yaml; then
  echo ""
  echo "→ Noch nötig (einmalig): 'python_script:' in /config/configuration.yaml"
  echo "  eintragen und Home Assistant neu starten:"
  echo "    echo 'python_script:' >> /config/configuration.yaml && ha core restart"
fi
echo ""
echo "→ Noch nötig (nur beim allerersten Setup): shell_command + Automation"
echo "  aus ha_setup.yaml übernehmen, dann 'ha core restart'."
