# Developer testing

Run these commands from the **source checkout**, using Node 22.22+ (Node 24 also tested). The published node archive is not a source checkout. No Triton account or n8n credentials are needed for offline tests or public smoke tests.

## 1. Install once

```powershell
npm ci --ignore-scripts
npm --prefix worker ci --ignore-scripts
npm run test:setup-runtime
npm run test:offline
```

The last command builds the package, regenerates 13 inactive examples, typechecks, lints, runs node tests, local gRPC tests, worker tests including killed-process recovery, and real n8n execution-context tests. `test:setup-runtime` installs pinned n8n 2.32.6 into ignored `.test-runtime`. Alternatively set `N8N_TEST_RUNTIME` to an existing compatible runtime's `node_modules` directory. Local HTTP/gRPC ports must be allowed. The runtime test does not alter your workflows or saved credentials.

Results are in `test-results/offline.json`. Missing runtime is BLOCKED, never a successful skip. CI includes the runtime check on Windows and Linux; a configured CI job is not evidence of a completed remote run.

## 2. Public read-only smoke tests

```powershell
npm run test:public
```

Uses official Solana devnet to check network identity, version, health, slots, block height, epoch, blockhash, account reads and exact balance serialization. The actual compiled node executes through a test context. A test-only transport adapter maps requests to the fixed public endpoint and strips authentication. Production endpoint validation and credential requirements remain unchanged. This does not prove Triton-specific acceptance or full editor execution.

## 3. Devnet transaction

```powershell
npm run test:devnet
```

Checks genesis, creates an in-memory disposable key, requests 0.05 free devnet SOL once, caps the fee at 10,000 lamports, signs through the wallet capability, simulates, and sends exactly one 0.001 devnet SOL transfer. It verifies confirmation and recipient balance. No key is printed or saved. Unused faucet coins remain in the disposable wallet.

If the faucet rejects funding, the transaction is blocked. There is no retry loop for faucet errors. For developers who already have a dedicated funded devnet wallet, set `DEVNET_TEST_KEYPAIR_FILE` to its local Solana CLI JSON keypair file before running. This bypasses the faucet and requires at least 0.002 devnet SOL. Keep that file outside the repository and never use a mainnet wallet. The runner only reads this file; it never copies it into reports or n8n.

The intended transaction signature is persisted **before** the one submission attempt. If confirmation is uncertain, reconcile that signature before running another test. Timestamped reports preserve evidence across runs. Do not interpret a timeout as a failed on-chain transaction.

## 4. Mainnet simulation only

```powershell
npm run test:simulation
```

This verifies mainnet identity and the real node's simulation path using an unfunded ephemeral payer. The expected rejection is a negative test, not a successful swap simulation. The test transport rejects every mainnet broadcast. For positive simulation, configure `swapSimulation` and provider access, then run `npm run test:titan-simulation`. It uses a public wallet with sufficient relevant balances, validates the V2 instruction and never signs or broadcasts. See [exact setup](LIVE-TEST-SETUP.md).

## 5. Triton provider access

Copy `test/live.config.example.json` to ignored `test/live.config.json`. Set a clean assigned RPC endpoint and the **name** of an environment variable containing your Triton token. Set that environment variable locally using your credential tooling; never put a token into JSON, chat, workflow exports or source control. `quotePublicAddress` is a public address only.

```powershell
npm run test:provider
```

Checks provider genesis, account balance, Titan information/venues/providers and an optional quote. Without credentials it returns BLOCKED with setup instructions. Service entitlements, DAS fixtures, streaming lifecycle/reconnect tests, Cascade, bundles, administration and worker-backed service acceptance must still be completed using [the full matrix](TEST-MATRIX.md). The current live runner is a bounded smoke suite, not a claim that all 77 actions have been live-tested. Offline fixtures cover broader behavior without provider access.

## Reading results and release gates

Each live run writes `test-results/<suite>.json` plus a timestamped copy. PASS means that assertion ran successfully. BLOCKED means a prerequisite or external dependency prevented verification. FAIL means a test or unexpected call failed. Script exit codes are 0, 2 and 1 respectively; some npm/PowerShell wrappers normalize nonzero codes, so use report statuses as authoritative.

Do not repeatedly retry HTTP 429 responses. Stop the run and honor provider cooldown across clients sharing the egress IP. This runner stops public tests at the first failure; it is not an IP-wide production rate-limit coordinator.

A funded mainnet swap is intentionally absent from these commands. Before a separately approved capped test, establish a fresh route, wallet, exact spend and fee caps, slippage, simulation evidence, and an independent transaction-level economic check. The node now validates actual Titan V2 amount/minimum-output bytes and wallet account bindings before signing, and rejects unsupported layouts. See [swap safety](SWAP-SAFETY.md) for the supported subset and remaining trust boundaries. Positive live route compatibility remains a funded-release gate.

Queue-mode execution, sustained load, Docker deployment, remote Linux CI, provider retention/replay behavior and authenticated service acceptance remain separate gates. See [validation evidence](VALIDATION.md).

Sources: [Solana clusters and public RPC limits](https://solana.com/docs/references/clusters), [requestAirdrop](https://solana.com/docs/rpc/http/requestairdrop), [simulateTransaction](https://solana.com/docs/rpc/http/simulatetransaction).

The offline runner also executes a 5,000-event SQLite capacity/two-consumer correctness check (`npm run test:worker-load`). It reports timings and sampled RSS, without asserting production streaming capacity.
