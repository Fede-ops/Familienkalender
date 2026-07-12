// Schreibt Familienkalender-Sensoren nach Home Assistant.
//
// Bevorzugter Weg ist der python_script-Service familienkalender_set_state:
// Service-Aufrufe sind auch für Nicht-Admin-Benutzer erlaubt, und das Skript
// akzeptiert serverseitig nur die Familienkalender-Sensoren (Allowlist).
// Das direkte POST /api/states erfordert dagegen Admin-Rechte und dient nur
// noch als Fallback für Geräte mit Admin-Token, solange das python_script auf
// dem Server noch nicht eingerichtet ist.
//
// Werden beide Wege abgelehnt, meldet das Event "ha-write-denied" den Fehler —
// main.ts zeigt dann einen Banner, statt den Sync still scheitern zu lassen.

export function haWriteState(
  baseUrl: string,
  token: string,
  entityId: string,
  state: string,
  attributes: Record<string, unknown>,
): void {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  void (async () => {
    try {
      const svc = await fetch(`${baseUrl}/api/services/python_script/familienkalender_set_state`, {
        method: "POST",
        headers,
        body: JSON.stringify({ entity_id: entityId, state, attributes }),
      });
      if (svc.ok) return;
      const direct = await fetch(`${baseUrl}/api/states/${entityId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ state, attributes }),
      });
      if (direct.ok) return;
      if ([401, 403].includes(svc.status) || [401, 403].includes(direct.status)) {
        window.dispatchEvent(new Event("ha-write-denied"));
      }
    } catch { /* offline — der nächste Save versucht es erneut */ }
  })();
}
