// Exécution réelle de Python (Pyodide) et de SQL (SQLite WebAssembly) dans le navigateur.
// Si un runtime ne se charge pas, l'échec est affiché : aucun résultat n'est simulé.

import { h, icon, emptyState, alertBox } from '../core/dom.js';
import { getExecutionData } from '../core/data.js';
import { createEditor } from '../components/editor.js';
import { runPython } from '../runtime/python.js';
import { createDemoDatabase, runSql } from '../runtime/sql.js';
import { copyText, toast } from '../core/ui.js';

const DRAFT_KEY = 'kernova:execution:v1';

function readDrafts() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return {
      python: typeof data?.python === 'string' ? data.python : null,
      sql: typeof data?.sql === 'string' ? data.sql : null
    };
  } catch {
    return { python: null, sql: null };
  }
}

function writeDrafts(state) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignoré */ }
}

export function renderExecutionPage({ outlet }) {
  const data = getExecutionData();
  if (!data) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Exécution indisponible', text: 'Les exemples n\'ont pas pu être chargés.' })));
    return undefined;
  }

  const drafts = readDrafts();
  const pyExamples = data.python.examples || [];
  const sqlExamples = data.sql.examples || [];
  const values = {
    python: drafts.python ?? pyExamples[0]?.code ?? '',
    sql: drafts.sql ?? sqlExamples[0]?.query ?? ''
  };

  let tab = 'python';
  let sqlDb = null;
  let running = false;

  /* ---------- Python ---------- */

  const pyStatus = h('p', { class: 'exec-status small', role: 'status', 'aria-live': 'polite' });
  const pyOut = h('pre', { class: 'exec-out', 'aria-label': 'Sortie standard' });
  const pyErr = h('pre', { class: 'exec-err', 'aria-label': 'Sortie d\'erreur' });

  const pyExampleSelect = h('select', {
    id: 'py-example',
    'aria-label': 'Exemple Python',
    onChange: (e) => {
      const example = pyExamples.find((x) => x.id === e.target.value);
      if (!example) return;
      values.python = example.code;
      pyEditor.setValue(example.code);
      pyOut.textContent = '';
      pyErr.textContent = '';
      pyStatus.textContent = 'Exemple chargé.';
      persist();
    }
  }, pyExamples.map((x) => h('option', { value: x.id }, x.title)));

  const pyEditor = createEditor({
    label: 'Code Python',
    language: 'python',
    value: values.python,
    onInput: (value) => { values.python = value; persist(); }
  });

  const pyRunBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('play', { size: 16 }), 'Exécuter');
  const pyResetBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: () => {
      const example = pyExamples.find((x) => x.id === pyExampleSelect.value) || pyExamples[0];
      if (!example) return;
      values.python = example.code;
      pyEditor.setValue(example.code);
      pyOut.textContent = '';
      pyErr.textContent = '';
      pyStatus.textContent = 'Exemple restauré.';
      persist();
    }
  }, icon('refresh', { size: 16 }), 'Réinitialiser');
  const pyCopyBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: async () => {
      const ok = await copyText(pyEditor.getValue());
      toast(ok ? 'Code copié.' : 'Copie impossible.', ok ? 'success' : 'error', 2000);
    }
  }, icon('copy', { size: 16 }), 'Copier');

  async function executerPython() {
    if (running) return;
    running = true;
    pyRunBtn.disabled = true;
    pyOut.textContent = '';
    pyErr.textContent = '';
    pyStatus.textContent = 'Préparation du runtime…';
    try {
      const result = await runPython(pyEditor.getValue(), {
        onStatus: (text) => { pyStatus.textContent = text; },
        onOutput: (text) => { pyOut.textContent += text; }
      });
      if (!result.ok) {
        pyStatus.textContent = 'Erreur d\'exécution.';
        pyErr.textContent += `\n${result.error}`;
      } else {
        pyStatus.textContent = 'Exécution terminée.';
      }
    } catch (err) {
      pyStatus.textContent = 'Runtime Python indisponible';
      pyErr.textContent = `${err.message}\nLe code n'a pas été exécuté : aucun résultat simulé n'est affiché.`;
    } finally {
      running = false;
      pyRunBtn.disabled = false;
    }
  }
  pyRunBtn.addEventListener('click', executerPython);

  pyEditor.element.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); executerPython(); }
  });

  /* ---------- SQL ---------- */

  const sqlStatus = h('p', { class: 'exec-status small', role: 'status', 'aria-live': 'polite' });
  const sqlMessage = h('div', { class: 'exec-message', role: 'status' });
  const sqlResults = h('div', { class: 'exec-results' });

  const sqlExampleSelect = h('select', {
    id: 'sql-example',
    'aria-label': 'Exemple SQL',
    onChange: (e) => {
      const example = sqlExamples.find((x) => x.id === e.target.value);
      if (!example) return;
      values.sql = example.query;
      sqlEditor.setValue(example.query);
      persist();
    }
  }, sqlExamples.map((x) => h('option', { value: x.id }, x.title)));

  const sqlEditor = createEditor({
    label: 'Requête SQL',
    language: 'sql',
    value: values.sql,
    onInput: (value) => { values.sql = value; persist(); }
  });

  const sqlRunBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('play', { size: 16 }), 'Exécuter');
  const sqlResetBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: () => {
      const example = sqlExamples.find((x) => x.id === sqlExampleSelect.value) || sqlExamples[0];
      if (!example) return;
      values.sql = example.query;
      sqlEditor.setValue(example.query);
      sqlDb = null;
      sqlResults.replaceChildren();
      sqlMessage.textContent = '';
      sqlStatus.textContent = 'Base et requête réinitialisées.';
      persist();
    }
  }, icon('refresh', { size: 16 }), 'Réinitialiser');
  const sqlCopyBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: async () => {
      const ok = await copyText(sqlEditor.getValue());
      toast(ok ? 'Requête copiée.' : 'Copie impossible.', ok ? 'success' : 'error', 2000);
    }
  }, icon('copy', { size: 16 }), 'Copier');

  function renderTable(set) {
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'exec-table' },
        h('thead', {}, h('tr', {}, set.columns.map((c) => h('th', { scope: 'col', text: c })))),
        h('tbody', {}, set.values.map((row) => h('tr', {}, row.map((value) => h('td', {
          text: value === null ? 'NULL' : String(value)
        })))))));
  }

  async function executerSql() {
    if (running) return;
    running = true;
    sqlRunBtn.disabled = true;
    sqlResults.replaceChildren();
    sqlMessage.replaceChildren();
    sqlStatus.textContent = 'Préparation du moteur SQLite…';
    try {
      if (!sqlDb) {
        sqlDb = await createDemoDatabase(data.sql.schema, (text) => { sqlStatus.textContent = text; });
      }
      const result = runSql(sqlDb, sqlEditor.getValue());
      if (result.error) {
        sqlStatus.textContent = 'Erreur SQL.';
        sqlMessage.replaceChildren(alertBox('danger', result.error));
        return;
      }
      if (!result.results.length) {
        sqlStatus.textContent = `Requête exécutée. ${result.modified} ligne(s) modifiée(s).`;
        return;
      }
      const rows = result.results.reduce((sum, set) => sum + set.values.length, 0);
      sqlStatus.textContent = `Requête exécutée. ${rows} ligne(s) renvoyée(s).`;
      sqlResults.replaceChildren(...result.results.map(renderTable));
    } catch (err) {
      sqlStatus.textContent = 'Moteur SQLite indisponible';
      sqlMessage.replaceChildren(alertBox('danger',
        `${err.message} La requête n'a pas été exécutée : aucun résultat simulé n'est affiché.`));
    } finally {
      running = false;
      sqlRunBtn.disabled = false;
    }
  }
  sqlRunBtn.addEventListener('click', executerSql);

  sqlEditor.element.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); executerSql(); }
  });

  /* ---------- Onglets ---------- */

  const pyTab = h('button', {
    class: 'pg-tab is-active',
    type: 'button',
    role: 'tab',
    id: 'tab-python',
    'aria-selected': 'true',
    'aria-controls': 'panel-python'
  }, 'Python');
  const sqlTab = h('button', {
    class: 'pg-tab',
    type: 'button',
    role: 'tab',
    id: 'tab-sql',
    'aria-selected': 'false',
    'aria-controls': 'panel-sql',
    tabIndex: -1
  }, 'SQL');

  const pyPanel = h('div', { id: 'panel-python', role: 'tabpanel', 'aria-labelledby': 'tab-python' });
  const sqlPanel = h('div', { id: 'panel-sql', role: 'tabpanel', 'aria-labelledby': 'tab-sql', hidden: true });

  pyPanel.append(
    h('div', { class: 'exec-toolbar' },
      h('div', { class: 'field', style: 'min-width:220px' }, h('label', { for: 'py-example' }, 'Exemple'), pyExampleSelect),
      h('div', { class: 'row', style: 'margin-left:auto' }, pyRunBtn, pyResetBtn, pyCopyBtn)),
    pyEditor.element,
    pyStatus,
    h('div', { class: 'exec-console' }, pyOut, pyErr)
  );

  sqlPanel.append(
    h('div', { class: 'exec-toolbar' },
      h('div', { class: 'field', style: 'min-width:220px' }, h('label', { for: 'sql-example' }, 'Exemple'), sqlExampleSelect),
      h('div', { class: 'row', style: 'margin-left:auto' }, sqlRunBtn, sqlResetBtn, sqlCopyBtn)),
    sqlEditor.element,
    sqlStatus,
    sqlMessage,
    sqlResults,
    h('p', { class: 'small muted' },
      'La base de démonstration contient les tables clients et commandes. Elle est recréée à chaque réinitialisation, en mémoire uniquement.')
  );

  function selectTab(next) {
    tab = next;
    const isPy = next === 'python';
    pyTab.classList.toggle('is-active', isPy);
    sqlTab.classList.toggle('is-active', !isPy);
    pyTab.setAttribute('aria-selected', String(isPy));
    sqlTab.setAttribute('aria-selected', String(!isPy));
    pyTab.tabIndex = isPy ? 0 : -1;
    sqlTab.tabIndex = isPy ? -1 : 0;
    pyPanel.hidden = !isPy;
    sqlPanel.hidden = isPy;
    (isPy ? pyEditor : sqlEditor).focus();
  }
  pyTab.addEventListener('click', () => selectTab('python'));
  sqlTab.addEventListener('click', () => selectTab('sql'));

  function persist() { writeDrafts({ python: values.python, sql: values.sql }); }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {}, h('li', {}, h('a', { href: '#/labo' }, 'Labo')), h('li', { 'aria-current': 'page' }, 'Python et SQL'))),
    h('header', { class: 'page-head' },
      h('div', { class: 'row' }, h('h1', { tabindex: '-1', text: 'Python et SQL' }), h('span', { class: 'badge', 'data-tone': 'info' }, 'exécution réelle')),
      h('p', { text: 'Le code s\'exécute réellement dans votre navigateur : Python via Pyodide, SQL via SQLite compilé en WebAssembly.' })),
    alertBox('info', 'Les runtimes sont téléchargés depuis un CDN au premier lancement (plusieurs mégaoctets). Sans connexion, un message l\'indiquera et rien ne sera exécuté. Vos modifications restent sur cet appareil.'),
    h('div', { class: 'pg-tabs', role: 'tablist', 'aria-label': 'Langage' }, pyTab, sqlTab),
    pyPanel,
    sqlPanel,
    h('p', { class: 'small muted' }, 'Limites : une boucle infinie ou une requête très lourde peut figer l\'onglet ; rechargez la page dans ce cas. Les appels réseau, l\'accès aux fichiers de votre machine et les paquets ne sont pas disponibles.')
  ));

  writeDrafts({ python: values.python, sql: values.sql });
  return () => writeDrafts({ python: values.python, sql: values.sql });
}
