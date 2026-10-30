// Parcours multi-cours : étapes calculées à partir des prérequis, avec état de déblocage.

import { h, emptyState, progressBar } from '../core/dom.js';
import { getCourses, getDomains, getDomain, ensureAllCourses } from '../core/data.js';
import { get } from '../core/store.js';
import { buildParcours } from '../core/paths.js';
import { levelBadge, statusBadge, tags } from '../components/widgets.js';
import { percent } from '../core/utils.js';

export async function renderParcoursPage({ outlet }) {
  await ensureAllCourses();
  const courses = getCourses();
  const domains = getDomains().filter((d) => courses.some((c) => c.domain === d.id));
  const state = get();
  const data = buildParcours(courses, state);

  if (!data.rows.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'book', title: 'Aucun parcours', text: 'Le catalogue ne contient aucun cours.' })));
    return undefined;
  }

  let domain = '';
  const columns = h('div', { class: 'path-columns' });
  const statsLine = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const legend = h('div', { class: 'row', style: 'gap:var(--s3)' },
    h('span', { class: 'badge', 'data-status': 'available' }, 'Disponible'),
    h('span', { class: 'badge', 'data-status': 'current' }, 'En cours'),
    h('span', { class: 'badge', 'data-status': 'done' }, 'Terminé'),
    h('span', { class: 'badge', 'data-status': 'locked' }, 'Verrouillé'));

  const domainSelect = h('select', {
    id: 'path-domain',
    onChange: (e) => { domain = e.target.value; refresh(); }
  }, [['', 'Tous les domaines'], ...domains.map((d) => [d.id, d.name])]
    .map(([value, label]) => h('option', { value }, label)));

  function node(row) {
    const domainInfo = getDomain(row.course.domain);
    return h('article', { class: 'path-node', 'data-status': row.status },
      h('div', { class: 'row', style: 'gap:6px' },
        levelBadge(row.course.level),
        h('span', { class: 'small muted', text: domainInfo?.name || '' })),
      h('h3', {}, h('a', { href: `#/cours/${row.course.id}`, text: row.course.title })),
      h('p', { class: 'small muted', style: 'margin:0', text: row.course.description }),
      h('div', { class: 'stack', style: 'gap:4px' },
        progressBar(row.progress.percent, 'Progression'),
        h('div', { class: 'row', style: 'gap:8px' },
          statusBadge(row.status === 'current' ? 'current' : row.status),
          h('span', { class: 'small muted' },
            row.progress.done === 0 ? 'non commencé' : `${row.progress.done}/${row.progress.total} chapitres`))),
      h('div', { class: 'path-prereqs' },
        h('span', { class: 'small muted', text: row.prereqs.length ? 'Après :' : 'Aucun prérequis' }),
        row.prereqs.length
          ? h('div', { class: 'tags' }, row.prereqs.map((p) => h('a', {
            class: `tag ${row.missing.some((m) => m.id === p.id) ? 'tag-locked' : 'tag-done'}`,
            href: `#/cours/${p.id}`,
            text: p.title
          })))
          : null)
    );
  }

  function refresh() {
    const rows = data.byLevel.map((list) => list.filter((row) => !domain || row.course.domain === domain));
    const total = rows.reduce((sum, list) => sum + list.length, 0);
    const done = rows.flat().filter((r) => r.status === 'done').length;
    statsLine.textContent = `${total} cours · ${done} terminé(s) · ${rows.flat().filter((r) => r.status === 'locked').length} verrouillé(s) · avancement global ${percent(done, total)} %`;

    if (!total) {
      columns.replaceChildren(emptyState({
        icon: 'book',
        title: 'Aucun cours dans ce domaine',
        text: 'Choisissez un autre domaine ou affichez tous les cours.',
        actions: [h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => { domain = ''; domainSelect.value = ''; refresh(); }
        }, 'Tous les domaines')]
      }));
      return;
    }

    columns.replaceChildren(...rows.map((list, level) => list.length
      ? h('section', { class: 'path-level', 'aria-labelledby': `path-level-${level}` },
        h('div', { class: 'path-level-head' },
          h('h2', { id: `path-level-${level}` }, level === 0 ? 'Points de départ' : `Étape ${level}`),
          h('span', { class: 'small muted', text: `${list.length} cours` })),
        h('div', { class: 'path-level-body' }, list.map(node)))
      : null));
  }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Parcours' }),
      h('p', { text: 'La position de chaque cours dépend de ses prérequis : un cours se débloque quand ceux dont il dépend sont terminés. Les étapes sont calculées automatiquement à partir du catalogue.' })),
    h('div', { class: 'filters-bar' },
      h('div', { class: 'field', style: 'min-width:240px' }, h('label', { for: 'path-domain' }, 'Domaine'), domainSelect)),
    statsLine,
    legend,
    columns
  ));

  refresh();
  return undefined;
}
