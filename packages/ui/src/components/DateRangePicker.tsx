interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  className?: string;
}

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, className }: DateRangePickerProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        max={endDate || undefined}
        className="bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] rounded-lg px-2.5 py-1.5 text-sm text-[rgb(var(--lm-text))] focus:outline-none focus:border-[rgb(var(--lm-accent))]"
      />
      <span className="text-[rgb(var(--lm-text-tertiary))] text-sm">to</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        min={startDate || undefined}
        max={new Date().toISOString().split('T')[0]}
        className="bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] rounded-lg px-2.5 py-1.5 text-sm text-[rgb(var(--lm-text))] focus:outline-none focus:border-[rgb(var(--lm-accent))]"
      />
    </div>
  );
}
