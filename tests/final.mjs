import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9361;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-final-'));
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
const answerCurrent = () => evaluate(`(() => {
  const form = document.querySelector('.quiz-shell form');
  if (!form) return 'noform';
  const opts = form.querySelectorAll('.answer-option input');
  if (opts.length) { opts[0].click(); return 'option'; }
  const text = form.querySelectorAll('input[type="text"]');
  if (text.length) {
    text.forEach((i) => { i.value = 'x'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    return 'text';
  }
  const selects = form.querySelectorAll('select');
  if (selects.length) {
    selects.forEach((s) => { s.value = s.options[1]?.value ?? '-1'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    return 'select';
  }
  return 'order';
})()`);
const submit = () => evaluate(`(() => {
  const b = document.querySelector('.quiz-actions button[type="submit"]');
  if (!b) return false;
  b.click();
  return true;
})()`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/cours/linux-debutant' });
  await waitFor(`!!document.querySelector('#main h1')`);
  check('Lien d\'évaluation sur la page du cours', await evaluate(`!![...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '#/evaluation/linux-debutant')`));

  await send('Page.navigate', { url: BASE + '#/evaluation/linux-debutant' });
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('Évaluation finale')`);
  check('Page d\'évaluation', true);
  const startBtn = `[...document.querySelectorAll('button')].find((b) => b.textContent.includes("Commencer l'évaluation"))`;
  check('Bouton de démarrage présent', await evaluate(`!!${startBtn}`));
  check('Mention non sécurisée', (await evaluate(`document.querySelector('#main').textContent`)).includes('ni une certification'));

  await evaluate(`(${startBtn}).click(), true`);
  await waitFor(`!!document.querySelector('#quiz-question-title')`);
  check('Évaluation démarrée', (await evaluate(`document.querySelector('.quiz-shell .badge').textContent`)).includes('Question 1'));

  let guard = 0;
  while (guard < 20) {
    const finished = await evaluate(`!!document.querySelector('.score-ring')`);
    if (finished) break;
    await answerCurrent();
    await submit();
    await sleep(150);
    await submit();
    await sleep(150);
    guard += 1;
  }
  await waitFor(`!!document.querySelector('.score-ring')`);
  check('Résultat affiché', (await evaluate(`document.querySelector('.score-ring').textContent`)).match(/\d+ \/ \d+/) !== null);

  const stored = await evaluate(`JSON.parse(localStorage.getItem('kernova:v1') || '{}')`);
  const finals = (stored.quizResults || []).filter((r) => r.quizId === 'linux-debutant-final');
  check('Résultat enregistré comme évaluation finale', finals.length === 1, JSON.stringify(finals.map((r) => r.quizId)));

  await send('Page.navigate', { url: BASE + '#/cours/linux-debutant' });
  await waitFor(`!!document.querySelector('#main h1')`);
  check('Meilleur score affiché sur le cours', (await evaluate(`document.querySelector('#main').textContent`)).includes('Évaluation finale ('));

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
