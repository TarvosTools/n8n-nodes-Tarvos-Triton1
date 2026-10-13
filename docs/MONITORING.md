# Monitoring Solana in n8n

[Back to README](../README.md) · [Service reference](SERVICES.md) · [Worker deployment](../worker/README.md)

## Pick the simplest path

| Need | Start with | Tradeoff |
| --- | --- | --- |
| Periodic balance/status checks | Schedule Trigger + main action node | Can miss changes between polls |
| Account/log events in a workflow | Triton Trigger Quick Setup | Live best-effort delivery; no replay guarantee |
| Parsed program or early execution feeds | Trigger Advanced Setup | Specialized access, filters and semantics |
| Durable downstream processing | Optional worker + Get Events / Acknowledge | Operate a separate process and database |
| Shared account freshness | Worker Account Sync | Dedicated push transport or explicitly degraded RPC fallback |

## Quick Setup

1. Add **Tarvos Triton 1 Trigger** and choose Quick Setup.
2. Select a goal such as account changes or wallet activity.
3. Enter the relevant address and choose the RPC credential.
4. Test the trigger. Generate activity separately or watch a known-changing system account.
5. Inspect the event's network, kind, slot/context and payload before downstream processing.

No signing key is required. A wallet-activity log mentions an address; it does not necessarily represent a transfer. A token-account watch takes a token-account address, not the mint. Manual testing stops after its bounded batch; publish/activate according to your n8n deployment to keep a production trigger listening.

## Advanced services

Whirligig uses WebSocket subscriptions. Dragon's Mouth uses Yellowstone gRPC. Riptide uses the Geyser interface on its assigned service. Vixen emits parsed program events. Titan streams quote updates. Deshred, Harmonic and BAM provide earlier transaction/bundle information with additional semantics.

Select a service you actually have access to, then use narrow filters. Preconfirmation is not finality. Retain clip/gap notices and slot frames, and reconcile outcomes through confirmed/finalized RPC. Absent execution results are not success. The [service guide](SERVICES.md) gives exact protocol limitations.

Fields mode covers common filters; JSON mode is for supported advanced request shapes. Switching modes does not translate settings; review the active mode. Avoid an unfiltered program-wide feed until you have measured volume. Batch limits and per-minute execution budgets protect n8n; hitting a limit stops the stream and can cause a gap.

## Delivery and restart behavior

Direct triggers do not provide exactly-once delivery or durable replay. A connection failure stops the transport; n8n manages reactivation. Events produced while disconnected may be lost. An emitted workflow batch does not mean downstream storage succeeded.

Use stable downstream identities where available, typically network + signature + instruction/event position. Account updates may need address + slot plus a payload hash. A slot alone is not a unique event identifier, and forks can change state before finality.

## Worker processing contract

The worker persists accepted events in SQLite before handing them to a consumer. The same receipt survives restart until acknowledged. Each configured consumer has a separate position. Process idempotently, acknowledge only after all required downstream work succeeds, and monitor backlog/disk space.

SQLite durability cannot recover events lost before ingestion. Ordinary worker streams record gap notices and reconnect; they do not invent replay support. Fumarole uses a fixed replay boundary because the pinned SDK lacks a public post-persistence commit operation. It stops when the boundary leaves retention. This is bounded capture/recovery, not indefinite unattended operation.

Run one worker per local persistent database. Back up SQLite consistently with WAL state. Container/remote deployments require explicit networking, persistent storage and TLS. See [worker operations](../worker/README.md).

## Account Sync status

Read both `transportDegraded` and provenance. On the tested endpoint the dedicated push method returned HTTP 501, while RPC fallback returned valid slot-bounded account data. `precisionFallback: true` means an exact RPC read replaced unsafe SDK numeric fields. A passing account read does not prove the push stream works. Freshness is measured in slots, not guaranteed wall-clock age.

## Acceptance checklist

Verify a real matching event, stop/restart behavior, duplicate handling, backlog/capacity failure, acknowledgement order and credential rotation. Reconcile early events against finalized state. Current evidence covers Whirligig and Dragon Devnet events plus local worker persistence and acknowledgements; specialized feed acceptance remains open. See [validation](DEVNET-ACCEPTANCE.md).
