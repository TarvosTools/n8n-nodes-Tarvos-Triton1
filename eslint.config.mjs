import { configWithoutCloudSupport } from "@n8n/node-cli/eslint";
export default [
  ...configWithoutCloudSupport,
  { ignores: ["worker/**", "dist/**"] },
  // Stream credentials are protocol-specific; activation validates access to the selected service.
  {
    files: ["credentials/TritonStreamApi.credentials.ts"],
    rules: { "@n8n/community-nodes/credential-test-required": "off" },
  },
  // Self-hosted signing intentionally ships pinned cryptographic dependencies.
  {
    files: ["package.json"],
    rules: { "@n8n/community-nodes/no-runtime-dependencies": "off" },
  },
  // Internal domain errors carry safe codes; node entry points convert to NodeOperationError.
  {
    files: [
      "nodes/**/signing.ts",
      "nodes/**/losslessJson.ts",
      "nodes/**/transport.ts",
      "nodes/**/submission.ts",
      "nodes/**/services.ts",
      "nodes/**/serviceCredentials.ts",
    ],
    rules: { "@n8n/community-nodes/require-node-api-error": "off" },
  },
  // A signing capability must not be automatically exposed as an AI-agent tool.
  {
    files: ["nodes/**/*.node.ts"],
    rules: { "@n8n/community-nodes/node-usable-as-tool": "off" },
  },
  // Credential-test contexts in n8n-workflow 2.16 expose request(), not httpRequest().
  {
    files: ["nodes/**/transport.ts", "nodes/**/serviceCredentials.ts"],
    rules: { "@n8n/community-nodes/no-deprecated-workflow-functions": "off" },
  },
  // These constants are public Solana program IDs, not credentials.
  {
    files: ["nodes/**/apiContract.ts", "nodes/**/guided.ts"],
    rules: { "@n8n/community-nodes/no-hardcoded-secrets": "off" },
  },
  // The shared field() factory supplies defaults; metadata tests verify all expanded fields.
  {
    files: [
      "nodes/**/descriptions.ts",
      "nodes/**/expanded.ts",
      "nodes/**/guided.ts",
      "nodes/**/experience.ts",
      "nodes/**/tradeExperience.ts",
    ],
    rules: { "n8n-nodes-base/node-param-default-missing": "off" },
  },
];
