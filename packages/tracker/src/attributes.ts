import type { InsaytInstance } from './tracker';

const ATTR_EVENT = 'data-insayt-event';
const ATTR_PREFIX = 'data-insayt-event-';

/**
 * Initialize data-attribute event tracking.
 * Clicks on elements with `data-insayt-event="EventName"` will be auto-tracked.
 * Additional properties via `data-insayt-event-*` attributes.
 *
 * Example:
 *   <button data-insayt-event="Signup" data-insayt-event-plan="pro">
 *   → tracks event "Signup" with { plan: "pro" }
 */
export function initAttributeTracking(instance: InsaytInstance): () => void {
  function handleClick(e: Event) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Walk up the DOM to find an element with data-insayt-event
    let el: HTMLElement | null = target;
    while (el) {
      const eventName = el.getAttribute(ATTR_EVENT);
      if (eventName) {
        // Collect data-insayt-event-* properties
        const properties: Record<string, string> = {};
        const attrs = el.attributes;
        for (let i = 0; i < attrs.length; i++) {
          const attr = attrs[i];
          if (attr.name.startsWith(ATTR_PREFIX)) {
            const key = attr.name.slice(ATTR_PREFIX.length);
            properties[key] = attr.value;
          }
        }

        instance.track(
          eventName,
          Object.keys(properties).length > 0 ? properties : undefined
        );
        return;
      }
      el = el.parentElement;
    }
  }

  document.addEventListener('click', handleClick, true);

  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}
