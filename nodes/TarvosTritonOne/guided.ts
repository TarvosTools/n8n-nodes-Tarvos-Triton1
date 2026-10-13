import type { INodeProperties } from "n8n-workflow";
import { object, array, choice, integer } from "./validation";
import { TritonError } from "./errors";
import { configKeys } from "./expanded";

const vixenPrograms: Record<string, string> = {
  Token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  Token22: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  OrcaWhirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  Meteora: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  Pumpfun: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  JupiterSwap: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  MeteoraAmm: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  Moonshot: "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG",
  PumpSwaps: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  RaydiumCpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  RaydiumAmmv4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  RaydiumClmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  KaminoLimitOrders: "LiMoM9rMhrdYrfzUCxQppvxCSG1FcrUK9G8uLq4A1GF",
};
const option = (name: string, value: string) => ({ name, value });
const select = (
  name: string,
  displayName: string,
  values: string[],
  defaultValue = values[0],
  description = "Choose the value to use for this request.",
): INodeProperties => ({
  name,
  displayName,
  type: "options",
  default: defaultValue,
  description,
  options: values.map((v) => option(v[0].toUpperCase() + v.slice(1), v)),
});
const number = (
  name: string,
  displayName: string,
  def = 0,
  description = "Non-negative whole number.",
): INodeProperties => ({
  name,
  displayName,
  type: "number",
  default: def,
  typeOptions: { minValue: 0, numberPrecision: 0 },
  description,
});
const string = (
  name: string,
  displayName: string,
  description: string,
): INodeProperties => ({
  name,
  displayName,
  type: "string",
  default: "",
  description,
});
const bool = (
  name: string,
  displayName: string,
  description: string,
): INodeProperties => ({
  name,
  displayName,
  type: "boolean",
  default: false,
  description,
});
const collection = (
  name: string,
  displayName: string,
  options: INodeProperties[],
  description: string,
): INodeProperties => ({
  name,
  displayName,
  type: "collection",
  default: {},
  placeholder: "Add Option",
  options,
  description,
});
const rows = (
  name: string,
  displayName: string,
  description: string,
  values?: INodeProperties[],
): INodeProperties => ({
  name,
  displayName,
  type: "fixedCollection",
  default: {},
  placeholder: "Add Entry",
  description,
  typeOptions: { multipleValues: true },
  options: [
    {
      name: "entries",
      displayName: "Entries",
      values: values ?? [string("value", "Value", description)],
    },
  ],
});
const commitment = (def = "confirmed") =>
  select(
    "commitment",
    "Confirmation Level",
    ["confirmed", "finalized", "processed"],
    def,
    "Confirmed is a practical default. Finalized waits for stronger settlement; processed events are provisional.",
  );
const encoding = () =>
  select(
    "encoding",
    "Data Format",
    ["base64", "jsonParsed"],
    "base64",
    "Base64 returns raw bytes; JSON Parsed returns readable fields where supported.",
  );
const slice = () =>
  collection(
    "dataSlice",
    "Account Data Slice",
    [number("offset", "Start Byte"), number("length", "Number of Bytes")],
    "Optional: return only these bytes. Requires Base64 data format.",
  );
const filters = () =>
  rows(
    "filters",
    "Program Account Filters",
    "Add a size or byte-match condition. All conditions must match.",
    [
      select(
        "kind",
        "Match By",
        ["dataSize", "memcmp"],
        "dataSize",
        "Data Size matches account length. Memcmp compares bytes at an offset.",
      ),
      number("offset", "Size / Byte Offset"),
      string(
        "bytes",
        "Bytes to Match (Base58)",
        "For Memcmp, enter base58-encoded bytes to match.",
      ),
    ],
  );
const addresses = (name: string, displayName: string) =>
  rows(
    name,
    displayName,
    "Add one base58 address per entry. Use the + button to add more.",
  );

/** v1 stays in JSON mode unless explicitly changed; new nodes default to fields. */
export function modeFor(
  parameters: Record<string, unknown> = {},
  version = 1,
): string {
  return choice(
    parameters.inputMode ?? (version >= 1.1 ? "fields" : "json"),
    ["fields", "json"],
    "Input mode",
  );
}
export function guidedProperties(
  properties: INodeProperties[],
  trigger = false,
): INodeProperties[] {
  const modes: INodeProperties[] = [1, 1.1, 1.2, 1.3].map((version) => ({
    displayName: "Input Mode",
    name: "inputMode",
    type: "options",
    default: version === 1 ? "json" : "fields",
    noDataExpression: true,
    description:
      "Use Fields for dropdowns and Add Entry controls, or JSON for advanced requests. Switching modes does not copy values; each mode keeps its own settings.",
    options: [
      option("Fields (Recommended)", "fields"),
      option("JSON (Advanced)", "json"),
    ],
    displayOptions: { show: { "@version": [version] } },
  }));
  const result: INodeProperties[] = [];
  for (const field of properties) {
    if (field.name === "subscriptionHelp") continue;
    if (field.name === "vixenProgram") {
      result.push({
        ...field,
        type: "options",
        options: Object.entries(vixenPrograms).map(([name, value]) => ({
          name,
          value,
        })),
        description:
          "Choose the program whose parsed activity to monitor. Requires a Vixen-enabled endpoint.",
      });
      continue;
    }
    if (field.type !== "json") {
      result.push(field);
      continue;
    }
    const show = field.displayOptions?.show ?? {};
    result.push({
      ...field,
      displayName: field.displayName + " (JSON)",
      displayOptions: {
        ...field.displayOptions,
        show: { ...show, inputMode: ["json"] },
      },
    });
    let controls: INodeProperties[];
    if (field.name === "wsOptions") {
      const topic = (topics: string[], p: INodeProperties) => ({
        ...p,
        displayOptions: { show: { topic: topics } },
      });
      controls = [
        commitment(),
        topic(["account", "program"], encoding()),
        topic(["account", "program"], slice()),
        topic(["program"], filters()),
        topic(
          ["signature"],
          bool(
            "enableReceivedNotification",
            "Notify When Received",
            "Whether to emit an initial received notification. Received does not mean confirmed.",
          ),
        ),
        topic(
          ["block", "transaction"],
          select(
            "encoding",
            "Transaction Format",
            ["json", "jsonParsed", "base64", "base58"],
            "json",
          ),
        ),
        topic(
          ["block", "transaction"],
          select(
            "transactionDetails",
            "Transaction Details",
            ["full", "signatures", "none"],
            "full",
          ),
        ),
        topic(
          ["block", "transaction"],
          bool(
            "showRewards",
            "Include Rewards",
            "Whether to include reward information.",
          ),
        ),
      ];
      // Top-level controls are immediately visible, with topic-specific choices.
      for (const control of controls)
        result.push({
          ...control,
          name: "ws_" + control.name,
          displayOptions: {
            show: {
              ...show,
              ...control.displayOptions?.show,
              inputMode: ["fields"],
            },
            hide: { topic: ["slot"] },
          },
        });
      continue;
    } else if (field.name === "transactionFilter") {
      controls = [
        select(
          "vote",
          "Vote Transactions",
          ["exclude", "include", "only"],
          "exclude",
          "Exclude filters out votes; Include allows both; Only returns votes.",
        ),
        select(
          "failed",
          "Failed Transactions",
          ["exclude", "include", "only"],
          "exclude",
          "Exclude returns successful transactions; Include allows both; Only returns failures.",
        ),
        addresses("include", "Match Any Account"),
        addresses("required", "Require All Accounts"),
        addresses("exclude", "Exclude Accounts"),
        string(
          "signature",
          "Transaction Signature",
          "Optional: match a specific transaction. Supply a signature or a positive account filter.",
        ),
      ];
    } else if (field.name === "grpcRequest") {
      controls = [
        select(
          "event",
          "Events to Watch",
          trigger
            ? [
                "accounts",
                "transactions",
                "transactionsStatus",
                "slots",
                "blocksMeta",
              ]
            : [],
          "accounts",
          "Choose one event type. Advanced JSON supports multiple named subscriptions.",
        ),
        commitment(),
        addresses("account", "Account Addresses"),
        addresses("owner", "Owner Program Addresses"),
        addresses("accountInclude", "Transactions Matching Any Account"),
        addresses("accountRequired", "Transactions Requiring All Accounts"),
        addresses("accountExclude", "Exclude Transaction Accounts"),
        select(
          "vote",
          "Vote Transactions",
          ["exclude", "include", "only"],
          "exclude",
        ),
        select(
          "failed",
          "Failed Transactions",
          ["exclude", "include", "only"],
          "exclude",
        ),
      ];
      for (const source of ["dragon", "riptide", "deshred"]) {
        for (const control of controls) {
          if (
            source === "deshred" &&
            ["commitment", "account", "owner", "vote", "failed"].includes(
              control.name,
            )
          )
            continue;
          const actual =
            control.name === "event" && source === "deshred"
              ? select(
                  "event",
                  "Events to Watch",
                  ["transactions", "slots"],
                  "transactions",
                )
              : control;
          const eventFilter = ["account", "owner"].includes(control.name)
            ? ["accounts"]
            : [
                  "accountInclude",
                  "accountRequired",
                  "accountExclude",
                  "vote",
                  "failed",
                ].includes(control.name)
              ? ["transactions", "transactionsStatus"]
              : undefined;
          result.push({
            ...actual,
            name: "grpc_" + actual.name,
            displayOptions: {
              show: {
                source: [source],
                inputMode: ["fields"],
                ...(eventFilter ? { grpc_event: eventFilter } : {}),
              },
            },
          });
        }
      }
      continue;
    } else if (field.name === "preconfRequest") {
      controls = [
        addresses("accountInclude", "Match Any Account"),
        addresses("accountRequired", "Require All Accounts"),
        addresses("accountExclude", "Exclude Accounts"),
        addresses("signerInclude", "Match Any Signer"),
        rows(
          "signature",
          "Transaction Signatures",
          "Add one base58 signature per entry.",
        ),
      ];
    } else if (field.name === "extra_options") {
      const key =
        String(show.resource?.[0]) + "." + String(show.operation?.[0]);
      const available: Record<string, INodeProperties> = {
        encoding: encoding(),
        dataSlice: slice(),
        programId: string(
          "programId",
          "Token Program Address",
          "Optional program ID supplied by your token's program.",
        ),
        minContextSlot: number("minContextSlot", "Minimum Context Slot"),
        identity: string(
          "identity",
          "Validator Identity",
          "Base58 validator identity address to restrict results.",
        ),
        range: collection(
          "range",
          "Slot Range",
          [number("firstSlot", "First Slot"), number("lastSlot", "Last Slot")],
          "Optional block-production slot range.",
        ),
        excludeNonCirculatingAccountsList: bool(
          "excludeNonCirculatingAccountsList",
          "Omit Non-Circulating Account List",
          "Whether to omit the potentially large account list.",
        ),
        votePubkey: string(
          "votePubkey",
          "Vote Account Address",
          "Base58 vote-account address to query.",
        ),
        keepUnstakedDelinquents: bool(
          "keepUnstakedDelinquents",
          "Include Unstaked Delinquent Validators",
          "Whether to retain unstaked delinquent validators.",
        ),
        delinquentSlotDistance: number(
          "delinquentSlotDistance",
          "Delinquent Slot Distance",
        ),
        epoch: number("epoch", "Epoch"),
      };
      const c = commitment("finalized");
      c.options = c.options?.filter(
        (o) => !("value" in o) || o.value !== "processed",
      );
      controls = [c, ...(configKeys[key] ?? []).map((k) => available[k])];
    } else {
      const label = field.displayName.replace(/ \(JSON Array\)/, "");
      result.push({
        ...rows(
          field.name + "Fields",
          label,
          field.description ?? "Add one value per entry.",
        ),
        required: field.required,
        displayOptions: {
          ...field.displayOptions,
          show: { ...show, inputMode: ["fields"] },
        },
      });
      continue;
    }
    const guided = collection(
      field.name + "Fields",
      field.displayName.replace(" Request", " Settings"),
      controls,
      field.description ??
        "Configure the request with fields. JSON mode remains available for advanced requests.",
    );
    if (field.name === "transactionFilter")
      guided.description =
        "Add at least one Match Any Account, Require All Accounts, or Transaction Signature. Other filters narrow these matches.";
    if (field.name === "preconfRequest")
      guided.description =
        "Add a positive account, signer or signature filter. Preconfirmations remain provisional.";
    result.push({
      ...guided,
      displayOptions: {
        ...field.displayOptions,
        show: {
          ...show,
          inputMode: ["fields"],
        },
      },
    });
  }
  result.splice(1, 0, ...modes);
  if (trigger) {
    for (const [source, codes] of [
      ["harmonic", "AMS EWR FRA LON TYO SGP SLC"],
      ["bam", "AMS DFW DUB EWR FRA HKG IAD LAX LON PIT SEA SIN SLC SQQ TYO"],
    ]) {
      result.push({
        ...select(
          "streamRegion",
          "Stream Region",
          codes.split(" "),
          "AMS",
          "Choose a region served by your endpoint. A subscription covers one region.",
        ),
        displayOptions: { show: { source: [source], inputMode: ["fields"] } },
      });
    }
  }
  return result;
}

function list(value: unknown): string[] {
  const entries = object(value ?? {}, "Entries").entries ?? [];
  if (Array.isArray(entries) && entries.length === 0) return [];
  return array(entries, "Entries")
    .map((row) => String(object(row, "Entry").value ?? "").trim())
    .filter(Boolean);
}
function filterRows(value: unknown) {
  const entries = object(value ?? {}, "Filters").entries ?? [];
  if (Array.isArray(entries) && entries.length === 0) return [];
  return array(entries, "Filters").map((row) => {
    const f = object(row, "Filter");
    return f.kind === "memcmp"
      ? {
          memcmp: {
            offset: integer(f.offset, "Offset"),
            bytes: String(f.bytes ?? ""),
          },
        }
      : { dataSize: integer(f.offset, "Data size") };
  });
}
export function normalizeGuided(
  p: Record<string, unknown>,
  trigger = false,
): void {
  if (p.inputMode !== "fields") return;
  for (const [key, value] of Object.entries(p)) {
    if (!key.endsWith("Fields")) continue;
    const raw = key.slice(0, -6);
    if (
      [
        "grpcRequest",
        "preconfRequest",
        "transactionFilter",
        "extra_options",
      ].includes(raw)
    )
      continue;
    p[raw] = list(value);
  }
  if (!trigger) {
    if (p.extra_optionsFields !== undefined) {
      const config = {
        commitment: "finalized",
        ...object(p.extra_optionsFields, "Query options"),
      };
      p.extra_options = config;
    }
    return;
  }
  const source = p.source;
  if (source === "whirligig") {
    const topic = p.topic;
    const config: Record<string, unknown> = {
      commitment: p.ws_commitment ?? "confirmed",
    };
    if (["account", "program"].includes(String(topic))) {
      config.encoding = p.ws_encoding ?? "base64";
      const dataSlice = object(p.ws_dataSlice ?? {}, "Data slice");
      if (Object.keys(dataSlice).length) {
        if (config.encoding === "jsonParsed")
          throw new TritonError(
            "INVALID_INPUT",
            "Account data slicing requires Base64 data format.",
          );
        config.dataSlice = dataSlice;
      }
    }
    if (topic === "program") {
      const fs = filterRows(p.ws_filters);
      if (fs.length) config.filters = fs;
    }
    if (topic === "signature")
      config.enableReceivedNotification =
        p.ws_enableReceivedNotification ?? false;
    if (["block", "transaction"].includes(String(topic))) {
      config.encoding = p.ws_encoding ?? "json";
      config.transactionDetails = p.ws_transactionDetails ?? "full";
      config.showRewards = p.ws_showRewards ?? false;
    }
    p.wsOptions = topic === "slot" ? {} : config;
    if (topic === "transaction") {
      const f = object(p.transactionFilterFields ?? {}, "Transaction filters");
      p.transactionFilter = {
        ...(f.vote === "include" ? {} : { vote: f.vote === "only" }),
        ...(f.failed === "include" ? {} : { failed: f.failed === "only" }),
        accounts: {
          include: list(f.include),
          required: list(f.required),
          exclude: list(f.exclude),
        },
        ...(f.signature ? { signature: f.signature } : {}),
      };
    }
  }
  if (["dragon", "riptide", "deshred"].includes(String(source))) {
    const f = { ...object(p.grpcRequestFields ?? {}, "Stream settings") };
    for (const [key, value] of Object.entries(p))
      if (key.startsWith("grpc_")) f[key.slice(5)] = value;
    const event = choice(
      f.event ?? (source === "deshred" ? "transactions" : "accounts"),
      ["accounts", "transactions", "transactionsStatus", "slots", "blocksMeta"],
      "Events to watch",
    );
    if (source === "deshred" && !["transactions", "slots"].includes(event))
      throw new TritonError(
        "INVALID_INPUT",
        "Deshred supports Transactions or Slots. Select one of these event types.",
      );
    const filter: Record<string, unknown> = {};
    if (event === "accounts") {
      filter.account = list(f.account);
      filter.owner = list(f.owner);
    }
    if (["transactions", "transactionsStatus"].includes(event)) {
      for (const key of ["accountInclude", "accountRequired", "accountExclude"])
        filter[key] = list(f[key]);
      if (source !== "deshred")
        for (const key of ["vote", "failed"]) {
          const value = f[key] ?? "exclude";
          if (value !== "include") filter[key] = value === "only";
        }
    }
    p.grpcRequest = {
      [source === "deshred" && event === "transactions"
        ? "deshredTransactions"
        : event]: { watched: filter },
      ...(source === "deshred"
        ? {}
        : { commitment: String(f.commitment ?? "confirmed").toUpperCase() }),
    };
  }
  if (["harmonic", "bam"].includes(String(source))) {
    const f = object(p.preconfRequestFields ?? {}, "Preconfirmation filters");
    const filter = Object.fromEntries(
      [
        "accountInclude",
        "accountRequired",
        "accountExclude",
        "signerInclude",
        "signature",
      ].map((key) => [key, list(f[key])]),
    );
    p.preconfRequest = {
      transactions: { watched: filter },
      [source === "bam" ? "bamRegion" : "harmonicRegion"]:
        String(source).toUpperCase() +
        "_REGION_" +
        String(p.streamRegion ?? "AMS"),
    };
  }
}
