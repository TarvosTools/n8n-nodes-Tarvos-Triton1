import type { ICredentialType, INodeProperties, Icon } from "n8n-workflow";
export class TritonManagementApi implements ICredentialType {
  name = "tritonManagementApi";
  displayName = "Triton Management API";
  documentationUrl =
    "https://docs.triton.one/account-management/api-access/auth-and-headers";
  icon: Icon = {
    light: "file:../nodes/TarvosTritonOne/tarvosMark.light.svg",
    dark: "file:../nodes/TarvosTritonOne/tarvosMark.dark.svg",
  };
  properties: INodeProperties[] = [
    {
      displayName: "Management Token",
      name: "apiToken",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Separate account-management token; not your RPC token",
    },
  ];
}
