# Complete action acceptance matrix

Research date: 13 October 2026. Proposed cases, not live test results. Apply common error, precision, version, n8n and evidence requirements from [the research plan](TESTING-RESEARCH.md).

Every action below is currently **NOT RUN live in this research**. A prior serializer fixture is not provider acceptance. Exact action names come from the checked-in operation inventory; expected assertions were specified separately.

## account

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| ACCOUNT-01 | `account.getBalance` | Controlled wallet: exact lamports plus context; zero-balance and nonexistent wallet remain distinct from RPC failure. |
| ACCOUNT-02 | `account.get` | Known account: exact owner, executable flag and decoded bytes; absent account returns null; test encoding and byte slice. |
| ACCOUNT-03 | `account.getMany` | Existing/missing/repeated addresses: output order, duplicate positions and nulls preserved across batch boundaries. |
| ACCOUNT-04 | `account.getByProgram` | Small controlled program: every result matches owner and dataSize/memcmp constraints; combined filters exclude controls. |
| ACCOUNT-05 | `account.getRentExemption` | Known byte lengths including zero: compare exact rent result; reject negative/noninteger size. |

## token

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| TOKEN-01 | `token.getBalance` | Known token account: exact raw amount and decimals; reject wallet or mint used as token-account input. |
| TOKEN-02 | `token.getSupply` | Known mint: exact supply and decimals; missing/non-mint and Token-2022 cases explicit. |
| TOKEN-03 | `token.getByOwner` | Controlled owner with SPL and Token-2022 accounts: program/mint filter selects exactly the expected accounts. |
| TOKEN-04 | `token.getByDelegate` | Controlled delegate: includes delegated account and excludes unrelated owner-only account. |
| TOKEN-05 | `token.getLargestAccounts` | Known mint: descending amounts and correct token-account identities; fewer than requested is handled. |
| TOKEN-06 | `token.getByMint` | Provider indexed mint: every account has requested mint; account owner filter and missing index entitlement are explicit. |

## transaction

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| TRANSACTION-01 | `transaction.get` | Finalized signature: exact signature, slot, error, version, loaded addresses and balances; unknown signature returns null. |
| TRANSACTION-02 | `transaction.getSignatures` | Controlled address history: correct newest/oldest boundaries, before/until handling and ordering. |
| TRANSACTION-03 | `transaction.getStatuses` | Success/failure/missing signature batch: positional nulls and error/status retained; history lookup setting verified. |
| TRANSACTION-04 | `transaction.getHistory` | Enhanced history: known date/slot/signature filters, opaque cursor resume and budgets; repeated cursor fails visibly. |
| TRANSACTION-05 | `transaction.submit` | Devnet approved fixture: exact signed bytes sent once; returned signature matches; separately confirm err=null and balance effects. |
| TRANSACTION-06 | `transaction.isBlockhashValid` | Fresh and expired blockhash: boolean validity with context; no fixed-time substitute for chain validity. |
| TRANSACTION-07 | `transaction.simulate` | Valid and deliberately failing transactions: simulation err/logs/units retained; assert zero send calls. |
| TRANSACTION-08 | `transaction.confirm` | Signature progresses from absent to confirmed/finalized; err and timeout are distinct from successful settlement. |
| TRANSACTION-09 | `transaction.submitCascade` | Approved fixture: exact text/base64 /sendtx request and policy header; preceding simulation; unknown delivery reconciled by signature. |
| TRANSACTION-10 | `transaction.simulateBundle` | Two dependent transactions and failing second transaction: ordered results, bundle summary, matching pre/post arrays; no sendBundle. |

## network

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| NETWORK-01 | `network.getSlot` | Context-appropriate slot is an exact nonnegative integer; compare near-contemporaneous reference within a stated drift window. |
| NETWORK-02 | `network.getBlockHeight` | Block height is exact and distinguished from slot; use fresh reference, not equality across advancing reads. |
| NETWORK-03 | `network.getEpochInfo` | Epoch/index/slots-in-epoch fields are internally consistent and preserve large integers. |
| NETWORK-04 | `network.getHealth` | Healthy result versus node-unhealthy RPC error are distinguishable; do not turn health failure into empty success. |
| NETWORK-05 | `network.getVersion` | Version and feature-set preserved without assuming a particular provider version. |
| NETWORK-06 | `network.getGenesisHash` | Exact genesis hash matches selected network; wrong-network credentials stop further work. |
| NETWORK-07 | `network.getLatestBlockhash` | Recent blockhash and lastValidBlockHeight preserved; blockhash validity independently checked. |
| NETWORK-08 | `network.getPerformanceSamples` | Bounded performance samples: requested limit, sample duration, transactions and slots preserve exact values. |
| NETWORK-09 | `network.getTransactionCount` | Transaction count preserved exactly; advancing chain may increase between reference and node reads. |
| NETWORK-10 | `network.getSupply` | Circulating/noncirculating/total values preserved; account-list suppression is honored. |
| NETWORK-11 | `network.getVoteAccounts` | Current/delinquent vote-account collections, stake and epoch credits remain distinct. |
| NETWORK-12 | `network.getClusterNodes` | Node identity records preserve nullable addresses and version fields; no assumed fixed node count. |
| NETWORK-13 | `network.getEpochSchedule` | Epoch schedule fields and warmup boolean match stable reference. |
| NETWORK-14 | `network.getLeaderSchedule` | Leader schedule for a fixed historical epoch matches requested identity/filter; unavailable schedule is explicit. |
| NETWORK-15 | `network.getSlotLeader` | Slot leader is a valid identity for the queried context; acknowledge races at slot boundaries. |
| NETWORK-16 | `network.getSlotLeaders` | Fixed start/limit: requested sequence and order preserved; invalid/excessive limit rejected. |
| NETWORK-17 | `network.getFirstAvailableBlock` | First available block boundary returned exactly; distinguish archive support from genesis. |
| NETWORK-18 | `network.getMinimumLedgerSlot` | Minimum ledger slot returned exactly; do not assume equality to first available historical block. |
| NETWORK-19 | `network.getInflationRate` | Inflation fields and epoch preserve numeric semantics; do not label fractions as percentages without conversion. |
| NETWORK-20 | `network.getInflationGovernor` | Governor fields match stable reference; absent/invalid provider response is surfaced. |
| NETWORK-21 | `network.getInflationReward` | Known stake/vote addresses and epoch: positional rewards/nulls, commission and post-balance preserved. |

## block

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| BLOCK-01 | `block.get` | Finalized legacy/v0 block: requested transaction detail mode, rewards and versions preserved; skipped/pruned slots explicit. |
| BLOCK-02 | `block.getTime` | Fixed known slot: Unix timestamp or legitimate null; not confused with milliseconds. |
| BLOCK-03 | `block.getRange` | Known range containing skipped slots: only real block slots, ordered and within inclusive limits. |
| BLOCK-04 | `block.getWithLimit` | Known starting slot and count: limit respected and skipped slots handled; no invented contiguous sequence. |
| BLOCK-05 | `block.getCommitment` | Commitment array/total stake preserved; nullable/unavailable data distinguished. |
| BLOCK-06 | `block.getProduction` | Fixed slot range/identity: per-validator produced/leader counts and range metadata match reference. |

## fee

Environment: Devnet or read-only mainnet; fixtures required.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| FEE-01 | `fee.getRecentPriorityFees` | Standard versus Triton percentile mode: correct request and writable-account scope; exact samples and empty response; no delivery guarantee. |
| FEE-02 | `fee.getForMessage` | Known serialized message: fee or null preserved; signature bytes are not accepted as a message. |

## digitalAsset

Environment: Provider-enabled read-only endpoint.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| DIGITALASSET-01 | `digitalAsset.get` | Known indexed asset: ID, ownership, compression and content fields preserved; indexing absence differs from transport failure. |
| DIGITALASSET-02 | `digitalAsset.getMany` | Mixed existing/missing/repeated IDs: assert provider-defined ordering and missing-item semantics explicitly; no silent reassignment. |
| DIGITALASSET-03 | `digitalAsset.getByOwner` | Owner cohort: all assets match owner; page/resume behavior covers empty/short nonterminal pages. |
| DIGITALASSET-04 | `digitalAsset.search` | Controlled filter cohorts: AND/filter semantics and false booleans survive; fungible token-type enum verified live. |
| DIGITALASSET-05 | `digitalAsset.getProof` | Compressed fixture: correct tree/root/leaf/path fields; independent root verification if claiming cryptographic validity. |
| DIGITALASSET-06 | `digitalAsset.getTokenAccounts` | Known owner/mint: correct token-account entries, raw balances and explicit pagination. |
| DIGITALASSET-07 | `digitalAsset.getProofs` | Multiple compressed IDs: each proof tied to correct ID; missing proof and provider batch limits explicit. |
| DIGITALASSET-08 | `digitalAsset.getAssetSignatures` | Known asset history: matching signatures, sort/page boundaries and missing-history behavior. |
| DIGITALASSET-09 | `digitalAsset.getByAuthority` | Authority cohort: every result satisfies authority; pagination and legitimate empty result covered. |
| DIGITALASSET-10 | `digitalAsset.getByCreator` | Creator cohort: creator and verified-only filter honored; no confusion with owner. |
| DIGITALASSET-11 | `digitalAsset.getEditions` | Known edition collection: edition/parent identities and page boundaries; unsupported asset type fails clearly. |

## titan

Environment: Mainnet quote/simulation; swap canary only with separate approval.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| TITAN-01 | `titan.getInfo` | Authenticated binary connection: actual server metadata/version and supported settings; request-ID correlation. |
| TITAN-02 | `titan.getVenues` | Venue metadata parses as documented; changing inventory is not treated as a fixed snapshot. |
| TITAN-03 | `titan.listProviders` | Provider identifiers preserved and selectable in returned quote map; no assumption about permanent availability. |
| TITAN-04 | `titan.quote` | Public address or connected read-only wallet: matching pair/amount/wallet; valid stream lifecycle; zero signing/send calls. |
| TITAN-05 | `titan.swap` | Fresh route: supported instruction/V0 signer set, ALTs, bounds, simulation and expiry; approved canary confirmed with independently checked economic deltas. |

## archive

Environment: Provider-enabled read-only endpoint.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| ARCHIVE-01 | `archive.exportAddressHistory` | Known historical address: page/record budget, cursor continuation and no repeated/nonprogress loop. |
| ARCHIVE-02 | `archive.exportBlocks` | Known historical range: skipped/pruned slots, maximum blocks/bytes and nextStartSlot resume without unexplained gaps. |

## administration

Environment: Scoped management API.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| ADMINISTRATION-01 | `administration.listAccounts` | Separate scoped management token: only authorized accounts; auth failure does not leak token. |
| ADMINISTRATION-02 | `administration.listSubscriptions` | Known account: authorized subscriptions, page boundaries and empty account response. |
| ADMINISTRATION-03 | `administration.listEndpoints` | Known subscription: endpoint identities and paging; unauthorized endpoint access rejected. |
| ADMINISTRATION-04 | `administration.listTokens` | Token inventory: identifiers available but secret/token-value fields recursively removed from output and errors. |
| ADMINISTRATION-05 | `administration.listWatchLists` | Authorized operator fixture: watch-list records and paging; ordinary-token forbidden response classified as scope restriction. |

## worker

Environment: Disposable worker + provider-backed source where needed.

| Case | Action | Acceptance assertion |
| --- | --- | --- |
| WORKER-01 | `worker.getStatus` | Authenticated health includes actual source state; stopped/stale source not reported healthy merely because HTTP is up. |
| WORKER-02 | `worker.getAccount` | Cold/warm/stale account: bytes, owner, balance, context and freshness; instrumentation distinguishes stream cache from RPC fallback. |
| WORKER-03 | `worker.getEvents` | Durable inbox: same unacknowledged batch/receipt redelivered; limits, consumer isolation and empty batch covered. |
| WORKER-04 | `worker.acknowledgeEvents` | Exact consumer/receipt advances once; wrong/stale receipt rejected, repeat ack idempotent, crash windows do not lose unacknowledged work. |

## Additional mandatory suites

- Eight streaming services: use the separate service matrix and lifecycle/failure cases in the research plan.
- Solana Wallet: public-only, signing, already-signed, key/address/network mismatch, signature validation, actual ai_tool connection behavior and secret non-disclosure.
- Guided main-node versions 1–1.3, trigger versions 1–1.2, fields/JSON mode and saved workflow round trips.
- Worker persistence, restart, retention, cache freshness, consumer isolation and queue-mode execution.
- Final packaged artifact installation, schema compatibility, usability and bounded load tests.
