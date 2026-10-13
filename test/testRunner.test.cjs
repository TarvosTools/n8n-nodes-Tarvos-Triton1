const { test } = require("node:test");
const assert = require("node:assert/strict");
const { guard } = require("../scripts/test-live.cjs");
const { client, action } = require("../scripts/test-live.cjs");
test("public adapter runs the node against a fixed public endpoint without authentication", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "getGenesisHash"
              ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
              : { context: { slot: 1 }, value: 9007199254740991 },
        }),
    };
  };
  try {
    const c = client("devnet", "public");
    const result = await action(c, "account", "getBalance", {
      address: "11111111111111111111111111111111",
    });
    assert.equal(result.data.lamports, "9007199254740991");
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.equal(call.url, "https://api.devnet.solana.com/");
      assert.equal(call.options.headers["x-token"], undefined);
      assert.equal(call.options.redirect, "error");
    }
    await assert.rejects(
      c.rpc("sendTransaction", ["unused"]),
      /No automatic retry/,
    );
  } finally {
    global.fetch = original;
  }
});
test("test runner cannot broadcast on mainnet or from read-only suites", () => {
  for (const suite of [
    "public",
    "simulation",
    "provider",
    "titan-simulation",
    "devnet",
  ])
    assert.throws(() => guard("sendTransaction", "mainnet", suite));
  for (const suite of ["public", "simulation", "provider", "titan-simulation"])
    assert.throws(() => guard("sendTransaction", "devnet", suite));
  assert.doesNotThrow(() => guard("sendTransaction", "devnet", "devnet"));
  assert.throws(() => guard("sendBundle", "devnet", "devnet"));
  assert.doesNotThrow(() =>
    guard("simulateTransaction", "mainnet", "simulation"),
  );
});
