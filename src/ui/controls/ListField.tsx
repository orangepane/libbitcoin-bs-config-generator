// A list editor. One labelled input per entry, plus add, remove and reorder.
// An empty array is a valid value and means "unset", never an empty string.
//
// Structural edits and entry text are held as an edit layered on the committed
// array. When the parent gives a new array (commit, revert, import), the edit
// no longer matches and the committed array wins.
import { useState } from 'react';

export interface ListFieldProps {
  /** Applies to the first entry input, or the add button when the list is empty. */
  id: string;
  label: string;
  value: string[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onCommit: (value: string[]) => void;
}

interface Edit {
  base: string[];
  text: string[];
}

export function ListField ({
  id,
  label,
  value,
  disabled = false,
  invalid = false,
  describedBy,
  onCommit,
}: ListFieldProps) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const drafts = edit !== null && edit.base === value ? edit.text : value;

  function entryId (index: number): string {
    return index === 0 ? id : `${id}-entry-${index + 1}`;
  }

  function apply (next: string[]) {
    setEdit({ base: value, text: next });
    onCommit(next);
  }

  function commitEntry (index: number) {
    if (drafts[index] === (value[index] ?? '')) return;
    onCommit([...drafts]);
  }

  function add () {
    apply([...drafts, '']);
  }

  function remove (index: number) {
    apply(drafts.filter((_, position) => position !== index));
  }

  function move (index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    const moving = next[index];
    next[index] = next[target];
    next[target] = moving;
    apply(next);
  }

  return (
    <div
      className="list-field"
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      {drafts.length === 0 ? (
        <p className="list-empty">No entries. The list is unset.</p>
      ) : (
        <ul className="list-entries">
          {drafts.map((entry, index) => (
            <li className="list-entry" key={index}>
              <label className="list-entry-label" htmlFor={entryId(index)}>
                Entry {index + 1}
              </label>
              <input
                id={entryId(index)}
                className="text-input"
                type="text"
                aria-describedby={describedBy}
                value={entry}
                disabled={disabled}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(event) => {
                  const next = [...drafts];
                  next[index] = event.target.value;
                  setEdit({ base: value, text: next });
                }}
                onBlur={() => commitEntry(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitEntry(index);
                  } else if (event.key === 'Escape') {
                    const next = [...drafts];
                    next[index] = value[index] ?? '';
                    setEdit({ base: value, text: next });
                  }
                }}
              />
              <span className="list-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Move entry ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Move entry ${index + 1} down`}
                  disabled={disabled || index === drafts.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Remove entry ${index + 1}`}
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="list-add">
        <button
          id={drafts.length === 0 ? id : `${id}-add`}
          type="button"
          className="btn"
          disabled={disabled}
          onClick={add}
        >
          Add entry
        </button>
      </div>
    </div>
  );
}
