// Page quiz : réglages, lancement, relance des questions ratées, historique du chapitre.

import { h, icon, emptyState , setChildren } from '../core/dom.js';
import { getChapter } from '../core/data.js';
import { get } from '../core/store.js';
import { setQuizPrefs } from '../core/progress.js';
import { filterByDifficulty } from '../quiz/logic.js';
import { runQuiz } from '../quiz/view.js';
import { formatDuration } from '../core/utils.js';
import { toast } from '../core/ui.js';

const MAX_ATTEMPTS_LABELS = { 1: '1 tentative', 2: '2 tentatives', 3: '3 tentatives', 0: 'Illimitées' };

export function renderQuizPage({ outlet, params }) {
  const entry = getChapter(params.courseId, params.chapterId);
  if (!entry || !entry.chapter.quiz?.length) {
    setChildren(outlet, h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Quiz indisponible',
        text: 'Ce chapitre ne contient pas de quiz.',
        actions: [h('a', { class: 'btn btn-primary', href: `#/cours/${params.courseId}` }, 'Retour au cours')]
      })));
    return;
  }

  const { course, chapter } = entry;
  const back = `#/cours/${course.id}/${chapter.id}`;
  const crumbs = h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
    h('ol', {},
      h('li', {}, h('a', { href: `#/cours/${course.id}` }, course.title)),
      h('li', {}, h('a', { href: back }, chapter.title)),
      h('li', { 'aria-current': 'page' }, 'Quiz')
    ));

  const showSetup = (failedOnly = null) => {
    const prefs = get().prefs.quiz;
    const history = get().quizResults
      .filter((r) => r.courseId === course.id && r.chapterId === chapter.id)
      .slice(-5)
      .reverse();

    const fieldAttempts = h('select', { id: 'q-attempts', name: 'maxAttempts' },
      [2, 1, 3, 0].map((v) => h('option', { value: String(v), selected: prefs.maxAttempts === v }, MAX_ATTEMPTS_LABELS[v])));
    const fieldDifficulty = h('select', { id: 'q-difficulty', name: 'difficulty' },
      [[0, 'Tous niveaux'], [1, 'Niveau 1'], [2, 'Niveau 2'], [3, 'Niveau 3']]
        .map(([v, label]) => h('option', { value: String(v), selected: prefs.difficulty === v }, label)));
    const checkShuffleQ = h('input', { type: 'checkbox', id: 'q-shuffle-q', checked: prefs.shuffleQuestions });
    const checkShuffleA = h('input', { type: 'checkbox', id: 'q-shuffle-a', checked: prefs.shuffleAnswers });
    const checkTimer = h('input', { type: 'checkbox', id: 'q-timer', checked: prefs.timer });

    const startBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('play', { size: 16 }), failedOnly ? 'Réviser les questions ratées' : 'Démarrer le quiz');

    const form = h('form', { class: 'card stack', 'aria-labelledby': 'setup-title', onSubmit: (e) => e.preventDefault() },
      h('h2', { id: 'setup-title', style: 'margin-top:0;font-size:1.2rem' }, 'Réglages'),
      h('div', { class: 'filters-bar' },
        h('div', { class: 'field' }, h('label', { for: 'q-attempts' }, 'Tentatives par question'), fieldAttempts),
        h('div', { class: 'field' }, h('label', { for: 'q-difficulty' }, 'Niveau de difficulté'), fieldDifficulty)
      ),
      h('div', { class: 'row', style: 'gap:var(--space-4)' },
        h('label', { class: 'check' }, checkShuffleQ, 'Mélanger les questions'),
        h('label', { class: 'check' }, checkShuffleA, 'Mélanger les réponses'),
        h('label', { class: 'check' }, checkTimer, 'Afficher un chronomètre')
      ),
      h('p', { class: 'small muted', style: 'margin:0' }, 'Les réponses et explications sont présentes dans les données de la page : ce quiz sert à l\'entraînement, il ne permet pas une évaluation sécurisée.'),
      h('div', { class: 'row' }, startBtn)
    );

    startBtn.addEventListener('click', () => {
      const settings = {
        maxAttempts: Number(fieldAttempts.value),
        difficulty: Number(fieldDifficulty.value),
        shuffleQuestions: checkShuffleQ.checked,
        shuffleAnswers: checkShuffleA.checked,
        timer: checkTimer.checked
      };
      setQuizPrefs({
        maxAttempts: settings.maxAttempts,
        difficulty: settings.difficulty,
        shuffleQuestions: settings.shuffleQuestions,
        shuffleAnswers: settings.shuffleAnswers,
        timer: settings.timer
      });
      let questions = chapter.quiz;
      if (failedOnly) questions = questions.filter((q) => failedOnly.includes(q.id));
      else questions = filterByDifficulty(questions, settings.difficulty);
      if (!questions.length) {
        toast('Aucune question ne correspond à ces réglages.', 'error');
        return;
      }
      startSession(questions, settings);
    });

    const historyEl = history.length
      ? h('section', { class: 'card', 'aria-labelledby': 'hist-title' },
        h('h2', { id: 'hist-title', style: 'margin-top:0;font-size:1.1rem' }, 'Derniers résultats'),
        h('ul', { class: 'list-plain' }, history.map((r) => h('li', {},
          h('span', {}, r.date),
          h('strong', {}, `${r.score} / ${r.total} (${r.percent} %)`))))
      )
      : null;

    setChildren(outlet, h('div', { class: 'page quiz-shell' },
      crumbs,
      h('header', { class: 'page-head' },
        h('h1', { text: `Quiz : ${chapter.title}`, tabindex: '-1' }),
        h('p', {}, `${chapter.quiz.length} question(s), environ ${formatDuration(Math.max(5, chapter.quiz.length * 2))}`)
      ),
      form,
      historyEl
    ));
  };

  let cleanup = null;
  const startSession = (questions, settings) => {
    setChildren(outlet, h('div', { class: 'page quiz-shell' },
      crumbs,
      h('header', { class: 'page-head' },
        h('h1', { text: `Quiz : ${chapter.title}`, tabindex: '-1' })),
      h('div', { id: 'quiz-root' })
    ));
    const root = outlet.querySelector('#quiz-root');
    if (cleanup) cleanup();
    cleanup = runQuiz(root, {
      courseId: course.id,
      chapterId: chapter.id,
      title: chapter.title,
      questions,
      settings,
      onRetryFailed: (ids) => startSession(chapter.quiz.filter((q) => ids.includes(q.id)), settings),
      onRestart: () => showSetup()
    });
  };

  showSetup();
  return () => { if (cleanup) cleanup(); };
}
