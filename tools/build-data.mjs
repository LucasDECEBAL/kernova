// Génère data/lessons-bundle.json : toutes les leçons dans un seul fichier.
// Usage : npm run build:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const catalog = read(path.join(root, 'catalog.json'));
const courses = {};

for (const meta of catalog.courses) {
  const lessons = read(path.join(root, 'lessons', meta.file));
  let extra = {};
  try {
    const exercises = read(path.join(root, 'exercises', meta.id + '.json'));
    if (exercises && exercises.chapters) extra = exercises.chapters;
  } catch {
    /* pas de fichier d'exercices séparé */
  }

  const withExtra = (ch) => {
    const x = extra[ch.id] || {};
    return { ...ch, exercise: ch.exercise ?? x.exercise, quiz: ch.quiz ?? x.quiz ?? [] };
  };

  const chapters = Array.isArray(lessons.modules)
    ? lessons.modules.flatMap((m) => (m.chapters || []).map((ch) => withExtra({ ...ch, module: m.title, moduleId: m.id })))
    : (lessons.chapters || []).map(withExtra);

  courses[meta.id] = { project: lessons.project || null, chapters };
}

const bundle = { generatedAt: new Date().toISOString(), courses };
fs.writeFileSync(path.join(root, 'lessons-bundle.json'), JSON.stringify(bundle) + '\n', 'utf8');

const size = fs.statSync(path.join(root, 'lessons-bundle.json')).size;
console.log(`lessons-bundle.json : ${catalog.courses.length} cours, ${Object.values(courses).reduce((n, c) => n + c.chapters.length, 0)} chapitres, ${(size / 1024 / 1024).toFixed(2)} Mo`);

// Statistiques légères pour afficher le catalogue sans charger les leçons.
const stats = {};
for (const [id, entry] of Object.entries(courses)) {
  stats[id] = {
    duration: entry.chapters.reduce((sum, ch) => sum + (Number(ch.duration) || 0), 0),
    chapters: entry.chapters.length,
    modules: new Set(entry.chapters.map((ch) => ch.moduleId).filter(Boolean)).size || 1
  };
}
fs.writeFileSync(path.join(root, 'course-stats.json'), JSON.stringify(stats) + '\n', 'utf8');
console.log(`course-stats.json : ${Object.keys(stats).length} cours`);