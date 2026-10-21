import { useEffect, useState } from "react";
import { lastSavedAt } from "../data/store";
import { useOnline } from "../lib/useOnline";
import { Icon } from "./Icon";

const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Shown across the top whenever there's no connection. */
export function OfflineBanner() {
  const online = useOnline();
  const [saved, setSaved] = useState<number | undefined>();
  useEffect(() => { if (!online) lastSavedAt().then(setSaved); }, [online]);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <Icon name="wifi-off" size={16} />
      <span>
        <strong>Offline</strong> — {saved ? `showing the copy saved on this device (${when(saved)})` : "no cloud boats are saved on this device yet"}.
        {" "}Changes need a connection, except on boats kept only on this phone.
      </span>
    </div>
  );
}
