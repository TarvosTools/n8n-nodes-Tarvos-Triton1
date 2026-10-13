const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  PublicKey,
  AddressLookupTableAccount,
} = require("@solana/web3.js");
const {
  createWallet,
  decodeTransaction,
  validatePreparedTransaction,
} = require("../dist/nodes/TarvosSolanaWallet/signing");
const { submit } = require("../dist/nodes/TarvosTritonOne/submission");
const { TritonError } = require("../dist/nodes/TarvosTritonOne/errors");
const {
  TarvosSolanaWallet,
} = require("../dist/nodes/TarvosSolanaWallet/TarvosSolanaWallet.node");
// Ephemeral in-memory test keys. Never funded, persisted or sent to a network.
const key = Keypair.generate(),
  other = Keypair.generate(),
  hash = Keypair.generate().publicKey.toBase58();
function fixture(version = "legacy", instructions) {
  const message = new TransactionMessage({
    payerKey: key.publicKey,
    recentBlockhash: hash,
    instructions: instructions ?? [
      SystemProgram.transfer({
        fromPubkey: key.publicKey,
        toPubkey: other.publicKey,
        lamports: 1,
      }),
    ],
  });
  return new VersionedTransaction(
    version === "legacy"
      ? message.compileToLegacyMessage()
      : message.compileToV0Message(),
  );
}
const encode = (tx) => Buffer.from(tx.serialize()).toString("base64");
const wallet = () =>
  createWallet(
    key.publicKey.toBase58(),
    "devnet",
    "sign",
    JSON.stringify([...key.secretKey]),
  );
for (const version of ["legacy", 0])
  test(`${version}: signs exact message and validates already-signed bytes`, async () => {
    const tx = fixture(version),
      before = Buffer.from(tx.message.serialize());
    const result = await wallet().prepare(encode(tx), "devnet");
    assert.equal(result.signature.length > 50, true);
    assert.deepEqual(
      Buffer.from(decodeTransaction(result.transaction).message.serialize()),
      before,
    );
    const again = await createWallet(
      key.publicKey.toBase58(),
      "devnet",
      "alreadySigned",
    ).prepare(result.transaction, "devnet");
    assert.equal(again.transaction, result.transaction);
  });
test("wallet mismatch, network mismatch and invalid credential fail closed", async () => {
  assert.throws(
    () =>
      createWallet(
        other.publicKey.toBase58(),
        "devnet",
        "sign",
        JSON.stringify([...key.secretKey]),
      ),
    { code: "WALLET_MISMATCH" },
  );
  assert.throws(
    () =>
      createWallet(
        key.publicKey.toBase58(),
        "devnet",
        "sign",
        "secret-do-not-leak",
      ),
    (e) => !e.message.includes("secret-do-not-leak"),
  );
  await assert.rejects(wallet().prepare(encode(fixture()), "mainnet"), {
    code: "NETWORK_MISMATCH",
  });
  await assert.rejects(
    createWallet(other.publicKey.toBase58(), "devnet", "alreadySigned").prepare(
      encode(fixture()),
      "devnet",
    ),
    { code: "WALLET_NOT_SIGNER" },
  );
});
test("invalid and missing signatures fail; valid cosignatures are preserved", async () => {
  const instructions = [
    SystemProgram.transfer({
      fromPubkey: other.publicKey,
      toPubkey: key.publicKey,
      lamports: 1,
    }),
  ];
  const tx = fixture("legacy", instructions);
  await assert.rejects(wallet().prepare(encode(tx), "devnet"), {
    code: "MISSING_SIGNATURE",
  });
  tx.sign([other]);
  const saved = Buffer.from(tx.signatures[1]);
  const result = await wallet().prepare(encode(tx), "devnet");
  assert.deepEqual(
    Buffer.from(decodeTransaction(result.transaction).signatures[1]),
    saved,
  );
  tx.signatures[1][0] ^= 1;
  await assert.rejects(wallet().prepare(encode(tx), "devnet"), {
    code: "INVALID_SIGNATURE",
  });
});
test("reject noncanonical/trailing data, oversized bytes and nonce transactions", async () => {
  assert.throws(() => decodeTransaction(encode(fixture()) + "AAAA"), {
    code: "INVALID_TRANSACTION",
  });
  assert.throws(
    () => decodeTransaction(Buffer.alloc(1233).toString("base64")),
    { code: "INVALID_TRANSACTION" },
  );
  const nonce = fixture("legacy", [
    SystemProgram.nonceAdvance({
      noncePubkey: other.publicKey,
      authorizedPubkey: key.publicKey,
    }),
  ]);
  await assert.rejects(
    validatePreparedTransaction(
      nonce,
      async () => ({ value: true }),
      "confirmed",
    ),
    { code: "DURABLE_NONCE_UNSUPPORTED" },
  );
  await assert.rejects(
    validatePreparedTransaction(
      fixture(),
      async () => ({ value: false }),
      "confirmed",
    ),
    { code: "BLOCKHASH_INVALID" },
  );
});
function context(w = wallet(), retry = false) {
  return {
    getNode: () => ({ retryOnFail: retry }),
    getParentNodes: () => [
      { type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet" },
    ],
    getInputConnectionData: async () => w,
  };
}
test("submit performs validity checks then returns acceptance without claiming confirmation", async () => {
  const tx = encode(fixture());
  const expected = await wallet().prepare(tx, "devnet");
  const methods = [];
  const result = await submit(
    context(),
    0,
    { transaction: tx },
    async (method, params) => {
      methods.push(method);
      if (method === "isBlockhashValid") return { value: true };
      assert.equal(params[0], expected.transaction);
      assert.equal(params[1].skipPreflight, false);
      assert.equal(params[1].maxRetries, 0);
      return expected.signature;
    },
    "devnet",
  );
  assert.deepEqual(methods, ["isBlockhashValid", "sendTransaction"]);
  assert.equal(result.data.confirmationStatus, "unknown");
  assert.equal(result.data.signature, expected.signature);
});
test("ambiguous submit preserves signature and forbids automatic retry", async () => {
  const tx = encode(fixture());
  await assert.rejects(
    submit(
      context(),
      0,
      { transaction: tx },
      async (method) => {
        if (method === "isBlockhashValid") return { value: true };
        throw new TritonError("TRANSPORT_ERROR", "timeout");
      },
      "devnet",
    ),
    (e) =>
      e.code === "SUBMISSION_OUTCOME_UNKNOWN" && e.details.signature && e.stop,
  );
  await assert.rejects(
    submit(
      context(wallet(), true),
      0,
      { transaction: tx },
      async () => assert.fail("unexpected request"),
      "devnet",
    ),
    { code: "UNSAFE_RETRY" },
  );
});
test("wallet supplyData keeps credential out of enumerable capability and needs no credential for already-signed", async () => {
  let credentialReads = 0;
  const ctx = {
    getNode: () => ({ name: "Wallet" }),
    getNodeParameter: (n, i, f) =>
      ({
        publicAddress: key.publicKey.toBase58(),
        network: "devnet",
        signingMode: "alreadySigned",
      })[n] ?? f,
    getCredentials: async () => {
      credentialReads++;
      throw Error();
    },
  };
  const supplied = await new TarvosSolanaWallet().supplyData.call(ctx, 0);
  assert.equal(credentialReads, 0);
  assert.equal(supplied.response.kind, "tarvos.solana.wallet.v1");
  assert.ok(!JSON.stringify(supplied.response).includes("secretKey"));
});
