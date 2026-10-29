# kernova

Plateforme d'apprentissage informatique en français, entièrement statique : pas de serveur applicatif, pas de base distante, pas de compte. Tout tient dans `index.html`, `assets/` et `data/`.

## Démarrer

```bash
npm start
# puis http://127.0.0.1:8000/
```

Sans Node.js :

```bash
python -m http.server 8000
```

N'ouvrez pas `index.html` par double-clic : les modules ES et les fichiers JSON échouent en `file://`. Gardez la même adresse et le même port, car la progression est stockée par origine dans le navigateur.

## Contenu

- 53 cours, 34 domaines, 280 leçons, 561 questions de quiz, 46 projets, 14 paquets de cartes, 12 fiches mémo.
- Chaque leçon : résumé en trois points, contenu, exercice vérifiable, suite logique, notes personnelles.
- Chaque exercice de projet fournit des fichiers de départ téléchargeables et deux indices progressifs.
- Évaluation finale par cours : 12 questions, une tentative, seuil de 70 %.

## Outils

| Outil | Réalité |
| --- | --- |
| Playground web | Exécution réelle du HTML/CSS/JS dans une iframe isolée |
| Terminal | Simulation : système de fichiers virtuel, permissions, pipes |
| Réseau | Simulation : adressage, routage, pare-feu, DNS |
| Python et SQL | Exécution réelle (Pyodide, sql.js) chargée depuis un CDN |
| Éditeurs C, C++, Go, Java, PHP | Validation structurelle locale, sans compilation |

Aucun outil ne prétend exécuter ce qu'il ne fait pas : les limites sont affichées dans l'interface. Python et SQL nécessitent une connexion au premier lancement ; le reste fonctionne hors ligne.

## Tests

```bash
npm test              # toutes les suites (Chrome requis)
npm test -- e2e       # une seule suite
```

Suites : `integrity`, `editors-unit`, `e2e`, `playground`, `terminal`, `network`, `sheets`, `final`, `execution`, `projects`, `parcours`, `summary`, `extra`, `mobile`, `editors-e2e`, `a11y`.

- `tests/lib/server.mjs` sert le site sans dépendance ; `tests/run.mjs` démarre tout et résume les résultats.
- L'audit `a11y` utilise axe-core (`tests/lib/axe.min.js`) sur 10 pages, en thème système, clair et sombre.
- Chrome est détecté automatiquement ; sinon, définissez `KERNOVA_CHROME`.

## Structure

```
index.html             shell, navigation, amorçage du thème
assets/css/            système de design et polices auto-hébergées
assets/js/app.js       routes et câblage
assets/js/core/        données, stockage, progression, recherche, validation
assets/js/pages/       une page par route
assets/js/components/  éditeur, blocs de leçon, widgets
assets/js/quiz|terminal|network|runtime/  moteurs spécialisés
data/catalog.json      domaines et métadonnées des cours
data/lessons/*.json    contenu, exercices, quiz, projet par cours
data/editors.json      exercices de l'atelier de code
tests/                 suites de bout en bout et audit d'accessibilité
```

## Déployer

- **GitHub Pages** : publier la racine du dépôt. `.nojekyll` est présent ; `404.html` renvoie les chemins inconnus vers le routeur par ancre.
- **Netlify** : `netlify.toml` publie la racine et redirige vers `index.html`.
- Aucune variable d'environnement ni clé secrète n'est nécessaire.

## Limites connues

- Les questions ouvertes utilisent des mots-clés indicatifs : une bonne réponse mal formulée peut être refusée, la solution reste la référence.
- Les éditeurs de code vérifient la structure, pas la sémantique, et ne compilent rien.
- Python, SQL et les polices sont locaux sauf Pyodide et sql.js, chargés depuis `cdn.jsdelivr.net`.
- Pas de compte ni de synchronisation : la progression reste dans le navigateur (export et import disponibles dans Données).
