# explorer/ — browsable views of each reference run

Two views per thesis, both generated from `results/<thesis>/` (no LLM, deterministic). Each
HTML file is standalone: open it in a browser or send it as one file.

| file | what it is | built by |
|---|---|---|
| `<thesis>/index.html` + `data.json` | **Explorer v1**: every fiche step and every note iteration with its full prompt, reasoning, output and REPL stdout | `scripts/tools/build_explorer.py --thesis-dir results/<thesis> --out explorer/<thesis>` |
| `<thesis>/reasoning.html` + `reasoning.json` | **Raisonnement view (v2)**: what the note's RLM loop read, why, and when — a reading map of the thesis, key figures, and one card per iteration | `scripts/tools/build_reasoning.py --thesis-dir results/<thesis>` |

## `reasoning.json` — the contract for a UI

`reasoning.html` is a mockup that renders **only** this JSON, so it shows how each field lands on
the page. A UI can reproduce it or lay the same data out differently.

```
{ "schema": "explorer_v2.reasoning/1",
  "about":  how to read the file,
  "source": { thesis_id, run_id, pdf_file, pdf_page_offset, generator },
  "sections": [ … in display order … ] }
```

Every entry of `sections` has the same five keys:

| key | meaning |
|---|---|
| `id` | stable key of the page section |
| `ui_label` | heading as displayed |
| `shows` | what the section displays and how it behaves (hover, click, ordering) |
| `fields` | meaning and unit of each field in `data` |
| `data` | the content: display-ready French texts, with the structured values next to them |

| `id` | `data` |
|---|---|
| `header` | product name, `doc_label`, the view tabs (`active` marks this one) |
| `reading_map` | subtitle, legend, `granularity`, and per section: `pages`, `pages_read`, `share_read` (0–1), `tick_label`, `is_content`, `pdf_page` |
| `most_read` | up to 5 sections: `share_read`, `pages_read`, `display_value` |
| `never_opened` | content sections never read: `title`, `page_start`, `pdf_page`; `empty_message` |
| `kpis` | 4 tiles: `key`, `value`, `caption`, `raw` (the numbers behind them) |
| `iterations` | one card per RLM turn: `kind` (lecture / rédaction / assemblage), `seconds`, `header_label`, `selected_by_default`, `intention` (`headline`, `full`, `language`), `gesture` (`summary`, `readings` = page jumps and phrase searches, `drafts`, `code`), `feedback` (`extracts` with `pdf_page`, `error`, `empty_message`) |
| `iteration_bars` | `max_seconds`, `caption`, one row per iteration (`n`, `seconds`, `kind`) |

Things to know:
- **Pages** are parquet pages; use `pdf_page` to open the PDF (`data/pdf/<thesis>.pdf`, linked
  relatively from `pdf_file`). They differ only for 2024LORR0201 (+1, an extra cover page).
- **Intention** is the model's own reasoning for that turn, untranslated: mostly English,
  sometimes French (`language`).
- **Pages consulted** = pages the model received as extracts. It is lower than
  `trace_grounding.py`'s "pages read", which also counts the TOC map in the prompt.
- **Reading map granularity**: top-level TOC entries, or level-1 subsections when the TOC has
  fewer than 10 top-level entries (Daley).
