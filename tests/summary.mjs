import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9373;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-summ-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const issues = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    issues.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    issues.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, timeout = 9000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expr)) return true; } catch { /* réessai */ }
    await sleep(120);
  }
  throw new Error('délai dépassé : ' + expr);
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};
const typeAnswer = (value) => evaluate(`(() => {
  const input = document.querySelector('#exercise-answer');
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const clickVerify = () => evaluate(`[...document.querySelectorAll('.exercise button')].find((b) => b.textContent.includes('Vérifier')).click(), true`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/cours/linux-debutant/linux-01' });
  await waitFor(`!!document.querySelector('#chapter-title')`);

  check('Résumé affiché', (await evaluate(`document.querySelector('#main').textContent`)).includes('Résumé'));
  check('Trois points de résumé', (await evaluate(`document.querySelectorAll('#summary-title + ul li').length`)) === 3);
  check('Suite logique affichée', (await evaluate(`document.querySelector('#main').textContent`)).includes('Suite logique'));
  check('Champ de réponse présent', await evaluate(`!!document.querySelector('#exercise-answer')`));

  await typeAnswer('nope');
  await clickVerify();
  await waitFor(`document.querySelector('.exercise-feedback') && !document.querySelector('.exercise-feedback').hidden`);
  check('Mauvaise réponse signalée', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ko'));

  await typeAnswer('  /ETC. ');
  await clickVerify();
  await waitFor(`document.querySelector('.exercise-feedback')?.className.includes('ok')`);
  check('Bonne réponse acceptée (casse, espaces, point)', true);
  check('Champ désactivé après validation', (await evaluate(`document.querySelector('#exercise-answer').disabled`)) === true);

  const hintsBefore = await evaluate(`document.querySelectorAll('.hint-list li').length`);
  await evaluate(`[...document.querySelectorAll('.exercise button')].find((b) => b.textContent.includes('Indice suivant')).click(), true`);
  await sleep(120);
  check('Indices toujours fonctionnels', (await evaluate(`document.querySelectorAll('.hint-list li').length`)) > hintsBefore);

  await send('Page.navigate', { url: BASE + '#/cours/reseaux-avance/rsa-01' });
  await waitFor(`!!document.querySelector('#chapter-title')`);
  check('Toutes les leçons proposent une vérification', (await evaluate(`!!document.querySelector('#exercise-answer')`)) === true);

  await typeAnswer('zzz');
  await clickVerify();
  await typeAnswer('yyy');
  await clickVerify();
  await waitFor(`document.querySelector('.exercise-feedback')?.className.includes('ko')`);
  check('Vérification ouverte annoncée comme indicative', (await evaluate(`document.querySelector('.exercise-feedback').textContent`)).includes('indicative'));
  check('Auto-évaluation proposée après deux échecs', await evaluate(`[...document.querySelectorAll('.exercise button')].some((b) => b.textContent.includes("m'auto-évaluer"))`));
  await evaluate(`[...document.querySelectorAll('.exercise button')].find((b) => b.textContent.includes("m'auto-évaluer")).click(), true`);
  await sleep(150);
  check('Solution révélée pour comparaison', await evaluate(`document.querySelector('.exercise .callout')?.hidden === false`));
  check('Message d\'auto-évaluation', (await evaluate(`document.querySelector('.exercise-feedback').textContent`)).includes('Comparez'));

  check('Aucune erreur console', issues.length === 0, issues.join(' | '));
} catch (e) {
  check('Scénario interrompu', false, e.message);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  for (const i of issues) console.log('  >', i);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failed || issues.length ? 1 : 0);
}
