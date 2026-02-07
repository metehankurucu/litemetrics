import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

interface PieChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  loading?: boolean;
}

export function PieChartCard({ title, data, loading }: PieChartCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-5">
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">{title}</h3>
      {loading ? (
        <div className="h-48 bg-zinc-50 rounded-lg animate-pulse" />
      ) : data.length === 0 ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-zinc-300 text-sm">No data yet</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-36 h-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0];
                    const pct = total > 0 ? Math.round(((item.value as number) / total) * 100) : 0;
                    return (
                      <div className="bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-zinc-400">{(item.value as number).toLocaleString()} ({pct}%)</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {data.slice(0, 6).map((item, i) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-zinc-700 truncate">{item.name || '(unknown)'}</span>
                  <span className="text-zinc-400 ml-auto flex-shrink-0 tabular-nums text-xs">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
