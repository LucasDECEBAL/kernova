// Routeur à hash (#/chemin?query). Fonctionne sur GitHub Pages sans règles serveur.

const routes = [];
let outlet = null;
let cleanup = null;
let renderToken = 0;
let notFoundHandler = null;

/** Convertit un motif '/cours/:id/:chapter?' en RegExp et liste des clés. */
function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(':')) {
        const optional = part.endsWith('?');
        keys.push(part.slice(1).replace('?', ''));
        return optional ? '(?:/([^/]+))?' : '/([^/]+)';
      }
      return `/${part}`;
    })
    .join('');
  return { re: new RegExp(`^${source || '/'}$`), keys };
}

export function route(pattern, handler) {
  const { re, keys } = compile(pattern);
  routes.push({ pattern, re, keys, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { path: path.replace(/\/+$/, '') || '/', query };
}

export function navigate(hash) {
  if (window.location.hash === hash) {
    // Même URL : on force un rendu.
    render();
  } else {
    window.location.hash = hash;
  }
}

export function currentRoute() {
  return parseHash();
}

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();

  if (cleanup) {
    try { cleanup(); } catch (err) { console.error(err); }
    cleanup = null;
  }

  let matched = null;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined; });
    matched = { handler: r.handler, params };
    break;
  }

  window.dispatchEvent(new CustomEvent('kernova:route', { detail: { path } }));

  if (!outlet) return;
  outlet.classList.remove('fade-in');
  try {
    if (!matched) {
      if (notFoundHandler) await notFoundHandler({ outlet, path });
    } else {
      const result = await matched.handler({ outlet, params: matched.params, query, path });
      if (token !== renderToken) return; // une navigation plus récente a pris le relais
      if (typeof result === 'function') cleanup = result;
    }
  } catch (err) {
    console.error(err);
    if (token === renderToken) {
      outlet.replaceChildren();
      const { h, alertBox } = await import('./dom.js');
      outlet.append(
        h('div', { class: 'page' },
          alertBox('danger', `Une erreur est survenue lors de l'affichage de cette page : ${err.message}`),
          h('a', { class: 'btn', href: '#/' }, 'Retour à l\'accueil')
        )
      );
    }
    return;
  }

  if (token !== renderToken) return;
  outlet.classList.add('fade-in');
  window.scrollTo({ top: 0, behavior: 'auto' });
  const heading = outlet.querySelector('h1');
  (heading || outlet).focus({ preventScroll: true });
}

export function start(target) {
  outlet = target;
  window.addEventListener('hashchange', render);
  return render();
}
