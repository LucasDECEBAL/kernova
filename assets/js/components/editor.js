// Éditeur de code léger : coloration, numéros de ligne, tabulation.
// Le texte est toujours échappé avant d'être inséré : aucune donnée utilisateur n'est interprétée comme du HTML.

import { h } from '../core/dom.js';

const KEYWORDS = 'const|let|var|function|return|if|else|for|while|do|class|new|await|async|import|export|from|try|catch|finally|throw|typeof|instanceof|of|in|this|null|undefined|true|false';

const RULES = {
  js: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, cls: 'tok-str' },
    { re: new RegExp(`\\b(?:${KEYWORDS})\\b`, 'g'), cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  css: [
    { re: /\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /"[^"]*"|'[^']*'/g, cls: 'tok-str' },
    { re: /#[0-9a-fA-F]{3,8}\b/g, cls: 'tok-num' },
    { re: /\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|fr|ch)?\b/g, cls: 'tok-num' },
    { re: /@[a-zA-Z-]+/g, cls: 'tok-key' },
    { re: /\b[-a-zA-Z]+(?=\s*:)/g, cls: 'tok-prop' }
  ],
  html: [
    { re: /<!--[\s\S]*?-->/g, cls: 'tok-com' },
    { re: /<\/?[a-zA-Z][\w-]*/g, cls: 'tok-tag' },
    { re: /"[^"]*"|'[^']*'/g, cls: 'tok-str' },
    { re: /\b[a-zA-Z-]+(?==)/g, cls: 'tok-attr' }
  ],
  python: [
    { re: /#[^\n]*/g, cls: 'tok-com' },
    { re: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, cls: 'tok-str' },
    { re: /\b(?:def|return|if|elif|else|for|while|in|not|and|or|import|from|as|class|try|except|finally|with|lambda|None|True|False|pass|break|continue|raise|yield|assert|del|global|nonlocal|is)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  sql: [
    { re: /--[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /'(?:''|[^'])*'/g, cls: 'tok-str' },
    { re: /\b(?:SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|PRIMARY|KEY|FOREIGN|NOT|NULL|AND|OR|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|INTEGER|TEXT|REAL|DROP|ALTER|INDEX)\b/gi, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ]
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Coloration simple : on collecte les correspondances, on écarte les chevauchements, on échappe le reste. */
export function highlight(code, language) {
  const source = String(code);
  const rules = RULES[language] || [];
  const spans = [];

  for (const rule of rules) {
    const re = rule.re;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      if (!match[0]) { re.lastIndex += 1; continue; }
      spans.push({ start: match.index, end: match.index + match[0].length, cls: rule.cls });
    }
  }

  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  let out = '';
  let pos = 0;
  for (const span of spans) {
    if (span.start < pos) continue;
    out += escapeHtml(source.slice(pos, span.start));
    out += `<span class="${span.cls}">${escapeHtml(source.slice(span.start, span.end))}</span>`;
    pos = span.end;
  }
  out += escapeHtml(source.slice(pos));
  return `${out}\n`;
}

/**
 * Crée un éditeur.
 * @returns {{ element: HTMLElement, getValue: () => string, setValue: (v: string) => void,
 *   setLanguage: (l: string) => void, focus: () => void }}
 */
export function createEditor({ label = 'Éditeur de code', language = 'js', value = '', onInput } = {}) {
  const textarea = h('textarea', {
    class: 'code-input',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    'aria-label': label
  });
  const pre = h('pre', { class: 'code-highlight', 'aria-hidden': 'true' });
  const gutter = h('div', { class: 'code-gutter', 'aria-hidden': 'true' });
  const layer = h('div', { class: 'code-layer' }, pre, textarea);
  const element = h('div', { class: 'code-editor' }, gutter, layer);

  let current = language;

  const render = () => {
    pre.innerHTML = highlight(textarea.value, current);
    const count = Math.max(1, textarea.value.split('\n').length);
    gutter.textContent = Array.from({ length: count }, (_, i) => String(i + 1)).join('\n');
  };

  textarea.value = value;

  // Seule une saisie de l'utilisateur déclenche onInput. Un rendu programmatique
  // (setValue, setLanguage) ne doit jamais notifier : il écraserait l'état appelant.
  textarea.addEventListener('input', () => {
    render();
    onInput?.(textarea.value);
  });
  textarea.addEventListener('scroll', () => {
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText('  ', start, end, 'end');
    render();
    onInput?.(textarea.value);
  });

  render();

  return {
    element,
    getValue: () => textarea.value,
    setValue: (next) => { textarea.value = next; render(); },
    setLanguage: (next) => { current = next; render(); },
    focus: () => textarea.focus()
  };
}
