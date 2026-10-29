// Chargement et validation des contenus JSON locaux (catalogue + leçons).

const cache = {
  catalog: null,
  courses: new Map(),   // id -> cours complet (avec chapitres)
  chapters: new Map(),  // chapterId -> { course, chapter, index }
  issues: []
};

async function fetchJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-cache' });
  } catch {
    throw new Error(`Impossible de charger ${path}. Vérifiez que le site est servi par un serveur statique.`);
  }
  if (!res.ok) throw new Error(`Fichier introuvable : ${path} (HTTP ${res.status}).`);
  return res.json();
}

const isStr = (v) => typeof v === 'string' && v.length > 0;

/** Exercices et quiz d'un cours, indexés par identifiant de chapitre. Absence = pas d'exercices séparés. */
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

/** Charge catalogue et leçons. Un cours invalide est ignoré et signalé. */
export async function loadData() {
  if (cache.catalog) return cache.catalog;
  const catalog = await fetchJson('data/catalog.json');
  if (!Array.isArray(catalog.domains) || !Array.isArray(catalog.courses)) {
    throw new Error('Le catalogue est mal formé (domains/courses manquants).');
  }

  for (const meta of catalog.courses) {
    try {
      const lessons = await fetchJson(`data/lessons/${meta.file}`);
      // Format à plat (chapters) ou regroupé par modules (modules[].chapters)
      // Exercices et quiz peuvent être dans un fichier séparé (data/exercises/<cours>.json)
      const extra = await fetchExtra(meta.id);
      const withExtra = (ch) => {
        const x = extra[ch.id] || {};
        return { ...ch, exercise: ch.exercise ?? x.exercise, quiz: ch.quiz ?? x.quiz ?? [] };
      };
      const raw = Array.isArray(lessons.modules)
        ? lessons.modules.flatMap((m) => (m.chapters || []).map((ch) => withExtra({ ...ch, module: m.title, moduleId: m.id })))
        : (lessons.chapters || []).map(withExtra);
      if (lessons.courseId !== meta.id || !raw.length) {
        throw new Error('identifiant de cours ou chapitres incohérents');
      }
      const chapters = raw.filter((ch) => {
        const ok = validateChapter(ch);
        if (!ok) cache.issues.push(`${meta.id} : chapitre ignoré (structure invalide)`);
        return ok;
      });
      const seen = new Set();
      for (const ch of chapters) {
        if (seen.has(ch.id) || cache.chapters.has(ch.id)) cache.issues.push(`${meta.id} : identifiant de chapitre en double (${ch.id})`);
        seen.add(ch.id);
      }
      const course = {
        ...meta,
        project: lessons.project || null,
        prerequisiteCourses: meta.prerequisiteCourses || [],
        nextCourses: meta.nextCourses || [],
        skills: meta.skills || [],
        duration: chapters.reduce((sum, ch) => sum + (Number(ch.duration) || 0), 0),
        chapters: chapters.map((ch, index) => ({ ...ch, index, courseId: meta.id, duration: Number(ch.duration) || 0, module: ch.module || null }))
      };
      cache.courses.set(course.id, course);
      course.chapters.forEach((ch) => cache.chapters.set(ch.id, { course, chapter: ch, index: ch.index }));
    } catch (err) {
      cache.issues.push(`${meta.id} : ${err.message}`);
      console.warn(`kernova : cours ignoré (${meta.id})`, err);
    }
  }

  // Paquets de cartes mémo : optionnels, un échec ne bloque pas l'application
  try {
    const packs = [];
    for (const file of ['data/flashcards.json', 'data/flashcards-extra.json']) {
      try {
        const flash = await fetchJson(file);
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
    const pg = await fetchJson('data/playground.json');
    cache.playground = Array.isArray(pg.examples)
      ? pg.examples.filter((e) => isStr(e.id) && typeof e.html === 'string' && typeof e.js === 'string')
      : [];
  } catch (err) {
    cache.issues.push(`playground : ${err.message}`);
    cache.playground = [];
  }

  // Scénarios du terminal simulé : optionnels
  try {
    const term = await fetchJson('data/terminal.json');
    cache.terminal = Array.isArray(term.scenarios)
      ? term.scenarios.filter((s) => isStr(s.id) && Array.isArray(s.objectives) && s.objectives.length)
      : [];
  } catch (err) {
    cache.issues.push(`terminal : ${err.message}`);
    cache.terminal = [];
  }

  // Simulateur réseau : topologie et scénarios
  try {
    const net = await fetchJson('data/network.json');
    const ok = net && net.seed && Array.isArray(net.seed.devices) && Array.isArray(net.scenarios);
    cache.network = ok ? net : null;
  } catch (err) {
    cache.issues.push(`réseau : ${err.message}`);
    cache.network = null;
  }

  // Fiches mémo
  try {
    const sheets = await fetchJson('data/cheatsheets.json');
    cache.cheatsheets = Array.isArray(sheets.sheets)
      ? sheets.sheets.filter((s) => isStr(s.id) && isStr(s.title) && Array.isArray(s.entries))
      : [];
  } catch (err) {
    cache.issues.push(`fiches mémo : ${err.message}`);
    cache.cheatsheets = [];
  }

  // Exemples d'exécution Python et SQL
  try {
    const exec = await fetchJson('data/execution.json');
    cache.execution = exec && exec.python && exec.sql ? exec : null;
  } catch (err) {
    cache.issues.push(`exécution : ${err.message}`);
    cache.execution = null;
  }

  // Atelier d'éditeurs : validation pédagogique, sans compilation ni exécution
  try {
    const editors = await fetchJson('data/editors.json');
    cache.editors = editors && Array.isArray(editors.languages)
      ? editors.languages.filter((l) => isStr(l.id) && isStr(l.name) && Array.isArray(l.exercises))
      : [];
  } catch (err) {
    cache.issues.push(`éditeurs : ${err.message}`);
    cache.editors = [];
  }

  // Compléments de projets : fichiers de départ et indices
  try {
    const extra = await fetchJson('data/projects-extra.json');
    cache.projectExtras = extra && typeof extra === 'object' ? extra : {};
  } catch {
    cache.projectExtras = {};
  }

  cache.catalog = catalog;
  return catalog;
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

/** Tous les cours chargés et valides, dans l'ordre du catalogue. */
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

/** Tous les quiz d'un cours, avec référence au chapitre. */
export function getAllChapters() {
  return [...cache.chapters.values()];
}

export function getCoursesByDomain(domainId) {
  return getCourses().filter((c) => c.domain === domainId);
}
