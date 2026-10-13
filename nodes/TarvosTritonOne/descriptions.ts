import { tradeProperties } from "./tradeExperience";
import { simpleActionProperties } from "./experience";
import { guidedProperties } from "./guided";
import { withHelp, resourceHelp } from "./help";
import type { INodeProperties } from "n8n-workflow";
import { OPERATIONS, PAGINATED, COLLECTIONS } from "./apiContract";
import { extendProperties } from "./serviceDescriptions";

const pretty = (s: string) =>
  s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const fieldKeys = new Map<INodeProperties, string[]>();
const field = (
  displayName: string,
  name: string,
  keys: string[],
  extra: Partial<INodeProperties> = {},
): INodeProperties => {
  const result: INodeProperties = {
    displayName,
    name,
    type: "string",
    default: "",
    ...extra,
  };
  fieldKeys.set(result, keys);
  return result;
};
const options = (values: string[]) =>
  values.map((value) => ({ name: pretty(value), value }));
const all = Object.entries(OPERATIONS).flatMap(([r, ops]) =>
  Object.keys(ops).map((o) => `${r}.${o}`),
);
const reads = all.filter((k) => k !== "transaction.submit");
const rawProperties: INodeProperties[] = [
  {
    displayName: "Resource",
    name: "resource",
    type: "options",
    noDataExpression: true,
    default: "account",
    options: Object.keys(OPERATIONS).map((value) => ({
      name: pretty(value),
      value,
    })),
  },
  ...Object.entries(OPERATIONS).map(
    ([resource, ops]): INodeProperties => ({
      displayName: "Operation",
      name: "operation",
      type: "options",
      noDataExpression: true,
      default: Object.keys(ops)[0],
      displayOptions: { show: { resource: [resource] } },
      options: Object.keys(ops).map((value) => ({
        name: pretty(value),
        value,
        action: `${pretty(value)} ${pretty(resource).toLowerCase()}`,
      })),
    }),
  ),
  field(
    "Public Address",
    "address",
    [
      "account.getBalance",
      "account.get",
      "account.getByProgram",
      "token.getBalance",
      "token.getSupply",
      "token.getByOwner",
      "token.getByDelegate",
      "token.getLargestAccounts",
      "transaction.getSignatures",
      "transaction.getHistory",
      "digitalAsset.get",
      "digitalAsset.getByOwner",
      "digitalAsset.getProof",
    ],
    {
      required: true,
      description:
        "Wallet, program, token account, mint or asset address as required by the selected operation",
    },
  ),
  field(
    "Addresses (JSON Array)",
    "addresses",
    ["account.getMany", "digitalAsset.getMany"],
    { type: "json", default: "[]", required: true },
  ),
  field("Signature", "signature", ["transaction.get"], { required: true }),
  field("Signatures (JSON Array)", "signatures", ["transaction.getStatuses"], {
    type: "json",
    default: "[]",
    required: true,
  }),
  field("Slot", "slot", ["block.get", "block.getTime"], {
    type: "number",
    default: 0,
    typeOptions: { minValue: 0, numberPrecision: 0 },
  }),
  field("Commitment", "commitment", reads, {
    type: "options",
    default: "finalized",
    options: options(["finalized", "confirmed"]),
    description:
      "Applied only to RPC methods supporting commitment; DAS uses its own indexed state",
  }),
  field(
    "Account Encoding",
    "accountEncoding",
    [
      "account.get",
      "account.getMany",
      "account.getByProgram",
      "token.getByOwner",
      "token.getByDelegate",
    ],
    {
      type: "options",
      default: "base64",
      options: options(["base64", "jsonParsed"]),
    },
  ),
  field(
    "Data Slice",
    "dataSlice",
    ["account.get", "account.getMany", "account.getByProgram"],
    {
      type: "collection",
      default: {},
      placeholder: "Limit Account Bytes",
      options: [
        {
          displayName: "Offset",
          name: "offset",
          type: "number",
          default: 0,
          typeOptions: { minValue: 0, numberPrecision: 0 },
        },
        {
          displayName: "Length",
          name: "length",
          type: "number",
          default: 0,
          typeOptions: { minValue: 0, numberPrecision: 0 },
        },
      ],
    },
  ),
  field(
    "Transaction Encoding",
    "transactionEncoding",
    ["transaction.get", "transaction.getHistory", "block.get"],
    {
      type: "options",
      default: "json",
      options: options(["json", "jsonParsed", "base64", "base58"]),
    },
  ),
  field(
    "Token Filter",
    "tokenFilter",
    ["token.getByOwner", "token.getByDelegate"],
    {
      type: "options",
      default: "spl",
      options: [
        { name: "SPL Token Program", value: "spl" },
        { name: "Token-2022 Program", value: "token2022" },
        { name: "Mint", value: "mint" },
      ],
    },
  ),
  {
    displayName: "Mint",
    name: "mint",
    type: "string",
    default: "",
    displayOptions: {
      show: {
        resource: ["token"],
        operation: ["getByOwner", "getByDelegate"],
        tokenFilter: ["mint"],
      },
    },
  },
  field("Program Filters", "programFilters", ["account.getByProgram"], {
    type: "fixedCollection",
    default: {},
    typeOptions: { multipleValues: true },
    options: [
      {
        name: "filters",
        displayName: "Filters",
        values: [
          {
            displayName: "Kind",
            name: "kind",
            type: "options",
            default: "dataSize",
            options: options(["dataSize", "memcmp"]),
          },
          {
            displayName: "Size / Offset",
            name: "offset",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, numberPrecision: 0 },
          },
          {
            displayName: "Bytes (Base58, for Memcmp)",
            name: "bytes",
            type: "string",
            default: "",
          },
        ],
      },
    ],
  }),
  field(
    "Allow Unfiltered Program Scan",
    "allowUnfiltered",
    ["account.getByProgram"],
    {
      type: "boolean",
      default: false,
      description:
        "Whether to permit a potentially large unpaginated response; output limits do not reduce RPC cost",
    },
  ),
  field(
    "Historical Status Lookup",
    "searchTransactionHistory",
    ["transaction.getStatuses"],
    { type: "boolean", default: false },
  ),
  field("History Details", "historyDetails", ["transaction.getHistory"], {
    type: "options",
    default: "signatures",
    options: options(["signatures", "full"]),
  }),
  field(
    "Sort Order",
    "sortOrder",
    [
      "transaction.getHistory",
      "digitalAsset.getByOwner",
      "digitalAsset.search",
    ],
    { type: "options", default: "desc", options: options(["desc", "asc"]) },
  ),
  field("History Filters", "historyFilters", ["transaction.getHistory"], {
    type: "collection",
    default: {},
    placeholder: "Add Filter",
    options: [
      {
        displayName: "Status",
        name: "status",
        type: "options",
        default: "any",
        options: options(["any", "succeeded", "failed"]),
      },
      {
        displayName: "Token Accounts",
        name: "tokenAccounts",
        type: "options",
        default: "none",
        options: options(["none", "balanceChanged", "all"]),
      },
      {
        displayName: "Minimum Slot (Inclusive)",
        name: "slotGte",
        type: "number",
        default: 0,
      },
      {
        displayName: "Maximum Slot (Exclusive)",
        name: "slotLt",
        type: "number",
        default: 0,
      },
      {
        displayName: "Minimum Block Time (Unix Seconds)",
        name: "blockTimeGte",
        type: "number",
        default: 0,
      },
      {
        displayName: "Maximum Block Time (Unix Seconds, Exclusive)",
        name: "blockTimeLt",
        type: "number",
        default: 0,
      },
    ],
  }),
  field("Before Signature", "before", ["transaction.getSignatures"]),
  field("Until Signature", "until", ["transaction.getSignatures"]),
  field("Pagination Token", "paginationToken", ["transaction.getHistory"]),
  field("Block Transaction Details", "blockDetails", ["block.get"], {
    type: "options",
    default: "signatures",
    options: options(["signatures", "none", "full"]),
  }),
  field("Include Rewards", "rewards", ["block.get"], {
    type: "boolean",
    default: false,
  }),
  field("Serialized Message (Base64)", "message", ["fee.getForMessage"], {
    required: true,
  }),
  field(
    "Writable Accounts (JSON Array)",
    "writableAccounts",
    ["fee.getRecentPriorityFees"],
    { type: "json", default: "[]" },
  ),
  field("Fee Mode", "feeMode", ["fee.getRecentPriorityFees"], {
    type: "options",
    default: "minimum",
    options: options(["minimum", "percentile"]),
  }),
  field("Percentile (1–10000)", "percentile", ["fee.getRecentPriorityFees"], {
    type: "number",
    default: 5000,
    typeOptions: { minValue: 1, maxValue: 10000, numberPrecision: 0 },
  }),
  field(
    "Asset Sort",
    "assetSort",
    ["digitalAsset.getByOwner", "digitalAsset.search"],
    {
      type: "options",
      default: "created",
      options: options(["created", "updated", "recentAction", "none"]),
    },
  ),
  field(
    "Asset Filters",
    "assetFilters",
    ["digitalAsset.search", "digitalAsset.getTokenAccounts"],
    {
      type: "collection",
      default: {},
      placeholder: "Add Filter",
      options: [
        {
          displayName: "Owner Address",
          name: "ownerAddress",
          type: "string",
          default: "",
        },
        {
          displayName: "Mint Address (Token Accounts Only)",
          name: "mintAddress",
          type: "string",
          default: "",
        },
        {
          displayName: "Creator Address (Search Only)",
          name: "creatorAddress",
          type: "string",
          default: "",
        },
        {
          displayName: "Authority Address (Search Only)",
          name: "authorityAddress",
          type: "string",
          default: "",
        },
        {
          displayName: "Compressed (Search Only)",
          name: "compressed",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Burnt (Search Only)",
          name: "burnt",
          type: "boolean",
          default: false,
        },
        {
          displayName: "Creator Verified (Search Only)",
          name: "creatorVerified",
          type: "boolean",
          default: false,
        },
      ],
    },
  ),
  field(
    "Page",
    "page",
    [
      "digitalAsset.getByOwner",
      "digitalAsset.search",
      "digitalAsset.getTokenAccounts",
    ],
    {
      type: "number",
      default: 1,
      typeOptions: { minValue: 1, numberPrecision: 0 },
    },
  ),
  field("Retrieval", "retrieval", PAGINATED, {
    type: "options",
    default: "onePage",
    options: [
      { name: "One Page", value: "onePage" },
      { name: "Up to Limit", value: "upToLimit" },
    ],
  }),
  field("Page Size", "pageSize", PAGINATED, {
    type: "number",
    default: 50,
    typeOptions: { minValue: 1, maxValue: 1000, numberPrecision: 0 },
  }),
  field("Total Limit", "totalLimit", PAGINATED, {
    type: "number",
    default: 100,
    typeOptions: { minValue: 1, maxValue: 10000, numberPrecision: 0 },
  }),
  field(
    "Request Budget",
    "requestBudget",
    [...PAGINATED, "account.getMany", "transaction.getStatuses"],
    {
      type: "number",
      default: 20,
      typeOptions: { minValue: 1, maxValue: 100, numberPrecision: 0 },
    },
  ),
  field("Output", "outputMode", COLLECTIONS, {
    type: "options",
    default: "response",
    options: [
      { name: "Response", value: "response" },
      { name: "Split Records", value: "split" },
    ],
  }),
  field(
    "Prepared Transaction (Base64)",
    "transaction",
    ["transaction.submit"],
    {
      required: true,
      description:
        "Unsigned, partially signed, or fully signed serialized transaction according to the connected wallet mode",
    },
  ),
  field("Preflight Commitment", "preflightCommitment", ["transaction.submit"], {
    type: "options",
    default: "confirmed",
    options: options(["confirmed", "finalized"]),
  }),
  field("RPC Rebroadcast Retries", "maxRetries", ["transaction.submit"], {
    type: "number",
    default: 0,
    typeOptions: { minValue: 0, maxValue: 5, numberPrecision: 0 },
  }),
  field(
    "Minimum Context Slot",
    "minContextSlot",
    [
      "transaction.submit",
      "account.getBalance",
      "account.get",
      "account.getMany",
      "account.getByProgram",
      "transaction.getSignatures",
      "transaction.getHistory",
      "network.getSlot",
      "network.getBlockHeight",
      "network.getEpochInfo",
      "network.getLatestBlockhash",
    ],
    {
      type: "string",
      default: "",
      description: "Optional nonnegative integer. Leave blank to omit.",
    },
  ),
  {
    displayName: "Timeout (Seconds)",
    name: "timeout",
    type: "number",
    default: 30,
    typeOptions: { minValue: 5, maxValue: 120, numberPrecision: 0 },
  },
];
const historyOptions = rawProperties.find((p) => p.name === "historyFilters")!
  .options as INodeProperties[];
for (const [name, label] of Object.entries({
  slotGt: "Slot Greater Than",
  slotLte: "Slot Less Than or Equal",
  blockTimeGt: "Block Time Greater Than",
  blockTimeLte: "Block Time Less Than or Equal",
  blockTimeEq: "Block Time Equal",
}))
  historyOptions.push({
    displayName: label,
    name,
    type: "number",
    default: 0,
    typeOptions: { minValue: 0, numberPrecision: 0 },
  });
for (const [suffix, label] of Object.entries({
  Gte: "Greater Than or Equal",
  Gt: "Greater Than",
  Lte: "Less Than or Equal",
  Lt: "Less Than",
}))
  historyOptions.push({
    displayName: `Signature ${label}`,
    name: `signature${suffix}`,
    type: "string",
    default: "",
  });
const assetOptions = rawProperties.find((p) => p.name === "assetFilters")!
  .options as INodeProperties[];
for (const name of [
  "delegateAddress",
  "supplyMint",
  "royaltyTarget",
  "jsonUri",
  "groupingKey",
  "groupingValue",
])
  assetOptions.push({
    displayName: pretty(name),
    name,
    type: "string",
    default: "",
  });
for (const name of ["negate", "frozen", "compressible"])
  assetOptions.push({
    displayName: pretty(name),
    name,
    type: "boolean",
    default: false,
  });
for (const [name, values] of Object.entries({
  conditionType: ["all", "any"],
  interface: [
    "V1_NFT",
    "V1_PRINT",
    "LEGACY_NFT",
    "V2_NFT",
    "FungibleAsset",
    "Custom",
    "Identity",
    "Executable",
  ],
  ownerType: ["single", "token"],
  royaltyTargetType: ["creators", "fanout", "single"],
}))
  assetOptions.push({
    displayName: pretty(name),
    name,
    type: "options",
    default: values[0],
    options: values.map((value) => ({ name: value, value })),
  });
for (const name of ["supply", "royaltyAmount"])
  assetOptions.push({
    displayName: pretty(name),
    name,
    type: "number",
    default: 0,
    typeOptions: { minValue: 0 },
  });

export const properties: INodeProperties[] = rawProperties.flatMap((p) => {
  const keys = fieldKeys.get(p);
  if (!keys) return [p];
  const resources = [...new Set(keys.map((k) => k.split(".")[0]))];
  return resources.map((resource) => ({
    ...p,
    displayOptions: {
      show: {
        resource: [resource],
        operation: keys
          .filter((k) => k.startsWith(resource + "."))
          .map((k) => k.split(".")[1]),
      },
    },
  }));
});
// Token-account queries expose only their two documented address filters.
const assetFilterIndex = properties.findIndex((p) => p.name === "assetFilters");
const assetFilter = properties[assetFilterIndex];
properties.splice(
  assetFilterIndex,
  1,
  {
    ...assetFilter,
    displayOptions: {
      show: { resource: ["digitalAsset"], operation: ["search"] },
    },
    options: (assetFilter.options as INodeProperties[]).filter(
      (p) => p.name !== "mintAddress",
    ),
  },
  {
    ...assetFilter,
    displayOptions: {
      show: { resource: ["digitalAsset"], operation: ["getTokenAccounts"] },
    },
    options: (assetFilter.options as INodeProperties[]).filter((p) =>
      ["mintAddress", "ownerAddress"].includes(p.name),
    ),
  },
);
extendProperties(properties);
properties.splice(
  1,
  0,
  ...Object.entries(resourceHelp).map(
    ([resource, displayName]): INodeProperties => ({
      displayName,
      name: "resourceHelp",
      type: "notice",
      default: "",
      displayOptions: { show: { resource: [resource] } },
    }),
  ),
);
properties.splice(
  0,
  properties.length,
  ...tradeProperties(simpleActionProperties(guidedProperties(properties))),
);
// Keep optional tuning after the task's essential fields.
const advancedControls = properties.filter((p) => p.name === "showAdvanced");
properties.splice(
  0,
  properties.length,
  ...properties.filter((p) => p.name !== "showAdvanced"),
  ...advancedControls,
);
withHelp(properties);
for (const property of properties) {
  if (property.name === "resource" || property.name === "operation")
    property.typeOptions = {
      ...property.typeOptions,
      loadOptionsMethod:
        property.name === "resource" ? "resourceChoices" : "operationChoices",
      ...(property.name === "operation"
        ? { loadOptionsDependsOn: ["resource"] }
        : {}),
    };
}
export const fieldNames = [
  ...new Set(
    properties
      .filter((p) => !["resource", "operation"].includes(p.name))
      .map((p) => p.name),
  ),
];
export const defaults = Object.fromEntries(
  properties.map((p) => [p.name, p.default]),
);
