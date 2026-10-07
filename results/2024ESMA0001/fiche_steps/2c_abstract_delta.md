## these_centrale
[INCHANGÉ]

## questions_recherche
[INCHANGÉ]

## reponses_questions
[INCHANGÉ]

## hypotheses
[INCHANGÉ]

## methodologie
- **Approche** : Expérimentale et computationnelle, centrée sur la configuration dynamique de réseaux industriels via simulation. (p. 29-30)
- **Méthode** : Apprentissage par renforcement profond (Deep Reinforcement Learning) pour décider de l'ordonnancement des flux dans les réseaux TSN, couplé à une validation a posteriori par calcul réseau (« Network Calculus ») pour garantir la faisabilité des configurations. (p. 14, p. 30, p. 120)
- **Corpus/Données** : Réseaux TSN simulés avec des commutateurs, des flux de données, des topologies changeantes (maillée, en anneau) et des configurations de flux. (p. 29-30, p. 117)
- **Justification** : « la plupart des méthodes existantes, basées sur des solveurs ou des heuristiques, se heurtent soit au problème du temps nécessaire avant d'arriver à un résultat, soit à la dynamicité du système. » (p. 30)

## fil_rouge
[INCHANGÉ]

## plan
[INCHANGÉ]

## cadre_theorique
[INCHANGÉ]

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
[INCHANGÉ]

## opposition
[INCHANGÉ]

## apport_principal
[INCHANGÉ]