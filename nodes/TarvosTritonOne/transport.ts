import type {
  IHttpRequestOptions,
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  INodeCredentialTestResult,
} from "n8n-workflow";
import { GENESIS, endpoint, network, text, type Network } from "./validation";
import { TritonError } from "./errors";
import { parseLosslessJson } from "./losslessJson";

export type Rpc = (
  method: string,
  params?: unknown[] | Record<string, unknown>,
) => Promise<unknown>;
type HttpContext = {
  helpers: { httpRequest: (options: IHttpRequestOptions) => Promise<unknown> };
};
export function createRpc(
  context: HttpContext,
  credentials: Record<string, unknown>,
  timeout = 30000,
): { rpc: Rpc; network: Network } {
  const url = endpoint(credentials.endpoint);
  const token = text(credentials.apiToken, "API token");
  if (/[\r\n]/.test(String(credentials.apiToken)))
    throw new TritonError(
      "CREDENTIAL_ERROR",
      "API token contains invalid characters.",
      true,
    );
  const selected = network(credentials.network);
  let sequence = 0;
  const rpc: Rpc = async (method, params = []) => {
    const id = `tarvos-${++sequence}`;
    let response: unknown;
    try {
      response = await context.helpers.httpRequest({
        method: "POST",
        url,
        headers: {
          "x-token": token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        json: false,
        encoding: "text",
        timeout,
        disableFollowRedirect: true,
      });
    } catch (error: unknown) {
      const raw = error as {
        statusCode?: number;
        response?: { status?: number; headers?: Record<string, string> };
      };
      const status = raw?.statusCode ?? raw?.response?.status;
      if (status === 429) {
        const header = raw?.response?.headers?.["retry-after"];
        const seconds = header
          ? Number(header) ||
            Math.ceil((Date.parse(header) - Date.now()) / 1000)
          : 10;
        throw new TritonError(
          "RATE_LIMIT",
          "Triton rate limit reached. Pause all requests sharing this egress IP.",
          true,
          {
            retryAfterSeconds: Math.max(
              10,
              Number.isFinite(seconds) ? seconds : 10,
            ),
          },
        );
      }
      if (status === 401 || status === 403)
        throw new TritonError(
          "CREDENTIAL_ERROR",
          "Triton rejected the API credential or endpoint access.",
          true,
        );
      if (status === 410)
        throw new TritonError(
          "UNSUPPORTED_METHOD",
          "This method is disabled on the configured endpoint.",
        );
      throw new TritonError(
        "TRANSPORT_ERROR",
        "Triton request failed or timed out. No automatic retry was attempted.",
        false,
        { ...(status ? { httpStatus: status } : {}) },
      );
    }
    if (typeof response !== "string")
      throw new TritonError(
        "INVALID_RESPONSE",
        "Expected raw JSON text; refusing potentially rounded response data.",
      );
    if (Buffer.byteLength(response, "utf8") > 16 * 1024 * 1024)
      throw new TritonError(
        "RESPONSE_TOO_LARGE",
        "Response exceeds the 16 MiB parsing limit. Narrow the query.",
      );
    const body = parseLosslessJson(response) as Record<string, unknown>;
    if (
      !body ||
      body.jsonrpc !== "2.0" ||
      body.id !== id ||
      "result" in body === "error" in body
    )
      throw new TritonError(
        "INVALID_RESPONSE",
        "Invalid JSON-RPC response envelope or request ID.",
      );
    if ("error" in body) {
      const rpcCode = (body.error as { code?: number })?.code;
      throw new TritonError(
        rpcCode === -32601 ? "UNSUPPORTED_METHOD" : "RPC_ERROR",
        rpcCode === -32601
          ? "This endpoint does not support the requested method."
          : "Triton rejected the request. Check method parameters, capability and transaction preflight.",
        false,
        typeof rpcCode === "number" ? { rpcCode } : {},
      );
    }
    return body.result;
  };
  return { rpc, network: selected };
}
export async function validateNetwork(
  rpc: Rpc,
  selected: Network,
): Promise<void> {
  if ((await rpc("getGenesisHash")) !== GENESIS[selected])
    throw new TritonError(
      "NETWORK_MISMATCH",
      "The RPC endpoint does not match the expected Solana network.",
      true,
    );
}
export async function testTritonCredential(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  try {
    const client = createRpc(
      {
        helpers: {
          httpRequest: (options) =>
            this.helpers.request({
              uri: options.url,
              method: options.method,
              headers: options.headers,
              body: options.body,
              json: false,
              encoding: "utf8",
              timeout: options.timeout,
              followRedirect: false,
              followAllRedirects: false,
            }),
        },
      },
      credential.data ?? {},
    );
    await client.rpc("getVersion");
    await validateNetwork(client.rpc, client.network);
    return {
      status: "OK",
      message: "Triton RPC access and expected network verified.",
    };
  } catch {
    return {
      status: "Error",
      message:
        "Check the clean Triton endpoint, API token and expected network.",
    };
  }
}
