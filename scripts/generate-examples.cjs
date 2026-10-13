const fs = require("node:fs");
const path = require("node:path");
const {
  OPERATIONS,
  PAGINATED,
  COLLECTIONS,
} = require("../dist/nodes/TarvosTritonOne/apiContract");
const { properties } = require("../dist/nodes/TarvosTritonOne/descriptions");
const root = path.resolve(__dirname, "..");
const write = (name, value) => {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};
const type = "n8n-nodes-tarvos-triton-one.tarvosTritonOne";
const trigger = {
  id: "manual",
  name: "Manual Trigger",
  type: "n8n-nodes-base.manualTrigger",
  typeVersion: 1,
  position: [0, 180],
  parameters: {},
};
const node = (
  name,
  resource,
  operation,
  params = {},
  position = [300, 180],
) => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  type,
  typeVersion: 1,
  position,
  parameters: { resource, operation, ...params },
});
function workflow(name, nodes, links, note) {
  return {
    name,
    active: false,
    nodes: [
      trigger,
      ...nodes,
      {
        id: "instructions",
        name: "Setup Notes",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [0, -180],
        parameters: { content: note, width: 650, height: 220 },
      },
    ],
    connections: Object.fromEntries(
      links.map(([from, to]) => [
        from,
        { main: [[...to.map((node) => ({ node, type: "main", index: 0 }))]] },
      ]),
    ),
    settings: { executionOrder: "v1" },
    pinData: {},
  };
}
const address = "={{$json.publicAddress}}";
write(
  "examples/01-connection-and-balance.json",
  workflow(
    "Triton — Connection and balance",
    [
      node("Network Identity", "network", "getGenesisHash"),
      node(
        "SOL Balance",
        "account",
        "getBalance",
        { address: "11111111111111111111111111111111" },
        [600, 180],
      ),
    ],
    [
      ["Manual Trigger", ["Network Identity"]],
      ["Network Identity", ["SOL Balance"]],
    ],
    "Select your Triton credential on both nodes. Replace the sample system-program address with your wallet. Network identity is also checked automatically for every Triton node execution.",
  ),
);
write(
  "examples/02-token-inventory.json",
  workflow(
    "Triton — Token inventory",
    [
      node(
        "SPL Accounts",
        "token",
        "getByOwner",
        { address: "", tokenFilter: "spl" },
        [300, 80],
      ),
      node(
        "Token 2022 Accounts",
        "token",
        "getByOwner",
        { address: "", tokenFilter: "token2022" },
        [300, 300],
      ),
    ],
    [["Manual Trigger", ["SPL Accounts", "Token 2022 Accounts"]]],
    "Enter the same owner public address and select the Triton credential on both branches. Each token program is queried independently. Preserve token-account addresses when storing results.",
  ),
);
write(
  "examples/03-address-activity.json",
  workflow(
    "Triton — Address activity",
    [
      node("Address History", "transaction", "getHistory", {
        address: "",
        retrieval: "upToLimit",
        pageSize: 50,
        totalLimit: 100,
        requestBudget: 20,
      }),
    ],
    [["Manual Trigger", ["Address History"]]],
    "Set the public address and credential. Replace Manual Trigger with Schedule Trigger for monitoring. Store signatures with a UNIQUE(network, signature) key in your database. Save the returned continuation only after successful upserts. Overlap time/slot windows when reconciling. Storage is deployment-specific and is not preconfigured.",
  ),
);
write(
  "examples/04-xstocks-deployment-inspection.json",
  workflow(
    "Triton — Inspect selected xStocks Solana deployment",
    [node("Inspect Solana Account", "account", "get", { address })],
    [["Manual Trigger", ["Inspect Solana Account"]]],
    "Connect the output of your installed xStocks workflow after explicitly selecting a Solana deployment. Map that deployment address to publicAddress. Configure Triton credentials. This starter does not guess another package’s node type or asset schema.",
  ),
);
write(
  "examples/05-priority-fee-observation.json",
  workflow(
    "Triton — Priority fee observation",
    [
      node("Median Fee Samples", "fee", "getRecentPriorityFees", {
        feeMode: "percentile",
        percentile: 5000,
        writableAccounts: "[]",
      }),
    ],
    [["Manual Trigger", ["Median Fee Samples"]]],
    "Select your Triton credential. Optionally set the transaction’s writable account addresses. Each sample retains its slot. Add your chosen aggregation downstream; samples are observations, not a guaranteed landing fee. No transaction is submitted.",
  ),
);
write(
  "examples/06-digital-asset-inventory.json",
  workflow(
    "Triton — Digital asset inventory",
    [
      node("Owner Assets", "digitalAsset", "getByOwner", {
        address: "",
        retrieval: "onePage",
        outputMode: "split",
      }),
      node(
        "Asset Detail",
        "digitalAsset",
        "get",
        { address: "={{$json.data.id}}" },
        [600, 180],
      ),
    ],
    [
      ["Manual Trigger", ["Owner Assets"]],
      ["Owner Assets", ["Asset Detail"]],
    ],
    "Configure a mainnet Triton endpoint with DAS access and select its credential on both nodes. Enter the owner address. Empty inventory produces no detail calls. Metadata URLs are returned as data and never fetched automatically.",
  ),
);
const submission = workflow(
  "Triton — Devnet submission and monitoring",
  [
    node("Submit Transaction", "transaction", "submit", {
      transaction: "",
      preflightCommitment: "confirmed",
      maxRetries: 0,
    }),
    {
      id: "wallet",
      name: "Solana Wallet",
      type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet",
      typeVersion: 1,
      position: [360, 410],
      parameters: { publicAddress: "", network: "devnet", signingMode: "sign" },
    },
    {
      id: "wait",
      name: "Wait 5 Seconds",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [600, 180],
      parameters: { resume: "timeInterval", amount: 5, unit: "seconds" },
    },
    node(
      "Transaction Status",
      "transaction",
      "getStatuses",
      {
        signatures: "={{JSON.stringify([$json.data.signature])}}",
        searchTransactionHistory: true,
      },
      [900, 180],
    ),
  ],
  [
    ["Manual Trigger", ["Submit Transaction"]],
    ["Submit Transaction", ["Wait 5 Seconds"]],
    ["Wait 5 Seconds", ["Transaction Status"]],
  ],
  "DEVNET ONLY starter. Set the Triton credential to Devnet. Click the wallet below Submit: enter Public Address and create/select its wallet credential. Paste your own prepared transaction. Manual execution can submit it. The bounded example checks once after 5 seconds; unknown/pending requires later reconciliation, not blind resubmission. For already-signed input, change the wallet mode; no private key is required.",
);
submission.connections["Solana Wallet"] = {
  ai_tool: [[{ node: "Submit Transaction", type: "ai_tool", index: 0 }]],
};
write("examples/07-devnet-submission-and-monitoring.json", submission);
const { EXTRA } = require("../dist/nodes/TarvosTritonOne/expanded");
const { SERVICES } = require("../dist/nodes/TarvosTritonOne/services");
const rows = Object.entries(OPERATIONS).flatMap(([resource, ops]) =>
  Object.entries(ops).map(([operation, method]) => ({
    resource,
    operation,
    method,
    protocol: "json-rpc",
  })),
);
for (const [key, spec] of Object.entries(EXTRA)) {
  const [resource, operation] = key.split(".");
  rows.push({ resource, operation, method: spec.method, protocol: "json-rpc" });
}
const serviceMethods = {
  simulate: "simulateTransaction",
  confirm: "getSignatureStatuses",
  submitCascade: "POST /sendtx",
  simulateBundle: "simulateBundle",
  getInfo: "GetInfo",
  getVenues: "GetVenues",
  listProviders: "ListProviders",
  quote: "NewSwapQuoteStream",
  swap: "NewSwapQuoteStream + sendTransaction",
  exportAddressHistory: "getTransactionsForAddress",
  exportBlocks: "getBlocks + getBlock",
};
for (const [resource, ops] of Object.entries(SERVICES))
  for (const operation of ops)
    rows.push({
      resource,
      operation,
      method: serviceMethods[operation] ?? operation,
      protocol:
        resource === "titan"
          ? "websocket-messagepack"
          : ["worker", "administration"].includes(resource)
            ? "https"
            : operation === "submitCascade"
              ? "https"
              : "json-rpc",
    });
const operations = rows.map((row) => {
  const { resource, operation } = row;
  const walletRequired = [
    "transaction.submit",
    "transaction.submitCascade",
    "titan.swap",
  ].includes(resource + "." + operation);
  return {
    ...row,
    sideEffect: walletRequired
      ? "transaction-submission"
      : operation === "acknowledgeEvents"
        ? "consumer-acknowledgement"
        : "read",
    walletRequired,
    pagination:
      PAGINATED.includes(resource + "." + operation) || resource === "archive",
    splitRecords: COLLECTIONS.includes(resource + "." + operation),
    credential:
      resource === "worker"
        ? "tritonWorkerApi"
        : resource === "administration"
          ? "tritonManagementApi"
          : "tritonOneSolanaApi",
    parameters: properties.filter(
      (p) =>
        !p.displayOptions ||
        ((p.displayOptions.show?.resource ?? [resource]).includes(resource) &&
          (p.displayOptions.show?.operation ?? [operation]).includes(
            operation,
          )),
    ),
  };
});
write("docs/operation-contract.json", {
  version: 2,
  packageVersion: require("../package.json").version,
  nodeType: type,
  walletNodeType: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet",
  walletConnectionType: "ai_tool",
  walletLabel: "Wallet",
  walletCredential: "tarvosSolanaWalletApi",
  output: {
    response: "{data,meta}",
    error: "{error:{code,message,...safeDetails}}",
    largeIntegers: "decimal strings",
  },
  operations,
  trigger: require("../dist/nodes/TarvosTritonTrigger/TarvosTritonTrigger.node")
    .TarvosTritonTrigger.prototype
    ? new (require("../dist/nodes/TarvosTritonTrigger/TarvosTritonTrigger.node").TarvosTritonTrigger)()
        .description
    : null,
});
const mintIn = "So11111111111111111111111111111111111111112",
  mintOut = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
write(
  "examples/08-titan-quote.json",
  workflow(
    "Triton � Titan quote",
    [
      node("Titan Quote", "titan", "quote", {
        inputMint: mintIn,
        outputMint: mintOut,
        titanAmount: "1000000",
        titanPublicAddress: "",
        slippageBps: 50,
      }),
    ],
    [["Manual Trigger", ["Titan Quote"]]],
    "Read-only quote example. Set a mainnet Triton credential and a public wallet address. Amounts are atomic-unit integer strings. This example cannot sign or submit.",
  ),
);
const swapFlow = workflow(
  "Triton � Titan swap with Solana Wallet",
  [
    node("Titan Swap", "titan", "swap", {
      inputMint: mintIn,
      outputMint: mintOut,
      titanAmount: "",
      minimumOutput: "",
      slippageBps: 50,
      computeUnitPrice: "0",
    }),
    {
      id: "wallet",
      name: "Solana Wallet",
      type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet",
      typeVersion: 1,
      position: [360, 420],
      parameters: {
        publicAddress: "",
        network: "mainnet",
        signingMode: "sign",
      },
    },
  ],
  [["Manual Trigger", ["Titan Swap"]]],
  "MAINNET TRANSACTION ACTION. Enter your amounts, minimum output, wallet and credentials deliberately. Executing this workflow can spend funds. The node obtains a fresh Titan quote, simulates, signs through Solana Wallet, and submits once. Confirm the returned signature separately. No credentials or funded accounts are included.",
);
swapFlow.connections["Solana Wallet"] = {
  ai_tool: [[{ node: "Titan Swap", type: "ai_tool", index: 0 }]],
};
write("examples/09-titan-wallet-swap.json", swapFlow);
const streamNode = (name, parameters) => ({
  id: "stream",
  name,
  type: "n8n-nodes-tarvos-triton-one.tarvosTritonTrigger",
  typeVersion: 1,
  position: [300, 180],
  parameters,
});
const streamWorkflow = (name, parameters, note) => {
  const w = workflow(name, [streamNode("Triton Stream", parameters)], [], note);
  w.nodes = w.nodes.filter((n) => n.id !== "manual");
  return w;
};
write(
  "examples/10-whirligig-monitor.json",
  streamWorkflow(
    "Triton � Whirligig account monitoring",
    {
      source: "whirligig",
      topic: "account",
      watchAddress: "",
      wsOptions: '{"commitment":"confirmed"}',
      batchSize: 100,
      flushMs: 1000,
    },
    "Select an RPC credential and enter the address to watch. Manual listening stops after the first batch. Published workflows listen continuously. Disconnects can leave gaps; use a worker when you need a durable inbox.",
  ),
);
const workerFlow = workflow(
  "Triton � Durable worker inbox",
  [
    node("Read Inbox", "worker", "getEvents", {
      consumer: "n8n-monitor",
      eventLimit: 100,
    }),
    {
      ...node(
        "Acknowledge After Processing",
        "worker",
        "acknowledgeEvents",
        {
          consumer: "n8n-monitor",
          receipt: "={{$('Read Inbox').item.json.data.receipt}}",
        },
        [900, 180],
      ),
      disabled: true,
    },
  ],
  [["Manual Trigger", ["Read Inbox"]]],
  "Select the worker credential. Read Inbox returns events plus one durable receipt. Add your downstream durable processing, then connect and enable Acknowledge After Processing. Do not acknowledge empty batches or before processing succeeds. Use one workflow per consumer and make downstream side effects idempotent by eventId.",
);
write("examples/11-worker-inbox.json", workerFlow);
write(
  "examples/12-vixen-program-monitor.json",
  streamWorkflow(
    "Triton � Vixen parsed program monitoring",
    {
      source: "vixen",
      vixenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      batchSize: 100,
      executionLimit: 60,
    },
    "Requires a Vixen-enabled endpoint and Triton Stream API credential. This is program-wide and can be high volume. Use the worker and a durable sink for sustained traffic. Parser output is provider-specific and may omit slot context.",
  ),
);
write("examples/13-guided-wallet-quote.json", {
  "name": "Guided Titan quote through Solana Wallet",
  "active": false,
  "nodes": [
    {
      "id": "guided-quote",
      "name": "Get a Swap Quote",
      "type": "n8n-nodes-tarvos-triton-one.tarvosTritonOne",
      "typeVersion": 1.3,
      "position": [
        400,
        200
      ],
      "parameters": {
        "resource": "titan",
        "operation": "quote",
        "quoteWallet": "wallet",
        "showAdvanced": false,
        "tradeAmount": "0.1"
      }
    },
    {
      "id": "quote-wallet",
      "name": "Solana Wallet",
      "type": "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet",
      "typeVersion": 1,
      "position": [
        400,
        420
      ],
      "parameters": {
        "network": "mainnet",
        "signingMode": "readOnly",
        "publicAddress": ""
      }
    }
  ],
  "connections": {
    "Solana Wallet": {
      "ai_tool": [
        [
          {
            "node": "Get a Swap Quote",
            "type": "ai_tool",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {},
  "pinData": {}
});
console.log(
  `Generated 13 inactive examples and ${operations.length} action contracts.`,
);
