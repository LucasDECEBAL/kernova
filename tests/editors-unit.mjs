import { ROOT, CHROME_PATH } from './lib/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = ROOT + '/';
const temp = path.join(os.tmpdir(), 'kp-codecheck-' + Date.now() + '.mjs');
fs.copyFileSync(root + 'assets/js/core/codecheck.js', temp);
const { validateCode } = await import('file:///' + temp.replace(/\\/g, '/'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
};

check('required ignore casse et espaces', validateCode('BONJOUR   c', [{ type: 'required', value: 'bonjour c', label: 'x' }])[0].ok);
check('forbids ignore les commentaires', validateCode('int main() { /* gets( */ }', [{ type: 'forbids', value: 'gets(', label: 'x' }])[0].ok);
check('balanced ignore les accolades des chaînes', validateCode('int main() { printf("}"); }', [{ type: 'balanced', label: 'x' }])[0].ok);
check('balanced détecte une accolade manquante', validateCode('int main() { printf("ok");', [{ type: 'balanced', label: 'x' }])[0].ok === false);
check('regex multiligne pour package main', validateCode('// doc\npackage main\n', [{ type: 'regex', pattern: '^\\s*package\\s+main', flags: 'm', label: 'x' }])[0].ok);
check('anyOf accepte une variante', validateCode('return fmt.Errorf("x")', [{ type: 'anyOf', values: ['errors.New', 'fmt.Errorf'], label: 'x' }])[0].ok);
check('regex invalide ne casse pas', validateCode('abc', [{ type: 'regex', pattern: '([', label: 'x' }])[0].ok === false);

const data = JSON.parse(fs.readFileSync(root + 'data/editors.json', 'utf8').replace(/^\uFEFF/, ''));
check('cinq langages déclarés', data.languages.length === 5, String(data.languages.length));
for (const language of data.languages) {
  check(`${language.id} : deux exercices`, language.exercises.length === 2);
  for (const exercise of language.exercises) {
    const solved = validateCode(exercise.solution, exercise.rules);
    const failed = solved.filter((r) => !r.ok).map((r) => r.label);
    check(`${exercise.id} : la solution passe tous les contrôles`, failed.length === 0, failed.join(', '));
    const starter = validateCode(exercise.starter, exercise.rules);
    check(`${exercise.id} : le départ ne valide pas d'emblée`, starter.some((r) => !r.ok));
    check(`${exercise.id} : au moins quatre contrôles`, exercise.rules.length >= 4);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
fs.rmSync(temp, { force: true });
process.exit(failed ? 1 : 0);
