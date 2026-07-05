---
name: anyapi-run
description: |
  Use this skill whenever the user asks to run AnyAPI, call an AnyAPI SKU, fetch scraping results, save API output for an agent, use fields, max_items, summary, avoid flooding context, handle HTTP 402, or write AnyAPI results to .anyapi files.
allowed-tools: [Bash(anyapi *), Bash(npx anyapi-cli *)]
---

# AnyAPI run

## When to use

Use this after you know the SKU and have input JSON that matches the schema. By default, results are saved to disk for filesystem-native agent workflows.

## Quick start

```sh
anyapi run reddit.search --input '{"query":"anyapi","limit":5}'
```

Default output goes to:

```text
.anyapi/<sku>-<timestamp>.json
```

The command prints the path, `costUsd`, and item count. Use the file path as context instead of pasting large JSON into chat.

## Context-budget controls

```sh
anyapi run reddit.search --input '{"query":"anyapi"}' --fields title,url,score --max-items 10
anyapi run reddit.search --input '{"query":"anyapi"}' --summary
```

- `--fields a,b` keeps only selected keys.
- `--max-items N` caps returned rows.
- `--summary` returns a structural outline.
- `--json` prints JSON to stdout instead of writing a file.
- `-o path` writes to a specific path.

## 402 handling

If you see `key_cap_exceeded`, run:

```sh
anyapi claim
```

Send the claim URL and claim token to the human. They can claim or fund the key, then the same key can keep running.

## Tips

- Use `--fields` before `--max-items` when context is tight.
- Use `--summary` to inspect shape before requesting full rows.
- Prices and run costs are always USD.
