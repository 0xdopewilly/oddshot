// oddshot-lab: a throwaway PayBox plugin that answers Oddshot Pro's open questions before any server is built.
// pro_probe asks PayBox to pay a real $0.002 x402 endpoint on Solana (Blocksize's BTC-USD bid/ask), so we can see
// 1) whether the paid response reaches the AI and 2) whether every payment needs a tap. PayBox's developer docs say a
// paid URL must be a configured network host, so the portal's Network access needs mcp.blocksize.info.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { proposeX402, x402OutputSchema } from "../../../src/paybox.js";

const PROTOCOL_VERSION = "2026-07-28";
const TARGETS = {
  blocksize_btc: { url: "https://mcp.blocksize.info/v1/bidask/BTC-USD", maxAmount: "2000", label: "Blocksize BTC-USD bid/ask, $0.002" },
} as const;

function createServer() {
  const server = new McpServer({ name: "oddshot-lab", version: "0.1.0" }, { supportedProtocolVersions: [PROTOCOL_VERSION] });

  server.registerTool(
    "probe_ping",
    {
      title: "Lab ping",
      description: "Free. Confirms the oddshot-lab plugin is installed and answering. Changes nothing.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean(), at: z.string(), paidTargets: z.array(z.string()) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const out = { ok: true, at: new Date().toISOString(), paidTargets: Object.values(TARGETS).map((t) => t.label) };
      return { content: [{ type: "text" as const, text: `oddshot-lab is answering (${out.at}). pro_probe pays ${out.paidTargets.join(", ")}.` }], structuredContent: out };
    },
  );

  server.registerTool(
    "pro_probe",
    {
      title: "Lab: paid x402 probe ($0.002)",
      description: "Test tool for Oddshot Pro. Proposes a $0.002 USDC x402 payment on Solana for Blocksize's live BTC-USD bid/ask. PayBox asks the user to approve, pays, and fetches the paid response itself. After the user approves, poll get_request with this call's request_id until it is terminal, then show the user the paid response exactly as received (status, content type and body), or say plainly that no response body was returned. Nothing is paid unless the user approves.",
      inputSchema: z.object({ target: z.enum(["blocksize_btc"]).default("blocksize_btc").describe("Which paid endpoint to call. Only one for now.") }).strict(),
      outputSchema: x402OutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ target }) => {
      const t = TARGETS[target];
      return proposeX402({ chain: "solana:mainnet", url: t.url, maxAmount: t.maxAmount, method: "GET" });
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
