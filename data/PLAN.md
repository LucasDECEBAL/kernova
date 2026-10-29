# Progression du catalogue kernova

## Contenu : plafond atteint — 47 cours, 250 leçons, 35 domaines sur 35

| Bloc | Cours |
|---|---|
| Informatique générale | Informatique : les fondamentaux |
| Algorithmique | Algorithmique débutant |
| Web | HTML, CSS, JavaScript débutants |
| Frontend | TypeScript, React, JavaScript avancé |
| Qualité | Tests et qualité, Architecture logicielle |
| Réseaux | Réseaux débutant, Réseaux avancé |
| Données | SQL débutant, Bases de données avancées |
| Sécurité | Cybersécurité débutant, Cybersécurité avancée, Ethical hacking |
| Systèmes | Linux débutant, Linux intermédiaire, Administration Linux avancée, Scripts Bash, Windows Server, Maintenance, Environnements de travail |
| Cloud et conteneurs | Docker, Kubernetes, Cloud computing, DevOps et CI/CD, Virtualisation |
| Backend | Backend et API REST |
| IA | Intelligence artificielle : fondamentaux |
| Langages | C, C++, Java, PHP, Go, Python débutant et intermédiaire |
| Automatisation | Automatisation et workflows |
| Mobile | Développement mobile |
| Design | UX/UI et accessibilité |
| Mise en ligne | Déploiement web et SEO |
| Exploitation | Observabilité et supervision |
| Pilotage | Gestion de projet informatique |
| Cadre | Réglementation et bonnes pratiques |
| Pratique | Projets pratiques guidés |

Totaux : 98 modules, 250 leçons, 250 exercices, 501 questions de quiz, 46 projets.

## Cartes mémo : 14 paquets, 112 cartes

Linux, Réseaux, Python, Cybersécurité, Git, Docker, Kubernetes, SQL, HTML et CSS, JavaScript, Algorithmique, Cloud, DevOps et CI/CD, Intelligence artificielle.

## Outils interactifs

### Fait : Playground HTML/CSS/JavaScript
- Éditeur avec coloration syntaxique, numéros de ligne, tabulation, trois onglets.
- Aperçu réel dans une iframe `sandbox="allow-scripts allow-forms allow-modals"`, sans accès au stockage ni au site principal.
- Console capturée par `postMessage` : `console.log`, `console.error`, `console.warn`, erreurs non catchées et promesses rejetées.
- Cinq exemples (page personnelle, compteur, liste de tâches, galerie, formulaire), solution consultable et chargeable.
- Sauvegarde locale du brouillon par exemple, restauration au rechargement, réinitialisation confirmée, copie du code.
- Limites affichées : pas de modules ES, pas d'accès réseau, une boucle infinie peut figer l'onglet.

### Reste à faire

1. Terminal Linux simulé : système de fichiers virtuel, commandes du cahier des charges, scénarios progressifs, sauvegarde locale.
2. Simulateur réseau : machines, routeurs, adressage, calculateur de sous-réseaux, DNS et routage pédagogiques.
3. Exécution Python dans le navigateur (Pyodide) et SQL avec SQLite compilé en WebAssembly.
4. Fiches mémo avec recherche, copie et impression.
5. Évaluation finale par cours.
6. Catalogue de projets séparé avec grille d'évaluation.

Chaque outil doit indiquer clairement ses limites et ne jamais simuler une exécution réelle.

## Conventions de données

- `data/catalog.json` : domaines et métadonnées (identifiant stable, domaine, sous-domaine, niveau, prérequis, cours suivants, compétences, fichier de leçons).
- `data/lessons/<cours>.json` : `modules[]` contenant `chapters[]`, ou `chapters[]` à plat.
- Chaque chapitre porte `exercise` et `quiz`, ou les reçoit de `data/exercises/<cours>.json`.
- Types de questions : `single`, `multiple`, `truefalse`, `text`, `blank`, `order`, `match`.
- Niveaux : `debutant`, `debutant-avance`, `intermediaire`, `avance`, `expert`.
- Progression enregistrée par identifiant, jamais par titre.

## Vérifications par type de lot

- Lot de contenu seul : script d'intégrité + test de fumée sur les nouveaux cours.
- Lot touchant au CSS ou au JavaScript : suite complète de 58 tests de bout en bout.
- Captures d'écran réservées aux changements visuels.
