// Worker dédié à Pyodide : isole le code utilisateur du fil principal.
// Un code bloquant peut ainsi être interrompu en terminant le worker.

let pyodide = null;

self.onmessage = async (event) => {
  const message = event.data || {};

  if (message.type === 'init') {
    try {
      self.postMessage({ type: 'status', text: 'Téléchargement du runtime Python (WebAssembly)…' });
      importScripts(message.script);
      self.postMessage({ type: 'status', text: 'Initialisation de l\'interpréteur Python…' });
      const instance = await loadPyodide({ indexURL: message.indexURL });
      instance.setStdout({ batched: (text) => self.postMessage({ type: 'out', text }) });
      instance.setStderr({ batched: (text) => self.postMessage({ type: 'err', text }) });
      pyodide = instance;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      pyodide = null;
      self.postMessage({ type: 'fatal', error: String(err && err.message ? err.message : err) });
    }
    return;
  }

  if (message.type === 'run') {
    if (!pyodide) {
      self.postMessage({ type: 'done', id: message.id, ok: false, error: 'Runtime non initialisé.' });
      return;
    }
    try {
      await pyodide.runPythonAsync(message.code);
      self.postMessage({ type: 'done', id: message.id, ok: true });
    } catch (err) {
      self.postMessage({ type: 'done', id: message.id, ok: false, error: String(err && err.message ? err.message : err) });
    }
  }
};
