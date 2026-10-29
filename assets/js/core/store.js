// Stockage centralisé : seul module autorisé à lire/écrire localStorage.
// Les modules métier passent par update() ; les pages lisent via get().

import { createDefaultState, sanitizeState, MAX_IMPORT_CHARS } from './schema.js';

export const STORAGE_KEY = 'kernova:v1';
const BACKUP_KEY = 'kernova:v1:backup-corrompu';

let state = createDefaultState();
let storageOk = true;
let notices = [];
const listeners = new Set();

/** Charge l'état depuis localStorage. Ne lève jamais d'exception. */
export function init() {
  notices = [];
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageOk = false;
    notices.push('Le stockage du navigateur est indisponible : vos données ne seront pas conservées.');
    state = createDefaultState();
    return;
  }
  if (raw === null) {
    state = createDefaultState();
    return;
  }
  try {
    const { state: clean, issues } = sanitizeState(JSON.parse(raw));
    state = clean;
    if (issues.length) {
      notices.push(`Certaines données locales étaient invalides et ont été ignorées (${issues.length}).`);
      persist();
    }
  } catch (err) {
    // Données illisibles : on conserve une copie puis on repart d'un état propre.
    try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* quota atteint : pas de copie */ }
    state = createDefaultState();
    notices.push('Les données locales étaient illisibles. Une copie a été conservée dans le navigateur.');
    persist();
  }
}

/** Lecture seule par convention : ne jamais muter l'objet renvoyé. */
export function get() {
  return state;
}

export function getNotices() {
  return notices.slice();
}

export function clearNotices() {
  notices = [];
}

export function isAvailable() {
  return storageOk;
}

/** Applique une mutation puis sauvegarde et notifie les abonnés. */
export function update(mutator) {
  const result = mutator(state);
  persist();
  emit();
  return result;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

/** Sauvegarde ; renvoie false si le navigateur refuse l'écriture (quota). */
function persist() {
  if (!storageOk) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    notices.push('Impossible d\'enregistrer : espace de stockage plein ou bloqué.');
    console.error(err);
    return false;
  }
}

/** Remplace tout l'état par un état neuf. */
export function reset() {
  state = createDefaultState();
  persist();
  emit();
}

/** Export complet, prêt à être téléchargé. */
export function exportJson() {
  return JSON.stringify({ app: 'kernova', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/**
 * Importe un export kernova. Lève une erreur compréhensible si le fichier est invalide.
 * @returns {{ issues: string[] }} éléments ignorés
 */
export function importJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Le fichier est vide.');
  if (text.length > MAX_IMPORT_CHARS) throw new Error('Le fichier est trop volumineux (2 Mo maximum).');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Le fichier n\'est pas du JSON valide.');
  }
  if (!parsed || parsed.app !== 'kernova' || !parsed.data) {
    throw new Error('Ce fichier ne provient pas d\'un export kernova.');
  }
  const { state: clean, issues } = sanitizeState(parsed.data);
  state = clean;
  persist();
  emit();
  return { issues };
}

/** Taille approximative des données, en octets (UTF-16 ≈ 2 octets par caractère). */
export function storageSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    return raw.length * 2;
  } catch {
    return 0;
  }
}

export function hasCorruptBackup() {
  try {
    return localStorage.getItem(BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

export function removeCorruptBackup() {
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignoré */ }
}
