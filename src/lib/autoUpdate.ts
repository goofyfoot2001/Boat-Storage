// Phones (especially home-screen shortcuts) can keep showing an old copy of the site.
// Each time the app opens or comes back to the foreground, ask the server for the
// current page and reload if it points at a newer build than the one running.

const currentScript = () =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src");

async function check() {
  const running = currentScript();
  if (!running) return; // local development: nothing to compare
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: "no-store" });
    const html = await res.text();
    const latest = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    if (!latest || latest === running) return;
    // Reload at most once per new build, so a slow-to-update server can't cause a reload loop.
    try {
      if (sessionStorage.getItem("bsm-reloaded-for") === latest) return;
      sessionStorage.setItem("bsm-reloaded-for", latest);
    } catch {
      return; // storage blocked: skip rather than risk looping
    }
    window.location.reload();
  } catch {
    // Offline or a hiccup: try again next time.
  }
}

export function startAutoUpdate() {
  check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
