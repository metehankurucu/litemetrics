import { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';

type ExportFormat = 'csv' | 'json' | 'markdown';

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
}

export function ExportButton({ data, filename }: ExportButtonProps) {
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow transition-all text-zinc-600 dark:text-zinc-300"
      >
        <Download className="w-4 h-4" />
        Export
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 right-0 w-36 bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 rounded-lg shadow-lg z-50 py-1">
          <button onClick={() => download('csv')} className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
            CSV
          </button>
          <button onClick={() => download('json')} className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
            JSON
          </button>
          <button onClick={() => download('markdown')} className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
            Markdown
          </button>
        </div>
      )}
    </div>
  );
}
