# libbitcoin bs config generator

Generate a `bs.cfg` for **libbitcoin server v4** without reading the whole
settings reference. You run a libbitcoin node, or you are about to: choose the
network, start from an intent such as a wallet server, a bitcoind backend or
Tor privacy, change only what your machine needs, and download a configuration
that explains itself line by line.

Live at <https://orangepane.github.io/libbitcoin-bs-config-generator/>.

`bs` is a Bitcoin full node and query server. How it works, what it costs to
run, and what every setting means are documented at
[libbitcoin.org](https://libbitcoin.org); this page exposes the configuration
surface and links back there for depth.

## What it does

- Writes only the settings that differ from the selected network's defaults, each
  under its `[section]` header and preceded by its catalog description as a comment.
- Covers the bs v4 sections: log, database, store tables, chain parameters,
  node, P2P, outbound and inbound, manual peers, admin, native REST, bitcoind
  JSON-RPC, REST and ZMQ, BTCD, Electrum, Sparrow and Esplora.
- Imports an existing `bs.cfg` and re-exports it, keeping keys the catalog does
  not know instead of dropping them.
- Undoes the last preset, import or reset in one step.
- Copies the file to the clipboard or downloads it.
- Shares a configuration as a link: your choices travel in the URL fragment, so
  the reader's own draft is never replaced without their action.

The defaults follow the selected network: mainnet, testnet3, testnet4, signet or
regtest. Each set comes from the values `bs` applies for that chain, and the file
always names the network, because a file that does not is read as mainnet.

## Run it locally

```bash
npm ci
npm run dev        # Vite dev server
npm test           # unit tests
npm run test:e2e   # Playwright journeys, axe and the network assertion
npm run build      # typecheck and production build into dist/
```

The catalog under `src/catalog.json` is generated. To rebuild it from the seed
in `scripts/data/`, run `npm run catalog`. Do not edit the generated file by
hand.

## Next steps after downloading

```bash
bs --config bs.cfg      # run with the file you generated; the first run creates its store
bs --settings           # print every setting and its current value
```

## Privacy

No backend, no accounts, no telemetry, no analytics, no third-party requests.
There are no web fonts, CDN scripts or icon fonts; everything the page needs is
in the bundle. Nothing you type leaves the browser.

## Licence and lineage

GPL-3.0; see [LICENSE](LICENSE). Derived from
[jlopp/bitcoin-core-config-generator](https://github.com/jlopp/bitcoin-core-config-generator),
itself a fork of
[paritytech/parity-config-generator](https://github.com/paritytech/parity-config-generator).

Community tool for libbitcoin server v4. Not affiliated with or endorsed by the libbitcoin
project. Maintained by orangepane.
