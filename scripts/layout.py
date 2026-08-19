"""
layout.py — the ONE place that says where a thesis' outputs live (results/ convention).

    results/<thesis>/
      <thesis>_fiche.md          ★ FICHE — the deliverable (after the citation gate)
      <thesis>_note.md           ★ NOTE  — the deliverable (copy of the latest note run's note.md)
      fiche_steps/               the fiche pipeline's trail, in step order
        1_structure.json           step 1: metadata + TOC + printed→parquet page offset
        2a_intro.md                step 2a raw model output (sections from the introduction)
        2b_conclusion.md           step 2b raw output (refined with the conclusion)
        2c_abstract_delta.md       step 2c raw output (delta: only sections the abstract improved)
        2d_scoring.md              step 2d raw output (severe scores + TOC refs for step 3)
        2_merged.md                step 2 result: merged sections + scoring table (human-readable)
        sections.json              structured sections with scores/refs; step 3 patches it in place
        fiche_before_gate.md       rendered fiche BEFORE the citation gate
        citation_fixes.json        what the gate changed (tag → page, rewrite | insert)
        calls.jsonl                every LLM exchange (system, prompt, reasoning, output, timings)
      note_runs/<run_id>/        one dir per note run (run_id = timestamp)
        note.md                    the note as rlm-cli returned it
        prompt.txt                 the full rlm instruction (rules + TOC map + fiche + style)
        fiche_used.md              copy of the input fiche
        style_used.md              copy of the style exemplar
        config.json                model, paths, blob/prompt sizes, SHIM_* env, rlm_config.yaml
        metadata.json              wall time, words, iterations, sub-queries, trace counts
        rlm_log.txt                rlm-cli stdout (= the note) + stderr (progress, banner)
        trace/NNN_{root,subquery}.json   every request/response through the shim
      note_runs/latest → <run_id>

Used by fiche/pipeline.py, note/pipeline.py, tools/build_explorer.py and the tests.
"""
from pathlib import Path

FICHE_STEPS_DIR = "fiche_steps"
NOTE_RUNS_DIR = "note_runs"
STEP2_DUMPS = {                       # analyze_intro dump tag → file name
    "2a": "2a_intro.md",
    "2b": "2b_conclusion.md",
    "2c_sparse": "2c_abstract_delta.md",
    "2d": "2d_scoring.md",
}
NOTE_RUN_FILES = ("note.md", "prompt.txt", "fiche_used.md", "style_used.md",
                  "config.json", "metadata.json", "rlm_log.txt")


class ThesisLayout:
    """Paths of one thesis' outputs. `thesis_dir` is normally results/<thesis>/."""

    def __init__(self, thesis_dir, thesis_id: str | None = None):
        self.dir = Path(thesis_dir)
        self.thesis = thesis_id or self.dir.name
        self.steps = self.dir / FICHE_STEPS_DIR
        self.note_runs = self.dir / NOTE_RUNS_DIR

    # deliverables
    @property
    def fiche(self) -> Path:
        return self.dir / f"{self.thesis}_fiche.md"

    @property
    def note(self) -> Path:
        return self.dir / f"{self.thesis}_note.md"

    # fiche trail
    @property
    def structure(self) -> Path:
        return self.steps / "1_structure.json"

    @property
    def sections(self) -> Path:
        return self.steps / "sections.json"

    @property
    def merged(self) -> Path:
        return self.steps / "2_merged.md"

    @property
    def fiche_before_gate(self) -> Path:
        return self.steps / "fiche_before_gate.md"

    @property
    def citation_fixes(self) -> Path:
        return self.steps / "citation_fixes.json"

    @property
    def calls(self) -> Path:
        return self.steps / "calls.jsonl"

    def step_dump(self, tag: str) -> Path:
        return self.steps / STEP2_DUMPS[tag]

    # note runs
    def note_run(self, run_id: str) -> Path:
        return self.note_runs / run_id

    @property
    def latest_note_run(self) -> Path:
        return self.note_runs / "latest"

    @staticmethod
    def structure_for_fiche(fiche_path) -> Path:
        """Default location of the structure.json that goes with a fiche file."""
        return Path(fiche_path).parent / FICHE_STEPS_DIR / "1_structure.json"
