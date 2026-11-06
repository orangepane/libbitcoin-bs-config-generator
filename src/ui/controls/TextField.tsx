// A string field for text and path settings. Draft on keystroke, commit on
// blur or Enter, so a half-typed value never reaches the config.
//
// Same draft rule as NumberField: the field shows the committed value unless
// the user is editing on top of it, and an external change wins.
import { useState } from 'react';

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  /** Catalog example. Used as the placeholder; never invented. */
  example?: string;
  /** Credentials: suppress browser autofill and spellcheck. */
  secret?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}

interface Edit {
  base: string;
  text: string;
}

export function TextField ({
  id,
  label,
  value,
  example,
  secret = false,
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: TextFieldProps) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const draft = edit !== null && edit.base === value ? edit.text : value;

  function commit () {
    if (draft !== value) onChange(draft);
  }

  return (
    <input
      id={id}
      className="text-input"
      type="text"
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      placeholder={example ?? undefined}
      value={draft}
      disabled={disabled}
      autoComplete={secret ? 'off' : undefined}
      autoCapitalize="off"
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
  );
}
