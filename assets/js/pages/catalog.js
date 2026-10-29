// Catalogue : recherche instantanée, filtres combinables, tri et chargement progressif.

import { h, icon, emptyState , setChildren } from '../core/dom.js';
import { getCourses, getDomains } from '../core/data.js';
import { get } from '../core/store.js';
import { courseProgress, isFavorite } from '../core/progress.js';
import { normalize, debounce, LEVELS, TYPES } from '../core/utils.js';
import { courseCard } from '../components/widgets.js';

const PAGE_SIZE = 6;

const DURATION_RANGES = {
  short: { label: 'Moins d\'1 h', test: (m) => m < 60 },
  medium: { label: 'De 1 h à 3 h', test: (m) => m >= 60 && m <= 180 },
  long: { label: 'Plus de 3 h', test: (m) => m > 180 }
};

const PROGRESS_FILTERS = {
  none: { label: 'Non commencé', test: (p) => !p.started },
  doing: { label: 'En cours', test: (p) => p.started && !p.finished },
  done: { label: 'Terminé', test: (p) => p.finished }
};

const SORTS = {
  title: { label: 'Ordre alphabétique', compare: (a, b) => a.course.title.localeCompare(b.course.title, 'fr') },
  level: { label: 'Difficulté', compare: (a, b) => (LEVELS[a.course.level]?.rank ?? 9) - (LEVELS[b.course.level]?.rank ?? 9) || a.course.title.localeCompare(b.course.title, 'fr') },
  duration: { label: 'Durée', compare: (a, b) => a.course.duration - b.course.duration },
  progress: { label: 'Progression', compare: (a, b) => b.percent - a.percent || a.course.title.localeCompare(b.course.title, 'fr') }
};

const DEFAULT_FILTERS = {
  q: '', tech: '', level: '', domain: '', subdomain: '', duration: '', type: '', progress: '', favorites: false, sort: 'title'
};

export function renderCatalogPage({ outlet, query }) {
  const courses = getCourses();
  const domains = getDomains();
  const filters = { ...DEFAULT_FILTERS };
  if (query.q) filters.q = query.q;
  let visible = PAGE_SIZE;

  const technologies = [...new Set(courses.flatMap((c) => c.technologies || []))].sort((a, b) => a.localeCompare(b, 'fr'));

  // Sous-domaines : valeur « domaine||sous-domaine », libellé lisible avec le domaine
  const subdomains = [...new Set(courses.filter((c) => c.subdomain).map((c) => `${c.domain}||${c.subdomain}`))]
    .map((key) => {
      const [domainId, sub] = key.split('||');
      const domain = domains.find((d) => d.id === domainId);
      return { value: key, label: domain ? `${domain.name} (${sub})` : sub };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  const select = (id, label, options, value, onChange) => h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('select', {
      id,
      name: id,
      onChange: (e) => { onChange(e.target.value); visible = PAGE_SIZE; update(); }
    }, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)))
  );

  const searchInput = h('input', {
    id: 'cat-search',
    type: 'search',
    placeholder: 'Titre, technologie, contenu…',
    autocomplete: 'off',
    value: filters.q,
    onInput: debounce((e) => { filters.q = e.target.value; visible = PAGE_SIZE; update(); }, 120)
  });

  const resultsRegion = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite', id: 'cat-count' });
  const listEl = h('div', { class: 'grid-cards', id: 'cat-list' });
  const moreWrap = h('div', { style: 'margin-top:var(--space-5);text-align:center' });

  const favCheck = h('input', { type: 'checkbox', id: 'cat-fav', checked: filters.favorites });
  favCheck.addEventListener('change', () => { filters.favorites = favCheck.checked; visible = PAGE_SIZE; update(); });

  const filtersBar = h('form', {
    class: 'card stack',
    role: 'search',
    'aria-label': 'Filtrer le catalogue',
    onSubmit: (e) => e.preventDefault()
  },
    h('div', { class: 'field' }, h('label', { for: 'cat-search' }, 'Rechercher'), searchInput),
    h('div', { class: 'filters-bar' },
      select('cat-tech', 'Technologie', [['', 'Toutes'], ...technologies.map((t) => [t, t])], filters.tech, (v) => { filters.tech = v; }),
      select('cat-level', 'Difficulté', [['', 'Toutes'], ...Object.entries(LEVELS).map(([k, v]) => [k, v.label])], filters.level, (v) => { filters.level = v; }),
      select('cat-domain', 'Catégorie', [['', 'Toutes'], ...domains.map((d) => [d.id, d.name])], filters.domain, (v) => { filters.domain = v; }),
      select('cat-subdomain', 'Sous-catégorie', [['', 'Toutes'], ...subdomains.map((s) => [s.value, s.label])], filters.subdomain, (v) => { filters.subdomain = v; }),
      select('cat-duration', 'Durée', [['', 'Toutes'], ...Object.entries(DURATION_RANGES).map(([k, v]) => [k, v.label])], filters.duration, (v) => { filters.duration = v; }),
      select('cat-type', 'Type de contenu', [['', 'Tous'], ...Object.entries(TYPES).map(([k, v]) => [k, v])], filters.type, (v) => { filters.type = v; }),
      select('cat-progress', 'Progression', [['', 'Toutes'], ...Object.entries(PROGRESS_FILTERS).map(([k, v]) => [k, v.label])], filters.progress, (v) => { filters.progress = v; }),
      select('cat-sort', 'Trier par', Object.entries(SORTS).map(([k, v]) => [k, v.label]), filters.sort, (v) => { filters.sort = v; })
    ),
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('label', { class: 'check' }, favCheck, 'Favoris uniquement'),
      h('button', {
        class: 'btn btn-ghost btn-small',
        type: 'button',
        onClick: () => { Object.assign(filters, DEFAULT_FILTERS); visible = PAGE_SIZE; render(); }
      }, icon('refresh', { size: 14 }), ' Réinitialiser les filtres')
    )
  );

  function matches(course, p) {
    const q = normalize(filters.q);
    if (q) {
      const haystack = normalize([course.title, course.description, (course.technologies || []).join(' '), course.objectives.join(' ')].join(' '));
      if (!q.split(' ').every((t) => haystack.includes(t))) return false;
    }
    if (filters.tech && !(course.technologies || []).includes(filters.tech)) return false;
    if (filters.level && course.level !== filters.level) return false;
    if (filters.domain && course.domain !== filters.domain) return false;
    if (filters.subdomain) {
      const [domainId, sub] = filters.subdomain.split('||');
      if (course.domain !== domainId || course.subdomain !== sub) return false;
    }
    if (filters.duration && !DURATION_RANGES[filters.duration].test(course.duration)) return false;
    if (filters.type && course.type !== filters.type) return false;
    if (filters.progress && !PROGRESS_FILTERS[filters.progress].test(p)) return false;
    if (filters.favorites && !isFavorite(course.id, get())) return false;
    return true;
  }

  function computeRows() {
    const state = get();
    return courses
      .map((course) => ({ course, ...courseProgress(course, state) }))
      .filter((row) => matches(row.course, row))
      .sort(SORTS[filters.sort]?.compare || SORTS.title.compare);
  }

  function update() {
    const rows = computeRows();
    const shown = rows.slice(0, visible);
    resultsRegion.textContent = `${rows.length} résultat${rows.length > 1 ? 's' : ''}`;

    if (!rows.length) {
      setChildren(listEl, emptyState({
        icon: 'search',
        title: 'Aucun résultat',
        text: 'Aucun contenu ne correspond à ces critères. Essayez un autre mot-clé ou réinitialisez les filtres.',
        actions: [h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => { Object.assign(filters, DEFAULT_FILTERS); searchInput.value = ''; favCheck.checked = false; render(); }
        }, 'Réinitialiser les filtres')]
      }));
    } else {
      setChildren(listEl, ...shown.map((r) => courseCard(r.course)));
    }

    setChildren(moreWrap, );
    if (rows.length > visible) {
      moreWrap.append(h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => { visible += PAGE_SIZE; update(); }
      }, `Afficher plus (${rows.length - visible} restants)`));
    }
  }

  function render() {
    searchInput.value = filters.q;
    favCheck.checked = filters.favorites;
    for (const [id, key] of [['cat-tech', 'tech'], ['cat-level', 'level'], ['cat-domain', 'domain'], ['cat-subdomain', 'subdomain'], ['cat-duration', 'duration'], ['cat-type', 'type'], ['cat-progress', 'progress'], ['cat-sort', 'sort']]) {
      const el = filtersBar.querySelector(`#${id}`);
      if (el) el.value = filters[key];
    }
    update();
  }

  setChildren(outlet, 
    h('div', { class: 'page' },
      h('header', { class: 'page-head' },
        h('h1', { text: 'Catalogue', tabindex: '-1' }),
        h('p', { text: 'Cours et parcours disponibles dans cette installation. Les filtres se combinent ; les résultats sont calculés dans votre navigateur.' })
      ),
      h('div', { class: 'stack', style: 'gap:var(--space-5)' },
        filtersBar,
        resultsRegion,
        listEl,
        moreWrap
      )
    )
  );

  update();
  return undefined;
}
