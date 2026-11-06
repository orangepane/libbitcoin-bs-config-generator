import type { Preset, Settings } from './types';
import { mixDefaults } from './defaults';

import bitcoindBackend from '../presets/bitcoind-backend.json';
import explorerBackend from '../presets/explorer-backend.json';
import genesisValidation from '../presets/genesis-validation.json';
import heightArchive from '../presets/height-archive.json';
import localAdmin from '../presets/local-admin.json';
import lowBandwidth from '../presets/low-bandwidth.json';
import regtest from '../presets/regtest.json';
import signet from '../presets/signet.json';
import sparrowServer from '../presets/sparrow-server.json';
import testnet4 from '../presets/testnet4.json';
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
    id: 'height-archive',
    title: 'Height archive',
    rationale:
      'Keep a store without input scripts and witnesses up to block 840000, and stop downloading at that height.',
    config: heightArchive,
  },
  {
    id: 'genesis-validation',
    title: 'Full validation from genesis',
    rationale:
      'Set the milestone to the genesis block. Validates the whole chain; plan for the storage and time it costs.',
    config: genesisValidation,
  },
  {
    id: 'testnet4',
    title: 'Testnet4',
    rationale:
      'Use testnet4. Network-dependent defaults follow automatically.',
    config: testnet4,
  },
  {
    id: 'signet',
    title: 'Signet',
    rationale: 'Use signet. Network-dependent defaults follow automatically.',
    config: signet,
  },
  {
    id: 'regtest',
    title: 'Regtest',
    rationale: 'Use regtest. Network-dependent defaults follow automatically.',
    config: regtest,
  },
];

export function presetById (id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

/** A preset is a starting point: defaults overlaid with the preset's sparse config. */
export function applyPreset (defaults: Settings, preset: Preset): Settings {
  return mixDefaults(defaults, preset.config);
}
