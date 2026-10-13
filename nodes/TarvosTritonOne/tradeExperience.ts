import type { INodeProperties } from "n8n-workflow";
import type { Rpc } from "./transport";
import { address, integer } from "./validation";
import { TritonError } from "./errors";

export function tokenUnits(value: unknown, decimals: number): string {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text))
    throw new TritonError(
      "INVALID_INPUT",
      "Enter a positive token amount, for example 0.1. Do not use commas or scientific notation.",
    );
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals)
    throw new TritonError(
      "INVALID_INPUT",
      `This token supports at most ${decimals} decimal places. No rounding is performed.`,
    );
  const result = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (result < 1n || result > 18446744073709551615n)
    throw new TritonError(
      "INVALID_INPUT",
      "Amount must be positive and fit Solana's token amount limit.",
    );
  return result.toString();
}
export async function normalizeTrade(
  p: Record<string, unknown>,
  rpc: Rpc,
): Promise<void> {
  for (const side of ["input", "output"]) {
    const selected = String(
      p[`${side}Token`] ??
        (side === "input"
          ? "So11111111111111111111111111111111111111112"
          : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    );
    p[`${side}Mint`] = address(
      selected === "custom" ? p[`${side}Mint`] : selected,
    );
  }
  const decimals = async (mint: unknown) => {
    const supply = (await rpc("getTokenSupply", [
      mint,
      { commitment: "confirmed" },
    ])) as { value?: { decimals?: unknown } };
    return integer(supply?.value?.decimals, "Token decimal precision", 0, 255);
  };
  if (p.tradeUnits !== "atomic") {
    p.titanAmount = tokenUnits(p.tradeAmount, await decimals(p.inputMint));
    if (String(p.tradeMinimum ?? "").trim())
      p.minimumOutput = tokenUnits(
        p.tradeMinimum,
        await decimals(p.outputMint),
      );
    else p.minimumOutput = "1";
  } else {
    p.titanAmount = p.tradeAmount;
    p.minimumOutput = String(p.tradeMinimum ?? "").trim() || "1";
  }
  const percent = String(p.tradeSlippage ?? "0.5");
  if (!/^\d+(\.\d{1,2})?$/.test(percent) || Number(percent) > 10)
    throw new TritonError(
      "INVALID_INPUT",
      "Slippage must be between 0 and 10 percent, with at most two decimal places.",
    );
  const [whole, fraction = ""] = percent.split(".");
  p.slippageBps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function tradeProperties(
  properties: INodeProperties[],
): INodeProperties[] {
  const legacy = new Set([
    "inputMint",
    "outputMint",
    "titanAmount",
    "slippageBps",
    "minimumOutput",
    "titanPublicAddress",
  ]);
  for (const p of properties) {
    if (legacy.has(p.name))
      p.displayOptions = {
        ...p.displayOptions,
        show: { ...p.displayOptions?.show, "@version": [1, 1.1, 1.2] },
      };
    if (p.name === "operation") {
      p.displayName = "What Would You Like to Do?";
      if (p.displayOptions?.show?.resource?.includes("titan")) {
        for (const option of p.options ?? [])
          if ("value" in option) {
            if (option.value === "quote") {
              option.name = "Get a Swap Quote (No Trade)";
              option.description =
                "Preview a token exchange without signing or sending";
            }
            if (option.value === "swap") {
              option.name = "Swap Tokens with Solana Wallet";
              option.description =
                "Get a fresh quote, sign, and submit the swap";
            }
          }
      }
    }
  }
  const show = {
    resource: ["titan"],
    operation: ["quote", "swap"],
    "@version": [1.3],
  };
  const result: INodeProperties[] = [];
  const add = (
    name: string,
    displayName: string,
    type: INodeProperties["type"],
    defaultValue: INodeProperties["default"],
    extra: Partial<INodeProperties> = {},
  ) =>
    result.push({
      name,
      displayName,
      type,
      default: defaultValue,
      displayOptions: { show },
      ...extra,
    });
  add(
    "tradeStart",
    "1. Connect your Triton mainnet credential above. Titan finds routes for exchanging tokens. Start with Get a Swap Quote to preview a price without trading.",
    "notice",
    "",
  );
  add(
    "quoteWallet",
    "2. Which Wallet Is This Quote For?",
    "options",
    "wallet",
    {
      noDataExpression: true,
      description:
        "Use the Solana Wallet connector below the node, or enter a public address. Quotes never sign or submit a transaction.",
      options: [
        { name: "Connected Solana Wallet", value: "wallet" },
        { name: "Enter a Public Address", value: "address" },
      ],
      displayOptions: { show: { ...show, operation: ["quote"] } },
    },
  );
  add("titanPublicAddress", "Wallet Public Address", "string", "", {
    required: true,
    description:
      "Public address used to build the quote. No private key is needed.",
    displayOptions: {
      show: { ...show, operation: ["quote"], quoteWallet: ["address"] },
    },
  });
  add(
    "tradeWalletHelp",
    "2. Connect a Solana Wallet to the Wallet connector below this node. In that node, enter your public address and select Mainnet Beta. For quotes only, choose Public Address Only (no key). For swaps, choose Sign Prepared Transaction and add the matching wallet credential there.",
    "notice",
    "",
  );
  const tokens = [
    {
      name: "USDC (Circle)",
      value: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
    {
      name: "Wrapped SOL (WSOL)",
      value: "So11111111111111111111111111111111111111112",
    },
    { name: "Other Token — Paste Mint Address", value: "custom" },
  ];
  for (const side of ["input", "output"]) {
    add(
      `${side}Token`,
      side === "input" ? "3. Token to Pay" : "4. Token to Receive",
      "options",
      side === "input" ? tokens[1].value : tokens[0].value,
      {
        options: tokens,
        description:
          "Select a token or paste its mint address. A mint identifies a token; it is not your wallet address.",
      },
    );
    add(
      `${side}Mint`,
      side === "input"
        ? "Pay Token Mint Address"
        : "Receive Token Mint Address",
      "string",
      "",
      {
        required: true,
        description:
          "Paste the token mint from a trusted token source. Token symbols alone do not uniquely identify a token.",
        displayOptions: { show: { ...show, [`${side}Token`]: ["custom"] } },
      },
    );
  }
  add("tradeUnits", "Amount Format", "options", "tokens", {
    noDataExpression: true,
    options: [
      { name: "Readable Token Amount (Recommended)", value: "tokens" },
      { name: "Smallest Units (Advanced)", value: "atomic" },
    ],
    description:
      "Readable amounts use the token's on-chain decimal precision automatically. Smallest units require whole integers.",
  });
  add("tradeAmount", "5. Amount to Pay", "string", "", {
    required: true,
    placeholder: "For example, 0.1",
    description:
      "The exact amount of the pay token to exchange. Keep enough SOL in the wallet for network fees.",
  });
  add("tradeSlippage", "6. Maximum Price Movement (%)", "options", "0.5", {
    options: [
      { name: "0.1%", value: "0.1" },
      { name: "0.5%", value: "0.5" },
      { name: "1%", value: "1" },
      { name: "2%", value: "2" },
    ],
    description:
      "Maximum permitted worsening of the quoted exchange price. For example, 0.5 means 0.5 percent. A larger allowance can produce a worse execution price.",
  });
  add("tradeMinimum", "Minimum to Receive (Optional)", "string", "", {
    description:
      "Minimum received amount in the selected format. Before signing, the node checks the actual Titan V2 instruction enforces at least this amount and the slippage-adjusted quote. Unsupported instruction formats are rejected.",
    displayOptions: { show: { ...show, operation: ["swap"] } },
  });
  add(
    "quoteFinish",
    "7. Execute this node to retrieve a quote. This does not sign or send a transaction. A later swap requests a fresh price; it does not execute this saved quote.",
    "notice",
    "",
    { displayOptions: { show: { ...show, operation: ["quote"] } } },
  );
  add(
    "swapFinish",
    "7. Supported swaps use verified Titan V2 instructions and standard SPL tokens. Network fees are capped at 0.0001 SOL, plus up to two token-account rent deposits. Unsupported routes stop before signing. Executing this node trades on mainnet: it requests a fresh quote, simulates, signs through Solana Wallet, and submits. The wallet needs the pay token and SOL for fees. A returned signature is not proof of confirmation; use a transaction-status action to check the result.",
    "notice",
    "",
    { displayOptions: { show: { ...show, operation: ["swap"] } } },
  );
  return [
    ...properties.flatMap((p): INodeProperties[] => {
      if (
        p.name !== "operation" ||
        !p.displayOptions?.show?.resource?.includes("titan")
      )
        return [p];
      return [
        {
          ...p,
          displayOptions: {
            show: { ...p.displayOptions.show, "@version": [1, 1.1, 1.2] },
          },
        },
        {
          ...p,
          default: "quote",
          displayOptions: {
            show: { ...p.displayOptions.show, "@version": [1.3] },
          },
        },
      ];
    }),
    ...result.flatMap((p): INodeProperties[] =>
      p.name === "tradeWalletHelp"
        ? [
            {
              ...p,
              displayOptions: { show: { ...show, operation: ["swap"] } },
            },
            {
              ...p,
              displayOptions: {
                show: {
                  ...show,
                  operation: ["quote"],
                  quoteWallet: ["wallet"],
                },
              },
            },
          ]
        : [p],
    ),
  ];
}
