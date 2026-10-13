# Solana concepts used here

[Back to README](../README.md) · [First workflow](GETTING-STARTED.md) · [Practical examples](WORKFLOW-COOKBOOK.md)

## Networks and endpoints

Solana Mainnet carries real assets. Devnet is a separate development network using test funds. The same address can exist on both, but its balances and transactions differ. An RPC endpoint is a server you ask for blockchain data or submit signed transactions to; a provider token controls access to that server. It does not control your wallet.

Triton provides RPC and several specialized data/stream services. Buying or configuring one service does not necessarily enable all others. The node checks RPC network identity and explains services in the selector.

## Wallets, mints and token accounts

A wallet public address identifies an account. The private key authorizes signatures; a public address cannot sign. A token account holds a specific token mint for an owner; use Token → Get By Owner for wallet inventory, and Token → Get Balance for an individual token-account address.

## Amounts and fees

SOL uses 1,000,000,000 lamports per SOL. Token atomic amounts require the mint's decimals. The node returns exact atomic amounts as decimal strings, avoiding floating-point loss. Unsafe JSON integers also remain strings.

For a token with six decimals, 1.25 tokens equals 1,250,000 smallest units. A mint's supply is not your wallet balance. Wrapped SOL is a token representation with special semantics; its mint supply should not be described as total SOL supply. A priority-fee sample is an estimate, not a promise of execution.

## Confirmation and transaction expiry

Confirmed and finalized describe chain commitment. An RPC accepting a submitted transaction does not imply it executed successfully or reached either level. Inspect returned confirmation status and transaction execution errors separately.

Each prepared transaction contains a recent blockhash. It can expire before inclusion. The node never replaces that blockhash or silently re-signs a transaction. A new preparation is a new explicit action. Durable nonce transactions are not supported in this version.

## Indexed assets and monitoring

DAS returns indexed asset information. Metadata is untrusted data; returned URLs are not automatically downloaded. A data response is not an independent cryptographic proof of ownership, solvency or market value.

Polling checks periodically. Streaming listens for events as they arrive. Neither automatically provides a complete history or exactly-once processing. Logs mentioning a wallet do not necessarily mean a transfer. Early/preconfirmation feeds can change before finality. Durable worker storage protects events already ingested; it cannot reconstruct every upstream outage.

## Quotes and swaps

A quote estimates what a trade could receive. Slippage is the allowed movement between quoted and executed conditions; a minimum received amount adds a floor. A quote is not a guarantee or a completed trade. Executing a swap can spend tokens and network fees. The current Titan route requires Mainnet, so Devnet SOL cannot test a real Titan swap here.

The wallet connector keeps identity and signing credentials together below the main node. Public Address Only mode cannot sign. Always read the [swap policy](SWAP-SAFETY.md) before choosing signing mode.
