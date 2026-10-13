import type { INodeProperties } from "n8n-workflow";
import { choice } from "./validation";

const services: Record<string, [string, string]> = {
  whirligig: [
    "Standard Monitoring — Whirligig",
    "Start here for wallet activity, account changes and transaction updates. Uses your Triton RPC credential. You do not need a separate streaming server.",
  ],
  dragon: [
    "Live Blockchain Feed — Dragon’s Mouth",
    "For custom real-time account and transaction feeds. Choose this when standard monitoring does not give you the data you need. Requires a Triton gRPC endpoint and stream token.",
  ],
  riptide: [
    "Low-Latency Live Feed — Riptide",
    "Uses Dragon’s Mouth filters on a lower-latency mainnet connection. The shared riptide.rpcpool.com endpoint requires a shared gRPC subscription token; dedicated-node tokens require a separately arranged endpoint.",
  ],
  vixen: [
    "Readable App Activity — Vixen",
    "Turns supported programs’ activity into parsed fields instead of raw bytes. Useful for monitoring apps such as Raydium or Orca. Requires a Vixen-enabled stream endpoint; a program-wide feed may be busy.",
  ],
  titan: [
    "Live Swap Prices — Titan",
    "Get changing quotes for swapping one token into another. This trigger only returns quotes; it does not buy or sell. Requires mainnet Titan access through your Triton RPC credential.",
  ],
  deshred: [
    "Early Transaction Feed — Deshred",
    "For specialists who need reconstructed transactions before execution. An event is not proof of success or confirmation. Requires a Deshred-enabled stream endpoint.",
  ],
  harmonic: [
    "Early Execution Signals — Harmonic",
    "For advanced monitoring of provisional execution signals from one region. Results can change; confirm them later. Requires a Harmonic-enabled endpoint.",
  ],
  bam: [
    "Early Bundle Signals — BAM",
    "For advanced monitoring of bundle and transaction signals from one region. Outcomes may be absent and are not final. Requires a BAM-enabled endpoint.",
  ],
};
const tasks: Record<string, [string, string]> = {
  wallet: [
    "Watch Wallet Activity",
    "Starts this workflow when a confirmed transaction mentions this wallet. Returns transaction logs and a signature, not a complete portfolio or token-transfer history.",
  ],
  account: [
    "Watch SOL Balance / Account Changes",
    "Starts this workflow when this account changes. For a normal wallet, the account data includes its SOL balance. Other account changes can also trigger an update.",
  ],
  token: [
    "Watch a Token Account",
    "Watch changes to one token account, including its token balance when parsing is available. Enter the token-account address, not the token mint or the wallet address.",
  ],
  signature: [
    "Wait for a Transaction Update",
    "Watch one transaction signature until a confirmed update arrives. This does not send a transaction.",
  ],
  program: [
    "Watch App / Program Activity",
    "Starts this workflow when confirmed transaction logs mention this program. Busy programs can produce many events; advanced setup provides narrower filters.",
  ],
};
export function setupExperience(
  parameters: Record<string, unknown> = {},
  version = 1,
): string {
  return choice(
    !parameters.setupExperience || parameters.setupExperience === "auto"
      ? version >= 1.2
        ? "simple"
        : "advanced"
      : parameters.setupExperience,
    ["simple", "advanced"],
    "Setup",
  );
}
export function simpleTriggerProperties(
  properties: INodeProperties[],
): INodeProperties[] {
  const modes: INodeProperties[] = [
    {
      displayName: "Setup Style",
      name: "setupExperience",
      type: "options",
      default: "auto",
      description:
        "Quick Setup asks only what to watch and an address. Automatic uses Quick Setup for new nodes and preserves older nodes' advanced settings.",
      options: [
        { name: "Automatic (Recommended)", value: "auto" },
        { name: "Quick Setup", value: "simple" },
        { name: "Advanced Setup", value: "advanced" },
      ],
    },
  ];
  const basic = { show: { setupExperience: ["simple"] } };
  const result: INodeProperties[] = [
    ...modes,
    {
      displayName: "What Would You Like to Watch?",
      name: "watchTask",
      type: "options",
      default: "wallet",
      noDataExpression: true,
      description:
        "Choose your goal. We select the monitoring service and settings for you.",
      options: Object.entries(tasks).map(([value, [name, description]]) => ({
        name,
        value,
        description,
      })),
      displayOptions: basic,
    },
    ...Object.entries(tasks).map(
      ([task, [, displayName]]): INodeProperties => ({
        displayName,
        name: "taskExplanation",
        type: "notice",
        default: "",
        displayOptions: {
          show: { setupExperience: ["simple"], watchTask: [task] },
        },
      }),
    ),
    {
      displayName: "Address to Watch",
      name: "simpleAddress",
      type: "string",
      default: "",
      required: true,
      placeholder: "Paste a Solana address",
      description:
        "Paste the public wallet, token-account or program address for your chosen task. No private key is needed.",
      displayOptions: {
        show: {
          setupExperience: ["simple"],
          watchTask: ["wallet", "account", "token", "program"],
        },
      },
    },
    {
      displayName: "Transaction Signature",
      name: "simpleSignature",
      type: "string",
      default: "",
      required: true,
      placeholder: "Paste the transaction signature",
      description:
        "Copy the signature from the submitted transaction or a Solana explorer",
      displayOptions: {
        show: { setupExperience: ["simple"], watchTask: ["signature"] },
      },
    },
    {
      displayName:
        "Uses Standard Monitoring (Whirligig) with confirmed updates. Add your Triton RPC credential above, then test the trigger. Updates are grouped once per second; inactive addresses may produce no event during the 30-second test. No wallet or signing key is needed.",
      name: "quickSetupHelp",
      type: "notice",
      default: "",
      displayOptions: basic,
    },
  ];
  for (const property of properties) {
    const p = {
      ...property,
      displayOptions: {
        ...property.displayOptions,
        show: {
          ...property.displayOptions?.show,
          setupExperience: ["advanced"],
        },
      },
    };
    if (p.name === "source") {
      p.displayName = "Which Service Do You Need?";
      p.options = Object.entries(services).map(
        ([value, [name, description]]) => ({ name, value, description }),
      );
    }
    result.push(p);
    if (p.name === "source")
      for (const [source, [, displayName]] of Object.entries(services))
        result.push({
          displayName,
          name: "serviceExplanation",
          type: "notice",
          default: "",
          displayOptions: {
            show: { setupExperience: ["advanced"], source: [source] },
          },
        });
  }
  return result.flatMap((property) => {
    const mode = property.displayOptions?.show?.setupExperience?.[0];
    if (mode !== "simple" && mode !== "advanced") return [property];
    const automaticVersions = (mode === "simple" ? [1.2] : [1, 1.1]).filter(
      (v) =>
        !property.displayOptions?.show?.["@version"] ||
        property.displayOptions.show["@version"]?.includes(v),
    );
    if (!automaticVersions.length) return [property];
    return [
      property,
      {
        ...property,
        displayOptions: {
          ...property.displayOptions,
          show: {
            ...property.displayOptions?.show,
            setupExperience: ["auto"],
            "@version": automaticVersions,
          },
        },
      },
    ];
  });
}
export function quickParameters(
  task: unknown,
  address: unknown,
  signature: unknown,
): Record<string, unknown> {
  const selected = choice(
    task,
    ["wallet", "account", "token", "signature", "program"],
    "What to watch",
  );
  const topic =
    selected === "signature"
      ? "signature"
      : ["wallet", "program"].includes(selected)
        ? "logs"
        : "account";
  return {
    source: "whirligig",
    topic,
    watchAddress: address,
    watchSignature: signature,
    inputMode: "json",
    wsOptions: {
      commitment: "confirmed",
      ...(topic === "account" ? { encoding: "jsonParsed" } : {}),
    },
    batchSize: 100,
    flushMs: 1000,
    executionLimit: 60,
    listenSeconds: 30,
  };
}

/** Hide tuning controls on new action nodes; existing versions retain their layout. */
export function simpleActionProperties(
  properties: INodeProperties[],
): INodeProperties[] {
  const tuning = new Set([
    "inputMode",
    "commitment",
    "accountEncoding",
    "transactionEncoding",
    "dataSlice",
    "minContextSlot",
    "searchTransactionHistory",
    "historyDetails",
    "assetSort",
    "requestBudget",
    "outputMode",
    "preflightCommitment",
    "maxRetries",
    "timeout",
    "forwardingPolicies",
    "forwardingPoliciesFields",
    "shieldHelp",
    "computeUnitPrice",
    "provider",
    "extra_options",
    "extra_optionsFields",
  ]);
  const names: Record<string, string> = {
    account: "SOL Balances & Accounts",
    token: "Token Balances & Supply",
    transaction: "Transactions & History",
    network: "Network Status",
    block: "Blocks",
    fee: "Transaction Fees",
    digitalAsset: "NFTs & Digital Assets",
    titan: "Swap Quotes & Swaps",
    archive: "Export History",
    administration: "Triton Account Management",
    worker: "Self-Hosted Worker",
  };
  for (const property of properties)
    if (property.name === "resource") {
      property.displayName = "What Do You Want to Work With?";
      for (const option of property.options ?? [])
        if ("value" in option)
          option.name = names[String(option.value)] ?? option.name;
    }
  const result = properties.map((p) =>
    tuning.has(p.name)
      ? {
          ...p,
          displayOptions: {
            ...p.displayOptions,
            show: { ...p.displayOptions?.show, showAdvanced: [true] },
          },
        }
      : p,
  );
  result.splice(
    1,
    0,
    ...[1, 1.1, 1.2, 1.3].map(
      (version): INodeProperties => ({
        displayName: "Show Advanced Settings",
        name: "showAdvanced",
        type: "boolean",
        default: version < 1.2,
        description:
          "Whether to show technical request, delivery and formatting controls. Leave off to use recommended defaults.",
        displayOptions: { show: { "@version": [version] } },
      }),
    ),
  );
  return result;
}
