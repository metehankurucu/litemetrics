import type { UTMParams } from '@insayt/core';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function hashString(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const array = Array.from(new Uint8Array(hash));
    return array.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Simple fallback hash
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

export function parseUTM(): UTMParams | undefined {
  if (typeof location === 'undefined') return undefined;
  const params = new URLSearchParams(location.search);
  const utm: UTMParams = {};
  let hasUtm = false;

  for (const [key, field] of [
    ['utm_source', 'source'],
    ['utm_medium', 'medium'],
    ['utm_campaign', 'campaign'],
    ['utm_term', 'term'],
    ['utm_content', 'content'],
  ] as const) {
    const val = params.get(key);
    if (val) {
      (utm as Record<string, string>)[field] = val;
      hasUtm = true;
    }
  }

  return hasUtm ? utm : undefined;
}

export function getDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function now(): number {
  return Date.now();
}
