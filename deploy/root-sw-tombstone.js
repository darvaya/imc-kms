// IMC KMS — root service-worker TOMBSTONE (optional, IT-deployed).
//
// WHY: KMS is a PWA and registers a service worker scoped to the /kms sub-path
// (`${BASE_PATH}/static/sw.js`, scope `${BASE_PATH}/` — see app/index.tsx and
// vite.config.ts). On the SHARED host appstpcid.imcpelilog.co.id, if any app
// (a previous root-scoped KMS deploy, or a co-tenant app) ever registered a
// service worker at scope "/", that worker is orphaned: it does not
// auto-unregister, can keep serving stale precached HTML, and its "/" scope can
// intercept requests for the whole origin — including /kms.
//
// This file is the OPTIONAL belt-and-suspenders fix: serve it at the
// shared-domain ROOT path /sw.js for a short transition window to actively
// evict any dead root-scoped worker. The PRIMARY plan is simply to confirm
// nothing serves /sw.js at the shared root and that the installed base is ~zero
// at launch.
//
// SAFETY — READ BEFORE DEPLOYING:
//   * Deploy ONLY at the ORIGIN ROOT /sw.js (NOT under /kms — the live KMS
//     worker is /kms/static/sw.js and must NOT be replaced).
//   * It clears ALL Cache Storage for the origin. On a shared domain that is
//     safe ONLY if the root caches belonged to an old KMS deploy. If a
//     co-tenant app owns root caches, DO NOT deploy this — coordinate instead.
//   * Remove it once the transition window closes so a fresh worker can
//     register normally if the root is ever reused.
//
// Behaviour: take control immediately, drop all caches, unregister self, and
// reload any controlled tabs so they fetch live (un-precached) content.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        // Best-effort cache purge; continue to unregister regardless.
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        // Reload so the page stops being served by this dying worker.
        client.navigate(client.url);
      }
    })()
  );
});
