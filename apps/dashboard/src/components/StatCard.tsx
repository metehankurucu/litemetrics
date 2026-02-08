interface StatCardProps {
  title: string;
  value: number | string;
  loading?: boolean;
  previousValue?: number;
  changePercent?: number;
  icon?: React.ReactNode;
}

export function StatCard({ title, value, loading, previousValue, changePercent, icon }: StatCardProps) {
  const hasComparison = changePercent !== undefined && changePercent !== null;
  const isPositive = hasComparison && changePercent! > 0;
  const isNegative = hasComparison && changePercent! < 0;

  return (
    <div className="relative rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>}
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{title}</p>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hasComparison && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md mb-0.5 ${
                isPositive
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                  : isNegative
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                  : 'text-zinc-400 bg-zinc-50 dark:bg-zinc-800'
              }`}
            >
              {isPositive && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                </svg>
              )}
              {isNegative && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              )}
              {changePercent === 0 ? '0%' : `${changePercent! > 0 ? '+' : ''}${changePercent!.toFixed(1)}%`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
