// WebSocket-Aufruf an die Home-Assistant-API.
//
// Grund: Kalendereinträge lassen sich in HA NICHT über einen REST-Service
// löschen/ändern — es gibt kein calendar.delete_event / calendar.update_event.
// Diese Operationen laufen ausschließlich über die WebSocket-API
// (calendar/event/delete bzw. calendar/event/update). Nur calendar.create_event
// existiert als klassischer Service.
//
// Wir öffnen pro Befehl kurz eine Verbindung, authentifizieren mit dem Token,
// senden den Befehl und schließen wieder. Für die geringe Häufigkeit (gelegent-
// liches Löschen/Verschieben) ist das einfach und robust.

interface HAConfig { baseUrl: string; token: string }

export function haWsCommand(config: HAConfig, command: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${config.baseUrl.replace(/^http/i, "ws")}/api/websocket`);
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); return; }

    const id = 1;
    const timeout = setTimeout(() => finish(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error("WebSocket-Timeout")); }), 15_000);

    ws.onmessage = (ev) => {
      let msg: { type?: string; id?: number; success?: boolean; result?: unknown; error?: { message?: string } };
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: config.token }));
      } else if (msg.type === "auth_ok") {
        ws.send(JSON.stringify({ id, ...command }));
      } else if (msg.type === "auth_invalid") {
        clearTimeout(timeout);
        finish(() => { ws.close(); reject(new Error("WebSocket-Authentifizierung ungültig")); });
      } else if (msg.type === "result" && msg.id === id) {
        clearTimeout(timeout);
        if (msg.success) finish(() => { ws.close(); resolve(msg.result); });
        else finish(() => { ws.close(); reject(new Error(msg.error?.message || "WebSocket-Befehl fehlgeschlagen")); });
      }
    };
    ws.onerror = () => { clearTimeout(timeout); finish(() => reject(new Error("WebSocket-Fehler"))); };
    ws.onclose = () => { clearTimeout(timeout); finish(() => reject(new Error("WebSocket geschlossen"))); };
  });
}
