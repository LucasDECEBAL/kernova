// Accueil : un extrait réel de leçon en guise de présentation, puis des sections à marge.

import { h, emptyState , setChildren } from '../core/dom.js';
import { getCourses, getDomains, getCoursesByDomain } from '../core/data.js';
import { get } from '../core/store.js';
import { courseProgress, resumeChapter } from '../core/progress.js';
import { courseCard } from '../components/widgets.js';
import { formatDuration } from '../core/utils.js';

/** Extrait de la leçon « Naviguer dans les dossiers » (linux-03), mis en forme comme une session. */
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

const FEATURES = [
  { title: 'Parcours guidés', text: 'Chaque chapitre se débloque lorsque le précédent est validé. Un arbre de compétences montre où vous en êtes.' },
  { title: 'Quiz corrigés', text: 'QCM, vrai ou faux, texte à trous, classement et association. Chaque erreur est expliquée.' },
  { title: 'Notes par chapitre', text: 'Une zone de notes sous chaque leçon, enregistrée dans votre navigateur.' },
  { title: 'Recherche globale', text: 'Titres, objectifs et contenu des chapitres sont indexés. Les accents et la casse sont ignorés.' },
  { title: 'Données à vous', text: 'Exportez, importez ou effacez vos données en JSON. Aucun compte, aucun serveur.' }
];

function sessionBlock() {
  return h('div', {},
    h('pre', { class: 'session', 'aria-label': 'Extrait de session dans un terminal' },
      SESSION.map((line, i) => h('span', {
        class: `line${line.out ? ' out' : ''}${line.now ? ' now' : ''}`,
        style: `--i:${i}`
      }, line.prompt ? [h('span', { class: 'prompt' }, line.prompt), line.text] : line.out))
    ),
    h('p', { class: 'session-caption' },
      'Extrait de la leçon « Naviguer dans les dossiers ». Les sorties sont des exemples.')
  );
}

export function renderHomePage({ outlet }) {
  const courses = getCourses();
  const domains = getDomains();
  const state = get();

  const featured = courses[0] || null;
  const resume = featured ? resumeChapter(featured, state) : null;
  const started = featured ? courseProgress(featured, state).started : false;
  const primaryHref = resume ? `#/cours/${featured.id}/${resume.id}` : '#/catalogue';
  const primaryLabel = started ? 'Reprendre le parcours' : 'Commencer le parcours';

  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('div', {},
      h('h1', { id: 'hero-title', tabindex: '-1', text: 'Apprenez l’informatique en tapant les commandes.' }),
      h('p', { class: 'lead', text: 'Des leçons courtes, des exercices corrigés et un suivi qui reste sur votre appareil. Vous lisez, vous testez, vous vérifiez.' }),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn btn-primary', href: primaryHref }, primaryLabel),
        h('a', { class: 'btn btn-ghost', href: '#/catalogue' }, 'Parcourir le catalogue')
      )
    ),
    sessionBlock()
  );

  const domainsSection = h('section', { class: 'section', 'aria-labelledby': 'domains-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'domains-title', text: 'Domaines' }),
      h('p', { text: 'Les domaines sans cours publié sont indiqués. Leur contenu n\'est pas encore écrit.' }),
      h('a', { class: 'btn btn-small', href: '#/domaines' }, 'Tous les domaines')
    ),
    h('ul', { class: 'index-grid', style: 'list-style:none;padding:0;margin:0' },
      domains.slice(0, 12).map((d) => {
        const count = getCoursesByDomain(d.id).length;
        return h('li', { class: 'index-item' },
          h('a', { href: `#/domaines/${d.id}` }, h('span', { class: 'index-name', text: d.name })),
          h('span', { class: 'small muted', text: count ? `${count} cours publié${count > 1 ? 's' : ''}` : 'Contenu à venir' })
        );
      })
    )
  );

  const tracksSection = h('section', { class: 'section', 'aria-labelledby': 'tracks-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'tracks-title', text: 'Parcours' }),
      h('p', { text: 'Un parcours est une suite de chapitres. Chacun prépare le suivant.' }),
      h('div', { class: 'row', style: 'gap:var(--s3);margin-top:var(--s3)' },
        h('a', { class: 'btn btn-small', href: '#/parcours' }, 'Voir les parcours'),
        h('a', { class: 'btn btn-ghost btn-small', href: '#/catalogue' }, 'Tout le catalogue'))
    ),
    courses.length
      ? h('div', { class: 'grid-cards' }, courses.slice(0, 3).map(courseCard))
      : emptyState({ icon: 'book', title: 'Aucun parcours chargé', text: 'Le catalogue est vide ou n\'a pas pu être chargé.' })
  );

  const exercises = [];
  for (const course of courses) {
    for (const ch of course.chapters) {
      if (ch.quiz?.length) exercises.push({ course, ch });
    }
  }
  const exercisesSection = h('section', { class: 'section', 'aria-labelledby': 'exercises-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'exercises-title', text: 'Exercices' }),
      h('p', { text: 'Chaque quiz porte sur un chapitre. Les réponses sont corrigées immédiatement, avec une explication.' })
    ),
    exercises.length
      ? h('div', { class: 'grid-cards' }, exercises.slice(0, 6).map(({ course, ch }) => h('article', { class: 'card' },
        h('h3', {}, h('a', { href: `#/quiz/${course.id}/${ch.id}`, class: 'card-title-link' }, ch.title)),
        h('div', { class: 'meta' },
          h('span', { text: course.title }),
          h('span', { text: `Chapitre ${ch.index + 1}` }),
          h('span', { text: `${ch.quiz.length} question${ch.quiz.length > 1 ? 's' : ''}` }),
          h('span', { text: formatDuration(ch.duration) })
        )
      )))
      : emptyState({ icon: 'check', title: 'Pas encore d\'exercices', text: 'Les quiz apparaîtront ici dès qu\'un chapitre en contient.' })
  );

  const featuresSection = h('section', { class: 'section', 'aria-labelledby': 'features-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'features-title', text: 'Fonctions' }),
      h('p', { text: 'Ce qui est disponible dans cette version, sans fonction annoncée à l\'avance.' })
    ),
    h('div', { class: 'index-grid' }, FEATURES.map((f) => h('div', { class: 'index-item index-item-wide' },
      h('h3', { text: f.title }),
      h('p', { class: 'muted small', style: 'margin:0', text: f.text })
    )))
  );

  const startedRows = courses.map((c) => ({ course: c, ...courseProgress(c, state) })).filter((r) => r.started);
  const progressSection = h('section', { class: 'section', 'aria-labelledby': 'progress-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'progress-title', text: 'Progression' }),
      h('p', { text: 'Calculée sur cet appareil. Rien n\'est envoyé ailleurs.' }),
      h('a', { class: 'btn btn-small', href: '#/tableau-de-bord' }, 'Tableau de bord')
    ),
    startedRows.length
      ? h('div', { class: 'grid-cards' }, startedRows.map((r) => h('article', { class: 'card' },
        h('h3', {}, h('a', { href: `#/cours/${r.course.id}`, text: r.course.title })),
        h('p', { class: 'small muted', style: 'margin:0 0 var(--space-2)', text: `${r.done} chapitre${r.done > 1 ? 's' : ''} sur ${r.total} terminé${r.done > 1 ? 's' : ''}` }),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': r.percent, 'aria-label': `Progression de ${r.course.title}` },
          h('div', { class: 'progress-bar', style: `width:${r.percent}%` }))
      )))
      : emptyState({
        icon: 'chart',
        title: 'Votre progression apparaîtra ici',
        text: 'Terminez un chapitre pour voir vos statistiques.',
        actions: [h('a', { class: 'btn btn-primary', href: primaryHref }, primaryLabel)]
      })
  );

  setChildren(outlet, h('div', { class: 'container page', style: 'padding-top:0' },
    hero,
    domainsSection,
    tracksSection,
    exercisesSection,
    featuresSection,
    progressSection
  ));
  return undefined;
}
