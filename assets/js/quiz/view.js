// Vue du moteur de quiz : affiche une session, gère les réponses, indices et résultats.
// La logique de correction est dans logic.js ; ce fichier ne fait que le rendu et les événements.

import { h, icon, progressBar, alertBox , setChildren } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { recordQuizResult } from '../core/progress.js';
import { inline } from '../components/widgets.js';
import {
  buildSession, submitAttempt, scoreOf, failedIds, describeAnswer
} from './logic.js';

/**
 * Lance une session de quiz dans `container`.
 * @param {object} cfg
 * @param {string} cfg.courseId
 * @param {string} cfg.chapterId
 * @param {string} cfg.title          titre affiché (chapitre)
 * @param {object[]} cfg.questions    questions brutes issues du JSON
 * @param {object} cfg.settings       { maxAttempts, shuffleQuestions, shuffleAnswers, timer }
 * @param {Function} cfg.onRetryFailed(ids)  relance avec les questions ratées
 * @param {Function} cfg.onRestart()         relance complète
 * @returns {Function} cleanup (arrête le chronomètre)
 */
export function runQuiz(container, cfg) {
  const session = buildSession(cfg.questions, {
    shuffleQuestions: cfg.settings.shuffleQuestions,
    shuffleAnswers: cfg.settings.shuffleAnswers,
    maxAttempts: cfg.settings.maxAttempts
  });
  const startedAt = Date.now();
  let timerId = null;
  let draft = null;     // réponse en cours de saisie (forme d'affichage)
  let draftFor = -1;    // index de question auquel correspond le brouillon
  let finished = false;
  let feedback = null;  // { kind, text, explanation? }
  let hintCount = 0;
  let hintsIndex = -1;

  const timerEl = cfg.settings.timer ? h('span', { class: 'meta', 'aria-live': 'off' }) : null;
  function tick() {
    if (!timerEl) return;
    const total = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    setChildren(timerEl, icon('clock', { size: 15 }), ` Temps : ${mm}:${ss}`);
  }
  if (timerEl) {
    timerId = setInterval(tick, 1000);
    tick();
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function currentItem() {
    return session.items[session.index];
  }

  /** Initialise le brouillon de réponse pour la question courante. */
  function ensureDraft() {
    if (draftFor === session.index) return;
    const q = currentItem().question;
    draftFor = session.index;
    feedback = null;
    switch (q.type) {
      case 'single': draft = null; break;
      case 'multiple': draft = new Set(); break;
      case 'text': draft = ''; break;
      case 'blank': draft = q.answers.map(() => ''); break;
      case 'order': draft = q.order.slice(); break;
      case 'match': draft = q.left.map(() => -1); break;
      default: draft = null;
    }
    hintCount = 0;
    hintsIndex = session.index;
  }

  /** Convertit le brouillon d'affichage vers les indices d'origine attendus par logic.js. */
  function answerForCheck() {
    const q = currentItem().question;
    switch (q.type) {
      case 'single': return draft === null ? null : q.order[draft];
      case 'multiple': return [...draft].map((i) => q.order[i]);
      case 'text': return draft.trim();
      case 'blank': return draft.map((s) => s.trim());
      case 'order': return draft.slice();
      case 'match': return draft.slice();
      default: return null;
    }
  }

  function isComplete() {
    const q = currentItem().question;
    switch (q.type) {
      case 'single': return draft !== null;
      case 'multiple': return draft.size > 0;
      case 'text': return draft.trim().length > 0;
      case 'blank': return draft.every((s) => s.trim().length > 0);
      case 'match': return draft.every((v) => v >= 0);
      case 'order': return true;
      default: return false;
    }
  }

  function check() {
    const item = currentItem();
    if (!isComplete()) {
      toast('Donnez une réponse avant de vérifier.', 'info', 2500);
      return;
    }
    const { correct, closed } = submitAttempt(session, answerForCheck());
    if (correct) {
      feedback = { kind: 'ok', text: 'Bonne réponse.', explanation: item.question.explanation };
    } else if (closed) {
      feedback = {
        kind: 'ko',
        text: `Réponse incorrecte. La bonne réponse était : ${describeAnswer(item.question)}`,
        explanation: item.question.explanation
      };
    } else {
      const left = session.maxAttempts === 0 ? '' : ` Tentatives restantes : ${session.maxAttempts - item.attempts}.`;
      feedback = { kind: 'ko', text: `Réponse incorrecte.${left} Essayez encore ou demandez un indice.` };
    }
    render();
  }

  function next() {
    if (session.index < session.items.length - 1) {
      session.index++;
      render();
    } else {
      finish();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    stopTimer();
    const { score, total, percent } = scoreOf(session);
    const failed = failedIds(session);
    recordQuizResult({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quizId: `${cfg.chapterId}-quiz`,
      courseId: cfg.courseId,
      chapterId: cfg.chapterId,
      title: cfg.title,
      score,
      total,
      percent,
      date: new Date().toISOString().slice(0, 10),
      failed
    });
    render();
  }

  // ---- Rendu -------------------------------------------------------------

  function render() {
    setChildren(container, finished ? renderResults() : renderQuestion());
  }

  function renderQuestion() {
    ensureDraft();
    const item = currentItem();
    const q = item.question;
    const total = session.items.length;
    const number = session.index + 1;

    const hints = Array.isArray(q.hints) ? q.hints : [];
    const hintBtn = hints.length
      ? h('button', {
        class: 'btn btn-small',
        type: 'button',
        disabled: hintCount >= hints.length,
        onClick: () => {
          hintCount++;
          render();
        }
      }, `Indice (${Math.min(hintCount, hints.length)}/${hints.length})`)
      : null;

    const hintList = hintCount > 0
      ? h('ol', { class: 'hint-list', 'aria-live': 'polite' }, hints.slice(0, hintCount).map((x) => h('li', {}, x)))
      : null;

    const answerInput = renderInput(q, item);
    const closed = item.validated || item.failed;

    const feedbackEl = feedback
      ? h('div', { class: `quiz-feedback ${feedback.kind === 'ok' ? 'ok' : 'ko'}`, role: 'status' },
        h('p', { style: 'margin:0', text: feedback.text }),
        feedback.explanation ? h('p', { class: 'small', style: 'margin:6px 0 0' }, inline(feedback.explanation)) : null
      )
      : null;

    const submitBtn = closed
      ? h('button', { class: 'btn btn-primary', type: 'submit' },
        session.index < total - 1 ? 'Question suivante' : 'Voir le résultat')
      : h('button', { class: 'btn btn-primary', type: 'submit' }, 'Vérifier');

    const form = h('form', {
      class: 'stack',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        if (closed || item.validated) next();
        else check();
      }
    },
      answerInput,
      hintList,
      feedbackEl,
      h('div', { class: 'quiz-actions' },
        h('div', { class: 'row' }, hintBtn,
          h('span', { class: 'muted small' }, `Tentative ${item.attempts}${session.maxAttempts ? ` / ${session.maxAttempts}` : ''}`)),
        submitBtn
      )
    );

    return h('section', { class: 'quiz-shell fade-in', 'aria-labelledby': 'quiz-question-title' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('span', { class: 'badge', 'data-tone': 'info' }, `Question ${number} / ${total}`),
        h('span', { class: 'row', style: 'gap:10px' },
          q.difficulty ? h('span', { class: 'badge' }, `Niveau ${q.difficulty}`) : null,
          timerEl
        )
      ),
      h('div', { style: 'margin:var(--space-4) 0' }, progressBar((session.index / total) * 100, 'Avancement du quiz')),
      h('h2', { id: 'quiz-question-title', class: 'quiz-question', tabindex: '-1' }, inline(q.question)),
      form
    );
  }

  function renderInput(q, item) {
    const locked = item.validated || item.failed;
    switch (q.type) {
      case 'single':
      case 'multiple': {
        const multi = q.type === 'multiple';
        const name = `q-${session.index}`;
        return h('fieldset', { disabled: locked },
          h('legend', {}, multi ? 'Plusieurs réponses possibles' : 'Une seule réponse possible'),
          q.order.map((origIdx, displayIdx) => {
            const checked = multi ? draft.has(displayIdx) : draft === displayIdx;
            return h('label', { class: 'answer-option' },
              h('input', {
                type: multi ? 'checkbox' : 'radio',
                name,
                value: String(displayIdx),
                checked,
                onChange: (e) => {
                  if (multi) {
                    if (e.target.checked) draft.add(displayIdx); else draft.delete(displayIdx);
                  } else {
                    draft = displayIdx;
                  }
                }
              }),
              h('span', {}, inline(q.options[origIdx]))
            );
          })
        );
      }
      case 'text':
        return h('div', { class: 'field' },
          h('label', { for: `text-${session.index}` }, 'Votre réponse'),
          h('input', {
            id: `text-${session.index}`,
            type: 'text',
            autocomplete: 'off',
            value: draft,
            disabled: locked,
            onInput: (e) => { draft = e.target.value; }
          })
        );
      case 'blank':
        return h('div', { class: 'stack' },
          h('p', { class: 'muted small', text: 'Complétez chaque espace (___) de la phrase.' }),
          q.answers.map((_, i) => h('div', { class: 'field' },
            h('label', { for: `blank-${session.index}-${i}` }, `Espace ${i + 1}`),
            h('input', {
              id: `blank-${session.index}-${i}`,
              type: 'text',
              autocomplete: 'off',
              value: draft[i],
              disabled: locked,
              onInput: (e) => { draft[i] = e.target.value; }
            })
          ))
        );
      case 'order':
        return h('ol', { class: 'order-list', 'aria-label': 'Éléments à ordonner' },
          draft.map((origIdx, pos) => h('li', { class: 'order-item' },
            h('span', { text: String(pos + 1) }),
            h('span', {}, inline(q.items[origIdx])),
            h('button', {
              class: 'btn btn-small btn-icon',
              type: 'button',
              disabled: locked || pos === 0,
              'aria-label': `Monter : ${q.items[origIdx]}`,
              onClick: () => { [draft[pos - 1], draft[pos]] = [draft[pos], draft[pos - 1]]; render(); }
            }, icon('up', { size: 16 })),
            h('button', {
              class: 'btn btn-small btn-icon',
              type: 'button',
              disabled: locked || pos === draft.length - 1,
              'aria-label': `Descendre : ${q.items[origIdx]}`,
              onClick: () => { [draft[pos + 1], draft[pos]] = [draft[pos], draft[pos + 1]]; render(); }
            }, icon('down', { size: 16 }))
          ))
        );
      case 'match':
        return h('div', { class: 'stack' },
          q.left.map((leftText, i) => h('div', { class: 'match-row' },
            h('span', {}, inline(leftText)),
            h('select', {
              'aria-label': `Association pour ${leftText}`,
              disabled: locked,
              onChange: (e) => { draft[i] = Number(e.target.value); }
            },
              h('option', { value: '-1' }, 'Choisir une réponse'),
              q.rightOrder.map((origR) => h('option', {
                value: String(origR),
                selected: draft[i] === origR
              }, q.right[origR]))
            )
          ))
        );
      default:
        return alertBox('danger', `Type de question non pris en charge : ${q.type}`);
    }
  }

  function renderResults() {
    const { score, total, percent } = scoreOf(session);
    const failed = failedIds(session);
    const msg = percent >= 80 ? 'Très bon résultat.' : percent >= 50 ? 'Résultat correct, revoyez les questions ratées.' : 'Relisez le chapitre puis recommencez.';
    return h('section', { class: 'quiz-shell fade-in', 'aria-labelledby': 'quiz-result-title' },
      h('h2', { id: 'quiz-result-title', tabindex: '-1' }, 'Résultat du quiz'),
      h('div', { class: 'card stack' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', {},
            h('div', { class: 'score-ring', 'aria-label': `Score ${score} sur ${total}` }, `${score} / ${total}`),
            h('p', { class: 'muted', style: 'margin:0' }, `${percent} % de bonnes réponses. ${msg}`)
          ),
          cfg.settings.timer ? h('span', { class: 'meta' }, icon('clock', { size: 15 }), ` ${formatElapsed()}`) : null
        ),
        progressBar(percent, 'Score')
      ),
      h('h2', {}, 'Corrections'),
      session.items.map((item, i) => {
        const ok = item.validated;
        return h('article', { class: `review-item ${ok ? 'ok' : 'ko'}` },
          h('p', { class: 'small muted', style: 'margin:0' }, `Question ${i + 1}, ${ok ? 'validée' : 'non validée'}, ${item.attempts} tentative(s)`),
          h('p', { style: 'margin:4px 0' }, inline(item.question.question)),
          h('p', { class: 'small', style: 'margin:0' }, h('strong', {}, 'Réponse attendue : '), describeAnswer(item.question)),
          item.question.explanation ? h('p', { class: 'small muted', style: 'margin:6px 0 0' }, inline(item.question.explanation)) : null
        );
      }),
      h('div', { class: 'row', style: 'margin-top:var(--space-4)' },
        failed.length && cfg.onRetryFailed
          ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => cfg.onRetryFailed(failed) }, `Réviser les ${failed.length} question(s) ratée(s)`)
          : null,
        h('button', { class: 'btn', type: 'button', onClick: () => cfg.onRestart?.() }, 'Recommencer le quiz'),
        h('a', { class: 'btn btn-ghost', href: `#/cours/${cfg.courseId}/${cfg.chapterId}` }, 'Retour au chapitre')
      )
    );
  }

  function formatElapsed() {
    const total = Math.floor((Date.now() - startedAt) / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  render();
  return () => stopTimer();
}
