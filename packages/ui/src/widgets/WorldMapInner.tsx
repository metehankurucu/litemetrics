import { ComposableMap, ZoomableGroup, Geographies, Geography } from 'react-simple-maps';
import { numericToISO2 } from '../utils/worldmap-data';

interface WorldMapInnerProps {
  geoUrl: string;
  countryData: Record<string, number>;
  getColor: (iso: string) => string;
  setTooltip: (t: { name: string; value: number; x: number; y: number } | null) => void;
  strokeColor?: string;
  hoverColor?: string;
}

export default function WorldMapInner({ geoUrl, countryData, getColor, setTooltip, strokeColor = 'rgb(228, 228, 231)', hoverColor = 'rgb(129, 140, 248)' }: WorldMapInnerProps) {
  return (
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
                const rawIso = geo.properties.ISO_A2;
                const iso = (rawIso && rawIso !== '-99') ? rawIso : (numericToISO2[geo.id] || geo.id);
                const value = countryData[iso] || 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getColor(iso)}
                    stroke={strokeColor}
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: hoverColor, cursor: 'pointer' },
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
    </div>
  );
}
