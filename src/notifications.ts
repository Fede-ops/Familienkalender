// Notifications via Home Assistant Companion App.
// Each device that has the HA Companion App installed registers itself
// with HA and shows up as a `notify.mobile_app_<slug>` service. The user
// picks, per family member, which device(s) should receive that member's
// calendar reminders. The HA automation that the app generates simply
// calls those notify services directly — no ntfy, no VAPID, no Web Push.

export interface NotifConfig {
  // memberId (e.g. "calendar.fede") → list of HA notify service slugs
  // (e.g. ["mobile_app_iphone_fede", "mobile_app_ipad_familie"])
  memberServices: Record<string, string[]>;
}

const NOTIF_KEY = "nanoclaw-notif-config";

export function loadNotifConfig(): NotifConfig | null {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotifConfig> & Record<string, unknown>;
    // Tolerate old shape (ntfy-era) and migrate to empty mapping.
    if (!parsed.memberServices || typeof parsed.memberServices !== "object") {
      return { memberServices: {} };
    }
    // Migrate keys that were saved without "calendar." prefix (old JS).
    const services = parsed.memberServices as Record<string, unknown>;
    const migrated: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(services)) {
      if (!Array.isArray(v)) continue;
      const key = k.startsWith("calendar.") ? k : `calendar.${k}`;
      migrated[key] = v as string[];
    }
    return { memberServices: migrated };
  } catch {
    return null;
  }
}

export function saveNotifConfig(cfg: NotifConfig): void {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(cfg));
  pushNotifConfigToHA(cfg);
}

interface HAConfig { baseUrl: string; token: string }

function haConfig(): HAConfig | null {
  try {
    const raw = localStorage.getItem("ha-config");
    return raw ? (JSON.parse(raw) as HAConfig) : null;
  } catch { return null; }
}

// Mirror the member→notify-service mapping into a HA sensor so the
// server-side reminder automation (reminder_poller.py) can read it.
// The reminder script needs this mapping, which otherwise lives only here.
export function pushNotifConfigToHA(cfg: NotifConfig): void {
  const ha = haConfig();
  if (!ha) return;
  const ts = Date.now();
  void fetch(`${ha.baseUrl}/api/states/sensor.familienkalender_notif_config`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ha.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      state: String(Object.keys(cfg.memberServices).length),
      attributes: { memberServices: cfg.memberServices, ts },
    }),
  }).catch(() => {});
}

interface HAServiceDomain {
  domain: string;
  services: Record<string, unknown>;
}

// Query HA for every notify.mobile_app_* service. Returns the service slug
// without the domain prefix, e.g. "mobile_app_iphone_fede".
export async function fetchMobileAppServices(): Promise<string[]> {
  const cfg = haConfig();
  if (!cfg) throw new Error("HA Verbindung nicht konfiguriert");
  const res = await fetch(`${cfg.baseUrl}/api/services`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    throw new Error(`HA /api/services ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as HAServiceDomain[];
  const notify = data.find((d) => d.domain === "notify");
  if (!notify) return [];
  return Object.keys(notify.services)
    .filter((s) => s.startsWith("mobile_app_"))
    .sort();
}

// Send a one-off notification via HA's notify service. Used by the
// "Test senden" button in the notifications sheet.
export async function sendTestNotification(
  service: string,
  title: string,
  message: string,
): Promise<void> {
  const cfg = haConfig();
  if (!cfg) throw new Error("HA Verbindung nicht konfiguriert");
  const res = await fetch(`${cfg.baseUrl}/api/services/notify/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, message }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).trim(); } catch { /* ignore */ }
    throw new Error(
      `HA notify.${service} ${res.status} ${res.statusText}` +
      (detail ? `: ${detail}` : ""),
    );
  }
}

// Human-friendly label for a notify service slug.
// "mobile_app_iphone_fede" → "iPhone Fede"
export function prettyServiceName(slug: string): string {
  return slug
    .replace(/^mobile_app_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
