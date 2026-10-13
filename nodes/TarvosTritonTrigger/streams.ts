import WebSocket from "ws";
import { yellowstoneSchema, yellowstoneDefinition } from "./yellowstone";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { join } from "path";
import { createHash } from "crypto";
import {
  address,
  choice,
  endpoint,
  object,
  signature,
  text,
} from "../TarvosTritonOne/validation";
import { TritonError } from "../TarvosTritonOne/errors";
import { parseLosslessJson } from "../TarvosTritonOne/losslessJson";
import { jsonSafe, openTitan, titanRequest } from "../TarvosTritonOne/titan";

export type CloseStream = () => void;
export type StreamOptions = Record<string, unknown>;
export type Receive = (data: unknown) => void;
export function streamEndpoint(value: unknown): URL {
  const url = new URL(text(value, "Stream endpoint"));
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".rpcpool.com") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new TritonError(
      "INVALID_INPUT",
      "Use a clean Triton HTTPS stream endpoint with a separate token.",
    );
  return url;
}
export function streamFilter(
  value: unknown,
  allowed: string[],
): Record<string, unknown> {
  const filter = object(value, "Subscription request");
  if (JSON.stringify(filter).length > 65536)
    throw new TritonError(
      "INVALID_INPUT",
      "Subscription filter exceeds 64 KiB.",
    );
  for (const key of Object.keys(filter))
    if (!allowed.includes(key))
      throw new TritonError(
        "INVALID_INPUT",
        `Unsupported subscription field: ${key}.`,
      );
  return filter;
}
export function websocketRequest(p: StreamOptions): {
  method: string;
  params: unknown[];
} {
  const topic = choice(
    p.topic,
    ["account", "program", "logs", "signature", "slot", "block", "transaction"],
    "Subscription",
  );
  const config = object(p.wsOptions ?? {}, "Subscription options");
  const allowed: Record<string, string[]> = {
    account: ["commitment", "encoding", "dataSlice"],
    program: ["commitment", "encoding", "dataSlice", "filters"],
    logs: ["commitment"],
    signature: ["commitment", "enableReceivedNotification"],
    slot: [],
    block: [
      "commitment",
      "encoding",
      "transactionDetails",
      "showRewards",
      "maxSupportedTransactionVersion",
    ],
    transaction: [
      "commitment",
      "encoding",
      "transactionDetails",
      "showRewards",
      "maxSupportedTransactionVersion",
    ],
  };
  streamFilter(config, allowed[topic]);
  if (config.commitment !== undefined)
    choice(
      config.commitment,
      ["processed", "confirmed", "finalized"],
      "Commitment",
    );
  if (["account", "program"].includes(topic)) config.encoding ??= "base64";
  if (["block", "transaction"].includes(topic))
    config.maxSupportedTransactionVersion = 1;
  let first: unknown;
  if (["account", "program"].includes(topic)) first = address(p.watchAddress);
  if (topic === "signature") first = signature(p.watchSignature);
  if (topic === "logs") first = { mentions: [address(p.watchAddress)] };
  if (topic === "block")
    first = { mentionsAccountOrProgram: address(p.watchAddress) };
  if (topic === "transaction") {
    first = streamFilter(p.transactionFilter ?? {}, [
      "vote",
      "failed",
      "signature",
      "accounts",
    ]);
    const accounts = object(
      (first as Record<string, unknown>).accounts ?? {},
      "Transaction accounts",
    );
    if (
      !["include", "required"].some(
        (k) =>
          Array.isArray(accounts[k]) && (accounts[k] as unknown[]).length > 0,
      ) &&
      !(first as Record<string, unknown>).signature
    )
      throw new TritonError(
        "INVALID_INPUT",
        "Provide a positive account or signature filter for transaction subscriptions.",
      );
    for (const [key, values] of Object.entries(accounts)) {
      if (
        !["include", "exclude", "required"].includes(key) ||
        !Array.isArray(values) ||
        values.length > 100
      )
        throw new TritonError(
          "INVALID_INPUT",
          "Invalid transaction account filter.",
        );
      values.forEach(address);
    }
    if ((first as Record<string, unknown>).signature)
      signature((first as Record<string, unknown>).signature);
  }
  return {
    method: topic + "Subscribe",
    params: topic === "slot" ? [] : [first, config],
  };
}
export function openWhirligig(
  credentials: Record<string, unknown>,
  p: StreamOptions,
  receive: Receive,
  error: (error: Error) => void,
): CloseStream {
  const request = websocketRequest(p);
  const url = new URL(endpoint(credentials.endpoint));
  url.protocol = "wss:";
  url.pathname = "/whirligig";
  const ws = new WebSocket(url, {
    headers: { "x-token": text(credentials.apiToken, "Token") },
    handshakeTimeout: 15000,
    maxPayload: 16 * 1024 * 1024,
    followRedirects: false,
  });
  let closed = false,
    subscription: unknown,
    lastMessage = Date.now();
  const fail = () => {
    if (!closed)
      error(
        new TritonError(
          "STREAM_DISCONNECTED",
          "WebSocket stream disconnected or rejected the subscription; a data gap may have occurred.",
        ),
      );
  };
  const timer = setInterval(() => {
    if (Date.now() - lastMessage > 60000) {
      fail();
      close();
    } else if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }));
  }, 20000);
  ws.on("open", () =>
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, ...request })),
  );
  ws.on("message", (raw) => {
    try {
      lastMessage = Date.now();
      const msg = parseLosslessJson(raw.toString()) as {
        error?: unknown;
        id?: number;
        result?: unknown;
        params?: { subscription?: unknown; result?: unknown };
      };
      if (msg.error) {
        fail();
        close();
        return;
      }
      if (msg.id === 1) {
        if (typeof msg.result !== "number") throw new Error();
        subscription = msg.result;
      }
      if (
        msg.params?.subscription === subscription &&
        subscription !== undefined
      )
        receive(msg.params?.result);
    } catch {
      fail();
      close();
    }
  });
  ws.on("error", fail);
  ws.on("close", fail);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    ws.terminate();
  }
  return close;
}
export async function openStream(
  source: string,
  credentials: Record<string, unknown>,
  p: StreamOptions,
  receive: Receive,
  error: (error: Error) => void,
): Promise<CloseStream> {
  if (source === "whirligig")
    return openWhirligig(credentials, p, receive, error);
  if (source === "titan")
    return openTitan(
      credentials,
      "NewSwapQuoteStream",
      titanRequest(p, address(p.titanPublicAddress)),
      receive,
      error,
    );
  const url = streamEndpoint(credentials.endpoint);
  const token = text(credentials.apiToken, "Stream token");
  let closed = false;
  const fail = () => {
    if (!closed)
      error(
        new TritonError(
          "STREAM_DISCONNECTED",
          "gRPC stream ended or failed. Verify endpoint, filters and entitlement; events during downtime are not automatically replayed.",
        ),
      );
  };
  const ssl = grpc.credentials.createSsl();
  const auth = grpc.credentials.createFromMetadataGenerator(
    (_params, callback) => {
      const metadata = new grpc.Metadata();
      metadata.set("x-token", token);
      callback(null, metadata);
    },
  );
  const channel = grpc.credentials.combineChannelCredentials(ssl, auth);
  const settings = {
    "grpc.max_receive_message_length": 16 * 1024 * 1024,
    "grpc.keepalive_time_ms": 30000,
  };
  if (["dragon", "riptide", "deshred"].includes(source)) {
    const sdk = yellowstoneSchema();
    const allowed = [
      "accounts",
      "slots",
      "transactions",
      "transactionsStatus",
      "blocks",
      "blocksMeta",
      "entry",
      "accountsDataSlice",
      "commitment",
      "fromSlot",
      "blockFooter",
    ];
    const filter = streamFilter(
      p.grpcRequest ?? {},
      source === "deshred" ? ["deshredTransactions", "slots"] : allowed,
    );
    if (
      !Object.values(filter).some(
        (v) => v && typeof v === "object" && Object.keys(v).length > 0,
      )
    )
      throw new TritonError(
        "INVALID_INPUT",
        "Provide at least one named stream filter.",
      );
    if (p.allowUnfiltered !== true)
      for (const kind of [
        "accounts",
        "transactions",
        "transactionsStatus",
        "blocks",
        "deshredTransactions",
      ]) {
        if (filter[kind] === undefined) continue;
        for (const value of Object.values(
          object(filter[kind], "Named filters"),
        )) {
          const named = object(value, "Filter");
          if (
            ![
              "account",
              "owner",
              "filters",
              "accountInclude",
              "accountRequired",
            ].some(
              (k) =>
                Array.isArray(named[k]) && (named[k] as unknown[]).length > 0,
            ) &&
            !named.signature
          )
            throw new TritonError(
              "INVALID_INPUT",
              "Add a positive account/program filter or explicitly allow an unfiltered feed.",
            );
        }
      }
    const method = source === "deshred" ? "SubscribeDeshred" : "Subscribe";
    const definition = yellowstoneDefinition(source === "deshred");
    const Client = grpc.makeGenericClientConstructor(
      { [method]: definition },
      "Geyser",
    );
    const client = new Client(
      url.host.includes(":") ? url.host : url.host + ":443",
      channel,
      settings,
    );
    const stream = (
      client as grpc.Client &
        Record<string, () => grpc.ClientDuplexStream<unknown, unknown>>
    )[method]();
    stream.write(
      source === "deshred"
        ? sdk.SubscribeDeshredRequest.fromJSON(filter)
        : sdk.SubscribeRequest.fromJSON(filter),
    );
    stream.on("data", (value: { ping?: unknown; pong?: unknown }) => {
      if (value.ping) {
        if (source !== "deshred")
          stream.write(sdk.SubscribeRequest.fromJSON({ ping: { id: 1 } }));
        return;
      }
      if (!closed && !value.pong) {
        try {
          receive(value);
        } catch {
          fail();
        }
      }
    });
    stream.on("error", fail);
    stream.on("end", fail);
    stream.on("close", fail);
    return () => {
      closed = true;
      stream.cancel();
      client.close();
    };
  }
  let client: grpc.Client, stream: grpc.ClientReadableStream<unknown>;
  if (source === "vixen") {
    const sdk = await import("@triton-one/vixen-stream");
    const program = address(p.vixenProgram);
    if (!(Object.values(sdk.ProgramAddress) as string[]).includes(program))
      throw new TritonError(
        "INVALID_INPUT",
        "Choose a program supported by the pinned Vixen SDK.",
      );
    client = new sdk.ProgramStreamsServiceClient(
      url.host.includes(":") ? url.host : url.host + ":443",
      channel,
      settings,
    );
    stream = (
      client as grpc.Client & {
        Subscribe: (request: unknown) => grpc.ClientReadableStream<unknown>;
      }
    ).Subscribe({ program });
  } else if (source === "harmonic" || source === "bam") {
    const definition = loadSync(join(__dirname, "proto", "preconfs.proto"), {
      longs: String,
      enums: String,
      bytes: Buffer,
      defaults: false,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(definition) as unknown as {
      preconfs: Record<string, grpc.ServiceClientConstructor>;
    };
    client = new proto.preconfs[source === "harmonic" ? "Harmonic" : "BAM"](
      url.host.includes(":") ? url.host : url.host + ":443",
      channel,
      settings,
    );
    const request = streamFilter(p.preconfRequest, [
      "transactions",
      source === "harmonic" ? "harmonicRegion" : "bamRegion",
    ]);
    const filters = object(request.transactions, "Transaction filters");
    if (!Object.keys(filters).length || Object.keys(filters).length > 16)
      throw new TritonError(
        "INVALID_INPUT",
        "Supply 1–16 positive preconfirmation filters.",
      );
    for (const value of Object.values(filters)) {
      const f = object(value, "Transaction filter");
      if (
        ![
          "accountInclude",
          "accountRequired",
          "signerInclude",
          "instructions",
          "signature",
        ].some((k) => Array.isArray(f[k]) && (f[k] as unknown[]).length)
      )
        throw new TritonError(
          "INVALID_INPUT",
          "Each preconfirmation filter must positively select accounts, signers, instructions or signatures.",
        );
    }
    const region =
      request[source === "harmonic" ? "harmonicRegion" : "bamRegion"];
    if (
      typeof region !== "string" ||
      !region.startsWith(
        source === "harmonic" ? "HARMONIC_REGION_" : "BAM_REGION_",
      ) ||
      region.endsWith("UNSPECIFIED")
    )
      throw new TritonError("INVALID_INPUT", "Select an explicit feed region.");
    stream = (
      client as grpc.Client & {
        Subscribe: (request: unknown) => grpc.ClientReadableStream<unknown>;
      }
    ).Subscribe(request);
  } else throw new TritonError("INVALID_INPUT", "Unknown stream service.");
  stream.on("data", (value) => {
    if (!closed && !(value as { ping?: unknown })?.ping) {
      try {
        receive(value);
      } catch {
        fail();
      }
    }
  });
  stream.on("error", fail);
  stream.on("end", fail);
  return () => {
    closed = true;
    stream.cancel();
    client.close();
  };
}
export function envelope(
  source: string,
  data: unknown,
  network: string,
  commitment: unknown = "unspecified",
) {
  commitment =
    typeof commitment === "number"
      ? (["processed", "confirmed", "finalized"][commitment] ?? "unspecified")
      : String(commitment).toLowerCase();
  const safe = jsonSafe(data);
  const record =
    safe && typeof safe === "object" ? (safe as Record<string, unknown>) : {};
  const kind =
    source === "titan"
      ? "quotes"
      : (Object.keys(record).find((k) =>
          [
            "account",
            "transaction",
            "transactionStatus",
            "slot",
            "block",
            "blockMeta",
            "entry",
            "slotStart",
            "slotEnd",
            "clip",
          ].includes(k) && record[k] != null,
        ) ?? "update");
  const nested = record[kind] as { slot?: unknown } | undefined;
  const context = record.context as { slot?: unknown } | undefined;
  const slot = nested?.slot ?? context?.slot ?? record.slot;
  return {
    schemaVersion: 1,
    eventId: createHash("sha256")
      .update(JSON.stringify({ source, network, commitment, data: safe }))
      .digest("hex"),
    source,
    kind,
    network,
    commitment,
    slot: slot === undefined ? null : String(slot),
    observedAt: new Date().toISOString(),
    provisional:
      ["harmonic", "bam", "deshred"].includes(source) ||
      commitment === "processed",
    replay: "unverified",
    data: safe,
  };
}
