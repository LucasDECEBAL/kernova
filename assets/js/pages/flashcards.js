// Cartes mémo : index des paquets, cartes personnelles (CRUD, import, export) et séance de révision.

import { h, icon, emptyState, alertBox, progressBar } from '../core/dom.js';
import { getFlashPacks } from '../core/data.js';
import { get } from '../core/store.js';
import { localDay } from '../core/utils.js';
import { toast, confirmDialog } from '../core/ui.js';
import { inline } from '../components/widgets.js';
import {
  CUSTOM_PACK_ID, packSummaries, packCards, sessionCards, gradeCard, difficultCards,
  addCustomCard, updateCustomCard, deleteCustomCard, exportCustomCards, importCustomCards
} from '../core/flashcards.js';

const MODES = {
  due: 'À revoir aujourd’hui',
  all: 'Toutes les cartes',
  random: 'Ordre aléatoire',
  difficult: 'Cartes difficiles'
};

/* ---------- Index ---------- */

export function renderFlashIndex({ outlet }) {
  const packs = getFlashPacks();
  const state = get();
  const today = localDay();
  const summaries = packSummaries(packs, state, today);
  const rebuild = () => renderFlashIndex({ outlet });

  const packRows = summaries.filter((p) => p.id !== CUSTOM_PACK_ID).map((p) => h('article', { class: 'course-row' },
    h('div', { class: 'course-main' },
      h('h3', {}, h('a', { href: `#/cartes/${p.id}?mode=due` }, p.title)),
      h('p', { text: p.description }),
      h('div', { class: 'meta' },
        h('span', { text: `${p.total} cartes` }),
        h('span', { text: `${p.due} à revoir` }),
        h('span', { text: `${p.mastered} maîtrisées` }))
    ),
    h('div', { class: 'course-side' },
      progressBar(p.total ? (p.mastered / p.total) * 100 : 0, 'Maîtrisées')
    ),
    h('div', { class: 'course-actions' },
      h('a', { class: 'btn btn-primary btn-small', href: `#/cartes/${p.id}?mode=due` }, 'Réviser'),
      h('a', { class: 'btn btn-small', href: `#/cartes/${p.id}?mode=random` }, 'Mélanger')
    )
  ));

  const allCards = summaries.flatMap((p) => p.cards.map((c) => ({ ...c, packTitle: p.title })));
  const difficult = difficultCards(allCards, state);
  const difficultBlock = difficult.length
    ? h('ul', { class: 'list-plain' }, difficult.slice(0, 12).map((c) => h('li', {},
      h('a', { href: `#/cartes/${c.pack}?mode=difficult` }, c.q),
      h('span', { class: 'small muted', text: c.packTitle })
    )))
    : emptyState({ icon: 'check', title: 'Aucune carte difficile', text: 'Une carte devient difficile après deux réponses « à revoir ».' });

  const custom = summaries.find((p) => p.id === CUSTOM_PACK_ID);
  const customStatus = h('p', { role: 'status', 'aria-live': 'polite', class: 'small muted', style: 'margin:0' });
  const customList = h('ul', { class: 'list-plain', id: 'custom-list' }, state.cards.custom.map((card) => customItem(card, rebuild)));

  const addForm = h('form', {
    class: 'stack',
    'aria-labelledby': 'add-card-title',
    onSubmit: (e) => {
      e.preventDefault();
      const q = e.currentTarget.querySelector('#card-q');
      const a = e.currentTarget.querySelector('#card-a');
      const result = addCustomCard(q.value, a.value);
      if (!result.ok) {
        customStatus.replaceChildren(alertBox('danger', result.message));
        return;
      }
      toast('Carte ajoutée.', 'success', 2000);
      rebuild();
    }
  },
    h('div', { class: 'field' }, h('label', { for: 'card-q' }, 'Question'),
      h('textarea', { id: 'card-q', rows: 2, style: 'min-height:70px', maxlength: 500 })),
    h('div', { class: 'field' }, h('label', { for: 'card-a' }, 'Réponse'),
      h('textarea', { id: 'card-a', rows: 3, style: 'min-height:90px', maxlength: 1000 })),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Ajouter la carte'))
  );

  const importInput = h('input', { type: 'file', id: 'cards-import', accept: 'application/json,.json' });
  const importStatus = h('div', { role: 'status', 'aria-live': 'polite' });

  const exportBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: () => {
      const blob = new Blob([exportCustomCards(get())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `kernova-cartes-${localDay()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Export des cartes téléchargé.', 'success');
    }
  }, icon('download', { size: 15 }), ' Exporter mes cartes');

  const importBtn = h('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: async () => {
      const file = importInput.files?.[0];
      if (!file) {
        importStatus.replaceChildren(alertBox('warning', 'Choisissez d\'abord un fichier de cartes (.json).'));
        return;
      }
      try {
        const { added, rejected } = importCustomCards(await file.text());
        toast(`${added} carte(s) importée(s).`, 'success');
        importStatus.replaceChildren(alertBox(rejected ? 'warning' : 'info',
          `${added} carte(s) ajoutée(s).${rejected ? ` ${rejected} entrée(s) invalide(s) ignorée(s).` : ''}`));
        if (added) rebuild();
      } catch (err) {
        importStatus.replaceChildren(alertBox('danger', `Import impossible : ${err.message}`));
      }
    }
  }, icon('upload', { size: 15 }), ' Importer des cartes');

  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Cartes mémo' }),
      h('p', { text: 'Une carte à revoir revient le lendemain. Une carte maîtrisée s’espace de plus en plus. Tout est enregistré sur cet appareil.' })
    ),

    h('section', { class: 'section', 'aria-labelledby': 'packs-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'packs-title', text: 'Paquets' }),
        h('p', { text: 'Chaque paquet porte sur un thème. Les compteurs se mettent à jour après chaque réponse.' })),
      h('div', { class: 'grid-cards' }, packRows)
    ),

    h('section', { class: 'section', 'aria-labelledby': 'difficult-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'difficult-title', text: 'Cartes difficiles' }),
        h('p', { text: 'Les cartes ratées plusieurs fois, à travailler en priorité.' })),
      difficultBlock
    ),

    h('section', { class: 'section', 'aria-labelledby': 'custom-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'custom-title', text: 'Mes cartes' }),
        h('p', { text: `${custom.total} carte(s) personnelle(s). Vous pouvez les modifier, les supprimer et les exporter.` }),
        h('a', { class: 'btn btn-small', href: `#/cartes/${CUSTOM_PACK_ID}?mode=due` }, 'Réviser mes cartes')),
      h('div', { class: 'stack', style: 'gap:var(--space-5)' },
        h('div', { class: 'card', style: 'padding-top:0' },
          h('h3', { id: 'add-card-title', text: 'Nouvelle carte' }),
          addForm,
          customStatus),
        state.cards.custom.length
          ? customList
          : emptyState({ icon: 'note', title: 'Aucune carte personnelle', text: 'Écrivez une question et sa réponse ci-dessus. Elle rejoindra vos révisions.' }),
        h('div', { class: 'card' },
          h('h3', { text: 'Importer et exporter' }),
          h('p', { class: 'small muted', text: 'Fichier JSON au format kernova, distinct de la sauvegarde complète.' }),
          h('div', { class: 'row' }, exportBtn),
          h('div', { class: 'field', style: 'max-width:420px;margin-top:var(--space-3)' },
            h('label', { for: 'cards-import' }, 'Fichier de cartes (.json)'), importInput),
          h('div', { class: 'row', style: 'margin-top:var(--space-2)' }, importBtn),
          importStatus
        )
      )
    )
  ));
  return undefined;
}

/** Ligne d'une carte personnelle, avec modification et suppression. */
function customItem(card, onChange) {
  const li = h('li', { style: 'display:block' });
  const view = () => {
    li.replaceChildren(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:start' },
        h('div', { style: 'min-width:0;flex:1' },
          h('strong', { style: 'display:block', text: card.q }),
          h('span', { class: 'small muted', style: 'display:block', text: card.a })),
        h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn btn-small', type: 'button', onClick: () => li.replaceChildren(editForm()) }, 'Modifier'),
          h('button', {
            class: 'btn btn-small btn-danger',
            type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Supprimer cette carte ?',
                text: 'La carte et son historique de révision seront effacés.',
                confirmLabel: 'Supprimer',
                danger: true
              });
              if (!ok) return;
              deleteCustomCard(card.id);
              toast('Carte supprimée.', 'info', 2000);
              onChange();
            }
          }, 'Supprimer')
        )
      )
    );
  };
  const editForm = () => {
    const status = h('div', { role: 'status' });
    const qInput = h('textarea', { id: `edit-q-${card.id}`, rows: 2, style: 'min-height:70px', maxlength: 500 });
    const aInput = h('textarea', { id: `edit-a-${card.id}`, rows: 3, style: 'min-height:90px', maxlength: 1000 });
    qInput.value = card.q;
    aInput.value = card.a;
    return h('form', {
      class: 'stack',
      onSubmit: (e) => {
        e.preventDefault();
        const result = updateCustomCard(card.id, qInput.value, aInput.value);
        if (!result.ok) {
          status.replaceChildren(alertBox('danger', result.message));
          return;
        }
        toast('Carte modifiée.', 'success', 2000);
        onChange();
      }
    },
      h('div', { class: 'field' }, h('label', { for: `edit-q-${card.id}` }, 'Question'), qInput),
      h('div', { class: 'field' }, h('label', { for: `edit-a-${card.id}` }, 'Réponse'), aInput),
      status,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary btn-small', type: 'submit' }, 'Enregistrer'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: view }, 'Annuler'))
    );
  };
  view();
  return li;
}

/* ---------- Séance ---------- */

export function renderFlashSession({ outlet, params, query }) {
  const packs = getFlashPacks();
  const packId = params.pack;
  const pack = packId === CUSTOM_PACK_ID
    ? { id: CUSTOM_PACK_ID, title: 'Mes cartes' }
    : packs.find((p) => p.id === packId);

  if (!pack) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Paquet introuvable', text: 'Ce paquet de cartes n\'existe pas.', actions: [h('a', { class: 'btn', href: '#/cartes' }, 'Retour aux cartes mémo')] })));
    return undefined;
  }

  const mode = MODES[query.mode] ? query.mode : 'due';
  const today = localDay();
  const cards = packCards(pack.id, packs);
  let queue = sessionCards(cards, mode, get(), today, Math.random);
  let index = 0;
  let flipped = false;
  let reviewed = 0;
  let mastered = 0;
  let toReview = [];
  let refocus = false;

  const flip = () => {
    flipped = !flipped;
    refocus = true;
    render();
  };

  const grade = (result) => {
    const item = queue[index];
    gradeCard(item.key, result, today);
    reviewed++;
    if (result === 'mastered') mastered++;
    else toReview.push(item);
    index++;
    flipped = false;
    refocus = true;
    render();
  };

  const restartAll = () => {
    queue = sessionCards(cards, mode, get(), localDay(), Math.random);
    index = 0; flipped = false; reviewed = 0; mastered = 0; toReview = [];
    render();
  };

  const retryReview = () => {
    queue = toReview.slice();
    index = 0; flipped = false; reviewed = 0; mastered = 0; toReview = [];
    render();
  };

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (index >= queue.length || !queue.length) return;
    if (e.key === ' ' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      if (!flipped) flip();
    } else if (flipped && e.key === '1') grade('review');
    else if (flipped && e.key === '2') grade('mastered');
  };
  document.addEventListener('keydown', onKey);

  function cardView() {
    const item = queue[index];
    const total = queue.length;
    return h('section', { class: 'stack', style: 'gap:var(--space-5)', 'aria-label': 'Carte en cours' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('span', { class: 'small muted', 'aria-live': 'polite', text: `Carte ${index + 1} sur ${total}` }),
        h('span', { class: 'small muted', text: `${reviewed} vue(s), ${mastered} maîtrisée(s)` })),
      progressBar((index / total) * 100, 'Avancement de la séance'),
      h('button', {
        class: `flashcard${flipped ? ' is-flipped' : ''}`,
        type: 'button',
        'aria-expanded': String(flipped),
        'aria-label': flipped ? 'Réponse affichée' : 'Afficher la réponse',
        onClick: flip
      },
        h('span', { class: 'flashcard-inner' },
          h('span', { class: 'flashcard-face flashcard-front', 'aria-hidden': String(flipped) },
            h('span', { class: 'flashcard-text', text: item.q })),
          h('span', { class: 'flashcard-face flashcard-back', 'aria-hidden': String(!flipped) },
            h('span', { class: 'flashcard-text' }, inline(item.a))))
      ),
      flipped
        ? h('div', { class: 'row flash-grade', style: 'justify-content:center' },
          h('button', { class: 'btn', type: 'button', onClick: () => grade('review') }, 'À revoir'),
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => grade('mastered') }, 'Maîtrisé'))
        : h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn', type: 'button', onClick: flip }, 'Afficher la réponse')),
      h('p', { class: 'small muted', style: 'text-align:center;margin:0' },
        'Raccourcis : Espace affiche la réponse, 1 pour « à revoir », 2 pour « maîtrisé ».')
    );
  }

  function summaryView() {
    return h('section', { class: 'stack', 'aria-labelledby': 'summary-title' },
      h('h2', { id: 'summary-title', tabindex: '-1', text: 'Séance terminée' }),
      h('p', { text: `${reviewed} carte(s) vues : ${mastered} maîtrisée(s) et ${toReview.length} à revoir.` }),
      h('div', { class: 'row' },
        toReview.length
          ? h('button', { class: 'btn btn-primary', type: 'button', onClick: retryReview }, `Revoir les ${toReview.length} carte(s) à revoir`)
          : null,
        h('button', { class: 'btn', type: 'button', onClick: restartAll }, 'Recommencer la séance'),
        h('a', { class: 'btn btn-ghost', href: '#/cartes' }, 'Retour aux paquets'))
    );
  }

  function emptyView() {
    const messages = {
      due: { title: 'Rien à revoir aujourd’hui', text: 'Les cartes reviennent selon leur échéance. Mélangez le paquet pour réviser quand même.', href: `#/cartes/${pack.id}?mode=random`, label: 'Mélanger le paquet' },
      difficult: { title: 'Aucune carte difficile', text: 'Une carte devient difficile après deux réponses « à revoir ».', href: `#/cartes/${pack.id}?mode=all`, label: 'Voir toutes les cartes' },
      all: { title: 'Ce paquet est vide', text: pack.id === CUSTOM_PACK_ID ? 'Ajoutez votre première carte depuis la page des cartes mémo.' : 'Aucune carte dans ce paquet.', href: '#/cartes', label: 'Retour aux cartes mémo' },
      random: { title: 'Ce paquet est vide', text: 'Aucune carte dans ce paquet.', href: '#/cartes', label: 'Retour aux cartes mémo' }
    };
    // Un paquet sans aucune carte prime sur le mode : on dit qu'il est vide.
    const m = messages[cards.length === 0 ? 'all' : mode];
    return emptyState({ icon: 'book', title: m.title, text: m.text, actions: [h('a', { class: 'btn', href: m.href }, m.label)] });
  }

  function render() {
    const body = !queue.length ? emptyView() : index >= queue.length ? summaryView() : cardView();
    outlet.replaceChildren(h('div', { class: 'page', style: 'max-width:760px' },
      h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
        h('ol', {}, h('li', {}, h('a', { href: '#/cartes' }, 'Cartes mémo')), h('li', { 'aria-current': 'page' }, pack.title))),
      h('header', { class: 'page-head', style: 'margin-bottom:var(--space-5)' },
        h('h1', { tabindex: '-1', text: pack.title }),
        h('p', { text: `Mode : ${MODES[mode]}` })),
      body
    ));
    if (refocus) {
      refocus = false;
      (outlet.querySelector('.flashcard') || outlet.querySelector('#summary-title') || outlet.querySelector('h1'))?.focus({ preventScroll: true });
    }
  }

  render();
  return () => document.removeEventListener('keydown', onKey);
}
