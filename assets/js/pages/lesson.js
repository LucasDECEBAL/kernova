// Page d'un chapitre : sommaire, contenu, exercice, quiz, notes et navigation entre chapitres.

import { h, icon, emptyState, alertBox , setChildren } from '../core/dom.js';
import { getCourse, getChapter, ensureCourse } from '../core/data.js';
import { get } from '../core/store.js';
import {
  chapterStatus, missingPrerequisites, isChapterDone, markViewed, toggleChapterDone,
  getNote, saveNote
} from '../core/progress.js';
import { debounce, formatDuration } from '../core/utils.js';
import { toast } from '../core/ui.js';
import { renderBlocks, renderExercise } from '../components/lesson.js';
import { inline } from '../components/widgets.js';

export async function renderLessonPage({ outlet, params }) {
  await ensureCourse(params.courseId);
  const entry = getChapter(params.courseId, params.chapterId);
  if (!entry) {
    setChildren(outlet, h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Chapitre introuvable',
        text: 'Ce chapitre n\'existe pas dans ce cours.',
        actions: [h('a', { class: 'btn btn-primary', href: `#/cours/${params.courseId}` }, 'Retour au cours')]
      })));
    return;
  }

  const { course, chapter } = entry;
  const state = get();
  const status = chapterStatus(course, chapter, state);

  if (status === 'locked') {
    const missing = missingPrerequisites(course, chapter, state);
    setChildren(outlet, h('div', { class: 'page' },
      breadcrumb(course, chapter),
      h('h1', { text: chapter.title, tabindex: '-1' }),
      alertBox('warning', `Ce chapitre est verrouillé. Terminez d'abord : ${missing.map((m) => m.title).join(', ')}.`),
      h('div', { class: 'row' },
        missing[0] ? h('a', { class: 'btn btn-primary', href: `#/cours/${course.id}/${missing[0].id}` }, `Aller à « ${missing[0].title} »`) : null,
        h('a', { class: 'btn', href: `#/cours/${course.id}` }, 'Retour au cours')
      )
    ));
    return;
  }

  markViewed(course, chapter);

  const done = isChapterDone(course.id, chapter.id);
  const toggleBtn = h('button', { class: `btn ${done ? 'is-active' : 'btn-primary'}`, type: 'button', 'aria-pressed': String(done) });
  const setToggle = (isDone) => {
    toggleBtn.setAttribute('aria-pressed', String(isDone));
    toggleBtn.classList.toggle('is-active', isDone);
    toggleBtn.classList.toggle('btn-primary', !isDone);
    setChildren(toggleBtn, icon('check', { size: 16 }), isDone ? ' Terminé' : ' Terminer le chapitre');
    toggleBtn.setAttribute('aria-label', isDone ? 'Chapitre terminé, cliquer pour annuler' : 'Marquer ce chapitre comme terminé');
    toggleBtn.title = isDone ? 'Cliquer pour annuler' : 'Marquer ce chapitre comme terminé';
  };
  setToggle(done);
  toggleBtn.addEventListener('click', () => {
    const nowDone = toggleChapterDone(course, chapter);
    setToggle(nowDone);
    toast(nowDone ? 'Chapitre marqué comme terminé.' : 'Chapitre remis en cours.', nowDone ? 'success' : 'info', 2500);
    refreshToc();
    if (nowDone) {
      const next = nextChapter(course, chapter);
      if (next) toast(`Chapitre suivant débloqué : ${next.title}`, 'info', 4000);
    }
  });

  const notesStatus = h('span', { class: 'notes-status', role: 'status', 'aria-live': 'polite' }, '');
  const notesArea = h('textarea', {
    id: 'notes',
    'aria-describedby': 'notes-hint',
    placeholder: 'Remarques, commandes à retenir, questions…'
  });
  notesArea.value = getNote(course.id, chapter.id);
  const saveDebounced = debounce(() => {
    saveNote(course.id, chapter.id, notesArea.value);
    notesStatus.textContent = 'Enregistrées.';
  }, 400);
  notesArea.addEventListener('input', () => {
    notesStatus.textContent = 'Enregistrement…';
    saveDebounced();
  });

  const tocNav = h('nav', { 'aria-label': 'Sommaire du cours' },
    h('h2', { text: 'Sommaire' }),
    h('ol', { class: 'toc-list' }, course.chapters.map((ch) => {
      const s = chapterStatus(course, ch);
      const isCurrent = ch.id === chapter.id;
      const link = s === 'locked'
        ? h('span', { 'aria-disabled': 'true', title: 'Chapitre verrouillé' },
          h('span', { class: 'status locked', 'aria-hidden': 'true' }), `${ch.index + 1}. ${ch.title}`)
        : h('a', { href: `#/cours/${course.id}/${ch.id}`, 'aria-current': isCurrent ? 'page' : null },
          h('span', { class: `status ${s === 'done' ? 'done' : ''}`, 'aria-hidden': 'true' }),
          h('span', { text: `${ch.index + 1}. ${ch.title}` }),
          s === 'done' ? h('span', { class: 'sr-only' }, ' (terminé)') : null);
      return h('li', {}, link);
    }))
  );

  const tocEl = h('aside', { class: 'toc', 'aria-label': 'Table des matières' }, tocNav);

  /** Met à jour les pastilles d'état du sommaire après un changement de progression. */
  const refreshToc = () => {
    const items = tocNav.querySelectorAll('.toc-list > li');
    items.forEach((li, i) => {
      const s = chapterStatus(course, course.chapters[i]);
      const mark = li.querySelector('.status');
      if (mark) mark.className = `status ${s === 'done' ? 'done' : s === 'locked' ? 'locked' : ''}`.trim();
    });
  };

  const next = nextChapter(course, chapter);
  const prev = course.chapters[chapter.index - 1];
  const quizCount = chapter.quiz?.length || 0;

  setChildren(outlet, h('div', { class: 'page' },
    breadcrumb(course, chapter),
    h('div', { class: 'course-layout' },
      tocEl,
      h('article', { class: 'lesson stack', style: 'gap:var(--space-4)', 'aria-labelledby': 'chapter-title' },
        h('header', {},
          h('p', { class: 'lesson-meta' },
            `Chapitre ${chapter.index + 1} sur ${course.chapters.length}`,
            h('span', { 'aria-hidden': 'true' }, ' · '),
            formatDuration(chapter.duration)),
          h('h1', { id: 'chapter-title', tabindex: '-1', text: chapter.title })
        ),
        chapter.summary?.length
          ? h('section', { class: 'essential', 'aria-labelledby': 'summary-title' },
            h('h2', { id: 'summary-title' }, 'L\'essentiel'),
            h('ul', {}, chapter.summary.map((line) => h('li', { text: line }))))
          : null,
        chapter.objectives?.length
          ? h('details', { class: 'fold' },
            h('summary', {}, 'Objectifs du chapitre'),
            h('div', { class: 'fold-body' }, h('ul', {}, chapter.objectives.map((o) => h('li', {}, inline(o))))))
          : null,
        renderBlocks(chapter.content),
        chapter.exercise ? renderExercise(chapter.exercise) : null,
        quizCount
          ? h('section', { class: 'quiz-row', 'aria-labelledby': 'quiz-block-title' },
            h('div', {},
              h('h2', { id: 'quiz-block-title' }, 'Quiz du chapitre'),
              h('p', { class: 'small muted' }, `${quizCount} question${quizCount > 1 ? 's' : ''}`)),
            h('a', { class: 'btn btn-small', href: `#/quiz/${course.id}/${chapter.id}` },
              icon('play', { size: 15 }), ' Lancer le quiz'))
          : null,
        h('details', { class: 'fold' },
          h('summary', {}, h('span', {}, 'Mes notes'), notesStatus),
          h('div', { class: 'fold-body' },
            h('label', { for: 'notes', class: 'sr-only' }, 'Notes sur ce chapitre'),
            h('p', { id: 'notes-hint', class: 'small muted' }, 'Enregistrées uniquement dans ce navigateur.'),
            notesArea)),
        h('div', { class: 'lesson-actions' },
          toggleBtn,
          h('a', { class: 'link-quiet', href: `#/cours/${course.id}` }, 'Retour au cours')),
        h('nav', { class: 'chapter-nav', 'aria-label': 'Navigation entre chapitres' },
          prev
            ? h('a', { href: `#/cours/${course.id}/${prev.id}` },
              h('small', {}, 'Chapitre précédent'), h('span', { class: 'nav-title' }, prev.title))
            : h('span'),
          next
            ? h('a', { class: 'next', href: `#/cours/${course.id}/${next.id}` },
              h('small', {}, 'Chapitre suivant'), h('span', { class: 'nav-title' }, next.title))
            : h('a', { class: 'next', href: `#/evaluation/${course.id}` },
              h('small', {}, 'Dernier chapitre'), h('span', { class: 'nav-title' }, 'Évaluation finale du cours')))
      )
    )
  ));

  return () => {
    // Enregistre la note en attente lorsque l'utilisateur quitte la page.
    saveNote(course.id, chapter.id, notesArea.value);
  };
}

function breadcrumb(course, chapter) {
  return h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
    h('ol', {},
      h('li', {}, h('a', { href: '#/catalogue' }, 'Catalogue')),
      h('li', {}, h('a', { href: `#/cours/${course.id}` }, course.title)),
      chapter ? h('li', { 'aria-current': 'page' }, chapter.title) : null
    ));
}

function nextChapter(course, chapter) {
  return course.chapters[chapter.index + 1] || null;
}
