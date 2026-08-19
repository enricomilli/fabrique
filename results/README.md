# results/ — what's what

Convention (defined once in `scripts/layout.py`): **one folder per thesis, the two
deliverables at its top, the trail underneath.**

```
results/<thesis>/
  <thesis>_fiche.md            ★ FICHE — the deliverable (after the citation gate)
  <thesis>_note.md             ★ NOTE  — the deliverable (= note_runs/latest/note.md)
  fiche_steps/                 fiche trail in pipeline order:
                               1_structure.json · 2a_intro.md · 2b_conclusion.md · 2c_abstract_delta.md ·
                               2d_scoring.md · 2_merged.md · sections.json · fiche_before_gate.md ·
                               citation_fixes.json · calls.jsonl
  note_runs/<run_id>/          note.md · prompt.txt · fiche_used.md · style_used.md · config.json ·
                               metadata.json · rlm_log.txt · trace/NNN_root.json
  note_runs/latest → <run_id>
```

## Reference runs shipped here — fresh, 2026-08-19, v3 configuration

Server: Qwen3.6-27B Q6_K MTP build, `--spec-type draft-mtp`, 3 slots. Fiche straight
against the tunnel; note through `run_shim.py` (v3 env). Sequential runs, one thesis at a time.

| thesis | fiche | note |
|---|---|---|
| `2027Bourse/` (FR SHS, 697 pp.) | **174 s** wall (150 s LLM) · gate corrected 7 bindings (`fiche_steps/citation_fixes.json`) · `verify_citations`: 33 OK · 4 OFF-1 · 2 WRONG — both hand-checked false positives (a sentence straddling pp.20→21; a nested-tag anchor) → **0 real errors** · c12 metric 9/70 | **94 s** · 1,889 words · 9 iterations · 33 citations: 25 grounded + 8 from the fiche, **0 BLIND, 0 wrong** (the one matcher flag, p.348, is correct by hand) · **6/6** catastrophic items (gold/EVALUATION.md) |
| `daley_thesis/` (EN STEM, 147 pp.) | **130 s** wall (112 s LLM) · 0 gate fixes · 12 OK · 1 OFF-1 (pp.129→130 straddle) · **0 WRONG** · c12 0/50 | **82 s** · 1,767 words · 9 iterations · 24 citations: 23 grounded + 1 fiche, **0 BLIND, 0 wrong** · **6/6** items (incl. the result-status framing, C13) |

Per thesis: Bourse 268 s, Daley 212 s (≈ 3.5–4.5 min).

**Variance note (honest).** Bourse was sampled twice. Attempt 1's fiche (0 real
citation errors, 172 s) put the 1826/1856 diptych and the three-phase
periodisation only in *Ancrage empirique* / *Réponses*, not in *Thèse centrale*;
the two notes drawn from it (1,577 and 1,689 words) both missed those two items
(4/6). That is step-2 sampling variance inherited by the note ("run-to-run salience";
the "note coverage guard" open item in the README). Attempt 1 is kept
as evidence in `../experiment_repo/results/2027Bourse_fresh_attempt1_2026-08-19/`
(same layout). Attempt 2 is what ships here.

Earlier v3 reference material: the recorded v3 runs (2026-08-19 14:5x) live in
`tests/fixtures/{bourse,daley}_v3/` (replayed by the tests) and in
`../experiment_repo/results/*_exp_v3/`; pre-audit July runs: `../current_repo_pre_audit_2026-08-19/results/`.

How to read a run: `python3 scripts/tools/build_explorer.py --thesis-dir results/<thesis> --out explorer/<thesis>`
(local HTML: every step / iteration with prompt · thinking · output · stdout).
