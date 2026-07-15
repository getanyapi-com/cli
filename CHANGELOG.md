# Changelog

## 0.3.2

### Changed

- `anyapi search` now uses the dedicated ranked catalog search endpoint.
- Discovery responses are normalized to AnyAPI-branded, nested USD pricing. This
  bridge release reads both the current credit-based contract and its replacement
  so it remains compatible across the gateway cutover.

## 0.3.1

### Changed

- `anyapi connect` now works from a cold start with no trial key. It resolves the
  OAuth client id in priority order: the per-trial `clientId` (trial upgrade), else
  a CLI client previously registered via OAuth 2.1 Dynamic Client Registration
  (`cliClientId`), else a fresh DCR whose client id is persisted and reused (the
  registration endpoint is IP-rate-limited). It no longer dead-ends with
  "run `anyapi init` or `anyapi signup` first"; it only errors if DCR itself fails.

## 0.3.0

Reframed agent onboarding: self-signup is a free trial, and `anyapi connect`
upgrades past it via a one-URL OAuth approval.

### Added

- `anyapi connect` - upgrade past the free trial with OAuth 2.1 Authorization Code
  + PKCE (S256) over an ephemeral `127.0.0.1/callback` loopback. Discovers the
  authorization server via RFC 8414 metadata (falls back to the hardcoded gateway
  endpoints), prints a single consent URL for a human, and on approval stores the
  `aa_at_...` access token, refresh token, expiry, and scope in config - the access
  token becomes the active key with nothing to swap by hand.
- `anyapi init` now mints the free trial key when none is resolvable, alongside
  installing skills and MCP setup.

### Changed

- `anyapi signup` drops the `--email`/sponsor option and speaks the trial framing
  (about $0.15 of requests, no account, self-expires in 7 days). It persists the
  trial's OAuth `clientId` for `anyapi connect`, and relays the server `notice`.
- HTTP 402 handling now recognizes `trial_cap_reached` (was `key_cap_exceeded`) and
  points at `anyapi connect`.

### Removed

- The `anyapi claim` command and all sponsor/claim vocabulary. The continue path is
  the OAuth upgrade, not a sponsor email or claim token.

## 0.2.0

jq-first local shaping. Run once, then re-slice the saved result forever at zero cost.

### Added

- `anyapi view [path] [--last [sku]] [--jq <expr>] [--fields a,b] [--max-items N] [--summary] [--json]` -
  re-shape a saved run envelope locally. Zero network, zero cost. `--last [sku]`
  resolves the newest `.anyapi/<sku>-*.json` by mtime (newest overall when the sku is
  omitted); a bare `anyapi view` does the same.
- `anyapi run --jq <expr>` - a gh-CLI-style jq flag. jq runs locally over the result
  output envelope `{found, data}` (paths start at `.data`/`.found`), identical on `run`
  and `view`.
- Bundled WebAssembly jq engine (real jq 1.8.2, no system install required), with a
  system `jq` binary fallback when the wasm engine cannot load.

### Changed

- **Breaking behavior:** `--fields`, `--max-items`, and `--summary` are now LOCAL and
  shape only the stdout view. They are no longer sent to the server and no longer trim
  the saved file. `run` always fetches and saves the full result, so digging deeper no
  longer costs a re-run.
- With shape flags and without `--json`, `run` prints the 3-line summary plus the
  locally shaped JSON.
- Large unshaped results print a one-line hint pointing at `anyapi view --last <sku>`
  for free re-slicing (instead of the server's shaping hint, which is dropped).
- A failed jq expression prints the error to stderr and exits non-zero; the saved
  result is untouched.

## 0.1.1

- Initial published CLI: `signup`, `login`, `search`, `list`, `describe`, `run`,
  `balance`, `claim`, `init`, `setup skills`.
