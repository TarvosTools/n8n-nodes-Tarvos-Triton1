import { createRequire } from "module";
import { dirname, join } from "path";
import type { MethodDefinition } from "@grpc/grpc-js";
const load = createRequire(__filename);
// The pinned SDK's root eagerly loads native bindings (not published for Windows).
// Resolve, but do not evaluate, that entry and load only its official generated codec.
export function yellowstoneSchema(): typeof import("@triton-one/yellowstone-grpc") {
  return load(
    join(
      dirname(load.resolve("@triton-one/yellowstone-grpc")),
      "grpc",
      "geyser.js",
    ),
  );
}
interface Codec<T> {
  encode(value: T): { finish(): Uint8Array };
  decode(value: Uint8Array): T;
  fromJSON(value: unknown): T;
}
function definition<Request, Response>(
  name: string,
  request: Codec<Request>,
  response: Codec<Response>,
): MethodDefinition<Request, Response> {
  return {
    path: "/geyser.Geyser/" + name,
    requestStream: true,
    responseStream: true,
    requestSerialize: (value) => Buffer.from(request.encode(value).finish()),
    requestDeserialize: (value) => request.decode(value),
    responseSerialize: (value) => Buffer.from(response.encode(value).finish()),
    responseDeserialize: (value) => response.decode(value),
  };
}
export function yellowstoneDefinition(deshred = false) {
  const sdk = yellowstoneSchema();
  return deshred
    ? definition(
        "SubscribeDeshred",
        sdk.SubscribeDeshredRequest,
        sdk.SubscribeUpdateDeshred,
      )
    : definition("Subscribe", sdk.SubscribeRequest, sdk.SubscribeUpdate);
}
