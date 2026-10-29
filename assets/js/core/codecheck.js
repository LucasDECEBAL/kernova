// Validation pédagogique du code : présence de motifs, absence de motifs interdits, équilibre des accolades.
// Aucun code n'est compilé ni exécuté. Ces contrôles expliquent ce qui manque, ils ne prouvent pas que le programme fonctionne.

const normalize = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Retire les commentaires pour éviter qu'un exemple commenté valide une règle. */
function stripComments(code) {
  return String(code ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Retire les chaînes pour compter les accolades du code réel. */
function stripStrings(code) {
  return code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, ' "" ');
}

/**
 * @param {string} code
 * @param {Array<object>} rules
 * @returns {Array<{ label: string, ok: boolean }>}
 */
export function validateCode(code, rules = []) {
  const source = String(code ?? '');
  const withoutComments = stripComments(source);
  const lower = normalize(withoutComments);

  return rules.map((rule) => {
    const label = rule.label || 'Règle';
    let ok = false;
    if (rule.type === 'required') {
      ok = lower.includes(normalize(rule.value));
    } else if (rule.type === 'forbids') {
      ok = !lower.includes(normalize(rule.value));
    } else if (rule.type === 'anyOf') {
      ok = (rule.values || []).some((value) => lower.includes(normalize(value)));
    } else if (rule.type === 'regex') {
      try {
        ok = new RegExp(rule.pattern, rule.flags || '').test(withoutComments);
      } catch {
        ok = false;
      }
    } else if (rule.type === 'balanced') {
      const braces = stripStrings(withoutComments);
      let depth = 0;
      let pairs = 0;
      for (const char of braces) {
        if (char === '{') { depth += 1; pairs += 1; } else if (char === '}') {
          depth -= 1;
          if (depth < 0) break;
        }
      }
      ok = depth === 0 && pairs > 0;
    } else if (rule.type === 'notEmpty') {
      ok = source.trim().length > 0;
    }
    return { label, ok };
  });
}
