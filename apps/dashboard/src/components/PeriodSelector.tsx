import { useState } from 'react';
import type { Period } from '@litemetrics/client';
import { DateRangePicker } from './DateRangePicker';

const periods: { value: Period; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'custom', label: 'Custom' },
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (date: string) => void;
  onDateToChange?: (date: string) => void;
}

export function PeriodSelector({ value, onChange, dateFrom, dateTo, onDateFromChange, onDateToChange }: PeriodSelectorProps) {
  const [showCustom, setShowCustom] = useState(value === 'custom');

  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex gap-0.5 bg-zinc-100/80 dark:bg-zinc-800 rounded-lg p-1 border border-zinc-200/60 dark:border-zinc-700 shadow-sm">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              onChange(p.value);
              setShowCustom(p.value === 'custom');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
              value === p.value
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/60 dark:ring-zinc-600'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50/50 dark:hover:bg-zinc-700/50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && onDateFromChange && onDateToChange && (
        <DateRangePicker
          startDate={dateFrom || ''}
          endDate={dateTo || ''}
          onStartChange={onDateFromChange}
          onEndChange={onDateToChange}
        />
      )}
    </div>
  );
}
