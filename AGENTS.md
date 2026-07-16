# AnyAPI CLI agent instructions

This repository is a customer-facing adapter in the AnyAPI ecosystem. The authoritative wiring,
contract invariants, impact classifier, repository gates, and rollout order live in the main
repository's [ECOSYSTEM.md](https://github.com/getanyapi-com/anyapi/blob/main/ECOSYSTEM.md).

Before changing discovery, catalog, search, pricing, schemas, MCP/OpenAPI/payment integration,
SDK-facing behavior, bundled skills, or documentation:

1. Read `ECOSYSTEM.md` from the main repository.
2. Classify the change and create the impact ledger it requires.
3. Mark every ecosystem surface updated or unaffected with a concrete reason.
4. Follow the documented release order; do not infer it from this repository alone.

The CLI is a handwritten discovery consumer. Its `anyapi-onboarding`, `anyapi-discover`, and
`anyapi-run` skills are task-specific derivatives of the ecosystem contract and must be reviewed
whenever their documented commands or contracts change. Do not copy wire shapes into this file.

Run `npm test && npm run build` before handing off changes.
