import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9372;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-path-'));
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
    await sleep(150);
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
  await send('Page.navigate', { url: BASE + '#/parcours' });
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Parcours'`);

  const levels = await evaluate(`document.querySelectorAll('.path-level').length`);
  const nodes = await evaluate(`document.querySelectorAll('.path-node').length`);
  check('Étapes calculées', levels >= 4, String(levels));
  check('193 cours placés', nodes === 193, String(nodes));
  check('Premier niveau nommé', (await evaluate(`document.querySelector('.path-level h2').textContent`)) === 'Points de départ');

  const status = (id) => evaluate(`document.querySelector('a[href="#/cours/${id}"]').closest('.path-node').dataset.status`);
  check('Informatique disponible', (await status('informatique-debutant')) === 'available');
  check('HTML verrouillé sans prérequis', (await status('html-debutant')) === 'locked');
  check('Prérequis cliquable', await evaluate(`!!document.querySelector('a[href="#/cours/informatique-debutant"].tag')`));

  await evaluate(`(() => { const s = document.querySelector('#path-domain'); s.value = 'linux'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(250);
  const linuxNodes = await evaluate(`document.querySelectorAll('.path-node').length`);
  check('Filtre par domaine', linuxNodes > 0 && linuxNodes < 193, String(linuxNodes));
  check('Statistiques affichées', (await evaluate(`document.querySelector('.muted[role="status"]').textContent`)).includes('avancement global'));

  await evaluate(`(() => {
    const raw = localStorage.getItem('kernova:v1');
    const state = raw ? JSON.parse(raw) : { schema: 1, prefs: {}, progress: {} };
    state.progress = state.progress || {};
    state.progress['informatique-debutant'] = {
      completed: { 'info-01': '2026-10-01', 'info-02': '2026-10-01', 'info-03': '2026-10-01', 'info-04': '2026-10-01', 'info-05': '2026-10-01' },
      lastChapter: 'info-05'
    };
    localStorage.setItem('kernova:v1', JSON.stringify(state));
    return true;
  })()`);
  await send('Page.reload');
  await waitFor(`!!document.querySelector('.path-node')`);
  check('HTML débloqué après le prérequis', (await status('html-debutant')) === 'available');
  check('Informatique marqué terminé', (await status('informatique-debutant')) === 'done');
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
