// Contenus récents : derniers chapitres ouverts, avec reprise directe.

import { h, icon, emptyState } from '../core/dom.js';
import { getCourse, ensureAllCourses } from '../core/data.js';
import { get } from '../core/store.js';
import { isChapterDone } from '../core/progress.js';
import { statusBadge } from '../components/widgets.js';

function formatMoment(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export async function renderRecentPage({ outlet }) {
  await ensureAllCourses();
  const state = get();
  const rows = (state.recent || [])
    .map((entry) => {
      const course = getCourse(entry.courseId);
      if (!course) return null;
      const chapter = course.chapters.find((c) => c.id === entry.chapterId) || null;
      return { entry, course, chapter };
    })
    .filter(Boolean);

  if (!rows.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('h1', { tabindex: '-1', text: 'Contenus récents' }),
        h('p', { text: 'Les chapitres que vous ouvrez apparaissent ici, pour reprendre rapidement.' })),
      emptyState({
        icon: 'clock',
        title: 'Aucun contenu ouvert pour le moment',
        text: 'Ouvrez un chapitre : il sera ajouté à cette liste, enregistrée sur cet appareil.',
        actions: [
          h('a', { class: 'btn btn-primary', href: '#/catalogue' }, 'Parcourir le catalogue'),
          h('a', { class: 'btn', href: '#/cours/linux-debutant' }, 'Ouvrir Linux débutant')
        ]
      })
    ));
    return undefined;
  }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Contenus récents' }),
      h('p', { text: 'Derniers chapitres ouverts sur cet appareil, du plus récent au plus ancien. Rien n\'est envoyé ailleurs.' }),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn', href: '#/tableau-de-bord' }, 'Tableau de bord'))),
    h('ul', { class: 'list-plain' },
      rows.map(({ entry, course, chapter }) => h('li', {},
        h('div', { class: 'stack', style: 'gap:2px' },
          h('a', {
            href: chapter ? `#/cours/${course.id}/${chapter.id}` : `#/cours/${course.id}`,
            style: 'font-weight:600'
          }, chapter ? chapter.title : course.title),
          h('span', { class: 'small muted' },
            `${course.title} · ${formatMoment(entry.at)}`)),
        h('div', { class: 'row', style: 'gap:8px' },
          chapter && isChapterDone(course.id, chapter.id, state) ? statusBadge('done') : null,
          h('a', {
            class: 'btn btn-small',
            href: chapter ? `#/cours/${course.id}/${chapter.id}` : `#/cours/${course.id}`
          }, icon('arrowRight', { size: 15 }), 'Reprendre'))
      ))
    )
  ));
  return undefined;
}
