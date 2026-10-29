// Cartes mémo : révision espacée (méthode des boîtes), modes de séance, cartes personnelles.
// Logique pure dans la mesure du possible : les fonctions qui lisent l'état prennent `state` en paramètre.

import { get, update } from './store.js';
import { addDays, localDay, shuffle } from './utils.js';

/** Intervalle en jours après une réponse « maîtrisé », selon la boîte atteinte (1 à 4). */
export const INTERVALS = [1, 2, 4, 8, 16];
export const CUSTOM_PACK_ID = 'perso';

/** Clé stable d'une carte : paquet/identifiant pour les cartes fournies, custom/identifiant pour les personnelles. */
export function cardKeyFor(packId, cardId) {
  return `${packId}/${cardId}`;
}

/** Toutes les cartes d'un paquet fourni ou personnel, avec leur clé. */
export function packCards(packId, packs, state = get()) {
  if (packId === CUSTOM_PACK_ID) {
    return state.cards.custom.map((c) => ({ key: cardKeyFor(CUSTOM_PACK_ID, c.id), id: c.id, pack: CUSTOM_PACK_ID, q: c.q, a: c.a, custom: true }));
  }
  const pack = packs.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.cards.map((c) => ({ key: cardKeyFor(pack.id, c.id), id: c.id, pack: pack.id, q: c.q, a: c.a, custom: false }));
}

/** Liste des paquets avec leurs compteurs. Le paquet personnel est toujours présent. */
export function packSummaries(packs, state = get(), today = localDay()) {
  const list = packs.map((p) => ({ id: p.id, title: p.title, description: p.description, cards: packCards(p.id, packs, state) }));
  list.push({
    id: CUSTOM_PACK_ID,
    title: 'Mes cartes',
    description: 'Vos cartes personnelles : créez, modifiez et supprimez-les.',
    cards: packCards(CUSTOM_PACK_ID, packs, state)
  });
  return list.map((p) => {
    const stats = cardStats(p.cards, state, today);
    return { ...p, ...stats };
  });
}

/** Compteurs d'un ensemble de cartes. */
export function cardStats(cards, state = get(), today = localDay()) {
  let due = 0;
  let mastered = 0;
  let toReview = 0;
  for (const card of cards) {
    const r = state.cards.review[card.key];
    if (!r || r.due <= today) due++;
    if (r && r.box >= 3) mastered++;
    if (r && r.box === 0 && r.seen > 0) toReview++;
  }
  return { total: cards.length, due, mastered, toReview };
}

/** Une carte est difficile après deux réponses « à revoir ». */
export function isDifficult(key, state = get()) {
  const r = state.cards.review[key];
  return Boolean(r && r.wrong >= 2);
}

export function difficultCards(allCards, state = get()) {
  return allCards.filter((c) => isDifficult(c.key, state));
}

/**
 * Cartes d'une séance selon le mode :
 *  - due : cartes à revoir aujourd'hui (jamais vues ou échéance atteinte), la plus ancienne d'abord
 *  - all : toutes les cartes, dans l'ordre du paquet
 *  - random : toutes les cartes, mélangées
 *  - difficult : cartes difficiles
 */
export function sessionCards(cards, mode, state = get(), today = localDay(), random = Math.random) {
  switch (mode) {
    case 'due': {
      return cards
        .filter((c) => {
          const r = state.cards.review[c.key];
          return !r || r.due <= today;
        })
        .sort((a, b) => {
          const da = state.cards.review[a.key]?.due || '0000-00-00';
          const db = state.cards.review[b.key]?.due || '0000-00-00';
          return da < db ? -1 : da > db ? 1 : 0;
        });
    }
    case 'random':
      return shuffle(cards, random);
    case 'difficult':
      return difficultCards(cards, state);
    case 'all':
    default:
      return cards.slice();
  }
}

/**
 * Enregistre la réponse à une carte.
 * « review » (à revoir) ramène la carte en boîte 0 avec échéance demain.
 * « mastered » (maîtrisé) fait monter la boîte et repousse l'échéance selon INTERVALS.
 */
export function gradeCard(key, result, today = localDay()) {
  return update((state) => {
    const prev = state.cards.review[key] || { box: 0, due: today, seen: 0, wrong: 0 };
    const next = { ...prev, seen: prev.seen + 1 };
    if (result === 'review') {
      next.box = 0;
      next.due = addDays(today, 1);
      next.wrong = prev.wrong + 1;
    } else {
      next.box = Math.min(4, prev.box + 1);
      next.due = addDays(today, INTERVALS[next.box]);
    }
    state.cards.review[key] = next;
    return next;
  });
}

/* ---------- Cartes personnelles ---------- */

function newId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function validCardText(q, a) {
  const question = String(q ?? '').trim();
  const answer = String(a ?? '').trim();
  if (!question) return { ok: false, message: 'La question est vide. Écrivez ce que la carte demande.' };
  if (!answer) return { ok: false, message: 'La réponse est vide. Écrivez la réponse attendue.' };
  if (question.length > 500) return { ok: false, message: 'La question dépasse 500 caractères.' };
  if (answer.length > 1000) return { ok: false, message: 'La réponse dépasse 1 000 caractères.' };
  return { ok: true, q: question, a: answer };
}

export function addCustomCard(q, a) {
  const check = validCardText(q, a);
  if (!check.ok) return check;
  return update((state) => {
    if (state.cards.custom.length >= 500) return { ok: false, message: 'Limite atteinte : 500 cartes personnelles.' };
    const card = { id: newId(), q: check.q, a: check.a, createdAt: new Date().toISOString() };
    state.cards.custom.push(card);
    return { ok: true, card };
  });
}

export function updateCustomCard(id, q, a) {
  const check = validCardText(q, a);
  if (!check.ok) return check;
  return update((state) => {
    const card = state.cards.custom.find((c) => c.id === id);
    if (!card) return { ok: false, message: 'Carte introuvable : elle a peut-être été supprimée.' };
    card.q = check.q;
    card.a = check.a;
    return { ok: true, card };
  });
}

export function deleteCustomCard(id) {
  update((state) => {
    state.cards.custom = state.cards.custom.filter((c) => c.id !== id);
    delete state.cards.review[cardKeyFor(CUSTOM_PACK_ID, id)];
  });
}

/** Export des cartes personnelles seules, au format attendu par l'import. */
export function exportCustomCards(state = get()) {
  return JSON.stringify({
    app: 'kernova',
    type: 'cartes',
    exportedAt: new Date().toISOString(),
    cards: state.cards.custom.map((c) => ({ q: c.q, a: c.a }))
  }, null, 2);
}

/**
 * Importe des cartes depuis un JSON { app, type: 'cartes', cards: [{ q, a }] }.
 * Renvoie le nombre de cartes ajoutées et d'entrées rejetées.
 */
export function importCustomCards(text, maxChars = 2_000_000) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Le fichier est vide.');
  if (text.length > maxChars) throw new Error('Le fichier est trop volumineux (2 Mo maximum).');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Le fichier n\'est pas du JSON valide.'); }
  if (!data || data.app !== 'kernova' || data.type !== 'cartes' || !Array.isArray(data.cards)) {
    throw new Error('Ce fichier n\'est pas un export de cartes kernova.');
  }
  let added = 0;
  let rejected = 0;
  update((state) => {
    for (const item of data.cards.slice(0, 500)) {
      const check = validCardText(item?.q, item?.a);
      if (!check.ok || state.cards.custom.length >= 500) { rejected++; continue; }
      state.cards.custom.push({ id: newId(), q: check.q, a: check.a, createdAt: new Date().toISOString() });
      added++;
    }
  });
  return { added, rejected };
}
