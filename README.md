# Tarvos Triton 1 for n8n

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="nodes/TarvosTritonOne/tarvosMark.dark.svg">
  <img alt="TARVOS" src="nodes/TarvosTritonOne/tarvosMark.light.svg" width="96">
</picture>

Read Solana data, monitor on-chain activity and connect a dedicated **Solana Wallet** for transaction submission through Triton One. Use dropdowns and fields for ordinary workflows, with advanced settings and supported JSON options available when needed.

**77 actions · 8 stream services · Separate wallet connector · Optional durable worker**

Version **0.2.0** is an evaluation package, **not yet published to npm or verified for n8n Cloud**. The GitHub repository is `n8n-nodes-Tarvos-Triton1`; the npm identifier remains `n8n-nodes-tarvos-triton-one` to preserve existing workflow node types. This is a Tarvos community integration, not an official Triton or Solana product.

## Documentation

| Guide | What you will learn |
| --- | --- |
| [Getting started](docs/GETTING-STARTED.md) | Installation, first balance query and template import |
| [Solana beginner guide](docs/SOLANA-BEGINNER-GUIDE.md) | Wallets, mints, token accounts, units and confirmation |
| [Credentials and access](docs/CREDENTIALS.md) | Find endpoints/tokens and configure wallets, streams and workers |
| [Workflow cookbook](docs/WORKFLOW-COOKBOOK.md) | Balance, activity, token, monitoring and transaction workflows |
| [Service guide](docs/SERVICES.md) | Every implemented service group and its limits |
| [RPC reference](docs/TRITON-ONE-GUIDE.md) | Request shapes, pagination, exact numbers and output |
| [Monitoring guide](docs/MONITORING.md) | Direct triggers, durable workers, gaps and duplicates |
| [Wallet connector](docs/WALLET-CONNECTOR.md) | Public-address, already-signed and signing modes |
| [Swap enforcement](docs/SWAP-SAFETY.md) | Checks before signing and remaining trust boundaries |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Greyed choices, credentials, missing indexes and pending transactions |
| [Devnet acceptance](docs/DEVNET-ACCEPTANCE.md) | Live-tested behavior and remaining gaps |
| [Developer testing](docs/DEVELOPER-TESTING.md) | Offline/runtime checks and opt-in live tests |
| [Worker deployment](worker/README.md) | Durable inbox, acknowledgements and Account Sync |
| [Release guide](docs/RELEASING.md) | Package checks and eventual npm publication |

## Three nodes

| Node | Purpose | Signing key required? |
| --- | --- | --- |
| **Tarvos Triton 1** | Read data, query services, simulate, submit and confirm transactions | Only signing operations, through the wallet |
| **Tarvos Triton 1 Trigger** | Start workflows from filtered stream events | No |
| **Solana Wallet** | Supply an address, validate signatures or sign supported transactions | Only in signing mode |

```text
Manual / Schedule Trigger → Tarvos Triton 1 → IF / storage / next step
                                  ⋮ Wallet
                             Solana Wallet
                        Public Address + credential

Tarvos Triton 1 Trigger → filter → store → your notification step
Optional worker → Get Events → process successfully → Acknowledge Events
```

Wallet keys belong in n8n credentials attached to **Solana Wallet**, not ordinary node parameters. Reads and monitoring need no wallet key. The optional worker never receives signing keys.

## Installation

Requires **Node.js 22.22+** and self-hosted n8n. Runtime acceptance used **n8n 2.32.6 on Windows**. Other versions and deployments need their own validation.

### Local development

Use **Node.js 24.11.0 and npm 11.6.1** for source development and CI. The runtime minimum above does not cover all development dependencies. Run `npm install --global npm@11.6.1` if your development machine uses a different npm version.

```sh
git clone https://github.com/TarvosTools/n8n-nodes-Tarvos-Triton1.git
cd n8n-nodes-Tarvos-Triton1
npm ci
npm run build
npm run dev
```

Open the editor URL printed by the tooling. Search for **Tarvos Triton 1**, **Tarvos Triton 1 Trigger**, or **Solana Wallet**.

### Existing self-hosted instance

Build a tarball with `npm run build` followed by `npm pack`. Install it in your instance's community-node environment, normally `~/.n8n/nodes`:

```sh
cd ~/.n8n/nodes
npm install /absolute/path/to/n8n-nodes-tarvos-triton-one-0.2.0.tgz
```

Use your actual n8n user folder, persist it in containers, and restart n8n and all execution workers. Replace an older development link instead of loading two copies. See [Getting started](docs/GETTING-STARTED.md).

After a future npm release, supported self-hosted users can install by name through **Settings → Community nodes**. Repository availability is not npm publication; npm publication is not n8n Cloud verification.

## First workflow: read a SOL balance

1. Add **Manual Trigger → Tarvos Triton 1**.
2. Create a **Triton One Solana API** credential with your clean RPC endpoint, separate token and matching network. Use **Devnet** for Devnet tests.
3. Select **SOL Balances & Accounts → Get Balance**.
4. Enter a public address and execute.
5. Use `data.sol` for display and `data.lamports` for exact arithmetic.

Synthetic output, with metadata abbreviated:

```json
{
  "data": { "lamports": "1500000000", "sol": "1.5" },
  "meta": { "method": "getBalance", "network": "devnet" }
}
```

Use `{{ $json.data.sol }}` downstream. Parameters resolve per input item. Preserve exact integer strings; converting large amounts to JavaScript numbers can lose precision.

## Credentials

In the Triton dashboard, open the intended **Solana Devnet/Mainnet subscription**, then its **RPC / gRPC Tokens** entry. **Value (x-token)** is the token. The assigned hostname appears separately under **Endpoints**.

| Field | What to enter |
| --- | --- |
| RPC Endpoint | Clean URL such as `https://your-endpoint.devnet.rpcpool.com/`; replace the illustrative hostname |
| API Token | Subscription token, stored only in the credential |
| Expected Network | Subscription network; RPC calls verify the genesis hash |

Do not paste a token-bearing connection string into RPC Endpoint. The credential expects a clean HTTPS `rpcpool.com` endpoint and separate token. Management and worker credentials are different. A successful credential test does not establish every service entitlement. [Full setup](docs/CREDENTIALS.md).

## Services and use cases

| Group | Use it for | Availability |
| --- | --- | --- |
| SOL Balances & Accounts | Balances, account data, multi-account reads, program scans, rent | Scans may need indexes |
| Token Balances & Supply | Mint supply and owner/delegate/token-account queries | Indexed methods depend on endpoint |
| Transactions & History | Signatures, inspection, simulation, submission, confirmation | Enhanced history is a separate capability |
| Network / Blocks / Fees | Health, leaders, votes, supply, blocks and fee samples | Fee estimates do not guarantee inclusion |
| NFTs & Digital Assets | DAS metadata, ownership, search, proofs, editions, signatures | Requires indexed data and valid fixtures |
| Swap Quotes & Swaps | Titan info, venues/providers, quotes, wallet-connected swaps | Mainnet and Titan access; not live swap-validated |
| Export History | Bounded history pages and block batches | Continuation metadata; history requires its method |
| Account Management | Read subscriptions, endpoints, tokens and watchlists | Separate token; no provisioning/deletion |
| Self-Hosted Worker | Health, synced accounts, durable events, acknowledgements | Optional process with separate license |

See the [generated operation contract](docs/operation-contract.json) for exact identifiers and fields, and the [service guide](docs/SERVICES.md) for protocol details.

### Greyed-out choices

Confirmed missing methods are greyed out for the selected credential with an explanation. Results are cached for up to one minute. Change endpoints or refresh options after provider enablement. Unknown access, missing indexes, timeouts and temporary server errors do not disable entire services.

Titan is greyed out for Devnet because the implemented flow requires Mainnet; this does not mean Titan itself is broken. Existing workflows and expressions still receive runtime validation. Dropdown availability is a usability aid, not a security boundary.

### Monitoring

Start with **Quick Setup** in the trigger: choose a goal and an address. It selects Whirligig and bounded batching. Wallet activity means logs mentioning the address, not complete transfer history.

Advanced choices are **Whirligig, Dragon's Mouth, Riptide, Vixen, Titan, Deshred, Harmonic and BAM**. Direct triggers are best-effort: reconnecting does not replay missed events. For durable ingestion use the worker, then acknowledge only after processing succeeds. [Monitoring guide](docs/MONITORING.md).

### Quotes, swaps and transactions

A quote is a preview. Select pay/receive tokens, enter a readable amount and choose slippage. Quotes can use a public address or the wallet's Public Address Only mode.

Executing **Swap Tokens with Solana Wallet** requests a fresh quote and can sign and submit; it does not execute a previously displayed quote. Signing supports bounded ExactIn V0 instruction routes. The node validates actual Titan V2 input/minimum-output bytes and wallet bindings, simulates, checks expiry and refuses unsupported routes. Version 1 read support does not add version 1 wallet signing.

Standard submission can validate already-signed transactions. Cascade and existing Shield policy addresses are separate options. Shield policy creation and Jito Block Engine bundle submission are excluded. Use **Confirm** afterward: acceptance is not finality. Reconcile ambiguous sends before retrying. [Wallet guide](docs/WALLET-CONNECTOR.md) · [Swap policy](docs/SWAP-SAFETY.md).

## Ready-to-import templates

Examples are inactive and contain no API tokens or signing keys. Map your own credentials and fill in blank wallet/address/signature inputs after import. Transaction examples can send when deliberately configured and executed.

| Template | Result |
| --- | --- |
| [SOL balance](examples/basic/01-wallet-balance.json) | Exact lamports and readable SOL |
| [Wallet activity](examples/basic/02-wallet-activity.json) | Recent signatures using standard RPC |
| [Token supply](examples/basic/03-token-supply.json) | Mint supply and decimals |
| [Inspect transaction](examples/basic/04-verify-transaction.json) | Metadata and outcome |
| [Devnet SOL transfer](examples/basic/05-send-devnet-sol.json) | Explicit transfer using your funded test wallet |
| [Account monitoring](examples/monitoring/devnet-live-account.json) | Bounded account events |
| [Worker account/events](examples/monitoring/devnet-worker.json) | Status, account and durable inbox flow |
| [Titan quote](examples/08-titan-quote.json) | Mainnet quote starter |
| [Titan wallet swap](examples/09-titan-wallet-swap.json) | Transaction-capable starter needing deliberate setup |

The [cookbook](docs/WORKFLOW-COOKBOOK.md) explains these patterns. Additional fee, DAS, Vixen and guided-quote templates are in [examples](examples/).

## Testing and limits

Local validation passed **150 node tests and 11 worker tests**, build, typecheck, lint, local gRPC, a 5,000-event worker check and actual n8n execution-context checks. Authenticated Devnet reads passed **39/45** checks: three methods unsupported, two delegate queries lacking indexes, one mint-filter delegate query timed out. A block-export bug was fixed and retested.

Earlier live tests verified Devnet wallet submission, Whirligig monitoring, Dragon slot events, worker acknowledgement/restart and Account Sync RPC fallback. Dedicated Account Sync push returned HTTP 501. Live Titan quotes/swaps, specialized feeds, Cascade/Shield delivery, management and some asset fixtures remain unverified. Docker/Linux/queue deployment and production throughput are separate gates. [Current evidence](docs/DEVNET-ACCEPTANCE.md) · [Historical validation](docs/VALIDATION.md).

```sh
npm ci
npm ci --prefix worker --ignore-scripts
npm run test:setup-runtime
npm run test:offline
npm pack --dry-run
```

Offline tests use synthetic inputs and local transports. Live runners are opt-in: review [testing](docs/DEVELOPER-TESTING.md) and [access requirements](docs/LIVE-TEST-SETUP.md). Never commit credentials.

## Security, contributions and licensing

Use n8n credentials for tokens/keys and secret storage for worker tokens. Persist event receipts and transaction signatures for reconciliation. See [Security](SECURITY.md), [Contributing](CONTRIBUTING.md) and [Development](docs/DEVELOPMENT.md).

The n8n integration is **MIT** ([LICENSE](LICENSE)). The separately operated optional worker is **AGPL-3.0-only** ([worker/LICENSE](worker/LICENSE)). Protocol and SDK notices retain their own terms.

## Official resources

[Triton Solana docs](https://docs.triton.one/chains/solana) · [Triton](https://triton.one/) · [Solana docs](https://solana.com/docs) · [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/) · [Tarvos](https://tarvos.tools)
