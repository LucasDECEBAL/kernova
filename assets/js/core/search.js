// Recherche client : cours, chapitres, fiches mémo, flashcards, projets et domaines.
// Insensible à la casse et aux accents. Tous les mots saisis doivent être présents.

import { normalize } from './utils.js';

const cache = new Map(); // chapterId -> texte indexé

/** Extrait le texte brut d'un chapitre pour l'indexation. */
function chapterText(chapter) {
  const parts = [];
  for (const block of chapter.content || []) {
    if (block.text) parts.push(block.text);
    if (block.items) parts.push(...block.items);
    if (block.code) parts.push(block.code);
    if (block.headers) parts.push(block.headers.join(' '));
    if (block.rows) parts.push(block.rows.map((r) => r.join(' ')).join(' '));
  }
  if (chapter.exercise) parts.push(chapter.exercise.instructions, chapter.exercise.title);
  return parts.join(' \n ').replace(/[`*]/g, '');
}

function indexedChapter(chapter) {
  if (!cache.has(chapter.id)) {
    cache.set(chapter.id, normalize(`${chapter.title} ${chapterText(chapter)}`));
  }
  return cache.get(chapter.id);
}

/**
 * @param {string} query
 * @param {{ courses?: object[], domains?: object[], sheets?: object[], packs?: object[], projects?: object[] }} data
 */
export function search(query, data = {}) {
  const { courses = [], domains = [], sheets = [], packs = [], projects = [] } = data;
  const tokens = normalize(query).split(' ').filter(Boolean);
  const empty = { courses: [], chapters: [], sheets: [], packs: [], projects: [], domains: [], total: 0 };
  if (!tokens.length) return empty;

  const matchAll = (text) => tokens.every((t) => text.includes(t));
  const scoreOf = (text, weightTitle = 10, weightBody = 3) => tokens.reduce(
    (sum, t) => sum + (text.includes(t) ? weightBody : 0), 0
  ) + (matchAll(text) ? weightTitle : 0);
  const domainName = (id) => normalize(domains.find((d) => d.id === id)?.name || '');

  const courseHits = [];
  const chapterHits = [];

  for (const course of courses) {
    const titleText = normalize(course.title);
    const meta = normalize([course.description, (course.technologies || []).join(' '), domainName(course.domain)].join(' '));
    if (matchAll(`${titleText} ${meta}`)) {
      courseHits.push({ course, score: scoreOf(`${titleText} ${meta}`) });
    }
    for (const chapter of course.chapters) {
      const text = indexedChapter(chapter);
      if (matchAll(text)) {
        const titleHit = normalize(chapter.title);
        const s = tokens.reduce((acc, t) => acc + (titleHit.includes(t) ? 8 : 1), 0);
        chapterHits.push({ course, chapter, score: s });
      }
    }
  }

  const sheetHits = [];
  for (const sheet of sheets) {
    const meta = normalize([sheet.title, sheet.description, sheet.category].join(' '));
    const metaMatch = matchAll(meta);
    const entries = (sheet.entries || []).filter((entry) =>
      matchAll(normalize([entry.command, entry.description, entry.warning, entry.example].join(' '))));
    if (metaMatch || entries.length) {
      sheetHits.push({ sheet, entries: metaMatch ? sheet.entries : entries, score: scoreOf(meta, 10, 4) + entries.length });
    }
  }

  const packHits = [];
  for (const pack of packs) {
    const meta = normalize([pack.title, pack.description].join(' '));
    const metaMatch = matchAll(meta);
    const cards = (pack.cards || []).filter((card) => matchAll(normalize(`${card.q} ${card.a}`)));
    if (metaMatch || cards.length) {
      packHits.push({ pack, cards: metaMatch ? pack.cards : cards, score: scoreOf(meta, 8, 3) + cards.length });
    }
  }

  const projectHits = [];
  for (const course of courses) {
    if (!course.project) continue;
    const text = normalize([
      course.project.title, course.project.brief, course.title,
      ...(course.project.steps || []), ...(course.project.criteria || []),
      ...(course.skills || [])
    ].join(' '));
    if (matchAll(text)) {
      projectHits.push({ course, project: course.project, score: scoreOf(text, 10, 2) });
    }
  }

  const domainHits = domains
    .map((domain) => {
      const text = normalize(`${domain.name} ${domain.description}`);
      return { domain, score: scoreOf(text, 6, 2), match: matchAll(text) };
    })
    .filter((item) => item.match)
    .sort((a, b) => b.score - a.score);

  courseHits.sort((a, b) => b.score - a.score);
  chapterHits.sort((a, b) => b.score - a.score);
  sheetHits.sort((a, b) => b.score - a.score);
  packHits.sort((a, b) => b.score - a.score);
  projectHits.sort((a, b) => b.score - a.score);

  const total = courseHits.length + chapterHits.length + sheetHits.length
    + packHits.length + projectHits.length + domainHits.length;

  return { courses: courseHits, chapters: chapterHits, sheets: sheetHits, packs: packHits, projects: projectHits, domains: domainHits, total };
}

/** Met en évidence les mots recherchés : renvoie des segments { text, hit }. */
export function highlightSegments(text, query) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [{ text, hit: false }];
  const source = String(text);
  const lower = source.toLowerCase();
  const ranges = [];
  for (const token of tokens) {
    let index = lower.indexOf(token);
    if (index < 0) index = normalize(source).indexOf(token);
    if (index >= 0) ranges.push([index, index + token.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const segments = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start < pos) continue;
    if (start > pos) segments.push({ text: source.slice(pos, start), hit: false });
    segments.push({ text: source.slice(start, end), hit: true });
    pos = end;
  }
  if (pos < source.length) segments.push({ text: source.slice(pos), hit: false });
  return segments;
}
