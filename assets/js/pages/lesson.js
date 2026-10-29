// Page d'un chapitre : sommaire, contenu, exercice, quiz, notes et navigation entre chapitres.

import { h, icon, emptyState, alertBox , setChildren } from '../core/dom.js';
import { getCourse, getChapter } from '../core/data.js';
import { get } from '../core/store.js';
import {
  chapterStatus, missingPrerequisites, isChapterDone, markViewed, toggleChapterDone,
  getNote, saveNote
} from '../core/progress.js';
import { debounce, formatDuration } from '../core/utils.js';
import { toast } from '../core/ui.js';
import { renderBlocks, renderExercise } from '../components/lesson.js';
import { inline, statusBadge } from '../components/widgets.js';

export function renderLessonPage({ outlet, params }) {
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
    setChildren(toggleBtn, icon('check', { size: 16 }), isDone ? ' Terminé (annuler)' : ' Marquer comme terminé');
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

  const notesStatus = h('span', { class: 'notes-status', role: 'status', 'aria-live': 'polite' }, 'Enregistrées automatiquement sur cet appareil');
  const notesArea = h('textarea', {
    id: 'notes',
    'aria-describedby': 'notes-hint',
    placeholder: 'Écrivez vos remarques, commandes à retenir, questions…'
  });
  notesArea.value = getNote(course.id, chapter.id);
  const saveDebounced = debounce(() => {
    saveNote(course.id, chapter.id, notesArea.value);
    notesStatus.textContent = 'Notes enregistrées.';
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
          h('div', { class: 'row', style: 'gap:8px' }, statusBadge(chapterStatus(course, chapter)),
            h('span', { class: 'small muted' }, `Chapitre ${chapter.index + 1} sur ${course.chapters.length}`),
            h('span', { class: 'small muted' }, formatDuration(chapter.duration))),
          h('h1', { id: 'chapter-title', tabindex: '-1', text: chapter.title })
        ),
        chapter.objectives?.length
          ? h('section', { class: 'card' },
            h('h2', { style: 'margin-top:0;font-size:1.05rem' }, 'Objectifs'),
            h('ul', {}, chapter.objectives.map((o) => h('li', {}, inline(o)))))
          : null,
        renderBlocks(chapter.content),
        chapter.summary?.length
          ? h('section', { class: 'card', 'aria-labelledby': 'summary-title' },
            h('h2', { id: 'summary-title', style: 'margin-top:0;font-size:1.2rem' }, 'Résumé'),
            h('ul', { style: 'margin:0' }, chapter.summary.map((line) => h('li', { text: line }))))
          : null,
        chapter.exercise ? renderExercise(chapter.exercise) : null,
        h('section', { class: 'card', 'aria-labelledby': 'quiz-block-title' },
          h('h2', { id: 'quiz-block-title', style: 'margin-top:0;font-size:1.2rem' }, 'Quiz du chapitre'),
          h('p', { class: 'muted' }, quizCount
            ? `${quizCount} question(s) : QCM, vrai ou faux, texte à trous, classement, association. Vos scores sont enregistrés sur cet appareil.`
            : 'Aucune question pour ce chapitre.'),
          quizCount ? h('a', { class: 'btn btn-primary', href: `#/quiz/${course.id}/${chapter.id}` }, icon('play', { size: 16 }), 'Lancer le quiz') : null
        ),
        h('section', { class: 'card', 'aria-labelledby': 'notes-title' },
          h('div', { class: 'row', style: 'justify-content:space-between' },
            h('h2', { id: 'notes-title', style: 'margin:0;font-size:1.2rem' }, 'Mes notes'),
            notesStatus),
          h('p', { id: 'notes-hint', class: 'small muted' }, 'Notes personnelles, stockées uniquement dans ce navigateur.'),
          h('div', { class: 'field' },
            h('label', { for: 'notes' }, 'Notes sur ce chapitre'),
            notesArea)
        ),
        h('div', { class: 'row', style: 'justify-content:space-between;margin-top:var(--space-4)' },
          toggleBtn,
          h('a', { class: 'btn btn-ghost', href: `#/cours/${course.id}` }, 'Retour au parcours')
        ),
        chapter.nextStep
          ? h('div', { class: 'callout callout-tip', role: 'note' }, h('strong', {}, 'Suite logique'), chapter.nextStep)
          : null,
        h('nav', { class: 'chapter-nav', 'aria-label': 'Navigation entre chapitres' },
          prev ? h('a', { href: `#/cours/${course.id}/${prev.id}` }, h('small', {}, 'Chapitre précédent'), h('span', { class: 'nav-title' }, prev.title)) : h('span'),
          next ? h('a', { class: 'next', href: `#/cours/${course.id}/${next.id}` }, h('small', {}, 'Chapitre suivant'), h('span', { class: 'nav-title' }, next.title)) : h('span')
        )
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
