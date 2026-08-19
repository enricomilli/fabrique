## these_centrale
[NULL]

## questions_recherche
[NULL]

## reponses_questions
[NULL]

## hypotheses
[NULL]

## methodologie
- **Approche** : Analyse de données observationnelles de cosmologie expérimentale pour reconstruire et comparer des cartes de lentille gravitationnelle du fond diffus cosmologique.
- **Méthode** : Mise en œuvre d'un estimateur quadratique standard en approximation à ciel plat sur les données SPT-3G (p. 33), et comparaison avec une méthode bayésienne d'inférence de paramètres et de reconstruction de lentille (p. 33). Intégration de corrections de projection pour les champs de polarisation (rotation locale, traitement des composantes de Nyquist) (p. 29-32).
- **Corpus/Données** : Deux années de données d'observation SPT-3G (saisons 2019 et 2020) couvrant 100 deg² et 1500 deg², ainsi que des données SPTpol (p. 20, p. 33).
- **Justification** : Les cartes de lentille produites permettent de contraindre les paramètres cosmologiques et sont utilisées pour le délentillage des cartes de polarisation afin de rechercher les ondes gravitationnelles primordiales (p. 24, p. 33). L'approximation à ciel plat et les projections spécifiques sont nécessaires pour optimiser les transformations de Fourier et gérer les effets de filtrage directionnel du télescope (p. 26-29).

## fil_rouge
[NULL]

## plan
- **Chapter 1 Introduction** : Démontre que le fond diffus cosmologique et ses anisotropies secondaires constituent un ensemble de données riche pour contraindre le modèle ΛCDM et la formation des structures, en présentant le contexte observationnel et les défis méthodologiques liés aux projections cartographiques (p. 12-33).
- **Chapter 2 Gravitational Lensing of the CMB** : Démontre que la lentille gravitationnelle déforme les trajectoires des photons du fond diffus cosmologique sans modifier leur fréquence, en exposant les bases de la lentille faible et le formalisme de l'estimateur quadratique standard (p. 33).
- **Chapter 3 SPTpol Lensing** : Démontre que la méthode bayésienne offre une alternative performante à l'estimateur quadratique standard en les comparant sur une zone de 100 deg² de données SPTpol (p. 33).
- **Chapter 4 SPT-3G Lensing** : Démontre que l'application de l'estimateur quadratique en approximation à ciel plat aux données 2019+2020 de SPT-3G produit les cartes de lentille cosmologique les plus sensibles à ce jour (p. 33).
- **Chapter 5 Summary and Conclusions** : Démontre que les résultats obtenus consolident la compréhension de la lentille du fond diffus cosmologique et ouvrent des perspectives pour les analyses futures dans ce domaine (p. 33).

## cadre_theorique
- **Cadre principal** : Modèle concordance ΛCDM — Modèle cosmologique standard à six paramètres supposant un univers spatialement plat, isotrope et homogène décrit par la relativité générale (p. 17-18) — Structure l'analyse globale en fournissant le cadre de référence pour contraindre les paramètres cosmologiques via les anisotropies du fond diffus cosmologique et la lentille gravitationnelle.
- **Cadres secondaires** :
  - Hu & Dodelson (2002) / Seljak & Zaldarriaga (1997) — Formalisme des anisotropies primaires et secondaires du fond diffus cosmologique (p. 13, p. 16, p. 17) — Sert de base physique pour interpréter les fluctuations de température et de polarisation ainsi que les effets de lentille et de diffusion électronique.
  - Hirata & Seljak (2003a) — Décomposition des champs de polarisation Q et U en modes E et B via une rotation locale en espace de Fourier (p. 29) — Permet de traiter mathématiquement la polarisation du fond diffus cosmologique et de séparer les contributions scalaires et tensorielles.
  - Johnson (2011) — Propriétés de symétrie des dérivées basées sur la transformation de Fourier rapide (p. 30) — Fournit le cadre méthodologique pour corriger les artefacts de Nyquist lors des transformations Q/U vers E/B sur des cartes pixelisées.

## concepts_cles
- **CONCEPT** : APPROXIMATION À CIEL PLAT
- **SENS** : « analyze data in the “flat-sky” approximation by projecting a spherical map with spherical coordinates (θ, φ) to a (x, y) grid that treats the observed patch of sky as a Euclidean plane » (p. 26)
- **ORIGINE** : propre à l'auteur (retraitement méthodologique appliqué aux données SPT)
- **CONCEPT** : ESTIMATEUR QUADRATIQUE
- **SENS** : « standard quadratic estimator used to reconstruct CMB lensing maps » (p. 33)
- **ORIGINE** : emprunté à la littérature cosmologique et retravaillé par l'auteur pour l'application aux données SPT-3G
- **CONCEPT** : DÉLENTILLAGE (DELENSING)
- **SENS** : « removal of this contamination via “delensing” of BICEP/Keck’s B-mode maps » (p. 24)
- **ORIGINE** : emprunté à BICEP/Keck Collaboration et retravaillé par l'auteur comme objectif instrumental de ses cartes de lentille
- **CONCEPT** : MODES AMBIGUS (POLARISATION)
- **SENS** : « “ambiguous” modes that contribute to both E and B » (p. 29)
- **ORIGINE** : propre à l'auteur (identification des artefacts de bordure lors de la décomposition EB sur des cartes partielles)

## ancrage_empirique
- Cartes de lentille gravitationnelle produites à partir de deux années de données SPT-3G (saisons 2019 et 2020), constituant les cartes les plus sensibles réalisées à ce jour (p. 33).
- Comparaison quantitative entre l'estimateur quadratique standard et une méthode bayésienne sur une zone de 100 deg² de données SPTpol (p. 33).
- Correction algorithmique des symétries de Nyquist dans les transformations de Fourier rapide pour préserver les propriétés hermitiennes des cartes de polarisation Q/U (p. 30-31).

## opposition
[NULL]

## apport_principal
- **Empirique** : Production des cartes de lentille gravitationnelle du fond diffus cosmologique les plus sensibles à ce jour à partir de deux années de données SPT-3G, fournissant un ensemble de données de référence pour les analyses cosmologiques et astrophysiques (p. 33).
- **Méthodologique** : Développement et mise en œuvre d'une chaîne d'analyse en approximation à ciel plat intégrant des corrections de projection pour les champs de polarisation et la gestion rigoureuse des symétries de Fourier, permettant de traiter des zones observationnelles étendues avec une fidélité accrue (p. 26-32).