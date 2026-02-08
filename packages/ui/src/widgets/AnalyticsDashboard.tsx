import type { Period } from '@litemetrics/core';
import { useLitemetricsUI } from '../hooks/useLitemetricsUI';
import { PeriodSelector } from '../components/PeriodSelector';
import { ExportButton } from '../components/ExportButton';
import { StatCards } from './StatCards';
import { TimeSeriesChart } from './TimeSeriesChart';
import { TopPages } from './TopPages';
import { TopReferrers } from './TopReferrers';
import { TopCountries } from './TopCountries';
import { TopEvents } from './TopEvents';
import { TopConversions } from './TopConversions';
import { TopBrowsers } from './TopBrowsers';
import { TopDevices } from './TopDevices';
import { BrowsersChart } from './BrowsersChart';
import { DevicesChart } from './DevicesChart';
import { WorldMap } from './WorldMap';

interface AnalyticsDashboardProps {
  showPeriodSelector?: boolean;
  showExport?: boolean;
  showWorldMap?: boolean;
  showPieCharts?: boolean;
  period?: Period;
  className?: string;
}

export function AnalyticsDashboard({
  showPeriodSelector = true,
  showExport = true,
  showWorldMap = true,
  showPieCharts = true,
  period,
  className,
}: AnalyticsDashboardProps) {
  const { period: ctxPeriod, setPeriod, dateFrom, setDateFrom, dateTo, setDateTo } = useLitemetricsUI();
  const effectivePeriod = period ?? ctxPeriod;

  return (
    <div className={className}>
      {/* Period selector + export */}
      {(showPeriodSelector || showExport) && (
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          {showPeriodSelector && (
            <PeriodSelector
              value={effectivePeriod}
              onChange={setPeriod}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          )}
          {showExport && (
            <ExportButton data={[]} filename={`analytics-${effectivePeriod}`} />
          )}
        </div>
      )}

      {/* Time Series Chart */}
      <TimeSeriesChart period={effectivePeriod} className="mb-6" />

      {/* Overview Stats */}
      <StatCards period={effectivePeriod} className="mb-6" />

      {/* World Map */}
      {showWorldMap && <WorldMap period={effectivePeriod} className="mb-6" />}

      {/* Pie Charts */}
      {showPieCharts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <BrowsersChart period={effectivePeriod} />
          <DevicesChart period={effectivePeriod} />
        </div>
      )}

      {/* Top Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TopPages period={effectivePeriod} />
        <TopReferrers period={effectivePeriod} />
        <TopCountries period={effectivePeriod} />
        <TopEvents period={effectivePeriod} />
        <TopConversions period={effectivePeriod} />
        <TopBrowsers period={effectivePeriod} />
        <TopDevices period={effectivePeriod} />
      </div>
    </div>
  );
}
