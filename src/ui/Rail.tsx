import { useId } from 'react';
import type { RailProps, TierView } from './types';

// The rail: the three views over one state, the filters, and where the draft
// came from. Always visible; nothing here scrolls with the settings.

const VIEWS: Array<{ id: TierView; label: string }> = [
  { id: 'start', label: 'Start' },
  { id: 'essentials', label: 'Essentials' },
  { id: 'all', label: 'All' },
];

export interface RailShellProps extends RailProps {
  /** "Based on Wallet server, modified" or "Starting from defaults". */
  presetLabel: string;
  /** False when the draft already is the defaults and nothing is imported. */
  canReset: boolean;
  onReset: () => void;
}

export function Rail ({
  view,
  onView,
  search,
  onSearch,
  changedOnly,
  onChangedOnly,
  presetLabel,
  canReset,
  onReset,
  undoLabel,
  onUndo,
  onImport,
}: RailShellProps) {
  const searchId = useId();

  return (
    <aside className="rail" aria-label="Views and filters">
      <nav className="rail-tabs" aria-label="Configuration views">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            className="rail-tab"
            type="button"
            aria-pressed={view === entry.id}
            onClick={() => onView(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="search">
        <label htmlFor={searchId}>Search settings</label>
        <input
          id={searchId}
          type="search"
          value={search}
          placeholder="Key, label or description"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>

      <label className="rail-filter">
        <input
          type="checkbox"
          checked={changedOnly}
          onChange={(event) => onChangedOnly(event.target.checked)}
        />
        Changed only
      </label>

      <div className="rail-preset">
        <p className="rail-preset-state">{presetLabel}</p>
        <div className="rail-actions">
          {undoLabel ? (
            <button
              className="btn btn-ghost"
              type="button"
              aria-label={`Undo ${undoLabel}`}
              onClick={onUndo}
            >
              Undo
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={onReset} disabled={!canReset}>
            Reset
          </button>
        </div>
      </div>

      <button className="btn btn-ghost rail-import" type="button" onClick={onImport}>
        Import a file
      </button>
    </aside>
  );
}
