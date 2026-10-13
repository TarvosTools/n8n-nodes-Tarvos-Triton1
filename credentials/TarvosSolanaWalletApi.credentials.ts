import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";
export class TarvosSolanaWalletApi implements ICredentialType {
  name = "tarvosSolanaWalletApi";
  displayName = "Solana Wallet API";
  documentationUrl = "https://solana.com/docs/core/accounts";
  icon: Icon = {
    light: "file:../nodes/TarvosSolanaWallet/wallet.svg",
    dark: "file:../nodes/TarvosSolanaWallet/wallet.svg",
  };
  properties: INodeProperties[] = [
    {
      displayName: "Secret Key (JSON Array)",
      name: "secretKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "Solana 64-byte keypair as a JSON integer array. Stored encrypted by n8n. Never enter a seed phrase.",
    },
  ];
}
