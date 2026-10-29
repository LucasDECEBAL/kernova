// Labo : point d'entrée des outils interactifs.

import { h, icon } from '../core/dom.js';

const TOOLS = [
  {
    href: '#/playground',
    icon: 'play',
    title: 'Playground web',
    text: 'Écrire du HTML, du CSS et du JavaScript, exécuter le code dans une iframe isolée et lire la console.'
  },
  {
    href: '#/terminal',
    icon: 'list',
    title: 'Terminal Linux',
    text: 'S\'entraîner sur un système de fichiers virtuel, avec six scénarios progressifs et des objectifs vérifiés.'
  },
  {
    href: '#/reseau',
    icon: 'grid',
    title: 'Simulateur réseau',
    text: 'Adresser des appareils, tester la joignabilité, régler un pare-feu et calculer des sous-réseaux.'
  },
  {
    href: '#/fiches',
    icon: 'book',
    title: 'Fiches mémo',
    text: 'Commandes et extraits vérifiés par technologie, avec recherche, copie et impression.'
  },
  {
    href: '#/execution',
    icon: 'play',
    title: 'Python et SQL',
    text: 'Exécuter réellement du Python (Pyodide) et du SQL (SQLite WebAssembly), avec une base de démonstration.'
  },
  {
    href: '#/editeurs',
    icon: 'code',
    title: 'Éditeurs de code',
    text: 'C, C++, Go, Rust, Java et PHP : écrire du code et vérifier sa structure, sans compilation ni exécution.'
  }
];

export function renderLaboPage({ outlet }) {
  outlet.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1', text: 'Labo' }),
      h('p', { text: 'Des outils qui fonctionnent entièrement dans le navigateur. Chacun indique clairement ses limites.' })),
    h('div', { class: 'grid-cards' }, TOOLS.map((tool) => h('article', { class: 'course-row' },
      h('div', { class: 'course-main' },
        h('div', { class: 'row', style: 'gap:8px' }, icon(tool.icon, { size: 18 }), h('span', { class: 'small muted', text: 'Outil' })),
        h('h2', { style: 'font-size:1.4rem;margin:var(--s1) 0 var(--s2)' }, h('a', { href: tool.href, text: tool.title })),
        h('p', { class: 'small muted', style: 'margin:0', text: tool.text })),
      h('div', { class: 'course-actions' },
        h('a', { class: 'btn btn-primary btn-small', href: tool.href }, 'Ouvrir'))
    )))
  ));
  return undefined;
}
