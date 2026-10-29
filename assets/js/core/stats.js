// Agrégation des statistiques du tableau de bord, calculées à partir de l'état local uniquement.
// Fonctions pures : elles reçoivent l'état et le catalogue, sans toucher au DOM.

import { courseProgress, isChapterDone } from './progress.js';
import { localDay, addDays } from './utils.js';

export const PASS_PERCENT = 70;

export const ACTIVITY_LABELS = {
  view: 'Consultation',
  complete: 'Chapitre terminé',
  uncomplete: 'Chapitre remis en cours',
  quiz: 'Quiz',
  favorite: 'Favori ajouté'
};

/** Activité comptée pour les graphiques et la série (les retraits et favoris ne comptent pas). */
const COUNTED = new Set(['view', 'complete', 'quiz']);

export function computeStats(state, courses, findChapter, today = localDay()) {
  const activity = state.activity.filter((a) => COUNTED.has(a.type));

  // Progression par cours
  const perCourse = courses.map((c) => ({ course: c, ...courseProgress(c, state) }));
  const started = perCourse.filter((p) => p.started);
  const finished = perCourse.filter((p) => p.finished);
  const totalChapters = perCourse.reduce((s, p) => s + p.total, 0);
  const doneChapters = perCourse.reduce((s, p) => s + p.done, 0);

  // Temps estimé : somme des durées annoncées des chapitres terminés
  let estimatedMinutes = 0;
  const skills = [];
  for (const course of courses) {
    for (const ch of course.chapters) {
      if (isChapterDone(course.id, ch.id, state)) {
        estimatedMinutes += ch.duration;
        skills.push({ course, chapter: ch, day: state.progress[course.id].completed[ch.id] });
      }
    }
  }
  skills.sort((a, b) => (a.day < b.day ? 1 : -1));

  // Quiz
  const quizResults = state.quizResults.slice().reverse();
  const passed = quizResults.filter((r) => r.percent >= PASS_PERCENT);
  const perfect = quizResults.filter((r) => r.percent === 100);

  // Objectif quotidien
  const todayCount = activity.filter((a) => a.day === today && (a.type === 'complete' || a.type === 'quiz')).length;
  const goal = state.prefs.dailyGoal;

  // Série de jours consécutifs (en comptant aujourd'hui ou hier comme point de départ)
  const days = new Set(activity.map((a) => a.day));
  let streak = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  // Graphique des 14 derniers jours et calendrier des 35 derniers jours
  const countByDay = new Map();
  for (const a of activity) countByDay.set(a.day, (countByDay.get(a.day) || 0) + 1);
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    return { day, count: countByDay.get(day) || 0 };
  });
  const calendar = Array.from({ length: 35 }, (_, i) => {
    const day = addDays(today, i - 34);
    const count = countByDay.get(day) || 0;
    const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : 3;
    return { day, count, level, today: day === today };
  });

  // Chapitres consultés distincts
  const viewedChapters = new Set(state.activity.filter((a) => a.type === 'view').map((a) => a.chapterId)).size;

  // Badges
  const badges = [
    { id: 'first-step', title: 'Premier pas', text: 'Terminer un premier chapitre.', earned: doneChapters >= 1 },
    { id: 'curious', title: 'Curieux', text: 'Consulter 5 chapitres différents.', earned: viewedChapters >= 5 },
    { id: 'first-quiz', title: 'Premier quiz', text: 'Terminer un quiz.', earned: quizResults.length >= 1 },
    { id: 'quiz-pass', title: 'Quiz réussi', text: `Obtenir au moins ${PASS_PERCENT} % à un quiz.`, earned: passed.length >= 1 },
    { id: 'perfect', title: 'Sans faute', text: 'Obtenir 100 % à un quiz.', earned: perfect.length >= 1 },
    { id: 'streak3', title: 'Régulier', text: 'Apprendre 3 jours de suite.', earned: streak >= 3 },
    { id: 'goal', title: 'Objectif atteint', text: 'Atteindre l\'objectif quotidien.', earned: todayCount >= goal },
    {
      id: 'final-pass',
      title: 'Évaluation validée',
      text: `Réussir une évaluation finale avec au moins ${PASS_PERCENT} %.`,
      earned: quizResults.some((r) => r.quizId.endsWith('-final') && r.percent >= PASS_PERCENT)
    },
    { id: 'course-done', title: 'Parcours terminé', text: 'Terminer tous les chapitres d\'un cours.', earned: finished.length >= 1 }
  ];

  // Dernières activités, du plus récent au plus ancien
  const recentActivity = state.activity.slice(-10).reverse().map((a) => ({
    ...a,
    label: ACTIVITY_LABELS[a.type] || a.type,
    course: courses.find((c) => c.id === a.courseId) || null,
    chapter: a.chapterId ? findChapter(a.chapterId)?.chapter || null : null
  }));

  // Recommandations : cours non commencés, puis révision des questions ratées
  const recommendations = [];
  const notStarted = perCourse.filter((p) => !p.started);
  for (const p of notStarted.slice(0, 2)) {
    recommendations.push({ kind: 'course', title: p.course.title, text: 'Nouveau parcours disponible.', href: `#/cours/${p.course.id}` });
  }
  const lastFailed = quizResults.find((r) => r.failed.length > 0);
  if (lastFailed) {
    recommendations.push({
      kind: 'review',
      title: `Revoir : ${lastFailed.title}`,
      text: `${lastFailed.failed.length} question(s) ratée(s) lors du dernier quiz.`,
      href: `#/quiz/${lastFailed.courseId}/${lastFailed.chapterId}`
    });
  }
  const inProgress = started.find((p) => !p.finished);
  if (inProgress) {
    recommendations.push({ kind: 'continue', title: `Continuer : ${inProgress.course.title}`, text: `${inProgress.percent} % terminé.`, href: `#/cours/${inProgress.course.id}` });
  }

  return {
    perCourse,
    startedCount: started.length,
    finishedCount: finished.length,
    globalPercent: totalChapters ? Math.round((doneChapters / totalChapters) * 100) : 0,
    doneChapters,
    totalChapters,
    estimatedMinutes,
    skills,
    quizCount: quizResults.length,
    passedCount: passed.length,
    recentScores: quizResults.slice(0, 5),
    todayCount,
    goal,
    streak,
    last14,
    calendar,
    badges,
    recentActivity,
    recommendations,
    hasActivity: state.activity.length > 0 || doneChapters > 0 || quizResults.length > 0,
    favorites: state.favorites.map((id) => courses.find((c) => c.id === id)).filter(Boolean)
      .map((c) => ({ course: c, ...courseProgress(c, state) }))
  };
}
