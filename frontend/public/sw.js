// Smart Door service worker. It exists so phones treat the page as an installable
// app. It never caches anything: a door app must always show live state.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
