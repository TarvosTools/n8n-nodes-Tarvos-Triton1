import { withHelp } from "../TarvosTritonOne/help";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import type {
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  INodeCredentialTestResult,
} from "n8n-workflow";
import { createWallet, importKey } from "./signing";
import { safeError } from "../TarvosTritonOne/errors";

async function testWallet(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  try {
    const key = importKey(credential.data?.secretKey);
    return {
      status: "OK",
      message: `Wallet public address: ${key.publicKey.toBase58()}`,
    };
  } catch {
    return {
      status: "Error",
      message: "Provide a valid 64-byte Solana keypair JSON array.",
    };
  }
}
export class TarvosSolanaWallet implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Solana Wallet",
    name: "tarvosSolanaWallet",
    icon: { light: "file:wallet.svg", dark: "file:wallet.svg" },
    group: ["transform"],
    version: 1,
    description: "Supply a Solana wallet to a Tarvos Triton transaction node",
    defaults: { name: "Solana Wallet" },
    subtitle: "={{$parameter.publicAddress}}",
    inputs: [],
    outputs: [
      {
        type: NodeConnectionTypes.AiTool,
        displayName: "Wallet",
        filter: { nodes: ["n8n-nodes-tarvos-triton-one.tarvosTritonOne"] },
      },
    ],
    credentials: [
      {
        name: "tarvosSolanaWalletApi",
        required: true,
        displayOptions: { show: { signingMode: ["sign"] } },
        testedBy: "testWallet",
      },
    ],
    properties: withHelp([
      {
        displayName:
          "Connect this node to the Wallet port beneath Triton. Quotes need only a public address and matching network. Swaps need Sign Prepared Transaction and a matching wallet credential; the key stays in this wallet node's credential.",
        name: "walletSetupHelp",
        type: "notice",
        default: "",
      },
      {
        displayName: "Public Address",
        name: "publicAddress",
        type: "string",
        default: "",
        required: true,
        description:
          "Public address of the required transaction signer; must match the credential when signing",
      },
      {
        displayName: "Expected Network",
        name: "network",
        type: "options",
        default: "devnet",
        options: [
          { name: "Devnet", value: "devnet" },
          { name: "Mainnet Beta", value: "mainnet" },
          { name: "Testnet", value: "testnet" },
        ],
      },
      {
        displayName: "Signing Mode",
        name: "signingMode",
        type: "options",
        default: "sign",
        options: [
          { name: "Sign Prepared Transaction", value: "sign" },
          { name: "Public Address Only (Quotes)", value: "readOnly" },
          {
            name: "Validate Already-Signed Transaction",
            value: "alreadySigned",
          },
        ],
      },
    ]),
  };
  methods = { credentialTest: { testWallet } };
  async supplyData(
    this: ISupplyDataFunctions,
    itemIndex: number,
  ): Promise<SupplyData> {
    try {
      const mode = this.getNodeParameter("signingMode", itemIndex, "sign");
      const secret =
        mode === "sign"
          ? (await this.getCredentials("tarvosSolanaWalletApi", itemIndex))
              .secretKey
          : undefined;
      const response = createWallet(
        this.getNodeParameter("publicAddress", itemIndex),
        this.getNodeParameter("network", itemIndex, "devnet"),
        mode,
        secret,
      );
      return { response };
    } catch (error) {
      throw new NodeOperationError(this.getNode(), safeError(error).message, {
        itemIndex,
      });
    }
  }
}
