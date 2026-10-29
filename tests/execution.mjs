import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9359;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-exec-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

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
    issues.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    issues.push('ERROR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
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
const waitFor = async (expr, timeout = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expr)) return true; } catch { /* réessai */ }
    await sleep(250);
  }
  throw new Error('délai dépassé : ' + expr);
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};
const setEditor = (panel, code) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(panel)} + ' .code-input');
  el.value = ${JSON.stringify(code)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const clickText = (panel, text) => evaluate(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(panel)} + ' button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
  if (!b) return false;
  b.click();
  return true;
})()`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/execution' });
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Python et SQL'`);
  check('Page chargée', true);
  check('Deux onglets', (await evaluate(`document.querySelectorAll('.pg-tab').length`)) === 2);

  // SQL
  await evaluate(`document.querySelector('#tab-sql').click(), true`);
  await waitFor(`!document.querySelector('#panel-sql').hidden`);
  check('Onglet SQL actif', await evaluate(`document.querySelector('#tab-sql').getAttribute('aria-selected') === 'true'`));

  await clickText('#panel-sql', 'Exécuter');
  await waitFor(`document.querySelectorAll('#panel-sql .exec-table tbody tr').length >= 4`, 180000);
  check('SQL : la base de démonstration renvoie 4 clients', true);
  check('SQL : statut de succès', (await evaluate(`document.querySelector('#panel-sql .exec-status').textContent`)).includes('ligne(s)'));

  await setEditor('#panel-sql', 'SELECT * FROM table_absente;');
  await clickText('#panel-sql', 'Exécuter');
  await waitFor(`!!document.querySelector('#panel-sql .alert-danger')`, 30000);
  check('SQL : erreur réelle affichée', (await evaluate(`document.querySelector('#panel-sql .alert-danger').textContent`)).toLowerCase().includes('no such table'));

  // Python
  await evaluate(`document.querySelector('#tab-python').click(), true`);
  await waitFor(`!document.querySelector('#panel-python').hidden`);
  await setEditor('#panel-python', 'print(2 + 2)');
  await clickText('#panel-python', 'Exécuter');
  await waitFor(`document.querySelector('#panel-python .exec-out').textContent.includes('4')`, 240000);
  check('Python : exécution réelle (2+2)', true);

  await setEditor('#panel-python', '1 / 0');
  await clickText('#panel-python', 'Exécuter');
  await waitFor(`document.querySelector('#panel-python .exec-err').textContent.includes('ZeroDivisionError')`, 60000);
  check('Python : erreur réelle affichée', true);

  await setEditor('#panel-python', 'while True:\n    pass');
  await clickText('#panel-python', 'Exécuter');
  await waitFor(`document.querySelector('#panel-python .exec-status').textContent.includes('interrompue')`, 40000);
  check('Python : boucle infinie interrompue par le worker', true);
  check('Interface restée utilisable', (await evaluate(`!!document.querySelector('#panel-python .code-input') && !document.querySelector('#panel-python button').disabled`)));

  await setEditor('#panel-python', 'print(6 * 7)');
  await clickText('#panel-python', 'Exécuter');
  await waitFor(`document.querySelector('#panel-python .exec-out').textContent.includes('42')`, 120000);
  check('Python : worker recréé après interruption', true);

  await send('Page.reload');
  await waitFor(`!!document.querySelector('#panel-python .code-input')`);
  check('Brouillon Python restauré', (await evaluate(`document.querySelector('#panel-python .code-input').value`)).includes('6 * 7'));

  check('Aucune erreur console', issues.length === 0, issues.join(' | '));
} catch (e) {
  check('Scénario interrompu', false, e.message);
  for (const i of issues) console.log('  >', i);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failed || issues.length ? 1 : 0);
}
