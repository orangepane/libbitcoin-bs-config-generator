import type { Catalog, SectionDef, SettingDef } from '../catalog';
import { valuesEqual } from './defaults';
import type { ConfigValue, Settings, Warning } from './types';

// Derived lint rules. Pure: nothing here writes settings or blocks a download.
//
// The one module allowed to name settings directly: a rule is a fact about
// `bs` that the generated catalog cannot carry.

const WALLET_SERVICES = ['electrum', 'sparrow', 'esplora'];
const FILTER_TABLES = ['table.filter_bk', 'table.filter_tx'];
/** A login the service checks. CurveZMQ authenticates with a key pair instead. */
const CREDENTIAL_KEYS = ['credential', 'password'];

/**
 * The two fields that make a service's `safe` addresses work. `key_pass` and
 * `cert_auth` modify these and secure nothing on their own.
 */
const TLS_PAIR_KEYS = ['cert_path', 'key_path'];
const CURVE_PAIR_KEYS = ['cert', 'key'];

function valueAt (settings: Settings, section: string, key: string): ConfigValue | undefined {
  const values: Record<string, ConfigValue> | undefined = settings[section];
  if (values === undefined) return undefined;
  const value: ConfigValue | undefined = values[key];
  return value;
}

function isChanged (settings: Settings, defaults: Settings, section: string, key: string): boolean {
  const current = valueAt(settings, section, key);
  const baseline = valueAt(defaults, section, key);
  if (current === undefined) return false;
  return !valuesEqual(current, baseline);
}

function isUnset (value: ConfigValue | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function isNumber (value: ConfigValue | undefined, expected: number): boolean {
  return typeof value === 'number' && value === expected;
}

/** A bind value, as a list of addresses, whichever shape the state holds. */
function bindList (value: ConfigValue | undefined): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.filter((entry) => entry.trim() !== '');
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()];
  return [];
}

/** Host part of `address:port`, with bracketed and bare IPv6 handled. */
function hostOf (bind: string): string {
  const trimmed = bind.trim();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return (end === -1 ? trimmed.slice(1) : trimmed.slice(1, end)).toLowerCase();
  }
  const colons = trimmed.split(':').length - 1;
  // An unbracketed IPv6 address has no port to strip.
  if (colons > 1) return trimmed.toLowerCase();
  const last = trimmed.lastIndexOf(':');
  return (last === -1 ? trimmed : trimmed.slice(0, last)).toLowerCase();
}

/** Loopback, including `localhost` and IPv4-mapped IPv6. An empty host is not. */
function isLoopback (bind: string): boolean {
  const host = hostOf(bind);
  if (host === '') return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('::ffff:')) return isLoopback(host.slice('::ffff:'.length));
  return /^127\./.test(host);
}

function serviceBinds (settings: Settings, section: SectionDef): string[] {
  const enableKey = section.enableKey ?? 'bind';
  return bindList(valueAt(settings, section.key, enableKey));
}

function settingsNamed (section: SectionDef, keys: readonly string[]): SettingDef[] {
  return Object.values(section.settings).filter((setting) => keys.includes(setting.key));
}

function renderValue (value: ConfigValue): string {
  if (Array.isArray(value)) return value.length === 0 ? 'unset' : value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value === '' ? 'empty' : value;
  return String(value);
}

/** "a", "a and b", "a, b and c". */
function joinAnd (items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function quantify (items: string[], singular: string, plural: string): string {
  return `${joinAnd(items)} ${items.length === 1 ? singular : plural}`;
}

function interfaceWithoutCredentials (settings: Settings, catalog: Catalog): Warning[] {
  const warnings: Warning[] = [];

  for (const section of Object.values(catalog.sections)) {
    if (section.service !== true) continue;
    const binds = serviceBinds(settings, section);
    if (binds.length === 0) continue;

    const exposed = binds.filter((bind) => !isLoopback(bind));
    if (exposed.length === 0) continue;

    const key = section.enableKey ?? 'bind';
    const addresses = exposed.join(', ');
    const pair = settingsNamed(section, section.key === 'bitcoind_zmq' ? CURVE_PAIR_KEYS : TLS_PAIR_KEYS);
    const secure = pair.length === 2 &&
      pair.every((setting) => !isUnset(valueAt(settings, section.key, setting.key)));

    if (secure) continue;

    const credentials = settingsNamed(section, CREDENTIAL_KEYS);
    const credentiated = credentials.some(
      (setting) => !isUnset(valueAt(settings, section.key, setting.key)),
    );

    if (credentiated) {
      warnings.push({
        id: 'interface-credential-without-tls',
        severity: 'notice',
        section: section.key,
        key,
        message:
          `${section.key}.${key} listens on ${addresses} without TLS, so the credential travels in the clear. ` +
          `Set ${section.key}.cert_path and ${section.key}.key_path to encrypt it.`,
      });
      continue;
    }

    const pairNames = pair.map((setting) => `${section.key}.${setting.key}`);
    const credentialNames = credentials.map((setting) => `${section.key}.${setting.key}`);
    warnings.push({
      id: 'interface-without-credentials',
      severity: 'warning',
      section: section.key,
      key,
      message:
        `${section.key}.${key} listens on ${addresses}, which other machines can reach, and nothing authenticates the clients. ` +
        `Set ${quantify(pairNames, 'both', 'both')} for TLS, set ${quantify(credentialNames, 'a credential', 'a credential')}, ` +
        `or bind ${section.key} to 127.0.0.1.`,
    });
  }

  return warnings;
}

function milestoneWithMaximumHeight (settings: Settings, defaults: Settings): Warning[] {
  if (!isChanged(settings, defaults, 'bitcoin', 'milestone')) return [];
  if (!isChanged(settings, defaults, 'node', 'maximum_height')) return [];

  return [{
    id: 'milestone-with-maximum-height',
    severity: 'warning',
    section: 'node',
    key: 'maximum_height',
    message:
      'bitcoin.milestone and node.maximum_height are both set: node.maximum_height stops the download at its height, ' +
      'and bs verifies identity from the milestone block upward. ' +
      'If the milestone block is above node.maximum_height, the node never reaches it.',
  }];
}

function filtersWithoutBuckets (settings: Settings): Warning[] {
  if (valueAt(settings, 'node', 'provide_filters') !== true) return [];

  const empty = FILTER_TABLES.filter((section) => isNumber(valueAt(settings, section, 'buckets'), 0));
  if (empty.length === 0) return [];

  const names = empty.map((section) => `${section}.buckets`);
  return [{
    id: 'filters-without-buckets',
    severity: 'warning',
    section: empty[0],
    key: 'buckets',
    message:
      `node.provide_filters is on, but ${quantify(names, 'is', 'are')} 0, ` +
      'so clients that request filters receive nothing. ' +
      'Set the filter bucket counts before the store is created.',
  }];
}

function addressIndexDisabled (settings: Settings, catalog: Catalog): Warning[] {
  if (!isNumber(valueAt(settings, 'table.outs', 'buckets'), 0)) return [];

  const enabled = WALLET_SERVICES.filter((key) => {
    const section = catalog.sections[key];
    return section !== undefined && serviceBinds(settings, section).length > 0;
  });
  if (enabled.length === 0) return [];

  const binds = enabled.map((key) => `${key}.bind`);
  return [{
    id: 'address-index-disabled',
    severity: 'danger',
    section: 'table.outs',
    key: 'buckets',
    message:
      `table.outs.buckets is 0, which disables the address index, while ${quantify(binds, 'is', 'are')} enabled, ` +
      'so wallet history queries return nothing. ' +
      `Set table.outs.buckets before the store is created, or disable ${joinAnd(enabled)}.`,
  }];
}

function fixedAtCreation (
  settings: Settings,
  defaults: Settings,
  catalog: Catalog,
): Warning[] {
  const warnings: Warning[] = [];

  for (const section of Object.values(catalog.sections)) {
    // Table sections are one store blueprint in the UI, with their own banner.
    if (section.tier === 'table') continue;
    for (const setting of Object.values(section.settings)) {
      const fixed = setting.fixedAtCreation === true || section.fixedAtCreation === true;
      if (!fixed) continue;
      if (!isChanged(settings, defaults, section.key, setting.key)) continue;

      const value = valueAt(settings, section.key, setting.key);
      warnings.push({
        id: 'fixed-at-creation',
        severity: 'notice',
        section: section.key,
        key: setting.key,
        message:
          `${section.key}.${setting.key} is set to ${value === undefined ? 'a new value' : renderValue(value)}, ` +
          'and it applies when the store is created. ' +
          'Changing it later has no effect on an existing store; recreate the store to apply it.',
      });
    }
  }

  return warnings;
}

/** Values outside the catalog bounds. The row flags them too; the file says so. */
function outOfRange (settings: Settings, catalog: Catalog): Warning[] {
  const warnings: Warning[] = [];

  for (const section of Object.values(catalog.sections)) {
    for (const setting of Object.values(section.settings)) {
      if (setting.kind !== 'integer' && setting.kind !== 'decimal') continue;

      const value = valueAt(settings, section.key, setting.key);
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      const unit = setting.unit ? ` ${setting.unit}` : '';
      const id = 'value-out-of-range';

      if (setting.min !== undefined && value < setting.min) {
        warnings.push({
          id,
          severity: 'warning',
          section: section.key,
          key: setting.key,
          message:
            `${section.key}.${setting.key} is ${value}${unit}, below its minimum of ${setting.min}${unit}. ` +
            `bs may reject the file. Set it to at least ${setting.min}.`,
        });
      } else if (setting.max !== undefined && value > setting.max) {
        warnings.push({
          id,
          severity: 'warning',
          section: section.key,
          key: setting.key,
          message:
            `${section.key}.${setting.key} is ${value}${unit}, above its maximum of ${setting.max}${unit}. ` +
            `bs may reject the file. Set it to at most ${setting.max}.`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Every warning the current settings earn. Rules run in a fixed order, so the
 * list is stable for a given state. Neither input is written to.
 */
/**
 * The checks worth naming before a file is saved: everything except notes. A note
 * describes the store's lifecycle, so it stays in the tab.
 */
export function alerts (warnings: readonly Warning[]): Warning[] {
  return warnings.filter((warning) => warning.severity !== 'notice');
}

export function evaluateWarnings (
  settings: Settings,
  defaults: Settings,
  catalog: Catalog,
): Warning[] {
  return [
    ...interfaceWithoutCredentials(settings, catalog),
    ...milestoneWithMaximumHeight(settings, defaults),
    ...filtersWithoutBuckets(settings),
    ...addressIndexDisabled(settings, catalog),
    ...outOfRange(settings, catalog),
    ...fixedAtCreation(settings, defaults, catalog),
  ];
}
