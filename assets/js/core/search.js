// Recherche client : catalogue, cours et chapitres (titres, objectifs, contenu).
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
 * @param {{ courses: object[], domains: object[] }} data
 * @returns {{ courses: object[], chapters: object[], total: number }}
 */
export function search(query, { courses, domains }) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return { courses: [], chapters: [], total: 0 };

  const matchAll = (text) => tokens.every((t) => text.includes(t));
  const domainName = (id) => normalize(domains.find((d) => d.id === id)?.name || '');

  const courseHits = [];
  const chapterHits = [];

  for (const course of courses) {
    const titleText = normalize(course.title);
    const meta = normalize([course.description, (course.technologies || []).join(' '), domainName(course.domain)].join(' '));
    const score =
      tokens.reduce((s, t) => s + (titleText.includes(t) ? 10 : 0) + (meta.includes(t) ? 3 : 0), 0);
    if (matchAll(`${titleText} ${meta}`)) courseHits.push({ course, score });

    for (const chapter of course.chapters) {
      const text = indexedChapter(chapter);
      if (matchAll(text)) {
        const titleHit = normalize(chapter.title);
        const s = tokens.reduce((acc, t) => acc + (titleHit.includes(t) ? 8 : 1), 0);
        chapterHits.push({ course, chapter, score: s });
      }
    }
  }

  courseHits.sort((a, b) => b.score - a.score);
  chapterHits.sort((a, b) => b.score - a.score);
  return {
    courses: courseHits,
    chapters: chapterHits,
    total: courseHits.length + chapterHits.length
  };
}

/** Met en évidence les mots recherchés : renvoie des segments { text, hit }. */
export function highlightSegments(text, query) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [{ text, hit: false }];
  const source = String(text);
  const folded = normalize(source);
  // Recherche simple dans la version originale (même longueur si pas de caractère combinant).
  const segments = [];
  let pos = 0;
  const lower = source.toLowerCase();
  const ranges = [];
  for (const t of tokens) {
    let i = lower.indexOf(t);
    if (i < 0 && folded.includes(t)) i = -1;
    if (i >= 0) ranges.push([i, i + t.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    if (s > pos) segments.push({ text: source.slice(pos, s), hit: false });
    segments.push({ text: source.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < source.length) segments.push({ text: source.slice(pos), hit: false });
  return segments;
}
