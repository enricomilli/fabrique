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

## Demo set — 10 theses, 2026-10-07/08

A ten-thesis set (7 humanities + 3 sciences, 2022-2024, all under 500 pp.) drawn
from `science_commons` to exercise the pipeline across disciplines. The parquets (`data/<nnt>.parquet`), the shipping run (`results/<nnt>/`), the
browsable views (`explorer/<nnt>/`) and all ten thesis PDFs (198 MB,
`data/pdf/`) are committed. **2024LYO20081's PDF is excluded** at 64 MB — high
resolution scans of the Montel/Lumière correspondence and Gaumont ledgers, and
the only file above GitHub's 50 MB warning threshold.

| nnt | discipline | pp. | fiche: cites (OK / OFF-1 / WRONG) | gate | note: words · iters · s | note cites (OK / WRONG) |
|---|---|---|---|---|---|---|
| 2024SORUL013 | Archéologie | 487 | 54 (33 / 1 / **0**) | 4 | 2 470 · 16 · 303 s | 38 (16 / **0**) |
| 2022LORR0062 | Sociologie | 370 | 121 (102 / 0 / **0**) | 25 | 1 998 · 13 · 225 s | 47 (25 / **0**) |
| 2023TOU20042 | Philosophie | 274 | 55 (49 / 0 / **0**) | 1 | 2 209 · 16 · 201 s | 49 (27 / **0**) |
| 2024LYO20081 | Arts de la scène | 317 | 61 (38 / 0 / **0**) | 4 | 2 183 · 12 · 216 s | 39 (26 / **0**) |
| 2022LYO10153 | Biologie cellulaire | 154 | 50 (27 / 0 / **0**) | 0 | 2 053 · 14 · 202 s | 33 (13 / **0**) |
| 2023LYO20128 | Histoire | 433 | 45 (24 / 1 / **0**) | 1 | 2 189 · 14 · 253 s | 42 (14 / **0**) |
| 2022LORR0183 | Énergie et Mécanique | 153 | 57 (15 / 0 / **0**) | 0 | 1 919 · 8 · 161 s | 22 (5 / **0**) |
| 2024PA100032 | Ethnologie | 464 | 54 (28 / 1 / **0**) | 0 | 2 010 · 12 · 178 s | 19 (8 / **0**) |
| 2024ESMA0001 | Informatique | 141 | 30 (18 / 0 / **0**) | 4 | 1 940 · 12 · 197 s | 31 (14 / **0**) |
| 2024PA100054 | Sciences du langage | 222 | 41 (17 / 0 / **0**) | 0 | 1 581 · 20 · 465 s | 36 (10 / **0**) |

`gate` = page bindings the deterministic citation gate corrected on the fiche
(`fiche_steps/citation_fixes.json`). The note gate ran too — new in this cycle —
and corrected 5 more bindings across the set. Note wall times are 161-465 s;
2024PA100054 is the outlier at 20 iterations.

Citations counted by `scripts/tools/verify_citations.py`. `UNVERIFIED` is omitted
above: it means the matcher could not align the string, usually a French
paraphrase of an English quote or, on 2023LYO20128, transliterated Sumerian
(27 of 42) — not an error. Four citations in the set were re-paged by hand after
review; see the caveat below.

**Only the shipping note run is committed**, as for 2027Bourse and daley_thesis.
Superseded runs are kept locally and excluded in `.gitignore`: the 19:26 runs are
38-byte `[API Error] 530` stubs from a Cloudflare tunnel that died mid-batch
(the bug that let a stub overwrite a good deliverable is fixed — see
`note/pipeline.py`), and the rest are pre-fix runs superseded by a rerun after
the structure fixes, plus one degenerate retry.

State of the set: 14/14 fiche sections on all ten, **0 WRONG citations across all
twenty artifacts**, **0 BLIND** citations in all ten notes, 0 invented authors
(93 named entities checked against their parquets). Notes 1 581-2 470 words,
6-7 paragraphs each.

**Caveat for anyone reusing these fiches as model output.** A small number of
sections were later filled by hand so the set could be shown without visible
gaps: **5 of the 140 section slots (10 fiches x 14 sections) = 3.6 %**. Four of
the five are written content (2024PA100054 *Mots-clés*, 2024LYO20081 *Cadre
théorique*, 2023TOU20042 *Ancrage empirique*, 2024PA100032 *Hypothèses*); the
fifth is an explicit « the thesis has none » marker (2023LYO20128 *Mots-clés*).
One further bullet inside 2024PA100032's *Plan* was filled, four citations were
re-paged, 2022LORR0183's *Mots-clés* had an extraction artifact replaced with
the thesis's own French keyword line, and 2024LYO20081's *Concepts clés* was
reformatted (no content change).

So **96.4 % of the section content is unedited model output**, and every
hand-written line is grounded in the thesis with a verified page citation. Even
so, the pristine model-only fiches, their SHA-256 checksums and a manifest of
every edit are kept outside the repo (`fiches_original_premanual_2026-10-07/`) —
use those, not `results/`, to score the model.
