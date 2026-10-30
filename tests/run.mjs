// Exécute toute la suite de tests : serveur local + Chrome sans interface.
// Usage : npm test            (toutes les suites)
//         npm test -- e2e     (une suite précise)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BASE, waitForServer } from './lib/env.mjs';
import { createStaticServer } from './lib/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  'integrity',
  'editors-unit',
  'e2e',
  'playground',
  'terminal',
  'network',
  'sheets',
  'final',
  'execution',
  'projects',
  'parcours',
  'summary',
  'extra',
  'mobile',
  'editors-e2e',
  'part2',
  'part3',
  'part4',
  'part5',
  'part6',
  'part7',
  'part8',
  'part9',
  'part10',
  'part11',
  'part12',
  'part13',
  'part14',
  'part15',
  'a11y'
];

const filter = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const suites = filter.length ? SUITES.filter((name) => filter.includes(name)) : SUITES;
if (!suites.length) {
  console.error(`Suite inconnue. Disponibles : ${SUITES.join(', ')}`);
  process.exit(2);
}

const server = createStaticServer(ROOT);
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(8765, '127.0.0.1', resolve);
});

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code) => resolve(code ?? 1));
});

const results = [];
try {
  await waitForServer(BASE);
  for (const name of suites) {
    const file = path.join(here, name + '.mjs');
    if (!fs.existsSync(file)) {
      results.push({ name, ok: false });
      continue;
    }
    console.log(`\n===== ${name} =====`);
    const code = await run(file);
    results.push({ name, ok: code === 0 });
  }
} finally {
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n===== Résumé =====');
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'ÉCHEC'} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} suites réussies`);
process.exit(failed.length ? 1 : 0);
