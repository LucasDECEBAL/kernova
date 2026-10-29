// Rendu du contenu d'un chapitre à partir des blocs JSON.
// Types gérés : p, h, list, code, table, tip, warning. Tout inconnu est ignoré avec un avertissement.

import { h } from '../core/dom.js';
import { codeBlock, inline } from './widgets.js';

export function renderBlocks(blocks) {
  return h('div', { class: 'lesson-body' }, blocks.map(renderBlock).filter(Boolean));
}

function renderBlock(block) {
  switch (block?.type) {
    case 'p':
      return h('p', {}, inline(block.text));
    case 'h':
      return h('h3', {}, block.text);
    case 'list': {
      const list = h(block.ordered ? 'ol' : 'ul', {}, (block.items || []).map((item) => h('li', {}, inline(item))));
      return list;
    }
    case 'code':
      return codeBlock({ code: block.code, lang: block.lang, title: block.title });
    case 'table':
      return h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {}, (block.headers || []).map((x) => h('th', { scope: 'col' }, inline(x))))),
          h('tbody', {}, (block.rows || []).map((row) => h('tr', {}, row.map((cell) => h('td', {}, inline(cell))))))
        )
      );
    case 'tip':
      return h('div', { class: 'callout callout-tip' }, h('strong', {}, 'Astuce'), inline(block.text));
    case 'warning':
      return h('div', { class: 'callout callout-warning', role: 'note' }, h('strong', {}, 'Attention'), inline(block.text));
    default:
      console.warn('kernova : bloc de contenu inconnu', block);
      return null;
  }
}

/** Exercice guidé : indices progressifs et solution masquée jusqu'à demande. */
export function renderExercise(exercise) {
  let revealed = 0;
  const hintsList = h('ol', { class: 'hint-list', 'aria-live': 'polite' });
  const hintBtn = h('button', { class: 'btn btn-small', type: 'button' });
  const solution = h('div', { class: 'callout callout-tip', hidden: true });
  solution.append(h('strong', {}, 'Solution'), h('p', { text: exercise.solution }));

  const updateHintBtn = () => {
    const left = exercise.hints.length - revealed;
    hintBtn.textContent = left > 0 ? `Indice suivant (${revealed}/${exercise.hints.length})` : 'Tous les indices affichés';
    hintBtn.disabled = left <= 0;
  };
  hintBtn.addEventListener('click', () => {
    if (revealed < exercise.hints.length) {
      hintsList.append(h('li', {}, exercise.hints[revealed]));
      revealed++;
      updateHintBtn();
    }
  });
  updateHintBtn();

  const solutionBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    'aria-expanded': 'false',
    onClick: () => {
      solution.hidden = !solution.hidden;
      solutionBtn.setAttribute('aria-expanded', String(!solution.hidden));
      solutionBtn.textContent = solution.hidden ? 'Voir la solution' : 'Masquer la solution';
    }
  }, 'Voir la solution');

  return h('section', { class: 'card exercise', 'aria-labelledby': 'exercise-title' },
    h('h2', { id: 'exercise-title', style: 'margin-top:0;font-size:1.2rem' }, `Exercice : ${exercise.title}`),
    h('p', { text: exercise.instructions }),
    hintsList,
    h('div', { class: 'row' }, hintBtn, solutionBtn),
    solution
  );
}
