import type { Target } from "../lib/places";

/** "Stored in" picker: locations grouped by deck, with their containers indented underneath. */
export function PlaceSelect({ label, targets, value, onChange, hint }: {
  label: string;
  targets: Target[];
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const decks = [...new Set(targets.map(t => t.deckName))];
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {decks.map(deck => (
          <optgroup key={deck} label={deck}>
            {targets.filter(t => t.deckName === deck).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
