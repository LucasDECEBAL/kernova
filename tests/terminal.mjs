import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9355;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-term-'));
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
const runCmd = async (cmd) => {
  await evaluate(`(() => {
    const input = document.querySelector('.term-input');
    input.value = ${JSON.stringify(cmd)};
    document.querySelector('.term-line').requestSubmit();
    return true;
  })()`);
  await sleep(120);
};
const outText = () => evaluate(`document.querySelector('.term-output').textContent`);
const promptText = () => evaluate(`document.querySelector('.term-prompt').textContent`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/terminal' });
  await waitFor(`!!document.querySelector('.term-screen')`);
  check('Page terminal chargée', (await evaluate(`document.querySelector('#main h1').textContent`)) === 'Terminal simulé');
  check('Bandeau de simulation', (await outText()).includes('terminal pédagogique'));
  check('Invite de départ', (await promptText()).includes('alice@kernova:~$'));

  await runCmd('pwd');
  check('pwd affiche le dossier personnel', (await outText()).trim().endsWith('/home/alice'));
  await runCmd('cd documents');
  check('cd change le dossier', (await promptText()).includes('~/documents$'));
  await runCmd('ls');
  check('ls liste les fichiers', (await outText()).includes('notes.txt'));

  await evaluate(`(() => { const s = document.querySelector('#term-scenario'); s.value = 'permissions'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelector('#term-sc-title')?.textContent.includes('permissions')`);
  check('Changement de scénario', (await promptText()).includes('~$'));

  await runCmd('chmod 640 secret.txt');
  check('Objectif 1 atteint', (await evaluate(`document.querySelectorAll('.term-objectives li.is-done').length`)) === 1);
  await runCmd('chmod 750 atelier');
  await waitFor(`document.querySelector('.term-progress').textContent.startsWith('2 / 2')`);
  check('Scénario terminé : 2 / 2', true);

  await evaluate(`(() => { const input = document.querySelector('.term-input'); input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); return true; })()`);
  check('Historique avec flèche haut', (await evaluate(`document.querySelector('.term-input').value`)) === 'chmod 750 atelier');

  await runCmd('commandeinconnue');
  check('Commande inconnue signalée', (await outText()).includes('commande introuvable'));

  await send('Page.reload');
  await waitFor(`!!document.querySelector('.term-screen')`);
  await waitFor(`document.querySelector('.term-progress')?.textContent.startsWith('2 / 2')`);
  check('Progression persistée après rechargement', true);

  await evaluate(`(() => { const b = [...document.querySelectorAll('.term-toolbar button')].find((x) => x.textContent.includes('Réinitialiser')); b.click(); return true; })()`);
  await waitFor(`!!document.querySelector('dialog[open]')`);
  await evaluate(`(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find((b) => b.classList.contains('btn-primary')).click(); return true; })()`);
  await waitFor(`document.querySelector('.term-progress').textContent.startsWith('0 / 2')`);
  check('Réinitialisation confirmée', true);

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
