import { useEffect, useState } from "react";
import { getPhoto } from "../data/store";

/** Turns a saved photo id (or a not-yet-saved Blob) into something an <img> can show. */
export function usePhotoUrl(source: string | Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    (async () => {
      const blob = typeof source === "string" ? await getPhoto(source) : source;
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return url;
}
