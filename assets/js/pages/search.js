// Page de résultats de la recherche globale (#/recherche?q=...).

import { h, icon, emptyState } from '../core/dom.js';
import { getCourses, getDomains } from '../core/data.js';
import { search, highlightSegments } from '../core/search.js';
import { courseCard } from '../components/widgets.js';

function highlighted(text, query) {
  return highlightSegments(text, query).map((seg) => (seg.hit ? h('mark', { text: seg.text }) : seg.text));
}

export function renderSearchPage({ outlet, query }) {
  const q = (query.q || '').trim();
  const input = h('input', { type: 'search', id: 'search-page-input', value: q, placeholder: 'Rechercher…', autocomplete: 'off', 'aria-label': 'Rechercher dans kernova' });

  const form = h('form', {
    class: 'row',
    role: 'search',
    onSubmit: (e) => {
      e.preventDefault();
      const value = input.value.trim();
      window.location.hash = value ? `#/recherche?q=${encodeURIComponent(value)}` : '#/recherche';
    }
  }, h('div', { class: 'field', style: 'flex:1;min-width:220px' }, h('label', { for: 'search-page-input' }, 'Recherche'), input),
  h('button', { class: 'btn btn-primary', type: 'submit', style: 'align-self:end' }, 'Rechercher'));

  let body;
  if (!q) {
    body = emptyState({ icon: 'search', title: 'Que voulez-vous apprendre ?', text: 'Saisissez un mot-clé : une commande, une technologie, un concept comme « permissions » ou « processus ».' });
  } else {
    const result = search(q, { courses: getCourses(), domains: getDomains() });
    if (!result.total) {
      body = emptyState({
        icon: 'search',
        title: 'Aucun résultat',
        text: `Rien ne correspond à « ${q} ». Essayez un terme plus général ou vérifiez l'orthographe.`,
        actions: [h('a', { class: 'btn', href: '#/catalogue' }, 'Parcourir le catalogue')]
      });
    } else {
      body = h('div', { class: 'stack', style: 'gap:var(--space-6)' },
        result.courses.length
          ? h('section', { 'aria-labelledby': 'res-courses' },
            h('h2', { id: 'res-courses', style: 'margin-top:0', text: `Cours (${result.courses.length})` }),
            h('div', { class: 'grid-cards' }, result.courses.map((r) => courseCard(r.course))))
          : null,
        result.chapters.length
          ? h('section', { 'aria-labelledby': 'res-chapters' },
            h('h2', { id: 'res-chapters', style: 'margin-top:0', text: `Chapitres (${result.chapters.length})` }),
            h('ul', { class: 'list-plain' }, result.chapters.slice(0, 40).map((r) => h('li', { style: 'display:block' },
              h('a', { href: `#/cours/${r.course.id}/${r.chapter.id}`, style: 'font-weight:600' }, highlighted(r.chapter.title, q)),
              h('div', { class: 'small muted' }, `${r.course.title}, chapitre ${r.chapter.index + 1}`)
            ))))
          : null
      );
    }
  }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1' }, q ? `Résultats pour « ${q} »` : 'Recherche'),
      q ? h('p', { class: 'muted', role: 'status' }, icon('search', { size: 16 }), ' Recherche insensible à la casse et aux accents.') : null
    ),
    form,
    h('div', { style: 'margin-top:var(--space-5)' }, body)
  ));
  return undefined;
}
