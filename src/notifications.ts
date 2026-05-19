export interface NotifConfig {
  ntfyBase: string;
  topicPrefix: string;
  subscribedMemberIds: string[];
  vapidKey?: string;
}

const NOTIF_KEY = "nanoclaw-notif-config";

export function loadNotifConfig(): NotifConfig | null {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw ? (JSON.parse(raw) as NotifConfig) : null;
  } catch {
    return null;
  }
}

export function saveNotifConfig(cfg: NotifConfig): void {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(cfg));
}

export function generateTopicPrefix(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `familienkalender-${rand}`;
}

// Convert a Web Push key (ArrayBuffer) to base64url string.
function keyToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ntfy topic ID for a given member entity ID and prefix.
// e.g. ("calendar.fede_trabajo", "fam-abc") → "fam-abc-fede_trabajo"
export function memberTopic(prefix: string, memberId: string): string {
  return `${prefix}-${memberId.replace("calendar.", "")}`;
}

async function tryFetchInfo(url: string): Promise<Response | null> {
  const opts: RequestInit = {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
  };
  return fetch(url, opts).catch(() => null);
}

async function tryParseConfigJs(url: string): Promise<string | null> {
  // ntfy.sh's web UI loads its VAPID key from /config.js which contains
  // a JS literal like:  var config = { web_push_public_key: "BJ..." };
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const text = await res.text();
  const m = text.match(/web[_-]push[_-]public[_-]key\s*[:=]\s*["']([A-Za-z0-9_\-]+)["']/);
  return m ? m[1] : null;
}

export async function fetchNtfyVapidKey(base: string): Promise<string> {
  // Try the documented JSON endpoints first (newer ntfy versions).
  const res =
    (await tryFetchInfo(`${base}/v1/info`)) ??
    (await tryFetchInfo(`${base}/v1/config`));

  if (res && res.ok) {
    const cfg = (await res.json()) as Record<string, string | undefined>;
    const key =
      cfg["web-push-public-key"] ??
      cfg["webPushPublicKey"] ??
      cfg["web_push_public_key"];
    if (key) return key;
  }

  // Fallback: ntfy.sh's public server doesn't expose /v1/info — but it does
  // serve its web UI config at /config.js with the same key embedded.
  const fromConfigJs = await tryParseConfigJs(`${base}/config.js`);
  if (fromConfigJs) return fromConfigJs;

  throw new Error(
    `VAPID-Schlüssel konnte nicht automatisch geladen werden ` +
    `(${base}/v1/info und /config.js erfolglos). ` +
    `Bitte öffne ${base}/app im Browser, aktiviere dort Web Push, ` +
    `und kopiere den Schlüssel aus den Browser-Devtools.`,
  );
}

async function getNtfyVapidKey(base: string, manualKey?: string): Promise<string> {
  if (manualKey && manualKey.trim()) return manualKey.trim();
  return fetchNtfyVapidKey(base);
}

export async function updateNtfySubscription(cfg: NotifConfig, manualVapidKey?: string): Promise<void> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Push Notifications werden von diesem Browser nicht unterstützt");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Benachrichtigungen wurden verweigert — bitte in den Browser-Einstellungen aktivieren");
  }

  const vapidKey = await getNtfyVapidKey(cfg.ntfyBase, manualVapidKey);

  // Convert base64url VAPID key to Uint8Array for pushManager
  const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
  const b64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const reg = await navigator.serviceWorker.ready;

  // Reuse existing subscription if the VAPID key matches; otherwise create a new one.
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existingKey = sub.options.applicationServerKey
      ? keyToBase64(sub.options.applicationServerKey as ArrayBuffer)
      : null;
    if (existingKey !== vapidKey) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
  }

  const subJson = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const topics = cfg.subscribedMemberIds.map((id) => memberTopic(cfg.topicPrefix, id));

  const res = await fetch(`${cfg.ntfyBase}/v1/webpush`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
      topics,
    }),
  });
  if (!res.ok) throw new Error(`ntfy Fehler: ${res.status}`);
}

export async function removeNtfySubscription(cfg: NotifConfig): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const subJson = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  // Tell ntfy to remove this subscription (empty topics = remove all)
  await fetch(`${cfg.ntfyBase}/v1/webpush`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    }),
  }).catch(() => {});

  await sub.unsubscribe();
}

export function isSubscriptionSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}
