// Audit d'accessibilité automatique (axe-core) sur les pages principales.
// Échoue si une violation de niveau sérieux ou critique est détectée.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CHROME_PATH } from './lib/env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const axeSource = fs.readFileSync(path.join(here, 'lib/axe.min.js'), 'utf8');
const PORT = 9382;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-a11y-'));
const chrome = spawn(CHROME_PATH, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
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
const waitFor = async (expression, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expression)) return true; } catch { /* réessai */ }
    await sleep(150);
  }
  throw new Error('délai dépassé : ' + expression);
};

const PAGES = [
  ['/', 'Accueil'],
  ['/catalogue', 'Catalogue'],
  ['/cours/linux-debutant', 'Cours'],
  ['/cours/linux-debutant/linux-01', 'Leçon'],
  ['/quiz/linux-debutant/linux-06', 'Quiz'],
  ['/tableau-de-bord', 'Progression'],
  ['/editeurs', 'Éditeurs'],
  ['/projets', 'Projets'],
  ['/fiches', 'Fiches'],
  ['/terminal', 'Terminal']
];

const results = [];
let serious = 0;

try {
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  for (const [hash, label] of PAGES) {
    await send('Page.navigate', { url: BASE + '#' + hash });
    await waitFor(`!!document.querySelector('#main h1')`);
    await sleep(900);
    await evaluate(axeSource + ';true;');
    for (const theme of ['system', 'light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}, true`);
      await sleep(200);
      const report = await evaluate(`axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      }).then((r) => r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' '))
      })))`);

      const blocking = report.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      serious += blocking.length;
      results.push({ label: label + ' (' + theme + ')', total: report.length, blocking });
      console.log(`${blocking.length ? 'KO' : 'OK'}  ${label} [${theme}] : ${report.length} violation(s) axe, ${blocking.length} sérieuse(s)`);
      for (const v of blocking) console.log(`    ${v.impact} ${v.id} — ${v.help} — ${v.nodes.join(' | ')}`);
    }
    await evaluate(`document.documentElement.dataset.theme = 'system', true`);
  }
} finally {
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* profil verrouillé */ }
}

console.log(`\n${results.length} pages auditées, ${serious} violation(s) sérieuse(s) ou critique(s)`);
process.exit(serious ? 1 : 0);
