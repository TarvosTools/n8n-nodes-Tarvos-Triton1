import {
  simpleTriggerProperties,
  setupExperience,
  quickParameters,
} from "../TarvosTritonOne/experience";
import {
  guidedProperties,
  modeFor,
  normalizeGuided,
} from "../TarvosTritonOne/guided";
import { withHelp } from "../TarvosTritonOne/help";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
} from "n8n-workflow";
import { envelope, openStream, type CloseStream } from "./streams";
import { integer, network, object } from "../TarvosTritonOne/validation";
import { safeError, TritonError } from "../TarvosTritonOne/errors";
import {
  createRpc,
  validateNetwork,
  testTritonCredential,
} from "../TarvosTritonOne/transport";

export class TarvosTritonTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Tarvos Triton 1 Trigger",
    name: "tarvosTritonTrigger",
    group: ["trigger"],
    version: [1, 1.1, 1.2],
    icon: {
      light: "file:../TarvosTritonOne/tarvosMark.light.svg",
      dark: "file:../TarvosTritonOne/tarvosMark.dark.svg",
    },
    subtitle:
      '={{$parameter.setupExperience === "simple" ? "Watch: " + $parameter.watchTask : $parameter.source}}',
    description: "Monitor Solana streams and Titan quotes",
    defaults: { name: "Tarvos Triton 1 Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "tritonOneSolanaApi",
        required: true,
        testedBy: "testTritonCredential",
        displayOptions: { show: { setupExperience: ["simple"] } },
      },
      {
        name: "tritonOneSolanaApi",
        required: true,
        testedBy: "testTritonCredential",
        displayOptions: {
          show: {
            source: ["whirligig", "titan"],
            setupExperience: ["advanced"],
          },
        },
      },
      {
        name: "tritonStreamApi",
        required: true,
        displayOptions: {
          show: { setupExperience: ["advanced"] },
          hide: { source: ["whirligig", "titan"] },
        },
      },
    ].flatMap((credential) => {
      const mode = credential.displayOptions.show?.setupExperience?.[0];
      return [
        credential,
        {
          ...credential,
          displayOptions: {
            ...credential.displayOptions,
            show: {
              ...credential.displayOptions.show,
              setupExperience: ["auto"],
              "@version": mode === "simple" ? [1.2] : [1, 1.1],
            },
          },
        },
      ];
    }).map((credential) => {
      // n8n treats option fields in credential `show` conditions as authentication
      // selectors and hides them. Keep the setup control in the node editor.
      const { setupExperience: modes, ...show } = credential.displayOptions.show;
      return {
        ...credential,
        displayOptions: {
          show,
          hide: {
            ...credential.displayOptions.hide,
            setupExperience: ["auto", "simple", "advanced"].filter(
              (mode) => !modes?.includes(mode),
            ),
          },
        },
      };
    }),
    properties: withHelp(
      simpleTriggerProperties(
        guidedProperties(
          [
            {
              displayName: "Service",
              name: "source",
              type: "options",
              default: "whirligig",
              noDataExpression: true,
              options: [
                { name: "BAM Preconfirmations", value: "bam" },
                { name: "Deshred (Provisional)", value: "deshred" },
                { name: "Dragon’s Mouth gRPC", value: "dragon" },
                { name: "Harmonic Preconfirmations", value: "harmonic" },
                { name: "Riptide gRPC (Mainnet)", value: "riptide" },
                { name: "Titan Quotes", value: "titan" },
                { name: "Vixen Parsed Programs", value: "vixen" },
                { name: "Whirligig WebSocket", value: "whirligig" },
              ],
            },
            {
              displayName:
                "Direct triggers are best-effort. Use the optional worker for durable ingestion. Reconnection can leave gaps; preconfirmations and deshred require later confirmation.",
              name: "deliveryNotice",
              type: "notice",
              default: "",
            },
            {
              displayName: "Subscription",
              name: "topic",
              type: "options",
              default: "account",
              displayOptions: { show: { source: ["whirligig"] } },
              options: [
                "account",
                "program",
                "logs",
                "signature",
                "slot",
                "block",
                "transaction",
              ].map((v) => ({
                name: v[0].toUpperCase() + v.slice(1),
                value: v,
              })),
            },
            {
              displayName: "Address",
              name: "watchAddress",
              type: "string",
              default: "",
              required: true,
              displayOptions: {
                show: {
                  source: ["whirligig"],
                  topic: ["account", "program", "logs", "block"],
                },
              },
            },
            {
              displayName: "Signature",
              name: "watchSignature",
              type: "string",
              default: "",
              required: true,
              displayOptions: {
                show: { source: ["whirligig"], topic: ["signature"] },
              },
            },
            {
              displayName: "Subscription Options",
              name: "wsOptions",
              type: "json",
              default: '{"commitment":"confirmed"}',
              displayOptions: {
                show: { source: ["whirligig"] },
                hide: { topic: ["slot"] },
              },
              description:
                "Documented method options; block and transaction subscriptions use maxSupportedTransactionVersion 1",
            },
            ...[
              {
                topics: ["account", "program"],
                text: 'Subscription Options: start with {"commitment":"confirmed"}. Use encoding "base64" for raw bytes or "jsonParsed" for parsed data. Optional dataSlice uses byte offset/length with base64; Program also accepts filters.',
              },
              {
                topics: ["logs"],
                text: 'Subscription Options: use {"commitment":"confirmed"}. Logs accepts only commitment: processed, confirmed or finalized. Processed events are provisional.',
              },
              {
                topics: ["signature"],
                text: 'Subscription Options: use {"commitment":"confirmed"}. You may also set "enableReceivedNotification":true to receive an initial received notification; received does not mean confirmed.',
              },
              {
                topics: ["block", "transaction"],
                text: 'Subscription Options accepts commitment, encoding, transactionDetails and showRewards. The node sets maxSupportedTransactionVersion to 1. Start with {"commitment":"confirmed"}; use the address or transaction filter to select activity.',
              },
            ].map(({ topics, text }) => ({
              displayName: text,
              name: "subscriptionHelp",
              type: "notice" as const,
              default: "",
              displayOptions: {
                show: { source: ["whirligig"], topic: topics },
              },
            })),
            {
              displayName: "Transaction Filter",
              name: "transactionFilter",
              type: "json",
              default:
                '{"vote":false,"failed":false,"accounts":{"include":[]}}',
              displayOptions: {
                show: { source: ["whirligig"], topic: ["transaction"] },
              },
              description: "Include a positive account or signature filter",
            },
            {
              displayName: "Yellowstone Subscribe Request",
              name: "grpcRequest",
              type: "json",
              default:
                '{"accounts":{"watched":{"account":[],"owner":[],"filters":[]}},"commitment":"CONFIRMED"}',
              displayOptions: {
                show: { source: ["dragon", "riptide", "deshred"] },
              },
              description:
                "Named filters using the official Yellowstone JSON schema. Deshred uses deshredTransactions and slots. Avoid unfiltered feeds in n8n.",
            },
            {
              displayName: "Allow Unfiltered Feed",
              name: "allowUnfiltered",
              type: "boolean",
              default: false,
              displayOptions: {
                show: { source: ["dragon", "riptide", "deshred"] },
              },
              description:
                "Whether to allow network-wide account/transaction feeds; prefer a worker for this volume",
            },
            {
              displayName: "Vixen Program Address",
              name: "vixenProgram",
              type: "string",
              default: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
              displayOptions: { show: { source: ["vixen"] } },
              description:
                "Supported programs include Token, Token22, Orca, Raydium, Meteora, Pump, Jupiter and Kamino; see the package service guide",
            },
            {
              displayName: "Preconfirmation Request",
              name: "preconfRequest",
              type: "json",
              default:
                '{"transactions":{"watched":{"accountInclude":[]}},"harmonicRegion":"HARMONIC_REGION_AMS"}',
              displayOptions: { show: { source: ["harmonic", "bam"] } },
              description:
                "Positive filters are required. BAM uses bamRegion, for example BAM_REGION_AMS. Filters match static account keys.",
            },
            ...[
              "inputMint",
              "outputMint",
              "titanAmount",
              "titanPublicAddress",
            ].map((name) => ({
              displayName: (
                {
                  inputMint: "Input Mint",
                  outputMint: "Output Mint",
                  titanAmount: "Input Amount (Atomic Units)",
                  titanPublicAddress: "Public Address",
                } as Record<string, string>
              )[name],
              name,
              type: "string" as const,
              default: "",
              required: true,
              displayOptions: { show: { source: ["titan"] } },
            })),
            {
              displayName: "Slippage (Basis Points)",
              name: "slippageBps",
              type: "number",
              default: 50,
              typeOptions: { minValue: 0, maxValue: 1000 },
              displayOptions: { show: { source: ["titan"] } },
            },
            {
              displayName: "Batch Size",
              name: "batchSize",
              type: "number",
              default: 100,
              typeOptions: { minValue: 1, maxValue: 1000 },
            },
            {
              displayName: "Flush Interval (Milliseconds)",
              name: "flushMs",
              type: "number",
              default: 1000,
              typeOptions: { minValue: 100, maxValue: 60000 },
            },
            {
              displayName: "Maximum Executions Per Minute",
              name: "executionLimit",
              type: "number",
              default: 60,
              typeOptions: { minValue: 1, maxValue: 600 },
              description:
                "Stops the trigger with an error when exceeded; use the worker for higher-volume ingestion",
            },
            {
              displayName: "Manual Listen Timeout (Seconds)",
              name: "listenSeconds",
              type: "number",
              default: 30,
              typeOptions: { minValue: 5, maxValue: 120 },
            },
          ],
          true,
        ),
      ),
    ),
  };
  methods = { credentialTest: { testTritonCredential } };
  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const setup = setupExperience(
      {
        ...this.getNode().parameters,
        setupExperience: this.getNodeParameter("setupExperience", "auto"),
      },
      this.getNode().typeVersion,
    );
    const source =
      setup === "simple"
        ? "whirligig"
        : String(this.getNodeParameter("source"));
    const credentials = await this.getCredentials(
      ["whirligig", "titan"].includes(source)
        ? "tritonOneSolanaApi"
        : "tritonStreamApi",
    );
    const cluster = network(credentials.network);
    if (source === "titan" && cluster !== "mainnet")
      throw new NodeOperationError(
        this.getNode(),
        "Titan requires a mainnet credential.",
      );
    if (["whirligig", "titan"].includes(source)) {
      const client = createRpc(this, credentials, 30000);
      await validateNetwork(client.rpc, cluster);
    }
    const p: Record<string, unknown> = {};
    p.inputMode = modeFor(
      this.getNode().parameters ?? {},
      this.getNode().typeVersion,
    );
    if (setup === "simple")
      Object.assign(
        p,
        quickParameters(
          this.getNodeParameter("watchTask", "wallet"),
          this.getNodeParameter("simpleAddress", ""),
          this.getNodeParameter("simpleSignature", ""),
        ),
      );
    else
      for (const field of new TarvosTritonTrigger().description.properties) {
        if (
          ["inputMode", "setupExperience"].includes(field.name) ||
          field.type === "notice"
        )
          continue;
        const show = field.displayOptions?.show;
        if (
          show &&
          Object.entries(show).some(
            ([name, values]) =>
              values &&
              !values.includes(
                (name === "setupExperience"
                  ? setup
                  : name === "inputMode"
                    ? p.inputMode
                    : this.getNodeParameter(name, "")) as string,
              ),
          )
        )
          continue;
        p[field.name] = this.getNodeParameter(field.name, field.default);
      }
    normalizeGuided(p, true);
    const batchSize = integer(p.batchSize, "Batch size", 1, 1000),
      flushMs = integer(p.flushMs, "Flush interval", 100, 60000),
      limit = integer(p.executionLimit, "Execution limit", 1, 600);
    const manual = this.getMode() === "manual";
    let stopped = false,
      closeStream: CloseStream = () => {},
      timer: ReturnType<typeof setInterval> | undefined,
      timeout: ReturnType<typeof setTimeout> | undefined;
    let queue: IDataObject[] = [],
      windowStart = Date.now(),
      executions = 0;
    const close = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      closeStream();
      queue = [];
    };
    const fail = (error: Error) => {
      if (stopped) return;
      const failure = safeError(error);
      close();
      this.emitError(
        new NodeOperationError(
          this.getNode(),
          `${failure.code}: ${failure.message}`,
        ),
      );
    };
    const flush = () => {
      if (stopped || !queue.length) return;
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        executions = 0;
      }
      if (++executions > limit) {
        fail(
          new TritonError(
            "STREAM_RATE_LIMIT",
            "Execution limit exceeded. Use a narrower filter or the durable worker; a data gap may have occurred.",
          ),
        );
        return;
      }
      const batch = queue;
      queue = [];
      this.emit([batch.map((json) => ({ json }))]);
      if (manual) close();
    };
    const start = async () => {
      if (stopped) return;
      let commitment: unknown = "unspecified";
      if (source === "whirligig" && p.topic !== "slot")
        commitment = object(p.wsOptions, "Options").commitment ?? "finalized";
      if (["dragon", "riptide"].includes(source))
        commitment = object(p.grpcRequest, "Request").commitment ?? "processed";
      try {
        const handle = await openStream(
          source,
          credentials,
          p,
          (data) => {
            if (stopped) return;
            queue.push(
              envelope(source, data, cluster, commitment) as IDataObject,
            );
            if (queue.length >= batchSize) flush();
          },
          fail,
        );
        closeStream = handle;
        if (stopped) {
          handle();
          return;
        }
        timer = setInterval(flush, flushMs);
        if (manual)
          timeout = setTimeout(
            () =>
              fail(
                new TritonError(
                  "STREAM_TIMEOUT",
                  "No matching event before the manual listen timeout.",
                ),
              ),
            integer(p.listenSeconds, "Listen timeout", 5, 120) * 1000,
          );
      } catch (error) {
        fail(error as Error);
      }
    };
    if (!manual) await start();
    return {
      closeFunction: async () => close(),
      ...(manual ? { manualTriggerFunction: start } : {}),
    };
  }
}
