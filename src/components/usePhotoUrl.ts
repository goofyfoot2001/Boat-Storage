import { useEffect, useState } from "react";
import { photoUrl } from "../data/store";

/** Turns a saved photo path (or a not-yet-saved Blob) into something an <img> can show. */
export function usePhotoUrl(source: string | Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    if (source instanceof Blob) {
      objectUrl = URL.createObjectURL(source);
      setUrl(objectUrl);
    } else if (source) {
      photoUrl(source).then(u => !cancelled && setUrl(u), () => {});
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return url;
}
