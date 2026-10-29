// Playground : éditeur HTML/CSS/JS avec aperçu réel dans une iframe isolée,
// console capturée via postMessage, exemples, solution et sauvegarde locale.

import { h, icon, emptyState, alertBox, setChildren } from '../core/dom.js';
import { getPlaygroundExamples } from '../core/data.js';
import { createEditor } from '../components/editor.js';
import { codeBlock } from '../components/widgets.js';
import { toast, confirmDialog, copyText } from '../core/ui.js';
import { debounce } from '../core/utils.js';

const TABS = [
  { id: 'html', label: 'HTML', lang: 'html' },
  { id: 'css', label: 'CSS', lang: 'css' },
  { id: 'js', label: 'JavaScript', lang: 'js' }
];

const DRAFT_PREFIX = 'kernova:playground:';

const CONSOLE_SHIM = `(function(){
  function serialiser(v){
    try {
      if (typeof v === 'string') return v;
      if (v instanceof Error) return v.message;
      return JSON.stringify(v);
    } catch (e) { return String(v); }
  }
  function envoyer(niveau, args){
    parent.postMessage({
      type: 'kernova-playground',
      niveau: niveau,
      texte: Array.prototype.map.call(args, serialiser).join(' ')
    }, '*');
  }
  var log = console.log, err = console.error, warn = console.warn;
  console.log = function(){ log.apply(console, arguments); envoyer('log', arguments); };
  console.error = function(){ err.apply(console, arguments); envoyer('error', arguments); };
  console.warn = function(){ warn.apply(console, arguments); envoyer('warn', arguments); };
  window.addEventListener('error', function(e){ envoyer('error', [e.message + ' (ligne ' + e.lineno + ')']); });
  window.addEventListener('unhandledrejection', function(e){ envoyer('error', ['Promesse rejetée : ' + serialiser(e.reason)]); });
})();`;

function buildDoc({ html, css, js }) {
  const safeCss = String(css || '').replace(/<\/style/gi, '<\\/style');
  const safeJs = String(js || '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${safeCss}</style></head><body>${html || ''}`
    + `<script>${CONSOLE_SHIM}</script>`
    + `<script>try{${safeJs}}catch(e){console.error(e && e.message ? e.message : String(e));}</script>`
    + `</body></html>`;
}

function readDraft(id) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.html !== 'string' || typeof data.css !== 'string' || typeof data.js !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function writeDraft(id, values) {
  try {
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ ...values, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

function clearDraft(id) {
  try { localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* ignoré */ }
}

export function renderPlaygroundPage({ outlet, params }) {
  const examples = getPlaygroundExamples();
  if (!examples.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Playground indisponible',
        text: 'Les exemples n\'ont pas pu être chargés.',
        actions: [h('a', { class: 'btn', href: '#/catalogue' }, 'Retour au catalogue')]
      })));
    return undefined;
  }

  let example = examples.find((e) => e.id === params.exampleId) || examples[0];
  let tab = 'html';
  let values = {};
  let messages = 0;

  const tabBar = h('div', { class: 'pg-tabs', role: 'tablist', 'aria-label': 'Fichier à modifier' });
  const consoleList = h('ol', { class: 'pg-console-list' });
  const consoleEmpty = h('p', { class: 'pg-console-empty small' }, 'La console affiche les messages et les erreurs de votre code.');
  const statusLine = h('p', { class: 'pg-status small', role: 'status' });
  const iframe = h('iframe', {
    class: 'pg-frame',
    title: 'Aperçu du code exécuté',
    sandbox: 'allow-scripts allow-forms allow-modals'
  });

  const exampleSelect = h('select', {
    id: 'pg-example',
    'aria-label': 'Choisir un exemple',
    onChange: (e) => charger(e.target.value)
  }, examples.map((ex) => h('option', { value: ex.id, selected: ex.id === example.id }, ex.title)));

  let saveDebounced = null;

  const editor = createEditor({
    label: 'Code source',
    language: 'html',
    value: '',
    onInput: (value) => {
      values[tab] = value;
      planifierSauvegarde();
    }
  });

  saveDebounced = debounce(() => {
    const ok = writeDraft(example.id, values);
    statusLine.textContent = ok
      ? `Brouillon enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Sauvegarde impossible : stockage indisponible.';
  }, 500);

  function planifierSauvegarde() {
    if (!saveDebounced) return;
    statusLine.textContent = 'Modification en cours…';
    saveDebounced();
  }

  function charger(id) {
    const next = examples.find((e) => e.id === id);
    if (!next) return;
    example = next;
    exampleSelect.value = next.id;
    const draft = readDraft(next.id);
    values = draft
      ? { html: draft.html, css: draft.css, js: draft.js }
      : { html: next.html, css: next.css, js: next.js };
    tab = 'html';
    syncTabs();
    editor.setLanguage('html');
    editor.setValue(values.html);
    statusLine.textContent = draft
      ? `Brouillon restauré${draft.updatedAt ? ` du ${new Date(draft.updatedAt).toLocaleDateString('fr-FR')}` : ''}`
      : 'Exemple d\'origine chargé';
    run();
  }

  function syncTabs() {
    for (const button of tabBar.querySelectorAll('button[role="tab"]')) {
      const active = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('is-active', active);
      button.tabIndex = active ? 0 : -1;
    }
  }

  function changerOnglet(next) {
    if (next === tab) return;
    values[tab] = editor.getValue();
    tab = next;
    syncTabs();
    const t = TABS.find((x) => x.id === next);
    editor.setLanguage(t.lang);
    editor.setValue(values[next] ?? '');
    editor.focus();
  }

  for (const t of TABS) {
    tabBar.append(h('button', {
      class: 'pg-tab',
      type: 'button',
      role: 'tab',
      'data-tab': t.id,
      'aria-selected': 'false',
      tabIndex: -1,
      onClick: () => changerOnglet(t.id)
    }, t.label));
  }

  function addMessage(niveau, texte) {
    if (messages === 0) consoleEmpty.hidden = true;
    messages += 1;
    consoleList.append(h('li', { class: `pg-msg pg-msg-${niveau}` },
      h('span', { class: 'pg-msg-level', text: niveau === 'error' ? 'erreur' : niveau === 'warn' ? 'alerte' : 'log' }),
      h('span', { class: 'pg-msg-text', text: texte || '(vide)' })));
    while (consoleList.children.length > 60) consoleList.firstElementChild.remove();
    consoleList.scrollTop = consoleList.scrollHeight;
  }

  function clearConsole() {
    messages = 0;
    consoleList.replaceChildren();
    consoleEmpty.hidden = false;
  }

  function run() {
    values[tab] = editor.getValue();
    clearConsole();
    iframe.srcdoc = buildDoc(values);
  }

  function onMessage(event) {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== 'kernova-playground') return;
    addMessage(data.niveau === 'error' ? 'error' : data.niveau === 'warn' ? 'warn' : 'log', String(data.texte ?? ''));
  }

  async function reinitialiser() {
    const ok = await confirmDialog({
      title: 'Revenir à l\'exemple d\'origine ?',
      text: 'Vos modifications sur cet exemple seront perdues. Les autres exemples ne sont pas concernés.',
      confirmLabel: 'Réinitialiser'
    });
    if (!ok) return;
    clearDraft(example.id);
    values = { html: example.html, css: example.css, js: example.js };
    tab = 'html';
    syncTabs();
    editor.setLanguage('html');
    editor.setValue(values.html);
    statusLine.textContent = 'Exemple d\'origine restauré';
    run();
    toast('Exemple réinitialisé.', 'info', 2000);
  }

  async function copier() {
    const ok = await copyText(editor.getValue());
    toast(ok ? 'Code copié.' : 'Copie impossible.', ok ? 'success' : 'error', 2000);
  }

  function voirSolution() {
    const solution = example.solution;
    if (!solution) {
      toast('Pas de solution pour cet exemple.', 'info');
      return;
    }
    const dialog = h('dialog', { class: 'pg-dialog', 'aria-labelledby': 'pg-sol-title' },
      h('h2', { id: 'pg-sol-title' }, `Solution : ${example.title}`),
      h('p', { class: 'small muted' }, 'Une solution possible, pas la seule. Comparez avec votre code avant de la charger.'),
      h('div', { class: 'pg-solution' },
        codeBlock({ code: solution.html || '<!-- rien -->', lang: 'html', title: 'HTML' }),
        codeBlock({ code: solution.css || '/* rien */', lang: 'css', title: 'CSS' }),
        codeBlock({ code: solution.js || '// rien', lang: 'js', title: 'JavaScript' })),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Fermer'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => { dialog.close(); chargerSolution(solution); }
        }, 'Charger dans l\'éditeur'))
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  async function chargerSolution(solution) {
    const ok = await confirmDialog({
      title: 'Remplacer le code par la solution ?',
      text: 'Le contenu actuel de l\'éditeur sera remplacé.',
      confirmLabel: 'Charger la solution'
    });
    if (!ok) return;
    values = { html: solution.html || '', css: solution.css || '', js: solution.js || '' };
    tab = 'html';
    syncTabs();
    editor.setLanguage('html');
    editor.setValue(values.html);
    writeDraft(example.id, values);
    statusLine.textContent = 'Solution chargée dans l\'éditeur';
    run();
  }

  const runBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: run }, icon('play', { size: 16 }), 'Exécuter');
  const resetBtn = h('button', { class: 'btn', type: 'button', onClick: reinitialiser }, icon('refresh', { size: 16 }), 'Réinitialiser');
  const copyBtn = h('button', { class: 'btn', type: 'button', onClick: copier }, icon('copy', { size: 16 }), 'Copier');
  const solutionBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: voirSolution }, 'Voir la solution');

  editor.element.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });

  window.addEventListener('message', onMessage);

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {}, h('li', {}, h('a', { href: '#/labo' }, 'Labo')), h('li', { 'aria-current': 'page' }, 'Playground'))),
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Playground' }),
      h('p', { text: 'Écrivez du HTML, du CSS et du JavaScript, puis exécutez : l\'aperçu s\'affiche dans une iframe isolée et votre console remonte ici.' })),
    h('div', { class: 'pg-toolbar' },
      h('div', { class: 'field', style: 'min-width:220px' },
        h('label', { for: 'pg-example' }, 'Exemple'),
        exampleSelect),
      h('div', { class: 'row', style: 'margin-left:auto' }, runBtn, resetBtn, copyBtn, solutionBtn)),
    h('div', { class: 'pg-grid' },
      h('section', { class: 'pg-col', 'aria-label': 'Éditeur' },
        tabBar,
        editor.element,
        statusLine,
        h('section', { class: 'pg-console', 'aria-labelledby': 'pg-console-title' },
          h('div', { class: 'pg-console-head' },
            h('h2', { id: 'pg-console-title' }, 'Console'),
            h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: clearConsole
            }, 'Effacer')),
          consoleEmpty,
          consoleList)),
      h('section', { class: 'pg-col', 'aria-label': 'Aperçu' },
        h('div', { class: 'pg-preview-head' },
          h('h2', {}, 'Aperçu'),
          h('span', { class: 'badge', 'data-tone': 'info' }, 'iframe isolée')),
        iframe)),
    h('p', { class: 'note small muted' },
      'Limites : le code s\'exécute dans un bac à sable sans accès à vos données. Une boucle infinie peut figer l\'onglet ; utilisez « Réinitialiser » ou rechargez la page. Les modules ES et les accès réseau externes ne sont pas pris en charge.')
  ));

  charger(example.id);
  return () => {
    window.removeEventListener('message', onMessage);
  };
}
