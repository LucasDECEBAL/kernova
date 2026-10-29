// Fiches mémo : documentation technique filtrable, copiée et imprimable.

import { h, icon, emptyState } from '../core/dom.js';
import { getCheatsheets } from '../core/data.js';
import { get } from '../core/store.js';
import { isSheetFavorite, toggleSheetFavorite } from '../core/progress.js';
import { normalize, debounce } from '../core/utils.js';
import { copyText, toast } from '../core/ui.js';

const ALL = '';

export function renderCheatsheetsPage({ outlet }) {
  const sheets = getCheatsheets();
  if (!sheets.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Fiches indisponibles', text: 'Les fiches mémo n\'ont pas pu être chargées.' })));
    return undefined;
  }

  let query = '';
  let category = ALL;
  let favoritesOnly = false;

  const categories = [...new Set(sheets.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  const searchInput = h('input', {
    id: 'sheet-search',
    type: 'search',
    placeholder: 'Commande, concept, technologie…',
    autocomplete: 'off',
    onInput: debounce((e) => { query = e.target.value; refresh(); }, 120)
  });

  const categorySelect = h('select', {
    id: 'sheet-category',
    onChange: (e) => { category = e.target.value; refresh(); }
  }, [['', 'Toutes les catégories'], ...categories.map((c) => [c, c])]
    .map(([value, label]) => h('option', { value }, label)));

  const favCheck = h('input', {
    type: 'checkbox',
    id: 'sheet-fav',
    onChange: (e) => { favoritesOnly = e.target.checked; refresh(); }
  });

  const countLine = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const list = h('div', { class: 'sheet-list' });

  const printBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: () => window.print()
  }, icon('download', { size: 16 }), 'Imprimer');

  function sheetMatches(sheet, tokens) {
    if (category && sheet.category !== category) return false;
    if (favoritesOnly && !isSheetFavorite(sheet.id, get())) return false;
    if (!tokens.length) return true;
    const meta = normalize([sheet.title, sheet.description, sheet.category].join(' '));
    if (tokens.every((t) => meta.includes(t))) return true;
    return sheet.entries.some((entry) => {
      const haystack = normalize([entry.command, entry.description, entry.warning, entry.example].join(' '));
      return tokens.every((t) => haystack.includes(t));
    });
  }

  function entryMatches(entry, tokens) {
    if (!tokens.length) return true;
    const haystack = normalize([entry.command, entry.description, entry.warning, entry.example].join(' '));
    return tokens.every((t) => haystack.includes(t));
  }

  function copyButton(command) {
    return h('button', {
      class: 'btn btn-small btn-icon no-print',
      type: 'button',
      'aria-label': `Copier : ${command}`,
      title: 'Copier',
      onClick: async () => {
        const ok = await copyText(command);
        toast(ok ? 'Commande copiée.' : 'Copie impossible.', ok ? 'success' : 'error', 2000);
      }
    }, icon('copy', { size: 15 }));
  }

  function renderSheet(sheet, entries) {
    const fav = isSheetFavorite(sheet.id, get());
    const favBtn = h('button', {
      class: `btn btn-small btn-icon no-print ${fav ? 'is-active' : ''}`.trim(),
      type: 'button',
      'aria-pressed': String(fav),
      'aria-label': fav ? 'Retirer cette fiche des favoris' : 'Ajouter cette fiche aux favoris',
      title: fav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onClick: () => {
        const now = toggleSheetFavorite(sheet.id);
        toast(now ? 'Fiche ajoutée aux favoris.' : 'Fiche retirée des favoris.', 'success', 2000);
        refresh();
      }
    }, icon('star', { size: 15 }));

    return h('section', { class: 'sheet', id: `fiche-${sheet.id}`, 'aria-labelledby': `sheet-${sheet.id}` },
      h('header', { class: 'sheet-head' },
        h('div', {},
          h('h2', { id: `sheet-${sheet.id}`, text: sheet.title }),
          h('p', { class: 'small muted', style: 'margin:0', text: sheet.description })),
        h('div', { class: 'row', style: 'gap:6px' },
          h('span', { class: 'badge', text: sheet.category }),
          favBtn)),
      h('dl', { class: 'sheet-entries' }, entries.map((entry) => h('div', { class: 'sheet-entry' },
        h('dt', {},
          h('code', { class: 'sheet-command', text: entry.command }),
          copyButton(entry.command)),
        h('dd', {},
          h('p', { style: 'margin:0', text: entry.description }),
          entry.example ? h('pre', { class: 'sheet-example', text: entry.example }) : null,
          entry.warning ? h('p', { class: 'sheet-warning' }, h('strong', {}, 'Attention : '), entry.warning) : null)
      )))
    );
  }

  function refresh() {
    const tokens = normalize(query).split(' ').filter(Boolean);
    const matching = sheets
      .filter((sheet) => sheetMatches(sheet, tokens))
      .map((sheet) => {
        const meta = normalize([sheet.title, sheet.description, sheet.category].join(' '));
        const metaMatch = !tokens.length || tokens.every((t) => meta.includes(t));
        const entries = tokens.length && !metaMatch
          ? sheet.entries.filter((entry) => entryMatches(entry, tokens))
          : sheet.entries;
        return { sheet, entries };
      });

    const totalEntries = matching.reduce((sum, item) => sum + item.entries.length, 0);
    countLine.textContent = `${matching.length} fiche(s), ${totalEntries} commande(s)`;

    if (!matching.length) {
      list.replaceChildren(emptyState({
        icon: 'search',
        title: 'Aucune fiche ne correspond',
        text: 'Essayez un autre mot-clé, changez de catégorie ou désactivez le filtre des favoris.',
        actions: [h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            query = '';
            category = ALL;
            favoritesOnly = false;
            searchInput.value = '';
            categorySelect.value = '';
            favCheck.checked = false;
            refresh();
          }
        }, 'Réinitialiser les filtres')]
      }));
      return;
    }

    list.replaceChildren(...matching.map(({ sheet, entries }) => renderSheet(sheet, entries.length ? entries : sheet.entries)));
  }

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {}, h('li', {}, h('a', { href: '#/labo' }, 'Labo')), h('li', { 'aria-current': 'page' }, 'Fiches mémo'))),
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Fiches mémo' }),
      h('p', { text: 'Commandes et extraits vérifiés, à copier ou à imprimer. Chaque fiche indique les pièges à éviter.' })),
    h('form', { class: 'sheet-toolbar no-print', role: 'search', 'aria-label': 'Filtrer les fiches', onSubmit: (e) => e.preventDefault() },
      h('div', { class: 'field', style: 'flex:1 1 260px' }, h('label', { for: 'sheet-search' }, 'Rechercher'), searchInput),
      h('div', { class: 'field', style: 'min-width:180px' }, h('label', { for: 'sheet-category' }, 'Catégorie'), categorySelect),
      h('label', { class: 'check', style: 'align-self:end;min-height:40px' }, favCheck, 'Favoris uniquement'),
      printBtn),
    countLine,
    list
  ));

  refresh();
  return undefined;
}
