---
name: anyapi-onboarding
description: |
  Use this skill whenever the user says AnyAPI, anyapi-cli, get an AnyAPI key, install AnyAPI, set up AnyAPI, onboard an agent to AnyAPI, connect an agent to scraping APIs, one key for data APIs, one USD wallet, claim an agent key, or use getanyapi.com from a coding agent.
allowed-tools: [Bash(anyapi *), Bash(npx anyapi-cli *)]
---

# AnyAPI onboarding

## When to use

Use this when an agent needs access to AnyAPI with no dashboard trip first. AnyAPI is the unified marketplace for scraping and data APIs: any API, one key, one USD wallet, pay per request. The visible provider is always AnyAPI.

## Quick start

```sh
npx -y anyapi-cli@latest signup --label agent
```

This creates a capped starter key, saves it to `~/.anyapi/config.json`, and prints the claim URL. It does not print the secret key. If you truly need to pass the key into another process, run:

```sh
npx -y anyapi-cli@latest signup --label agent --show-key
```

Prefer self-signup first. It needs zero human login and works immediately. Use a dashboard key second, only when a human already has one:

```sh
anyapi login --api-key aa_live_...
```

## Claim flow

```sh
anyapi claim
```

Give the human the claim URL and claim token. Claiming keeps the same key active, removes the starter limitations, and lets the human fund the wallet.

## Key options

- `--email <email>` sets the sponsor email for approval and claim guidance.
- `--label <label>` names the key.
- `--show-key` prints the secret once. Avoid it unless the next command needs the literal value.

## Tips

- Auth resolution is `--api-key`, then `ANYAPI_API_KEY`, then `~/.anyapi/config.json`.
- Store secrets outside transcripts whenever possible.
- Prices and balances are always USD.
