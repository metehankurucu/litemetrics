import type { GeoInfo } from '@insayt/core';

let reader: any = null;

// Timezone → country code fallback for localhost/private IPs
const TZ_COUNTRY: Record<string, string> = {
  // Americas
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Phoenix': 'US', 'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Montreal': 'CA',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Fortaleza': 'BR', 'America/Manaus': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
  'America/Santiago': 'CL', 'America/Lima': 'PE',
  // Europe
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG', 'Europe/Athens': 'GR', 'Europe/Helsinki': 'FI',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA',
  'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR',
  // Asia
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
  'Asia/Kolkata': 'IN', 'Asia/Mumbai': 'IN', 'Asia/Karachi': 'PK',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Tehran': 'IR',
  'Asia/Baghdad': 'IQ', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Jerusalem': 'IL',
  // Oceania
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ',
  // Africa
  'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG', 'Africa/Johannesburg': 'ZA',
  'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
  'Africa/Accra': 'GH', 'Africa/Tunis': 'TN',
};

export async function initGeoIP(dbPath?: string): Promise<void> {
  try {
    const maxmind = await import('maxmind');
    const path = dbPath || await findGeoLiteDB();
    if (path) {
      reader = await maxmind.open(path);
    }
  } catch {
    // GeoIP not available - will return empty geo info
  }
}

function isPrivateIp(ip: string): boolean {
  return ip === '::1' || ip === '127.0.0.1' || ip === 'localhost'
    || ip.startsWith('10.') || ip.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

export function resolveGeo(ip: string, timezone?: string): GeoInfo {
  if (!ip && !timezone) return {};

  // Try MaxMind lookup first
  if (reader && ip) {
    try {
      const cleanIp = ip.replace(/^::ffff:/, '');
      const result = reader.get(cleanIp);
      if (result?.country?.iso_code) {
        return {
          country: result.country.iso_code,
          city: result.city?.names?.en || undefined,
          region: result.subdivisions?.[0]?.names?.en || undefined,
        };
      }
    } catch {
      // fall through to timezone fallback
    }
  }

  // Timezone fallback for localhost/private IPs or when MaxMind fails
  if (timezone) {
    const country = TZ_COUNTRY[timezone];
    if (country) {
      return { country };
    }
  }

  return {};
}

async function findGeoLiteDB(): Promise<string | null> {
  const { existsSync } = await import('fs');
  const { join } = await import('path');
  const { homedir } = await import('os');

  const candidates = [
    join(process.cwd(), 'GeoLite2-City.mmdb'),
    join(homedir(), '.insayt', 'GeoLite2-City.mmdb'),
    '/usr/share/GeoIP/GeoLite2-City.mmdb',
    '/var/lib/GeoIP/GeoLite2-City.mmdb',
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}
