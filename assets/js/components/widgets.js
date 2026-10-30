// Composants réutilisables : badges, cartes de cours, blocs de code, favoris.

import { h, icon, progressBar , setChildren } from '../core/dom.js';
import { LEVELS, TYPES, formatDuration } from '../core/utils.js';
import { courseProgress, isFavorite, toggleFavorite } from '../core/progress.js';
import { toast, copyText } from '../core/ui.js';
import { get } from '../core/store.js';

export function levelBadge(level) {
  const info = LEVELS[level] || { label: level };
  return h('span', { class: 'badge', 'data-level': level }, info.label);
}

export function typeBadge(type) {
  return h('span', { class: 'badge', 'data-tone': 'info' }, TYPES[type] || type);
}

export function statusBadge(status) {
  const labels = { done: 'Terminé', current: 'À suivre', available: 'Accessible', locked: 'Verrouillé' };
  return h('span', { class: 'badge', 'data-status': status }, labels[status] || status);
}

export function tags(list) {
  return h('div', { class: 'tags' }, (list || []).map((t) => h('span', { class: 'tag' }, t)));
}

/** Bouton de favori accessible (aria-pressed). Met à jour le libellé et notifie. */
export function favoriteButton(courseId, { compact = false, onChange } = {}) {
  const pressed = isFavorite(courseId);
  const btn = h('button', {
    class: `btn ${compact ? 'btn-small btn-icon' : ''} ${pressed ? 'is-active' : ''}`.trim(),
    type: 'button',
    'aria-pressed': String(pressed),
    'aria-label': pressed ? 'Retirer des favoris' : 'Ajouter aux favoris',
    title: pressed ? 'Retirer des favoris' : 'Ajouter aux favoris',
    onClick: () => {
      const now = toggleFavorite(courseId);
      toast(now ? 'Ajouté aux favoris.' : 'Retiré des favoris.', 'success', 2200);
      btn.replaceWith(favoriteButton(courseId, { compact, onChange }));
      onChange?.(now);
    }
  });
  btn.append(icon('star', { size: 16 }));
  if (!compact) btn.append(h('span', {}, pressed ? 'Dans mes favoris' : 'Ajouter aux favoris'));
  return btn;
}

/** Ligne de catalogue : niveau, titre, description, durée, progression et actions. */
export function courseCard(course) {
  const p = courseProgress(course, get());
  const action = p.finished ? 'Revoir le cours' : p.started ? 'Reprendre' : 'Ouvrir le cours';
  return h('article', { class: 'course-row' },
    h('div', { class: 'course-main' },
      h('div', { class: 'row' }, levelBadge(course.level), typeBadge(course.type)),
      h('h3', {}, h('a', { href: `#/cours/${course.id}` }, course.title)),
      h('p', { text: course.description }),
      h('div', { class: 'meta' },
        h('span', {}, icon('clock', { size: 15 }), formatDuration(course.duration)),
        h('span', {}, icon('book', { size: 15 }), `${course.chapters.length || course.chaptersCount || 0} chapitres`)
      )
    ),
    h('div', { class: 'course-side' },
      progressBar(p.percent, 'Progression'),
      h('p', { class: 'small' }, `${p.done} sur ${p.total} chapitres terminés`)
    ),
    h('div', { class: 'course-actions' },
      h('a', { class: 'btn btn-primary btn-small', href: `#/cours/${course.id}` }, action),
      favoriteButton(course.id, { compact: true })
    )
  );
}

/**
 * Bloc de code avec numéros de ligne et bouton de copie.
 * Le code est affiché en textContent : aucun HTML n'est interprété.
 */
export function codeBlock({ code, lang = 'text', title }) {
  const lines = String(code).replace(/\n$/, '').split('\n');
  const numbers = lines.map((_, i) => String(i + 1)).join('\n');
  const copy = h('button', {
    class: 'btn btn-small',
    type: 'button',
    'aria-label': `Copier le code${title ? ` : ${title}` : ''}`,
    onClick: async () => {
      const ok = await copyText(String(code).replace(/\n$/, ''));
      toast(ok ? 'Code copié.' : 'Copie impossible. Sélectionnez le texte manuellement.', ok ? 'success' : 'error', 2200);
      if (ok) {
        copy.textContent = 'Copié';
        setTimeout(() => { setChildren(copy, icon('copy', { size: 14 }), ' Copier'); }, 1500);
      }
    }
  }, icon('copy', { size: 14 }), ' Copier');

  return h('figure', { class: 'code-block', style: 'margin-inline:0' },
    h('div', { class: 'code-head' },
      h('span', {}, title || lang),
      copy
    ),
    h('div', { class: 'code-body' },
      h('div', { class: 'code-lines', 'aria-hidden': 'true', text: numbers }),
      h('pre', { tabindex: '0', 'aria-label': `Code ${lang}` }, h('code', { text: String(code).replace(/\n$/, '') }))
    )
  );
}

/** Texte avec `code` et **gras** : rendu sans innerHTML. */
export function inline(text) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  return parts.map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return h('code', { text: part.slice(1, -1) });
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return h('strong', { text: part.slice(2, -2) });
    return part;
  });
}
