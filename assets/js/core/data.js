// Chargement et validation des contenus JSON locaux (catalogue + leçons).
// Le catalogue s'affiche sans attendre les leçons : chaque cours est chargé à la demande.

const cache = {
  catalog: null,
  courses: new Map(),   // id -> cours (chapitres vides tant que non chargé)
  chapters: new Map(),  // chapterId -> { course, chapter, index }
  issues: [],
  coursePromises: new Map(),
  allPromise: null
};

async function fetchJson(path) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error(`Impossible de charger ${path}. Vérifiez que le site est servi par un serveur statique.`);
  }
  if (!res.ok) throw new Error(`Fichier introuvable : ${path} (HTTP ${res.status}).`);
  return res.json();
}

const isStr = (v) => typeof v === 'string' && v.length > 0;

// Seuls ces cours ont un fichier d'exercices séparé. Évite des requêtes 404 inutiles.
const EXERCISE_FILES = new Set(['git-debutant', 'python-debutant']);

/** Exercices et quiz d'un cours, indexés par identifiant de chapitre. */
async function fetchExtra(courseId) {
  try {
    const data = await fetchJson(`data/exercises/${courseId}.json`);
    return data && typeof data.chapters === 'object' ? data.chapters : {};
  } catch {
    return {};
  }
}

function validateChapter(ch) {
  return ch && isStr(ch.id) && isStr(ch.title) && Array.isArray(ch.content)
    && Array.isArray(ch.objectives) && Array.isArray(ch.quiz ?? []);
}

function mergeExtra(chapters, extra) {
  return chapters.map((ch) => {
    const x = extra[ch.id] || {};
    return { ...ch, exercise: ch.exercise ?? x.exercise, quiz: ch.quiz ?? x.quiz ?? [] };
  });
}

function chaptersFrom(lessons, meta, extra) {
  // Format à plat (chapters) ou regroupé par modules (modules[].chapters)
  const raw = Array.isArray(lessons.modules)
    ? lessons.modules.flatMap((m) => (m.chapters || []).map((ch) => ({ ...ch, module: m.title, moduleId: m.id })))
    : (lessons.chapters || []);
  if (lessons.courseId !== meta.id && lessons.courseId !== undefined) throw new Error('identifiant de cours incohérent');
  return mergeExtra(raw, extra);
}

/** Fusionne les chapitres dans le cours déjà présent (idempotent). */
function attachChapters(course, raw, project) {
  if (!course || course.chapters.length) return course;
  const chapters = raw.filter((ch) => {
    const ok = validateChapter(ch);
    if (!ok) cache.issues.push(`${course.id} : chapitre ignoré (structure invalide)`);
    return ok;
  });
  const seen = new Set();
  for (const ch of chapters) {
    if (seen.has(ch.id) || cache.chapters.has(ch.id)) cache.issues.push(`${course.id} : identifiant de chapitre en double (${ch.id})`);
    seen.add(ch.id);
  }
  course.chapters = chapters.map((ch, index) => ({
    ...ch,
    index,
    courseId: course.id,
    duration: Number(ch.duration) || 0,
    module: ch.module || null
  }));
  course.project = project || course.project || null;
  course.duration = course.chapters.reduce((sum, ch) => sum + ch.duration, 0);
  course.chaptersCount = course.chapters.length;
  course.chapters.forEach((ch) => cache.chapters.set(ch.id, { course, chapter: ch, index: ch.index }));
  return course;
}

function makeCourse(meta, stats) {
  return {
    ...meta,
    project: null,
    prerequisiteCourses: meta.prerequisiteCourses || [],
    nextCourses: meta.nextCourses || [],
    skills: meta.skills || [],
    duration: Number(stats?.duration) || 0,
    chaptersCount: Number(stats?.chapters) || 0,
    modulesCount: Number(stats?.modules) || 0,
    chapters: []
  };
}

/** Charge le catalogue et les petits jeux de données. Les leçons restent différées. */
export async function loadData() {
  if (cache.catalog) return cache.catalog;
  const statsPromise = fetchJson('data/course-stats.json').catch(() => null);
  const catalog = await fetchJson('data/catalog.json');
  if (!Array.isArray(catalog.domains) || !Array.isArray(catalog.courses)) {
    throw new Error('Le catalogue est mal formé (domains/courses manquants).');
  }

  let stats = {};
  try {
    stats = await fetchJson('data/course-stats.json');
  } catch {
    /* optionnel : les durées resteront à zéro jusqu'au chargement des cours */
  }

  for (const meta of catalog.courses) {
    cache.courses.set(meta.id, makeCourse(meta, stats[meta.id]));
  }

  // Tous les petits jeux de données partent en parallèle : un seul aller-retour.
  const started = {
    flashcards: fetchJson('data/flashcards.json').catch(() => null),
    flashcardsExtra: fetchJson('data/flashcards-extra.json').catch(() => null),
    playground: fetchJson('data/playground.json').catch(() => null),
    terminal: fetchJson('data/terminal.json').catch(() => null),
    network: fetchJson('data/network.json').catch(() => null),
    cheatsheets: fetchJson('data/cheatsheets.json').catch(() => null),
    execution: fetchJson('data/execution.json').catch(() => null),
    editors: fetchJson('data/editors.json').catch(() => null),
    projectExtras: fetchJson('data/projects-extra.json').catch(() => null)
  };

  // Paquets de cartes mémo : optionnels, un échec ne bloque pas l'application
  try {
    const packs = [];
    for (const file of ['data/flashcards.json', 'data/flashcards-extra.json']) {
      try {
        const flash = await (file.endsWith('extra.json') ? started.flashcardsExtra : started.flashcards);
        if (Array.isArray(flash.packs)) packs.push(...flash.packs);
      } catch {
        if (file === 'data/flashcards.json') throw new Error('fichier principal introuvable');
      }
    }
    const seen = new Set();
    cache.flashcards = packs.filter((p) => {
      const ok = p && isStr(p.id) && Array.isArray(p.cards) && !seen.has(p.id);
      if (ok) seen.add(p.id);
      return ok;
    });
  } catch (err) {
    cache.issues.push(`cartes mémo : ${err.message}`);
    cache.flashcards = [];
  }

  // Exemples du playground : optionnels
  try {
    const pg = await started.playground;
    cache.playground = Array.isArray(pg.examples)
      ? pg.examples.filter((e) => isStr(e.id) && typeof e.html === 'string' && typeof e.js === 'string')
      : [];
  } catch (err) {
    cache.issues.push(`playground : ${err.message}`);
    cache.playground = [];
  }

  // Scénarios du terminal simulé : optionnels
  try {
    const term = await started.terminal;
    cache.terminal = Array.isArray(term.scenarios)
      ? term.scenarios.filter((s) => isStr(s.id) && Array.isArray(s.objectives) && s.objectives.length)
      : [];
  } catch (err) {
    cache.issues.push(`terminal : ${err.message}`);
    cache.terminal = [];
  }

  // Simulateur réseau : topologie et scénarios
  try {
    const net = await started.network;
    const ok = net && net.seed && Array.isArray(net.seed.devices) && Array.isArray(net.scenarios);
    cache.network = ok ? net : null;
  } catch (err) {
    cache.issues.push(`réseau : ${err.message}`);
    cache.network = null;
  }

  // Fiches mémo
  try {
    const sheets = await started.cheatsheets;
    cache.cheatsheets = Array.isArray(sheets.sheets)
      ? sheets.sheets.filter((s) => isStr(s.id) && isStr(s.title) && Array.isArray(s.entries))
      : [];
  } catch (err) {
    cache.issues.push(`fiches mémo : ${err.message}`);
    cache.cheatsheets = [];
  }

  // Exemples d'exécution Python et SQL
  try {
    const exec = await started.execution;
    cache.execution = exec && exec.python && exec.sql ? exec : null;
  } catch (err) {
    cache.issues.push(`exécution : ${err.message}`);
    cache.execution = null;
  }

  // Atelier d'éditeurs : validation pédagogique, sans compilation ni exécution
  try {
    const editors = await started.editors;
    cache.editors = editors && Array.isArray(editors.languages)
      ? editors.languages.filter((l) => isStr(l.id) && isStr(l.name) && Array.isArray(l.exercises))
      : [];
  } catch (err) {
    cache.issues.push(`éditeurs : ${err.message}`);
    cache.editors = [];
  }

  // Compléments de projets : fichiers de départ et indices
  try {
    const extra = await started.projectExtras;
    cache.projectExtras = extra && typeof extra === 'object' ? extra : {};
  } catch {
    cache.projectExtras = {};
  }

  cache.catalog = catalog;
  return catalog;
}

/** Charge un cours précis (leçon + exercices séparés si nécessaire). */
export function ensureCourse(courseId) {
  const course = cache.courses.get(courseId);
  if (!course) return Promise.resolve(null);
  if (course.chapters.length) return Promise.resolve(course);
  if (cache.coursePromises.has(courseId)) return cache.coursePromises.get(courseId);

  const meta = cache.catalog?.courses.find((c) => c.id === courseId);
  const promise = (async () => {
    try {
      const lessons = await fetchJson(`data/lessons/${meta.file}`);
      const extra = EXERCISE_FILES.has(meta.id) ? await fetchExtra(meta.id) : {};
      attachChapters(course, chaptersFrom(lessons, meta, extra), lessons.project);
    } catch (err) {
      cache.issues.push(`${courseId} : ${err.message}`);
      console.warn(`kernova : cours ignoré (${courseId})`, err);
    }
    return course;
  })();

  cache.coursePromises.set(courseId, promise);
  return promise;
}

/** Charge toutes les leçons d'un coup (recherche, tableau de bord, parcours, projets). */
export function ensureAllCourses() {
  if (cache.allPromise) return cache.allPromise;
  cache.allPromise = (async () => {
    try {
      const data = await fetchJson('data/lessons-bundle.json');
      if (data && data.courses && typeof data.courses === 'object') {
        for (const meta of cache.catalog.courses) {
          const entry = data.courses[meta.id];
          const course = cache.courses.get(meta.id);
          if (!entry || !course || !Array.isArray(entry.chapters)) continue;
          attachChapters(course, entry.chapters, entry.project);
        }
        return;
      }
    } catch {
      /* repli fichier par fichier */
    }
    let next = 0;
    const worker = async () => {
      while (next < cache.catalog.courses.length) {
        const meta = cache.catalog.courses[next++];
        await ensureCourse(meta.id);
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
  })();
  return cache.allPromise;
}

/** Paquets de cartes fournis avec l'application. */
export function getFlashPacks() {
  return cache.flashcards || [];
}

/** Exemples de code du playground. */
export function getPlaygroundExamples() {
  return cache.playground || [];
}

/** Scénarios guidés du terminal simulé. */
export function getTerminalScenarios() {
  return cache.terminal || [];
}

/** Topologie et scénarios du simulateur réseau. */
export function getNetworkData() {
  return cache.network || null;
}

/** Fiches mémo de référence. */
export function getCheatsheets() {
  return cache.cheatsheets || [];
}

/** Exemples et schéma pour l'exécution Python et SQL. */
export function getExecutionData() {
  return cache.execution || null;
}

/** Langages de l'atelier de code et leurs exercices. */
export function getEditorLanguages() {
  return cache.editors || [];
}

/** Fichiers de départ et indices des projets, par identifiant de cours. */
export function getProjectExtras() {
  return cache.projectExtras || {};
}

export function getDataIssues() {
  return cache.issues.slice();
}

export function getDomains() {
  return cache.catalog ? cache.catalog.domains : [];
}

export function getDomain(id) {
  return getDomains().find((d) => d.id === id) || null;
}

/** Tous les cours (métadonnées ; chapitres chargés à la demande). */
export function getCourses() {
  if (!cache.catalog) return [];
  return cache.catalog.courses.map((m) => cache.courses.get(m.id)).filter(Boolean);
}

export function getCourse(id) {
  return cache.courses.get(id) || null;
}

export function getChapter(courseId, chapterId) {
  const entry = cache.chapters.get(chapterId);
  if (!entry || entry.course.id !== courseId) return null;
  return entry;
}

/** Tous les chapitres chargés. */
export function getAllChapters() {
  return [...cache.chapters.values()];
}

export function getCoursesByDomain(domainId) {
  return getCourses().filter((c) => c.domain === domainId);
}
