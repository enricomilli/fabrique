## these_centrale
« Le but de cette thèse est de montrer qu'un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux, en étant capable de s'adapter à un changement de topologie et dans un délai raisonnable (de l'ordre de la minute). » (p. 30) Cet agent utilise l'apprentissage par renforcement pour déterminer rapidement les configurations de TSN et réagir aux événements émergents. (p. 30)

## questions_recherche
- « configurer l'ordonnancement des flux dans TSN peut mener à un problème NP-difficile » (p. 30)
- « cette configuration se doit d'être dynamique. Pour relever ces défis un algorithme capable de déterminer rapidement les configurations de TSN s'impose. » (p. 30)
- « Le but de cette thèse est de montrer qu'un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux, en étant capable de s'adapter à un changement de topologie et dans un délai raisonnable (de l'ordre de la minute). » (p. 30)

## reponses_questions
[NULL]

## hypotheses
**Principale** : « Le but de cette thèse est de montrer qu'un agent peut, à l'aide de méthode d'IA, décider un ordonnancement sans connaissances préalables sur les flux, en étant capable de s'adapter à un changement de topologie et dans un délai raisonnable (de l'ordre de la minute). » (p. 30)
**Secondaires** :
- « Une manière d'atteindre tous ces objectifs consiste à utiliser les techniques de l'Intelligence Artificielle (IA). » (p. 30)
- « l'utilisation de méthodes d'IA permet d'obtenir des résultats adaptés, tout en offrant une grande flexibilité et une prise de décision en rapide » (p. 30)

## methodologie
- **Approche** : Expérimentale et computationnelle, centrée sur la configuration dynamique de réseaux industriels. (p. 29-30)
- **Méthode** : Apprentissage par renforcement pour décider de l'ordonnancement des flux dans les réseaux TSN. (p. 30)
- **Corpus/Données** : Réseaux TSN avec des commutateurs, des flux de données, des topologies changeantes et des configurations de flux. (p. 29-30)
- **Justification** : « la plupart des méthodes existantes, basées sur des solveurs ou des heuristiques, se heurtent soit au problème du temps nécessaire avant d'arriver à un résultat, soit à la dynamicité du système. » (p. 30)

## fil_rouge
L'ordonnancement dynamique des flux dans les réseaux TSN tel que défini par l'auteur (p. 29-30), reliant la problématique des usines 4.0/5.0 à la validation des contributions via l'apprentissage par renforcement.

## plan
- **I Contexte technologique** : Démontre que la transition vers l'industrie 4.0/5.0 impose des défis de latence, d'interopérabilité et de sécurité qui nécessitent le recours aux standards TSN et à l'intelligence artificielle.
- **II Contributions** : Démontre qu'un agent basé sur l'apprentissage par renforcement peut déterminer dynamiquement un ordonnancement TSN, soit commun à tous les commutateurs, soit spécifique à chaque commutateur, dans un délai raisonnable.

## cadre_theorique
- **Cadre principal** : Time Sensitive Networking (TSN) / IEEE 802.1Qbv — ensemble de standards temps-réel pour Ethernet (p. 29) — structure l'analyse globale en définissant les mécanismes d'ordonnancement, de synchronisation et de déterminisme à configurer.
- **Cadres secondaires** :
  - Apprentissage par renforcement — méthode d'IA (p. 30) — sert d'outil d'analyse et de prise de décision pour résoudre le problème NP-difficile de l'ordonnancement TSN.
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

## ancrage_empirique
[NULL]

## opposition
- « la plupart des méthodes existantes, basées sur des solveurs ou des heuristiques, se heurtent soit au problème du temps nécessaire avant d'arriver à un résultat, soit à la dynamicité du système. » (p. 30)
- « Les réseaux Ethernet traditionnels ont souvent du mal à répondre à ces exigences. » (p. 28)

## apport_principal
- **Méthodologique** : L'introduction d'un agent basé sur l'apprentissage par renforcement capable de configurer dynamiquement l'ordonnancement TSN sans connaissances préalables, surpassant les solveurs analytiques traditionnels en temps de calcul. (p. 30)
- **Théorique** : La démonstration que l'IA peut résoudre un problème NP-difficile de configuration réseau industriel tout en s'adaptant aux changements de topologie en un délai de l'ordre de la minute. (p. 30)