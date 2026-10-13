# Workflow cookbook

[Back to README](../README.md) · [Credentials](CREDENTIALS.md) · [Monitoring](MONITORING.md)

Import JSON through n8n's workflow menu, map your credentials, and inspect every input before execution. Templates are inactive and contain no tokens or keys. Wallet addresses and transaction signatures start blank; supply your own. Devnet examples should remain on Devnet.

## 1. Check a wallet's SOL balance

Import [SOL balance](../examples/basic/01-wallet-balance.json). Open **Your Inputs** and set the address. Choose your RPC credential in **Read from Triton**, then run the workflow.

The main action is **SOL Balances & Accounts → Get Balance**. `data.sol` is readable SOL; `data.lamports` is exact smallest units. One SOL is 1,000,000,000 lamports. No wallet key is needed. Zero balance is valid; an error is not zero.

To make an alert, replace Manual Trigger with Schedule Trigger, add an IF condition after the read and connect your notification service. Configure that service yourself. Avoid notifying on every poll by persisting the last alert state.

## 2. Read recent wallet activity

Import [wallet activity](../examples/basic/02-wallet-activity.json). Set the public address and a small limit. The workflow uses **Transactions & History → Get Signatures**, which works independently of the optional enhanced-history method.

Inspect signature, slot, error and confirmation fields. Fetch a selected signature with **Get** when full transaction details are needed. This is not a complete accounting ledger or a guaranteed token-transfer inventory. For repeated polling, store `(network, signature)` uniquely and overlap retrieval windows. Advance your watermark after successful persistence.

## 3. Inspect a token mint

Import [token supply](../examples/basic/03-token-supply.json). Enter a **mint address**, not a user's token-account address. Supply output includes raw amount and decimals. Use raw integer strings for exact calculations; displayed amounts are for presentation.

Use **Get By Owner** to discover token accounts for a wallet, then **Get Balance** with a token-account address. Token-2022 extensions and indexed queries may have different requirements. A symbol is not a mint and is not globally unique.

## 4. Check a transaction outcome

Import [transaction inspection](../examples/basic/04-verify-transaction.json). Paste a signature from the same network as your RPC credential. A missing transaction can be pending, outside retention or from another network; it is not evidence of success.

For recent submissions, use **Confirm** and inspect both confirmation level and execution error. Confirmation can time out without proving failure. Record the signature before waiting so a resumed workflow can query it without sending again.

## 5. Watch an account

Import [live account monitor](../examples/monitoring/devnet-live-account.json). It watches a Devnet system account that changes regularly, making it useful for a bounded smoke test. Test the trigger to receive a batch, then stop.

For your workflow, select Quick Setup's account/SOL-change goal and your address. Account notifications are snapshots, not automatically a human-readable explanation of the transaction. An inactive account may emit nothing. Persist and compare values downstream; do not interpret silence as an offline service.

## 6. Process a durable inbox

Start the optional worker using [its README](../worker/README.md), configure a fixed consumer name and import [worker example](../examples/monitoring/devnet-worker.json).

1. Read **Get Status** and inspect each source, not just HTTP reachability.
2. **Get Events** returns a batch and receipt for the consumer.
3. Store/process every event idempotently.
4. Only then **Acknowledge Events** with that receipt.

Failed processing must not reach the acknowledgement node. Do not acknowledge an empty batch. Parallel workflows sharing a consumer can receive the same outstanding batch. Inspect the template's acknowledgement wiring before enabling it; adapt it to your actual durable downstream operation.

## 7. Send a small Devnet transfer

Import [Devnet transfer](../examples/basic/05-send-devnet-sol.json). Configure your own funded Devnet wallet and intended recipient. Inspect the amount and fee cap, then attach **Solana Wallet** with the matching public address, network and signing credential.

The workflow constructs a transfer, simulates/submits and checks the observed transaction. It verifies recipient balance change for that transaction, not the recipient's cumulative lifetime balance. Repeated deliberate runs send repeated transfers. Keep an external idempotency key when turning this into a business workflow.

This validates standard RPC delivery, not Titan, Cascade or Shield. No Mainnet test is implied.

## 8. Preview a Titan quote

Use [guided quote](../examples/13-guided-wallet-quote.json) or [quote starter](../examples/08-titan-quote.json). The implemented route requires a Mainnet credential with Titan access; it is greyed out for Devnet.

Choose **Get a Swap Quote (No Trade)**. Choose pay/receive tokens, readable amount and slippage percentage. Connect a public-address-only wallet or supply an address directly. A quote does not sign or submit. Decimal resolution comes from the token mint; excess precision is rejected rather than rounded.

Live Titan quotes have not been accepted with the current Devnet test setup. This template documents setup, not a working Devnet swap sandbox.

## 9. Execute a wallet-connected swap

Use [swap starter](../examples/09-titan-wallet-swap.json) only after quote access, wallet identity, balances, fees and policy have been independently verified. Select **Swap Tokens with Solana Wallet**, connect the signing wallet, set the amount/slippage and optionally a minimum output floor.

Execution requests a fresh route. The signing policy checks the actual supported instruction bytes and rejects unsupported routes. It does not independently audit every DEX program. Store the returned signature and confirm it separately. Do not configure automatic retries around a possibly submitted swap. Read [SWAP-SAFETY.md](SWAP-SAFETY.md) before funding this flow.

## 10. Export blocks or indexed history

Use **Export History → Export Blocks** with a narrow finalized slot range and a small maximum block count. Continue with returned `nextStartSlot`. Skipped slots may have no block. The operation has bounded slot/block/byte budgets; it is not a bulk data warehouse exporter.

Address-history export requires `getTransactionsForAddress`, which was unavailable on the tested Devnet endpoint. It is disabled there; use standard signature queries for basic activity. Do not discard a continuation token or pretend a bounded page is the complete history.
