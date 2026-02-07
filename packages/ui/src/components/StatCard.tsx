interface StatCardProps {
  title: string;
  value: number | string;
  loading?: boolean;
  previousValue?: number;
  changePercent?: number;
  className?: string;
}

export function StatCard({ title, value, loading, changePercent, className }: StatCardProps) {
  const hasComparison = changePercent !== undefined && changePercent !== null;
  const isPositive = hasComparison && changePercent! > 0;
  const isNegative = hasComparison && changePercent! < 0;

  return (
    <div className={`rounded-xl bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] p-6 hover:border-[rgb(var(--lm-border-hover))] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className ?? ''}`}>
      <p className="text-xs font-medium text-[rgb(var(--lm-text-tertiary))] uppercase tracking-wide mb-1">{title}</p>
      {loading ? (
        <div className="h-8 w-20 bg-[rgb(var(--lm-bg-tertiary))] rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <p className="text-3xl font-semibold tabular-nums text-[rgb(var(--lm-text))]">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hasComparison && (
            <span
              className={`text-xs font-medium pb-0.5 ${
                isPositive ? 'text-[rgb(var(--lm-positive))]' : isNegative ? 'text-[rgb(var(--lm-negative))]' : 'text-[rgb(var(--lm-text-tertiary))]'
              }`}
            >
              {isPositive && (
                <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
              {isNegative && (
                <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
