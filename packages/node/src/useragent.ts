import type { DeviceInfo } from '@insayt/core';
import { UAParser } from 'ua-parser-js';

const parser = new UAParser();

export function parseUserAgent(ua: string): DeviceInfo {
  parser.setUA(ua);
  const result = parser.getResult();

  return {
    type: resolveDeviceType(result.device?.type),
    browser: result.browser?.name || 'Unknown',
    os: result.os?.name || 'Unknown',
  };
}

function resolveDeviceType(type?: string): string {
  if (type === 'mobile') return 'mobile';
  if (type === 'tablet') return 'tablet';
  return 'desktop';
}
