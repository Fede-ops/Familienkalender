/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Track whether this is an update (a previous SW was already active).
// On a first install self.registration.active is null.
let isUpdate = false;

self.addEventListener("install", () => {
  if (self.registration.active) isUpdate = true;
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      if (!isUpdate) return;
      // Tell every open tab to reload so it picks up the new SW's cached
      // assets. Without this the tab keeps running the old JS/CSS even
      // though the new SW is now in control.
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.postMessage({ type: "sw-reload" }));
    }),
  );
});

// Push notifications go through the HA Companion App via notify.mobile_app_*
// services. The PWA itself is not a push target, so we no longer register a
// push event listener here.
