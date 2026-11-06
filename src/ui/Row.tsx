// One setting. The row owns the label line, help, error and state; the control
// owns only the input. Empty is a state, invalid is named, and a revert
// restores the catalog default exactly.
import type { ReactNode } from 'react';

import type { ConfigValue } from '../config';
import { valuesEqual } from '../config';
import { ListField } from './controls/ListField';
import { NumberField } from './controls/NumberField';
import { Select } from './controls/Select';
import { Switch } from './controls/Switch';
import { TextField } from './controls/TextField';
import { rowDomId } from './types';
import type { RowProps } from './types';

export function Row ({
  section,
  setting,
  value,
  defaultValue,
  state,
  reason,
  error,
  networkScoped,
  onChange,
  onRevert,
  onFocusKey,
}: RowProps) {
  const id = rowDomId(section.key, setting.key);
  const controlId = `${id}-control`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${helpId} ${errorId}` : helpId;

  const disabled = state === 'disabled';
  const invalid = state === 'invalid' || error !== undefined;
  const changed = !valuesEqual(value, defaultValue);
  const showRevert = changed && !disabled;
  const showDefaultChip = networkScoped && state === 'default' && !changed;
  const showReason = reason !== undefined && (state === 'disabled' || state === 'fixed');

  // Empty is a state, not a zero. The settings tree types do not yet carry
  // `undefined`, so the unset value crosses this boundary as a widened value;
  // see the note in the task report.
  const emit = (next: ConfigValue | undefined) => onChange(next as ConfigValue);

  function control (): ReactNode {
    switch (setting.kind) {
      case 'boolean':
        return (
          <Switch
            id={controlId}
            label={setting.label}
            checked={value === true}
            disabled={disabled}
            invalid={invalid}
            describedBy={describedBy}
            onChange={emit}
          />
        );
      case 'enum':
        if (setting.values && setting.values.length > 0) {
          return (
            <Select
              id={controlId}
              label={setting.label}
              value={typeof value === 'string' ? value : ''}
              values={setting.values}
              disabled={disabled}
              invalid={invalid}
              describedBy={describedBy}
              onChange={emit}
            />
          );
        }
        return textControl();
      case 'integer':
      case 'decimal':
        return (
          <NumberField
            id={controlId}
            label={setting.label}
            value={typeof value === 'number' ? value : undefined}
            min={setting.min}
            max={setting.max}
            unit={setting.unit}
            inputMode={setting.kind === 'integer' ? 'numeric' : 'decimal'}
            disabled={disabled}
            invalid={invalid}
            describedBy={describedBy}
            onChange={emit}
          />
        );
      case 'list':
        return (
          <ListField
            id={controlId}
            label={setting.label}
            value={Array.isArray(value) ? value : []}
            disabled={disabled}
            invalid={invalid}
            describedBy={describedBy}
            onCommit={emit}
          />
        );
      default:
        return textControl();
    }
  }

  function textControl (): ReactNode {
    return (
      <TextField
        id={controlId}
        label={setting.label}
        value={typeof value === 'string' ? value : ''}
        example={setting.example}
        secret={setting.secret === true}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
        onChange={emit}
      />
    );
  }

  return (
    <div className="row" id={id} data-state={state} data-row={`${section.key}.${setting.key}`}>
      <div className="row-label">
        <label htmlFor={controlId}>{setting.label}</label>
        <code className="row-key">{setting.key}</code>
        {showDefaultChip ? <span className="row-chip row-default">mainnet default</span> : null}
        {showRevert ? (
          <button type="button" className="row-revert" onClick={onRevert}>
            Revert
          </button>
        ) : null}
      </div>

      <div
        className="row-control"
        onFocus={() => onFocusKey?.(section.key, setting.key)}
      >
        {control()}
      </div>

      <div className="row-help" id={helpId}>
        {showReason ? <p className="row-reason">{reason}</p> : null}
        <p className="row-help-text">{setting.help}</p>
      </div>

      {error ? (
        <p className="row-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
