// Atelier de code : C, C++, Go, Rust, Java et PHP.
// La vérification est structurelle et locale : aucun code n'est compilé ni exécuté.

import { h, emptyState } from '../core/dom.js';
import { getEditorLanguages } from '../core/data.js';
import { createEditor } from '../components/editor.js';
import { validateCode } from '../core/codecheck.js';
import { copyText, toast } from '../core/ui.js';
import { debounce } from '../core/utils.js';

const DRAFT_PREFIX = 'kernova:editor:';

function readDraft(id) {
  try { return localStorage.getItem(DRAFT_PREFIX + id); } catch { return null; }
}

function writeDraft(id, value) {
  try { localStorage.setItem(DRAFT_PREFIX + id, value); } catch { /* stockage indisponible */ }
}

function removeDraft(id) {
  try { localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* stockage indisponible */ }
}

function readLastExercise(languageId) {
  try {
    const value = Number(localStorage.getItem(DRAFT_PREFIX + 'last:' + languageId));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeLastExercise(languageId, index) {
  try { localStorage.setItem(DRAFT_PREFIX + 'last:' + languageId, String(index)); } catch { /* stockage indisponible */ }
}

export function renderEditorsPage({ outlet, params }) {
  const languages = getEditorLanguages();
  if (!languages.length) {
    outlet.replaceChildren(emptyState({
      title: 'Atelier indisponible',
      text: 'Les exercices d\'éditeurs n\'ont pas pu être chargés.'
    }));
    return;
  }

  const active = languages.find((language) => language.id === params?.langId) || languages[0];

  const tabs = h('nav', { class: 'editor-tabs', 'aria-label': 'Langages' },
    languages.map((language) => h('a', {
      class: 'editor-tab',
      href: `#/editeurs/${language.id}`,
      'aria-current': language.id === active.id ? 'page' : null
    }, language.name)));

  const chips = h('div', { class: 'editor-chips', role: 'group', 'aria-label': 'Exercices' });
  const panel = h('div', { class: 'editor-panel' });
  const saveDraft = debounce((id, value) => writeDraft(id, value), 350);

  let currentIndex = 0;

  const renderExercise = (index) => {
    currentIndex = index;
    const exercise = active.exercises[index];
    const starter = exercise.starter || '';
    const saved = readDraft(exercise.id);
    const total = (exercise.rules || []).length;
    writeLastExercise(active.id, index);

    chips.replaceChildren(...active.exercises.map((item, i) => h('button', {
      class: 'editor-chip',
      type: 'button',
      'aria-pressed': i === index ? 'true' : 'false',
      onClick: () => renderExercise(i)
    }, item.title)));

    const feedback = h('div', {
      class: 'exercise-feedback info',
      'aria-live': 'polite',
      text: 'Vérifiez votre code quand vous êtes prêt. Aucune compilation n\'est lancée.'
    });
    const rulesList = h('ul', { class: 'editor-rules', hidden: true, 'aria-label': 'Contrôles' });

    const editor = createEditor({
      label: `Code ${active.name}`,
      language: active.editorLanguage || active.id,
      value: saved ?? starter,
      onInput: (value) => saveDraft(exercise.id, value)
    });

    const checkButton = h('button', {
      class: 'btn btn-primary',
      type: 'button',
      onClick: () => {
        const results = validateCode(editor.getValue(), exercise.rules || []);
        const passed = results.filter((rule) => rule.ok).length;
        rulesList.hidden = false;
        rulesList.replaceChildren(...results.map((rule) => h('li', {
          class: 'editor-rule',
          dataset: { ok: String(rule.ok) },
          'aria-label': `${rule.ok ? 'Réussi' : 'À corriger'} : ${rule.label}`
        },
        h('span', { class: 'editor-rule-mark', 'aria-hidden': 'true', text: rule.ok ? '✓' : '✗' }),
        h('span', {}, rule.label))));

        if (passed === results.length) {
          feedback.className = 'exercise-feedback ok';
          feedback.textContent = `Tous les contrôles passent (${passed}/${total}). Ce code n'a pas été compilé : vérifiez la logique et les cas limites.`;
        } else {
          feedback.className = 'exercise-feedback ko';
          feedback.textContent = `${passed}/${total} contrôles réussis. Corrigez les points signalés, puis vérifiez à nouveau.`;
        }
      }
    }, 'Vérifier');

    const resetButton = h('button', {
      class: 'btn',
      type: 'button',
      onClick: () => {
        removeDraft(exercise.id);
        editor.setValue(starter);
        rulesList.hidden = true;
        rulesList.replaceChildren();
        feedback.className = 'exercise-feedback info';
        feedback.textContent = 'Code réinitialisé au fichier de départ.';
        editor.focus();
      }
    }, 'Réinitialiser');

    const hints = h('details', { class: 'editor-disclosure' },
      h('summary', { text: `Indices (${(exercise.hints || []).length})` }),
      h('ol', { class: 'hint-list' }, (exercise.hints || []).map((hint) => h('li', {}, hint))));

    const solutionCode = h('pre', { class: 'code-block editor-solution-code' }, h('code', {}, exercise.solution || ''));
    const copyButton = h('button', {
      class: 'btn btn-small',
      type: 'button',
      onClick: async () => {
        const done = await copyText(exercise.solution || '');
        toast(done ? 'Solution copiée.' : 'Copie impossible dans ce navigateur.');
      }
    }, 'Copier la solution');

    const solution = h('details', { class: 'editor-disclosure' },
      h('summary', { text: 'Voir une solution possible' }),
      h('div', { class: 'code-block-wrap' }, solutionCode),
      h('div', { class: 'editor-actions' }, copyButton));

    panel.replaceChildren(
      h('h2', { style: 'margin-top:var(--s2)', text: exercise.title }),
      h('p', { class: 'muted', text: exercise.brief }),
      editor.element,
      h('div', { class: 'editor-actions' }, checkButton, resetButton),
      feedback,
      rulesList,
      hints,
      solution
    );
  };

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Éditeurs de code' }),
      h('p', { text: `${languages.length} langages, deux exercices chacun, avec une vérification de structure immédiate.` })),
    h('div', { class: 'callout callout-tip' },
      h('strong', {}, 'Sans exécution'),
      ' Ces éditeurs ne compilent ni n\'exécutent le code. La vérification repère les éléments attendus (inclusions, appels, équilibre des accolades) ; elle ne prouve pas que le programme fonctionne.'),
    tabs,
    h('p', { class: 'muted', text: `${active.name} ${active.tag ? '— ' + active.tag : ''}` }),
    h('p', { text: active.intro || '' }),
    chips,
    panel));

  const initialIndex = Math.min(readLastExercise(active.id), active.exercises.length - 1);
  renderExercise(initialIndex);
}
