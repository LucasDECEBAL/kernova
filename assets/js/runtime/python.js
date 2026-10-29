// Exécution Python réelle via Pyodide, isolée dans un Web Worker.
// Le worker permet d'interrompre un code bloquant sans figer l'interface.

const VERSION = '0.26.4';
const BASE = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
const SCRIPT = `${BASE}pyodide.js`;
const DEFAULT_TIMEOUT = 15000;

let worker = null;
let ready = null;
let runSeq = 0;
const pending = new Map();
let handlers = { onStatus: () => {}, onOutput: () => {} };

function detach() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = null;
  for (const { resolve } of pending.values()) {
    resolve({ ok: false, error: 'Exécution interrompue.', interrupted: true });
  }
  pending.clear();
}

/** Arrête le worker et réinitialise l'interpréteur (variables perdues). */
export function resetPythonWorker() {
  detach();
}

function ensureWorker() {
  if (worker) return ready;
  worker = new Worker(new URL('./python-worker.js', import.meta.url));
  ready = new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      const message = event.data || {};
      switch (message.type) {
        case 'status':
          handlers.onStatus?.(message.text);
          break;
        case 'out':
          handlers.onOutput?.(message.text, 'out');
          break;
        case 'err':
          handlers.onOutput?.(message.text, 'err');
          break;
        case 'ready':
          resolve();
          break;
        case 'fatal':
          detach();
          reject(new Error(message.error || 'Le runtime Python n\'a pas pu démarrer.'));
          break;
        case 'done': {
          const entry = pending.get(message.id);
          if (entry) {
            pending.delete(message.id);
            entry.resolve(message.ok ? { ok: true } : { ok: false, error: message.error });
          }
          break;
        }
        default:
          break;
      }
    };
    worker.onerror = (event) => {
      detach();
      reject(new Error(event.message || 'Erreur du worker Python.'));
    };
    worker.postMessage({ type: 'init', script: SCRIPT, indexURL: BASE });
  });
  ready.catch(() => { /* l'erreur est propagée à l'appelant */ });
  return ready;
}

/**
 * Exécute du code Python dans le worker.
 * @returns {Promise<{ ok: boolean, error?: string, interrupted?: boolean }>}
 */
export async function runPython(code, { onStatus, onOutput, timeout = DEFAULT_TIMEOUT } = {}) {
  handlers = { onStatus, onOutput };
  await ensureWorker();

  const id = ++runSeq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      detach();
      resolve({
        ok: false,
        interrupted: true,
        error: `Délai de ${Math.round(timeout / 1000)} s dépassé : l'exécution a été interrompue. Vérifiez une boucle infinie.`
      });
    }, timeout);

    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      }
    });
    worker.postMessage({ type: 'run', id, code });
  });
}
