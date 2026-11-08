# Changelog

Notable changes to the bs.cfg generator. One entry per tag, newest first; versions are the git
tags. An entry is written at merge time from the ticked checklist, so it describes work that
shipped. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Nothing is published to
a registry, so the number exists for the deploy record and for references such as "as of v0.2.0".

## 0.2.0 — 2026-11-08

### Fixed

- Defaults follow the selected network. `bs` applies a network's defaults before it reads the
  file, so a value equal to mainnet's default was dropped on another chain and `bs` ran with the
  network's value. The file now always names the network, since a file without it runs mainnet
  against a testnet store.
- `database.path` is the base of a network-named store directory: it defaults to the working
  directory and the store lands in `./mainnet`, `./testnet4` and so on.
- Table bucket counts are presented as derived from each table's `expected` count and the
  installed memory, which is how `bs` computes them, rather than as one machine's numbers.
- The exposure warning requires both halves of a service's keypair, or a credential. A credential
  on a clear connection is a notice that says the password travels in the clear.
- The fixed-at-creation set matches the documentation: the `[bitcoin]` and `[forks]` sections,
  `database.interval_depth`, `node.limited_blocks`, `node.provide_filters` and
  `node.silent_start_height`. `node.maximum_height` limits a download at any time and is no longer
  reported as store state.
- The store is created by `bs --config` or `bs --make`. The old hint taught `bs -n <net>`, which
  selects a network and, with a configured path, creates a different store than the file names.
- Tor preset: loopback inbound, Tor-only gossip, `manual.socks` guidance, and `provide_privacy`
  removed because it is BIP324 encryption rather than Tor.
- Wallet, Sparrow and explorer presets listen on loopback with the network's default port.
- The milestone is described as the block from which `bs` verifies identity, with full validation
  above it. The milestone/network mismatch warning is gone: it fired exactly when `bs` did the
  right thing.
- Version strings (`peer.user_agent`, `electrum.server_name`, `sparrow.server_name`) say that an
  empty value uses the build's own.

### Added

- `credential` for admin, native, electrum, sparrow and esplora; `cert_auth` and `key_pass` for
  electrum and sparrow; `bitcoin.signet_challenge`; `forks.signet`; `log.objects`.
- Per-network defaults for testnet3, testnet4, signet and regtest, with the page and commit each
  value came from.
- `CHANGELOG.md` and annotated tags.

### Removed

- `node.announcement_cache`, which no longer exists in the settings parser.
- The `milestone-network-mismatch` warning.
- `provide_privacy` from the Tor preset.

### Notes

- Setting names, help strings and defaults verified against `libbitcoin-server` at `c99e607` and
  the site's configuration pages at `3575750`. The site's reference dump omits `credential` for
  five services and prints stale version strings, so it is not a source for either.
- 462 settings across 43 sections.

## 0.1.0 — 2026-11-07

### Added

- Static, client-side generator for libbitcoin server (`bs`) v4 configuration files, covering
  43 sections and 451 settings.
- Diff-only output: only values differing from their mainnet defaults are written, each under
  its `[section]` header and preceded by its catalog description as a `#` comment.
- Eight intent presets: wallet server, Sparrow server, explorer backend, bitcoind backend, local
  admin, low bandwidth, Tor privacy, genesis validation.
- Import an existing `bs.cfg` and re-export it, keeping keys the catalog does not know.
- Share a configuration as a link, with the choices in the URL fragment.
- Warnings for exposure without credentials, milestone and network mismatch, filters without
  buckets, a disabled address index, out-of-range values, and settings fixed at store creation.
- Fully static: no backend, accounts, telemetry or third-party requests.
