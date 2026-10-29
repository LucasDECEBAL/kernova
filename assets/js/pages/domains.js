// Domaines informatiques : liste, puis page dédiée à chaque domaine avec ses cours ou un état vide.

import { h, icon, emptyState } from '../core/dom.js';
import { getDomains, getDomain, getCoursesByDomain } from '../core/data.js';
import { courseCard } from '../components/widgets.js';

export function renderDomainsIndex({ outlet }) {
  const domains = getDomains();
  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { text: 'Domaines informatiques', tabindex: '-1' }),
      h('p', { text: 'Chaque domaine rassemble les cours qui s\'y rattachent. Les domaines encore vides sont indiqués : leur contenu n\'est pas encore publié.' })
    ),
    h('ul', { class: 'index-grid', style: 'list-style:none;padding:0;margin:0' }, domains.map((d) => {
      const count = getCoursesByDomain(d.id).length;
      return h('li', { class: 'index-item' },
        h('a', { href: `#/domaines/${d.id}` }, h('span', { class: 'index-name', text: d.name })),
        h('span', { class: 'small muted', text: count ? `${count} cours publié${count > 1 ? 's' : ''}` : 'Contenu à venir' }),
        h('p', { class: 'small muted', style: 'margin:6px 0 0', text: d.description })
      );
    }))
  ));
  return undefined;
}

export function renderDomainPage({ outlet, params }) {
  const domain = getDomain(params.id);
  if (!domain) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Domaine introuvable', text: 'Ce domaine n\'existe pas dans le catalogue.', actions: [h('a', { class: 'btn', href: '#/domaines' }, 'Tous les domaines')] })
    ));
    return undefined;
  }
  const courses = getCoursesByDomain(domain.id);
  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {},
        h('li', {}, h('a', { href: '#/domaines' }, 'Domaines')),
        h('li', { 'aria-current': 'page' }, domain.name))),
    h('header', { class: 'page-head' },
      h('h1', { text: domain.name, tabindex: '-1' }),
      h('p', { text: domain.description })
    ),
    courses.length
      ? h('div', { class: 'grid-cards' }, courses.map(courseCard))
      : emptyState({
        icon: 'book',
        title: 'Contenu en préparation',
        text: 'Aucun cours n\'est encore publié dans ce domaine. Vous pouvez explorer les parcours disponibles en attendant.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/catalogue' }, 'Voir le catalogue')]
      })
  ));
  return undefined;
}
