// Keeps the app itself on the device so it opens without signal.
// Your boat data and files are saved separately by the app (see "Offline" in src/data/store.ts).
//
//   The page (index.html): network first, so updates arrive as soon as there's signal;
//                          the saved copy is used when offline.
//   Code, styles, fonts, logo: saved on first use (their names change with every update).
//   Anything else (Supabase, other sites): not touched.

const CACHE = "bsm-app-v2";
const SCOPE = self.registration.scope; // e.g. https://…/Boat-Storage/
const PAGE = SCOPE; // the app's single page

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const res = await fetch(new Request(PAGE, { cache: "reload" }));
    const cache = await caches.open(CACHE);
    await cache.put(PAGE, res.clone());
    await saveWhatThePageNeeds(cache, await res.text());
  })().catch(() => {}));
  self.skipWaiting();
});

/**
 * Save the code, styles, fonts and logo a page uses right away — not just when they're next
 * requested — so the app opens offline even after a single visit.
 */
async function saveWhatThePageNeeds(cache, html) {
  const urls = new Set([new URL("logo.png", SCOPE).href]);
  for (const m of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)) urls.add(new URL(m[1], SCOPE).href);
  for (const url of [...urls]) {
    if (!url.endsWith(".css")) continue;
    const css = await (await fetch(url)).text().catch(() => "");
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) urls.add(new URL(m[1].replace(/["']/g, ""), url).href);
  }
  await Promise.all([...urls].map(async url => {
    if (await cache.match(url)) return;
    const r = await fetch(url).catch(() => null);
    if (r?.ok) await cache.put(url, r);
  }));
}

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
      const html = await res.clone().text();
      const copy = res.status === 404 ? new Response(html, { headers: res.headers }) : res.clone();
      await cache.put(PAGE, copy);
      // After an update: save the new code now, and drop what the old version used.
      saveWhatThePageNeeds(cache, html).then(() => pruneOldAssets(cache, html)).catch(() => {});
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
