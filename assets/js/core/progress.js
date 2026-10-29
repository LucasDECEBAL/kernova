// Logique métier : progression, déblocage des chapitres (arbre de compétences),
// favoris, notes et journal d'activité. Ne manipule le DOM nulle part.

import { get, update } from './store.js';
import { localDay } from './utils.js';

/** Prérequis d'un chapitre : liste explicite `requires`, sinon le chapitre précédent. */
export function prerequisitesOf(course, chapter) {
  const ids = Array.isArray(chapter.requires) ? chapter.requires : null;
  if (ids) return course.chapters.filter((c) => ids.includes(c.id));
  return chapter.index > 0 ? [course.chapters[chapter.index - 1]] : [];
}

export function isChapterDone(courseId, chapterId, state = get()) {
  return Boolean(state.progress[courseId]?.completed?.[chapterId]);
}

/** 'done' | 'current' | 'available' | 'locked' */
export function chapterStatus(course, chapter, state = get()) {
  if (isChapterDone(course.id, chapter.id, state)) return 'done';
  const prereqs = prerequisitesOf(course, chapter);
  const unlocked = prereqs.every((p) => isChapterDone(course.id, p.id, state));
  if (!unlocked) return 'locked';
  const firstOpen = course.chapters.find((c) => !isChapterDone(course.id, c.id, state));
  return firstOpen && firstOpen.id === chapter.id ? 'current' : 'available';
}

/** Prérequis non encore validés. */
export function missingPrerequisites(course, chapter, state = get()) {
  return prerequisitesOf(course, chapter).filter((p) => !isChapterDone(course.id, p.id, state));
}

export function courseProgress(course, state = get()) {
  const total = course.chapters.length;
  const done = course.chapters.filter((c) => isChapterDone(course.id, c.id, state)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const started = done > 0 || Boolean(state.progress[course.id]?.lastChapter);
  return { done, total, percent, started, finished: total > 0 && done === total };
}

/** Chapitre à reprendre : dernier consulté s'il est accessible, sinon le premier accessible non terminé. */
export function resumeChapter(course, state = get()) {
  const last = state.progress[course.id]?.lastChapter;
  const lastChapter = course.chapters.find((c) => c.id === last);
  if (lastChapter && chapterStatus(course, lastChapter, state) !== 'locked') return lastChapter;
  return course.chapters.find((c) => chapterStatus(course, c, state) === 'current')
    || course.chapters.find((c) => chapterStatus(course, c, state) === 'available')
    || course.chapters[0] || null;
}

function ensureCourseEntry(state, courseId) {
  if (!state.progress[courseId]) state.progress[courseId] = { completed: {}, lastChapter: null };
  return state.progress[courseId];
}

function pushRecent(state, course, chapter) {
  const entry = { courseId: course.id, chapterId: chapter ? chapter.id : null, title: chapter ? chapter.title : course.title, at: new Date().toISOString() };
  state.recent = [entry, ...state.recent.filter((r) => !(r.courseId === entry.courseId && r.chapterId === entry.chapterId))].slice(0, 20);
}

function pushActivity(state, entry) {
  state.activity.push({ day: localDay(), at: new Date().toISOString(), ...entry });
  if (state.activity.length > 2000) state.activity.splice(0, state.activity.length - 2000);
}

/** Enregistre la consultation d'un chapitre (une seule entrée d'activité par jour et par chapitre). */
export function markViewed(course, chapter) {
  update((state) => {
    ensureCourseEntry(state, course.id).lastChapter = chapter.id;
    pushRecent(state, course, chapter);
    const day = localDay();
    const already = state.activity.some((a) => a.type === 'view' && a.day === day && a.chapterId === chapter.id);
    if (!already) pushActivity(state, { type: 'view', courseId: course.id, chapterId: chapter.id, title: chapter.title });
  });
}

/** Bascule l'état terminé d'un chapitre. Renvoie le nouvel état booléen. */
export function toggleChapterDone(course, chapter) {
  return update((state) => {
    const entry = ensureCourseEntry(state, course.id);
    if (entry.completed[chapter.id]) {
      delete entry.completed[chapter.id];
      pushActivity(state, { type: 'uncomplete', courseId: course.id, chapterId: chapter.id, title: chapter.title });
      return false;
    }
    entry.completed[chapter.id] = localDay();
    pushActivity(state, { type: 'complete', courseId: course.id, chapterId: chapter.id, title: chapter.title });
    return true;
  });
}

export function isFavorite(courseId, state = get()) {
  return state.favorites.includes(courseId);
}

export function toggleFavorite(courseId) {
  return update((state) => {
    const idx = state.favorites.indexOf(courseId);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      return false;
    }
    state.favorites.push(courseId);
    pushActivity(state, { type: 'favorite', courseId, chapterId: null, title: courseId });
    return true;
  });
}

export function noteKey(courseId, chapterId) {
  return `${courseId}/${chapterId}`;
}

export function getNote(courseId, chapterId, state = get()) {
  return state.notes[noteKey(courseId, chapterId)] || '';
}

export function saveNote(courseId, chapterId, text) {
  update((state) => {
    const key = noteKey(courseId, chapterId);
    if (text.trim()) state.notes[key] = text;
    else delete state.notes[key];
  });
}

export function setDailyGoal(value) {
  update((state) => { state.prefs.dailyGoal = value; });
}

export function setQuizPrefs(patch) {
  update((state) => { Object.assign(state.prefs.quiz, patch); });
}

/** Ajoute le résultat d'un quiz terminé et l'entrée d'activité correspondante. */
export function recordQuizResult(result) {
  update((state) => {
    state.quizResults.push(result);
    if (state.quizResults.length > 300) state.quizResults.splice(0, state.quizResults.length - 300);
    pushActivity(state, { type: 'quiz', courseId: result.courseId, chapterId: result.chapterId, title: `Quiz : ${result.title}` });
  });
}
