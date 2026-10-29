import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9378;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-ed-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const data = JSON.parse(fs.readFileSync(ROOT + '/data/editors.json', 'utf8'));
const cFirst = data.languages.find((l) => l.id === 'c').exercises[0];
const cSecond = data.languages.find((l) => l.id === 'c').exercises[1];

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
    issues.push('ERR');
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
const clickButton = async (label) => {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
    button.click();
    return true;
  })()`);
  await sleep(200);
};
const setCode = async (code) => {
  await evaluate(`(() => {
    const area = document.querySelector('.code-input');
    area.value = ${JSON.stringify(code)};
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(150);
};

try {
  await send('Runtime.enable');

  await send('Page.navigate', { url: BASE + '#/editeurs' });
  await waitFor(`!!document.querySelector('.code-editor')`);
  check('Cinq langages proposés', (await evaluate(`document.querySelectorAll('.editor-tab').length`)) === 5);
  check('C actif par défaut', (await evaluate(`document.querySelector('.editor-tab[aria-current="page"]').textContent`)) === 'C');
  check('Deux exercices C', (await evaluate(`document.querySelectorAll('.editor-chip').length`)) === 2);
  check('Mention explicite « sans exécution »', (await evaluate(`document.body.textContent`)).includes('ne compilent ni n\'exécutent'));

  await clickButton('Vérifier');
  check('Départ refusé', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ko'));
  check('Cinq contrôles listés', (await evaluate(`document.querySelectorAll('.editor-rule').length`)) === 5);
  check('Au moins un contrôle manquant', (await evaluate(`document.querySelectorAll('.editor-rule[data-ok="false"]').length`)) > 0);

  await setCode(cFirst.solution);
  await clickButton('Vérifier');
  check('Solution C acceptée', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ok'));
  check('Compteur complet', (await evaluate(`document.querySelector('.exercise-feedback').textContent`)).includes(`5/5`));
  check('Aucun contrôle manquant', (await evaluate(`document.querySelectorAll('.editor-rule[data-ok="false"]').length`)) === 0);

  await clickButton('Réinitialiser');
  check('Réinitialisation au départ', (await evaluate(`document.querySelector('.code-input').value`)) === cFirst.starter);
  check('Contrôles masqués après réinitialisation', (await evaluate(`document.querySelector('.editor-rules').hidden`)) === true);

  await evaluate(`document.querySelectorAll('.editor-chip')[1].click()`);
  await waitFor(`document.querySelector('h2').textContent.includes('Somme')`);
  check('Second exercice chargé', (await evaluate(`document.querySelector('.code-input').value`)) === cSecond.starter);

  await setCode('brouillon en cours');
  await sleep(600);
  await send('Page.navigate', { url: BASE + '#/editeurs/java' });
  await waitFor(`document.querySelector('.editor-tab[aria-current="page"]').textContent === 'Java'`);
  await send('Page.navigate', { url: BASE + '#/editeurs/c' });
  await waitFor(`document.querySelector('.code-input') !== null`);
  check('Brouillon retrouvé après navigation', (await evaluate(`document.querySelector('.code-input').value`)) === 'brouillon en cours');

  await send('Page.navigate', { url: BASE + '#/editeurs/php' });
  await waitFor(`document.querySelector('.editor-tab[aria-current="page"]').textContent === 'PHP'`);
  check('Route directe PHP', (await evaluate(`document.querySelector('h1').textContent`)) === 'Éditeurs de code');
  check('Solution PHP masquée par défaut', (await evaluate(`document.querySelectorAll('.editor-disclosure')[1].open`)) === false);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE + '#/editeurs' });
  await waitFor(`!!document.querySelector('.code-editor')`);
  await sleep(300);
  check('Pas de débordement horizontal à 390 px', (await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`)));
  await send('Emulation.clearDeviceMetricsOverride');

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
