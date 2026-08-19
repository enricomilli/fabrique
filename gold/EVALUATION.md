# Evaluation criteria — LLM-as-judge

How to score a pipeline run against the gold references, and decide whether a
change was **progress or regression**.


> **Speculative decoding (promoted 2026-08-17)**: the production server drafts
> from the model's MTP head (`--spec-type draft-mtp`). Every emitted token is
> still sampled by the 27B, so the output distribution — and therefore every
> gate and rubric here — is unchanged; only time drops. Any quality shift seen
> after the switch is the artefact (MTP GGUF) or sampling, never the drafter.
> Bourse check on switch day: fiche 120/128, note ≈51, 0 fabrications.


> **Citation gate (promoted 2026-08-19)**: the served fiche is post-processed
> deterministically — a verbatim « quote » whose page is verifiably wrong (absent
> from the cited page(s), present on exactly one page) gets its page rewritten or
> a `(p. X)` inserted. G1 applies to the **served** fiche; the model's raw output
> is kept as `fiche_steps/fiche_before_gate.md` and the corrections in
> `fiche_steps/citation_fixes.json` — judge raw vs served separately when the
> question is the model's own accuracy. The note's co-presence rule and the
> truncation/cap settings are lossless for the judge; the remaining note error
> classes are salience (items dropped by draw) and result-status framing (C13).

## The governing principle

**The gold is a reference point, not a target.** It was written by a model
several orders of magnitude larger than the 27B that produces the runs. Matching
it is not the goal and is not achievable; the point is to have a fixed yardstick
so that run N+1 can be compared to run N through a stable third party.

Concretely, for the judge:

> A run that cites **fewer** anchors than the gold but whose claims are correct,
> well-supported and coherent is **not** worse for that reason. Penalise sparse
> citation only when the remaining text can no longer support its own assertions.
>
> A run that covers a point **differently** from the gold — a different quote for
> the same idea, a different chapter chosen to illustrate an argument, a
> different critical angle — is **not** worse for that reason. Divergence is only
> a defect when it produces something false, incoherent, or empty.
>
> What matters is: *is this a good, faithful account of the thesis?* The gold
> tells you what a good one looks like. It does not tell you what this one must
> say.

## Two-tier structure

### Tier 1 — hard gates (binary, checked before any scoring)

A run failing any gate is **unusable**, regardless of how well it reads. These
are mechanical; run the tooling first.

| gate | check | tool |
|---|---|---|
| G1 | zero **fabricated** citations (page cited, content absent, not adjacent) | `verify_citations.py` → 0 WRONG after false-positive review |
| G2 | zero authors/works named that are absent from the thesis | judge, against the gold's cadre théorique |
| G3 | the central argument is not misstated | judge |
| G4 | the required structure exists (fiche: 14 sections; note: 6 paragraphs) | `score_against_gold.py` |
| G5 | no section left `[Non renseigné]` when the content demonstrably exists | judge + gold |

Before recording a G1 failure, check the two OCR traps documented in
`gold/README.md` (straddling quotes, hyphenated words). Roughly a third of
`WRONG` flags on the gold itself were false positives.

### Tier 2 — graded dimensions (0-10, judged)

Score against the gold as a calibration anchor. Explicit allowances in the right
column are what stop the judge from rewarding mere imitation.

#### Note (6 dimensions, 60 pts)

| # | dimension | 10 = | "different but valid" allowance |
|---|---|---|---|
| N1 | **Faithfulness** | every substantive claim traceable to the thesis | a claim the gold does not make is fine if it is true |
| N2 | **Coverage** | intro, all three parts, conclusion each substantively treated | any chapter may stand in for another within a part |
| N3 | **Support** | assertions carry verifiable anchors where they need them | fewer anchors than gold is fine if claims remain supported |
| N4 | **Critical engagement** | at least one argued reservation, not decoration | may target something the gold did not |
| N5 | **Coherence & register** | reads as one argument; French académique, no clichés | any defensible plan, not just the gold's |
| N6 | **Usefulness** | a reader who hasn't read the thesis ends with a defensible map of it | — |

#### Fiche (14 sections, 140 pts)

Per-section anchors and the "what a 10 looks like" table are in
`gold/README.md`. Apply the same allowance: a section that is correct, anchored
and thinner than the gold scores 6-8, not 0. Only `[Non renseigné]`-when-content-
exists, or content that is wrong, scores below 4.

## Catastrophic misses — thesis-specific

These are the things whose absence means the run did not understand the thesis.
Unlike ordinary coverage gaps, each costs a full dimension. Lists are per-thesis;
write a new one before using a new thesis as a benchmark.

**2027Bourse — a note missing any of these has a catastrophic miss:**

1. The **1826/1856 diptych** — the comparison that motivates the whole enquiry.
2. **« conditions d'acceptabilité » / acceptabilisation** as the organising concept, attributed to Foucault.
3. The **three-phase periodisation** (envisageable → se matérialise → modèle standard).
4. **1838** as the founding date of the chronicle proper (*Journal des débats*).
5. Any recognition that the thesis is **computational** (corpus, distant reading, textometry) — not a purely historical study.
6. The **conclusion's central claim** that structural and singular cannot be separated.

Points 1-4 are factual; 5-6 are interpretive. A run may express any of them in
its own terms — the miss is *absence*, not paraphrase.

**daley_thesis — a note missing any of these has a catastrophic miss:**

1. The **three-pipeline architecture** (flat-sky QE / curved-sky QE / Bayesian MUSE, p. 72). The single most-missed fact in every run so far — models describe one pipeline.
2. The **~5 μK-arcmin lensing B-mode noise floor** as the threshold that organises the whole thesis: below it the quadratic estimator stops being optimal (p. 62).
3. That the analysis is **incomplete** — obfuscated bandpowers only, tests ongoing, and one pipeline test explicitly *not passed* (pp. 111, 113, 129). A note presenting ~40σ and 2-3 % as achieved measurements rather than forecasts has misread the thesis.
4. **Hu & Okamoto (2002)** quadratic estimator as the central formalism (p. 128).
5. The **SPTpol → SPT-3G progression**: chapter 3 exists to license chapter 4, validating the method on 100 deg² before the 1500 deg² field (pp. 62-67).
6. The **projection problem** — non-cylindrical projections mix $Q$ into $U$ and $E$ into $B$ (p. 32) — as the technical thread running from chapter 1 to chapter 4.

A second-order marker of a careful run: reporting the Bayesian gain as **17 %**
(information-matched) rather than the headline **26 %** (p. 67). The thesis itself
uses 17 % in its conclusion. A run quoting 26 % without the caveat is not wrong,
but one that makes the distinction is reading closely.

**2024LORR0201 — a note missing any of these has a catastrophic miss:**

1. The **14-usage typology across the three production stages** (9 recherche/collecte,
   3 sélection/vérification, 2 rédaction — pp. 592-593). The thesis's central
   empirical result; "journalists use Twitter" without the typology is a miss.
2. The **appropriation verdict**: all 52 interviewees have appropriated and
   normalised Twitter as an indispensable tool, on a par with phone/email/WhatsApp
   (p. 591).
3. The **negative, conditional answer** to the users-as-sources question: tweets
   cited only exceptionally under strict conditions, and the official-source
   predilection **confirmed by the 2,600-article analysis** (p. 594). A note
   presenting Twitter as having pluralised sourcing has misread the thesis.
4. The **comparative twist**: the expected France/Spain differences turn out
   marginal — similarities dominate (Hallin & Mancini's Mediterranean model,
   p. 595), with ONE salient difference: Spanish politicians announce on Twitter
   instead of press conferences, so Spanish journalists cite tweets in print more
   (p. 596).
5. The **dual method**: 52 semi-directive interviews (26+26, bi-média) PLUS
   2,600 print articles (1,300/pays) across 12 named PQN titles. Interview-only
   descriptions miss the design.
6. **Persistence over disruption**: traditional news cycles and production norms
   persist (p. 25) — the anti-hype finding that frames the whole thesis.

Second-order markers of a careful run: the France/Spain asymmetry in the 9th
research-stage usage (public informational crowdsourcing in France vs DM
complaints/testimonies in Spain, pp. 592-593); the X/Musk coda and its
explicit "not enough time to study" limit (p. 597); the 6+1 stabilised-usage
count (pp. 594-595).

**The recurring non-catastrophic weakness** is body-chapter thinning: strong on
introduction and conclusion, sparse across the 460 pages between. Note it under
N2, do not gate on it. See the coverage checklist in `gold/README.md`.

## Verdict format

The judge returns, per artifact:

```
GATES     G1..G5  pass/fail  (+ one line each on any failure)
SCORES    N1..N6 (or the 14 fiche sections), each 0-10 with one line of reasoning
TOTAL     x/60  (or x/140)
MISSES    any catastrophic miss, named
VERDICT   BETTER / EQUIVALENT / WORSE than the reference run, + 2-3 lines why
DELTA     what specifically changed vs the previous run, and the likely cause
```

`VERDICT` compares against **the previous run**, not the gold. The gold only
calibrates the scale.

## Tracking progress across runs

Keep one row per run. Anything that moves ≥1 gate or ≥8 total points is a real
change; smaller moves are within sampling noise — we measured identical configs
producing 7/7 clean sub-queries in one run and 5/9 empty in another.

| run | config delta | gates | total | catastrophic | verdict |
|---|---|---|---|---|---|
| `20260528_170434` | baseline (temp 1.0, pp 1.5) | 5/5 | — | none | reference |
| … | | | | | |

**Change one variable at a time.** Several of this project's confusions came from
moving sampling and throughput together and then being unable to attribute the
result.

## What the tooling gives you for free

Run before invoking the judge; it makes the judge's job narrower and cheaper.

```bash
python3 scripts/tools/verify_citations.py   <candidate> data/<thesis>.parquet   # G1
python3 scripts/tools/score_against_gold.py <candidate> gold/<gold>.md data/<thesis>.parquet
```

`score_against_gold.py` reports anchor recall against the gold. Treat it as a
**coverage signal, not a score** — on known runs it separated the 27B (48.9%)
from the 9B (26.7%) cleanly, but a run at 40% with excellent prose is better
than one at 60% that reads like a list. Its `anchor precision` figure only
checks that a cited page exists; the 9B scored 100% there while fabricating
citations, so precision is meaningful only via `verify_citations.py`.
