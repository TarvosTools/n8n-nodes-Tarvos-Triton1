# Triton 1: Solana service expansion research

Research date: 13 October 2026. Decision document; no expansion has been implemented or approved by this document.

The current package provides 30 data operations and standard transaction submission, with a separate Solana Wallet connector. It has no persistent subscriptions. This review combines Triton's service documentation, individual API contracts, selected official SDK documentation, the Solana RPC reference, and inspection of the local package. It is a documentation and architecture review, not authenticated integration testing. Availability on the user's subscription remains unverified.

## Product recommendation

Keep one installable Triton package, with **Tarvos Triton 1** for actions and **Tarvos Triton 1 Trigger** for ongoing subscriptions. Keep **Solana Wallet** beneath transaction actions, with its public address and signing credentials in its own details. Wallet watching only needs public addresses and provider access; it must not require a signing credential.

Prioritize richer data reads, live wallet/program monitoring, parsed DeFi events, and transaction simulation/confirmation. Add durable ingestion if database reconciliation is a core requirement. Treat quotes, swaps, administration and pre-execution feeds as explicit additional choices.

These are Tarvos design recommendations, not Triton product requirements. A separate trigger fits the installed n8n lifecycle: its MQTT Trigger uses `trigger()`, event emission, a manual-test handler and `closeFunction()`. n8n's [node reference](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/programmatic-style-parameters.md) and [queue deployment guide](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode.md) inform lifecycle and deployment testing. Putting an endless subscription in the existing execute operation would obscure when a workflow completes.

## Service and workflow inventory

| ID | Candidate | Useful Tarvos workflows | Implementation shape | Relative effort |
| --- | --- | --- | --- | --- |
| A | Broader RPC and indexed reads | Treasury reports, holders, network health, staking analytics | Existing action node | Medium |
| B | Complete available DAS methods/options | Asset inventory, creator/authority tracking, compressed NFT audit | Existing action node | Medium |
| C | Whirligig and standard WebSocket subscriptions | Wallet changes, logs, signature confirmation, program alerts | Trigger node | Medium |
| D | Dragon's Mouth and Riptide | Filtered transaction/account feeds, block and slot monitoring | Trigger; optional ingestion worker | Large |
| E | Hosted Program Data Streams | Parsed swaps, token events, pool changes, program activity | Trigger with program-specific schemas | Large |
| F | Fumarole reliable ingestion | Restart recovery, database synchronization, accounting pipelines | Persistent consumer and durable event storage | Large |
| G | Simulation and delivery enhancements | Diagnose transactions, estimate compute, submit and reconcile | Existing action + Wallet | Medium–large |
| H | Titan quotes and optional swaps | Route/price monitoring, swap preparation | Binary WebSocket adapter; action/trigger | Large |
| I | Account Sync | Repeated reads of the same watched accounts | Stateful cache/worker | Large |
| J | Historical bulk backfill | Rebuild datasets, catch up an index | Bounded jobs or external worker | Large |
| K | Customer administration | Inspect subscriptions/endpoints, provision access | Separate admin credential; preferably separate node | Medium–large |
| L | Preconfirmations, deshred, raw shreds | Earliest transaction signals and specialized backend analytics | Advanced trigger or external receiver | Very large |

Effort is comparative engineering judgment, not a delivery estimate. Authentication, reconnect logic, validation and documentation are included; live entitlements and deployment requirements can change effort substantially.

### A. Standard RPC, Cloudbreak and history

The existing API allowlist covers selected account/token reads, transaction/status/history reads, network metadata, blocks, fees and submission. It is not the full Solana RPC surface.

Proposed additions include `simulateTransaction`, `isBlockhashValid` as a visible operation, rent exemption, block ranges, block commitment/production, recent performance samples, transaction count, vote accounts, leader schedule and selected supply/inflation queries. These unlock network dashboards and staking reports alongside wallet monitoring. Use the [official Solana method inventory](https://solana.com/docs/rpc/http) to select and validate each contract; supported by Solana does not mean enabled on every Triton endpoint.

Cloudbreak transparently serves eligible reads on an enabled endpoint. Its documented extension `getTokenAccountsByMint` is absent from the package. Existing owner/delegate queries also omit optional `dataSlice` and `minContextSlot` support described by Cloudbreak. Large indexed queries can use chunked HTTP responses; the current client buffers the full response before enforcing its parsing limit. A large-export feature therefore needs streaming parsing or explicit workload bounds. There is no justified client-side “enable Cloudbreak” toggle. [Cloudbreak contract](https://docs.triton.one/project-yellowstone/cloudbreak-custom-indexes)

There is a documentation mismatch: the restrictions page still describes Steamboat with dedicated-node requirements and narrower method support. Verify deployment capabilities rather than assuming those descriptions apply identically to Cloudbreak. `getLargestAccounts` is disabled on shared mainnet; do not confuse it with supported `getTokenLargestAccounts`. [Restrictions](https://docs.triton.one/chains/solana/unsupported-account-queries)

Enhanced address history is already implemented. Product improvements would be saved filters, resumable history exports and token-owner activity presets. Its cursor/filter contract is distinct from signature pagination. [Address-history API](https://docs.triton.one/chains/solana/gettransactionsforaddress)

### B. Digital Assets API

The package exposes six DAS resource operations. It also exposes `getTokenLargestAccounts` under Token; Triton's DAS index lists that same standard RPC method, so it is not a seventh missing feature.

Five useful missing methods are:

| Method | Workflow | Contract detail |
| --- | --- | --- |
| `getAssetProofs` | Retrieve proofs for a batch of compressed assets | Named `ids` parameter |
| `getAssetSignatures` | Audit compressed NFT activity | Asset ID or tree plus leaf index |
| `getAssetsByAuthority` | Inventory assets controlled by an authority | Positional request, sort and pagination |
| `getAssetsByCreator` | Track a creator's verified assets | Positional request includes verification option |
| `getNftEditions` | Inspect printable editions of a master mint | Named mint and paging fields |

Sources: [proof batch](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-asset-proofs), [asset signatures](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-asset-signatures), [authority](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-assets-by-authority), [creator](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-assets-by-creator), [editions](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-nft-editions).

Do not enable `getAssetsByGroup` as a working operation while Triton marks it temporarily disabled. Grouping through `searchAssets` is a separate contract to validate, not an assumed equivalent substitute. [DAS inventory](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api)

A concrete current omission: the search allowlist rejects `tokenType`, despite Triton's fungible-assets guide showing `tokenType: "All"`. Add documented token-type options after reconciling accepted values with the live endpoint. Preserve Token-2022 extension metadata in outputs. [Fungible assets](https://docs.triton.one/digital-assets-api/fungible-assets)

Response verification matters: the editions example shows an empty result without a collection field. The current generic collection extractor cannot be reused blindly. Cursor/before/after pagination should be method-specific; existing DAS operations currently offer page-based traversal only.

### C. Whirligig / WebSocket monitoring

Whirligig documents account, program, logs, signature, slot and block subscriptions plus its custom `transactionSubscribe`. The custom transaction filter nests include/exclude/required accounts under `accounts`; this is not the same request shape as Yellowstone gRPC. The endpoint adds `/whirligig`, and idle connections need application pings before the documented 60-second cutoff. [Whirligig reference](https://docs.triton.one/project-yellowstone/whirligig-websockets)

Proposed trigger choices: account changed, program account changed, logs matched, transaction matched, signature reached commitment, and slot/block update. Provide confirmation level, address filters, event batching and reconnect status. A transaction mentioning a wallet is not necessarily a transfer; decoded amounts and directions require additional interpretation.

Reconnection must resubscribe and replace server subscription IDs. Do not claim lossless recovery from a WebSocket reconnect alone. History backfill can help transaction workflows, but cannot reproduce every missed intermediate account write. Default to narrow filters and explicitly identify data gaps.

### D. Dragon's Mouth and Riptide

Dragon's Mouth supplies account writes, transactions, blocks, slots, entries and beta deshred events. Use the official `@triton-one/yellowstone-grpc` client and matching protobuf version. It supports replay within the server's retained window, discoverable through `SubscribeReplayInfo`; replay can duplicate boundary-slot events. Complete replacement subscription requests, heartbeat handling and commitment semantics need dedicated tests. [Dragon's Mouth](https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions)

Riptide is a connection option for this same protocol, not another set of operations. Its documented endpoint is mainnet-only and accepts shared-subscription tokens; dedicated-node tokens do not automatically qualify. Handle resets, backoff, resubscription and replay. [Riptide](https://docs.triton.one/project-yellowstone/riptide)

For Tarvos, expose typed account and transaction filters and block metadata first. Route broad feeds through a worker that filters/batches before starting workflows. A workflow execution per raw chain event would create uncontrolled execution volume. A low-latency upstream connection does not imply an n8n workflow will run at trading-engine latency.

### E. Parsed Program Data Streams and Vixen

Hosted Program Data Streams deliver parsed account and instruction updates using `@triton-one/vixen-stream`. The service lists Token, Token22, Orca Whirlpool, Raydium CLMM/CPMM/AMMv4, Meteora variants, Pump.fun, PumpSwaps, JupiterSwap, Moonshot and Kamino Limit Orders. Its FAQ still describes beta access requiring support; confirm access rather than assuming a normal RPC token is sufficient. [Hosted program streams](https://docs.triton.one/project-yellowstone/program-data-streams)

Proposed presets: token transfer/mint/burn detection, selected pool changes, swap activity, and supported program instruction events. Each preset needs parser fixtures, account mapping and verified instruction coverage. “Program supported” does not prove every product-level event is already decoded.

Vixen itself is a framework for running custom parsing pipelines. Its parser catalogue differs from the hosted service catalogue. A parser in the open-source framework is not evidence that Triton's hosted endpoint offers it. Custom IDL/Codama parsing would be a separate self-hosted worker feature. [Vixen framework](https://docs.triton.one/project-yellowstone/vixen-parsing-framework)

### F. Fumarole and durable ingestion

Fumarole documents availability on mainnet subscriptions, up to four days of retained state, persistent subscribers and regional clusters. Subscriber state is not replicated between regions; connect to a specific region and plan failover from a recorded completed slot. [Fumarole service](https://docs.triton.one/project-yellowstone/fumarole), [failover guide](https://docs.triton.one/project-yellowstone/fumarole/fumarole-cluster-failover-guide)

Its TypeScript client requires Node 22+ and currently lists native builds for Linux x64 glibc, macOS ARM64 and Windows x64. Alpine/musl and Linux ARM64 are not listed as supported prebuilt targets. The SDK exposes persistent consumer groups, slot-completion events, available slot ranges and commit settings. Automatic offset commits need scrutiny: SDK receipt is not proof that a downstream workflow stored the event. [SDK contract](https://raw.githubusercontent.com/rpcpool/yellowstone-fumarole/main/typescript-client/README.md)

Recommended design: persist an event or complete slot to a durable inbox before advancing the source checkpoint; let workflows consume inbox records idempotently. Retain failed events for retry and record gaps beyond retention. This supports recovery without promising exactly-once business effects.

The repository's licensing file defaults to AGPL-3.0-only and names Apache exceptions for specific directories, without listing `typescript-client`. Verify the selected npm package's actual license and distribution plan before bundling. This is an unresolved packaging fact, not a legal conclusion. [Licensing file](https://raw.githubusercontent.com/rpcpool/yellowstone-fumarole/main/LICENSING.md)

### G. Simulation, submission, Cascade, Shield and bundles

Add a standalone simulation action returning logs, errors, compute usage and requested account results. Solana permits unsigned simulation when signature verification is disabled. Simulation itself should not require wallet secrets. [Simulation contract](https://solana.com/docs/rpc/http/simulatetransaction)

Current submission always enables preflight. That is a supported RPC choice, but differs from Triton's optimized guidance: separate simulation, then submit with `skipPreflight: true` and `maxRetries: 0`. Offer explicit modes rather than silently changing behavior. Keep identical-payload retries distinct from rebuilding and re-signing, which creates a new transaction identity. [Sending advice](https://docs.triton.one/chains/solana/cascade/sending-txs)

Cascade direct submission adds `POST /sendtx`, raw or encoded bodies, optional signature response and a different error format. It needs a separate HTTP adapter, not a fabricated JSON-RPC method. Standard `sendTransaction` may already use Cascade on a configured endpoint; lack of `/sendtx` does not prove lack of Cascade routing. [Direct submission](https://docs.triton.one/chains/solana/cascade/transaction-submission)

Shield can attach existing policy addresses through `forwardingPolicies` or the forwarding header. It constrains validator routing; it does not guarantee protection or landing. Creating/updating a policy is a separate on-chain workflow, beyond merely applying a policy. [Shield](https://docs.triton.one/project-yellowstone/shield-transaction-policies)

Jito `simulateBundle` is a separate simulation capability. `sendBundle` needs Jito Block Engine access and must not be presented as an ordinary Triton RPC feature. [Bundle simulation](https://docs.triton.one/trading-apis/bundle-simulation-with-jito)

Proposed action flow: prepare → simulate → review result → Wallet sign/validate → selected submission transport → bounded confirmation/reconciliation. Expired or ambiguous submissions need explicit outcomes. A successful submission response remains distinct from a confirmed transaction.

### H. Titan quote monitoring and swap preparation

Triton documents a token-authenticated WebSocket route under `/titan/api/v1/ws` and access for active Solana subscriptions. Candidate features are quote streams, price monitoring, route inspection and producing a prepared swap transaction for Solana Wallet. [Triton's Titan service](https://docs.triton.one/trading-apis/titan-swap-api)

The linked upstream landing page has moved. Current Titan Direct documentation specifies MessagePack binary frames, subprotocol negotiation and optional compression. Its direct authentication describes JWTs, whereas Triton's proxy documents its own subscription-token route. Do not copy direct authentication into the Triton adapter without verifying the proxy contract. Methods include `GetInfo`, `NewSwapQuoteStream`, `StopStream`, `GetVenues` and `ListProviders`. [Connection and negotiation](https://titan-exchange.gitbook.io/titan/developer-doc/swap-api/reference/direct/connection.md)

Recommendation: select quote monitoring independently from swap execution. Execution adds amount/slippage validation, quote freshness, address lookup tables, transaction version support, and simulation. Other Titan REST, DART and managed-order products must not be assumed included through Triton's documented WebSocket route.

### I. Yellowstone Account Sync

Account Sync keeps watched account state in memory and uses RPC for initial/fallback reads through Triton's SDK. It is a cache architecture, not an additional one-shot JSON-RPC method. [Account Sync](https://docs.triton.one/project-yellowstone/yellowstone-account-sync)

It fits repeated reads across many workflows. It is less compelling for occasional scheduled jobs, where maintaining a continuous stream adds complexity. If selected, use a shared persistent worker/cache with explicit slot, freshness, commitment and fallback metadata. Avoid creating a new short-lived cache on every node execution or assuming caches are shared across queue workers.

### J. Archive and bulk backfill

Historical RPC queries are already accessible through implemented methods. The archival overview describes automatic routing and possible archival charges. Bound user-selected exports by range and request budget. [Archival access](https://docs.triton.one/chains/solana/old-faithful-historical-archive-1)

The more specific Old Faithful page marks the hosted gRPC interface retired and recommends Jetstreamer for bulk backfill. This conflicts with the general archive overview's suggestion of a separate gRPC path. Do not implement a hosted gRPC dropdown based on the overview alone. [Old Faithful status](https://docs.triton.one/project-yellowstone/old-faithful-historical-archive)

Proposed additions: resumable address-history export and bounded block-range jobs in the node; optional self-hosted Jetstreamer integration for very large datasets. Historical ledger availability is not an API for arbitrary historical account-state snapshots.

### K. Customer administration

The management REST API uses a separate token in `Authorization`, distinct from RPC `x-token`. It covers accounts, subscriptions, endpoints and tokens. Access and write operations depend on account role. [Authentication](https://docs.triton.one/account-management/api-access/auth-and-headers), [access requirements](https://docs.triton.one/account-management/api-access/introduction), [subscriptions](https://docs.triton.one/account-management/api-access/subscriptions)

Useful optional operations are subscription/endpoint inspection and status reporting. Provisioning, revocation and destructive changes should be separately selectable. Filter secrets and unnecessary account data from responses before workflow persistence.

The “Address Watch Lists” administration API is operator/reseller restricted and defines collection/tree entries. It is not documented as a general wallet-event webhook service. [Watch-list API](https://docs.triton.one/account-management/api-access/address-watch-lists)

### L. Preconfirmations, deshred and raw shreds

Preconfirmations use a separate gRPC endpoint and Harmonic/BAM feed entitlements. They provide early producer signals, not settled results. Coverage depends on participating leaders and selected regions; v0 account filters match static keys rather than lookup-table-resolved accounts. BAM does not report an execution outcome. Reconnects do not replay the missing interval. The docs also describe legacy, v0 and v1 wire formats; the current wallet supports legacy/v0 only. [Preconfirmations](https://docs.triton.one/chains/solana/preconfirmations-grpc)

Deshred is an advanced Dragon's Mouth option for reconstructed pre-execution data. It should emit clearly marked provisional events and require later confirmation reconciliation.

Raw Shred Streaming is request-enabled delivery to configured IPs/ports. It has no filtering and needs custom reconstruction software and adequate network capacity. Treat it as an external receiver project, not a normal n8n dropdown. [Shred streaming](https://docs.triton.one/chains/solana/shred-streaming)

## Shared implementation requirements

The following are proposed Tarvos requirements if the relevant services are selected:

- Preserve provider-specific request shapes behind separate adapters: JSON-RPC, direct submission HTTP, WebSocket JSON, Yellowstone gRPC, parsed-program gRPC, Fumarole and Titan binary WebSocket.
- Extend credential configuration with protocol-specific endpoints and capability checks. Current HTTPS/root-path validation cannot be reused unchanged for all services. Reuse RPC secrets only where the provider documents that use; keep administration and signing credentials separate.
- Probe with harmless reads or short bounded subscriptions. Report unsupported, unauthorized, misconfigured and inconclusive states separately. A successful `getVersion` is not a universal capability test.
- Emit a versioned event envelope with source, event kind, slot, commitment, signature/account, timestamps, replay state, event identity and raw/parsed data. Keep integers exact.
- Choose event identities by event type. A signature alone cannot deduplicate multiple instructions; account writes may need write version and slot. Upgraded commitment notifications must not accidentally disappear as duplicates.
- Define backpressure, batching, execution limits, gap reporting and durable checkpoints before advertising reliable monitoring. Test activation/deactivation, restarts and multi-worker behavior.
- Record source checkpoint, durable ingestion and downstream completion separately. A trigger emission is not proof of completed downstream work.
- Respect Triton's shared-IP cooldown and expose rate-limit telemetry. Current code only stops one execution; it does not coordinate other workflows on the same egress IP. [Rate limits](https://docs.triton.one/core-features/ratelimits)
- Keep monitoring independent of signing. All selected send/swap paths must use Solana Wallet. Quote generation and simulation should avoid requesting private credentials unless a chosen signing action requires them.
- Keep the machine-readable operation contract, workflow examples, registry capabilities and PDR synchronized with actual shipped support. Mark backend-dependent and beta features explicitly.

## Validation before declaring support

| Layer | Required evidence |
| --- | --- |
| Request contracts | Per-method/provider fixtures; exact casing, positional order, bounds and encodings |
| Live reads | Authenticated fixtures for each selected service and correct cluster |
| Streams | Bounded subscription, filtering, heartbeat, disconnect/reconnect, malformed messages, commitment transitions |
| Recovery | Duplicate boundary events, downtime beyond retention, region change, durable store failure |
| Runtime | Actual n8n manual and published trigger lifecycle, queue deployment, supported OS/container builds |
| Signing | Existing and newly selected transaction formats, signer mismatch, expired blockhash, simulation divergence |
| Delivery | Authorized test transaction on a supported test environment; reconcile signature to final status |
| Distribution | SDK package licenses, native dependencies, supported platforms and clean installation |

No private endpoint, entitlement, performance claim or transaction delivery was verified in this research. Current offline test success remains useful but does not replace these checks.

## Proposed choices for the user

**Recommended broad scope:** A + B + C + D + E + G, with E gated on access. This adds useful reads, live and parsed monitoring, simulation and better transaction handling while retaining the Wallet design.

**Durable data scope:** Add F + bounded J when completeness and database recovery matter. F requires a deployment/storage decision before implementation.

**Trading scope:** Add H, choosing quotes only or quotes plus swap preparation/execution. Bundle simulation can be included in G without committing to Jito bundle submission.

**Specialist scope:** Select I, K and L only for concrete cache, administration or early-signal requirements. Raw shreds, custom Vixen hosting, large Jetstreamer jobs and retired hosted archive gRPC should not be silently included in “all services.”

Pending user decisions: selected groups; direct n8n triggers versus permission to add an optional self-hosted ingestion worker and durable store; quote-only versus swap execution; desired program presets; available Triton service entitlements. No tokens need to be pasted into chat.
