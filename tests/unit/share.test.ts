// Sharing is the only path that carries a config between people, so it is
// tested for both directions: round trip, legacy payloads, and refusal to throw
// on anything malformed.
import { describe, expect, it } from 'vitest';

import catalogJson from '../../src/catalog.json';
import { validateCatalog } from '../../src/catalog.schema';
import type { Catalog } from '../../src/catalog.schema';
import { getDefaults, mixDefaults, stripDefaults } from '../../src/config/defaults';
import { decodeSettings, encodeSettings, readHash, shareUrl } from '../../src/config/share';
import type { Settings } from '../../src/config/types';

const catalog: Catalog = validateCatalog(catalogJson);
const defaults = getDefaults(catalog);

function settingsWith (sparse: Settings): Settings {
  return mixDefaults(defaults, sparse);
}

function decoded (raw: string): Settings {
  const settings = decodeSettings(raw, defaults, catalog);
  if (settings === null) throw new Error(`expected a decodable payload: ${raw}`);
  return settings;
}

/** The legacy format: standard base64 (padded) of the JSON payload. */
function legacy (payload: unknown): string {
  return btoa(JSON.stringify(payload));
}

describe('encodeSettings', () => {
  it('encodes the sparse config as unpadded base64url', () => {
    const settings = settingsWith({ bitcoin: { network: 'testnet4' }, outbound: { connections: 8 } });
    const encoded = encodeSettings(settings, defaults);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');

    const json = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
    expect(json).toEqual({
      s: {
        bitcoin: { network: 'testnet4' },
        outbound: { connections: 8 },
      },
      u: [],
    });
  });

  it('encodes defaults as an empty payload', () => {
    expect(encodeSettings(defaults, defaults)).toBe(encodeSettings({}, defaults));
  });

  it('does not mutate its arguments', () => {
    const settings = settingsWith({ bitcoin: { network: 'signet' } });
    const before = [JSON.stringify(settings), JSON.stringify(defaults)];
    encodeSettings(settings, defaults);
    expect([JSON.stringify(settings), JSON.stringify(defaults)]).toEqual(before);
  });
});

describe('decodeSettings', () => {
  it('round-trips the sparse config', () => {
    const settings = settingsWith({
      bitcoin: { network: 'testnet4' },
      outbound: { connections: 8 },
      electrum: { bind: ['0.0.0.0:8580'] },
    });
    expect(decoded(encodeSettings(settings, defaults))).toEqual(settings);
  });

  it('round-trips a non-Latin1 value', () => {
    const settings = settingsWith({
      outbound: { seed: ['nøde.example:8333', '节点.example:8333', '🚀.example:8333'] },
    });
    expect(decoded(encodeSettings(settings, defaults))).toEqual(settings);
  });

  it('round-trips a payload that contains no changes', () => {
    const encoded = encodeSettings(defaults, defaults);
    expect(encoded).toBe(encodeSettings({}, defaults));
    expect(decoded(encoded)).toEqual(defaults);
  });

  it('decodes the legacy standard base64 format, padding and all', () => {
    const payload = { bitcoin: { network: 'signet' }, outbound: { connections: 8 } };
    const raw = legacy(payload);
    expect(raw).toContain('=');
    expect(decoded(raw)).toEqual(settingsWith(payload));
  });

  it('decodes a percent-escaped legacy payload', () => {
    const raw = legacy({ bitcoin: { network: 'regtest' } });
    expect(decoded(encodeURIComponent(raw))).toEqual(settingsWith({ bitcoin: { network: 'regtest' } }));
  });

  it('ignores keys the catalog does not know', () => {
    const raw = legacy({
      bitcoin: { network: 'signet', mystery: 1 },
      nowhere: { mode: 'fast' },
    });
    const settings = decoded(raw);
    expect(settings.bitcoin.network).toBe('signet');
    expect(settings.bitcoin).not.toHaveProperty('mystery');
    expect(settings).not.toHaveProperty('nowhere');
  });

  it('ignores values whose type the catalog rejects', () => {
    const raw = legacy({
      bitcoin: { network: 'signet' },
      outbound: { connections: 'many', seed: 'seed.example:8333' },
      electrum: { connections: 1.5, bind: [1, 2] },
    });
    const settings = decoded(raw);
    expect(settings.outbound.connections).toBe(defaults.outbound.connections);
    expect(settings.outbound.seed).toEqual(defaults.outbound.seed);
    expect(settings.electrum.connections).toBe(defaults.electrum.connections);
    expect(settings.electrum.bind).toEqual(defaults.electrum.bind);
    expect(settings.bitcoin.network).toBe('signet');
  });

  it('keeps whole numbers and decimals apart', () => {
    const integer = decoded(legacy({ outbound: { connections: 8 } }));
    expect(integer.outbound.connections).toBe(8);

    const fractional = decoded(legacy({ node: { minimum_fee_rate: 2.5 } }));
    expect(fractional.node.minimum_fee_rate).toBe(2.5);

    const rejected = decoded(
      legacy({ bitcoin: { network: 'signet' }, outbound: { connections: 8.5 } }),
    );
    expect(rejected.outbound.connections).toBe(defaults.outbound.connections);
  });

  it('returns null when nothing valid could be decoded', () => {
    expect(decodeSettings('', defaults, catalog)).toBeNull();
    expect(decodeSettings('!!!!', defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy('not an object'), defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy([1, 2, 3]), defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy(null), defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy(42), defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy('a string'), defaults, catalog)).toBeNull();
  });

  it('returns null when the payload is not JSON or not UTF-8', () => {
    expect(decodeSettings(btoa('not json'), defaults, catalog)).toBeNull();
    // '_w' is a single 0xff byte: valid base64, invalid UTF-8, invalid JSON.
    expect(decodeSettings('_w', defaults, catalog)).toBeNull();
  });

  it('returns null for a payload whose keys and types are all rejected', () => {
    expect(decodeSettings(legacy({ nowhere: { mode: 'fast' } }), defaults, catalog)).toBeNull();
    expect(decodeSettings(legacy({ bitcoin: { network: 42 } }), defaults, catalog)).toBeNull();
  });

  it('does not mutate the defaults it merges over', () => {
    const before = JSON.stringify(defaults);
    decodeSettings(legacy({ bitcoin: { network: 'signet' } }), defaults, catalog);
    expect(JSON.stringify(defaults)).toBe(before);
  });

  it('never returns a reference into the defaults', () => {
    const settings = decoded(encodeSettings(defaults, defaults));
    const network = settings.bitcoin.network as string;
    expect(network).toBe('mainnet');
    settings.bitcoin.network = 'changed';
    expect(defaults.bitcoin.network).toBe('mainnet');
  });
});

describe('readHash', () => {
  it('reads the new c= payload with or without the leading hash', () => {
    const encoded = encodeSettings(settingsWith({ bitcoin: { network: 'signet' } }), defaults);
    expect(readHash(`#c=${encoded}`)).toBe(encoded);
    expect(readHash(`c=${encoded}`)).toBe(encoded);
  });

  it('reads the legacy config= payload with or without the leading hash', () => {
    const raw = legacy({ bitcoin: { network: 'signet' } });
    expect(readHash(`#config=${raw}`)).toBe(raw);
    expect(readHash(`config=${raw}`)).toBe(raw);
  });

  it('returns null for anything else', () => {
    expect(readHash('')).toBeNull();
    expect(readHash('#')).toBeNull();
    expect(readHash('#c=')).toBeNull();
    expect(readHash('#config=')).toBeNull();
    expect(readHash('#other=value')).toBeNull();
    expect(readHash('?#c=abc')).toBeNull();
    expect(readHash(undefined as unknown as string)).toBeNull();
  });

  it('does not confuse c= with config=', () => {
    expect(readHash('#config=abc')).toBe('abc');
    expect(readHash('#c=abc')).toBe('abc');
  });
});

describe('shareUrl', () => {
  const href = 'https://orangepane.github.io/libbitcoin-bs-config-generator/?tab=file#c=stale';

  it('replaces the hash and keeps the path and query', () => {
    const settings = settingsWith({ bitcoin: { network: 'testnet4' } });
    const url = shareUrl(settings, defaults, href);
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://orangepane.github.io');
    expect(parsed.pathname).toBe('/libbitcoin-bs-config-generator/');
    expect(parsed.search).toBe('?tab=file');
    expect(parsed.hash).toBe(`#c=${encodeSettings(settings, defaults)}`);
  });

  it('produces a link that reads back to the same settings', () => {
    const settings = settingsWith({ bitcoin: { network: 'signet' }, outbound: { seed: ['a:1', 'b:2'] } });
    const payload = readHash(new URL(shareUrl(settings, defaults, href)).hash);
    expect(payload).not.toBeNull();
    if (payload === null) return;
    expect(decoded(payload)).toEqual(settings);
  });

  it('shares only the changes, not the whole tree', () => {
    const settings = settingsWith({ outbound: { connections: 8 } });
    const payload = readHash(new URL(shareUrl(settings, defaults, href)).hash);
    expect(payload).not.toBeNull();
    if (payload === null) return;

    const bytes = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(bytes)).toEqual({ s: { outbound: { connections: 8 } }, u: [] });
    expect(stripDefaults(settings, defaults)).toEqual({ outbound: { connections: 8 } });
  });

  it('does not mutate its arguments', () => {
    const settings = settingsWith({ bitcoin: { network: 'signet' } });
    const before = [JSON.stringify(settings), JSON.stringify(defaults), href];
    shareUrl(settings, defaults, href);
    expect([JSON.stringify(settings), JSON.stringify(defaults), href]).toEqual(before);
  });
});
