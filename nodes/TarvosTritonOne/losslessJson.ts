import { TritonError } from "./errors";
export function parseLosslessJson(input: string): unknown {
  const protectedText = input.replace(
    /"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token) => {
      if (token.startsWith('"')) return token;
      if (/^-?\d+$/.test(token)) {
        const value = BigInt(token);
        if (
          value > BigInt(Number.MAX_SAFE_INTEGER) ||
          value < BigInt(Number.MIN_SAFE_INTEGER)
        )
          return JSON.stringify(token);
      } else if (
        !Number.isFinite(Number(token)) ||
        (Number.isInteger(Number(token)) &&
          !Number.isSafeInteger(Number(token)))
      ) {
        throw new TritonError(
          "UNSAFE_NUMBER",
          "Provider returned an unsafe numeric encoding.",
        );
      }
      return token;
    },
  );
  try {
    return JSON.parse(protectedText);
  } catch {
    throw new TritonError(
      "INVALID_RESPONSE",
      "Provider returned malformed JSON.",
    );
  }
}
