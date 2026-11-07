import type { Catalog } from '../catalog';
import type { ConfigValue, Settings, SparseSettings } from './types';

export function clone<T> (value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T> (value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Values that a full settings tree starts from. Mainnet defaults, by contract. */
export function getDefaults (catalog: Catalog): Settings {
  const defaults: Settings = {};
  for (const section of Object.values(catalog.sections)) {
    const values: Record<string, ConfigValue> = {};
    for (const setting of Object.values(section.settings)) {
      values[setting.key] = clone(setting.default);
    }
    defaults[section.key] = values;
  }
  return deepFreeze(defaults);
}

export function valuesEqual (a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return false;
}

/** The sparse form: every leaf equal to its default removed, empty sections omitted. */
export function stripDefaults (settings: Settings, defaults: Settings): Settings {
  const stripped: Settings = {};
  for (const [section, values] of Object.entries(settings)) {
    const sectionDefaults = defaults[section] ?? {};
    const kept: Record<string, ConfigValue> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!valuesEqual(value, sectionDefaults[key])) kept[key] = clone(value);
    }
    if (Object.keys(kept).length > 0) stripped[section] = kept;
  }
  return stripped;
}

/** Full settings from defaults overridden by a sparse config. Neither input is mutated. */
export function mixDefaults (defaults: Settings, config: SparseSettings): Settings {
  const mixed = clone(defaults);
  for (const [section, values] of Object.entries(config)) {
    mixed[section] ??= {};
    for (const [key, value] of Object.entries(values)) {
      mixed[section][key] = clone(value);
    }
  }
  return mixed;
}
