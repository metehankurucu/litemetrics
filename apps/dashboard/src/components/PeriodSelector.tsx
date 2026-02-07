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
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 border border-zinc-200">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              onChange(p.value);
              setShowCustom(p.value === 'custom');
            }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              value === p.value
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
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
