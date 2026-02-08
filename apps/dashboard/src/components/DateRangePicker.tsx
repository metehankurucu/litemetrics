interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
}

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        max={endDate || undefined}
        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm dark:text-zinc-200"
      />
      <span className="text-zinc-400 dark:text-zinc-500 text-xs font-medium">to</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        min={startDate || undefined}
        max={new Date().toISOString().split('T')[0]}
        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm dark:text-zinc-200"
      />
    </div>
  );
}
