import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";
export class TritonWorkerApi implements ICredentialType {
  name = "tritonWorkerApi";
  displayName = "Triton Worker API";
  documentationUrl = "https://tarvos.tools/nodes/triton-1/";
  icon: Icon = {
    light: "file:../nodes/TarvosTritonOne/tarvosMark.light.svg",
    dark: "file:../nodes/TarvosTritonOne/tarvosMark.dark.svg",
  };
  properties: INodeProperties[] = [
    {
      displayName: "Worker Endpoint",
      name: "endpoint",
      description:
        "Base URL of your optional worker. Use HTTPS remotely; HTTP is permitted only for loopback. In containers, localhost means that container.",
      type: "string",
      default: "http://127.0.0.1:5690/",
      required: true,
    },
    {
      displayName: "Worker Token",
      name: "apiToken",
      description:
        "Bearer token configured on your worker (at least 32 characters). This is the worker token, not your Triton RPC token.",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
    },
  ];
}
