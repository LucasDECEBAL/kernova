import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9366;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-x-'));
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
const go = async (hash) => {
  await send('Page.navigate', { url: BASE + hash });
  await waitFor(`!!document.querySelector('#main h1')`);
};
const text = () => evaluate(`document.querySelector('#main').textContent`);

try {
  await send('Runtime.enable');

  // Recherche élargie
  await go('#/recherche?q=chmod');
  await waitFor(`document.querySelectorAll('#res-sheets').length === 1`);
  check('Recherche : fiches mémo indexées', (await text()).includes('Fiches mémo'));
  check('Recherche : commande chmod trouvée', (await text()).includes('chmod'));

  await go('#/recherche?q=kubernetes');
  check('Recherche : cartes mémo indexées', (await text()).includes('Cartes mémo'));

  await go('#/recherche?q=journal%20de%20bord');
  check('Recherche : projets indexés', (await text()).includes('Projets'));

  await go('#/recherche?q=cybersecurite');
  const domainText = await text();
  check('Recherche : domaines indexés', domainText.includes('Domaines') || domainText.includes('Cybersécurité'));

  // Contenus récents
  await go('#/cours/linux-debutant/linux-01');
  await sleep(200);
  await go('#/recent');
  await waitFor(`document.querySelector('#main')?.textContent.includes('Découvrir Linux')`);
  check('Récents : chapitre consulté listé', true);
  await send('Page.reload');
  await waitFor(`document.querySelector('#main')?.textContent.includes('Découvrir Linux')`);
  check('Récents : persistés après rechargement', true);

  // Visualisation des paquets
  await go('#/reseau');
  await waitFor(`!!document.querySelector('.net-canvas')`);
  await evaluate(`[...document.querySelectorAll('.net-device')].find((b) => b.textContent.includes('Poste 1')).click(), true`);
  await waitFor(`!!document.querySelector('#net-ip')`);
  await evaluate(`(() => { const s = document.querySelector('#net-target'); s.value = 'pc2'; return true; })()`);
  await evaluate(`[...document.querySelectorAll('.net-panel button')].find((b) => b.textContent.includes('Tester')).click(), true`);
  await waitFor(`!document.querySelector('.net-packet-panel').hidden`);
  check('Paquet : panneau affiché sur échec', (await evaluate(`document.querySelector('.net-packet-panel').textContent`)).includes('Étape 1 / 1'));
  check('Paquet : raison affichée', (await evaluate(`document.querySelector('.net-packet-panel').textContent`)).includes('Aucune adresse'));

  await evaluate(`(() => { const set = (s, v) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set('#net-ip','192.168.10.10'); set('#net-mask','24'); set('#net-gw','192.168.10.1'); return true; })()`);
  await evaluate(`[...document.querySelectorAll('.net-panel button')].find((b) => b.textContent.includes('Appliquer')).click(), true`);
  await waitFor(`document.querySelector('.term-progress').textContent.startsWith('4 / 4')`);
  await evaluate(`(() => { const s = document.querySelector('#net-target'); s.value = 'pc2'; return true; })()`);
  await evaluate(`[...document.querySelectorAll('.net-panel button')].find((b) => b.textContent.includes('Tester')).click(), true`);
  await waitFor(`document.querySelector('.net-packet-panel').textContent.includes('Étape 1 / 2')`);
  check('Paquet : deux étapes en direct', true);
  await evaluate(`[...document.querySelectorAll('.net-packet-controls button')].find((b) => b.textContent.includes('Étape suivante')).click(), true`);
  await sleep(150);
  const step2 = await evaluate(`document.querySelector('.net-packet-panel').textContent`);
  check('Paquet : étape suivante affichée', step2.includes('Étape 2 / 2') && step2.includes('accepté'));

  await evaluate(`(() => { const s = document.querySelector('#net-target'); s.value = 'srv'; return true; })()`);
  await evaluate(`[...document.querySelectorAll('.net-panel button')].find((b) => b.textContent.includes('Tester')).click(), true`);
  await waitFor(`document.querySelector('.net-packet-panel').textContent.includes('Étape 1 / 3')`);
  check('Paquet : trois étapes via le routeur', true);
  check('Paquet : marqueur dessiné', (await evaluate(`!!document.querySelector('.net-packet')`)));

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
