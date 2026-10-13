# Optional Tarvos Triton worker

This separate process provides a SQLite inbox and shared Account Sync connection. Signing stays in n8n. The worker is not required for RPC, Titan swaps, or native triggers.

## Run locally

Build the parent package, then install this directory's pinned dependencies:

```sh
cd worker
npm ci --ignore-scripts
```

Copy `config.example.json` to `config.json`. Configure source filters and fixed consumer names. Set a randomly generated `WORKER_API_TOKEN` of at least 32 characters and each source's token environment variable, then run `npm start`. Do not paste secrets into the config or commit them. The default address is `http://127.0.0.1:5690`.

Create **Triton Worker API** in n8n using that endpoint and token. The credential test checks authentication, while **Worker → Get Status** reports source health. The server starts even when an individual source fails so its status remains inspectable.

Node.js 22.22+ is required for built-in SQLite. Native Fumarole SDK builds currently cover Windows x64, Linux x64 (glibc/musl) and macOS arm64; Linux arm64 is not listed. Verify your platform. Live Devnet Whirligig and Dragon ingestion and actual n8n worker integration passed on Windows on 13 October 2026; Fumarole provider acceptance remains unverified.

## Inbox processing

1. **Worker → Get Events** with your configured consumer name returns `data.events` and `data.receipt`.
2. Persist/process the events. Use `eventId` for downstream idempotency. Use a single workflow per consumer; parallel readers can receive the same outstanding batch.
3. Only after all events succeed, **Worker → Acknowledge Events** with the matching receipt. Do not acknowledge an empty batch.

The same receipt and events survive retries and restart until acknowledged. An old acknowledgement cannot skip a new batch. Each configured consumer has its own position. This is at-least-once processing, not an exactly-once guarantee. A workflow emission is not an acknowledgement.

SQLite uses WAL and FULL synchronous writes. The capacity limit stops ingestion before accepting more events. Pruning removes only data acknowledged by all recorded consumers, retaining 1,000 rows behind the slowest consumer. Removing a consumer from config does not discard its backlog. Monitor disk and backlogs; take SQLite-consistent backups including WAL state. Run one worker per database on a local persistent filesystem.

## Fumarole: conservative recovery mode

Use a fixed `https://ams.rpcpool.com/` or `https://nyc.rpcpool.com/` endpoint, confirmed/finalized commitment and a unique source name. The worker creates its own deterministic `tarvos-...` consumer group. It never deletes groups or resets them to latest. An optional decimal-string `fromSlot` selects a replay start; without it the initial available tip is recorded.

**The current JavaScript SDK has no public explicit commit-after-write operation.** Native automatic commits can precede the application's durable write, so this worker sets `noCommit: true` and `autoCommit: false`. SQLite records each event and slot/blockhash completion independently. The source's remote replay boundary stays fixed. Restart replays that boundary and deduplicates stored events; consumers may still see duplicates after old acknowledged rows are pruned.

The boundary must remain inside the provider's retention window. The worker stops if it expires, if the group is stale, or if region/filter configuration changes under the same source name. Inspect the error and plan backfill explicitly. Changing source name starts a new stream and is not evidence that a gap was recovered. **This mode is useful for evaluation and bounded capture sessions; it is not an indefinite unattended recovery system.** Advancing source checkpoints needs an SDK/API extension before that can be claimed.

Status records the most recently delivered full block, but it is not used as a global resume checkpoint: completion can involve multiple blocks/forks and should not be assumed globally contiguous.

## Other streams

A source can use `whirligig`, `dragon`, `riptide`, `vixen`, `deshred`, `harmonic`, `bam`, or `titan`. Configure `name`, `type`, `endpoint`, `tokenEnv`, `network`, and `parameters` matching the native trigger's fields in `docs/operation-contract.json`. Add a `commitment` label when appropriate. The worker reuses the same protocol adapters, writes events to SQLite and reconnects with bounded exponential delay. It records gap notices; SQLite does not recover events lost before ingestion.

Use narrow filters. `allowUnfiltered: true` is an explicit advanced Yellowstone option inside `parameters`. For early feeds, retain clip notices and slot frames, and reconcile outcomes with confirmed/finalized RPC data. gRPC network labels come from configuration and cannot be genesis-verified through these streams alone.

## Account Sync

Add this optional section (replace endpoints and addresses):

```json
{
  "accountSync": {
    "rpcEndpoint": "https://your-endpoint.rpcpool.com/",
    "streamEndpoint": "https://your-account-sync-endpoint.rpcpool.com/",
    "tokenEnv": "TRITON_API_TOKEN",
    "streamTokenEnv": "TRITON_STREAM_TOKEN",
    "network": "mainnet",
    "addresses": ["So11111111111111111111111111111111111111112"]
  }
}
```

This uses the official `@triton-one/triton-sdk` with a persistent gRPC subscription and its documented RPC fallback. **Worker → Get Account** accepts only configured addresses and a maximum slot lag. The worker obtains the current confirmed RPC slot, passes a `minContextSlot` bound into the SDK and validates the returned slot. It returns context, commitment, binary account data and a transport-degraded flag. The SDK does not expose cache-hit provenance or observation wall-clock age; the output explicitly says buffer or RPC fallback.

The pinned SDK's hydration requests ignore web3.js authentication headers. The worker constructs a token-authenticated URL only in memory for this SDK; keep config endpoints clean and never log the constructed URL. When the SDK returns unsafe numeric balances/rent epochs, the worker retrieves the entire account through authenticated, losslessly parsed RPC with the same or newer slot bound. It does not repair rounded values by guessing. Such results explicitly return `precisionFallback: true` and `provenance: Exact RPC fallback (SDK integer precision)`.

The tested Devnet endpoint returned HTTP 501 for the dedicated `YellowstoneAccountSyncGrpcService` transport, despite supporting ordinary Dragon's Mouth gRPC. Account reads passed through the RPC fallback; this is not evidence of successful Account Sync push delivery. `transportDegraded` reflects the SDK's last recorded transport/background error, which can remain recorded after recovery.

## Container and remote access

From the parent package after building:

```sh
docker build -f worker/Dockerfile -t tarvos-triton-worker .
```

Mount a config at `/config/config.json` and persistent database storage at `/data`; set `database` to `/data/inbox.sqlite`. For container networking set `host` to `0.0.0.0` deliberately and publish only the desired interface. Supply secrets through your deployment secret manager. Put remote access behind a TLS reverse proxy: the n8n credential rejects remote plain HTTP. The worker has no wallet/private-key API.

The image recipe is provided but has not been built on this host. It installs system CA certificates for the native SDK's TLS stack.

## Licenses

Worker source is AGPL-3.0-only; `LICENSE` includes the upstream AGPL text. The parent n8n integration remains MIT. The Fumarole client declares AGPL-3.0. Account Sync's npm package omits license metadata, while its [official repository](https://github.com/rpcpool/triton-js-sdk/blob/main/LICENSE.md) supplies Apache-2.0, copied as `ACCOUNT-SYNC-LICENSE.txt`. Preserve source and applicable notices when redistributing or operating modified covered software.
