const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  EXTRA,
  extraRequest,
} = require("../dist/nodes/TarvosTritonOne/expanded");
const { properties } = require("../dist/nodes/TarvosTritonOne/descriptions");
const {
  executeService,
  redactAdministration,
} = require("../dist/nodes/TarvosTritonOne/services");
const { buildRequest } = require("../dist/nodes/TarvosTritonOne/operations");
const {
  titanRequest,
  buildSwap,
  selectRoute,
  validateQuoteContext,
  checkQuoteExpiry,
  jsonSafe,
} = require("../dist/nodes/TarvosTritonOne/titan");
const { submit } = require("../dist/nodes/TarvosTritonOne/submission");
const {
  createWallet,
  decodeTransaction,
} = require("../dist/nodes/TarvosSolanaWallet/signing");
const {
  workerEndpoint,
} = require("../dist/nodes/TarvosTritonOne/serviceCredentials");
const a = "11111111111111111111111111111111",
  b = "So11111111111111111111111111111111111111112";
const fixtures = {
  "account.getRentExemption": ["getMinimumBalanceForRentExemption", [165, {}]],
  "token.getByMint": ["getTokenAccountsByMint", [a, { encoding: "base64" }]],
  "block.getRange": ["getBlocks", [10, 20, {}]],
  "block.getWithLimit": ["getBlocksWithLimit", [10, 100, {}]],
  "block.getCommitment": ["getBlockCommitment", [10]],
  "block.getProduction": ["getBlockProduction", [{}]],
  "network.getPerformanceSamples": ["getRecentPerformanceSamples", [100]],
  "network.getTransactionCount": ["getTransactionCount", [{}]],
  "network.getSupply": ["getSupply", [{}]],
  "network.getVoteAccounts": ["getVoteAccounts", [{}]],
  "network.getClusterNodes": ["getClusterNodes", []],
  "network.getEpochSchedule": ["getEpochSchedule", []],
  "network.getLeaderSchedule": ["getLeaderSchedule", [10, {}]],
  "network.getSlotLeader": ["getSlotLeader", [{}]],
  "network.getSlotLeaders": ["getSlotLeaders", [10, 100]],
  "network.getFirstAvailableBlock": ["getFirstAvailableBlock", []],
  "network.getMinimumLedgerSlot": ["minimumLedgerSlot", []],
  "network.getInflationRate": ["getInflationRate", []],
  "network.getInflationGovernor": ["getInflationGovernor", [{}]],
  "network.getInflationReward": ["getInflationReward", [[a], {}]],
  "transaction.isBlockhashValid": ["isBlockhashValid", [a, {}]],
  "digitalAsset.getProofs": ["getAssetProofs", { ids: [a] }],
  "digitalAsset.getAssetSignatures": ["getAssetSignatures", { id: a }],
  "digitalAsset.getByAuthority": [
    "getAssetsByAuthority",
    [a, { sortBy: "created", sortDirection: "desc" }, 100, 1, null, null],
  ],
  "digitalAsset.getByCreator": [
    "getAssetsByCreator",
    [a, true, { sortBy: "created", sortDirection: "desc" }, 100, 1, null, null],
  ],
  "digitalAsset.getEditions": [
    "getNftEditions",
    { mintAddress: a, page: 1, limit: 100 },
  ],
};
const params = {
  extra_mintAddress: a,
  extra_startSlot: 10,
  extra_endSlot: 20,
  extra_slot: 10,
  extra_limit: 100,
  extra_addresses: [a],
  extra_blockhash: a,
  extra_ids: [a],
  extra_id: a,
  extra_authorityAddress: a,
  extra_creatorAddress: a,
};
for (const [key, [method, expected]] of Object.entries(fixtures))
  test("extended RPC contract: " + key, () =>
    assert.deepEqual(extraRequest(key, params), { method, params: expected }),
  );
test("extended operation registry has independent fixtures and visible menu entries", () => {
  assert.deepEqual(Object.keys(EXTRA).sort(), Object.keys(fixtures).sort());
  for (const key of Object.keys(EXTRA)) {
    const [r, o] = key.split(".");
    assert.ok(
      properties
        .find(
          (p) =>
            p.name === "operation" &&
            p.displayOptions.show.resource.includes(r),
        )
        .options.some((v) => v.value === o),
    );
  }
});
test("extended queries enforce size, allowed fields, public keys and encoding constraints", () => {
  for (const [key, p] of [
    ["block.getRange", { ...params, extra_endSlot: 9 }],
    ["network.getPerformanceSamples", { extra_limit: 721 }],
    [
      "token.getByMint",
      {
        ...params,
        extra_options: {
          encoding: "jsonParsed",
          dataSlice: { offset: 0, length: 1 },
        },
      },
    ],
    [
      "network.getSupply",
      { extra_options: { rpcUrl: "https://example.invalid" } },
    ],
    ["transaction.isBlockhashValid", { extra_blockhash: "bad" }],
  ])
    assert.throws(() => extraRequest(key, p), { code: "INVALID_INPUT" });
});
test("fungible search and indexed token queries preserve typed filters", () => {
  assert.equal(
    buildRequest("digitalAsset.search", {
      assetFilters: { ownerAddress: a, tokenType: "All" },
    }).params.tokenType,
    "All",
  );
  assert.deepEqual(
    buildRequest("token.getByOwner", {
      address: a,
      dataSlice: { offset: 0, length: 32 },
      minContextSlot: 42,
    }).params[2],
    {
      commitment: "finalized",
      encoding: "base64",
      dataSlice: { offset: 0, length: 32 },
      minContextSlot: 42,
    },
  );
});
const owner = Keypair.generate(),
  other = Keypair.generate(),
  blockhash = Keypair.generate().publicKey.toBase58();
const ownerAddress = owner.publicKey.toBase58();
const ix = SystemProgram.transfer({
  fromPubkey: owner.publicKey,
  toPubkey: other.publicKey,
  lamports: 1,
});
const route = {
  inAmount: 100n,
  outAmount: 1000n,
  slippageBps: 50,
  computeUnitsSafe: 100000,
  instructions: [
    require("./swap-fixture.cjs").swapInstruction(ownerAddress, a, b),
  ],
};
const swap = {
  inputMint: a,
  outputMint: b,
  titanAmount: "100",
  minimumOutput: "995",
  slippageBps: 50,
  computeUnitPrice: "123",
};
const quote = {
  inputMint: new (require("@solana/web3.js").PublicKey)(a).toBytes(),
  outputMint: new (require("@solana/web3.js").PublicKey)(b).toBytes(),
  swapMode: "ExactIn",
  amount: 100n,
  quotes: { provider: route },
  metadata: { ExpectedWinner: "provider" },
};
const rpc = async (method) => {
  if (method === "getLatestBlockhash") return { value: { blockhash } };
  if (method === "getSlot") return 50;
  if (method === "getAccountInfo")
    return require("./swap-fixture.cjs").mintAccount();
  if (method === "getFeeForMessage") return { value: 5000 };
  throw Error("Unexpected " + method);
};
test("Titan request encodes exact u64 amount and public keys as bytes", () => {
  const result = titanRequest(
    { ...swap, titanAmount: "18446744073709551615" },
    ownerAddress,
  );
  assert.equal(result.swap.amount, 18446744073709551615n);
  assert.ok(result.swap.inputMint instanceof Uint8Array);
  assert.equal(result.transaction.transactionFormat, 0);
  assert.throws(
    () =>
      titanRequest(
        { ...swap, titanAmount: "18446744073709551616" },
        ownerAddress,
      ),
    { code: "INVALID_INPUT" },
  );
  assert.throws(() => titanRequest({ ...swap, outputMint: a }, ownerAddress), {
    code: "INVALID_INPUT",
  });
});
test("Titan validates quote identity and selects the expected winner", () => {
  validateQuoteContext(quote, swap);
  assert.equal(selectRoute(quote, "").provider, "provider");
  assert.throws(() => validateQuoteContext({ ...quote, amount: 101n }, swap), {
    code: "TITAN_ROUTE",
  });
  assert.throws(() => selectRoute(quote, "missing"), { code: "TITAN_ROUTE" });
  assert.throws(
    () => validateQuoteContext({ ...quote, outputMint: quote.inputMint }, swap),
    { code: "TITAN_ROUTE" },
  );
});
test("Titan builds canonical v0, inserts the user fee, and signs only in wallet", async () => {
  const encoded = await buildSwap(route, ownerAddress, swap, rpc);
  const tx = decodeTransaction(encoded);
  assert.equal(tx.version, 0);
  assert.equal(tx.message.staticAccountKeys[0].toBase58(), ownerAddress);
  assert.equal(
    tx.signatures[0].every((x) => x === 0),
    true,
  );
  const wallet = createWallet(
    ownerAddress,
    "mainnet",
    "sign",
    JSON.stringify([...owner.secretKey]),
  );
  const signed = await wallet.prepare(encoded, "mainnet");
  assert.ok(signed.signature);
  assert.notEqual(signed.transaction, encoded);
});
test("Titan rejects low output, excessive slippage, expired quotes and unexpected signers", async () => {
  await assert.rejects(
    buildSwap(route, ownerAddress, { ...swap, minimumOutput: "996" }, rpc),
    { code: "TITAN_ROUTE" },
  );
  await assert.rejects(
    buildSwap({ ...route, slippageBps: 51 }, ownerAddress, swap, rpc),
    { code: "INVALID_INPUT" },
  );
  await assert.rejects(
    buildSwap({ ...route, expiresAtMs: 1n }, ownerAddress, swap, rpc),
    { code: "TITAN_EXPIRED" },
  );
  await assert.rejects(checkQuoteExpiry({ expiresAfterSlot: 49n }, rpc), {
    code: "TITAN_EXPIRED",
  });
  const bad = {
    ...route,
    instructions: [
      {
        ...route.instructions[0],
        a: [{ p: other.publicKey.toBytes(), s: true, w: true }],
      },
    ],
  };
  await assert.rejects(buildSwap(bad, ownerAddress, swap, rpc), {
    code: "TITAN_ROUTE",
  });
});
test("JSON event conversion preserves bigint and protobuf Long precision", () => {
  const Long = require("long");
  assert.deepEqual(
    jsonSafe({
      amount: 18446744073709551615n,
      long: Long.fromString("18446744073709551615", true),
      bytes: Uint8Array.from([1, 2]),
    }),
    {
      amount: "18446744073709551615",
      long: "18446744073709551615",
      bytes: { encoding: "base64", data: "AQI=" },
    },
  );
});
function ctx(wallet) {
  return {
    getNode: () => ({ name: "Triton" }),
    getParentNodes: () => [
      { type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet" },
    ],
    getInputConnectionData: async () => wallet,
  };
}
test("signed simulation failure and expiry hook prevent submission", async () => {
  const transaction = await buildSwap(route, ownerAddress, swap, rpc),
    wallet = createWallet(
      ownerAddress,
      "mainnet",
      "sign",
      JSON.stringify([...owner.secretKey]),
    );
  const calls = [];
  const mock = async (method) => {
    calls.push(method);
    if (method === "isBlockhashValid") return { value: true };
    if (method === "simulateTransaction")
      return { value: { err: { bad: true } } };
    throw Error(method);
  };
  await assert.rejects(
    submit(
      ctx(wallet),
      0,
      { transaction, simulateFirst: true },
      mock,
      "mainnet",
    ),
    { code: "SIMULATION_FAILED" },
  );
  assert.ok(!calls.includes("sendTransaction"));
  await assert.rejects(
    submit(
      ctx(wallet),
      0,
      { transaction, simulateFirst: true },
      async (m) =>
        m === "simulateTransaction"
          ? { value: { err: null } }
          : { value: true },
      "mainnet",
      () => checkQuoteExpiry({ expiresAtMs: 1 }, rpc),
    ),
    { code: "TITAN_EXPIRED" },
  );
});
test("bundle simulation uses Jito encodedTransactions and per-transaction account arrays", async () => {
  const transaction = await buildSwap(route, ownerAddress, swap, rpc);
  let request;
  await executeService(
    {},
    0,
    "transaction.simulateBundle",
    { bundleTransactions: [transaction] },
    {},
    async (m, p) => {
      request = { m, p };
      return {};
    },
    "mainnet",
  );
  assert.deepEqual(request, {
    m: "simulateBundle",
    p: [
      { encodedTransactions: [transaction] },
      {
        transactionEncoding: "base64",
        preExecutionAccountsConfigs: [null],
        postExecutionAccountsConfigs: [null],
        skipSigVerify: true,
        replaceRecentBlockhash: true,
      },
    ],
  });
});
test("Cascade sends only the wallet-signed bytes and validated policy header", async () => {
  const transaction = await buildSwap(route, ownerAddress, swap, rpc);
  const wallet = createWallet(
    ownerAddress,
    "mainnet",
    "sign",
    JSON.stringify([...owner.secretKey]),
  );
  let sent;
  const context = {
    ...ctx(wallet),
    helpers: {
      httpRequest: async (options) => {
        sent = options;
        const prepared = await wallet.prepare(transaction, "mainnet");
        assert.equal(options.body, prepared.transaction);
        return prepared.signature;
      },
    },
  };
  const result = await executeService(
    context,
    0,
    "transaction.submitCascade",
    { transaction, forwardingPolicies: [a] },
    { endpoint: "https://demo.rpcpool.com/", apiToken: "TEST_TOKEN" },
    async (m) =>
      m === "simulateTransaction" ? { value: { err: null } } : { value: true },
    "mainnet",
  );
  assert.equal(result.data.submissionStatus, "accepted");
  assert.equal(sent.headers["solana-forwardingpolicies"], a);
  assert.match(sent.url, /sendtx\?encoding=base64/);
  assert.equal(sent.disableFollowRedirect, true);
});
test("archive exports stop at configured budget and expose a continuation slot", async () => {
  const result = await executeService(
    {},
    0,
    "archive.exportBlocks",
    { startSlot: 10, endSlot: 30, maxBlocks: 2 },
    {},
    async (m, p) => (m === "getBlocks" ? [10, 12, 20] : { slot: p[0] }),
    "mainnet",
  );
  assert.equal(result.data.length, 2);
  assert.equal(result.meta.nextStartSlot, 13);
  assert.equal(result.meta.complete, false);
});
test("management responses redact tokens and worker URLs enforce TLS or loopback", () => {
  assert.deepEqual(
    redactAdministration({
      data: [
        {
          name: "endpoint",
          value: "SECRET",
          tokens: ["SECRET"],
          password: "SECRET",
          apiKey: "SECRET",
        },
      ],
    }),
    { data: [{ name: "endpoint" }] },
  );
  assert.equal(
    workerEndpoint("http://127.0.0.1:5690").href,
    "http://127.0.0.1:5690/",
  );
  assert.throws(() => workerEndpoint("http://remote.example/"));
  assert.throws(() => workerEndpoint("https://user:secret@remote.example/"));
});
test("all registered nodes and credential modules ship", () => {
  const manifest = require("../package.json");
  for (const file of [...manifest.n8n.nodes, ...manifest.n8n.credentials])
    assert.ok(
      fs.existsSync(require("node:path").join(__dirname, "..", file)),
      file,
    );
});
