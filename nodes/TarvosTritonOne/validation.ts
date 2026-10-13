import bs58 from "bs58";
import { TritonError } from "./errors";

export const GENESIS = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
} as const;
export type Network = keyof typeof GENESIS;
export function fail(message: string): never {
  throw new TritonError("INVALID_INPUT", message);
}
export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    return fail(`${label} is required.`);
  return value.trim();
}
export function base58(value: unknown, length: number, label: string): string {
  const result = text(value, label);
  if (result.length > 100) return fail(`${label} has an invalid length.`);
  try {
    if (bs58.decode(result).length === length) return result;
  } catch {
    /* sanitized below */
  }
  return fail(`${label} must be a base58 value decoding to ${length} bytes.`);
}
export const address = (v: unknown) => base58(v, 32, "Public address");
export const signature = (v: unknown) => base58(v, 64, "Signature");
export function integer(
  value: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value === "bigint" &&
    value >= 0n &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  )
    value = Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    return fail(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
export function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    return fail(`${label} is not supported.`);
  return value as T;
}
export function network(value: unknown): Network {
  return choice(value, ["mainnet", "devnet", "testnet"], "Network");
}
export function json(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fail(`${label} must be valid JSON.`);
  }
}
export function object(value: unknown, label: string): Record<string, unknown> {
  const parsed = json(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return fail(`${label} must be an object.`);
  return parsed as Record<string, unknown>;
}
export function array(value: unknown, label: string, max = 10000): unknown[] {
  const parsed = json(value, label);
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > max)
    return fail(`${label} must be a nonempty array of at most ${max} values.`);
  return parsed;
}
export function encoded(value: unknown, label = "Transaction"): Uint8Array {
  const input = text(value, label);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input,
    )
  )
    return fail(`${label} must use canonical base64 encoding.`);
  const bytes = Buffer.from(input, "base64");
  if (
    !bytes.length ||
    bytes.length > 1232 ||
    bytes.toString("base64") !== input
  )
    return fail(`${label} must contain 1–1232 bytes.`);
  return bytes;
}
export function endpoint(value: unknown): string {
  const input = text(value, "RPC endpoint");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail("RPC endpoint must be a clean Triton HTTPS URL.");
  }
  // Header-auth endpoints only. Never accept arbitrary paths that could contain tokens.
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".rpcpool.com") ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    return fail(
      "Use a clean https://customer.rpcpool.com/ endpoint with a separate API token.",
    );
  return url.href;
}
export function atomic(value: unknown): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return fail("Provider returned an invalid atomic amount.");
}
export function sol(value: unknown): string {
  const digits = atomic(value).padStart(10, "0");
  return `${digits.slice(0, -9)}.${digits.slice(-9)}`.replace(/\.?0+$/, "");
}
