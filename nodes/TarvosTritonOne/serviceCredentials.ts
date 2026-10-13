import type {
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  INodeCredentialTestResult,
} from "n8n-workflow";
import { text } from "./validation";
export function workerEndpoint(value: unknown): URL {
  const url = new URL(text(value, "Worker endpoint"));
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      ))
  )
    throw new Error("Use HTTPS remotely or HTTP on loopback");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
export async function testManagementCredential(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  try {
    await this.helpers.request({
      method: "GET",
      uri: "https://customers.triton.one/api/v1/accounts",
      qs: { page: 1, per: 1 },
      headers: { Authorization: text(credential.data?.apiToken, "Token") },
      json: true,
      timeout: 15000,
      followRedirect: false,
      followAllRedirects: false,
    });
    return {
      status: "OK",
      message:
        "Management API read access verified; writes still depend on your role.",
    };
  } catch {
    return {
      status: "Error",
      message: "Management authentication or account-list permission failed.",
    };
  }
}
export async function testWorkerCredential(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  try {
    const response = await this.helpers.request({
      method: "GET",
      uri: new URL("status", workerEndpoint(credential.data?.endpoint)).href,
      headers: {
        Authorization: `Bearer ${text(credential.data?.apiToken, "Token")}`,
      },
      json: true,
      timeout: 15000,
      followRedirect: false,
      followAllRedirects: false,
    });
    if (response?.schemaVersion !== 1) throw new Error("Unexpected worker");
    return {
      status: "OK",
      message:
        "Worker authentication verified. Inspect Get Status for source health.",
    };
  } catch {
    return {
      status: "Error",
      message: "Worker authentication or health endpoint failed.",
    };
  }
}
