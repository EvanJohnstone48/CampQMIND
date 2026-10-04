import { useSyncExternalStore } from 'react';
import type { WorldView } from './world';

export function createWorldStore(initial: WorldView) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    publish(next: WorldView) { snapshot = next; listeners.forEach(listener => listener()); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type WorldStore = ReturnType<typeof createWorldStore>;
export function useWorld(store: WorldStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
