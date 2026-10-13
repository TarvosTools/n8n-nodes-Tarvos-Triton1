import type { INodeProperties } from "n8n-workflow";

const fieldHelp: Record<string, string> = {
  resource:
    "Choose the type of Solana data or service to use. Each resource exposes its own operations.",
  operation:
    "Choose the action to perform for each incoming item. Fields below change to match this action.",
  addresses:
    'JSON array of base58 account or asset addresses, for example ["ADDRESS_1", "ADDRESS_2"]. Results follow the requested order.',
  signature:
    "Base58 transaction signature returned when a transaction was submitted. This is not a wallet address.",
  signatures:
    "JSON array of base58 transaction signatures whose statuses you want to check.",
  slot: "Solana slot number to query. A skipped slot may have no block.",
  accountEncoding:
    "Choose base64 for raw account bytes or jsonParsed for structured data where the provider supports parsing.",
  dataSlice:
    "Return only part of the account data to reduce the response size. Uses byte offset and length; requires base64 encoding.",
  offset: "Zero-based byte position at which the slice starts.",
  length: "Number of account-data bytes to return from the offset.",
  transactionEncoding:
    "Choose structured JSON, parsed JSON where supported, or encoded transaction bytes.",
  tokenFilter:
    "Find token accounts for the original SPL Token program, Token-2022, or one specific token mint.",
  mint: "Base58 mint address identifying a token. Use the mint, not a wallet or token-account address.",
  programFilters:
    "Restrict program-owned accounts by data size or by bytes at an offset. Multiple filters must all match.",
  kind: "Data Size matches the total account-data size; Memcmp compares bytes at a specific offset.",
  bytes:
    "Base58-encoded bytes to match at the chosen offset. Used only with Memcmp.",
  searchTransactionHistory:
    "Whether to search historical storage as well as the recent signature-status cache. Requires provider history support.",
  historyDetails:
    "Choose full transaction data or signatures only. Full results are larger.",
  sortOrder: "Choose whether older or newer records appear first.",
  historyFilters:
    "Narrow address history by transaction status, token accounts, slots, time or signature boundaries. Leave empty for no extra filters.",
  status: "Return successful transactions, failed transactions, or both.",
  tokenAccounts:
    "Choose whether history includes transactions involving token accounts associated with the address.",
  before:
    "Start with transactions older than this base58 signature. Leave blank for the newest available results.",
  until:
    "Stop history retrieval at this base58 signature. Leave blank for no lower signature boundary.",
  paginationToken:
    "Opaque continuation token from the previous history response. Leave blank to start a new query.",
  blockDetails:
    "Choose full transactions, signatures only, or no transaction details in the block response.",
  rewards: "Whether to include block reward information in the response.",
  message:
    "Base64-encoded Solana transaction message to estimate the network fee for. Supply the message, not a signed transaction.",
  writableAccounts:
    "Optional JSON array of writable account addresses to scope priority-fee samples to the relevant contention.",
  feeMode:
    "Use standard recent fee samples or Triton percentile estimates when your endpoint supports them.",
  percentile:
    "Percentile in hundredths of a percent: 5000 means the 50th percentile. Historical samples do not guarantee inclusion.",
  assetSort: "Set the indexed asset ordering for paginated results.",
  assetFilters:
    "Optional indexed asset filters. Add only the conditions needed for the selected operation.",
  ownerAddress: "Base58 public address of the asset owner.",
  creatorAddress: "Base58 creator address recorded in asset metadata.",
  authorityAddress: "Base58 address with authority over the asset.",
  compressed: "Whether the search should match compressed assets.",
  burnt: "Whether the search should match assets marked as burnt.",
  creatorVerified: "Whether the creator entry must be verified.",
  delegateAddress: "Base58 address of the delegated authority to match.",
  supplyMint: "Mint address used by the DAS supply filter.",
  royaltyTarget: "Royalty recipient address to match.",
  jsonUri: "Asset metadata JSON URI to match.",
  groupingKey:
    "Grouping category, such as collection. Use with Grouping Value.",
  groupingValue:
    "Group identifier, such as a collection mint address. Use with Grouping Key.",
  negate: "Whether to invert the combined asset search conditions.",
  frozen: "Whether to match frozen assets.",
  compressible: "Whether to match assets that can be compressed.",
  conditionType: "Choose how multiple asset search conditions are combined.",
  interface:
    "DAS asset interface/type to match, using the provider’s supported values.",
  ownerType: "Ownership model to match, such as single ownership.",
  royaltyTargetType: "Royalty target category supported by the DAS index.",
  supply: "Asset supply value to match in the DAS index.",
  royaltyAmount:
    "Royalty value to match using the DAS API’s royaltyAmount format.",
  tokenType:
    "Use All to include fungible and non-fungible assets. Provider Default leaves this filter unset.",
  mintAddress:
    "Base58 token mint address. This identifies the token, not its holder.",
  page: "One-based page number. Start at 1 and increment to retrieve later pages.",
  retrieval:
    "Return one page or continue through pages until the total limit or request budget is reached.",
  pageSize:
    "Maximum records requested per page. The provider may return fewer.",
  totalLimit:
    "Maximum records collected by this execution, across all fetched pages.",
  requestBudget:
    "Maximum provider requests allowed for this retrieval. Pagination stops when this budget is reached.",
  outputMode:
    "Return records as separate n8n items or retain the response envelope and pagination metadata.",
  preflightCommitment:
    "Network state used for the RPC preflight check before submission. This does not wait for final confirmation.",
  maxRetries:
    "Maximum RPC rebroadcast retries for this transaction. This is separate from n8n node retries; avoid automatic workflow retries after a send.",
  timeout:
    "Maximum time to wait for an individual provider request, in seconds.",
  dataSize:
    "Account-data size in bytes for which to calculate the rent-exempt balance.",
  startSlot: "First slot of the requested range.",
  endSlot: "Last slot of the requested range.",
  limit: "Maximum number of results to request for this operation.",
  blockhash: "Base58 recent blockhash to check for validity.",
  ids: "JSON array of base58 asset IDs for which to retrieve proofs.",
  id: "Base58 asset ID whose signatures you want to retrieve.",
  onlyVerified:
    "Whether to include only assets whose creator entry is verified.",
  transaction:
    "Base64-encoded Solana transaction bytes. For sending, the connected wallet signs or validates the transaction according to its signing mode.",
  bundleTransactions:
    "JSON array of base64-encoded transactions, in bundle order. This operation simulates them; it does not submit a bundle.",
  waitSeconds:
    "Maximum time to poll for the target confirmation level. A timeout does not mean the transaction failed.",
  targetCommitment:
    "Confirmation level to wait for: confirmed or finalized. Finalized provides stronger settlement assurance.",
  simulateFirst:
    "Whether to run a separate signed simulation before sending. A successful simulation does not guarantee the transaction will land.",
  forwardingPolicies:
    "Optional JSON array of up to 8 existing on-chain Yellowstone Shield policy addresses. These policies control transaction forwarding; they are not wallet addresses or API credentials. Leave empty (or [] in JSON mode) if you do not use Shield. This node does not create policies.",
  inputMint:
    "Mint address of the token to spend. Use the wrapped SOL mint for SOL routes supported by Titan.",
  outputMint: "Mint address of the token to receive.",
  titanAmount:
    "Exact input amount in the token’s smallest units, as an integer string. For a token with 6 decimals, 1000000 means 1 token.",
  slippageBps:
    "Maximum requested slippage in basis points. 50 means 0.5%; 100 means 1%.",
  titanPublicAddress:
    "Public wallet address used to generate quotes. Quotes do not require a signing credential or submit a transaction.",
  minimumOutput:
    "Minimum output in smallest units. Before signing, the actual Titan V2 instruction must enforce this floor and the slippage-adjusted quote. Unsupported layouts are rejected.",
  computeUnitPrice:
    "Priority-fee price per compute unit, in micro-lamports. Enter an integer string; 1000000 micro-lamports equals 1 lamport.",
  archiveAddress:
    "Base58 address whose transaction history should be exported.",
  archiveCursor:
    "Continuation token returned by the previous export. Leave blank to start a new export.",
  exportLimit:
    "Maximum history records to collect in this execution. Use the returned continuation token to continue.",
  maxBlocks:
    "Maximum blocks to export in this execution. Use nextStartSlot from the result to continue.",
  adminPage: "One-based page number for the management API listing.",
  adminPageSize: "Maximum management records requested per page.",
  workerAddress:
    "Base58 account address configured for Account Sync in your optional worker.",
  maxSlotLag:
    "Maximum permitted account lag relative to the RPC slot. Measured in slots, not seconds; stale buffered data triggers an RPC fallback.",
  consumer:
    "Consumer name configured in the optional worker. Each consumer has its own acknowledgement position.",
  eventLimit:
    "Maximum events to request in a worker batch. Unacknowledged batches are returned again.",
  network:
    "Expected Solana network. It must match the RPC endpoint and connected wallet; Titan swaps require Mainnet Beta.",
  signingMode:
    "Sign Prepared Transaction uses the wallet credential. Validate Already-Signed Transaction checks existing signatures without a private key. Titan swaps require signing mode.",
  source:
    "Choose the stream service available on your Triton subscription. Each service needs its corresponding endpoint and entitlement.",
  topic:
    "Choose what starts this workflow: account changes, program activity, logs, signature status, slots, blocks or transactions.",
  watchAddress:
    "Account address for Account; program ID for Program; mentioned account/program address for Logs or Block.",
  watchSignature:
    "Base58 transaction signature to monitor for the selected commitment level.",
  wsOptions:
    'JSON settings for the selected subscription, for example {"commitment":"confirmed"}. Commitment controls confirmation level; encoding controls returned data. Accepted fields depend on Subscription. These are not credentials.',
  batchSize:
    "Maximum events emitted together in one workflow execution. A partial batch is emitted when the flush interval expires.",
  flushMs:
    "Maximum batching interval in milliseconds. Lower values deliver events sooner but may create more workflow executions.",
  listenSeconds:
    "How long a manual test waits for events before stopping. Published workflows keep listening until deactivated or an error occurs.",
  slotGte:
    "Keep records whose slot number is greater than or equal to this value. Leave unset to omit this boundary.",
  slotGt:
    "Keep records whose slot number is greater than this value. Leave unset to omit this boundary.",
  slotLte:
    "Keep records whose slot number is less than or equal to this value. Leave unset to omit this boundary.",
  slotLt:
    "Keep records whose slot number is less than this value. Leave unset to omit this boundary.",
  slotEq:
    "Keep records whose slot number is equal to this value. Leave unset to omit this boundary.",
  blockTimeGte:
    "Keep records whose Unix timestamp in seconds is greater than or equal to this value. Leave unset to omit this boundary.",
  blockTimeGt:
    "Keep records whose Unix timestamp in seconds is greater than this value. Leave unset to omit this boundary.",
  blockTimeLte:
    "Keep records whose Unix timestamp in seconds is less than or equal to this value. Leave unset to omit this boundary.",
  blockTimeLt:
    "Keep records whose Unix timestamp in seconds is less than this value. Leave unset to omit this boundary.",
  blockTimeEq:
    "Keep records whose Unix timestamp in seconds is equal to this value. Leave unset to omit this boundary.",
  signatureGte:
    "Keep records whose signature history boundary is greater than or equal to this value. Leave unset to omit this boundary.",
  signatureGt:
    "Keep records whose signature history boundary is greater than this value. Leave unset to omit this boundary.",
  signatureLte:
    "Keep records whose signature history boundary is less than or equal to this value. Leave unset to omit this boundary.",
  signatureLt:
    "Keep records whose signature history boundary is less than this value. Leave unset to omit this boundary.",
  signatureEq:
    "Keep records whose signature history boundary is equal to this value. Leave unset to omit this boundary.",
};

export const resourceHelp: Record<string, string> = {
  account:
    "Read SOL balances and account data. Use program filters to narrow account scans.",
  token:
    "Read token balances, supply and token accounts by mint, owner or delegate. Amounts are returned without losing integer precision.",
  transaction:
    "Read transaction history, simulate, confirm or submit transactions. Sending requires the Solana Wallet connector below this node.",
  network:
    "Inspect Solana network health, slots, validators, leaders, supply and performance.",
  block:
    "Read blocks, block times and slot ranges. Skipped slots can have no block.",
  fee: "Estimate transaction fees and inspect recent priority-fee samples. Estimates do not guarantee inclusion.",
  digitalAsset:
    "Query indexed NFT and token metadata, ownership and proofs through DAS. Available data depends on your endpoint’s index.",
  titan:
    "Titan compares routes for exchanging tokens on Solana mainnet. A quote previews the exchange; a swap spends tokens through your connected Solana Wallet.",
  archive:
    "Export bounded pages of history or blocks. Use the returned continuation information for larger exports.",
  administration:
    "Read your Triton account, subscription, endpoint, token and watchlist records with a Management API credential. These operations do not change your account.",
  worker:
    "Read the optional self-hosted worker’s status, synced accounts or durable event batches. Acknowledge a batch only after downstream processing succeeds.",
};

/** Apply shared explanations to fields, including nested filter controls. */
export function withHelp(properties: INodeProperties[]): INodeProperties[] {
  for (const property of properties) {
    const key = property.name.replace(/^extra_/, "");
    if (property.type !== "notice") {
      property.description ??= fieldHelp[key];
      if (property.name === "titanAmount" || property.name === "wsOptions")
        property.description = fieldHelp[key];
      if (property.displayName === "Size / Offset")
        property.description =
          "For Data Size, enter the total account size in bytes. For Memcmp, enter the zero-based byte offset at which to compare.";
    }
    if (property.type === "collection")
      withHelp(property.options as INodeProperties[]);
    if (property.type === "fixedCollection") {
      for (const group of property.options ?? []) {
        if ("values" in group) withHelp(group.values);
      }
    }
    if (property.name === "resource") {
      for (const option of property.options ?? []) {
        if ("value" in option)
          option.description = resourceHelp[String(option.value)];
      }
    }
  }
  return properties;
}
