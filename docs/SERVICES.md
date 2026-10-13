# Implemented service guide — 0.2.0

This is the implemented inventory, not a claim that every Triton product or every entitlement is available. The [generated contract](operation-contract.json) includes exact action fields; [research](SERVICE-RESEARCH.md) records the discovery stage.

## Quick Setup

New trigger nodes (version 1.2) start with a goal and an address: wallet activity, SOL/account changes, a token account, a transaction update, or program activity. The node selects Whirligig, confirmed updates and bounded batching automatically. No private key is required. Wallet activity is log activity mentioning that address, not complete token-transfer history. A token-account watch needs a token-account address, not a mint.

Advanced Setup preserves the separate service configuration and explains each service and its access requirements. Existing nodes keep Advanced Setup until explicitly changed. New action nodes hide request tuning behind Show Advanced Settings; transaction amounts, slippage and minimum output remain visible.

## Fields and advanced JSON

New action and trigger nodes (node version 1.1) default to **Fields (Recommended)**. Whirligig uses confirmation/data-format dropdowns, reward and notification switches, account-data slice fields and repeatable program filters. Address, signature, Shield policy and bundle transaction lists use Add Entry rows. Query Options uses Add Option controls, Vixen has a program picker, and common Yellowstone/preconfirmation subscriptions have guided filters and region dropdowns.

**JSON (Advanced)** preserves full supported request shapes, including multiple named stream filters. Existing version-1 nodes keep JSON mode until explicitly changed. Switching modes preserves each mode's separate saved settings; it does not translate them. Review the active settings before executing. Guided Yellowstone supports one event type per trigger. Use JSON for additional protobuf fields, multiple named filters or preconfirmation instruction-byte filters.

## RPC and DAS

The original 31 actions remain compatible. Additions cover rent exemption, indexed token accounts by mint, block range/limit/production/commitment, leader queries, performance samples, supply/votes/inflation, ledger boundaries and blockhash validity. Query Options accepts a per-method allowlist; arbitrary RPC methods and endpoints are not accepted. Owner/delegate token reads now accept minimum context slot and binary data slicing.

DAS adds `getAssetProofs`, `getAssetSignatures`, `getAssetsByAuthority`, `getAssetsByCreator`, and `getNftEditions`. New paged actions expose one explicit page; existing multi-page retrieval remains on the original paginated actions. Fungible search accepts the documented `tokenType: All`; other undocumented enum spellings are not guessed. `getAssetsByGroup` remains excluded. The asset-signature action currently accepts asset ID, not the alternative tree/leaf selector. [Triton DAS reference](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api), [Cloudbreak](https://docs.triton.one/project-yellowstone/cloudbreak-custom-indexes), [fungible assets](https://docs.triton.one/digital-assets-api/fungible-assets).

## Native stream trigger

| Service | Credential | Request and delivery |
| --- | --- | --- |
| Whirligig | RPC | Account, program, logs, signature, slot, block or transaction JSON subscription; heartbeat; exact unsafe JSON integers |
| Dragon's Mouth | Stream | Pinned official Yellowstone protobuf, JavaScript gRPC transport; SubscribeRequest JSON; account, transaction/status, block/meta, slot and entry filters |
| Riptide | Stream | Same Geyser interface on mainnet; shared riptide.rpcpool.com requires a shared gRPC subscription token. Dedicated arrangements use their assigned endpoint |
| Vixen | Stream | Program address from the pinned SDK; parsed account/instruction events |
| Titan | RPC, mainnet | Exact-input quote stream over binary MessagePack |
| Deshred | Stream | SubscribeDeshredRequest; reconstructed pre-execution data |
| Harmonic | Stream | Explicit harmonicRegion plus positive transaction filters; retain slotStart/slotEnd and clip |
| BAM | Stream | Explicit bamRegion plus positive transaction filters; retain bundle metadata and optional outcome |

The gRPC codecs and SDKs load only when selected. Yellowstone SDK 9.0.0 does not ship a Windows native binary, so the integration resolves its pinned generated protobuf codecs without loading that native entry, and uses @grpc/grpc-js for transport. Service access still requires a real test. RPC credential testing does not validate every stream capability. gRPC credentials are validated by service activation, not a misleading generic RPC test.

Whirligig uses header authentication on `/whirligig`. Transaction filtering requires a positive include/required account set or a signature. Yellowstone full account/transaction feeds require explicit Allow Unfiltered Feed. Vixen supports Token, Token22, Orca Whirlpool, Raydium AMMv4/CLMM/CPMM, Meteora variants, Pump/PumpSwap, Jupiter Swap, Moonshot and Kamino Limit Orders in SDK 0.4.1. Program-wide traffic may exceed n8n's practical throughput.

Preconfirmation protobuf is pinned to `rpcpool/preconfs-client` commit `56c6a014c1112cf66e02052c72060e573428b52f`, with its Apache license. The current schema includes an **optional BAM execution result**; this updates the earlier research note that BAM had none. An absent/unknown result is not success. Transactions remain raw base64 so v1 bytes are not incorrectly parsed by a legacy/v0 wallet. Harmonic repeated slotStart requires consumers to replace that region/slot's prior state; clip reports withheld traffic. Account filters match static keys, not resolved lookup-table keys. [Official protocol](https://github.com/rpcpool/preconfs-client), [Triton preconfirmations](https://docs.triton.one/chains/solana/preconfirmations-grpc).

All direct streams are best-effort. Trigger errors stop the connection and let n8n manage reactivation. Reconnect is not replay. Batch/time thresholds and a per-minute execution budget bound output; exceeding the budget is a fatal error and can cause a gap. Events include fingerprints, not a universal exactly-once identity. Use the optional worker when durable ingestion is needed. No latency or throughput claim has been benchmarked.

## Titan swaps and transaction delivery

Titan uses Triton's documented token-path proxy and the current upstream binary MessagePack protocol, negotiating `v1.api.titan.ag` without compression. This deliberately follows the linked protocol reference rather than the simplified JSON-parsing snippet in Triton's landing-page example. Methods: GetInfo, GetVenues, ListProviders and NewSwapQuoteStream; streams are stopped and sockets closed after quote snapshots. [Triton route](https://docs.triton.one/trading-apis/titan-swap-api), [Titan wire protocol](https://titan-exchange.gitbook.io/titan/developer-doc/swap-api/reference/direct/connection.md).

Swap execution is ExactIn, mainnet, supported instruction routes, a single connected signing wallet and V0. Amounts use integer strings. Quote identity, input amount, slippage, minimum output, expiry, signer set, lookup tables, compute fee and transaction size are checked. The actual program semantics and on-chain output limit originate in the authenticated provider instructions; local checks do not independently prove every DEX program's behavior. Routes with additional signers, missing instructions/compute estimates, unsupported versions or oversized messages fail closed. There is no silent fallback to a different provider or automatic re-quote/resend.

The wallet signs; a separate signed simulation must succeed; expiry is checked again before sending. Transaction Confirm polls up to 120 seconds and distinguishes timeout from observed status. Cascade uses `/sendtx` and performs its own preceding simulation. Existing on-chain Shield policy addresses can be attached to standard, Cascade and Titan sends; creating policies is a separate on-chain operation not included here. [Cascade](https://docs.triton.one/chains/solana/cascade), [Shield](https://docs.triton.one/project-yellowstone/shield-transaction-policies).

Jito bundle simulation uses `encodedTransactions` and matching pre/post account-config arrays. It does not sign or submit a bundle. The published Jito Rust types and tests were used to resolve details absent from Triton's table. [Triton simulation](https://docs.triton.one/trading-apis/bundle-simulation-with-jito), [Jito request types](https://github.com/jito-foundation/jito-solana/blob/master/rpc-client-api/src/bundles.rs).

## Worker, archives and administration

See [worker deployment and recovery limits](../worker/README.md). Fumarole uses a fixed regional replay boundary, SQLite durability, explicit consumer acknowledgements and safe refusal outside retention. Account Sync uses the official SDK with RPC slot-bound freshness checks. No wallet secrets enter the worker.

Address history exports expose the existing opaque continuation token. Block exports accept at most a 1,000-slot span and 100 blocks per execution (default 25), with a 32 MiB aggregate budget and `nextStartSlot` continuation. Archive availability and charges depend on Triton. Hosted Old Faithful gRPC is retired; it is not offered. [Archive status](https://docs.triton.one/project-yellowstone/old-faithful-historical-archive).

Administration lists accounts, subscriptions, endpoints, token inventory and address watch lists. It uses a separate management token in Authorization (not Bearer), fixed provider host and explicit page/page-size. Token values and unnecessary billing/secret fields are redacted. Watch lists require the provider's restricted operator/reseller role; they are not wallet webhook registrations. Provisioning, revocation and destructive operations are not implemented. [Management authentication](https://docs.triton.one/account-management/api-access/auth-and-headers).

## Excluded infrastructure

Raw-shred IP/port receivers and reconstruction, custom Vixen hosting, massive Jetstreamer jobs, retired hosted archive gRPC, Jito Block Engine submission, administration writes and on-chain Shield policy creation remain outside this package. These require distinct infrastructure, privileges or a separately specified transaction workflow; they are not hidden RPC switches.


## Guided quotes and swaps (main node version 1.3)

1. Select **Swap Quotes & Swaps**, then **Get a Swap Quote (No Trade)**.
2. Add a Triton mainnet credential with Titan access. Choose **Connected Solana Wallet**, or enter a public address for a quote.
3. Connect **Solana Wallet** beneath the node. For quotes, select **Public Address Only (Quotes)** and Mainnet Beta; no signing credential is needed. For a swap, select **Sign Prepared Transaction**, and configure the matching key in that wallet's credential.
4. Choose the pay and receive tokens (Wrapped SOL, Circle USDC, or a custom mint).
5. Enter a readable amount such as `0.1`. Decimal precision is loaded using [Solana getTokenSupply](https://solana.com/docs/rpc/http/gettokensupply). Conversion uses integer arithmetic and rejects excess precision rather than rounding. Advanced users may select smallest units instead.
6. Choose the permitted price movement in percent. An optional minimum received amount adds an absolute output floor using the selected units. With no extra floor, the route's slippage protection still applies.
7. Execute a quote to preview only. Selecting **Swap Tokens with Solana Wallet** and executing requests a fresh quote, simulates, signs and submits; it does not trade a previous quote. A submission signature is not a confirmed outcome. Check transaction status separately.

The USDC preset uses the [issuer-listed Solana mint](https://developers.circle.com/stablecoins/usdc-contract-addresses). Wrapped SOL is labeled explicitly; token selection does not assert that a wallet already holds sufficient tokens or funds for fees.

Versions 1–1.2 preserve their original atomic-unit fields. Version 1.3 uses the guided trade form. Technical request settings remain behind **Show Advanced Settings**, below the essential fields.
