import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9362;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-proj-'));
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

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/projets' });
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Projets pratiques'`);
  check('Lien de navigation', await evaluate(`!!document.querySelector('#site-nav a[href="#/projets"]')`));
  check('46 projets listés', (await evaluate(`document.querySelectorAll('.course-row').length`)) === 46);
  check('Compteur', (await evaluate(`document.querySelector('#main .muted[role="status"]').textContent`)) === '46 projet(s)');

  await evaluate(`(() => { const s = document.querySelector('#project-search'); s.value = 'Journal de bord'; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelectorAll('.course-row').length === 1`);
  check('Recherche : projet Git', (await evaluate(`document.querySelector('.course-row h2').textContent`)).includes('Journal de bord'));

  await evaluate(`(() => { const s = document.querySelector('#project-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); const d = document.querySelector('#project-domain'); d.value = 'linux'; d.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelectorAll('.course-row').length === 2`);
  check('Filtre domaine Linux', true);

  await send('Page.navigate', { url: BASE + '#/projets/linux-administration' });
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Serveur de fichiers documenté'`);
  check('Page projet', true);
  check('Grille : 3 critères', (await evaluate(`document.querySelectorAll('.proj-grid tbody tr').length`)) === 3);
  check('Cahier des charges présent', (await evaluate(`document.querySelector('#main').textContent`)).includes('Cahier des charges'));
  check('Fichiers de départ proposés', (await evaluate(`document.querySelectorAll('.proj-starter').length`)) >= 1);
  check('Téléchargement disponible', (await evaluate(`[...document.querySelectorAll('.proj-starter button')].some((b) => b.textContent.includes('Télécharger'))`)));
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Indice (0/')).click(), true`);
  await waitFor(`document.querySelectorAll('.term-hint-list li').length === 1`);
  check('Indice révélé progressivement', true);

  await evaluate(`document.querySelector('.proj-grid input[type="checkbox"]').click(), true`);
  await waitFor(`document.querySelector('.progress-label span').textContent.includes('1/3')`);
  check('Critère coché', true);

  await send('Page.reload');
  await waitFor(`!!document.querySelector('.proj-grid')`);
  check('Coche persistée après rechargement', (await evaluate(`document.querySelector('.proj-grid input[type="checkbox"]').checked`)) === true);

  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Réinitialiser la grille')).click(), true`);
  await waitFor(`!!document.querySelector('dialog[open]')`);
  await evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.classList.contains('btn-primary')).click(), true`);
  await waitFor(`document.querySelectorAll('.proj-grid input:checked').length === 0`);
  check('Grille réinitialisée', true);

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
