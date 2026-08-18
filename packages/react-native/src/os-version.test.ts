import { describe, it, expect } from 'vitest';
import { resolveOsVersion } from './os-version';

describe('resolveOsVersion', () => {
  // Platform.Version means two different things: a marketing string on iOS
  // ("17.4") and the API level on Android (37). Reporting both through one field
  // put "Android 37" next to "iOS 17.4" in top_os_versions - two scales that cannot
  // be compared, and a number that reads as an Android release that does not exist.
  it('reports the Android release, not the API level', () => {
    expect(resolveOsVersion({ platform: 'android', version: 37, release: '17' })).toBe('17');
    expect(resolveOsVersion({ platform: 'android', version: 34, release: '14' })).toBe('14');
  });

  it('reports the iOS version as given', () => {
    expect(resolveOsVersion({ platform: 'ios', version: '17.4', release: undefined })).toBe('17.4');
  });

  it('ignores a release value on iOS, where only Version is meaningful', () => {
    expect(resolveOsVersion({ platform: 'ios', version: '17.4', release: '14' })).toBe('17.4');
  });

  // Rather than emitting a bare number that would be read as a release version.
  it.each([
    [undefined, 'missing'],
    ['', 'empty'],
    ['   ', 'whitespace'],
    [null, 'null'],
    [{}, 'not a string'],
  ])('labels the API level when the Android release is %s (%s)', (release: unknown, _label: string) => {
    expect(resolveOsVersion({ platform: 'android', version: 37, release })).toBe('API 37');
  });

  it('returns undefined rather than a placeholder when there is nothing to report', () => {
    expect(resolveOsVersion({ platform: 'android', version: undefined, release: undefined })).toBeUndefined();
    expect(resolveOsVersion({ platform: 'ios', version: undefined, release: undefined })).toBeUndefined();
    expect(resolveOsVersion({ platform: 'ios', version: '', release: undefined })).toBeUndefined();
  });

  it('accepts a numeric release and trims a padded one', () => {
    expect(resolveOsVersion({ platform: 'android', version: 34, release: 14 })).toBe('14');
    expect(resolveOsVersion({ platform: 'android', version: 34, release: '  14  ' })).toBe('14');
  });

  it('falls back to the raw version on an unknown platform', () => {
    expect(resolveOsVersion({ platform: 'windows', version: '11', release: undefined })).toBe('11');
  });
});
