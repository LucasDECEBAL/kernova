// Schéma des données locales et validation.
// Toute donnée venant du stockage ou d'un import passe par sanitizeState().
// Les entrées invalides sont écartées et signalées, sans bloquer l'ensemble.

export const SCHEMA_VERSION = 1;
export const MAX_IMPORT_CHARS = 2_000_000;
export const THEMES = ['system', 'light', 'dark'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY_TYPES = ['view', 'complete', 'uncomplete', 'quiz', 'favorite'];
const MAX = { quizResults: 300, activity: 2000, recent: 20, favorites: 500, notes: 300, noteChars: 20000, customCards: 500 };

export function createDefaultState() {
  return {
    schema: SCHEMA_VERSION,
    prefs: {
      theme: 'system',
      dailyGoal: 2,
      quiz: { maxAttempts: 2, shuffleQuestions: true, shuffleAnswers: true, timer: false, difficulty: 0 }
    },
    progress: {},     // { [courseId]: { completed: { [chapterId]: 'YYYY-MM-DD' }, lastChapter: string|null } }
    quizResults: [],  // { id, quizId, courseId, chapterId, title, score, total, percent, date, failed: [questionId] }
    favorites: [],    // [courseId]
    notes: {},        // { 'courseId/chapterId': text }
    recent: [],       // { courseId, chapterId, title, at }
    activity: [],     // { day, type, courseId, chapterId, title, at }
    cards: {
      custom: [],     // { id, q, a, createdAt } : cartes personnelles
      review: {}      // { [cardKey]: { box: 0-4, due: 'YYYY-MM-DD', seen, wrong } }
    }
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const bool = (v) => (typeof v === 'boolean' ? v : null);

/**
 * Valide et normalise un état complet.
 * @returns {{ state: object, issues: string[] }}
 * @throws si la structure globale est inutilisable.
 */
export function sanitizeState(raw) {
  if (!isObj(raw)) throw new Error('Le contenu n\'est pas un objet JSON valide.');
  if (raw.schema !== SCHEMA_VERSION) {
    throw new Error(`Version de données non prise en charge (${String(raw.schema)}).`);
  }

  const base = createDefaultState();
  const issues = [];
  const drop = (what) => issues.push(what);

  // Préférences
  if (isObj(raw.prefs)) {
    const p = raw.prefs;
    if (THEMES.includes(p.theme)) base.prefs.theme = p.theme;
    const goal = int(p.dailyGoal, 1, 10);
    if (goal) base.prefs.dailyGoal = goal; else if (p.dailyGoal !== undefined) drop('objectif quotidien');
    if (isObj(p.quiz)) {
      const q = p.quiz;
      const attempts = int(q.maxAttempts, 0, 5);
      if (attempts !== null) base.prefs.quiz.maxAttempts = attempts;
      if (bool(q.shuffleQuestions) !== null) base.prefs.quiz.shuffleQuestions = q.shuffleQuestions;
      if (bool(q.shuffleAnswers) !== null) base.prefs.quiz.shuffleAnswers = q.shuffleAnswers;
      if (bool(q.timer) !== null) base.prefs.quiz.timer = q.timer;
      const diff = int(q.difficulty, 0, 3);
      if (diff !== null) base.prefs.quiz.difficulty = diff;
    }
  }

  // Progression
  if (isObj(raw.progress)) {
    for (const [courseId, entry] of Object.entries(raw.progress)) {
      if (!str(courseId, 100) || !isObj(entry) || !isObj(entry.completed)) { drop('progression'); continue; }
      const completed = {};
      for (const [chapterId, day] of Object.entries(entry.completed)) {
        if (str(chapterId, 100) && typeof day === 'string' && DAY_RE.test(day)) completed[chapterId] = day;
        else drop('chapitre terminé');
      }
      base.progress[courseId] = {
        completed,
        lastChapter: str(entry.lastChapter, 100)
      };
    }
  } else if (raw.progress !== undefined) drop('progression');

  // Résultats de quiz
  if (Array.isArray(raw.quizResults)) {
    for (const r of raw.quizResults.slice(-MAX.quizResults)) {
      const ok = isObj(r) && str(r.quizId, 100) && str(r.courseId, 100) && str(r.chapterId, 100)
        && Number.isFinite(r.score) && r.score >= 0 && Number.isFinite(r.total) && r.total > 0
        && Number.isFinite(r.percent) && r.percent >= 0 && r.percent <= 100
        && typeof r.date === 'string' && DAY_RE.test(r.date) && Array.isArray(r.failed);
      if (!ok) { drop('résultat de quiz'); continue; }
      base.quizResults.push({
        id: str(r.id, 100) || `${r.quizId}-${r.date}-${base.quizResults.length}`,
        quizId: r.quizId, courseId: r.courseId, chapterId: r.chapterId,
        title: str(r.title, 200) || r.chapterId,
        score: r.score, total: r.total, percent: r.percent, date: r.date,
        failed: r.failed.filter((x) => str(x, 100)).slice(0, 100)
      });
    }
  }

  // Favoris
  if (Array.isArray(raw.favorites)) {
    const seen = new Set();
    for (const id of raw.favorites) {
      if (str(id, 100) && !seen.has(id) && base.favorites.length < MAX.favorites) {
        seen.add(id);
        base.favorites.push(id);
      } else drop('favori');
    }
  }

  // Notes
  if (isObj(raw.notes)) {
    let count = 0;
    for (const [key, text] of Object.entries(raw.notes)) {
      if (count >= MAX.notes) { drop('note (limite atteinte)'); break; }
      if (str(key, 220) && typeof text === 'string' && text.length <= MAX.noteChars) {
        base.notes[key] = text;
        count++;
      } else drop('note');
    }
  }

  // Derniers contenus consultés
  if (Array.isArray(raw.recent)) {
    for (const r of raw.recent.slice(0, MAX.recent)) {
      if (isObj(r) && str(r.courseId, 100) && (r.chapterId === null || str(r.chapterId, 100))
        && str(r.title, 200) && typeof r.at === 'string') {
        base.recent.push({ courseId: r.courseId, chapterId: r.chapterId, title: r.title, at: r.at });
      } else drop('contenu récent');
    }
  }

  // Journal d'activité
  if (Array.isArray(raw.activity)) {
    for (const a of raw.activity.slice(-MAX.activity)) {
      if (isObj(a) && typeof a.day === 'string' && DAY_RE.test(a.day) && ACTIVITY_TYPES.includes(a.type)
        && str(a.courseId, 100) && (a.chapterId === null || str(a.chapterId, 100)) && str(a.title, 200)) {
        base.activity.push({
          day: a.day, type: a.type, courseId: a.courseId, chapterId: a.chapterId ?? null,
          title: a.title, at: typeof a.at === 'string' ? a.at : a.day
        });
      } else drop('activité');
    }
  }

  // Cartes mémo : cartes personnelles et état de révision espacée
  if (isObj(raw.cards)) {
    if (Array.isArray(raw.cards.custom)) {
      for (const c of raw.cards.custom.slice(0, MAX.customCards)) {
        if (isObj(c) && str(c.id, 100) && str(c.q, 500) && str(c.a, 1000)) {
          base.cards.custom.push({ id: c.id, q: c.q, a: c.a, createdAt: str(c.createdAt, 40) || '' });
        } else drop('carte personnelle');
      }
    }
    if (isObj(raw.cards.review)) {
      for (const [key, r] of Object.entries(raw.cards.review)) {
        const ok = str(key, 220) && isObj(r) && int(r.box, 0, 4) !== null
          && typeof r.due === 'string' && DAY_RE.test(r.due)
          && int(r.seen, 0, 1000000) !== null && int(r.wrong, 0, 1000000) !== null;
        if (ok) base.cards.review[key] = { box: r.box, due: r.due, seen: r.seen, wrong: r.wrong };
        else drop('révision de carte');
      }
    }
  } else if (raw.cards !== undefined) drop('cartes');

  return { state: base, issues };
}

/** Nombre d'éléments écartés à la validation, pour message utilisateur. */
export function summarizeIssues(issues) {
  if (!issues.length) return '';
  const counts = {};
  for (const i of issues) counts[i] = (counts[i] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
}
