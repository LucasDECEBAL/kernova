import { ROOT, CHROME_PATH } from './lib/env.mjs';
import fs from 'node:fs';

const root = ROOT + '/data/';
const read = (p) => JSON.parse(fs.readFileSync(root + p, 'utf8'));
const exists = (p) => fs.existsSync(root + p);

const cat = read('catalog.json');
const domains = new Set(cat.domains.map((d) => d.id));
const levels = new Set(['debutant', 'debutant-avance', 'intermediaire', 'avance', 'expert']);
const courseIds = new Set(cat.courses.map((c) => c.id));
const errors = [];
const err = (m) => errors.push(m);

let chapters = 0;
let modules = 0;
let quizzes = 0;
let exercises = 0;
let projects = 0;
const chapterIds = new Set();
const quizIds = new Set();

if (domains.size !== cat.domains.length) err('domaines en double');
if (courseIds.size !== cat.courses.length) err('cours en double');

for (const c of cat.courses) {
  if (!domains.has(c.domain)) err(`${c.id}: domaine inconnu ${c.domain}`);
  if (!levels.has(c.level)) err(`${c.id}: niveau inconnu ${c.level}`);
  if (!c.subdomain) err(`${c.id}: sous-catégorie manquante`);
  if (!Array.isArray(c.skills) || !c.skills.length) err(`${c.id}: compétences manquantes`);
  if (!Array.isArray(c.objectives) || !c.objectives.length) err(`${c.id}: objectifs manquants`);
  if (!Array.isArray(c.prerequisites) || !c.prerequisites.length) err(`${c.id}: prérequis textuels manquants`);
  for (const p of c.prerequisiteCourses || []) {
    if (!courseIds.has(p)) err(`${c.id}: prérequis inconnu ${p}`);
    if (p === c.id) err(`${c.id}: se cite comme prérequis`);
  }
  for (const n of c.nextCourses || []) {
    if (!courseIds.has(n)) err(`${c.id}: cours suivant inconnu ${n}`);
    if (n === c.id) err(`${c.id}: se cite comme cours suivant`);
  }
  if (!exists('lessons/' + c.file)) { err(`${c.id}: fichier de leçons absent`); continue; }

  const lessons = read('lessons/' + c.file);
  const extra = exists('exercises/' + c.id + '.json') ? read('exercises/' + c.id + '.json').chapters : {};
  if (lessons.courseId !== c.id) err(`${c.id}: courseId du fichier incorrect`);
  if (lessons.modules) modules += lessons.modules.length;

  let list = lessons.modules
    ? lessons.modules.flatMap((m) => m.chapters)
    : lessons.chapters;
  list = list.map((ch) => ({
    ...ch,
    exercise: ch.exercise ?? extra[ch.id]?.exercise,
    quiz: ch.quiz ?? extra[ch.id]?.quiz ?? []
  }));

  if (lessons.project) {
    projects++;
    if (!lessons.project.brief || !lessons.project.steps?.length || !lessons.project.criteria?.length) {
      err(`${c.id}: projet incomplet`);
    }
  }

  for (const ch of list) {
    chapters++;
    if (chapterIds.has(ch.id)) err(`chapitre en double ${ch.id}`);
    chapterIds.add(ch.id);
    if (!ch.title) err(`${ch.id}: titre manquant`);
    if (!ch.objectives?.length) err(`${ch.id}: objectifs manquants`);
    if (!ch.content?.length) err(`${ch.id}: contenu manquant`);
    if (!ch.exercise?.solution || !ch.exercise?.hints?.length || !ch.exercise?.instructions) err(`${ch.id}: exercice incomplet`);
    else exercises++;
    if (!ch.quiz?.length) err(`${ch.id}: quiz manquant`);

    for (const q of ch.quiz || []) {
      quizzes++;
      if (quizIds.has(q.id)) err(`question en double ${q.id}`);
      quizIds.add(q.id);
      if (!q.question) err(`${q.id}: énoncé manquant`);
      if (!q.explanation) err(`${q.id}: explication manquante`);
      const n = q.options?.length;
      switch (q.type) {
        case 'single':
          if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < n)) err(`${q.id}: réponse hors bornes`);
          break;
        case 'multiple':
          if (!q.answer?.length || !q.answer.every((i) => Number.isInteger(i) && i >= 0 && i < n)) err(`${q.id}: réponses hors bornes`);
          break;
        case 'truefalse':
          if (typeof q.answer !== 'boolean') err(`${q.id}: vrai/faux invalide`);
          break;
        case 'text':
          if (!q.answer?.length) err(`${q.id}: réponses texte manquantes`);
          break;
        case 'blank':
          if (!q.answers?.length) err(`${q.id}: réponses à trous manquantes`);
          if (q.question.split('___').length - 1 !== q.answers.length) err(`${q.id}: nombre de trous incohérent`);
          break;
        case 'order':
          if (!q.items?.length || q.answer.length !== q.items.length) err(`${q.id}: ordre incohérent`);
          if (new Set(q.answer).size !== q.answer.length) err(`${q.id}: ordre avec doublons`);
          break;
        case 'match':
          if (q.answer.length !== q.left.length || q.answer.some((i) => i < 0 || i >= q.right.length)) err(`${q.id}: association invalide`);
          break;
        default:
          err(`${q.id}: type inconnu ${q.type}`);
      }
    }
  }
}

const published = cat.courses.length;
const domainsWithCourse = new Set(cat.courses.map((c) => c.domain)).size;

// Les statistiques du catalogue doivent correspondre aux leçons.
try {
  const stats = read('course-stats.json');
  const ids = Object.keys(stats || {});
  if (ids.length !== published) err(`course-stats.json : ${ids.length} cours au lieu de ${published} — lancez npm run build:data`);
  const totalChapters = ids.reduce((n, id) => n + (Number(stats[id].chapters) || 0), 0);
  if (totalChapters !== chapters) err(`course-stats.json : ${totalChapters} chapitres au lieu de ${chapters} — lancez npm run build:data`);
} catch {
  err('course-stats.json absent (lancez npm run build:data)');
}

// Le bundle utilisé par l'application doit refléter les fichiers de leçons.
try {
  const bundle = read('lessons-bundle.json');
  if (!bundle || typeof bundle.courses !== 'object') {
    err('lessons-bundle.json : structure invalide (lancez npm run build:data)');
  } else {
    const bundledChapters = Object.values(bundle.courses).reduce((n, c) => n + ((c.chapters || []).length), 0);
    if (Object.keys(bundle.courses).length !== published) err(`lessons-bundle.json : ${Object.keys(bundle.courses).length} cours au lieu de ${published}`);
    if (bundledChapters !== chapters) err(`lessons-bundle.json : ${bundledChapters} chapitres au lieu de ${chapters} — lancez npm run build:data`);
  }
} catch {
  err('lessons-bundle.json absent (lancez npm run build:data)');
}
console.log(`Cours: ${published} | domaines: ${cat.domains.length} (${domainsWithCourse} avec cours) | modules: ${modules} | leçons: ${chapters} | exercices: ${exercises} | questions: ${quizzes} | projets: ${projects}`);
console.log(errors.length ? 'ERREURS:\n - ' + errors.join('\n - ') : 'Catalogue cohérent : aucune erreur.');
process.exit(errors.length ? 1 : 0);
