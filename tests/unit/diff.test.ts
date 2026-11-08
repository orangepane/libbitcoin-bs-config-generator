// The diff decides what a config file contains, so it is tested directly:
// ordering, formatting, comments, flags, and the fact that nothing is mutated.
import { describe, expect, it } from 'vitest';

import catalogJson from '../../src/catalog.json';
import { validateCatalog } from '../../src/catalog.schema';
import type { Catalog } from '../../src/catalog.schema';
import { getDefaults, mixDefaults } from '../../src/config/defaults';
import { diffEntries, fillDescription } from '../../src/config/diff';
import type { ConfigValue, Settings } from '../../src/config/types';

const catalog: Catalog = validateCatalog(catalogJson);
const defaults = getDefaults(catalog);

function settingsWith (sparse: Settings): Settings {
  return mixDefaults(defaults, sparse);
}

function keys (entries: ReturnType<typeof diffEntries>): string[] {
  return entries.map((entry) => `${entry.section}.${entry.key}`);
}

describe('fillDescription', () => {
  it('interpolates a scalar into every placeholder', () => {
    expect(fillDescription('Listen on {}.', 8333)).toBe('Listen on 8333.');
    expect(fillDescription('Bind {} on {}', '0.0.0.0')).toBe('Bind 0.0.0.0 on 0.0.0.0');
  });

  it('spells booleans the way the file does', () => {
    expect(fillDescription('Enabled: {}', true)).toBe('Enabled: true');
    expect(fillDescription('Enabled: {}', false)).toBe('Enabled: false');
  });

  it('prefers the catalog description for a known value', () => {
    const valueHelp = { mainnet: 'Main Network', testnet4: 'Test Network 4' };
    expect(fillDescription('Network is {}.', 'testnet4', valueHelp)).toBe('Test Network 4');
  });

  it('falls back to interpolation when the value has no description', () => {
    expect(fillDescription('Network is {}.', 'signet', { mainnet: 'Main Network' })).toBe(
      'Network is signet.',
    );
  });

  it('looks values up by their rendered form', () => {
    expect(fillDescription('{} connections', 8, { 8: 'Eight connections' })).toBe('Eight connections');
    expect(fillDescription('{} connections', true, { true: 'Yes' })).toBe('Yes');
  });

  it('describes a list once, interpolating its first element', () => {
    expect(fillDescription('A peer {}.', ['one:1', 'two:2'])).toBe('A peer one:1.');
    expect(fillDescription('A host.', ['a', 'b'], { a: 'Host a.' })).toBe('Host a.');
  });

  it('skips an empty first element', () => {
    expect(fillDescription('A peer {}.', ['', 'one:1', ''])).toBe('A peer one:1.');
  });

  it('returns the help unchanged when there is no value', () => {
    expect(fillDescription('No value here.', undefined)).toBe('No value here.');
    expect(fillDescription('No value here.', null)).toBe('No value here.');
  });

  it('never throws on a missing help string', () => {
    expect(fillDescription(undefined, 10)).toBe('');
    expect(fillDescription(undefined, ['a'])).toBe('');
  });

  it('keeps replacement patterns in a value literal', () => {
    expect(fillDescription('Value {}', '$&')).toBe('Value $&');
    expect(fillDescription('Value {}', '$1')).toBe('Value $1');
  });
});

describe('diffEntries', () => {
  it('returns nothing when every value is at its default', () => {
    expect(diffEntries(defaults, defaults, catalog)).toEqual([]);
    expect(diffEntries({}, defaults, catalog)).toEqual([]);
  });

  it('emits a changed boolean with the catalog comment', () => {
    const entries = diffEntries(
      settingsWith({ bitcoin: { bip54_coinbase_speedy_trial: false } }),
      defaults,
      catalog,
    );

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.value).toBe(false);
    expect(entry.lines).toEqual(['bip54_coinbase_speedy_trial = false']);
    expect(entry.comment).toBe('Check the BIP54 coinbase threshold before timeout (speedy trial).');
    expect(entry.tier).toBe('advanced');
    expect(entry.changed).toBe(true);
    // Chain parameters are captured when the store is created.
    expect(entry.fixedAtCreation).toBe(true);
  });

  it('emits a changed number as a plain decimal', () => {
    const entries = diffEntries(settingsWith({ outbound: { connections: 8 } }), defaults, catalog);
    expect(entries.map((entry) => entry.lines)).toEqual([['connections = 8']]);
    expect(entries[0].value).toBe(8);
  });

  it('uses the catalog description for an enum value', () => {
    const entries = diffEntries(settingsWith({ bitcoin: { network: 'testnet4' } }), defaults, catalog);
    expect(entries[0].comment).toBe('Test Network 4');
    expect(entries[0].lines).toEqual(['network = testnet4']);
  });

  it('writes one line per list element', () => {
    const seeds = ['seed.one:8333', 'seed.two:8333'];
    const entries = diffEntries(settingsWith({ outbound: { seed: seeds } }), defaults, catalog);
    expect(entries[0].lines).toEqual(['seed = seed.one:8333', 'seed = seed.two:8333']);
    expect(entries[0].value).toEqual(seeds);
  });

  it('filters empty elements out of a list', () => {
    const entries = diffEntries(
      settingsWith({ outbound: { seed: ['', 'seed.one:8333', ''] } }),
      defaults,
      catalog,
    );
    expect(entries[0].lines).toEqual(['seed = seed.one:8333']);
    expect(entries[0].value).toEqual(['', 'seed.one:8333', '']);
  });

  it('skips an empty list even though it differs from the default', () => {
    expect(diffEntries(settingsWith({ outbound: { seed: [] } }), defaults, catalog)).toEqual([]);
    expect(diffEntries(settingsWith({ outbound: { seed: ['', ''] } }), defaults, catalog)).toEqual([]);
  });

  it('skips undefined and null values', () => {
    const settings = {
      outbound: { connections: undefined, seed: null },
      bitcoin: { network: 'signet' },
    } as unknown as Settings;
    expect(keys(diffEntries(settings, defaults, catalog))).toEqual(['bitcoin.network']);
  });

  it('emits an empty string as a key with no value', () => {
    const entries = diffEntries(settingsWith({ bitcoin: { milestone: '' } }), defaults, catalog);
    expect(entries[0].value).toBe('');
    expect(entries[0].lines).toEqual(['milestone =']);
  });

  it('follows catalog order, not the order of the settings tree', () => {
    const entries = diffEntries(
      settingsWith({
        node: { maximum_height: 840000 },
        bitcoin: {
          milestone: '0000000000000000000000000000000000000000000000000000000000000000:1',
          bip54_coinbase_speedy_trial: false,
        },
      }),
      defaults,
      catalog,
    );

    expect(keys(entries)).toEqual([
      'bitcoin.bip54_coinbase_speedy_trial',
      'bitcoin.milestone',
      'node.maximum_height',
    ]);
  });

  it('carries tier, network scope and the fixed-at-creation flag', () => {
    const entries = diffEntries(
      settingsWith({ 'table.outs': { buckets: 0 } }),
      defaults,
      catalog,
    );
    const [entry] = entries;
    expect(entry.tier).toBe('table');
    expect(entry.fixedAtCreation).toBe(true);
  });

  it('takes a fixed setting default to be the catalog default when the tree lacks it', () => {
    const sparseDefaults: Settings = { 'table.outs': {} };
    const entries = diffEntries(
      { 'table.outs': { buckets: 0 } },
      sparseDefaults,
      catalog,
    );
    expect(entries.map((entry) => entry.key)).toEqual(['buckets']);
  });

  it('does not mutate settings, defaults, the catalog, or its own output', () => {
    const settings = settingsWith({
      bitcoin: { network: 'testnet4' },
      outbound: { seed: ['seed.one:8333', 'seed.two:8333'] },
    });
    const settingsBefore = JSON.stringify(settings);
    const defaultsBefore = JSON.stringify(defaults);
    const catalogBefore = JSON.stringify(catalog);

    const entries = diffEntries(settings, defaults, catalog);

    expect(JSON.stringify(settings)).toBe(settingsBefore);
    expect(JSON.stringify(defaults)).toBe(defaultsBefore);
    expect(JSON.stringify(catalog)).toBe(catalogBefore);

    const seed = entries.find((entry) => entry.key === 'seed');
    expect(seed).toBeDefined();
    const seedValue = seed?.value as string[];
    seedValue.push('mutated:1');

    expect(settings.outbound.seed).toEqual(['seed.one:8333', 'seed.two:8333']);
    expect(entries.find((entry) => entry.key === 'seed')?.value).not.toBe(settings.outbound.seed);
  });

  it('keeps the typed value per entry', () => {
    const entries = diffEntries(
      settingsWith({
        bitcoin: { bip54_coinbase_speedy_trial: false, network: 'signet' },
        outbound: { connections: 8, seed: ['seed.one:8333'] },
      }),
      defaults,
      catalog,
    );
    const byKey = new Map(entries.map((entry) => [entry.key, entry.value]));
    expect(byKey.get('bip54_coinbase_speedy_trial')).toBe(false);
    expect(byKey.get('network')).toBe('signet');
    expect(byKey.get('connections')).toBe(8);
    expect(byKey.get('seed')).toEqual(['seed.one:8333']);
    for (const entry of entries) {
      const value: ConfigValue = entry.value;
      expect(['boolean', 'number', 'string', 'object']).toContain(typeof value);
    }
  });
});

describe('list descriptions', () => {
  it('describes a list once, however many elements it has', () => {
    const entries = diffEntries(
      settingsWith({
        admin: { credential: ['username:password', 'username2:password2'] },
      }),
      defaults,
      catalog,
    );
    const [entry] = entries;

    expect(entry.lines).toEqual([
      'credential = username:password',
      'credential = username2:password2',
    ]);
    expect(entry.comment.match(/authorization/g)).toHaveLength(1);
  });

  it('describes a bind list once', () => {
    const entries = diffEntries(
      settingsWith({ inbound: { bind: ['0.0.0.0:8333', '[::]:8333'] } }),
      defaults,
      catalog,
    );

    expect(entries[0].comment.match(/IP address to bind/g)).toHaveLength(1);
  });
});
