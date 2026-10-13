import type { IDataObject } from "n8n-workflow";
import { TOKEN_PROGRAMS, PAGINATED, methodFor } from "./apiContract";
import {
  address,
  array,
  atomic,
  choice,
  encoded,
  fail,
  integer,
  json,
  object,
  signature,
  sol,
  text,
} from "./validation";
import { TritonError } from "./errors";
import type { Rpc } from "./transport";

export type Parameters = Record<string, unknown>;
type Params = unknown[] | Record<string, unknown>;
export interface Request {
  method: string;
  params: Params;
  commitment?: string;
}
const blank = (v: unknown) => v === "" || v === undefined || v === null;
const bool = (v: unknown): boolean =>
  typeof v === "boolean" ? v : fail("Expected a boolean option.");
export function buildRequest(key: string, p: Parameters): Request {
  const [resource, operation] = key.split(".");
  const method = methodFor(resource, operation);
  if (!method || key === "transaction.submit")
    return fail("Unsupported read operation.");
  const commitment = choice(
    p.commitment ?? "finalized",
    ["confirmed", "finalized"],
    "Commitment",
  );
  const config: Record<string, unknown> = { commitment };
  const ctx = !blank(p.minContextSlot)
    ? { minContextSlot: integer(p.minContextSlot, "Minimum context slot") }
    : {};
  const enc = () =>
    choice(
      p.accountEncoding ?? "base64",
      ["base64", "jsonParsed"],
      "Account encoding",
    );
  const txEnc = () =>
    choice(
      p.transactionEncoding ?? "json",
      ["json", "jsonParsed", "base64", "base58"],
      "Transaction encoding",
    );
  const slice = () => {
    const value = object(p.dataSlice ?? {}, "Data slice");
    if (!Object.keys(value).length) return {};
    if (enc() !== "base64")
      return fail("Data slicing requires base64 account encoding.");
    return {
      dataSlice: {
        offset: integer(value.offset ?? 0, "Data slice offset"),
        length: integer(value.length, "Data slice length"),
      },
    };
  };
  const addr = () => address(p.address);
  let params: Params = [];
  let appliesCommitment = true;
  switch (key) {
    case "account.getBalance":
      params = [addr(), { ...config, ...ctx }];
      break;
    case "account.get":
      params = [addr(), { ...config, ...ctx, ...slice(), encoding: enc() }];
      break;
    case "account.getMany":
      params = [
        array(p.addresses, "Addresses", 100).map(address),
        { ...config, ...ctx, ...slice(), encoding: enc() },
      ];
      break;
    case "account.getByProgram": {
      const entries =
        object(p.programFilters ?? {}, "Program filters").filters ?? [];
      if (!Array.isArray(entries) || entries.length > 4)
        return fail("Use at most four program filters.");
      const filters = entries.map((v: unknown) => {
        const f = object(v, "Program filter");
        const offset = integer(f.offset, "Size / offset");
        if (f.kind === "dataSize") return { dataSize: offset };
        if (
          f.kind !== "memcmp" ||
          typeof f.bytes !== "string" ||
          !/^[1-9A-HJ-NP-Za-km-z]+$/.test(f.bytes) ||
          f.bytes.length > 175
        )
          return fail(
            "Memcmp requires a base58 byte string of at most 175 characters.",
          );
        return { memcmp: { offset, bytes: f.bytes } };
      });
      if (!filters.length && p.allowUnfiltered !== true)
        return fail(
          "Add a program filter or explicitly enable unfiltered scans.",
        );
      params = [
        addr(),
        {
          ...config,
          ...ctx,
          ...slice(),
          encoding: enc(),
          withContext: true,
          filters,
        },
      ];
      break;
    }
    case "token.getBalance":
    case "token.getSupply":
    case "token.getLargestAccounts":
      params = [addr(), config];
      break;
    case "token.getByOwner":
    case "token.getByDelegate": {
      const mode = choice(
        p.tokenFilter ?? "spl",
        ["spl", "token2022", "mint"],
        "Token filter",
      );
      params = [
        addr(),
        mode === "mint"
          ? { mint: address(p.mint) }
          : { programId: TOKEN_PROGRAMS[mode] },
        { ...config, ...ctx, ...slice(), encoding: enc() },
      ];
      break;
    }
    case "transaction.get":
      params = [
        signature(p.signature),
        { ...config, encoding: txEnc(), maxSupportedTransactionVersion: 1 },
      ];
      break;
    case "transaction.getStatuses":
      appliesCommitment = false;
      params = [
        array(p.signatures, "Signatures", 256).map(signature),
        { searchTransactionHistory: bool(p.searchTransactionHistory ?? false) },
      ];
      break;
    case "transaction.getSignatures":
      params = [
        addr(),
        {
          ...config,
          ...ctx,
          limit: integer(p.pageSize ?? 50, "Page size", 1, 1000),
          ...(!blank(p.before) ? { before: signature(p.before) } : {}),
          ...(!blank(p.until) ? { until: signature(p.until) } : {}),
        },
      ];
      break;
    case "transaction.getHistory": {
      const details = choice(
        p.historyDetails ?? "signatures",
        ["signatures", "full"],
        "History details",
      );
      const input = object(p.historyFilters ?? {}, "History filters");
      const filters: Record<string, unknown> = {};
      for (const name of Object.keys(input)) {
        if (name === "status")
          filters.status = choice(
            input[name],
            ["any", "succeeded", "failed"],
            "Status",
          );
        else if (name === "tokenAccounts")
          filters.tokenAccounts = choice(
            input[name],
            ["none", "balanceChanged", "all"],
            "Token accounts",
          );
        else {
          const pair = (
            {
              slotGte: ["slot", "gte"],
              slotLt: ["slot", "lt"],
              slotGt: ["slot", "gt"],
              slotLte: ["slot", "lte"],
              blockTimeGte: ["blockTime", "gte"],
              blockTimeLt: ["blockTime", "lt"],
              blockTimeGt: ["blockTime", "gt"],
              blockTimeLte: ["blockTime", "lte"],
              blockTimeEq: ["blockTime", "eq"],
              signatureGte: ["signature", "gte"],
              signatureGt: ["signature", "gt"],
              signatureLte: ["signature", "lte"],
              signatureLt: ["signature", "lt"],
            } as Record<string, string[]>
          )[name];
          if (!pair) return fail("Unsupported history filter.");
          filters[pair[0]] = {
            ...((filters[pair[0]] as object) ?? {}),
            [pair[1]]:
              pair[0] === "signature"
                ? signature(input[name])
                : integer(input[name], name),
          };
        }
      }
      params = [
        addr(),
        {
          ...config,
          ...ctx,
          transactionDetails: details,
          sortOrder: choice(
            p.sortOrder ?? "desc",
            ["asc", "desc"],
            "Sort order",
          ),
          limit: integer(
            p.pageSize ?? 50,
            "Page size",
            1,
            details === "full" ? 100 : 1000,
          ),
          ...(!blank(p.paginationToken)
            ? { paginationToken: String(p.paginationToken) }
            : {}),
          filters,
          ...(details === "full"
            ? { encoding: txEnc(), maxSupportedTransactionVersion: 1 }
            : {}),
        },
      ];
      break;
    }
    case "network.getHealth":
    case "network.getVersion":
    case "network.getGenesisHash":
      appliesCommitment = false;
      break;
    case "network.getSlot":
    case "network.getBlockHeight":
    case "network.getEpochInfo":
    case "network.getLatestBlockhash":
      params = [{ ...config, ...ctx }];
      break;
    case "block.getTime":
      appliesCommitment = false;
      params = [integer(p.slot, "Slot")];
      break;
    case "block.get":
      params = [
        integer(p.slot, "Slot"),
        {
          ...config,
          encoding: txEnc(),
          transactionDetails: choice(
            p.blockDetails ?? "signatures",
            ["signatures", "none", "full"],
            "Block details",
          ),
          rewards: bool(p.rewards ?? false),
          maxSupportedTransactionVersion: 1,
        },
      ];
      break;
    case "fee.getForMessage":
      params = [
        Buffer.from(encoded(p.message, "Message")).toString("base64"),
        config,
      ];
      break;
    case "fee.getRecentPriorityFees": {
      appliesCommitment = false;
      const accounts = json(p.writableAccounts ?? [], "Writable accounts");
      if (!Array.isArray(accounts) || accounts.length > 128)
        return fail("Provide at most 128 writable accounts.");
      params = [accounts.map(address)];
      const mode = choice(
        p.feeMode ?? "minimum",
        ["minimum", "percentile"],
        "Fee mode",
      );
      if (mode === "percentile")
        params.push({
          percentile: integer(p.percentile ?? 5000, "Percentile", 1, 10000),
        });
      break;
    }
    case "digitalAsset.get":
    case "digitalAsset.getProof":
      appliesCommitment = false;
      params = { id: addr() };
      break;
    case "digitalAsset.getMany":
      appliesCommitment = false;
      params = { ids: array(p.addresses, "Asset IDs", 100).map(address) };
      break;
    case "digitalAsset.getByOwner":
      appliesCommitment = false;
      params = [
        addr(),
        {
          sortBy: choice(
            p.assetSort ?? "created",
            ["created", "updated", "recentAction", "none"],
            "Asset sort",
          ),
          sortDirection: choice(
            p.sortOrder ?? "desc",
            ["asc", "desc"],
            "Sort order",
          ),
        },
        integer(p.pageSize ?? 50, "Page size", 1, 1000),
        integer(p.page ?? 1, "Page", 1),
        null,
        null,
      ];
      break;
    case "digitalAsset.search":
    case "digitalAsset.getTokenAccounts": {
      appliesCommitment = false;
      const input = object(p.assetFilters ?? {}, "Asset filters");
      const allowed = key.endsWith("getTokenAccounts")
        ? ["mintAddress", "ownerAddress"]
        : [
            "ownerAddress",
            "tokenType",
            "creatorAddress",
            "authorityAddress",
            "compressed",
            "burnt",
            "creatorVerified",
            "negate",
            "conditionType",
            "interface",
            "ownerType",
            "groupingKey",
            "groupingValue",
            "delegateAddress",
            "frozen",
            "supply",
            "supplyMint",
            "compressible",
            "royaltyTargetType",
            "royaltyTarget",
            "royaltyAmount",
            "jsonUri",
          ];
      const filters: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(input)) {
        if (!allowed.includes(name))
          return fail(
            "This asset filter is not supported by the selected operation.",
          );
        if (blank(value)) continue;
        if (name === "groupingKey" || name === "groupingValue") continue;
        if (
          name.endsWith("Address") ||
          name === "supplyMint" ||
          name === "royaltyTarget"
        )
          filters[name] = address(value);
        else if (name === "tokenType")
          filters[name] = choice(value, ["All"], name);
        else if (name === "conditionType")
          filters[name] = choice(value, ["all", "any"], name);
        else if (name === "interface")
          filters[name] = choice(
            value,
            [
              "V1_NFT",
              "V1_PRINT",
              "LEGACY_NFT",
              "V2_NFT",
              "FungibleAsset",
              "Custom",
              "Identity",
              "Executable",
            ],
            name,
          );
        else if (name === "ownerType")
          filters[name] = choice(value, ["single", "token"], name);
        else if (name === "royaltyTargetType")
          filters[name] = choice(value, ["creators", "fanout", "single"], name);
        else if (name === "supply") filters[name] = integer(value, name);
        else if (name === "royaltyAmount") {
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > Number.MAX_SAFE_INTEGER
          )
            return fail("Royalty amount must be a finite nonnegative number.");
          filters[name] = value;
        } else if (name === "jsonUri") filters[name] = text(value, "JSON URI");
        else filters[name] = bool(value);
      }
      if (!blank(input.groupingKey) || !blank(input.groupingValue))
        filters.grouping = [
          text(input.groupingKey, "Grouping key"),
          text(input.groupingValue, "Grouping value"),
        ];
      if (!Object.keys(filters).length)
        return fail("Provide at least one asset filter.");
      params = {
        ...filters,
        page: integer(p.page ?? 1, "Page", 1),
        limit: integer(p.pageSize ?? 50, "Page size", 1, 1000),
        ...(key === "digitalAsset.search"
          ? {
              sortBy: {
                sortBy: choice(
                  p.assetSort ?? "created",
                  ["created", "updated", "recentAction", "none"],
                  "Asset sort",
                ),
                sortDirection: choice(
                  p.sortOrder ?? "desc",
                  ["asc", "desc"],
                  "Sort order",
                ),
              },
            }
          : {}),
      };
      break;
    }
  }
  return { method, params, ...(appliesCommitment ? { commitment } : {}) };
}

export function records(key: string, result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const value =
      key === "transaction.getHistory"
        ? obj.data
        : key === "digitalAsset.getTokenAccounts"
          ? obj.token_accounts
          : key.startsWith("digitalAsset.")
            ? obj.items
            : obj.value;
    if (Array.isArray(value)) return value;
  }
  throw new TritonError(
    "INVALID_RESPONSE",
    "Expected a collection in the provider response.",
  );
}
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        ["lamports", "amount", "delegated_amount", "supply"].includes(k) &&
        (typeof v === "number" || typeof v === "string")
          ? atomic(v)
          : normalize(v),
      ]),
    );
  }
  return value;
}
export interface ReadResult {
  data: unknown;
  meta: IDataObject;
  split?: unknown[];
}
export async function executeRead(
  key: string,
  p: Parameters,
  rpc: Rpc,
): Promise<ReadResult> {
  const base = buildRequest(
    key,
    key === "account.getMany"
      ? { ...p, addresses: array(p.addresses, "Addresses").slice(0, 100) }
      : key === "transaction.getStatuses"
        ? { ...p, signatures: array(p.signatures, "Signatures").slice(0, 256) }
        : p,
  );
  const meta: IDataObject = {
    method: base.method,
    ...(base.commitment ? { requestedCommitment: base.commitment } : {}),
  };
  if (p.address) meta.address = address(p.address);
  if (p.signature) meta.signature = signature(p.signature);
  if (key === "account.getMany" || key === "transaction.getStatuses") {
    const name = key === "account.getMany" ? "addresses" : "signatures";
    const cap = name === "addresses" ? 100 : 256;
    const inputs = array(p[name], name).map(
      name === "addresses" ? address : signature,
    );
    const budget = integer(p.requestBudget ?? 20, "Request budget", 1, 100);
    if (Math.ceil(inputs.length / cap) > budget)
      throw new TritonError(
        "REQUEST_BUDGET",
        "Increase the request budget or shorten the input list.",
      );
    const values: unknown[] = [];
    const contexts: unknown[] = [];
    for (let i = 0; i < inputs.length; i += cap) {
      const req = buildRequest(key, { ...p, [name]: inputs.slice(i, i + cap) });
      const result = (await rpc(req.method, req.params)) as Record<
        string,
        unknown
      >;
      const batch = records(key, result);
      if (batch.length !== Math.min(cap, inputs.length - i))
        throw new TritonError(
          "INVALID_RESPONSE",
          "Positional batch response length does not match the input.",
        );
      values.push(...batch);
      contexts.push(result.context ?? null);
    }
    meta.requestIdentities = inputs;
    meta.contexts = contexts as IDataObject[];
    const data = normalize({ value: values });
    return { data, meta, split: records(key, data) };
  }
  if (PAGINATED.includes(key)) {
    const retrieval = choice(
      p.retrieval ?? "onePage",
      ["onePage", "upToLimit"],
      "Retrieval",
    );
    const pageSize = integer(
      p.pageSize ?? 50,
      "Page size",
      1,
      key === "transaction.getHistory" && p.historyDetails === "full"
        ? 100
        : 1000,
    );
    const limit =
      retrieval === "onePage"
        ? pageSize
        : integer(p.totalLimit ?? 100, "Total limit", 1, 10000);
    const budget = integer(p.requestBudget ?? 20, "Request budget", 1, 100);
    const collected: unknown[] = [];
    const seen = new Set<string>();
    const fingerprints = new Set<string>();
    let next: string | number | null =
      key === "transaction.getHistory"
        ? String(p.paginationToken ?? "")
        : key === "transaction.getSignatures"
          ? String(p.before ?? "")
          : integer(p.page ?? 1, "Page", 1);
    let requests = 0;
    let complete = false;
    let result: unknown;
    while (requests < budget && collected.length < limit) {
      const size = Math.min(pageSize, limit - collected.length);
      const args: Parameters = {
        ...p,
        pageSize: size,
        ...(key === "transaction.getHistory"
          ? { paginationToken: next }
          : key === "transaction.getSignatures"
            ? { before: next }
            : { page: next }),
      };
      const req = buildRequest(key, args);
      result = await rpc(req.method, req.params);
      requests++;
      const page = records(key, result);
      if (page.length > size)
        throw new TritonError(
          "INVALID_RESPONSE",
          "Provider exceeded the requested page size; refusing an unsafe continuation.",
        );
      const fingerprint = JSON.stringify(page);
      if (page.length && fingerprints.has(fingerprint))
        throw new TritonError(
          "PAGINATION_STALLED",
          "Provider repeated a page.",
        );
      fingerprints.add(fingerprint);
      collected.push(...page);
      if (key === "transaction.getHistory") {
        const token = (result as Record<string, unknown>).paginationToken;
        if (token !== null && token !== undefined && typeof token !== "string")
          throw new TritonError(
            "INVALID_RESPONSE",
            "History cursor has an invalid type.",
          );
        next = token ? String(token) : null;
        complete = next === null;
      } else if (key === "transaction.getSignatures") {
        next = page.length
          ? signature(
              (page[page.length - 1] as Record<string, unknown>).signature,
            )
          : null;
        complete = page.length === 0;
      } else {
        next = Number(next) + 1;
        complete = page.length === 0;
      }
      if (complete) {
        next = null;
        break;
      }
      const marker = String(next);
      if (
        seen.has(marker) ||
        marker ===
          String(
            key === "transaction.getHistory"
              ? args.paginationToken
              : key === "transaction.getSignatures"
                ? args.before
                : args.page,
          )
      )
        throw new TritonError(
          "PAGINATION_STALLED",
          "Provider cursor did not advance.",
        );
      seen.add(marker);
      if (retrieval === "onePage") break;
    }
    if (!complete && collected.length < limit && retrieval === "upToLimit")
      throw new TritonError(
        "REQUEST_BUDGET",
        "Retrieval exceeded its request budget. No partial result was emitted.",
      );
    meta.pagination = {
      requests,
      count: collected.length,
      complete,
      continuation: next,
      truncated: !complete,
    };
    return {
      data: normalize(collected),
      meta,
      split: normalize(collected) as unknown[],
    };
  }
  const result = await rpc(base.method, base.params);
  if (result && typeof result === "object" && "context" in result)
    meta.context = (result as { context: IDataObject }).context;
  if (key === "account.getBalance") {
    const value = (result as { value: unknown })?.value;
    return { data: { lamports: atomic(value), sol: sol(value) }, meta };
  }
  if (
    key === "account.get" &&
    result &&
    (result as { value: unknown }).value === null
  )
    return { data: null, meta };
  const data = normalize(result);
  if (key === "digitalAsset.getMany") {
    const rows = records(key, data);
    meta.requestedAssetIds = array(p.addresses, "Asset IDs").map(
      address,
    ) as string[];
    for (const row of rows)
      if (row !== null && (typeof row !== "object" || !("id" in row)))
        throw new TritonError(
          "INVALID_RESPONSE",
          "Asset batch result lacks an ID.",
        );
  }
  return { data, meta };
}
