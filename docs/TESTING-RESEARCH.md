# Triton node testing research and acceptance plan

Research date: 13 October 2026. Scope: package 0.2.0, main node versions 1–1.3, trigger versions 1–1.2, Solana Wallet, 77 actions, eight stream choices and the optional worker.

This is a proposed validation programme, not a certification. Provider documentation was checked against the local implementation and test files. No authenticated provider calls, funded transactions, account changes or production load tests were performed. Recommendations and target thresholds below are our proposed engineering criteria, not vendor guarantees.

## Executive finding

The package has useful offline coverage, but is not yet demonstrated end to end against Triton. We need five distinct forms of evidence: deterministic contracts, actual n8n execution, live provider acceptance, transaction outcomes, and operational recovery. Passing one cannot substitute for another. n8n itself recommends both manual and automated node testing. [n8n testing](https://docs.n8n.io/connect/create-nodes/test-your-node.md)

### Newly verified problems and gaps

| Priority | Finding | Required response |
| --- | --- | --- |
| P0 before a funded swap | Minimum output is checked against quote metadata in `buildSwap`; our code does not independently decode each DEX instruction to establish its on-chain output bound. Successful simulation alone does not establish the intended economic result. | Add adversarial instruction fixtures and inspect simulated/confirmed token deltas and destination ownership. Establish whether the user floor is enforced in the transaction or is only a quote acceptance filter; do not describe the latter as an on-chain guarantee. |
| P1 | Fresh baseline on the current tree: **132/133 pass**, one failure. `test/regressions.test.cjs:217` expects 12 example files; there are now 13. The new example also lacks the `pinData: {}` property that this test requires. | Integrate the new example into the generator, update the inventory assertion while preserving credential/inactive checks, and rerun the complete release sequence after packaging changes. Earlier 133-pass evidence preceded adding example 13. |
| P1 | Existing Riptide UI/docs describe provisioned dedicated-only access. Current official docs describe a shared endpoint at `riptide.rpcpool.com`, shared gRPC tokens, and mainnet-only access. | Correct labels/help and test shared versus dedicated-token rejection. This is a documentation/entitlement mismatch, not proof our transport is broken. [Riptide](https://docs.triton.one/project-yellowstone/riptide) |
| P1 | Fumarole worker holds its remote replay boundary fixed because the pinned adapter does not expose the post-persistence commit mechanism it needs. | Test recovery at and beyond actual retention. A fixed origin eventually becomes unrecoverable even during otherwise healthy operation; do not market indefinite durable recovery. |
| P1 | A 429 stops an action and reports at least 10 seconds of cooldown, but the node does not coordinate a deployment-wide IP pause. | Test concurrent workflows/workers; implement or document a shared egress limiter before relying on automatic recovery. Triton documents a 10-second pause for all requests from the affected IP. [Rate limits](https://docs.triton.one/core-features/ratelimits) |
| P1 | Runtime smoke script exists but CI does not run it; it constructs version-1 nodes, not the new guided quote/wallet flow. | Add real runtime coverage for main 1.3, public-address-only wallet, new defaults, queue execution and all supported import versions. |
| P2 | The worker test called “survives process restart” closes/reopens SQLite in one process. That proves reopen persistence, not abrupt process-death recovery. | Add child-process kill/restart tests at persistence and acknowledgement boundaries. |
| P2 | Generated operation contracts predate the latest guided form design and are not proof of complete visible-field coverage. | Validate each version's visible metadata and runtime normalization separately; retain wire contracts as a distinct registry. |

Evidence: fresh baseline log (machine-local historical log, not distributed), `test/`, `worker/test/`, `scripts/runtime-smoke.cjs`, `.github/workflows/ci.yml`, `nodes/TarvosTritonOne/titan.ts`, `transport.ts`, and `worker/sources.cjs`. This audit did not repeat the previous worker, Linux, installation or live-engine runs; their existing claims remain historical evidence.

## Test environments and what each can establish

| Environment | Use | Cannot establish |
| --- | --- | --- |
| Offline fixtures and local fake HTTP/WS/gRPC servers | Exact serialization, malformed inputs, large integers, error handling, disconnects, expiry, signing and no-send assertions | Customer entitlement, actual route acceptance, blockchain outcome |
| Disposable local Solana environment | Controlled accounts, tokens, legacy/v0 transactions, repeatable failures | Triton-specific indexes, delivery network or licensed feeds; local environments are not exact mainnet replicas |
| Devnet with dedicated test identities | Normal RPC, token/account changes, submission and confirmation where endpoint supports them | Titan mainnet route acceptance or mainnet feed availability |
| Mainnet, read-only / quote-only | Real RPC/DAS data, Titan protocol, routing metadata, narrow monitoring, management reads | Successful swap settlement; a quote is not a trade |
| Mainnet simulation | Fresh route construction, account availability, instruction execution and estimated state effects without broadcast | Inclusion, final price, post-simulation state changes or Shield routing compliance |
| Separately approved mainnet canary | Actual submission, confirmation and balance accounting | Reliability at scale, all venues, all market conditions |
| Disposable n8n deployment | Editor, saved workflow, credentials, queue workers, restart, load and cleanup | Provider availability without the live stages |

Solana documents that `simulateTransaction` does not broadcast and can run unsigned unless signature verification is requested. Use unsigned simulation for construction checks and signed simulation for the exact swap bytes before submission. A `sendTransaction` response only indicates acceptance; confirmation is a separate observation. [Simulation](https://solana.com/docs/rpc/http/simulatetransaction), [submission](https://solana.com/docs/rpc/http/sendtransaction)

Do not weaken production endpoint/network validation to accommodate localhost. Use injected clients or a dedicated test harness. Current Solana introductory documentation redirects the old test-validator guide to Surfpool; pin whichever local tool we adopt and record its limitations. [Local tooling](https://solana.com/docs/intro/installation/surfpool-cli-basics)

## How to make a test trustworthy

Every case needs a known fixture, exact assertion, independent comparison, bounded timeout and retained evidence. “HTTP 200,” “no exception” and “received an event” are insufficient.

For static historical data, compare raw fields with a separately implemented official client request. Do not use our own request-builder to generate both actual and expected values. For changing state, compare at compatible commitment/context slots and tolerate explicitly measured index lag; two sequential balance/slot reads need not be equal. Freeze the historical slot/signature/asset when practical. Never silently substitute current data if a fixture disappears.

Classify results as **PASS**, **FAIL**, **BLOCKED: access/configuration**, **NOT RUN**, or **INCONCLUSIVE: no qualifying event**. An empty result for a known-empty fixture can pass. An empty result where expected data is unknown is inconclusive. An absent subscription entitlement is blocked, not evidence that the implementation works or fails.

Record package hash, source revision or source hash, Node/n8n versions, SDK/protobuf versions, OS, endpoint alias, network genesis hash, test case ID, timestamps, slots, sanitized input/output, assertions and observed status. Never record API tokens, wallet keys, token-bearing WebSocket URLs or reusable signed transactions in ordinary test artifacts. Retain transaction signatures for reconciliation.

## Fixture catalogue

Maintain an explicit manifest with network and provenance for every fixture:

- Two controlled devnet wallets; a zero-balance public address; a nonexistent account; a small program-owned account set.
- SPL Token and Token-2022 mints with known decimals; owner/delegate/token accounts; 0/6/9-decimal examples; unsupported extension cases kept separate.
- Recent success, recent execution failure, old archived transaction, legacy transaction, v0/ALT transaction, expired blockhash, missing ALT and unsupported-format fixtures.
- Finalized existing block, skipped slot, recent tip and historical range crossing a retention boundary.
- Uncompressed asset, compressed asset/proof, fungible asset, creator/authority/owner cohorts, edition collection and a known-empty result.
- Supported Titan token pair and wallet with/without associated token accounts; an illiquid pair; instruction route versus unsupported transaction-only route.
- Narrow stream filter with observable matching activity and a deliberately nonmatching control. Use provider-approved fixtures for feeds that cannot be stimulated on devnet.

Values above the JavaScript safe-integer limit must be verified as exact decimal strings/BigInt, including RPC lamports, token supplies, stream counters and MessagePack amounts. Never pass them through floating-point arithmetic.

## Action coverage

[The complete 77-action matrix](TEST-MATRIX.md) maps every current action to a setup and an acceptance assertion. All rows require positive, invalid-input, missing-data, authorization, timeout, rate-limit and output-shape cases where applicable. This matrix is a plan; it does not claim 77 live passes.

Pagination tests must include repeated cursors, short nonterminal pages, empty pages, duplicate records across boundaries, request budgets and continuation resumption. Batch tests must preserve order and duplicates and distinguish a missing account from a failed batch. Archives must respect record/byte/slot limits and expose a usable next boundary.

DAS requires indexed fixtures, not merely valid Solana addresses. Verify owner/authority/creator membership, paging and compressed proof shape; if cryptographic proof validity is a release claim, verify against the corresponding tree/root with an independent compatible verifier. Do not assume a regular validator implements DAS. [Triton DAS](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api)

## Titan quotes and swaps: the critical path

### 1. Protocol and quote acceptance, no key needed

Connect through Triton's documented token-path proxy; separately verify negotiation, binary framing and server version with the upstream Titan client/specification. Triton's short landing-page sample parses JSON, while Titan Direct specifies MessagePack. Record the protocol actually accepted by the proxy; do not treat that sample as the wire contract. [Triton proxy](https://docs.triton.one/trading-apis/titan-swap-api), [Titan connection](https://titan-exchange.gitbook.io/titan/developer-doc/swap-api/reference/direct/connection)

Exercise GetInfo, GetVenues, ListProviders and quote streams. Verify request IDs, stream IDs, all error/end message classes, stop/close behavior, unrelated-frame rejection and exact u64 handling. Compare requested wallet, mints, ExactIn amount and route metadata. Test empty routes, missing expected winner and explicit provider selection. Live prices change: compare identities and supported shapes, not a hard-coded exchange rate.

### 2. Beginner input correctness

Run the actual main node with readable amounts and smallest units, WSOL/USDC/custom mints, expressions, multiple input items, and old saved versions. Cover blank/zero/negative/exponential/comma amounts, excessive decimals, invalid precision response, u64 overflow, same-token pairs and invalid slippage. Inspect normalized input, output floor and basis points before signing. Switching quote to swap or advanced mode must not silently change economic inputs.

### 3. Wallet isolation

Public-address-only quotes must not load a key, prepare a transaction or invoke any send endpoint. Test disconnected/wrong/multiple wallet nodes, network mismatch, credential/address mismatch and unsupported signer sets. Keep a spy on all submission mechanisms. Test the real n8n connection context, not just an object mocking `getInputConnectionData`.

### 4. Route construction and simulation

Use a fresh route; independently decode compiled transaction accounts, program IDs, fee payer, amount-related instructions and lookup tables. Check missing/closed ALTs, size bounds, compute limits, time and slot expiry, 30-second preparation guard and insufficient funds/rent. Include Token-2022 transfer-fee or unsupported-extension cases explicitly. Test WSOL wrapping/unwrapping and missing/existing destination accounts from actual returned instructions; do not infer native-SOL behavior from the preset name. Titan's current reference includes V3 and newer format options, whereas this package intentionally requests V0 and supports instruction routes only. [Quote reference](https://titan-exchange.gitbook.io/titan/developer-doc/swap-api/reference/direct/new-swap-quote-stream)

Adversarial fixtures must include correct-looking quote metadata paired with an unrelated transfer, unexpected destination, extra transfer, changed output threshold, extra signer, stale route and changed mint. A simulation that succeeds but spends unexpected assets is a failed test. Establish an independent policy for acceptable program/recipient/state changes before approving funded release.

### 5. Submission and reconciliation

First validate ordinary submission on devnet. Only then schedule a separately approved, tightly capped mainnet canary using a dedicated wallet. Record input amount cap, fee cap, slippage, destination, selected route and test owner. No live canary is authorized by this research request.

Persist the deterministic signature before sending. On a transport timeout after dispatch, treat outcome as unknown and reconcile that signature; never blindly regenerate and resubmit a trade. Require confirmed/finalized status with `err: null` and inspect transaction metadata plus token/SOL deltas, separating fees and account rent from swap value. A confirmation timeout is not proof of failure or expiry. Use block-height/blockhash validity and status checks, not a fixed wall-clock estimate. [Confirmation and expiration](https://solana.com/developers/cookbook/transactions/confirmation)

For Cascade, verify text/binary encoding, `/sendtx` query parameters, returned signature and no automatic resend. Its submission endpoint does not simulate; validate the preceding simulation separately. For Shield, verify header encoding offline and provider policy behavior with an existing policy; successful simulation cannot prove which validators forwarded a transaction. [Cascade submission](https://docs.triton.one/chains/solana/cascade/transaction-submission), [Shield](https://docs.triton.one/project-yellowstone/shield-transaction-policies.md)

For Jito bundle simulation, use a two-transaction dependent bundle, then fail transaction two. Verify result order, summary and per-transaction errors, signature verification settings and one pre/post-account configuration entry per transaction. Assert zero bundle submissions; sendBundle is outside our package. [Bundle simulation](https://docs.triton.one/trading-apis/bundle-simulation-with-jito.md)

## Eight streaming services

| Service | Specific acceptance tests |
| --- | --- |
| Whirligig | Each supported topic: account/program/logs/signature/slot/block/transaction. Confirm subscription acknowledgement, request ID, notification identity, filter inclusion/exclusion, commitment and cleanup. Compare observed signature/account changes to RPC. Idle stream is not failure. |
| Dragon's Mouth | Actual official protobuf client versus our JS transport; account/transaction/status/block/meta/slot/entry filters; ping/pong, quiet periods, large messages, reset and cancellation. Compare slot/commitment and preserve account write versions. |
| Riptide | Repeat Dragon tests on the documented shared Riptide endpoint and valid shared token. Test dedicated-only token failure distinctly. Inject TCP reset; reactivation must be observable. Never claim a reconnect recovered an unmeasured gap. |
| Vixen | Each advertised program enum loads; capture at least one valid parsed event per supported parser before claiming parser coverage. Compare sampled instructions/accounts with canonical chain data. Unknown parser schema must fail visibly. |
| Titan | Several quote updates on one stream; correct stream ID, changing routes, end/error and StopStream cleanup; no wallet signing or sending. |
| Deshred | Separate SubscribeDeshred method, correct filters, ALT-loaded addresses, lossless raw bytes; reconcile sampled signatures to later execution. Missing logs/status in this pre-execution feed is expected. |
| Harmonic | Region tagging, named filter matches, slot start/end, replacement slot handling, clip visibility and provisional-to-confirmed reconciliation. |
| BAM | Region, node, sequence and bundle position preserved; distinguish bundle intent from execution outcome and missing outcome from success. |

Whirligig's transaction subscription is an extension, not standard Solana WebSocket behavior. Deshred is a distinct RPC with no execution/finality guarantee, and access requires provider support. [Whirligig](https://docs.triton.one/project-yellowstone/whirligig-websockets.md), [Dragon/Deshred](https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions.md)

Vixen documentation describes parsed program feeds and service-specific access; SDK installation alone does not demonstrate entitlement or all parser variants. [Program streams](https://docs.triton.one/project-yellowstone/program-data-streams.md)

Preconfirmation tests must account for static-key-only filters, clipping and explicit slow-consumer termination. Test dropped/replaced provisional events against later confirmed data without requiring every provisional signature to land. Do not widen filters to evade coverage limits. [Official protocol/client](https://github.com/rpcpool/preconfs-client), [preconfirmation semantics](https://docs.triton.one/chains/solana/preconfirmations-grpc)

For every trigger: manual listen, first batch, timeout with zero activity, published activation, sparse flush, threshold flush, execution budget, deactivation, process restart and credential failure. Reconcile controlled expected event IDs with received IDs; report duplicate and missing counts. Exercise error/end/reset independently. Verify handles, timers and sockets return to baseline after shutdown.

## Optional worker: durability and freshness

Separate the source stream, SQLite inbox and downstream consumer acknowledgements. Kill a child process before insert, after committed insert, after response delivery and before/after acknowledgement. Restart using the same volume. No acknowledged receipt may reappear as new work; unacknowledged work must remain replayable. Downstream side effects must be idempotent because response/ack ambiguity can cause repeat delivery.

Test disk full, unwritable volume, corrupt receipt, wrong consumer, duplicate acknowledgement, two consumers, bounded storage, malformed payload, bad token, slow consumer and network partition. Build/run the Docker image with a persistent volume and verify restart recovery. Do not use a database reopen test as a substitute for a process crash test.

Fumarole currently documents up to four days of history and regional subscriber state, but use the live slot-range query as the authority for a particular recovery attempt. Test fixed-origin aging, stale group, filter/region changes and restart within/outside retention. Regional failover must use durable fully-consumed boundaries and tolerate overlap; our current worker rejects region changes and does not implement transparent failover. [Fumarole](https://docs.triton.one/project-yellowstone/fumarole.md), [failover](https://docs.triton.one/project-yellowstone/fumarole/fumarole-cluster-failover-guide)

For Account Sync, measure cold read, warm read, a real update, disconnection, stale slot, RPC fallback and cleanup. Instrument stream updates/cache versus fallback reads; a successful fast read alone does not prove streaming is working. Compare returned bytes/owner/lamports at compatible slots. [Account Sync](https://docs.triton.one/project-yellowstone/yellowstone-account-sync)

## n8n, packaging and usability

Test the actual installed tarball in fresh Windows and Linux instances, not only a source symlink. Pin the minimum supported n8n and a current target; claiming compatibility with all n8n versions requires a defined range and matrix. Run normal and queue deployments with matching package versions on every execution host. n8n queue workers must share the credential encryption key; test that credentials resolve without surfacing in execution output. [Queue mode](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode.md)

Import and round-trip every example. Exercise all supported node versions; quote/swap transitions; wallet port changes; public-address-only versus signing modes; saved custom tokens; expressions; multiple items with different amounts; missing credentials; Continue On Fail and Retry On Fail. Confirm inactive transaction fields are not evaluated during reads. Verify how wallet expressions resolve per item in the real engine, including queue execution.

A novice acceptance session should independently complete: balance lookup, public-address quote, wallet-connected quote, monitoring setup, and identification of what a swap execution will do. Proposed target: each read-only setup within five minutes without API documentation, with zero atomic-unit conversion mistakes. Do not execute a funded swap as a usability exercise.

Scan logs, errors, exported workflows, screenshots and execution JSON with fake secret canaries. Tokens embedded in URL paths need special redaction checks. Enforce no redirects to another host for authenticated calls. Test untrusted RPC/stream text, huge responses and missing optional fields.

## Load and failure testing

Start with synthetic transports: 1, 10 and 100 events/second, a 10x burst, quiet intervals, a slow downstream step, and controlled disconnects. Measure p50/p95/p99 time from receipt to emission, RSS, event-loop delay, sockets, backlog, executions/minute and lost/duplicate events. These are proposed test loads, not product capacity promises.

Proposed gate: no unexplained loss within the declared operating envelope; bounded resource use or explicit failure at configured limits; no silent dropping. Run a 30-minute baseline and a two-hour soak before selecting the supported envelope. A longer worker recovery run must cross the replay-boundary aging case. Never run unbounded mainnet program/firehose tests by default. Obtain bandwidth/request budgets first; use local fault injection for 429/503 rather than deliberately saturating shared services.

## Execution sequence and release gates

1. Repair baseline/example integration and the documented Riptide mismatch. Reconcile UI promises with actual economic guarantees.
2. Complete deterministic, adversarial, version and true process-recovery cases. Add runtime smoke checks to CI.
3. Install the final archive in fresh local n8n and queue instances; exercise every example and capture clean import evidence.
4. Run all read-only action and narrow-stream acceptance cases with approved endpoints and fixture manifests. Mark unavailable services blocked explicitly.
5. Run devnet submission plus mainnet quote/simulation cases, recording exact transaction/route checks.
6. Only after those pass, seek approval for a concrete mainnet canary plan with a dedicated wallet and explicit spending/fee limits.
7. Finish recovery/load tests and publish a capability report by service and environment. Any untested provider or parser remains labelled unverified.

Every release artifact must be identified by SHA-256 and tested after the final examples/docs/package edits. CI on untrusted pull requests must use fixtures only; live credentials belong in a separately controlled integration job. Live trading jobs must never run on an ordinary pull request or automatically retry unknown submissions.

Existing commands (not claims that each was rerun in this research):

```powershell
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
node scripts/grpc-loopback.cjs
node scripts/runtime-smoke.cjs .test-runtime/node_modules
npm --prefix worker ci --ignore-scripts
npm --prefix worker test
node scripts/generate-examples.cjs
npm pack --dry-run
```

The generator currently covers 12 examples; integrate example 13 before relying on this sequence. In a Git checkout, reject unexpected generated-file diffs. A clean install of the actual archive and real n8n test must follow packaging.

## Access and decisions needed for the later live phase

Provision through n8n credentials or the worker's designated secret environment variables, never chat or tracked files: intended RPC network endpoints, Titan-enabled mainnet token, stream entitlements/regions, Fumarole regional access, management token and worker token. A successful generic RPC credential check does not validate these other capabilities. Management uses a separate token and scope; start with its documented accounts read, and treat restricted watch-list permission failures separately. The auth page contains differing host references in prose and example, so confirm the supported host with the provider rather than forwarding credentials on redirects. [Management auth](https://docs.triton.one/account-management/api-access/auth-and-headers.md), [watch lists](https://docs.triton.one/account-management/api-access/address-watch-lists)

Before the live phase, settle endpoint entitlements, data/request budget, the intended n8n deployment/version range, and whether the goal is read-only readiness or production trading readiness. No secrets or spending approval are needed to implement the remaining offline harness work.
