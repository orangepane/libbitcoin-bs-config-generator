# Changelog

Notable changes to the bs.cfg generator. One entry per tag, newest first; versions are the git
tags. An entry is written at merge time from the ticked checklist, so it describes work that
shipped. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Nothing is published to
a registry, so the number exists for the deploy record and for references such as "as of v0.2.0".

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
