// SPDX-License-Identifier: AGPL-3.0-only
const { createHash } = require("node:crypto");
const { readExactAccount } = require("./exact-account.cjs");
const { jsonSafe } = require("../dist/nodes/TarvosTritonOne/titan");
const {
  address,
  endpoint,
  integer,
  GENESIS,
} = require("../dist/nodes/TarvosTritonOne/validation");
const {
  openStream,
  envelope,
} = require("../dist/nodes/TarvosTritonTrigger/streams");
function token(name) {
  const value = process.env[name];
  if (!value || /[\r\n]/.test(value))
    throw new Error("Missing or invalid source token environment variable");
  return value;
}
function identity(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function startSources(config, inbox, health) {
  let stopped = false;
  const owned = [];
  const abort = new AbortController();
  const start = async (source, closers) => {
    if (source.type === "fumarole") {
      const sdk = require("@triton-one/yellowstone-fumarole-client");
      const url = new URL(source.endpoint);
      if (
        url.protocol !== "https:" ||
        !["ams.rpcpool.com", "nyc.rpcpool.com"].includes(url.hostname) ||
        url.pathname !== "/" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Fumarole requires a clean, fixed supported regional endpoint",
        );
      const selectedCommitment = source.request?.commitment;
      if (!["CONFIRMED", "FINALIZED", 1, 2].includes(selectedCommitment))
        throw new Error(
          "Durable Fumarole ingestion requires confirmed or finalized commitment",
        );
      const key = "fumarole:" + source.name;
      const fingerprint = identity({
        endpoint: url.href,
        request: source.request,
      });
      let state = inbox.getState(key);
      if (state && state.fingerprint !== fingerprint)
        throw new Error(
          "Source region or filter changed; use a new source name and deliberate backfill boundary",
        );
      const client = await sdk.FumaroleClient.connect({
        endpoint: url.href,
        xToken: token(source.tokenEnv),
        maxDecodingMessageSizeBytes: 16 * 1024 * 1024,
      });
      const range = await client.getSlotRange();
      const from =
        state?.fromSlot ??
        String(
          source.fromSlot === undefined
            ? range.maxSlot
            : BigInt(source.fromSlot),
        );
      if (BigInt(from) < range.minSlot || BigInt(from) > range.maxSlot)
        throw new Error(
          "Requested durable replay boundary is outside Fumarole retention; explicit backfill is required",
        );
      if (!state) {
        state = {
          fingerprint,
          fromSlot: from,
          group: `tarvos-${source.name}-${identity(key + from + fingerprint).slice(0, 12)}`,
        };
        inbox.setState(key, state);
      }
      // The pinned SDK has no public post-persistence commit API. Do not auto-commit before SQLite is durable.
      // Keep the remote offset fixed and replay/deduplicate from that boundary on restart.
      const info = await client.getConsumerGroupInfo(state.group);
      if (info?.isStale)
        throw new Error("Fumarole group is stale; explicit backfill required");
      if (!info) await client.createConsumerGroup(state.group, BigInt(from));
      const subscription = await client.subscribeWithConfig(
        state.group,
        sdk.SubscribeRequest.fromJSON(source.request),
        { noCommit: true, autoCommit: false, numDataPlaneTcpConnections: 1 },
      );
      closers.push(() => subscription.close());
      if (stopped) {
        subscription.close();
        return;
      }
      health[source.name] = {
        state: "running",
        service: "fumarole",
        fromSlot: from,
        remoteCheckpoint: "fixed",
        recovery: "replay from fixed boundary within provider retention",
      };
      let nextRetentionCheck = Date.now() + 60000;
      try {
        for await (const event of subscription) {
          if (stopped) break;
          const value = {
            source: source.name,
            service: "fumarole",
            network: "mainnet",
            commitment: selectedCommitment,
            slot: String(event.slot),
            blockhash: event.blockhash ?? null,
            kind: event.type,
            data: event.type === "data" ? jsonSafe(event.update) : null,
          };
          inbox.put(
            {
              schemaVersion: 1,
              ...value,
              observedAt: new Date().toISOString(),
            },
            identity(value),
          );
          if (event.type === "slotEnded") {
            health[source.name].lastFullBlock = {
              slot: String(event.slot),
              blockhash: event.blockhash ?? null,
            };
            inbox.setState(
              key + ":lastFullBlock",
              health[source.name].lastFullBlock,
            );
          }
          if (Date.now() > nextRetentionCheck) {
            const current = await client.getSlotRange();
            if (BigInt(from) < current.minSlot)
              throw new Error(
                "Fixed replay boundary left retention; stop to require explicit recovery",
              );
            nextRetentionCheck = Date.now() + 60000;
          }
        }
        if (!stopped) throw new Error("Fumarole ended");
      } finally {
        subscription.close();
      }
      return;
    }
    if (
      ![
        "whirligig",
        "dragon",
        "riptide",
        "deshred",
        "vixen",
        "harmonic",
        "bam",
        "titan",
      ].includes(source.type)
    )
      throw new Error("Unsupported worker source");
    await new Promise(async (resolve, reject) => {
      try {
        const credentials = {
          endpoint: source.endpoint,
          apiToken: token(source.tokenEnv),
          network: source.network ?? "mainnet",
        };
        const close = await openStream(
          source.type,
          credentials,
          source.parameters ?? {},
          (data) => {
            try {
              const value = envelope(
                source.type,
                data,
                credentials.network,
                source.commitment ?? "unspecified",
              );
              inbox.put(
                { ...value, sourceName: source.name },
                identity({ source: source.name, eventId: value.eventId }),
              );
            } catch (e) {
              reject(e);
            }
          },
          reject,
        );
        closers.push(() => {
          close();
          resolve();
        });
        if (stopped) {
          close();
          resolve();
          return;
        }
        health[source.name] = {
          state: "running",
          service: source.type,
          recovery: "gaps possible during reconnect",
        };
        // Resolve/reject closes the transport in the outer lifecycle via an owned closer.
      } catch (e) {
        reject(e);
      }
    });
  };
  const jobs = (config.sources ?? []).map(async (source) => {
    let attempts = 0;
    const closers = [];
    owned.push(closers);
    while (!stopped) {
      try {
        await start(source, closers);
        if (stopped) break;
      } catch {
        for (const close of closers.splice(0)) close();
        health[source.name] = {
          ...health[source.name],
          state: "error",
          message:
            "Source failed; check configuration, service access, replay retention and inbox capacity",
          attempts: ++attempts,
        };
        // Persist a visible gap; never claim that a reconnect replays non-durable protocols.
        try {
          inbox.put({
            schemaVersion: 1,
            sourceName: source.name,
            kind: "gap",
            observedAt: new Date().toISOString(),
            reason: "source disconnected or ingestion failed",
          });
        } catch {
          /* Full/damaged storage: status still exposes the failure. */
        }
        if (source.type === "fumarole") break; // Require investigation; do not silently reset a durable subscriber.
        await require("node:timers/promises")
          .setTimeout(
            Math.min(60000, 1000 * 2 ** Math.min(attempts, 6)),
            undefined,
            { signal: abort.signal },
          )
          .catch(() => {});
      }
    }
  });
  return {
    close: async () => {
      stopped = true;
      abort.abort();
      for (const close of owned.flat()) close();
      await Promise.allSettled(jobs);
    },
  };
}
async function createAccountSync(config, dependencies = {}) {
  if (!config) return undefined;
  const sdk = dependencies.sdk ?? (await import("@triton-one/triton-sdk"));
  const rpc = endpoint(config.rpcEndpoint);
  const stream = endpoint(config.streamEndpoint ?? config.rpcEndpoint);
  const apiToken = token(config.tokenEnv);
  const streamToken = token(config.streamTokenEnv ?? config.tokenEnv);
  const accounts = (config.addresses ?? []).map(address);
  if (!accounts.length || accounts.length > 1000)
    throw new Error("Configure 1–1000 watched Account Sync addresses");
  const cluster = config.network ?? "mainnet";
  if (!GENESIS[cluster]) throw new Error("Invalid network");
  // The pinned SDK's internal hydration fetch does not forward web3.js httpHeaders.
  // Authenticate its private runtime URL as well; never persist or log this URL.
  const authenticatedRpc = new URL(encodeURIComponent(apiToken), rpc).href;
  const connection = new sdk.Connection(authenticatedRpc, {
    httpHeaders: { "x-token": apiToken },
    accountSync: {
      transport: sdk.AccountSyncTransports.GRPC,
      subscriptionEndpoint: new URL(encodeURIComponent(streamToken), stream)
        .href,
      commitment: "confirmed",
      initialAccounts: accounts.map((v) => new sdk.PublicKey(v)),
      autoSubscribeOnMiss: false,
      missTimeoutMs: 5000,
    },
  });
  try {
    if ((await connection.getGenesisHash()) !== GENESIS[cluster])
      throw new Error("Account Sync RPC network mismatch");
  } catch (error) {
    await connection.close();
    throw error;
  }
  return {
    async read(key, maxSlotLag) {
      address(key);
      if (!accounts.includes(key))
        throw new Error("Address not configured for Account Sync");
      // The SDK does not expose observation timestamps or cache-hit provenance. Bound freshness by current RPC slot distance.
      const currentSlot = await connection.getSlot("confirmed");
      maxSlotLag = integer(maxSlotLag, "Maximum slot lag", 0, 10000);
      const result = await connection.getAccountInfoAndContext(
        new sdk.PublicKey(key),
        {
          commitment: "confirmed",
          minContextSlot: Math.max(0, currentSlot - maxSlotLag),
        },
      );
      const value = result.value;
      if (
        !Number.isSafeInteger(result.context?.slot) ||
        result.context.slot < Math.max(0, currentSlot - maxSlotLag)
      )
        throw new Error(
          "Account Sync did not satisfy requested slot freshness",
        );
      const precisionFallback = !!(
        value &&
        (!Number.isSafeInteger(value.lamports) ||
          !Number.isSafeInteger(value.rentEpoch))
      );
      const exact = precisionFallback
        ? await (dependencies.readExactAccount ?? readExactAccount)(
            rpc,
            apiToken,
            key,
            Math.max(currentSlot - maxSlotLag, result.context.slot),
          )
        : undefined;
      return {
        address: key,
        context: exact ? exact.context : result.context,
        account: exact
          ? exact.account
          : value
            ? {
                ...value,
                owner: value.owner.toBase58(),
                lamports: String(value.lamports),
                rentEpoch: String(value.rentEpoch),
                data: {
                  encoding: "base64",
                  data: value.data.toString("base64"),
                },
              }
            : null,
        network: cluster,
        commitment: "confirmed",
        provenance: precisionFallback
          ? "Exact RPC fallback (SDK integer precision)"
          : "SDK buffer or RPC fallback",
        precisionFallback,
        freshness: {
          maximumSlotLag: maxSlotLag,
          currentSlot,
          wallClockAgeVerified: false,
        },
        observedAt: new Date().toISOString(),
        transportDegraded: !!connection.getLastTransportError(),
      };
    },
    close: () => connection.close(),
  };
}
module.exports = { startSources, createAccountSync };
