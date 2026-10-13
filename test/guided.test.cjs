const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeGuided,
  modeFor,
} = require("../dist/nodes/TarvosTritonOne/guided");
const {
  websocketRequest,
} = require("../dist/nodes/TarvosTritonTrigger/streams");
const { extraRequest } = require("../dist/nodes/TarvosTritonOne/expanded");
const address = "11111111111111111111111111111111";
const rows = (...values) => ({ entries: values.map((value) => ({ value })) });
test("legacy mode preserves saved JSON; new node version defaults to fields", () => {
  assert.equal(modeFor({}, 1), "json");
  assert.equal(modeFor({}, 1.1), "fields");
  assert.equal(modeFor({ inputMode: "json" }, 1.1), "json");
  const p = {
    inputMode: "json",
    wsOptions: '{"commitment":"finalized"}',
    ws_commitment: "confirmed",
  };
  normalizeGuided(p, true);
  assert.equal(p.wsOptions, '{"commitment":"finalized"}');
});
test("guided account subscription generates the exact Whirligig request", () => {
  const p = {
    inputMode: "fields",
    source: "whirligig",
    topic: "account",
    watchAddress: address,
    ws_commitment: "finalized",
    ws_encoding: "base64",
    ws_dataSlice: { offset: 8, length: 32 },
  };
  normalizeGuided(p, true);
  assert.deepEqual(websocketRequest(p), {
    method: "accountSubscribe",
    params: [
      address,
      {
        commitment: "finalized",
        encoding: "base64",
        dataSlice: { offset: 8, length: 32 },
      },
    ],
  });
  assert.throws(
    () => normalizeGuided({ ...p, ws_encoding: "jsonParsed" }, true),
    { code: "INVALID_INPUT" },
  );
});
test("program filter rows produce dataSize and memcmp instead of editor objects", () => {
  const p = {
    inputMode: "fields",
    source: "whirligig",
    topic: "program",
    watchAddress: address,
    ws_filters: {
      entries: [
        { kind: "dataSize", offset: 165 },
        { kind: "memcmp", offset: 32, bytes: "abc" },
      ],
    },
  };
  normalizeGuided(p, true);
  assert.deepEqual(websocketRequest(p).params[1].filters, [
    { dataSize: 165 },
    { memcmp: { offset: 32, bytes: "abc" } },
  ]);
});
test("transaction filter Include omits equality filter; Only selects true", () => {
  const p = {
    inputMode: "fields",
    source: "whirligig",
    topic: "transaction",
    transactionFilterFields: {
      include: rows(address),
      vote: "include",
      failed: "only",
    },
  };
  normalizeGuided(p, true);
  const r = websocketRequest(p);
  assert.equal(r.params[0].vote, undefined);
  assert.equal(r.params[0].failed, true);
  assert.deepEqual(r.params[0].accounts.include, [address]);
  assert.equal(r.params[1].maxSupportedTransactionVersion, 1);
});
test("guided query options and address rows reach RPC serializer intact", () => {
  const p = {
    inputMode: "fields",
    extra_addressesFields: rows(address),
    extra_optionsFields: {
      epoch: 0,
      minContextSlot: 100,
      commitment: "confirmed",
    },
  };
  normalizeGuided(p);
  assert.deepEqual(extraRequest("network.getInflationReward", p), {
    method: "getInflationReward",
    params: [
      [address],
      { commitment: "confirmed", epoch: 0, minContextSlot: 100 },
    ],
  });
  const policies = {
    inputMode: "fields",
    forwardingPoliciesFields: rows(address),
  };
  normalizeGuided(policies);
  assert.deepEqual(policies.forwardingPolicies, [address]);
});
test("guided gRPC filters create named requests and distinguish deshred", () => {
  const p = {
    inputMode: "fields",
    source: "dragon",
    grpcRequestFields: {
      event: "transactions",
      accountInclude: rows(address),
      vote: "exclude",
      failed: "include",
    },
  };
  normalizeGuided(p, true);
  assert.deepEqual(p.grpcRequest, {
    transactions: {
      watched: {
        accountInclude: [address],
        accountRequired: [],
        accountExclude: [],
        vote: false,
      },
    },
    commitment: "CONFIRMED",
  });
  const d = {
    inputMode: "fields",
    source: "deshred",
    grpcRequestFields: { accountInclude: rows(address) },
  };
  normalizeGuided(d, true);
  assert.deepEqual(d.grpcRequest, {
    deshredTransactions: {
      watched: {
        accountInclude: [address],
        accountRequired: [],
        accountExclude: [],
      },
    },
  });
});
test("guided preconfirmations use the correct region type for each service", () => {
  for (const source of ["harmonic", "bam"]) {
    const p = {
      inputMode: "fields",
      source,
      streamRegion: "EWR",
      preconfRequestFields: { accountInclude: rows(address) },
    };
    normalizeGuided(p, true);
    assert.equal(
      p.preconfRequest[source + "Region"],
      source.toUpperCase() + "_REGION_EWR",
    );
    assert.deepEqual(p.preconfRequest.transactions.watched.accountInclude, [
      address,
    ]);
  }
});
test("optional empty filter and address lists stay empty", () => {
  const p = {
    inputMode: "fields",
    source: "whirligig",
    topic: "program",
    watchAddress: address,
  };
  normalizeGuided(p, true);
  assert.equal(p.wsOptions.filters, undefined);
  const a = { inputMode: "fields", forwardingPoliciesFields: {} };
  normalizeGuided(a);
  assert.deepEqual(a.forwardingPolicies, []);
});

test('top-level gRPC fields produce an account subscription',()=>{const p={inputMode:'fields',source:'riptide',grpc_event:'accounts',grpc_commitment:'finalized',grpc_account:rows(address)};normalizeGuided(p,true);assert.deepEqual(p.grpcRequest,{accounts:{watched:{account:[address],owner:[]}},commitment:'FINALIZED'});});
