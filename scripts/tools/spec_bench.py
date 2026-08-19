#!/usr/bin/env python3
"""
spec_bench.py — decode-speed A/B harness for speculative-decoding server flags.

Runs the SAME two prompts N times against a llama-server and reads the server's
own `timings` block (predicted_per_second, and draft_n / draft_n_accepted when a
speculative path is active). Restart the server with different flags, re-run with
another --tag, compare the JSON dumps.

Prompts (both thinking OFF so decode = content only, sampling fixed):
  copy  — a real thesis passage (pages from --parquet) + "quote verbatim the
          sentences that…" → copy-heavy output, the best case for prompt-lookup
          drafters (n-gram) and a fair case for MTP.
  free  — "write a 400-word structured summary" of the same passage → open
          generation, the typical fiche/note case.

Speculative decoding is lossless by construction (every emitted token was
sampled by the target model), so this harness measures TIME only.

Usage:
  python3 scripts/tools/spec_bench.py --url https://xxx.trycloudflare.com --key colab \
      --parquet data/2027Bourse.parquet --tag baseline --n 3
  # restart server with e.g. --spec-type ..., then:
  python3 scripts/tools/spec_bench.py ... --tag ngram --n 3
  # compare:
  python3 scripts/tools/spec_bench.py --compare results/spec_bench/baseline.json results/spec_bench/ngram.json
"""
import argparse
import json
import pathlib
import statistics
import sys
import time

import requests

HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent / "results" / "spec_bench"


def load_passage(parquet, first_page, n_pages, max_chars=9000):
    import pandas as pd
    df = pd.read_parquet(parquet)
    sel = df[(df.page >= first_page) & (df.page < first_page + n_pages)]
    sel = sel[~sel.category.isin(["Page-header", "Page-footer"])]
    parts = []
    for p, g in sel.groupby("page"):
        parts.append(f"[p.{p}]\n" + "\n".join(str(t) for t in g.sort_values("block_index").text))
    return "\n\n".join(parts)[:max_chars]


PROMPTS = {
    "copy": (
        "Voici un extrait d'une thèse. Recopie MOT POUR MOT (sans rien changer, "
        "sans reformuler) les 8 phrases qui te semblent les plus importantes pour "
        "comprendre l'objet de recherche, chacune précédée de sa page [p.N]. "
        "Puis recopie intégralement le premier paragraphe de l'extrait.\n\n"
        "=== EXTRAIT ===\n{passage}\n=== FIN ==="
    ),
    "free": (
        "Voici un extrait d'une thèse. Rédige un résumé structuré d'environ 400 mots "
        "en trois parties (objet, méthode, résultats annoncés), en français, en citant "
        "les pages [p.N] quand tu t'appuies sur un passage précis.\n\n"
        "=== EXTRAIT ===\n{passage}\n=== FIN ==="
    ),
}


def one_call(url, key, model, prompt, max_tokens, temperature, top_p, top_k):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature, "top_p": top_p, "top_k": top_k,
        "stream": False,
        "chat_template_kwargs": {"enable_thinking": False},
        "thinking_budget_tokens": 0,
    }
    t0 = time.time()
    r = requests.post(f"{url.rstrip('/')}/v1/chat/completions",
                      headers={"Authorization": f"Bearer {key}",
                               "Content-Type": "application/json"},
                      json=payload, timeout=900)
    wall = time.time() - t0
    r.raise_for_status()
    j = r.json()
    t = j.get("timings", {}) or {}
    ch = (j.get("choices") or [{}])[0]
    return {
        "wall_s": round(wall, 2),
        "finish": ch.get("finish_reason"),
        "prompt_n": t.get("prompt_n"),
        "prompt_ms": t.get("prompt_ms"),
        "predicted_n": t.get("predicted_n"),
        "predicted_ms": t.get("predicted_ms"),
        "tok_s": t.get("predicted_per_second"),
        "draft_n": t.get("draft_n"),
        "draft_n_accepted": t.get("draft_n_accepted"),
        "cache_n": t.get("cache_n"),
        "text_head": (ch.get("message", {}) or {}).get("content", "")[:200],
        "raw_timings": t,
    }


def summarize(rows):
    def med(k):
        vals = [r[k] for r in rows if r.get(k) is not None]
        return round(statistics.median(vals), 1) if vals else None
    dn = sum(r["draft_n"] or 0 for r in rows)
    da = sum(r["draft_n_accepted"] or 0 for r in rows)
    return {
        "n": len(rows),
        "tok_s_median": med("tok_s"),
        "predicted_n_median": med("predicted_n"),
        "wall_s_median": med("wall_s"),
        "draft_n_total": dn,
        "draft_accept_rate": round(da / dn, 3) if dn else None,
        "spec_active": dn > 0,
    }


def print_report(tag, res):
    print(f"\n=== {tag} ===")
    for kind, block in res["kinds"].items():
        s = block["summary"]
        spec = (f"draft acc {s['draft_accept_rate']:.0%} ({s['draft_n_total']} drafted)"
                if s["spec_active"] else "no drafter active")
        print(f"  {kind:5s}  {s['tok_s_median']:>6} tok/s   "
              f"{s['predicted_n_median']:>6} tok   {s['wall_s_median']:>6}s   {spec}")


def compare(paths):
    runs = [json.loads(pathlib.Path(p).read_text()) for p in paths]
    base = runs[0]
    print(f"{'config':18s} {'copy tok/s':>11s} {'Δ':>7s} {'free tok/s':>11s} {'Δ':>7s}  drafter")
    for r in runs:
        cells = [r["tag"].ljust(18)]
        for kind in ("copy", "free"):
            v = r["kinds"][kind]["summary"]["tok_s_median"]
            b = base["kinds"][kind]["summary"]["tok_s_median"]
            d = f"{(v / b - 1) * 100:+.0f}%" if v and b else "  n/a"
            cells += [f"{v:>11}", f"{d:>7}"]
        s = r["kinds"]["copy"]["summary"]
        cells.append(f"  acc {s['draft_accept_rate']:.0%}" if s["spec_active"] else "  none")
        print(" ".join(cells))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url"); ap.add_argument("--key", default="colab")
    ap.add_argument("--model", default="Qwen3.6-27B-Q6_K.gguf")
    ap.add_argument("--parquet", default=str(HERE.parent.parent / "data" / "2027Bourse.parquet"))
    ap.add_argument("--first-page", type=int, default=20)
    ap.add_argument("--n-pages", type=int, default=4)
    ap.add_argument("--tag", default="run")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--max-tokens", type=int, default=900)
    ap.add_argument("--temperature", type=float, default=0.7)
    ap.add_argument("--top-p", type=float, default=0.8)
    ap.add_argument("--top-k", type=int, default=20)
    ap.add_argument("--kinds", default="copy,free")
    ap.add_argument("--compare", nargs="+", metavar="JSON")
    args = ap.parse_args()

    if args.compare:
        compare(args.compare); return
    if not args.url:
        sys.exit("--url required (or --compare)")

    passage = load_passage(args.parquet, args.first_page, args.n_pages)
    print(f"passage: {len(passage)} chars from {pathlib.Path(args.parquet).name} "
          f"pp.{args.first_page}-{args.first_page + args.n_pages - 1}")

    # warm-up (loads slot, ignore)
    one_call(args.url, args.key, args.model, "Bonjour. Réponds en un mot.", 8,
             args.temperature, args.top_p, args.top_k)

    res = {"tag": args.tag, "model": args.model, "sampling": {
        "temperature": args.temperature, "top_p": args.top_p, "top_k": args.top_k,
        "max_tokens": args.max_tokens}, "kinds": {}}
    for kind in args.kinds.split(","):
        prompt = PROMPTS[kind].format(passage=passage)
        rows = []
        for i in range(args.n):
            row = one_call(args.url, args.key, args.model, prompt, args.max_tokens,
                           args.temperature, args.top_p, args.top_k)
            rows.append(row)
            spec = (f" draft {row['draft_n_accepted']}/{row['draft_n']}"
                    if row.get("draft_n") else "")
            print(f"  [{kind} {i + 1}/{args.n}] {row['tok_s']} tok/s  "
                  f"{row['predicted_n']} tok  {row['wall_s']}s  finish={row['finish']}{spec}")
        res["kinds"][kind] = {"rows": rows, "summary": summarize(rows)}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{args.tag}.json"
    out.write_text(json.dumps(res, ensure_ascii=False, indent=2))
    print_report(args.tag, res)
    print(f"\nsaved → {out}")


if __name__ == "__main__":
    main()
