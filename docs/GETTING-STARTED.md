> Version 0.2.0 adds Titan, native triggers and an optional worker. See [SERVICES.md](SERVICES.md) and the updated [README](../README.md). The original RPC examples below remain supported.

# Getting started

## Install the package

The npm package has not been published yet. Clone this repository and run `npm ci` then `npm run build`. Use `npm run dev` for an isolated development editor, or `npm pack` to build a tarball for an existing self-hosted instance. See [README installation](../README.md#installation).

Install the tarball in the community-node environment for the user that actually runs n8n. In containers, persist that directory and install the same package in every execution worker. Restart n8n after installation. Node.js 22.22+ is required; local runtime acceptance used n8n 2.32.6. Do not load both a development symlink and a second installed copy.

## Configure your first credential

Follow [Credentials and access](CREDENTIALS.md) to find your endpoint and token in Triton's subscription dashboard. RPC Endpoint is the clean HTTPS hostname with a trailing slash. API Token is the separate token. Expected Network must match. Use Devnet for initial tests.

Never paste a connection string containing a token into a public field. A successful credential test proves basic RPC connectivity and network identity, not access to every specialized service.

## Import and run a template

Import an example JSON through n8n's workflow menu, or paste its JSON onto a blank canvas. Map your own credentials after import. Examples remain inactive until you deliberately configure and run them.

For the easiest first workflow, import [Check SOL balance](../examples/basic/01-wallet-balance.json), open **Your Inputs**, set your public address, choose your Devnet credential in **Read from Triton**, and execute. A public address is sufficient; no wallet signing key is needed. Inspect `data.sol`, `data.lamports` and the returned network/context.

For expressions, use `{{ $json.walletAddress }}` with an input item containing that field. The expression preview should be exactly one address, without extra braces. See the [cookbook](WORKFLOW-COOKBOOK.md) for the other templates.

## Choose a service

The main node asks what to work with and what to do. Read the service explanation before selecting an action. Essential inputs remain visible; **Show Advanced Settings** reveals request tuning. Fields mode covers common requests, while JSON mode supports the documented advanced shapes. Switching modes does not convert one mode's saved settings into the other.

Greyed-out methods are confirmed unavailable for the selected credential; Titan requires Mainnet. Temporary errors and unknown access do not disable options. [Troubleshooting](TROUBLESHOOTING.md) explains how to refresh capability checks and distinguish index errors from missing methods.

## Next workflows

Start with `01-connection-and-balance.json`. Credential testing uses version and genesis reads; each action checks network identity before its requested operation. A credential test does not establish enhanced-history or DAS entitlement.

For monitoring, replace Manual Trigger with Schedule Trigger and connect your own storage/alert destination. Persist signatures with a unique `(network, signature)` key. Commit the watermark only after successful storage, overlap retrieval windows, and reconcile later finality changes. A timer does not guarantee exactly-once delivery.

For transactions, use `07-devnet-submission-and-monitoring.json`. Set the RPC network to Devnet, configure the wallet below the submit node, and paste a prepared transaction. The signing credential is a JSON keypair, not an API token. Test with your own Devnet setup before production. The sample waits five seconds and checks status once; a pending result requires a later bounded reconciliation workflow, not a resubmit loop.

For external signatures, change the wallet mode to Validate Already-Signed Transaction. Keep its Public Address set to a required signer; no private credential is necessary. The same signature validation and network checks apply.

Do not paste secrets into transaction fields, ordinary node parameters, pinned input data, expressions, exports or chat. Create wallet credentials through n8n's credential dialog in the wallet node.
