const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  availableChoices,
} = require("../dist/nodes/TarvosTritonOne/availability");
const choices = [{ name: "History", value: "getHistory" }];
let sequence = 0;
function context(code, network = "devnet", token = `test-${++sequence}`) {
  return {
    getCredentials: async () => ({
      endpoint: "https://example.rpcpool.com/",
      apiToken: token,
      network,
    }),
    helpers: {
      httpRequest: async (o) => {
        if (code === 503) throw { statusCode: 503 };
        const { id } = JSON.parse(o.body);
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          ...(code
            ? { error: { code, message: "Test error" } }
            : { result: [] }),
        });
      },
    },
  };
}
test("only confirmed missing methods disable endpoint choices", async () => {
  assert.equal(
    (await availableChoices(context(-32601), choices, "transaction"))[0]
      .disabled,
    true,
  );
  for (const code of [undefined, -32602, -32010, 503])
    assert.notEqual(
      (await availableChoices(context(code), choices, "transaction"))[0]
        .disabled,
      true,
    );
});
test("capability cache cannot leak between credentials", async () => {
  assert.equal(
    (await availableChoices(context(-32601), choices, "transaction"))[0]
      .disabled,
    true,
  );
  assert.notEqual(
    (await availableChoices(context(undefined), choices, "transaction"))[0]
      .disabled,
    true,
  );
});
test("unknown credential availability stays enabled", async () => {
  assert.deepEqual(
    await availableChoices(
      {
        getCredentials: async () => {
          throw Error("not set");
        },
      },
      choices,
      "transaction",
    ),
    choices,
  );
});
test("Titan is unavailable on Devnet but not disabled on Mainnet", async () => {
  const opts = [{ name: "Titan", value: "titan" }];
  assert.equal(
    (await availableChoices(context(undefined), opts))[0].disabled,
    true,
  );
  assert.notEqual(
    (await availableChoices(context(undefined, "mainnet"), opts))[0].disabled,
    true,
  );
});
