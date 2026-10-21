/** iPhone or iPad (newer iPads say they're a Mac, but have a touch screen). */
export const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Opened from the Home Screen icon rather than in a browser tab. */
export const fromHomeScreen = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * On iPhone, Safari may clear what a site saved if it isn't used for a while — unless it's
 * opened from the Home Screen.
 */
export const mayLoseSavedData = isIPhone && !fromHomeScreen;
