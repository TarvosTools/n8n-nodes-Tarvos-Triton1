import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import {
  address,
  encoded,
  network,
  type Network,
} from "../TarvosTritonOne/validation";
import { TritonError } from "../TarvosTritonOne/errors";
import type { Rpc } from "../TarvosTritonOne/transport";

export const WALLET_KIND = "tarvos.solana.wallet.v1";
export interface WalletCapability {
  kind: typeof WALLET_KIND;
  publicAddress: string;
  network: Network;
  mode: "sign" | "alreadySigned" | "readOnly";
  prepare: (
    transaction: string,
    network: Network,
  ) => Promise<{ transaction: string; signature: string; blockhash: string }>;
}
export function importKey(secret: unknown): Keypair {
  try {
    const value = typeof secret === "string" ? JSON.parse(secret) : null;
    if (
      !Array.isArray(value) ||
      value.length !== 64 ||
      value.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
    )
      throw new Error();
    return Keypair.fromSecretKey(Uint8Array.from(value));
  } catch {
    throw new TritonError(
      "WALLET_CREDENTIAL",
      "Wallet credential must contain a valid 64-byte Solana keypair JSON array.",
    );
  }
}
export function decodeTransaction(input: string): VersionedTransaction {
  try {
    const bytes = encoded(input);
    const tx = VersionedTransaction.deserialize(bytes);
    if (tx.version !== "legacy" && tx.version !== 0) throw new Error();
    if (!Buffer.from(tx.serialize()).equals(Buffer.from(bytes)))
      throw new Error();
    if (
      !tx.message.header.numRequiredSignatures ||
      tx.signatures.length !== tx.message.header.numRequiredSignatures
    )
      throw new Error();
    if (
      tx.message.header.numRequiredSignatures >
      tx.message.staticAccountKeys.length
    )
      throw new Error();
    return tx;
  } catch {
    throw new TritonError(
      "INVALID_TRANSACTION",
      "Provide a canonical legacy or v0 serialized Solana transaction within the 1232-byte limit.",
    );
  }
}
const absent = (sig: Uint8Array) => sig.every((v) => v === 0);
export function createWallet(
  publicAddress: unknown,
  expectedNetwork: unknown,
  mode: unknown,
  secret?: unknown,
): WalletCapability {
  const publicKey = address(publicAddress);
  const selected = network(expectedNetwork);
  if (mode !== "sign" && mode !== "alreadySigned" && mode !== "readOnly")
    throw new TritonError("WALLET_MODE", "Select a supported signing mode.");
  const keypair = mode === "sign" ? importKey(secret) : undefined;
  if (keypair && keypair.publicKey.toBase58() !== publicKey)
    throw new TritonError(
      "WALLET_MISMATCH",
      "Public Address does not match the selected wallet credential.",
    );
  return Object.freeze({
    kind: WALLET_KIND,
    publicAddress: publicKey,
    network: selected,
    mode,
    async prepare(input: string, rpcNetwork: Network) {
      if (mode === "readOnly")
        throw new TritonError(
          "WALLET_MODE",
          "This wallet is public-address-only. Select Sign Prepared Transaction and a matching credential to swap.",
        );
      if (rpcNetwork !== selected)
        throw new TritonError(
          "NETWORK_MISMATCH",
          "Wallet and Triton networks must match.",
          true,
        );
      const tx = decodeTransaction(input);
      const message = tx.message.serialize();
      const signers = tx.message.staticAccountKeys.slice(
        0,
        tx.message.header.numRequiredSignatures,
      );
      const position = signers.findIndex((k) => k.toBase58() === publicKey);
      if (position < 0)
        throw new TritonError(
          "WALLET_NOT_SIGNER",
          "Selected wallet is not a required signer of this transaction.",
        );
      for (let i = 0; i < signers.length; i++) {
        if (
          !absent(tx.signatures[i]) &&
          !ed25519.verify(tx.signatures[i], message, signers[i].toBytes(), {
            zip215: false,
          })
        )
          throw new TritonError(
            "INVALID_SIGNATURE",
            "Transaction contains an invalid existing signature.",
          );
      }
      if (keypair && absent(tx.signatures[position])) tx.sign([keypair]);
      for (let i = 0; i < signers.length; i++) {
        if (
          absent(tx.signatures[i]) ||
          !ed25519.verify(tx.signatures[i], message, signers[i].toBytes(), {
            zip215: false,
          })
        )
          throw new TritonError(
            "MISSING_SIGNATURE",
            "Every required signer must sign before submission.",
          );
      }
      if (!Buffer.from(message).equals(Buffer.from(tx.message.serialize())))
        throw new TritonError(
          "MESSAGE_CHANGED",
          "Signing changed the transaction message.",
        );
      return {
        transaction: Buffer.from(tx.serialize()).toString("base64"),
        signature: bs58.encode(tx.signatures[0]),
        blockhash: tx.message.recentBlockhash,
      };
    },
  });
}

// Resolve lookup tables before checking instruction program IDs. No SDK networking.
export async function validatePreparedTransaction(
  tx: VersionedTransaction,
  rpc: Rpc,
  commitment: string,
): Promise<void> {
  const tables: AddressLookupTableAccount[] = [];
  for (const lookup of tx.message.addressTableLookups) {
    const result = (await rpc("getAccountInfo", [
      lookup.accountKey.toBase58(),
      { encoding: "base64", commitment },
    ])) as { value?: { owner?: string; data?: unknown } };
    const account = result?.value;
    if (
      !account ||
      account.owner !== "AddressLookupTab1e1111111111111111111111111" ||
      !Array.isArray(account.data) ||
      account.data[1] !== "base64" ||
      typeof account.data[0] !== "string"
    )
      throw new TritonError(
        "LOOKUP_TABLE",
        "Address lookup table is missing or invalid.",
      );
    try {
      tables.push(
        new AddressLookupTableAccount({
          key: lookup.accountKey,
          state: AddressLookupTableAccount.deserialize(
            Buffer.from(account.data[0], "base64"),
          ),
        }),
      );
    } catch {
      throw new TritonError(
        "LOOKUP_TABLE",
        "Cannot decode the address lookup table.",
      );
    }
  }
  let keys;
  try {
    keys = tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
  } catch {
    throw new TritonError(
      "LOOKUP_TABLE",
      "Transaction references unavailable lookup indexes.",
    );
  }
  for (const instruction of tx.message.compiledInstructions) {
    const program = keys.get(instruction.programIdIndex);
    if (!program || instruction.accountKeyIndexes.some((i) => !keys.get(i)))
      throw new TritonError(
        "INVALID_TRANSACTION",
        "Transaction references an invalid account index.",
      );
    if (
      program.equals(PublicKey.default) &&
      instruction.data.length >= 4 &&
      Buffer.from(instruction.data).readUInt32LE(0) === 4
    )
      throw new TritonError(
        "DURABLE_NONCE_UNSUPPORTED",
        "Durable nonce transactions are not supported in this release.",
      );
  }
  const valid = (await rpc("isBlockhashValid", [
    tx.message.recentBlockhash,
    { commitment },
  ])) as { value?: boolean };
  if (valid?.value !== true)
    throw new TritonError(
      "BLOCKHASH_INVALID",
      "Recent blockhash is expired or invalid for this cluster. Prepare a new transaction explicitly.",
    );
}
