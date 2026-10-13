// Synthetic Titan V2 instruction fixture from the pinned official IDL; not a live route.
const { PublicKey } = require("@solana/web3.js");
const {
  TITAN_PROGRAM,
  TOKEN_PROGRAM,
  walletAta,
} = require("../dist/nodes/TarvosTritonOne/swapPolicy");
function swapInstruction(owner, input, output, amount = 100n, minimum = 995n) {
  const payer = new PublicKey(owner),
    a = new PublicKey(input),
    b = new PublicKey(output);
  const data = Buffer.alloc(41);
  Buffer.from([249, 91, 84, 33, 69, 22, 0, 135]).copy(data);
  data.writeBigUInt64LE(amount, 8);
  data.writeBigUInt64LE(minimum, 16);
  data[24] = 2;
  data.writeUInt32LE(1, 29);
  data[33] = 0;
  data[34] = 0;
  data[35] = 1;
  data.writeUInt32LE(1000000000, 36);
  data[40] = 0;
  const atlas = PublicKey.findProgramAddressSync(
    [Buffer.from("atlas")],
    TITAN_PROGRAM,
  )[0];
  return {
    p: TITAN_PROGRAM.toBytes(),
    a: [
      payer,
      atlas,
      a,
      walletAta(payer, a),
      b,
      walletAta(payer, b),
      TOKEN_PROGRAM,
      TOKEN_PROGRAM,
    ].map((k, i) => ({ p: k.toBytes(), s: i === 0, w: [0, 3, 5].includes(i) })),
    d: data,
  };
}
const mintAccount = () => {
  const b = Buffer.alloc(82);
  b[45] = 1;
  return {
    value: {
      owner: TOKEN_PROGRAM.toBase58(),
      data: [b.toString("base64"), "base64"],
    },
  };
};
module.exports = { swapInstruction, mintAccount };
