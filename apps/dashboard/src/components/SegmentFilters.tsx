import { useMemo } from 'react';

export interface SegmentFilter {
  id: string;
  key: string;
  value: string;
}

const FILTER_OPTIONS: { key: string; label: string; placeholder?: string }[] = [
  { key: 'geo.country', label: 'Country', placeholder: 'US, TR, DE...' },
  { key: 'geo.region', label: 'Region', placeholder: 'CA, Istanbul...' },
  { key: 'geo.city', label: 'City', placeholder: 'San Francisco...' },
  { key: 'language', label: 'Language', placeholder: 'en-US' },
  { key: 'device.type', label: 'Device Type', placeholder: 'desktop, mobile...' },
  { key: 'device.browser', label: 'Browser', placeholder: 'Chrome, Safari...' },
  { key: 'device.os', label: 'OS', placeholder: 'macOS, Windows...' },
  { key: 'referrer', label: 'Referrer', placeholder: 'https://...' },
  { key: 'utm.source', label: 'UTM Source' },
  { key: 'utm.medium', label: 'UTM Medium' },
  { key: 'utm.campaign', label: 'UTM Campaign' },
  { key: 'utm.term', label: 'UTM Term' },
  { key: 'utm.content', label: 'UTM Content' },
  { key: 'event_source', label: 'Event Source', placeholder: 'auto or manual' },
  { key: 'event_subtype', label: 'Event Subtype', placeholder: 'scroll_depth, link_click...' },
  { key: 'event_name', label: 'Event Name', placeholder: 'Signup, Purchase...' },
  { key: 'type', label: 'Event Type', placeholder: 'pageview, event, identify' },
  { key: 'page_path', label: 'Page Path', placeholder: '/pricing' },
  { key: 'target_url_path', label: 'Target URL Path', placeholder: '/docs/getting-started' },
];

const EVENT_SUBTYPE_SUGGESTIONS = [
  'scroll_depth',
  'link_click',
  'outbound_click',
  'button_click',
  'rage_click',
  'file_download',
];

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function filtersToRecord(filters: SegmentFilter[]): Record<string, string> {
  return filters.reduce<Record<string, string>>((acc, f) => {
    if (f.key && f.value) acc[f.key] = f.value;
    return acc;
  }, {});
}

interface SegmentFiltersProps {
  value: SegmentFilter[];
  onChange: (next: SegmentFilter[]) => void;
}

export function SegmentFilters({ value, onChange }: SegmentFiltersProps) {
  const usedKeys = useMemo(() => new Set(value.map((f) => f.key)), [value]);
  const canAddMore = value.length < FILTER_OPTIONS.length;

  const updateFilter = (id: string, patch: Partial<SegmentFilter>) => {
    onChange(value.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const addFilter = () => {
    const available = FILTER_OPTIONS.find((opt) => !usedKeys.has(opt.key));
    if (!available) return;
    onChange([...value, { id: makeId(), key: available.key, value: '' }]);
  };

  const removeFilter = (id: string) => {
    onChange(value.filter((f) => f.id !== id));
  };

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Segmentation</h3>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Filter analytics by audience, device, UTM, or event metadata.</p>
        </div>
        <div className="flex items-center gap-2">
          {value.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-medium"
            >
              Clear
            </button>
          )}
          <button
            onClick={addFilter}
            disabled={!canAddMore}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            + Add filter
          </button>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="text-sm text-zinc-400 dark:text-zinc-500">No filters applied.</div>
      ) : (
        <div className="space-y-2">
          {value.map((filter) => {
            const availableOptions = FILTER_OPTIONS.filter((opt) => !usedKeys.has(opt.key) || opt.key === filter.key);
            const selected = FILTER_OPTIONS.find((opt) => opt.key === filter.key);
            const isEventSource = filter.key === 'event_source';
            const isType = filter.key === 'type';
            const isEventSubtype = filter.key === 'event_subtype';

            return (
              <div key={filter.id} className="flex flex-wrap items-center gap-2">
                <select
                  value={filter.key}
                  onChange={(e) => updateFilter(filter.id, { key: e.target.value, value: '' })}
                  className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
                >
                  {availableOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>

                {isEventSource ? (
                  <select
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
                  >
                    <option value="">Select source</option>
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                  </select>
                ) : isType ? (
                  <select
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
                  >
                    <option value="">Select type</option>
                    <option value="pageview">pageview</option>
                    <option value="event">event</option>
                    <option value="identify">identify</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    list={isEventSubtype ? 'event-subtype-suggestions' : undefined}
                    placeholder={selected?.placeholder || 'Value'}
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200 w-56"
                  />
                )}

                <button
                  onClick={() => removeFilter(filter.id)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <datalist id="event-subtype-suggestions">
        {EVENT_SUBTYPE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
