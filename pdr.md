# PDR — Tarvos Triton 1 for Solana

Updated: 13 October 2026. Package: `n8n-nodes-tarvos-triton-one` 0.2.0. Status: local implementation; authenticated provider acceptance remains outstanding.

## Approved scope

Implement all feasible researched groups, including Titan quotes and swaps through **Solana Wallet**. Keep short-lived actions and moderate-volume streams inside n8n. Use an optional self-hosted worker for persistent ingestion and shared account state.

This revision supersedes the original polling-only, 31-operation design, retained in [PDR-0.1-HISTORICAL.md](docs/PDR-0.1-HISTORICAL.md). Research is in [SERVICE-RESEARCH.md](docs/SERVICE-RESEARCH.md); the generated [operation contract](docs/operation-contract.json) records every shipped field and action.

## Experience

- **Tarvos Triton 1**: 77 actions across account, token, transaction, network, block, fee, digital asset, Titan, archive, administration and worker resources.
- **Tarvos Triton 1 Trigger**: eight service choices with native n8n activation/deactivation.
- **Solana Wallet**: connector beneath submission, Cascade and Titan swap actions. Its details contain public address, expected network, signing mode and wallet credential. Keep this exact display name.
- Official TARVOS logo, including light/dark variants.
- Reads, simulation and quote monitoring must not load signing credentials.
- Examples remain inactive, without credential IDs, private keys or pinned sensitive results.

## Service delivery

| Group | Implementation | Boundary |
| --- | --- | --- |
| A RPC/Cloudbreak | Expanded RPC, indexed mint reads, token context/data slicing | Endpoint capability dependent |
| B DAS | Proof batches, creators, authorities, signatures, editions, fungible search | Disabled getAssetsByGroup excluded |
| C Whirligig | Account/program/log/signature/slot/block/transaction trigger | Best-effort, no lossless replay claim |
| D Dragon/Riptide | Official Yellowstone codecs with JavaScript gRPC; trigger and worker adapter | Correct service endpoint/access required |
| E Vixen | Official parsed-program SDK trigger and worker adapter | Pinned SDK programs, program-wide traffic |
| F Fumarole | Worker, fixed region, durable SQLite inbox, replay deduplication | Fixed source boundary; retention-limited recovery |
| G Transactions | Simulation, bundle simulation, Cascade, Shield policies, confirmation | No Block Engine sendBundle or policy creation |
| H Titan | Info/venues/providers, quotes, streams, swaps | Triton WebSocket proxy; ExactIn, v0 instruction routes |
| I Account Sync | Official SDK shared worker | Confirmed state; slot freshness bound; fallback provenance uncertain |
| J Archive | Address cursor and bounded block exports | No retired hosted archive gRPC or Jetstreamer deployment |
| K Administration | Read account/subscription/endpoint/token/watch-list inventory | Separate token; no provisioning, deletion or secret export |
| L Early signals | Deshred, Harmonic, BAM | Provisional; raw-shred receiver remains external infrastructure |

## Transaction invariants

Every send uses the wallet capability. Validate the RPC genesis and wallet network, canonical transaction encoding, required signers, signatures, supported legacy/v0 format, lookup tables and recent blockhash. Reject durable nonce transactions. Secrets must not escape the credential closure.

Titan requests specify exact integer input, mints, slippage and V0. Validate response mints, amount and mode; select the requested provider or ExpectedWinner. Validate route input, route slippage, minimum output after slippage, expiry and signer set. Resolve lookup tables, apply user-controlled compute fees, enforce 1,232 bytes, sign and simulate. Recheck expiry immediately before submission. Provider instructions define DEX semantics and on-chain slippage enforcement; the package does not independently audit every DEX program.

Block n8n Retry on Fail for every send. Return signature and acceptance without claiming finality. An ambiguous outcome retains the known signature and stops further item processing. No automatic re-quote, re-sign or resend. Confirmation is bounded to 120 seconds. Cascade always performs separate signed simulation. Shield accepts at most eight validated policy addresses.

## Monitoring and durability

Direct triggers batch by size/time, cap executions per minute, and release streams/timers on shutdown. A disconnection becomes a fatal n8n trigger error; reactivation may leave gaps. The event envelope includes source, kind, network label, commitment, slot where available, fingerprint, observation time and binary data encoded as base64. Preserve 64-bit values, preconfirmation coverage notices and slot boundaries. Unset execution outcome is never success. Emission is not downstream completion.

The optional worker uses bearer authentication and SQLite WAL/FULL durability. Persist batch receipts before responding; replay the same batch until an explicit matching acknowledgement. Acknowledgement is idempotent and separate from ingestion. Downstream effects must deduplicate by event identity. Storage capacity failures stop ingestion and expose source health. Pruning must not remove unacknowledged consumer data.

Fumarole binds source name to region/filter fingerprint and records slot plus blockhash. Its current SDK lacks a public post-write commit API. Disable automatic source commits, keep a fixed replay boundary and deduplicate on restart while within retention. Refuse expired boundaries and region/filter changes instead of resetting to latest. Advancing source checkpoints remains a future integration gate; this version must not claim indefinite production recovery.

Account Sync runs once in the shared worker. Only configured addresses are readable. Bound reads by current confirmed RPC slot minus maximum slot lag. This is not a wall-clock freshness measurement or proof of a cache hit. Reject unsafe numeric SDK balances rather than silently rounding.

## Credentials and deployment

Separate RPC, wallet, stream, management and worker credentials. Validate endpoints and disable redirects. Titan proxy authentication uses its documented token path; sanitize all errors. Worker source secrets use environment variables; signing stays in n8n. Remote worker access requires HTTPS at a reverse proxy.

Self-hosted n8n only. Native SDK support depends on platform. The optional worker is separately licensed AGPL-3.0-only because of its Fumarole dependency. Account Sync's npm metadata omits its license, but its official repository supplies Apache-2.0; retain the bundled upstream license notice. This implementation does not authorize npm publication, remote repository changes or website deployment.

## Acceptance gates

Offline verification covers request fixtures, Titan binary messages and wallet signing, simulation/expiry failure paths, trigger lifecycle, worker auth and durable receipt restart. Record exact results in [VALIDATION.md](docs/VALIDATION.md).

Before production: authenticated read/stream checks for every selected service, provider reconnect/retention exercises, deployment-platform and load tests, queue topology review, an explicitly authorized small transaction with finality reconciliation, dependency advisory review and worker license compliance. Passing fixture tests does not satisfy those external gates.
