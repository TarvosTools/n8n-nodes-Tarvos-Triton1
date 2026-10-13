// SPDX-License-Identifier: AGPL-3.0-only
const {
  parseLosslessJson,
} = require("../dist/nodes/TarvosTritonOne/losslessJson");
const { address, atomic } = require("../dist/nodes/TarvosTritonOne/validation");
async function readExactAccount(
  endpoint,
  token,
  key,
  minContextSlot,
  fetchImpl = fetch,
) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", "x-token": token },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [
        key,
        { encoding: "base64", commitment: "confirmed", minContextSlot },
      ],
    }),
  });
  if (!response.ok) throw new Error("Exact account RPC failed");
  const body = parseLosslessJson(await response.text());
  const result = body.result;
  if (
    body.error ||
    !Number.isSafeInteger(result?.context?.slot) ||
    result.context.slot < minContextSlot
  )
    throw new Error("Exact account RPC did not satisfy freshness");
  const value = result.value;
  if (value === null) return { context: result.context, account: null };
  if (
    !value ||
    !Array.isArray(value.data) ||
    value.data[1] !== "base64" ||
    typeof value.data[0] !== "string" ||
    typeof value.executable !== "boolean"
  )
    throw new Error("Invalid exact account response");
  return {
    context: result.context,
    account: {
      ...value,
      owner: address(value.owner),
      lamports: atomic(value.lamports),
      rentEpoch: atomic(value.rentEpoch),
      data: { encoding: "base64", data: value.data[0] },
    },
  };
}
module.exports = { readExactAccount };
