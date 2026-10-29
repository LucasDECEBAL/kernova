// Runtime Python réel dans le navigateur via Pyodide (WebAssembly).

import { loadScript } from './loader.js';

const VERSION = '0.26.4';
const BASE = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
const SCRIPT = `${BASE}pyodide.js`;

let promise = null;

export function pythonStatus() {
  return promise ? 'ready' : 'idle';
}

/** Charge Pyodide (plusieurs Mo) et renvoie l'instance prête. */
export function getPythonRuntime(onStatus = () => {}) {
  if (!promise) {
    promise = (async () => {
      onStatus('Téléchargement du runtime Python (WebAssembly, plusieurs Mo)…');
      await loadScript(SCRIPT);
      onStatus('Initialisation de l\'interpréteur Python…');
      if (typeof globalThis.loadPyodide !== 'function') {
        throw new Error('Pyodide ne s\'est pas initialisé correctement.');
      }
      const py = await globalThis.loadPyodide({ indexURL: BASE });
      onStatus('Runtime Python prêt.');
      return py;
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}

/**
 * Exécute du code Python et renvoie la sortie réelle.
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, error?: string }>}
 */
export async function runPython(code, { onStatus, onOutput } = {}) {
  const py = await getPythonRuntime(onStatus);
  let stdout = '';
  let stderr = '';
  py.setStdout({ batched: (text) => { stdout += text; onOutput?.(text, 'out'); } });
  py.setStderr({ batched: (text) => { stderr += text; onOutput?.(text, 'err'); } });
  try {
    await py.runPythonAsync(code);
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout, stderr, error: String(err.message || err) };
  }
}
