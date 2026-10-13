import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";
export class TritonOneSolanaApi implements ICredentialType {
  name = "tritonOneSolanaApi";
  displayName = "Triton One Solana API";
  documentationUrl = "https://docs.triton.one/getting-started";
  icon: Icon = {
    light: "file:../nodes/TarvosTritonOne/tarvosMark.light.svg",
    dark: "file:../nodes/TarvosTritonOne/tarvosMark.dark.svg",
  };
  properties: INodeProperties[] = [
    {
      displayName: "RPC Endpoint",
      name: "endpoint",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://your-endpoint.rpcpool.com/",
      description: "Clean HTTPS endpoint without a token in its path or query",
    },
    {
      displayName: "API Token",
      name: "apiToken",
      description:
        "Triton RPC access token for this endpoint. Store the token here rather than inside workflow parameters.",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
    },
    {
      displayName: "Expected Network",
      name: "network",
      description:
        "Expected Solana network. It must match the RPC endpoint and connected wallet; Titan swaps require Mainnet Beta.",
      type: "options",
      default: "devnet",
      options: [
        { name: "Devnet", value: "devnet" },
        { name: "Mainnet Beta", value: "mainnet" },
        { name: "Testnet", value: "testnet" },
      ],
    },
  ];
}
