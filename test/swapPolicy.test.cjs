const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} = require("@solana/web3.js");
const { buildSwap } = require("../dist/nodes/TarvosTritonOne/titan");
const {
  enforceSwapPolicy,
  TOKEN_PROGRAM,
  ATA_PROGRAM,
  WSOL,
  walletAta,
} = require("../dist/nodes/TarvosTritonOne/swapPolicy");
const { swapInstruction, mintAccount } = require("./swap-fixture.cjs");
const owner = Keypair.generate().publicKey,
  input = Keypair.generate().publicKey,
  output = Keypair.generate().publicKey;
const params = {
  inputMint: input.toBase58(),
  outputMint: output.toBase58(),
  titanAmount: "100",
  minimumOutput: "995",
  slippageBps: 50,
};
const raw = () => swapInstruction(owner, input, output);
const ix = (r) =>
  new TransactionInstruction({
    programId: new PublicKey(r.p),
    data: Buffer.from(r.d),
    keys: r.a.map((a) => ({
      pubkey: new PublicKey(a.p),
      isSigner: a.s,
      isWritable: a.w,
    })),
  });
const policy = (list, p = params, rpc = async () => mintAccount()) =>
  enforceSwapPolicy(list, owner, p, 995n, rpc);
const route = (r = raw()) => ({
  inAmount: 100n,
  outAmount: 1000n,
  slippageBps: 50,
  computeUnitsSafe: 100000,
  instructions: [r],
});
const rpc = async (m) =>
  m === "getAccountInfo"
    ? mintAccount()
    : m === "getFeeForMessage"
      ? { value: 5000 }
      : m === "getLatestBlockhash"
        ? { value: { blockhash: input.toBase58() } }
        : Promise.reject(Error(m));
test("instruction amounts cannot be replaced by honest quote metadata", async () => {
  for (const [offset, amount] of [
    [8, 101n],
    [8, 99n],
    [16, 994n],
    [16, 0n],
  ]) {
    const r = raw();
    r.d.writeBigUInt64LE(amount, offset);
    await assert.rejects(buildSwap(route(r), owner.toBase58(), params, rpc), {
      code: "SWAP_POLICY",
    });
  }
  await policy([ix(raw())]);
});
test("wallet/mint/recipient binding and standard token programs are mandatory", async () => {
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const r = raw();
    r.a[i].p = Keypair.generate().publicKey.toBytes();
    await assert.rejects(policy([ix(r)]), { code: "SWAP_POLICY" });
  }
  for (const i of [0, 2, 3, 5]) {
    const r = raw();
    r.a[i].s = !r.a[i].s;
    await assert.rejects(policy([ix(r)]), { code: "SWAP_POLICY" });
  }
  await assert.rejects(
    policy([ix(raw())], params, async () => ({
      value: { owner: "Token2022", data: ["", "base64"] },
    })),
    { code: "SWAP_POLICY" },
  );
});
test("unsupported layouts, malformed data, fees, duplicate swaps and extra transfers are rejected", async () => {
  for (const mutate of [
    (r) => r.d[0]++,
    (r) => (r.d = r.d.subarray(0, 23)),
    (r) => r.d.writeUInt16LE(1, 25),
    (r) => r.d.writeUInt16LE(1, 27),
    (r) => r.d.writeUInt32LE(0, 29),
  ]) {
    const r = raw();
    mutate(r);
    await assert.rejects(policy([ix(r)]), { code: "SWAP_POLICY" });
  }
  await assert.rejects(policy([ix(raw()), ix(raw())]), { code: "SWAP_POLICY" });
  const transfer = SystemProgram.transfer({
    fromPubkey: owner,
    toPubkey: output,
    lamports: 1,
  });
  await assert.rejects(policy([transfer, ix(raw())]), { code: "SWAP_POLICY" });
  await assert.rejects(
    policy([
      ix(raw()),
      new TransactionInstruction({
        programId: TOKEN_PROGRAM,
        keys: [],
        data: Buffer.from([4]),
      }),
    ]),
    { code: "SWAP_POLICY" },
  );
  await assert.rejects(
    policy([
      ix(raw()),
      new TransactionInstruction({
        programId: output,
        keys: [],
        data: Buffer.alloc(0),
      }),
    ]),
    { code: "SWAP_POLICY" },
  );
});
test("native SOL wrapping is bounded and requires sync before swap", async () => {
  const p = { ...params, inputMint: WSOL.toBase58() },
    source = walletAta(owner, WSOL);
  const swap = ix(swapInstruction(owner, WSOL, output));
  const transfer = (n) =>
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: source,
      lamports: n,
    });
  const sync = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [{ pubkey: source, isSigner: false, isWritable: true }],
    data: Buffer.from([17]),
  });
  await policy([transfer(100), sync, swap], p);
  for (const list of [
    [transfer(101), sync, swap],
    [transfer(100), swap],
    [transfer(60), transfer(60), sync, swap],
    [swap, transfer(1), sync],
    [sync, transfer(1), swap],
  ])
    await assert.rejects(policy(list, p), { code: "SWAP_POLICY" });
});
test("only wallet-owned idempotent ATA setup and native close refund are allowed", async () => {
  const p = { ...params, inputMint: WSOL.toBase58() },
    source = walletAta(owner, WSOL);
  const setup = new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      owner,
      source,
      owner,
      WSOL,
      SystemProgram.programId,
      TOKEN_PROGRAM,
    ].map((pubkey, i) => ({ pubkey, isSigner: i === 0, isWritable: i < 2 })),
    data: Buffer.from([1]),
  });
  const swap = ix(swapInstruction(owner, WSOL, output));
  const close = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([9]),
  });
  await policy([setup, swap, close], p);
  await assert.rejects(policy([setup, setup, swap], p), {
    code: "SWAP_POLICY",
  });
  await assert.rejects(policy([swap, setup], p), { code: "SWAP_POLICY" });
  close.keys[1].pubkey = output;
  await assert.rejects(policy([swap, close], p), { code: "SWAP_POLICY" });
});
test("fee estimate is required and capped before signing", async () => {
  for (const fee of [null, 100001])
    await assert.rejects(
      buildSwap(route(), owner.toBase58(), params, async (m, p) =>
        m === "getFeeForMessage" ? { value: fee } : rpc(m, p),
      ),
      { code: "SWAP_FEE_LIMIT" },
    );
  await buildSwap(route(), owner.toBase58(), params, rpc);
});
