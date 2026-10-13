# PDR — Tarvos Triton 1 for Solana

**Document:** Product Design Requirements  
**Prepared:** 12 October 2026  
**Updated:** 13 October 2026 — confirmed submission and wallet connector scope  
**Status:** Local implementation built; provider-dependent behavior and production release gates require validation  
**Display name:** Tarvos Triton 1  
**Provider:** Triton One  
**Proposed package:** `n8n-nodes-tarvos-triton-one`  
**Proposed repository:** `TarvosTools/n8n-nodes-Tarvos-Triton-One`  
**Internal node name:** `tarvosTritonOne`  
**Credential:** `Triton One Solana API` / `tritonOneSolanaApi`  
**Companion node:** `Solana Wallet` / `tarvosSolanaWallet`  
**Wallet credential:** `Solana Wallet` / `tarvosSolanaWalletApi` (separate from RPC access)  
**Target initial package version:** `0.1.0`  
**Existing website slug:** `triton-1`  
**Platform:** Self-hosted n8n; verification eligibility is a goal, not an existing approval.

This document records the release requirements. The user subsequently requested implementation: the local package now contains both nodes and the 31 operations. See `README.md`, `docs/operation-contract.json` and `docs/VALIDATION.md` for the actual implementation and test evidence. A remote repository, npm publication and website deployment have not been created by this work.

Implementation decision (13 October 2026): the requested Wallet sub-node uses n8n's existing `ai_tool` attachment transport, labeled Wallet and filtered to the Tarvos companion node. It supplies a typed private capability, not an AI model or callable agent tool. The actual n8n execution-engine smoke test verifies this adapter. Signing uses pinned Solana/Ed25519 libraries, so the package targets self-hosted n8n and does not claim Cloud verification. These decisions supersede the earlier unresolved connector/dependency proposals below; remaining product requirements remain release criteria.

## 1. Product decision

Build an n8n action node for **Solana data and monitoring through Triton One**, with a wallet connector for signed transaction submission. Its initial scope is 31 operations: 30 reads covering accounts, SPL tokens, transaction history and status, network/block information, priority fees, and digital assets, plus `transaction.submit`.

The user confirmed a **data and monitoring first** release that also includes signed transaction submission. A separate wallet connector must sit beneath the Triton node, with wallet selection and wallet credentials in that connector's details. This is a required product design; n8n connector compatibility is an implementation gate described in section 8. Persistent streaming remains future scope.

The node should make these workflows straightforward:

- Monitor a treasury's SOL and token balances.
- Retrieve address activity and transaction outcomes for reporting or reconciliation.
- Inspect Solana deployments returned by Tarvos xStocks.
- Join on-chain observations with Tarvos Pyth Pro market data.
- Inventory a wallet's NFTs, compressed assets, and fungible assets.
- Observe recent priority fees without constructing or submitting a transaction.
- Let a coding agent configure these actions from an explicit operation contract.
- Submit a prepared Solana transaction using the connected wallet, then monitor its signature and confirmation separately.

Triton supplies the RPC and indexed data. n8n executes the workflow and stores credentials. Tarvos supplies the integration, examples, and documentation. No Tarvos-hosted proxy or database is introduced.

## 2. Provider facts and design boundaries

Triton documents standard Solana RPC access and additional infrastructure for indexed reads, digital assets, history, and streaming. An endpoint's actual capabilities and accessible networks must be tested; a product overview alone is not an availability guarantee. [Triton Solana overview](https://docs.triton.one/chains/solana)

| Surface | First-release treatment |
| --- | --- |
| Solana HTTPS JSON-RPC | Implement the selected read operations below. |
| Percentile priority fees | Include a typed Triton extension. |
| `getTransactionsForAddress` | Include enhanced address history, labeled as a provider extension. |
| Digital Assets Standard API | Include six useful data operations through the same credential. |
| Cloudbreak/indexed RPC | Use ordinary RPC methods; do not expose a fictitious activation toggle. |
| WebSocket/Whirligig | Future streaming trigger work. |
| Dragon's Mouth/Riptide gRPC, Fumarole | Future architecture investigation, not bundled in v0.1. |
| Transaction submission | Include standard `sendTransaction` through Triton with the wallet connector; never invoked by a read. |
| Cascade direct submission | Separate future integration; not required for standard RPC submission. |
| Simulation, Jito bundles, Shield, Titan swaps | Outside initial scope. |
| Customer administration and billing | Outside this integration. |
| Sui, Monad, Pythnet and other chains | Outside this Solana package. |

The public [Triton service page](https://triton.one/chains/solana) helps establish the broader roadmap. Its marketing performance and pricing claims must not become Tarvos latency, cost, or transaction-delivery guarantees.

### 2.1 Current restrictions and conflicting documentation

Triton's restrictions page identifies `getLargestAccounts` as disabled on shared mainnet and `getAssetsByGroup` as temporarily disabled. Neither is in the initial operation list. It also describes program-account restrictions and older Steamboat deployment requirements. [Unsupported account queries](https://docs.triton.one/chains/solana/unsupported-account-queries)

The newer Cloudbreak reference describes automatically routed account reads, broader method coverage, and `confirmed`/`finalized` commitments on enabled endpoints. It differs from the restrictions page about which methods the indexed service handles. **Do not resolve this disagreement by guessing a customer's entitlement.** Test the supplied endpoint and document the observed capability matrix. Program-account queries stay conditional until validated. [Cloudbreak reference](https://docs.triton.one/project-yellowstone/cloudbreak-custom-indexes)

## 3. Package and n8n architecture

Use a standalone TypeScript package with an MIT license, a Triton action node and a companion Solana wallet connector, each owning its own credential. The wallet supplies signing capability; Triton owns RPC access and submission. Proposed initial packaging places both nodes in this package, with a reusable wallet interface for future Tarvos integrations. Verify this packaging against n8n review rules before claiming eligibility.

Target zero third-party runtime dependencies for the RPC reads. Signing and transaction decoding require a reviewed Solana implementation; do not invent cryptography to preserve that target. Resolve the signing dependency and n8n verification tradeoff before implementation. `n8n-workflow` is the host integration contract; development-only tooling is permitted.

Use programmatic execution because the node needs method-specific pagination, lossless numeric parsing, positional result association, and consistent output envelopes. Keep operation descriptions and request construction declarative in local data modules where practical. No generic HTTP Request node should be required in a user's workflow.

Proposed layout:

```text
n8n-nodes-Tarvos-Triton-One/
  pdr.md
  package.json
  package-lock.json
  credentials/TritonOneSolanaApi.credentials.ts
  credentials/TarvosSolanaWalletApi.credentials.ts
  nodes/TarvosSolanaWallet/
    TarvosSolanaWallet.node.ts
    TarvosSolanaWallet.node.json
    walletContract.ts
    signing.ts
  nodes/TarvosTritonOne/
    TarvosTritonOne.node.ts
    TarvosTritonOne.node.json
    apiContract.ts
    descriptions/
    operations/
    transport.ts
    pagination.ts
    validation.ts
    losslessJson.ts
    output.ts
    errors.ts
    types.ts
    tarvosMark.light.svg
    tarvosMark.dark.svg
  test/
  examples/
  docs/
  scripts/
  .github/workflows/ci.yml
```

Follow the official node CLI, credential conventions, documentation, and verification rules. Runtime code must not read the filesystem or environment. Use GitHub Actions and provenance for eventual publication; scanner success does not establish n8n verification. Confirm supported Node/n8n versions at implementation time and record the tested matrix. [n8n verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)

## 4. Credentials and network identity

### 4.1 Credential fields

| Field | Requirement |
| --- | --- |
| RPC Endpoint | Required clean HTTPS endpoint provided by Triton; no token embedded in the URL. |
| API Token | Required secret, stored as a password field in n8n. |
| Expected Solana Network | Mainnet Beta, Devnet, or Testnet; used to validate the configured endpoint, not to manufacture a URL. |

Use the documented `x-token` header through n8n credential authentication. Triton now documents this header for JSON-RPC as well as its other protocols. RPC-consumption credentials are distinct from customer-management API credentials. No frontend origin authentication or customer-admin token belongs in this credential. [Getting started and authentication](https://docs.triton.one/getting-started), [management authentication distinction](https://docs.triton.one/account-management/api-access/auth-and-headers)

Credential handling requirements:

1. Validate HTTPS and reject userinfo, fragments, query strings, and token-bearing paths. Initial supported hosts must be explicitly documented Triton RPC hosts under `rpcpool.com`, checked at hostname label boundaries. Alternative official/custom domains require a reviewed extension, not an arbitrary URL switch.
2. Reject local/private literal addresses and arbitrary ports. Preserve n8n's network protections. Never forward credentials across redirects; disable redirects.
3. Reject CR/LF in the token. Never place credentials in node parameters, examples, output, telemetry, or raw error objects.
4. Test the credential using a small read such as `getVersion`, then check `getGenesisHash` against the selected network. Store audited public genesis identifiers as protocol constants. No paid large scan is part of credential testing.
5. Validate network identity once per node execution before the requested operation; reuse that result within the execution only. A mismatch stops execution. Credential-test success alone does not establish DAS or history support.
6. An unavailable Devnet/Testnet endpoint is reported explicitly. Never fall back to public Solana RPC or silently switch clusters.

## 5. First-release operations

The following **31 proposed operations** define the v0.1 release. Human labels and stable `resource.operation` values are separate from wire method names. Every operation must have its own typed request serializer, output tests, help text, and capability status. The wallet connector is an additional node, not another RPC operation.

### 5.1 Account — 4 operations

| Stable operation | RPC method | Inputs and behavior |
| --- | --- | --- |
| `account.getBalance` | `getBalance` | Public address; commitment; optional minimum context slot. Return lamports and an exact SOL string. |
| `account.get` | `getAccountInfo` | Address; account encoding; optional data slice/context slot. Preserve a missing account as null. |
| `account.getMany` | `getMultipleAccounts` | Address array; preserve input order, duplicate requests, and null positions. |
| `account.getByProgram` | `getProgramAccounts` | Program address; explicit filters and optional data slice; request context; conditional on endpoint support. |

SOL values must be derived from integer lamports without floating-point rounding. A zero balance is not proof that an account exists. [Balance contract](https://solana.com/docs/rpc/http/getbalance)

`getMany` accepts at most 100 addresses per RPC call. Larger user lists may be split into bounded sequential chunks; never imply the chunks share one atomic slot snapshot. [Multiple accounts contract](https://solana.com/docs/rpc/http/getmultipleaccounts)

Program filters expose typed `dataSize` and `memcmp` entries. Do not invent a pagination cursor for this method. An output limit only slices an already-fetched response and must be labeled accordingly. Require a filter by default; an explicit advanced option may allow an unfiltered supported query with a large-response notice. No unrestricted scan is an example default. [Program accounts contract](https://solana.com/docs/rpc/http/getprogramaccounts)

### 5.2 Token — 5 operations

| Stable operation | RPC method | Inputs and behavior |
| --- | --- | --- |
| `token.getBalance` | `getTokenAccountBalance` | Token-account address, not wallet address. |
| `token.getSupply` | `getTokenSupply` | Mint address. |
| `token.getByOwner` | `getTokenAccountsByOwner` | Wallet owner; exactly one mint or token-program filter. |
| `token.getByDelegate` | `getTokenAccountsByDelegate` | Delegate; exactly one mint or token-program filter. |
| `token.getLargestAccounts` | `getTokenLargestAccounts` | Mint; identify returned token accounts, not unique beneficial owners. |

Offer SPL Token and Token-2022 program choices. Public program IDs are protocol constants; wallet lists, asset catalogs, and mint inventories must not be hardcoded. Choosing one token program does not include the other. User workflows can run both branches when needed. Preserve provider amount strings, decimals, and parsed extension fields. Do not substitute rounded `uiAmount` for exact amounts. [Token owner query contract](https://solana.com/docs/rpc/http/gettokenaccountsbyowner)

Token balances, supply, delegate queries, and largest-token-account queries use their individual contracts linked from the [Solana HTTP method reference](https://solana.com/docs/rpc/http). `token.getLargestAccounts` is distinct from the excluded SOL-wide `getLargestAccounts` method.

### 5.3 Transaction — 5 operations

| Stable operation | RPC method | Inputs and behavior |
| --- | --- | --- |
| `transaction.get` | `getTransaction` | Signature; encoding; commitment; supported transaction version. |
| `transaction.getSignatures` | `getSignaturesForAddress` | Address; before/until boundaries; bounded list retrieval. |
| `transaction.getStatuses` | `getSignatureStatuses` | Signature array; optional historical lookup. |
| `transaction.getHistory` | `getTransactionsForAddress` | Address; enhanced options and opaque continuation token. |
| `transaction.submit` | `sendTransaction` | Prepared base64 serialized transaction; required wallet connector; sign-and-submit or already-signed mode; explicit preflight and bounded RPC retry settings. See section 8.3. |

For `get`, start with `json` encoding and `maxSupportedTransactionVersion: 0`; expose supported values deliberately. A null transaction is an unavailable/not-found observation, not proof of failure. Preserve transaction `meta.err` separately from transport success. [Transaction contract](https://solana.com/docs/rpc/http/gettransaction)

Standard signatures are newest-first and support `before`/`until`. They describe references to the supplied address, not automatically every token account owned by a wallet. [Signatures contract](https://solana.com/docs/rpc/http/getsignaturesforaddress)

Status requests accept up to 256 signatures per call, preserve null results and input association, and distinguish recent-cache lookup from `searchTransactionHistory`. Do not claim the user-selected commitment was sent to a method that does not accept it; inspect returned confirmation status. [Status contract](https://solana.com/docs/rpc/http/getsignaturestatuses)

Enhanced history uses explicit `transactionDetails` (`signatures`/`full`), `sortOrder`, `limit`, `paginationToken`, commitment, and typed slot/time/status/token-account filters. Keep its cursor opaque. Use the documented signature/full-detail limits; verify maximum accepted values before release. Unsupported-method errors must remain visible rather than silently causing an N+1 fallback. [Triton address-history contract](https://docs.triton.one/chains/solana/gettransactionsforaddress)

### 5.4 Network — 7 operations

| Stable operation | RPC method |
| --- | --- |
| `network.getSlot` | `getSlot` |
| `network.getBlockHeight` | `getBlockHeight` |
| `network.getEpochInfo` | `getEpochInfo` |
| `network.getHealth` | `getHealth` |
| `network.getVersion` | `getVersion` |
| `network.getGenesisHash` | `getGenesisHash` |
| `network.getLatestBlockhash` | `getLatestBlockhash` |

Only send configuration fields supported by each method. Health is a provider/RPC observation; it does not guarantee future availability. Preserve `lastValidBlockHeight` with a blockhash and never label it as a Unix expiration time. These methods are selected from the [Solana network and transaction references](https://solana.com/docs/rpc/http).

### 5.5 Block — 2 operations

| Stable operation | RPC method | Inputs and behavior |
| --- | --- | --- |
| `block.get` | `getBlock` | Slot; transaction detail mode; encoding; rewards option; supported transaction version. |
| `block.getTime` | `getBlockTime` | Slot; preserve null time. |

Default block retrieval to limited transaction detail rather than full transaction bodies. Preserve skipped/unavailable-block errors and distinguish them from missing time. Use block commitment options supported by the method. [Block contract](https://solana.com/docs/rpc/http/getblock)

### 5.6 Fee — 2 operations

| Stable operation | RPC method | Inputs and behavior |
| --- | --- | --- |
| `fee.getRecentPriorityFees` | `getRecentPrioritizationFees` | Writable account list; minimum or percentile mode. |
| `fee.getForMessage` | `getFeeForMessage` | Base64 serialized message supplied by the workflow. No signing or sending. |

The percentile UI accepts an integer from 1 to 10,000; `5000` means the 50th percentile. Omit the parameter in minimum mode. Do not silently retry without the percentile if it is rejected. The output is a set of observed samples, not a promised landing price. [Triton priority-fee extension](https://docs.triton.one/chains/solana/improved-priority-fees-api)

Validate the optional account list against the current standard limit of 128. Preserve slot/sample association. Document priority-fee units separately from total message fees and SOL; verify unit interpretation with the provider during contract testing. [Standard priority-fee contract](https://solana.com/docs/rpc/http/getrecentprioritizationfees)

### 5.7 Digital Asset — 6 operations

| Stable operation | DAS method | Inputs and behavior |
| --- | --- | --- |
| `digitalAsset.get` | `getAsset` | Asset ID. |
| `digitalAsset.getMany` | `getAssets` | Asset ID array; associate results by returned ID. |
| `digitalAsset.getByOwner` | `getAssetsByOwner` | Owner address; sorting; supported pagination. |
| `digitalAsset.search` | `searchAssets` | Typed owner, creator, authority, grouping, interface, compression and other verified filters. |
| `digitalAsset.getProof` | `getAssetProof` | Asset ID; return proof data without claiming independent verification. |
| `digitalAsset.getTokenAccounts` | `getTokenAccounts` | Mint and/or owner; supported pagination. |

DAS is indexed asset data. Preserve metadata, ownership, compression, and token fields without interpreting API success as proof of solvency or independently verified ownership. Target the documented mainnet service; do not advertise equivalent test-cluster support without evidence. [DAS overview](https://docs.triton.one/digital-assets-api/introduction)

Use the documented `getAssets` method, not an assumed name borrowed from another provider. The implementation contract must record accepted request shape, output shape, missing-ID behavior, and batch limits. [Get asset](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-asset), [Get assets](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-assets)

Triton's owner-query example uses positional parameters, while `searchAssets` uses named parameters. Do not impose one serializer on all DAS methods or silently retry alternate shapes. Contract-test each. Offer one verified pagination mode per operation initially. Explicit false filters must survive; absent filters must be omitted. Do not promise unsupported name-text search. [Owner query](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-assets-by-owner), [Search query](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/search-assets)

The token-account method documents `mintAddress` and `ownerAddress`; require at least one. Its collection is `token_accounts`, not an assumed `items` array. [DAS token accounts](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-token-accounts)

Proofs and additional DAS operations remain governed by Triton's [method catalog](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api). The disabled group operation must not appear as usable. Expanding other methods is subsequent scope, not an implicit promise of complete DAS coverage.

## 6. Shared configuration and output contract

### 6.1 Configuration

- `resource` and `operation` are required selectors with stable values from section 5.
- Every relevant address, signature, slot and filter accepts n8n expressions per input item.
- Default commitment is `finalized`; expose `confirmed` where supported. Do not expose `processed` in v0.1. No silent commitment downgrade.
- Account data defaults to explicit `base64`; offer `jsonParsed` where supported. If parsing falls back to encoded data, preserve that actual representation. No arbitrary program decoding.
- Validate addresses by base58-decoded 32-byte length, not by requiring an on-curve wallet; program-derived addresses are valid. Validate signatures by decoded length. Validation makes no claim that an account exists.
- No arbitrary method, endpoint override, custom headers, or free-form executable code field.
- No global mutable catalog or capability cache shared between credentials.

### 6.2 Output modes

Default to **Response**: one n8n item per input/request result, containing `{ data, meta }`. For paginated collection operations, `data` contains the accumulated provider records and `meta.pagination` records retrieval boundaries. Offer **Split Records** for supported list methods, with one `{ data, meta }` item per record. In either mode, set n8n `pairedItem` correctly.

`meta` includes operation, RPC method, validated network, requested commitment when applicable, actual provider context when present, and Tarvos `observedAt`. It may include public request identity such as address/signature and input position. Never include the endpoint URL or credential contents. A requested commitment is not an observed finality claim.

Synthetic balance output shape:

```json
{
  "data": {
    "lamports": "1250000000",
    "sol": "1.25"
  },
  "meta": {
    "operation": "account.getBalance",
    "method": "getBalance",
    "network": "devnet",
    "requestedCommitment": "finalized",
    "context": { "slot": 123 },
    "observedAt": "2026-10-12T12:00:00.000Z"
  }
}
```

These are illustrative values, not an executed result. Other operations retain the provider's result structure under `data`, with narrowly documented normalization. Do not flatten transaction metadata or discard unknown nested fields. There is no broad Simplify mode in v0.1.

Null handling is explicit:

- A single missing account/transaction stays `data: null`.
- Positional multi-account/status results retain null entries and their request identity.
- Empty lists remain empty in Response mode; Split Records emits zero items, documented in the UI.
- A returned execution error such as transaction `meta.err` remains data; a JSON-RPC protocol `error` becomes a node error.

### 6.3 Numeric precision

Read response bodies as text and parse before ordinary JSON decoding can round unsafe integer tokens. Adapt the locally tested Pyth lossless parser only after reviewing its applicability to nested RPC results. Prove behavior through the actual n8n HTTP adapter.

Keep unsafe integers as decimal strings and existing numeric strings unchanged. Normalized lamports, token atomic amounts, supply values, and computed display amounts have stable string types. Use integer/decimal-string arithmetic, never floating-point division for exact money. Preserve safe numeric metadata where appropriate. No JavaScript BigInt may escape into n8n JSON output. Reject unsafe numeric user inputs rather than rounding them.

## 7. Transport, pagination and failures

### 7.1 Transport

Use n8n's authenticated HTTP helper. POST JSON-RPC 2.0 with a unique request ID, JSON content headers, method-specific parameters, a 30-second default timeout, and redirects disabled. Bound configurable timeouts to 5–120 seconds. Validate response ID, version, and the result/error distinction. No JSON-RPC batch-array transport in the first release.

Process inputs sequentially by default to avoid surprising bursts and billing. Read operations use no hidden retries. Expose retryability in sanitized errors; n8n/workflow owners control retry policy. Do not retry malformed or partially parsed large responses as successful partial data.

### 7.2 Pagination

Use **One Page** or **Up to Limit**, not unbounded Return All. Proposed Tarvos defaults are page size 50, total limit 100, and request budget 20 per input; configurable ceilings are 10,000 records and 100 requests. Provider-specific lower limits take precedence. Label these as Tarvos limits, not provider guarantees.

Implement separate adapters for signatures, enhanced history, and each tested DAS collection. Preserve continuation tokens in Response mode. Follow provider completion signals rather than assuming every short page is final. Detect repeated cursors/pages and nonprogress. Do not synthesize cursors for unpaginated methods.

If a budget is exhausted before the requested retrieval completes, raise a clear limit error and do not emit a silently incomplete success for that input. A deliberately requested item cap is not an error: mark truncation/continuation availability. Preserve records within an input until its retrieval succeeds; earlier successful input items follow ordinary n8n error handling.

For unpaginated account queries, a local output cap does not reduce network response size or provider cost. Narrow queries using server filters; test helper response-size protections and document any inability to bound memory before parsing. No claim of streaming JSON memory behavior in v0.1.

### 7.3 Rate limits and errors

Triton currently instructs clients receiving HTTP 429 to pause requests from the originating IP for 10 seconds. Return a sanitized retry hint of at least that duration, or a longer valid Retry-After. Stop further calls in the current execution on 429 even with per-item continuation. An individual node cannot coordinate all workers sharing an egress IP; deployments with parallel workflows need shared throttling outside this package. [Triton rate limits](https://docs.triton.one/core-features/ratelimits)

| Failure | User-facing behavior |
| --- | --- |
| 401/403 | Credential/access issue; do not guess a replacement token or endpoint. |
| 410/disabled method | Explain operation availability and refer to endpoint support. |
| JSON-RPC unsupported method | Identify the unavailable feature; no automatic fallback. |
| Invalid params | Identify the field or method contract without printing secrets. |
| Network mismatch | Stop before the operation. |
| Timeout/5xx | Reads: mark transient, no automatic retry. Submission: report an unknown submission outcome and known signature; reconcile before any resend. |
| HTTP 200 with RPC error | Treat as an error. |
| Truncated/malformed JSON | Reject the response. |
| Unsafe numeric encoding | Fail explicitly. |
| Per-item validation failure | Respect n8n error mode; pair a sanitized error item to its input. |

Credential/network/429 failures stop subsequent provider calls for the execution. Error output must contain only allowlisted message, code, method and safe hints. Do not attach request configs, stacks from provider clients, headers, or complete upstream bodies.

## 8. Monitoring, wallet connector and submission

### 8.1 Monitoring in v0.1

Use n8n Schedule Trigger → Tarvos Triton 1 → IF/database/notification nodes. The Tarvos action itself does not maintain polling state or emit triggers. Persistent deduplication, reconciliation watermarks, and alert cooldowns belong to the example's explicit storage design. Overlap history windows and reconcile signatures; do not infer exactly-once observation from a timer.

### 8.2 Future trigger node

If real-time monitoring is selected later, add `Tarvos Triton 1 Trigger` inside the same package only after an architecture decision. Triton offers multiple streaming transports with different delivery characteristics; they are not interchangeable HTTP polling options. [Streaming overview](https://docs.triton.one/chains/solana/streaming)

The design must cover n8n activation/deactivation, worker ownership, subscription limits, reconnect/backoff, cursor persistence, buffering/backpressure, duplicate handling, gap detection, finality and rollback handling, and manual-test isolation. A gRPC SDK/native dependency may conflict with verification goals. Reassess dependency policy and deployment support openly; do not disguise a sidecar as a dependency-free feature. No sub-slot or guaranteed-delivery claims without end-to-end evidence.

### 8.3 Required wallet connector experience

The user's screenshot supplied on 13 October 2026 is the visual reference: a main node with a labeled bottom connector and a dashed connection to a compact circular sub-node beneath it, like the shown Vector Store Tool → OpenAI Chat Model attachment. Apply that interaction pattern to Triton and its wallet; the screenshot's AI/vector functionality is not part of this product.

The desired canvas layout is:

```text
Schedule / upstream data → Tarvos Triton 1 → status checks / downstream workflow
                                  ↑ Wallet
                         Solana Wallet
                       public address + credentials
```

The Wallet attachment appears beneath the main node when `transaction.submit` is selected. Read operations require only the Triton credential and must never invoke a signer. Clicking the attachment opens the wallet node details. Configure wallet identity, expected network, signing mode and the selected wallet credential there. The parent contains transaction input and submission settings, not wallet secrets. Exactly one wallet connector is supported initially; missing or multiple attachments fail validation before submission.

Required interaction and visual acceptance:

1. Selecting **Transaction → Submit** exposes a bottom attachment point labeled **Wallet**, with a required indicator.
2. Adding the attachment creates or connects a **Solana Wallet** sub-node below Triton, using the screenshot's compact circular presentation and dashed link where supported by the host.
3. Clicking the wallet sub-node opens its own details, including an editable **Public Address** field and a **Wallet Credential** selector with the normal n8n create/edit credential flow.
4. The wallet details show the configured public identity and validation result. In signing mode, the address must match the selected credential's derived public key; mismatch prevents signing and submission.
5. The wallet stays attached outside the main left-to-right item flow. It supplies wallet configuration/signing to Triton and does not forward secrets through ordinary workflow items.
6. Switching to a data/read operation removes the wallet requirement and disables its use; retain any saved wallet configuration for switching back without invoking it.

**n8n compatibility gate:** the inspected public workflow interfaces enumerate Main and AI connection types, with no native Wallet connection type; the supplied-data accessor is AI-typed. Consequently, a generic bottom wallet port cannot be promised merely by declaring a new type. Prototype the layout, credential isolation, expression/item behavior, execution and saved-workflow round trip on the supported n8n version first. Do not mislabel the wallet as an AI model/tool to imply supported semantics. If supported extension APIs cannot deliver it, record whether a host extension is required and obtain a product decision on that deployment constraint. Do not silently replace the requested connector with parent-node credential fields. This is a release gate, not removal of submission from scope. [n8n workflow interfaces](https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts)

### 8.4 Wallet identity, credentials and signing

Proposed initial backend: a server-side Solana keypair stored only in n8n's encrypted credential store. Final import format and signing library are implementation decisions that must be validated before release. Do not offer seed-phrase entry, key generation, browser-extension wallet popups, or remote custody integrations in the initial release. A scheduled server workflow must not rely on an interactive browser connection.

| Wallet detail | Requirement |
| --- | --- |
| Public Address | Required editable Solana public address in wallet-node details. Validate base58 and decoded length; in signing mode derive the credential's public key and reject a mismatch. A public address alone cannot sign. |
| Wallet label | Optional human-readable name for the connector; separate from the public address. |
| Wallet credential | Selected in the wallet node only; secret fields use n8n credential handling. No private keys in ordinary parameters or expressions. |
| Expected network | Must match the validated Triton network. A keypair itself is not cluster-specific. |
| Signing mode | Sign prepared transaction, or validate already-signed transaction. |
| Already-signed identity | A public wallet identity is sufficient; do not demand a private key when no signing is needed. The selected wallet must be a required signer of the transaction. |

The connector exposes an execution-scoped capability to validate identity and sign the exact supplied message. It never emits private keys or a signer object into normal n8n item JSON. The parent receives only public identity and serialized signed transaction bytes through the validated connector contract. Credential tests derive/check identity only and never send a transaction. Credentials must remain usable in supported worker/queue execution without leaking into workflow exports, pinned data, errors or logs.

For sign-and-submit, accept a prepared unsigned or partially signed transaction, preserve existing valid signatures, add only the selected wallet's signature, and reject if other required signatures are absent. For already-signed mode, verify all required signatures and do not re-sign or modify the message. Support legacy and v0 transaction formats only after decoding/signature tests pass; reject unknown versions. The first release does not build transfers, swaps, token approvals, compute-budget instructions or arbitrary transactions for the user. Durable-nonce transactions and interactive multisigner collection are outside the initial contract and must fail with a clear unsupported-mode message.

No signing occurs just because the connector is attached. It is invoked only by an explicitly configured submit operation. Decode and validate transaction size, signer identities, message format and signatures before submission. Resolving v0 address lookups and recognizing unsupported nonce instructions must be part of the validation design. Wallet/network matching expresses workflow intent; Solana transactions do not embed a universal chain ID. Reject missing or expired recent blockhashes against the selected cluster. Never refresh a blockhash, change instructions, replace a fee payer or alter fees silently.

### 8.5 Submission and confirmation contract

Submit the fully signed transaction through the same validated Triton RPC endpoint using `sendTransaction`, explicit `base64` encoding, preflight enabled, and a commitment consistent with blockhash preparation. Expose `preflightCommitment`, optional `minContextSlot`, and a bounded `maxRetries` value for the RPC's own rebroadcast behavior (proposed default zero). Do not expose a preflight-bypass switch in v0.1. A separate simulation operation remains future scope; RPC preflight is part of submission. [Solana sendTransaction](https://solana.com/docs/rpc/http/sendtransaction)

Compute the expected transaction signature before the network call and validate that a successful response matches it. Return `{ data, meta }`, with `data.signature`, `data.submissionStatus: "accepted"`, and `data.confirmationStatus: "unknown"`; include only safe wallet public identity, network and observation metadata. Do not return signed payloads by default or claim acceptance means execution success. Monitor separately using `transaction.getStatuses` and `transaction.get`; surface execution failure and observed confirmation level distinctly.

After a transport timeout or ambiguous provider failure, produce a sanitized `SUBMISSION_OUTCOME_UNKNOWN` error containing the expected signature and network. Continuation mode must preserve those fields in the paired error item. Query status before retrying; a missing status alone does not prove the original was never accepted. Only resend identical signed bytes under a deliberate workflow policy while still valid. Never auto-rebuild, re-sign or replace a transaction. Document that n8n Retry on Fail or replaying upstream builders can otherwise create unintended new transactions; the node cannot guarantee exactly-once execution across workflow runs.

Track expiry using the supplied blockhash and a verified validity check; only report `lastValidBlockHeight` when its provenance is tied to that blockhash. Allowlist and contract-test any internal validation reads (including `isBlockhashValid` and address-lookup account retrieval); they are implementation helpers, not additional user-facing operations. An expired transaction needs a new explicit preparation/signing step. Do not describe a slot or block height as a timestamp. Provider rejection, on-chain execution failure, expiration and unknown outcome are different states.

Cascade direct submission has a separate endpoint/contract and remains outside this release. [Triton Cascade submission](https://docs.triton.one/chains/solana/cascade/transaction-submission)

## 9. Examples and documentation

Ship seven inactive importable workflows:

1. **Connection and balance:** Manual Trigger → network identity → SOL balance.
2. **Token inventory:** owner queries for both token programs; preserve token-account identities.
3. **Address activity:** bounded enhanced history → explicit database upsert design; document pagination and reconciliation.
4. **xStocks deployment inspection:** select the Solana deployment from xStocks output → Triton account/token read. Never assume the first deployment is Solana or fetch xStocks inside this package.
5. **Priority-fee observation:** percentile query → aggregate samples in a clearly labeled workflow step; no transaction sender.
6. **Digital asset inventory:** owner query/search → asset detail. No automatic downloads of metadata URLs.
7. **Devnet submission and monitoring:** Manual Trigger → user-supplied prepared transaction → Triton Submit with the wallet connector beneath it → Wait/status checks with a bounded deadline. Include both signing modes in its guide. Require explicit credential mapping and transaction input; no funded keys, automatic airdrops or default mainnet sender.

Examples use the exact final types `n8n-nodes-tarvos-triton-one.tarvosTritonOne` and `n8n-nodes-tarvos-triton-one.tarvosSolanaWallet`, versioned parameters, and current output paths. The final connector serialization must come from a tested n8n export, not an invented connection type. No embedded credentials, real credential IDs, pinned private data, or activated notification branches. Installation and both credential mappings must be explained beside each example.

Required docs: README, GETTING-STARTED, SOLANA-BEGINNER-GUIDE, TRITON-ONE-GUIDE, DEVELOPMENT, SECURITY, CONTRIBUTING, CHANGELOG, and an operation contract reference. Explain wallet versus token account versus mint; native SOL versus token units; commitment versus settlement; indexed data versus live observations; and how provider usage can incur charges. Link to current provider terms instead of freezing a price schedule in the node.

## 10. Tarvos website and agent integration

Preserve `/nodes/triton-1/`. Until source and installation are real, keep the existing record `documented` with installation pending. After release preparation, update it with actual repository/package information, MIT licensing, version `0.1.0`, credential requirements, and tested network/feature limitations.

Do not add only a generic “Solana RPC request” capability. Publish a versioned operation contract that includes both node types, resource/operation identifiers, request fields, defaults, output modes, precision behavior, pagination, method availability, wallet connection requirements, credential ownership, submission side effects and executable examples. Link that contract from the registry record without inventing unsupported registry-schema fields.

Website deployment is separate from this node package. Confirm the active website repository before making deployment changes.

## 11. Acceptance criteria

| Area | Required evidence |
| --- | --- |
| Installation | Clean `npm ci` on supported Linux and Windows environments; lockfile and manifest agree. |
| Build | CLI build, typecheck, lint and package inspection pass. |
| Contract | Every one of the 31 operations has request, success, null/empty, error, and expression tests as applicable. |
| Wallet connector | Match the supplied screenshot's bottom attachment and compact sub-node interaction; Public Address and credential create/select/edit live in wallet details. Verify save/import/export, single attachment, address/credential mismatch, per-item identity, manual and queue execution; reads never invoke signing. |
| Signing | Legacy/v0 fixtures, expected signature, preserved cosignatures, missing/invalid signatures, wrong wallet/network, expired blockhash, unsupported nonce/version and zero secret leakage. |
| Submission | Preflight rejection, accepted-but-unconfirmed, timeout ambiguity with recoverable signature, mismatched RPC signature, same-bytes retry policy and separate confirmation/expiry behavior. |
| Precision | Nested unsafe integers, monetary normalization and JSON serialization tests; real n8n helper loopback test. |
| Credentials | Header injection, redaction, redirect refusal, URL validation and cluster mismatch tests. |
| Pagination | Multiple pages, repeated cursors, caps, failed pages, ordering and continuation tests. |
| Runtime | Per-input pairing, error continuation, 429 execution stop and preserved provider fields. |
| Examples | Import into a supported self-hosted n8n; node types and parameter paths resolve; no pinned results mask failures. |
| Live provider checks | Low-volume reads on a user-supplied Triton endpoint; test every shipped operation and document unavailable features. |
| Distribution | Package contains only intended artifacts; scanner checked; publication workflow includes provenance when released. |
| Website | Registry facts match released capabilities and examples use the installed package contract. |

Fixtures are synthetic and clearly labeled. Offline CI must not require paid provider access or send transactions. Live reads are opt-in and bounded. Before releasing submission, separately run an explicitly authorized Devnet transaction with a test wallet and verify its observed status; test both signing modes. Never default to mainnet or automatically fund a wallet. No authenticated calls, signing, funding or sending are authorized or performed merely by creating this PDR. If a capability cannot be validated, do not mark it tested or silently ship it as supported. Resolve the release scope explicitly or keep the release pending.

Success means a builder can install from a clean checkout, use the data examples with one Triton credential, attach/configure the wallet separately for submission, execute the seven examples with their own inputs, and distinguish submission from confirmation. It does not mean every Triton product has been wrapped.

## 12. Implementation sequence

1. **Connector and contract baseline:** prove the requested bottom wallet attachment on the supported n8n version; resolve signer dependencies and deployment requirements. Verify endpoint network, x-token authentication, indexed account behavior, history availability, DAS request shapes, result limits and fee units. Record disagreements and observed results.
2. **Foundation:** scaffold package, credential, method allowlist, transport, lossless parser, output envelope and errors; establish CI with a reproducible lockfile.
3. **Core reads:** accounts, tokens, standard transactions, network, blocks and fees with unit coverage.
4. **Provider additions:** enhanced address history and six DAS operations with method-specific pagination.
5. **Wallet and submission:** implement isolated wallet credentials, validated signing, `transaction.submit`, ambiguity handling and confirmation example; complete offline and separately authorized Devnet validation.
6. **User workflows:** complete seven examples, human guides and machine operation contract; validate in actual n8n.
7. **Release preparation:** verify package contents, clean install and live capability matrix; then prepare registry updates and publication separately.

No duration estimate is committed before provider access and contract checks.

## 13. Open decisions and validation gates

| Topic | Working decision | What remains |
| --- | --- | --- |
| Initial scope | User-confirmed data/monitoring plus signed submission: 31 actions and wallet connector | Persistent streaming remains future work. |
| Wallet UX | Separate connector beneath Triton, wallet and credentials in its details | Prove supported n8n extension/runtime behavior; host changes or an alternative need an explicit product decision. |
| Signing backend | Proposed n8n-managed Solana keypair; public identity for already-signed mode | Validate import format, library, credential isolation, queue behavior and verification compatibility. |
| Submission route | Standard Triton RPC `sendTransaction` | Validate endpoint support and both modes on Devnet before release; no Cascade dependency. |
| Identity | Tarvos Triton 1; package suffix `triton-one` | Check name availability before repository/npm creation. |
| Network access | Endpoint-controlled mainnet/devnet/testnet | Obtain and validate actual customer endpoints; do not infer entitlements. |
| Indexed queries | Conditional on observed endpoint behavior | Resolve Cloudbreak/Steamboat documentation differences for target deployment. |
| DAS | Six typed operations | Verify wire shapes, caps and missing-ID semantics; avoid unavailable group query. |
| Enhanced history | Explicit Triton extension | Confirm limits, cursor behavior and current availability. |
| Memory bounds | Narrow queries and bounded aggregation | Establish supported HTTP response-size protection for unpaginated reads. |
| Verification | Aim to satisfy current n8n rules | n8n's independent review and package uniqueness checks remain external. |

This PDR intentionally separates sourced provider behavior from Tarvos design choices. Documentation was reviewed on 12 October 2026; no authenticated Triton request was executed while preparing it. Recheck the linked contracts before implementation and preserve test evidence with the release.
