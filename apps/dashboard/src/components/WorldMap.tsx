import { useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import type { LitemetricsClient, Period } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { MapPin } from 'lucide-react';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Countries where Natural Earth sets ISO_A2 = "-99". Map numeric ISO 3166-1 → ISO-2 alpha.
const numericToISO2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '016': 'AS', '020': 'AD',
  '024': 'AO', '028': 'AG', '031': 'AZ', '032': 'AR', '036': 'AU',
  '040': 'AT', '044': 'BS', '048': 'BH', '050': 'BD', '051': 'AM',
  '056': 'BE', '060': 'BM', '064': 'BT', '068': 'BO', '070': 'BA',
  '072': 'BW', '076': 'BR', '084': 'BZ', '090': 'SB', '096': 'BN',
  '100': 'BG', '104': 'MM', '108': 'BI', '112': 'BY', '116': 'KH',
  '120': 'CM', '124': 'CA', '140': 'CF', '144': 'LK', '148': 'TD',
  '152': 'CL', '156': 'CN', '158': 'TW', '170': 'CO', '174': 'KM',
  '178': 'CG', '180': 'CD', '188': 'CR', '191': 'HR', '192': 'CU',
  '196': 'CY', '203': 'CZ', '204': 'BJ', '208': 'DK', '214': 'DO',
  '218': 'EC', '222': 'SV', '226': 'GQ', '231': 'ET', '232': 'ER',
  '233': 'EE', '242': 'FJ', '246': 'FI', '250': 'FR', '262': 'DJ',
  '266': 'GA', '268': 'GE', '270': 'GM', '275': 'PS', '276': 'DE',
  '288': 'GH', '300': 'GR', '308': 'GD', '320': 'GT', '324': 'GN',
  '328': 'GY', '332': 'HT', '340': 'HN', '348': 'HU', '352': 'IS',
  '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE',
  '376': 'IL', '380': 'IT', '384': 'CI', '388': 'JM', '392': 'JP',
  '398': 'KZ', '400': 'JO', '404': 'KE', '408': 'KP', '410': 'KR',
  '414': 'KW', '417': 'KG', '418': 'LA', '422': 'LB', '426': 'LS',
  '428': 'LV', '430': 'LR', '434': 'LY', '440': 'LT', '442': 'LU',
  '450': 'MG', '454': 'MW', '458': 'MY', '462': 'MV', '466': 'ML',
  '470': 'MT', '478': 'MR', '480': 'MU', '484': 'MX', '496': 'MN',
  '498': 'MD', '499': 'ME', '504': 'MA', '508': 'MZ', '512': 'OM',
  '516': 'NA', '524': 'NP', '528': 'NL', '540': 'NC', '548': 'VU',
  '554': 'NZ', '558': 'NI', '562': 'NE', '566': 'NG', '578': 'NO',
  '586': 'PK', '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE',
  '608': 'PH', '616': 'PL', '620': 'PT', '624': 'GW', '626': 'TL',
  '630': 'PR', '634': 'QA', '642': 'RO', '643': 'RU', '646': 'RW',
  '662': 'LC', '670': 'VC', '678': 'ST', '682': 'SA', '686': 'SN',
  '688': 'RS', '694': 'SL', '702': 'SG', '703': 'SK', '704': 'VN',
  '705': 'SI', '706': 'SO', '710': 'ZA', '716': 'ZW', '724': 'ES',
  '728': 'SS', '729': 'SD', '732': 'EH', '740': 'SR', '748': 'SZ',
  '752': 'SE', '756': 'CH', '760': 'SY', '762': 'TJ', '764': 'TH',
  '768': 'TG', '780': 'TT', '784': 'AE', '788': 'TN', '792': 'TR',
  '795': 'TM', '800': 'UG', '804': 'UA', '807': 'MK', '818': 'EG',
  '826': 'GB', '834': 'TZ', '840': 'US', '854': 'BF', '858': 'UY',
  '860': 'UZ', '862': 'VE', '887': 'YE', '894': 'ZM',
};

interface WorldMapProps {
  client: LitemetricsClient;
  siteId: string;
  period: Period;
  filters?: Record<string, string>;
}

interface CountryData {
  [iso: string]: number;
}

export const WorldMap = memo(function WorldMap({ client, siteId, period, filters }: WorldMapProps) {
  const [tooltip, setTooltip] = useState<{ name: string; value: number; x: number; y: number } | null>(null);

  const { data: countryData = {}, isLoading: loading } = useQuery({
    queryKey: queryKeys.worldMap(siteId, period, filters),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getTopCountries({ period, limit: 200, filters });
      const map: CountryData = {};
      for (const d of result.data) {
        map[d.key] = d.value;
      }
      return map;
    },
  });

  const maxValue = Math.max(...Object.values(countryData), 1);
  const dark = document.documentElement.classList.contains('dark');

  function getColor(iso: string): string {
    const value = countryData[iso] || 0;
    if (value === 0) return dark ? '#27272a' : '#f4f4f5';
    const intensity = Math.min(value / maxValue, 1);
    const r = Math.round(224 - intensity * 125);
    const g = Math.round(224 - intensity * 126);
    const b = Math.round(245 - intensity * 4);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const geoStroke = dark ? '#3f3f46' : '#e4e4e7';

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-1.5 mb-3">
        <MapPin className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Visitors by Country</h3>
      </div>
      {loading ? (
        <div className="h-64 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
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
                    const rawIso = geo.properties.ISO_A2;
                    const iso = (rawIso && rawIso !== '-99') ? rawIso : (numericToISO2[geo.id] || geo.id);
                    const value = countryData[iso] || 0;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={getColor(iso)}
                        stroke={geoStroke}
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
