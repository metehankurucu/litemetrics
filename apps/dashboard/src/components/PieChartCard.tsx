import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

const COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#14b8a6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

interface PieChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  loading?: boolean;
  icon?: React.ReactNode;
}

export function PieChartCard({ title, data, loading, icon }: PieChartCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const dark = document.documentElement.classList.contains('dark');
  const pieStroke = dark ? '#18181b' : '#fff';

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full flex flex-col hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-1.5 mb-4">
        {icon && <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>}
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{title}</h3>
      </div>
      {loading ? (
        <div className="h-48 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse flex-1" />
      ) : data.length === 0 ? (
        <div className="h-48 flex items-center justify-center flex-1">
          <p className="text-zinc-300 dark:text-zinc-600 text-sm">No data yet</p>
        </div>
      ) : (
        <div className="flex items-center gap-5 flex-1">
          <div className="w-36 h-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={58}
                  dataKey="value"
                  strokeWidth={2}
                  stroke={pieStroke}
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
                      <div className="bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-zinc-400">{(item.value as number).toLocaleString()} ({pct}%)</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            {data.slice(0, 6).map((item, i) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.name} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-zinc-900 shadow-sm"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300 truncate font-medium">{item.name || '(unknown)'}</span>
                  <span className="text-zinc-400 dark:text-zinc-500 ml-auto flex-shrink-0 tabular-nums text-xs font-semibold">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
