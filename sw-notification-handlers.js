// Custom service worker handlers — injected into the generated workbox SW.
// This file must remain plain JavaScript (no ES modules) since it is loaded
// via importScripts() inside the generated service worker.

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // Focus an existing window if one is open
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ("focus" in client) return client.focus();
        }
        // Otherwise open the app
        if (self.clients.openWindow) {
          return self.clients.openWindow(self.registration.scope);
        }
      })
  );
});

// Web Push handler — ready for future VAPID-based push from HA or a backend.
self.addEventListener("push", function (event) {
  if (!event.data) return;
  try {
    var data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "Kalender", {
        body: data.body || "",
        icon: self.registration.scope + "icons/icon-192.png",
        badge: self.registration.scope + "icons/icon-192.png",
        tag: data.tag || "calendar-push",
        data: data,
      })
    );
  } catch (e) {
    // ignore malformed push payloads
  }
});
