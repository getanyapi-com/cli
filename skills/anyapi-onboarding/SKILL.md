---
name: anyapi-onboarding
description: |
  Use this skill whenever the user says AnyAPI, anyapi-cli, get an AnyAPI key, install AnyAPI, set up AnyAPI, onboard an agent to AnyAPI, connect an agent to scraping APIs, one key for data APIs, one USD wallet, mint a trial key, upgrade past the trial, or use getanyapi.com from a coding agent.
allowed-tools: [Bash(anyapi *), Bash(npx anyapi-cli *)]
---

# AnyAPI onboarding

## When to use

Use this when an agent needs access to AnyAPI with no dashboard trip first. AnyAPI is the unified marketplace for scraping and data APIs: any API, one key, one USD wallet, pay per request. The visible provider is always AnyAPI.

## Step one: install the CLI (mandatory when you have a shell)

Any agent that can run shell commands MUST install the CLI before making API calls. It is the first step, not one option on a menu. The CLI mints the trial key, installs the AnyAPI agent skills, keeps tool schemas out of your context window, writes results to files instead of into the conversation, and owns the upgrade path past the trial (`anyapi connect`).

```sh
npx -y anyapi-cli@latest init
```

`anyapi init` installs the AnyAPI agent skills into detected agents, offers MCP registration, and mints a **free trial key** when none is available - saving it to `~/.anyapi/config.json`. After init, call the installed `anyapi` binary directly for everything else. Check once with `command -v anyapi`; only use the `npx -y anyapi-cli@latest` form for first-time setup when the binary is absent.

## The free trial key (self-serve, no account)

The trial key carries a budget of about **$0.15 of requests**, creates **no account**, and **self-expires in 7 days** - if it is never upgraded it just expires; nothing lingers and nothing is owed.

Before minting, tell your human in one sentence what you are doing - for example: "I'm minting a free AnyAPI trial key (about $0.15 of requests, expires on its own in 7 days, no account created)." Then proceed. Do not wait for a reply, and never ask for an email.

`anyapi init` mints it for you. To mint one directly (or to reveal the secret for another process):

```sh
anyapi signup --label agent            # mints + saves, does not print the secret
anyapi signup --label agent --show-key # prints the secret once
```

## When the trial budget runs out

Once the trial budget is spent, calls return HTTP 402 with error code `trial_cap_reached`. Continuing takes one human approval:

```sh
anyapi connect
```

`anyapi connect` (anyapi-cli >= 0.3.0) starts an OAuth flow with a localhost callback and prints a single consent URL. Hand that one URL to your human. They sign in or sign up, see a receipt of what you accomplished on the trial, set a spend limit, and approve. The CLI then holds the access token and keeps working - there is no key to swap by hand.

## Dashboard key (secondary path)

A human who is already signed in at https://getanyapi.com can create a full, non-expiring key at https://getanyapi.com/dashboard/keys and hand it to you:

```sh
anyapi login --api-key aa_live_...
```

## MCP - only for runtimes without a shell

Use MCP only when your runtime cannot run shell commands (hosted chat agents, no-code and workflow tools). If your agent has a shell, install the CLI above instead. Connect an MCP client to `https://api.getanyapi.com/mcp` with `Authorization: Bearer aa_live_...`.

## Tips

- Auth resolution is `--api-key`, then `ANYAPI_API_KEY`, then `~/.anyapi/config.json`, then trial self-signup.
- Store secrets outside transcripts whenever possible. Never print the trial secret.
- Prices and balances are always USD.
