// Partie 2 du catalogue : informatique générale, maintenance, environnements.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME_PATH } from './lib/env.mjs';

const PORT = 9391;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-p2-'));
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

try {
  await send('Runtime.enable');

  await send('Page.navigate', { url: BASE + '#/catalogue' });
  await waitFor(`document.querySelector('#cat-count')?.textContent.startsWith('193 r')`);
  check('Catalogue : 53 cours', true);

  for (const [domain, expected] of [['informatique-generale', '3 r'], ['maintenance', '3 r'], ['environnements', '3 r']]) {
    await setValue('#cat-domain', domain);
    await waitFor(`document.querySelector('#cat-count').textContent.startsWith('${expected}')`);
    check(`Filtre ${domain} : ${expected}`, true);
  }
  await evaluate(`document.querySelector('#cat-domain').value = '', document.querySelector('#cat-domain').dispatchEvent(new Event('change', { bubbles: true })), true`);

  await open('/cours/informatique-debutant/info-01');
  check('Leçon info-01 : contenu rendu', (await evaluate(`document.querySelectorAll('.lesson-body p').length`)) >= 2);
  check('Leçon info-01 : résumé et exercice', await evaluate(`!!document.querySelector('#summary-title') && !!document.querySelector('#exercise-answer')`));

  await open('/cours/informatique-donnees/info2-01');
  await answer('/home/alice/Documents/notes.txt');
  check('Chemin absolu accepté', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ok'));

  await open('/cours/maintenance-informatique/mnt-01');
  await answer('processeur calcule, memoire travaille, stockage conserve, alimentation fournit');
  check('Rôles des composants acceptés', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ok'));

  await open('/cours/environnements-windows/env-01');
  await answer('les services et l\'observateur d\'événements');
  check('Services et journaux acceptés', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ok'));

  await open('/cours/environnements-outils/env2-01');
  await answer('npm ci');
  check('Installation reproductible acceptée', (await evaluate(`document.querySelector('.exercise-feedback').className`)).includes('ok'));

  const data = JSON.parse(fs.readFileSync(ROOT + '/data/lessons/maintenance-sauvegarde.json', 'utf8'));
  const chapters = data.modules.flatMap((m) => m.chapters);
  check('Dernier chapitre : évaluation finale', chapters[chapters.length - 1].nextStep.includes('évaluation finale'));

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
