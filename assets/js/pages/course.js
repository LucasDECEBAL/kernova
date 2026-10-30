// Page d'un cours : présentation, objectifs, prérequis, arbre de compétences, modules, projet et cours suivants.

import { h, icon, progressBar, emptyState, alertBox , setChildren } from '../core/dom.js';
import { getCourse, getCourses, getDomain, ensureCourse } from '../core/data.js';
import { get } from '../core/store.js';
import {
  courseProgress, chapterStatus, missingPrerequisites, resumeChapter, isChapterDone, prerequisitesOf
} from '../core/progress.js';
import { formatDuration } from '../core/utils.js';
import { levelBadge, typeBadge, statusBadge, tags, favoriteButton, inline } from '../components/widgets.js';

const STATUS_MARK = { done: '✓', current: '•', available: '○', locked: '–' };
const STATUS_LABEL = { done: 'Acquise', current: 'En cours', available: 'Disponible', locked: 'Verrouillée' };

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

  const detail = h('aside', { class: 'card skill-detail', 'aria-live': 'polite', 'aria-label': 'Détail de la compétence' });
  const tree = renderSkillTree(course, detail);
  showSkillDetail(course, course.chapters[0], detail);

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
          h('span', {}, icon('book', { size: 15 }), `${course.chapters.length} chapitres`),
          h('span', {}, icon('check', { size: 15 }), `${p.done} terminé(s)`)
        ),
        h('div', { class: 'hero-actions' },
          resume
            ? h('a', { class: 'btn btn-primary', href: `#/cours/${course.id}/${resume.id}` },
              icon('play', { size: 16 }), p.started && !p.finished ? 'Reprendre où vous en étiez' : 'Commencer le cours')
            : null,
          h('a', { class: 'btn', href: `#/evaluation/${course.id}` },
            icon('check', { size: 16 }),
            bestFinal === null ? 'Évaluation finale' : `Évaluation finale (${bestFinal} %)`),
          favoriteButton(course.id)
        ),
        h('div', { style: 'max-width:520px;margin-top:var(--space-4)' }, progressBar(p.percent, 'Progression du cours'))
      ),

      h('div', { class: 'split' },
        h('div', { class: 'stack' },
          h('section', { class: 'card', 'aria-labelledby': 'obj-title' },
            h('h2', { id: 'obj-title', style: 'margin-top:0;font-size:1.1rem' }, 'Objectifs pédagogiques'),
            h('ul', {}, course.objectives.map((o) => h('li', { text: o })))
          ),
          h('section', { class: 'card', 'aria-labelledby': 'pre-title' },
            h('h2', { id: 'pre-title', style: 'margin-top:0;font-size:1.1rem' }, 'Prérequis'),
            h('ul', {}, (course.prerequisites || []).map((x) => h('li', { text: x }))),
            relatedCourses('Cours à suivre avant', course.prerequisiteCourses)
          ),
          h('section', { class: 'card' },
            h('h2', { style: 'margin-top:0;font-size:1.1rem' }, 'Compétences acquises'),
            course.skills.length
              ? h('ul', {}, course.skills.map((s) => h('li', { text: s })))
              : h('p', { class: 'small muted', text: 'Précisées dans la description du cours.' })
          ),
          h('section', { class: 'card' },
            h('h2', { style: 'margin-top:0;font-size:1.1rem' }, 'Technologies'),
            tags(course.technologies),
            relatedCourses('Cours suivants recommandés', course.nextCourses)
          )
        ),
        h('section', { 'aria-labelledby': 'tree-title' },
          h('h2', { id: 'tree-title', style: 'margin-top:0' }, 'Arbre de compétences'),
          h('p', { class: 'muted small', text: 'Chaque chapitre est une compétence. Elle se débloque lorsque ses prérequis sont validés. Cliquez sur une compétence pour voir son détail.' }),
          h('div', { class: 'skill-layout' }, tree, detail)
        )
      ),

      h('section', { 'aria-labelledby': 'chapters-title', style: 'margin-top:var(--space-6)' },
        h('h2', { id: 'chapters-title', style: 'margin-top:0' }, 'Modules et leçons'),
        moduleList(course, state)
      ),

      course.project ? projectSection(course.project) : null
    )
  );
}

/** Liste des chapitres regroupés par module, avec un titre pour chaque module. */
function moduleList(course, state) {
  const blocks = [];
  let currentModule; // non initialisé : la première leçon crée toujours un bloc
  let list = null;
  course.chapters.forEach((ch) => {
    if ((ch.module || null) !== currentModule) {
      currentModule = ch.module || null;
      list = h('ol', { class: 'list-plain' });
      blocks.push(h('div', { class: 'module-block' },
        currentModule ? h('h3', { class: 'module-title', text: currentModule }) : null,
        list
      ));
    }
    const status = chapterStatus(course, ch, state);
    list.append(h('li', {},
      h('div', { class: 'stack', style: 'gap:2px' },
        h('a', { href: `#/cours/${course.id}/${ch.id}`, style: 'font-weight:600' }, `${ch.index + 1}. ${ch.title}`),
        h('span', { class: 'small muted' }, `${formatDuration(ch.duration)}, ${ch.quiz?.length || 0} question(s) de quiz`)
      ),
      statusBadge(status)
    ));
  });
  return h('div', { class: 'stack', style: 'gap:var(--space-5)' }, blocks);
}

/** Liens vers d'autres cours (prérequis ou suites), uniquement pour les cours réellement publiés. */
function relatedCourses(title, ids) {
  const published = getCourses();
  const items = (ids || []).map((id) => published.find((c) => c.id === id)).filter(Boolean);
  if (!items.length) return null;
  return h('div', { style: 'margin-top:var(--space-3)' },
    h('p', { class: 'small', style: 'margin-bottom:var(--space-2)' }, h('strong', {}, title)),
    h('ul', { class: 'small' }, items.map((c) => h('li', {}, h('a', { href: `#/cours/${c.id}` }, c.title)))));
}

/** Projet pratique : brief, étapes et critères de réussite. */
function projectSection(project) {
  return h('section', { class: 'card project', 'aria-labelledby': 'project-title', style: 'margin-top:var(--space-6)' },
    h('h2', { id: 'project-title', style: 'margin-top:0' }, `Projet pratique : ${project.title}`),
    h('p', { text: project.brief }),
    h('h3', { style: 'font-size:1.05rem', text: 'Étapes' }),
    h('ol', {}, project.steps.map((s) => h('li', { text: s }))),
    h('h3', { style: 'font-size:1.05rem', text: 'Critères de réussite' }),
    h('ul', {}, project.criteria.map((c) => h('li', { text: c })))
  );
}

/** Liste verticale de compétences cliquables, reliées entre elles. */
function renderSkillTree(course, detail) {
  const state = get();
  const nodes = [];
  course.chapters.forEach((ch, i) => {
    const status = chapterStatus(course, ch, state);
    const btn = h('button', {
      class: 'skill-node',
      type: 'button',
      'data-status': status,
      'aria-pressed': String(i === 0),
      onClick: (e) => {
        for (const b of tree.querySelectorAll('.skill-node')) {
          b.setAttribute('aria-pressed', String(b === e.currentTarget));
        }
        showSkillDetail(course, ch, detail);
      }
    },
      h('span', { class: 'dot', 'aria-hidden': 'true', text: STATUS_MARK[status] || '' }),
      h('span', { class: 'label' },
        h('span', { text: `${i + 1}. ${ch.title}` }),
        h('small', { text: `${STATUS_LABEL[status]}, ${formatDuration(ch.duration)}` })
      )
    );
    nodes.push(btn);
    if (i < course.chapters.length - 1) nodes.push(h('div', { class: 'skill-connector', 'aria-hidden': 'true' }));
  });
  const tree = h('div', { class: 'skill-tree', role: 'group', 'aria-label': 'Compétences du cours' }, nodes);
  return tree;
}

/** Affiche le détail d'une compétence : objectifs, prérequis, accès. */
function showSkillDetail(course, chapter, container) {
  const state = get();
  const status = chapterStatus(course, chapter, state);
  const missing = missingPrerequisites(course, chapter, state);
  const prereqs = prerequisitesOf(course, chapter, state);
  setChildren(container, 
    h('h3', { text: chapter.title }),
    h('div', { class: 'row', style: 'gap:8px;margin-bottom:var(--space-3)' },
      statusBadge(status), h('span', { class: 'small muted' }, formatDuration(chapter.duration))),
    h('p', { class: 'small', style: 'margin-bottom:var(--space-2)' }, h('strong', {}, 'Objectifs')),
    h('ul', { class: 'small' }, chapter.objectives.map((o) => h('li', {}, inline(o)))),
    h('p', { class: 'small', style: 'margin:var(--space-3) 0 var(--space-2)' },
      h('strong', {}, 'Prérequis : '),
      prereqs.length ? prereqs.map((p) => p.title).join(', ') : 'aucun'),
    missing.length
      ? h('p', { class: 'small' }, `À valider d'abord : ${missing.map((m) => m.title).join(', ')}.`)
      : null,
    status === 'locked'
      ? alertBox('info', 'Compétence verrouillée. Validez les prérequis pour y accéder.')
      : h('a', { class: 'btn btn-primary btn-small', href: `#/cours/${course.id}/${chapter.id}` },
        isChapterDone(course.id, chapter.id, state) ? 'Revoir ce chapitre' : 'Ouvrir ce chapitre')
  );
}
