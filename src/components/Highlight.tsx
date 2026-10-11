import { normalize } from "../lib/search";

/** Shows `text` with every occurrence of the search words marked. */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  // Accent-stripping can change the length; fall back to plain lower-case so positions line up.
  const stripped = normalize(text);
  const lower = stripped.length === text.length ? stripped : text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
      for (let j = i; j < i + w.length && j < text.length; j++) marks[j] = true;
    }
  }
  const out: JSX.Element[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const chunk = text.slice(start, i);
      out.push(marks[start] ? <mark key={start}>{chunk}</mark> : <span key={start}>{chunk}</span>);
      start = i;
    }
  }
  return <>{out}</>;
}
