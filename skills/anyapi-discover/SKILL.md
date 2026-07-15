---
name: anyapi-discover
description: |
  Use this skill whenever the user asks to find an API, search AnyAPI, list data APIs, choose a scraping API, inspect an AnyAPI schema, describe a SKU, compare APIs, discover catalog endpoints, or decide which AnyAPI SKU to run.
allowed-tools: [Bash(anyapi *), Bash(npx anyapi-cli *)]
---

# AnyAPI discover

## When to use

Use this before running an unknown task. Search or list first, then describe the chosen SKU so inputs match the schema.

## Quick start

```sh
anyapi search "reddit posts"
anyapi list --category social
anyapi describe reddit.search
```

Search and list are public. Describe is authenticated because it returns the full API definition.

## Discovery loop

1. Search by user intent.
2. Pick the closest SKU.
3. Describe the SKU.
4. Build input JSON from the input schema.
5. Run only after the schema is clear.

## Key options

- `anyapi search <query>` uses the dedicated ranked discovery search.
- `anyapi list --category <cat>` narrows by category.
- `anyapi describe <sku>` prints input schema, output schema, and USD pricing.
- Discovery pricing is always nested under `pricing`; ranked search reports
  `relevance` per result and `ranking` for the response.

## Tips

- Prefer exact SKU names from search output.
- If several SKUs match, describe the cheapest useful one first by reading the USD price terms.
- Do not infer hidden providers. The provider shown to users is AnyAPI.
