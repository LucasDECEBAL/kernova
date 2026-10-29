import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9364;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-mobile-'));
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
  console.log(`${ok ? 'OK  ' : 'KO  '} ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });

  const routes = ['', '#/catalogue', '#/cours/linux-debutant', '#/cours/linux-debutant/linux-01', '#/quiz/linux-debutant/linux-06', '#/cartes', '#/tableau-de-bord', '#/donnees', '#/fiches', '#/projets', '#/projets/linux-administration', '#/evaluation/linux-debutant', '#/labo', '#/playground', '#/terminal', '#/reseau', '#/execution'];
  for (const route of routes) {
    await send('Page.navigate', { url: BASE + route });
    await waitFor(`!!document.querySelector('#main h1') || !!document.querySelector('.term-screen')`, 15000);
    await sleep(300);
    const info = await evaluate(`(() => {
      const doc = document.documentElement;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > window.innerWidth + 1;
        })
        .slice(0, 4)
        .map((el) => el.tagName.toLowerCase() + '.' + (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : ''));
      return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, offenders };
    })()`);
    check(`${route || '/'} : ${info.innerWidth}px, débordement=${info.scrollWidth > info.innerWidth}`, info.scrollWidth <= info.innerWidth, JSON.stringify(info));
  }

  await send('Page.navigate', { url: BASE + '' });
  await waitFor(`!!document.querySelector('.hero h1')`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'kp-mobile-390.png'), Buffer.from(shot.data, 'base64'));
} catch (e) {
  check('Scénario interrompu', false, e.message);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} pages sans débordement horizontal`);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
}
