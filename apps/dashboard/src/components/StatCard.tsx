interface StatCardProps {
  title: string;
  value: number | string;
  loading?: boolean;
  previousValue?: number;
  changePercent?: number;
}

export function StatCard({ title, value, loading, previousValue, changePercent }: StatCardProps) {
  const hasComparison = changePercent !== undefined && changePercent !== null;
  const isPositive = hasComparison && changePercent! > 0;
  const isNegative = hasComparison && changePercent! < 0;

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-5 hover:border-zinc-300 transition-colors">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{title}</p>
      {loading ? (
        <div className="h-8 w-20 bg-zinc-100 rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <p className="text-2xl font-semibold tabular-nums text-zinc-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hasComparison && (
            <span
              className={`text-xs font-medium pb-0.5 ${
                isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-zinc-400'
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
