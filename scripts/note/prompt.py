"""
note/prompt.py — the note de lecture prompt handed to rlm-cli (v3, 2026-08-19).

`build_prompt(fiche_text, style_example, toc_map, model_name, run_date)` returns
the full instruction: blob format, navigation map, citation rules (external
authors forbidden, internal authors verified, co-presence rule), the six-
paragraph structure (~2000 words), the RLM working rules (batched exploration,
≤2 paragraphs per execution, page-binding headers), then the fiche and the
style exemplar. The text is validated behaviour — do not edit outside an A/B;
tests/test_frozen_surface.py hashes it (and reproduces the real v3 prompt).
"""
import datetime as dt


def build_prompt(fiche_text: str, style_example: str, toc_map: str = "",
                 model_name: str = "", run_date: str = "") -> str:
    run_date = run_date or dt.date.today().isoformat()
    author_line = f"Note générée automatiquement ({model_name})" if model_name else "Note générée automatiquement"
    toc_section = ""
    if toc_map:
        toc_section = f"""
## CARTE DE LA THÈSE (index de navigation)

Index hiérarchique issu de la table des matières. Les pages sont les
numéros des marqueurs `[p.NNN]` du blob `context` — pour atteindre
directement un chapitre, saute à son marqueur :
```python
pos = context.find("[p.236]")     # début du chapitre visé
extrait = context[pos:pos+3000]
```
ATTENTION : ne cherche PAS un titre de chapitre avec `context.find("titre")`
— tu risques de tomber sur la table des matières de la thèse elle-même.
Utilise toujours le saut par marqueur de page ci-dessous.

{toc_map}
"""
    return f"""Tu rédiges une NOTE DE LECTURE (compte rendu universitaire) d'une thèse de doctorat, dans la tradition académique française.

La variable `context` (déjà chargée) contient le texte intégral de la thèse.

## Format du blob `context`

- Des marqueurs de page `[p.NNN]` sont insérés à chaque changement de page. Pour trouver le numéro de page d'un extrait, cherche sa position avec `.find()`, puis remonte jusqu'au marqueur `[p.NNN]` le plus proche.
- Les notes de bas de page sont préfixées `[fn]` et placées à la fin de chaque page. Elles contiennent souvent les références scientifiques internes de la thèse.
- Exemple de snippet pour trouver la page d'une phrase donnée :
```python
phrase = "conditions d'acceptabilité"
pos = context.find(phrase)
# remonter au dernier marqueur [p.XXX] avant pos
marker_start = context.rfind("[p.", 0, pos)
marker_end = context.find("]", marker_start) + 1
page_tag = context[marker_start:marker_end]   # e.g. "[p.21]"
print(f"Phrase « {{phrase}} » → {{page_tag}}")
```

{toc_section}
Tu disposes aussi, ci-dessous, de deux ressources dans ton prompt :
  1. La FICHE structurée de la thèse — ton plan de travail, ce que tu dois couvrir
  2. Un EXEMPLE DE STYLE — le registre, la longueur et le flux que tu dois imiter

## Règles de référence

**Auteurs externes (hors thèse) : STRICTEMENT INTERDITS.** Ne cite aucun auteur, ouvrage ou revue qui ne figure pas dans le texte de la thèse. Si un compte rendu standard écrirait « comme le montre Habermas » ou « selon Bourdieu » alors que ni Habermas ni Bourdieu n'est cité par l'auteur de la thèse, tu reformules sans nommer.

**Auteurs internes (cités PAR la thèse) : autorisés sous condition.** Si tu veux nommer un auteur que la thèse elle-même mobilise (ex. Foucault, Moretti, Bakhtine, Lavoinne, Tetlock), tu DOIS :
  1. Vérifier via `context.find("Nom")` qu'il est bien présent dans la thèse — SAUF si l'auteur figure déjà dans la FICHE avec une citation et une page : dans ce cas reprends l'ancrage de la fiche tel quel, sans revérification.
  2. Accompagner la mention d'une courte citation verbatim (entre guillemets « ») extraite de la thèse.
  3. Indiquer le numéro de page, obtenu via la méthode du marqueur `[p.NNN]` décrite ci-dessus.
  Exemple : « Comme le rappelle Lavoinne, "cette croissance n'est pas justifiée économiquement" (p. 34). »

**Chapitres et passages de la thèse** : cite-les librement (ex. « dans le premier chapitre », « p. 612 »). Les pages doivent être vérifiées via les marqueurs `[p.NNN]` — JAMAIS une position en caractères (offset à 4+ chiffres).

**Notes de bas de page** : tu n'en rédiges pas dans la note. Les `[fn]` du blob sont uniquement un outil de recherche pour toi.

**Cible : au moins 8 références de page précises dans la note finale** pour étayer tes affirmations.

## Structure à produire (~2000 mots)

```markdown
# [Titre complet de la thèse, en italique après l'auteur]

**Compte rendu par** {author_line}

**Date :** {run_date}

**Référence :** [Auteur], *[Titre]*, [Établissement], [Année], [Nombre de pages] p.

---

[Paragraphe 1 — Ouverture (~250 mots) : situe la thèse, l'auteur, la discipline,
la période étudiée, la thèse centrale, le corpus principal. Annonce le fil
directeur et la périodisation.]

[Paragraphe 2 — Méthodologie et démarche (~300 mots) : approche,
outillage, corpus, sondages, corpus contextuels. Souligne l'originalité
méthodologique.]

[Paragraphe 3 — Première partie ou premier axe (~350 mots) : en citant les pages.]

[Paragraphe 4 — Deuxième partie ou deuxième axe (~300 mots).]

[Paragraphe 5 — Troisième partie ou troisième axe (~350 mots).]

[Paragraphe 6 — Portée, apport et tensions (~300-400 mots) : synthèse
critique. L'apport empirique, théorique, méthodologique. Les tensions,
les limites. Ouverture sur ce que la thèse permet de penser.]

---

## Pour citer ce document

**Note générée automatiquement**, « Compte rendu de [Titre court] », [Date].
```

## Consignes RLM

- **Les pages et citations de la FICHE ont déjà été vérifiées automatiquement contre la source.** Reprends-les telles quelles, SANS les revérifier via `context.find(...)`. Ne vérifie que ce que tu introduis TOI-MÊME et qui ne figure pas dans la fiche (nouvel auteur, nouvelle citation, nouvelle page).
- Si tu as besoin d'un passage spécifique, utilise `context[start:end]` ou `context.find("phrase")` pour le localiser, puis extrait une tranche de 500-1500 caractères autour.
- **Travaille en LOTS SERRÉS** : toute l'exploration initiale (squelette : introduction, méthodologie, ouvertures de parties, conclusion, exemples fondateurs) doit tenir en AU PLUS 3 exécutions de code, chacune extrayant PLUSIEURS passages d'un coup (5 à 8 extraits par exécution). Jamais une exécution par passage. Les extractions complémentaires entre les passes de rédaction (cœur des parties) comptent à part : au plus 1 exécution d'extraction par passe de rédaction.
- **LIAISON PAGE-EXTRAIT (obligatoire dans les lots)** : quand une exécution imprime plusieurs extraits, fais-la précéder CHAQUE extrait d'une ligne `===== EXTRAIT [p.N] → [p.M] =====` (les marqueurs réels de début et de fin de l'extrait). Au moment de citer, reprends le numéro depuis la ligne `=====` ou le marqueur `[p.N]` visible IMMÉDIATEMENT au-dessus du passage cité — jamais de mémoire. Une citation dont tu ne retrouves pas le marqueur exact dans tes sorties ne doit PAS porter de numéro de page.
- **RÉDACTION EN PLUSIEURS PASSES (OBLIGATOIRE)** : ne rédige JAMAIS la note entière en une seule exécution. Rédige AU PLUS 2 paragraphes par exécution de code. Avant de rédiger les paragraphes 3, 4 et 5, extrais d'abord de NOUVEAUX passages du cœur de la partie concernée (pas seulement son ouverture) — puis rédige. Assemble le tout à la fin seulement.
- **CITATION ET AFFIRMATION CO-PRÉSENTES** : une citation verbatim « … » (p. N) ne peut étayer QUE l'affirmation du passage d'où elle provient (le texte visible sous le même marqueur `[p.N]`). N'emploie JAMAIS une phrase de la thèse pour un argument qu'elle ne porte pas dans son contexte d'origine (une hypothèse formulée sur X ne sert pas à commenter Y ; un nom de fonction, de concept ou de liste se reprend tel que le passage le donne, sans le recomposer). Si une affirmation a besoin d'un appui, va chercher le passage qui la porte et cite-le avec sa propre page.
- **Densité d'ancrage** : chaque paragraphe de partie (3, 4 et 5) doit citer AU MOINS 3 pages distinctes. Une partie racontée sans pages précises est un paragraphe raté.
- Ne saute pas les exemples fondateurs que la fiche met en avant (comparaison inaugurale, cas paradigmatique, date fondatrice) : s'ils motivent la thèse, ils appartiennent à la note.
- `llm_query` est réservé aux RECHERCHES ponctuelles (localiser un thème, résumer un long passage pour toi-même). NE L'UTILISE JAMAIS pour rédiger les paragraphes de la note : la rédaction se fait TOI-MÊME, dans cette boucle, avec les marqueurs `[p.NNN]` sous les yeux — c'est la seule façon de garantir des numéros de page exacts.
- À la fin, assemble le markdown complet dans une variable puis appelle `FINAL(markdown_complet)`.

## FICHE DE LA THÈSE

```markdown
{fiche_text}
```

## EXEMPLE DE STYLE (à imiter pour le registre, la longueur des paragraphes, le flux)

```markdown
{style_example}
```

---

Rédige maintenant la note de lecture. Vise ~2000 mots, six paragraphes denses, français académique soutenu. Termine par `FINAL(note_markdown)`.
"""
