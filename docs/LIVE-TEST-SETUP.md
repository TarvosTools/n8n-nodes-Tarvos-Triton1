# Exact live-test setup

Updated 13 October 2026. No secrets should be sent in chat. Configure them locally; report credential **names**, public addresses and which services are enabled.

## Current scope: Devnet only

The user explicitly excluded Mainnet Beta. The mainnet instructions below are future reference, not current setup requests. Existing Devnet RPC/token and wallet are configured and funded; do not request them again.

Live checks now pass for Whirligig slots/accounts, Dragon's Mouth gRPC slots, DAS getAssetsByOwner, and standard unsigned transaction simulation. A real n8n manual monitor emitted four confirmed clock-account updates (execution 10). Titan GetInfo through the Devnet endpoint failed with TITAN_CONNECTION; this does not diagnose whether Devnet Titan is unsupported, disabled or temporarily unavailable. The node currently requires Mainnet for quotes/swaps. Do not bypass that guard without a documented Devnet routing deployment. Valid-fixture simulateBundle returned HTTP/RPC 503 while ordinary simulation succeeded.

### Access still needed within Devnet scope

- **Titan:** Ask Triton whether a Devnet/sandbox Titan deployment exists with routable test-token liquidity. If it does, obtain its documented endpoint/authentication, supported router version/program ID, and test mint/pool fixtures. Ordinary Devnet SOL alone does not establish a routable swap. If no sandbox exists, live Titan quote/swap acceptance remains blocked; offline protocol, amount enforcement and rejection tests remain available.
- **Bundle simulation:** Ask Triton to confirm/enable simulateBundle on a Devnet endpoint; the current endpoint returned 503 for a valid unsigned fixture. Save any assigned endpoint/token in a separate Triton One Solana API credential, Expected Network = Devnet.
- **Specialized streams:** For each desired Riptide, Vixen, Deshred, Harmonic, BAM or Fumarole feed, ask whether Devnet is available and obtain the service endpoint, token entitlement, supported filters/regions/parser IDs and (for Fumarole) retention/replay contract. Save provided gRPC endpoints as Triton Stream API credentials with Network Label = Devnet. No extra token is needed for the already-tested Dragon's Mouth feed on the existing endpoint.
- **Cascade/Shield:** Obtain confirmation of Devnet delivery support and, for policy tests, an existing test policy address. Standard Devnet submission does not validate Cascade or Shield enforcement.
- **Administration:** A separate read-capable customer-management API token (Triton Management API credential), plus account/subscription UUIDs. RPC tokens do not replace it. No management mutation is needed.
- **Account Sync / worker:** The existing Devnet RPC and working gRPC endpoint are enough to start this integration's source setup. Worker bearer credentials can be generated locally; no wallet key or new provider secret is needed. Full durable replay and deployment acceptance remain separate tests, not proven by direct-stream smoke tests.

No private key, seed phrase, additional funding or Mainnet credential is requested for these read-only access checks.

## Minimum setup for RPC, quotes and swap simulation

1. Create/activate a Solana subscription in the [Triton customer portal](https://customers.triton.one/onboarding). Get a backend token and clean mainnet HTTPS endpoint. See [Triton onboarding](https://docs.triton.one/getting-started). Titan is included for active Solana subscriptions per [Triton's Titan documentation](https://docs.triton.one/trading-apis/titan-swap-api); confirm your endpoint accepts its V2 instruction response.
2. In local n8n, create credential **type** `Triton One Solana API`, suggested **name** `Triton Mainnet Test`. Fill **RPC Endpoint** with the assigned clean `https://...rpcpool.com/` URL, **API Token** with the backend token, **Expected Network** = Mainnet Beta. Use the credential test. Keep tokens out of endpoint paths and workflow fields; the package constructs protocol authentication internally.
3. Create a dedicated disposable mainnet test wallet in your own wallet tooling. For initial quotes and positive simulation, configure only its public address in **Solana Wallet**, Network = Mainnet Beta, signing mode = public-address/read-only. Connect it below Triton. No private-key credential is needed for quotes or the CLI simulation runner.
4. The wallet needs enough input tokens and native SOL for a successful real quote/simulation. Suggested fixture: SOL to USDC, **0.001 SOL input**. Budget the input, up to 0.0001 SOL network fee and rent for up to two standard token accounts. Keep only a small test balance; depositing funds is your action. Exact rent and route must be checked at test time. The receiver should be the same wallet's ATA.
5. For the CLI harness, copy `test/live.config.example.json` to ignored `test/live.config.json`. Set `triton.endpoint`, keep `triton.tokenEnv` as `TRITON_TEST_TOKEN`, and set that environment variable locally. Set `quotePublicAddress` and `swapSimulation.walletPublicAddress` to the test wallet public address. The template sets SOL/USDC and 1,000,000 input lamports (0.001 SOL). Set `minimumOutputAtomic` to your desired USDC floor in millionths; the placeholder `1` is not a meaningful user price floor. Slippage checks still apply independently.

Run from the source checkout:

```powershell
npm run test:provider
npm run test:titan-simulation
```

The latter gets a fresh route, validates the actual V2 instruction, builds it and calls simulation with **no signing and no broadcast**. It cannot submit transactions. A route rejection identifies a compatibility/safety gap to resolve; it is not permission to bypass the validator.

The CLI uses environment credentials and is separate from n8n's encrypted credential store. Configuring one does not configure the other.

## Devnet transaction setup

For the CLI test, Triton access is optional: the runner uses public Solana devnet. The previous faucet request failed. Supply a dedicated devnet Solana CLI JSON keypair file outside the repository, fund its public address with **at least 0.002 devnet SOL**, then set `DEVNET_TEST_KEYPAIR_FILE` to that file's absolute path and run `npm run test:devnet`. It sends one 0.001 devnet SOL transfer, with a 10,000-lamport fee ceiling, and records the signature before sending. Use free devnet coins only. The file must contain the 64-byte JSON keypair array; do not paste it into chat.

To validate the same path inside n8n, obtain a Triton devnet endpoint/token and create `Triton Devnet Test` (type `Triton One Solana API`, Expected Network = Devnet). Create `Solana Devnet Test` (type `Solana Wallet API`, Secret Key = the dedicated devnet JSON array). Set the connector Public Address to its matching address, Network = Devnet, Mode = signing, and select that credential. Triton endpoints are needed for production-node UI testing; the public CLI adapter deliberately does not weaken production credential restrictions.

## Access for the remaining services

Ask Triton to confirm the following against your subscription. Do not assume one endpoint/token has every entitlement. Known fixture addresses can be selected from public chain data once access works.

| Test group | What to obtain/configure |
| --- | --- |
| RPC/history/indexes/DAS | Mainnet endpoint with archive, required custom indexes and DAS access. Fixtures: a wallet with history, standard SPL mint/token account, Token-2022 mint for reads, NFT and compressed asset IDs, creator/authority addresses and a small block range. No wallet key needed. |
| Whirligig | Confirm enhanced WebSocket availability on the RPC endpoint and supported subscriptions. Reuse RPC credential where supported. |
| Dragon's Mouth / Riptide | gRPC endpoint and x-token. Create type `Triton Stream API`, name per service, endpoint/token/network. Riptide shared mainnet endpoint is `https://riptide.rpcpool.com:443`; use a shared-subscription token, not a dedicated-node-only token. [Riptide reference](https://docs.triton.one/project-yellowstone/riptide). |
| Vixen / deshred / Harmonic / BAM | Service-specific TLS endpoints, tokens, supported parser/region/feed options, entitlement and a narrow known account/program filter. Use separate named stream credentials. |
| Fumarole | Approved regional endpoint/token, known retention window, bounded starting slot and permission for an isolated test consumer group. The current worker uses a fixed replay boundary; credentials do not solve its SDK checkpoint limitation. |
| Account Sync | RPC endpoint plus compatible gRPC endpoint/token and a small list of account addresses. Configure the optional worker's `accountSync` block. |
| Cascade / Shield | Confirm delivery access; if testing policies, provide an existing valid policy public address. Do not invent one. Delivery tests spend devnet or separately approved capped mainnet funds. |
| Bundle simulation | Endpoint supporting `simulateBundle`, and valid prepared transaction fixtures. Simulation does not require broadcasting a bundle. |
| Administration | A separate account-management token with permissions for the implemented read endpoints. In n8n use type `Triton Management API`, name `Triton Management Test`. This is not the RPC token. |
| Optional worker | Start locally per `worker/README.md`, configure only test sources and persistent SQLite path; generate a random worker bearer token of at least 32 characters. In n8n create type `Triton Worker API`, name `Triton Worker Test`, endpoint `http://127.0.0.1:5690/` when both run on this host. Remote access requires HTTPS. |

All-service acceptance follows [TEST-MATRIX.md](TEST-MATRIX.md). The provider CLI currently covers RPC/Titan smoke tests, not every service in this table. Further service-specific tests can be completed once their endpoints and fixtures are known.

## Only before an actual mainnet swap

After successful positive simulation, configure a dedicated `Solana Mainnet Test` signing credential if desired. Do not enable a workflow schedule or automatic retries. Review the exact input token/amount, destination wallet, minimum received, slippage, network fee/rent budget and route. A funded mainnet test still requires your separate approval of those concrete caps. None of the CLI test commands broadcasts on mainnet.

## What is still needed from you

- Confirm the local credential names above, test wallet public addresses, and enabled Triton services. Never send secrets here.
- Fund the dedicated devnet wallet with free test coins; for positive mainnet simulation, provision the small mainnet fixture balance yourself.
- Get Docker Desktop's engine working on this host. Startup currently times out. This blocks actual container, Linux and n8n queue-stack checks; a working Linux Docker host would also work. Queue tests additionally need isolated Redis/Postgres services, which can be provisioned locally once Docker runs.
- For production-level evaluation, specify intended event rate, allowed lag and concurrent workflows; the current 5,000-event SQLite test is not a production streaming benchmark.
- Full newer Titan route support needs an official V3 schema/validation contract and representative fixtures. The implemented policy intentionally accepts only the pinned V2 standard-SPL layout. Indefinite Fumarole recovery needs an upstream SDK checkpoint/commit capability. Neither can be solved merely by adding keys.

Moderate runtime dependency advisories also remain in the Solana SDK chains. Resolving these requires compatible dependency changes and regression checks, not additional credentials. No high/critical runtime advisories were reported in this audit.
