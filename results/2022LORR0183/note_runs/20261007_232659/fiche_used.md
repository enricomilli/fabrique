# FICHE DE SYNTHÈSE DE THÈSE

## Métadonnées

- **Titre** : Electrical networks in the presence of distributed energy generation - Réseaux électriques en présence de génération d'énergies distribuée
- **Auteur** : Youssef HENNANE
- **Année** : 2022
- **Établissement** : Université de Lorraine, Université Hassan II, LEMTA, ENSEM
- **Discipline** : Energie et mécanique, Génie électrique
- **Pages** : 153

## Mots-clés

** Distributed Generators ; Distributed Control ; Secondary control ; Islanded Microgrids ; Grid-connected Microgrids ; Droop control ; Power sharing ; stability analysis ; real-time hardware-in-the-loop implementation

## Thèse centrale

Le contrôle précis des micro-réseaux maillés, qu'ils soient îlotés ou connectés, est assuré par une stratégie de commande Droop non linéaire couplée à un contrôle secondaire tertiaire, puis par une approche distribuée fondée sur la théorie du consensus pour éliminer la dépendance à un nœud pilote (p. 135-136). Ces architectures garantissent l'équirépartition des puissances active et réactive, la synchronisation sans à-coup et le rétablissement des grandeurs nominales, tout en maintenant une robustesse démontrée face aux variations de topologie, aux délais de communication et aux charges à puissance constante (p. 135-136). La validité et la stabilité de ces stratégies sont confirmées par des modèles d'état validés et des tests hardware in the loop (p. 135-136). Le déploiement de ces topologies maillées multi-PCC permet de réduire la taille et le coût des systèmes de stockage nécessaires dans les zones rurales et isolées, tout en facilitant l'accès à l'électricité (p. 152).

## Questions de recherche

- Comment assurer le partage précis des puissances active et réactive ainsi que la synchronisation des sources distribuées dans des micro-réseaux à topologie maillée et reconfigurable ? (p. 20)
- Comment garantir la stabilité et la robustesse des contrôles distribués face aux variations de charges et aux modifications topologiques, tant en mode îloté qu'en mode connecté au réseau ? (p. 20-21)
- Comment surmonter la dépendance à une information unique du nœud pilote pour le partage de puissance, en se basant sur un échange d'informations entre générateurs voisins ? (p. 21)

## Réponses aux questions de recherche

- Comment assurer le partage précis des puissances active et réactive ainsi que la synchronisation des sources distribuées dans des micro-réseaux à topologie maillée et reconfigurable ? : « une stratégie de contrôle non-linéaire à base de Droop a été proposée et appliquée pour la synchronisation et le partage des puissances active et réactive entre les DGs d'un micro-réseau îloté multi-PCC maillé » (p. 135). Cette commande est ensuite adaptée pour le mode connecté et intègre des termes supplémentaires pour le réglage tertiaire (p. 135).
- Comment garantir la stabilité et la robustesse des contrôles distribués face aux variations de charges et aux modifications topologiques, tant en mode îloté qu'en mode connecté au réseau ? : « La robustesse de la stratégie de contrôle proposée, par rapport aux changements de la topologie et variations brusques des puissances des charges, est également vérifiée avec succès dans les deux modes de fonctionnement îloté ou connecté au réseau » (p. 135). L'analyse de stabilité via les valeurs propres de la matrice jacobienne montre que les paramètres les plus influents sont « les paramètres de contrôle Droop des DGs et la puissance active des charges à puissance constante (CPL) » (p. 135).
- Comment surmonter la dépendance à une information unique du nœud pilote pour le partage de puissance, en se basant sur un échange d'informations entre générateurs voisins ? : « en se basant sur cette approche basée le consensus, le contrôle de chaque DG du micro-réseau maillé ne nécessite qu'une communication à bas débit afin de connaitre la tension de sortie des DGs voisins » (p. 136). De plus, « même en cas de perte d'une information sur la tension de sortie d'un DG, les commandes Droop proposée pour les DGs assurent le partage des puissances consommée entre les DGs » (p. 136).

## Hypothèses

**Principale** : Une stratégie de contrôle de « Droop » non linéaire permet le partage précis des puissances active et réactive des DGs et leur synchronisation au micro-réseau maillé pour garantir la fonction « plug and play » (p. 20). Vérifiée : « Cette approche de contrôle Droop permet également d'intégrer le contrôle primaire, secondaire et tertiaire des micro-réseaux en agissant sur le contrôle des convertisseurs de puissance associés à ces DGs » (p. 135).
**Secondaires** :
- L'ajout d'un contrôleur tertiaire centralisé utilisant les informations du nœud pilote permet de contrôler indépendamment les puissances échangées avec le réseau principal sans affecter le partage interne (p. 21). Vérifiée : « des termes supplémentaires sont ajoutés à la commande Droop non-linéaire initiale pour assurer le réglage tertiaire afin de contrôler les puissances actives et réactives échangées avec le réseau principal » (p. 135).
- Un contrôle primaire et secondaire distribué basé sur la théorie du consensus et un réseau de communication à faible débit assure un partage de puissance précis et le rétablissement de la tension et de la fréquence sans dépendre d'une information centrale unique (p. 21). Vérifiée : « un contrôle secondaire basé sur le consensus pour rétablir la fréquence et la tension de chaque DG à leurs valeurs nominales sans affecter les propriétés de partage de la puissance est également proposé » (p. 136).

## Méthodologie

- **Approche** : Ingénierie des systèmes de puissance et automatique, axée sur la modélisation, la commande et la validation expérimentale de micro-réseaux électriques alternatifs (p. 20).
- **Méthode** : Développement et comparaison de lois de contrôle décentralisées et distribuées (méthode du statisme/« Droop » non linéaire et algorithmes de consensus pour les réglages primaire, secondaire et tertiaire) (p. 20-21). Validation par simulations (Simscape/Matlab), tests en temps réel (hardware in the loop avec Dspace et OPAL-RT), et analyse de stabilité via des modèles d'état globaux (p. 20-21). La conception des régulateurs est effectuée localement sans besoin de connaissance de la topologie du micro-réseau (p. 136). L'efficacité des contrôles proposés est prouvée par simulation et validée par des tests HIL (p. 152).
- **Corpus/Données** : Micro-réseaux maillés alternatifs à plusieurs générateurs distribués (DGs), lignes électriques et charges, étudiés en mode îloté et connecté au réseau principal (p. 20-21). Modélisation mathématique de deux micro-réseaux maillés différents contrôlés par les deux commandes distribuées proposées (p. 152).
- **Justification** : Les méthodes de contrôle existantes sont plus efficaces pour les micro-réseaux mono-PCC, laissant un besoin critique de solutions adaptées aux topologies maillées complexes et reconfigurables pour assurer stabilité et partage de puissance (p. 20). La nature intermittente des énergies renouvelables en mode îloté nécessite des éléments de stockage coûteux dans les topologies simples, justifiant le passage à des structures maillées multi-PCC pour une disponibilité énergétique accrue avec un coût réduit (p. 152).

## Fil rouge

Le contrôle distribué des générateurs (DGs) tel que défini par l'auteur (p. 135-136), reliant l'état de l'art à la commande Droop non linéaire puis à l'approche par consensus, via l'articulation progressive de la précision du partage de puissance et de la stabilité de la tension/fréquence dans les topologies maillées.

## Plan (Structure)

- **Etat de l'art** : Démontre que les méthodes de contrôle existantes sont majoritairement efficaces pour les micro-réseaux mono-PCC, justifiant ainsi le développement de stratégies dédiées aux architectures maillées (p. 20).
- **Micro-réseaux multi-sources maillés : Equirépartition des puissances et synchronisation** : Démontre qu'une stratégie de « Droop » non linéaire couplée à un contrôleur tertiaire centralisé assure un partage précis des puissances, la synchronisation sans à-coup et la robustesse face aux variations topologiques en modes îloté et connecté (p. 20-21).
- **Contrôles primaires et secondaires distribués basés sur le consensus dans les micro-réseaux maillés îlotés.** : Démontre qu'une approche fondée sur la théorie du consensus et un réseau de communication à faible débit permet de surmonter la dépendance au nœud pilote, en assurant un partage de puissance précis et le rétablissement distribué de la tension et de la fréquence (p. 21).

## Cadre théorique

- **Cadre principal** : Théorie du contrôle des systèmes de puissance (méthode du statisme/« Droop » et théories de consensus) (p. 20-21) — Structure l'analyse globale en fournissant les formalismes mathématiques pour le réglage primaire, secondaire et tertiaire des micro-réseaux maillés.
- **Cadres secondaires** :
  - Analyse de stabilité par modélisation d'état (p. 20-21) — Permet d'étudier la robustesse des contrôles distribués en intégrant dynamiquement lignes, charges et générateurs. Les valeurs propres de la matrice jacobienne du modèle d'état permettent d'analyser la stabilité du système non linéaire à chaque point de fonctionnement (p. 135).
  - Validation par hardware in the loop (Dspace/OPAL-RT) (p. 20) — Sert de cadre expérimental pour prouver l'efficacité et la faisabilité temps réel des stratégies proposées.
  - Théorie des graphes et réseaux de communication (p. 21) — Fournit le cadre d'échange d'informations entre DGs voisins nécessaire à l'algorithme de consensus.

## Concepts clés

- **CONCEPT** : MICRO-RÉSEAUX MAILLÉS
- **SENS** : « regroupement de plusieurs unités de production distribuées et de systèmes de stockage interconnectés par des lignes électriques alimentant les différentes charges qui y sont connectés » fonctionnant avec « des topologies plus évoluées à structure maillée avec plusieurs sources distribuées de natures différentes » (p. 20)
- **ORIGINE** : propre à l'auteur (retravail des concepts de micro-réseaux et de topologies maillées pour l'application aux systèmes alternatifs)
- **CONCEPT** : DROOP NON LINÉAIRE
- **SENS** : « stratégie de contrôle de "Droop" non linéaire pour le partage précis des puissances active et réactive des DGs ainsi que leurs synchronisations au micro-réseau maillés » (p. 20)
- **ORIGINE** : emprunté à la terminologie anglo-saxonne du statisme (p. 20) et retravaillé par l'auteur sous forme non linéaire pour les topologies maillées
- **CONCEPT** : CONTRÔLE PAR CONSENSUS
- **SENS** : « approche assurant le contrôle distribué des DGs des micro-réseaux en se basant sur la théorie de consensus adaptée pour le contrôle des micro-réseaux maillés îlotés » via « un réseau de communication à faible débit permettant l'échange d'informations entre les DGs voisins » (p. 21)
- **ORIGINE** : emprunté à la théorie du consensus et adapté par l'auteur au réglage primaire et secondaire des micro-réseaux
- **CONCEPT** : MICRO-RÉSEAUX MULTI-PCC
- **SENS** : « microgrids with mesh structure topologies with several distributed sources of different natures connected to its different connection points » (p. 152)
- **ORIGINE** : propre à l'auteur (spécification des micro-réseaux maillés à plusieurs points de connexion pour optimiser le stockage et la disponibilité énergétique)

## Ancrage empirique (ou concret)

- Validation par simulations sous Simscape (Matlab) et tests en temps réel (hardware in the loop) avec Dspace et OPAL-RT pour les stratégies de « Droop » non linéaire (p. 20).
- Développement et validation de modèles d'état globaux intégrant lignes électriques, charges et générateurs avec contrôleurs, utilisés pour l'analyse de stabilité et de robustesse en modes îloté et connecté (p. 20-21).
- Étude comparative des commandes distribuées du chapitre 2 et du chapitre 3 pour le réglage primaire et le partage des puissances active et réactive (p. 21).
- Tests considérant différentes valeurs du délai de communication mettant en évidence que la stratégie proposée est « suffisamment robuste face au retard de communication pour être appliquée de manière pratique » (p. 135).
- Modélisation mathématique et analyse de stabilité de deux micro-réseaux maillés distincts contrôlés par les deux approches distribuées proposées (p. 152).

## Opposition / Contre-argumentation

- Les méthodes de contrôle existantes (décentralisées, centralisées, classiques) : « la plupart des méthodes de contrôle existantes sont souvent plus efficaces dans le cas des micro-réseaux mono-PCC (non maillés) » (p. 20) — Lacune de la littérature justifiant le besoin de nouvelles stratégies pour les topologies maillées.
- La dépendance à une information centrale unique : « Le point faible de la stratégie de contrôle de "Droop" non linéaire proposée... est sa dépendance à une information unique du nœud pilote pour assurer le partage précis des puissances entre les DGs » (p. 21) — Limite technique identifiée et surmontée par la méthode de consensus.
- Complexité des impédances de ligne : « elles ne sont souvent pas efficaces pour le contrôle des micro-réseaux maillés, et notamment pour le partage des puissances entre leurs DGs, en raison des complexités et des couplages introduites par les impédances non-négligeables des lignes interconnectant les différents nœuds » (p. 135) — Résultat confirmé par l'auteur expliquant l'échec des méthodes classiques.

## Apport principal

- **Méthodologique** : Développement d'une stratégie de « Droop » non linéaire et d'une approche de contrôle distribué basée sur le consensus, spécifiquement adaptées aux micro-réseaux maillés à topologie complexe et reconfigurable (p. 20-21). La conception des régulateurs est effectuée localement sans besoin de connaissance de la topologie du micro-réseau (p. 136).
- **Empirique** : Validation expérimentale en temps réel (hardware in the loop) et modélisation d'état complète intégrant lignes, charges et générateurs, prouvant la robustesse et la stabilité du partage de puissance et de la synchronisation en modes îloté et connecté (p. 20-21). Les tests confirment la robustesse face aux délais de communication et aux variations brusques de charges (p. 135).
- **Théorique** : Extension de la théorie du consensus au réglage primaire et secondaire des micro-réseaux maillés, permettant de supprimer la dépendance au nœud pilote et d'assurer le rétablissement distribué de la tension et de la fréquence (p. 21). L'analyse de stabilité identifie précisément les paramètres critiques (paramètres Droop et charges CPL) influençant la stabilité du système non linéaire (p. 135). Démonstration que les architectures multi-PCC maillées réduisent la dépendance aux grands systèmes de stockage face à l'intermittence des énergies renouvelables en zones isolées (p. 152).
