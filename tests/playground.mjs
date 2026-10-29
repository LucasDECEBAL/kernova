import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9350;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-pg-'));
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
const waitFor = async (expr, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expr)) return true; } catch { /* réessai */ }
    await sleep(150);
  }
  throw new Error('délai dépassé : ' + expr);
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};
const clickIn = (selector, text) => evaluate(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
  if (!el) return false;
  el.click();
  return true;
})()`);
const setEditor = (code) => evaluate(`(() => {
  const ta = document.querySelector('.code-input');
  ta.value = ${JSON.stringify(code)};
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const dialogOk = async () => {
  await waitFor(`!!document.querySelector('dialog[open]')`);
  await evaluate(`(() => {
    const d = document.querySelector('dialog[open]');
    const b = [...d.querySelectorAll('button')].find((x) => x.classList.contains('btn-primary'));
    b.click();
    return true;
  })()`);
};

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/playground' });
  await waitFor(`!!document.querySelector('.code-editor')`);
  check('Playground chargé', (await evaluate(`document.querySelector('#main h1').textContent`)) === 'Playground');
  check('Trois onglets', (await evaluate(`document.querySelectorAll('.pg-tab').length`)) === 3);
  check('Iframe isolée', (await evaluate(`document.querySelector('.pg-frame')?.getAttribute('sandbox')`)) === 'allow-scripts allow-forms allow-modals');
  check('Numéros de ligne', (await evaluate(`document.querySelector('.code-gutter').textContent.split('\\n').length`)) > 3);

  await clickIn('.pg-tab', 'JavaScript');
  await setEditor('console.log("bonjour-test");');
  await clickIn('.pg-toolbar button', 'Exécuter');
  await waitFor(`document.querySelector('.pg-console-list')?.textContent.includes('bonjour-test')`);
  check('Exécution réelle : console remonte', true);

  await setEditor('throw new Error("boum");');
  await clickIn('.pg-toolbar button', 'Exécuter');
  await waitFor(`document.querySelector('.pg-console-list')?.textContent.includes('boum')`);
  check('Erreur du code capturée', true);

  await clickIn('.pg-tab', 'HTML');
  const htmlValue = await evaluate(`document.querySelector('.code-input').value`);
  check('Onglet HTML restauré', htmlValue.includes('Ada Lovelace'), htmlValue.slice(0, 40));
  await clickIn('.pg-tab', 'JavaScript');
  check('Contenu JS conservé', (await evaluate(`document.querySelector('.code-input').value`)).includes('boum'));

  await sleep(900);
  check('Brouillon enregistré', (await evaluate(`document.querySelector('.pg-status').textContent`)).includes('Brouillon enregistré'));

  await send('Page.reload');
  await waitFor(`!!document.querySelector('.code-editor')`);
  await waitFor(`document.querySelector('.pg-status')?.textContent.includes('Brouillon restauré')`);
  check('Brouillon restauré après rechargement', true);

  await clickIn('.pg-toolbar button', 'Réinitialiser');
  await dialogOk();
  await waitFor(`document.querySelector('.pg-status')?.textContent.includes('Exemple d\\'origine restauré')`);
  check('Réinitialisation de l\'exemple', true);

  await clickIn('.pg-toolbar button', 'Voir la solution');
  await waitFor(`!!document.querySelector('dialog[open]')`);
  check('Solution affichée', (await evaluate(`document.querySelector('dialog[open]').textContent`)).includes('Solution :'));
  await evaluate(`document.querySelector('dialog[open] button').click(), true`);

  await evaluate(`(() => { const s = document.querySelector('#pg-example'); s.value = 'galerie'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelector('.pg-status')?.textContent.includes('Exemple d\\'origine chargé')`);
  check('Changement d\'exemple', (await evaluate(`document.querySelector('.code-input').value`)).includes('Galerie'));

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
