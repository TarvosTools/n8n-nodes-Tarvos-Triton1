const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  tokenUnits,
  normalizeTrade,
} = require("../dist/nodes/TarvosTritonOne/tradeExperience");
const { createWallet } = require("../dist/nodes/TarvosSolanaWallet/signing");
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
test("readable amounts preserve exact precision and reject rounding or overflow", () => {
  assert.equal(tokenUnits("0.1", 9), "100000000");
  assert.equal(tokenUnits("9007199254.740993", 6), "9007199254740993");
  for (const amount of [
    "0",
    "-1",
    "1e3",
    "1,000",
    "0.0000001",
    "18446744073709551616",
  ])
    assert.throws(() => tokenUnits(amount, 6));
});
test("guided trade resolves mints, on-chain decimals, output floor, and percent slippage", async () => {
  const p = {
    inputToken: SOL,
    outputToken: USDC,
    tradeUnits: "tokens",
    tradeAmount: "0.1",
    tradeMinimum: "10.25",
    tradeSlippage: "0.5",
  };
  const calls = [];
  await normalizeTrade(p, async (method, args) => {
    calls.push([method, args]);
    return { value: { decimals: args[0] === SOL ? 9 : 6 } };
  });
  assert.equal(p.titanAmount, "100000000");
  assert.equal(p.minimumOutput, "10250000");
  assert.equal(p.slippageBps, 50);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["getTokenSupply", "getTokenSupply"],
  );
  assert.equal(p.inputMint, SOL);
  assert.equal(p.outputMint, USDC);
});
test("advanced atomic amounts bypass scaling and malformed decimals fail closed", async () => {
  const p = {
    inputToken: SOL,
    outputToken: USDC,
    tradeUnits: "atomic",
    tradeAmount: "42",
    tradeSlippage: "1",
  };
  await normalizeTrade(p, async () => {
    throw Error("unexpected RPC");
  });
  assert.equal(p.titanAmount, "42");
  assert.equal(p.slippageBps, 100);
  await assert.rejects(() =>
    normalizeTrade({ ...p, tradeUnits: "tokens" }, async () => ({ value: {} })),
  );
});
test("public address wallet cannot prepare any transaction", async () => {
  const wallet = createWallet(SOL, "mainnet", "readOnly");
  await assert.rejects(
    () => wallet.prepare("", "mainnet"),
    /public-address-only/,
  );
});
test("connected-wallet quote never prepares or submits a transaction; swaps reject read-only wallets", async () => {
  const titan = require("../dist/nodes/TarvosTritonOne/titan");
  const old = titan.titanOnce;
  let requested = 0;
  titan.titanOnce = async () => {
    requested++;
    return { quotes: [] };
  };
  try {
    const {
      executeService,
    } = require("../dist/nodes/TarvosTritonOne/services");
    const wallet = createWallet(SOL, "mainnet", "readOnly");
    const context = {
      getNode: () => ({ name: "test", typeVersion: 1.3 }),
      getParentNodes: () => [
        { type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet" },
      ],
      getInputConnectionData: async () => wallet,
    };
    const p = {
      quoteWallet: "wallet",
      inputMint: SOL,
      outputMint: USDC,
      titanAmount: "1",
    };
    const rpc = async () => {
      throw Error("quote must not call transaction RPC");
    };
    const result = await executeService(
      context,
      0,
      "titan.quote",
      p,
      {},
      rpc,
      "mainnet",
    );
    assert.equal(result.data.quotedFor, SOL);
    assert.equal(requested, 1);
    await assert.rejects(
      () => executeService(context, 0, "titan.swap", p, {}, rpc, "mainnet"),
      /signing mode/,
    );
    assert.equal(requested, 1);
  } finally {
    titan.titanOnce = old;
  }
});
test("main node applies readable trade values only to new versions", async () => {
  const transport = require("../dist/nodes/TarvosTritonOne/transport");
  const services = require("../dist/nodes/TarvosTritonOne/services");
  const oldRpc = transport.createRpc,
    oldValidate = transport.validateNetwork,
    oldExecute = services.executeService;
  let captured;
  transport.createRpc = () => ({
    network: "mainnet",
    rpc: async () => ({ value: { decimals: 9 } }),
  });
  transport.validateNetwork = async () => {};
  services.executeService = async (_c, _i, _key, p) => {
    captured = p;
    return { data: {}, meta: {} };
  };
  try {
    const {
      TarvosTritonOne,
    } = require("../dist/nodes/TarvosTritonOne/TarvosTritonOne.node");
    for (const version of [1.2, 1.3]) {
      const params = {
        resource: "titan",
        operation: "quote",
        tradeAmount: "0.1",
        inputMint: SOL,
        outputMint: USDC,
        titanAmount: "42",
        slippageBps: 75,
      };
      const ctx = {
        getNode: () => ({ typeVersion: version, parameters: params }),
        getNodeParameter: (n, _i, f) => params[n] ?? f,
        getCredentials: async () => ({}),
        getInputData: () => [{ json: {} }],
        continueOnFail: () => false,
      };
      await new TarvosTritonOne().execute.call(ctx);
      assert.equal(captured.titanAmount, version === 1.3 ? "100000000" : "42");
      assert.equal(captured.slippageBps, version === 1.3 ? 50 : 75);
    }
  } finally {
    transport.createRpc = oldRpc;
    transport.validateNetwork = oldValidate;
    services.executeService = oldExecute;
  }
});
