// Service worker minimal : seule la page d'accueil est gardée en copie pour un affichage hors connexion.
// Les appels à l'API ne sont jamais interceptés : les données restent toujours celles du serveur.
const C = "mc-shell-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.mode !== "navigate") return;
  e.respondWith(fetch(r).then((res) => { if (new URL(r.url).pathname === "/") { const c = res.clone(); caches.open(C).then((k) => k.put("/", c)); } return res; })
    .catch(() => caches.match("/").then((m) => m || new Response("Hors connexion", { status: 503 }))));
});
