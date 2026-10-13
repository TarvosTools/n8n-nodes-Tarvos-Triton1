import { NodeConnectionTypes } from "n8n-workflow";
import type { IExecuteFunctions, IDataObject } from "n8n-workflow";
import {
  WALLET_KIND,
  decodeTransaction,
  validatePreparedTransaction,
  type WalletCapability,
} from "../TarvosSolanaWallet/signing";
import {
  address,
  choice,
  integer,
  json,
  text,
  type Network,
} from "./validation";
import { safeError, TritonError } from "./errors";
import type { Parameters, ReadResult } from "./operations";
import type { Rpc } from "./transport";

export async function getWallet(
  context: IExecuteFunctions,
  index: number,
  network: Network,
): Promise<WalletCapability> {
  const parents = context.getParentNodes(context.getNode().name, {
    connectionType: NodeConnectionTypes.AiTool,
    depth: 1,
  });
  if (
    parents.length !== 1 ||
    parents[0].type !== "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet"
  )
    throw new TritonError(
      "WALLET_REQUIRED",
      "Connect exactly one Solana Wallet beneath this node.",
    );
  const wallet = (await context.getInputConnectionData(
    NodeConnectionTypes.AiTool,
    index,
  )) as WalletCapability;
  if (wallet?.kind !== WALLET_KIND || typeof wallet.prepare !== "function")
    throw new TritonError("WALLET_REQUIRED", "Invalid wallet connection.");
  if (wallet.network !== network)
    throw new TritonError(
      "NETWORK_MISMATCH",
      "Wallet and Triton networks must match.",
      true,
    );
  return wallet;
}
export async function submit(
  context: IExecuteFunctions,
  index: number,
  p: Parameters,
  rpc: Rpc,
  network: Network,
  beforeSend?: () => Promise<void>,
): Promise<ReadResult> {
  if (context.getNode().retryOnFail)
    throw new TritonError(
      "UNSAFE_RETRY",
      "Disable Retry on Fail for submission. Reconcile the known signature before an explicit identical-payload retry.",
    );
  const parents = context.getParentNodes(context.getNode().name, {
    connectionType: NodeConnectionTypes.AiTool,
    depth: 1,
  });
  if (
    parents.length !== 1 ||
    parents[0].type !== "n8n-nodes-tarvos-triton-one.tarvosSolanaWallet"
  )
    throw new TritonError(
      "WALLET_REQUIRED",
      "Connect exactly one Solana Wallet beneath this node.",
    );
  const wallet = (await context.getInputConnectionData(
    NodeConnectionTypes.AiTool,
    index,
  )) as WalletCapability;
  if (
    !wallet ||
    wallet.kind !== WALLET_KIND ||
    typeof wallet.prepare !== "function"
  )
    throw new TritonError(
      "WALLET_REQUIRED",
      "Connected sub-node is not a Solana Wallet.",
    );
  if (wallet.network !== network)
    throw new TritonError(
      "NETWORK_MISMATCH",
      "Wallet and Triton networks must match.",
      true,
    );
  const input = text(p.transaction, "Prepared transaction");
  const commitment = choice(
    p.preflightCommitment ?? "confirmed",
    ["confirmed", "finalized"],
    "Preflight commitment",
  );
  const maxRetries = integer(p.maxRetries ?? 0, "RPC retries", 0, 5);
  const minContextSlot =
    p.minContextSlot !== "" && p.minContextSlot !== undefined
      ? integer(p.minContextSlot, "Minimum context slot")
      : undefined;
  await validatePreparedTransaction(decodeTransaction(input), rpc, commitment);
  const prepared = await wallet.prepare(input, network);
  if (p.simulateFirst === true) {
    const simulation = (await rpc("simulateTransaction", [
      prepared.transaction,
      { encoding: "base64", commitment, sigVerify: true },
    ])) as { value?: { err?: unknown } };
    if (!simulation?.value || simulation.value.err !== null)
      throw new TritonError(
        "SIMULATION_FAILED",
        "Signed transaction simulation failed; nothing was submitted.",
      );
  }
  const forwardingPolicies = p.forwardingPolicies
    ? json(p.forwardingPolicies, "Shield policies")
    : [];
  if (!Array.isArray(forwardingPolicies) || forwardingPolicies.length > 8)
    throw new TritonError(
      "INVALID_INPUT",
      "Provide at most eight Shield policy addresses.",
    );
  forwardingPolicies.forEach(address);
  const options = {
    encoding: "base64",
    skipPreflight: p.simulateFirst === true,
    preflightCommitment: commitment,
    maxRetries,
    ...(forwardingPolicies.length ? { forwardingPolicies } : {}),
    ...(minContextSlot !== undefined ? { minContextSlot } : {}),
  };
  if (beforeSend) await beforeSend();
  try {
    const result = await rpc("sendTransaction", [
      prepared.transaction,
      options,
    ]);
    if (result !== prepared.signature)
      throw new TritonError(
        "SIGNATURE_MISMATCH",
        "RPC returned an unexpected signature.",
      );
  } catch (error) {
    const failure = safeError(error);
    if (
      [
        "TRANSPORT_ERROR",
        "INVALID_RESPONSE",
        "RESPONSE_TOO_LARGE",
        "UNSAFE_NUMBER",
        "SIGNATURE_MISMATCH",
        "INTERNAL_ERROR",
      ].includes(failure.code)
    ) {
      throw new TritonError(
        "SUBMISSION_OUTCOME_UNKNOWN",
        "Submission outcome is unknown. Check this signature before resending identical signed bytes.",
        true,
        { signature: prepared.signature, network },
      );
    }
    throw new TritonError(failure.code, failure.message, failure.stop, {
      ...failure.details,
      signature: prepared.signature,
      network,
    });
  }
  const meta: IDataObject = {
    method: "sendTransaction",
    walletPublicAddress: wallet.publicAddress,
    requestedCommitment: commitment,
  };
  return {
    data: {
      signature: prepared.signature,
      submissionStatus: "accepted",
      confirmationStatus: "unknown",
    },
    meta,
  };
}
