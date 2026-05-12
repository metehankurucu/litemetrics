import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { allRoutePaths } from '../src/route-paths';

const SITE = 'https://litemetrics.dev';
const today = new Date().toISOString().split('T')[0];

// Verify every declared route was actually rendered to dist/.
// Catches drift between route-paths.ts and routes.tsx.
const distRoot = resolve(process.cwd(), 'dist');
const missing = allRoutePaths.filter((path) => {
  const file =
    path === '/'
      ? resolve(distRoot, 'index.html')
      : resolve(distRoot, path.replace(/^\//, ''), 'index.html');
  return !existsSync(file);
});
if (missing.length > 0) {
  console.error(
    `\nERROR: routes declared in route-paths.ts but not rendered to dist/:`
  );
  missing.forEach((p) => console.error(`  - ${p}`));
  console.error(
    `\nLikely cause: route added to route-paths.ts but missing from routes.tsx.`
  );
  process.exit(1);
}

// Match Netlify's default trailing-slash redirect so sitemap URLs
// align with the canonical URLs Google will see after the redirect.
const withSlash = (path: string) =>
  path === '/' || path.endsWith('/') ? path : `${path}/`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutePaths
  .map(
    (path) => `  <url>
    <loc>${SITE}${withSlash(path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === '/' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const outPath = resolve(process.cwd(), 'dist', 'sitemap.xml');
writeFileSync(outPath, xml, 'utf-8');
console.log(
  `Generated sitemap with ${allRoutePaths.length} URLs at ${outPath}`
);
