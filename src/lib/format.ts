const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

export const formatPrice = (n: number) => money.format(n);

/** 2_400_000 → "2.3 MB" */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short label for a file type badge: "PDF", "DOCX", "XLSX"… */
export const fileExt = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "FILE").toUpperCase();

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Dot colors, carried over from the original app. */
export const PIN_COLORS = ["#1B6CA8", "#E05C2A", "#2B9E6E", "#9B59B6", "#E8A020", "#C0392B", "#16A085", "#475569"];
