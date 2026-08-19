"""
tools — standalone auditors and utilities (each is also a CLI: `python3 scripts/tools/<name>.py --help`).

    verify_citations.py    ground-truth audit of every (p. N) in a fiche/note against the parquet  ← RUN ALWAYS
    trace_grounding.py     gold-free audit of a note run: GROUNDED / FICHE / BLIND citations (exit 1 on BLIND)
    score_against_gold.py  objective comparison (anchor recall/precision, structure, length) vs a gold reference
    c12_audit.py           compound page-binding heuristic on a fiche (metric)
    build_explorer.py      local HTML explorer of a fiche run + a note run (its data.json is the UI contract)
    spec_bench.py          decode-speed A/B of server flags via llama-server timings (speculative decoding)
"""
