/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let title = "Familienkalender";
  let body = "";
  let tag = "calendar-push";

  try {
    // ntfy sends JSON: { id, title, message, topic, ... }
    const payload = event.data.json() as {
      title?: string;
      message?: string;
      topic?: string;
    };
    title = payload.title ?? title;
    body = payload.message ?? "";
    if (payload.topic) tag = `calendar-${payload.topic}`;
  } catch {
    body = event.data.text();
  }

  const opts: NotificationOptions = {
    body,
    tag,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return (client as WindowClient).focus();
      }
      return self.clients.openWindow(self.registration.scope);
    }),
  );
});
