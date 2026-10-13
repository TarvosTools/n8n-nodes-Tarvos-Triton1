import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import bs58 from "bs58";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { address, atomic, endpoint, integer, object, text } from "./validation";
import { TritonError } from "./errors";
import type { Rpc } from "./transport";
import { enforceSwapPolicy } from "./swapPolicy";

export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && value.constructor?.name === "Long")
    return String(value);
  if (value instanceof Uint8Array)
    return { encoding: "base64", data: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]),
    );
  return value;
}
export function titanRequest(p: Record<string, unknown>, publicKey: string) {
  const amount = BigInt(atomic(p.titanAmount));
  if (amount < 1n || amount > 18446744073709551615n)
    throw new TritonError("INVALID_INPUT", "Amount must fit a positive u64.");
  const inputMint = address(p.inputMint),
    outputMint = address(p.outputMint);
  if (inputMint === outputMint)
    throw new TritonError(
      "INVALID_INPUT",
      "Input and output mints must differ.",
    );
  return {
    swap: {
      inputMint: bs58.decode(inputMint),
      outputMint: bs58.decode(outputMint),
      amount,
      swapMode: "ExactIn",
      slippageBps: integer(
        p.slippageBps ?? 50,
        "Slippage basis points",
        0,
        1000,
      ),
      addSizeConstraint: true,
      sizeConstraint: 1232,
    },
    transaction: {
      userPublicKey: bs58.decode(address(publicKey)),
      transactionFormat: 0,
      titanSwapVersion: 2,
      feeBps: 0,
    },
    update: { intervalMs: 1000n, numQuotes: 5, includeAltContents: false },
  };
}
export function openTitan(
  credentials: Record<string, unknown>,
  method: string,
  params: unknown,
  onValue: (value: unknown) => void,
  onError: (error: Error) => void,
): () => void {
  const url = new URL(endpoint(credentials.endpoint));
  url.protocol = "wss:";
  // Triton's documented proxy authenticates the path, unlike direct Titan JWT auth.
  url.pathname = `/${encodeURIComponent(text(credentials.apiToken, "API token"))}/titan/api/v1/ws`;
  const ws = new WebSocket(url, ["v1.api.titan.ag"], {
    handshakeTimeout: 15000,
    maxPayload: 8 * 1024 * 1024,
    followRedirects: false,
  });
  let stopped = false,
    streamId: number | undefined,
    alive = true;
  const fail = () => {
    if (!stopped)
      onError(
        new TritonError(
          "TITAN_CONNECTION",
          "Titan connection failed, ended or returned an invalid response. Check service access and request fields.",
        ),
      );
  };
  ws.on("open", () => {
    if (ws.protocol !== "v1.api.titan.ag") {
      fail();
      close();
      return;
    }
    ws.send(
      encode({ id: 1, data: { [method]: params } }, { useBigInt64: true }),
    );
  });
  ws.on("pong", () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!alive) {
      fail();
      close();
      return;
    }
    alive = false;
    ws.ping();
  }, 20000);
  ws.on("message", (raw, binary) => {
    if (stopped) return;
    try {
      if (!binary) throw new Error();
      const msg = decode(Buffer.from(raw as Buffer), { useBigInt64: true }) as {
        Error?: unknown;
        StreamEnd?: unknown;
        Response?: {
          requestId?: number;
          data?: Record<string, unknown>;
          stream?: { id?: number };
        };
        StreamData?: { id?: number; payload?: { SwapQuotes?: unknown } };
      };
      if (msg.Error || msg.StreamEnd) {
        fail();
        close();
        return;
      }
      if (msg.Response?.requestId === 1) {
        if (method === "NewSwapQuoteStream") streamId = msg.Response.stream?.id;
        else {
          if (msg.Response.data?.[method] === undefined) throw new Error();
          onValue(msg.Response.data[method]);
        }
      }
      if (
        msg.StreamData &&
        streamId !== undefined &&
        msg.StreamData.id === streamId &&
        msg.StreamData.payload?.SwapQuotes
      )
        onValue(msg.StreamData.payload.SwapQuotes);
    } catch {
      fail();
      close();
    }
  });
  ws.on("error", fail);
  ws.on("close", fail);
  function close() {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    if (ws.readyState === WebSocket.OPEN && streamId !== undefined)
      ws.send(encode({ id: 2, data: { StopStream: { id: streamId } } }));
    ws.terminate();
  }
  return close;
}
export function titanOnce(
  credentials: Record<string, unknown>,
  method: string,
  params: unknown,
  timeout = 20000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let close: () => void = () => {};
    const timer = setTimeout(() => {
      close();
      reject(
        new TritonError(
          "TITAN_TIMEOUT",
          "No usable Titan response before the timeout.",
        ),
      );
    }, timeout);
    try {
      close = openTitan(
        credentials,
        method,
        params,
        (value) => {
          clearTimeout(timer);
          close();
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          close();
          reject(error);
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
export function selectRoute(
  quotes: unknown,
  requestedProvider: unknown,
): Record<string, unknown> {
  const body = object(quotes, "Titan quotes");
  const routes = object(body.quotes, "Titan routes");
  const provider = requestedProvider
    ? text(requestedProvider, "Provider")
    : (body.metadata as Record<string, unknown>)?.ExpectedWinner;
  if (typeof provider !== "string" || !Object.hasOwn(routes, provider))
    throw new TritonError(
      "TITAN_ROUTE",
      "No route for the selected provider or expected winner.",
    );
  return { ...object(routes[provider], "Titan route"), provider };
}
export function validateQuoteContext(
  quotes: unknown,
  p: Record<string, unknown>,
) {
  const body = object(quotes, "Titan quote");
  if (
    pubkey(body.inputMint).toBase58() !== address(p.inputMint) ||
    pubkey(body.outputMint).toBase58() !== address(p.outputMint) ||
    atomic(body.amount) !== atomic(p.titanAmount) ||
    body.swapMode !== "ExactIn"
  )
    throw new TritonError(
      "TITAN_ROUTE",
      "Quote mints, amount or swap mode differ from the request.",
    );
}
function pubkey(value: unknown): PublicKey {
  if (!(value instanceof Uint8Array) || value.length !== 32)
    throw new TritonError("TITAN_ROUTE", "Invalid route public key.");
  return new PublicKey(value);
}
export async function buildSwap(
  route: Record<string, unknown>,
  publicKey: string,
  p: Record<string, unknown>,
  rpc: Rpc,
): Promise<string> {
  if (atomic(route.inAmount) !== atomic(p.titanAmount))
    throw new TritonError(
      "TITAN_ROUTE",
      "Route input amount differs from the request.",
    );
  const requestedSlippage = integer(p.slippageBps ?? 50, "Slippage", 0, 1000);
  const routeSlippage = integer(
    route.slippageBps,
    "Route slippage",
    0,
    requestedSlippage,
  );
  const floor =
    (BigInt(atomic(route.outAmount)) * BigInt(10000 - routeSlippage)) / 10000n;
  if (floor < BigInt(atomic(p.minimumOutput ?? "1")))
    throw new TritonError(
      "TITAN_ROUTE",
      "Slippage-adjusted quoted output is below your minimum.",
    );
  await checkQuoteExpiry(route, rpc);
  return compileSwap(route, publicKey, p, rpc, floor > 0n ? floor : 1n);
}
export async function checkQuoteExpiry(
  route: Record<string, unknown>,
  rpc: Rpc,
) {
  if (
    route.expiresAtMs !== undefined &&
    BigInt(atomic(route.expiresAtMs)) <= BigInt(Date.now())
  )
    throw new TritonError("TITAN_EXPIRED", "Quote has expired.");
  if (
    route.expiresAfterSlot !== undefined &&
    BigInt(atomic(await rpc("getSlot", [{ commitment: "confirmed" }]))) >
      BigInt(atomic(route.expiresAfterSlot))
  )
    throw new TritonError("TITAN_EXPIRED", "Quote slot has expired.");
}
async function compileSwap(
  route: Record<string, unknown>,
  publicKey: string,
  p: Record<string, unknown>,
  rpc: Rpc,
  minimum: bigint,
): Promise<string> {
  if (
    !Array.isArray(route.instructions) ||
    !route.instructions.length ||
    route.instructions.length > 64
  )
    throw new TritonError(
      "TITAN_ROUTE",
      "Route has no bounded instruction list.",
    );
  const payer = new PublicKey(address(publicKey));
  const instructions = route.instructions.map((raw: unknown) => {
    const ix = object(raw, "Instruction");
    if (
      !Array.isArray(ix.a) ||
      ix.a.length > 64 ||
      !(ix.d instanceof Uint8Array)
    )
      throw new TritonError("TITAN_ROUTE", "Invalid instruction.");
    return new TransactionInstruction({
      programId: pubkey(ix.p),
      data: Buffer.from(ix.d),
      keys: ix.a.map((raw: unknown) => {
        const a = object(raw, "Instruction account");
        const key = pubkey(a.p);
        if (
          typeof a.s !== "boolean" ||
          typeof a.w !== "boolean" ||
          (a.s && !key.equals(payer))
        )
          throw new TritonError(
            "TITAN_ROUTE",
            "Unexpected route signer or account flags.",
          );
        return { pubkey: key, isSigner: a.s, isWritable: a.w };
      }),
    });
  });
  const units = integer(
    route.computeUnitsSafe,
    "Safe compute units",
    1,
    1400000,
  );
  const fee = BigInt(atomic(p.computeUnitPrice ?? "0"));
  if (fee > 1000000000n)
    throw new TritonError(
      "INVALID_INPUT",
      "Compute unit price exceeds the package limit.",
    );
  // Replace compute-budget instructions so the user controls the fee ceiling.
  const routeInstructions = instructions.filter(
    (ix: TransactionInstruction) =>
      !ix.programId.equals(ComputeBudgetProgram.programId),
  );
  await enforceSwapPolicy(routeInstructions, payer, p, minimum, rpc);
  const finalInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee }),
    ...routeInstructions,
  ];
  const tables: AddressLookupTableAccount[] = [];
  if (
    route.addressLookupTables !== undefined &&
    (!Array.isArray(route.addressLookupTables) ||
      route.addressLookupTables.length > 32)
  )
    throw new TritonError("TITAN_ROUTE", "Invalid lookup tables.");
  for (const raw of route.addressLookupTables ?? []) {
    const key = pubkey(raw);
    const result = (await rpc("getAccountInfo", [
      key.toBase58(),
      { encoding: "base64", commitment: "confirmed" },
    ])) as { value?: { owner?: string; data?: [string, string] } };
    if (
      result?.value?.owner !== "AddressLookupTab1e1111111111111111111111111" ||
      result.value.data?.[1] !== "base64"
    )
      throw new TritonError("LOOKUP_TABLE", "Missing or invalid lookup table.");
    tables.push(
      new AddressLookupTableAccount({
        key,
        state: AddressLookupTableAccount.deserialize(
          Buffer.from(result.value.data[0], "base64"),
        ),
      }),
    );
  }
  const latest = (await rpc("getLatestBlockhash", [
    { commitment: "confirmed" },
  ])) as { value?: { blockhash?: string } };
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: address(latest?.value?.blockhash),
    instructions: finalInstructions,
  }).compileToV0Message(tables);
  const bytes = new VersionedTransaction(message).serialize();
  if (bytes.length > 1232)
    throw new TritonError(
      "TITAN_ROUTE",
      "Swap transaction exceeds the v0 size limit.",
    );
  const cost = (await rpc("getFeeForMessage", [
    Buffer.from(message.serialize()).toString("base64"),
    { commitment: "confirmed" },
  ])) as { value?: unknown };
  if (
    cost?.value === null ||
    cost?.value === undefined ||
    BigInt(atomic(cost.value)) > 100000n
  )
    throw new TritonError(
      "SWAP_FEE_LIMIT",
      "Swap network fee is unavailable or exceeds the 0.0001 SOL limit. Nothing was signed.",
    );
  return Buffer.from(bytes).toString("base64");
}
