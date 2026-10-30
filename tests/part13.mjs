// Partie 13 : Windows AD/Entra et réseaux fondamentaux.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME_PATH } from './lib/env.mjs';

const PORT = 9406;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-p13-'));
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
  } else if (m.method === 'Runtime.exceptionThrown') issues.push(m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') issues.push('ERR');
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
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
const ok = async () => (await evaluate(`document.querySelector('.exercise-feedback')?.className || ''`)).includes('ok');

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/catalogue' });
  await waitFor(`document.querySelector('#cat-count')?.textContent.startsWith('273 r')`);
  check('Catalogue : 153 cours', true);
  for (const [domain, expected] of [['windows', '5 r'], ['reseaux', '16 r']]) {
    await evaluate(`(() => { const el = document.querySelector('#cat-domain'); el.value = ${JSON.stringify(domain)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitFor(`document.querySelector('#cat-count').textContent.startsWith('${expected}')`);
    check(`Domaine ${domain} : ${expected}`, true);
  }

  const cases = [
    ['/cours/windows-ad/wad-01', "dans l'annuaire", 'AD : annuaire accepté'],
    ['/cours/windows-services/wsrv-01', 'un enregistrement A', 'Windows : DNS accepté'],
    ['/cours/windows-entra/went-01', 'dans le cloud', 'Entra : cloud accepté'],
    ['/cours/reseau-fondamentaux/rfd-01', 'un WAN', 'Réseaux : WAN accepté'],
    ['/cours/reseau-adressage/rad-01', 'non, elle reste locale', 'Réseaux : MAC acceptée'],
    ['/cours/reseau-sousreseaux/rsr-01', 'quatre sous-réseaux', 'Réseaux : sous-réseaux acceptés'],
    ['/cours/reseau-transport/rtp-01', 'TCP', 'Réseaux : TCP accepté'],
    ['/cours/reseau-services/rsv2-01', 'exposer un service interne', 'Réseaux : NAT accepté'],
    ['/cours/reseau-config/rcf-01', 'ipconfig /all', 'Réseaux : ipconfig accepté'],
    ['/cours/reseau-outils/rto2-01', 'les sockets en écoute', 'Réseaux : ss accepté']
  ];
  for (const [hash, value, label] of cases) {
    await open(hash);
    await answer(value);
    check(label, await ok());
  }

  check('Aucune erreur console', issues.length === 0, issues.join(' | '));
} catch (e) {
  check('Scénario interrompu', false, e.message);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* verrou */ }
  process.exit(failed || issues.length ? 1 : 0);
}
