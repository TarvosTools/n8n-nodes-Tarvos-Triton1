# Basic Solana templates

Import one JSON file into n8n. Templates are inactive and contain no credentials or private keys. In every Triton action, select your saved Triton **Devnet** credential. The local test instance already has these templates imported and connected.

| Template | What it does | Input |
| --- | --- | --- |
| 01-wallet-balance.json | Read a wallet's SOL balance | Public wallet address in Your Inputs |
| 02-wallet-activity.json | Read up to ten recent transactions and explorer links | Public wallet address |
| 03-token-supply.json | Read a token mint's supply and decimals | Token mint address, not wallet address |
| 04-verify-transaction.json | Inspect success, fee and instructions | Devnet transaction signature |
| 05-send-devnet-sol.json | Send and verify 0.001 devnet SOL using the connected Solana Wallet | Dedicated test wallet credentials |

For the first four, select **Execute workflow**, then open **Result**. No signing key is needed. The wrapped SOL token supply example may return zero: that native mint does not report total SOL supply.

The transfer template is a fixed devnet acceptance fixture using the documented test sender and recipient. It is not a general transfer builder: changing a visible address alone does not rebuild its serialized transaction. To use it as-is, attach the matching test wallet credential to Solana Wallet. It checks fees, simulates, submits once, waits for finality and verifies the recipient's balance change within that specific transaction. Each execution sends another 0.001 devnet SOL plus a network fee. Do not enable automatic retries. If a run stops after submission, check its signature before sending again.

The local template-binding script is specific to this development instance. Portable JSON files intentionally omit those bindings.

These templates validate standard Solana RPC operations. They do not prove Titan, DAS, streaming, Cascade or management-service access. A green workflow means its tested steps succeeded, not that every Triton service is validated.
