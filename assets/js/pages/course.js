// Page d'un cours : présentation courte, liste unique des chapitres, projet et cours liés.

import { h, icon, progressBar, emptyState, setChildren } from '../core/dom.js';
import { getCourse, getCourses, getDomain, ensureCourse } from '../core/data.js';
import { get } from '../core/store.js';
import { courseProgress, chapterStatus, resumeChapter } from '../core/progress.js';
import { formatDuration } from '../core/utils.js';
import { levelBadge, typeBadge, tags, favoriteButton } from '../components/widgets.js';

const STATUS_LABEL = { done: 'Terminé', current: 'À suivre', available: 'Accessible', locked: 'Verrouillé' };

export async function renderCoursePage({ outlet, params }) {
  await ensureCourse(params.id);
  const course = getCourse(params.id);
  if (!course) {
    setChildren(outlet,
      h('div', { class: 'page' },
        emptyState({
          icon: 'alert',
          title: 'Cours introuvable',
          text: 'Ce cours n\'existe pas dans le catalogue local.',
          actions: [h('a', { class: 'btn btn-primary', href: '#/catalogue' }, 'Voir le catalogue')]
        })
      )
    );
    return;
  }

  const state = get();
  const p = courseProgress(course, state);
  const domain = getDomain(course.domain);
  const resume = resumeChapter(course, state);
  const finalResults = state.quizResults.filter((r) => r.quizId === `${course.id}-final`);
  const bestFinal = finalResults.length ? Math.max(...finalResults.map((r) => r.percent)) : null;
  const moduleCount = new Set(course.chapters.map((ch) => ch.module).filter(Boolean)).size;

  setChildren(outlet,
    h('div', { class: 'page' },
      h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
        h('ol', {},
          h('li', {}, h('a', { href: '#/catalogue' }, 'Catalogue')),
          domain ? h('li', {}, h('a', { href: `#/domaines/${domain.id}` }, domain.name)) : null,
          h('li', { 'aria-current': 'page' }, course.title)
        )
      ),
      h('header', { class: 'page-head' },
        h('div', { class: 'row', style: 'gap:8px' }, levelBadge(course.level), typeBadge(course.type)),
        h('h1', { text: course.title, tabindex: '-1' }),
        h('p', { text: course.description }),
        h('div', { class: 'meta' },
          h('span', {}, icon('clock', { size: 15 }), formatDuration(course.duration)),
          h('span', {}, icon('book', { size: 15 }),
            `${course.chapters.length} chapitres${moduleCount ? `, ${moduleCount} module${moduleCount > 1 ? 's' : ''}` : ''}`)
        ),
        h('div', { class: 'course-start' },
          resume
            ? h('a', { class: 'btn btn-primary', href: `#/cours/${course.id}/${resume.id}` },
              icon('play', { size: 16 }),
              p.started && !p.finished ? ' Reprendre' : ' Commencer')
            : null,
          h('a', { class: 'btn', href: `#/evaluation/${course.id}` },
            icon('check', { size: 16 }),
            bestFinal === null ? ' Évaluation finale' : ` Évaluation finale · ${bestFinal} %`),
          favoriteButton(course.id, { compact: true })),
        h('div', { class: 'course-progress' },
          progressBar(p.percent, `Chapitres terminés : ${p.done} / ${p.total}`))
      ),

      h('section', { 'aria-labelledby': 'chapters-title' },
        h('h2', { id: 'chapters-title' }, 'Chapitres'),
        moduleList(course, state)
      ),

      courseInfo(course),

      course.project ? projectSection(course.project) : null
    )
  );
}

/** Liste unique des chapitres, regroupés par module, avec une pastille d'état. */
function moduleList(course, state) {
  const blocks = [];
  let currentModule;
  let list = null;
  course.chapters.forEach((ch) => {
    if ((ch.module || null) !== currentModule) {
      currentModule = ch.module || null;
      list = h('ol', { class: 'chapter-list' });
      blocks.push(h('div', { class: 'module-block' },
        currentModule ? h('h3', { class: 'module-title', text: currentModule }) : null,
        list
      ));
    }
    const status = chapterStatus(course, ch, state);
    const questions = ch.quiz?.length || 0;
    list.append(h('li', { 'data-status': status },
      h('span', {
        class: `status ${status === 'done' ? 'done' : status === 'locked' ? 'locked' : ''}`.trim(),
        'aria-hidden': 'true'
      }),
      h('div', {},
        h('a', { href: `#/cours/${course.id}/${ch.id}` }, `${ch.index + 1}. ${ch.title}`),
        h('small', {},
          `${formatDuration(ch.duration)}${questions ? ` · ${questions} question${questions > 1 ? 's' : ''}` : ''}`),
        h('span', { class: 'sr-only' }, ` (${STATUS_LABEL[status] || status})`))
    ));
  });
  return h('div', { class: 'stack', style: 'gap:var(--space-5)' }, blocks);
}

/** Objectifs, prérequis, compétences et cours liés, repliés pour laisser la place aux chapitres. */
function courseInfo(course) {
  const sections = [];
  if (course.objectives?.length) {
    sections.push(h('h3', {}, 'Objectifs'), h('ul', {}, course.objectives.map((o) => h('li', { text: o }))));
  }
  const prerequisites = course.prerequisites || [];
  const prerequisiteCourses = relatedCourses('Cours à suivre avant', course.prerequisiteCourses);
  if (prerequisites.length || prerequisiteCourses) {
    sections.push(h('h3', {}, 'Prérequis'));
    if (prerequisites.length) sections.push(h('ul', {}, prerequisites.map((x) => h('li', { text: x }))));
    if (prerequisiteCourses) sections.push(prerequisiteCourses);
  }
  if (course.skills?.length) {
    sections.push(h('h3', {}, 'Compétences acquises'), h('ul', {}, course.skills.map((s) => h('li', { text: s }))));
  }
  const nextCourses = relatedCourses('Cours suivants recommandés', course.nextCourses);
  if (course.technologies?.length || nextCourses) {
    sections.push(h('h3', {}, 'Technologies'));
    if (course.technologies?.length) sections.push(tags(course.technologies));
    if (nextCourses) sections.push(nextCourses);
  }
  if (!sections.length) return null;
  return h('details', { class: 'fold course-info' },
    h('summary', {}, 'Objectifs, prérequis et compétences'),
    h('div', { class: 'fold-body' }, sections)
  );
}

/** Liens vers d'autres cours (prérequis ou suites), uniquement pour les cours réellement publiés. */
function relatedCourses(title, ids) {
  const published = getCourses();
  const items = (ids || []).map((id) => published.find((c) => c.id === id)).filter(Boolean);
  if (!items.length) return null;
  return h('div', { class: 'related-courses' },
    h('p', { class: 'small', style: 'margin-bottom:var(--space-2)' }, h('strong', {}, title)),
    h('ul', { class: 'small' }, items.map((c) => h('li', {}, h('a', { href: `#/cours/${c.id}` }, c.title)))));
}

/** Projet pratique : brief, étapes et critères de réussite, replié. */
function projectSection(project) {
  return h('details', { class: 'fold project-fold' },
    h('summary', {}, `Projet pratique : ${project.title}`),
    h('div', { class: 'fold-body' },
      h('p', { text: project.brief }),
      h('h3', {}, 'Étapes'),
      h('ol', { class: 'project-steps' }, project.steps.map((s) => h('li', { text: s }))),
      h('h3', {}, 'Critères de réussite'),
      h('ul', {}, project.criteria.map((c) => h('li', { text: c })))
    )
  );
}
