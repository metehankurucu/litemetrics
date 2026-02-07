import type { QueryDataPoint } from '@litemetrics/client';

interface TopListProps {
  title: string;
  data: QueryDataPoint[] | null;
  loading?: boolean;
}

export function TopList({ title, data, loading }: TopListProps) {
  const maxValue = data ? Math.max(...data.map((d) => d.value), 1) : 1;
  const totalValue = data ? data.reduce((sum, d) => sum + d.value, 0) : 0;

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">{title}</h3>
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 bg-zinc-50 rounded animate-pulse" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-zinc-300 text-sm">No data yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.map((item) => {
            const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return (
              <div key={item.key} className="relative group">
                <div
                  className="absolute inset-0 bg-indigo-50 rounded transition-all group-hover:bg-indigo-100/80"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
                <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
                  <span className="truncate mr-3 text-zinc-700">{item.key || '(direct)'}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-zinc-500 tabular-nums text-xs">
                      {item.value.toLocaleString()}
                    </span>
                    <span className="text-zinc-300 tabular-nums text-xs w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
