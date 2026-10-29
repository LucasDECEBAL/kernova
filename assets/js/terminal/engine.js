// Moteur du terminal simulé : système de fichiers virtuel, permissions et commandes.
// Simulation pédagogique uniquement : rien n'est exécuté sur le système réel.
// Les fonctions sont pures autant que possible : elles reçoivent et modifient `state`.

export const HOME = '/home/alice';
export const USER = 'alice';
export const GROUPS = ['alice', 'sudo'];

const rwx = (n) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;

export function formatMode(node) {
  const t = node.type === 'dir' ? 'd' : '-';
  return t + rwx((node.mode >> 6) & 7) + rwx((node.mode >> 3) & 7) + rwx(node.mode & 7);
}

export function modeOctal(node) {
  return (node.mode & 0o777).toString(8).padStart(3, '0');
}

function dir(mode, owner, group, children = {}) {
  return { type: 'dir', mode, owner, group, mtime: '2026-01-01T09:00:00Z', children };
}

function file(mode, owner, group, content) {
  return { type: 'file', mode, owner, group, mtime: '2026-01-01T09:00:00Z', content };
}

/** Arborescence de départ, identique pour tous les scénarios. */
export function createSeed() {
  return dir(0o755, 'root', 'root', {
    home: dir(0o755, 'root', 'root', {
      alice: dir(0o755, 'alice', 'alice', {
        documents: dir(0o755, 'alice', 'alice', {
          'notes.txt': file(0o644, 'alice', 'alice', 'Penser à réviser les permissions.\nRelire le chapitre sur les processus.\n'),
          'rapport.txt': file(0o644, 'alice', 'alice', 'Rapport trimestriel\nLes ventes progressent de 12 %.\n')
        }),
        projets: dir(0o755, 'alice', 'alice', {
          site: dir(0o755, 'alice', 'alice', {
            'index.html': file(0o644, 'alice', 'alice', '<!doctype html>\n<h1>Mon site</h1>\n'),
            css: dir(0o755, 'alice', 'alice', { 'style.css': file(0o644, 'alice', 'alice', 'body { font-family: Georgia, serif; }\n') })
          })
        }),
        atelier: dir(0o755, 'alice', 'alice', {
          'script.sh': file(0o644, 'alice', 'alice', '#!/usr/bin/env bash\necho "Sauvegarde terminée"\n'),
          'brouillon.txt': file(0o644, 'alice', 'alice', 'Brouillon à renommer.\n')
        }),
        sauvegardes: dir(0o755, 'alice', 'alice', {}),
        'secret.txt': file(0o644, 'alice', 'alice', 'mot de passe factice : ne pas diffuser\n'),
        '.profil': file(0o644, 'alice', 'alice', 'export LANG=fr_FR.UTF-8\n')
      })
    }),
    etc: dir(0o755, 'root', 'root', {
      hosts: file(0o644, 'root', 'root', '127.0.0.1 localhost\n192.168.1.10 passerelle\n'),
      'app.conf': file(0o644, 'root', 'root', '# Configuration de démonstration\nport = 8080\nmode = production\n')
    }),
    var: dir(0o755, 'root', 'root', {
      log: dir(0o755, 'root', 'root', {
        'app.log': file(0o644, 'root', 'root', 'INFO démarrage du service\nINFO connexion établie\nWARNING latence élevée\nerreur: disque presque plein\nINFO requête traitée\n')
      })
    }),
    tmp: dir(0o1777, 'root', 'root', {}),
    usr: dir(0o755, 'root', 'root', { bin: dir(0o755, 'root', 'root', {}) })
  });
}

export function createState(scenarioId = null) {
  return {
    root: createSeed(),
    cwd: HOME,
    user: USER,
    groups: GROUPS.slice(),
    history: [],
    scenarioId
  };
}

/* ---------- Chemins ---------- */

export function displayPath(state, path = state.cwd) {
  if (path === HOME) return '~';
  if (path.startsWith(`${HOME}/`)) return `~${path.slice(HOME.length)}`;
  return path;
}

function segments(path) {
  return path.split('/').filter((part) => part && part !== '.');
}

export function resolve(state, arg) {
  if (!arg) return segments(state.cwd);
  let base;
  if (arg === '~') return segments(HOME);
  if (arg.startsWith('~/')) {
    base = segments(HOME);
    arg = arg.slice(2);
  } else if (arg.startsWith('/')) {
    base = [];
  } else {
    base = segments(state.cwd);
  }
  for (const part of segments(arg)) {
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base;
}

export function pathOf(list) {
  return `/${list.join('/')}`;
}

export function getNode(state, list) {
  let node = state.root;
  for (const part of list) {
    if (!node || node.type !== 'dir') return null;
    node = node.children[part] || null;
  }
  return node;
}

function getParent(state, list) {
  return { parent: getNode(state, list.slice(0, -1)), name: list[list.length - 1] };
}

/* ---------- Permissions ---------- */

function who(state, node) {
  if (node.owner === state.user) return 6;
  if (node.group && state.groups.includes(node.group)) return 3;
  return 0;
}

export function can(state, node, action) {
  if (state.user === 'root') return true;
  const bit = action === 'r' ? 4 : action === 'w' ? 2 : 1;
  return ((node.mode >> who(state, node)) & bit) !== 0;
}

function traverse(state, list) {
  let node = state.root;
  for (const part of list) {
    if (!can(state, node, 'x')) return { error: 'Permission refusée' };
    node = node.children[part];
    if (!node) return { error: 'Aucun fichier ou dossier de ce type' };
  }
  return { node };
}

/* ---------- Utilitaires ---------- */

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

function splitPipeline(line) {
  const parts = [];
  let current = '';
  let quote = null;
  for (const ch of line) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '|') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function takeRedirection(tokens) {
  const index = tokens.findIndex((t) => t === '>' || t === '>>');
  if (index === -1) return { tokens, redirect: null };
  const target = tokens[index + 1];
  if (!target) return { tokens, redirect: null };
  return { tokens: tokens.slice(0, index), redirect: { append: tokens[index] === '>>', target } };
}

/* ---------- Commandes ---------- */

const MAN = {
  help: 'Affiche la liste des commandes disponibles.',
  clear: 'Efface l\'écran du terminal.',
  pwd: 'Affiche le chemin absolu du dossier courant.',
  ls: 'Liste le contenu d\'un dossier. Options : -l (détaillé), -a (cachés).',
  cd: 'Change de dossier. Sans argument, revient au dossier personnel.',
  mkdir: 'Crée un dossier. Option : -p (crée les parents).',
  touch: 'Crée un fichier vide ou met à jour sa date.',
  cat: 'Affiche le contenu d\'un fichier.',
  echo: 'Affiche du texte. Redirection avec > et >>.',
  cp: 'Copie un fichier. Option : -r pour un dossier.',
  mv: 'Déplace ou renomme un fichier ou un dossier.',
  rm: 'Supprime un fichier. Option : -r pour un dossier.',
  find: 'Cherche des fichiers. Options : -name motif, -type f|d.',
  grep: 'Cherche du texte dans des fichiers. Options : -i, -n.',
  chmod: 'Modifie les permissions. Notation symbolique (u+x) ou octale (640).',
  whoami: 'Affiche l\'utilisateur courant.',
  id: 'Affiche l\'utilisateur et les groupes.',
  history: 'Affiche l\'historique des commandes.',
  man: 'Affiche l\'aide d\'une commande.',
  wc: 'Compte les lignes, mots et caractères.'
};

const HELP_ORDER = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo', 'cp', 'mv', 'rm', 'find', 'grep', 'chmod', 'whoami', 'id', 'history', 'man', 'wc', 'clear'];

function ok(lines = []) {
  return { lines, error: false };
}

function fail(message) {
  return { lines: [message], error: true };
}

function makeTime() {
  return new Date().toISOString();
}

const commands = {
  help() {
    return ok(HELP_ORDER.map((name) => `${name.padEnd(8)} ${MAN[name]}`));
  },
  clear(state) {
    return { lines: [], error: false, clear: true };
  },
  pwd(state) {
    return ok([state.cwd]);
  },
  ls(state, args) {
    const long = args.includes('-l');
    const all = args.includes('-a');
    const targets = args.filter((a) => !a.startsWith('-'));
    const list = targets.length ? targets : ['.'];
    const out = [];
    let error = false;

    for (const target of list) {
      const resolved = resolve(state, target);
      const found = traverse(state, resolved);
      if (found.error) {
        out.push(`ls: ${target}: ${found.error}`);
        error = true;
        continue;
      }
      const node = found.node;
      if (list.length > 1) out.push(`${target}:`);
      if (node.type === 'file') {
        out.push(long ? `${formatMode(node)} ${node.owner} ${node.group} ${String(node.content.length).padStart(5)} ${resolved[resolved.length - 1]}` : resolved[resolved.length - 1]);
        continue;
      }
      if (!can(state, node, 'r')) {
        out.push(`ls: ${target}: Permission refusée`);
        error = true;
        continue;
      }
      const names = Object.keys(node.children).filter((n) => all || !n.startsWith('.')).sort();
      if (!names.length) continue;
      for (const name of names) {
        const child = node.children[name];
        if (!long) {
          out.push(name);
        } else {
          const size = child.type === 'dir' ? 4096 : child.content.length;
          out.push(`${formatMode(child)} ${child.owner.padEnd(6)} ${child.group.padEnd(6)} ${String(size).padStart(5)} ${name}${child.type === 'dir' ? '/' : ''}`);
        }
      }
    }
    return { lines: out, error };
  },
  cd(state, args) {
    const target = args[0] ?? '~';
    const resolved = resolve(state, target);
    const found = traverse(state, resolved);
    if (found.error) return fail(`cd: ${target}: ${found.error}`);
    if (found.node.type !== 'dir') return fail(`cd: ${target}: N'est pas un dossier`);
    if (!can(state, found.node, 'x')) return fail(`cd: ${target}: Permission refusée`);
    state.cwd = pathOf(resolved) || '/';
    return ok();
  },
  mkdir(state, args) {
    const parents = args.includes('-p');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return fail('mkdir: opérande manquant');
    const out = [];
    let error = false;
    for (const target of targets) {
      const resolved = resolve(state, target);
      if (!resolved.length) { out.push('mkdir: /: existe déjà'); error = true; continue; }
      if (parents) {
        let node = state.root;
        let pathSoFar = [];
        let failed = false;
        for (const part of resolved) {
          pathSoFar = [...pathSoFar, part];
          const existing = node.children[part];
          if (existing) {
            if (existing.type !== 'dir') { out.push(`mkdir: ${pathOf(pathSoFar)}: N'est pas un dossier`); error = true; failed = true; break; }
            node = existing;
            continue;
          }
          if (!can(state, node, 'w') || !can(state, node, 'x')) { out.push(`mkdir: ${pathOf(pathSoFar)}: Permission refusée`); error = true; failed = true; break; }
          const created = dir(0o755, state.user, state.user);
          created.mtime = makeTime();
          node.children[part] = created;
          node = created;
        }
        if (failed) continue;
      } else {
        const { parent, name } = getParent(state, resolved);
        if (!parent || parent.type !== 'dir') { out.push(`mkdir: ${target}: Aucun fichier ou dossier de ce type`); error = true; continue; }
        if (parent.children[name]) { out.push(`mkdir: ${target}: existe déjà`); error = true; continue; }
        if (!can(state, parent, 'w') || !can(state, parent, 'x')) { out.push(`mkdir: ${target}: Permission refusée`); error = true; continue; }
        if (!name) { out.push(`mkdir: ${target}: nom invalide`); error = true; continue; }
        const created = dir(0o755, state.user, state.user);
        created.mtime = makeTime();
        parent.children[name] = created;
      }
    }
    return { lines: out, error };
  },
  touch(state, args) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return fail('touch: opérande manquant');
    const out = [];
    let error = false;
    for (const target of targets) {
      const resolved = resolve(state, target);
      const existing = getNode(state, resolved);
      if (existing) {
        if (!can(state, existing, 'w')) { out.push(`touch: ${target}: Permission refusée`); error = true; continue; }
        existing.mtime = makeTime();
        continue;
      }
      const { parent, name } = getParent(state, resolved);
      if (!parent || parent.type !== 'dir') { out.push(`touch: ${target}: Aucun fichier ou dossier de ce type`); error = true; continue; }
      if (!can(state, parent, 'w') || !can(state, parent, 'x')) { out.push(`touch: ${target}: Permission refusée`); error = true; continue; }
      const created = file(0o644, state.user, state.user, '');
      created.mtime = makeTime();
      parent.children[name] = created;
    }
    return { lines: out, error };
  },
  cat(state, args, stdin) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return ok(stdin ? stdin.replace(/\n$/, '').split('\n') : []);
    const out = [];
    let error = false;
    for (const target of targets) {
      const found = traverse(state, resolve(state, target));
      if (found.error) { out.push(`cat: ${target}: ${found.error}`); error = true; continue; }
      if (found.node.type === 'dir') { out.push(`cat: ${target}: Est un dossier`); error = true; continue; }
      if (!can(state, found.node, 'r')) { out.push(`cat: ${target}: Permission refusée`); error = true; continue; }
      out.push(...found.node.content.replace(/\n$/, '').split('\n'));
    }
    return { lines: out, error };
  },
  echo(state, args, stdin, redirection) {
    let text = args.join(' ');
    if (text === '$PATH') text = '/usr/local/bin:/usr/bin:/bin';
    if (redirection) {
      const resolved = resolve(state, redirection.target);
      const existing = getNode(state, resolved);
      if (existing) {
        if (existing.type !== 'file') return fail(`bash: ${redirection.target}: Est un dossier`);
        if (!can(state, existing, 'w')) return fail(`bash: ${redirection.target}: Permission refusée`);
        existing.content = redirection.append ? existing.content + text + '\n' : text + '\n';
        existing.mtime = makeTime();
      } else {
        const { parent, name } = getParent(state, resolved);
        if (!parent || parent.type !== 'dir') return fail(`bash: ${redirection.target}: Aucun fichier ou dossier de ce type`);
        if (!can(state, parent, 'w') || !can(state, parent, 'x')) return fail(`bash: ${redirection.target}: Permission refusée`);
        parent.children[name] = file(0o644, state.user, state.user, text + '\n');
      }
      return ok();
    }
    return ok([text]);
  },
  cp(state, args) {
    const recursive = args.includes('-r');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length < 2) return fail('cp: opérande manquant');
    const source = targets[0];
    const destination = targets[1];
    const srcFound = traverse(state, resolve(state, source));
    if (srcFound.error) return fail(`cp: ${source}: ${srcFound.error}`);
    const src = srcFound.node;
    if (src.type === 'dir' && !recursive) return fail(`cp: -r non spécifié pour ${source}`);
    if (!can(state, src, 'r')) return fail(`cp: ${source}: Permission refusée`);

    const destResolved = resolve(state, destination);
    const destNode = getNode(state, destResolved);
    const copy = (node) => JSON.parse(JSON.stringify(node));

    if (destNode && destNode.type === 'dir') {
      if (!can(state, destNode, 'w') || !can(state, destNode, 'x')) return fail(`cp: ${destination}: Permission refusée`);
      const name = resolve(state, source).slice(-1)[0];
      if (destNode.children[name]) return fail(`cp: impossible d'écraser ${destination}/${name}`);
      destNode.children[name] = copy(src);
      return ok();
    }
    const { parent, name } = getParent(state, destResolved);
    if (!parent || parent.type !== 'dir') return fail(`cp: ${destination}: Aucun fichier ou dossier de ce type`);
    if (!can(state, parent, 'w') || !can(state, parent, 'x')) return fail(`cp: ${destination}: Permission refusée`);
    parent.children[name] = copy(src);
    return ok();
  },
  mv(state, args) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length < 2) return fail('mv: opérande manquant');
    const source = targets[0];
    const destination = targets[1];
    const srcResolved = resolve(state, source);
    const srcFound = traverse(state, srcResolved);
    if (srcFound.error) return fail(`mv: ${source}: ${srcFound.error}`);
    const srcParent = getParent(state, srcResolved);
    if (!can(state, srcParent.parent, 'w')) return fail(`mv: ${source}: Permission refusée`);

    const destResolved = resolve(state, destination);
    const destNode = getNode(state, destResolved);
    if (destNode && destNode.type === 'dir') {
      if (!can(state, destNode, 'w') || !can(state, destNode, 'x')) return fail(`mv: ${destination}: Permission refusée`);
      const name = srcResolved.slice(-1)[0];
      if (destNode.children[name]) return fail(`mv: impossible d'écraser ${destination}/${name}`);
      destNode.children[name] = srcFound.node;
      delete srcParent.parent.children[srcParent.name];
      return ok();
    }
    const destParent = getParent(state, destResolved);
    if (!destParent.parent || destParent.parent.type !== 'dir') return fail(`mv: ${destination}: Aucun fichier ou dossier de ce type`);
    if (!can(state, destParent.parent, 'w') || !can(state, destParent.parent, 'x')) return fail(`mv: ${destination}: Permission refusée`);
    destParent.parent.children[destParent.name] = srcFound.node;
    delete srcParent.parent.children[srcParent.name];
    return ok();
  },
  rm(state, args) {
    const recursive = args.includes('-r') || args.includes('-R');
    const force = args.includes('-f');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return fail('rm: opérande manquant');
    const out = [];
    let error = false;
    for (const target of targets) {
      const resolved = resolve(state, target);
      const node = getNode(state, resolved);
      if (!node) {
        if (!force) { out.push(`rm: ${target}: Aucun fichier ou dossier de ce type`); error = true; }
        continue;
      }
      if (!resolved.length) { out.push('rm: /: suppression refusée'); error = true; continue; }
      if (node.type === 'dir' && !recursive) { out.push(`rm: ${target}: Est un dossier`); error = true; continue; }
      const { parent, name } = getParent(state, resolved);
      if (!can(state, parent, 'w') || !can(state, parent, 'x')) { out.push(`rm: ${target}: Permission refusée`); error = true; continue; }
      delete parent.children[name];
    }
    return { lines: out, error };
  },
  find(state, args) {
    let root = '.';
    let name = null;
    let type = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-name') name = args[++i];
      else if (args[i] === '-type') type = args[++i];
      else if (!args[i].startsWith('-')) root = args[i];
    }
    const start = resolve(state, root);
    const found = traverse(state, start);
    if (found.error) return fail(`find: ${root}: ${found.error}`);
    const matcher = name ? globToRegex(name) : null;
    const out = [];
    const walk = (node, path) => {
      if (!can(state, node, 'r')) return;
      const base = path.split('/').filter(Boolean).slice(-1)[0] || '/';
      const typeOk = !type || (type === 'd' ? node.type === 'dir' : node.type === 'file');
      const nameOk = !matcher || matcher.test(base);
      if (typeOk && nameOk) out.push(path === '' ? '.' : path);
      if (node.type === 'dir') {
        for (const key of Object.keys(node.children).sort()) {
          walk(node.children[key], `${path}/${key}`);
        }
      }
    };
    walk(found.node, pathOf(start) === '/' ? '' : pathOf(start));
    return ok(out);
  },
  grep(state, args, stdin) {
    let insensitive = false;
    let showLine = false;
    const rest = [];
    for (const arg of args) {
      if (arg === '-i') insensitive = true;
      else if (arg === '-n') showLine = true;
      else rest.push(arg);
    }
    const pattern = rest.shift();
    if (!pattern) return fail('grep: motif manquant');
    let regex;
    try {
      regex = new RegExp(pattern, insensitive ? 'i' : '');
    } catch {
      return fail(`grep: motif invalide : ${pattern}`);
    }
    const files = rest;
    const out = [];
    let error = false;

    if (!files.length) {
      const source = stdin ?? '';
      source.replace(/\n$/, '').split('\n').forEach((line, i) => {
        if (line !== '' && regex.test(line)) out.push(showLine ? `${i + 1}:${line}` : line);
      });
      return ok(out);
    }

    for (const target of files) {
      const found = traverse(state, resolve(state, target));
      if (found.error) { out.push(`grep: ${target}: ${found.error}`); error = true; continue; }
      if (found.node.type === 'dir') { out.push(`grep: ${target}: Est un dossier`); error = true; continue; }
      if (!can(state, found.node, 'r')) { out.push(`grep: ${target}: Permission refusée`); error = true; continue; }
      found.node.content.replace(/\n$/, '').split('\n').forEach((line, i) => {
        if (regex.test(line)) {
          const prefix = files.length > 1 ? `${target}:` : '';
          out.push(`${prefix}${showLine ? `${i + 1}:` : ''}${line}`);
        }
      });
    }
    return { lines: out, error };
  },
  chmod(state, args) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length < 2) return fail('chmod: arguments manquants');
    const spec = targets.shift();
    const out = [];
    let error = false;

    for (const target of targets) {
      const resolved = resolve(state, target);
      const node = getNode(state, resolved);
      if (!node) { out.push(`chmod: ${target}: Aucun fichier ou dossier de ce type`); error = true; continue; }
      if (node.owner !== state.user && state.user !== 'root') { out.push(`chmod: ${target}: Permission refusée`); error = true; continue; }
      if (/^[0-7]{3,4}$/.test(spec)) {
        node.mode = parseInt(spec, 8) & 0o777;
        continue;
      }
      const match = /^([ugoa]*)([+-=])([rwx]*)$/.exec(spec);
      if (!match) { out.push(`chmod: mode invalide : ${spec}`); error = true; continue; }
      const [, whoSpec, op, perms] = match;
      const targetsWho = whoSpec === '' || whoSpec.includes('a') ? ['u', 'g', 'o'] : [...whoSpec];
      const bits = (perms.includes('r') ? 4 : 0) | (perms.includes('w') ? 2 : 0) | (perms.includes('x') ? 1 : 0);
      for (const w of targetsWho) {
        const shift = w === 'u' ? 6 : w === 'g' ? 3 : 0;
        if (op === '+') node.mode |= bits << shift;
        else if (op === '-') node.mode &= ~(bits << shift);
        else node.mode = (node.mode & ~(7 << shift)) | (bits << shift);
      }
    }
    return { lines: out, error };
  },
  whoami(state) {
    return ok([state.user]);
  },
  id(state) {
    return ok([`uid=1000(${state.user}) gid=1000(${state.user}) groupes=${state.groups.join(',')}`]);
  },
  history(state) {
    return ok(state.history.map((cmd, i) => `${String(i + 1).padStart(3)}  ${cmd}`));
  },
  man(state, args) {
    const name = args[0];
    if (!name) return fail('man: quelle page voulez-vous ?');
    if (!MAN[name]) return fail(`man: aucune page pour ${name}`);
    return ok([`${name} — ${MAN[name]}`]);
  },
  wc(state, args, stdin) {
    const linesOnly = args.includes('-l');
    const text = stdin ?? args.filter((a) => !a.startsWith('-')).map((a) => {
      const found = traverse(state, resolve(state, a));
      return found.node && found.node.type === 'file' ? found.node.content : '';
    }).join('');
    const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
    if (linesOnly) return ok([String(lines)]);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return ok([`${lines} ${words} ${text.length}`]);
  }
};

/** Exécute une ligne de commande. Modifie `state` (fs, cwd, historique). */
export function execute(state, line) {
  const raw = String(line ?? '').trim();
  if (!raw) return { lines: [], error: false };
  state.history.push(raw);
  if (state.history.length > 200) state.history.shift();

  const stages = splitPipeline(raw);
  let stdin = null;
  let result = { lines: [], error: false };
  let redirect = null;

  for (let i = 0; i < stages.length; i++) {
    const { tokens, redirect: redir } = takeRedirection(tokenize(stages[i]));
    const name = tokens[0];
    const args = tokens.slice(1);
    const command = commands[name];
    if (!command) {
      return fail(`${name} : commande introuvable. Tapez « help » pour la liste.`);
    }
    if (redir) redirect = redir;
    result = command(state, args, stdin, redir);
    if (result.clear) return result;
    if (result.error) break;
    stdin = `${result.lines.join('\n')}\n`;
  }

  if (redirect && !result.error) {
    // La redirection est gérée par echo ; pour les autres commandes, on écrit la sortie.
    if (!(stages[0] === 'echo' || stages[0].startsWith('echo '))) {
      const target = resolve(state, redirect.target);
      const existing = getNode(state, target);
      const text = `${result.lines.join('\n')}\n`;
      if (existing && existing.type === 'file') {
        if (!can(state, existing, 'w')) return fail(`bash: ${redirect.target}: Permission refusée`);
        existing.content = redirect.append ? existing.content + text : text;
      } else {
        const { parent, name } = getParent(state, target);
        if (!parent || parent.type !== 'dir') return fail(`bash: ${redirect.target}: Aucun fichier ou dossier de ce type`);
        if (!can(state, parent, 'w') || !can(state, parent, 'x')) return fail(`bash: ${redirect.target}: Permission refusée`);
        parent.children[name] = file(0o644, state.user, state.user, text);
      }
    }
  }

  return result;
}

/* ---------- Objectifs de scénario ---------- */

export function checkObjectives(state, checks) {
  return (checks || []).map((check) => {
    switch (check.type) {
      case 'cwd': return state.cwd === check.path;
      case 'exists': return Boolean(getNode(state, segments(check.path)));
      case 'absent': return !getNode(state, segments(check.path));
      case 'dir': {
        const node = getNode(state, segments(check.path));
        return Boolean(node && node.type === 'dir');
      }
      case 'content': {
        const node = getNode(state, segments(check.path));
        return Boolean(node && node.type === 'file' && node.content.includes(check.includes));
      }
      case 'mode': {
        const node = getNode(state, segments(check.path));
        return Boolean(node && modeOctal(node) === String(check.mode));
      }
      case 'executable': {
        const node = getNode(state, segments(check.path));
        return Boolean(node && (node.mode & 0o100) !== 0);
      }
      default:
        return false;
    }
  });
}
