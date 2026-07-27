import React, { type ReactNode } from 'react';

/** Small presentational primitives shared by the panels. */

export const SEGMENT_BASE =
  'px-3 py-1.5 text-sm sm:text-base font-semibold rounded-md transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

export function SegmentedButton({
  selected,
  onClick,
  disabled,
  className = '',
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`${SEGMENT_BASE} ${className} ${
        selected ? 'bg-blue-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  onClick,
  disabled,
  className = '',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex justify-center items-center text-lg font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-4 px-8 rounded-lg transition-transform duration-200 transform hover:scale-105 ${className}`}
    >
      {children}
    </button>
  );
}

export function ToolbarButton({
  onClick,
  title,
  active = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center space-x-2 px-3 py-2 text-white rounded-md transition-colors text-sm font-semibold border shrink-0 ${
        active ? 'bg-green-600 hover:bg-green-500 border-green-500' : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

export const TEXT_INPUT_CLASS =
  'text-lg p-4 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}): React.JSX.Element {
  return (
    <label className="flex items-center space-x-2 cursor-pointer bg-gray-700 hover:bg-gray-600 transition px-3 py-2 rounded-md border border-gray-600 shadow-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="w-5 h-5 rounded cursor-pointer accent-blue-500"
      />
      <span className="text-lg select-none font-semibold text-gray-200">{label}</span>
    </label>
  );
}

export function LabelledSelect<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center">
      <label htmlFor={id} className="mr-2 text-lg font-semibold text-gray-200">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
