const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]|www\.[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Shows text with any web addresses turned into tappable links. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part.startsWith("www.") ? `https://${part}` : part} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}>
            {part}
          </a>
        ) : part,
      )}
    </>
  );
}
