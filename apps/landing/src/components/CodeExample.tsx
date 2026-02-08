import { useState, useMemo } from 'react';

type Tab = 'embed' | 'react' | 'html' | 'node';

const tabs: { key: Tab; label: string }[] = [
  { key: 'embed', label: 'Dashboard' },
  { key: 'react', label: 'React' },
  { key: 'html', label: 'HTML' },
  { key: 'node', label: 'Node.js' },
];

const snippets: Record<Tab, { code: string; lang: string }> = {
  embed: {
    lang: 'tsx',
    code: `import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';

function CustomerDashboard({ customerId }) {
  return (
    <LitemetricsProvider
      baseUrl="/api/stats"
      siteId={customerId}
    >
      <AnalyticsDashboard theme="midnight" />
    </LitemetricsProvider>
  );
}`,
  },
  react: {
    lang: 'tsx',
    code: `import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <LitemetricsProvider
      siteId="your-site-id"
      endpoint="/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}`,
  },
  html: {
    lang: 'html',
    code: `<script src="https://your-server.com/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect',
  });
</script>`,
  },
  node: {
    lang: 'ts',
    code: `import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
const collector = await createCollector({
  db: { url: 'http://localhost:8123' },
  geoip: true,
});

app.post('/api/collect', collector.handler());
app.get('/api/stats', collector.queryHandler());
app.listen(3000);`,
  },
};

// Inline colors for syntax highlighting (not Tailwind classes — works with dynamic content)
const C = {
  keyword: '#a78bfa',
  string: '#34d399',
  comment: '#52525b',
  tag: '#fb7185',
  component: '#60a5fa',
  attr: '#7dd3fc',
  brace: '#71717a',
  plain: '#d4d4d8',
};

interface Token {
  text: string;
  color: string;
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    let matched = false;

    // Comments
    const commentMatch = remaining.match(/^(\/\/.*)$/);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1], color: C.comment });
      remaining = remaining.slice(commentMatch[1].length);
      matched = true;
      continue;
    }

    // Strings (double quotes)
    const dqMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
    if (dqMatch) {
      tokens.push({ text: dqMatch[1], color: C.string });
      remaining = remaining.slice(dqMatch[1].length);
      matched = true;
      continue;
    }

    // Strings (single quotes)
    const sqMatch = remaining.match(/^('(?:[^'\\]|\\.)*')/);
    if (sqMatch) {
      tokens.push({ text: sqMatch[1], color: C.string });
      remaining = remaining.slice(sqMatch[1].length);
      matched = true;
      continue;
    }

    // Strings (backtick)
    const btMatch = remaining.match(/^(`(?:[^`\\]|\\.)*`)/);
    if (btMatch) {
      tokens.push({ text: btMatch[1], color: C.string });
      remaining = remaining.slice(btMatch[1].length);
      matched = true;
      continue;
    }

    // HTML/JSX tags: <TagName or </TagName or <tag or </tag
    const tagMatch = remaining.match(/^(<\/?[A-Z]\w*)/);
    if (tagMatch) {
      tokens.push({ text: tagMatch[1], color: C.component });
      remaining = remaining.slice(tagMatch[1].length);
      matched = true;
      continue;
    }
    const htmlTagMatch = remaining.match(/^(<\/?[a-z][\w-]*)/);
    if (htmlTagMatch) {
      tokens.push({ text: htmlTagMatch[1], color: C.tag });
      remaining = remaining.slice(htmlTagMatch[1].length);
      matched = true;
      continue;
    }

    // Closing >
    const closingTag = remaining.match(/^(\/>|>)/);
    if (closingTag) {
      tokens.push({ text: closingTag[1], color: C.tag });
      remaining = remaining.slice(closingTag[1].length);
      matched = true;
      continue;
    }

    // Keywords
    const kwMatch = remaining.match(/^(import|from|export|const|let|var|function|return|await|async|new|true|false)\b/);
    if (kwMatch) {
      tokens.push({ text: kwMatch[1], color: C.keyword });
      remaining = remaining.slice(kwMatch[1].length);
      matched = true;
      continue;
    }

    // Braces & parens
    if ('{}()[];'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: C.brace });
      remaining = remaining.slice(1);
      matched = true;
      continue;
    }

    // Attribute names (word followed by =)
    const attrMatch = remaining.match(/^(\w+)(?==)/);
    if (attrMatch) {
      tokens.push({ text: attrMatch[1], color: C.attr });
      remaining = remaining.slice(attrMatch[1].length);
      matched = true;
      continue;
    }

    // Default: consume one char or a word
    if (!matched) {
      const wordMatch = remaining.match(/^(\w+|\s+|[^\w\s])/);
      if (wordMatch) {
        tokens.push({ text: wordMatch[1], color: C.plain });
        remaining = remaining.slice(wordMatch[1].length);
      } else {
        tokens.push({ text: remaining[0], color: C.plain });
        remaining = remaining.slice(1);
      }
    }
  }

  return tokens;
}

function HighlightedCode({ code }: { code: string }) {
  const lines = useMemo(() => code.split('\n').map(tokenizeLine), [code]);

  return (
    <>
      {lines.map((tokens, lineIdx) => (
        <div key={lineIdx} className="leading-relaxed">
          {tokens.length === 0 ? (
            <span>{'\n'}</span>
          ) : (
            tokens.map((token, i) => (
              <span key={i} style={{ color: token.color }}>{token.text}</span>
            ))
          )}
        </div>
      ))}
    </>
  );
}

export function CodeExample() {
  const [active, setActive] = useState<Tab>('embed');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[active].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="setup" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider mb-3">Setup</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
            Five lines. That's it.
          </h2>
          <p className="text-lg text-zinc-400">
            Integrate a full analytics dashboard in under a minute.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-2xl shadow-black/30">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActive(tab.key)}
                  className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                    active === tab.key
                      ? 'text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                  {active === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={handleCopy}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Code block */}
          <div className="p-6 overflow-x-auto">
            <pre className="text-sm font-mono">
              <code>
                <HighlightedCode code={snippets[active].code} />
              </code>
            </pre>
          </div>

          {/* File indicator */}
          <div className="border-t border-zinc-800 px-4 py-2 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-zinc-700" />
            <span className="text-xs text-zinc-600 font-mono">{snippets[active].lang}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
