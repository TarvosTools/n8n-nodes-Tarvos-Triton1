const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { Inbox } = require("../worker/store.cjs");
const base = path.resolve(__dirname, "../test-results");
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, "worker-load-"));
let inbox;
try {
  const total = 5000,
    start = performance.now(),
    rssStart = process.memoryUsage().rss;
  let peak = rssStart;
  inbox = new Inbox(path.join(dir, "inbox.sqlite"), ["fast", "slow"], total);
  for (let i = 0; i < total; i++) {
    assert.equal(
      inbox.put({ index: i, payload: "x".repeat(1024) }, String(i)),
      true,
    );
    if (i % 100 === 0) peak = Math.max(peak, process.memoryUsage().rss);
  }
  const inserted = performance.now();
  assert.equal(inbox.put({ index: 0 }, "0"), false);
  assert.throws(() => inbox.put({ overflow: true }, "overflow"), /Inbox full/);
  const drain = (consumer) => {
    let seen = 0;
    for (;;) {
      const batch = inbox.read(consumer, 250);
      if (!batch.events.length) break;
      assert.deepEqual(inbox.read(consumer, 250), batch);
      for (const event of batch.events) assert.equal(event.index, seen++);
      inbox.ack(consumer, batch.receipt);
      assert.equal(inbox.ack(consumer, batch.receipt).duplicate, true);
      peak = Math.max(peak, process.memoryUsage().rss);
    }
    assert.equal(seen, total);
  };
  drain("fast");
  assert.equal(inbox.prune(), 0);
  drain("slow");
  assert.equal(inbox.prune(), 4000);
  assert.equal(inbox.count(), 1000);
  const report = {
    at: new Date().toISOString(),
    status: "PASS",
    scope:
      "Local SQLite burst/backpressure and two-consumer correctness; not streaming or n8n queue capacity",
    events: total,
    payloadBytes: 1024,
    insertMs: Math.round(inserted - start),
    totalMs: Math.round(performance.now() - start),
    rssStartBytes: rssStart,
    peakSampledRssBytes: peak,
  };
  fs.writeFileSync(
    path.join(base, "worker-load.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  inbox?.close();
  const resolved = path.resolve(dir);
  if (
    path.dirname(resolved) !== base ||
    !path.basename(resolved).startsWith("worker-load-")
  )
    throw Error("Unsafe cleanup path");
  fs.rmSync(resolved, { recursive: true, force: true });
}
