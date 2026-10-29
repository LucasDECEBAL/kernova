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

### Fait : Terminal Linux simulé
- Système de fichiers virtuel complet (`/home/alice`, `/etc`, `/var/log`, `/tmp`, `/usr/bin`), chemins absolus, relatifs, `~`, `.`, `..`.
- Permissions simulées : lecture, écriture, exécution, propriétaire et groupe ; root contourne les contrôles.
- Commandes : `help`, `clear`, `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo`, `cp`, `mv`, `rm`, `find`, `grep`, `chmod`, `whoami`, `id`, `history`, `man`, `wc`, avec redirections `>`/`>>` et pipes `|`.
- Six scénarios guidés avec objectifs vérifiés automatiquement, indices progressifs et solution.
- Historique navigable au clavier, complétion des commandes avec Tab, effacement, sauvegarde locale de l'arborescence et de la progression.
- La page indique explicitement qu'il s'agit d'une simulation : aucun processus ni accès réseau réels.

### Fait : Simulateur réseau
- Topologie pédagogique : deux postes, un commutateur, un routeur à deux interfaces, un serveur web et un serveur DNS.
- Schéma cliquable, chaque appareil affichant son type, son nom et son adressage.
- Configuration par appareil : adresse IP, masque (`24` ou `255.255.255.0`), passerelle, serveur DNS, avec validation.
- Moteur de routage : même sous-réseau en direct, sinon passerelle obligatoire, vérification de la route sur le routeur, détection des conflits d'adresses.
- Pare-feu par règles ordonnées (action, source CIDR, port), nouvelles règles insérées en tête.
- Résolution DNS simulée vers un serveur joignable, avec noms inconnus refusés.
- Outils de test : joignabilité avec port optionnel et affichage du chemin, résolution d'un nom.
- Calculateur de sous-réseau : réseau, masque, première et dernière adresse, diffusion, nombre d'hôtes.
- Cinq scénarios guidés avec objectifs vérifiés, indices progressifs, solution et sauvegarde locale.

### Fait : Fiches mémo et Labo
- Douze fiches (Linux, Bash, Git, Docker, Kubernetes, Python, JavaScript, SQL, Réseau, Sécurité, HTML/CSS, Administration) et 65 entrées vérifiées.
- Recherche instantanée insensible aux accents, filtre par catégorie, filtre favoris, compteur de résultats.
- Copie d'une commande en un clic, avertissements mis en évidence, exemples en bloc de code.
- Favoris de fiches persistés et inclus dans l'export des données.
- Mise en page d'impression dédiée (boutons et filtres masqués).
- Page « Labo » qui regroupe Playground, Terminal, Simulateur réseau et Fiches, pour garder une navigation courte.

### Fait : Python et SQL exécutables
- Python réel via Pyodide 0.26.4 (WebAssembly), chargé à la demande depuis un CDN avec version figée.
- SQL réel via SQLite compilé en WebAssembly (sql.js 1.10.3), base de démonstration en mémoire (clients, commandes).
- Sortie standard, sortie d'erreur et traceback Python affichés tels quels ; tableaux de résultats SQL.
- Quatre exemples Python et quatre requêtes SQL fournis.
- Échec explicite si un runtime ne se charge pas : aucun résultat simulé n'est affiché.
- Brouillons conservés localement, réinitialisation, copie, raccourci Ctrl+Entrée, onglets accessibles.

### Fait : Évaluation finale par cours
- Tirage de 12 questions parmi les quiz des chapitres du cours (toutes si le cours en contient moins), mélange des questions et des réponses.
- Une seule tentative par question, chronomètre affiché, réussite à partir de 70 %.
- Résultat enregistré sous l'identifiant `<cours>-final`, meilleur score affiché sur la page du cours et dans son bouton d'accès.
- Badge « Évaluation validée » ajouté au tableau de bord.
- Mention explicite : évaluation d'entraînement locale, sans certification ni protection contre la consultation des réponses.

### Fait : Catalogue de projets et grille d'évaluation
- 46 projets regroupés depuis les cours, avec recherche, filtres par domaine et par niveau.
- Page projet : cahier des charges, objectifs, prérequis, compétences, technologies, étapes, critères.
- Grille d'évaluation cochable, progression calculée et enregistrée localement, réinitialisation confirmée, impression.
- Aucun résultat n'est présenté comme corrigé automatiquement : les critères servent de liste de vérification.

## État final

Le cahier des charges est couvert pour la plateforme : catalogue, cours et leçons, parcours, quiz, évaluation finale, flashcards, fiches mémo, playground, terminal simulé, simulateur réseau, exécution Python et SQL, projets, tableau de bord et gestion des données.

Améliorations possibles, non réalisées :
1. Approfondir le contenu au-delà de 250 leçons (le cahier des charges en décrit environ 1 324).
2. Isoler Pyodide dans un Web Worker pour interrompre une boucle infinie.
3. Utiliser IndexedDB pour de gros brouillons de code.
4. Ajouter des paquets de flashcards pour les domaines récents et un mode examen chronométré.

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
