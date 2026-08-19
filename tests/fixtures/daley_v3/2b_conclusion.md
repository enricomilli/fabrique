## these_centrale
La thèse démontre que la reconstruction du lentillage gravitationnel du CMB à partir des données SPT-3G atteint une sensibilité sans précédent, permettant de contraindre les paramètres cosmologiques et de tester le modèle ΛCDM avec une précision inédite (p. 130). Ce résultat s'obtient en combinant un pipeline d'estimateur quadratique rigoureux sur un grand champ avec une validation croisée via une méthode bayésienne optimale sur un champ profond, ce qui réduit significativement la variance d'échantillonnage et affine les mesures de $H_0$ et $S_8$ (p. 129-130).

## questions_recherche
- « comment les tensions croissantes entre les sondes de l'univers primitif et celles de l'univers tardif concernant $H_0$ et $S_8$ peuvent-elles être résolues ? » (p. 19)
- « dans quelle mesure les cartes de lentillage à haute résolution du SPT-3G peuvent-elles réduire la variance d'échantillonnage des modes B de lentillage pour affiner les contraintes sur le rapport tenseur-scalaire $r$ ? » (p. 24)
- « comment modéliser et corriger efficacement le mélange de modes directionnel induit par les scans en déclinaison constante dans la projection ProjZEA ? » (p. 29)

## reponses_questions
- **Tensions $H_0$/$S_8$** : « les contraintes sur les paramètres du SPT-3G 2019+2020 jetteront un nouveau regard sur les tensions entre les estimations de $H_0$ et $S_8$ provenant des mesures de l'univers primitif et de l'univers tardif » (p. 130).
- **Delensing et rapport $r$** : « ces résultats seront critiques pour placer les contraintes les plus serrées possibles sur le rapport tenseur-scalaire $r$, surtout compte tenu de l'incertitude entourant l'avenir du composant du Pôle Sud de l'expérience CMB-S4 proposée » (p. 130).
- **Correction ProjZEA/mélange de modes** : Pas de réponse explicite dans la conclusion.

## hypotheses
**Principale** : « l'analyse de lentillage SPT-3G 2019+2020 mesurera le spectre de puissance de lentillage avec un rapport signal/bruit proche de 40σ, avec une contrainte de 2-3 % sur l'amplitude du spectre de puissance de lentillage $A_\phi$ » (p. 130).
**Secondaires** :
- « la méthode bayésienne atteindra des contraintes 17 % plus serrées sur l'amplitude du spectre de puissance de lentillage $A_\phi$ par rapport au pipeline de l'estimateur quadratique » (p. 129).
- « les cartes de lentillage SPT-3G seront excellentes pour les corrélations croisées, en particulier compte tenu du rapport signal/bruit élevé de la reconstruction de polarisation relativement exempte de contamination par les avant-plans » (p. 130).

## methodologie
- **Approche** : Analyse observationnelle et statistique de données cosmologiques millimétriques pour contraindre les paramètres du modèle standard et cartographier la matière noire via le lentillage gravitationnel (p. 17-18).
- **Méthode** : Reconstruction du potentiel de lentillage via l'estimateur quadratique standard (filtrage inverse de variance, normalisation, débiaisage) et comparaison avec une inférence bayésienne conjointe optimale ; approximation du ciel plat avec projection ProjZEA ; transformations de Fourier rapides (FFT) ; décomposition E/B purifiée ; estimation du spectre de puissance avec facteur d'obfuscation pour éviter le biais de confirmation (p. 26-31, p. 129-130).
- **Corpus/Données** : Deux années de données SPT-3G (saisons 2019-2020) couvrant 1500 deg², 100 deg² de données SPTpol profondes, et données de référence de Planck, BICEP/Keck, DES, Euclid (p. 20-22, p. 129-130).
- **Justification** : La haute résolution angulaire et le faible bruit du SPT-3G sont indispensables pour reconstruire le lentillage aux petites échelles, corriger les systématiques de projection non-conforme, et fournir des cartes précises pour le delensing des expériences dédiées aux ondes gravitationnelles primordiales et les corrélations croisées avec les relevés optiques (p. 24-25, p. 130).

## fil_rouge
La reconstruction optimale du lentillage gravitationnel du CMB, telle que définie par l'auteur (p. 129), reliant l'analyse des données SPTpol à celle des données SPT-3G via la validation croisée des estimateurs quadratique et bayésien et la correction systématique des effets de projection dans l'approximation du ciel plat.

## plan
- **Chapter 1 Introduction** : Démontre que les tensions cosmologiques et les capacités techniques du SPT motivent une nouvelle génération d'analyses de lentillage en présentant le modèle ΛCDM, l'histoire du télescope et les défis de l'approximation du ciel plat.
- **Chapter 2 Gravitational Lensing of the CMB** : Démontre que la déformation des trajectoires des photons du CMB encode des informations cosmologiques en présentant les bases du lentillage faible et le formalisme de l'estimateur quadratique de Hu & Okamoto.
- **Chapter 3 SPTpol Lensing** : Démontre que l'inférence bayésienne conjointe offre des performances supérieures à la méthode standard en comparant les deux estimateurs sur 100 deg² de données SPTpol et en validant la nouvelle méthode.
- **Chapter 4 SPT-3G Lensing** : Démontre que l'application rigoureuse de l'estimateur quadratique à deux années de données SPT-3G produit les cartes de lentillage les plus sensibles à ce jour en détaillant la chaîne de traitement, les tests de cohérence et les corrections systématiques.
- **Chapter 5 Summary and Conclusions** : Démontre que les résultats consolident les contraintes cosmologiques et ouvrent la voie à de futures analyses en synthétisant les découvertes et en discutant des perspectives du domaine.

## cadre_theorique
- **Cadre principal** : Modèle ΛCDM (p. 128, p. 130) — structure l'interprétation globale des anisotropies du CMB, de la croissance des structures et des tensions observationnelles sur $H_0$ et $S_8$.
- **Cadres secondaires** :
  - Hu & Okamoto (2002) — estimateur quadratique de reconstruction du lentillage (p. 128) — fournit le formalisme mathématique de base pour la reconstruction du potentiel de lentillage à partir des données observées.
  - Millea et al. (2021) — méthode bayésienne optimale de reconstruction conjointe (p. 129) — sert de cadre d'inférence avancé permettant d'exploiter tous les ordres du signal de lentillage lorsque le bruit approche le plancher des modes B.
  - Approximation du ciel plat & ProjZEA (p. 128) — formalisme de projection et de traitement numérique permettant d'analyser efficacement les champs partiels du ciel tout en gérant les distorsions angulaires et le mélange de modes.

## concepts_cles
- **ESTIMATEUR QUADRATIQUE**
- **SENS** : « le formalisme de la technique de reconstruction par estimateur quadratique de Hu & Okamoto (2002) » (p. 128) — ou [NON DÉFINI EXPLICITEMENT] suivi d'une reconstruction en 1 phrase : méthode statistique standard qui extrait le potentiel de lentillage en filtrant les corrélations non-gaussiennes induites par le lentillage dans les cartes de température et de polarisation.
- **ORIGINE** : emprunté à Hu & Okamoto (2002) et retravaillé par l'auteur pour le pipeline SPT-3G avec normalisation et débiaisage spécifiques
- **RECONSTRUCTION BAYÉSIENNE OPTIMALE**
- **SENS** : « une méthode bayésienne optimale qui exploite tous les ordres du signal de lentillage » (p. 129)
- **ORIGINE** : propre à l'auteur dans ce contexte de comparaison directe, développée pour surpasser les limites de l'estimateur quadratique aux faibles niveaux de bruit
- **FACTEUR D'OBFUSCATION**
- **SENS** : « l'utilisation d'un facteur d'obfuscation pour éviter le biais de confirmation » (p. 129)
- **ORIGINE** : propre à l'auteur pour garantir l'objectivité des choix d'analyse avant la finalisation des bandpuissances de lentillage

## ancrage_empirique
- L'analyse SPT-3G 2019+2020 produira des cartes de lentillage avec des niveaux de bruit par mode inférieurs aux mesures récentes de Planck et ACT d'un facteur 3 à 4 (p. 129).
- La méthode bayésienne a atteint des contraintes 17 % plus serrées sur l'amplitude du spectre de puissance de lentillage $A_\phi$ par rapport au pipeline de l'estimateur quadratique sur les données SPTpol (p. 129).
- Le spectre de puissance de lentillage sera mesuré avec un rapport signal/bruit proche de 40σ, permettant une contrainte de 2-3 % sur $A_\phi$ et des mesures de $H_0$ et $S_8$ comparables aux meilleures contraintes de Planck et ACT (p. 130).

## opposition
- **Estimateur quadratique vs optimal** : « les niveaux de bruit qui approchent le plancher de bruit des modes B de lentillage où l'estimateur quadratique devient sous-optimal, motivant l'utilisation d'une méthode bayésienne optimale » (p. 129). L'auteur nuance la suffisance de l'estimateur standard en démontrant expérimentalement ses limites aux faibles bruits et valide la supériorité de l'approche bayésienne (p. 129).
- **Biais de confirmation dans l'analyse** : « l'utilisation d'un facteur d'obfuscation pour éviter le biais de confirmation » (p. 129). L'auteur rejette la pratique courante de finaliser les choix d'analyse en regardant directement les résultats, imposant une obfuscation stricte des bandpuissances avant validation (p. 129).

## apport_principal
- **Empirique** : Production des cartes de lentillage du CMB les plus sensibles à ce jour à partir de deux années de données SPT-3G, atteignant un rapport signal/bruit de ~40σ et une précision de 2-3 % sur $A_\phi$, fournissant un outil direct pour le delensing et les corrélations croisées (p. 129-130).
- **Méthodologique** : Validation expérimentale de la reconstruction bayésienne optimale sur des données réelles, démontrant une amélioration de 17 % des contraintes par rapport à l'estimateur quadratique standard et établissant un pipeline rigoureux avec obfuscation pour éviter les biais de confirmation (p. 129).
- **Critique** : Mise en évidence des limites pratiques de l'estimateur quadratique aux faibles niveaux de bruit et démonstration que les cartes SPT-3G offriront des contraintes indépendantes et puissantes sur $H_0$ et $S_8$, contribuant à trancher les tensions actuelles du modèle ΛCDM (p. 129-130).