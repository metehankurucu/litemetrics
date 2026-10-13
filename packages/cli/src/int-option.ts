import { InvalidArgumentError } from 'commander';

/**
 * Commander parser for a whole-number option (`--limit`, `--offset`, `--weeks`).
 *
 * Commander calls a parser as parser(value, previous). Passing bare `parseInt`
 * made `previous` (the option's default) the radix: `events -l 200` parsed as
 * parseInt('200', 50) = NaN, so the flag was dropped and the server used its
 * default. Always base 10, and a value that is not a whole number exits 1
 * instead of silently falling back.
 */
export function parseIntOption(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new InvalidArgumentError('Expected a whole number.');
  }
  return Number.parseInt(trimmed, 10);
}
