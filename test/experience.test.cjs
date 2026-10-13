const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  quickParameters,
  setupExperience,
} = require("../dist/nodes/TarvosTritonOne/experience");
const {
  websocketRequest,
} = require("../dist/nodes/TarvosTritonTrigger/streams");
const address = "11111111111111111111111111111111";
const signature = require("bs58").default.encode(new Uint8Array(64).fill(1));
for (const [task, method] of [
  ["wallet", "logsSubscribe"],
  ["account", "accountSubscribe"],
  ["token", "accountSubscribe"],
  ["program", "logsSubscribe"],
  ["signature", "signatureSubscribe"],
])
  test(`quick setup ${task} generates the intended confirmed subscription`, () => {
    const p = quickParameters(task, address, signature);
    const r = websocketRequest(p);
    assert.equal(r.method, method);
    assert.equal(r.params[1].commitment, "confirmed");
    assert.equal(p.source, "whirligig");
    assert.equal(p.executionLimit, 60);
    if (task === "token") assert.equal(r.params[1].encoding, "jsonParsed");
    if (task === "wallet")
      assert.deepEqual(r.params[0], { mentions: [address] });
  });
test("quick setup is default only for new nodes; explicit advanced configuration is preserved", () => {
  assert.equal(setupExperience({}, 1), "advanced");
  assert.equal(setupExperience({}, 1.1), "advanced");
  assert.equal(setupExperience({}, 1.2), "simple");
  assert.equal(setupExperience({ setupExperience: "advanced" }, 1.2), "advanced");
  assert.throws(() => quickParameters("unknown", address, ""));
});
test("quick setup uses RPC credentials and ignores a saved advanced service", async () => {
  const transport = require("../dist/nodes/TarvosTritonOne/transport");
  const streams = require("../dist/nodes/TarvosTritonTrigger/streams");
  const oldRpc = transport.createRpc,
    oldStream = streams.openStream;
  let opened, credential;
  transport.createRpc = () => ({
    rpc: async () =>
      require("../dist/nodes/TarvosTritonOne/validation").GENESIS.mainnet,
  });
  streams.openStream = async (source, _c, p) => {
    opened = { source, p };
    return () => {};
  };
  try {
    const {
      TarvosTritonTrigger,
    } = require("../dist/nodes/TarvosTritonTrigger/TarvosTritonTrigger.node");
    const params = {
      source: "riptide",
      watchTask: "wallet",
      simpleAddress: address,
    };
    const ctx = {
      getNode: () => ({ typeVersion: 1.2, parameters: params }),
      getNodeParameter: (name, fallback) => params[name] ?? fallback,
      getCredentials: async (name) => {
        credential = name;
        return { network: "mainnet" };
      },
      getMode: () => "manual",
      emit: () => {},
      emitError: (e) => {
        throw e;
      },
    };
    const result = await new TarvosTritonTrigger().trigger.call(ctx);
    await result.manualTriggerFunction();
    await result.closeFunction();
    assert.equal(credential, "tritonOneSolanaApi");
    assert.equal(opened.source, "whirligig");
    assert.equal(opened.p.watchAddress, address);
    assert.equal(opened.p.topic, "logs");
  } finally {
    transport.createRpc = oldRpc;
    streams.openStream = oldStream;
  }
});
