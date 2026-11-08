#!/usr/bin/env node
// Build the v2 catalog from the seed at scripts/data/data.json.
//
// The seed comes from scripts/generate_data.py upstream and is never hand-edited
// here. This script adds the presentation and behaviour metadata only.
//
// Run: npm run catalog

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SEED = 'scripts/data/data.json';
const OUT = 'src/catalog.json';

const SERVICE_SECTIONS = new Set([
  'admin', 'native', 'bitcoind', 'bitcoind_zmq', 'btcd', 'electrum', 'sparrow', 'esplora',
]);

// Every key here is either needed by a preset or named by a warning rule.
// Anything else lives in All settings.
const ESSENTIAL = new Set([
  'bitcoin.network', 'bitcoin.milestone',
  'database.path',
  'node.limited_blocks', 'node.maximum_height', 'node.provide_filters', 'node.provide_privacy',
  'log.path', 'log.verbose',
  'network.threads',
  'peer.gossip_tor', 'peer.gossip_ipv4', 'peer.gossip_ipv6',
  'outbound.connections', 'outbound.current_connections', 'outbound.socks',
  'inbound.connections',
  'manual.peer',
]);

// Fixed at store creation: changing them later does not rewrite an existing store.
// The whole [bitcoin] and [forks] sections are captured (network, chain parameters,
// soft fork activations, milestone, top checkpoint, signet challenge), so they are
// flagged on the section rather than key by key.
const FIXED_SETTINGS = new Set([
  'database.interval_depth', 'node.limited_blocks', 'node.provide_filters',
  'node.silent_start_height',
]);

const FIXED_SECTIONS = new Set(['bitcoin', 'forks']);

// bs computes these bucket counts from the table's expected count and the
// installed memory. The shipped number is one machine's result.
const DERIVED = new Set([
  'table.header.buckets', 'table.tx.buckets', 'table.ins.buckets', 'table.outs.buckets',
  'table.pool.buckets', 'table.wtxid.buckets', 'table.strong.buckets',
]);

const SECRET_KEYS = new Set(['password', 'key_pass', 'key', 'credential']);

const KIND = {
  flag: 'boolean',
  number: 'integer',
  decimal: 'decimal',
  text: 'text',
  path: 'path',
  list: 'list',
  select: 'enum',
};

function sectionTier (name) {
  if (name.startsWith('table.')) return 'table';
  if (SERVICE_SECTIONS.has(name)) return 'service';
  if (name === 'forks') return 'advanced';
  return 'essential';
}

function settingTier (section, key, sectionTierName) {
  if (sectionTierName === 'table') return 'table';
  if (sectionTierName === 'service') {
    return key === 'bind' || key === 'connections' ? 'service' : 'advanced';
  }
  if (sectionTierName === 'advanced') return 'advanced';
  return ESSENTIAL.has(`${section}.${key}`) ? 'essential' : 'advanced';
}

function unitFor (key) {
  if (/_seconds$/.test(key)) return 'seconds';
  if (/_minutes$/.test(key)) return 'minutes';
  return undefined;
}

function parseEnumValues (values) {
  return values.map((raw) => {
    const match = /^(.*?) \[(.*)\]$/.exec(raw);
    if (!match) throw new Error(`Enum value is not "Label [value]": ${raw}`);
    return { label: match[1], value: match[2] };
  });
}

function splitDescription (description) {
  if (typeof description === 'string') return { help: description };
  const { value, ...perValue } = description;
  const first = Object.values(perValue)[0];
  return { help: typeof value === 'string' ? value : first, valueHelp: perValue };
}

function build () {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  const sections = {};

  for (const name of Object.keys(seed)) {
    if (name.startsWith('__')) continue;
    const raw = seed[name];
    const tier = sectionTier(name);
    const settings = {};

    for (const key of Object.keys(raw)) {
      if (key === 'section' || key === 'description' || key === 'advanced') continue;
      const item = raw[key];
      const kind = KIND[item.control ?? 'text'];
      if (!kind) throw new Error(`Unknown control "${item.control}" at ${name}.${key}`);
      const { help, valueHelp } = splitDescription(item.description);

      const setting = {
        key,
        label: item.name,
        help,
        tier: settingTier(name, key, tier),
        kind,
        default: item.default,
        emit: 'whenChanged',
      };
      if (valueHelp) setting.valueHelp = valueHelp;
      if (item.min !== undefined) setting.min = item.min;
      if (item.max !== undefined) setting.max = item.max;
      if (item.values) setting.values = parseEnumValues(item.values);
      const unit = unitFor(key);
      if (unit) setting.unit = unit;
      if (SECRET_KEYS.has(key)) setting.secret = true;
      if (DERIVED.has(`${name}.${key}`)) setting.derived = true;
      if (FIXED_SETTINGS.has(`${name}.${key}`) || tier === 'table') setting.fixedAtCreation = true;

      settings[key] = setting;
    }

    const section = {
      key: name,
      title: raw.section,
      summary: raw.description,
      tier,
      settings,
    };
    if (tier === 'service') {
      section.service = true;
      section.enableKey = 'bind';
    }
    if (tier === 'table' || FIXED_SECTIONS.has(name)) section.fixedAtCreation = true;

    sections[name] = section;
  }

  const settingCount = Object.values(sections)
    .reduce((total, section) => total + Object.keys(section.settings).length, 0);

  const payload = {
    meta: {
      project: seed.__meta.project,
      version: seed.__meta.version,
      referenceUrl: seed.__meta.source,
      snapshot: seed.__meta.snapshot,
      defaultsScope: 'network',
      generatedBy: 'scripts/build-catalog.mjs from scripts/data/data.json',
      seedSha256: createHash('sha256').update(readFileSync(SEED)).digest('hex'),
      sectionCount: Object.keys(sections).length,
      settingCount,
    },
    sections,
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`catalog: ${payload.meta.sectionCount} sections, ${settingCount} settings -> ${OUT}`);
}

build();
