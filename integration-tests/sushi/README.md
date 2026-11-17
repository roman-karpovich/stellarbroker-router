# Sushi integration regressions

These tests build StellarBroker from this checkout and execute its WASM against
the real mainnet Sushi XLM/USDC pool using [Kanatoko](https://crates.io/crates/kanatoko)
29.1.2 from crates.io. The replay workspace is separate from the production workspace.

## Run

Install Rust 1.95.0, Stellar CLI 27.0.0 and Node.js 18 or later, then run from the
repository root:

```sh
rustup toolchain install 1.95.0 --profile minimal --target wasm32v1-none
./integration-tests/sushi/check.sh
```

The script rebuilds the current broker, downloads three pinned dependency WASMs
on first use, verifies their SHA-256 hashes and runs both tests. Cargo may also
download dependencies. No CLI wallet, signing key or transaction submission is used.

The committed templates contain frozen ledger state and provenance, with only the
WASM byte strings omitted. `prepare-fixtures.mjs` restores those bytes by content
hash; it does not recapture state. Downloaded code and reconstructed fixtures are
ignored by Git. An alternate read-only RPC can be set with `KANATOKO_WASM_RPC`.

After setup, the complete replay can run without network access:

```sh
./integration-tests/sushi/build.sh
node integration-tests/sushi/prepare-fixtures.mjs --offline
env -u KANATOKO_CAPTURE_RPC cargo +1.95.0 test --locked --offline \
  --manifest-path integration-tests/sushi/Cargo.toml
```

The build also needs cached Rust dependencies when offline. Missing code fails
closed with `--offline`; a hash mismatch always fails. `check.sh` is the convenient
setup-and-test entry point and can fetch missing code.

## Coverage

Each direction, XLM to USDC and USDC to XLM, swaps one token (10,000,000 raw units):

1. Ask the real pool's `quote_exact_input` for the expected output and final price.
2. Set the route minimum one stroop too high. Verify `Contract(32712)` and unchanged
   trader, broker and pool balances, `slot0`, liquidity and oracle hints.
3. Retry at the exact minimum. Verify the returned amounts, exact balance changes,
   zero broker leftovers and the quoted final price in the correct direction.

The existing native Sushi tests use a fixed 99% mock rate. These regressions add
the deployed pool's callback, signed deltas and actual price movement. Broker fees
are zero in these scenarios. Authorization is mocked and accounts are funded
locally; signature validation, fee collection, network admission and unobserved
storage are outside this coverage.

## Frozen state and code provenance

| Fixture template | Mainnet ledger | Protocol |
| --- | --- | --- |
| `usdc-to-xlm.template.json` | 65534393 | 29 |
| `xlm-to-usdc.template.json` | 65534398 | 29 |

Both captures were taken on 2026-11-17 UTC and report zero RPC reads during final
replay. The pool is `CCR2CH4GQVCZHG7CHFVMNANCK45CU5DVKXZIIITDZQAU3CEJZ7RQH2MQ`,
also listed in [Sushi's generated pool bindings](https://github.com/sushi-labs/sushiswap/blob/074482e2c0752cf48f984e216088c87bed2b83af/packages/stellar/contract-bindings/pool/README.md).
Its code hash is `003710b383f9da7d650a7f719a7be479110266427817ebbed61d924505fcd7c7`.
Every other required code hash is recorded in each template. The imported ABI
comes from the downloaded pool WASM; a local `SqrtPriceX96` alias accommodates its
auxiliary quote type.

StellarBroker WASM is always built from the current source, never downloaded from
a deployed broker address. CI runs the existing native tests, builds the broker,
prepares fixtures, then lints and replays them offline.

An intentional recapture can use `KANATOKO_CAPTURE_RPC=<mainnet-rpc-url>` with
`cargo +1.95.0 test --locked -- --test-threads=1` in this directory after setup.
It replaces the generated JSON fixtures. To publish updated templates, copy those
JSON files to `*.template.json` and replace only each
`ledger_snapshot.ledger_entries[*].entry.data.contract_code.code` value with an
empty string. Preserve hashes, ledger entries and provenance, then rerun setup
and offline replay. Normal `check.sh` clears the recapture variable.
