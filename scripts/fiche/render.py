"""
fiche/render.py — the deliverable: structure + sections → readable markdown
fiche de synthèse, in the order of gold/grille_annotation.md (the 14-section grid).
"""
from .prompts import GRILLE_HEADINGS


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
        lines.append(f"## {heading}\n")
        if content:
            lines.append(content)
        else:
            lines.append("*[Non renseigné]*")
        lines.append("")

    return "\n".join(lines)
