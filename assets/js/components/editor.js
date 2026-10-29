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
  ],
  c: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /^[ \t]*#[a-z]+/gm, cls: 'tok-prop' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, cls: 'tok-str' },
    { re: /\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|NULL|size_t|int32_t|uint32_t)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  cpp: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /^[ \t]*#[a-z]+/gm, cls: 'tok-prop' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, cls: 'tok-str' },
    { re: /\b(?:alignas|auto|bool|break|case|catch|char|class|const|constexpr|continue|default|delete|do|double|else|enum|explicit|false|float|for|friend|if|inline|int|long|namespace|new|nullptr|operator|override|private|protected|public|return|short|sizeof|static|struct|switch|template|this|throw|true|try|typename|union|unsigned|using|virtual|void|volatile|while|std|string|vector|unique_ptr|shared_ptr|make_unique|make_shared|cout|cin|endl)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  go: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /"(?:\\.|[^"\\])*"|`[^`]*`/g, cls: 'tok-str' },
    { re: /\b(?:package|import|func|var|const|type|struct|interface|map|chan|go|defer|select|range|return|if|else|for|switch|case|default|break|continue|fallthrough|nil|true|false|string|int|float64|error|bool|byte|rune|any)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  rust: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /"(?:\\.|[^"\\])*"/g, cls: 'tok-str' },
    { re: /\b(?:fn|let|mut|const|static|struct|enum|impl|trait|pub|use|mod|match|if|else|for|while|loop|return|move|ref|self|Self|Some|None|Ok|Err|true|false|i8|i32|i64|u8|u32|usize|f64|String|Vec|Option|Result)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  java: [
    { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, cls: 'tok-str' },
    { re: /\b(?:abstract|boolean|break|byte|case|catch|char|class|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|int|interface|long|new|null|package|private|protected|public|return|short|static|super|switch|this|throw|throws|try|void|volatile|while|true|false|String|System|Override)\b/g, cls: 'tok-key' },
    { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-num' }
  ],
  php: [
    { re: /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, cls: 'tok-com' },
    { re: /<\?php|<\?=|\?>/g, cls: 'tok-prop' },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, cls: 'tok-str' },
    { re: /\b(?:function|class|public|private|protected|static|return|if|else|elseif|foreach|as|for|while|do|switch|case|break|continue|echo|print|new|try|catch|finally|throw|use|namespace|require|include|isset|empty|array|null|true|false|int|float|string|bool|void|fn)\b/gi, cls: 'tok-key' },
    { re: /\$[a-zA-Z_]\w*/g, cls: 'tok-attr' },
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
