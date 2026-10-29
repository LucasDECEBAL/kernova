// Évaluation finale d'un cours : tirage de questions parmi les chapitres, score et historique local.
// Évaluation d'entraînement : les réponses sont présentes dans les données de la page.

import { h, icon, emptyState, alertBox } from '../core/dom.js';
import { getCourse } from '../core/data.js';
import { get } from '../core/store.js';
import { courseProgress } from '../core/progress.js';
import { shuffle, percent } from '../core/utils.js';
import { runQuiz } from '../quiz/view.js';
import { PASS_PERCENT } from '../core/stats.js';

const MAX_QUESTIONS = 12;

export function renderFinalPage({ outlet, params }) {
  const course = getCourse(params.courseId);
  if (!course) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Cours introuvable',
        text: 'Ce cours n\'existe pas dans le catalogue local.',
        actions: [h('a', { class: 'btn', href: '#/catalogue' }, 'Voir le catalogue')]
      })));
    return undefined;
  }

  const pool = course.chapters.flatMap((chapter) => (chapter.quiz || []).map((question) => ({
    ...question,
    chapter: chapter.title
  })));

  if (!pool.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({
        icon: 'book',
        title: 'Pas encore d\'évaluation',
        text: 'Ce cours ne contient pas encore de questions de quiz pour construire une évaluation finale.',
        actions: [h('a', { class: 'btn', href: `#/cours/${course.id}` }, 'Retour au cours')]
      })));
    return undefined;
  }

  const count = Math.min(MAX_QUESTIONS, pool.length);
  const state = get();
  const progress = courseProgress(course, state);
  const bestLine = h('p', { class: 'small', role: 'status', style: 'margin:0' });

  const runRoot = h('div', { class: 'final-run' });
  let cleanup = null;

  function refreshBest() {
    const results = get().quizResults.filter((r) => r.quizId === `${course.id}-final`);
    if (!results.length) {
      bestLine.textContent = 'Aucune tentative enregistrée pour le moment.';
      return;
    }
    const best = Math.max(...results.map((r) => r.percent));
    const last = results[results.length - 1];
    bestLine.replaceChildren(
      h('strong', {}, best >= PASS_PERCENT ? 'Évaluation réussie' : 'Évaluation non validée'),
      ` · meilleur score : ${best} % · dernière tentative : ${last.score}/${last.total} le ${last.date}`
    );
  }

  function start() {
    if (cleanup) cleanup();
    const sample = shuffle(pool).slice(0, count);
    runRoot.replaceChildren();
    cleanup = runQuiz(runRoot, {
      courseId: course.id,
      chapterId: 'final',
      quizId: `${course.id}-final`,
      title: `${course.title} — évaluation finale`,
      questions: sample,
      settings: { maxAttempts: 1, shuffleQuestions: true, shuffleAnswers: true, timer: true, difficulty: 0 },
      onFinish: (result) => {
        refreshBest();
        if (result.percent >= PASS_PERCENT) {
          bestLine.append(' — réussite enregistrée.');
        }
      },
      onRestart: () => start()
    });
    runRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: start },
    icon('play', { size: 16 }), `Commencer l'évaluation (${count} questions)`);

  const chapterList = h('ul', { class: 'small' },
    course.chapters.map((chapter) => h('li', {
      text: `${chapter.title} — ${(chapter.quiz || []).length} question(s)`
    })));

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {},
        h('li', {}, h('a', { href: '#/catalogue' }, 'Catalogue')),
        h('li', {}, h('a', { href: `#/cours/${course.id}` }, course.title)),
        h('li', { 'aria-current': 'page' }, 'Évaluation finale'))),
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Évaluation finale' }),
      h('p', { text: `${course.title}. ${count} questions tirées parmi les quiz des chapitres, une seule tentative par question, chronomètre affiché, réussite à partir de ${PASS_PERCENT} %.` })),
    alertBox('info', 'Évaluation d\'entraînement, enregistrée sur cet appareil. Les réponses figurent dans les données de la page : elle ne constitue ni un examen sécurisé ni une certification.'),
    h('div', { class: 'split' },
      h('section', { class: 'card stack', 'aria-labelledby': 'final-info-title' },
        h('h2', { id: 'final-info-title', style: 'margin-top:0;font-size:1.15rem' }, 'Avant de commencer'),
        h('p', { class: 'small muted', style: 'margin:0' },
          `${progress.done} chapitre(s) terminé(s) sur ${progress.total}. Vous pouvez passer l'évaluation à tout moment ; il est recommandé d'avoir terminé le cours.`),
        bestLine,
        h('h3', { style: 'font-size:var(--text-sm);margin:var(--s3) 0 var(--s2)' }, 'Questions disponibles'),
        h('p', { class: 'small muted', style: 'margin:0' }, `${pool.length} question(s) au total, ${count} tirées au sort à chaque tentative.`),
        h('div', { class: 'row' }, startBtn)),
      h('section', { class: 'card', 'aria-labelledby': 'final-chapters-title' },
        h('h2', { id: 'final-chapters-title', style: 'margin-top:0;font-size:1.15rem' }, 'Chapitres couverts'),
        chapterList)
    ),
    runRoot
  ));

  refreshBest();
  return () => { if (cleanup) cleanup(); };
}
