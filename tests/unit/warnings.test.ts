// Warning rules: each one is a fact about running `bs`, so each one gets a
// fixture that triggers it and a fixture that must stay quiet. Warnings are
// derived, never written back: the settings are read and never mutated, and a
// warning never blocks a download.
import { describe, expect, it } from 'vitest';

import catalogJson from '../../src/catalog.json';
import { validateCatalog } from '../../src/catalog.schema';
import { getDefaults, mixDefaults } from '../../src/config/defaults';
import { alerts, evaluateWarnings } from '../../src/config/warnings';
import type { Catalog } from '../../src/catalog.schema';
import type { ConfigValue, Settings, Warning } from '../../src/config/types';

const catalog: Catalog = validateCatalog(catalogJson);
const defaults = getDefaults(catalog);

/** Mainnet default milestone: the checkpoint a non-mainnet store must not use. */
const MAINNET_MILESTONE = String(defaults.bitcoin.milestone);
/** The genesis checkpoint, a real value that is not the mainnet default. */
const GENESIS_MILESTONE =
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:0';

const KNOWN_IDS = [
  'interface-without-credentials',
  'milestone-network-mismatch',
  'milestone-with-maximum-height',
  'filters-without-buckets',
  'address-index-disabled',
  'fixed-at-creation',
];

function withChanges (changes: Record<string, Record<string, ConfigValue>>): Settings {
  return mixDefaults(defaults, changes);
}

function copy<T> (value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ids (warnings: Warning[]): string[] {
  return warnings.map((warning) => warning.id);
}

function only (warnings: Warning[], id: string): Warning {
  const matches = warnings.filter((warning) => warning.id === id);
  expect(matches, `${id} fires once`).toHaveLength(1);
  return matches[0];
}

describe('clean state', () => {
  it('emits nothing for the untouched defaults', () => {
    expect(evaluateWarnings(defaults, defaults, catalog)).toEqual([]);
  });

  it('emits nothing for a state that is explicitly the defaults', () => {
    expect(evaluateWarnings(mixDefaults(defaults, {}), defaults, catalog)).toEqual([]);
  });
});

describe('interface-without-credentials', () => {
  it('warns when a service is bound to every interface with no TLS or credentials', () => {
    const settings = withChanges({ electrum: { bind: ['0.0.0.0:50001'] } });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'interface-without-credentials');

    expect(warning.severity).toBe('warning');
    expect(warning.section).toBe('electrum');
    expect(warning.key).toBe('bind');
    expect(warning.message).toContain('electrum.bind');
    expect(warning.message).toContain('0.0.0.0:50001');
    expect(warning.message).toContain('electrum.key_path');
    expect(warning.message).toContain('127.0.0.1');
  });

  it('stays quiet for a loopback bind', () => {
    for (const bind of ['127.0.0.1:50001', '127.5.5.5:50001', 'localhost:50001', '[::1]:50001', '::1']) {
      const settings = withChanges({ esplora: { bind: [bind] } });
      expect(evaluateWarnings(settings, defaults, catalog), bind).toEqual([]);
    }
  });

  it('warns for a wildcard, a private address and a missing host', () => {
    for (const bind of ['0.0.0.0:50001', '[::]:50001', ':50001', '192.168.1.10:50001', 'bs.example.com:50001']) {
      const settings = withChanges({ esplora: { bind: [bind] } });
      const fired = evaluateWarnings(settings, defaults, catalog).map((warning) => warning.id);
      expect(fired, bind).toContain('interface-without-credentials');
    }
  });

  it('stays quiet when the TLS keypair is set', () => {
    const settings = withChanges({
      esplora: {
        bind: ['0.0.0.0:8780'],
        key_path: '/etc/bs/esplora.key',
        cert_path: '/etc/bs/esplora.crt',
      },
    });

    expect(evaluateWarnings(settings, defaults, catalog)).toEqual([]);
  });

  it('keeps warning until both halves of the keypair are set', () => {
    const incomplete: Record<string, ConfigValue>[] = [
      { cert_path: '/etc/bs/esplora.crt' },
      { key_path: '/etc/bs/esplora.key' },
      { cert_auth: '/etc/bs/clients' },
      { key_pass: 'secret' },
    ];

    for (const extra of incomplete) {
      const settings = withChanges({ esplora: { bind: ['0.0.0.0:8780'], ...extra } });
      const fired = evaluateWarnings(settings, defaults, catalog).map((warning) => warning.id);

      expect(fired, Object.keys(extra)[0]).toContain('interface-without-credentials');
    }
  });

  it('notices a credential on a clear connection instead of warning', () => {
    const settings = withChanges({
      esplora: { bind: ['0.0.0.0:8780'], credential: ['user:password'] },
    });
    const warnings = evaluateWarnings(settings, defaults, catalog);
    const notice = only(warnings, 'interface-credential-without-tls');

    expect(notice.severity).toBe('notice');
    expect(notice.message).toContain('travels in the clear');
    expect(warnings.map((warning) => warning.id)).not.toContain('interface-without-credentials');
    expect(alerts(warnings)).toEqual([]);
  });

  it('stays quiet with a keypair and a credential together', () => {
    const settings = withChanges({
      esplora: {
        bind: ['0.0.0.0:8780'],
        credential: ['user:password'],
        cert_path: '/etc/bs/esplora.crt',
        key_path: '/etc/bs/esplora.key',
      },
    });

    expect(evaluateWarnings(settings, defaults, catalog)).toEqual([]);
  });

  it('accepts the CurveZMQ keypair for bitcoind_zmq', () => {
    const base = { bind: ['0.0.0.0:8380'] };
    const clear = withChanges({ bitcoind_zmq: base });
    const secured = withChanges({
      bitcoind_zmq: { ...base, key: 'server-key', cert: ['client-key'] },
    });

    expect(ids(evaluateWarnings(clear, defaults, catalog))).toContain('interface-without-credentials');
    expect(evaluateWarnings(secured, defaults, catalog)).toEqual([]);
  });

  it('stays quiet when a service is off', () => {
    const settings = withChanges({ admin: { bind: [] } });

    expect(evaluateWarnings(settings, defaults, catalog)).toEqual([]);
  });

  it('does not treat a peer interface as a service', () => {
    // inbound ships bound to 0.0.0.0:8333 and authenticates with CurveZMQ, not TLS.
    const settings = withChanges({ inbound: { connections: 32 } });

    expect(evaluateWarnings(settings, defaults, catalog)).toEqual([]);
  });
});

describe('milestone-network-mismatch', () => {
  it('rates a mismatched milestone as a danger, not advice', () => {
    const settings = withChanges({ bitcoin: { network: 'testnet3' } });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'milestone-network-mismatch');

    expect(warning.severity).toBe('danger');
    expect(warning.message).toContain('bitcoin.network');
    expect(warning.message).toContain('bitcoin.milestone');
    expect(warning.message).toContain('testnet3');
    expect(warning.message).not.toContain(MAINNET_MILESTONE);
  });

  it('stays quiet when the milestone is set for the new network', () => {
    const settings = withChanges({
      bitcoin: { network: 'testnet4', milestone: GENESIS_MILESTONE },
    });
    const fired = ids(evaluateWarnings(settings, defaults, catalog));

    expect(fired).not.toContain('milestone-network-mismatch');
  });

  it('notices a milestone that changes while the network stays mainnet', () => {
    const settings = withChanges({ bitcoin: { milestone: GENESIS_MILESTONE } });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'milestone-network-mismatch');

    expect(warning.severity).toBe('notice');
    expect(warning.message).toContain('bitcoin.network');
    expect(warning.message).toContain('bitcoin.milestone');
  });
});

describe('milestone-with-maximum-height', () => {
  it('warns when both the milestone and the maximum height are set', () => {
    const settings = withChanges({
      bitcoin: { milestone: GENESIS_MILESTONE },
      node: { maximum_height: 840000 },
    });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'milestone-with-maximum-height');

    expect(warning.message).toContain('bitcoin.milestone');
    expect(warning.message).toContain('node.maximum_height');
    expect(warning.message).toContain('stops the download');
  });

  it('stays quiet when only the milestone is set', () => {
    const settings = withChanges({ bitcoin: { milestone: GENESIS_MILESTONE } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('milestone-with-maximum-height');
  });

  it('stays quiet when only the maximum height is set', () => {
    const settings = withChanges({ node: { maximum_height: 840000 } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('milestone-with-maximum-height');
  });
});

describe('filters-without-buckets', () => {
  it('warns when provide_filters is on and both filter tables are empty', () => {
    const settings = withChanges({ node: { provide_filters: true } });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'filters-without-buckets');

    expect(warning.message).toContain('node.provide_filters');
    expect(warning.message).toContain('table.filter_bk.buckets');
    expect(warning.message).toContain('table.filter_tx.buckets');
    expect(warning.message).toContain('receive nothing');
  });

  it('names only the table that is still empty', () => {
    const settings = withChanges({
      node: { provide_filters: true },
      'table.filter_bk': { buckets: 140000 },
    });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'filters-without-buckets');

    expect(warning.message).toContain('table.filter_tx.buckets');
    expect(warning.message).not.toContain('table.filter_bk.buckets');
  });

  it('stays quiet when both filter tables have buckets', () => {
    const settings = withChanges({
      node: { provide_filters: true },
      'table.filter_bk': { buckets: 140000 },
      'table.filter_tx': { buckets: 140000 },
    });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('filters-without-buckets');
  });

  it('stays quiet when filters are off', () => {
    const settings = withChanges({ 'table.filter_bk': { buckets: 0 } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('filters-without-buckets');
  });
});

describe('address-index-disabled', () => {
  it('warns when the address index is off and a wallet service is on', () => {
    const settings = withChanges({
      'table.outs': { buckets: 0 },
      electrum: { bind: ['127.0.0.1:50001'] },
    });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'address-index-disabled');

    expect(warning.section).toBe('table.outs');
    expect(warning.key).toBe('buckets');
    expect(warning.message).toContain('table.outs.buckets');
    expect(warning.message).toContain('electrum.bind');
    expect(warning.message).toContain('wallet history');
  });

  it('names every wallet service that is on', () => {
    const settings = withChanges({
      'table.outs': { buckets: 0 },
      electrum: { bind: ['127.0.0.1:50001'] },
      sparrow: { bind: ['127.0.0.1:50002'] },
      esplora: { bind: ['127.0.0.1:8780'] },
    });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'address-index-disabled');

    expect(warning.message).toContain('electrum.bind');
    expect(warning.message).toContain('sparrow.bind');
    expect(warning.message).toContain('esplora.bind');
  });

  it('stays quiet when the address index is off and no wallet service is on', () => {
    const settings = withChanges({ 'table.outs': { buckets: 0 } });

    expect(evaluateWarnings(settings, defaults, catalog)).toEqual([]);
  });

  it('stays quiet when the address index is on', () => {
    const settings = withChanges({ electrum: { bind: ['127.0.0.1:50001'] } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('address-index-disabled');
  });
});

describe('fixed-at-creation', () => {
  it('notices a changed fixed setting outside a table section', () => {
    const settings = withChanges({ database: { interval_depth: 7 } });
    const warning = only(evaluateWarnings(settings, defaults, catalog), 'fixed-at-creation');

    expect(warning.severity).toBe('notice');
    expect(warning.section).toBe('database');
    expect(warning.key).toBe('interval_depth');
    expect(warning.message).toContain('database.interval_depth');
    expect(warning.message).toContain('store is created');
  });

  it('treats maximum_height as a download limit, not store state', () => {
    const settings = withChanges({ node: { maximum_height: 840000 } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('fixed-at-creation');
  });

  it('notices each changed fixed setting, in catalog order', () => {
    const settings = withChanges({
      bitcoin: { milestone: GENESIS_MILESTONE },
      database: { interval_depth: 7 },
      node: { silent_start_height: 1, limited_blocks: true },
    });
    const notices = evaluateWarnings(settings, defaults, catalog)
      .filter((warning) => warning.id === 'fixed-at-creation')
      .map((warning) => `${warning.section}.${warning.key}`);

    // Catalog order: [database] precedes [bitcoin] in the reference.
    expect(notices).toEqual([
      'database.interval_depth',
      'bitcoin.milestone',
      'node.limited_blocks',
      'node.silent_start_height',
    ]);
  });

  it('leaves table settings to the store blueprint', () => {
    const settings = withChanges({ 'table.filter_bk': { buckets: 140000 } });

    expect(ids(evaluateWarnings(settings, defaults, catalog))).not.toContain('fixed-at-creation');
  });

  it('stays quiet at the defaults', () => {
    expect(ids(evaluateWarnings(defaults, defaults, catalog))).not.toContain('fixed-at-creation');
  });
});

describe('warning shape and purity', () => {
  const fixture = (): Settings => withChanges({
    bitcoin: { network: 'testnet3' },
    electrum: { bind: ['0.0.0.0:50001'] },
    node: { provide_filters: true, maximum_height: 800000 },
    'table.outs': { buckets: 0 },
  });

  it('emits every rule for a state that earns them', () => {
    const fired = ids(evaluateWarnings(fixture(), defaults, catalog));

    expect(fired).toContain('interface-without-credentials');
    expect(fired).toContain('milestone-network-mismatch');
    expect(fired).toContain('filters-without-buckets');
    expect(fired).toContain('address-index-disabled');
    expect(fired).toContain('fixed-at-creation');

    // The milestone rules are exclusive: an unchanged milestone is a network
    // mismatch, a changed one is a maximum-height comparison.
    const bothMilestones = withChanges({
      bitcoin: { milestone: GENESIS_MILESTONE },
      node: { maximum_height: 800000 },
    });
    expect(ids(evaluateWarnings(bothMilestones, defaults, catalog))).toContain('milestone-with-maximum-height');
  });

  it('never mutates the settings or the defaults', () => {
    const settings = fixture();
    const settingsBefore = copy(settings);
    const defaultsBefore = copy(defaults);

    evaluateWarnings(settings, defaults, catalog);

    expect(settings).toEqual(settingsBefore);
    expect(defaults).toEqual(defaultsBefore);
  });

  it('uses stable ids, valid locations and operator register', () => {
    const warnings = evaluateWarnings(fixture(), defaults, catalog);
    expect(warnings.length).toBeGreaterThan(0);

    for (const warning of warnings) {
      expect(KNOWN_IDS, warning.id).toContain(warning.id);
      expect(warning.id).not.toBe('disabled-by-dependency');
      expect(['notice', 'warning', 'danger']).toContain(warning.severity);
      expect(warning.message.trim().endsWith('.'), warning.message).toBe(true);
      expect(warning.message.length, warning.message).toBeGreaterThan(40);
      expect(warning.message, warning.message).not.toContain('!');
      expect(warning.message, warning.message).not.toContain('Oops');
      expect(warning.message, warning.message).not.toContain('Please');

      expect(warning.section, warning.id).toBeDefined();
      expect(warning.key, warning.id).toBeDefined();
      const section = warning.section === undefined ? undefined : catalog.sections[warning.section];
      expect(section, `${warning.id} section ${warning.section}`).toBeDefined();
      if (section !== undefined && warning.key !== undefined) {
        expect(section.settings[warning.key], `${warning.id} key ${warning.key}`).toBeDefined();
      }
    }
  });

  it('names two settings in the messages that compare them', () => {
    const milestone = evaluateWarnings(
      withChanges({ bitcoin: { milestone: GENESIS_MILESTONE }, node: { maximum_height: 840000 } }),
      defaults,
      catalog,
    ).find((warning) => warning.id === 'milestone-with-maximum-height');
    const index = evaluateWarnings(fixture(), defaults, catalog)
      .find((warning) => warning.id === 'address-index-disabled');

    expect(milestone?.message).toContain('bitcoin.milestone');
    expect(milestone?.message).toContain('node.maximum_height');
    expect(index?.message).toContain('table.outs.buckets');
  });
});

describe('alerts', () => {
  it('names warnings and dangers, and leaves notes to the tab', () => {
    const notes = evaluateWarnings(
      withChanges({ bitcoin: { milestone: GENESIS_MILESTONE } }),
      defaults,
      catalog,
    );
    expect(notes.every((warning) => warning.severity !== 'notice')).toBe(false);
    expect(alerts(notes)).toEqual([]);

    const risk = evaluateWarnings(withChanges({ bitcoin: { network: 'testnet3' } }), defaults, catalog);
    expect(alerts(risk).map((warning) => warning.id)).toContain('milestone-network-mismatch');
  });
});
