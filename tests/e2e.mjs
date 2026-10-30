import { ROOT, CHROME_PATH } from './lib/env.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = CHROME_PATH;
const PORT = 9333;
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* Chrome démarre */ }
    await sleep(200);
  }
  throw new Error('Chrome ne répond pas');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const consoleIssues = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleIssues.push('exception: ' + (d.exception?.description || d.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    consoleIssues.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (method, params = {}) => {
  const myId = ++seq;
  ws.send(JSON.stringify({ id: myId, method, params }));
  return new Promise((res, rej) => pending.set(myId, { res, rej }));
};
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(expr)) return true; } catch { /* réessaie */ }
    await sleep(100);
  }
  throw new Error('délai dépassé : ' + expr);
}
const J = JSON.stringify;
const clickText = (sel, text) => evaluate(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((e) => e.textContent.includes(${J(text)})); if (!el) return 'NOTFOUND'; el.click(); return 'OK'; })()`);
const setHash = (hash) => evaluate(`location.hash = ${J(hash)}`);
const storage = () => evaluate(`JSON.parse(localStorage.getItem('kernova:v1') || 'null')`);
const text = (sel) => evaluate(`(document.querySelector(${J(sel)}) || {}).textContent || ''`);

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`); };

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Page.navigate', { url: BASE });
  await waitFor(`!!document.querySelector('.hero h1')`);
  check('Accueil charge', (await text('.hero h1')).includes('informatique'));

  // ---------- Catalogue ----------
  await setHash('#/catalogue');
  await waitFor(`!!document.querySelector('#cat-search')`);
  const setInput = (sel, value, evt = 'input') => evaluate(`(() => { const el = document.querySelector(${J(sel)}); el.value = ${J(value)}; el.dispatchEvent(new Event(${J(evt)}, { bubbles: true })); return true; })()`);
  await setInput('#cat-search', 'CHMOD');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('1 r')`);
  check('Recherche insensible à la casse', (await text('#cat-list')).includes('Linux débutant'));
  await setInput('#cat-search', 'zzqx');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('0 r')`);
  check('État vide quand la recherche échoue', (await text('#cat-list')).includes('Aucun résultat'));
  await setInput('#cat-search', '');
  await setInput('#cat-level', 'avance', 'change');
  await waitFor(`/^\\d+ r/.test(document.querySelector('#cat-count').textContent) && document.querySelectorAll('.course-row').length > 0`);
  check('Filtre difficulté avancée', true);
  await setInput('#cat-level', 'debutant', 'change');
  await setInput('#cat-duration', 'long', 'change');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('2 r')`);
  check('Filtre durée > 3 h', true);
  await setInput('#cat-duration', 'short', 'change');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('0 r')`);
  check('Filtres combinables (durée courte = 0)', true);
  await setInput('#cat-duration', '', 'change');
  await setInput('#cat-tech', 'Bash', 'change');
  await waitFor(`/\\d+ r/.test(document.querySelector('#cat-count').textContent) && document.querySelectorAll('.course-row').length > 0`);
  check('Filtre technologie Bash', (await text('#cat-list')).toLowerCase().includes('bash'));
  await setInput('#cat-tech', 'Terminal', 'change');
  await waitFor(`/\\d+ r/.test(document.querySelector('#cat-count').textContent) && document.querySelectorAll('.course-row').length > 0`);
  check('Filtre technologie Terminal', (await text('#cat-list')).toLowerCase().includes('terminal'));
  await setInput('#cat-level', 'avance', 'change');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('0 r')`);
  await setInput('#cat-level', 'debutant', 'change');
  await setInput('#cat-tech', '', 'change');
  check('Filtre technologie', true);
  await setInput('#cat-tech', '', 'change');
  await setInput('#cat-sort', 'duration', 'change');
  await setInput('#cat-type', 'parcours', 'change');
  await waitFor(`/^\\d+ r/.test(document.querySelector('#cat-count').textContent) && document.querySelectorAll('.course-row').length > 0`);
  check('Filtre type de contenu + tri', true);
  // Réinitialisation
  await clickText('button', 'Réinitialiser les filtres');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('273 r') && document.querySelector('#cat-type').value === ''`);
  check('Réinitialiser les filtres', true);
  // Favori depuis le catalogue
  await setInput('#cat-search', 'Linux débutant');
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('1 r')`);
  await evaluate(`document.querySelector('.course-row .course-actions button[aria-pressed]').click(), true`);
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').favorites||[]).includes('linux-debutant')`);
  check('Favori ajouté et persisté', true);
  await setInput('#cat-fav', '', 'change').catch(() => {});
  await evaluate(`(() => { const c = document.querySelector('#cat-fav'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`document.querySelector('#cat-count').textContent.startsWith('1 r')`);
  check('Filtre favoris uniquement', true);
  await evaluate(`(() => { const c = document.querySelector('#cat-fav'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

  // ---------- Leçons et progression ----------
  await setHash('#/cours/linux-debutant/linux-03');
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('Naviguer')`);
  check('Chapitre verrouillé affiche un message', (await text('#main')).includes('verrouillé'));

  await setHash('#/cours/linux-debutant/linux-01');
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('Découvrir Linux')`);
  check('Chapitre 1 accessible', true);
  await clickText('button', 'Marquer comme terminé');
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').progress?.['linux-debutant']?.completed||{})['linux-01']`);
  check('Terminer un chapitre persiste', true);

  // Notes
  await evaluate(`(() => { const t = document.querySelector('#notes'); t.value = 'Rappel : pwd affiche le dossier courant'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').notes||{})['linux-debutant/linux-01']?.includes('pwd')`, 4000);
  check('Notes sauvegardées automatiquement', true);

  // Exercice : indices progressifs
  const hintsBefore = await evaluate(`document.querySelectorAll('.hint-list li').length`);
  await clickText('button', 'Indice suivant');
  await waitFor(`document.querySelectorAll('.hint-list li').length > ${hintsBefore}`);
  check('Indice progressif affiché', true);
  await clickText('button', 'Voir la solution');
  check('Solution affichée à la demande', (await text('#main')).includes('Solution'));

  // Chapitre 2 se débloque
  await setHash('#/cours/linux-debutant/linux-02');
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('Comprendre le terminal')`);
  check('Chapitre suivant débloqué après validation', true);
  await clickText('button', 'Marquer comme terminé');
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').progress?.['linux-debutant']?.completed||{})['linux-02']`);
  // Retour arrière : annulation
  await clickText('button', 'Terminé (annuler)');
  await waitFor(`!(JSON.parse(localStorage.getItem('kernova:v1')||'{}').progress?.['linux-debutant']?.completed||{})['linux-02']`);
  check('Annuler un chapitre terminé', true);
  await clickText('button', 'Marquer comme terminé');
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').progress?.['linux-debutant']?.completed||{})['linux-02']`);

  // Arbre de compétences : clic sur une compétence
  await setHash('#/cours/linux-debutant');
  await waitFor(`!!document.querySelector('.skill-node')`);
  await evaluate(`document.querySelectorAll('.skill-node')[3].click(), true`);
  check('Arbre : clic affiche le détail', (await text('.skill-detail')).includes('Naviguer dans les dossiers'));
  const done = await evaluate(`document.querySelectorAll('.skill-node[data-status="done"]').length`);
  check('Arbre : compétences terminées marquées', done === 2, `terminées=${done}`);
  check('Arbre : compétence verrouillée marquée', (await evaluate(`document.querySelectorAll('.skill-node[data-status="locked"]').length`)) >= 1);

  // ---------- Quiz ----------
  await setHash('#/quiz/linux-debutant/linux-01');
  await waitFor(`!!document.querySelector('#main button[type="button"]')`);
  await evaluate(`document.querySelector('#q-shuffle-q').checked && document.querySelector('#q-shuffle-q').click(), true`);
  await clickText('button', 'Démarrer le quiz');
  await waitFor(`!!document.querySelector('#quiz-question-title')`);
  const pick = (labelText) => evaluate(`(() => { const l = [...document.querySelectorAll('.answer-option')].find((e) => e.textContent.includes(${J(labelText)})); if (!l) return 'NOTFOUND'; l.querySelector('input').click(); return 'OK'; })()`);
  const submit = () => evaluate(`(document.querySelector('.quiz-actions button[type="submit"]').click(), true)`);
  // Q1 : bonne réponse (ordre des options mélangé : on cible par libellé)
  let q1Question = await text('#quiz-question-title');
  check('Quiz : question affichée', q1Question.length > 5);
  const firstAnswers = await evaluate(`[...document.querySelectorAll('.answer-option')].map(e => e.textContent)`);
  const correct = firstAnswers.find((a) => a.includes('Le cœur du système'));
  if (!correct) check('Quiz : option correcte présente (ordre)', false, J(firstAnswers));
  await pick('Le cœur du système');
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Bonne réponse')`);
  check('Quiz : bonne réponse validée', true);
  await clickText('button', 'Question suivante');
  await waitFor(`document.querySelector('#quiz-question-title')?.textContent.includes('Sous Linux')`);
  await pick('Faux');
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Bonne réponse')`);
  check('Quiz : vrai/faux corrigé', true);
  await clickText('button', 'Voir le résultat');
  await waitFor(`!!document.querySelector('.score-ring')`);
  check('Quiz : score final 2 / 2', (await text('.score-ring')).includes('2 / 2'), await text('.score-ring'));
  const qr = await storage();
  check('Quiz : résultat sauvegardé', qr.quizResults.length >= 1 && qr.quizResults[qr.quizResults.length - 1].percent === 100);

  // Quiz 2 : mauvaise réponse puis tentative restante
  await setHash('#/quiz/linux-debutant/linux-06');
  await waitFor(`!!document.querySelector('#main button')`);
  await evaluate(`['#q-shuffle-q','#q-shuffle-a'].forEach((s) => { const c = document.querySelector(s); if (c.checked) c.click(); }), true`);
  await clickText('button', 'Démarrer le quiz');
  await waitFor(`!!document.querySelector('#quiz-question-title')`);
  await pick('Un fichier lisible par tous');
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Réponse incorrecte')`);
  check('Quiz : mauvaise réponse détectée', true);
  check('Quiz : tentative restante indiquée', (await text('.quiz-feedback')).includes('Tentatives restantes : 1'), await text('.quiz-feedback'));
  await pick('Un dossier : propriétaire');
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Bonne réponse')`);
  check('Quiz : nouvelle tentative acceptée', true);
  await clickText('button', 'Question suivante');
  await waitFor(`document.querySelector('#quiz-question-title')?.textContent.includes('mode octal')`);
  await evaluate(`(() => { const i = document.querySelector('input[type="text"]'); i.value = '  644 '; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Bonne réponse')`);
  check('Quiz : réponse texte normalisée (espaces)', true);
  await clickText('button', 'Question suivante');
  await waitFor(`document.querySelector('#quiz-question-title')?.textContent.includes('recommandé')`);
  await pick('Faux');
  await submit();
  await waitFor(`document.querySelector('.quiz-feedback')?.textContent.includes('Bonne réponse')`);
  await clickText('button', 'Voir le résultat');
  await waitFor(`!!document.querySelector('.score-ring')`);
  check('Quiz 2 : score 3 / 3 après tentative', (await text('.score-ring')).includes('3 / 3'), await text('.score-ring'));

  // ---------- Tableau de bord ----------
  await setHash('#/tableau-de-bord');
  await waitFor(`!!document.querySelector('.kpis')`);
  check('Tableau de bord reflète l\'activité', !(await text('#main')).includes('Aucune activité'));
  check('Tableau de bord : badge « Premier pas » obtenu', (await text('.badges-grid')).includes('Premier pas'));

  // ---------- Recherche globale ----------
  await evaluate(`(() => { const i = document.querySelector('#global-search-input'); i.value = 'chmod'; document.querySelector('#global-search').requestSubmit(); return true; })()`);
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('chmod')`);
  check('Recherche globale : résultats chapitres', (await text('#main')).includes('Comprendre les permissions'));

  // Raccourci clavier
  await setHash('#/');
  await waitFor(`!!document.querySelector('.hero h1')`);
  await evaluate(`document.body.focus(), document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' })), true`);
  check('Raccourci « / » place le focus sur la recherche', (await evaluate(`document.activeElement?.id`)) === 'global-search-input');

  // ---------- Thème ----------
  const before = await evaluate(`document.documentElement.dataset.theme`);
  await evaluate(`document.querySelector('#theme-toggle').click(), true`);
  await sleep(100);
  const after = await evaluate(`document.documentElement.dataset.theme`);
  check('Bascule de thème', before !== after, `${before} -> ${after}`);
  check('Thème persisté', (await storage()).prefs.theme === after);

  // ---------- Données : import invalide, import valide, réinitialisation ----------
  await setHash('#/donnees');
  await waitFor(`!!document.querySelector('#import-file')`);
  const badFile = path.join(os.tmpdir(), 'kp-bad.json');
  fs.writeFileSync(badFile, JSON.stringify({ hello: 'world' }));
  const goodFile = path.join(os.tmpdir(), 'kp-good.json');
  fs.writeFileSync(goodFile, JSON.stringify({ app: 'kernova', data: { schema: 1, favorites: ['linux-debutant', 'inconnu', 'linux-debutant'], progress: { 'linux-debutant': { completed: { 'linux-01': '2026-10-01', 'linux-02': 'pas une date' }, lastChapter: 'linux-01' } } } }));
  const setFile = async (file) => {
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-file' });
    await send('DOM.setFileInputFiles', { nodeId, files: [file] });
  };
  const confirmDialogOk = async () => {
    await waitFor(`!!document.querySelector('dialog[open]')`);
    await evaluate(`(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => x.classList.contains('btn-primary') || x.classList.contains('btn-danger') ); b.click(); return true; })()`);
  };
  const clickImport = () => clickText('button', 'Importer le fichier');
  await setFile(badFile);
  await clickImport();
  await confirmDialogOk();
  await waitFor(`document.querySelector('[role="status"][aria-live="polite"]')?.textContent.includes('Import impossible')`);
  check('Import : fichier invalide refusé', true);
  await setFile(goodFile);
  await clickImport();
  await confirmDialogOk();
  await waitFor(`document.querySelector('[role="status"][aria-live="polite"]')?.textContent.includes('Import réussi')`);
  const imported = await storage();
  check('Import : valeurs valides importées', imported.progress['linux-debutant'].completed['linux-01'] === '2026-10-01');
  check('Import : entrées invalides écartées', imported.favorites.filter((f) => f === 'linux-debutant').length === 1 && !imported.progress['linux-debutant'].completed['linux-02']);

  // Export : le bouton déclenche un téléchargement (vérifié par l'absence d'erreur)
  await clickText('button', 'Exporter mes données');
  check('Export lancé sans erreur', true);

  await clickText('button', 'Réinitialiser');
  await confirmDialogOk();
  await waitFor(`!(JSON.parse(localStorage.getItem('kernova:v1')||'{}').progress||{})['linux-debutant']`);
  check('Réinitialisation effacée après confirmation', true);

  // Routes inconnues
  await setHash('#/page-inexistante');
  await waitFor(`document.querySelector('#main')?.textContent.includes('Page introuvable')`);
  check('Page introuvable affichée', true);

  // ---------- Cartes mémo ----------
  await setHash('#/cartes');
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Cartes mémo'`);
  check('Cartes : paquets listés', (await text('#main')).includes('Linux') && (await text('#main')).includes('Réseaux'));

  await setHash('#/cartes/linux?mode=due');
  await waitFor(`!!document.querySelector('.flashcard')`);
  check('Séance : première carte affichée', (await text('.flash-stage, #main')).includes('Carte 1 sur 8'));
  await evaluate(`document.querySelector('.flashcard').click(), true`);
  await waitFor(`document.querySelector('.flashcard')?.classList.contains('is-flipped')`);
  check('Séance : retournement de la carte', true);
  await clickText('button', 'À revoir');
  await waitFor(`(await_text => true)() && document.querySelector('#main')?.textContent.includes('Carte 2 sur 8')`);
  check('Séance : « À revoir » passe à la carte suivante', true);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })), true`);
  await waitFor(`document.querySelector('.flashcard')?.classList.contains('is-flipped')`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })), true`);
  await waitFor(`document.querySelector('#main')?.textContent.includes('Carte 3 sur 8')`);
  check('Séance : raccourcis Espace et 2 (maîtrisé)', true);
  const stored = await storage();
  check('Séance : réponses enregistrées dans la révision espacée', Object.keys(stored.cards.review).length === 2);
  check('Séance : carte « à revoir » absente de la séance du jour', !(await text('#main')).includes('Carte 1 sur'));

  // Séance complète jusqu'au résumé
  await setHash('#/cartes/python?mode=all');
  for (let i = 0; i < 8; i++) {
    await waitFor(`!!document.querySelector('.flashcard')`);
    await evaluate(`document.querySelector('.flashcard').click(), true`);
    await waitFor(`!!document.querySelector('.flash-grade')`);
    await clickText('button', 'Maîtrisé');
    await sleep(60);
  }
  await waitFor(`document.querySelector('#main')?.textContent.includes('Séance terminée')`);
  check('Séance : résumé de fin', (await text('#main')).includes('8 carte(s) vues'));

  // Cartes personnelles
  await setHash('#/cartes');
  await waitFor(`!!document.querySelector('#card-q')`);
  await evaluate(`(() => { document.querySelector('#card-q').value = ''; document.querySelector('#card-a').value = ''; document.querySelector('#card-q').closest('form').requestSubmit(); return true; })()`);
  await waitFor(`document.querySelector('#main')?.textContent.includes('La question est vide')`);
  check('Carte personnelle : question vide refusée', true);
  await evaluate(`(() => { document.querySelector('#card-q').value = 'Test question'; document.querySelector('#card-a').value = 'Test réponse'; document.querySelector('#card-q').closest('form').requestSubmit(); return true; })()`);
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').cards?.custom||[]).length === 1`);
  check('Carte personnelle ajoutée et persistée', true);
  await clickText('button', 'Modifier');
  await waitFor(`!!document.querySelector('#custom-list form')`);
  await evaluate(`(() => { const f = document.querySelector('#custom-list form'); f.querySelector('textarea').value = 'Question modifiée'; f.requestSubmit(); return true; })()`);
  await waitFor(`document.querySelector('#custom-list')?.textContent.includes('Question modifiée')`);
  check('Carte personnelle modifiée', true);
  await clickText('button', 'Supprimer');
  await waitFor(`!!document.querySelector('dialog[open]')`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.classList.contains('btn-danger')); b.click(); return true; })()`);
  await waitFor(`(JSON.parse(localStorage.getItem('kernova:v1')||'{}').cards?.custom||[]).length === 0`);
  check('Carte personnelle supprimée après confirmation', true);

  await setHash('#/cartes/perso');
  await waitFor(`document.querySelector('#main')?.textContent.includes('Ce paquet est vide') || document.querySelector('#main')?.textContent.includes('Aucune carte')`);
  check('Paquet personnel vide : état vide', true);
  // ---------- Erreurs console ----------
  check('Aucune erreur console ni exception', consoleIssues.length === 0, consoleIssues.join(' | '));
} catch (err) {
  check('Scénario interrompu', false, err.message);
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
  console.log(`Erreurs console : ${consoleIssues.length}`);
  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignoré */ }
  process.exit(failed ? 1 : 0);
}
