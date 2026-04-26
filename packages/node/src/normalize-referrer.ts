export function normalizeReferrer(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const host = parsed.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
      return host || undefined;
    }
    return value.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}
