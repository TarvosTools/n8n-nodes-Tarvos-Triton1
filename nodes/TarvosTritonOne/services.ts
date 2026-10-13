import type { IExecuteFunctions, IDataObject } from "n8n-workflow";
import {
  address,
  array,
  endpoint,
  integer,
  signature,
  text,
  type Network,
} from "./validation";
import { TritonError } from "./errors";
import type { Rpc } from "./transport";
import { getWallet, submit } from "./submission";
import { decodeTransaction } from "../TarvosSolanaWallet/signing";
import {
  buildSwap,
  checkQuoteExpiry,
  jsonSafe,
  selectRoute,
  titanOnce,
  titanRequest,
  validateQuoteContext,
} from "./titan";
import { executeRead } from "./operations";
import { workerEndpoint } from "./serviceCredentials";

export const SERVICES: Record<string, string[]> = {
  transaction: ["simulate", "confirm", "submitCascade", "simulateBundle"],
  titan: ["getInfo", "getVenues", "listProviders", "quote", "swap"],
  archive: ["exportAddressHistory", "exportBlocks"],
  administration: [
    "listAccounts",
    "listSubscriptions",
    "listEndpoints",
    "listTokens",
    "listWatchLists",
  ],
  worker: ["getStatus", "getAccount", "getEvents", "acknowledgeEvents"],
};
export async function executeService(
  context: IExecuteFunctions,
  index: number,
  key: string,
  p: Record<string, unknown>,
  credentials: Record<string, unknown>,
  rpc: Rpc,
  network: Network,
) {
  let data: unknown;
  if (key === "transaction.simulate") {
    decodeTransaction(text(p.transaction, "Transaction"));
    data = await rpc("simulateTransaction", [
      p.transaction,
      {
        encoding: "base64",
        commitment: "confirmed",
        sigVerify: false,
        replaceRecentBlockhash: true,
        innerInstructions: true,
      },
    ]);
  } else if (key === "transaction.confirm") {
    const sig = signature(p.signature);
    const until =
      Date.now() + integer(p.waitSeconds ?? 30, "Wait seconds", 1, 120) * 1000;
    data = { signature: sig, confirmationStatus: "timeout" };
    while (Date.now() < until) {
      const result = (await rpc("getSignatureStatuses", [
        [sig],
        { searchTransactionHistory: true },
      ])) as {
        value?: Array<{ err?: unknown; confirmationStatus?: string } | null>;
      };
      const status = result?.value?.[0];
      if (
        status?.err ||
        status?.confirmationStatus === "finalized" ||
        (p.targetCommitment === "confirmed" &&
          status?.confirmationStatus === "confirmed")
      ) {
        data = { signature: sig, ...status };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else if (key === "transaction.simulateBundle") {
    const transactions = array(p.bundleTransactions, "Transactions", 5).map(
      (v) => {
        decodeTransaction(text(v, "Transaction"));
        return String(v);
      },
    );
    data = await rpc("simulateBundle", [
      { encodedTransactions: transactions },
      {
        transactionEncoding: "base64",
        preExecutionAccountsConfigs: transactions.map(() => null),
        postExecutionAccountsConfigs: transactions.map(() => null),
        skipSigVerify: true,
        replaceRecentBlockhash: true,
      },
    ]);
  } else if (key === "transaction.submitCascade") {
    const policies = arrayOrEmpty(p.forwardingPolicies).map(address);
    const cascade: Rpc = async (method, args) => {
      if (method !== "sendTransaction") return rpc(method, args);
      const params = args as unknown[];
      try {
        const result = await context.helpers.httpRequest({
          method: "POST",
          url: new URL(
            "sendtx?encoding=base64&response=signature&max_retries=0",
            endpoint(credentials.endpoint),
          ).href,
          headers: {
            "x-token": text(credentials.apiToken, "API token"),
            "Content-Type": "text/plain",
            ...(policies.length
              ? { "solana-forwardingpolicies": policies.join(",") }
              : {}),
          },
          body: String(params[0]),
          json: false,
          timeout: 30000,
          disableFollowRedirect: true,
        });
        return String(result).trim();
      } catch {
        throw new TritonError(
          "TRANSPORT_ERROR",
          "Cascade submission outcome is unknown.",
        );
      }
    };
    return submit(
      context,
      index,
      { ...p, simulateFirst: true, maxRetries: 0 },
      cascade,
      network,
    );
  } else if (key.startsWith("titan.")) {
    if (network !== "mainnet")
      throw new TritonError(
        "NETWORK_MISMATCH",
        "Titan operations require a mainnet RPC credential.",
      );
    const operation = key.split(".")[1];
    if (["getInfo", "getVenues", "listProviders"].includes(operation))
      data = await titanOnce(
        credentials,
        operation[0].toUpperCase() + operation.slice(1),
        {},
      );
    else {
      const wallet =
        operation === "swap" ||
        (context.getNode().typeVersion >= 1.3 && p.quoteWallet === "wallet")
          ? await getWallet(context, index, network)
          : undefined;
      if (operation === "swap" && context.getNode().retryOnFail)
        throw new TritonError(
          "UNSAFE_RETRY",
          "Disable Retry on Fail for swaps.",
        );
      const owner = wallet?.publicAddress ?? address(p.titanPublicAddress);
      if (operation === "swap" && wallet?.mode !== "sign")
        throw new TritonError(
          "WALLET_MODE",
          "Titan swaps require the wallet signing mode.",
        );
      const receivedAt = Date.now();
      const quotes = await titanOnce(
        credentials,
        "NewSwapQuoteStream",
        titanRequest(p, owner),
      );
      if (operation === "quote")
        data = {
          quotes: jsonSafe(quotes),
          quotedFor: owner,
          observedAt: new Date().toISOString(),
        };
      else {
        validateQuoteContext(quotes, p);
        const route = selectRoute(quotes, p.provider);
        const transaction = await buildSwap(route, owner, p, rpc);
        if (Date.now() - receivedAt > 30000)
          throw new TritonError(
            "TITAN_EXPIRED",
            "Quote took too long to prepare. Request a fresh quote.",
          );
        const result = await submit(
          context,
          index,
          { ...p, transaction, simulateFirst: true, maxRetries: 0 },
          rpc,
          network,
          async () => {
            await checkQuoteExpiry(route, rpc);
            if (Date.now() - receivedAt > 30000)
              throw new TritonError(
                "TITAN_EXPIRED",
                "Quote preparation expired before sending.",
              );
          },
        );
        return {
          ...result,
          meta: {
            ...result.meta,
            provider: String(route.provider),
            quotedOutput: String(route.outAmount),
            inputMint: p.inputMint as string,
            outputMint: p.outputMint as string,
          },
        };
      }
    }
  } else if (key === "archive.exportAddressHistory") {
    return executeRead(
      "transaction.getHistory",
      {
        ...p,
        address: p.archiveAddress,
        historyDetails: "full",
        historyFilters: {},
        commitment: "finalized",
        retrieval: "upToLimit",
        pageSize: 100,
        totalLimit: integer(p.exportLimit ?? 100, "Export limit", 1, 10000),
        requestBudget: 100,
        paginationToken: p.archiveCursor ?? "",
      },
      rpc,
    );
  } else if (key === "archive.exportBlocks") {
    const start = integer(p.startSlot, "Start slot");
    const end = integer(p.endSlot, "End slot", start, start + 1000);
    const slots = (await rpc("getBlocks", [
      start,
      end,
      { commitment: "finalized" },
    ])) as unknown[];
    if (!Array.isArray(slots) || slots.length > 1001)
      throw new TritonError(
        "INVALID_RESPONSE",
        "Invalid block range response.",
      );
    const rows = [];
    let bytes = 0;
    const maxBlocks = integer(p.maxBlocks ?? 25, "Maximum blocks", 1, 100);
    for (const slot of slots.slice(0, maxBlocks)) {
      const block = {
        slot,
        data: await rpc("getBlock", [
          integer(slot, "Slot"),
          {
            commitment: "finalized",
            encoding: "json",
            transactionDetails: "full",
            maxSupportedTransactionVersion: 1,
          },
        ]),
      };
      const size = Buffer.byteLength(JSON.stringify(block));
      if (bytes + size > 32 * 1024 * 1024) break;
      rows.push(block);
      bytes += size;
    }
    if (slots.length && !rows.length)
      throw new TritonError(
        "RESPONSE_TOO_LARGE",
        "First block exceeds the export memory budget.",
      );
    const complete = rows.length === slots.length;
    return {
      data: rows,
      meta: {
        service: key,
        complete,
        nextStartSlot: complete ? null : integer(rows.at(-1)!.slot, "Slot") + 1,
        endSlot: end,
        requests: rows.length + 1,
      },
    };
  } else if (key.startsWith("administration.")) {
    const credential = await context.getCredentials("tritonManagementApi");
    const paths: Record<string, string> = {
      listAccounts: "accounts",
      listSubscriptions: "subscriptions",
      listEndpoints: "endpoints",
      listTokens: "tokens",
      listWatchLists: "address_watch_lists",
    };
    const path = paths[key.split(".")[1]];
    if (!path)
      throw new TritonError(
        "INVALID_INPUT",
        "Unsupported administration operation.",
      );
    try {
      data = await context.helpers.httpRequest({
        method: "GET",
        url: `https://customers.triton.one/api/v1/${path}`,
        qs: {
          page: integer(p.adminPage ?? 1, "Page", 1),
          per: integer(p.adminPageSize ?? 50, "Page size", 1, 100),
        },
        headers: {
          Authorization: text(credential.apiToken, "Management token"),
          Accept: "application/json",
        },
        json: true,
        timeout: 30000,
        disableFollowRedirect: true,
      });
      data = redactAdministration(data);
    } catch {
      throw new TritonError(
        "MANAGEMENT_ERROR",
        "Management request failed. Check token role and service access.",
      );
    }
  } else if (key.startsWith("worker.")) {
    const credential = await context.getCredentials("tritonWorkerApi");
    const url = workerEndpoint(credential.endpoint);
    const operation = key.split(".")[1];
    const paths: Record<string, string> = {
      getStatus: "status",
      getAccount: "account",
      getEvents: "events",
      acknowledgeEvents: "ack",
    };
    const target = new URL(
      paths[operation],
      url.href.endsWith("/") ? url.href : url.href + "/",
    );
    try {
      data = await context.helpers.httpRequest({
        method: operation === "acknowledgeEvents" ? "POST" : "GET",
        url: target.href,
        headers: {
          Authorization: `Bearer ${text(credential.apiToken, "Worker token")}`,
        },
        qs:
          operation === "getAccount"
            ? {
                address: address(p.workerAddress),
                maxSlotLag: integer(
                  p.maxSlotLag ?? 75,
                  "Maximum slot lag",
                  0,
                  10000,
                ),
              }
            : operation === "getEvents"
              ? {
                  consumer: text(p.consumer, "Consumer"),
                  limit: integer(p.eventLimit ?? 100, "Event limit", 1, 1000),
                }
              : undefined,
        body:
          operation === "acknowledgeEvents"
            ? {
                consumer: text(p.consumer, "Consumer"),
                receipt: text(p.receipt, "Receipt"),
              }
            : undefined,
        json: true,
        timeout: 30000,
        disableFollowRedirect: true,
      });
    } catch {
      throw new TritonError(
        "WORKER_ERROR",
        "Worker request failed. Check health, authentication and input.",
      );
    }
  } else throw new TritonError("INVALID_INPUT", "Unknown service operation.");
  return { data: jsonSafe(data), meta: { service: key } as IDataObject };
}
function arrayOrEmpty(value: unknown): unknown[] {
  if (!value || value === "[]") return [];
  return array(value, "Policies", 8);
}
export function redactAdministration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAdministration);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            ![
              "value",
              "tokens",
              "auth_username",
              "billing_address1",
              "billing_address2",
              "billing_address3",
              "telephone",
              "pay_stream_id",
            ].includes(k) && !/secret|password|api.?key/i.test(k),
        )
        .map(([k, v]) => [k, redactAdministration(v)]),
    );
  return value;
}
