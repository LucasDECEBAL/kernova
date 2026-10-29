// Runtime SQL réel dans le navigateur via SQLite compilé en WebAssembly (sql.js).

import { loadScript } from './loader.js';

const VERSION = '1.10.3';
const BASE = `https://cdn.jsdelivr.net/npm/sql.js@${VERSION}/dist/`;
const SCRIPT = `${BASE}sql-wasm.js`;

let promise = null;

export function getSqlRuntime(onStatus = () => {}) {
  if (!promise) {
    promise = (async () => {
      onStatus('Téléchargement du moteur SQLite (WebAssembly)…');
      await loadScript(SCRIPT);
      if (typeof globalThis.initSqlJs !== 'function') {
        throw new Error('sql.js ne s\'est pas initialisé correctement.');
      }
      const SQL = await globalThis.initSqlJs({ locateFile: (file) => `${BASE}${file}` });
      onStatus('Moteur SQLite prêt.');
      return SQL;
    })().catch((err) => {
      promise = null;
      throw err;
    });
  }
  return promise;
}

/** Crée une base en mémoire et applique le script de démonstration. */
export async function createDemoDatabase(schemaSql, onStatus) {
  const SQL = await getSqlRuntime(onStatus);
  const db = new SQL.Database();
  if (schemaSql) db.run(schemaSql);
  return db;
}

/**
 * Exécute une ou plusieurs requêtes.
 * @returns {{ results?: Array<{columns: string[], values: any[][]}>, modified?: number, error?: string }}
 */
export function runSql(db, sql) {
  const text = String(sql || '').trim();
  if (!text) return { error: 'La requête est vide.' };
  try {
    const results = db.exec(text);
    return { results, modified: db.getRowsModified() };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}
