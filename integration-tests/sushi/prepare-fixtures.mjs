import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Restore only omitted WASM bytes. Ledger state and provenance stay frozen.
// No contract call, wallet or transaction is used by this setup step.
const here = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(here, 'wasm');
const fixturesDir = join(here, 'fixtures');
const sushiHash = '003710b383f9da7d650a7f719a7be479110266427817ebbed61d924505fcd7c7';
const rpc = process.env.KANATOKO_WASM_RPC || 'https://mainnet.sorobanrpc.com';
const offline = process.argv.includes('--offline');
mkdirSync(wasmDir, { recursive: true });
const templates = readdirSync(fixturesDir).filter(name => name.endsWith('.template.json'));
if (templates.length === 0) throw new Error('No fixture templates found');

for (const name of templates) {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
  for (const item of fixture.ledger_snapshot.ledger_entries) {
    const code = item.entry.data.contract_code;
    if (!code) continue;
    if (code.code !== '' || !/^[a-f0-9]{64}$/.test(code.hash)) {
      throw new Error(`Unexpected code descriptor in ${name}`);
    }
    const path = join(wasmDir, `${code.hash}.wasm`);
    if (!existsSync(path)) {
      if (offline) throw new Error(`Missing cached WASM ${code.hash}; run setup online once`);
      const temporary = `${path}.download`;
      execFileSync('stellar', ['contract', 'fetch', '--wasm-hash', code.hash,
        '--rpc-url', rpc, '--network-passphrase', 'Public Global Stellar Network ; September 2015',
        '--out-file', temporary], { stdio: 'inherit' });
      const downloaded = readFileSync(temporary);
      if (createHash('sha256').update(downloaded).digest('hex') !== code.hash) {
        throw new Error(`Downloaded WASM hash mismatch: ${code.hash}`);
      }
      renameSync(temporary, path);
    }
    const wasm = readFileSync(path);
    if (createHash('sha256').update(wasm).digest('hex') !== code.hash) {
      throw new Error(`Cached WASM hash mismatch: ${code.hash}`);
    }
    code.code = wasm.toString('hex');
    if (code.hash === sushiHash) writeFileSync(join(wasmDir, 'sushi_pool.wasm'), wasm);
  }
  writeFileSync(join(fixturesDir, name.replace('.template.json', '.json')), JSON.stringify(fixture, null, 2) + '\n');
}
console.log(`Prepared ${templates.length} frozen fixtures with verified WASM hashes`);
