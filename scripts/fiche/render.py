"""
fiche/render.py — the deliverable: structure + sections → readable markdown
fiche de synthèse, in the order of gold/grille_annotation.md (the 14-section grid).
"""
import re
from typing import Optional

from .prompts import GRILLE_HEADINGS

# A section body is sometimes a bullet list whose individual values the model
# left as `[NULL]` (e.g. "- **Cadre principal** : [NULL]"). parse_section_markdown
# only nulls a body that is *entirely* `[NULL]`, so these leak into the
# deliverable verbatim. Render them in the same house style as an empty section.
_INLINE_NULL_RE = re.compile(r"\[\s*NULL\s*\]", re.IGNORECASE)


def _clean_inline_nulls(content: str) -> Optional[str]:
    """Replace bullet-level `[NULL]` with the house placeholder. If nothing but
    placeholders and list scaffolding is left, treat the section as empty."""
    cleaned = _INLINE_NULL_RE.sub("*[Non renseigné]*", content)
    substantive = _INLINE_NULL_RE.sub("", content)
    substantive = re.sub(r"\*\*[^*]*\*\*", "", substantive)   # bold labels first,
    substantive = re.sub(r"[-*\s:•]", "", substantive)        # then list scaffolding
    return cleaned if substantive.strip() else None


def render_fiche_markdown(structure: dict, intro_json: dict) -> str:
    """Render the final fiche de synthèse as a readable markdown file
    following the layout of gold/grille_annotation.md."""
    metadata = structure.get("metadata") or {}
    sections = intro_json.get("sections") or {}

    lines: list[str] = []

    # ── Title block ──
    lines.append("# FICHE DE SYNTHÈSE DE THÈSE\n")

    # ── Métadonnées ──
    lines.append("## Métadonnées\n")
    lines.append(f"- **Titre** : {metadata.get('titre') or '—'}")
    lines.append(f"- **Auteur** : {metadata.get('auteur') or '—'}")
    lines.append(f"- **Année** : {metadata.get('annee') or '—'}")
    lines.append(f"- **Établissement** : {metadata.get('etablissement') or '—'}")
    lines.append(f"- **Discipline** : {metadata.get('discipline') or '—'}")
    lines.append(f"- **Pages** : {metadata.get('pages') or '—'}")
    lines.append("")

    # ── Mots-clés ──
    mots = metadata.get("mots_cles") or []
    mots_str = " ; ".join(mots) if mots else "—"
    lines.append("## Mots-clés\n")
    lines.append(mots_str)
    lines.append("")

    # ── Grille sections ──
    for slug, heading in GRILLE_HEADINGS:
        sec = sections.get(slug) or {}
        content = sec.get("content")
        if content:
            content = _clean_inline_nulls(content)
        lines.append(f"## {heading}\n")
        if content:
            lines.append(content)
        else:
            lines.append("*[Non renseigné]*")
        lines.append("")

    return "\n".join(lines)
