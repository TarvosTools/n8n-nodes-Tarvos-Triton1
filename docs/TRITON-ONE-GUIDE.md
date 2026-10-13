> This original RPC guide is supplemented by the implemented 0.2.0 [service guide](SERVICES.md), covering Titan, gRPC/WebSocket monitoring and the optional worker.

# Triton endpoint behavior

Supply a clean HTTPS hostname below `rpcpool.com`, with `/` as its path and a separate `x-token`. Custom domains and token paths are intentionally rejected by the initial URL validator. Redirects are disabled. No public-RPC fallback exists.

References reviewed: [authentication](https://docs.triton.one/getting-started), [Cloudbreak](https://docs.triton.one/project-yellowstone/cloudbreak-custom-indexes), [unsupported queries](https://docs.triton.one/chains/solana/unsupported-account-queries), [enhanced history](https://docs.triton.one/chains/solana/gettransactionsforaddress), [DAS](https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api), [priority fees](https://docs.triton.one/chains/solana/improved-priority-fees-api), [rate limits](https://docs.triton.one/core-features/ratelimits).

The implementation follows the documented method-specific shapes. `getAssetsByOwner` uses positional parameters, while search and DAS token accounts use named parameters. `getAssets` is the batch method. `getAssetsByGroup` and SOL-wide `getLargestAccounts` are excluded. Program-account service availability must be verified on the actual endpoint; old Steamboat restrictions and newer Cloudbreak documentation differ.

Standard reads expose confirmed/finalized where the method accepts commitment. DAS is indexed data and does not receive a fictitious commitment option. History has an opaque token; signatures use before/until; initial DAS traversal uses page numbers. Page traversal continues until an explicit history end or an empty standard/DAS page, with repeated-page/cursor detection and request budgets.

Limits: up to 100 addresses per multiple-account request, 256 signatures per status request, 128 priority-fee writable addresses, and an initial Tarvos asset-batch cap of 100. History full detail caps pages at 100; other exposed paginated methods cap at 1000 pending endpoint-specific live validation. User totals cap at 10,000 and request budgets at 100. Limits below the provider's maxima are Tarvos safeguards, not statements of provider capacity.

Responses are rejected above 16 MiB before parsing. This check occurs after HTTP buffering and does not bound peak network-buffer memory; use program filters/data slices to reduce unpaginated response size. Account/output caps do not reduce provider cost. Endpoint billing and entitlements remain the customer's responsibility.

An HTTP 429 stops the current execution's remaining calls and returns a cooldown hint of at least ten seconds. Shared-IP throttling across workers is external to this package. No error includes complete upstream bodies, tokens, endpoint URLs or client request configurations.

Standard submission uses Solana `sendTransaction`. Version 0.2.0 also includes separate Cascade delivery, native stream triggers, standalone and bundle simulation, Titan instruction-route swaps and an optional worker. See [the service guide](SERVICES.md) for their exact contracts and [tested coverage](DEVNET-ACCEPTANCE.md) for the limits of live validation.
