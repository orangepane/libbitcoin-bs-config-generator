export interface SwitchProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (checked: boolean) => void;
}

export function Switch ({
  id,
  label,
  checked,
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: SwitchProps) {
  return (
    <span className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </span>
  );
}
