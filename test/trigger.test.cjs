const { test } = require("node:test");
const assert = require("node:assert/strict");
const streams = require("../dist/nodes/TarvosTritonTrigger/streams");
const {
  TarvosTritonTrigger,
} = require("../dist/nodes/TarvosTritonTrigger/TarvosTritonTrigger.node");
const { TritonError } = require("../dist/nodes/TarvosTritonOne/errors");
function context(mode, parameters = {}) {
  const emitted = [],
    errors = [];
  return {
    emitted,
    errors,
    getMode: () => mode,
    getCredentials: async () => ({
      endpoint: "https://demo.rpcpool.com/",
      apiToken: "FIXTURE",
      network: "mainnet",
    }),
    getNode: () => ({ name: "Stream", type: "test", typeVersion: 1 }),
    getNodeParameter: (name, fallback) =>
      ({
        source: "dragon",
        batchSize: 2,
        flushMs: 100,
        executionLimit: 60,
        grpcRequest:
          '{"accounts":{"watched":{"account":["11111111111111111111111111111111"]}},"commitment":"confirmed"}',
        ...parameters,
      })[name] ?? fallback,
    emit: (rows) => emitted.push(rows),
    emitError: (error) => errors.push(error),
  };
}
test("manual trigger opens on listen and closes after its first batch", async () => {
  let receive,
    closed = 0,
    opens = 0;
  streams.openStream = async (_s, _c, _p, onData) => {
    opens++;
    receive = onData;
    return () => closed++;
  };
  const ctx = context("manual"),
    response = await new TarvosTritonTrigger().trigger.call(ctx);
  assert.equal(opens, 0);
  await response.manualTriggerFunction();
  receive({ slot: 1 });
  receive({ slot: 2 });
  assert.equal(ctx.emitted.length, 1);
  assert.equal(ctx.emitted[0][0].length, 2);
  assert.equal(closed, 1);
  await response.closeFunction();
  assert.ok(closed >= 1);
  assert.equal(ctx.errors.length, 0);
});
test("published trigger flushes sparse batches and deactivation releases its transport", async () => {
  let receive,
    closed = false;
  streams.openStream = async (_s, _c, _p, onData) => {
    receive = onData;
    return () => (closed = true);
  };
  const ctx = context("trigger"),
    response = await new TarvosTritonTrigger().trigger.call(ctx);
  receive({ slot: 1 });
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(ctx.emitted.length, 1);
  await response.closeFunction();
  assert.equal(closed, true);
  receive({ slot: 2 });
  assert.equal(ctx.emitted.length, 1);
});
test("stream disconnect is fatal and never implies seamless recovery", async () => {
  let onError,
    closed = false;
  streams.openStream = async (_s, _c, _p, _onData, error) => {
    onError = error;
    return () => (closed = true);
  };
  const ctx = context("trigger"),
    response = await new TarvosTritonTrigger().trigger.call(ctx);
  onError(
    new TritonError("STREAM_DISCONNECTED", "Data gap may have occurred."),
  );
  assert.equal(closed, true);
  assert.equal(ctx.errors.length, 1);
  assert.match(ctx.errors[0].message, /STREAM_DISCONNECTED/);
  await response.closeFunction();
});
test("trigger execution budget stops an oversized stream", async () => {
  let receive;
  streams.openStream = async (_s, _c, _p, onData) => {
    receive = onData;
    return () => {};
  };
  const ctx = context("trigger", { batchSize: 1, executionLimit: 1 }),
    response = await new TarvosTritonTrigger().trigger.call(ctx);
  receive({ slot: 1 });
  receive({ slot: 2 });
  assert.equal(ctx.emitted.length, 1);
  assert.match(ctx.errors[0].message, /STREAM_RATE_LIMIT/);
  await response.closeFunction();
});
