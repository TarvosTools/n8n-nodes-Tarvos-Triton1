import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";
export class TritonStreamApi implements ICredentialType {
  name = "tritonStreamApi";
  displayName = "Triton Stream API";
  documentationUrl = "https://docs.triton.one/chains/solana/streaming";
  icon: Icon = {
    light: "file:../nodes/TarvosTritonOne/tarvosMark.light.svg",
    dark: "file:../nodes/TarvosTritonOne/tarvosMark.dark.svg",
  };
  properties: INodeProperties[] = [
    {
      displayName: "Stream Endpoint",
      name: "endpoint",
      type: "string",
      default: "",
      required: true,
      placeholder: "https://your-endpoint.rpcpool.com:443",
      description:
        "Clean TLS endpoint for the selected gRPC service; obtain the service-specific endpoint from Triton",
    },
    {
      displayName: "API Token",
      name: "apiToken",
      description:
        "Stream access token supplied by Triton for this service endpoint; sent as x-token metadata.",
      type: "string",
      default: "",
      required: true,
      typeOptions: { password: true },
    },
    {
      displayName: "Network Label",
      name: "network",
      type: "options",
      default: "mainnet",
      options: [
        { name: "Mainnet Beta", value: "mainnet" },
        { name: "Devnet", value: "devnet" },
        { name: "Testnet", value: "testnet" },
      ],
      description:
        "Labels events; streaming protocols do not provide a genesis-hash check",
    },
  ];
}
