const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Inbox } = require("../store.cjs");
const { createServer } = require("../server.cjs");
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tarvos-worker-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "inbox.sqlite");
}
test("durable batch receipt survives process restart; ack is explicit and idempotent", (t) => {
  const file = temp(t);
  let db = new Inbox(file, ["test"]);
  db.put({ kind: "account", data: { amount: "18446744073709551615" } }, "one");
  db.put({ kind: "slot" }, "two");
  const batch = db.read("test", 1);
  assert.equal(batch.events.length, 1);
  assert.equal(db.read("test", 10).receipt, batch.receipt);
  db.close();
  db = new Inbox(file, ["test"]);
  assert.deepEqual(db.read("test"), batch);
  assert.throws(() => db.ack("test", "wrong"));
  assert.equal(db.read("test").receipt, batch.receipt);
  db.ack("test", batch.receipt);
  assert.equal(db.ack("test", batch.receipt).duplicate, true);
  assert.equal(db.read("test").events[0].eventId, "two");
  db.close();
});
test("deduplication, independent consumers and storage bounds are explicit", (t) => {
  const db = new Inbox(temp(t), ["a", "b"], 2);
  assert.equal(db.put({ v: 1 }, "1"), true);
  assert.equal(db.put({ v: 1 }, "1"), false);
  db.put({ v: 2 }, "2");
  const a = db.read("a", 1);
  db.ack("a", a.receipt);
  assert.equal(db.read("b").events.length, 2);
  assert.throws(() => db.put({ v: 3 }, "3"), /Inbox full/);
  assert.throws(() => db.read("unknown"));
  db.close();
});
test("worker HTTP requires auth, preserves secrets and advances only on the matching receipt", async (t) => {
  const db = new Inbox(":memory:", ["test"]);
  db.put({ kind: "transaction" }, "1");
  const token = "x".repeat(40),
    server = createServer({
      inbox: db,
      token,
      health: { fixture: { state: "running" } },
    });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    server.closeAllConnections();
    db.close();
  });
  const url = "http://127.0.0.1:" + server.address().port;
  const headers = { Authorization: "Bearer " + token };
  assert.equal((await fetch(url + "/status")).status, 401);
  const status = await (await fetch(url + "/status", { headers })).json();
  assert.equal(status.events, 1);
  assert.ok(!JSON.stringify(status).includes(token));
  const batch = await (
    await fetch(url + "/events?consumer=test", { headers })
  ).json();
  assert.equal(
    (
      await fetch(url + "/ack", {
        method: "POST",
        headers,
        body: JSON.stringify({ consumer: "test", receipt: "bad" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(url + "/ack", {
        method: "POST",
        headers,
        body: JSON.stringify({ consumer: "test", receipt: batch.receipt }),
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await fetch(url + "/events?consumer=test", { headers })).json())
      .events.length,
    0,
  );
});
test("Fumarole disables early commits and persists block identity without moving recovery boundary", async (t) => {
  const db = new Inbox(temp(t), ["test"]);
  const Module = require("node:module"),
    original = Module._load;
  let options,
    fromSlot,
    closed = 0;
  const client = {
    getSlotRange: async () => ({ minSlot: 1n, maxSlot: 100n }),
    getConsumerGroupInfo: async () => null,
    createConsumerGroup: async (_name, slot) => {
      fromSlot = slot;
    },
    subscribeWithConfig: async (_name, _req, config) => {
      options = config;
      return {
        close: () => closed++,
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "data",
            slot: 100n,
            blockhash: "forkA",
            update: { account: { amount: 18446744073709551615n } },
          };
          yield { type: "slotEnded", slot: 100n, blockhash: "forkA" };
        },
      };
    },
  };
  Module._load = function (name, ...args) {
    if (name === "@triton-one/yellowstone-fumarole-client")
      return {
        FumaroleClient: { connect: async () => client },
        SubscribeRequest: { fromJSON: (v) => v },
      };
    return original.call(this, name, ...args);
  };
  process.env.TARVOS_TEST_TOKEN = "fixture";
  t.after(() => {
    delete process.env.TARVOS_TEST_TOKEN;
  });
  const { startSources } = require("../sources.cjs");
  const health = {};
  const running = await startSources(
    {
      sources: [
        {
          name: "fixture",
          type: "fumarole",
          endpoint: "https://ams.rpcpool.com/",
          tokenEnv: "TARVOS_TEST_TOKEN",
          request: {
            commitment: "FINALIZED",
            accounts: {
              watched: { account: ["11111111111111111111111111111111"] },
            },
          },
        },
      ],
    },
    db,
    health,
  );
  Module._load = original;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await running.close();
  assert.equal(options.noCommit, true);
  assert.equal(options.autoCommit, false);
  assert.equal(fromSlot, 100n);
  assert.equal(db.getState("fumarole:fixture").fromSlot, "100");
  const rows = db.read("test").events;
  assert.equal(rows[0].blockhash, "forkA");
  assert.equal(rows[0].data.account.amount, "18446744073709551615");
  assert.equal(rows[1].kind, "slotEnded");
  assert.ok(closed > 0);
  db.close();
});
