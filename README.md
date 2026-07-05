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
- `anyapi run <sku> [--input '<json>'] [-i file] [--fields a,b] [--max-items N] [--summary] [-o path] [--json]` - run an API.
- `anyapi balance` - print the remaining USD balance.
- `anyapi claim` - reprint stored claim guidance.
- `anyapi init [--all] [--yes]` - install bundled agent skills and show or apply MCP setup snippets.
- `anyapi setup skills` - install only the bundled skills.

Auth resolution order is `--api-key`, then `ANYAPI_API_KEY`, then `~/.anyapi/config.json`. Commands that require auth offer self-signup in an interactive terminal.

## Run output

By default, `run` writes JSON to `.anyapi/<sku>-<timestamp>.json` in the current directory and prints the path, `costUsd`, and `items`. Use `--json` to print the response JSON to stdout instead. Use `--fields`, `--max-items`, and `--summary` to keep responses compact for agent context windows.

## Publish

Tags matching `v*` publish to npm through GitHub Actions using the `NPM_TOKEN` secret and npm provenance.
