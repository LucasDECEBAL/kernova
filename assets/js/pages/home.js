// Accueil : la promesse, une leçon réelle, les chiffres, puis trois entrées (reprendre, domaines, outils).

import { h, icon, setChildren } from '../core/dom.js';
import { getCourses, getCourse, getDomains, getCoursesByDomain } from '../core/data.js';
import { get } from '../core/store.js';
import { courseProgress } from '../core/progress.js';
import { LEVELS } from '../core/utils.js';

/** Extrait de la leçon « Naviguer dans les dossiers » (linux-03), rendu comme une vraie session. */
const SESSION = [
  { prompt: '$ ', text: 'pwd' },
  { out: '/home/alice' },
  { prompt: '$ ', text: 'cd /etc' },
  { prompt: '$ ', text: 'pwd' },
  { out: '/etc', now: true },
  { prompt: '$ ', text: 'cd ~' },
  { prompt: '$ ', text: 'pwd' },
  { out: '/home/alice' }
];

const TOOLS = [
  { title: 'Terminal Linux', icon: 'list', text: 'Système de fichiers virtuel, six scénarios, objectifs vérifiés.', href: '#/terminal' },
  { title: 'Simulateur réseau', icon: 'grid', text: 'Adresser, router, filtrer : les paquets circulent à l\'écran.', href: '#/reseau' },
  { title: 'Python et SQL', icon: 'play', text: 'Du code réellement exécuté, avec une base de démonstration.', href: '#/execution' },
  { title: 'Éditeurs de code', icon: 'code', text: 'C, C++, Go, Java et PHP : écrire, vérifier, comparer.', href: '#/editeurs' }
];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Petit constructeur SVG : uniquement des attributs constants, aucun contenu utilisateur. */
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children.flat()) if (child !== null && child !== undefined) el.append(child);
  return el;
}

/** Schéma d'un petit réseau : deux postes, un commutateur, un pare-feu, un serveur. */
function topologyDiagram() {
  const boxes = [
    ['WEB', 8, 8], ['FW', 84, 8],
    ['PC', 8, 84], ['SW', 84, 84], ['SRV', 160, 84]
  ];
  return h('div', { class: 'topology', 'aria-hidden': 'true' },
    s('svg', { viewBox: '0 0 220 118', role: 'presentation' },
      s('path', { class: 'topo-link', d: 'M60 19 H84' }),
      s('path', { class: 'topo-link', d: 'M110 30 V84' }),
      s('path', { class: 'topo-link', d: 'M60 95 H160' }),
      boxes.map(([label, x, y]) => s('g', { class: 'topo-node' },
        s('rect', { x, y, width: 52, height: 22 }),
        s('text', { x: x + 26, y: y + 15, 'text-anchor': 'middle' }, label))),
      s('circle', { class: 'topo-packet', r: 2.5, cx: 60, cy: 95 },
        s('animateMotion', { dur: '3.2s', repeatCount: 'indefinite', path: 'M60 95 H160' }))
    )
  );
}

/** Densité du catalogue par domaine : 34 barres, une par domaine. */
function domainMeter(domains) {
  const counts = domains.map((d) => getCoursesByDomain(d.id).length);
  const max = Math.max(1, ...counts);
  return h('div', { class: 'domain-meter', 'aria-hidden': 'true' },
    counts.map((n, i) => h('i', {
      style: `height:${Math.max(8, Math.round((n / max) * 100))}%;--i:${i}`,
      title: `${domains[i].name} : ${n} cours`
    }))
  );
}

function sessionBlock() {
  return h('pre', { class: 'session', 'aria-label': 'Extrait de session dans un terminal' },
    SESSION.map((line, i) => h('span', {
      class: `line${line.out ? ' out' : ''}${line.now ? ' now' : ''}`,
      style: `--i:${i}`
    }, line.prompt ? [h('span', { class: 'prompt' }, line.prompt), line.text] : line.out)),
    h('span', { class: 'line', style: `--i:${SESSION.length}` },
      h('span', { class: 'prompt' }, '$ '),
      h('span', { class: 'caret' }))
  );
}

function fact(label, value) {
  return h('div', {}, h('dt', { text: label }), h('dd', { text: String(value) }));
}

/** Trois portes d'entrée, une par domaine, plutôt que les trois premiers cours du catalogue. */
function pickCourses(courses) {
  const wanted = ['linux-debutant', 'algorithmique-debutant', 'python-debutant'];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const picked = wanted.map((id) => byId.get(id)).filter(Boolean);
  for (const course of courses) {
    if (picked.length >= 3) break;
    if (!picked.includes(course)) picked.push(course);
  }
  return picked.slice(0, 3);
}

export function renderHomePage({ outlet }) {
  const courses = getCourses();
  const domains = getDomains();
  const state = get();

  const lessons = courses.reduce((n, c) => n + (c.chaptersCount || c.chapters?.length || 0), 0);

  const featured = courses[0] || null;
  const recent = state.recent?.[0];
  const recentCourse = recent ? getCourse(recent.courseId) : null;
  const primaryHref = recent && recentCourse
    ? `#/cours/${recent.courseId}/${recent.chapterId}`
    : featured ? `#/cours/${featured.id}` : '#/catalogue';
  const primaryLabel = recent && recentCourse ? 'Reprendre la leçon' : 'Commencer le parcours';

  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('div', { class: 'hero-copy' },
      h('p', { class: 'kicker' }, 'Apprendre l\'informatique · 34 domaines'),
      h('h1', { id: 'hero-title', tabindex: '-1', text: 'Apprenez l\'informatique en tapant les commandes.' }),
      h('p', { class: 'lead', text: 'Des leçons courtes, des exercices corrigés et un suivi qui reste sur votre appareil. Vous lisez, vous testez, vous vérifiez.' }),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn btn-primary', href: primaryHref }, primaryLabel),
        h('a', { class: 'btn', href: '#/catalogue' }, 'Parcourir le catalogue')
      ),
      h('dl', { class: 'hero-facts' },
        fact('cours', courses.length),
        fact('leçons', lessons),
        fact('domaines', domains.length)
      )
    ),
    h('div', { class: 'hero-visual' },
      h('div', { class: 'terminal-window' },
        h('div', { class: 'terminal-bar' },
          h('span', {}, 'kernova — terminal'),
          h('span', {}, 'leçon 02 · navigation')),
        sessionBlock()
      )
    )
  );

  const startedRows = courses
    .map((c) => ({ course: c, ...courseProgress(c, state) }))
    .filter((r) => r.started && !r.finished)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);

  const resumeSection = startedRows.length
    ? h('section', { class: 'section', 'aria-labelledby': 'resume-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'resume-title', text: 'Reprendre' }),
        h('p', { text: 'Vos cours en suspens, du plus avancé au moins avancé.' }),
        h('a', { class: 'btn', href: '#/tableau-de-bord' }, 'Tableau de bord')
      ),
      h('ul', { class: 'resume-list' },
        startedRows.map(({ course, done, total, percent }) => h('li', {},
          h('a', { href: `#/cours/${course.id}` },
            h('span', { class: 'resume-main' },
              h('span', { class: 'resume-title', text: course.title }),
              h('span', { class: 'resume-meta', text: `${done} / ${total} chapitres` })),
            h('span', { class: 'resume-pct', text: `${percent} %` }))
        )))
      )
    : null;

  const domainsSection = h('section', { class: 'section', 'aria-labelledby': 'domains-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'domains-title', text: 'Domaines' }),
      h('p', { text: 'Du matériel à l\'IA, en passant par les réseaux et le cloud.' }),
      domainMeter(domains),
      h('a', { class: 'btn', href: '#/domaines' }, 'Tous les domaines')
    ),
    h('ul', { class: 'index-grid', style: 'list-style:none;padding:0;margin:0' },
      domains.slice(0, 12).map((d) => {
        const count = getCoursesByDomain(d.id).length;
        return h('li', { class: 'index-item' },
          h('a', { href: `#/domaines/${d.id}` }, h('span', { class: 'index-name', text: d.name })),
          h('span', { class: 'small muted', text: `${count} cours` })
        );
      })
    )
  );

  const picksSection = h('section', { class: 'section', 'aria-labelledby': 'picks-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'picks-title', text: 'Commencer par' }),
      h('p', { text: 'Trois parcours qui préparent tous les autres.' }),
      h('a', { class: 'btn', href: '#/parcours' }, 'Voir les parcours')
    ),
    h('ul', { class: 'pick-list' },
      pickCourses(courses).map((course, i) => h('li', {},
        h('a', { href: `#/cours/${course.id}` },
          h('span', { class: 'pick-index', text: String(i + 1).padStart(2, '0') }),
          h('span', { class: 'pick-main' },
            h('span', { class: 'pick-title', text: course.title }),
            h('span', { class: 'pick-meta', text: `${LEVELS[course.level]?.label || course.level} · ${course.chaptersCount || course.chapters?.length || 0} chapitres` })),
          h('span', { class: 'pick-arrow', 'aria-hidden': 'true' }, '→'))
      )))
  );

  const toolsSection = h('section', { class: 'section', 'aria-labelledby': 'tools-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'tools-title', text: 'Le labo' }),
      h('p', { text: 'Quatre outils qui tournent dans le navigateur, sans compte.' }),
      topologyDiagram(),
      h('a', { class: 'btn', href: '#/labo' }, 'Ouvrir le labo')
    ),
    h('div', {},
      h('ul', { class: 'tool-list' },
        TOOLS.map((tool) => h('li', {},
          h('a', { href: tool.href },
            h('span', { class: 'pick-icon' }, icon(tool.icon, { size: 16 })),
            h('span', { class: 'pick-main' },
              h('span', { class: 'pick-title', text: tool.title }),
              h('span', { class: 'pick-meta', text: tool.text })),
            h('span', { class: 'pick-arrow', 'aria-hidden': 'true' }, '↗'))
        ))),
      h('p', { class: 'tool-note' },
        'Réviser : ',
        h('a', { href: '#/fiches' }, 'fiches mémo'),
        h('span', { 'aria-hidden': 'true' }, ' · '),
        h('a', { href: '#/cartes' }, 'cartes mémo')))
  );

  setChildren(outlet, h('div', { class: 'container page', style: 'padding-top:0' },
    hero,
    resumeSection,
    domainsSection,
    picksSection,
    toolsSection
  ));
  return undefined;
}
