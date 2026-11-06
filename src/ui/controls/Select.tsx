// Native select. The old tree's custom dropdown cost the project its preset
// feature; this one is a real <select>.

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  id: string;
  label: string;
  value: string;
  values: SelectOption[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}

export function Select ({
  id,
  label,
  value,
  values,
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: SelectProps) {
  const known = values.some((option) => option.value === value);

  return (
    <select
      id={id}
      className="select"
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value !== value) onChange(event.target.value);
      }}
    >
      {values.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {/* An imported value the catalog does not list is shown as written, not
          silently rewritten to the first option. */}
      {known ? null : <option value={value}>{value}</option>}
    </select>
  );
}
