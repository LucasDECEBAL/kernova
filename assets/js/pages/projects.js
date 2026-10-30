// Catalogue de projets : regroupe les projets pratiques des cours, avec filtres et grille d'évaluation locale.

import { h, icon, progressBar, emptyState } from '../core/dom.js';
import { getCourses, getCourse, getDomain, getProjectExtras, ensureAllCourses, ensureCourse } from '../core/data.js';
import { get } from '../core/store.js';
import { projectChecks, toggleProjectCheck, resetProjectChecks } from '../core/progress.js';
import { LEVELS, normalize, formatDuration, percent } from '../core/utils.js';
import { levelBadge, tags, codeBlock } from '../components/widgets.js';
import { confirmDialog, toast } from '../core/ui.js';

function projectOf(course) {
  if (!course || !course.project) return null;
  return {
    course,
    ...course.project,
    criteria: course.project.criteria || [],
    steps: course.project.steps || []
  };
}

function allProjects() {
  return getCourses().map(projectOf).filter(Boolean);
}

function downloadText(name, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderProjectsIndex({ outlet }) {
  await ensureAllCourses();
  const projects = allProjects();
  if (!projects.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'book', title: 'Aucun projet', text: 'Les cours ne contiennent pas encore de projet pratique.' })));
    return undefined;
  }

  const domains = [...new Set(projects.map((p) => p.course.domain))]
    .map((id) => getDomain(id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  let query = '';
  let domain = '';
  let level = '';

  const searchInput = h('input', {
    id: 'project-search',
    type: 'search',
    placeholder: 'Titre, cours, compétence…',
    autocomplete: 'off',
    onInput: (e) => { query = e.target.value; refresh(); }
  });
  const domainSelect = h('select', {
    id: 'project-domain',
    onChange: (e) => { domain = e.target.value; refresh(); }
  }, [['', 'Tous les domaines'], ...domains.map((d) => [d.id, d.name])]
    .map(([value, label]) => h('option', { value }, label)));
  const levelSelect = h('select', {
    id: 'project-level',
    onChange: (e) => { level = e.target.value; refresh(); }
  }, [['', 'Tous les niveaux'], ...Object.entries(LEVELS).map(([k, v]) => [k, v.label])]
    .map(([value, label]) => h('option', { value }, label)));

  const count = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const list = h('div', { class: 'grid-cards' });

  function matches(project) {
    const tokens = normalize(query).split(' ').filter(Boolean);
    if (domain && project.course.domain !== domain) return false;
    if (level && project.course.level !== level) return false;
    if (!tokens.length) return true;
    const haystack = normalize([
      project.title, project.brief, project.course.title,
      ...(project.course.skills || []), ...(project.course.technologies || [])
    ].join(' '));
    return tokens.every((t) => haystack.includes(t));
  }

  function card(project) {
    const checks = projectChecks(project.course.id, get());
    const done = Object.keys(checks).length;
    const p = percent(done, project.criteria.length);
    const domainInfo = getDomain(project.course.domain);
    return h('article', { class: 'course-row' },
      h('div', { class: 'course-main' },
        h('div', { class: 'row' }, levelBadge(project.course.level), h('span', { class: 'small muted', text: domainInfo?.name || '' })),
        h('h2', { style: 'font-size:1.35rem;margin:var(--s1) 0 var(--s2)' },
          h('a', { href: `#/projets/${project.course.id}`, text: project.title })),
        h('p', { class: 'small muted', style: 'margin:0', text: project.brief })),
      h('div', { class: 'course-side' },
        progressBar(p, 'Grille d\'évaluation'),
        h('p', { class: 'small muted', style: 'margin:0', text: `${done} / ${project.criteria.length} critère(s) validé(s)` })),
      h('div', { class: 'course-actions' },
        h('a', { class: 'btn btn-primary btn-small', href: `#/projets/${project.course.id}` }, 'Ouvrir le projet'))
    );
  }

  function refresh() {
    const rows = projects.filter(matches).sort((a, b) =>
      (LEVELS[a.course.level]?.rank ?? 9) - (LEVELS[b.course.level]?.rank ?? 9)
      || a.title.localeCompare(b.title, 'fr'));
    count.textContent = `${rows.length} projet(s)`;
    if (!rows.length) {
      list.replaceChildren(emptyState({
        icon: 'search',
        title: 'Aucun projet ne correspond',
        text: 'Essayez un autre mot-clé ou réinitialisez les filtres.',
        actions: [h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            query = ''; domain = ''; level = '';
            searchInput.value = ''; domainSelect.value = ''; levelSelect.value = '';
            refresh();
          }
        }, 'Réinitialiser les filtres')]
      }));
      return;
    }
    list.replaceChildren(...rows.map(card));
  }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Projets pratiques' }),
      h('p', { text: 'Chaque cours se termine par un projet : cahier des charges, étapes, critères de réussite et grille d\'évaluation que vous cochez au fur et à mesure.' })),
    h('form', { class: 'filters-bar', role: 'search', 'aria-label': 'Filtrer les projets', onSubmit: (e) => e.preventDefault() },
      h('div', { class: 'field', style: 'min-width:240px' }, h('label', { for: 'project-search' }, 'Rechercher'), searchInput),
      h('div', { class: 'field' }, h('label', { for: 'project-domain' }, 'Domaine'), domainSelect),
      h('div', { class: 'field' }, h('label', { for: 'project-level' }, 'Niveau'), levelSelect)),
    count,
    list
  ));

  refresh();
  return undefined;
}

export async function renderProjectPage({ outlet, params }) {
  await ensureCourse(params.courseId);
  const course = getCourse(params.courseId);
  const project = projectOf(course);
  if (!project) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Projet introuvable',
        text: 'Ce cours n\'a pas de projet associé.',
        actions: [h('a', { class: 'btn', href: '#/projets' }, 'Voir tous les projets')]
      })));
    return undefined;
  }

  const domain = getDomain(course.domain);
  const gridBox = h('div', { class: 'proj-grid-box' });
  const progressBox = h('div', {});

  const extras = getProjectExtras()[course.id] || null;
  let hintsShown = 0;
  const hintBox = h('div', { class: 'term-hints' });

  function refreshHints() {
    if (!extras?.hints?.length) return;
    hintBox.replaceChildren();
    if (hintsShown) {
      hintBox.append(h('ol', { class: 'term-hint-list' }, extras.hints.slice(0, hintsShown).map((text) => h('li', { text }))));
    }
    if (hintsShown < extras.hints.length) {
      hintBox.append(h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => { hintsShown += 1; refreshHints(); }
      }, `Indice (${hintsShown}/${extras.hints.length})`));
    }
  }

  const extrasSections = extras
    ? h('div', { class: 'split' },
      h('section', { class: 'card stack', 'aria-labelledby': 'proj-hints-title' },
        h('h2', { id: 'proj-hints-title', style: 'margin-top:0;font-size:1.15rem' }, 'Indices'),
        h('p', { class: 'small muted', style: 'margin:0' }, 'Révélez-les un par un, après avoir cherché par vous-même.'),
        hintBox),
      h('section', { class: 'card stack', 'aria-labelledby': 'proj-files-title' },
        h('h2', { id: 'proj-files-title', style: 'margin-top:0;font-size:1.15rem' }, 'Fichiers de départ'),
        h('p', { class: 'small muted', style: 'margin:0' }, 'Squelettes à compléter. Téléchargez-les ou copiez leur contenu.'),
        h('div', { class: 'proj-starters' },
          (extras.starters || []).map((file) => h('div', { class: 'proj-starter' },
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
              h('h3', { style: 'margin:0;font-size:var(--text-sm);font-family:var(--mono)' }, file.name),
              h('button', {
                class: 'btn btn-small',
                type: 'button',
                onClick: () => downloadText(file.name, file.content)
              }, 'Télécharger')),
            codeBlock({ code: file.content, lang: file.language || 'text', title: file.name })
          ))))
    )
    : h('section', { class: 'card' },
      h('p', { class: 'small muted', style: 'margin:0' }, 'Aucun fichier de départ n\'est fourni pour ce projet : partez du cahier des charges et des étapes.'));

  refreshHints();

  function refreshGrid() {
    const checks = projectChecks(course.id, get());
    const done = Object.keys(checks).length;
    const total = project.criteria.length;
    progressBox.replaceChildren(progressBar(percent(done, total), `Grille d'évaluation (${done}/${total})`));
    gridBox.replaceChildren(h('table', { class: 'proj-grid' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Critère'),
        h('th', { scope: 'col', style: 'width:120px' }, 'Validé'))),
      h('tbody', {}, project.criteria.map((criterion, index) => h('tr', {},
        h('td', { text: criterion }),
        h('td', {},
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(checks[index]),
              'aria-label': `Critère ${index + 1} : ${criterion}`,
              onChange: () => {
                const now = toggleProjectCheck(course.id, index);
                refreshGrid();
                toast(now ? 'Critère validé.' : 'Critère décoché.', 'success', 1600);
              }
            }),
            h('span', { class: 'sr-only' }, 'Validé'))
        ))))));
  }

  const resetBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Réinitialiser la grille ?',
        text: 'Les critères cochés pour ce projet seront effacés. Le cours et vos notes ne sont pas concernés.',
        confirmLabel: 'Réinitialiser'
      });
      if (!ok) return;
      resetProjectChecks(course.id);
      refreshGrid();
      toast('Grille réinitialisée.', 'info', 2000);
    }
  }, icon('refresh', { size: 15 }), 'Réinitialiser la grille');

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {},
        h('li', {}, h('a', { href: '#/projets' }, 'Projets')),
        h('li', { 'aria-current': 'page' }, project.title))),
    h('header', { class: 'page-head' },
      h('div', { class: 'row' }, levelBadge(course.level), h('span', { class: 'small muted', text: domain?.name || '' })),
      h('h1', { tabindex: '-1', text: project.title }),
      h('p', { text: project.brief }),
      h('div', { class: 'meta' },
        h('span', {}, icon('book', { size: 15 }), `Cours : ${course.title}`),
        h('span', {}, icon('clock', { size: 15 }), formatDuration(course.duration)),
        h('span', {}, icon('check', { size: 15 }), `${project.criteria.length} critères`)),
      h('div', { class: 'hero-actions no-print' },
        h('a', { class: 'btn', href: `#/cours/${course.id}` }, 'Ouvrir le cours'),
        h('a', { class: 'btn', href: `#/evaluation/${course.id}` }, 'Évaluation finale'),
        h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => window.print() }, 'Imprimer'))),
    h('div', { class: 'split' },
      h('section', { class: 'card stack', 'aria-labelledby': 'proj-cdc' },
        h('h2', { id: 'proj-cdc', style: 'margin-top:0;font-size:1.15rem' }, 'Cahier des charges'),
        h('p', { style: 'margin:0', text: project.brief }),
        h('h3', { style: 'font-size:var(--text-sm);margin:var(--s3) 0 var(--s2)' }, 'Objectifs'),
        h('ul', { class: 'small' }, (course.objectives || []).map((o) => h('li', { text: o }))),
        h('h3', { style: 'font-size:var(--text-sm);margin:var(--s3) 0 var(--s2)' }, 'Prérequis'),
        h('ul', { class: 'small' }, (course.prerequisites || []).map((p) => h('li', { text: p }))),
        h('h3', { style: 'font-size:var(--text-sm);margin:var(--s3) 0 var(--s2)' }, 'Compétences travaillées'),
        h('ul', { class: 'small' }, (course.skills || []).map((s) => h('li', { text: s }))),
        tags(course.technologies)),
      h('section', { class: 'card stack', 'aria-labelledby': 'proj-steps' },
        h('h2', { id: 'proj-steps', style: 'margin-top:0;font-size:1.15rem' }, 'Étapes de réalisation'),
        h('ol', {}, project.steps.map((step) => h('li', { text: step })))
      )
    ),
    extrasSections,
    h('section', { class: 'card stack', 'aria-labelledby': 'proj-grid-title' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', { id: 'proj-grid-title', style: 'margin:0;font-size:1.15rem' }, 'Grille d\'évaluation'),
        resetBtn),
      h('p', { class: 'small muted', style: 'margin:0' },
        'Cochez chaque critère lorsque vous l\'avez vérifié vous-même. La progression est enregistrée sur cet appareil.'),
      progressBox,
      gridBox),
    h('p', { class: 'small muted' },
      'Le projet n\'est pas corrigé automatiquement : les critères vous servent de liste de vérification. Un projet terminé se juge sur un livrable testé, pas sur une intention.')
  ));

  refreshGrid();
  return undefined;
}
