---
name: anyapi-run
description: |
  Use this skill whenever the user asks to run AnyAPI, call an AnyAPI SKU, fetch scraping results, save API output for an agent, slice or reshape a saved result with jq/fields/max_items/summary, dig deeper into a result without paying again, avoid flooding context, handle HTTP 402 trial_cap_reached, or read .anyapi files.
allowed-tools: [Bash(anyapi *), Bash(npx anyapi-cli *)]
---

# AnyAPI run

## When to use

Use this after you know the SKU and have input JSON that matches the schema. `run`
always fetches and saves the FULL result; you then shape it locally for free.

## Quick start

```sh
anyapi run reddit.search --input '{"query":"anyapi","limit":5}'
```

Default output goes to:

```text
.anyapi/<sku>-<timestamp>.json
```

The command prints the path, `costUsd`, and item count. Use the file path as
context instead of pasting large JSON into chat.

## Run once, reshape forever at zero cost

Shaping is LOCAL. The saved file is always the full result, so you pay once and
re-slice as many times as you want with `anyapi view` - no network, no charge.
Never re-run a SKU just to change the shape of what you already fetched.

```sh
# One paid run, saved in full:
anyapi run web.scrape --input '{"url":"https://example.com"}'

# Then slice the SAME saved file for free, as many times as you like:
anyapi view --last web.scrape --jq '.data | {title, description}'
anyapi view --last web.scrape --jq '.data.markdown[:3500]'      # first chunk
anyapi view --last web.scrape --jq '.data.markdown[3500:7000]'  # next chunk
```

`view --last <sku>` reads the newest saved run for that SKU (omit the sku for the
newest run of any SKU; a bare `anyapi view` does the same). Pass a path to read a
specific file: `anyapi view .anyapi/web.scrape-....json --jq '.data'`.

## Shaping flags (local, on both run and view)

- `--jq <expr>` runs a jq expression over the result output. jq targets the
  `output` envelope `{found, data}`, so paths start at `.data` or `.found`
  (e.g. `--jq '.data.items[0]'`, `--jq '.data.markdown[:2000]'`).
- `--fields a,b.c` keeps only selected keys per item (dotted paths descend).
- `--max-items N` caps how many rows are shown (adds a `_truncated` marker).
- `--summary` prints a structural outline with per-field byte sizes, so you learn
  WHAT is huge before fetching it.
- `--json` on `run` prints to stdout and writes no file; on `view` it prints
  compact instead of pretty.

Important: on `run`, these flags shape only the STDOUT view. They do NOT trim the
saved file - it is always the full result, ready for `view` to re-slice.

## Big result? Inspect, then slice

```sh
anyapi view --last --summary                 # see fields and byte sizes
anyapi view --last --jq '.data.items[:5]'    # pull just what you need
```

## 402 handling

If a run returns HTTP 402 `trial_cap_reached`, the free trial budget is spent
(no charge was made for the blocked call). To keep going, run:

```sh
anyapi connect
```

`anyapi connect` (anyapi-cli >= 0.3.0) prints a single OAuth consent URL. Hand
that one URL to your human; they approve continued spend and set a limit, then
the same commands keep working with no key to swap by hand.

## Tips

- Prefer `--jq` for anything non-trivial; use `--fields`/`--max-items` for quick trims.
- A wrong jq expression prints the error and exits non-zero. Your data is safe in
  the saved file - just fix the expression and re-run `view`.
- Prices and run costs are always USD.
