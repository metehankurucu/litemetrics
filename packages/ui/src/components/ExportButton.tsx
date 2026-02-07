import { useState, useRef, useEffect } from 'react';

type ExportFormat = 'csv' | 'json' | 'markdown';

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  className?: string;
}

export function ExportButton({ data, filename, className }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!data || data.length === 0) return null;

  function download(format: ExportFormat) {
    let content: string;
    let mimeType: string;
    let ext: string;

    const headers = Object.keys(data[0]);

    switch (format) {
      case 'csv': {
        const rows = [
          headers.join(','),
          ...data.map((row) =>
            headers.map((h) => {
              const val = row[h];
              const str = val === null || val === undefined ? '' : String(val);
              return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            }).join(',')
          ),
        ];
        content = rows.join('\n');
        mimeType = 'text/csv';
        ext = 'csv';
        break;
      }
      case 'json': {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        ext = 'json';
        break;
      }
      case 'markdown': {
        const headerRow = '| ' + headers.join(' | ') + ' |';
        const separator = '| ' + headers.map(() => '---').join(' | ') + ' |';
        const bodyRows = data.map((row) =>
          '| ' + headers.map((h) => String(row[h] ?? '')).join(' | ') + ' |'
        );
        content = [headerRow, separator, ...bodyRows].join('\n');
        mimeType = 'text/markdown';
        ext = 'md';
        break;
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[rgb(var(--lm-border))] rounded-lg hover:border-[rgb(var(--lm-border-hover))] transition-colors text-[rgb(var(--lm-text-secondary))]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 w-36 bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] rounded-lg shadow-lg z-50 py-1">
          <button onClick={() => download('csv')} className="w-full text-left px-3 py-2 text-sm hover:bg-[rgb(var(--lm-bg-secondary))] text-[rgb(var(--lm-text-secondary))]">
            CSV
          </button>
          <button onClick={() => download('json')} className="w-full text-left px-3 py-2 text-sm hover:bg-[rgb(var(--lm-bg-secondary))] text-[rgb(var(--lm-text-secondary))]">
            JSON
          </button>
          <button onClick={() => download('markdown')} className="w-full text-left px-3 py-2 text-sm hover:bg-[rgb(var(--lm-bg-secondary))] text-[rgb(var(--lm-text-secondary))]">
            Markdown
          </button>
        </div>
      )}
    </div>
  );
}
