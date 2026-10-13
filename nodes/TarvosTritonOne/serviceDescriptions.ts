import type { INodeProperties } from "n8n-workflow";
import { EXTRA, appendOperations, extraProperties } from "./expanded";
import { SERVICES } from "./services";
export function extendProperties(properties: INodeProperties[]) {
  const assetFilters = properties.find((p) => p.name === "assetFilters");
  (assetFilters?.options as INodeProperties[])?.push({
    displayName: "Token Type (Search Only)",
    name: "tokenType",
    type: "options",
    default: "",
    options: [
      { name: "Provider Default", value: "" },
      { name: "All (Fungible and Non-Fungible)", value: "All" },
    ],
  });
  for (const name of ["dataSlice", "minContextSlot"]) {
    const source = properties.find(
      (p) =>
        p.name === name &&
        p.displayOptions?.show?.resource?.includes("account"),
    );
    if (source)
      properties.push({
        ...source,
        displayOptions: {
          show: {
            resource: ["token"],
            operation: ["getByOwner", "getByDelegate"],
          },
        },
      });
  }
  const registry: Record<string, string[]> = {};
  for (const key of Object.keys(EXTRA)) {
    const [resource, op] = key.split(".");
    (registry[resource] ??= []).push(op);
  }
  for (const [resource, ops] of Object.entries(SERVICES))
    (registry[resource] ??= []).push(...ops);
  appendOperations(properties, registry);
  properties.push(...extraProperties());
  const field = (
    displayName: string,
    name: string,
    type: INodeProperties["type"],
    def: unknown,
    keys: string[],
    extra: Partial<INodeProperties> = {},
  ) => {
    for (const resource of new Set(keys.map((k) => k.split(".")[0])))
      properties.push({
        displayName,
        name,
        type,
        default: def as string,
        displayOptions: {
          show: {
            resource: [resource],
            operation: keys
              .filter((k) => k.startsWith(resource + "."))
              .map((k) => k.split(".")[1]),
          },
        },
        ...extra,
      });
  };
  field(
    "Transaction (Base64)",
    "transaction",
    "string",
    "",
    ["transaction.simulate", "transaction.submitCascade"],
    { required: true },
  );
  field(
    "Transactions (Base64 JSON Array)",
    "bundleTransactions",
    "json",
    "[]",
    ["transaction.simulateBundle"],
    { required: true },
  );
  field("Signature", "signature", "string", "", ["transaction.confirm"], {
    required: true,
  });
  field("Wait Seconds", "waitSeconds", "number", 30, ["transaction.confirm"]);
  field(
    "Target Commitment",
    "targetCommitment",
    "options",
    "finalized",
    ["transaction.confirm"],
    {
      options: [
        { name: "Confirmed", value: "confirmed" },
        { name: "Finalized", value: "finalized" },
      ],
    },
  );
  field(
    "Simulate Separately Before Sending",
    "simulateFirst",
    "boolean",
    false,
    ["transaction.submit"],
  );
  field("Shield Policy Addresses", "forwardingPolicies", "json", "[]", [
    "transaction.submit",
    "transaction.submitCascade",
    "titan.swap",
  ]);
  properties.push({
    displayName:
      'Shield is optional. Leave Policy Addresses empty (or [] in JSON mode) unless you already use on-chain Shield forwarding policies. <a href="https://docs.triton.one/project-yellowstone/shield-transaction-policies" target="_blank">Shield documentation</a>.',
    name: "shieldHelp",
    type: "notice",
    default: "",
    displayOptions: {
      show: {
        resource: ["transaction", "titan"],
        operation: ["submit", "submitCascade", "swap"],
      },
    },
  });
  const quotes = ["titan.quote", "titan.swap"];
  field("Input Mint", "inputMint", "string", "", quotes, { required: true });
  field("Output Mint", "outputMint", "string", "", quotes, { required: true });
  field("Input Amount (Atomic Units)", "titanAmount", "string", "", quotes, {
    required: true,
    description:
      "Exact input amount before decimal scaling; use a decimal integer string",
  });
  field("Slippage (Basis Points)", "slippageBps", "number", 50, quotes, {
    typeOptions: { minValue: 0, maxValue: 1000 },
  });
  field("Public Address", "titanPublicAddress", "string", "", ["titan.quote"], {
    required: true,
    description:
      "Public wallet address for quote generation; no signing credential required",
  });
  field(
    "Minimum Output (Atomic Units)",
    "minimumOutput",
    "string",
    "1",
    ["titan.swap"],
    { required: true },
  );
  field("Provider ID", "provider", "string", "", ["titan.swap"], {
    description: "Leave blank to use Titan’s expected winner",
  });
  field(
    "Compute Unit Price (Micro-Lamports)",
    "computeUnitPrice",
    "string",
    "0",
    ["titan.swap"],
  );
  field(
    "Address",
    "archiveAddress",
    "string",
    "",
    ["archive.exportAddressHistory"],
    { required: true },
  );
  field("Continuation Token", "archiveCursor", "string", "", [
    "archive.exportAddressHistory",
  ]);
  field("Maximum Records", "exportLimit", "number", 100, [
    "archive.exportAddressHistory",
  ]);
  field("Start Slot", "startSlot", "number", 0, ["archive.exportBlocks"]);
  field("End Slot", "endSlot", "number", 0, ["archive.exportBlocks"]);
  field(
    "Maximum Blocks Per Execution",
    "maxBlocks",
    "number",
    25,
    ["archive.exportBlocks"],
    { typeOptions: { minValue: 1, maxValue: 100 } },
  );
  const admin = SERVICES.administration.map((op) => "administration." + op);
  field("Page", "adminPage", "number", 1, admin);
  field("Page Size", "adminPageSize", "number", 50, admin);
  field("Address", "workerAddress", "string", "", ["worker.getAccount"], {
    required: true,
  });
  field("Maximum Account Slot Lag", "maxSlotLag", "number", 75, [
    "worker.getAccount",
  ]);
  field(
    "Consumer Name",
    "consumer",
    "string",
    "",
    ["worker.getEvents", "worker.acknowledgeEvents"],
    { required: true },
  );
  field("Maximum Events", "eventLimit", "number", 100, ["worker.getEvents"]);
  field(
    "Batch Receipt",
    "receipt",
    "string",
    "",
    ["worker.acknowledgeEvents"],
    {
      required: true,
      description: "Acknowledge only after downstream processing has succeeded",
    },
  );
}
