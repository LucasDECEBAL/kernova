// Chemins partagés par les tests : racine du dépôt et navigateur Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CANDIDATES = [
  process.env.KERNOVA_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

export const CHROME_PATH = CANDIDATES.find((candidate) => fs.existsSync(candidate));

if (!CHROME_PATH) {
  console.error('Chrome introuvable. Définissez KERNOVA_CHROME avec le chemin de l\'exécutable.');
  process.exit(2);
}

export const BASE = 'http://127.0.0.1:8765/';

export function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url).then(() => resolve()).catch(() => {
        if (Date.now() - start > timeout) reject(new Error('serveur injoignable : ' + url));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}
