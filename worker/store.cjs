// SPDX-License-Identifier: AGPL-3.0-only
const { DatabaseSync } = require("node:sqlite");
const { createHash, randomUUID } = require("node:crypto");
class Inbox {
  constructor(file, consumers, maxEvents = 1000000) {
    if (
      !Array.isArray(consumers) ||
      !consumers.length ||
      consumers.some((v) => !/^[a-zA-Z0-9_-]{1,80}$/.test(v))
    )
      throw new Error("Configure valid consumer names");
    this.consumers = new Set(consumers);
    this.maxEvents = maxEvents;
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, identity TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS consumers (name TEXT PRIMARY KEY, offset INTEGER NOT NULL DEFAULT 0, receipt TEXT, through INTEGER, previous TEXT);
      CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    for (const name of consumers)
      this.db
        .prepare("INSERT OR IGNORE INTO consumers(name) VALUES (?)")
        .run(name);
  }
  put(payload, identity) {
    const encoded = JSON.stringify(payload);
    if (Buffer.byteLength(encoded) > 16 * 1024 * 1024)
      throw new Error("Event too large");
    identity ??= createHash("sha256").update(encoded).digest("hex");
    if (this.db.prepare("SELECT 1 FROM events WHERE identity=?").get(identity))
      return false;
    if (this.count() >= this.maxEvents)
      throw new Error("Inbox full; source stopped before accepting more data");
    this.db
      .prepare("INSERT INTO events(identity,payload) VALUES (?,?)")
      .run(identity, encoded);
    return true;
  }
  count() {
    return this.db.prepare("SELECT count(*) AS count FROM events").get().count;
  }
  getState(name) {
    const row = this.db
      .prepare("SELECT value FROM state WHERE name=?")
      .get(name);
    return row ? JSON.parse(row.value) : undefined;
  }
  setState(name, value) {
    this.db
      .prepare(
        "INSERT INTO state(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(name, JSON.stringify(value));
  }
  consumer(name) {
    if (!this.consumers.has(name)) throw new Error("Unknown consumer");
    return this.db.prepare("SELECT * FROM consumers WHERE name=?").get(name);
  }
  read(name, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Invalid event limit");
    const c = this.consumer(name);
    const rows = c.receipt
      ? this.db
          .prepare("SELECT * FROM events WHERE id>? AND id<=? ORDER BY id")
          .all(c.offset, c.through)
      : this.db
          .prepare("SELECT * FROM events WHERE id>? ORDER BY id LIMIT ?")
          .all(c.offset, limit);
    if (!rows.length) return { events: [], receipt: null };
    // Persist the receipt before returning: retrying the read returns the same batch.
    const receipt = c.receipt || randomUUID();
    if (!c.receipt)
      this.db
        .prepare("UPDATE consumers SET receipt=?,through=? WHERE name=?")
        .run(receipt, rows.at(-1).id, name);
    return {
      events: rows.map((r) => ({
        ...JSON.parse(r.payload),
        sequence: String(r.id),
        eventId: r.identity,
      })),
      receipt,
    };
  }
  ack(name, receipt) {
    const c = this.consumer(name);
    if (receipt && c.previous === receipt)
      return { acknowledged: true, duplicate: true };
    if (!receipt || c.receipt !== receipt)
      throw new Error("Receipt does not match the outstanding batch");
    this.db
      .prepare(
        "UPDATE consumers SET offset=through,previous=receipt,receipt=NULL,through=NULL WHERE name=?",
      )
      .run(name);
    return { acknowledged: true, through: String(c.through) };
  }
  prune() {
    // Include retired consumers too: removing a configured consumer must not silently discard its backlog.
    const through = this.db
      .prepare("SELECT min(offset) AS offset FROM consumers")
      .get().offset;
    return this.db
      .prepare("DELETE FROM events WHERE id<=?")
      .run(Math.max(0, through - 1000)).changes;
  }
  status() {
    return {
      events: this.count(),
      maxEvents: this.maxEvents,
      consumers: this.db
        .prepare(
          "SELECT name,offset,through,receipt IS NOT NULL AS batchOutstanding FROM consumers",
        )
        .all(),
    };
  }
  close() {
    this.db.close();
  }
}
module.exports = { Inbox };
