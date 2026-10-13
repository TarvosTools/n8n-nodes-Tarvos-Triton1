import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { address, atomic } from "./validation";
import { TritonError } from "./errors";
import type { Rpc } from "./transport";

// Pinned official Titan V2 IDL: d4327181fffccd9b866a30c9b77552b20e4bba38.
// See docs/SWAP-SAFETY.md for supported layouts and trust boundaries.
export const TITAN_PROGRAM = new PublicKey(
  "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT",
);
export const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ATA_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const WSOL = new PublicKey(
  "So11111111111111111111111111111111111111112",
);
const V2 = Buffer.from([249, 91, 84, 33, 69, 22, 0, 135]);
export function walletAta(wallet: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM,
  )[0];
}
function reject(reason: string): never {
  throw new TritonError(
    "SWAP_POLICY",
    `${reason} Nothing was signed. Only verified Titan V2 routes with standard SPL tokens are supported.`,
  );
}
export async function enforceSwapPolicy(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  p: Record<string, unknown>,
  minimum: bigint,
  rpc: Rpc,
): Promise<void> {
  const amount = BigInt(atomic(p.titanAmount));
  if (
    amount < 1n ||
    amount > 18446744073709551615n ||
    minimum < 1n ||
    minimum > 18446744073709551615n
  )
    reject("Swap amounts must be positive u64 values.");
  const input = new PublicKey(address(p.inputMint)),
    output = new PublicKey(address(p.outputMint));
  if (input.equals(output)) reject("Swap mints must differ.");
  const source = walletAta(payer, input),
    destination = walletAta(payer, output);
  const atlas = PublicKey.findProgramAddressSync(
    [Buffer.from("atlas")],
    TITAN_PROGRAM,
  )[0];
  const swaps = instructions.filter((ix) => ix.programId.equals(TITAN_PROGRAM));
  if (swaps.length !== 1)
    reject("Expected exactly one Titan swap instruction.");
  const swap = swaps[0],
    data = swap.data;
  if (data.length < 34 || !data.subarray(0, 8).equals(V2))
    reject("Unrecognized Titan instruction layout.");
  if (data.readBigUInt64LE(8) !== amount)
    reject("Instruction input amount differs from Amount to Pay.");
  if (data.readBigUInt64LE(16) < minimum)
    reject(
      "Instruction minimum output is below the required slippage/minimum limit.",
    );
  if (data.readUInt16LE(25) !== 0 || data.readUInt16LE(27) !== 0)
    reject("Provider and service fees are not supported by this swap policy.");
  if (data[24] < 2 || data.readUInt32LE(29) < 1 || data.readUInt32LE(29) > 64)
    reject("Invalid bounded route payload.");
  const expected = [
    payer,
    atlas,
    input,
    source,
    output,
    destination,
    TOKEN_PROGRAM,
    TOKEN_PROGRAM,
  ];
  if (swap.keys.length < 8) reject("Swap fixed accounts are missing.");
  expected.forEach((key, i) => {
    const a = swap.keys[i];
    if (
      !a.pubkey.equals(key) ||
      a.isSigner !== (i === 0) ||
      a.isWritable !== [0, 3, 5].includes(i)
    )
      reject(
        "Swap wallet, mints, token accounts or account permissions do not match.",
      );
  });
  if (swap.keys.slice(8).some((a) => a.isSigner))
    reject("Unexpected remaining-account signer.");
  const created = new Set<string>();
  let seenSwap = false,
    wrapped = 0n,
    synced = false,
    closed = false;
  for (const ix of instructions) {
    if (ix === swap) {
      seenSwap = true;
      continue;
    }
    const k = ix.keys,
      d = ix.data;
    if (ix.programId.equals(ATA_PROGRAM)) {
      // Only idempotent creation of this wallet's input/output ATA, before the swap.
      if (seenSwap || d.length !== 1 || d[0] !== 1 || k.length !== 6)
        reject("Unexpected token-account setup.");
      const mint = k[3]?.pubkey;
      if (!mint || (!mint.equals(input) && !mint.equals(output)))
        reject("Unexpected setup mint.");
      const keys = [
        payer,
        walletAta(payer, mint),
        payer,
        mint,
        SystemProgram.programId,
        TOKEN_PROGRAM,
      ];
      keys.forEach((key, i) => {
        if (
          !k[i].pubkey.equals(key) ||
          k[i].isSigner !== (i === 0) ||
          k[i].isWritable !== i < 2
        )
          reject("Unexpected setup account or permission.");
      });
      if (created.has(mint.toBase58()))
        reject("Duplicate token-account creation.");
      created.add(mint.toBase58());
      continue;
    }
    if (ix.programId.equals(SystemProgram.programId)) {
      if (
        seenSwap ||
        synced ||
        !input.equals(WSOL) ||
        d.length !== 12 ||
        d.readUInt32LE(0) !== 2 ||
        k.length !== 2 ||
        !k[0].pubkey.equals(payer) ||
        !k[0].isSigner ||
        !k[0].isWritable ||
        !k[1].pubkey.equals(source) ||
        k[1].isSigner ||
        !k[1].isWritable
      )
        reject("Unapproved SOL transfer or system instruction.");
      wrapped += d.readBigUInt64LE(4);
      if (wrapped > amount) reject("SOL wrapping exceeds Amount to Pay.");
      continue;
    }
    if (ix.programId.equals(TOKEN_PROGRAM)) {
      if (
        d.length === 1 &&
        d[0] === 17 &&
        !seenSwap &&
        !synced &&
        input.equals(WSOL) &&
        k.length === 1 &&
        k[0].pubkey.equals(source) &&
        k[0].isWritable &&
        !k[0].isSigner
      ) {
        synced = true;
        continue;
      }
      const nativeAccount = input.equals(WSOL)
        ? source
        : output.equals(WSOL)
          ? destination
          : undefined;
      if (
        d.length === 1 &&
        d[0] === 9 &&
        seenSwap &&
        !closed &&
        nativeAccount &&
        k.length === 3 &&
        k[0].pubkey.equals(nativeAccount) &&
        k[0].isWritable &&
        !k[0].isSigner &&
        k[1].pubkey.equals(payer) &&
        k[1].isWritable &&
        !k[1].isSigner &&
        k[2].pubkey.equals(payer) &&
        k[2].isSigner &&
        !k[2].isWritable
      ) {
        closed = true;
        continue;
      }
      reject("Unapproved token instruction, approval or transfer.");
    }
    reject("Unrecognized instruction outside the swap.");
  }
  if (wrapped > 0n && !synced)
    reject("Wrapped SOL must be synchronized before swapping.");
  // Pin standard SPL ownership; Token-2022 extensions/hooks need separate validation.
  for (const mint of [input, output]) {
    const result = (await rpc("getAccountInfo", [
      mint.toBase58(),
      { encoding: "base64", commitment: "confirmed" },
    ])) as { value?: { owner?: string; data?: [string, string] } };
    const account = result?.value;
    if (
      account?.owner !== TOKEN_PROGRAM.toBase58() ||
      account.data?.[1] !== "base64"
    )
      reject("Mint is not a supported standard SPL mint.");
    const bytes = Buffer.from(account.data[0], "base64");
    if (bytes.length !== 82 || bytes[45] !== 1)
      reject("Mint layout is not initialized standard SPL.");
  }
}
