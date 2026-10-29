// Démarre le site sur http://127.0.0.1:8000 (sans Python ni dépendance).
import { createStaticServer } from './server.mjs';
import { ROOT } from './env.mjs';

const port = Number(process.env.PORT || 8000);
createStaticServer(ROOT).listen(port, '127.0.0.1', () => {
  console.log(`kernova : http://127.0.0.1:${port}/`);
  console.log('Arrêt : Ctrl+C');
});
