import { createHash } from "crypto";
import type { ILoadOptionsFunctions, INodePropertyOptions } from "n8n-workflow";
import { createRpc } from "./transport";

// n8n 2.32's options renderer supports disabled=true on remotely loaded choices.
// Retain choices rather than silently substituting another operation.
export type AvailabilityOption = INodePropertyOptions & { disabled?: boolean };
const cache = new Map<string, { until: number; unsupported: boolean }>();
const optionalMethods: Record<string, string> = {
  "transaction.getHistory": "getTransactionsForAddress",
  "archive.exportAddressHistory": "getTransactionsForAddress",
  "token.getByMint": "getTokenAccountsByMint",
};
export async function availableChoices(
  context: ILoadOptionsFunctions,
  choices: INodePropertyOptions[],
  resource?: string,
): Promise<AvailabilityOption[]> {
  if (resource && ["worker", "administration"].includes(resource))
    return choices;
  let credentials: Record<string, unknown>;
  try {
    credentials = await context.getCredentials("tritonOneSolanaApi");
  } catch {
    return choices;
  }
  return Promise.all(
    choices.map(async (option) => {
      const titan =
        resource === "titan" || (!resource && option.value === "titan");
      if (titan && (credentials.network ?? "devnet") !== "mainnet")
        return {
          ...option,
          disabled: true,
          name: `${option.name} — Mainnet required`,
          description:
            "This implementation requires Mainnet for Titan. Your selected credential is not Mainnet; ordinary Devnet SOL is not a Titan swap sandbox.",
        };
      const method = resource
        ? optionalMethods[`${resource}.${option.value}`]
        : undefined;
      if (!method) return option;
      const identity = createHash("sha256")
        .update(
          JSON.stringify([credentials.endpoint, credentials.apiToken, method]),
        )
        .digest("hex");
      let entry = cache.get(identity);
      if (!entry || entry.until < Date.now()) {
        let unsupported = false;
        try {
          // An empty argument list is deliberate capability discovery: supported
          // methods may reject parameters, which must NOT disable the choice.
          await createRpc(context, credentials, 5000).rpc(method, []);
        } catch (error) {
          unsupported =
            (error as { code?: string }).code === "UNSUPPORTED_METHOD";
        }
        entry = { unsupported, until: Date.now() + 60000 };
        if (cache.size >= 200) cache.clear();
        cache.set(identity, entry);
      }
      return entry.unsupported
        ? {
            ...option,
            disabled: true,
            name: `${option.name} — unavailable on this endpoint`,
            description: `${method} returned Method not found for this credential. Change endpoint or refresh options after service enablement. Availability is cached for up to one minute.`,
          }
        : option;
    }),
  );
}
