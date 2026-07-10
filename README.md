# anyapi-cli

Official CLI for [AnyAPI](https://getanyapi.com): any API, one key, one USD wallet, pay per request.

## Install

```sh
npx -y anyapi-cli@latest --help
```

For local development:

```sh
npm install
npm run build
node dist/index.js --help
```

## Quick start

```sh
anyapi signup --label my-agent
anyapi search reddit
anyapi describe reddit.search
anyapi run reddit.search --input '{"query":"anyapi","limit":5}'
```

`signup` creates a capped starter key, stores it in `~/.anyapi/config.json`, and prints the claim URL. The secret key is not printed unless you pass `--show-key`.

## Commands

- `anyapi signup [--email <email>] [--label <label>] [--show-key]` - create a capped starter key and save it locally.
- `anyapi login --api-key aa_live_...` - store an existing dashboard key locally.
- `anyapi search <query>` - search the public catalog and print SKU, name, and USD price terms.
- `anyapi list [--category <cat>]` - list catalog APIs.
- `anyapi describe <sku>` - print the authenticated API definition, including schemas and USD pricing.
- `anyapi run <sku> [--input '<json>'] [-i file] [--jq <expr>] [--fields a,b] [--max-items N] [--summary] [-o path] [--json]` - run an API. Always saves the full result; shape flags trim only the stdout view.
- `anyapi view [path] [--last [sku]] [--jq <expr>] [--fields a,b] [--max-items N] [--summary] [--json]` - re-shape a saved run file locally. Zero network, zero cost.
- `anyapi balance` - print the remaining USD balance.
- `anyapi claim` - reprint stored claim guidance.
- `anyapi init [--all] [--yes]` - install bundled agent skills and show or apply MCP setup snippets.
- `anyapi setup skills` - install only the bundled skills.

Auth resolution order is `--api-key`, then `ANYAPI_API_KEY`, then `~/.anyapi/config.json`. Commands that require auth offer self-signup in an interactive terminal.

## Run output and local shaping

`run` always fetches and saves the **full** result to `.anyapi/<sku>-<timestamp>.json` and prints the path, `costUsd`, and `items`. Shaping is **local**: `--jq`, `--fields`, `--max-items`, and `--summary` trim only what is printed to stdout, never the saved file.

Because the full result is on disk, you pay once and re-slice it forever at zero cost with `anyapi view`:

```sh
# One paid run, saved in full:
anyapi run web.scrape --input '{"url":"https://example.com"}'

# Re-slice the same saved file for free - no network, no charge:
anyapi view --last web.scrape --jq '.data | {title, description}'
anyapi view --last web.scrape --jq '.data.markdown[:3500]'      # first chunk
anyapi view --last web.scrape --jq '.data.markdown[3500:7000]'  # next chunk
anyapi view --last --summary                                    # fields + byte sizes
```

jq targets the result **output envelope** `{found, data}`, so expressions start at `.data` or `.found` (identical on `run` and `view`). `view --last <sku>` reads the newest saved run for that SKU; omit the sku (or run a bare `anyapi view`) for the newest run of any SKU; or pass an explicit file path. A wrong jq expression prints the error and exits non-zero - the saved result is untouched, so just fix the expression and re-run `view`.

jq runs via a bundled WebAssembly build of jq (real jq 1.8.2, no system install required); if it cannot load, the CLI falls back to a system `jq` binary.

Migration note: shape flags used to be sent to the server and trimmed the saved file. As of 0.2.0 they are local and the saved file is always complete.

## Publish

Tags matching `v*` publish to npm through GitHub Actions using the `NPM_TOKEN` secret and npm provenance.
