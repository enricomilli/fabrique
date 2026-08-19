# FICHE DE SYNTHÈSE DE THÈSE

<!--
GOLD REFERENCE — hand-built from the source parquet, not from any model output.
Thesis   : daley_thesis (Cail Daley, 2024)
Pages    : PARQUET pages. printed = parquet - 11 (front matter in roman numerals).
           All citations below are PARQUET pages, matching what the pipeline sees.
Citations: every (p. N) verified against data/daley_thesis.parquet.

STRUCTURAL NOTE — this thesis states NO explicit research questions and NO
explicit hypotheses. Exhaustive search of the full 147 pages finds:
  · zero occurrences of "research question"
  · zero interrogative sentences in the whole of Chapter 1
  · one occurrence of "hypothesis", statistical only ("null hypothesis of no
    lensing", p. 115)
Objectives are stated declaratively ("In this thesis I present…", p. 3). The two
sections below are therefore REFORMULATIONS, marked as such. A run that leaves
them [Non renseigné] is defensible; a run that fills them without flagging the
reformulation is over-claiming.
-->

## Métadonnées

- **Titre** : CMB Lensing Measurements with Two Years of Data from the SPT-3G Survey
- **Auteur** : Cail Daley
- **Année** : 2024
- **Établissement** : University of Illinois Urbana-Champaign
- **Discipline** : Astronomy
- **Pages** : 147

## Mots-clés

Cosmic Microwave Background ; gravitational lensing ; SPT-3G ; cosmology ; large scale structure — *ajouts* : quadratic estimator ; delensing ; tensions cosmologiques ($H_0$, $S_8$) ; analyse en aveugle (obfuscation)

## Thèse centrale

À partir de deux saisons d'observation (2019 et 2020) du télescope SPT-3G couvrant 1500 deg² à une résolution angulaire d'environ 1′, la thèse produit « the deepest CMB lensing maps ever made », dont le bruit par pixel est inférieur d'un facteur 3-4 aux mesures récentes de *Planck* et d'ACT (p. 3). L'analyse, encore en cours au moment de la soutenance, prévoit une mesure du spectre de puissance du lentillage à « a combined signal-to-noise of nearly 40σ, resulting in a 2-3% constraint on the amplitude of the lensing power spectrum $A_\phi$ » (p. 3). La contribution n'est pas seulement instrumentale : elle est méthodologique, la thèse comparant systématiquement estimateur quadratique et inférence bayésienne pour établir dans quel régime de bruit le premier cesse d'être optimal.

## Questions de recherche

*[Reformulation — la thèse ne pose aucune question explicite. Les objectifs sont énoncés au mode déclaratif, notamment « In this thesis I present CMB lensing measurements made with data from the 2019 and 2020 observing seasons of the SPT-3G experiment » (p. 3) et l'aperçu de chapitre p. 33.]*

- Comment reconstruire le potentiel de lentillage du CMB sur un champ de 1500 deg² lorsque l'approximation du ciel plat commence à se rompre et que le bruit en polarisation approche le plancher des modes B ? (objectif déduit de p. 72)
- Dans quel régime l'estimateur quadratique cesse-t-il d'être quasi optimal, et que gagne-t-on à lui substituer une méthode bayésienne ? (objectif déduit de pp. 62, 67)
- Quelles contraintes indépendantes ces cartes permettent-elles de placer sur $H_0$ et $S_8$, et que disent-elles des tensions entre univers primordial et tardif ? (objectif déduit de p. 130)
- Comment garantir qu'un résultat aussi attendu n'est pas biaisé par les choix d'analyse ? (objectif déduit du dispositif d'obfuscation, p. 111)

## Réponses aux questions de recherche

- **Q1 (reconstruction sur grand champ)** — Non pas un pipeline mais **trois** : « three independent analysis pipelines are used to make lensing measurements with the 2019+2020 SPT-3G dataset: a flat-sky quadratic estimator pipeline, a curved-sky quadratic estimator pipeline, and a flat-sky Bayesian pipeline based on the MUSE algorithm » (p. 72). L'auteur dirige le premier ; il en documente le coût : « roughly 15% larger error bars on the lensing power spectrum due to projection issues and the flat-sky approximation » (p. 73).
- **Q2 (quadratique vs bayésien)** — L'estimateur quadratique est quasi optimal jusqu'au plancher de ~5 μK-arcmin des modes B induits par le lentillage, au-delà duquel il devient sous-optimal (p. 62). Sur les données ultraprofondes SPTpol, l'estimateur quadratique donne $A_\phi = 1.00 \pm 0.15$ (p. 65) et la méthode bayésienne $A_\phi = 0.95 \pm 0.12$, soit « 26% tighter error bars » ; en neutralisant l'information du spectre à deux points, le gain propre est de « 17% tighter constraint on $A_\phi$ » (p. 67).
- **Q3 (contraintes cosmologiques)** — Attendues : mesure de $H_0$ « with a precision similar to that of the best *Planck* and ACT lensing measurements » et « the tightest CMB lensing constraints to date on structure growth parameter $S_8$ », de sorte que les résultats « will shed new light on tensions between estimates of $H_0$ and $S_8$ from early-universe vs. late-time measurements » (p. 130).
- **Q4 (garde-fou méthodologique)** — Analyse en aveugle : les bandes de puissance ne sont jamais lues sans facteur d'obfuscation, dont les coefficients sont conservés « in a non-human-readable file » et appliqués à chaque lecture du vecteur de données (p. 111). **Réponse partielle assumée** : au moment de la rédaction, un test échoue (voir Opposition).

## Hypothèses

*[Reformulation — aucune hypothèse explicite dans la thèse ; une seule occurrence du mot, statistique (« null hypothesis of no lensing », p. 115). Les énoncés ci-dessous sont des prédictions chiffrées testables, qui en tiennent lieu.]*

**Principale** : La combinaison résolution/sensibilité du SPT-3G — « SPT-3G's improved resolution and noise levels (by factors of ~5 and ~10 respectively) push to new frontiers on small scales especially in the cases of CMB polarization and lensing » (p. 22) — suffit à produire la mesure de lentillage la plus profonde à ce jour, soit ~40σ et 2-3 % sur $A_\phi$ (p. 130).

**Secondaires** :
- Le gain du bayésien sur le quadratique est réel mais borné : ~17 % sur $A_\phi$ à information CMB égale (p. 67), et non les 26 % du chiffre brut.
- Le durcissement contre les avant-plans corrige un biais réel : le CIB, anticorrélé à la matière, biaise le spectre de température « low by ~3% » aux grands $L$ (p. 104).
- Le jeu 2019+2020, représentant « a factor of ~10 increase in data volume » sur l'analyse 2018 (p. 70), doit réduire le bruit de reconstruction d'un facteur ~3 (p. 70).

## Méthodologie

- **Approche** : Analyse observationnelle et reconstruction du potentiel de lentillage, structurée par une comparaison méthodique entre estimateurs — trois pipelines indépendants, ce qui « brings the additional advantage of allowing rigorous cross-checks of the results, confirming the robustness of the measurements to different analysis choices and estimators » (p. 72).
- **Méthode** : Estimateur quadratique dans le formalisme de Hu & Okamoto (2002), avec filtrage en variance inverse, normalisation et débiaisage (p. 128) ; durcissement contre les avant-plans (bias-hardening), appliqué « for the first time in a flat-sky SPT lensing analysis » (p. 72) ; estimateur GMV pour le pipeline en ciel courbe (Maniyar et al. 2021, p. 73) ; algorithme MUSE (Millea & Seljak 2021) pour le pipeline bayésien, qui estime conjointement le spectre du CMB non lentillé *et* celui du lentillage (p. 73). Batterie de tests nuls sur 500 simulations par configuration (p. 112), avec seuil PTE > 0.05/$N_\text{tests}$.
- **Corpus/Données** : Champ d'hiver SPT-3G de 1500 deg², quatre sous-champs, 3286 observations sur les deux saisons, ~16 000 détecteurs (p. 75) ; niveaux de bruit ProjZEA de 5.3 µK-arcmin en température et 8.2 µK-arcmin en polarisation à 90 GHz (p. 70). Jeu de validation : 100 deg² « ultradeep » SPTpol à 6 µK-arcmin (p. 64). Simulations d'avant-plans Agora (Omori 2024) sur dix découpes de 1500 deg² (p. 116).
- **Justification** : Deux contraintes opposées imposent la pluralité des pipelines — « the flat-sky approximation begins to break down for the 1500 deg² winter field », ce qui motive un estimateur en ciel courbe ; et « the polarization noise levels of the 2019+2020 dataset are beginning to approach the ~5 μK-arcmin lensing B-mode noise floor where the quadratic estimator becomes suboptimal », ce qui motive le bayésien (p. 72).

## Fil rouge

L'optimalité de l'estimateur en fonction du régime de bruit, telle que posée par le plancher des modes B à ~5 μK-arcmin (p. 62), reliant la validation sur petit champ SPTpol (chapitre 3) à l'analyse sur grand champ SPT-3G (chapitre 4) via la question de savoir quel estimateur est légitime à quelle profondeur.

## Plan (Structure)

- **Chapter 1 — Introduction (parquet pp. 12-33)** : Démontre que les tensions entre mesures précoces et tardives motivent des sondes indépendantes, en posant le cadre ΛCDM, l'instrument SPT et — point technique décisif pour la suite — les conséquences des projections cartographiques sur la polarisation, toute projection non cylindrique introduisant « a spatially-varying rotation that mixes $Q$ into $U$ and thus $E$ into $B$ » (p. 32).
- **Chapter 2 — Gravitational Lensing of the CMB (pp. 34-61)** : Démontre que le lentillage est reconstructible à partir des corrélations qu'il induit, en établissant le formalisme de l'estimateur quadratique de Hu & Okamoto (2002) et ses ingrédients — filtrage en variance inverse, normalisation, débiaisage (p. 128).
- **Chapter 3 — SPTpol Lensing (pp. 62-67)** : Démontre sur données réelles que l'inférence bayésienne surpasse l'estimateur quadratique dans le régime profond, en comparant les deux sur 100 deg² ultraprofonds : $A_\phi = 1.00 \pm 0.15$ contre $0.95 \pm 0.12$ (pp. 65, 67).
- **Chapter 4 — SPT-3G Lensing (pp. 68-127)** : Démontre que l'analyse 2019+2020 produit les cartes les plus profondes jamais réalisées, en détaillant la chaîne complète — mapmaking, simulations, traitement des cartes, reconstruction, estimation spectrale — et en soumettant le résultat à une analyse en aveugle et à une batterie de tests nuls encore inachevée.
- **Chapter 5 — Summary and Conclusions (pp. 128-131)** : Démontre la portée cosmologique attendue (~40σ, 2-3 % sur $A_\phi$, contraintes sur $H_0$ et $S_8$) et ouvre sur le delensing avec BICEP/Keck et les corrélations croisées avec DES, Euclid et LSST (p. 130).

## Cadre théorique

- **Cadre principal** : **Modèle de concordance ΛCDM** et formalisme du lentillage faible — fournit les paramètres à contraindre ($H_0$, $\Omega_m$, $\sigma_8$, somme des masses des neutrinos, p. 3) et le cadre dans lequel les tensions observées prennent sens : « discrepancies or "tensions" between largely independent probes of ΛCDM parameters have been growing in recent years » (p. 19).
- **Cadres secondaires** :
  - **Hu & Okamoto (2002)** — estimateur quadratique : le formalisme central de reconstruction, dont la thèse détaille normalisation et débiaisage (p. 128).
  - **Hirata & Seljak (2003b) ; Seljak & Hirata (2004)** — ont identifié dès l'origine la sous-optimalité du quadratique à bas bruit et « first demonstrated an improved estimator based on maximizing the Bayesian CMB lensing posterior » (p. 62).
  - **Carron & Lewis (2017)** — estimateur MAP par itérations du quadratique, applicable à des jeux de données réalistes (p. 62).
  - **Millea & Seljak (2021)** — algorithme MUSE, marginalisation approchée sur l'espace latent, retenu parce que le Monte-Carlo hamiltonien est trop coûteux sur 1500 deg² (p. 73).
  - **Maniyar et al. (2021)** — estimateur GMV, qui exploite les corrélations *TE* et réduit le bruit d'environ 10 % pour les expériences de troisième génération (p. 73).
  - **Omori (2024) — simulations Agora** — cadre de caractérisation des biais d'avant-plans (p. 116).

## Concepts clés

1. **APPROXIMATION DU CIEL PLAT (FLAT-SKY)** — *sens* : traiter une portion de sphère comme un plan euclidien afin de substituer des transformées de Fourier rapides aux harmoniques sphériques. *Portée dans la thèse* : sa rupture sur 1500 deg² est le fait technique qui commande l'architecture à trois pipelines (p. 72).

2. **PROJECTION ProjZEA (LAMBERT ZENITHAL EQUAL-AREA)** — *sens* : projection équi-surface, chaque pixel couvrant le même angle solide, ce qui limite le mélange de modes en analyse spectrale (p. 27). *Effet secondaire* : toute projection non cylindrique induit une rotation spatialement variable qui mélange $Q$ dans $U$, donc $E$ dans $B$ (p. 32).

3. **PLANCHER DE BRUIT DES MODES B DE LENTILLAGE (~5 μK-arcmin)** — *sens* : niveau de bruit en polarisation en deçà duquel l'estimateur quadratique cesse d'être quasi optimal (p. 62). *Statut* : c'est le seuil qui organise la thèse entière.

4. **BIAS-HARDENING (DURCISSEMENT CONTRE LES AVANT-PLANS)** — *sens* : construction d'estimateurs insensibles à une contamination connue. *Motivation empirique* : le CIB, anticorrélé à la distribution de matière, biaise le spectre de température vers le bas d'environ 3 % (p. 104) ; le durcissement « increases the correlation coefficient by several percent on large scales » (p. 104).

5. **OBFUSCATION** — *sens* : analyse en aveugle par application d'un facteur multiplicatif inconnu aux bandes de puissance jusqu'à gel des choix d'analyse ; les coefficients sont stockés « in a non-human-readable file » et réappliqués à chaque lecture (p. 111). *Conçu pour* : « see catastrophic issues in the obfuscated data bandpowers without being able to tweak the bandpowers towards any expected value at the 5-10% level » (p. 111).

6. **MUSE** — *sens* : algorithme d'inférence bayésienne approchée, développé parce que le Monte-Carlo hamiltonien est trop coûteux à 1500 deg² ; il estime conjointement le spectre du CMB non lentillé et celui du lentillage, ce qui en fait « both a primary CMB and lensing analysis » (p. 73).

## Ancrage empirique (ou concret)

- **Le point de comparaison interne** : la première mesure SPT-3G, Pan et al. (2023), donnait $A_\phi = 1.020 \pm 0.060$ à partir de la seule température, sur la moitié du plan focal et la moitié de la saison 2018 (p. 70). Le jeu 2019+2020 représente « a factor of ~10 increase in data volume » et vise un bruit de reconstruction réduit d'un facteur ~3 (p. 70).
- **L'échelle instrumentale** : 1500 deg², quatre sous-champs, 3286 observations, ~16 000 détecteurs échantillonnant à 152.6 Hz sous-échantillonnés à 76.3 Hz (p. 75).
- **Le résultat méthodologique de référence** : sur les 100 deg² ultraprofonds SPTpol à 6 µK-arcmin (p. 64), quadratique $A_\phi = 1.00 \pm 0.15$ (p. 65) contre bayésien $A_\phi = 0.95 \pm 0.12$ — 26 % d'erreur en moins, ramenés à 17 % à information CMB égale (p. 67).
- **Le résultat négatif, assumé** : le test du pipeline sur simulations lentillées révèle « a flat ~2% bias for all estimators corresponding to ~40% of the statistical uncertainty in the highest signal to noise bins. As a result we do not pass this test and are working to understand and reduce the bias to an acceptable level » (p. 113).

## Opposition / Contre-argumentation

- **Contre l'usage par défaut de l'estimateur quadratique** : quasi optimal aux niveaux de bruit des analyses SPTpol antérieures, il devient sous-optimal sous le plancher des modes B — limitation identifiée dès sa proposition par Hirata & Seljak (p. 62) et vérifiée ici sur données réelles.
- **Contre l'approximation du ciel plat pour les grands champs** : elle « begins to break down for the 1500 deg² winter field », dégradant la transformation $QU \rightarrow EB$, l'estimation de la fonction de transfert et le filtrage en variance inverse (p. 72). Le pipeline que dirige l'auteur en paie le prix : ~15 % d'erreurs en plus (p. 73).
- **Contre la reconstruction en température non durcie** : le biais CIB, anticorrélé, tire le spectre vers le bas d'environ 3 % (p. 104).
- **Contre-argument dirigé contre ses propres résultats** : la thèse ne revendique pas un succès complet. Un test de pipeline n'est pas passé (p. 113) et seules des bandes obfusquées sont présentées, les vérifications restant « ongoing » (p. 129).

## Apport principal

- **Empirique** : les cartes de lentillage du CMB les plus profondes jamais produites, avec un bruit par pixel inférieur d'un facteur 3-4 à *Planck* et ACT (p. 3), sur 1500 deg² à ~1′ de résolution.
- **Méthodologique** : la première application du durcissement contre les avant-plans dans une analyse SPT en ciel plat (p. 72), et une architecture à trois pipelines indépendants conçue pour le contrôle croisé (p. 72). L'auteur documente aussi une correction logicielle de fond : « I led an effort to understand and solve these issues in SPT-3G's software library, which had existed for many years » (p. 31).
- **Théorique/instrumental** : la caractérisation empirique du régime où l'inférence bayésienne dépasse l'estimateur quadratique, chiffrée sur données réelles (p. 67) — résultat attendu théoriquement depuis 2003 mais rarement mesuré.
- **Épistémique** : un protocole d'analyse en aveugle explicite (p. 111) et la publication d'un test non passé (p. 113), qui font de la thèse un document méthodologiquement honnête sur une analyse inachevée.
