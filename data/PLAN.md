# Progression du catalogue kernova

## Contenu : plafond atteint — 273 cours, 1358 leçons, 35 domaines sur 35

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

Totaux : 98 modules, 1358 leçons, 250 exercices, 2335 questions de quiz, 46 projets.

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

## Vérifications mobiles et robustesse

- Rendu vérifié à **390 px** par émulation d'appareil sur 17 pages : aucun débordement horizontal.
- Python exécuté dans un **Web Worker** dédié : un code bloquant est interrompu après 15 s ou via le bouton « Arrêter », sans figer l'interface. Le worker est recréé à la demande.
- Le CDN reste nécessaire au premier lancement pour Python et SQL ; les erreurs sont explicites et une nouvelle tentative est possible en relançant l'exécution.

## État final

Le cahier des charges est couvert pour la plateforme : catalogue, cours et leçons, parcours, quiz, évaluation finale, flashcards, fiches mémo, playground, terminal simulé, simulateur réseau, exécution Python et SQL, projets, tableau de bord et gestion des données.

Améliorations possibles, non réalisées :
1. Approfondir le contenu au-delà de 260 leçons (le cahier des charges en décrit environ 1 324).
2. Utiliser IndexedDB pour de gros brouillons de code.
3. Ajouter des paquets de flashcards pour les domaines récents et un mode examen chronométré.

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

## Améliorations livrées après le bilan

- Recherche élargie : cours, chapitres, fiches mémo (avec commandes correspondantes), cartes mémo, projets et domaines.
- Page « Contenus récents » : derniers chapitres ouverts, avec reprise directe et état terminé ; lien depuis le tableau de bord.
- Simulateur réseau : visualisation du paquet (source, destination, protocole, port), étapes commentées, marqueur animé sur le schéma, refus expliqué.

## Prochaines étapes, du plus court au plus long

1. Fichiers de départ et indices progressifs pour les projets.
2. Parcours multi-cours visuel, à partir des liens de prérequis.
3. Résumé et « suite logique » dans les leçons, puis exercices auto-validés reliés aux chapitres.
4. Éditeurs C, C++, Go, Rust, Java et PHP avec validation pédagogique.
## Fichiers de départ et indices des projets

- Dix projets disposent de squelettes téléchargeables et copiables : Linux intermédiaire, Administration Linux, HTML, CSS, JavaScript, Python débutant, Python intermédiaire, SQL, Docker, Git.
- Chaque projet enrichi propose deux indices progressifs, révélés un par un.
- Les autres projets affichent une note explicite : aucun fichier de départ n'est fourni.
- Les fichiers sont fournis tels quels, à compléter : aucune correction automatique du projet.

## Prochaines étapes

1. Parcours multi-cours visuel, à partir des liens de prérequis.
2. Résumé et « suite logique » dans les leçons, puis exercices auto-validés reliés aux chapitres.
3. Éditeurs C, C++, Go, Rust, Java et PHP avec validation pédagogique.
## Parcours multi-cours visuel

- Page « Parcours » : les 49 cours sont répartis en étapes calculées par la plus longue chaîne de prérequis.
- États par cours : disponible, en cours, terminé, verrouillé ; un cours se débloque quand ses prérequis sont terminés.
- Cartes avec niveau, domaine, progression, chapitres terminés et liens vers les prérequis.
- Filtre par domaine, statistiques (cours, terminés, verrouillés, avancement global) et légende.
- Accès depuis la navigation et depuis la section « Parcours » de l'accueil.

## Prochaines étapes

1. Résumé et « suite logique » dans les leçons, puis exercices auto-validés reliés aux chapitres.
2. Éditeurs C, C++, Go, Rust, Java et PHP avec validation pédagogique.
## Résumés, suite logique et exercices vérifiables

- Nouveaux champs de chapitre : summary (trois points clés) et 
extStep (phrase de transition), rendus en carte « Résumé » et encart « Suite logique ».
- Exercices vérifiables : champ de réponse, bouton Vérifier, retour immédiat, indices et solution conservés.
- Deux modes de vérification : réponses acceptées (comparaison insensible à la casse, aux accents, aux espaces et à la ponctuation finale) et mots-clés obligatoires.
- Appliqué aux dix leçons de Linux débutant ; les autres cours gardent indices et solution sans vérification.
- La page précise que la vérification est locale et pédagogique, sans prétendre à une correction sécurisée.

## Prochaine étape

1. Éditeurs C, C++, Go, Rust, Java et PHP avec validation pédagogique.
2. Étendre résumés et vérifications aux autres parcours.
### Avancement des résumés et vérifications

- Suite logique : 260/260 leçons (automatique, dernier chapitre renvoyant vers l'évaluation finale).
- Résumés en trois points : 40/260 (Linux, informatique, algorithmique, HTML, CSS, JavaScript, réseaux débutants).
- Exercices vérifiables : 40/260, avec trois modes (réponses acceptées, mots-clés obligatoires, alternatives).
- Lot suivant : Git, Python débutant, SQL débutant, réseaux avancé et services, Python intermédiaire et données/API, puis les parcours avancés.
### Lot 2 (100 leçons)

- Résumés et vérifications : SQL, Git, Python débutant, cybersécurité débutant, Docker, Kubernetes, cloud, DevOps, bases de données avancées, Linux intermédiaire, Bash, API backend, IA, TypeScript, React, tests, architecture, cybersécurité avancée.
- Git et Python débutant : la vérification est écrite dans data/exercises/*.json, où vivent leurs exercices.
- Correspondance des mots-clés : début de mot (les pluriels passent, « id » ne se déclenche plus dans « client_id »).
- Totaux : 140/260 résumés, 140/260 exercices vérifiables, 260/260 suites logiques.

### Lot 3 (120 leçons restantes)

virtualisation, Windows Server, maintenance, environnements de travail, hacking éthique, C, C++, Java, PHP, Go, automatisation, mobile, UX/UI, déploiement/SEO, observabilité, gestion de projet, réglementation, projets pratiques, réseaux avancé, Python intermédiaire, administration Linux, JavaScript avancé, services réseaux, Python données/API.
### Lot 3 (120 leçons) — terminé

- virtualisation, Windows Server, maintenance, environnements, hacking éthique, C, C++, Java, PHP, Go, automatisation, mobile, UX/UI, déploiement/SEO, observabilité, gestion de projet, réglementation, projets pratiques, réseaux avancé, Python intermédiaire, administration Linux, JavaScript avancé, services réseaux, Python données/API.
- Total : 260/260 résumés, 260/260 vérifications, 260/260 suites logiques.
- Validation : type et contenu de chaque vérification contrôlés (0 problème), 24 nouveaux cours vérifiés dans le navigateur, 35/35 scénarios, E2E 58/58.
- Limite assumée : les questions ouvertes utilisent des mots-clés indicatifs, pas une correction sémantique. Le retour reste pédagogique et local.
## Éditeurs de code (C, C++, Go, Java, PHP)

- Page #/editeurs et #/editeurs/<langage>, accessible depuis le Labo.
- Deux exercices par langage, avec fichier de départ, indices et solution copiable.
- Coloration syntaxique ajoutée pour les six langages dans components/editor.js.
- Validation locale dans core/codecheck.js : éléments requis, motifs regex, motifs interdits, accolades équilibrées (chaînes et commentaires neutralisés).
- Brouillon par exercice et dernier exercice ouvert mémorisés ; bouton de réinitialisation.
- Aucune compilation ni exécution : la page et le retour de validation l'indiquent explicitement.
- Tests : 50/50 contrôles de validation et de données, 18/18 parcours navigateur, 58/58 E2E, 18/18 fiches/Labo, 17/17 mobile.

### Limites connues

- La validation est structurelle : elle détecte l'absence des éléments attendus, pas une erreur de logique.
- Un code peut passer les contrôles sans être correct ; la solution proposée reste la référence.
- Aucun de ces cinq langages n'est compilé dans le navigateur : voir Python/SQL pour une exécution réelle.
## État final — les six points de finition

1. Projets : 46/46 ont des fichiers de départ téléchargeables et deux indices (36 ajoutés, contenus spécifiques à chaque projet).
2. Exercices ouverts : le retour annonce une vérification indicative et propose, après deux échecs, « Voir la solution et m'auto-évaluer ».
3. Tests : 16 suites dans 	ests/, lanceur 
pm test, serveur statique intégré, README, 404.html, .nojekyll, 
etlify.toml.
4. Plafond : 1358 leçons, 273 cours, 34 domaines, 46 projets, 2335 questions. Deux cours en doublon ont été archivés dans kernova-archives/ (projets pratiques et environnements de travail), avec nettoyage des liens de prérequis.
5. Accessibilité : axe-core sur 10 pages en trois thèmes, 0 violation sérieuse ou critique ; contrastes corrigés sans opacité sur le texte.
6. Cohérence : l'éditeur Rust a été retiré ; les cinq langages restants correspondent tous à un cours.

### Vérification

- 
pm test : 16/16 suites (intégrité, unités, 12 parcours navigateur, accessibilité, mobile).
- Catalogue cohérent : 1358 leçons, 250 exercices, 46 projets.
- Python et SQL restent les seuls outils à exécuter réellement du code, via CDN ; le reste fonctionne hors ligne.
## Couverture du prompt initial (1 324 entrées)

- Partie 2 (1-40) : terminée — 8 cours, 40 leçons.
- Partie 3 (41-80) : terminée — 8 cours, 40 leçons.
- Total : 273 cours, 1358 leçons, 2335 questions, 46 projets, 34 domaines.
- Suivi détaillé : data/BACKLOG.md.
- Prochaine partie : 4 (Git et outils de développement, 81-120).