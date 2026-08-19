## these_centrale
La reconstruction de la lentille gravitationnelle du fond diffus cosmologique à partir des données SPT-3G 2019+2020 produit les cartes les plus sensibles à ce jour, permettant de contraindre avec une précision inédite les paramètres du modèle ΛCDM et ses extensions (p. 129-130). Ce résultat est obtenu en appliquant un estimateur quadratique optimisé en approximation à ciel plat, validé par une comparaison rigoureuse avec une méthode bayésienne optimale sur des données SPTpol plus bruyantes (p. 129). Ces cartes permettent également de tester les tensions cosmologiques actuelles sur $H_0$ et $S_8$, et servent de référence pour le délentillage des cartes de polarisation dans la recherche d'ondes gravitationnelles primordiales (p. 130).

## questions_recherche
- Comment reconstruire optimalement la lentille gravitationnelle du fond diffus cosmologique à partir des données du South Pole Telescope pour contraindre les paramètres cosmologiques et tester les tensions du modèle standard ?
- Dans quelle mesure une méthode bayésienne d'inférence optimale surpasse-t-elle l'estimateur quadratique standard lorsque le bruit approche le plancher de bruit des modes B de lentille ?
- Comment les cartes de lentille SPT-3G 2019+2020 permettent-elles de mesurer précisément le spectre de puissance de lentille et de contraindre $H_0$, $S_8$ et le rapport tenseur-scalaire $r$ ?

## reponses_questions
- **Question 1** : « The SPT-3G 2019+2020 lensing analysis is expected to measure the lensing power spectrum with a signal-to-noise of nearly 40$\sigma$, with a 2-3% constraint on the amplitude of the lensing power spectrum $A_\phi$ » (p. 130). Cette précision permet de « place powerful independent constraints on $\Lambda$CDM parameters and extensions to the standard model » (p. 130).
- **Question 2** : « the Bayesian method achieved 17% tighter constraints on the amplitude of the lensing power spectrum $A_\phi$ compared to the quadratic estimator pipeline » (p. 129). La méthode bayésienne est optimale « where the quadratic estimator becomes suboptimal » (p. 129) et les deux méthodes sont « consistent with each other as well as with previous SPT analyses » (p. 129).
- **Question 3** : « we will be able to measure the Hubble constant $H_0$ with a precision similar to that of the best *Planck* and ACT lensing measurements, and place the tightest CMB lensing constraints to date on structure growth parameter $S_8$ » (p. 130). Ces résultats « shed new light on tensions between estimates of $H_0$ and $S_8$ from early-universe vs. late-time measurements » (p. 130) et les cartes serviront à « delens CMB polarization maps in the search for primordial gravitational waves » (p. 130) pour contraindre $r$.

## hypotheses
- **Hypothèse principale** : L'analyse SPT-3G 2019+2020 mesurera le spectre de puissance de lentille avec un rapport signal/bruit proche de $40\sigma$ et contraindra l'amplitude $A_\phi$ à 2-3 %, surpassant ou égalant les meilleures contraintes de *Planck* et ACT (p. 130).
- **Hypothèse secondaire 1** : La méthode bayésienne d'inférence optimale fournira des contraintes 17 % plus serrées sur $A_\phi$ que l'estimateur quadratique standard sur des données atteignant le plancher de bruit des modes B (p. 129).
- **Hypothèse secondaire 2** : Les cartes de lentille SPT-3G permettront de placer les contraintes les plus strictes à ce jour sur $S_8$ et de mesurer $H_0$ avec une précision comparable aux meilleures analyses de lentille du CMB, éclairant ainsi les tensions entre mesures de l'univers primitif et tardif (p. 130).
- **Hypothèse secondaire 3** : Les cartes de lentille à haut rapport signal/bruit et faiblement contaminées par les avant-plans permettront des corrélations croisées efficaces avec les relevés optiques (DES, Euclid, LSST) pour sonder la croissance des structures et calibrer les mesures de cisaillement faible (p. 130-131).

## methodologie
- **Approche** : Analyse observationnelle et reconstruction de la lentille gravitationnelle du fond diffus cosmologique à partir de données de polarisation et de température du South Pole Telescope, en comparant des pipelines d'estimation standards et optimaux pour valider les résultats cosmologiques (p. 128-129).
- **Méthode** : Mise en œuvre d'un estimateur quadratique standard (Hu & Okamoto 2002) incluant filtrage inverse de variance, normalisation et débiaisage (p. 129-130), comparé à une méthode bayésienne d'inférence conjointe optimale exploitant tous les ordres du signal de lentille (p. 129). Utilisation d'un facteur d'obfuscation pour éviter le biais de confirmation lors de l'estimation du spectre de puissance (p. 130).
- **Corpus/Données** : 100 deg² de données SPTpol (saison 2018, bruit proche du plancher des modes B) (p. 129) ; deux années de données SPT-3G (2019+2020) couvrant des zones étendues avec un bruit par mode 3 à 4 fois inférieur aux mesures récentes de *Planck* et ACT (p. 129-130).
- **Justification** : L'estimateur quadratique devient sous-optimal lorsque le bruit approche le plancher des modes B de lentille, justifiant le développement et la validation d'une méthode bayésienne optimale (p. 129). L'analyse SPT-3G vise à produire les cartes les plus sensibles pour contraindre $\Lambda$CDM, tester les tensions $H_0$/$S_8$, et fournir des cartes de référence pour le délentillage dans la recherche d'ondes gravitationnelles primordiales (p. 130).

## fil_rouge
La reconstruction optimale de la lentille gravitationnelle du fond diffus cosmologique, telle que formalisée par Hu & Okamoto (2002) (p. 128), reliant Chapter 1 Introduction à Chapter 4 SPT-3G Lensing via la validation progressive de l'estimateur quadratique standard face à une méthode bayésienne optimale sur des données de bruit décroissant.

## plan
- **Chapter 1 Introduction** : Démontre que le fond diffus cosmologique et le modèle ΛCDM offrent un cadre observationnel riche pour tester les tensions cosmologiques, en exposant les récepteurs SPT et les implications des projections cartographiques en approximation à ciel plat (p. 128).
- **Chapter 2 Gravitational Lensing of the CMB** : Démontre que la lentille faible du fond diffus cosmologique peut être reconstruite de manière rigoureuse, en détaillant le formalisme de l'estimateur quadratique, la normalisation et le débiaisage des cartes et du spectre de puissance (p. 128).
- **Chapter 3 SPTpol Lensing** : Démontre que la méthode bayésienne optimale surpasse l'estimateur quadratique standard en contraintes sur $A_\phi$ (17 % de gain) lorsque le bruit atteint le plancher des modes B, tout en restant cohérente avec les analyses précédentes (p. 129).
- **Chapter 4 SPT-3G Lensing** : Démontre que le pipeline SPT-3G 2019+2020 produit les cartes de lentille les plus sensibles à ce jour, avec un rapport signal/bruit attendu proche de $40\sigma$ et des contraintes à 2-3 % sur $A_\phi$, validées par des tests de cohérence et un facteur d'obfuscation (p. 129-130).
- **Chapter 5 Summary and Conclusions** : Démontre que les résultats consolidés éclairent les tensions $H_0$/$S_8$, permettent le délentillage pour la recherche d'ondes gravitationnelles primordiales, et ouvrent la voie à des corrélations croisées avec les relevés optiques pour sonder la croissance des structures (p. 130-131).

## cadre_theorique
- **Cadre principal** : Modèle concordance ΛCDM — Modèle cosmologique standard à six paramètres supposant un univers spatialement plat, isotrope et homogène décrit par la relativité générale (p. 17-18, p. 128) — Structure l'analyse globale en fournissant le cadre de référence pour contraindre les paramètres cosmologiques via les anisotropies du fond diffus cosmologique et la lentille gravitationnelle, et tester les tensions $H_0$/$S_8$ (p. 128, p. 130).
- **Cadres secondaires** :
  - Hu & Okamoto (2002) — Formalisme de l'estimateur quadratique pour la reconstruction de la lentille du fond diffus cosmologique (p. 128) — Sert de base méthodologique pour le pipeline standard, incluant la normalisation et le débiaisage des cartes et du spectre de puissance (p. 128).
  - Millea et al. (2021) — Méthode bayésienne d'inférence conjointe optimale pour la reconstruction de lentille et l'estimation de paramètres (p. 129) — Fournit le cadre alternatif testé sur SPTpol, exploitant tous les ordres du signal pour surpasser l'estimateur quadratique dans les régimes à faible bruit (p. 129).
  - BICEP/Keck Collaboration — Cadre du délentillage des cartes de polarisation pour la recherche d'ondes gravitationnelles primordiales (p. 130) — Oriente l'utilisation instrumentale des cartes SPT-3G pour contraindre le rapport tenseur-scalaire $r$ (p. 130).

## concepts_cles
- **CONCEPT** : ESTIMATEUR QUADRATIQUE STANDARD
- **SENS** : « formalism of the Hu & Okamoto (2002) quadratic estimator reconstruction technique is introduced. Ingredients of the quadratic estimator and lensing power spectrum are discussed in detail including the normalization and debiasing of both the lensing map and power spectrum » (p. 128)
- **ORIGINE** : emprunté à Hu & Okamoto (2002) et retravaillé par l'auteur pour l'implémentation du pipeline SPT-3G avec filtrage inverse de variance et débiaisage rigoureux
- **CONCEPT** : MÉTHODE BAYÉSIENNE OPTIMALE
- **SENS** : « optimal Bayesian method that leverages all orders of the lensing signal » (p. 129)
- **ORIGINE** : emprunté à Millea et al. (2021) et retravaillé par l'auteur comme référence comparative pour valider le gain de précision (17 %) sur $A_\phi$ par rapport au pipeline quadratique
- **CONCEPT** : FACTEUR D'OBFUSCATION
- **SENS** : « use of an obfuscation factor to avoid confirmation bias » (p. 130)
- **ORIGINE** : propre à l'auteur (protocole méthodologique introduit pour garantir l'objectivité lors de l'estimation finale du spectre de puissance avant la levée de l'obfuscation)
- **CONCEPT** : DÉLENTILLAGE (DELENSING)
- **SENS** : « delens CMB polarization maps in the search for primordial gravitational waves in collaboration with BICEP/Keck » (p. 130)
- **ORIGINE** : emprunté au cadre BICEP/Keck et retravaillé par l'auteur comme application critique des cartes SPT-3G pour contraindre le rapport tenseur-scalaire $r$

## ancrage_empirique
- Mesure attendue du spectre de puissance de lentille SPT-3G avec un rapport signal/bruit de nearly $40\sigma$ et une contrainte de 2-3 % sur l'amplitude $A_\phi$, compétitive avec les meilleures contraintes de *Planck* et ACT (p. 130).
- Gain de précision de 17 % sur $A_\phi$ obtenu par la méthode bayésienne par rapport à l'estimateur quadratique sur 100 deg² de données SPTpol, avec une cohérence confirmée entre les deux pipelines (p. 129).
- Niveau de bruit par mode des cartes SPT-3G 2019+2020 inférieur de 3 à 4 fois aux mesures récentes de *Planck* et ACT, permettant des corrélations croisées à haut rapport signal/bruit avec DES, Euclid et LSST (p. 129-130).

## opposition
- **Position nuancée** : L'estimateur quadratique standard est largement utilisé mais devient sous-optimal dans les régimes de faible bruit ; « the quadratic estimator becomes suboptimal » (p. 129) lorsque le bruit approche le plancher des modes B de lentille, justifiant le recours à une méthode bayésienne exploitant tous les ordres du signal pour des contraintes plus serrées (p. 129).
- **Position testée** : Les tensions cosmologiques actuelles entre mesures de l'univers primitif et tardif sur $H_0$ et $S_8$ nécessitent des contraintes indépendantes de haute précision ; les résultats SPT-3G sont conçus pour « shed new light on tensions between estimates of $H_0$ and $S_8$ from early-universe vs. late-time measurements » (p. 130), en fournissant une validation croisée indépendante de *Planck* et ACT.

## apport_principal
- **Empirique** : Production des cartes de lentille gravitationnelle du fond diffus cosmologique les plus sensibles à ce jour à partir des données SPT-3G 2019+2020, avec un niveau de bruit par mode 3 à 4 fois inférieur aux références *Planck* et ACT, fournissant un ensemble de données de référence pour les analyses cosmologiques et le délentillage (p. 129-130).
- **Méthodologique** : Validation comparative rigoureuse d'un pipeline bayésien optimal face à l'estimateur quadratique standard, démontrant un gain de 17 % sur $A_\phi$ dans les régimes à faible bruit, et intégration d'un facteur d'obfuscation pour éliminer le biais de confirmation lors de l'estimation du spectre de puissance (p. 129-130).
- **Critique** : Fourniture de contraintes indépendantes de haute précision sur $H_0$ et $S_8$ permettant de tester et potentiellement de résoudre les tensions actuelles du modèle ΛCDM entre l'univers primitif et tardif, tout en ouvrant la voie à des corrélations croisées multi-messagers avec les relevés optiques et radio (p. 130-131).