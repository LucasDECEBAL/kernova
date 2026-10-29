// Mes données : export/import JSON validés, préférences de thème, réinitialisation confirmée.

import { h, icon, alertBox , setChildren } from '../core/dom.js';
import * as store from '../core/store.js';
import { get, update } from '../core/store.js';
import { getDataIssues } from '../core/data.js';
import { summarizeIssues, THEMES, MAX_IMPORT_CHARS } from '../core/schema.js';
import { applyTheme } from '../core/ui.js';
import { toast, confirmDialog } from '../core/ui.js';
import { localDay } from '../core/utils.js';

const THEME_LABELS = { system: 'Automatique (système)', light: 'Clair', dark: 'Sombre' };

export function renderDataPage({ outlet }) {
  const rerender = () => renderDataPage({ outlet });
  const state = get();
  const notices = store.getNotices();
  store.clearNotices();

  const sizeKb = (store.storageSize() / 1024).toFixed(1);
  const counts = {
    'Cours commencés': Object.values(state.progress).filter((p) => p.lastChapter || Object.keys(p.completed).length).length,
    'Chapitres terminés': Object.values(state.progress).reduce((s, p) => s + Object.keys(p.completed).length, 0),
    'Résultats de quiz': state.quizResults.length,
    'Favoris': state.favorites.length,
    'Fiches en favori': state.sheetFavorites.length,
    'Notes': Object.keys(state.notes).length,
    'Entrées d\'activité': state.activity.length
  };

  const themeSelect = h('select', {
    id: 'theme-select',
    onChange: (e) => {
      const theme = e.target.value;
      update((s) => { s.prefs.theme = theme; });
      applyTheme(theme);
      toast(`Thème : ${THEME_LABELS[theme].toLowerCase()}.`, 'success', 2000);
    }
  }, THEMES.map((t) => h('option', { value: t, selected: t === state.prefs.theme }, THEME_LABELS[t])));

  const fileInput = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json' });
  const importResult = h('div', { role: 'status', 'aria-live': 'polite' });

  const doImport = async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      setChildren(importResult, alertBox('warning', 'Choisissez d\'abord un fichier JSON.'));
      return;
    }
    if (file.size > MAX_IMPORT_CHARS) {
      setChildren(importResult, alertBox('danger', 'Fichier trop volumineux (2 Mo maximum).'));
      return;
    }
    const ok = await confirmDialog({
      title: 'Remplacer les données actuelles ?',
      text: 'L\'import remplace toutes les données de ce navigateur par celles du fichier. Pensez à exporter vos données actuelles avant.',
      confirmLabel: 'Importer'
    });
    if (!ok) return;
    try {
      const text = await file.text();
      const { issues } = store.importJson(text);
      const summary = summarizeIssues(issues);
      toast('Données importées.', 'success');
      setChildren(importResult, alertBox(issues.length ? 'warning' : 'info',
        summary ? `Import réussi. Éléments ignorés car invalides : ${summary}.` : 'Import réussi. Toutes les données ont été acceptées.'));
      applyTheme(get().prefs.theme);
      themeSelect.value = get().prefs.theme;
    } catch (err) {
      setChildren(importResult, alertBox('danger', `Import impossible : ${err.message}`));
    }
  };

  const exportBtn = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    onClick: () => {
      const blob = new Blob([store.exportJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `kernova-export-${localDay()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Export téléchargé.', 'success');
    }
  }, icon('download', { size: 16 }), ' Exporter mes données');

  const resetBtn = h('button', {
    class: 'btn btn-danger',
    type: 'button',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Effacer toutes les données ?',
        text: 'Progression, notes, favoris, quiz et préférences seront supprimés de ce navigateur. Cette action est irréversible.',
        confirmLabel: 'Tout effacer',
        danger: true
      });
      if (!ok) return;
      store.reset();
      try { localStorage.removeItem('kernova:terminal:v1'); } catch { /* ignoré */ }
      try { localStorage.removeItem('kernova:network:v1'); } catch { /* ignoré */ }
      applyTheme('system');
      toast('Données effacées.', 'info');
      rerender();
    }
  }, icon('trash', { size: 16 }), ' Réinitialiser');

  const backupBlock = store.hasCorruptBackup()
    ? alertBox('warning', 'Une copie de données illisibles a été conservée dans ce navigateur. Vous pouvez la supprimer si vous n\'en avez pas besoin.')
    : null;
  const backupRemove = store.hasCorruptBackup()
    ? h('button', {
      class: 'btn btn-small',
      type: 'button',
      onClick: () => { store.removeCorruptBackup(); toast('Copie supprimée.', 'info'); rerender(); }
    }, 'Supprimer la copie')
    : null;

  const dataIssues = getDataIssues();

  setChildren(outlet, h('div', { class: 'page stack', style: 'gap:var(--space-5)' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Mes données' }),
      h('p', { text: 'Toutes vos données sont stockées dans ce navigateur. Aucune information n\'est envoyée à un serveur. Exportez-les pour les conserver ou les transférer.' })
    ),
    notices.map((n) => alertBox('warning', n)),
    dataIssues.length ? alertBox('warning', `Certains contenus n'ont pas pu être chargés : ${dataIssues.join(' ; ')}`) : null,
    backupBlock ? h('div', {}, backupBlock, backupRemove) : null,

    h('section', { class: 'card stack', 'aria-labelledby': 'summary-title' },
      h('h2', { id: 'summary-title', style: 'margin:0;font-size:1.15rem' }, 'Contenu enregistré'),
      h('ul', { class: 'list-plain' }, Object.entries(counts).map(([label, value]) => h('li', {}, h('span', {}, label), h('strong', {}, String(value))))),
      h('p', { class: 'small muted', style: 'margin:0' }, `Taille approximative : ${sizeKb} Ko.`)
    ),

    h('section', { class: 'card stack', 'aria-labelledby': 'pref-title' },
      h('h2', { id: 'pref-title', style: 'margin:0;font-size:1.15rem' }, 'Préférences'),
      h('div', { class: 'field', style: 'max-width:320px' }, h('label', { for: 'theme-select' }, 'Thème'), themeSelect)
    ),

    h('section', { class: 'card stack', 'aria-labelledby': 'export-title' },
      h('h2', { id: 'export-title', style: 'margin:0;font-size:1.15rem' }, 'Exporter et importer'),
      h('p', { class: 'muted', style: 'margin:0' }, 'L\'export produit un fichier JSON lisible. L\'import vérifie le format et ignore les entrées invalides.'),
      h('div', { class: 'row' }, exportBtn),
      h('div', { class: 'field', style: 'max-width:420px' },
        h('label', { for: 'import-file' }, 'Fichier à importer (.json, 2 Mo maximum)'),
        fileInput),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onClick: doImport }, icon('upload', { size: 16 }), ' Importer le fichier')),
      importResult
    ),

    h('section', { class: 'card stack danger-zone', 'aria-labelledby': 'danger-title' },
      h('h2', { id: 'danger-title', style: 'margin:0;font-size:1.15rem' }, 'Zone de réinitialisation'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Efface toute la progression, les notes, les favoris et les résultats de ce navigateur.'),
      h('div', { class: 'row' }, resetBtn)
    ),

    h('p', { class: 'small muted' }, 'Profil : aucun compte. Ces données sont associées uniquement à ce navigateur.')
  ));
  return undefined;
}
