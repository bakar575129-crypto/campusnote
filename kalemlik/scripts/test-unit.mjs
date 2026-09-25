// Ön yüzün saf mantık modüllerini (TypeScript) derleyip node:test ile çalıştırır.
import {build} from 'rolldown';
import {readdir, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'node_modules/.cache/unit-tests');
await rm(out, {recursive: true, force: true});
const tests = (await readdir(path.join(root, 'tests/unit'))).filter(f => f.endsWith('.test.ts'));
await build({
  input: Object.fromEntries(tests.map(f => [f.replace(/\.ts$/, ''), path.join(root, 'tests/unit', f)])),
  platform: 'node',
  resolve: {alias: {'@': path.join(root, 'src'), '@shared': path.join(root, 'shared')}},
  external: [/^node:/],
  output: {dir: out, format: 'esm', entryFileNames: '[name].mjs'},
  logLevel: 'warn',
});
const files = (await readdir(out)).filter(f => f.endsWith('.test.mjs')).map(f => path.join(out, f));
const res = spawnSync(process.execPath, ['--test', ...files, ...(await readdir(path.join(root, 'tests/unit'))).filter(f => f.endsWith('.test.mjs')).map(f => path.join(root, 'tests/unit', f))], {stdio: 'inherit'});
process.exit(res.status ?? 1);
