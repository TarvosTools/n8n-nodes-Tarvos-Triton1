import { normalizeTrade } from "./tradeExperience";
import { availableChoices } from "./availability";
import { modeFor, normalizeGuided } from "./guided";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import type {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
  ILoadOptionsFunctions,
  INodePropertyOptions,
} from "n8n-workflow";
import { properties, defaults } from "./descriptions";
import { createRpc, testTritonCredential, validateNetwork } from "./transport";
import { executeRead, records } from "./operations";
import { safeError } from "./errors";
import { COLLECTIONS } from "./apiContract";
import { integer } from "./validation";
import { submit } from "./submission";
import { EXTRA, executeExtra } from "./expanded";
import { SERVICES, executeService } from "./services";
import {
  testManagementCredential,
  testWorkerCredential,
} from "./serviceCredentials";

export class TarvosTritonOne implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Tarvos Triton 1",
    name: "tarvosTritonOne",
    icon: {
      light: "file:tarvosMark.light.svg",
      dark: "file:tarvosMark.dark.svg",
    },
    group: ["transform"],
    version: [1, 1.1, 1.2, 1.3],
    description:
      "Read and monitor Solana data, or submit a transaction with a connected wallet",
    defaults: { name: "Tarvos Triton 1" },
    subtitle: '={{$parameter.operation + ": " + $parameter.resource}}',
    inputs:
      '={{ (($parameter.resource === "transaction" && ["submit", "submitCascade"].includes($parameter.operation)) || ($parameter.resource === "titan" && ($parameter.operation === "swap" || ($parameter.operation === "quote" && $parameter.quoteWallet === "wallet")))) ? [{type: "main"}, {type: "ai_tool", displayName: "Wallet", required: true, maxConnections: 1, filter: {nodes: ["n8n-nodes-tarvos-triton-one.tarvosSolanaWallet"]} }] : ["main"] }}',
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "tritonOneSolanaApi",
        required: true,
        testedBy: "testTritonCredential",
        displayOptions: { hide: { resource: ["administration", "worker"] } },
      },
      {
        name: "tritonManagementApi",
        required: true,
        testedBy: "testManagementCredential",
        displayOptions: { show: { resource: ["administration"] } },
      },
      {
        name: "tritonWorkerApi",
        required: true,
        testedBy: "testWorkerCredential",
        displayOptions: { show: { resource: ["worker"] } },
      },
    ],
    properties,
  };
  methods = {
    loadOptions: {
      async resourceChoices(this: ILoadOptionsFunctions) {
        const options = properties.find((p) => p.name === "resource")
          ?.options as INodePropertyOptions[];
        return availableChoices(this, options);
      },
      async operationChoices(this: ILoadOptionsFunctions) {
        const resource = String(this.getNodeParameter("resource"));
        const options = properties.find(
          (p) =>
            p.name === "operation" &&
            p.displayOptions?.show?.resource?.includes(resource),
        )?.options as INodePropertyOptions[];
        return availableChoices(this, options ?? [], resource);
      },
    },
    credentialTest: {
      testTritonCredential,
      testManagementCredential,
      testWorkerCredential,
    },
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    // Credentials are static per execution; each item still has its own request fields.
    const localService = ["administration", "worker"].includes(
      String(this.getNodeParameter("resource", 0)),
    );
    const credentials = localService
      ? {}
      : await this.getCredentials("tritonOneSolanaApi");
    const client = localService
      ? {
          rpc: (async () => {
            throw new NodeOperationError(
              this.getNode(),
              "No RPC for this service",
            );
          }) as import("./transport").Rpc,
          network: "mainnet" as const,
        }
      : createRpc(
          this,
          credentials,
          integer(this.getNodeParameter("timeout", 0, 30), "Timeout", 5, 120) *
            1000,
        );
    if (!localService) await validateNetwork(client.rpc, client.network);
    for (let i = 0; i < this.getInputData().length; i++) {
      try {
        const resource = String(this.getNodeParameter("resource", i));
        const operation = String(this.getNodeParameter("operation", i));
        const key = `${resource}.${operation}`;
        const p: Record<string, unknown> = { ...defaults };
        p.inputMode = modeFor(
          this.getNode().parameters,
          this.getNode().typeVersion,
        );
        p.showAdvanced =
          this.getNode().parameters?.showAdvanced ??
          (this.getNode().typeVersion ?? 1) < 1.2;
        for (const property of properties) {
          if (
            ["resource", "operation", "inputMode", "showAdvanced"].includes(
              property.name,
            ) ||
            property.type === "notice"
          )
            continue;
          const show = property.displayOptions?.show;
          if (
            show?.["@version"] &&
            !show["@version"].includes(this.getNode().typeVersion ?? 1)
          )
            continue;
          if (show?.resource && !show.resource.includes(resource)) continue;
          if (show?.operation && !show.operation.includes(operation)) continue;
          if (
            show &&
            Object.entries(show).some(
              ([name, values]) =>
                !["resource", "operation", "@version"].includes(name) &&
                values &&
                !values.includes(
                  (name === "showAdvanced"
                    ? p.showAdvanced
                    : name === "inputMode"
                      ? p.inputMode
                      : this.getNodeParameter(
                          name,
                          i,
                          defaults[name],
                        )) as string,
                ),
            )
          )
            continue;
          p[property.name] = this.getNodeParameter(
            property.name,
            i,
            property.default,
          );
        }
        normalizeGuided(p);
        if (
          resource === "titan" &&
          ["quote", "swap"].includes(operation) &&
          this.getNode().typeVersion >= 1.3
        )
          await normalizeTrade(p, client.rpc);
        const result: import("./operations").ReadResult =
          key === "transaction.submit"
            ? await submit(this, i, p, client.rpc, client.network)
            : Object.hasOwn(EXTRA, key)
              ? await executeExtra(key, p, client.rpc)
              : SERVICES[resource]?.includes(operation)
                ? await executeService(
                    this,
                    i,
                    key,
                    p,
                    credentials,
                    client.rpc,
                    client.network,
                  )
                : await executeRead(key, p, client.rpc);
        const meta = {
          ...result.meta,
          operation: key,
          ...(localService ? {} : { network: client.network }),
          observedAt: new Date().toISOString(),
        };
        if (p.outputMode === "split" && COLLECTIONS.includes(key)) {
          const rows =
            ("split" in result ? result.split : undefined) ??
            records(key, result.data);
          output.push(
            ...rows.map((data, position) => ({
              json: {
                data,
                meta: {
                  ...meta,
                  position,
                  ...(Array.isArray(result.meta.requestIdentities)
                    ? {
                        requestIdentity:
                          result.meta.requestIdentities[position],
                      }
                    : {}),
                },
              } as IDataObject,
              pairedItem: { item: i },
            })),
          );
        } else
          output.push({
            json: { data: result.data, meta } as IDataObject,
            pairedItem: { item: i },
          });
      } catch (error) {
        const failure = safeError(error);
        if (!this.continueOnFail()) {
          const nodeError = new NodeOperationError(
            this.getNode(),
            `${failure.code}: ${failure.message}`,
            { itemIndex: i, description: JSON.stringify(failure.details) },
          );
          throw nodeError;
        }
        output.push({
          json: {
            error: {
              code: failure.code,
              message: failure.message,
              ...failure.details,
            },
          },
          pairedItem: { item: i },
        });
        if (failure.stop) break;
      }
    }
    return [output];
  }
}
