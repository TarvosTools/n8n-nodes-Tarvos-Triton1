import type { INodeProperties } from "n8n-workflow";
import {
  address,
  array,
  choice,
  integer,
  object,
  signature,
  text,
} from "./validation";
import type { Rpc } from "./transport";
import { TritonError } from "./errors";

type Field = [
  string,
  "address" | "addresses" | "integer" | "string" | "boolean" | "signature",
  unknown,
];
type Spec = {
  method: string;
  fields?: Field[];
  config?: boolean;
  max?: number;
};
export const EXTRA: Record<string, Spec> = {
  "account.getRentExemption": {
    method: "getMinimumBalanceForRentExemption",
    fields: [["dataSize", "integer", 165]],
    config: true,
  },
  "token.getByMint": {
    method: "getTokenAccountsByMint",
    fields: [["mintAddress", "address", ""]],
    config: true,
  },
  "block.getRange": {
    method: "getBlocks",
    fields: [
      ["startSlot", "integer", 0],
      ["endSlot", "integer", 0],
    ],
    config: true,
  },
  "block.getWithLimit": {
    method: "getBlocksWithLimit",
    fields: [
      ["startSlot", "integer", 0],
      ["limit", "integer", 100],
    ],
    config: true,
  },
  "block.getCommitment": {
    method: "getBlockCommitment",
    fields: [["slot", "integer", 0]],
  },
  "block.getProduction": { method: "getBlockProduction", config: true },
  "network.getPerformanceSamples": {
    method: "getRecentPerformanceSamples",
    fields: [["limit", "integer", 10]],
  },
  "network.getTransactionCount": {
    method: "getTransactionCount",
    config: true,
  },
  "network.getSupply": { method: "getSupply", config: true },
  "network.getVoteAccounts": { method: "getVoteAccounts", config: true },
  "network.getClusterNodes": { method: "getClusterNodes" },
  "network.getEpochSchedule": { method: "getEpochSchedule" },
  "network.getLeaderSchedule": {
    method: "getLeaderSchedule",
    fields: [["slot", "integer", 0]],
    config: true,
  },
  "network.getSlotLeader": { method: "getSlotLeader", config: true },
  "network.getSlotLeaders": {
    method: "getSlotLeaders",
    fields: [
      ["startSlot", "integer", 0],
      ["limit", "integer", 100],
    ],
  },
  "network.getFirstAvailableBlock": { method: "getFirstAvailableBlock" },
  "network.getMinimumLedgerSlot": { method: "minimumLedgerSlot" },
  "network.getInflationRate": { method: "getInflationRate" },
  "network.getInflationGovernor": {
    method: "getInflationGovernor",
    config: true,
  },
  "network.getInflationReward": {
    method: "getInflationReward",
    fields: [["addresses", "addresses", "[]"]],
    config: true,
  },
  "transaction.isBlockhashValid": {
    method: "isBlockhashValid",
    fields: [["blockhash", "address", ""]],
    config: true,
  },
  "digitalAsset.getProofs": {
    method: "getAssetProofs",
    fields: [["ids", "addresses", "[]"]],
  },
  "digitalAsset.getAssetSignatures": {
    method: "getAssetSignatures",
    fields: [["id", "address", ""]],
  },
  "digitalAsset.getByAuthority": {
    method: "getAssetsByAuthority",
    fields: [["authorityAddress", "address", ""]],
  },
  "digitalAsset.getByCreator": {
    method: "getAssetsByCreator",
    fields: [
      ["creatorAddress", "address", ""],
      ["onlyVerified", "boolean", true],
    ],
  },
  "digitalAsset.getEditions": {
    method: "getNftEditions",
    fields: [["mintAddress", "address", ""]],
  },
};
const label = (s: string) =>
  s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const show = (key: string) => ({
  show: { resource: [key.split(".")[0]], operation: [key.split(".")[1]] },
});
export const configKeys: Record<string, string[]> = {
  "token.getByMint": ["encoding", "dataSlice", "programId", "minContextSlot"],
  "block.getProduction": ["identity", "range"],
  "network.getSupply": ["excludeNonCirculatingAccountsList"],
  "network.getVoteAccounts": [
    "votePubkey",
    "keepUnstakedDelinquents",
    "delinquentSlotDistance",
  ],
  "network.getLeaderSchedule": ["identity"],
  "network.getInflationReward": ["epoch", "minContextSlot"],
  "network.getTransactionCount": ["minContextSlot"],
  "network.getSlotLeader": ["minContextSlot"],
  "transaction.isBlockhashValid": ["minContextSlot"],
};
export function extraProperties(): INodeProperties[] {
  return Object.entries(EXTRA).flatMap(([key, spec]) => [
    ...(spec.fields ?? []).map(
      ([name, type, def]): INodeProperties => ({
        displayName: label(name),
        name: `extra_${name}`,
        type:
          type === "integer"
            ? "number"
            : type === "boolean"
              ? "boolean"
              : type === "addresses"
                ? "json"
                : "string",
        default: def as string,
        required: true,
        displayOptions: show(key),
      }),
    ),
    ...(spec.config
      ? [
          {
            displayName: "Query Options",
            name: "extra_options",
            type: "json",
            default: '{"commitment":"finalized"}',
            description: `Allowed options: commitment${configKeys[key]?.length ? ", " + configKeys[key].join(", ") : ""}`,
            displayOptions: show(key),
          } as INodeProperties,
        ]
      : []),
    ...([
      "digitalAsset.getByAuthority",
      "digitalAsset.getByCreator",
      "digitalAsset.getEditions",
    ].includes(key)
      ? ([
          {
            displayName: "Page",
            name: "extra_page",
            type: "number",
            default: 1,
            displayOptions: show(key),
          },
          {
            displayName: "Page Size",
            name: "extra_limit",
            type: "number",
            default: 100,
            displayOptions: show(key),
          },
        ] as INodeProperties[])
      : []),
  ]);
}
export function extraRequest(
  key: string,
  p: Record<string, unknown>,
): { method: string; params: unknown[] | Record<string, unknown> } {
  if (!Object.hasOwn(EXTRA, key))
    throw new TritonError("INVALID_INPUT", "Unknown extended operation.");
  const spec = EXTRA[key];
  const params: unknown[] = (spec.fields ?? []).map(([name, kind, def]) => {
    const value = p[`extra_${name}`] ?? def;
    if (kind === "address") return address(value);
    if (kind === "addresses") return array(value, name, 100).map(address);
    if (kind === "signature") return signature(value);
    if (kind === "integer") return integer(value, name);
    if (kind === "boolean") {
      if (typeof value !== "boolean")
        throw new TritonError("INVALID_INPUT", "Expected a boolean.");
      return value;
    }
    return text(value, name);
  });
  if (
    key === "block.getRange" &&
    (Number(params[1]) < Number(params[0]) ||
      Number(params[1]) - Number(params[0]) > 10000)
  )
    throw new TritonError(
      "INVALID_INPUT",
      "Select an ascending block range of at most 10,000 slots.",
    );
  if (key === "block.getWithLimit" || key === "network.getSlotLeaders")
    integer(params[1], "Limit", 1, 5000);
  if (key === "network.getPerformanceSamples")
    integer(params[0], "Limit", 1, 720);
  if (spec.config) {
    const config = object(p.extra_options ?? {}, "Query options");
    for (const name of Object.keys(config))
      if (!["commitment", ...(configKeys[key] ?? [])].includes(name))
        throw new TritonError(
          "INVALID_INPUT",
          `Unsupported query option: ${name}.`,
        );
    if (config.commitment !== undefined)
      choice(config.commitment, ["confirmed", "finalized"], "Commitment");
    for (const name of ["minContextSlot", "epoch", "delinquentSlotDistance"])
      if (config[name] !== undefined)
        config[name] = integer(config[name], name);
    for (const name of ["identity", "votePubkey", "programId"])
      if (config[name] !== undefined) config[name] = address(config[name]);
    for (const name of [
      "keepUnstakedDelinquents",
      "excludeNonCirculatingAccountsList",
    ])
      if (config[name] !== undefined && typeof config[name] !== "boolean")
        throw new TritonError(
          "INVALID_INPUT",
          "Expected a boolean query option.",
        );
    if (config.encoding !== undefined)
      choice(config.encoding, ["base64", "jsonParsed"], "Encoding");
    if (config.dataSlice !== undefined) {
      const slice = object(config.dataSlice, "Data slice");
      config.dataSlice = {
        offset: integer(slice.offset, "Offset"),
        length: integer(slice.length, "Length"),
      };
      if (config.encoding === "jsonParsed")
        throw new TritonError("INVALID_INPUT", "Data slicing requires base64.");
    }
    if (config.range !== undefined) {
      const range = object(config.range, "Slot range");
      config.range = {
        firstSlot: integer(range.firstSlot, "First slot"),
        ...(range.lastSlot !== undefined
          ? { lastSlot: integer(range.lastSlot, "Last slot") }
          : {}),
      };
    }
    if (key === "token.getByMint") config.encoding ??= "base64";
    params.push(config);
  }
  if (key === "digitalAsset.getProofs")
    return { method: spec.method, params: { ids: params[0] } };
  if (key === "digitalAsset.getAssetSignatures")
    return { method: spec.method, params: { id: params[0] } };
  const page = () => integer(p.extra_page ?? 1, "Page", 1);
  const limit = () => integer(p.extra_limit ?? 100, "Page size", 1, 1000);
  if (key === "digitalAsset.getEditions")
    return {
      method: spec.method,
      params: { mintAddress: params[0], page: page(), limit: limit() },
    };
  if (
    key === "digitalAsset.getByAuthority" ||
    key === "digitalAsset.getByCreator"
  )
    params.push(
      { sortBy: "created", sortDirection: "desc" },
      limit(),
      page(),
      null,
      null,
    );
  return { method: spec.method, params };
}
export async function executeExtra(
  key: string,
  p: Record<string, unknown>,
  rpc: Rpc,
) {
  const request = extraRequest(key, p);
  return {
    data: await rpc(request.method, request.params),
    meta: { method: request.method },
  };
}
export function appendOperations(
  properties: INodeProperties[],
  registry: Record<string, string[]>,
) {
  const resource = properties.find((p) => p.name === "resource")!;
  for (const [name, ops] of Object.entries(registry)) {
    let menu = properties.find(
      (p) =>
        p.name === "operation" &&
        p.displayOptions?.show?.resource?.includes(name),
    );
    if (!menu) {
      (resource.options as { name: string; value: string }[]).push({
        name: label(name),
        value: name,
      });
      menu = {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: ops[0],
        displayOptions: { show: { resource: [name] } },
        options: [],
      };
      properties.push(menu);
    }
    for (const op of ops)
      (menu.options as object[]).push({
        name: label(op),
        value: op,
        action: `${label(op)} ${name}`,
      });
  }
}
