// Keeps the app itself on the device so it opens without signal.
// Your boat data and files are saved separately by the app (see "Offline" in src/data/store.ts).
//
//   The page (index.html): network first, so updates arrive as soon as there's signal;
//                          the saved copy is used when offline.
//   Code, styles, fonts, logo: saved on first use (their names change with every update).
//   Anything else (Supabase, other sites): not touched.

const CACHE = "bsm-app-v1";
const SCOPE = self.registration.scope; // e.g. https://…/Boat-Storage/
const PAGE = SCOPE; // the app's single page

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(new Request(PAGE, { cache: "reload" }))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(SCOPE)) return;
  const url = new URL(req.url);
  const isPage = req.mode === "navigate" || url.href.split("?")[0] === PAGE;
  event.respondWith(isPage ? pageFirstFromNetwork(req) : savedFirst(req));
});

async function pageFirstFromNetwork(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok || res.status === 404) {
      // GitHub Pages answers app links like /invite/… with the app page and a 404 status.
      const copy = res.status === 404 ? new Response(await res.clone().text(), { headers: res.headers }) : res.clone();
      await cache.put(PAGE, copy);
      pruneOldAssets(cache, await res.clone().text());
    }
    return res;
  } catch {
    return (await cache.match(PAGE)) ?? Response.error();
  }
}

async function savedFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** After an update, drop code files the new page no longer uses. */
async function pruneOldAssets(cache, html) {
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.includes("/assets/") && !html.includes(path.split("/assets/")[1])) await cache.delete(req);
  }
}
