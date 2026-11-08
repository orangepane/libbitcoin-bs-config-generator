import regtestJson from '../../scripts/data/networks/regtest.json';
import signetJson from '../../scripts/data/networks/signet.json';
import testnet3Json from '../../scripts/data/networks/testnet3.json';
import testnet4Json from '../../scripts/data/networks/testnet4.json';
import type { Catalog } from '../catalog';
import { getDefaults, mixDefaults } from './defaults';
import type { ConfigValue, Settings, SparseSettings } from './types';

// bs applies a network's defaults before it applies the file, so the tree this
// module returns is the baseline the diff, the presets and the warnings use.
// Mainnet needs no file: the catalog carries its values.

type NetworkFile = SparseSettings & { __meta?: { network?: string } };

/** The overrides only: the provenance block is not a setting. */
function overridesOf (file: NetworkFile): SparseSettings {
  const rest: Record<string, unknown> = { ...file };
  delete rest.__meta;
  return rest as SparseSettings;
}

const OVERRIDES: Record<string, SparseSettings> = {
  testnet3: overridesOf(testnet3Json as NetworkFile),
  testnet4: overridesOf(testnet4Json as NetworkFile),
  signet: overridesOf(signetJson as NetworkFile),
  regtest: overridesOf(regtestJson as NetworkFile),
};

/** The networks the catalog carries defaults for, mainnet first. */
export const NETWORKS = ['mainnet', 'testnet3', 'testnet4', 'signet', 'regtest'];

const cache = new Map<string, Settings>();

/** The defaults in force on one network, built once and reused. */
export function defaultsFor (catalog: Catalog, network: string): Settings {
  const key = OVERRIDES[network] === undefined ? 'mainnet' : network;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const base = getDefaults(catalog);
  const defaults = key === 'mainnet'
    ? base
    : mixDefaults(base, asCatalogKinds(catalog, OVERRIDES[key]));
  cache.set(key, defaults);
  return defaults;
}

/**
 * A network file writes one `bind = a` line per address, so a single address
 * arrives as a string. The catalog calls those settings lists.
 */
function asCatalogKinds (catalog: Catalog, sparse: SparseSettings): SparseSettings {
  const shaped: SparseSettings = {};
  for (const [section, values] of Object.entries(sparse)) {
    const settings = catalog.sections[section]?.settings ?? {};
    const kept: Record<string, ConfigValue> = {};
    for (const [key, value] of Object.entries(values)) {
      const kind = settings[key]?.kind;
      kept[key] = kind === 'list' && typeof value === 'string' ? [value] : value;
    }
    shaped[section] = kept;
  }
  return shaped;
}
