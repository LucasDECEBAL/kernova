// Rendu du contenu d'un chapitre à partir des blocs JSON.
// Types gérés : p, h, list, code, table, tip, warning. Tout inconnu est ignoré avec un avertissement.

import { h } from '../core/dom.js';
import { normalize } from '../core/utils.js';
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

/** Normalise une réponse : casse, accents, espaces et ponctuation finale. */
function normalizeAnswer(text) {
  return normalize(String(text ?? ''))
    .replace(/[.;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exercice guidé : indices progressifs, solution masquée et, si `check` est fourni,
 * vérification automatique locale de la réponse.
 * check : { type: 'answers', accepted: string[] }, { type: 'keywords', keywords: string[] }
 * ou { type: 'any', any: string[] }
 */
export function renderExercise(exercise) {
  let revealed = 0;
  let attempts = 0;
  let validated = false;

  const hintsList = h('ol', { class: 'hint-list', 'aria-live': 'polite' });
  const hintBtn = h('button', { class: 'btn btn-small', type: 'button' });

  const solution = h('div', { class: 'callout callout-tip', hidden: true });
  solution.append(h('strong', {}, 'Solution'), h('p', { text: exercise.solution }));

  const updateHintBtn = () => {
    const left = (exercise.hints?.length || 0) - revealed;
    hintBtn.textContent = left > 0 ? `Indice suivant (${revealed}/${exercise.hints.length})` : 'Tous les indices affichés';
    hintBtn.disabled = left <= 0;
  };
  hintBtn.addEventListener('click', () => {
    if (revealed < (exercise.hints?.length || 0)) {
      hintsList.append(h('li', {}, exercise.hints[revealed]));
      revealed += 1;
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

  const check = exercise.check;
  const indicative = Boolean(check) && (check.type === 'keywords' || check.type === 'any');
  const feedback = h('p', { class: 'exercise-feedback', role: 'status', hidden: true });
  const selfCheckBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: () => {
      solution.hidden = false;
      solutionBtn.setAttribute('aria-expanded', 'true');
      solutionBtn.textContent = 'Masquer la solution';
      showFeedback('info', 'Comparez votre réponse à la solution. Si elle exprime la même idée, considérez l\'exercice compris : rien n\'est enregistré comme validé.');
    }
  }, 'Voir la solution et m\'auto-évaluer');
  const selfCheck = h('div', { class: 'row', hidden: true }, selfCheckBtn);
  let answerInput = null;
  let verifyBtn = null;

  function showFeedback(kind, text) {
    feedback.hidden = false;
    feedback.className = `exercise-feedback ${kind}`;
    feedback.textContent = text;
  }

  function verify() {
    if (!check || validated) return;
    const value = answerInput.value;
    if (!value.trim()) {
      showFeedback('info', 'Saisissez une réponse avant de vérifier.');
      return;
    }
    attempts += 1;
    const given = normalizeAnswer(value);
    const contains = (keyword) => {
      const kw = normalize(keyword);
      if (!kw) return false;
      if (!/^[a-z0-9_]+$/.test(kw)) return given.includes(kw);
      const pattern = new RegExp('(^|[^a-z0-9_])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return pattern.test(given);
    };
    let ok = false;
    if (check.type === 'keywords') {
      ok = (check.keywords || []).every(contains);
    } else if (check.type === 'any') {
      ok = (check.any || []).some(contains);
    } else {
      ok = (check.accepted || []).some((accepted) => normalizeAnswer(accepted) === given);
    }

    if (ok) {
      validated = true;
      answerInput.disabled = true;
      verifyBtn.disabled = true;
      selfCheck.hidden = true;
      showFeedback('ok', check.success || 'Réponse correcte.');
      return;
    }
    const restant = check.maxAttempts ? Math.max(0, check.maxAttempts - attempts) : null;
    showFeedback('ko', indicative
      ? `Aucun élément attendu repéré. La vérification est indicative : votre formulation peut être juste sans contenir les mots-clés. Comparez avec la solution.`
      : restant === null
        ? 'Réponse incorrecte. Relisez la consigne, demandez un indice ou vérifiez votre orthographe.'
        : restant > 0
          ? `Réponse incorrecte. Tentatives restantes : ${restant}.`
          : 'Réponse incorrecte. Affichez la solution pour comparer.');
    if (indicative && attempts >= 2) selfCheck.hidden = false;
  }

  if (check) {
    answerInput = h('input', {
      type: 'text',
      id: 'exercise-answer',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Votre réponse',
      'aria-label': 'Votre réponse à l\'exercice',
      'aria-describedby': 'exercise-check-note',
      onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); verify(); } }
    });
    verifyBtn = h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: verify }, 'Vérifier');
  }

  return h('section', { class: 'card exercise', 'aria-labelledby': 'exercise-title' },
    h('h2', { id: 'exercise-title', style: 'margin-top:0;font-size:1.2rem' }, `Exercice : ${exercise.title}`),
    h('p', { text: exercise.instructions }),
    check ? h('div', { class: 'exercise-answer' },
      h('div', { class: 'field' }, h('label', { for: 'exercise-answer' }, 'Votre réponse'), answerInput),
      h('div', { class: 'row' }, verifyBtn)) : null,
    feedback,
    selfCheck,
    hintsList,
    h('div', { class: 'row' }, hintBtn, solutionBtn),
    solution,
    check ? h('p', { id: 'exercise-check-note', class: 'small muted', style: 'margin:var(--s2) 0 0' },
      indicative
        ? 'Vérification indicative : elle repère des mots-clés attendus, pas le sens de votre réponse. La solution reste la référence.'
        : 'La vérification est locale et pédagogique : elle compare votre réponse à des réponses acceptées, sans prétendre à une correction sécurisée.') : null
  );
}
