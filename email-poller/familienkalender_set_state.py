# /config/python_scripts/familienkalender_set_state.py
#
# Erlaubt der PWA, die Familienkalender-Sensoren zu schreiben, OHNE dass der
# PWA-Benutzer Admin-Rechte braucht: POST /api/states erfordert einen Admin,
# Service-Aufrufe (python_script.familienkalender_set_state) sind dagegen auch
# für eingeschränkte Benutzer erlaubt. Dieses Skript setzt den Zustand dann
# serverseitig — aber ausschließlich für die Sensoren in der Allowlist, damit
# der eingeschränkte Benutzer keine beliebigen Entitäten manipulieren kann.
#
# Setup (einmalig):
#   1. Diese Datei nach /config/python_scripts/ legen (macht update.sh).
#   2. "python_script:" in /config/configuration.yaml eintragen.
#   3. Home Assistant neu starten.

ALLOWED = [
    "sensor.familienkalender_todos",
    "sensor.familienkalender_shopping",
    "sensor.familienkalender_hidden_uids",
    "sensor.familienkalender_deleted_birthdays",
    "sensor.familienkalender_birthdays",
    "sensor.familienkalender_entities",
    "sensor.familienkalender_notif_config",
]

entity_id = data.get("entity_id")
if entity_id in ALLOWED:
    attributes = data.get("attributes")
    if not isinstance(attributes, dict):
        attributes = {}
    hass.states.set(entity_id, str(data.get("state", "ok"))[:255], attributes)
else:
    logger.warning("familienkalender_set_state: Entity nicht erlaubt: %s", entity_id)
