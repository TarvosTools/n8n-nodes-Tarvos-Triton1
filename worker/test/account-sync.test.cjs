const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccountSync } = require("../sources.cjs");
const { GENESIS } = require("../../dist/nodes/TarvosTritonOne/validation");
const address = "11111111111111111111111111111111";
test("SDK hydration is authenticated and unsafe numbers trigger whole-account exact fallback", async () => {
  process.env.TEST_ACCOUNT_SYNC_TOKEN = "test-secret";
  let closed = false,
    reads = 0;
  const sdk = {
    AccountSyncTransports: { GRPC: "grpc" },
    PublicKey: class {
      constructor(v) {
        this.v = v;
      }
    },
    Connection: class {
      constructor(url, options) {
        assert.equal(url, "https://test.rpcpool.com/test-secret");
        assert.equal(options.httpHeaders["x-token"], "test-secret");
        assert.equal(options.accountSync.subscriptionEndpoint, url);
      }
      async getGenesisHash() {
        return GENESIS.devnet;
      }
      async getSlot() {
        return 100;
      }
      async getAccountInfoAndContext(key, options) {
        reads++;
        assert.equal(options.minContextSlot, 95);
        return {
          context: { slot: 99 },
          value: { lamports: 123, rentEpoch: 18446744073709551615 },
        };
      }
      getLastTransportError() {
        return new Error("unavailable");
      }
      async close() {
        closed = true;
      }
    },
  };
  const sync = await createAccountSync(
    {
      rpcEndpoint: "https://test.rpcpool.com/",
      tokenEnv: "TEST_ACCOUNT_SYNC_TOKEN",
      network: "devnet",
      addresses: [address],
    },
    {
      sdk,
      readExactAccount: async (url, token, key, min) => {
        assert.equal(url, "https://test.rpcpool.com/");
        assert.equal(min, 99);
        return {
          context: { slot: 101 },
          account: { lamports: "123", rentEpoch: "18446744073709551615" },
        };
      },
    },
  );
  try {
    const result = await sync.read(address, 5);
    assert.equal(result.precisionFallback, true);
    assert.equal(result.context.slot, 101);
    assert.equal(result.transportDegraded, true);
    assert.equal(result.account.rentEpoch, "18446744073709551615");
    await assert.rejects(
      () => sync.read("So11111111111111111111111111111111111111112", 5),
      /not configured/,
    );
    assert.equal(reads, 1);
  } finally {
    await sync.close();
    delete process.env.TEST_ACCOUNT_SYNC_TOKEN;
  }
  assert.equal(closed, true);
});
test("stale SDK results are rejected even if SDK ignores minContextSlot", async () => {
  process.env.TEST_ACCOUNT_SYNC_STALE = "test-secret";
  let closed = false;
  const sdk = {
    AccountSyncTransports: { GRPC: "grpc" },
    PublicKey: class {},
    Connection: class {
      async getGenesisHash() {
        return GENESIS.devnet;
      }
      async getSlot() {
        return 100;
      }
      async getAccountInfoAndContext() {
        return { context: { slot: 10 }, value: null };
      }
      async close() {
        closed = true;
      }
    },
  };
  const sync = await createAccountSync(
    {
      rpcEndpoint: "https://test.rpcpool.com/",
      tokenEnv: "TEST_ACCOUNT_SYNC_STALE",
      network: "devnet",
      addresses: [address],
    },
    { sdk },
  );
  try {
    await assert.rejects(() => sync.read(address, 5), /freshness/);
  } finally {
    await sync.close();
    delete process.env.TEST_ACCOUNT_SYNC_STALE;
  }
  assert.equal(closed, true);
});
