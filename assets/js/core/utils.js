// Utilitaires purs (sans DOM) : testables sous Node.

/** Normalise un texte pour la recherche : sans accents, minuscules, espaces compactés. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Date locale au format YYYY-MM-DD (sans décalage UTC). */
export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Ajoute n jours à une date YYYY-MM-DD et renvoie une date YYYY-MM-DD. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return localDay(date);
}

/** Durée lisible : 45 -> "45 min", 90 -> "1 h 30". */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Mélange de Fisher-Yates ; renvoie un nouveau tableau. */
export function shuffle(items, random = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Retourne une fonction qui n'est appelée qu'après un délai sans nouvel appel. */
export function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Pourcentage arrondi, sûr contre la division par zéro. */
export function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/** Niveaux pédagogiques, du plus accessible au plus spécialisé. */
export const LEVELS = {
  debutant: { label: 'Débutant', rank: 1 },
  'debutant-avance': { label: 'Débutant avancé', rank: 2 },
  intermediaire: { label: 'Intermédiaire', rank: 3 },
  avance: { label: 'Avancé', rank: 4 },
  expert: { label: 'Expert', rank: 5 }
};

export const TYPES = {
  cours: 'Cours',
  parcours: 'Parcours',
  exercice: 'Exercices',
  projet: 'Projet'
};
