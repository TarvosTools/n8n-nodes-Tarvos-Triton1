export const OPERATIONS = {
  account: {
    getBalance: "getBalance",
    get: "getAccountInfo",
    getMany: "getMultipleAccounts",
    getByProgram: "getProgramAccounts",
  },
  token: {
    getBalance: "getTokenAccountBalance",
    getSupply: "getTokenSupply",
    getByOwner: "getTokenAccountsByOwner",
    getByDelegate: "getTokenAccountsByDelegate",
    getLargestAccounts: "getTokenLargestAccounts",
  },
  transaction: {
    get: "getTransaction",
    getSignatures: "getSignaturesForAddress",
    getStatuses: "getSignatureStatuses",
    getHistory: "getTransactionsForAddress",
    submit: "sendTransaction",
  },
  network: {
    getSlot: "getSlot",
    getBlockHeight: "getBlockHeight",
    getEpochInfo: "getEpochInfo",
    getHealth: "getHealth",
    getVersion: "getVersion",
    getGenesisHash: "getGenesisHash",
    getLatestBlockhash: "getLatestBlockhash",
  },
  block: { get: "getBlock", getTime: "getBlockTime" },
  fee: {
    getRecentPriorityFees: "getRecentPrioritizationFees",
    getForMessage: "getFeeForMessage",
  },
  digitalAsset: {
    get: "getAsset",
    getMany: "getAssets",
    getByOwner: "getAssetsByOwner",
    search: "searchAssets",
    getProof: "getAssetProof",
    getTokenAccounts: "getTokenAccounts",
  },
} as const;
export const PAGINATED = [
  "transaction.getSignatures",
  "transaction.getHistory",
  "digitalAsset.getByOwner",
  "digitalAsset.search",
  "digitalAsset.getTokenAccounts",
];
export const COLLECTIONS = [
  ...PAGINATED,
  "account.getMany",
  "account.getByProgram",
  "token.getByOwner",
  "token.getByDelegate",
  "token.getLargestAccounts",
  "transaction.getStatuses",
  "fee.getRecentPriorityFees",
  "digitalAsset.getMany",
];
export const TOKEN_PROGRAMS = {
  spl: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
};
export function methodFor(
  resource: string,
  operation: string,
): string | undefined {
  if (!Object.hasOwn(OPERATIONS, resource)) return undefined;
  const operations = (OPERATIONS as Record<string, Record<string, string>>)[
    resource
  ];
  return Object.hasOwn(operations, operation)
    ? operations[operation]
    : undefined;
}
