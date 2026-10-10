const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

export const formatPrice = (n: number) => money.format(n);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Dot colors, carried over from the original app. */
export const PIN_COLORS = ["#1B6CA8", "#E05C2A", "#2B9E6E", "#9B59B6", "#E8A020", "#C0392B", "#16A085", "#475569"];
