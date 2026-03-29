interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label
      className={`relative inline-block w-12 h-6 flex-shrink-0 ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <span
        className={`absolute inset-0 rounded-full border-2 transition-all duration-200 ${
          checked ? 'bg-lime border-lime' : 'bg-transparent border-border'
        }`}
      />
      <span
        className={`absolute top-[2px] w-5 h-5 rounded-full transition-all duration-200 ${
          checked ? 'left-[26px] bg-background' : 'left-[2px] bg-text-tertiary'
        }`}
      />
    </label>
  );
}
