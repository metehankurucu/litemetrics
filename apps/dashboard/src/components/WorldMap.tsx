import { useState, useEffect, useCallback, memo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { LitemetricsClient, Period } from '@litemetrics/client';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface WorldMapProps {
  client: LitemetricsClient;
  siteId: string;
  period: Period;
}

interface CountryData {
  [iso: string]: number;
}

export const WorldMap = memo(function WorldMap({ client, siteId, period }: WorldMapProps) {
  const [countryData, setCountryData] = useState<CountryData>({});
  const [tooltip, setTooltip] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    client.setSiteId(siteId);
    try {
      const result = await client.getTopCountries({ period, limit: 200 });
      const map: CountryData = {};
      for (const d of result.data) {
        map[d.key] = d.value;
      }
      setCountryData(map);
    } catch {
      setCountryData({});
    } finally {
      setLoading(false);
    }
  }, [client, siteId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxValue = Math.max(...Object.values(countryData), 1);

  function getColor(iso: string): string {
    const value = countryData[iso] || 0;
    if (value === 0) return '#f4f4f5';
    const intensity = Math.min(value / maxValue, 1);
    // Indigo gradient: light to dark
    const r = Math.round(224 - intensity * 125);
    const g = Math.round(224 - intensity * 126);
    const b = Math.round(245 - intensity * 4);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-5 mb-6">
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Visitors by Country</h3>
      {loading ? (
        <div className="h-64 bg-zinc-50 rounded-lg animate-pulse" />
      ) : (
        <div className="relative">
          <ComposableMap
            projectionConfig={{ scale: 147, center: [0, 20] }}
            style={{ width: '100%', height: 'auto' }}
            height={380}
          >
            <ZoomableGroup>
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const iso = geo.properties.ISO_A2 || geo.id;
                    const value = countryData[iso] || 0;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={getColor(iso)}
                        stroke="#e4e4e7"
                        strokeWidth={0.5}
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', fill: '#818cf8', cursor: 'pointer' },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={(e) => {
                          const name = geo.properties.name || iso;
                          setTooltip({ name, value, x: e.clientX, y: e.clientY });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          {tooltip && (
            <div
              className="fixed z-50 bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
              style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
            >
              <p className="font-medium">{tooltip.name}</p>
              <p className="text-zinc-400">{tooltip.value.toLocaleString()} visitor{tooltip.value !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
