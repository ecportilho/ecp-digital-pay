import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, iconLeft, iconRight, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {iconLeft && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {iconLeft}
            </span>
          )}
          <input
            ref={ref}
            className={`w-full bg-surface border rounded-control px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-all duration-200 focus:border-lime focus:shadow-[0_0_0_3px_rgba(183,255,42,0.12)] ${
              error ? 'border-danger' : 'border-border'
            } ${iconLeft ? 'pl-10' : ''} ${iconRight ? 'pr-10' : ''} ${className}`}
            {...props}
          />
          {iconRight && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {iconRight}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <select
        className={`w-full bg-surface border border-border rounded-control px-3.5 py-2.5 text-sm text-text-primary outline-none transition-all duration-200 focus:border-lime focus:shadow-[0_0_0_3px_rgba(183,255,42,0.12)] ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
