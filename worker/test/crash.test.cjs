const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Inbox } = require("../store.cjs");
for (const boundary of ["insert", "receipt", "ack"])
  test(`abrupt child-process death after ${boundary} preserves committed inbox state`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tarvos-worker-crash-"));
    t.after(() => {
      assert.ok(path.basename(dir).startsWith("tarvos-worker-crash-"));
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const file = path.join(dir, "inbox.sqlite");
    const code = `const {Inbox}=require(process.argv[1]); const db=new Inbox(process.argv[2],['test']); db.put({value:1},'event-1'); let receipt=null; if(process.argv[3]!=='insert') receipt=db.read('test').receipt; if(process.argv[3]==='ack') db.ack('test',receipt); process.send({receipt}); setInterval(()=>{},1000);`;
    const child = spawn(
      process.execPath,
      ["-e", code, path.resolve(__dirname, "../store.cjs"), file, boundary],
      { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true },
    );
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    let message;
    try {
      [message] = await Promise.race([
        once(child, "message"),
        once(child, "exit").then(() => {
          throw Error("child exited before commit");
        }),
      ]);
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    const db = new Inbox(file, ["test"]);
    try {
      const batch = db.read("test");
      if (boundary === "ack") {
        assert.equal(batch.events.length, 0);
        assert.equal(db.ack("test", message.receipt).duplicate, true);
      } else {
        assert.equal(batch.events[0].eventId, "event-1");
        if (boundary === "receipt")
          assert.equal(batch.receipt, message.receipt);
      }
    } finally {
      db.close();
    }
  });
