// Tableau de bord : statistiques calculées uniquement à partir de l'activité locale.

import { h, icon, progressBar, emptyState , setChildren } from '../core/dom.js';
import { getCourses, getAllChapters, ensureAllCourses } from '../core/data.js';
import { get } from '../core/store.js';
import { setDailyGoal } from '../core/progress.js';
import { computeStats, PASS_PERCENT } from '../core/stats.js';
import { formatDuration, localDay } from '../core/utils.js';
import { toast } from '../core/ui.js';
import { statusBadge } from '../components/widgets.js';

export async function renderDashboardPage({ outlet }) {
  await ensureAllCourses();
  const courses = getCourses();
  const state = get();
  const findChapter = (chapterId) => getAllChapters().find((e) => e.chapter.id === chapterId) || null;
  const stats = computeStats(state, courses, findChapter, localDay());

  if (!stats.hasActivity) {
    setChildren(outlet, h('div', { class: 'page' },
      pageHead(),
      emptyState({
        icon: 'chart',
        title: 'Aucune activité pour le moment',
        text: 'Votre tableau de bord se remplira dès que vous consulterez un chapitre, terminerez une leçon ou passerez un quiz.',
        actions: [
          h('a', { class: 'btn btn-primary', href: '#/cours/linux-debutant' }, 'Commencer le parcours Linux'),
          h('a', { class: 'btn', href: '#/catalogue' }, 'Parcourir le catalogue')
        ]
      })
    ));
    return undefined;
  }

  const kpi = (value, label) => h('div', { class: 'card' }, h('strong', {}, value), h('span', {}, label));

  const goalPct = Math.min(100, Math.round((stats.todayCount / stats.goal) * 100));
  const goalSelect = h('select', {
    id: 'daily-goal',
    'aria-label': 'Objectif quotidien',
    onChange: (e) => {
      setDailyGoal(Number(e.target.value));
      toast('Objectif quotidien mis à jour.', 'success', 2000);
      renderDashboardPage({ outlet });
    }
  }, Array.from({ length: 10 }, (_, i) => i + 1).map((n) => h('option', { value: String(n), selected: n === stats.goal }, `${n} ${n > 1 ? 'actions' : 'action'} par jour`)));

  const maxCount = Math.max(1, ...stats.last14.map((d) => d.count));
  const bars = h('div', { class: 'bars', role: 'img', 'aria-label': `Activité des 14 derniers jours : ${stats.last14.map((d) => d.count).join(', ')} actions` },
    stats.last14.map((d) => {
      const bar = h('div', { class: 'bar', title: `${d.day} : ${d.count}` });
      bar.style.height = `${Math.max(d.count ? 8 : 2, Math.round((d.count / maxCount) * 100))}%`;
      if (!d.count) bar.dataset.zero = '';
      return bar;
    }));
  const barLabels = h('div', { class: 'bars-labels', 'aria-hidden': 'true' }, stats.last14.map((d, i) => h('span', {}, i % 2 === 0 ? d.day.slice(8) : '')));

  const calendar = h('div', { class: 'calendar', role: 'img', 'aria-label': 'Calendrier des 35 derniers jours' },
    stats.calendar.map((d) => h('div', {
      class: 'day',
      title: `${d.day} : ${d.count} action(s)`,
      'data-level': d.level,
      'data-today': d.today ? '' : null
    })));

  const badgesGrid = h('div', { class: 'badges-grid' }, stats.badges.map((b) => h('div', { class: 'card badge-card', 'data-earned': String(b.earned) },
    h('span', { class: 'medal', 'aria-hidden': 'true' }, icon(b.earned ? 'star' : 'lock', { size: 18 })),
    h('div', {}, h('strong', {}, b.title), h('p', { class: 'small muted', style: 'margin:0' }, b.earned ? b.text : `À débloquer : ${b.text}`))
  )));

  const courseRows = stats.perCourse.map((p) => h('li', {},
    h('a', { href: `#/cours/${p.course.id}`, style: 'font-weight:600' }, p.course.title),
    h('span', { class: 'small muted' }, `${p.done}/${p.total}, ${p.finished ? 'terminé' : p.started ? 'en cours' : 'non commencé'}`)));

  const scoreRows = stats.recentScores.length
    ? h('ul', { class: 'list-plain' }, stats.recentScores.map((r) => h('li', {},
      h('span', {}, `${r.title}, ${r.date}`),
      h('strong', { style: r.percent >= PASS_PERCENT ? 'color:var(--ok)' : 'color:var(--warn)' }, `${r.score}/${r.total} (${r.percent} %)`))))
    : h('p', { class: 'muted small' }, 'Aucun quiz terminé.');

  const skillRows = stats.skills.length
    ? h('ul', { class: 'list-plain' }, stats.skills.slice(0, 10).map((s) => h('li', {},
      h('a', { href: `#/cours/${s.course.id}/${s.chapter.id}` }, s.chapter.title),
      h('span', { class: 'small muted' }, s.day))))
    : h('p', { class: 'muted small' }, 'Aucun chapitre terminé.');

  const activityRows = stats.recentActivity.length
    ? h('ul', { class: 'list-plain' }, stats.recentActivity.map((a) => h('li', {},
      h('span', {}, `${a.label} : ${a.chapter ? a.chapter.title : a.course?.title || a.title}`),
      h('span', { class: 'small muted' }, a.day))))
    : h('p', { class: 'muted small' }, 'Aucune activité récente.');

  const favRows = stats.favorites.length
    ? h('ul', { class: 'list-plain' }, stats.favorites.map((f) => h('li', {},
      h('a', { href: `#/cours/${f.course.id}` }, f.course.title),
      h('span', { class: 'small muted' }, `${f.percent} %`))))
    : h('p', { class: 'muted small' }, 'Ajoutez des cours à vos favoris depuis le catalogue.');

  const recoList = stats.recommendations.length
    ? h('ul', { class: 'list-plain' }, stats.recommendations.map((r) => h('li', { style: 'display:block' },
      h('a', { href: r.href, style: 'font-weight:600' }, r.title),
      h('div', { class: 'small muted' }, r.text))))
    : h('p', { class: 'muted small' }, 'Rien de particulier pour le moment.');

  setChildren(outlet, h('div', { class: 'page stack', style: 'gap:var(--space-5)' },
    pageHead(),
    h('section', { class: 'kpis', 'aria-label': 'Indicateurs clés' },
      kpi(`${stats.startedCount}`, 'cours commencés'),
      kpi(`${stats.finishedCount}`, 'cours terminés'),
      kpi(`${stats.globalPercent} %`, 'progression globale'),
      kpi(`${stats.passedCount}`, `quiz réussis (≥ ${PASS_PERCENT} %)`),
      kpi(formatDuration(stats.estimatedMinutes), 'temps estimé (chapitres terminés)'),
      kpi(`${stats.streak} j`, 'série en cours')
    ),
    h('section', { class: 'split', 'aria-labelledby': 'goal-title' },
      h('div', { class: 'card stack' },
        h('h2', { id: 'goal-title', style: 'margin:0;font-size:1.15rem' }, 'Objectif du jour'),
        progressBar(goalPct, `${stats.todayCount} / ${stats.goal} aujourd'hui`),
        h('div', { class: 'field' }, h('label', { for: 'daily-goal' }, 'Objectif quotidien'), goalSelect),
        h('p', { class: 'small muted', style: 'margin:0' }, 'Une action = un chapitre terminé ou un quiz passé.')
      ),
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Activité des 14 derniers jours'),
        bars, barLabels
      )
    ),
    h('section', { class: 'split' },
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Calendrier de progression'),
        calendar,
        h('p', { class: 'small muted', style: 'margin:0' }, '35 derniers jours : plus la case est foncée, plus l\'activité est importante.')
      ),
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Recommandations'),
        recoList
      )
    ),
    h('section', { class: 'split' },
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Progression par cours'),
        h('ul', { class: 'list-plain' }, courseRows)
      ),
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Scores récents'),
        scoreRows
      )
    ),
    h('section', { class: 'split' },
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Compétences acquises'),
        skillRows
      ),
      h('div', { class: 'card stack' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Cours favoris'),
        favRows
      )
    ),
    h('section', { class: 'card stack', 'aria-labelledby': 'badges-title' },
      h('h2', { id: 'badges-title', style: 'margin:0;font-size:1.15rem' }, 'Badges'),
      badgesGrid
    ),
    h('section', { class: 'card stack' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', { style: 'margin:0;font-size:1.15rem' }, 'Dernières activités'),
        h('a', { class: 'btn btn-small', href: '#/recent' }, 'Contenus récents')),
      activityRows
    ),
    h('p', { class: 'small muted' }, `Parcours disponibles : ${courses.length}. Les statistiques sont calculées sur cet appareil uniquement.`)
  ));
  return undefined;
}

function pageHead() {
  return h('header', { class: 'page-head' },
    h('h1', { tabindex: '-1', text: 'Tableau de bord' }),
    h('p', { text: 'Votre activité sur cet appareil : progression, scores, badges et recommandations.' })
  );
}
