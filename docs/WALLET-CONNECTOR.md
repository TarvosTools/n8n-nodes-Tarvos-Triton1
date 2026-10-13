# Wallet connector architecture

The user's requested interaction is a bottom Wallet attachment connected by a dashed line to a compact wallet node. Public Address and wallet credentials live in that node, while the RPC credential and serialized transaction live in Triton.

## n8n compatibility decision

n8n 2.32.6 has no native Wallet connection type. This package uses the existing `ai_tool` connection transport and `supplyData()` lifecycle, with **Wallet** as the displayed label and filters on both ends restricting node selection. It supplies a private, typed wallet capability; it does not supply an AI model, invoke an LLM, implement a LangChain tool or enable automatic agent-tool wrapping.

The main node checks the immediate attached node type and requires exactly one wallet. A runtime smoke test uses the actual n8n `ExecuteContext.getInputConnectionData()` implementation, not just a mock, to verify that the capability reaches Triton and public-address expressions resolve for each input item. Saved workflow connections use `ai_tool` at index 0. This is a compatibility adapter to an existing n8n API, not a claim that n8n has a native wallet standard. Re-run the smoke test when upgrading n8n.

## Credential boundary

Only the wallet sub-node retrieves `tarvosSolanaWalletApi`. The secret stays inside its execution-scoped signing closure. Normal n8n item JSON contains neither private keys nor signer objects. The parent receives only the signed bytes and public transaction identity. The already-signed mode retrieves no secret credential. Wallet nodes do not have an independent Execute action.

The credential accepts a validated 64-byte Solana keypair JSON array. Its derived public key must match the node's Public Address. n8n encrypts stored credentials; users with workflow/credential execution privileges can still authorize use of those keys. Use appropriate test or limited-purpose wallets, and keep workflow permissions narrow.

## Transaction checks

Legacy and v0 transactions are decoded with the pinned Solana SDK. Existing signatures are verified with Ed25519 before modification. Only a missing selected-wallet signature is added; other signatures and message bytes are preserved. All required signatures must then verify. Unknown formats, trailing/noncanonical bytes, wrong wallets/networks, missing cosignatures, invalid lookup tables, durable nonce instructions and invalid recent blockhashes are rejected.

Lookup table accounts and blockhash validity are read from the selected Triton network before signing. No SDK network client is used. Solana transactions do not have a universal embedded chain identifier; the expected network is enforced against the RPC genesis hash and wallet configuration.

## Delivery semantics

Preflight stays enabled. `maxRetries` controls the RPC's own rebroadcast count (default 0, maximum 5). It is not permission to rebuild a transaction. Transport ambiguity returns `SUBMISSION_OUTCOME_UNKNOWN` with the signature and stops subsequent inputs. In continuation mode a paired error item is returned before stopping.

Use status/history reads to reconcile. Accepted, confirmed, finalized, execution failure, expired and unknown are different states. Missing status is not proof a transaction was never accepted. Never rebuild or resend automatically merely because a timeout occurred. This package provides no cross-workflow exactly-once guarantee.
