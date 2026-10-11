import { useEffect, useState } from "react";
import { useUserId } from "../auth";
import * as store from "../data/store";

/** Your role on a boat: "owner", "crew", "viewer" — or undefined while loading. */
export function useBoatRole(boatId: string | undefined) {
  const userId = useUserId();
  const [role, setRole] = useState<store.BoatRole | null | undefined>(undefined);
  useEffect(() => {
    if (!boatId) return;
    let cancelled = false;
    store.myRole(userId, boatId).then(r => !cancelled && setRole(r));
    return () => { cancelled = true; };
  }, [userId, boatId]);
  return role;
}

/** A short display name: "pat.smith@gmail.com" → "pat.smith". */
export const shortName = (email: string) => email.split("@")[0];

/**
 * Names of the people on a boat, keyed by user id, for "Added by …".
 * Empty when you're the only one on the boat (no need to say who added what).
 */
export function useCrewNames(boatId: string | undefined) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!boatId) return;
    let cancelled = false;
    store.boatCrew(boatId).then(crew => {
      if (!cancelled) setNames(crew.length > 1 ? new Map(crew.map(c => [c.userId, shortName(c.email)])) : new Map());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [boatId]);
  return names;
}
