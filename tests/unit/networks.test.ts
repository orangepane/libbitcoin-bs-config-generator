// A network's defaults are the baseline bs applies before it reads the file, so
// the diff has to use them or a value equal to mainnet's default silently
// becomes the network's value. These tests pin the baseline and the emission
// rule that keeps the network itself in the file.
import { describe, expect, it } from 'vitest';

import catalogJson from '../../src/catalog.json';
import { validateCatalog } from '../../src/catalog.schema';
import { diffEntries } from '../../src/config/diff';
import { mixDefaults } from '../../src/config/defaults';
import { NETWORKS, defaultsFor } from '../../src/config/networks';
import type { Catalog } from '../../src/catalog.schema';
import type { Settings } from '../../src/config/types';

const catalog: Catalog = validateCatalog(catalogJson);

function withNetwork (network: string, sparse: Record<string, Record<string, unknown>>): Settings {
  return mixDefaults(defaultsFor(catalog, network), {
    bitcoin: { network },
    ...sparse,
  } as Settings);
}

function emitted (settings: Settings, network: string): string[] {
  return diffEntries(settings, defaultsFor(catalog, network), catalog)
    .map((entry) => `${entry.section}.${entry.key}`);
}

describe('network defaults', () => {
  it('covers the five networks bs runs', () => {
    expect(NETWORKS).toEqual(['mainnet', 'testnet3', 'testnet4', 'signet', 'regtest']);
  });

  it('carries each network its own chain parameters', () => {
    expect(defaultsFor(catalog, 'testnet4').bitcoin.network).toBe('testnet4');
    expect(defaultsFor(catalog, 'testnet4').bitcoin.milestone).toContain(':123613');
    expect(defaultsFor(catalog, 'regtest').bitcoin.milestone).toContain(':0');
    expect(defaultsFor(catalog, 'mainnet').bitcoin.network).toBe('mainnet');
  });

  it('answers every network, including one it has no file for', () => {
    expect(defaultsFor(catalog, 'signet')).toBe(defaultsFor(catalog, 'signet'));
    expect(defaultsFor(catalog, 'eternaltest')).toBe(defaultsFor(catalog, 'mainnet'));
  });
});

describe('diff against the selected network', () => {
  it('emits a value that equals the mainnet default but not this network', () => {
    // 8333 is mainnet's inbound port; testnet4 listens on 48333.
    const settings = withNetwork('testnet4', { inbound: { bind: ['0.0.0.0:8333'] } });

    expect(emitted(settings, 'testnet4')).toContain('inbound.bind');
  });

  it('stays silent on a value that matches this network', () => {
    const settings = withNetwork('testnet4', { inbound: { bind: ['0.0.0.0:48333'] } });

    expect(emitted(settings, 'testnet4')).not.toContain('inbound.bind');
  });

  it('writes the network even though its defaults produce it', () => {
    // Without the line bs runs mainnet against a testnet store.
    const settings = withNetwork('signet', {});

    expect(emitted(settings, 'signet')).toContain('bitcoin.network');
  });

  it('writes nothing for mainnet', () => {
    expect(emitted(withNetwork('mainnet', {}), 'mainnet')).toEqual([]);
  });
});
