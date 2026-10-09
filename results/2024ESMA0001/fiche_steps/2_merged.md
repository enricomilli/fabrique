<!-- thesis: 2024ESMA0001 -->
<!-- intro pp.28-31 -->
<!-- conclusion pp.116-123 -->
<!-- abstract p.14 -->

# Step 2 — content (intro + conclusion + abstract merged)

## these_centrale

Cette thèse démontre qu'un agent basé sur l'apprentissage par renforcement est capable de décider, dynamiquement, un ordonnancement pour les réseaux TSN dans le cadre du mécanisme TAS, sans avoir de connaissances préalables sur les flux (p. 117). Ce résultat est atteint en traduisant le problème de configuration en un processus de décision markovien (MDP) adéquat, où la formulation précise de la fonction de récompense et la maîtrise de l'espace d'actions permettent de générer des configurations valides dans un délai de l'ordre de la minute (p. 116).

## questions_recherche

- « configurer l'ordonnancement des flux dans TSN peut mener à un problème NP-difficile » (p. 30)
- « cette configuration se doit d'être dynamique. Pour relever ces défis un algorithme capable de déterminer rapidement les configurations de TSN s'impose. » (p. 30)
- « Le but de cette thèse est de montrer qu'un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux, en étant capable de s'adapter à un changement de topologie et dans un délai raisonnable (de l'ordre de la minute). » (p. 30)

## reponses_questions

- **Question 1 (NP-difficile)** : « La clé pour atteindre cet objectif consiste à traduire le problème en un MDP adéquat. La bonne formulation de la récompense, en particulier, est critique. » (p. 116)
- **Question 2 (Dynamique & rapide)** : « L'agent de configuration est capable de configurer TSN sur des topologies réseaux différentes, dans un temps raisonnable, sans avoir de connaissances préalables sur les flux et sans être affecté par le nombre ni la position dans la topologie des clients/applications. » (p. 117)
- **Question 3 (But global)** : « En conclusion, cette thèse de doctorat a apporté des contributions significatives à la configuration de l'ordonnancement du trafic dans les réseaux TSN. » (p. 117)

## hypotheses

**Principale** : « Le but de cette thèse est de montrer qu'un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux, en étant capable de s'adapter à un changement de topologie et dans un délai raisonnable (de l'ordre de la minute). » (p. 30)
**Secondaires** :
- « Une manière d'atteindre tous ces objectifs consiste à utiliser les techniques de l'Intelligence Artificielle (IA). » (p. 30)
- « l'utilisation de méthodes d'IA permet d'obtenir des résultats adaptés, tout en offrant une grande flexibilité et une prise de décision en rapide » (p. 30)
- « Cette étude confirme l'intérêt d'utiliser le RL afin de trouver l'ordonnancement du TAS dans les réseaux TSN. » (p. 117)

## methodologie

- **Approche** : Expérimentale et computationnelle, centrée sur la configuration dynamique de réseaux industriels via simulation. (p. 29-30)
- **Méthode** : Apprentissage par renforcement profond (Deep Reinforcement Learning) pour décider de l'ordonnancement des flux dans les réseaux TSN, couplé à une validation a posteriori par calcul réseau (« Network Calculus ») pour garantir la faisabilité des configurations. (p. 14, p. 30, p. 120)
- **Corpus/Données** : Réseaux TSN simulés avec des commutateurs, des flux de données, des topologies changeantes (maillée, en anneau) et des configurations de flux. (p. 29-30, p. 117)
- **Justification** : « la plupart des méthodes existantes, basées sur des solveurs ou des heuristiques, se heurtent soit au problème du temps nécessaire avant d'arriver à un résultat, soit à la dynamicité du système. » (p. 30)

## fil_rouge

La formulation d'un MDP (Processus de Décision Markovien) adapté à l'ordonnancement TSN tel que défini par l'auteur (p. 116), reliant la modélisation du problème NP-difficile à la validation expérimentale de l'agent via la conception itérative de sa fonction de récompense.

## plan

- **I Contexte technologique** : Démontre que la transition vers l'industrie 4.0/5.0 impose des défis de latence, d'interopérabilité et de sécurité qui nécessitent le recours aux standards TSN et à l'intelligence artificielle.
- **II Contributions** : Démontre qu'un agent basé sur l'apprentissage par renforcement peut déterminer dynamiquement un ordonnancement TSN, soit commun à tous les commutateurs, soit spécifique à chaque commutateur, dans un délai raisonnable.

## cadre_theorique

- **Cadre principal** : IEEE 802.1Qbv / Time Sensitive Networking (TSN) — ensemble de standards temps-réel pour Ethernet (p. 29) — structure l'analyse globale en définissant les mécanismes d'ordonnancement (TAS), de synchronisation et de déterminisme à configurer.
- **Cadres secondaires** :
  - Apprentissage par renforcement (RL) — paradigme d'IA (p. 116) — sert d'outil d'analyse et de prise de décision pour résoudre le problème NP-difficile de l'ordonnancement TSN via la modélisation en MDP.
  - Calcul réseau (« Network Calculus ») — méthode d'analyse pire-cas des délais (p. 120) — sert de cadre de validation formelle pour garantir que les configurations générées par l'agent respectent les contraintes temporelles avant déploiement.
  - Industrie 4.0/5.0 — paradigme de fabrication numérique et collaborative (p. 28-29) — fournit le contexte applicatif et les exigences de connectivité, de latence et de reconfiguration dynamique.

## concepts_cles

- **CONCEPT** : TIME SENSITIVE NETWORKING (TSN)
- **SENS** : « un ensemble de standards visant à ajouter des caractéristiques temps-réel à Ethernet en fournissant des capacités de déterminisme, de bande passante garantie et de synchronisation du temps dans les réseaux Ethernet traditionnels. » (p. 29)
- **ORIGINE** : propre à l'auteur (mobilisation du standard IEEE 802.1Qbv)
- **CONCEPT** : ORDONNANCEMENT DYNAMIQUE
- **SENS** : « cette configuration se doit d'être dynamique. » (p. 30)
- **ORIGINE** : propre à l'auteur (redéfini comme capacité de réagir aux changements de topologie et d'introduction de nouveaux flux)
- **CONCEPT** : AGENT D'IA POUR LA CONFIGURATION RÉSEAU
- **SENS** : « un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux » (p. 30)
- **ORIGINE** : propre à l'auteur (conception d'un agent basé sur l'apprentissage par renforcement)
- **CONCEPT** : FONCTION DE RÉCOMPENSE (RL)
- **SENS** : « La bonne formulation de la récompense, en particulier, est critique. » (p. 116)
- **ORIGINE** : propre à l'auteur (redéfinie comme levier central pour guider l'agent vers des configurations valides et résoudre le problème des récompenses trop maigres)
- **CONCEPT** : RÉSEAUX OUVERTS VS FERMÉS
- **SENS** : « Ces méthodes sont bonnes pour les réseaux fermés (lorsque tous les flux sont identifiés à l'avance et que la topologie du réseau est fixe). Cependant, dans un réseau ouvert (où plus de flux sont ajoutés au réseau et la topologie du réseau est dynamique), l'ordonnancement dans TSN peut entraîner des problèmes NP-difficile. » (p. 14)
- **ORIGINE** : propre à l'auteur (distinction opérationnelle pour justifier le passage des solveurs exacts/heuristiques à l'apprentissage par renforcement)

## ancrage_empirique

- L'agent privilégie très clairement les flux critiques au détriment des flux BE (Best Effort), car la récompense initiale ne prenait en compte que les flux critiques (p. 117).
- La configuration nécessite un module de validation par calcul réseau pour vérifier les latences pires cas ; si elles sont supérieures aux échéances, la CNC redemande une configuration avec des contraintes de temps plus exigeantes (p. 121).
- L'agent est efficace sur un nombre de commutateurs fixe, car l'espace des actions ne peut varier au cours de l'entraînement (p. 117).

## opposition

- « la plupart des méthodes existantes, basées sur des solveurs ou des heuristiques, se heurtent soit au problème du temps nécessaire avant d'arriver à un résultat, soit à la dynamicité du système. » (p. 30) [Lacune de la littérature]
- « Les réseaux Ethernet traditionnels ont souvent du mal à répondre à ces exigences. » (p. 28) [Lacune technologique]
- « Tout d'abord, comme on l'a vu au chapitre précédent, l'agent privilégie très clairement les flux critiques au détriment des flux BE. » (p. 117) [Résultat contre-intuitif / limite empirique]

## apport_principal

- **Méthodologique** : L'intégration d'un agent RL dans une architecture SDN centralisée, couplée à un module de validation par calcul réseau, permettant de générer et vérifier dynamiquement des configurations TSN sans connaissances préalables des flux. (p. 117, p. 120)
- **Théorique** : La démonstration qu'une formulation précise de MDP et de fonction de récompense permet de contourner les limitations temporelles des solveurs analytiques face au problème NP-difficile de l'ordonnancement TSN, tout en s'adaptant à des topologies maillées ou en anneau. (p. 116, p. 117)

---

# Step 2 — scoring

## these_centrale
7 | La formulation est bonne mais manque de nuances sur les limites (ex. taille du réseau, type de topologie spécifique) mentionnées dans la conclusion. | Conclusion générale et perspectives

## questions_recherche
8 | Les questions sont bien identifiées mais pourraient être affinées pour distinguer clairement les aspects techniques (TAS) des aspects méthodologiques (RL). | 5 État de l'art

## reponses_questions
7 | Les réponses sont partielles ; il manque des détails sur la manière dont l'agent gère spécifiquement les changements de topologie (Q2) et la validation formelle (Q1). | 7 Configurer le TAS de manière identique ; 8 Configurer le TAS de manière individuelle

## hypotheses
6 | L'hypothèse principale est claire, mais les hypothèses secondaires sur les mécanismes internes du RL (exploration/exploitation, convergence) sont absentes. | 4 Apprentissage par renforcement

## methodologie
8 | La méthodologie est bien décrite mais manque de détails sur les métriques d'évaluation précises et les paramètres d'entraînement. | 5 État de l'art ; 6 Introduction aux contributions

## fil_rouge
7 | Le fil rouge est identifié mais pourrait être enrichi par la progression logique entre les deux types de configuration (identique vs individuelle). | 6 Introduction aux contributions ; 7 Configurer le TAS de manière identique

## plan
9 | Le plan est bien résumé mais manque de détails sur les sous-parties clés de chaque chapitre. | 1 Les délais de bout en bout ; 2 Time-Sensitive Networking

## cadre_theorique
8 | Le cadre est bien défini mais manque de liens explicites avec les travaux antérieurs cités dans l'état de l'art. | 5 État de l'art

## concepts_cles
6 | Les concepts sont bien définis mais manquent de profondeur sur les implications théoriques et pratiques de chaque concept. | 2 Time-Sensitive Networking ; 4 Apprentissage par renforcement

## ancrage_empirique
5 | Les résultats empiriques sont mentionnés mais manquent de données quantitatives précises (ex. temps de convergence, taux de succès). | 7 Configurer le TAS de manière identique ; 8 Configurer le TAS de manière individuelle

## opposition
8 | Les oppositions sont bien identifiées mais pourraient être enrichies par des citations directes des auteurs critiqués. | 5 État de l'art

## apport_principal
7 | L'apport est bien résumé mais manque de détails sur les implications futures et les perspectives de recherche. | Conclusion générale et perspectives
