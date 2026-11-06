import type { Catalog } from '../catalog';
import type {
  ConfigValue,
  NormalizeResult,
  Settings,
  SparseSettings,
  TypeReversion,
} from './types';

export function clone<T> (value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T> (value: T): T {
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

const TYPE_NAME: Record<string, string> = {
  boolean: 'a boolean',
  number: 'a number',
  string: 'a string',
  object: 'a list',
};

function expectedType (value: ConfigValue): string {
  if (Array.isArray(value)) return 'a list';
  return TYPE_NAME[typeof value] ?? typeof value;
}

function matchesType (value: unknown, expected: ConfigValue): boolean {
  if (Array.isArray(expected)) return Array.isArray(value);
  return typeof value === typeof expected;
}

/** Fill missing values from defaults and revert mistyped ones, reporting each reversion. */
export function normalizeSettings (settings: Settings, defaults: Settings): NormalizeResult {
  const normalized = clone(settings);
  const errors: TypeReversion[] = [];

  for (const [section, values] of Object.entries(defaults)) {
    normalized[section] ??= {};
    for (const [key, defaultValue] of Object.entries(values)) {
      const value = normalized[section][key];
      if (value === undefined) {
        normalized[section][key] = clone(defaultValue);
      } else if (!matchesType(value, defaultValue)) {
        errors.push({ section, key, value, expected: expectedType(defaultValue) });
        normalized[section][key] = clone(defaultValue);
      }
    }
  }

  return { settings: normalized, errors };
}
