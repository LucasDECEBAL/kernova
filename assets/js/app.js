// Point d'entrée : initialisation, shell (header, navigation, recherche globale) et routes.

import { h, icon, alertBox, emptyState } from './core/dom.js';
import * as store from './core/store.js';
import { get, update } from './core/store.js';
import { loadData, getDataIssues } from './core/data.js';
import { route, setNotFound, start, navigate } from './core/router.js';
import { applyTheme, effectiveTheme, toast } from './core/ui.js';
import { renderHomePage } from './pages/home.js';
import { renderCatalogPage } from './pages/catalog.js';
import { renderDomainsIndex, renderDomainPage } from './pages/domains.js';
import { renderCoursePage } from './pages/course.js';
import { renderLessonPage } from './pages/lesson.js';
import { renderQuizPage } from './pages/quiz.js';
import { renderSearchPage } from './pages/search.js';
import { renderDashboardPage } from './pages/dashboard.js';
import { renderDataPage } from './pages/data.js';
import { renderFlashIndex, renderFlashSession } from './pages/flashcards.js';

const main = document.getElementById('main');
const nav = document.getElementById('site-nav');
const navToggle = document.querySelector('.nav-toggle');
const searchForm = document.getElementById('global-search');
const searchInput = document.getElementById('global-search-input');
const themeToggle = document.getElementById('theme-toggle');

/** Affiche les notices de stockage une fois, en notification. */
function showStoreNotices() {
  for (const notice of store.getNotices()) toast(notice, 'info', 6000);
  store.clearNotices();
}

function setupShell() {
  // Navigation : élément actif
  window.addEventListener('kernova:route', (e) => {
    const path = e.detail.path;
    for (const link of nav.querySelectorAll('a[data-nav]')) {
      const key = link.dataset.nav;
      const active = path.startsWith(`/${key}`);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });

  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  // Recherche globale : Entrée navigue vers la page de résultats
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    navigate(q ? `#/recherche?q=${encodeURIComponent(q)}` : '#/recherche');
    searchInput.blur();
  });

  // Raccourci clavier : « / » place le focus sur la recherche (hors champs de saisie)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    searchInput.focus();
  });

  // Thème : bascule entre clair et sombre, en mémorisant le choix
  themeToggle.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    update((s) => { s.prefs.theme = next; });
    applyTheme(next);
    updateThemeIcon();
  });
  updateThemeIcon();
}

function updateThemeIcon() {
  const dark = effectiveTheme() === 'dark';
  themeToggle.setAttribute('aria-label', dark ? 'Passer au thème clair' : 'Passer au thème sombre');
  themeToggle.title = dark ? 'Thème clair' : 'Thème sombre';
  themeToggle.replaceChildren(icon(dark ? 'sun' : 'moon'));
}

function registerRoutes() {
  route('/', renderHomePage);
  route('/catalogue', renderCatalogPage);
  route('/domaines', renderDomainsIndex);
  route('/domaines/:id', renderDomainPage);
  route('/cours/:id', renderCoursePage);
  route('/cours/:courseId/:chapterId', renderLessonPage);
  route('/quiz/:courseId/:chapterId', renderQuizPage);
  route('/recherche', renderSearchPage);
  route('/tableau-de-bord', renderDashboardPage);
  route('/donnees', renderDataPage);
  route('/cartes', renderFlashIndex);
  route('/cartes/:pack', renderFlashSession);
  setNotFound(({ outlet }) => {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({
        icon: 'alert',
        title: 'Page introuvable',
        text: 'Cette adresse n\'existe pas dans kernova.',
        actions: [h('a', { class: 'btn btn-primary', href: '#/' }, 'Retour à l\'accueil')]
      })));
  });
}

async function boot() {
  store.init();
  applyTheme(get().prefs.theme);
  setupShell();
  registerRoutes();

  try {
    await loadData();
  } catch (err) {
    main.replaceChildren(h('div', { class: 'page' },
      alertBox('danger', `Impossible de charger les contenus : ${err.message}`),
      h('p', { class: 'muted' }, 'Ouvrez kernova via un serveur statique (voir les instructions du README ou la commande « python -m http.server » dans le dossier du projet). Les modules et fichiers JSON ne se chargent pas depuis file://.')
    ));
    return;
  }

  const issues = getDataIssues();
  if (issues.length) console.warn('kernova : contenus ignorés', issues);

  main.replaceChildren();
  showStoreNotices();
  start(main);
  window.addEventListener('error', (e) => console.error('kernova : erreur non gérée', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('kernova : promesse rejetée', e.reason));
}

boot();
