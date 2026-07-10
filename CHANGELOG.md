# Changelog

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
