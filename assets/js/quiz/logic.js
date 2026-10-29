// Logique de quiz pure (sans DOM) : normalisation, mélange, correction.
//
// Types de questions (format JSON) :
//   single     { options, answer: index }
//   multiple   { options, answer: [index, ...] }
//   truefalse  { answer: boolean }                  -> converti en single Vrai/Faux
//   text       { answer: ["réponse acceptée", ...] }
//   blank      { question contenant ___, answers: [[acceptées pour le 1er], [...]] }
//   order      { items, answer: [indices dans le bon ordre] }
//   match      { left, right, answer: [indexDroitePourChaqueGauche] }

import { normalize, shuffle } from '../core/utils.js';

/** Convertit une question du JSON en forme canonique. */
export function canonicalize(q) {
  if (q.type === 'truefalse') {
    return { ...q, type: 'single', options: ['Vrai', 'Faux'], answer: q.answer ? 0 : 1, originalType: 'truefalse' };
  }
  return { ...q, originalType: q.type };
}

/**
 * Prépare une question pour l'affichage : mélange éventuel des réponses.
 * `order` (permutation des options) permet de renvoyer la réponse dans l'index d'origine.
 */
export function prepare(q, { shuffleAnswers = false, random = Math.random } = {}) {
  const canon = canonicalize(q);
  const n = canon.type === 'single' || canon.type === 'multiple' ? canon.options.length : 0;
  let order = Array.from({ length: n }, (_, i) => i);
  if (shuffleAnswers && n > 1) order = shuffle(order, random);

  if (canon.type === 'order') {
    const items = canon.items.map((_, i) => i);
    const start = shuffleAnswers ? shuffle(items, random) : items;
    return { ...canon, order: start, displayItems: start };
  }
  if (canon.type === 'match') {
    const rightOrder = shuffleAnswers ? shuffle(canon.right.map((_, i) => i), random) : canon.right.map((_, i) => i);
    return { ...canon, rightOrder };
  }
  return { ...canon, order };
}

/** Indice d'origine à partir d'un indice affiché (single/multiple). */
export function originalIndex(prepared, displayIndex) {
  return prepared.order[displayIndex];
}

/**
 * Compare une réponse utilisateur à la solution.
 * La réponse de l'utilisateur est toujours exprimée avec les indices d'origine.
 * @returns {boolean}
 */
export function isCorrect(prepared, userAnswer) {
  switch (prepared.type) {
    case 'single':
      return typeof userAnswer === 'number' && userAnswer === prepared.answer;
    case 'multiple': {
      if (!Array.isArray(userAnswer)) return false;
      const expected = [...prepared.answer].sort((a, b) => a - b);
      const given = [...new Set(userAnswer)].sort((a, b) => a - b);
      return expected.length === given.length && expected.every((v, i) => v === given[i]);
    }
    case 'text':
      return matchesAny(userAnswer, prepared.answer);
    case 'blank': {
      if (!Array.isArray(userAnswer) || userAnswer.length !== prepared.answers.length) return false;
      return prepared.answers.every((accepted, i) => matchesAny(userAnswer[i], accepted));
    }
    case 'order': {
      if (!Array.isArray(userAnswer) || userAnswer.length !== prepared.answer.length) return false;
      return prepared.answer.every((v, i) => v === userAnswer[i]);
    }
    case 'match': {
      if (!Array.isArray(userAnswer) || userAnswer.length !== prepared.answer.length) return false;
      return prepared.answer.every((v, i) => v === userAnswer[i]);
    }
    default:
      return false;
  }
}

function matchesAny(value, accepted) {
  if (typeof value !== 'string') return false;
  const given = normalize(value);
  if (!given) return false;
  return accepted.some((a) => normalize(a) === given);
}

/** Réponse attendue sous forme lisible, pour la correction. */
export function describeAnswer(prepared) {
  switch (prepared.type) {
    case 'single':
      return prepared.options[prepared.answer];
    case 'multiple':
      return prepared.answer.map((i) => prepared.options[i]).join(' ; ');
    case 'text':
      return prepared.answer[0];
    case 'blank':
      return prepared.answers.map((a) => a[0]).join(' ; ');
    case 'order':
      return prepared.answer.map((i) => prepared.items[i]).join(' → ');
    case 'match':
      return prepared.left.map((l, i) => `${l} → ${prepared.right[prepared.answer[i]]}`).join(' ; ');
    default:
      return '';
  }
}

/** Construit une session à partir d'une liste de questions et d'options. */
export function buildSession(questions, options = {}) {
  const { shuffleQuestions = false, shuffleAnswers = false, maxAttempts = 2, random = Math.random } = options;
  const ordered = shuffleQuestions ? shuffle(questions, random) : questions.slice();
  return {
    maxAttempts,
    items: ordered.map((q) => ({
      question: prepare(q, { shuffleAnswers, random }),
      attempts: 0,
      validated: false,
      failed: false,
      hintsUsed: 0,
      lastAnswer: null
    })),
    index: 0
  };
}

/**
 * Enregistre une tentative. Renvoie { correct, finished } ; met à jour l'entrée.
 * Une question est « failed » si toutes les tentatives sont épuisées sans bonne réponse.
 */
export function submitAttempt(session, userAnswer) {
  const item = session.items[session.index];
  item.attempts++;
  item.lastAnswer = userAnswer;
  const correct = isCorrect(item.question, userAnswer);
  if (correct) {
    item.validated = true;
  } else if (session.maxAttempts === 0 || item.attempts < session.maxAttempts) {
    // Tentative encore permise : la question reste ouverte.
  } else {
    item.failed = true;
  }
  return { correct, closed: item.validated || item.failed };
}

/** Score = nombre de questions validées (quel que soit le nombre de tentatives). */
export function scoreOf(session) {
  const total = session.items.length;
  const score = session.items.filter((i) => i.validated).length;
  return { score, total, percent: total ? Math.round((score / total) * 100) : 0 };
}

export function failedIds(session) {
  return session.items.filter((i) => i.failed).map((i) => i.question.id);
}

/** Filtre par niveau de difficulté (0 = tous). */
export function filterByDifficulty(questions, level) {
  if (!level) return questions;
  return questions.filter((q) => (q.difficulty || 1) === level);
}
