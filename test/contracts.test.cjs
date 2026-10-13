const { test } = require("node:test");
const assert = require("node:assert/strict");
const { OPERATIONS } = require("../dist/nodes/TarvosTritonOne/apiContract");
const {
  buildRequest,
  executeRead,
} = require("../dist/nodes/TarvosTritonOne/operations");
const {
  parseLosslessJson,
} = require("../dist/nodes/TarvosTritonOne/losslessJson");
const {
  createRpc,
  validateNetwork,
} = require("../dist/nodes/TarvosTritonOne/transport");
const {
  address,
  signature,
  endpoint,
  sol,
  GENESIS,
} = require("../dist/nodes/TarvosTritonOne/validation");
const {
  TarvosTritonOne,
} = require("../dist/nodes/TarvosTritonOne/TarvosTritonOne.node");
const { defaults } = require("../dist/nodes/TarvosTritonOne/descriptions");
const a = "11111111111111111111111111111111",
  s = "1".repeat(64);
const p = {
  ...defaults,
  address: a,
  addresses: [a],
  signature: s,
  signatures: [s],
  slot: 12,
  message: "AQ==",
  programFilters: { filters: [{ kind: "dataSize", offset: 165 }] },
  assetFilters: { ownerAddress: a },
  transaction: "AQ==",
};
const methods = {
  "account.getBalance": "getBalance",
  "account.get": "getAccountInfo",
  "account.getMany": "getMultipleAccounts",
  "account.getByProgram": "getProgramAccounts",
  "token.getBalance": "getTokenAccountBalance",
  "token.getSupply": "getTokenSupply",
  "token.getByOwner": "getTokenAccountsByOwner",
  "token.getByDelegate": "getTokenAccountsByDelegate",
  "token.getLargestAccounts": "getTokenLargestAccounts",
  "transaction.get": "getTransaction",
  "transaction.getSignatures": "getSignaturesForAddress",
  "transaction.getStatuses": "getSignatureStatuses",
  "transaction.getHistory": "getTransactionsForAddress",
  "network.getSlot": "getSlot",
  "network.getBlockHeight": "getBlockHeight",
  "network.getEpochInfo": "getEpochInfo",
  "network.getHealth": "getHealth",
  "network.getVersion": "getVersion",
  "network.getGenesisHash": "getGenesisHash",
  "network.getLatestBlockhash": "getLatestBlockhash",
  "block.get": "getBlock",
  "block.getTime": "getBlockTime",
  "fee.getRecentPriorityFees": "getRecentPrioritizationFees",
  "fee.getForMessage": "getFeeForMessage",
  "digitalAsset.get": "getAsset",
  "digitalAsset.getMany": "getAssets",
  "digitalAsset.getByOwner": "getAssetsByOwner",
  "digitalAsset.search": "searchAssets",
  "digitalAsset.getProof": "getAssetProof",
  "digitalAsset.getTokenAccounts": "getTokenAccounts",
};
test("all 31 operations are declared", () =>
  assert.equal(Object.values(OPERATIONS).flatMap(Object.keys).length, 31));
for (const [key, method] of Object.entries(methods))
  test(`typed serializer: ${key}`, () => {
    const result = buildRequest(key, p);
    assert.equal(result.method, method);
    assert.ok(
      Array.isArray(result.params) || typeof result.params === "object",
    );
  });
test("standard and DAS methods use their exact request shapes", () => {
  assert.deepEqual(buildRequest("account.getBalance", p).params, [
    a,
    { commitment: "finalized" },
  ]);
  assert.deepEqual(buildRequest("transaction.get", p).params, [
    s,
    {
      commitment: "finalized",
      encoding: "json",
      maxSupportedTransactionVersion: 1,
    },
  ]);
  assert.deepEqual(buildRequest("digitalAsset.getByOwner", p).params, [
    a,
    { sortBy: "created", sortDirection: "desc" },
    50,
    1,
    null,
    null,
  ]);
  assert.deepEqual(buildRequest("digitalAsset.getMany", p).params, {
    ids: [a],
  });
  assert.deepEqual(buildRequest("digitalAsset.getTokenAccounts", p).params, {
    ownerAddress: a,
    page: 1,
    limit: 50,
  });
  assert.deepEqual(
    buildRequest("fee.getRecentPriorityFees", { ...p, feeMode: "percentile" })
      .params,
    [[], { percentile: 5000 }],
  );
  assert.equal(
    buildRequest("transaction.getStatuses", p).commitment,
    undefined,
  );
  assert.equal(buildRequest("digitalAsset.get", p).commitment, undefined);
});
test("false filters survive and invalid filters fail", () => {
  assert.equal(
    buildRequest("digitalAsset.search", {
      ...p,
      assetFilters: { compressed: false },
    }).params.compressed,
    false,
  );
  assert.throws(() =>
    buildRequest("digitalAsset.getTokenAccounts", {
      ...p,
      assetFilters: { compressed: false },
    }),
  );
  assert.throws(() =>
    buildRequest("account.getByProgram", { ...p, programFilters: {} }),
  );
  assert.throws(() =>
    buildRequest("transaction.getHistory", {
      ...p,
      historyDetails: "full",
      pageSize: 101,
    }),
  );
  assert.throws(() =>
    buildRequest("fee.getRecentPriorityFees", {
      ...p,
      feeMode: "percentile",
      percentile: 0,
    }),
  );
  assert.throws(() =>
    buildRequest("block.get", { ...p, slot: Number.MAX_SAFE_INTEGER + 1 }),
  );
});
test("lossless nested values, escaped strings and malformed JSON", () => {
  assert.deepEqual(
    parseLosslessJson(
      '{"x":[18446744073709551615,{"s":"18446744073709551615"}],"a":2}',
    ),
    { x: ["18446744073709551615", { s: "18446744073709551615" }], a: 2 },
  );
  assert.throws(() => parseLosslessJson('{"x":1e30}'));
  assert.throws(() => parseLosslessJson("{bad"));
  assert.equal(sol("18446744073709551615"), "18446744073.709551615");
  assert.equal(sol(0), "0");
  assert.equal(sol(1000000000), "1");
});
test("validation rejects wrong lengths and credential URL exfiltration", () => {
  assert.equal(address(a), a);
  assert.equal(signature(s), s);
  assert.throws(() => address("bad"));
  assert.throws(() => signature(a));
  for (const url of [
    "http://demo.rpcpool.com",
    "https://rpcpool.com.evil.test",
    "https://user:pass@demo.rpcpool.com",
    "https://demo.rpcpool.com/token",
    "https://demo.rpcpool.com/?token=secret",
    "https://127.0.0.1",
    "https://demo.rpcpool.com:8443",
  ])
    assert.throws(() => endpoint(url));
  assert.equal(
    endpoint("https://demo.rpcpool.com"),
    "https://demo.rpcpool.com/",
  );
  for (const hash of Object.values(GENESIS)) assert.equal(address(hash), hash);
});
test("batching preserves duplicate requests, null positions and per-batch contexts", async () => {
  let calls = 0;
  const result = await executeRead(
    "account.getMany",
    { ...p, addresses: Array(101).fill(a) },
    async (_, params) => {
      calls++;
      return {
        context: { slot: calls },
        value: params[0].map((_, i) => (i ? { lamports: 1 } : null)),
      };
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.data.value.length, 101);
  assert.equal(result.data.value[100], null);
  assert.equal(result.meta.contexts.length, 2);
  assert.equal(result.meta.requestIdentities.length, 101);
});
test("history cursor continuation, budget and nonprogress", async () => {
  let calls = 0;
  const r = await executeRead(
    "transaction.getHistory",
    { ...p, retrieval: "upToLimit", totalLimit: 3, pageSize: 2 },
    async (_, params) => {
      calls++;
      return {
        data: Array.from({ length: params[1].limit }, (_, i) => ({
          signature: String(calls * 10 + i),
        })),
        paginationToken: "cursor-" + calls,
      };
    },
  );
  assert.equal(r.data.length, 3);
  assert.equal(r.meta.pagination.continuation, "cursor-2");
  assert.equal(r.meta.pagination.truncated, true);
  await assert.rejects(
    executeRead(
      "transaction.getHistory",
      {
        ...p,
        retrieval: "upToLimit",
        requestBudget: 1,
        totalLimit: 3,
        pageSize: 1,
      },
      async () => ({ data: [{}], paginationToken: "x" }),
    ),
    { code: "REQUEST_BUDGET" },
  );
  await assert.rejects(
    executeRead(
      "transaction.getHistory",
      { ...p, retrieval: "upToLimit", totalLimit: 3, pageSize: 1 },
      async () => ({ data: [{}], paginationToken: "x" }),
    ),
    { code: "PAGINATION_STALLED" },
  );
});
test("DAS short pages are not treated as completion", async () => {
  let n = 0;
  const result = await executeRead(
    "digitalAsset.getByOwner",
    { ...p, retrieval: "upToLimit", pageSize: 3, totalLimit: 4 },
    async () => ({ items: ++n < 3 ? [{ id: String(n) }] : [] }),
  );
  assert.equal(n, 3);
  assert.equal(result.data.length, 2);
  assert.equal(result.meta.pagination.complete, true);
});
test("version 1 read responses retain transaction configuration", async () => {
  const value = { version: 1, transaction: { message: { transactionConfig: { priorityFee: '9007199254740993' } } } };
  const result = await executeRead("transaction.get", p, async (method, params) => {
    assert.equal(method, 'getTransaction');
    assert.equal(params[1].maxSupportedTransactionVersion, 1);
    return value;
  });
  assert.deepEqual(result.data, value);
});
test("null and empty data are explicit", async () => {
  assert.equal(
    (
      await executeRead("account.get", p, async () => ({
        context: { slot: 1 },
        value: null,
      }))
    ).data,
    null,
  );
  assert.equal(
    (await executeRead("transaction.get", p, async () => null)).data,
    null,
  );
  assert.deepEqual(
    (await executeRead("digitalAsset.search", p, async () => ({ items: [] })))
      .data,
    [],
  );
});
function transport(responder) {
  return createRpc(
    {
      helpers: {
        httpRequest: async (options) =>
          responder(options, JSON.parse(options.body)),
      },
    },
    {
      endpoint: "https://demo.rpcpool.com",
      apiToken: "SENSITIVE_TEST_TOKEN",
      network: "devnet",
    },
  );
}
test("transport uses header auth, disabled redirects and raw numeric response", async () => {
  const client = transport((o, b) => {
    assert.equal(o.headers["x-token"], "SENSITIVE_TEST_TOKEN");
    assert.equal(o.disableFollowRedirect, true);
    assert.equal(o.encoding, "text");
    assert.ok(!o.url.includes("SENSITIVE"));
    return `{"jsonrpc":"2.0","id":"${b.id}","result":18446744073709551615}`;
  });
  assert.equal(await client.rpc("getBalance"), "18446744073709551615");
});
test("transport sanitizes secrets and validates envelopes", async () => {
  await assert.rejects(
    transport(() => {
      throw Object.assign(new Error("SENSITIVE_TEST_TOKEN"), {
        statusCode: 401,
      });
    }).rpc("getVersion"),
    (e) => e.code === "CREDENTIAL_ERROR" && !e.message.includes("SENSITIVE"),
  );
  await assert.rejects(
    transport(() => {
      throw { statusCode: 429, response: { headers: { "retry-after": "15" } } };
    }).rpc("getVersion"),
    (e) => e.stop && e.details.retryAfterSeconds === 15,
  );
  await assert.rejects(
    transport(() => '{"jsonrpc":"2.0","id":"wrong","result":1}').rpc(
      "getVersion",
    ),
    { code: "INVALID_RESPONSE" },
  );
  await assert.rejects(
    transport((_, b) =>
      JSON.stringify({
        jsonrpc: "2.0",
        id: b.id,
        error: { code: -32601, message: "SENSITIVE_TEST_TOKEN" },
      }),
    ).rpc("getVersion"),
    (e) => e.code === "UNSUPPORTED_METHOD" && !e.message.includes("SENSITIVE"),
  );
  await assert.rejects(
    validateNetwork(async () => GENESIS.mainnet, "devnet"),
    { code: "NETWORK_MISMATCH" },
  );
});
test("node handles per-item expressions, pairing and read-only wallet isolation", async () => {
  let requests = 0;
  const context = {
    getCredentials: async () => ({
      endpoint: "https://demo.rpcpool.com",
      apiToken: "token",
      network: "devnet",
    }),
    getInputData: () => [{ json: {} }, { json: {} }],
    getNodeParameter: (name, index, fallback) =>
      ({ resource: "account", operation: "getBalance", address: a })[name] ??
      fallback,
    getInputConnectionData: () => {
      throw Error("read invoked wallet");
    },
    getNode: () => ({ name: "Triton" }),
    continueOnFail: () => false,
    helpers: {
      httpRequest: async (o) => {
        const b = JSON.parse(o.body);
        requests++;
        return JSON.stringify({
          id: b.id,
          jsonrpc: "2.0",
          result:
            b.method === "getGenesisHash"
              ? GENESIS.devnet
              : { context: { slot: 1 }, value: requests },
        });
      },
    },
  };
  const [rows] = await new TarvosTritonOne().execute.call(context);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].pairedItem, { item: 1 });
  assert.equal(rows[0].json.data.lamports, "2");
  assert.equal(requests, 3);
});
