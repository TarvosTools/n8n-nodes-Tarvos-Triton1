const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readExactAccount } = require("../exact-account.cjs");
const key = "11111111111111111111111111111111";
const raw =
  '{"result":{"context":{"slot":100},"value":{"lamports":9007199254740993,"rentEpoch":18446744073709551615,"owner":"' +
  key +
  '","executable":false,"data":["AA==","base64"]}}}';
test("exact fallback retains u64 account values and authenticates clean endpoint", async () => {
  const r = await readExactAccount(
    "https://test.rpcpool.com/",
    "secret",
    key,
    99,
    async (url, o) => {
      assert.equal(url, "https://test.rpcpool.com/");
      assert.equal(o.headers["x-token"], "secret");
      assert.equal(o.redirect, "error");
      assert.equal(JSON.parse(o.body).params[1].minContextSlot, 99);
      return { ok: true, text: async () => raw };
    },
  );
  assert.equal(r.account.lamports, "9007199254740993");
  assert.equal(r.account.rentEpoch, "18446744073709551615");
  assert.equal(r.account.data.data, "AA==");
});
test("exact fallback rejects stale responses and preserves closed accounts", async () => {
  await assert.rejects(
    () =>
      readExactAccount(
        "https://test.rpcpool.com/",
        "secret",
        key,
        101,
        async () => ({ ok: true, text: async () => raw }),
      ),
    /freshness/,
  );
  const r = await readExactAccount(
    "https://test.rpcpool.com/",
    "secret",
    key,
    100,
    async () => ({
      ok: true,
      text: async () => ' {"result":{"context":{"slot":100},"value":null}}',
    }),
  );
  assert.equal(r.account, null);
});
