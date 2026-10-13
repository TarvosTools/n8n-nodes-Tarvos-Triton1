// Uses an installed n8n runtime supplied explicitly as argv[2]. No network transactions.
const path = require("node:path");
const assert = require("node:assert/strict");
const runtime = path.resolve(process.argv[2]);
const { Workflow, NodeHelpers } = require(path.join(runtime, "n8n-workflow"));
const { ExecuteContext } = require(
  path.join(
    runtime,
    "n8n-core/dist/execution-engine/node-execution-context/execute-context",
  ),
);
const {
  TarvosTritonOne,
} = require("../dist/nodes/TarvosTritonOne/TarvosTritonOne.node");
const {
  TarvosSolanaWallet,
} = require("../dist/nodes/TarvosSolanaWallet/TarvosSolanaWallet.node");
const {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} = require("@solana/web3.js");
const types = {
  "n8n-nodes-tarvos-triton-one.tarvosTritonOne": new TarvosTritonOne(),
  "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet": new TarvosSolanaWallet(),
};
const registry = {
  getByNameAndVersion: (name) => {
    if (!types[name]) throw Error(name);
    return types[name];
  },
  getKnownTypes: () => ({}),
};
const key = Keypair.generate();
const nodes = [
  {
    id: "main",
    name: "Triton",
    type: "n8n-nodes-tarvos-triton-one.tarvosTritonOne",
    typeVersion: 1,
    position: [480, 200],
    parameters: { resource: "transaction", operation: "submit" },
  },
  {
    id: "wallet",
    name: "Wallet",
    type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet",
    typeVersion: 1,
    position: [480, 400],
    parameters: {
      publicAddress: "={{$json.walletAddress}}",
      network: "devnet",
      signingMode: "alreadySigned",
    },
  },
];
const connections = {
  Wallet: { ai_tool: [[{ node: "Triton", type: "ai_tool", index: 0 }]] },
};
const workflow = new Workflow({
  id: "triton-offline-smoke",
  name: "Triton offline smoke",
  nodes,
  connections,
  active: false,
  nodeTypes: registry,
  settings: { executionOrder: "v1" },
});
async function main() {
  const inputs = NodeHelpers.getNodeInputs(
    workflow,
    workflow.nodes.Triton,
    types[nodes[0].type].description,
  );
  assert.equal(inputs[1].displayName, "Wallet");
  assert.equal(inputs[1].required, true);
  assert.equal(inputs[1].maxConnections, 1);
  for (const parameters of [
    { resource: "titan", operation: "swap" },
    { resource: "transaction", operation: "submitCascade" },
  ]) {
    workflow.nodes.Triton.parameters = parameters;
    const ports = NodeHelpers.getNodeInputs(
      workflow,
      workflow.nodes.Triton,
      types[nodes[0].type].description,
    );
    assert.equal(ports[1].displayName, "Wallet");
  }
  workflow.nodes.Triton.parameters = {
    resource: "transaction",
    operation: "submit",
  };
  const items = [
    { json: { walletAddress: key.publicKey.toBase58() } },
    { json: { walletAddress: Keypair.generate().publicKey.toBase58() } },
  ];
  const run = {
    resultData: { runData: {} },
    executionData: {
      contextData: {},
      nodeExecutionStack: [],
      metadata: {},
      waitingExecution: {},
      waitingExecutionSource: {},
    },
  };
  const executeData = {
    node: workflow.nodes.Triton,
    data: { main: [items] },
    source: null,
  };
  const additional = {
    executionId: "offline",
    currentNodeExecutionIndex: 0,
    variables: {},
    hooks: { runHook: async () => {} },
    credentialsHelper: {},
    setExecutionStatus: () => {},
    logAiEvent: () => {},
  };
  const context = new ExecuteContext(
    workflow,
    workflow.nodes.Triton,
    additional,
    "manual",
    run,
    0,
    items,
    { main: [items] },
    executeData,
    [],
  );
  const capability = await context.getInputConnectionData("ai_tool", 0);
  assert.equal(capability.kind, "tarvos.solana.wallet.v1");
  assert.equal(capability.publicAddress, items[0].json.walletAddress);
  const second = await context.getInputConnectionData("ai_tool", 1);
  assert.equal(second.publicAddress, items[1].json.walletAddress);
  const message = new TransactionMessage({
    payerKey: key.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: key.publicKey,
        toPubkey: key.publicKey,
        lamports: 0,
      }),
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([key]);
  const prepared = await capability.prepare(
    Buffer.from(tx.serialize()).toString("base64"),
    "devnet",
  );
  assert.ok(prepared.signature);
  const restored = new Workflow({
    id: "restored",
    nodes: JSON.parse(JSON.stringify(nodes)),
    connections: JSON.parse(JSON.stringify(connections)),
    active: false,
    nodeTypes: registry,
  });
  assert.deepEqual(
    restored.connectionsByDestinationNode.Triton.ai_tool,
    workflow.connectionsByDestinationNode.Triton.ai_tool,
  );
  workflow.nodes.Triton.parameters = {
    resource: "account",
    operation: "getBalance",
  };
  assert.deepEqual(
    NodeHelpers.getNodeInputs(
      workflow,
      workflow.nodes.Triton,
      types[nodes[0].type].description,
    ),
    ["main"],
  );
  // Exercise new guided wallet metadata through the actual n8n engine.
  workflow.nodes.Triton.typeVersion = 1.3;
  workflow.nodes.Triton.parameters = {resource: "titan", operation: "quote", quoteWallet: "wallet"};
  workflow.nodes.Wallet.parameters.signingMode = "readOnly";
  const quotePorts = NodeHelpers.getNodeInputs(workflow, workflow.nodes.Triton, types[nodes[0].type].description);
  assert.equal(quotePorts[1].displayName, "Wallet");
  // Fresh contexts avoid reusing the previous already-signed capability cache.
  const quoteContext = new ExecuteContext(workflow, workflow.nodes.Triton, additional, "manual", {...run, resultData: {runData: {}}}, 0, items, {main: [items]}, executeData, []);
  const quoteWallet = await quoteContext.getInputConnectionData("ai_tool", 0);
  assert.equal(quoteWallet.mode, "readOnly");
  await assert.rejects(() => quoteWallet.prepare("", "devnet"), /public-address-only/);
  workflow.nodes.Triton.parameters.quoteWallet = "address";
  assert.deepEqual(NodeHelpers.getNodeInputs(workflow, workflow.nodes.Triton, types[nodes[0].type].description), ["main"]);
  for (const version of [1, 1.1, 1.2, 1.3]) {
    const params = NodeHelpers.getNodeParameters(types[nodes[0].type].description.properties, {resource: "titan", operation: "quote"}, true, false, {typeVersion: version});
    if (version === 1.3) {
      assert.equal(params.tradeUnits, "tokens");
      assert.equal(params.quoteWallet, "wallet");
    } else assert.equal(params.titanAmount, "");
  }
  console.log("PASS: version 1.3 quote wallet ports, public-only capability and all action-version defaults.");
  const http = require("node:http");
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"lamports":18446744073709551615}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const body = await context.helpers.httpRequest({
      method: "GET",
      url: `http://127.0.0.1:${server.address().port}/`,
      json: false,
      encoding: "text",
      disableFollowRedirect: true,
      timeout: 2000,
    });
    assert.equal(typeof body, "string");
    assert.equal(
      require("../dist/nodes/TarvosTritonOne/losslessJson").parseLosslessJson(
        body,
      ).lamports,
      "18446744073709551615",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    "PASS: real n8n ExecuteContext resolves wallet attachment, per-item expressions and signed payload; workflow round-trip and read isolation pass.",
  );
  console.log(
    "PASS: actual n8n HTTP helper preserves raw unsafe integer through loopback response.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
