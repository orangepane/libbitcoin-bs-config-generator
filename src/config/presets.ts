import type { Preset, Settings } from './types';
import type { Catalog } from '../catalog';
import { networkLocation } from '../catalog';
import { mixDefaults } from './defaults';

import bitcoindBackend from '../presets/bitcoind-backend.json';
import explorerBackend from '../presets/explorer-backend.json';
import genesisValidation from '../presets/genesis-validation.json';
import localAdmin from '../presets/local-admin.json';
import lowBandwidth from '../presets/low-bandwidth.json';
import sparrowServer from '../presets/sparrow-server.json';
import torPrivacy from '../presets/tor-privacy.json';
import walletServer from '../presets/wallet-server.json';

export const PRESETS: Preset[] = [
  {
    id: 'wallet-server',
    title: 'Wallet server',
    rationale:
      'Serve Electrum wallets on port 8580. The bind is all interfaces, so allow the port before exposing it.',
    config: walletServer,
  },
  {
    id: 'sparrow-server',
    title: 'Sparrow server',
    rationale:
      'Serve Sparrow wallets on port 8680, including silent payment scans.',
    config: sparrowServer,
  },
  {
    id: 'explorer-backend',
    title: 'Explorer backend',
    rationale:
      'Serve Esplora on port 8780 and the native explorer on 8180, both on all interfaces.',
    config: explorerBackend,
  },
  {
    id: 'bitcoind-backend',
    title: 'bitcoind backend',
    rationale:
      'Publish blocks and transactions to bitcoind on port 8280 and notifications on 8380, loopback only.',
    config: bitcoindBackend,
  },
  {
    id: 'local-admin',
    title: 'Local admin',
    rationale:
      'Admin and native interfaces on loopback only, ten clients each.',
    config: localAdmin,
  },
  {
    id: 'tor-privacy',
    title: 'Tor privacy',
    rationale:
      'Route outbound connections through a local Tor SOCKS proxy and gossip only over Tor.',
    config: torPrivacy,
  },
  {
    id: 'low-bandwidth',
    title: 'Low bandwidth',
    rationale:
      'Cap the send rate and hold eight peers in each direction. For metered or slow links.',
    config: lowBandwidth,
  },
  {
    id: 'genesis-validation',
    title: 'Full validation from genesis',
    rationale:
      'Set the milestone to the genesis block. Validates the whole chain; plan for the storage and time it costs.',
    config: genesisValidation,
    // The genesis hash is mainnet's. On any other chain the node would validate
    // against a block that is not in its chain.
    networks: ['mainnet'],
  },
];

export function presetById (id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

/**
 * A preset is a starting point: defaults overlaid with the preset's sparse config.
 *
 * The network is a frame around the file, not part of what a preset chooses, so
 * a preset that does not name the network keeps the one already selected. Without
 * this, applying a preset on testnet4 silently rebuilt the draft from mainnet
 * defaults and threw the network choice away.
 */
export function applyPreset (
  defaults: Settings,
  preset: Preset,
  current?: Settings,
  catalog?: Catalog,
): Settings {
  const applied = mixDefaults(defaults, preset.config);

  const location = catalog ? networkLocation(catalog) : null;
  if (!current || !location) return applied;

  // A preset that names the network wins: it is switching, not adapting.
  if (preset.config[location.section]?.[location.key] !== undefined) return applied;

  const chosen = current[location.section]?.[location.key];
  const fallback = defaults[location.section]?.[location.key];
  if (chosen === undefined || chosen === fallback) return applied;

  return mixDefaults(applied, { [location.section]: { [location.key]: chosen } });
}
