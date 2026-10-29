import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9356;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-net-'));
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
const clickDevice = (name) => evaluate(`(() => {
  const b = [...document.querySelectorAll('.net-device')].find((x) => x.textContent.includes(${JSON.stringify(name)}));
  if (!b) return 'absent';
  b.click();
  return 'ok';
})()`);
const setField = (sel, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const clickInPanel = (text) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && x.closest('.net-panel, .net-side, .page'));
  if (!b) return 'absent';
  b.click();
  return 'ok';
})()`);
const progressText = () => evaluate(`document.querySelector('.term-progress').textContent`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/reseau' });
  await waitFor(`!!document.querySelector('.net-canvas')`);
  check('Page réseau chargée', (await evaluate(`document.querySelector('#main h1').textContent`)) === 'Simulateur réseau');
  check('Six appareils affichés', (await evaluate(`document.querySelectorAll('.net-device').length`)) === 6);
  check('Cinq liaisons dessinées', (await evaluate(`document.querySelectorAll('.net-link').length`)) === 5);
  check('Départ à 0 objectif', (await progressText()).startsWith('0 / 4'));

  await clickDevice('Poste 1');
  await waitFor(`!!document.querySelector('#net-ip')`);
  check('Panneau du poste 1', (await evaluate(`document.querySelector('#net-ip').value`)) === '');
  await setField('#net-ip', '192.168.10.10');
  await setField('#net-mask', '24');
  await setField('#net-gw', '192.168.10.1');
  await clickInPanel('Appliquer');
  await waitFor(`document.querySelector('.term-progress').textContent.startsWith('4 / 4')`);
  check('Configuration appliquée : 4 / 4', true);

  await evaluate(`(() => { const s = document.querySelector('#net-target'); s.value = 'pc2'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await clickInPanel('Tester');
  await waitFor(`document.querySelector('.net-console').textContent.includes('réussi')`);
  check('Ping réussi et scénario terminé', true);

  await evaluate(`(() => { const s = document.querySelector('#net-scenario'); s.value = 'pare-feu'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelector('#net-sc-title').textContent.includes('pare-feu')`);
  check('Changement de scénario', (await progressText()).startsWith('1 / 2'));
  check('Contrainte pc2 déjà respectée, pc1 non', (await evaluate("document.querySelectorAll('.term-objectives li.is-done').length")) === 1);
  await clickDevice('Serveur web');
  await waitFor(`!!document.querySelector('.net-rule-form')`);
  await evaluate(`(() => {
    const form = document.querySelector('.net-rule-form');
    form.querySelector('select').value = 'allow';
    form.querySelectorAll('input')[0].value = '192.168.10.10/32';
    form.querySelectorAll('input')[1].value = '22';
    [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Ajouter')).click();
    return true;
  })()`);
  await waitFor(`document.querySelector('.term-progress').textContent.startsWith('2 / 2')`);
  check('Règle de pare-feu ajoutée en tête : 2 / 2', true);

  await setField('#calc-ip', '10.0.20.50');
  await setField('#calc-mask', '26');
  await clickInPanel('Calculer');
  await waitFor(`document.querySelector('.net-calc-result').textContent.includes('10.0.20.0/26')`);
  check('Calculateur de sous-réseau', (await evaluate(`document.querySelector('.net-calc-result').textContent`)).includes('62'));

  await send('Page.reload');
  await waitFor(`!!document.querySelector('.net-canvas')`);
  await waitFor(`document.querySelector('.term-progress')?.textContent.startsWith('2 / 2')`);
  check('Progression persistée après rechargement', true);

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
