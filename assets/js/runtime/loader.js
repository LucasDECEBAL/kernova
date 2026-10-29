// Chargement à la demande des runtimes externes (Pyodide, sql.js).
// Aucun code n'est simulé : si le runtime ne se charge pas, l'exécution échoue explicitement.

const scripts = new Map();

/** Charge un script distant une seule fois. Rejette avec un message compréhensible. */
export function loadScript(url, { timeout = 90000 } = {}) {
  if (scripts.has(url)) return scripts.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      scripts.delete(url);
      reject(new Error('Délai dépassé pendant le chargement du runtime. Vérifiez votre connexion puis réessayez.'));
    }, timeout);
    script.addEventListener('load', () => {
      clearTimeout(timer);
      resolve();
    });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      script.remove();
      scripts.delete(url);
      reject(new Error('Impossible de télécharger le runtime depuis le CDN. Vérifiez votre connexion.'));
    });
    document.head.append(script);
  });
  scripts.set(url, promise);
  return promise;
}
