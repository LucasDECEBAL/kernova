// Graphe des cours : niveaux calculés par la plus longue chaîne de prérequis.
// Un cours est « disponible » quand tous ses prérequis sont terminés.

import { courseProgress } from './progress.js';

export function buildParcours(courses, state) {
  const byId = new Map(courses.map((course) => [course.id, course]));
  const prerequisites = (course) => (course.prerequisiteCourses || [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  const levels = new Map();
  const visiting = new Set();

  function levelOf(course) {
    if (levels.has(course.id)) return levels.get(course.id);
    if (visiting.has(course.id)) return 0; // garde-fou contre un cycle de données
    visiting.add(course.id);
    const prereqs = prerequisites(course);
    const level = prereqs.length ? Math.max(...prereqs.map((p) => levelOf(p))) + 1 : 0;
    visiting.delete(course.id);
    levels.set(course.id, level);
    return level;
  }

  const rows = courses.map((course) => {
    const progress = courseProgress(course, state);
    const prereqs = prerequisites(course);
    const missing = prereqs.filter((p) => !courseProgress(p, state).finished);
    let status;
    if (progress.finished) status = 'done';
    else if (progress.started) status = 'doing';
    else if (!missing.length) status = 'available';
    else status = 'locked';
    return { course, progress, prereqs, missing, status, level: levelOf(course) };
  });

  const maxLevel = rows.reduce((max, row) => Math.max(max, row.level), 0);
  const byLevel = Array.from({ length: maxLevel + 1 }, () => []);
  for (const row of rows) byLevel[row.level].push(row);
  for (const list of byLevel) list.sort((a, b) => a.course.title.localeCompare(b.course.title, 'fr'));

  const stats = {
    total: rows.length,
    done: rows.filter((r) => r.status === 'done').length,
    doing: rows.filter((r) => r.status === 'doing').length,
    available: rows.filter((r) => r.status === 'available').length,
    locked: rows.filter((r) => r.status === 'locked').length
  };

  return { rows, byLevel, stats, maxLevel };
}
