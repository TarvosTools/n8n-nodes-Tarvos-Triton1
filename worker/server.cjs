// SPDX-License-Identifier: AGPL-3.0-only
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");
const { Inbox } = require("./store.cjs");
const { startSources, createAccountSync } = require("./sources.cjs");
function authorized(header, token) {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from("Bearer " + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function createServer({ inbox, token, health, accountSync }) {
  if (typeof token !== "string" || token.length < 32 || /[\r\n]/.test(token))
    throw new Error("WORKER_API_TOKEN must have at least 32 characters");
  return http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, data) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    if (!authorized(req.headers.authorization, token)) {
      send(401, { error: "Unauthorized" });
      return;
    }
    try {
      const url = new URL(req.url, "http://worker");
      if (req.method === "GET" && url.pathname === "/status") {
        send(200, {
          schemaVersion: 1,
          ...inbox.status(),
          sources: health,
          accountSync: !!accountSync,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/events") {
        send(
          200,
          inbox.read(
            url.searchParams.get("consumer"),
            Number(url.searchParams.get("limit") ?? 100),
          ),
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/ack") {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 4096) {
            send(413, { error: "Request too large" });
            req.destroy();
            return;
          }
        }
        const input = JSON.parse(body);
        send(200, inbox.ack(input.consumer, input.receipt));
        return;
      }
      if (req.method === "GET" && url.pathname === "/account") {
        if (!accountSync) {
          send(503, { error: "Account Sync is not configured" });
          return;
        }
        send(
          200,
          await accountSync.read(
            url.searchParams.get("address"),
            Number(url.searchParams.get("maxSlotLag") ?? 75),
          ),
        );
        return;
      }
      send(404, { error: "Unknown operation" });
    } catch {
      send(400, {
        error:
          "Request failed. Check the input, receipt, account freshness or worker health.",
      });
    }
  });
}
async function main() {
  const configPath =
    process.env.WORKER_CONFIG ?? path.join(__dirname, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (
    !Array.isArray(config.sources) ||
    config.sources.some((s) => !/^[a-zA-Z0-9_-]{1,48}$/.test(s.name)) ||
    new Set(config.sources.map((s) => s.name)).size !== config.sources.length
  )
    throw new Error("Configure unique source names");
  const database = path.resolve(
    config.database ?? path.join(__dirname, "data", "inbox.sqlite"),
  );
  fs.mkdirSync(path.dirname(database), { recursive: true });
  const inbox = new Inbox(
    database,
    config.consumers,
    config.maxEvents ?? 1000000,
  );
  const health = {};
  let accountSync;
  try {
    accountSync = await createAccountSync(config.accountSync);
  } catch (error) {
    inbox.close();
    throw error;
  }
  let server;
  try {
    server = createServer({
      inbox,
      token: process.env.WORKER_API_TOKEN,
      health,
      accountSync,
    });
  } catch (error) {
    if (accountSync) await accountSync.close();
    inbox.close();
    throw error;
  }
  const sources = await startSources(config, inbox, health);
  const prune = setInterval(() => {
    try {
      inbox.prune();
    } catch {
      health.storage = { state: "error", message: "Pruning failed" };
    }
  }, 60000);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port ?? 5690, config.host ?? "127.0.0.1", resolve);
    });
  } catch (error) {
    clearInterval(prune);
    await sources.close();
    if (accountSync) await accountSync.close();
    inbox.close();
    throw error;
  }
  process.stdout.write("Tarvos Triton worker ready\n");
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(prune);
    server.close();
    server.closeAllConnections();
    await sources.close();
    if (accountSync) await accountSync.close();
    inbox.close();
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
if (require.main === module)
  main().catch(() => {
    process.stderr.write(
      "Worker startup failed. Verify configuration, secrets, native SDK support and database access.\n",
    );
    process.exitCode = 1;
  });
module.exports = { createServer, authorized };
