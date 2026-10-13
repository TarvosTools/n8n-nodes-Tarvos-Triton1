# Security

Report vulnerabilities privately to hello@tarvos.tools; include reproduction steps with synthetic credentials and transactions only.

Wallet keys use n8n's encrypted credential store. Never share real keys, seed phrases, API tokens, database encryption keys, execution exports containing secrets or funded test fixtures. Execution-scoped wallet capabilities are not serializable workflow outputs.

The runtime uses pinned third-party libraries for Solana serialization and Ed25519 verification. This is a self-hosted package, not a dependency-free/Cloud-verified integration. See the dependency audit limitations in `docs/VALIDATION.md` before a production release. Review updates instead of applying breaking security upgrades blindly.

The node does not infer whether arbitrary prepared transaction instructions are economically safe. Whoever can configure/execute a signing workflow can cause the configured wallet to authorize supported transactions. Attach only deliberately selected wallets and restrict workflow/credential execution privileges. Preflight is required but is not a guarantee of transaction outcome.

No automatic retries, blockhash replacement, private metadata downloads, arbitrary endpoint overrides or hidden transaction construction exist. A submitted transaction may have reached the network even when the HTTP request fails. Reconcile its known signature before retrying identical bytes.


## Version 0.2.0 service boundaries

Titan swaps fetch fresh routes from the authenticated Triton proxy. The package verifies quote identity, signer constraints, expiry, size, fees and simulation; provider instructions still define the DEX semantics and on-chain slippage guard. No automatic retries, re-quotes or re-signing after uncertain submission. Titan token paths are sanitized from errors. Stream failures never imply gapless replay.

The optional worker has separate bearer authentication, configured consumers and explicit acknowledgement receipts. It never stores signing keys. Deploy remote access behind TLS and protect the SQLite volume. Fumarole recovery uses a fixed retained boundary until a safe post-write source-commit API is available; see worker/README.md. Management operations are read-only and redact token/secret fields.
