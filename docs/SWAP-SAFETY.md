# Swap instruction enforcement

Implemented 13 October 2026. Applies to Titan swaps on every node version, before wallet signing. Quotes still require no private key.

## Verified format

Requests now explicitly select Titan Swap V2, transaction format **0** (V0), and zero requested service fee. Titan's current protocol specifies a numeric transaction format, not the string `V0`. See [Titan request reference](https://titan-exchange.gitbook.io/titan/developer-doc/swap-api/reference/direct/new-swap-quote-stream).

The decoder is pinned to the official [Titan V2 IDL at d4327181fffccd9b866a30c9b77552b20e4bba38](https://github.com/Titan-Pathfinder/titan-v2-cpi-example/blob/d4327181fffccd9b866a30c9b77552b20e4bba38/titan_swap.json), specifically `swap_route_v2` at program `T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT`. Its 8-byte discriminator is followed by little-endian u64 input and minimum-output amounts. The official [validation example](https://github.com/Titan-Pathfinder/titan-v2-cpi-example/blob/d4327181fffccd9b866a30c9b77552b20e4bba38/programs/titan-v2-cpi-example/src/swap.rs) independently checks the same fields. This implementation uses the published layout; it does not import the example program.

## What is enforced

- Exactly one recognized Titan swap; instruction input equals the user's exact input, without floating-point conversion.
- Instruction minimum output is at least the slippage-adjusted quote, and the quote must meet the user's optional higher minimum. Minimum output is always positive. A weaker instruction fails even when quote metadata looks correct.
- Fixed instruction accounts match the wallet, derived Titan atlas PDA, requested mints, wallet-owned associated token accounts and standard SPL Token programs. Mint account owner and layout are checked through RPC.
- Only bounded wallet ATA creation, input SOL wrapping/synchronization and native-token closure refunding that wallet are permitted outside the router. Extra transfers, approvals, account-authority changes, extra swaps and unfamiliar programs are rejected.
- At most two idempotent ATA creations, before the swap. SOL wrapping cannot exceed the exact input amount. Only standard 82-byte initialized SPL mints are accepted. Token-2022 and custom token accounts are currently rejected.
- Provider/service fee fields must be zero. Compute-budget instructions are replaced with the user's settings. RPC fee estimation must succeed and remain at or below **100,000 lamports (0.0001 SOL)**. This network-fee ceiling excludes the bounded standard ATA rent deposits.
- The final serialized transaction is still limited to 1,232 bytes, checked for valid lookup tables/blockhash, signed only through Solana Wallet, simulated with signature verification, and submitted once. Expiry is rechecked before sending.

There is no permissive fallback. V1/V3 router instructions, arbitrary aggregator instructions, fee-bearing variants, unfamiliar setup instructions or Token-2022 routes stop before signing with `SWAP_POLICY`. Live testing may reveal additional legitimate formats; each needs an explicit validator and adversarial tests before enabling it. The node does not silently loosen safety to accept a route.

## Evidence and limits

Offline tests mutate instruction input/minimum, wallet/mint/recipient accounts, signers, versions, fee fields, side effects and SOL wrap amounts. The full mocked Titan-to-wallet path confirms a malicious route triggers **zero wallet prepare calls and zero additional simulation/send calls**. Positive fixtures are synthetic IDL-shaped transactions, not live trade evidence.

This independently verifies the economic fields the known on-chain router is instructed to enforce. It is not a new on-chain guard program or an audit of Titan and its downstream DEX implementations. The known program's runtime behavior and any upgrades remain a trust boundary; the internal DEX route payload is executed/validated by Titan rather than fully interpreted by this client. RPC-supplied state and fee estimates also remain trusted inputs. Confirm real route compatibility and successful simulation before a separately approved funded test.

The generic Submit Transaction action remains an explicit user-supplied transaction operation; it does not inherit Titan-specific economic intent. Do not route opaque provider payloads through that action to bypass a rejected Titan swap.
