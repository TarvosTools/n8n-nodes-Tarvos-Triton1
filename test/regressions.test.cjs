const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  AddressLookupTableAccount,
} = require("@solana/web3.js");
const {
  TarvosTritonOne,
} = require("../dist/nodes/TarvosTritonOne/TarvosTritonOne.node");
const { properties } = require("../dist/nodes/TarvosTritonOne/descriptions");
const { GENESIS } = require("../dist/nodes/TarvosTritonOne/validation");
const {
  validatePreparedTransaction,
} = require("../dist/nodes/TarvosSolanaWallet/signing");
const { buildRequest } = require("../dist/nodes/TarvosTritonOne/operations");
const a = "11111111111111111111111111111111";
test("RPC allowlist rejects inherited object properties", () => {
  assert.throws(() => buildRequest("__proto__.toString", {}));
  assert.throws(() => buildRequest("account.constructor", {}));
});
function context({
  operation = "getBalance",
  resource = "account",
  count = 3,
  continuation = false,
  responder,
  parameter,
} = {}) {
  let calls = 0;
  return {
    getCredentials: async () => ({
      endpoint: "https://demo.rpcpool.com",
      apiToken: "secret-fixture",
      network: "devnet",
    }),
    getInputData: () => Array.from({ length: count }, () => ({ json: {} })),
    getNodeParameter: (name, index, fallback) =>
      parameter?.(name, index, fallback) ??
      { resource, operation, address: a }[name] ??
      fallback,
    getNode: () => ({
      name: "Triton",
      type: "n8n-nodes-tarvos-triton-one.tarvosTritonOne",
      parameters: {},
    }),
    continueOnFail: () => continuation,
    helpers: {
      httpRequest: async (o) => {
        const b = JSON.parse(o.body);
        calls++;
        const result =
          b.method === "getGenesisHash"
            ? GENESIS.devnet
            : await responder(b, calls);
        return JSON.stringify({ jsonrpc: "2.0", id: b.id, result });
      },
    },
    calls: () => calls,
  };
}
test("inactive submission expressions are never evaluated during reads", async () => {
  const ctx = context({
    count: 1,
    parameter: (name) => {
      if (name === "transaction" || name === "preflightCommitment")
        assert.fail("hidden submit field evaluated");
    },
    responder: async () => ({ value: 1, context: { slot: 1 } }),
  });
  const [rows] = await new TarvosTritonOne().execute.call(ctx);
  assert.equal(rows[0].json.data.lamports, "1");
});
test("rate-limit continuation emits paired error and stops remaining inputs", async () => {
  const ctx = context({
    continuation: true,
    responder: async () => {
      throw { statusCode: 429 };
    },
  });
  const [rows] = await new TarvosTritonOne().execute.call(ctx);
  assert.equal(ctx.calls(), 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].json.error.code, "RATE_LIMIT");
  assert.deepEqual(rows[0].pairedItem, { item: 0 });
});
test("validation continuation pairs each result to its input", async () => {
  const ctx = context({
    continuation: true,
    count: 2,
    parameter: (n, i) => (n === "address" ? (i ? a : "invalid") : undefined),
    responder: async () => ({ value: 2 }),
  });
  const [rows] = await new TarvosTritonOne().execute.call(ctx);
  assert.equal(rows[0].json.error.code, "INVALID_INPUT");
  assert.equal(rows[1].json.data.lamports, "2");
  assert.deepEqual(rows[1].pairedItem, { item: 1 });
});
test("empty split results produce no output items", async () => {
  const ctx = context({
    resource: "token",
    operation: "getByOwner",
    count: 1,
    parameter: (n) => (n === "outputMode" ? "split" : undefined),
    responder: async () => ({ context: { slot: 1 }, value: [] }),
  });
  assert.deepEqual(await new TarvosTritonOne().execute.call(ctx), [[]]);
});
test("account data slicing has an explicit encoding contract", () => {
  assert.deepEqual(
    buildRequest("account.get", {
      address: a,
      dataSlice: { offset: 10, length: 20 },
    }).params[1].dataSlice,
    { offset: 10, length: 20 },
  );
  assert.throws(() =>
    buildRequest("account.get", {
      address: a,
      dataSlice: { length: 20 },
      accountEncoding: "jsonParsed",
    }),
  );
});
test("enhanced comparison filters and DAS grouping serialize precisely", () => {
  const history = buildRequest("transaction.getHistory", {
    address: a,
    historyFilters: {
      slotGt: 10,
      slotLte: 20,
      blockTimeEq: 123,
      signatureLt: "1".repeat(64),
    },
  }).params[1];
  assert.deepEqual(history.filters, {
    slot: { gt: 10, lte: 20 },
    blockTime: { eq: 123 },
    signature: { lt: "1".repeat(64) },
  });
  const search = buildRequest("digitalAsset.search", {
    assetFilters: {
      groupingKey: "collection",
      groupingValue: a,
      interface: "V1_NFT",
      creatorVerified: false,
      negate: false,
    },
  }).params;
  assert.deepEqual(search.grouping, ["collection", a]);
  assert.equal(search.creatorVerified, false);
  assert.equal(search.negate, false);
  assert.equal(search.interface, "V1_NFT");
  assert.throws(() =>
    buildRequest("digitalAsset.search", {
      assetFilters: { groupingKey: "collection" },
    }),
  );
});
test("v0 lookup table resolution rejects missing tables before signing", async () => {
  const key = Keypair.generate(),
    recipient = Keypair.generate().publicKey;
  const table = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: BigInt("18446744073709551615"),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: key.publicKey,
      addresses: [recipient],
    },
  });
  const msg = new TransactionMessage({
    payerKey: key.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: key.publicKey,
        toPubkey: recipient,
        lamports: 1,
      }),
    ],
  }).compileToV0Message([table]);
  assert.equal(msg.addressTableLookups.length, 1);
  let calls = 0;
  await assert.rejects(
    validatePreparedTransaction(
      new VersionedTransaction(msg),
      async (method) => {
        calls++;
        assert.equal(method, "getAccountInfo");
        return { value: null };
      },
      "confirmed",
    ),
    { code: "LOOKUP_TABLE" },
  );
  assert.equal(calls, 1);
});
test("metadata fields have defaults and exact resource/operation visibility", () => {
  for (const property of properties) {
    assert.ok("default" in property, property.name);
  }
  const forBalance = properties.filter(
    (p) =>
      p.displayOptions?.show?.resource?.includes("account") &&
      p.displayOptions.show.operation?.includes("getBalance"),
  );
  assert.ok(forBalance.some((p) => p.name === "address"));
  assert.ok(!forBalance.some((p) => p.name === "transaction"));
  const mint = properties.find((p) => p.name === "mint");
  assert.deepEqual(mint.displayOptions.show.tokenFilter, ["mint"]);
});
test("thirteen workflow starters are inactive and contain no credential IDs or pinned results", () => {
  const files = fs
    .readdirSync(path.join(__dirname, "../examples"))
    .filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 13);
  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../examples", file)),
    );
    assert.equal(data.active, false);
    assert.deepEqual(data.pinData, {});
    for (const node of data.nodes) assert.equal(node.credentials, undefined);
  }
  const tx = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        "../examples/07-devnet-submission-and-monitoring.json",
      ),
    ),
  );
  assert.equal(
    tx.connections["Solana Wallet"].ai_tool[0][0].node,
    "Submit Transaction",
  );
  assert.equal(
    tx.nodes.find((n) => n.name === "Solana Wallet").parameters.network,
    "devnet",
  );
});
