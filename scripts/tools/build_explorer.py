#!/usr/bin/env python3
"""
build_explorer.py — organize one thesis' fiche run + one note run into a shareable
JSON and a LOCAL html explorer (two tabs: Fiche / Note; per step / per iteration:
prompt · thinking · output · stdout). No network, no external libs: index.html
loads data.js (the same JSON assigned to window.EXPLORER_DATA) so it works from file://.

Usage:
  python3 scripts/tools/build_explorer.py --thesis-dir results/2027Bourse --out explorer/bourse
  # optional: --note-dir results/2027Bourse/note_runs/<run_id>   (default: note_runs/latest)
Outputs: <out>/data.json, <out>/data.js, <out>/index.html  (zip the folder to share)

Reads the results layout of scripts/layout.py: <thesis>_fiche.md + fiche_steps/
(calls.jsonl = every call with system · prompt · reasoning · output, 1_structure.json,
2a_…2d_*.md, 2_merged.md) and a note run dir
(prompt.txt, trace/NNN_root.json (+ _subquery), note.md, metadata.json,
config.json, rlm_log.txt). `build_fiche()` / `build_note()` return the JSON —
the natural data contract for a UI.
"""
import argparse, glob, json, os, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from layout import STEP2_DUMPS, ThesisLayout   # noqa: E402

STEP_FILES = [  # label, title, file in fiche_steps/ (None = shown from the fiche itself)
    ("1",  "Step 1 — Structure (TOC)",            "1_structure.json"),
    ("2a", "Step 2a — Intro pass",                STEP2_DUMPS["2a"]),
    ("2b", "Step 2b — Conclusion refine",         STEP2_DUMPS["2b"]),
    ("2c", "Step 2c — Abstract delta (sparse)",   STEP2_DUMPS["2c_sparse"]),
    ("2d", "Step 2d — Scoring + TOC refs",        STEP2_DUMPS["2d"]),
    ("3a", "Step 3a — Methodology + hypotheses",  None),
    ("3b", "Step 3b — Concepts clés",             None),
    ("final", "Final fiche",                      "FICHE"),
]
LABEL_ORDER = {l: i for i, (l, _, _) in enumerate(STEP_FILES)}


def read(p):
    try:
        return pathlib.Path(p).read_text(encoding="utf-8")
    except Exception:
        return None


def load_jsonl(p):
    out = []
    if not os.path.exists(p):
        return out
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except Exception:
                pass
    return out


def build_fiche(thesis_dir):
    lay = ThesisLayout(thesis_dir)
    fiche_md = lay.fiche
    if not fiche_md.exists():
        sys.exit(f"no {fiche_md.name} in {thesis_dir}")
    thesis = lay.thesis
    calls = load_jsonl(lay.calls)
    steps = []
    calls_by_label = {}          # label → calls (may include discarded truncated attempts)
    for c in calls:
        calls_by_label.setdefault(c.get("label") or "?", []).append(c)
    for label, title, suffix in STEP_FILES:
        out_text = None
        if suffix == "FICHE":
            out_text = read(fiche_md)
        elif suffix:
            out_text = read(lay.steps / suffix)
        elif label in ("3a", "3b"):
            # 3a/3b outputs are merged into the fiche; show the fiche section(s) they own
            fiche = read(fiche_md) or ""
            secs = {"3a": ["## Méthodologie", "## Hypothèses"], "3b": ["## Concepts clés"]}[label]
            parts = []
            for h in secs:
                i = fiche.find(h)
                if i >= 0:
                    j = fiche.find("\n## ", i + 3)
                    parts.append(fiche[i: j if j > 0 else None].strip())
            out_text = "\n\n".join(parts) or None
        entry = {"label": label, "title": title, "calls": []}
        if label in calls_by_label:
            for c in calls_by_label[label]:
                entry["calls"].append({
                    "system": c.get("system"), "prompt": c.get("prompt"),
                    "reasoning": c.get("reasoning"), "output": c.get("output"),
                    "meta": {k: c.get(k) for k in ("budget", "temperature", "top_p", "top_k", "max_tokens",
                                                   "elapsed_s", "first_content_s", "reasoning_est_tokens",
                                                   "looks_cut", "finish", "retries", "discarded", "ts")},
                })
        entry["output_file"] = out_text
        steps.append(entry)
    return {
        "thesis": thesis, "dir": str(lay.dir), "fiche_md": read(fiche_md),
        "intro_md": read(lay.merged),
        "structure_json": read(lay.structure),
        "steps": steps,
        "has_full_calls": bool(calls),
    }


def parse_sse(raw):
    content, reasoning, fin, timings, model = [], [], None, None, None
    for line in (raw or "").splitlines():
        if not line.startswith("data: ") or line.strip() == "data: [DONE]":
            continue
        try:
            j = json.loads(line[6:])
        except Exception:
            continue
        model = j.get("model", model)
        for ch in j.get("choices") or []:
            dl = ch.get("delta") or {}
            if dl.get("content"):
                content.append(dl["content"])
            if dl.get("reasoning_content"):
                reasoning.append(dl["reasoning_content"])
            if ch.get("finish_reason"):
                fin = ch["finish_reason"]
        if j.get("timings"):
            timings = j["timings"]
    return "".join(content), "".join(reasoning), fin, timings or {}, model


def build_note(note_dir):
    d = pathlib.Path(note_dir)
    meta = json.loads(read(d / "metadata.json") or "{}")
    config = json.loads(read(d / "config.json") or "{}")
    prompt = read(d / "prompt.txt")
    iters = []
    prev_msgs = 0
    for f in sorted(glob.glob(str(d / "trace" / "*.json"))):
        j = json.load(open(f, encoding="utf-8"))
        req = j.get("request") or {}
        msgs = req.get("messages") or []
        c, r, fin, t, model = parse_sse(j.get("response_raw") or "")
        # what is NEW this turn = messages after those already seen last turn (for root); subquery = full user msg
        kind = j.get("kind", "root")
        if kind == "root":
            new_msgs = msgs[prev_msgs:] if len(msgs) >= prev_msgs else msgs
            prev_msgs = len(msgs)
            new_user = "\n\n".join(str(m.get("content", "")) for m in new_msgs if m.get("role") == "user")
            if len(msgs) <= 2:  # first turn: the whole prompt is the input
                new_user = "(first turn — full root prompt, see the 'Root prompt' entry)"
        else:
            new_user = "\n\n".join(str(m.get("content", "")) for m in msgs if m.get("role") == "user")
        iters.append({
            "n": len(iters) + 1, "file": os.path.basename(f), "kind": kind,
            "elapsed_s": j.get("elapsed_s"), "status": j.get("status"),
            "input": new_user, "system": str(msgs[0].get("content", "")) if msgs else "",
            "reasoning": r, "output": c, "finish": fin,
            "timings": {k: t.get(k) for k in ("prompt_n", "prompt_ms", "cache_n", "predicted_n", "predicted_ms",
                                              "predicted_per_second", "draft_n", "draft_n_accepted")},
            "budget": req.get("thinking_budget_tokens"),
        })
    # Execution stdout of turn N's code = the new user message rlm sends at turn N+1
    # (tool output + rlm footer). Attach it to the iteration that produced it.
    roots = [it for it in iters if it["kind"] == "root"]
    for a, b in zip(roots, roots[1:]):
        # VERBATIM: the next turn's user message = tool output exactly as rlm-cli
        # sent it to the model (incl. rlm's own "[TRUNCATED: Last 10000 chars
        # shown].." marker when the execution printed > truncate_len, and rlm's
        # per-turn footer). Nothing is cut by the explorer.
        a["exec_stdout"] = b["input"] or ""
    if roots:
        last = roots[-1]
        # the last turn called FINAL(): its "stdout" is the final answer; rlm-cli prints it to stdout
        last["exec_stdout"] = "(FINAL called — the note below is what rlm-cli returned)\n\n" + (read(d / "note.md") or "")
    return {
        "thesis": config.get("thesis") or d.parent.name, "dir": str(d), "run_id": d.name,
        "metadata": meta, "config": config, "prompt": prompt,
        "note_md": read(d / "note.md"), "rlm_stdout": read(d / "rlm_log.txt"),
        "iterations": iters,
    }


HTML = r"""<!doctype html>
<meta charset="utf-8">
<title>Thesis pipeline explorer</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#1c1e21;--mut:#6b7280;--acc:#2456c9;--think:#fff7e6;--think-b:#f0c36d;--out:#eef7ee;--out-b:#8fc48f;--in:#eef2fb;--in-b:#a9b8e8;--code:#f3f4f6}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{display:flex;align-items:center;gap:16px;padding:10px 16px;background:var(--panel);border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:5}
header h1{font-size:15px;margin:0 12px 0 0;font-weight:600}
.tab{padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer}.tab.on{background:var(--acc);color:#fff;border-color:var(--acc)}
#q{margin-left:auto;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;width:260px}
main{display:grid;grid-template-columns:300px 1fr;height:calc(100vh - 49px)}
nav{border-right:1px solid #e5e7eb;background:var(--panel);overflow:auto}
nav .it{padding:8px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer}nav .it:hover{background:#f3f4f6}nav .it.on{background:#e8eefc;border-left:3px solid var(--acc)}
nav .it small{display:block;color:var(--mut)}
section{overflow:auto;padding:14px 18px}
.meta{color:var(--mut);font-size:12px;margin-bottom:8px}
details{margin:8px 0;border:1px solid #e5e7eb;border-radius:8px;background:var(--panel)}
summary{cursor:pointer;padding:8px 12px;font-weight:600;user-select:none}
details.think{background:var(--think);border-color:var(--think-b)}details.out{background:var(--out);border-color:var(--out-b)}details.in{background:var(--in);border-color:var(--in-b)}
pre{white-space:pre-wrap;word-wrap:break-word;margin:0;padding:10px 12px;font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:transparent;border-top:1px solid rgba(0,0,0,.06);max-height:70vh;overflow:auto}
.chip{display:inline-block;padding:1px 7px;border-radius:10px;background:#e5e7eb;font-size:11px;margin-right:6px}
.chip.cut{background:#fde2e2}.chip.ok{background:#dcfce7}
mark{background:#fff3a3}
.empty{color:var(--mut);font-style:italic;padding:8px 12px}
</style>
<header><h1>Thesis pipeline explorer</h1>
<span class="tab on" data-tab="fiche">Fiche</span><span class="tab" data-tab="note">Note</span>
<span id="runinfo" class="meta" style="margin:0 0 0 12px"></span>
<input id="q" placeholder="filter text in current view…"></header>
<main><nav id="nav"></nav><section id="view"></section></main>
<script src="data.js"></script>
<script>
const D=window.EXPLORER_DATA;let tab='fiche',sel=0,q='';
const esc=s=>(s??'').toString().replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const hl=s=>{s=esc(s);if(!q)return s;const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');return s.replace(re,m=>'<mark>'+m+'</mark>')};
const box=(cls,title,body,open)=>body?`<details class="${cls}" ${open?'open':''}><summary>${title} <span class="chip">${(body.length).toLocaleString()} chars</span></summary><pre>${hl(body)}</pre></details>`:`<details class="${cls}"><summary>${title}</summary><div class="empty">not available</div></details>`;
function items(){ if(tab==='fiche'){const F=D.fiche;return [{t:'Overview',s:F.thesis},...F.steps.map(s=>({t:s.title,s:(s.calls.length?`${s.calls.length} call(s)`+(s.calls[0].meta&&s.calls[0].meta.reasoning_est_tokens?` · think ~${s.calls[0].meta.reasoning_est_tokens} tok`:''):'output only')})),{t:'Intro (step 2 merged)',s:'intro.md'},{t:'Structure JSON',s:'step 1 output'}]}
 const N=D.note;return [{t:'Overview',s:`${N.run_id} · ${N.metadata.wall_time_s||'?'} s · ${N.iterations.length} calls`},{t:'Root prompt',s:(N.prompt||'').length.toLocaleString()+' chars'},...N.iterations.map(it=>({t:`#${it.n} ${it.kind}`+(it.file.startsWith('0')?'':''),s:`${it.elapsed_s}s · out ${it.timings.predicted_n??'?'} tok · think ${(it.reasoning||'').length} ch · cache ${it.timings.cache_n??'-'}`})),{t:'Final note',s:(N.note_md||'').split(/\s+/).length+' words'},{t:'rlm log',s:''}]}
function renderNav(){const its=items();document.getElementById('nav').innerHTML=its.map((it,i)=>`<div class="it ${i===sel?'on':''}" data-i="${i}">${esc(it.t)}<small>${esc(it.s)}</small></div>`).join('');document.querySelectorAll('.it').forEach(e=>e.onclick=()=>{sel=+e.dataset.i;render()})}
function metaChips(m){if(!m)return '';return Object.entries(m).filter(([k,v])=>v!==null&&v!==undefined).map(([k,v])=>`<span class="chip ${k==='looks_cut'?(v?'cut':'ok'):''}">${k}: ${esc(v)}</span>`).join('')}
function renderView(){const v=document.getElementById('view');
 if(tab==='fiche'){const F=D.fiche;const n=F.steps.length;
  if(sel===0){v.innerHTML=`<h2>${esc(F.thesis)} — fiche run</h2><div class="meta">${esc(F.dir)}</div><p>${F.has_full_calls?'Full call log (system · prompt · thinking · output) available.':'This run predates the full call log: thinking blocks are available for the thinking steps (2a, 2b, 2c, 3a, 3b); prompts/raw outputs were not captured — outputs shown are the step dumps.'}</p>${box('out','Final fiche',F.fiche_md,true)}`;return}
  if(sel>=1&&sel<=n){const s=F.steps[sel-1];let h=`<h2>${esc(s.title)}</h2>`;
   if(!s.calls.length)h+=`<div class="meta">no LLM call recorded for this step (deterministic step, or not captured)</div>`;
   s.calls.forEach((c,i)=>{h+=`<div class="meta">${s.calls.length>1?`call ${i+1}/${s.calls.length} · `:''}${metaChips(c.meta)}${c.note?`<div>${esc(c.note)}</div>`:''}</div>`;
    h+=box('in','System prompt',c.system||c.system_head,false)+box('in','Prompt',c.prompt,false)+box('think','Thinking (reasoning_content)',c.reasoning,true)+box('out','Raw output of this call',c.output,false)});
   h+=box('out','Step output (dump / merged section)',s.output_file,!s.calls.length||!s.calls[0].output);v.innerHTML=h;return}
  if(sel===n+1){v.innerHTML=`<h2>Intro (step 2 merged)</h2>`+box('out','intro.md',F.intro_md,true);return}
  v.innerHTML=`<h2>Structure JSON</h2>`+box('out','structure.json',F.structure_json,true);return}
 const N=D.note;const m=N.iterations.length;
 if(sel===0){const md=N.metadata,cf=N.config;v.innerHTML=`<h2>${esc(N.thesis)} — note run ${esc(N.run_id)}</h2><div class="meta">${esc(N.dir)}</div>${box('in','metadata.json',JSON.stringify(md,null,2),true)}${box('in','config.json',JSON.stringify(cf,null,2),false)}`;return}
 if(sel===1){v.innerHTML=`<h2>Root prompt (turn 1 user message)</h2>`+box('in','prompt.txt',N.prompt,true);return}
 if(sel>=2&&sel<2+m){const it=N.iterations[sel-2];const T=it.timings;
  v.innerHTML=`<h2>Iteration #${it.n} — ${esc(it.kind)} <span class="meta">${esc(it.file)}</span></h2><div class="meta">${metaChips({elapsed_s:it.elapsed_s,finish:it.finish,budget:it.budget,prompt_n:T.prompt_n,cache_n:T.cache_n,predicted_n:T.predicted_n,tok_s:T.predicted_per_second&&T.predicted_per_second.toFixed?T.predicted_per_second.toFixed(0):T.predicted_per_second,draft:(T.draft_n?`${T.draft_n_accepted}/${T.draft_n}`:null)})}</div>`
   +box('in','Input this turn (new user message = previous tool output + rlm footer)',it.input,false)
   +box('think','Thinking (reasoning_content)',it.reasoning,true)
   +box('out','Output (assistant content — code the REPL executed / FINAL)',it.output,true)
   +box('in','Execution stdout — verbatim as the RLM received it (rlm-cli truncates to the last 10,000 chars ONLY when the code printed more; that marker is rlm\'s, not the explorer\'s)',it.exec_stdout,true)
   +box('in','System prompt (as sent this turn)',it.system,false);return}
 if(sel===2+m){v.innerHTML=`<h2>Final note</h2>`+box('out','note.md',N.note_md,true);return}
 v.innerHTML=`<h2>rlm log</h2>`+box('in','rlm_log.txt',N.rlm_stdout,true)}
function render(){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===tab));document.getElementById('runinfo').textContent=tab==='fiche'?D.fiche.dir:D.note.dir;renderNav();renderView()}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{tab=t.dataset.tab;sel=0;render()});
document.getElementById('q').oninput=e=>{q=e.target.value;renderView()};
render();
</script>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--thesis-dir", required=True, help="results/<thesis> (holds <thesis>_fiche.md + fiche_steps/)")
    ap.add_argument("--note-dir", default=None, help="a note run dir (default: <thesis-dir>/note_runs/latest)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    data = {"generated": __import__("time").strftime("%Y-%m-%d %H:%M"),
            "fiche": build_fiche(a.thesis_dir),
            "note": build_note(a.note_dir or ThesisLayout(a.thesis_dir).latest_note_run)}
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    js = json.dumps(data, ensure_ascii=False)
    (out / "data.json").write_text(js, encoding="utf-8")
    (out / "data.js").write_text("window.EXPLORER_DATA=" + js + ";", encoding="utf-8")
    (out / "index.html").write_text(HTML, encoding="utf-8")
    nf = len(data["fiche"]["steps"]); ni = len(data["note"]["iterations"])
    print(f"wrote {out}/index.html  data.json ({len(js)/1e6:.1f} MB)  fiche steps={nf} (full calls: {data['fiche']['has_full_calls']})  note iterations={ni}")


if __name__ == "__main__":
    main()
