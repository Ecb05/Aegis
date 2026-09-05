// Hermes Element Registry
// Remembers what each Hermes element was at inspect time (label, context,
// bbox) so the action executor can re-find an element that lost its
// data-hermes-id stamp — without blindly clicking "the first button again".
//
// Lifecycle: registered on every inspect; the executor consults it only when
// the id attribute is gone (SPA re-render, hover overlays mounting new nodes).

import type { HermesElement } from '../utils/messaging';

export interface RegistryEntry {
  id: string;
  role: string;
  label: string;
  context?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

const entries = new Map<string, RegistryEntry>();

/** Replace the registry with the freshly inspected elements. */
export function registerElements(elements: HermesElement[]): void {
  entries.clear();
  for (const el of elements) {
    entries.set(el.id, {
      id: el.id,
      role: el.role,
      label: el.label,
      context: el.context,
      bbox: el.bbox ? { ...el.bbox } : undefined,
    });
  }
}

/** Look up what a Hermes id referred to at the last inspect. */
export function getRegistryEntry(id: string): RegistryEntry | undefined {
  return entries.get(id);
}
