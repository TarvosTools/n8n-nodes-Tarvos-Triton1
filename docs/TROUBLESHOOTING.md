# Troubleshooting

[Back to README](../README.md) · [Credentials](CREDENTIALS.md) · [Test evidence](DEVNET-ACCEPTANCE.md)

| Symptom | Meaning / next step |
| --- | --- |
| Node does not appear | Build/install in the correct n8n user folder; restart editor and execution workers. Check that there is only one package copy. |
| Credential test fails | Use a clean HTTPS assigned endpoint and separate token; verify subscription network and active access. Never send screenshots containing token-bearing URLs. |
| Network mismatch | Endpoint genesis differs from Expected Network. Correct the credential; do not relabel an endpoint to bypass a restriction. |
| Method choice is greyed out | Selected endpoint explicitly reports a missing/disabled method, or Titan's Mainnet requirement is unmet. Read the description; refresh after service enablement. Cache lasts up to one minute. |
| Get History unavailable | Enhanced history is separate from standard Get Signatures. Use Get Signatures for basic activity or obtain the required endpoint capability. |
| Missing secondary index / RPC -32010 | The scan or token filter needs an index not enabled for that endpoint. Try a supported narrower query or ask Triton which indexes are available. |
| Empty asset/token results | May be valid, wrong address type/network, incomplete indexing or no matching data. Do not treat empty as a provider error automatically. |
| No trigger events | Verify address/filter/network and produce matching activity. Inactive accounts may emit nothing; manual mode is bounded. |
| gRPC service error | Check the exact service endpoint and entitlement. Ordinary Dragon access does not imply specialized stream access. |
| HTTP 429 | Pause requests sharing the same egress IP; use cooldown information. Do not create immediate per-item retry loops. |
| HTTP 503 or timeout | Inconclusive/transient failure. Reduce request size and retry reads deliberately. It does not prove a whole service is unavailable. |
| Account Sync degraded | Inspect source status and provenance. RPC fallback may work while dedicated push does not. |
| Worker connection refused | Start the worker; check host/container networking and its configured port. n8n running does not start the optional worker. |
| Worker unauthorized | Use the worker token, not the Triton token; confirm the token in the worker process matches the n8n credential. |
| Worker backlog/capacity error | Inspect downstream failures and acknowledgements. Do not clear the database or advance receipts merely to make the error disappear. |
| Wallet identity mismatch | The public address does not match the signing key or required signer. Correct the wallet; never weaken validation. |
| Unsupported swap route | Current signing policy cannot validate that route/version/token/setup instruction. Do not blindly sign provider bytes as a workaround. |
| Submission timeout | Outcome is ambiguous. Query the known signature before deciding whether to send again. |
| Balance after rerun differs | Each deliberately repeated transfer changes cumulative balance. Verify the transaction's post-minus-pre recipient delta. |

## Read the output contract

Use `data` for the result and `meta` for method/network/context. Null is not zero. Large integer strings must remain strings until handled by exact arithmetic. A signature is an identifier, not proof that a transaction executed successfully. Inspect execution error and requested confirmation level.

## n8n expressions

Use `{{ $json.walletAddress }}` when passing an address from a previous node. Ensure the preview is exactly the address, without extra braces, quotes or whitespace. Run the input node so n8n has current data. A literal expression pasted into Fixed mode is not a public address.

## Greyed choices after changing credentials

Reopen or refresh the option list. Availability is cached per endpoint/token/method for up to 60 seconds. Authentication errors and unknown capabilities stay enabled because they are not evidence a method is unsupported. Existing selected values are not silently replaced; choose an available operation explicitly.

## Safe issue reports

Include package/n8n/Node versions, operating system, resource + operation, expected network, sanitized error code, relevant non-secret settings and reproduction steps. State whether the issue is in the main action, native trigger or optional worker. Exclude tokens, private keys, full connection strings, credential exports and unredacted database/log dumps. Report sensitive issues privately through [Security](../SECURITY.md).
