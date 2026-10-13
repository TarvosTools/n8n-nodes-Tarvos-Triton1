// Real local gRPC exchange using the official pinned codecs; no provider credentials.
const assert = require("node:assert/strict");
const grpc = require("@grpc/grpc-js");
const {
  yellowstoneSchema,
  yellowstoneDefinition,
} = require("../dist/nodes/TarvosTritonTrigger/yellowstone");
async function run(deshred) {
  const schema = yellowstoneSchema();
  const definition = yellowstoneDefinition(deshred);
  const name = deshred ? "SubscribeDeshred" : "Subscribe";
  const server = new grpc.Server();
  let request;
  server.addService(
    { [name]: definition },
    {
      [name]: (call) => {
        call.on("data", (value) => {
          request = value;
          if (deshred)
            call.write(schema.SubscribeUpdateDeshred.fromJSON({ ping: {} }));
          else
            call.write(
              schema.SubscribeUpdate.fromJSON({
                account: {
                  slot: "18446744073709551615",
                  account: {
                    lamports: "18446744073709551615",
                    pubkey: Buffer.alloc(32).toString("base64"),
                  },
                },
              }),
            );
        });
      },
    },
  );
  const port = await new Promise((resolve, reject) =>
    server.bindAsync(
      "127.0.0.1:0",
      grpc.ServerCredentials.createInsecure(),
      (error, port) => (error ? reject(error) : resolve(port)),
    ),
  );
  const Client = grpc.makeGenericClientConstructor(
    { [name]: definition },
    "Geyser",
  );
  const client = new Client(
    "127.0.0.1:" + port,
    grpc.credentials.createInsecure(),
  );
  const stream = client[name]();
  try {
    const result = new Promise((resolve, reject) => {
      stream.once("data", resolve);
      stream.on("error", (e) => {
        if (e.code !== grpc.status.CANCELLED) reject(e);
      });
      setTimeout(() => reject(Error("gRPC loopback timeout")), 3000).unref();
    });
    stream.write(
      deshred
        ? schema.SubscribeDeshredRequest.fromJSON({
            deshredTransactions: {
              watched: { accountInclude: ["11111111111111111111111111111111"] },
            },
          })
        : schema.SubscribeRequest.fromJSON({
            accounts: {
              watched: { account: ["11111111111111111111111111111111"] },
            },
            commitment: "CONFIRMED",
          }),
    );
    const update = await result;
    if (deshred) {
      assert.ok(update.ping);
      assert.equal(
        request.deshredTransactions.watched.accountInclude[0],
        "11111111111111111111111111111111",
      );
    } else {
      assert.equal(request.commitment, 1);
      assert.equal(update.account.account.lamports, "18446744073709551615");
    }
    console.log(
      "PASS: " +
        name +
        " real loopback gRPC, official codecs, no native binding",
    );
  } finally {
    stream.cancel();
    client.close();
    server.forceShutdown();
  }
}
(async () => {
  await run(false);
  await run(true);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
