// Minimal service worker for the marketing site.
// Its only job is to make the site installable (browsers require a SW with a
// fetch handler before offering "Install"). It does not cache — every request
// passes straight through to the network, so users always see the live site.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Intentionally empty: presence of this handler satisfies installability;
  // not calling event.respondWith() lets the browser handle the request normally.
});
