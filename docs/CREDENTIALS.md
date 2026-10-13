# Credentials and access

[Back to README](../README.md) · [First workflow](GETTING-STARTED.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Choose the credential for the job

| Credential | Where it is used | What it contains |
| --- | --- | --- |
| Triton One Solana API | Main RPC/DAS/Titan actions and Whirligig/Titan triggers | RPC endpoint, API token, expected network |
| Solana wallet credential | Solana Wallet in signing mode | JSON secret-key array |
| Triton Stream API | Yellowstone/gRPC and specialized triggers | Stream endpoint, API token, network label |
| Triton Management API | Account Management actions | Management API token |
| Triton Worker API | Self-Hosted Worker actions | Your worker URL and worker authentication token |

Do not interchange a wallet key and a Triton API token. A public address identifies a wallet; it cannot sign. A worker token authenticates your own worker, not Triton.

## Find your Triton RPC endpoint and token

1. Sign in to Triton's dashboard.
2. Open the organization and the intended **Solana Devnet** or **Solana Mainnet** subscription.
3. Under **RPC / gRPC Tokens**, open the active token entry. Copy **Value (x-token)** into n8n's credential **API Token** field.
4. Under **Endpoints**, find the assigned hostname. In **RPC Endpoint**, enter `https://` followed by that hostname and `/`.
5. Set **Expected Network** to the same network and save/test the credential.

Illustrative configuration:

```text
RPC Endpoint:     https://your-assigned-host.devnet.rpcpool.com/
API Token:        [paste the token only in the masked credential field]
Expected Network: Devnet
```

These are placeholders, not working credentials. If the dashboard offers a full connection string with a token in the path, separate it into the hostname and token fields. The integration deliberately rejects token paths, query strings, redirects and arbitrary domains for its RPC credential. No public-RPC fallback is used by the installed node.

Credential testing checks basic RPC access and network identity. DAS indexing, enhanced history, Titan, dedicated stream methods and management roles need their own access. One successful credential test cannot validate them all.

## Wallet setup

Connect **Solana Wallet** to the Wallet connector below a supported submission or swap action. Set its public address and network first.

- **Public Address Only:** quotes and identity; no signing key required.
- **Validate Already-Signed Transaction:** provide a transaction signed elsewhere; the configured public address must be a required signer. The node validates signatures and policy without storing a signing key.
- **Signing mode:** create the wallet credential in the wallet node and enter the expected JSON keypair array. Its derived address must match the configured public address. Unsupported formats and mismatches are rejected.

Use a dedicated, minimally funded test wallet. Devnet SOL has no Mainnet spending power. Create/fund your own wallet; demonstration addresses in examples are not deposit instructions. Never put keys in a Set/Code node, expression, workflow JSON, pinned data, source file or issue report. See [wallet architecture](WALLET-CONNECTOR.md).

## Stream credentials

Use the exact service endpoint assigned by Triton. An ordinary Dragon's Mouth endpoint does not establish Account Sync, Deshred, Harmonic, BAM, Vixen or Riptide access. The stream network field is a label; gRPC alone does not prove genesis identity. Narrow subscriptions before testing, and test each service separately.

Whirligig and Titan use the RPC credential. Mainnet is required by the current Titan implementation. Do not relabel a Devnet credential as Mainnet to bypass this restriction; action execution checks network identity.

## Management credentials

Management actions use a distinct token and a fixed provider management host. They list account/subscription/endpoint/token/watchlist records; token values are redacted. Watchlist access requires an appropriate operator/reseller role and is not wallet webhook registration. No create/delete/provisioning actions are implemented.

## Worker credentials

Run the optional worker with a random `WORKER_API_TOKEN` of at least 32 characters. Use its URL and that token in **Triton Worker API**. Local loopback HTTP is supported; remote access requires HTTPS. Inside a container, `127.0.0.1` means that container, not the host or another container.

The worker's source tokens are environment variables referenced by its configuration. Wallet secrets remain in n8n. See [worker setup](../worker/README.md) for database persistence, network binding and licensing.

## Rotation and sharing

Use n8n's credential sharing and encrypted storage. Back up the n8n encryption key using your deployment's secret-management process. Rotate exposed provider tokens at the provider and update the credential; restart active subscriptions so they reconnect using the new token. Share sanitized errors and operation names when reporting problems, never full connection strings or exported credentials.
