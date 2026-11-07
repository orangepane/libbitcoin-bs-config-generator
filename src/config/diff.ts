import type { Catalog, SettingDef } from '../catalog';
import type { ConfigValue, DiffEntry, Settings } from './types';
import { valuesEqual } from './defaults';

// Pure: neither the settings tree nor the defaults tree is touched.

/** A scalar as it appears in a config line: booleans spelled out, numbers plain. */
function formatScalar (value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** One scalar described by the catalog: valueHelp first, then `{}` interpolation. */
function describeScalar (
  help: string,
  value: string | number | boolean,
  valueHelp?: Record<string, string>,
): string {
  const rendered = formatScalar(value);
  if (valueHelp) {
    const mapped = valueHelp[rendered];
    if (typeof mapped === 'string' && mapped !== '') return mapped;
  }
  // A function replacer, so a value containing `$&` stays literal.
  return help.replace(/\{\}/g, () => rendered);
}

/**
 * The description for a value: `{}` interpolated for scalars, valueHelp resolved
 * when the catalog has an entry for the value, and list elements described one by
 * one and joined with `, `. Never throws; a missing help string yields ''.
 */
export function fillDescription (
  help: string | undefined,
  value: ConfigValue | undefined | null,
  valueHelp?: Record<string, string>,
): string {
  const base = typeof help === 'string' ? help : '';

  if (Array.isArray(value)) {
    return value
      .filter((element) => typeof element === 'string' && element !== '')
      .map((element) => describeScalar(base, element, valueHelp))
      .join(', ');
  }

  if (value === undefined || value === null) return base;

  return describeScalar(base, value, valueHelp);
}

/** `key = value` for a scalar, one line per list element. Empty elements are dropped. */
function emitLines (key: string, value: ConfigValue): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((element) => typeof element === 'string' && element !== '')
      .map((element) => emitLines(key, element))
      .flat();
  }

  if (value === undefined || value === null) return [];

  const rendered = formatScalar(value);
  return [rendered === '' ? `${key} =` : `${key} = ${rendered}`];
}

/** The default in force for a setting: the passed tree if it has one, else the catalog's. */
function defaultFor (
  sectionDefaults: Record<string, ConfigValue>,
  setting: SettingDef,
): ConfigValue {
  const fromTree = sectionDefaults[setting.key];
  return fromTree === undefined ? setting.default : fromTree;
}

/** Every changed setting, in catalog order, with its rendered lines. */
export function diffEntries (
  settings: Settings,
  defaults: Settings,
  catalog: Catalog,
): DiffEntry[] {
  const entries: DiffEntry[] = [];

  for (const section of Object.values(catalog.sections)) {
    const values = settings[section.key];
    if (!values) continue;
    const sectionDefaults = defaults[section.key] ?? {};

    for (const setting of Object.values(section.settings)) {
      const value: ConfigValue | undefined | null = values[setting.key];
      if (value === undefined || value === null) continue;
      if (valuesEqual(value, defaultFor(sectionDefaults, setting))) continue;

      const lines = emitLines(setting.key, value);
      if (lines.length === 0) continue;

      entries.push({
        section: section.key,
        key: setting.key,
        value: Array.isArray(value) ? [...value] : value,
        lines,
        comment: fillDescription(setting.help, value, setting.valueHelp),
        tier: setting.tier,
        changed: true,
        networkScoped: setting.networkScoped === true,
        fixedAtCreation: setting.fixedAtCreation === true || section.fixedAtCreation === true,
      });
    }
  }

  return entries;
}
