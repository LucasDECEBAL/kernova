// Partie 3 : algorithmique (entrées 41 à 80).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME_PATH } from './lib/env.mjs';

const PORT = 9392;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-p3-'));
const chrome = spawn(CHROME_PATH, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const issues = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    issues.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    issues.push('ERR');
  }
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expression, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expression)) return true; } catch { /* réessai */ }
    await sleep(120);
  }
  throw new Error('délai dépassé : ' + expression);
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};
const setValue = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const answer = async (value) => {
  await evaluate(`(() => {
    const input = document.querySelector('#exercise-answer');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('.exercise button')].find((b) => b.textContent.includes('Vérifier')).click();
    return true;
  })()`);
  await sleep(150);
};
const open = async (hash) => {
  await send('Page.navigate', { url: BASE + '#' + hash });
  await waitFor(`!!document.querySelector('#chapter-title')`);
};
const okFeedback = async () => (await evaluate(`document.querySelector('.exercise-feedback')?.className || ''`)).includes('ok');

try {
  await send('Runtime.enable');

  await send('Page.navigate', { url: BASE + '#/catalogue' });
  await waitFor(`document.querySelector('#cat-count')?.textContent.startsWith('273 r')`);
  check('Catalogue : 60 cours', true);
  await setValue('#cat-domain', 'algorithmique');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('8 r')`);
  check('Domaine algorithmique : 8 cours', true);

  await open('/cours/algorithmique-debutant/algo-01');
  check('Résumé et exercice présents', await evaluate(`!!document.querySelector('#summary-title') && !!document.querySelector('#exercise-answer')`));
  await answer('lire a, si a ≥ b afficher a');
  check('Condition acceptée', await okFeedback());

  await open('/cours/algo-controle/algc-01');
  await answer('age ≥ 18');
  check('Condition majeur acceptée', await okFeedback());

  await open('/cours/algo-donnees/algd-01');
  await answer('variable locale');
  check('Portée locale acceptée', await okFeedback());

  await open('/cours/algo-conception/alge-01');
  await answer('le losange');
  check('Symbole de décision accepté', await okFeedback());

  await open('/cours/algo-recherche-tris/alg5-01');
  await answer('indice 2');
  check('Recherche linéaire acceptée', await okFeedback());

  await open('/cours/algo-structures/alg6-01');
  await answer('quand le pivot est extrême et les partitions déséquilibrées');
  check('Pire cas du tri rapide accepté', await okFeedback());

  await open('/cours/algo-graphes/alg7-01');
  await answer('D, E et C');
  check('Feuilles de l\'arbre acceptées', await okFeedback());

  await open('/cours/algo-optimisation/alg8-01');
  await answer('le tri par sélection');
  check('Tri en place accepté', await okFeedback());

  check('Aucune erreur console', issues.length === 0, issues.join(' | '));
} catch (e) {
  check('Scénario interrompu', false, e.message);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  for (const i of issues) console.log('  >', i);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* verrou */ }
  process.exit(failed || issues.length ? 1 : 0);
}
