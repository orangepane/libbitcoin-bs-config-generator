import type { Catalog, Kind } from '../catalog';
import type { ConfigValue, Settings, SparseSettings, UnknownEntry } from './types';
import { mixDefaults, stripDefaults } from './defaults';

// Links carry the sparse config only, as UTF-8 bytes in base64url. Reading one
// never throws and never mutates the defaults; writing one never touches the
// URL, because the caller decides when to share.

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const HASH_PREFIX = 'c=';
const LEGACY_HASH_PREFIX = 'config=';

/** Base64 with the standard alphabet. `=` padding is emitted, callers may strip it. */
function toBase64 (bytes: Uint8Array): string {
  let encoded = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    const third = index + 2 < bytes.length ? bytes[index + 2] : undefined;

    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 0b11) << 4) | ((second ?? 0) >> 4)];
    encoded += second === undefined ? '=' : BASE64_ALPHABET[((second & 0b1111) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? '=' : BASE64_ALPHABET[third & 0b111111];
  }

  return encoded;
}

/** Lenient inverse: accepts padding, whitespace, and the URL-safe alphabet. */
function fromBase64 (input: string): Uint8Array | null {
  const normalised = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const body = normalised.replace(/=+$/, '');

  // A base64 body of length 4n+1 cannot be produced by any byte sequence.
  if (body.length % 4 === 1) return null;

  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let written = 0;

  for (const character of body) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }

  return bytes.subarray(0, written);
}

/** Percent-escaped legacy payloads exist in the wild; decode when it is safe. */
function relaxEscapes (raw: string): string {
  if (!raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Compact, URL-safe encoding of the sparse settings and any imported keys the
 * catalog does not know. Both are needed for a link to carry the same config
 * the sender sees.
 */
export function encodeSettings (
  settings: Settings,
  defaults: Settings,
  unknown: UnknownEntry[] = [],
): string {
  const payload = { s: stripDefaults(settings, defaults), u: unknown };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return toBase64(bytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function isUnknownEntry (value: unknown): value is UnknownEntry {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.section === 'string' &&
    typeof value.key === 'string' &&
    Array.isArray(value.values) &&
    value.values.every((element) => typeof element === 'string')
  );
}

function matchesKind (kind: Kind, value: unknown): boolean {
  switch (kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'decimal':
      return typeof value === 'number' && Number.isFinite(value);
    case 'text':
    case 'path':
    case 'enum':
      return typeof value === 'string';
    case 'list':
      return Array.isArray(value) && value.every((element) => typeof element === 'string');
    default:
      return false;
  }
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface SharedState {
  settings: Settings;
  unknown: UnknownEntry[];
}

/**
 * Decode a payload into the full settings it represents.
 *
 * Both the envelope `{ s, u }` and the older plain sparse object are accepted.
 * Only keys the catalog knows, with a value the catalog's kind allows, are kept;
 * everything else is ignored rather than reported. Returns null when the payload
 * cannot be decoded at all: bad base64, bad JSON, or a non-object.
 */
export function decodeShared (
  raw: string,
  defaults: Settings,
  catalog: Catalog,
): SharedState | null {
  if (typeof raw !== 'string' || raw === '') return null;

  const bytes = fromBase64(relaxEscapes(raw));
  if (bytes === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (!isPlainObject(payload)) return null;

  const envelope = isPlainObject(payload.s) && Array.isArray(payload.u);
  const sparsePayload = envelope ? (payload.s as Record<string, unknown>) : payload;
  const unknown = envelope
    ? (payload.u as unknown[]).filter(isUnknownEntry).map((entry) => ({
        section: entry.section,
        key: entry.key,
        values: [...entry.values],
      }))
    : [];

  const sparse: SparseSettings = {};

  for (const section of Object.values(catalog.sections)) {
    const sectionPayload = sparsePayload[section.key];
    if (!isPlainObject(sectionPayload)) continue;

    const kept: Record<string, ConfigValue> = {};
    for (const setting of Object.values(section.settings)) {
      const value = sectionPayload[setting.key];
      if (!matchesKind(setting.kind, value)) continue;
      kept[setting.key] = Array.isArray(value) ? [...(value as string[])] : (value as ConfigValue);
    }

    if (Object.keys(kept).length > 0) sparse[section.key] = kept;
  }

  // An empty payload is a real link: it says "all defaults". A payload that
  // carried keys but none of them survived is a link from another catalog,
  // and is ignored rather than applied as a reset.
  if (Object.keys(sparse).length === 0 && Object.keys(sparsePayload).length > 0) return null;

  return { settings: mixDefaults(defaults, sparse), unknown };
}

/** Settings only. Kept for callers that do not need the imported extras. */
export function decodeSettings (
  raw: string,
  defaults: Settings,
  catalog: Catalog,
): Settings | null {
  return decodeShared(raw, defaults, catalog)?.settings ?? null;
}

/** Read a share payload out of a location hash. Supports `#c=` and legacy `#config=`. */
export function readHash (hash: string): string | null {
  if (typeof hash !== 'string') return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;

  if (trimmed.startsWith(LEGACY_HASH_PREFIX)) {
    const payload = trimmed.slice(LEGACY_HASH_PREFIX.length);
    return payload === '' ? null : payload;
  }

  if (trimmed.startsWith(HASH_PREFIX)) {
    const payload = trimmed.slice(HASH_PREFIX.length);
    return payload === '' ? null : payload;
  }

  return null;
}

/** The shareable URL for the current settings: hash replaced, path and query untouched. */
export function shareUrl (
  settings: Settings,
  defaults: Settings,
  href: string,
  unknown: UnknownEntry[] = [],
): string {
  const url = new URL(href);
  url.hash = `${HASH_PREFIX}${encodeSettings(settings, defaults, unknown)}`;
  return url.toString();
}
