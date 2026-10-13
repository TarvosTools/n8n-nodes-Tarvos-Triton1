// Public Solana tests require no account. Triton tests require separately supplied credentials.
// No mode permits broadcasting a mainnet transaction.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  TarvosTritonOne,
} = require("../dist/nodes/TarvosTritonOne/TarvosTritonOne.node");
const { NodeHelpers } = require("n8n-workflow");
const {
  createRpc,
  validateNetwork,
} = require("../dist/nodes/TarvosTritonOne/transport");
const { GENESIS } = require("../dist/nodes/TarvosTritonOne/validation");
const { createWallet } = require("../dist/nodes/TarvosSolanaWallet/signing");
const root = path.resolve(__dirname, "..");
const PUBLIC = {
  devnet: "https://api.devnet.solana.com/",
  mainnet: "https://api.mainnet.solana.com/",
};
const READ_METHODS = new Set([
  "getGenesisHash",
  "getVersion",
  "getHealth",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  "getLatestBlockhash",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenSupply",
  "getTokenAccountBalance",
  "getSignatureStatuses",
  "getTransaction",
  "getFeeForMessage",
  "isBlockhashValid",
  "getMinimumBalanceForRentExemption",
  "getRecentPrioritizationFees",
]);
function guard(method, network, suite) {
  if (READ_METHODS.has(method) || method === "simulateTransaction") return;
  if (
    suite === "devnet" &&
    network === "devnet" &&
    ["requestAirdrop", "sendTransaction"].includes(method)
  )
    return;
  throw Object.assign(Error("Method is not permitted by this test suite"), {
    code: "TEST_SEND_GUARD",
  });
}
function client(network, suite, provider) {
  const endpoint = provider?.endpoint || PUBLIC[network];
  const token = provider ? process.env[provider.tokenEnv] : undefined;
  if (provider && !token)
    throw Object.assign(
      Error("Configure the provider token environment variable"),
      { code: "MISSING_CREDENTIALS" },
    );
  // Public adapter omits authentication; production node credential validation is unchanged.
  const helper = {
    httpRequest: async (options) => {
      const method = JSON.parse(options.body).method;
      guard(method, network, suite);
      const headers = { ...options.headers };
      if (!provider) delete headers["x-token"];
      const r = await fetch(provider ? options.url : PUBLIC[network], {
        method: "POST",
        headers,
        body: options.body,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok)
        throw Object.assign(Error("HTTP error"), {
          statusCode: r.status,
          response: {
            status: r.status,
            headers: Object.fromEntries(r.headers),
          },
        });
      return r.text();
    },
  };
  const credentials = {
    endpoint: provider ? endpoint : "https://public-test-adapter.rpcpool.com/",
    apiToken: token || "public-test-adapter",
    network,
  };
  return {
    ...createRpc({ helpers: helper }, credentials, 15000),
    helper,
    credentials,
  };
}
async function action(c, resource, operation, parameters = {}, wallet) {
  const type = new TarvosTritonOne();
  const params = NodeHelpers.getNodeParameters(
    type.description.properties,
    { resource, operation, ...parameters },
    true,
    false,
    { typeVersion: 1.3 },
  );
  const ctx = {
    getNode: () => ({ name: "test", typeVersion: 1.3, parameters: params }),
    getNodeParameter: (name, _i, fallback) => params[name] ?? fallback,
    getCredentials: async () => c.credentials,
    helpers: c.helper,
    getInputData: () => [{ json: {} }],
    continueOnFail: () => false,
    getParentNodes: () =>
      wallet
        ? [{ type: "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet" }]
        : [],
    getInputConnectionData: async () => wallet,
  };
  const result = await type.execute.call(ctx);
  return result[0][0].json;
}
async function main() {
  const suite = process.argv[2] || "public";
  if (
    ![
      "public",
      "devnet",
      "simulation",
      "provider",
      "titan-simulation",
    ].includes(suite)
  )
    throw Error(
      "Choose public, devnet, simulation or provider. Mainnet submission is not supported.",
    );
  const cfgPath = path.join(root, "test/live.config.json");
  const cfg = fs.existsSync(cfgPath)
    ? JSON.parse(fs.readFileSync(cfgPath, "utf8"))
    : {};
  const report = {
    suite,
    at: new Date().toISOString(),
    node: process.version,
    scope: "Bounded smoke tests, not full 77-action acceptance",
    results: [],
  };
  fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
  const file = path.join(root, "test-results", suite + ".json");
  const archive = path.join(
    root,
    "test-results",
    suite + "-" + report.at.replace(/[:.]/g, "-") + ".json",
  );
  const save = () => {
    const body = JSON.stringify(report, null, 2);
    fs.writeFileSync(file, body);
    fs.writeFileSync(archive, body);
  };
  const add = (id, status, detail) => {
    report.results.push({ id, status, ...detail });
    console.log(`${status}: ${id}`);
    save();
  };
  const attempt = async (id, fn) => {
    try {
      const evidence = await fn();
      add(id, "PASS", evidence);
      return true;
    } catch (e) {
      const code =
        e.code ||
        (/^(RATE_LIMIT|TRANSPORT_ERROR|CREDENTIAL_ERROR|INVALID_INPUT|RPC_ERROR):/.exec(
          e.message || "",
        ) || [])[1] ||
        "TEST_FAILURE";
      add(
        id,
        [
          "RATE_LIMIT",
          "TRANSPORT_ERROR",
          "CREDENTIAL_ERROR",
          "MISSING_CREDENTIALS",
          "DEVNET_FUNDS_REQUIRED",
        ].includes(code) ||
          (id === "devnet-faucet" && code === "RPC_ERROR")
          ? "BLOCKED"
          : "FAIL",
        {
          code,
          message:
            code === "TEST_FAILURE"
              ? "Assertion or node execution failed; inspect the test with sanitized logging."
              : String(e.message).slice(0, 250),
        },
      );
      return false;
    }
  };
  try {
    if (suite === "provider" || suite === "titan-simulation") {
      if (
        !cfg.triton?.endpoint ||
        !cfg.triton?.tokenEnv ||
        !process.env[cfg.triton.tokenEnv]
      ) {
        add("triton-access", "BLOCKED", {
          reason:
            "Copy test/live.config.example.json to test/live.config.json; set the named token environment variable. No secrets belong in JSON.",
        });
        return;
      }
      const c = client("mainnet", "provider", cfg.triton);
      if (
        !(await attempt("triton-genesis", async () => {
          await validateNetwork(c.rpc, "mainnet");
          return { network: "mainnet" };
        }))
      )
        return;
      if (suite === "titan-simulation") {
        if (!cfg.swapSimulation) {
          add("titan-positive-simulation", "BLOCKED", {
            reason:
              "Configure swapSimulation with a public wallet, token mints and exact atomic amounts. No private key is needed.",
          });
          return;
        }
        await attempt("titan-positive-simulation", async () => {
          const {
            titanOnce,
            titanRequest,
            validateQuoteContext,
            selectRoute,
            buildSwap,
          } = require("../dist/nodes/TarvosTritonOne/titan");
          const {
            address,
          } = require("../dist/nodes/TarvosTritonOne/validation");
          const settings = cfg.swapSimulation;
          const owner = address(settings.walletPublicAddress);
          const p = {
            inputMint: settings.inputMint,
            outputMint: settings.outputMint,
            titanAmount: settings.amountAtomic,
            minimumOutput: settings.minimumOutputAtomic,
            slippageBps: settings.slippageBps ?? 50,
            computeUnitPrice: "0",
          };
          const quotes = await titanOnce(
            c.credentials,
            "NewSwapQuoteStream",
            titanRequest(p, owner),
          );
          validateQuoteContext(quotes, p);
          const route = selectRoute(quotes, settings.provider);
          const transaction = await buildSwap(route, owner, p, c.rpc);
          const result = await action(c, "transaction", "simulate", {
            transaction,
          });
          assert.equal(result.data.value.err, null);
          return {
            wallet: owner,
            inputMint: p.inputMint,
            outputMint: p.outputMint,
            inputAtomic: p.titanAmount,
            minimumAtomic: p.minimumOutput,
            provider: route.provider,
            unitsConsumed: result.data.value.unitsConsumed,
            broadcast: false,
          };
        });
        return;
      }
      if (
        !(await attempt("triton-balance", async () => {
          const r = await action(c, "account", "getBalance", {
            address: SystemProgram.programId.toBase58(),
          });
          assert.ok(r.data !== undefined);
        }))
      )
        return;
      for (const op of ["getInfo", "getVenues", "listProviders"])
        if (
          !(await attempt("titan." + op, async () => {
            const r = await action(c, "titan", op);
            assert.ok(r.data !== undefined);
          }))
        )
          return;
      if (cfg.quotePublicAddress)
        await attempt("titan.quote", async () => {
          const r = await action(c, "titan", "quote", {
            quoteWallet: "address",
            titanPublicAddress: cfg.quotePublicAddress,
            tradeAmount: "0.001",
          });
          assert.ok(r.data.quotes);
          return { quotedFor: r.data.quotedFor };
        });
      else
        add("titan.quote", "BLOCKED", {
          reason:
            "Set quotePublicAddress to a public address in the config; no key needed.",
        });
      for (const service of [
        "DAS",
        "Whirligig",
        "Dragon",
        "Riptide",
        "Vixen",
        "Deshred",
        "Harmonic",
        "BAM",
        "Fumarole",
        "AccountSync",
        "management",
      ])
        add(service, "BLOCKED", {
          reason:
            "Requires service-specific fixtures/entitlement and its acceptance matrix; not covered by this smoke runner.",
        });
      return;
    }
    const network = suite === "simulation" ? "mainnet" : "devnet";
    const c = client(network, suite);
    if (
      !(await attempt("network-identity", async () => {
        await validateNetwork(c.rpc, network);
        return { network, genesis: GENESIS[network] };
      }))
    )
      return;
    if (suite === "public") {
      for (const op of [
        "getVersion",
        "getHealth",
        "getSlot",
        "getBlockHeight",
        "getEpochInfo",
        "getLatestBlockhash",
      ]) {
        const ok = await attempt("network." + op, async () => {
          const r = await action(c, "network", op);
          assert.ok(r.data !== undefined);
          if (op === "getHealth") assert.equal(r.data, "ok");
        });
        if (!ok) return;
      }
      const addr = SystemProgram.programId.toBase58();
      if (
        !(await attempt("account.getBalance", async () => {
          const r = await action(c, "account", "getBalance", { address: addr });
          const ref = await c.rpc("getBalance", [
            addr,
            { commitment: "finalized" },
          ]);
          assert.equal(r.data.lamports, String(ref.value));
        }))
      )
        return;
      if (
        !(await attempt("account.get", async () => {
          const r = await action(c, "account", "get", { address: addr });
          assert.equal(r.data.value.executable, true);
        }))
      )
        return;
      const latest = await c.rpc("getLatestBlockhash", [
        { commitment: "confirmed" },
      ]);
      await attempt("blockhash-valid", async () => {
        const r = await c.rpc("isBlockhashValid", [
          latest.value.blockhash,
          { commitment: "confirmed" },
        ]);
        assert.equal(r.value, true);
      });
      return;
    }
    if (suite === "simulation") {
      const key = Keypair.generate();
      const latest = await c.rpc("getLatestBlockhash", [
        { commitment: "confirmed" },
      ]);
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: key.publicKey,
          recentBlockhash: latest.value.blockhash,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: key.publicKey,
              toPubkey: key.publicKey,
              lamports: 0,
            }),
          ],
        }).compileToV0Message(),
      );
      await attempt("mainnet-negative-simulation", async () => {
        const r = await action(c, "transaction", "simulate", {
          transaction: Buffer.from(tx.serialize()).toString("base64"),
        });
        assert.ok(r.data.value.err);
        return {
          expected: "Unfunded ephemeral payer rejected; no broadcast",
          error: r.data.value.err,
        };
      });
      add("titan-mainnet-positive-simulation", "BLOCKED", {
        reason:
          "Requires authenticated fresh Titan route and a configured public wallet with the relevant balances. Negative simulation does not prove swap readiness.",
      });
      return;
    }
    // Devnet-only ephemeral test key, never written to disk or printed.
    const keyFile = process.env.DEVNET_TEST_KEYPAIR_FILE;
    const payer = keyFile
        ? Keypair.fromSecretKey(
            Uint8Array.from(JSON.parse(fs.readFileSync(keyFile, "utf8"))),
          )
        : Keypair.generate(),
      recipient = Keypair.generate().publicKey;
    report.walletPublicAddress = payer.publicKey.toBase58();
    save();
    const funded = await attempt("devnet-faucet", async () => {
      if (keyFile) {
        const balance = await c.rpc("getBalance", [
          payer.publicKey.toBase58(),
          { commitment: "confirmed" },
        ]);
        if (BigInt(balance.value) < 2000000n)
          throw Object.assign(
            Error("Dedicated devnet wallet needs at least 0.002 devnet SOL"),
            { code: "DEVNET_FUNDS_REQUIRED" },
          );
        return {
          lamports: String(balance.value),
          source: "configured dedicated devnet wallet",
        };
      }
      report.airdropSignature = await c.rpc("requestAirdrop", [
        payer.publicKey.toBase58(),
        50000000,
      ]);
      save();
      for (let i = 0; i < 15; i++) {
        const b = await c.rpc("getBalance", [
          payer.publicKey.toBase58(),
          { commitment: "confirmed" },
        ]);
        if (BigInt(b.value) >= 2000000n) return { lamports: String(b.value) };
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw Object.assign(Error("Faucet did not confirm within 30 seconds"), {
        code: "TRANSPORT_ERROR",
      });
    });
    if (!funded) {
      add("devnet-submit-confirm", "BLOCKED", {
        reason: "No confirmed faucet funds. No transaction was submitted.",
      });
      return;
    }
    await attempt("devnet-submit-confirm", async () => {
      await validateNetwork(c.rpc, "devnet");
      const latest = await c.rpc("getLatestBlockhash", [
        { commitment: "confirmed" },
      ]);
      const tx = new VersionedTransaction(
        new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: latest.value.blockhash,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: recipient,
              lamports: 1000000,
            }),
          ],
        }).compileToV0Message(),
      );
      const fee = await c.rpc("getFeeForMessage", [
        Buffer.from(tx.message.serialize()).toString("base64"),
        { commitment: "confirmed" },
      ]);
      assert.ok(fee.value !== null && Number(fee.value) <= 10000);
      const wallet = createWallet(
        payer.publicKey.toBase58(),
        "devnet",
        "sign",
        JSON.stringify(Array.from(payer.secretKey)),
      );
      const serialized = Buffer.from(tx.serialize()).toString("base64");
      const prepared = await wallet.prepare(serialized, "devnet");
      report.signature = prepared.signature;
      report.recipient = recipient.toBase58();
      report.transferLamports = 1000000;
      save();
      // Exactly one send attempt. No resend after transport ambiguity.
      const sent = await action(
        c,
        "transaction",
        "submit",
        {
          transaction: serialized,
          showAdvanced: true,
          simulateFirst: true,
          maxRetries: 0,
        },
        wallet,
      );
      assert.equal(sent.data.signature, report.signature);
      for (let i = 0; i < 20; i++) {
        const status = (
          await c.rpc("getSignatureStatuses", [
            [report.signature],
            { searchTransactionHistory: true },
          ])
        ).value[0];
        if (status?.err) throw Error("On-chain execution failed");
        if (["confirmed", "finalized"].includes(status?.confirmationStatus)) {
          const balance = await c.rpc("getBalance", [
            recipient.toBase58(),
            { commitment: "confirmed" },
          ]);
          assert.equal(String(balance.value), "1000000");
          return {
            signature: report.signature,
            confirmation: status.confirmationStatus,
            recipientLamports: String(balance.value),
          };
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw Object.assign(
        Error(
          "Confirmation timed out; reconcile saved signature before any further test",
        ),
        { code: "TRANSPORT_ERROR" },
      );
    });
  } catch (e) {
    add("suite", "FAIL", {
      code: e.code || "TEST_FAILURE",
      reason: "Unexpected setup or RPC failure; no automatic retry.",
    });
  } finally {
    save();
    if (report.results.some((r) => r.status === "FAIL")) process.exitCode = 1;
    else if (report.results.some((r) => r.status === "BLOCKED"))
      process.exitCode = 2;
    console.log(`Report: test-results/${suite}.json`);
  }
}
module.exports = { guard, client, action };
if (require.main === module)
  main().catch(() => {
    console.error("Test setup failed. Check config and build first.");
    process.exitCode = 1;
  });
