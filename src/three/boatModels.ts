/**
 * Decks that have a hand-built 3D model. The model is drawn in the same 0–1 picture coordinates
 * as the deck layout (x: stern → bow, y: port → starboard), so the pins land in the same places.
 */
const MODELS: Record<string, "moonlight-lady-main"> = {
  // MoonlightLady · Main deck (saloon, galley, forward and aft cabins)
  "8fb0b798-f811-40bc-a234-df4145df6f9a": "moonlight-lady-main",
};

export function has3DModel(deckId: string | undefined) {
  return !!deckId && deckId in MODELS;
}
