import type { Catalog, Kind, SettingDef } from '../catalog';
import { clone } from './defaults';
import { defaultsFor } from './networks';
import type { ConfigValue, ParseResult, Settings, UnknownEntry } from './types';

// Unknown keys survive the parse, and nothing here throws: a malformed line is
// reported and the rest of the file is read.
//
// Shape of the file, as `bs` reads it:
//   # a full-line comment
//   [section]
//   key = value
// A list key repeats, once per element. An unknown section or key is kept in
// `unknown` with its lines in file order, and never reaches `settings`.

const SECTION_HEADER = /^\[([^\]]*)\]$/;

/**
 * Import limits. A real `bs.cfg` is a few KB; these exist so a mistaken paste
 * or a binary file cannot lock the tab. They are reported, never truncated.
 */
export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_LINES = 50_000;
export const MAX_VALUE_LENGTH = 8_192;

const KIND_EXPECTATION: Record<Kind, string> = {
  boolean: 'true or false',
  integer: 'a whole number',
  decimal: 'a number',
  text: 'a value',
  path: 'a path',
  list: 'a value',
  enum: 'one of the listed values',
};

type Converted = { ok: true; value: ConfigValue } | { ok: false; error: string };

/** How a value reads inside a sentence. */
function renderValue (value: ConfigValue): string {
  if (Array.isArray(value)) return value.length === 0 ? 'unset' : value.join(', ');
  if (typeof value === 'string') return value === '' ? 'empty' : value;
  return String(value);
}

/** "network stays at mainnet." / "bind stays unset." / "path stays empty." */
function stays (key: string, value: ConfigValue): string {
  const rendered = renderValue(value);
  if (Array.isArray(value)) return rendered === 'unset' ? `${key} stays unset` : `${key} stays at ${rendered}`;
  if (typeof value === 'string') return rendered === 'empty' ? `${key} stays empty` : `${key} stays at ${rendered}`;
  return `${key} stays at ${rendered}`;
}

function rejection (
  where: string,
  key: string,
  raw: string,
  expected: string,
  current: ConfigValue,
): Converted {
  const reason = raw === ''
    ? `no value was given, but ${expected} is required`
    : `"${raw}" is not ${expected}`;
  return { ok: false, error: `${where}: ${reason}, so the line was ignored and ${stays(key, current)}.` };
}

/** One raw value against one catalog setting. Text and path never reject. */
function convert (
  setting: SettingDef,
  raw: string,
  where: string,
  current: ConfigValue,
): Converted {
  const expected = KIND_EXPECTATION[setting.kind];

  switch (setting.kind) {
    case 'boolean': {
      const lowered = raw.toLowerCase();
      if (lowered === 'true') return { ok: true, value: true };
      if (lowered === 'false') return { ok: true, value: false };
      return rejection(where, setting.key, raw, expected, current);
    }
    case 'integer': {
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return rejection(where, setting.key, raw, expected, current);
      }
      return { ok: true, value };
    }
    case 'decimal': {
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value)) {
        return rejection(where, setting.key, raw, expected, current);
      }
      return { ok: true, value };
    }
    case 'enum': {
      const allowed = (setting.values ?? []).map((candidate) => candidate.value);
      if (allowed.includes(raw)) return { ok: true, value: raw };
      return rejection(
        where,
        setting.key,
        raw,
        allowed.length > 0 ? `one of ${allowed.join(', ')}` : 'a listed value',
        current,
      );
    }
    case 'text':
    case 'path':
      return { ok: true, value: raw };
    case 'list':
      // Lists are assembled by the caller; one raw value is one element.
      return { ok: true, value: raw };
  }
}

function sectionValues (settings: Settings, section: string): Record<string, ConfigValue> {
  const existing: Record<string, ConfigValue> | undefined = settings[section];
  if (existing !== undefined) return existing;
  const created: Record<string, ConfigValue> = {};
  settings[section] = created;
  return created;
}

/**
 * Parse a `bs.cfg` into full settings.
 *
 * Settings start as a clone of `defaults`; recognised keys overwrite their
 * default. A list key replaces its default array on its first occurrence and
 * appends on each later one. A scalar key that appears twice uses the last
 * value and reports the duplicate. A value that does not fit its catalog kind
 * is reported and leaves the value already in place untouched.
 *
 * Unknown sections and keys land in `unknown`, in file order, with their lines
 * accumulated. They never reach `settings`. This function never throws.
 */
/** The network a file selects, if it selects one. Scanned before the parse. */
function declaredNetwork (text: string): string | null {
  let section: string | null = null;
  for (const line of text.split(/\r\n|\n|\r/)) {
    const trimmed = line.trim();
    const header = SECTION_HEADER.exec(trimmed);
    if (header) { section = header[1].trim(); continue; }
    if (section !== 'bitcoin' || trimmed === '' || trimmed.startsWith('#')) continue;
    const pair = /^network\s*=\s*(.+)$/.exec(trimmed);
    if (pair) return pair[1].trim();
  }
  return null;
}

export function parseConf (text: string, defaults: Settings, catalog: Catalog): ParseResult {
  // A file that selects a network brings that network's defaults with it, so the
  // imported values sit on the same tree bs will use.
  const declared = declaredNetwork(text);
  const current = typeof defaults.bitcoin?.network === 'string' ? defaults.bitcoin.network : 'mainnet';
  const settings = clone(declared === null || declared === current ? defaults : defaultsFor(catalog, declared));
  const unknown: UnknownEntry[] = [];
  const errors: string[] = [];
  const unknownByKey = new Map<string, UnknownEntry>();
  const scalarAt = new Map<string, number>();
  const listStarted = new Set<string>();

  if (text.length > MAX_IMPORT_BYTES) {
    errors.push(
      `This file is ${Math.ceil(text.length / 1024)} KB, above the ${Math.round(MAX_IMPORT_BYTES / 1024)} KB import limit, so nothing was imported. ` +
      'A bs.cfg is normally only a few KB; check that this is a configuration file.',
    );
    return { settings, unknown, errors };
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);

  if (lines.length > MAX_IMPORT_LINES) {
    errors.push(
      `This file has ${lines.length.toLocaleString('en')} lines, above the ${MAX_IMPORT_LINES.toLocaleString('en')} line import limit, so nothing was imported.`,
    );
    return { settings, unknown, errors };
  }

  let section: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();

    if (line === '' || line.startsWith('#')) continue;

    const header = SECTION_HEADER.exec(line);
    if (header) {
      const name = header[1].trim();
      if (name === '') {
        errors.push(`Line ${lineNumber}: the section header has no name, so it was ignored.`);
        continue;
      }
      section = name;
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      errors.push(
        `Line ${lineNumber}: "${line}" is neither a [section] header nor a key = value pair, so it was ignored.`,
      );
      continue;
    }

    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();

    if (raw.length > MAX_VALUE_LENGTH) {
      errors.push(
        `Line ${lineNumber}: the value is ${raw.length.toLocaleString('en')} characters, above the ${MAX_VALUE_LENGTH.toLocaleString('en')} character limit, so the line was ignored.`,
      );
      continue;
    }

    if (key === '') {
      errors.push(`Line ${lineNumber}: the setting has no key before the "=", so it was ignored.`);
      continue;
    }

    if (section === null) {
      errors.push(
        `Line ${lineNumber}: ${key} appears before any [section] header, so it was ignored.`,
      );
      continue;
    }

    const slot = `${section}\u0000${key}`;
    const definition: SettingDef | undefined = catalog.sections[section]?.settings[key];

    if (definition === undefined) {
      let entry = unknownByKey.get(slot);
      if (entry === undefined) {
        entry = { section, key, values: [] };
        unknownByKey.set(slot, entry);
        unknown.push(entry);
      }
      entry.values.push(raw);
      continue;
    }

    const where = `Line ${lineNumber}, [${section}] ${key}`;
    const values = sectionValues(settings, section);
    const current: ConfigValue = values[key] ?? definition.default;

    if (definition.kind === 'list') {
      let list: string[];
      if (listStarted.has(slot)) {
        const existing = values[key];
        list = Array.isArray(existing) ? existing : [];
      } else {
        listStarted.add(slot);
        list = [];
      }
      values[key] = list;
      if (raw === '') {
        errors.push(
          `${where}: no value was given, so the line was ignored. A list is left unset by leaving the key out.`,
        );
        continue;
      }
      list.push(raw);
      continue;
    }

    const previous = scalarAt.get(slot);
    if (previous !== undefined) {
      errors.push(
        `${where}: the setting also appears on line ${previous}. The value from line ${lineNumber} was used.`,
      );
    } else {
      scalarAt.set(slot, lineNumber);
    }

    const result = convert(definition, raw, where, current);
    if (result.ok) values[key] = result.value;
    else errors.push(result.error);
  }

  return { settings, unknown, errors };
}
