// Terminal Linux simulé : interface, historique, scénarios guidés et sauvegarde locale.
// Simulation pédagogique : aucune commande n'est exécutée sur le système réel.

import { h, icon, emptyState, alertBox } from '../core/dom.js';
import { getTerminalScenarios } from '../core/data.js';
import { createState, execute, checkObjectives, displayPath, HOME } from '../terminal/engine.js';
import { codeBlock } from '../components/widgets.js';
import { toast, confirmDialog } from '../core/ui.js';

const STORAGE_KEY = 'kernova:terminal:v1';
const MAX_LINES = 400;

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.state || !data.state.root || data.state.root.type !== 'dir') return null;
    if (typeof data.state.cwd !== 'string' || !Array.isArray(data.state.history)) return null;
    return data;
  } catch {
    return null;
  }
}

function save(state, scenarioId, done) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      scenarioId,
      done,
      state: { root: state.root, cwd: state.cwd, history: state.history.slice(-200) }
    }));
  } catch {
    /* quota ou stockage bloqué : le terminal reste utilisable en mémoire */
  }
}

export function renderTerminalPage({ outlet }) {
  const scenarios = getTerminalScenarios();
  if (!scenarios.length) {
    outlet.replaceChildren(h('div', { class: 'page' },
      emptyState({ icon: 'alert', title: 'Terminal indisponible', text: 'Les scénarios n\'ont pas pu être chargés.' })));
    return undefined;
  }

  const saved = loadSaved();
  let scenarioId = saved?.scenarioId && scenarios.some((s) => s.id === saved.scenarioId)
    ? saved.scenarioId
    : scenarios[0].id;
  let scenario = scenarios.find((s) => s.id === scenarioId);
  let state = saved && saved.scenarioId === scenarioId ? saved.state : createState(scenarioId);
  let done = new Set(saved?.done || []);
  let historyIndex = state.history.length;
  let hintsShown = 0;

  const output = h('div', { class: 'term-output', role: 'log', 'aria-live': 'polite', 'aria-label': 'Sortie du terminal' });
  const input = h('input', {
    class: 'term-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-label': 'Commande à exécuter'
  });
  const promptLabel = h('span', { class: 'term-prompt', 'aria-hidden': 'true' });
  const form = h('form', { class: 'term-line', autocomplete: 'off' }, promptLabel, input);
  const screen = h('div', { class: 'term-screen' }, output, form);

  const objectiveList = h('ul', { class: 'term-objectives' });
  const progress = h('p', { class: 'term-progress small', role: 'status' });
  const hintBox = h('div', { class: 'term-hints' });
  const scTitle = h('h2', { id: 'term-sc-title' });
  const scDesc = h('p', { class: 'small muted' });

  const scenarioSelect = h('select', {
    id: 'term-scenario',
    'aria-label': 'Choisir un scénario',
    onChange: (e) => changerScenario(e.target.value)
  }, scenarios.map((s) => h('option', { value: s.id, selected: s.id === scenarioId }, s.title)));

  function promptText() {
    return `${state.user}@kernova:${displayPath(state)}$ `;
  }

  function updatePrompt() {
    promptLabel.textContent = promptText();
  }

  function appendLine(text, kind = '') {
    const line = h('div', { class: `term-out ${kind}`.trim() });
    line.textContent = text === '' ? '\u00a0' : text;
    output.append(line);
    while (output.children.length > MAX_LINES) output.firstElementChild.remove();
    screen.scrollTop = screen.scrollHeight;
  }

  function appendEcho(command) {
    appendLine(`${promptText()}${command}`, 'echo');
  }

  function refreshObjectives() {
    const results = checkObjectives(state, scenario.objectives.map((o) => o.check));
    objectiveList.replaceChildren(...scenario.objectives.map((obj, i) => {
      const ok = results[i];
      if (ok) done.add(obj.id); else done.delete(obj.id);
      return h('li', { class: ok ? 'is-done' : '' },
        h('span', { class: 'term-check', 'aria-hidden': 'true', text: ok ? '✓' : '○' }),
        h('span', { text: obj.text }),
        h('span', { class: 'sr-only' }, ok ? ' (atteint)' : ' (non atteint)'));
    }));
    const total = scenario.objectives.length;
    const reached = results.filter(Boolean).length;
    progress.textContent = `${reached} / ${total} objectif(s) atteint(s)`;
    return reached === total;
  }

  function refreshHints() {
    hintBox.replaceChildren();
    if (!scenario.hints?.length) return;
    const shown = scenario.hints.slice(0, hintsShown);
    if (shown.length) {
      hintBox.append(h('ol', { class: 'term-hint-list' }, shown.map((t) => h('li', { text: t }))));
    }
    if (hintsShown < scenario.hints.length) {
      hintBox.append(h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => { hintsShown += 1; refreshHints(); }
      }, `Indice (${hintsShown}/${scenario.hints.length})`));
    }
  }

  function persist() {
    save(state, scenarioId, [...done]);
  }

  function runLine(raw) {
    const command = String(raw ?? '').trim();
    if (!command) return;
    appendEcho(command);
    let result;
    try {
      result = execute(state, command);
    } catch (err) {
      result = { lines: [`Erreur interne de la simulation : ${err.message}`], error: true };
    }
    if (result.clear) {
      output.replaceChildren();
      updatePrompt();
      persist();
      return;
    }
    for (const line of result.lines) appendLine(line, result.error ? 'error' : '');
    updatePrompt();
    const complete = refreshObjectives();
    persist();
    if (complete && done.size === scenario.objectives.length) {
      toast(`Scénario terminé : ${scenario.title}`, 'success', 3500);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    runLine(value);
    // Après exécution, la commande est dans l'historique : l'index pointe après la dernière.
    historyIndex = state.history.length;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!state.history.length) return;
      historyIndex = Math.max(0, Math.min(historyIndex, state.history.length) - 1);
      input.value = state.history[historyIndex] ?? '';
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      historyIndex = Math.min(state.history.length, historyIndex + 1);
      input.value = state.history[historyIndex] ?? '';
      return;
    }
    if (e.key === 'Tab') {
      const value = input.value;
      if (value && !value.includes(' ')) {
        const names = ['help', 'clear', 'pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo', 'cp', 'mv', 'rm', 'find', 'grep', 'chmod', 'whoami', 'id', 'history', 'man', 'wc'];
        const matches = names.filter((n) => n.startsWith(value));
        if (matches.length === 1) {
          e.preventDefault();
          input.value = matches[0];
        }
      }
    }
  });

  screen.addEventListener('click', (e) => {
    if (e.target.closest('a, button, select')) return;
    input.focus();
  });

  function afficherScenario() {
    hintsShown = 0;
    scTitle.textContent = scenario.title;
    scDesc.textContent = scenario.description;
    refreshHints();
    refreshObjectives();
    scenarioSelect.value = scenario.id;
  }

  function changerScenario(id) {
    const next = scenarios.find((s) => s.id === id);
    if (!next) return;
    scenario = next;
    scenarioId = next.id;
    state = createState(scenarioId);
    done = new Set();
    historyIndex = 0;
    output.replaceChildren();
    appendLine(`Environnement réinitialisé pour « ${next.title} ». Tapez help pour la liste des commandes.`, 'info');
    updatePrompt();
    afficherScenario();
    persist();
    input.focus();
  }

  async function reinitialiser() {
    const ok = await confirmDialog({
      title: 'Réinitialiser le terminal ?',
      text: 'Le système de fichiers simulé reviendra à son état initial et la progression du scénario sera effacée.',
      confirmLabel: 'Réinitialiser'
    });
    if (!ok) return;
    state = createState(scenarioId);
    done = new Set();
    historyIndex = 0;
    output.replaceChildren();
    appendLine('Système de fichiers réinitialisé. Tapez help pour commencer.', 'info');
    updatePrompt();
    afficherScenario();
    persist();
    input.focus();
    toast('Terminal réinitialisé.', 'info', 2000);
  }

  function voirSolution() {
    const dialog = h('dialog', { 'aria-labelledby': 'term-sol-title' },
      h('h2', { id: 'term-sol-title' }, `Solution : ${scenario.title}`),
      h('p', { class: 'small muted' }, 'Une solution possible. D\'autres commandes peuvent atteindre le même résultat.'),
      codeBlock({ code: scenario.solution, lang: 'bash', title: 'Commandes' }),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Fermer'))
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  const aideBtn = h('button', {
    class: 'btn',
    type: 'button',
    onClick: () => { runLine('help'); input.focus(); }
  }, icon('help', { size: 16 }), 'Aide');
  const resetBtn = h('button', { class: 'btn', type: 'button', onClick: reinitialiser }, icon('refresh', { size: 16 }), 'Réinitialiser');
  const solutionBtn = h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: voirSolution }, 'Voir la solution');

  outlet.replaceChildren(h('div', { class: 'page' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Fil d\'Ariane' },
      h('ol', {}, h('li', {}, h('a', { href: '#/labo' }, 'Labo')), h('li', { 'aria-current': 'page' }, 'Terminal'))),
    h('header', { class: 'page-head' },
      h('div', { class: 'row' },
        h('h1', { tabindex: '-1', text: 'Terminal simulé' }),
        h('span', { class: 'badge', 'data-tone': 'info' }, 'simulation')),
      h('p', { text: 'Un système de fichiers virtuel et un shell simplifié pour s\'entraîner. Aucune commande n\'est exécutée sur votre ordinateur.' })),
    h('div', { class: 'term-toolbar' },
      h('div', { class: 'field', style: 'min-width:240px' },
        h('label', { for: 'term-scenario' }, 'Scénario guidé'),
        scenarioSelect),
      h('div', { class: 'row', style: 'margin-left:auto' }, aideBtn, resetBtn)),
    h('div', { class: 'term-layout' },
      h('section', { class: 'term-main', 'aria-label': 'Terminal' }, screen),
      h('aside', { class: 'card term-side', 'aria-labelledby': 'term-sc-title' },
        scTitle,
        scDesc,
        progress,
        objectiveList,
        h('h3', { text: 'Indices' }),
        hintBox,
        h('div', { class: 'row' }, solutionBtn))),
    alertBox('info', 'Les commandes et les chemins sont simulés : les limites incluent l\'absence de vrais processus, de réseau et de paquets. Le fichier de données n\'est pas modifiable par sudo.')
  ));

  appendLine('kernova — terminal pédagogique', 'info');
  appendLine('Tapez « help » pour la liste des commandes, « man <commande> » pour l\'aide.', 'info');
  updatePrompt();
  afficherScenario();
  input.focus();

  return () => {
    persist();
  };
}
