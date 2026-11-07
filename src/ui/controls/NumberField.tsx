// Typing never commits: the field can be emptied and an out-of-range value is
// reported rather than clamped. An external change of the committed value
// replaces the draft.
import { useState } from 'react';

export interface NumberFieldProps {
  id: string;
  label: string;
  /** `undefined` is the unset state. It is not zero. */
  value: number | undefined;
  min?: number;
  max?: number;
  unit?: string;
  inputMode?: 'numeric' | 'decimal';
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: number | undefined) => void;
}

interface Edit {
  base: number | undefined;
  text: string;
}

function toDraft (value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function NumberField ({
  id,
  label,
  value,
  min,
  max,
  unit,
  inputMode = 'numeric',
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: NumberFieldProps) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const draft = edit !== null && edit.base === value ? edit.text : toDraft(value);

  function commit () {
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = Number(trimmed);
    // Not a number: keep what was typed and let the row report it. Never coerce.
    if (Number.isFinite(parsed) && parsed !== value) onChange(parsed);
  }

  return (
    <span className="number-field">
      <input
        id={id}
        className="number-input"
        type="text"
        inputMode={inputMode}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setEdit({ base: value, text: event.target.value })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setEdit(null);
          }
        }}
      />
      {unit ? (
        <span className="field-unit" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </span>
  );
}
