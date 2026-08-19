"""
fiche/prompts.py — every prompt string of the fiche pipeline, verbatim.

These strings ARE the validated behaviour (v3, 2026-08-19). Do not edit
them outside an A/B experiment; tests/test_frozen_surface.py hashes each one
against tests/golden/prompt_hashes.json.

Layout
  STRUCTURE_SYSTEM / STRUCTURE_PROMPT          step 1  — metadata + TOC (compact text format)
  STEP2_SECTIONS                               the 12 grille slugs, canonical order
  SECTION_DESCRIPTIONS                         shared by 2a / 2b / 2c
  C12_CITATION_RULE                            one page per proposition (appended to every system prompt)
  STEP2_SYSTEM                                 system prompt of 2a / 2b / 2c / 2d
  STEP2A_INTRO_PROMPT                          2a — introduction
  STEP2B_CONCLUSION_PROMPT                     2b — conclusion (refines 2a)
  STEP2C_ABSTRACT_PROMPT                       2c — abstract, delta mode ([INCHANGÉ] keeps 2b)
  STEP2C_UNCHANGED_RE                          the delta sentinel
  STEP2C_SCORE_PROMPT                          2d — severe scoring + TOC refs (routes step 3)
  STEP3A_SYSTEM / STEP3A_PROMPT                3a — methodology chapter → methodologie + hypotheses
  STEP3B_SYSTEM / STEP3B_PROMPT                3b — theory chapter(s) → concepts_cles
  GRILLE_HEADINGS                              slug → heading of the rendered fiche (grille order)

Every `*_PROMPT` is a str.format template; the placeholders are filled in
structure.py / step2.py / step3.py.
"""
import re

# ── Step 1 — structure extraction ─────────────────────────────────────────────

STRUCTURE_SYSTEM = (
    "Tu es un expert en analyse de thèses académiques françaises, espagnoles "
    "et anglophones. Ton rôle est d'extraire des informations structurelles à "
    "partir du texte brut des premières pages d'une thèse : métadonnées et "
    "table des matières. Tu réponds UNIQUEMENT en JSON strict, sans préambule, "
    "sans commentaire, sans markdown fences."
)

STRUCTURE_PROMPT = """\
Voici le texte brut des {n_pages} premières pages d'une thèse de doctorat,
extrait d'un document PDF. Le texte peut contenir :
  - une page de titre (université, auteur, directeur, jury, discipline, date)
  - un résumé et/ou abstract
  - des remerciements
  - une table des matières (qui peut apparaître sous forme de texte libre
    avec des points de conduite « ........ », ou sous forme de tables HTML
    `<table><tr><td>titre</td><td>page</td></tr></table>`)
  - le début de l'introduction
Chaque page est marquée par un séparateur `<<< PAGE N >>>` indiquant le
numéro de page BRUT (position physique dans le fichier PDF, pouvant différer
du numéro imprimé dans la thèse).

===== DÉBUT DU BLOB =====
{blob}
===== FIN DU BLOB =====

## TÂCHE

Produis une sortie en TEXTE BRUT (PAS de JSON) en DEUX sections :
(1) les métadonnées, une clé par ligne, (2) la table des matières, une
entrée par ligne. Format compact conçu pour minimiser le nombre de tokens.

### Section 1 — Métadonnées

Exactement ces 6 lignes, dans cet ordre, format `CLÉ: valeur` :

TITRE: <titre complet, sous-titre inclus si présent>
AUTEUR: <nom complet>
ANNEE: <année de soutenance, ex. 2024>
ETABLISSEMENT: <université + laboratoire/école doctorale si présent>
DISCIPLINE: <mention ou discipline>
MOTS_CLES: <mot-clé 1; mot-clé 2; mot-clé 3; ...>

Règles :
  - Une seule ligne par champ (pas de saut de ligne à l'intérieur d'une valeur).
  - Si une information est absente du blob, écris `null` après les deux-points.
  - Les mots-clés sont séparés par `; ` (point-virgule espace). Liste vide → `null`.
  - NE PAS inventer. NE PAS inclure le résumé/abstract. NE PAS ajouter d'autres champs.

### Section 2 — Table des matières

Après les métadonnées, laisse UNE ligne vide puis écris exactement cette
ligne marqueur :

TOC

Puis une ligne par entrée de la TOC, dans leur ordre exact d'apparition,
au format :

<level>|<page_start>|<title>

Où :
  - `<level>` = profondeur hiérarchique (entier) :
      · 0 = parties de plus haut niveau (Introduction, Partie I, Chapitre 1,
            Conclusion, Bibliographie, Annexes, Résumé, Abstract, …)
      · 1 = sections numérotées "X.Y" (ex. "1.1. Titre")
      · 2 = sous-sections "X.Y.Z" (ex. "1.1.1. Titre")
      · 3 = puces lettrées "a)", "b)"
      · 4+ = niveaux plus profonds si présents
  - `<page_start>` = numéro de page IMPRIMÉ dans la TOC (entier), ou `null`
                     si le numéro n'est pas lisible. C'est le numéro écrit à
                     côté de l'entrée, PAS le numéro brut `<<< PAGE N >>>`.
  - `<title>` = titre verbatim, SANS les points de conduite. Tout ce qui
                suit le DEUXIÈME `|` est le titre (donc un `|` littéral dans
                le titre serait préservé — mais c'est très rare).

Exemple :

0|1|RÉSUMÉ
0|4|ABSTRACT
0|11|Introduction
0|39|Chapitre 1. Titre du chapitre
1|40|1.1. Sous-section
2|41|1.1.1. Sous-sous-section
1|55|1.2. Autre sous-section
0|73|Chapitre 2
0|590|Conclusion
0|605|Bibliographie

## RÈGLES IMPORTANTES

1. Ne JAMAIS inventer d'entrées. Si une entrée est tronquée ou illisible,
   inclus-la telle quelle avec `null` pour la page si le numéro manque.
2. Les numéros de page sont les numéros IMPRIMÉS (écrits dans la TOC source).
   Ignore complètement les séparateurs `<<< PAGE N >>>`.
3. Reconnais à la fois les TOC en texte libre (avec points de conduite) et
   les TOC sous forme de tables HTML `<td>titre</td><td>page</td>`.
4. Préserve la langue originale des titres.
5. Si la thèse n'a pas de TOC visible dans le blob, écris la ligne `TOC` puis
   AUCUNE entrée (section 2 vide).
6. Inclus TOUTES les entrées visibles : front matter (Résumé, Abstract,
   Remerciements), corps, et back matter (Conclusion, Bibliographie, Annexes).
7. Conserve l'ordre exact d'apparition dans la TOC source.
8. NE PAS inclure de `page_end` — il sera calculé ensuite.

## FORMAT DE RÉPONSE

Commence DIRECTEMENT par `TITRE:` (pas de préambule, pas de markdown, pas
de ``` fences). Termine par la dernière entrée TOC (pas de texte après).
Aucune indentation, aucun espace superflu.
"""


# ── Step 2 — the 12 grille sections ───────────────────────────────────────────

STEP2_SECTIONS = [
    "these_centrale",
    "questions_recherche",
    "reponses_questions",
    "hypotheses",
    "methodologie",
    "fil_rouge",
    "plan",
    "cadre_theorique",
    "concepts_cles",
    "ancrage_empirique",
    "opposition",
    "apport_principal",
]


# ── Section descriptions (shared between 2a and 2b prompts) ─────────────────
#
# These descriptions are short on purpose: the model already knows what each
# grille section is from training; we just need to disambiguate edge cases
# (questions vs hypotheses, opposition is gaps OR contradicted predictions).

SECTION_DESCRIPTIONS = """\
- `these_centrale` — L'argument principal DÉMONTRÉ (au présent, depuis la conclusion). Distinct des « nous montrerons » de l'intro. Format : 2-3 phrases MAXIMUM, concises et précises. Première phrase = l'affirmation centrale. Deuxième phrase = le mécanisme ou le processus démontré. Si l'auteur formule sa thèse en phases/étapes, les nommer.
- `questions_recherche` — Les questions ouvertes au départ. Interrogatives ou objectifs (« il s'agit de comprendre… »).
- `reponses_questions` — Les réponses explicites que la conclusion apporte à chaque question de recherche. Pour CHAQUE question, cite la réponse verbatim (« … » + page). Si une question reste sans réponse, indique-le. Cette section est `[NULL]` dans l'introduction et ne se remplit qu'avec la conclusion.
- `hypotheses` — Propositions VÉRIFIABLES, à tester. Une principale + 2-3 secondaires si présentes. NE PAS confondre avec les questions ni avec les lacunes. L'auteur n'a PAS besoin d'employer le mot « hypothèse » : dans les thèses expérimentales ou quantitatives, les **prédictions chiffrées** (« l'analyse mesurera X avec précision Y »), les **claims comparatifs** (« la méthode surpasse Z de N% »), et les **anticipations testables sur les résultats attendus** comptent comme hypothèses. Extraire aussi bien de l'introduction (attentes de départ) que de la conclusion (prédictions à valider).
- `methodologie` — Approche / méthode / corpus / justification. UNIQUEMENT ce que l'auteur a fait (pas les corpus cités d'autres chercheurs). Structurer en 4 bullets : **Approche**, **Méthode**, **Corpus/Données**, **Justification**. Dans **Méthode** : identifie CHAQUE méthode ou pipeline d'analyse distinct que la thèse met en œuvre ou compare (chaînes de traitement parallèles, méthodes croisées pour validation, approches alternatives testées) — ne JAMAIS réduire une architecture multi-méthodes à la seule méthode que l'auteur détaille le plus.
- `fil_rouge` — Le concept unique OU la question unique qui relie toutes les parties. Ce n'est PAS le sujet (« le journalisme boursier »), ni le mécanisme (« la métamorphose textuelle »), mais le PRISME sans lequel les parties ne formeraient pas un tout cohérent. Test : le concept proposé joue-t-il un rôle structurant dans CHAQUE partie ? Si non, ce n'est pas le fil rouge. Format : UNE phrase de la forme « [concept] tel que défini par [auteur] (p.X), reliant [partie 1] à [partie N] via [articulation] ».
- `plan` — Un bullet par grande partie de la thèse. Utilise le TITRE EXACT de chaque partie **tel qu'il apparaît dans la liste PARTIES/CHAPITRES fournie plus bas**, DANS SA LANGUE D'ORIGINE (anglais, français, allemand, etc.) sans traduction. Ne JAMAIS écrire « [Titre non fourni] » ou « [Titre original non fourni] » : les titres sont dans la liste ci-dessous, il suffit de les recopier. Format : « **Titre exact** : Démontre que X en montrant Y ». Pour chaque partie, UNE phrase énonçant ce qu'elle DÉMONTRE (pas son sujet). Interdit : « Présentation de X », « Analyse de Y ». Requis : « Démontre que X en montrant Y ».
- `cadre_theorique` — Identifier le **cadre principal** (théorique, mathématique, ou méthodologique) qui structure la question de recherche globale, puis 2-5 **cadres secondaires** qui servent d'outils d'analyse spécifiques. Toute thèse mobilise au moins un cadre : un concept sociologique (« conditions d'acceptabilité » de Foucault), un modèle standard (ΛCDM, mécanique quantique, mécanique classique), un formalisme mathématique publié (« estimateur quadratique de Hu & Okamoto 2002 »), un cadre juridique (« droit administratif »), ou un paradigme méthodologique (« ethnographie de Geertz »). NE JAMAIS mettre [NULL] pour une thèse expérimentale ou théorique : identifier le modèle standard ou le formalisme central mobilisé. Pour CHAQUE cadre, nommer l'auteur/source ET son rôle dans l'analyse. Format structuré :
    - **Cadre principal** : [Auteur/source] — [concept ou formalisme] (p.X) — [comment il structure l'analyse globale]
    - **Cadres secondaires** :
      - [Auteur/source] — [concept ou formalisme] (p.X) — [rôle spécifique dans l'analyse]
      - [Auteur/source] — [concept ou formalisme] (p.X) — [rôle spécifique dans l'analyse]
    Ne pas inclure les auteurs simplement cités en revue de littérature sans mobilisation active dans l'analyse.
- `concepts_cles` — 3 à 7 concepts DÉFINIS, REDÉFINIS ou significativement RETRAVAILLÉS par l'auteur dans le cadre de cette thèse. NE PAS inclure les concepts empruntés à des auteurs secondaires et utilisés tels quels sans redéfinition (ceux-ci appartiennent UNIQUEMENT à `cadre_theorique`). Test d'exclusion : si la définition du concept peut être remplacée par « voir [Auteur] » sans perdre d'information spécifique à cette thèse, alors le concept n'a PAS été retravaillé et doit être EXCLU de `concepts_cles`. Pour CHAQUE concept, écrire exactement trois lignes :
    - **CONCEPT** : [terme en majuscules]
    - **SENS** : « [citation verbatim de la définition DANS la thèse] » (p.X) — ou [NON DÉFINI EXPLICITEMENT] suivi d'une reconstruction en 1 phrase
    - **ORIGINE** : [emprunté à Auteur (année) et retravaillé par l'auteur — ou propre à l'auteur]
- `ancrage_empirique` — L'exemple principal qui rend l'argument tangible. Choisir par ordre de priorité : (1) une typologie ou catégorisation chiffrée produite par l'auteur ; (2) une comparaison quantifiée entre cas/groupes/périodes ; (3) un résultat surprenant ou contre-intuitif signalé par l'auteur ; (4) un exemple qualitatif emblématique. Présenter sous forme de bullets concrets avec des données précises (noms, dates, chiffres, titres). Éviter les formulations vagues (« l'étude porte sur X »).
- `opposition` — 1 à 3 positions précises rejetées/nuancées. Pour CHAQUE position : nommer l'auteur ou le courant adverse quand possible, citer verbatim, et préciser s'il s'agit d'une lacune de la littérature (intro) ou d'un résultat contre-intuitif (conclusion).
- `apport_principal` — Ce que la thèse ajoute qui n'existait PAS avant. Choisir le type de contribution principal et le nommer explicitement en tête de chaque bullet :
    - **Empirique** : nouvelles données, sources ou cas analysés
    - **Théorique** : nouveau concept, cadre ou réinterprétation
    - **Méthodologique** : nouvelle approche ou combinaison de méthodes
    - **Critique** : remise en cause d'un consensus
    2-3 phrases maximum. Interdit : décrire la méthode comme apport. Requis : ce que la thèse apporte AU CHAMP ACADÉMIQUE.\
"""


# ── System prompt of step 2 (+ the C12 citation rule, shared with step 3) ──────
#
# C12 (promoted 2026-08-19): one page per proposition. The note re-cites
# the fiche's page bindings as-is, so a COMPOUND bullet (one (p. N) covering two
# pages' content) would become a wrong citation downstream.
C12_CITATION_RULE = (
    "RÈGLE DE CITATION C12 (une page par proposition) : chaque « (p. N) » ne couvre QUE la citation ou l'affirmation qui le précède immédiatement. JAMAIS un seul (p. N) pour deux contenus situés sur des pages différentes ; si une phrase enchaîne deux éléments de pages différentes, chacun reçoit son propre (p. N) juste après lui — ou sépare-les en deux bullets. Un intervalle (p. N-M) est permis quand la phrase ou le paragraphe cité s'étend réellement sur les pages N à M (chevauchement) — préfère alors l'intervalle à la seule page de début."
)

STEP2_SYSTEM = (
    "Tu es un expert en analyse de thèses académiques en sciences humaines "
    "et sociales. Ta tâche est de remplir une fiche de synthèse en extrayant "
    "fidèlement le contenu d'une thèse, sans jamais inventer. Tu réponds en "
    "MARKDOWN structuré, avec un en-tête `## <slug>` par section.\n"
    "\n"
    "RÈGLES STRICTES DE SORTIE :\n"
    "1. Les en-têtes de sections doivent être STRICTEMENT les slugs "
    "fournis (ex. `## these_centrale`), sans accents, sans variations, "
    "sans numérotation, sans reformulation. Toujours sur leur propre ligne.\n"
    "2. Quand tu cites un titre de la table des matières, copie-le "
    "EXACTEMENT, mot pour mot, sans tronquer ni reformuler. Aucune "
    "modification, même mineure (article, accent, ponctuation).\n"
    "3. Si une section est vide, écris uniquement `[NULL]` sur la ligne "
    "qui suit l'en-tête. Rien d'autre.\n"
    "4. " + C12_CITATION_RULE
)


STEP2A_INTRO_PROMPT = """\
Voici l'introduction COMPLÈTE d'une thèse de doctorat (parquet pp.{p_start}-{p_end}).

===== DÉBUT DE L'INTRODUCTION =====
{intro_blob}
===== FIN DE L'INTRODUCTION =====

## TÂCHE

Remplis chaque section ci-dessous à partir de l'INTRODUCTION SEULE.
Pour chaque section :
- Cite verbatim quand l'auteur a employé une formulation explicite, entre
  guillemets français « … » et indique la page entre parenthèses si possible.
- N'INVENTE JAMAIS. Si l'introduction ne contient PAS l'information, écris
  uniquement `[NULL]` sur une ligne (rien d'autre).
- Une section partiellement remplie reste partielle — ne complète pas avec
  des suppositions, laisse les manques pour les passes suivantes.

### Sections à remplir

{section_descriptions}

{parts_list}

## FORMAT DE RÉPONSE

Markdown strict avec un en-tête `## <slug>` par section, dans l'ordre
exact ci-dessous. Aucun texte avant le premier `##`, aucun texte après
la dernière section. Pas de markdown fences ```.

Exemple de structure attendue :

## these_centrale
[NULL]

## questions_recherche
- « comment X est-il devenu Y ? » (p. 12)
- « par quelles étapes… ? » (p. 12)

## reponses_questions
[NULL]

## hypotheses
**Principale** : « notre hypothèse de départ est que… » (p. 18)
**Secondaires** :
- …
- …

## methodologie
…

(et ainsi de suite pour les 12 sections)

Sections attendues, dans cet ordre exact :
{section_list}
"""


# ── 2b: Conclusion pass (refines 2a output) ─────────────────────────────────

STEP2B_CONCLUSION_PROMPT = """\
Voici la fiche de synthèse PARTIELLE produite à partir de l'introduction
seule (passe 2a) :

===== FICHE PARTIELLE (issue de l'introduction) =====
{markdown_2a}
===== FIN FICHE PARTIELLE =====

Et voici la conclusion COMPLÈTE de la même thèse (parquet pp.{p_start}-{p_end}) :

===== DÉBUT DE LA CONCLUSION =====
{conclusion_blob}
===== FIN DE LA CONCLUSION =====

## TÂCHE

Reproduis la fiche dans le même format markdown (un `## <slug>` par
section, mêmes 12 slugs dans le même ordre), en l'AMÉLIORANT à partir
de la conclusion :

1. Remplis les sections marquées `[NULL]` si la conclusion fournit
   l'information.
2. AMÉLIORE aussi les sections non-nulles : ajoute des nuances, des
   citations verbatim de la conclusion (entre « … » avec page), corrige
   les engagements de l'intro qui se révèlent erronés (« nous
   montrerons » vs ce qui a réellement été démontré).
3. C'est ici que `these_centrale` est la plus susceptible d'être
   remplie : la conclusion énonce ce qui a été démontré (présent).
4. C'est aussi ici que `opposition` peut gagner les résultats
   contre-intuitifs (« contrairement à nos attentes… »).
5. `fil_rouge` — la conclusion est l'endroit idéal pour FINALISER cette
   section : elle confirme quel concept a réellement traversé toutes les
   parties. Ne retiens qu'UN seul concept et formule-le en UNE phrase
   montrant comment il relie chaque partie (pas deux concepts séparés
   par « et »).
6. `reponses_questions` — c'est LA section à remplir ici. Pour CHAQUE
   question listée dans `questions_recherche`, cherche dans la
   conclusion la réponse explicite que l'auteur y apporte. Cite
   verbatim entre « … » avec la page. Si une question n'obtient pas de
   réponse explicite dans la conclusion, indique « Pas de réponse
   explicite dans la conclusion ».
7. NE JAMAIS INVENTER. Si l'information manque toujours, garde `[NULL]`.
8. Ne pas raccourcir les sections déjà bien remplies en 2a — conserve
   leur contenu et ajoute par-dessus.

### Sections (rappel)

{section_descriptions}

{parts_list}

## FORMAT DE RÉPONSE

Mêmes règles qu'en 2a : markdown strict, un `## <slug>` par section,
dans l'ordre exact, aucun texte hors sections, pas de fences.

Sections attendues, dans cet ordre :
{section_list}
"""


# ── 2c: Abstract pass (refines 2b output, DELTA mode) ───────────────────────
#
# The abstract/résumé is a dense 150-300 word summary that often contains the
# thèse centrale, mots-clés and methodology in compressed form. 2c only
# rewrites the sections the abstract improves; `[INCHANGÉ]` keeps 2b's text.

STEP2C_ABSTRACT_PROMPT = """\
Voici la fiche de synthèse EN COURS, construite à partir de l'introduction
et de la conclusion :

===== FICHE EN COURS =====
{markdown_prev}
===== FIN FICHE EN COURS =====

Et voici le résumé / abstract de la thèse (page {abstract_page}) :

===== RÉSUMÉ =====
{abstract_blob}
===== FIN RÉSUMÉ =====

## TÂCHE

Compare le résumé à la fiche, section par section. Réponds en MODE
DELTA : tu ne réécris QUE les sections que le résumé permet d'améliorer.

1. Le résumé contient souvent la **thèse centrale** en forme condensée
   — vérifie si `these_centrale` peut être complétée ou affinée.
2. Les **mots-clés** du résumé peuvent suggérer des concepts manquants
   pour `concepts_cles`.
3. La **méthodologie** y est souvent résumée en une phrase — ajoute des
   précisions si elles manquent.
4. Le résumé peut contenir le **fil rouge** de la thèse de manière
   très synthétique.
5. NE JAMAIS INVENTER. NE PAS raccourcir les sections déjà bien
   remplies — quand tu réécris une section, conserve son contenu
   existant et ajoute par-dessus ce que le résumé apporte de neuf.
   RÈGLE ABSOLUE : conserve TOUTES les références de page « (p. N) »
   déjà présentes dans la section que tu réécris. Le résumé ne
   contient pas de numéros de page — une réécriture qui perd les
   ancrages existants est une RÉGRESSION, jamais une amélioration.
6. Si le résumé n'apporte RIEN de nouveau à une section, écris
   EXACTEMENT `[INCHANGÉ]` comme seul contenu de la section — NE
   recopie JAMAIS son texte. La version précédente sera conservée
   automatiquement.

### Sections (rappel)

{section_descriptions}

## FORMAT DE RÉPONSE

Markdown strict : un `## <slug>` par section, LES 12 slugs dans l'ordre
exact (aucun omis), aucun texte hors sections, pas de fences. Contenu
de chaque section : soit la version améliorée complète, soit
`[INCHANGÉ]` seul.

Sections attendues, dans cet ordre :
{section_list}
"""


# A 2c delta-mode section whose whole content is "[INCHANGÉ]" keeps 2b's text.
STEP2C_UNCHANGED_RE = re.compile(
    r"^\[?\s*(?:INCHANG[ÉE]E?|UNCHANGED)\s*\]?\s*\.?$", re.IGNORECASE
)


# ── 2d: Scoring + routing pass (its name says 2C for historical reasons) ────

STEP2C_SCORE_PROMPT = """\
Voici une fiche de synthèse de thèse, construite à partir de l'introduction
et de la conclusion :

===== FICHE =====
{markdown_2b}
===== FIN FICHE =====

Et voici la table des matières COMPLÈTE de la thèse (titres seuls,
indentation = niveau hiérarchique) :

===== TABLE DES MATIÈRES =====
{toc_markdown}
===== FIN TABLE DES MATIÈRES =====

## TÂCHE

Évalue SÉVÈREMENT chaque section de la fiche et indique pour chacune :
1. Un score entier de 1 à 10 mesurant la complétude pour une fiche
   définitive (pas la confiance) :
     · 10 = totalement complète, prête à publier
     · 7-9 = solide mais quelques détails manquent
     · 4-6 = base correcte mais lacunes importantes
     · 1-3 = quasi vide ou seulement des indices
     · 0 = `[NULL]`, aucune information
   SOIS SÉVÈRE : un score de 10 doit être rare et exceptionnel. Une
   section qui contient une seule citation verbatim sans contexte ne
   dépasse pas 6. Une section qui résume sans citer ne dépasse pas 7.
2. Une description courte des manques (`gaps`).
3. Une liste de 0 à 3 entrées de la TOC à inspecter pour combler les
   manques. Cite les titres EXACTEMENT comme dans la TOC ci-dessus,
   séparés par ` ; ` (espace, point-virgule, espace).

## FORMAT DE RÉPONSE

UNE seule table markdown avec exactement 4 colonnes et 12 lignes
(une par section, dans l'ordre canonique). Aucun texte avant ni après.
Format strict :

## INSTRUCTION SPÉCIALE POUR `methodologie`

Pour la section `methodologie`, cherche dans la table des matières une
entrée de niveau 0 ou 1 dont le titre contient un mot apparenté à
« méthodologie », « méthodes », « methodology », « methods », « corpus »,
ou une combinaison (ex. « Corpus et méthodologies », « Cadre
méthodologique », « Un cadre méthodologique pour l'étude… »). Ce chapitre
est la source PRIORITAIRE pour combler les lacunes méthodologiques en
Step 3. Inclus-le dans les `refs` de la ligne `methodologie`, même si
le score est déjà élevé.

## scoring

| section | score | gaps | refs |
|---|---|---|---|
| these_centrale | 7 | manque la formulation finale du présent | 13 La conclusion ; 8.4 Standardisation |
| questions_recherche | 10 | — | — |
| reponses_questions | 6 | réponse à Q3 et Q4 incomplètes | — |
| hypotheses | 0 | aucune hypothèse formulée comme proposition vérifiable | 2.2 Essai de définition |
| methodologie | 8 | corpus exact à préciser | 3 Corpus et méthodologies |
| fil_rouge | 6 | concept unifiant à confirmer | — |
| plan | 9 | — | — |
| cadre_theorique | 8 | articulation entre auteurs à clarifier | 2 La notion de culture textuelle |
| concepts_cles | 4 | seuls 2 concepts définis sur 5 attendus | 2.2 Essai de définition ; 4.1 Une codification |
| ancrage_empirique | 3 | typologie chiffrée absente | 11 Standards textuels |
| opposition | 9 | — | — |
| apport_principal | 7 | portée théorique finale à préciser | 11.2 Poétique de la donnée |

Les 12 sections obligatoires, dans cet ordre :
{section_list}
"""


# ── Step 3a — methodology chapter dive ──────────────────────────────────────

STEP3A_SYSTEM = (
    "Tu es un expert en analyse de thèses académiques en sciences humaines "
    "et sociales. Tu lis un chapitre méthodologique et tu produis la version "
    "DÉFINITIVE de deux sections d'une fiche de synthèse : `methodologie` et "
    "`hypotheses`. Tu réponds en MARKDOWN structuré.\n"
    "\n"
    "RÈGLES STRICTES DE SORTIE :\n"
    "1. Les en-têtes de sections doivent être STRICTEMENT `## methodologie` "
    "et `## hypotheses`, chacun sur sa propre ligne.\n"
    "2. Cite verbatim entre « … » avec la page entre parenthèses.\n"
    "3. NE JAMAIS INVENTER. Si l'information n'est pas dans le chapitre, "
    "conserve ce qui existait déjà.\n"
    "4. Si une section est vide après analyse, écris `[NULL]`.\n"
    "5. " + C12_CITATION_RULE
)


STEP3A_PROMPT = """\
Voici le contenu ACTUEL de deux sections d'une fiche de synthèse, tel que
produit par les passes précédentes (introduction + conclusion) :

===== CONTENU ACTUEL — methodologie =====
{current_methodologie}
===== FIN =====

===== CONTENU ACTUEL — hypotheses =====
{current_hypotheses}
===== FIN =====

Et voici le chapitre méthodologique COMPLET de la thèse
(parquet pp.{p_start}-{p_end}) :

===== DÉBUT DU CHAPITRE =====
{chapter_blob}
===== FIN DU CHAPITRE =====

## TÂCHE

Produis la version DÉFINITIVE (fiche-grade) de ces deux sections en te
basant sur le chapitre méthodologique. Le contenu actuel sert de base —
conserve ce qui est correct, enrichis avec les détails du chapitre.

### `methodologie`

La section méthodologie DOIT respecter la structure en 4 bullets de la
grille d'annotation :

- **Approche** : [qualitative / quantitative / théorique / mixte]. Précise
  la perspective (diachronique, comparative, inductive…) si mentionnée.
- **Méthode** : [technique(s) spécifique(s)]. Nomme les outils, logiciels,
  scripts, langages, bases de données utilisés par l'auteur. Donne les
  chiffres exacts (nombre de scripts, taille des bases…) si disponibles.
  Identifie CHAQUE méthode ou pipeline d'analyse distinct que la thèse
  met en œuvre ou compare (chaînes parallèles, méthodes croisées pour
  validation, approches alternatives testées) — ne JAMAIS réduire une
  architecture multi-méthodes à la seule méthode la plus détaillée.
- **Corpus/Données** : [sources analysées avec périmètre et effectifs].
  Identifie CHAQUE corpus distinct (principal, secondaire, contextuel…),
  ses bornes chronologiques, ses titres de presse ou sources, et ses
  effectifs exacts (nombre de textes, d'entretiens, d'articles…).
  UNIQUEMENT ce que l'auteur de cette thèse a analysé — pas les corpus
  cités d'autres chercheurs.
- **Justification** : [pourquoi cette approche]. Nomme les auteurs et
  concepts méthodologiques qui justifient le choix (ex. Moretti/Distant
  Reading, sociologie compréhensive/Weber…).

### `hypotheses`

Le chapitre méthodologique contient parfois des hypothèses formulées dans
le contexte de la mise en place de l'enquête. Cherche :
- « notre hypothèse est que… », « nous postulons que… »
- Des propositions vérifiables liées au design de la recherche.
- Si aucune hypothèse nouvelle n'est trouvée, conserve le contenu actuel
  tel quel (ou `[NULL]`).

## FORMAT DE RÉPONSE

Markdown strict : exactement 2 sections, `## methodologie` puis
`## hypotheses`, dans cet ordre. Aucun texte hors sections.
"""


# ── Step 3b — theory chapter dive (concepts clés) ───────────────────────────

STEP3B_SYSTEM = (
    "Tu es un expert en analyse de thèses académiques en sciences humaines "
    "et sociales. Tu lis un chapitre théorique et tu produis la version "
    "DÉFINITIVE de la section `concepts_cles` d'une fiche de synthèse. "
    "Tu réponds en MARKDOWN structuré.\n"
    "\n"
    "RÈGLES STRICTES DE SORTIE :\n"
    "1. L'en-tête doit être STRICTEMENT `## concepts_cles` sur sa propre ligne.\n"
    "2. Cite verbatim entre « … » avec la page entre parenthèses.\n"
    "3. NE JAMAIS INVENTER de définition. Si un terme n'est pas défini "
    "explicitement dans le chapitre, utilise [NON DÉFINI EXPLICITEMENT] "
    "suivi d'une reconstruction en 1 phrase.\n"
    "4. Exclure le vocabulaire disciplinaire standard — ne retenir que "
    "les concepts DÉFINIS ou REDÉFINIS par l'auteur.\n"
    "5. " + C12_CITATION_RULE
)


STEP3B_PROMPT = """\
Voici le contenu ACTUEL de la section `concepts_cles` d'une fiche de
synthèse, tel que produit par les passes précédentes :

===== CONTENU ACTUEL =====
{current_concepts}
===== FIN =====

Et voici le(s) chapitre(s) théorique(s) de la thèse qui contien(nen)t
les définitions des concepts clés ({n_chapters} chapitre(s),
{total_chars:,} caractères au total) :

===== DÉBUT DU/DES CHAPITRE(S) =====
{chapters_blob}
===== FIN DU/DES CHAPITRE(S) =====

## TÂCHE

Voici également les sections `cadre_theorique` et `fil_rouge` de la
fiche, pour assurer la cohérence :

===== CADRE THÉORIQUE =====
{current_cadre}
===== FIN =====

===== FIL ROUGE =====
{current_fil_rouge}
===== FIN =====

Produis la version DÉFINITIVE (fiche-grade) de la section `concepts_cles`.
Le contenu actuel sert de base — conserve les concepts pertinents,
REMPLACE les définitions intro-level par les définitions complètes du
chapitre théorique quand elles existent.

RÈGLE DE COHÉRENCE OBLIGATOIRE : les concepts suivants apparaissent
dans `cadre_theorique` ou `fil_rouge` et DOIVENT IMPÉRATIVEMENT figurer
dans `concepts_cles`. NE JAMAIS les supprimer, même si le chapitre
théorique ne les définit pas formellement — dans ce cas, utilise
[NON DÉFINI EXPLICITEMENT] et conserve la meilleure définition disponible
(intro ou conclusion).

Concepts OBLIGATOIRES (extraits des autres sections) :
{mandatory_concepts}

Vise 3 à 5 concepts, jusqu'à 7 si la thèse le justifie. NE JAMAIS
inclure :
- Des concepts empruntés à d'autres auteurs et utilisés TELS QUELS
  sans redéfinition par l'auteur de la thèse (ceux-là appartiennent
  UNIQUEMENT au `cadre_theorique`). Test : si on peut remplacer la
  définition par « voir [Auteur] » sans perte d'information, le
  concept n'a PAS été retravaillé et doit être exclu d'ici.
- Des labels méta-structurels (« auteur principal », « auteurs
  secondaires »).
- Des mots courants utilisés sans redéfinition (« culture »,
  « données » au sens générique).

Pour CHAQUE concept retenu, écrire exactement trois lignes :

**CONCEPT** : [TERME EN MAJUSCULES]
**SENS** : « [citation verbatim de la définition telle que l'auteur la
formule dans le chapitre] » (p.X) — ou [NON DÉFINI EXPLICITEMENT] suivi
d'une reconstruction en 1 phrase.
**ORIGINE** : [emprunté à Auteur (année) et retravaillé — ou propre à l'auteur]

Critères de sélection :
- Le concept est-il DÉFINI ou REDÉFINI par l'auteur (pas simplement
  mentionné) ?
- Est-il ESSENTIEL à l'argumentation (pas juste un terme technique) ?
- L'auteur lui donne-t-il un sens SPÉCIFIQUE qui diffère de l'usage
  courant dans la discipline ?

Si le chapitre révèle un concept important qui manquait dans la version
actuelle, ajoute-le. Si un concept actuel s'avère être un simple label
descriptif (pas de définition, pas de rôle structurant), retire-le.

## FORMAT DE RÉPONSE

Markdown strict : exactement 1 section, `## concepts_cles`. Aucun texte
hors section. Sépare chaque concept par une ligne vide.
"""


# ── Rendered fiche — slug → grille heading (order = grille order) ───────────

GRILLE_HEADINGS = [
    ("these_centrale",      "Thèse centrale"),
    ("questions_recherche",  "Questions de recherche"),
    ("reponses_questions",   "Réponses aux questions de recherche"),
    ("hypotheses",           "Hypothèses"),
    ("methodologie",         "Méthodologie"),
    ("fil_rouge",            "Fil rouge"),
    ("plan",                 "Plan (Structure)"),
    ("cadre_theorique",      "Cadre théorique"),
    ("concepts_cles",        "Concepts clés"),
    ("ancrage_empirique",    "Ancrage empirique (ou concret)"),
    ("opposition",           "Opposition / Contre-argumentation"),
    ("apport_principal",     "Apport principal"),
]
