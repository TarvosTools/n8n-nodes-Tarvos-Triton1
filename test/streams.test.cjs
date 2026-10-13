const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const { encode, decode } = require("@msgpack/msgpack");
const { Keypair, SystemProgram, PublicKey } = require("@solana/web3.js");
const { createWallet } = require("../dist/nodes/TarvosSolanaWallet/signing");
const instances = [];
let respond;
class MockSocket extends EventEmitter {
  static OPEN = 1;
  constructor(url, protocols, options) {
    super();
    this.url = url;
    this.options = options;
    this.protocol = "v1.api.titan.ag";
    this.readyState = 1;
    this.sent = [];
    instances.push(this);
    process.nextTick(() => this.emit("open"));
  }
  send(bytes) {
    this.sent.push(bytes);
    respond?.(this, bytes);
  }
  ping() {
    this.emit("pong");
  }
  terminate() {
    this.readyState = 3;
    this.emit("close");
  }
}
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "ws") return MockSocket;
  return original.call(this, name, ...args);
};
const titan = require("../dist/nodes/TarvosTritonOne/titan");
const streams = require("../dist/nodes/TarvosTritonTrigger/streams");
const { executeService } = require("../dist/nodes/TarvosTritonOne/services");
Module._load = original;
const a = "11111111111111111111111111111111",
  b = "So11111111111111111111111111111111111111112";
const credentials = {
  endpoint: "https://demo.rpcpool.com/",
  apiToken: "SECRET_NEVER_LOG",
  network: "mainnet",
};
test("gRPC envelope skips absent oneof members when identifying slot updates", () => {
  const event = streams.envelope("dragon", {account: undefined, transaction: null, slot: {slot: "510452058"}}, "devnet", 1);
  assert.equal(event.kind, "slot");
  assert.equal(event.slot, "510452058");
  assert.equal(event.commitment, "confirmed");
});
function frame(ws, msg) {
  process.nextTick(() =>
    ws.emit("message", Buffer.from(encode(msg, { useBigInt64: true })), true),
  );
}
test("Titan binary handshake, correlated response and cleanup", async () => {
  respond = (ws, raw) => {
    const request = decode(raw, { useBigInt64: true });
    assert.equal(request.id, 1);
    assert.deepEqual(request.data, { GetInfo: {} });
    frame(ws, {
      Response: { requestId: 1, data: { GetInfo: { version: "fixture" } } },
    });
  };
  const result = await titan.titanOnce(credentials, "GetInfo", {});
  assert.deepEqual(result, { version: "fixture" });
  const ws = instances.at(-1);
  assert.equal(ws.readyState, 3);
  assert.equal(ws.url.pathname, "/SECRET_NEVER_LOG/titan/api/v1/ws");
});
test("Titan server errors never echo raw token or provider text", async () => {
  respond = (ws) =>
    frame(ws, { Error: { requestId: 1, message: "SECRET_NEVER_LOG" } });
  await assert.rejects(
    titan.titanOnce(credentials, "GetInfo", {}),
    (e) => e.code === "TITAN_CONNECTION" && !e.message.includes("SECRET"),
  );
  assert.equal(instances.at(-1).readyState, 3);
});
test("Titan quote stream checks stream ID and feeds a real wallet signing path without network submission", async () => {
  const owner = Keypair.generate(),
    other = Keypair.generate(),
    hash = Keypair.generate().publicKey.toBase58();
  const ix = SystemProgram.transfer({
    fromPubkey: owner.publicKey,
    toPubkey: other.publicKey,
    lamports: 1,
  });
  const route = {
    inAmount: 100n,
    outAmount: 1000n,
    slippageBps: 50,
    computeUnitsSafe: 100000,
    instructions: [
      require("./swap-fixture.cjs").swapInstruction(
        owner.publicKey.toBase58(),
        a,
        b,
      ),
    ],
  };
  respond = (ws, raw) => {
    const request = decode(raw, { useBigInt64: true });
    if (request.data.StopStream) return;
    assert.equal(request.data.NewSwapQuoteStream.swap.amount, 100n);
    assert.deepEqual(
      Buffer.from(request.data.NewSwapQuoteStream.transaction.userPublicKey),
      owner.publicKey.toBuffer(),
    );
    frame(ws, {
      Response: {
        requestId: 1,
        data: { NewSwapQuoteStream: { intervalMs: 1000n } },
        stream: { id: 7 },
      },
    });
    frame(ws, {
      StreamData: { id: 8, seq: 1, payload: { SwapQuotes: { bad: true } } },
    });
    frame(ws, {
      StreamData: {
        id: 7,
        seq: 1,
        payload: {
          SwapQuotes: {
            inputMint: new PublicKey(a).toBytes(),
            outputMint: new PublicKey(b).toBytes(),
            amount: 100n,
            swapMode: "ExactIn",
            quotes: { fixture: route },
            metadata: { ExpectedWinner: "fixture" },
          },
        },
      },
    });
  };
  const wallet = createWallet(
    owner.publicKey.toBase58(),
    "mainnet",
    "sign",
    JSON.stringify([...owner.secretKey]),
  );
  let sends = 0,
    simulations = 0;
  const rpc = async (method, params) => {
    if (method === "getLatestBlockhash") return { value: { blockhash: hash } };
    if (method === "isBlockhashValid") return { value: true };
    if (method === "getAccountInfo")
      return require("./swap-fixture.cjs").mintAccount();
    if (method === "getFeeForMessage") return { value: 5000 };
    if (method === "simulateTransaction") {
      simulations++;
      assert.equal(params[1].sigVerify, true);
      return { value: { err: null } };
    }
    if (method === "sendTransaction") {
      sends++;
      return (await wallet.prepare(params[0], "mainnet")).signature;
    }
    throw Error(method);
  };
  const context = {
    getNode: () => ({ name: "Triton" }),
    getParentNodes: () => [
      { type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet" },
    ],
    getInputConnectionData: async () => wallet,
  };
  const result = await executeService(
    context,
    0,
    "titan.swap",
    {
      inputMint: a,
      outputMint: b,
      titanAmount: "100",
      minimumOutput: "990",
      slippageBps: 50,
    },
    credentials,
    rpc,
    "mainnet",
  );
  assert.equal(result.data.submissionStatus, "accepted");
  assert.equal(result.data.confirmationStatus, "unknown");
  assert.equal(result.meta.provider, "fixture");
  assert.equal(sends, 1);
  assert.equal(simulations, 1);
  // Honest quote metadata cannot hide malicious instruction bytes.
  route.instructions[0].d.writeBigUInt64LE(1n, 16);
  let prepares = 0;
  const guarded = {
    ...wallet,
    prepare: async () => {
      prepares++;
      throw Error("must not sign");
    },
  };
  await assert.rejects(
    executeService(
      { ...context, getInputConnectionData: async () => guarded },
      0,
      "titan.swap",
      {
        inputMint: a,
        outputMint: b,
        titanAmount: "100",
        minimumOutput: "990",
        slippageBps: 50,
      },
      credentials,
      rpc,
      "mainnet",
    ),
    { code: "SWAP_POLICY" },
  );
  assert.equal(prepares, 0);
  assert.equal(sends, 1);
  assert.equal(simulations, 1);

  assert.ok(
    instances
      .at(-1)
      .sent.map((v) => decode(v))
      .some((v) => v.data.StopStream),
  );
});
test("Whirligig request IDs, lossless amounts, filter shape and clean close", async () => {
  let finished;
  const done = new Promise((resolve) => (finished = resolve));
  respond = () => {};
  const errors = [];
  const close = streams.openWhirligig(
    credentials,
    {
      topic: "account",
      watchAddress: a,
      wsOptions: { commitment: "confirmed" },
    },
    finished,
    (e) => errors.push(e),
  );
  await new Promise((resolve) => setImmediate(resolve));
  const ws = instances.at(-1);
  assert.deepEqual(JSON.parse(ws.sent[0]), {
    jsonrpc: "2.0",
    id: 1,
    method: "accountSubscribe",
    params: [a, { commitment: "confirmed", encoding: "base64" }],
  });
  ws.emit("message", Buffer.from('{"jsonrpc":"2.0","id":1,"result":9}'));
  ws.emit(
    "message",
    Buffer.from(
      '{"method":"accountNotification","params":{"subscription":9,"result":{"context":{"slot":3},"value":{"lamports":18446744073709551615}}}}',
    ),
  );
  const event = await done;
  assert.equal(event.value.lamports, "18446744073709551615");
  close();
  assert.equal(errors.length, 0);
  assert.equal(ws.url.pathname, "/whirligig");
});
test("stream filters reject broad preconfigured transaction requests and private URLs", () => {
  assert.throws(
    () =>
      streams.websocketRequest({
        topic: "transaction",
        transactionFilter: {},
        wsOptions: {},
      }),
    { code: "INVALID_INPUT" },
  );
  assert.throws(() => streams.streamEndpoint("http://demo.rpcpool.com/"), {
    code: "INVALID_INPUT",
  });
  assert.throws(
    () => streams.streamEndpoint("https://demo.rpcpool.com/SECRET"),
    { code: "INVALID_INPUT" },
  );
  assert.throws(() => streams.streamFilter({ unknown: {} }, ["accounts"]), {
    code: "INVALID_INPUT",
  });
});
test("event identities retain write versions and commitment transitions", () => {
  const a = streams.envelope(
    "dragon",
    { account: { slot: 1, writeVersion: "2" } },
    "mainnet",
    "processed",
  );
  const b = streams.envelope(
    "dragon",
    { account: { slot: 1, writeVersion: "3" } },
    "mainnet",
    "processed",
  );
  const c = streams.envelope(
    "dragon",
    { account: { slot: 1, writeVersion: "2" } },
    "mainnet",
    "confirmed",
  );
  assert.notEqual(a.eventId, b.eventId);
  assert.notEqual(a.eventId, c.eventId);
  assert.equal(a.provisional, true);
  assert.equal(c.provisional, false);
});
test("pinned preconfirmation proto preserves unknown outcome and uint64 sequence", () => {
  const loader = require("@grpc/proto-loader");
  const path = require("node:path");
  const definitions = loader.loadSync(
    path.join(
      __dirname,
      "../dist/nodes/TarvosTritonTrigger/proto/preconfs.proto",
    ),
    {
      longs: String,
      enums: String,
      bytes: Buffer,
      defaults: false,
      oneofs: true,
    },
  );
  const method = definitions["preconfs.BAM"].Subscribe;
  const input = {
    transaction: {
      transaction: Buffer.from([1, 2]),
      slot: "18446744073709551615",
      sequence: "99",
      bundlePosition: 0,
    },
  };
  const result = method.responseDeserialize(method.responseSerialize(input));
  assert.equal(result.transaction.slot, "18446744073709551615");
  assert.equal(result.transaction.result, undefined);
  assert.equal(method.path, "/preconfs.BAM/Subscribe");
});
