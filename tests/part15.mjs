import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME_PATH } from './lib/env.mjs';
const PORT = 9408; const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-p15-'));
const chrome = spawn(CHROME_PATH, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await sleep(200); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map(); const issues = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.exceptionThrown') issues.push(m.params.exceptionDetails.text); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') issues.push('ERR'); };
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expression, timeout = 10000) => { const start = Date.now(); while (Date.now() - start < timeout) { try { if (await evaluate(expression)) return true; } catch {} await sleep(120); } throw new Error('délai dépassé : ' + expression); };
const results = []; const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`); };
const answer = async (value) => { await evaluate(`(() => { const input = document.querySelector('#exercise-answer'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('.exercise button')].find((b) => b.textContent.includes('Vérifier')).click(); return true; })()`); await sleep(150); };
const open = async (hash) => { await send('Page.navigate', { url: BASE + '#' + hash }); await waitFor(`!!document.querySelector('#chapter-title')`); };
const ok = async () => (await evaluate(`document.querySelector('.exercise-feedback')?.className || ''`)).includes('ok');
try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '#/catalogue' });
  await waitFor(`document.querySelector('#cat-count')?.textContent.startsWith('193 r')`);
  check('Catalogue : 193 cours', true);
  for (const [domain, expected] of [['ethical-hacking', '5 r'], ['cybersecurite', '21 r'], ['cloud-computing', '12 r']]) {
    await evaluate(`(() => { const el = document.querySelector('#cat-domain'); el.value = ${JSON.stringify(domain)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitFor(`document.querySelector('#cat-count').textContent.startsWith('${expected}')`);
    check(`Domaine ${domain} : ${expected}`, true);
  }
  const cases = [
    ['/cours/pentest-methode/pm-01', 'passive, sans contacter la cible', 'Pentest : passif accepté'],
    ['/cours/soc/soc-01', 'il surveille, détecte et répond', 'SOC accepté'],
    ['/cours/incident/inc-01', "qualifier la gravité et la portée", 'Incident : qualification acceptée'],
    ['/cours/crypto-avance/cra-01', 'les erreurs de mise en œuvre cassent la sécurité', 'Crypto : fondamentaux acceptés'],
    ['/cours/cloud-fondamentaux/clf-01', 'des ressources provisionnées à la demande', 'Cloud : à la demande accepté'],
    ['/cours/aws-fondamentaux/awf-01', 'la region et les services adaptes', 'AWS : fondamentaux acceptés'],
    ['/cours/azure-fondamentaux/azf-01', 'une facturation a l usage', 'Azure : usage accepté']
  ];
  for (const [hash, value, label] of cases) { await open(hash); await answer(value); check(label, await ok()); }
  check('Aucune erreur console', issues.length === 0, issues.join(' | '));
} catch (e) { check('Scénario interrompu', false, e.message); }
finally { const failed = results.filter((r) => !r).length; console.log(`\n${results.length - failed}/${results.length} vérifications réussies`); ws.close(); chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(failed || issues.length ? 1 : 0); }
