import { useSyncExternalStore } from 'react';

// Module-level state for the command palette open/close.
// Uses useSyncExternalStore so any component can subscribe without context plumbing.
// Matches the dashboard's lightweight, no-extra-deps pattern (no zustand).

let openState = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return openState;
}

function setOpen(open: boolean) {
  if (openState === open) return;
  openState = open;
  emit();
}

function toggle() {
  openState = !openState;
  emit();
}

export interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export function useCommandPalette(): CommandPaletteState {
  const open = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { open, setOpen, toggle };
}
