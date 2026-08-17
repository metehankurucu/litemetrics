import type { TrackerConfig } from '@litemetrics/core';
import { createTracker, type LitemetricsInstance } from './tracker';

const open: LitemetricsInstance[] = [];

/**
 * Create a tracker that the test file's `afterEach` will tear down.
 *
 * A tracker left alive keeps a flush interval and, worse, can complete a send
 * whose visitor id was still resolving. That late request lands on the NEXT
 * test's spies, which is the leak behind issue #13.
 */
export function makeTracker(config: TrackerConfig): LitemetricsInstance {
  const tracker = createTracker(config);
  open.push(tracker);
  return tracker;
}

/**
 * Destroy every tracker made through `makeTracker`.
 *
 * Call this as the FIRST statement of `afterEach`, before `vi.restoreAllMocks()`,
 * so teardown runs while the spies it must not trip are still installed.
 */
export function destroyOpenTrackers(): void {
  open.splice(0).forEach((tracker) => tracker.destroy());
}
