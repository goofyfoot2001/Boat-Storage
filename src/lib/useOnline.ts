import { useEffect, useState } from "react";

/** Run `reload` when the connection comes back, so the screen shows the latest (not the saved copy). */
export function useReloadOnReconnect(reload: () => unknown) {
  useEffect(() => {
    const onUp = () => { reload(); };
    window.addEventListener("online", onUp);
    return () => window.removeEventListener("online", onUp);
  }, [reload]);
}

/** True while the device has a connection; updates when it drops or comes back. */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
